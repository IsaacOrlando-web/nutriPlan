import { describe, expect, it } from "vitest";
import { enumeratePatterns, filterPool, optimizePlan, verifyPlan } from "@/math/optimizer";
import { calculateTargets } from "@/math/targets";
import { buildConstraints } from "@/agents/rules/engine";
import { ALEX_PROFILE, MARIA_PROFILE } from "@/lib/db/seed/demo-users";
import type { OptimizeInput, UserProfile } from "@/types/contracts";
import { chefSizedPool, FOODS, POOL } from "./fixtures";

function inputFor(p: UserProfile, budget = p.weeklyBudgetUsd, pool = chefSizedPool()): OptimizeInput {
  const constraints = buildConstraints(p);
  return {
    pool,
    foods: FOODS,
    targets: calculateTargets(p, constraints),
    constraints,
    weeklyBudgetUsd: budget,
    concessions: { maxRepeatsPerWeek: 2, budgetSlackPct: 0 },
    startDate: "2026-10-12",
    mealsPerDay: p.mealsPerDay,
  };
}

describe("filterPool", () => {
  it("drops meals with a required allergen and strips optional ones", () => {
    const { kept, dropped } = filterPool(POOL, FOODS, ["peanut"]);
    expect(dropped).toContain("pb_banana_oatmeal");
    expect(kept.some((c) => c.ingredients.some((i) => i.foodId === "peanut_butter"))).toBe(false);
  });

  it("removes all meat for vegetarians", () => {
    const { kept } = filterPool(POOL, FOODS, buildConstraints({ ...ALEX_PROFILE, allergies: [], restrictions: ["vegetarian"] }).excludedFoodTags);
    for (const c of kept) for (const i of c.ingredients) expect(FOODS[i.foodId].tags).not.toContain("meat");
  });
});

describe("enumeratePatterns", () => {
  it("enumerates the cartesian product of serving ranges", () => {
    const per = { calories: 100, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 1, sugarG: 0, addedSugarG: 0, satFatG: 0, sodiumMg: 0, potassiumMg: 0, glycemicLoad: 0, costUsd: 1 };
    const patterns = enumeratePatterns([
      { foodId: "a", name: "a", min: 1, max: 2, servingG: 10, perServing: per },
      { foodId: "b", name: "b", min: 0, max: 2, servingG: 10, perServing: per },
    ]);
    expect(patterns).toHaveLength(6);
    expect(patterns.find((p) => p.servings[0] === 2 && p.servings[1] === 2)?.totals.calories).toBe(400);
  });
});

describe("optimizePlan", () => {
  // Real Kroger prices (scripts/data/prices.csv) put the base template pool above $50; the app reaches $50 with
  // Chef's extra meals (column generation), so the base pool test uses $60.
  it("builds a feasible 7 day plan for Alex within budget", async () => {
    const res = await optimizePlan(inputFor(ALEX_PROFILE, 60), { shadowPrices: false });
    expect(res.feasible).toBe(true);
    expect(res.withinBudget).toBe(true);
    expect(res.days).toHaveLength(7);
    for (const d of res.days) expect(d.meals.map((m) => m.type)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(res.solveMs).toBeLessThan(5000);
  });

  it("never schedules an allergen", async () => {
    const res = await optimizePlan(inputFor(ALEX_PROFILE), { shadowPrices: false });
    for (const d of res.days) for (const m of d.meals) for (const i of m.items) expect(FOODS[i.foodId].tags).not.toContain("peanut");
  });

  it("uses integer servings and consistent grams and totals", async () => {
    const res = await optimizePlan(inputFor(ALEX_PROFILE), { shadowPrices: false });
    for (const d of res.days) {
      const sum = d.meals.reduce((s, m) => s + m.totals.calories, 0);
      expect(Math.abs(sum - d.dayTotals.calories)).toBeLessThanOrEqual(1);
      for (const m of d.meals)
        for (const i of m.items) {
          expect(Number.isInteger(i.servings)).toBe(true);
          expect(i.servings).toBeGreaterThan(0);
          expect(i.servings).toBeLessThanOrEqual(4);
          expect(i.grams).toBe(i.servings * FOODS[i.foodId].servingG);
        }
    }
  });

  it("respects every hard rule for Maria (diabetes + hypertension)", async () => {
    // Base pool at real store prices needs about $79 for Maria; the app reaches $70 with Chef columns.
    const input = inputFor(MARIA_PROFILE, 80, POOL);
    const res = await optimizePlan(input, { shadowPrices: false });
    expect(res.feasible).toBe(true);
    expect(verifyPlan(res.days, input.constraints)).toEqual([]);
    for (const d of res.days) {
      expect(d.dayTotals.sodiumMg).toBeLessThanOrEqual(1500);
      expect(d.dayTotals.potassiumMg).toBeGreaterThanOrEqual(3499); // 1 mg display rounding, same as verifyPlan
      for (const m of d.meals) {
        expect(m.totals.carbsG).toBeLessThanOrEqual(45.2);
        expect(m.totals.glycemicLoad).toBeLessThanOrEqual(20.2);
      }
    }
  });

  it("limits repeats per week", async () => {
    const res = await optimizePlan(inputFor(ALEX_PROFILE), { shadowPrices: false });
    const counts = new Map<string, number>();
    for (const d of res.days) for (const m of d.meals) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("reports conflicts instead of breaking a rule when rules are impossible", async () => {
    const input = inputFor(ALEX_PROFILE);
    input.constraints = { ...input.constraints, maxSodiumMgPerDay: 50 };
    const res = await optimizePlan(input, { shadowPrices: false });
    expect(res.feasible).toBe(false);
    expect(res.conflicts).toContain("max_sodium");
  });

  it("returns shadow prices with human text", async () => {
    const res = await optimizePlan(inputFor(ALEX_PROFILE, 35));
    const budget = res.shadowPrices.find((s) => s.constraint === "weekly_budget");
    expect(budget).toBeDefined();
    expect(budget!.value).toBeGreaterThan(0);
    expect(budget!.humanText).toMatch(/budget/i);
  });

  it("works with the pure JS fallback solver on a small pool", async () => {
    const pool = chefSizedPool().filter((_, i) => i % 3 === 0);
    const res = await optimizePlan({ ...inputFor(ALEX_PROFILE, 80, pool), mealsPerDay: 3 }, { shadowPrices: false, solver: "jslp", mode: "daily" });
    expect(res.days).toHaveLength(7);
  });
});
