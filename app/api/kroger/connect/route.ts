// GET    /api/kroger/connect -> 302 to Kroger's authorize page with a signed state (nonce also in a cookie).
// DELETE /api/kroger/connect -> drops the user's tokens (keeps the chosen store) -> KrogerStatus. Owner: Backend.
// Without credentials a browser navigation is sent back to /grocery?kroger=error; API callers get the JSON error.
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { json } from "@/lib/api/http";
import { authorizeUrl, isKrogerConfigured, KrogerError } from "@/lib/kroger/client";
import { krogerError, krogerHandler } from "@/lib/kroger/http";
import { newNonce, signState, STATE_COOKIE, STATE_MAX_AGE_SEC } from "@/lib/kroger/state";
import { statusFor } from "@/lib/kroger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsHtml(req: NextRequest): boolean {
  return (req.headers.get("accept") ?? "").includes("text/html");
}

export const GET = krogerHandler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  if (!isKrogerConfigured() || !process.env.KROGER_REDIRECT_URI) {
    const err = new KrogerError(
      503,
      "kroger_not_configured",
      "Kroger is not configured. Set KROGER_CLIENT_ID, KROGER_CLIENT_SECRET and KROGER_REDIRECT_URI.",
    );
    if (!wantsHtml(req)) return krogerError(err);
    return NextResponse.redirect(
      new URL(`/grocery?kroger=error&reason=${err.code}`, req.nextUrl.origin),
      302,
    );
  }
  const nonce = newNonce();
  const state = signState(userId, nonce);
  const res = NextResponse.redirect(authorizeUrl(state), 302);
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/kroger",
    maxAge: STATE_MAX_AGE_SEC,
  });
  return res;
});

export const DELETE = krogerHandler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const store = getStore();
  const existing = await store.getKrogerConnection(userId);
  if (existing?.locationId) {
    const shell = { locationId: existing.locationId, locationName: existing.locationName, zip: existing.zip };
    await store.saveKrogerConnection(userId, shell);
    return json(statusFor(shell));
  }
  await store.deleteKrogerConnection(userId);
  return json(statusFor(null));
});
