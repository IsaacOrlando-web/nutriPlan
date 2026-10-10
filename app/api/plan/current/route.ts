// GET /api/plan/current -> MealPlan or 404 { error: "No plan yet" }. Owner: Backend.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json } from "@/lib/api/http";
import { warmBudgetCurve } from "@/lib/plan/curve-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const plan = await getStore().getCurrentPlan(userId);
  if (!plan) throw new HttpError(404, "No plan yet");
  // The dashboard asks for the plan first; start the budget curve now so the plan page's slider is ready.
  // Cheap when cached, deduplicated while computing, and the solver yields between budgets.
  setTimeout(() => void warmBudgetCurve(userId), 0);
  return json(plan);
});
