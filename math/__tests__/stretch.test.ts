import { describe, expect, it } from "vitest";
import { sampleTaste, seededRandom } from "@/math/taste";
import { simulate } from "@/math/simulate";
import { fitGlucoseResponse } from "@/math/glucoseResponse";
import { ALEX_PROFILE, MARIA_PROFILE } from "@/lib/db/seed/demo-users";
import type { FoodLogEntry, MealPlan, Reading } from "@/types/contracts";
import { emptyTotals } from "@/math/totals";

describe("sampleTaste (Thompson sampling)", () => {
  it("favors liked meals on average", () => {
    const ratings = [
      ...Array(8).fill({ mealName: "Tacos", liked: true }),
      ...Array(8).fill({ mealName: "Soup", liked: false }),
    ];
    const random = seededRandom(1);
    let tacos = 0;
    let soup = 0;
    for (let i = 0; i < 200; i++) {
      const s = sampleTaste(ratings, ["Tacos", "Soup"], random);
      tacos += s.Tacos;
      soup += s.Soup;
    }
    expect(tacos / 200).toBeGreaterThan(0.7);
    expect(soup / 200).toBeLessThan(0.3);
  });
});

describe("simulate (Monte Carlo)", () => {
  it("projects loss with widening uncertainty for a deficit", () => {
    const plan = { days: Array(7).fill({ dayTotals: { ...emptyTotals(), calories: 2100 } }) } as unknown as MealPlan;
    const res = simulate(ALEX_PROFILE, plan, { mean: 2600, sd: 150 }, 12, { runs: 200 });
    expect(res.weeks).toHaveLength(12);
    expect(res.expectedChangeKg).toBeLessThan(0);
    const first = res.weeks[0];
    const last = res.weeks[11];
    expect(last.p90 - last.p10).toBeGreaterThan(first.p90 - first.p10);
  });
});

describe("fitGlucoseResponse (Bayesian regression)", () => {
  it("learns a steeper response from data", () => {
    const logs: FoodLogEntry[] = [10, 20, 30, 40].map((gl, i) => ({
      logId: `l${i}`, userId: "m", eatenAt: "", photoUrl: null, source: "manual", visionAgreement: null, question: null,
      items: [], totals: { ...emptyTotals(), glycemicLoad: gl }, flags: [],
    }));
    const readings: Reading[] = [
      { readingId: "f", userId: "m", type: "glucose_fasting", value: 120, unit: "mg/dL", takenAt: "" },
      ...logs.map((l, i) => ({
        readingId: `p${i}`, userId: "m", type: "glucose_post_meal" as const, value: 120 + 10 + 4 * l.totals.glycemicLoad,
        unit: "mg/dL" as const, takenAt: "", relatedLogId: l.logId,
      })),
    ];
    const model = fitGlucoseResponse(logs, readings);
    expect(model.observations).toBe(4);
    expect(model.perGlycemicLoad).toBeGreaterThan(2.5);
    expect(model.predict(30).mean).toBeGreaterThan(model.predict(10).mean);
    expect(MARIA_PROFILE.conditions).toContain("type2_diabetes");
  });
});
