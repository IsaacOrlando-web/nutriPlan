// Budget curve ("tradeoff curve"): the optimizer solved at several weekly budgets, so the budget slider can
// show instantly what more or less money buys. Owner: Math.
//
// Every number here comes from solver output; insights are sentences assembled by code from the points,
// never from an LLM. The curve types are math-internal until the Lead promotes them to /types/contracts.ts.
import type { MedicalConstraints, OptimizeInput, OptimizeResult, PlanDay } from "@/types/contracts";
import {
  optimizePrepared,
  prepareContext,
  withBudget,
  type DetailedOptimizeResult,
  type OptimizeOptions,
  type PreparedContext,
} from "./optimizer";

export interface BudgetCurvePoint {
  budgetUsd: number;
  feasible: boolean;
  withinBudget: boolean;
  weeklyCostUsd: number;
  /** Solver objective, lower is better. `Infinity` (JSON `null`) when the solver produced no plan. */
  objective: number;
  /** Mean daily protein shortfall vs target in grams, >= 0. */
  proteinGapG: number;
  /** Mean absolute daily calorie deviation from target, in percent of the target. */
  calorieGapPct: number;
  /** Mean daily sodium as a percent of the Doctor's cap. */
  sodiumUsePct: number;
  bindingConstraints: string[];
  /** Distinct meal names in this plan, for "what changes" comparisons. */
  mealNames: string[];
  days: PlanDay[];
}

export interface BudgetCurve {
  budgets: number[];
  points: BudgetCurvePoint[];
  insights: string[];
  /** Smallest budget whose plan is feasible and within budget, or null when none is. */
  minFeasibleBudgetUsd: number | null;
  /** Budget beyond which every further step improves the objective by under 1 percent, or null. */
  saturationBudgetUsd: number | null;
  computedMs: number;
}

/** A curve point without its 7 day plan (what the API returns for the whole curve). */
export type BudgetCurvePointSummary = Omit<BudgetCurvePoint, "days">;
export type BudgetCurveSummary = Omit<BudgetCurve, "points"> & { points: BudgetCurvePointSummary[] };

export interface BudgetCurveOptions extends OptimizeOptions {
  /** Budget the insights talk about (the user's current budget). Defaults to the smallest feasible point. */
  focusBudgetUsd?: number;
}

/**
 * Per-point solver settings: deterministic day-by-day solves. Measured on the full 64 meal pool (336
 * patterns): 1.5 s per point hit the per-day cap, triggered retries and came back noisy (a $65 plan scoring
 * worse than $55) at 2.3 to 4.9 s per point; 3 s gives a clean monotone curve at about the same 2.6 s per
 * point. On the Chef sized ~30 meal pool a point takes under 1 s either way.
 */
export const CURVE_SOLVE_OPTIONS: OptimizeOptions = { shadowPrices: false, mode: "daily", timeLimitSec: 2 };
/** Protein shortfall under this many grams counts as "target reached". */
export const PROTEIN_OK_G = 2;
/** Objective improvement (relative) under which an extra budget step counts as saturated. */
export const SATURATION_REL_IMPROVEMENT = 0.01;

export type CurveInput = Omit<OptimizeInput, "weeklyBudgetUsd">;

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

