import { beforeAll, describe, expect, it } from "vitest";
import {
  clearCurveCache,
  computeBudgetCurve,
  CURVE_CACHE_MAX,
  curveCacheKey,
  curveCacheSize,
  getCachedCurve,
  getOrComputeCurve,
  mergeBudgetCurves,
  optimizePlan,
  optimizePlanDetailed,
  planFromCurve,
  repairDominated,
  setCachedCurve,
  stripCurveDays,
  summarizeCurve,
  type BudgetCurve,
  type BudgetCurvePoint,
  type CurveInput,
} from "@/math";
import { calculateTargets } from "@/math/targets";
import { buildConstraints } from "@/agents/rules/engine";
import { ALEX_PROFILE } from "@/lib/db/seed/demo-users";
import type { UserProfile } from "@/types/contracts";
import { chefSizedPool, FOODS } from "./fixtures";

function curveInputFor(p: UserProfile): CurveInput {
  const constraints = buildConstraints(p);
  return {
    pool: chefSizedPool(),
    foods: FOODS,
    targets: calculateTargets(p, constraints),
    constraints,
    concessions: { maxRepeatsPerWeek: 2, budgetSlackPct: 0 },
    startDate: "2026-10-12",
    mealsPerDay: p.mealsPerDay,
  };
}

const BUDGETS = [30, 40, 50, 60, 80];

/** Every integer a reader could see in an insight, taken from the points themselves. */
function numbersInPoints(curve: BudgetCurve): Set<number> {
  const out = new Set<number>();
  for (const p of curve.points) {
    out.add(p.budgetUsd);
    out.add(p.weeklyCostUsd);
    out.add(Math.round(p.weeklyCostUsd * 100) / 100);
    out.add(Math.round(p.sodiumUsePct));
    out.add(Math.round(p.proteinGapG));
    out.add(Math.round(p.calorieGapPct));
  }
  return out;
}

function syntheticPoint(
  budgetUsd: number,
  objective: number,
  extra: Partial<BudgetCurvePoint> = {},
): BudgetCurvePoint {
  return {
    budgetUsd,
    feasible: true,
    withinBudget: true,
    weeklyCostUsd: budgetUsd - 1,
    objective,
    proteinGapG: 0,
    calorieGapPct: 1,
    sodiumUsePct: 50,
    bindingConstraints: [],
    mealNames: [`meal ${budgetUsd}`],
    days: [],
    ...extra,
  };
}

