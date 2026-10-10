// POST /api/coach: CoachRequest -> CoachResponse. Owner: Agents.
import type { NextRequest } from "next/server";
import type { CoachResponse } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { CoachRequestSchema } from "@/agents/schemas";
import { runCoach } from "@/agents/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await parseBody(req, CoachRequestSchema);
  const result = await runCoach(userId, body.messages);
  return json<CoachResponse>(result);
});
