// POST /api/auth/logout -> 204. Clears the JWT cookie.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode } from "@/lib/auth/session";
import { handler } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (_req: NextRequest) => {
  if (authMode() === "supabase") {
    try {
      const { createServerSupabase } = await import("@/lib/supabase/server");
      const supabase = await createServerSupabase();
      await supabase.auth.signOut();
    } catch {
      // Signing out of an already expired session is fine.
    }
  }
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set("np_uid", "", { path: "/", maxAge: 0 });
  return res;
});
