// GET /api/meal-plans/month?month=YYYY-MM -> PlannerMonthResponse (dish titles of saved days). Owner: Agents.
import type { NextRequest } from "next/server";
import type { PlannerMonthResponse } from "@/types/contracts";
import { handler, json, parseQuery } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { MonthQuerySchema } from "@/agents/schemas/planner";
import { getMonthSchedule } from "@/agents/planner/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { month } = parseQuery(req, MonthQuerySchema);
  return json<PlannerMonthResponse>(await getMonthSchedule(getStore(), userId, month));
});
