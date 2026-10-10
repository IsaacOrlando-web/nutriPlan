// Recipe ideas for the /plan "Build my plan" button. Owner: Agents.
// Live: OpenAI reads the profile from the store and names 2 meals by ingredient; code maps every ingredient to a
// safe food (allergies and restrictions excluded in the search) and prices the meal with /math.
// Scripted (no key, or the call fails): the best scored lunch and dinner templates, priced the same way.
import type { CandidateMeal, Food, RecipeIdea, RecipeIdeasResponse } from "@/types/contracts";
import { getStore } from "@/lib/db";
import type { Store } from "@/lib/db/store";
import { RecipeIdeasSchema } from "./schemas/recipes";
import { callObject, llmAvailable, NoLlmError } from "./llm";
import { loadPrompt } from "./prompts";
import { profileSummary } from "./context";
import { templateToCandidate } from "./chef";
import { loadFoodsMap, loadUserBundle, mapQueryToFood } from "./tools/backend";
import { candidateItemsAt, computeTotals, filterPool } from "./tools/math";

export const RECIPE_COUNT = 2;

export interface RecipeOptions {
  store?: Store;
}

/** Display name of a food: the part before the first comma ("Chicken breast, raw" -> "Chicken breast"). */
export function foodLabel(food: Food): string {
  return food.name.split(",")[0].trim();
}

/** Prices a list of mapped ingredients with /math. Unknown foods are skipped. */
export function priceItems(items: { foodId: string; grams: number }[], foods: Record<string, Food>): number {
  return computeTotals(
    items.filter((i) => foods[i.foodId]),
    foods,
  ).costUsd;
}

/** Turns a scored template into a recipe idea, priced at mid servings. */
export function candidateToIdea(c: CandidateMeal, foods: Record<string, Food>): RecipeIdea {
  const items = candidateItemsAt(c, foods, "mid");
  return {
    name: c.name,
    price: priceItems(items, foods),
    ingredients: c.ingredients.filter((i) => foods[i.foodId]).map((i) => foodLabel(foods[i.foodId])),
  };
}

/** Scripted ideas: the best safe lunch and dinner templates for this person. */
export async function scriptedIdeas(
  store: Store,
  profile: { likes: string[]; dislikes: string[] },
  foods: Record<string, Food>,
  excluded: string[],
): Promise<RecipeIdea[]> {
  const templates = await store.getMealTemplates();
  const scored = templates.map((t, i) => templateToCandidate(t, i, profile.likes, profile.dislikes));
  const { kept } = filterPool(scored, foods, excluded);
  kept.sort((a, b) => b.tasteScore - a.tasteScore);
  const picks = (["lunch", "dinner"] as const)
    .map((type) => kept.find((c) => c.type === type))
    .filter((c): c is CandidateMeal => Boolean(c));
  for (const c of kept) {
    if (picks.length >= RECIPE_COUNT) break;
    if (!picks.includes(c)) picks.push(c);
  }
  return picks.slice(0, RECIPE_COUNT).map((c) => candidateToIdea(c, foods));
}

async function liveIdeas(
  store: Store,
  prompt: string,
  foods: Record<string, Food>,
  excluded: string[],
): Promise<RecipeIdea[] | null> {
  let proposal;
  try {
    proposal = await callObject({
      agent: "recipes",
      schema: RecipeIdeasSchema,
      system: loadPrompt("recipes"),
      prompt,
      temperature: 0.8,
    });
  } catch (err) {
    if (!(err instanceof NoLlmError)) console.warn("[recipes] llm call failed:", (err as Error).message);
    return null;
  }

  const queries = [
    ...new Set(proposal.meals.flatMap((m) => m.ingredients.map((i) => i.query.trim().toLowerCase()))),
  ];
  const found = await Promise.all(queries.map((q) => mapQueryToFood(store, q, excluded)));
  const foodFor = new Map(queries.map((q, i) => [q, found[i]]));

  const ideas: RecipeIdea[] = [];
  for (const m of proposal.meals) {
    const items: { foodId: string; grams: number }[] = [];
    const names: string[] = [];
    for (const ing of m.ingredients) {
      const food = foodFor.get(ing.query.trim().toLowerCase()) ?? null;
      if (!food || items.some((x) => x.foodId === food.foodId)) continue;
      const servings = Math.max(1, Math.min(3, Math.round(ing.servings)));
      items.push({ foodId: food.foodId, grams: servings * food.servingG });
      names.push(foodLabel(food));
    }
    if (items.length < 2) continue;
    ideas.push({ name: m.name, price: priceItems(items, foods), ingredients: names });
  }
  return ideas.length === RECIPE_COUNT ? ideas : null;
}

/** Two recipe ideas for this user. Never throws for a known user; falls back to templates. */
export async function generateRecipeIdeas(
  userId: string,
  options: RecipeOptions = {},
): Promise<RecipeIdeasResponse> {
  const store = options.store ?? getStore();
  const { profile, constraints } = await loadUserBundle(store, userId);
  const foods = await loadFoodsMap(store);
  const excluded = constraints.excludedFoodTags;

  if (llmAvailable("recipes")) {
    const safeNames = Object.values(foods)
      .filter((f) => !f.tags.some((t) => excluded.includes(t)))
      .map((f) => foodLabel(f).toLowerCase());
    const prompt = [
      `Person: ${profileSummary(profile)}`,
      `Doctor rules (code enforces them): ${constraints.summary}`,
      `Excluded food groups (never use): ${excluded.length ? excluded.join(", ") : "none"}`,
      `Allowed ingredient names: ${[...new Set(safeNames)].slice(0, 80).join("; ")}`,
      `Write ${RECIPE_COUNT} meals: one lunch and one dinner.`,
    ].join("\n");
    const ideas = await liveIdeas(store, prompt, foods, excluded);
    if (ideas) return { meals: ideas, source: "llm" };
  }

  return { meals: await scriptedIdeas(store, profile, foods, excluded), source: "templates" };
}
