import { beforeAll, describe, expect, it } from "vitest";
import type {
  CandidateMeal,
  DailyTargets,
  Food,
  MedicalConstraints,
  OptimizeResult,
  PlanDay,
  UserProfile,
} from "@/types/contracts";
import { MemoryStore } from "@/lib/db/memory-store";
import { ALEX_PROFILE, MARIA_PROFILE } from "@/lib/db/seed/demo-users";
import { buildConstraints } from "@/agents/rules/engine";
import { calculateTargets } from "@/math/targets";
import { templateToCandidate } from "../chef";
import {
  allowedFoodNames,
  boostedVariants,
  briefNumbers,
  buildScarcityBrief,
  chefBriefLine,
  columnScore,
  pickScriptedColumns,
  proteinDeviation,
} from "../chef-columns";
import { usedColumns } from "../orchestrator";

process.env.AGENTS_MODE = "scripted";
process.env.AGENT_EVENT_DELAY_MS = "0";

let foods: Record<string, Food>;
let templates: CandidateMeal[];
let alexConstraints: MedicalConstraints;
let alexTargets: DailyTargets;

beforeAll(async () => {
  const store = new MemoryStore(null);
  foods = Object.fromEntries((await store.getAllFoods()).map((f) => [f.foodId, f]));
  templates = (await store.getMealTemplates()).map((t, i) =>
    templateToCandidate(t, i, ALEX_PROFILE.likes, ALEX_PROFILE.dislikes),
  );
  alexConstraints = buildConstraints(ALEX_PROFILE);
  alexTargets = calculateTargets(ALEX_PROFILE, alexConstraints);
});

function day(date: string, proteinG: number, sodiumMg: number, costUsd: number): PlanDay {
  const totals = {
    calories: 1800,
    proteinG,
    carbsG: 200,
    fatG: 60,
    fiberG: 30,
    sugarG: 40,
    addedSugarG: 10,
    satFatG: 15,
    sodiumMg,
    potassiumMg: 3000,
    glycemicLoad: 60,
    costUsd,
  };
  const meal = (type: "breakfast" | "lunch" | "dinner", id: string, cost: number) => ({
    mealId: `${date}_${type}_${id}`,
    type,
    name: id,
    cuisine: "x",
    recipeSteps: [],
    prepMinutes: 10,
    items: [],
    totals: { ...totals, costUsd: cost },
    explanation: [],
  });
  return {
    date,
    meals: [
      meal("breakfast", "b1", costUsd * 0.2),
      meal("lunch", "l1", costUsd * 0.4),
      meal("dinner", "d1", costUsd * 0.4),
    ],
    dayTotals: totals,
  };
}

function resultWith(days: PlanDay[], extra: Partial<OptimizeResult> = {}): OptimizeResult {
  const weeklyCostUsd = Math.round(days.reduce((s, d) => s + d.dayTotals.costUsd, 0) * 100) / 100;
  return {
    feasible: true,
    withinBudget: true,
    days,
    weeklyCostUsd,
    shadowPrices: [],
    bindingConstraints: [],
    conflicts: [],
    solveMs: 1000,
    ...extra,
  };
}

const WEEK = [
  "2026-10-10",
  "2026-10-11",
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
];

