// POST /api/auth/signup { identifier, password? } -> SessionInfo. Owner: Backend.
// local mode: identical to login (any identifier becomes a stable user).
// supabase mode: Supabase Auth signUp (email confirmations are off in supabase/config.toml).
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SessionInfo } from "@/types/contracts";
import { SESSION_COOKIE, authMode, resolveLocalUserId } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const SignupSchema = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(6).max(200).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const { identifier, password } = await parseBody(req, SignupSchema);
  const store = getStore();

  if (authMode() === "supabase") {
    if (!password) throw new HttpError(400, "Password is required");
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signUp({ email: identifier, password });
    if (error || !data.user) throw new HttpError(400, error?.message ?? "Sign up failed");
    const info: SessionInfo = {
      userId: data.user.id,
      email: data.user.email ?? null,
      mode: "supabase",
      hasProfile: (await store.getProfile(data.user.id)) !== null,
    };
    return json(info, { status: 201 });
  }

  const { userId, email } = resolveLocalUserId(identifier);
  const info: SessionInfo = { userId, email, mode: "local", hasProfile: (await store.getProfile(userId)) !== null };
  const res = json(info, { status: 201 });
  res.cookies.set(SESSION_COOKIE, `${userId}|${email}`, {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
});
