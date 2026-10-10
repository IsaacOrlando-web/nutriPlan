// GET /api/plan/curve -> the budget tradeoff curve for the signed in user. Owner: Math (route), data via Backend's store.
//
// Query: ?min=25&max=100&step=5 (budget grid, defaults shown; the profile's weeklyBudgetUsd is always included)
//        ?budget=55              also return the 7 day plan at that budget as `planAt` (slider preview)
//        ?refresh=1              ignore the warm cache and solve again
// Response: { curve: BudgetCurveSummary (points without days), planAt?: PlanDay[], cached: boolean }
// The first call solves the optimizer once per budget (about 1 s each); later calls answer from an in-process
// LRU keyed by user, pool, constraints, targets, meals per day and concessions. Numbers come from /math only.
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { CandidateMeal, Food, PlanDay, UserProfile } from "@/types/contracts";
import { buildConstraints } from "@/agents/rules/engine";
import {
  calculateTargets,
  computeBudgetCurve,
  curveCacheKey,
  filterPool,
  getCachedCurve,
  getOrComputeCurve,
  mergeBudgetCurves,
  planFromCurve,
  setCachedCurve,
  stripCurveDays,
  summarizeCurve,
  type BudgetCurve,
  type CurveInput,
} from "@/math";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MIN = 25;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 5;
const MAX_POINTS = 40;

const QuerySchema = z.object({
  min: z.coerce.number().positive().optional(),
  max: z.coerce.number().positive().optional(),
  step: z.coerce.number().positive().optional(),
  budget: z.coerce.number().positive().optional(),
  refresh: z.string().optional(),
});

/** Chef-like deterministic taste scores from likes and dislikes (same rule as scripts/generate-mocks.ts). */
function poolFor(profile: UserProfile, templates: Omit<CandidateMeal, "tasteScore">[]): CandidateMeal[] {
  return templates.map((t, i) => {
    const text = `${t.name} ${t.cuisine} ${t.ingredients.map((x) => x.foodId).join(" ")}`.toLowerCase();
    let score = 0.5 + ((i * 37) % 30) / 100;
    for (const like of profile.likes) if (text.includes(like.toLowerCase().split(" ")[0])) score += 0.15;
    for (const dislike of profile.dislikes)
      if (text.includes(dislike.toLowerCase().split(" ")[0])) score -= 0.4;
    return {
      ...t,
      tasteScore: Math.min(1, Math.max(0.05, score)),
      pitch: t.pitch || `${t.name}, ${t.cuisine} style, ready in ${t.prepMinutes} minutes.`,
    };
  });
}

function budgetGrid(q: z.infer<typeof QuerySchema>, current: number): number[] {
  const min = q.min ?? DEFAULT_MIN;
  const max = Math.max(min, q.max ?? DEFAULT_MAX);
  const step = q.step ?? DEFAULT_STEP;
  const budgets = new Set<number>();
  for (let b = min; b <= max + 1e-9 && budgets.size < MAX_POINTS; b += step)
    budgets.add(Math.round(b * 100) / 100);
  budgets.add(Math.round(current * 100) / 100);
  if (q.budget !== undefined) budgets.add(Math.round(q.budget * 100) / 100);
  return [...budgets].sort((a, b) => a - b);
}

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const q = parseQuery(req, QuerySchema);
  const store = getStore();

  const profile = await store.getProfile(userId);
  if (!profile) throw new HttpError(404, "No profile yet");
  const [savedConstraints, savedTargets, templates, foodList] = await Promise.all([
    store.getConstraints(userId),
    store.getTargets(userId),
    store.getMealTemplates(),
    store.getAllFoods(),
  ]);
  const constraints = savedConstraints ?? buildConstraints(profile);
  const targets =
    savedTargets ??
    calculateTargets(profile, constraints, (await store.getTdeePosterior(userId)) ?? undefined);
  const foods: Record<string, Food> = Object.fromEntries(foodList.map((f) => [f.foodId, f]));
  const { kept: pool } = filterPool(poolFor(profile, templates), foods, constraints.excludedFoodTags);
  if (pool.length === 0) throw new HttpError(422, "No safe meals for this profile");

  const concessions = { maxRepeatsPerWeek: 2 as const, budgetSlackPct: 0 as const };
  const input: CurveInput = {
    pool,
    foods,
    targets,
    constraints,
    concessions,
    startDate: new Date().toISOString().slice(0, 10),
    mealsPerDay: profile.mealsPerDay,
  };
  const budgets = budgetGrid(q, profile.weeklyBudgetUsd);
  const focus = q.budget ?? profile.weeklyBudgetUsd;
  const key = curveCacheKey({
    userId,
    candidateIds: pool.map((c) => c.candidateId),
    constraints,
    targets,
    mealsPerDay: profile.mealsPerDay,
    concessions,
  });

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
