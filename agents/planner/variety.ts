// Swap variety checks for the weekly planner. Owner: Agents.
// "Swap dish" must bring a totally different dish, not a variation: code compares the old and new recipe's main
// protein and title words and turns any overlap into feedback for the model's next attempt.
import type { RecipeIngredient } from "@/types/contracts";
import { isMinorIngredient } from "@/math/recipe-units";
import { normalizeIngredientName } from "@/math/shopping";

type Ingredients = { ingredients: Pick<RecipeIngredient, "name" | "unit" | "category">[] };

/** Words that say nothing about the dish itself. */
const TITLE_STOP_WORDS = new Set([
  "a",
  "and",
  "with",
  "the",
  "of",
  "in",
  "on",
  "for",
  "style",
  "easy",
  "quick",
  "simple",
  "healthy",
  "fresh",
  "homemade",
  "bowl",
  "plate",
  "salad",
  "con",
  "de",
  "y",
  "al",
  "la",
  "el",
]);

/** Protein ingredients (normalized names), the core of what makes two dishes "the same". */
export function mainProteins(recipe: Ingredients): string[] {
  return [
    ...new Set(
      recipe.ingredients
        .filter((i) => i.category.toLowerCase() === "protein" && !isMinorIngredient(i))
        .map((i) => normalizeIngredientName(i.name)),
    ),
  ];
}

/** Cooking fats are in almost every dish, so they never define one. */
const COOKING_FATS = /\b(oil|butter|ghee|cooking spray)\b/;

/** Up to `limit` main ingredients: proteins first, then other non-minor ingredients (no cooking fats) in order. */
export function mainIngredients(recipe: Ingredients, limit = 4): string[] {
  const rest = recipe.ingredients
    .filter((i) => !isMinorIngredient(i) && !COOKING_FATS.test(i.name.toLowerCase()))
    .map((i) => normalizeIngredientName(i.name));
  return [...new Set([...mainProteins(recipe), ...rest])].slice(0, limit);
}

function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-záéíóúñü]+/)
      .filter((w) => w.length > 2 && !TITLE_STOP_WORDS.has(w))
      .map(normalizeIngredientName),
  );
}

/**
 * Reasons the replacement is too close to the original (empty when it is a different dish): a shared main
 * protein, or at least half of the shorter title's meaningful words in common.
 */
export function swapSimilarity(
  old: Ingredients & { title: string },
  next: Ingredients & { title: string },
): string[] {
  const reasons: string[] = [];
  const oldProteins = new Set(mainProteins(old));
  const shared = mainProteins(next).filter((p) => oldProteins.has(p));
  if (shared.length) reasons.push(`it uses the same main protein as "${old.title}" (${shared.join(", ")})`);
  const a = titleWords(old.title);
  const b = titleWords(next.title);
  const common = [...b].filter((w) => a.has(w));
  if (common.length > 0 && common.length * 2 >= Math.min(a.size, b.size)) {
    reasons.push(`"${next.title}" is too close to "${old.title}" (shares ${common.join(", ")})`);
  }
  return reasons;
}