describe("computeBudgetCurve (Alex, chef sized pool)", () => {
  let curve: BudgetCurve;
  const input = curveInputFor(ALEX_PROFILE);

  beforeAll(async () => {
    curve = await computeBudgetCurve(input, [...BUDGETS].reverse(), {
      focusBudgetUsd: ALEX_PROFILE.weeklyBudgetUsd,
    });
  }, 60_000);

  it("returns one point per budget, sorted ascending", () => {
    expect(curve.budgets).toEqual(BUDGETS);
    expect(curve.points.map((p) => p.budgetUsd)).toEqual(BUDGETS);
    for (const p of curve.points) expect(p.days).toHaveLength(7);
  });

  it("objective is monotone non-increasing as budget rises (2% noise allowed)", () => {
    for (let i = 1; i < curve.points.length; i++) {
      const prev = curve.points[i - 1].objective;
      const next = curve.points[i].objective;
      expect(next).toBeLessThanOrEqual(prev * 1.02);
    }
  });

  it("within budget points really are within budget", () => {
    for (const p of curve.points) {
      if (p.withinBudget) expect(p.weeklyCostUsd).toBeLessThanOrEqual(p.budgetUsd + 0.01);
      expect(Math.abs(p.weeklyCostUsd - p.days.reduce((s, d) => s + d.dayTotals.costUsd, 0))).toBeLessThan(
        0.02,
      );
    }
  });

  it("finds the smallest feasible budget and a saturation budget", () => {
    expect(curve.minFeasibleBudgetUsd).not.toBeNull();
    expect(curve.minFeasibleBudgetUsd!).toBeLessThanOrEqual(ALEX_PROFILE.weeklyBudgetUsd);
    const feasible = curve.points.filter((p) => p.feasible && p.withinBudget);
    expect(feasible.length).toBeGreaterThanOrEqual(2);
    // once within budget, a larger budget never flips back to over budget (Pareto repair)
    let seen = false;
    for (const p of curve.points) {
      if (p.feasible && p.withinBudget) seen = true;
      else expect(seen).toBe(false);
    }
  });

  it("metrics are derived from the days", () => {
    for (const p of curve.points) {
      expect(p.proteinGapG).toBeGreaterThanOrEqual(0);
      expect(p.calorieGapPct).toBeGreaterThanOrEqual(0);
      expect(p.sodiumUsePct).toBeGreaterThan(0);
      expect(p.sodiumUsePct).toBeLessThanOrEqual(100);
      expect(p.mealNames.length).toBeGreaterThan(0);
      expect(new Set(p.mealNames).size).toBe(p.mealNames.length);
    }
    // more money never buys less protein overall
    expect(curve.points[curve.points.length - 1].proteinGapG).toBeLessThanOrEqual(
      curve.points[0].proteinGapG,
    );
  });

  it("produces insights whose numbers all come from the points", () => {
    expect(curve.insights.length).toBeGreaterThan(0);
    const allowed = numbersInPoints(curve);
    for (const text of curve.insights) {
      const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      expect(nums.length, text).toBeGreaterThan(0);
      for (const n of nums) expect(allowed.has(n), `${n} in "${text}"`).toBe(true);
    }
    expect(curve.insights.some((t) => /sodium/.test(t))).toBe(true);
  });

  it("re-summarizing is deterministic and stripCurveDays drops only the days", () => {
    const again = summarizeCurve(curve.points, curve.computedMs, ALEX_PROFILE.weeklyBudgetUsd);
    expect(again.insights).toEqual(curve.insights);
    const summary = stripCurveDays(curve);
    expect(summary.points).toHaveLength(curve.points.length);
    for (const p of summary.points) expect("days" in p).toBe(false);
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(curve).length);
  });

  it("planFromCurve returns the plan without re-solving and can re-date it", () => {
    const point = curve.points.find((p) => p.budgetUsd === ALEX_PROFILE.weeklyBudgetUsd)!;
    const same = planFromCurve(point);
    expect(same.days).toBe(point.days);
    expect(same.weeklyCostUsd).toBe(point.weeklyCostUsd);
    expect(same.feasible).toBe(point.feasible);
    expect(same.solveMs).toBe(0);
    const moved = planFromCurve(point, { startDate: "2026-11-01" });
    expect(moved.days.map((d) => d.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
    for (const d of moved.days) for (const m of d.meals) expect(m.mealId.startsWith(d.date)).toBe(true);
    expect(moved.days[0].meals.map((m) => m.name)).toEqual(point.days[0].meals.map((m) => m.name));
  });

  it("merges a second curve over the same input", async () => {
    const extra = await computeBudgetCurve(input, [45], { focusBudgetUsd: 45 });
    const merged = mergeBudgetCurves(curve, extra, 45);
    expect(merged.budgets).toEqual([30, 40, 45, 50, 60, 80]);
    expect(merged.insights.some((t) => t.includes("$45"))).toBe(true);
  }, 20_000);
});

describe("optimizePlanDetailed", () => {
  it("exposes the objective while optimizePlan hides it", async () => {
    const input = { ...curveInputFor(ALEX_PROFILE), weeklyBudgetUsd: 60 };
    const detailed = await optimizePlanDetailed(input, {
      shadowPrices: false,
      mode: "daily",
      timeLimitSec: 1.5,
    });
    expect(Number.isFinite(detailed.objective)).toBe(true);
    const plain = await optimizePlan(input, { shadowPrices: false, mode: "daily", timeLimitSec: 1.5 });
    expect("objective" in plain).toBe(false);
  });
});

describe("repairDominated and summarizeCurve", () => {
  it("reuses a cheaper better plan at higher budgets", () => {
    const pts = [
      syntheticPoint(30, 500),
      syntheticPoint(40, 300),
      syntheticPoint(50, 320, { withinBudget: false, weeklyCostUsd: 50.06 }),
      syntheticPoint(60, 250),
    ];
    const fixed = repairDominated(pts);
    expect(fixed.map((p) => p.objective)).toEqual([500, 300, 300, 250]);
    expect(fixed[2].withinBudget).toBe(true);
    expect(fixed[2].budgetUsd).toBe(50);
    expect(fixed[2].mealNames).toEqual(["meal 40"]);
  });

  it("detects saturation when later steps improve under 1%", () => {
    const curve = summarizeCurve(
      [syntheticPoint(30, 400), syntheticPoint(40, 300), syntheticPoint(50, 299), syntheticPoint(60, 298.5)],
      1,
    );
    expect(curve.saturationBudgetUsd).toBe(40);
    expect(curve.insights).toContain("Above $40 more money does not make the plan healthier");
    expect(curve.minFeasibleBudgetUsd).toBe(30);
  });

  it("reports when no budget is feasible", () => {
    const curve = summarizeCurve(
      [syntheticPoint(30, 900, { withinBudget: false }), syntheticPoint(40, 800, { withinBudget: false })],
      1,
    );
    expect(curve.minFeasibleBudgetUsd).toBeNull();
    expect(curve.saturationBudgetUsd).toBeNull();
    expect(curve.insights[0]).toContain("$30");
    expect(curve.insights[0]).toContain("$40");
  });
});

describe("curve cache", () => {
  const key = (userId: string, extra: Partial<Parameters<typeof curveCacheKey>[0]> = {}) =>
    curveCacheKey({
      userId,
      candidateIds: ["b", "a"],
      constraints: { x: 1, y: [1, 2] },
      targets: { calories: 2000 },
      mealsPerDay: 3,
      concessions: { maxRepeatsPerWeek: 2, budgetSlackPct: 0 },
      ...extra,
    });

  it("keys are stable across key and candidate order and change with the inputs", () => {
    expect(key("u")).toBe(key("u", { candidateIds: ["a", "b"] }));
    expect(key("u")).toBe(key("u", { constraints: { y: [1, 2], x: 1 } }));
    expect(key("u")).not.toBe(key("v"));
    expect(key("u")).not.toBe(key("u", { targets: { calories: 2100 } }));
    expect(key("u")).not.toBe(key("u", { mealsPerDay: 4 }));
    expect(key("u")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns the same object on a hit and evicts the least recently used entry", () => {
    clearCurveCache();
    const curve = summarizeCurve([syntheticPoint(30, 1)], 1);
    setCachedCurve("k0", curve);
    expect(getCachedCurve("k0")).toBe(curve);
    for (let i = 1; i <= CURVE_CACHE_MAX; i++) {
      getCachedCurve("k0"); // keep k0 fresh
      setCachedCurve(`k${i}`, summarizeCurve([syntheticPoint(30 + i, 1)], 1));
    }
    expect(curveCacheSize()).toBe(CURVE_CACHE_MAX);
    expect(getCachedCurve("k0")).toBe(curve);
    expect(getCachedCurve("k1")).toBeUndefined();
    clearCurveCache();
  });

  it("getOrComputeCurve computes once for concurrent callers", async () => {
    clearCurveCache();
    let calls = 0;
    const compute = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return summarizeCurve([syntheticPoint(30, 1)], 1);
    };
    const [a, b] = await Promise.all([
      getOrComputeCurve("shared", compute),
      getOrComputeCurve("shared", compute),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(await getOrComputeCurve("shared", compute)).toBe(a);
    expect(calls).toBe(1);
    clearCurveCache();
  });
});
