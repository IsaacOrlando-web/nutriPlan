import { describe, expect, it } from "vitest";
import { computeTotals, glycemicLoadOf, subtractTotals, sumTotals } from "@/math/totals";
import { FOODS } from "./fixtures";

describe("computeTotals", () => {
  it("scales per 100 g values by grams", () => {
    const t = computeTotals([{ foodId: "chicken_breast", grams: 200 }], FOODS);
    expect(t.calories).toBe(330);
    expect(t.proteinG).toBe(62);
    expect(t.costUsd).toBe(2.2);
  });

  it("sums several foods", () => {
    const t = computeTotals(
      [
        { foodId: "eggs", grams: 100 },
        { foodId: "ww_bread", grams: 64 },
      ],
      FOODS,
    );
    expect(t.calories).toBe(Math.round(143 + 252 * 0.64));
    expect(t.sodiumMg).toBe(Math.round(142 + 450 * 0.64));
  });

  it("computes glycemic load from GI and available carbs", () => {
    // white rice: GI 73, (28.2 - 0.4) g available carbs per 100 g
    expect(glycemicLoadOf(FOODS.white_rice, 100)).toBeCloseTo((73 * 27.8) / 100, 5);
    // chicken has no GI
    expect(glycemicLoadOf(FOODS.chicken_breast, 100)).toBe(0);
  });

  it("throws on unknown foods instead of silently returning zero", () => {
    expect(() => computeTotals([{ foodId: "unicorn", grams: 10 }], FOODS)).toThrow(/unknown foodId/);
  });

  it("rejects negative grams", () => {
    expect(() => computeTotals([{ foodId: "eggs", grams: -1 }], FOODS)).toThrow(/invalid grams/);
  });

  it("sums and subtracts totals", () => {
    const a = computeTotals([{ foodId: "oats", grams: 40 }], FOODS);
    const b = computeTotals([{ foodId: "milk", grams: 244 }], FOODS);
    const both = sumTotals([a, b]);
    expect(both.calories).toBe(Math.round(a.calories + b.calories));
    const remaining = subtractTotals(both, a);
    expect(remaining.calories).toBeCloseTo(b.calories, 0);
    expect(subtractTotals(a, both).calories).toBe(0);
  });
});
