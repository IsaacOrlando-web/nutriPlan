// GET /api/plan/curve -> the budget tradeoff curve for the signed in user. Owner: Math (route), data via Backend's store.
//
// Query: ?min=25&max=100&step=5 (budget grid, defaults shown; the profile's weeklyBudgetUsd is always included)
//        ?budget=55              also return the 7 day plan at that budget as `planAt` (slider preview)
//        ?refresh=1              ignore the warm cache and solve again
// Response: { curve: BudgetCurveSummary (points without days), planAt?: PlanDay[], cached: boolean }
// The first call solves the optimizer once per budget (about 1 s each); later calls answer from an in-process
// LRU keyed by user, pool, constraints, targets, meals per day and concessions. The orchestrator warms that
// cache after every plan run (lib/plan/curve-input.ts). Numbers come from /math only.
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { PlanDay } from "@/types/contracts";
import {
  computeBudgetCurve,
  getCachedCurve,
  getOrComputeCurve,
  mergeBudgetCurves,
  planFromCurve,
  setCachedCurve,
  stripCurveDays,
  summarizeCurve,
  type BudgetCurve,
} from "@/math";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseQuery } from "@/lib/api/http";
import { budgetGrid, buildCurveInput } from "@/lib/plan/curve-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  min: z.coerce.number().positive().optional(),
  max: z.coerce.number().positive().optional(),
  step: z.coerce.number().positive().optional(),
  budget: z.coerce.number().positive().optional(),
  refresh: z.string().optional(),
});

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const q = parseQuery(req, QuerySchema);

  const built = await buildCurveInput(getStore(), userId);
  if (!built.ok) throw new HttpError(built.status, built.message);
  const { profile, input, key } = built;

  const budgets = budgetGrid(q, profile.weeklyBudgetUsd);
  const focus = q.budget ?? profile.weeklyBudgetUsd;

  const refresh = q.refresh === "1" || q.refresh === "true";
  let cached = !refresh && getCachedCurve(key) !== undefined;
  let curve: BudgetCurve;
  if (refresh) {
    curve = await computeBudgetCurve(input, budgets, { focusBudgetUsd: focus });
    setCachedCurve(key, curve);
  } else {
    curve = await getOrComputeCurve(key, () => computeBudgetCurve(input, budgets, { focusBudgetUsd: focus }));
    const have = new Set(curve.points.map((p) => p.budgetUsd));
    const missing = budgets.filter((b) => !have.has(b));
    if (missing.length > 0) {
      curve = mergeBudgetCurves(
        curve,
        await computeBudgetCurve(input, missing, { focusBudgetUsd: focus }),
        focus,
      );
      setCachedCurve(key, curve);
      cached = false;
    }
  }

  // Answer with exactly the requested grid, summarized around the requested focus budget.
  const wanted = new Set(budgets);
  const view = summarizeCurve(
    curve.points.filter((p) => wanted.has(p.budgetUsd)),
    curve.computedMs,
    focus,
  );

  let planAt: PlanDay[] | undefined;
  if (q.budget !== undefined) {
    const point = view.points.find((p) => p.budgetUsd === Math.round(q.budget! * 100) / 100);
    if (point) planAt = planFromCurve(point, { startDate: input.startDate }).days;
  }

  return json({ curve: stripCurveDays(view), ...(planAt ? { planAt } : {}), cached });
});
