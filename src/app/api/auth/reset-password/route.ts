import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users, passwordResetTokens } from "@/lib/db/schema";

const bodySchema = z.object({
  token: z.string().min(32, "令牌无效"),
  password: z.string().min(8, "密码至少 8 位"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().fieldErrors.token?.[0] ||
        parsed.error.flatten().fieldErrors.password?.[0] ||
        "参数无效";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { token, password } = parsed.data;

    const row = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.token, token),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date())
      ),
    });

    if (!row) {
      return NextResponse.json(
        { error: "链接无效或已过期，请重新申请重置密码" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.userId));

    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, row.userId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reset-password]", e);
    return NextResponse.json(
      { error: "服务器错误，请稍后重试" },
      { status: 500 }
    );
  }
}
