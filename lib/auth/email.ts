import { randomBytes, createHash } from "node:crypto";

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function createVerificationToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash, expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString() };
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verificationUrl = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required in production");
    }
    console.info(`[auth] verification email for ${email}: ${verificationUrl}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Verify your NutriPlan account",
      html: `<p>Hi ${escapeHtml(name)},</p><p>Verify your NutriPlan account:</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email provider failed with status ${response.status}: ${details}`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
