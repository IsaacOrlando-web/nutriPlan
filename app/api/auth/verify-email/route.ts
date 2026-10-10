import { NextRequest, NextResponse } from "next/server";
import { hashVerificationToken } from "@/lib/auth/email";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/welcome?verification=invalid", req.url));

  const store = getStore();
  const tokenHash = hashVerificationToken(token);
  const user = await store.findUserByVerificationToken(tokenHash);
  if (!user || !user.verificationExpiresAt || new Date(user.verificationExpiresAt).getTime() < Date.now()) {
    return NextResponse.redirect(new URL("/welcome?verification=expired", req.url));
  }

  const verifiedUser = { ...user, emailVerified: true, verificationTokenHash: null, verificationExpiresAt: null };
  await store.updateUser(verifiedUser);
  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.userId, user.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
