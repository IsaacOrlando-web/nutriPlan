// POST /api/auth/login { identifier, password? } -> SessionInfo. Owner: Backend.
// local mode: "alex" / "maria" / any email selects a user and sets the np_uid cookie.
// supabase mode: Supabase Auth signInWithPassword (cookies set by @supabase/ssr).
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SessionInfo } from "@/types/contracts";
import { SESSION_COOKIE, authMode, resolveLocalUserId } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const LoginSchema = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().max(200).optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const { identifier, password } = await parseBody(req, LoginSchema);
  const store = getStore();

  if (authMode() === "supabase") {
    if (!password) throw new HttpError(400, "Password is required");
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
    if (error || !data.user) throw new HttpError(400, error?.message ?? "Sign in failed");
    const info: SessionInfo = {
      userId: data.user.id,
      email: data.user.email ?? null,
      mode: "supabase",
      hasProfile: (await store.getProfile(data.user.id)) !== null,
    };
    return json(info);
  }

  const { userId, email } = resolveLocalUserId(identifier);
  const info: SessionInfo = { userId, email, mode: "local", hasProfile: (await store.getProfile(userId)) !== null };
  const res = json(info);
  res.cookies.set(SESSION_COOKIE, `${userId}|${email}`, {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
});