function uniqueSorted(budgets: number[]): number[] {
  return [
    ...new Set(budgets.filter((b) => Number.isFinite(b) && b > 0).map((b) => Math.round(b * 100) / 100)),
  ].sort((a, b) => a - b);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Turns one solver result into a curve point. Exported for tests and for callers that already solved. */
export function pointFromResult(
  budgetUsd: number,
  result: DetailedOptimizeResult,
  input: CurveInput,
): BudgetCurvePoint {
  const { targets, constraints } = input;
  const days = result.days;
  const proteinGapG = round1(mean(days.map((d) => Math.max(0, targets.proteinG - d.dayTotals.proteinG))));
  const calorieGapPct =
    targets.calories > 0
      ? round1(
          mean(days.map((d) => (Math.abs(d.dayTotals.calories - targets.calories) / targets.calories) * 100)),
        )
      : 0;
  const sodiumUsePct =
    constraints.maxSodiumMgPerDay > 0
      ? round1(mean(days.map((d) => (d.dayTotals.sodiumMg / constraints.maxSodiumMgPerDay) * 100)))
      : 0;
  const mealNames = [...new Set(days.flatMap((d) => d.meals.map((m) => m.name)))];
  return {
    budgetUsd,
    feasible: result.feasible,
    withinBudget: result.withinBudget,
    weeklyCostUsd: result.weeklyCostUsd,
    objective: result.objective,
    proteinGapG,
    calorieGapPct,
    sodiumUsePct,
    bindingConstraints: result.bindingConstraints,
    mealNames,
    days,
  };
}

/**
 * Solves the plan at every budget (patterns are enumerated once and shared) and summarizes the tradeoff.
 * Budgets are deduplicated and sorted ascending; `points[i]` belongs to `budgets[i]`.
 */
export async function computeBudgetCurve(
  input: CurveInput,
  budgets: number[],
  opts: BudgetCurveOptions = {},
): Promise<BudgetCurve> {
  const started = Date.now();
  const sorted = uniqueSorted(budgets);
  if (sorted.length === 0) throw new Error("computeBudgetCurve needs at least one positive budget");
  const { focusBudgetUsd, ...solveOpts } = opts;
  const options: OptimizeOptions = { ...CURVE_SOLVE_OPTIONS, ...solveOpts, shadowPrices: false };

  const base: PreparedContext = prepareContext({ ...input, weeklyBudgetUsd: sorted[0] });
  const points: BudgetCurvePoint[] = [];
  for (const budgetUsd of sorted) {
    const result = await optimizePrepared(withBudget(base, budgetUsd), options);
    points.push(pointFromResult(budgetUsd, result, input));
  }
  return summarizeCurve(repairDominated(points), Date.now() - started, focusBudgetUsd);
}

/**
 * Pareto repair. The day-by-day solver is a heuristic, so a higher budget can occasionally come back with a
 * worse objective (or a few cents over budget) than a cheaper plan we already hold. A plan that fits a
 * smaller budget also fits every larger one with the same objective, so reuse it there. Ascending order
 * in, same order out; the objective is non-increasing and `withinBudget` never flips back to false.
 */
export function repairDominated(points: BudgetCurvePoint[]): BudgetCurvePoint[] {
  const sorted = [...points].sort((a, b) => a.budgetUsd - b.budgetUsd);
  let best: BudgetCurvePoint | null = null;
  return sorted.map((p) => {
    const own = p.feasible && p.withinBudget && Number.isFinite(p.objective);
    const dominated = best !== null && (!own || p.objective > best.objective);
    const out = dominated && best ? { ...best, budgetUsd: p.budgetUsd, withinBudget: true } : p;
    if (
      out.feasible &&
      out.withinBudget &&
      Number.isFinite(out.objective) &&
      (!best || out.objective <= best.objective)
    )
      best = out;
    return out;
  });
}

/** Builds the curve envelope (insights, thresholds) from solved points. Pure and deterministic. */
export function summarizeCurve(
  points: BudgetCurvePoint[],
  computedMs: number,
  focusBudgetUsd?: number,
): BudgetCurve {
  const sorted = [...points].sort((a, b) => a.budgetUsd - b.budgetUsd);
  const budgets = sorted.map((p) => p.budgetUsd);
  const minFeasibleBudgetUsd = sorted.find((p) => p.feasible && p.withinBudget)?.budgetUsd ?? null;
  const saturationBudgetUsd = saturationOf(sorted);
  return {
    budgets,
    points: sorted,
    insights: buildInsights(sorted, { minFeasibleBudgetUsd, saturationBudgetUsd, focusBudgetUsd }),
    minFeasibleBudgetUsd,
    saturationBudgetUsd,
    computedMs,
  };
}

/** Merges two curves over the same input (for example a cached curve plus newly requested budgets). */
export function mergeBudgetCurves(a: BudgetCurve, b: BudgetCurve, focusBudgetUsd?: number): BudgetCurve {
  const byBudget = new Map<number, BudgetCurvePoint>();
  for (const p of [...a.points, ...b.points]) byBudget.set(p.budgetUsd, p);
  return summarizeCurve([...byBudget.values()], a.computedMs + b.computedMs, focusBudgetUsd);
}

/** The curve without the per-budget plans: what the API sends for the slider. */
export function stripCurveDays(curve: BudgetCurve): BudgetCurveSummary {
  return { ...curve, points: curve.points.map(({ days: _days, ...rest }) => rest) };
}

// ---------------------------------------------------------------------------
// Thresholds and insights (all numbers are copied from the points)
// ---------------------------------------------------------------------------

function usable(points: BudgetCurvePoint[]): BudgetCurvePoint[] {
  return points.filter((p) => p.feasible && p.withinBudget && Number.isFinite(p.objective));
}

function relImprovement(prev: BudgetCurvePoint, next: BudgetCurvePoint): number {
  return (prev.objective - next.objective) / Math.max(Math.abs(prev.objective), 1e-9);
}

function saturationOf(sorted: BudgetCurvePoint[]): number | null {
  const good = usable(sorted);
  if (good.length < 2) return null;
  // Smallest index whose every later step improves the objective by under the threshold.
  let i = good.length - 1;
  while (i > 0 && relImprovement(good[i - 1], good[i]) < SATURATION_REL_IMPROVEMENT) i--;
  return i < good.length - 1 ? good[i].budgetUsd : null;
}

export function fmtUsd(n: number): string {
  return `$${Number.isInteger(n) ? n : Math.round(n * 100) / 100}`;
}

function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

function fmtG(n: number): string {
  return `${Math.round(n)} g`;
}

function lower(s: string): string {
  return s.toLowerCase();
}

function buildInsights(
  sorted: BudgetCurvePoint[],
  ctx: { minFeasibleBudgetUsd: number | null; saturationBudgetUsd: number | null; focusBudgetUsd?: number },
): string[] {
  const out: string[] = [];
  if (sorted.length === 0) return out;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // 1. Where a safe plan becomes affordable.
  if (ctx.minFeasibleBudgetUsd === null) {
    out.push(
      `No budget between ${fmtUsd(first.budgetUsd)} and ${fmtUsd(last.budgetUsd)} fits a plan that meets every Doctor rule`,
    );
  } else if (ctx.minFeasibleBudgetUsd > first.budgetUsd) {
    out.push(
      `Below ${fmtUsd(ctx.minFeasibleBudgetUsd)} the plan cannot stay within budget and meet every Doctor rule`,
    );
  }

  // 2. Protein: first budget where the shortfall is negligible.
  const proteinOk = sorted.find((p) => p.feasible && p.proteinGapG < PROTEIN_OK_G);
  if (!proteinOk) {
    const bestProtein = sorted
      .filter((p) => p.feasible && p.days.length > 0)
      .sort((a, b) => a.proteinGapG - b.proteinGapG)[0];
    if (bestProtein && bestProtein.proteinGapG >= PROTEIN_OK_G) {
      out.push(
        `Even at ${fmtUsd(last.budgetUsd)} the plan stays ${fmtG(bestProtein.proteinGapG)} a day under your protein target`,
      );
    }
  } else if (proteinOk.budgetUsd > first.budgetUsd) {
    out.push(`Below ${fmtUsd(proteinOk.budgetUsd)} the plan cannot reach your protein target`);
  }

  // 3. Saturation: more money stops helping.
  if (ctx.saturationBudgetUsd !== null && ctx.saturationBudgetUsd < last.budgetUsd) {
    out.push(`Above ${fmtUsd(ctx.saturationBudgetUsd)} more money does not make the plan healthier`);
  }

  // 4. What the focus budget looks like.
  const focus =
    (ctx.focusBudgetUsd !== undefined ? sorted.find((p) => p.budgetUsd === ctx.focusBudgetUsd) : undefined) ??
    sorted.find((p) => p.budgetUsd === ctx.minFeasibleBudgetUsd) ??
    sorted.find((p) => p.feasible) ??
    first;
  if (focus.days.length > 0) {
    out.push(`At ${fmtUsd(focus.budgetUsd)} your sodium sits at ${fmtPct(focus.sodiumUsePct)} of the cap`);
    if (focus.withinBudget && focus.weeklyCostUsd < focus.budgetUsd - 0.5) {
      out.push(
        `At ${fmtUsd(focus.budgetUsd)} the plan actually costs ${fmtUsd(focus.weeklyCostUsd)}, the rest stays in your pocket`,
      );
    }
  }

  // 5. What changes with the next step up from the focus budget.
  const idx = sorted.indexOf(focus);
  const next = sorted.slice(idx + 1).find((p) => p.feasible && p.days.length > 0);
  if (next && focus.days.length > 0) {
    const have = new Set(focus.mealNames);
    const added = next.mealNames.filter((n) => !have.has(n));
    if (added.length > 0) {
      out.push(
        `Going from ${fmtUsd(focus.budgetUsd)} to ${fmtUsd(next.budgetUsd)} brings in ${lower(added[0])}`,
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// From a curve point to a plan without re-solving
// ---------------------------------------------------------------------------

function addDaysIso(start: string, n: number): string {
  const t = Date.parse(`${start}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Turns a solved curve point into the shape `optimizePlan` would have returned at that budget, so the
 * Orchestrator can save a MealPlan from the slider's choice without solving again. `startDate` re-dates
 * the 7 days (and their mealIds); `constraints` re-runs nothing, it is only used to keep `conflicts`
 * honest when the point was not feasible. Grocery list and shadow prices are left to the caller.
 */
export function planFromCurve(
  point: BudgetCurvePoint,
  ctx: { startDate?: string; constraints?: MedicalConstraints } = {},
): OptimizeResult {
  let days = point.days;
  if (ctx.startDate && days.length > 0 && days[0].date !== ctx.startDate) {
    const start = ctx.startDate;
    days = days.map((d, i) => {
      const date = addDaysIso(start, i);
      return {
        ...d,
        date,
        meals: d.meals.map((m) => ({ ...m, mealId: m.mealId.replace(d.date, date) })),
      };
    });
  }
  const conflicts: string[] = point.feasible ? [] : ["curve_point_infeasible"];
  return {
    feasible: point.feasible,
    withinBudget: point.withinBudget,
    days,
    weeklyCostUsd: point.weeklyCostUsd,
    shadowPrices: [],
    bindingConstraints: point.bindingConstraints,
    conflicts,
    solveMs: 0,
  };
}
