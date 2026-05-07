import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { sendPasswordResetEmail, appBaseUrl } from "@/lib/email/send-password-reset";

const bodySchema = z.object({
  email: z.string().email("邮箱格式不正确"),
});

/** 统一对外文案，避免枚举注册用户 */
const PUBLIC_MESSAGE = "若该邮箱已注册且支持密码登录，您将收到一封重置密码的邮件，请查收（含垃圾邮件箱）。";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors.email?.[0] || "参数无效" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true, email: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }

    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt)
        )
      );

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    const { sent, error } = await sendPasswordResetEmail(user.email, resetUrl);

    if (process.env.NODE_ENV === "development" && !sent) {
      console.info("\n[forgot-password] 开发环境未配置 RESEND，重置链接：\n", resetUrl, "\n");
    }

    if (!sent && error) {
      console.error("[forgot-password]", error);
    }

    return NextResponse.json({
      ok: true,
      message: PUBLIC_MESSAGE,
      /** 仅开发且无邮件服务时便于联调，生产勿依赖 */
      _devResetUrl:
        process.env.NODE_ENV === "development" && !sent ? resetUrl : undefined,
    });
  } catch (e) {
    console.error("[forgot-password]", e);
    return NextResponse.json(
      { error: "服务器错误，请稍后重试" },
      { status: 500 }
    );
  }
}
