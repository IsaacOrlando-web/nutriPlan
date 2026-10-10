import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SessionInfo } from "@/types/contracts";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, resolveLocalUserId } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { getStore } from "@/lib/db";
import { DEMO_EMAILS, DEMO_PASSWORD, DEMO_USER_IDS, type DemoUserKey } from "@/lib/db/seed/demo-users";
import { HttpError, handler, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().trim().email().max(200).optional(),
  identifier: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional(),
}).refine((input) => Boolean(input.email || input.identifier), "Email is required");

export const POST = handler(async (req: NextRequest) => {
  const { email: rawEmail, identifier, password } = await parseBody(req, LoginSchema);
  const store = getStore();
  if (identifier) {
    const legacy = resolveLocalUserId(identifier);
    return authenticate(legacy.userId, legacy.email, store, true);
  }
  if (!password) throw new HttpError(400, "Password is required");
  const rawEmailValue = rawEmail as string;
  const email = rawEmailValue.toLowerCase();
  const demo = (Object.keys(DEMO_USER_IDS) as DemoUserKey[]).find((key) => email === DEMO_EMAILS[key]);
  const user = await store.getUserByEmail(email);
  if (demo && password === DEMO_PASSWORD && !user) return authenticate(resolveLocalUserId(email).userId, email, store);
  if (!user || !verifyPassword(password, user.passwordHash)) throw new HttpError(401, "Invalid email or password");
  if (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false" && !user.emailVerified) {
    throw new HttpError(403, "Verify your email before signing in");
  }
  return authenticate(user.userId, user.email, store);
});

async function authenticate(userId: string, email: string, store: ReturnType<typeof getStore>, legacyCookie = false) {
  const info: SessionInfo = {
    userId,
    email,
    mode: "local",
    hasProfile: (await store.getProfile(userId)) !== null,
  };
  const res = json(info);
  res.cookies.set(SESSION_COOKIE, createSessionToken(userId, email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
  });
  if (legacyCookie) {
    res.cookies.set("np_uid", `${userId}|${email}`, { path: "/", sameSite: "lax", maxAge: SESSION_MAX_AGE });
  }
  return res;
}
