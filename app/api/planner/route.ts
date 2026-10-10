// GET /api/planner -> PlannerSettingsResponse (preferences, favorites, selected week, locked profile rules). Owner: Agents.
import type { NextRequest } from "next/server";
import type { PlannerSettingsResponse } from "@/types/contracts";
import { handler, json } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { getPlannerSettingsResponse } from "@/agents/planner/settings";
import { requireProfile } from "@/app/api/meal-plans/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  await requireProfile(userId);
  return json<PlannerSettingsResponse>(await getPlannerSettingsResponse(getStore(), userId));
});
