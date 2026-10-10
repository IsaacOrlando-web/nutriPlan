// Builds the optimizer input for a user's budget tradeoff curve and warms the curve cache. Owner: Backend.
// Shared by GET /api/plan/curve (answers the slider) and the orchestrator (warms the cache right after a
// plan run so the plan page does not wait for 16 solves). Numbers come from /math only; no LLM here.
import type { CandidateMeal, Food, UserProfile } from "@/types/contracts";
import { buildConstraints } from "@/agents/rules/engine";
import {
  calculateTargets,
  computeBudgetCurve,
  curveCacheKey,
  filterPool,
  getCachedCurve,
  getOrComputeCurve,
  type CurveInput,
} from "@/math";
import { getStore } from "@/lib/db";
import type { Store } from "@/lib/db/store";

export const CURVE_DEFAULT_MIN = 25;
export const CURVE_DEFAULT_MAX = 100;
export const CURVE_DEFAULT_STEP = 5;
export const CURVE_MAX_POINTS = 40;

/** The curve is always solved with the same concessions, so every run shares one cache entry per user state. */
export const CURVE_CONCESSIONS = { maxRepeatsPerWeek: 2 as const, budgetSlackPct: 0 as const };

export interface CurveGridQuery {
  min?: number;
  max?: number;
  step?: number;
  budget?: number;
}

/** Chef-like deterministic taste scores from likes and dislikes (same rule as scripts/generate-mocks.ts). */
export function poolFor(
  profile: UserProfile,
  templates: Omit<CandidateMeal, "tasteScore">[],
): CandidateMeal[] {
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

/** Budget grid for the slider: min..max by step, plus the profile budget and the requested focus budget. */
export function budgetGrid(q: CurveGridQuery, current: number): number[] {
  const min = q.min ?? CURVE_DEFAULT_MIN;
  const max = Math.max(min, q.max ?? CURVE_DEFAULT_MAX);
  const step = q.step ?? CURVE_DEFAULT_STEP;
  const budgets = new Set<number>();
  for (let b = min; b <= max + 1e-9 && budgets.size < CURVE_MAX_POINTS; b += step)
    budgets.add(Math.round(b * 100) / 100);
  budgets.add(Math.round(current * 100) / 100);
  if (q.budget !== undefined) budgets.add(Math.round(q.budget * 100) / 100);
  return [...budgets].sort((a, b) => a - b);
}

export type CurveInputResult =
  | { ok: true; profile: UserProfile; input: CurveInput; key: string }
  | { ok: false; status: 404 | 422; message: string };

/** Reads everything the curve needs from the store and builds the optimizer input plus its cache key. */
export async function buildCurveInput(store: Store, userId: string): Promise<CurveInputResult> {
  const profile = await store.getProfile(userId);
  if (!profile) return { ok: false, status: 404, message: "No profile yet" };
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
  if (pool.length === 0) return { ok: false, status: 422, message: "No safe meals for this profile" };

  const input: CurveInput = {
    pool,
    foods,
    targets,
    constraints,
    concessions: CURVE_CONCESSIONS,
    startDate: new Date().toISOString().slice(0, 10),
    mealsPerDay: profile.mealsPerDay,
  };
  const key = curveCacheKey({
    userId,
    candidateIds: pool.map((c) => c.candidateId),
    constraints,
    targets,
    mealsPerDay: profile.mealsPerDay,
    concessions: CURVE_CONCESSIONS,
  });
  return { ok: true, profile, input, key };
}

/**
 * Computes the default curve for a user in the background when it is not cached yet. Called after a plan run
 * finishes, so by the time the user opens the plan page the slider answers from the cache. Never throws.
 */
export async function warmBudgetCurve(userId: string): Promise<"cached" | "computed" | "skipped"> {
  try {
    const built = await buildCurveInput(getStore(), userId);
    if (!built.ok) return "skipped";
    if (getCachedCurve(built.key)) return "cached";
    const budgets = budgetGrid({}, built.profile.weeklyBudgetUsd);
    await getOrComputeCurve(built.key, () =>
      computeBudgetCurve(built.input, budgets, { focusBudgetUsd: built.profile.weeklyBudgetUsd }),
    );
    return "computed";
  } catch (err) {
    console.error(`[curve] warm up failed for ${userId}:`, err instanceof Error ? err.message : err);
    return "skipped";
  }
}
