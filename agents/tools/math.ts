// Thin wrappers around /math for agents. Owner: Agents.
// Agents never do arithmetic themselves: every number shown to a user comes through here or guidelines.json.
import type { CandidateMeal, Food, GroceryItem, MealTotals, PlanDay } from "@/types/contracts";
import { computeTotals, computeTotalsRaw } from "@/math/totals";

export { optimizePlan, verifyPlan, filterPool, SLOTS_BY_MEALS } from "@/math/optimizer";
export type { OptimizeOptions } from "@/math/optimizer";
export { calculateTargets, formulaTdee } from "@/math/targets";
export { computeTotals, computeTotalsRaw, sumTotals, subtractTotals, emptyTotals, roundTotals } from "@/math/totals";
export { getTrends } from "@/math/kalman";
export { updateTdee } from "@/math/metabolism";

const SECTION_ORDER: Food["storeSection"][] = ["produce", "protein", "dairy", "grains", "pantry", "frozen", "other"];

/** Aggregates every plan item into a grocery list grouped by store section (shared with scripts/generate-mocks.ts). */
export function buildGroceryList(days: PlanDay[], foods: Record<string, Food>): GroceryItem[] {
  const grams = new Map<string, number>();
  for (const d of days) for (const m of d.meals) for (const i of m.items) grams.set(i.foodId, (grams.get(i.foodId) ?? 0) + i.grams);
  return [...grams]
    .map(([foodId, g]): GroceryItem => {
      const f = foods[foodId];
      const servings = Math.round((g / f.servingG) * 10) / 10;
      return {
        foodId,
        name: f.name,
        quantityG: Math.round(g),
        quantityLabel: `${Math.round(g)} g (about ${servings} x ${f.servingLabel})`,
        costUsd: Math.round(((f.priceUsdPer100g ?? 0) * g) / 100 * 100) / 100,
        storeSection: f.storeSection,
      };
    })
    .sort((a, b) => SECTION_ORDER.indexOf(a.storeSection) - SECTION_ORDER.indexOf(b.storeSection) || a.name.localeCompare(b.name));
}

export type ServingPoint = "min" | "mid" | "max";

/** Grams of each ingredient at min, mid or max servings (mid rounds up so a 0..1 range counts the food). */
export function candidateItemsAt(c: CandidateMeal, foods: Record<string, Food>, at: ServingPoint): { foodId: string; grams: number }[] {
  return c.ingredients
    .filter((i) => foods[i.foodId])
    .map((i) => {
      const servings = at === "min" ? i.minServings : at === "max" ? i.maxServings : Math.ceil((i.minServings + i.maxServings) / 2);
      return { foodId: i.foodId, grams: Math.max(0, servings) * foods[i.foodId].servingG };
    });
}

/** Totals of a candidate at a serving point. */
export function candidateTotalsAt(c: CandidateMeal, foods: Record<string, Food>, at: ServingPoint): MealTotals {
  return computeTotals(candidateItemsAt(c, foods, at), foods);
}

/** Unrounded totals, used for pool checks where rounding could hide a violation. */
export function candidateTotalsRawAt(c: CandidateMeal, foods: Record<string, Food>, at: ServingPoint): MealTotals {
  return computeTotalsRaw(candidateItemsAt(c, foods, at), foods);
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