describe("buildScarcityBrief", () => {
  it("binding budget becomes 'under $X' and protein under target becomes 'high protein'", () => {
    const profile: UserProfile = { ...ALEX_PROFILE, weeklyBudgetUsd: 50 };
    const days = WEEK.map((d, i) => day(d, alexTargets.proteinG - (i < 4 ? 20 : 2), 1200, 7.1));
    const result = resultWith(days, { bindingConstraints: ["weekly_budget"] });
    const brief = buildScarcityBrief({
      result,
      targets: alexTargets,
      constraints: alexConstraints,
      profile,
      poolSize: 33,
    });
    expect(brief.budgetBinding).toBe(true);
    expect(brief.proteinShortDays).toBe(4);
    expect(brief.proteinGapG).toBe(20);
    expect(brief.maxMealCostUsd).not.toBeNull();
    expect(brief.maxMealCostUsd!).toBeLessThan(50 / 21);
    expect(brief.needs.some((n) => n.startsWith("under $"))).toBe(true);
    expect(brief.needs.some((n) => n.startsWith("high protein"))).toBe(true);
    expect(brief.minProteinG).toBe(Math.round(((alexTargets.proteinG / 3) * 1.1) / 5) * 5);
    expect(brief.scarce).toEqual(["budget", "protein"]);
    expect(brief.text.length).toBeLessThanOrEqual(140);
    expect(brief.text).toMatch(/^First solve/);
    expect(brief.text).toContain("budget and protein are the scarce resources");
    expect(Object.values(brief.typeCounts).reduce((a, b) => a + b, 0)).toBe(6);
    expect(brief.typeCounts.lunch).toBe(3);
    expect(brief.typeCounts.dinner).toBe(3);
    // every number in the text is one the brief carries
    const allowed = new Set(briefNumbers(brief).map(String));
    for (const n of brief.text.match(/\d+(?:\.\d+)?/g) ?? [])
      expect(allowed.has(String(Number(n)))).toBe(true);
  });

  it("nothing binding: no protein or sodium need, still asks for cheaper meals and variety", () => {
    const days = WEEK.map((d) => day(d, alexTargets.proteinG + 1, 1000, 5));
    const brief = buildScarcityBrief({
      result: resultWith(days),
      targets: alexTargets,
      constraints: alexConstraints,
      profile: ALEX_PROFILE,
    });
    expect(brief.budgetBinding).toBe(false);
    expect(brief.minProteinG).toBeNull();
    expect(brief.maxSodiumMg).toBeNull();
    expect(brief.scarce).toEqual([]);
    expect(brief.needs.length).toBeGreaterThan(0);
    expect(brief.text).toContain("nothing binds");
  });

  it("sodium near the cap and diabetes caps show up as needs; infeasible first solve still produces a brief", () => {
    const constraints = buildConstraints(MARIA_PROFILE);
    const targets = calculateTargets(MARIA_PROFILE, constraints);
    const days = WEEK.map((d) => day(d, targets.proteinG, 1450, 9));
    const brief = buildScarcityBrief({
      result: resultWith(days, { bindingConstraints: ["max_sodium"] }),
      targets,
      constraints,
      profile: MARIA_PROFILE,
    });
    expect(brief.maxSodiumMg).not.toBeNull();
    expect(brief.maxCarbsG).toBe(45);
    expect(brief.needs.some((n) => n.startsWith("low sodium"))).toBe(true);
    expect(brief.needs.some((n) => n.includes("45 g carbs"))).toBe(true);

    const infeasible = buildScarcityBrief({
      result: resultWith([], { feasible: false, withinBudget: false, conflicts: ["max_sodium"] }),
      targets,
      constraints,
      profile: MARIA_PROFILE,
    });
    expect(infeasible.feasible).toBe(false);
    expect(infeasible.minProteinG).not.toBeNull();
    expect(infeasible.typeCounts.lunch).toBe(3);
    expect(infeasible.typeCounts.dinner).toBe(3);
    expect(infeasible.text.length).toBeLessThanOrEqual(140);
  });
});

