// computeTotals: nutrient, glycemic load and cost totals for a list of foods. Owner: Math.
// Pure function, no side effects. Used by the optimizer, Budget agent, food logging and mocks.
import type { Food, MealTotals, Nutrients } from "@/types/contracts";

export const NUTRIENT_KEYS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "addedSugarG",
  "satFatG",
  "sodiumMg",
  "potassiumMg",
] as const satisfies readonly (keyof Nutrients)[];

export const TOTAL_KEYS = [...NUTRIENT_KEYS, "glycemicLoad", "costUsd"] as const satisfies readonly (keyof MealTotals)[];

export function emptyTotals(): MealTotals {
  return {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarG: 0,
    addedSugarG: 0,
    satFatG: 0,
    sodiumMg: 0,
    potassiumMg: 0,
    glycemicLoad: 0,
    costUsd: 0,
  };
}

/** Glycemic load of `grams` of a food: GI x available carbs (carbs minus fiber) / 100. */
export function glycemicLoadOf(food: Food, grams: number): number {
  if (food.glycemicIndex === undefined) return 0;
  const availableCarbsPer100g = Math.max(0, food.per100g.carbsG - food.per100g.fiberG);
  return (food.glycemicIndex * availableCarbsPer100g * grams) / 100 / 100;
}

/** Rounds totals to display precision: kcal and mg to 1, grams and GL to 0.1, dollars to 0.01. */
export function roundTotals(t: MealTotals): MealTotals {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    calories: Math.round(t.calories),
    proteinG: r1(t.proteinG),
    carbsG: r1(t.carbsG),
    fatG: r1(t.fatG),
    fiberG: r1(t.fiberG),
    sugarG: r1(t.sugarG),
    addedSugarG: r1(t.addedSugarG),
    satFatG: r1(t.satFatG),
    sodiumMg: Math.round(t.sodiumMg),
    potassiumMg: Math.round(t.potassiumMg),
    glycemicLoad: r1(t.glycemicLoad),
    costUsd: Math.round(t.costUsd * 100) / 100,
  };
}

/** Unrounded totals. Throws on an unknown foodId so bad data never silently becomes zero. */
export function computeTotalsRaw(items: { foodId: string; grams: number }[], foods: Record<string, Food>): MealTotals {
  const total = emptyTotals();
  for (const item of items) {
    const food = foods[item.foodId];
    if (!food) throw new Error(`computeTotals: unknown foodId "${item.foodId}"`);
    if (!Number.isFinite(item.grams) || item.grams < 0) {
      throw new Error(`computeTotals: invalid grams for "${item.foodId}"`);
    }
    const f = item.grams / 100;
    for (const key of NUTRIENT_KEYS) total[key] += food.per100g[key] * f;
    total.glycemicLoad += glycemicLoadOf(food, item.grams);
    total.costUsd += (food.priceUsdPer100g ?? 0) * f;
  }
  return total;
}

export function computeTotals(items: { foodId: string; grams: number }[], foods: Record<string, Food>): MealTotals {
  return roundTotals(computeTotalsRaw(items, foods));
}

/** Sums several totals (for example meals into a day) and rounds once at the end. */
export function sumTotals(list: MealTotals[]): MealTotals {
  const total = emptyTotals();
  for (const t of list) for (const key of TOTAL_KEYS) total[key] += t[key];
  return roundTotals(total);
}

/** a - b, floored at zero per field (used for "remaining today"). */
export function subtractTotals(a: MealTotals, b: MealTotals): MealTotals {
  const out = emptyTotals();
  for (const key of TOTAL_KEYS) out[key] = Math.max(0, a[key] - b[key]);
  return roundTotals(out);
}
