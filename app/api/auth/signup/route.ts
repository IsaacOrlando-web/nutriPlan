import type { NextRequest } from "next/server";
import { z } from "zod";
import { createVerificationToken, sendVerificationEmail } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/password";
import { authMode } from "@/lib/auth/session";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { getStore, newId } from "@/lib/db";
import { HttpError, handler, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignupSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(60),
});

export const POST = handler(async (req: NextRequest) => {
  const input = await parseBody(req, SignupSchema);
  if (authMode() === "supabase") {
    const supabase = await (await import("@/lib/supabase/server")).createServerSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: input.email.toLowerCase(),
      password: input.password,
      options: { data: { name: input.name }, emailRedirectTo: `${process.env.APP_URL ?? "http://localhost:3000"}/auth/callback` },
    });
    if (error || !data.user) throw new HttpError(400, error?.message ?? "Sign up failed");
    return json({ message: "Check your email to verify your account.", authenticated: Boolean(data.session) }, { status: 201 });
  }
  const store = getStore();
  const email = input.email.toLowerCase();
  const existing = await store.getUserByEmail(email);
  if (existing?.emailVerified) throw new HttpError(409, "An account already exists for this email");
  const requiresVerification = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false";
  const verification = createVerificationToken();
  const userId = existing?.userId ?? newId();
  if (existing) {
    await store.updateUser({
      ...existing,
      verificationTokenHash: verification.tokenHash,
      verificationExpiresAt: verification.expiresAt,
    });
  } else {
    await store.createUser({
      userId,
      email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      emailVerified: requiresVerification ? false : true,
      verificationTokenHash: requiresVerification ? verification.tokenHash : null,
      verificationExpiresAt: requiresVerification ? verification.expiresAt : null,
      createdAt: new Date().toISOString(),
    });
  }
  if (requiresVerification) {
    await sendVerificationEmail(email, existing?.name ?? input.name, verification.token);
    return json({ message: "Check your email to verify your account.", authenticated: false }, { status: 201 });
  }
  const response = json({ message: "Account created.", authenticated: true }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId, email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
});
