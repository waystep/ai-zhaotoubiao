/**
 * 发送密码重置邮件（可选：配置 RESEND_API_KEY + RESEND_FROM_EMAIL）
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "智能招标审查平台 — 重置密码",
        html: `
          <p>您好，</p>
          <p>请点击以下链接在 1 小时内重置登录密码（如非本人操作请忽略）：</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>此邮件由系统自动发送，请勿直接回复。</p>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[Resend] failed:", res.status, body);
      return { sent: false, error: "邮件服务暂时不可用" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[Resend] error:", e);
    return { sent: false, error: "邮件发送失败" };
  }
}

export function appBaseUrl(): string {
  return (
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