describe("scripted column picker", () => {
  it("picks the requested count per type, none already in the pool, all Doctor-safe, protein-boosted first", () => {
    const profile: UserProfile = { ...ALEX_PROFILE, weeklyBudgetUsd: 50 };
    const days = WEEK.map((d) => day(d, alexTargets.proteinG - 25, 1200, 7.1));
    const brief = buildScarcityBrief({
      result: resultWith(days, { bindingConstraints: ["weekly_budget"] }),
      targets: alexTargets,
      constraints: alexConstraints,
      profile,
    });
    const pool = templates.filter((t) => t.type !== "snack").slice(0, 24);
    const poolIds = new Set(pool.map((c) => c.candidateId));
    const columns = pickScriptedColumns(brief, templates, pool, foods);
    expect(columns.length).toBe(6);
    expect(columns.filter((c) => c.type === "lunch")).toHaveLength(3);
    expect(columns.filter((c) => c.type === "dinner")).toHaveLength(3);
    for (const c of columns) {
      expect(poolIds.has(c.candidateId)).toBe(false);
      expect(columnScore(c, brief, foods)).toBeGreaterThanOrEqual(0);
      for (const i of c.ingredients) expect(foods[i.foodId]).toBeDefined();
    }
    expect(new Set(columns.map((c) => c.candidateId)).size).toBe(6);
  });

  it("boosted variants add one portion of the main protein and keep ids unique", () => {
    const profile: UserProfile = { ...ALEX_PROFILE, weeklyBudgetUsd: 50 };
    const days = WEEK.map((d) => day(d, alexTargets.proteinG - 25, 1200, 7.1));
    const brief = buildScarcityBrief({
      result: resultWith(days),
      targets: alexTargets,
      constraints: alexConstraints,
      profile,
    });
    const pool = templates.filter((t) => t.type === "dinner").slice(0, 5);
    const variants = boostedVariants(pool, brief, foods);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      const base = pool.find((c) => `${c.candidateId}__xp` === v.candidateId)!;
      expect(base).toBeDefined();
      const bumped = v.ingredients.filter(
        (ing, i) =>
          ing.maxServings !== base.ingredients[i].maxServings ||
          ing.minServings !== base.ingredients[i].minServings,
      );
      expect(bumped).toHaveLength(1);
      expect(bumped[0].maxServings).toBeLessThanOrEqual(4);
      expect(foods[bumped[0].foodId].per100g.proteinG).toBeGreaterThan(5);
    }
    // no protein need, no variants
    const calm = buildScarcityBrief({
      result: resultWith(WEEK.map((d) => day(d, alexTargets.proteinG, 1200, 5))),
      targets: alexTargets,
      constraints: alexConstraints,
      profile,
    });
    expect(boostedVariants(pool, calm, foods)).toEqual([]);
  });

  it("chefBriefLine stays under 140 characters even with long dish names", () => {
    const profile: UserProfile = { ...ALEX_PROFILE, weeklyBudgetUsd: 50 };
    const brief = buildScarcityBrief({
      result: resultWith(
        WEEK.map((d) => day(d, alexTargets.proteinG - 25, 1450, 7.1)),
        { bindingConstraints: ["weekly_budget", "max_sodium"] },
      ),
      targets: alexTargets,
      constraints: alexConstraints,
      profile,
    });
    const long = [
      "A very long chicken thigh with rice and green beans, extra chicken thigh",
      "Another extremely long chipotle shredded chicken tostadas, extra chicken breast",
    ];
    expect(chefBriefLine(brief, long).length).toBeLessThanOrEqual(140);
    expect(chefBriefLine(brief, ["Lentil curry", "Tofu bowl"])).toContain("lentil curry and tofu bowl");
  });

  it("allowedFoodNames respects exclusions and the cap of 60", () => {
    const brief = buildScarcityBrief({
      result: resultWith(WEEK.map((d) => day(d, 100, 1200, 7))),
      targets: alexTargets,
      constraints: alexConstraints,
      profile: ALEX_PROFILE,
    });
    const names = allowedFoodNames(foods, ["peanut"], brief);
    expect(names.length).toBeLessThanOrEqual(60);
    expect(names.some((n) => n.includes("peanut"))).toBe(false);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("second solve bookkeeping", () => {
  it("proteinDeviation and usedColumns come from the solved days", () => {
    const days = WEEK.map((d, i) => day(d, alexTargets.proteinG - (i % 2 ? 10 : 0), 1200, 7));
    expect(proteinDeviation(resultWith(days), alexTargets)).toBe(Math.round((3 * 10) / 7));
    expect(proteinDeviation(resultWith([]), alexTargets)).toBe(alexTargets.proteinG);
    const cols = [templates[0], templates[1]].map((c) => ({ ...c, candidateId: `col_${c.candidateId}` }));
    days[0].meals[1].mealId = `${days[0].date}_lunch_${cols[0].candidateId}`;
    days[3].meals[1].mealId = `${days[3].date}_lunch_${cols[0].candidateId}`;
    expect(usedColumns(days, cols)).toBe(1);
  });
});
