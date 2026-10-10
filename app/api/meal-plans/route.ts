// GET /api/meal-plans?weekStart=YYYY-MM-DD -> WeekPlanResponse (saved plan or null, plus week state). Owner: Agents.
import type { NextRequest } from "next/server";
import type { WeekPlanResponse } from "@/types/contracts";
import { handler, json, parseQuery } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { WeekQuerySchema } from "@/agents/schemas/planner";
import { getWeek, setSelectedWeek } from "@/agents/planner/settings";
import { requireProfile } from "./errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { weekStart } = parseQuery(req, WeekQuerySchema);
  await requireProfile(userId);
  const store = getStore();
  const week = await getWeek(store, userId, weekStart);
  await setSelectedWeek(store, userId, weekStart);
  return json<WeekPlanResponse>(week);
});
