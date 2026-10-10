// PATCH /api/meal-plans/state: UpdateWeekStateRequest -> PlannerWeekState (completed meals, shopping edits). Owner: Agents.
import type { NextRequest } from "next/server";
import type { PlannerWeekState } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { UpdateWeekStateRequestSchema } from "@/agents/schemas/planner";
import { updateWeekState } from "@/agents/planner/settings";
import { LIMITS, requireProfile } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await parseBody(req, UpdateWeekStateRequestSchema, { maxBytes: LIMITS.state });
  await requireProfile(userId);
  return json<PlannerWeekState>(await updateWeekState(getStore(), userId, body));
});
