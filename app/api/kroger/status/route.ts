// GET /api/kroger/status -> KrogerStatus { configured, connected, location }. Owner: Backend.
// Never errors on missing credentials: the grocery screen uses this to decide which buttons to show.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { json } from "@/lib/api/http";
import { krogerHandler } from "@/lib/kroger/http";
import { statusFor } from "@/lib/kroger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = krogerHandler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const conn = await getStore().getKrogerConnection(userId);
  return json(statusFor(conn));
});
