// PUT /api/planner/preferences: PlannerPreferences -> PlannerSettingsResponse. Owner: Agents.
// Allergies, restrictions and dislikes are not accepted here: they live on the profile and can only be edited there.
import type { NextRequest } from "next/server";
import type { PlannerSettingsResponse } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { PlannerPreferencesSchema } from "@/agents/schemas/planner";
import { savePlannerPreferences } from "@/agents/planner/settings";
import { LIMITS, requireProfile } from "@/app/api/meal-plans/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const prefs = await parseBody(req, PlannerPreferencesSchema, { maxBytes: LIMITS.preferences });
  await requireProfile(userId);
  return json<PlannerSettingsResponse>(await savePlannerPreferences(getStore(), userId, prefs));
});
