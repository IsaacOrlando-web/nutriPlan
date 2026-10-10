import type { NextRequest } from "next/server";
import { z } from "zod";
import { createVerificationToken, sendVerificationEmail } from "@/lib/auth/email";
import { hashPassword } from "@/lib/auth/password";
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
  const store = getStore();
  const email = input.email.toLowerCase();
  const existing = await store.getUserByEmail(email);
  if (existing?.emailVerified) throw new HttpError(409, "An account already exists for this email");
  const verification = createVerificationToken();
  if (existing) {
    await store.updateUser({
      ...existing,
      verificationTokenHash: verification.tokenHash,
      verificationExpiresAt: verification.expiresAt,
    });
  } else {
    await store.createUser({
      userId: newId(),
      email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      emailVerified: false,
      verificationTokenHash: verification.tokenHash,
      verificationExpiresAt: verification.expiresAt,
      createdAt: new Date().toISOString(),
    });
  }
  await sendVerificationEmail(email, existing?.name ?? input.name, verification.token);
  return json({ message: "Check your email to verify your account." }, { status: 201 });
});
