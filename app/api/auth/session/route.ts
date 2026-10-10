// GET /api/auth/session -> SessionInfo. Owner: Backend.
import type { NextRequest } from "next/server";
import type { SessionInfo } from "@/types/contracts";
import { authMode, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { handler, json } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const session = await getSession(req);
  const info: SessionInfo = { userId: null, email: null, mode: authMode(), hasProfile: false };
  if (session) {
    info.userId = session.userId;
    info.email = session.email;
    info.hasProfile = (await getStore().getProfile(session.userId)) !== null;
  }
  return json(info);
});
