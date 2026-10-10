// GET /api/kroger/callback?code&state -> verifies the signed state + nonce cookie, exchanges the code,
// stores the tokens and sends the browser to /grocery?kroger=connected (or ?kroger=error&reason=...). Owner: Backend.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { handler } from "@/lib/api/http";
import { exchangeCode, KrogerError } from "@/lib/kroger/client";
import { STATE_COOKIE, verifyState } from "@/lib/kroger/state";
import type { KrogerConnection } from "@/lib/kroger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: NextRequest, query: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/grocery?${query}`, req.nextUrl.origin), 302);
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/kroger", maxAge: 0 });
  return res;
}

export const GET = handler(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  if (q.get("error"))
    return back(req, `kroger=error&reason=${encodeURIComponent(q.get("error")!.slice(0, 40))}`);
  const code = q.get("code");
  const nonce = req.cookies.get(STATE_COOKIE)?.value;
  let userId: string | null;
  try {
    userId = verifyState(q.get("state"), nonce);
  } catch (err) {
    return back(req, `kroger=error&reason=${err instanceof KrogerError ? err.code : "kroger_bad_state"}`);
  }
  if (!code || !userId) return back(req, "kroger=error&reason=kroger_bad_state");
  const session = await getSession(req);
  if (session && session.userId !== userId) return back(req, "kroger=error&reason=kroger_bad_state");

  try {
    const tokens = await exchangeCode(code);
    const store = getStore();
    const existing = await store.getKrogerConnection(userId);
    const conn: KrogerConnection = {
      ...(existing ?? {}),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    await store.saveKrogerConnection(userId, conn);
    return back(req, "kroger=connected");
  } catch (err) {
    const reason = err instanceof KrogerError ? err.code : "kroger_upstream";
    console.error("[kroger] callback failed:", err instanceof Error ? err.message : err);
    return back(req, `kroger=error&reason=${reason}`);
  }
});
