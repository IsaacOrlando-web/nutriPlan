// OAuth state: HMAC(userId.nonce) so the callback can trust which user started the flow. Owner: Backend.
// Secret: KROGER_STATE_SECRET, else KROGER_CLIENT_SECRET.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { KrogerError } from "./client";

export const STATE_COOKIE = "np_kroger_state";
export const STATE_MAX_AGE_SEC = 600;

function secret(): string {
  const s =
    process.env.KROGER_STATE_SECRET ||
    process.env.KROGER_CLIENT_SECRET;
  if (!s) throw new KrogerError(503, "kroger_not_configured", "Kroger is not configured (no state secret)");
  return s;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function newNonce(): string {
  return b64url(randomBytes(16));
}

/** `base64url(userId).nonce.signature` */
export function signState(userId: string, nonce: string): string {
  const payload = `${b64url(Buffer.from(userId, "utf8"))}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the userId when the signature is valid and the nonce matches the cookie, else null. */
export function verifyState(
  state: string | null | undefined,
  cookieNonce: string | null | undefined,
): string | null {
  if (!state || !cookieNonce) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userB64, nonce, sig] = parts;
  if (nonce !== cookieNonce) return null;
  const expected = sign(`${userB64}.${nonce}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const userId = Buffer.from(userB64, "base64url").toString("utf8");
  return userId || null;
}
