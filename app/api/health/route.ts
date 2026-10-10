// GET /api/health -> { ok, store, auth, agentsMode }. No session needed. Owner: Backend.
import type { NextRequest } from "next/server";
import { authMode } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { handler, json } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (_req: NextRequest) => {
  return json({
    ok: true,
    store: getStore().kind,
    auth: authMode(),
    agentsMode: process.env.AGENTS_MODE ?? "auto",
  });
});
