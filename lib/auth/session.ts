// Session resolution for API routes and server components. Owner: Backend.
//
// AUTH_MODE=local    (default) a signed-less demo cookie `np_uid` selects the user. /api/auth/login accepts
//                    "alex" or "maria" (or any email) and sets the cookie. Perfect for mocks and the demo.
// AUTH_MODE=supabase Supabase Auth via @supabase/ssr cookies. Same return shape, so routes never care.
// AUTH_MODE=clerk    Clerk via @clerk/nextjs. The Clerk user id is hashed to a stable uuid so the store schema is unchanged.
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { DEMO_EMAILS, DEMO_USER_IDS, type DemoUserKey } from "@/lib/db/seed/demo-users";

export const SESSION_COOKIE = "np_uid";

export interface Session {
  userId: string;
  email: string | null;
}

export function authMode(): "local" | "supabase" {
  return process.env.AUTH_MODE === "supabase" ? "supabase" : "local";
}

/**
 * Kept apart from authMode() because SessionInfo.mode in contracts.ts only allows "local" | "supabase".
 * Configured Clerk keys win over AUTH_MODE=local, so a leftover np_uid demo cookie never counts as a login
 * once Clerk is on. Keep in sync with clerkEnabled in middleware.ts.
 */
export function isClerkMode(): boolean {
  if (process.env.AUTH_MODE === "clerk") return true;
  const clerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return clerkKeys && process.env.AUTH_MODE !== "supabase";
}

/** Maps "alex" / "maria" / their demo emails to the seeded user ids; anything else becomes a stable uuid. */
export function resolveLocalUserId(identifier: string): { userId: string; email: string } {
  const id = identifier.trim().toLowerCase();
  for (const key of Object.keys(DEMO_USER_IDS) as DemoUserKey[]) {
    if (id === key || id === DEMO_EMAILS[key]) return { userId: DEMO_USER_IDS[key], email: DEMO_EMAILS[key] };
  }
  return { userId: uuidFromString(id), email: id.includes("@") ? id : `${id}@local.nutriplan.app` };
}

function uuidFromString(s: string): string {
  // FNV-1a over the string, expanded to 32 hex chars. Deterministic so the same email always maps to one user.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x811c9dc5) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).repeat(2);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function getSession(req?: NextRequest): Promise<Session | null> {
  if (isClerkMode()) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return {
      userId: uuidFromString(`clerk:${userId}`),
      email: user?.primaryEmailAddress?.emailAddress ?? null,
    };
  }
  if (authMode() === "supabase") {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user ? { userId: data.user.id, email: data.user.email ?? null } : null;
  }
  const value = req ? req.cookies.get(SESSION_COOKIE)?.value : (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const [userId, email] = value.split("|");
  return userId ? { userId, email: email ?? null } : null;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
  }
}

export async function requireSession(req?: NextRequest): Promise<Session> {
  const s = await getSession(req);
  if (!s) throw new UnauthorizedError();
  return s;
}
