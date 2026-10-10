// Shared test fixtures for /math tests: real seed foods and meal templates.
import foodsList from "@/scripts/data/foods.json";
import templates from "@/scripts/data/meal-templates.json";
import type { CandidateMeal, Food } from "@/types/contracts";

export const FOODS: Record<string, Food> = Object.fromEntries((foodsList as Food[]).map((f) => [f.foodId, f]));

/** Deterministic taste scores so tests are reproducible. */
export const POOL: CandidateMeal[] = (templates as Omit<CandidateMeal, "tasteScore">[]).map((t, i) => ({
  ...t,
  tasteScore: 0.4 + ((i * 37) % 60) / 100,
}));

/** A Chef-sized pool (about 30 meals) with every meal type represented. */
export function chefSizedPool(): CandidateMeal[] {
  const byType: Record<string, CandidateMeal[]> = {};
  for (const c of POOL) (byType[c.type] ??= []).push(c);
  return [...byType.breakfast.slice(0, 8), ...byType.lunch.slice(0, 10), ...byType.dinner.slice(0, 10), ...byType.snack.slice(0, 5)];
}
