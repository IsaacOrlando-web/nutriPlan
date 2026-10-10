// Turns a model-written recipe into a contract Recipe: ids, food mapping, /math nutrition and cost, rule checks.
// Owner: Agents. No number shown to the user comes from the model except recipe craft (quantities, minutes,
// servings); calories, macros and cost come from analyzeRecipe in /math.
import type { Food, MedicalConstraints, PlannerMealType, Recipe, RecipeIngredient } from "@/types/contracts";
import type { Store } from "@/lib/db/store";
import { newId } from "@/lib/db/store";
import { analyzeRecipe, isMinorIngredient } from "@/math/recipe-units";
import { normalizeIngredientName } from "@/math/shopping";
import type { LlmRecipe } from "../schemas/planner";
import { findForbidden, type ForbiddenRules } from "./safety";

export class RecipeRejectedError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`Recipe rejected: ${reasons.join("; ")}`);
    this.name = "RecipeRejectedError";
  }
}

export interface BuildContext {
  store: Store;
  foods: Record<string, Food>;
  constraints: MedicalConstraints;
  forbidden: ForbiddenRules;
  maxPreparationMinutes: number | null;
}

/** Words in food names that describe form, not identity ("Salmon fillet" is salmon, "Ground turkey 93% lean" is turkey). */
const GENERIC_WORDS = new Set([
  "fillet",
  "whole",
  "ground",
  "lean",
  "mixed",
  "fresh",
  "diced",
  "kernel",
  "rolled",
  "paddle",
  "raw",
  "cooked",
  "natural",
  "drained",
  "canned",
  "large",
  "dry",
  "baked",
  "roasted",
  "grilled",
  "skinless",
]);
const PLANT_SWAPS = /\b(coconut|almond|oat|soy|rice|cashew|peanut|vegan|plant)\b/;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1)
    .map(normalizeIngredientName);
}

/**
 * Picks the food an ingredient really is from search candidates, or null. Every identity word of the food's name
 * must appear in the ingredient ("Butter" never becomes "Peanut butter", "salmon fillets" is "Salmon fillet"), plant
 * based swaps never map to the dairy food, and the most specific match wins ("sweet potatoes" -> "Sweet potato").
 */
export function pickFood(ingredientName: string, candidates: Food[]): Food | null {
  const have = new Set(tokens(ingredientName));
  const lower = ingredientName.toLowerCase();
  let best: { food: Food; score: number } | null = null;
  for (const food of candidates) {
    const label = food.name.split(",")[0];
    const required = tokens(label).filter((t) => !GENERIC_WORDS.has(t));
    if (required.length === 0 || !required.every((t) => have.has(t))) continue;
    if (food.tags.includes("dairy") && PLANT_SWAPS.test(lower)) continue;
    if (!best || required.length > best.score) best = { food, score: required.length };
  }
  return best?.food ?? null;
}

/** Maps an ingredient name to a safe food (excluded tags never match), or null. */
async function mapIngredient(store: Store, name: string, excludedTags: string[]): Promise<Food | null> {
  const hits = await store.searchFoods(name, { limit: 8, excludeTags: excludedTags });
  return pickFood(name, hits);
}

/**
 * Builds and checks one recipe. Throws RecipeRejectedError when the recipe is unsafe or malformed, so the caller
 * can retry with the reasons. Health rules that cannot be verified (unknown nutrition) become `ruleWarnings`.
 */
export async function buildRecipe(
  llm: LlmRecipe,
  expectedType: PlannerMealType,
  ctx: BuildContext,
): Promise<Recipe> {
  const reasons: string[] = [];
  if (llm.mealType !== expectedType) reasons.push(`expected a ${expectedType} recipe, got ${llm.mealType}`);

  // Ingredient names and declared allergens only: a title like "Peanut-free banana bread" must not trip the check.
  const hits = findForbidden([...llm.ingredients.map((i) => i.name), ...llm.allergens], ctx.forbidden);
  if (hits.length) {
    const unique = [...new Set(hits.map((h) => `${h.ingredient} (${h.reason})`))];
    reasons.push(`contains excluded ingredients: ${unique.join(", ")}`);
  }
  if (llm.preparationMinutes + llm.cookingMinutes <= 0) reasons.push("total time must be above zero");
  if (ctx.maxPreparationMinutes !== null && llm.preparationMinutes > ctx.maxPreparationMinutes) {
    reasons.push(
      `preparation takes ${llm.preparationMinutes} min, limit is ${ctx.maxPreparationMinutes} min`,
    );
  }
  if (reasons.length) throw new RecipeRejectedError(reasons);

  const ingredients: RecipeIngredient[] = [];
  for (const ing of llm.ingredients) {
    const food = isMinorIngredient(ing)
      ? null
      : await mapIngredient(ctx.store, ing.name, ctx.forbidden.excludedTags);
    ingredients.push({
      id: newId(),
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit.trim(),
      category: ing.category,
      optionalNotes: ing.optionalNotes.trim(),
      scalable: ing.scalable && !isMinorIngredient(ing),
      foodId: food?.foodId ?? null,
    });
  }

  const analysis = analyzeRecipe(ingredients, ctx.foods, llm.servings);
  const ruleWarnings: string[] = [];
  const { maxCarbsPerMealG, maxGlycemicLoadPerMeal } = ctx.constraints;
  if (analysis.nutritionSource === "math") {
    const violations: string[] = [];
    if (maxCarbsPerMealG !== undefined && analysis.carbsPerServingG! > maxCarbsPerMealG) {
      violations.push(
        `carbs per serving ${analysis.carbsPerServingG} g exceed the ${maxCarbsPerMealG} g per meal limit`,
      );
    }
    if (maxGlycemicLoadPerMeal !== undefined && analysis.glycemicLoadPerServing! > maxGlycemicLoadPerMeal) {
      violations.push(
        `glycemic load ${analysis.glycemicLoadPerServing} exceeds the ${maxGlycemicLoadPerMeal} per meal limit`,
      );
    }
    if (violations.length) throw new RecipeRejectedError(violations);
  } else if (maxCarbsPerMealG !== undefined || maxGlycemicLoadPerMeal !== undefined) {
    ruleWarnings.push(
      `Could not verify your per meal carb limit${maxCarbsPerMealG !== undefined ? ` (${maxCarbsPerMealG} g)` : ""}: some ingredients are not in our food database.`,
    );
  }

  return {
    id: newId(),
    title: llm.title.trim(),
    description: llm.description.trim(),
    mealType: expectedType,
    ingredients,
    instructions: llm.instructions.map((s) => s.trim()).filter(Boolean),
    preparationMinutes: llm.preparationMinutes,
    cookingMinutes: llm.cookingMinutes,
    totalMinutes: llm.preparationMinutes + llm.cookingMinutes,
    servings: llm.servings,
    difficulty: llm.difficulty,
    estimatedCostPerServing: analysis.costPerServing,
    currency: "USD",
    nutritionPerServing: analysis.nutrition,
    nutritionSource: analysis.nutritionSource,
    unmatchedIngredients: analysis.unmatched,
    ruleWarnings,
    dietaryTags: [...new Set(llm.dietaryTags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    allergens: [...new Set(llm.allergens.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    imageSearchTerm: llm.imageSearchTerm.trim(),
    imageUrl: null,
    storageNotes: llm.storageNotes.trim(),
  };
}
