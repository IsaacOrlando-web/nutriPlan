// Recipe ingredient math for the weekly planner: unit conversion, per-serving nutrition and cost, serving scaling.
// Owner: Math. Pure functions, no I/O. The LLM writes recipes (names, quantities, units); every calorie, gram and
// dollar shown to the user is computed here from the foods table. When a non-minor ingredient cannot be matched
// or converted, nutrition and cost are null: never a silent zero.
import type { Food, RecipeIngredient, RecipeNutrition } from "@/types/contracts";
import { computeTotalsRaw } from "./totals";

export type UnitFamily = "mass" | "volume" | "count" | "unspecified";

const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.93,
  tbsp: 14.79,
  cup: 240,
  "fl oz": 29.57,
};

const UNIT_ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  gr: "g",
  kilogram: "kg",
  kilograms: "kg",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsps: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsps: "tbsp",
  tbs: "tbsp",
  cups: "cup",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  cucharada: "tbsp",
  cucharadas: "tbsp",
  cucharadita: "tsp",
  cucharaditas: "tsp",
  taza: "cup",
  tazas: "cup",
  gramos: "g",
  kilo: "kg",
  kilos: "kg",
  litro: "l",
  litros: "l",
};

/** Units that mean "a little, by feel": never scaled, never counted for nutrition. */
const TO_TASTE_UNITS = new Set([
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "to taste",
  "al gusto",
  "pizca",
  "sprig",
  "sprigs",
]);

/** Ingredients too small to move calories or cost meaningfully (spices, herbs, aromatics, acids, water, broth). */
const MINOR_WORDS = [
  "salt",
  "black pepper",
  "ground pepper",
  "white pepper",
  "pepper flakes",
  "garlic",
  "ginger",
  "cumin",
  "paprika",
  "oregano",
  "basil",
  "cilantro",
  "coriander",
  "parsley",
  "thyme",
  "rosemary",
  "dill",
  "mint",
  "bay leaf",
  "cinnamon",
  "nutmeg",
  "turmeric",
  "chili powder",
  "chili flakes",
  "curry powder",
  "spice",
  "seasoning",
  "herb",
  "vanilla",
  "baking powder",
  "baking soda",
  "yeast",
  "water",
  "vinegar",
  "lemon juice",
  "lime juice",
  "zest",
  "hot sauce",
  "broth",
  "stock",
  "cooking spray",
  "sal",
  "pimienta",
  "ajo",
  "comino",
  "agua",
];

/** Normalizes a unit string ("Tablespoons" -> "tbsp"). Empty string for count-like or missing units. */
export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[u] ?? u;
}

export function unitFamily(unit: string, quantity: number | null): UnitFamily {
  if (quantity === null) return "unspecified";
  const u = normalizeUnit(unit);
  if (TO_TASTE_UNITS.has(u)) return "unspecified";
  if (u in MASS_TO_G) return "mass";
  if (u in VOLUME_TO_ML) return "volume";
  return "count";
}

/** Converts a mass or volume quantity to its family base (g or ml). Null for count or unspecified units. */
export function toBaseQuantity(
  quantity: number,
  unit: string,
): { family: "mass" | "volume"; value: number } | null {
  const u = normalizeUnit(unit);
  if (u in MASS_TO_G) return { family: "mass", value: quantity * MASS_TO_G[u] };
  if (u in VOLUME_TO_ML) return { family: "volume", value: quantity * VOLUME_TO_ML[u] };
  return null;
}

/**
 * Estimated grams per ml for a food, by kind. Kitchen measures are approximate: leafy greens are airy, grains and
 * nuts are lighter than water, everything else is taken as water density.
 */
export function densityGPerMl(food: Food): number {
  const name = food.name.toLowerCase();
  if (/spinach|salad greens|lettuce|cabbage/.test(name)) return 0.15;
  if (/oats/.test(name)) return 0.35;
  if (food.tags.includes("nuts") || /seeds|almond|walnut/.test(name)) return 0.6;
  if (food.storeSection === "grains") return 0.75;
  return 1;
}

/**
 * Grams of an ingredient. Mass converts exactly; volume uses `densityGPerMl`; count units ("2 eggs", "1 onion",
 * "1 can") use one food serving per unit. Null when quantity is missing or the unit is "to taste".
 */
export function toGrams(quantity: number | null, unit: string, food: Food): number | null {
  if (quantity === null || !Number.isFinite(quantity) || quantity < 0) return null;
  const family = unitFamily(unit, quantity);
  if (family === "unspecified") return null;
  const base = toBaseQuantity(quantity, unit);
  if (base?.family === "mass") return base.value;
  if (base?.family === "volume") return base.value * densityGPerMl(food);
  return quantity * food.servingG;
}

/** True for seasonings, herbs, aromatics, acids, water and broth, or anything measured "to taste". */
export function isMinorIngredient(ing: Pick<RecipeIngredient, "name" | "unit" | "category">): boolean {
  const name = ing.name.toLowerCase();
  if (TO_TASTE_UNITS.has(normalizeUnit(ing.unit))) return true;
  if (/spice|seasoning|herb/.test(ing.category.toLowerCase())) return true;
  if (/bell pepper|pepper,? (red|green|yellow)|jalape|poblano/.test(name)) return false;
  // Whole words only (optional plural), so "sal" never matches "salmon" and "water" never matches "watercress".
  return MINOR_WORDS.some((w) => new RegExp(`(^|[^a-z])${w}(e?s)?($|[^a-z])`).test(name));
}

export interface RecipeAnalysis {
  /** Per serving; all null when nutritionSource is "unavailable". */
  nutrition: RecipeNutrition;
  nutritionSource: "math" | "unavailable";
  /** USD per serving from food prices (minor ingredients excluded); null when unavailable. */
  costPerServing: number | null;
  /** Per serving carbs and glycemic load for rule checks; null when unavailable. */
  carbsPerServingG: number | null;
  glycemicLoadPerServing: number | null;
  /** Non-minor ingredients without a matched food or convertible quantity. */
  unmatched: string[];
}

const NULL_NUTRITION: RecipeNutrition = {
  calories: null,
  proteinGrams: null,
  carbohydratesGrams: null,
  fatGrams: null,
};

/**
 * Per serving nutrition and cost of a recipe from its matched foods. Minor ingredients are ignored; any other
 * ingredient that is unmatched or unconvertible makes the whole result unavailable (null), so a partial sum is
 * never presented as the recipe's nutrition.
 */
export function analyzeRecipe(
  ingredients: RecipeIngredient[],
  foods: Record<string, Food>,
  servings: number,
): RecipeAnalysis {
  const items: { foodId: string; grams: number }[] = [];
  const unmatched: string[] = [];
  for (const ing of ingredients) {
    if (isMinorIngredient(ing)) continue;
    const food = ing.foodId ? foods[ing.foodId] : undefined;
    const grams = food ? toGrams(ing.quantity, ing.unit, food) : null;
    if (!food || grams === null) {
      unmatched.push(ing.name);
      continue;
    }
    items.push({ foodId: food.foodId, grams });
  }
  if (unmatched.length > 0 || items.length === 0 || !(servings > 0)) {
    return {
      nutrition: { ...NULL_NUTRITION },
      nutritionSource: "unavailable",
      costPerServing: null,
      carbsPerServingG: null,
      glycemicLoadPerServing: null,
      unmatched,
    };
  }
  const t = computeTotalsRaw(items, foods);
  const per = (n: number) => n / servings;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    nutrition: {
      calories: Math.round(per(t.calories)),
      proteinGrams: r1(per(t.proteinG)),
      carbohydratesGrams: r1(per(t.carbsG)),
      fatGrams: r1(per(t.fatG)),
    },
    nutritionSource: "math",
    costPerServing: Math.round(per(t.costUsd) * 100) / 100,
    carbsPerServingG: r1(per(t.carbsG)),
    glycemicLoadPerServing: r1(per(t.glycemicLoad)),
    unmatched,
  };
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Rounds a scaled quantity to something a cook can measure. */
export function roundKitchenQuantity(quantity: number, unit: string): number {
  const u = normalizeUnit(unit);
  let out: number;
  if (u === "g" || u === "ml") out = quantity >= 20 ? roundTo(quantity, 5) : Math.round(quantity);
  else if (u in MASS_TO_G || u in VOLUME_TO_ML) out = roundTo(quantity, 0.25);
  else out = roundTo(quantity, 0.5); // counts: eggs, cloves, cans
  const min = u === "g" || u === "ml" ? 1 : u in MASS_TO_G || u in VOLUME_TO_ML ? 0.25 : 0.5;
  return Math.max(min, Math.round(out * 100) / 100);
}

/**
 * Scales ingredient quantities from one serving count to another. Only `scalable` ingredients with a quantity
 * change; seasonings, leaveners, cooking liquids and "to taste" items keep their amounts so the recipe still works.
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromServings: number,
  toServings: number,
): RecipeIngredient[] {
  if (!(fromServings > 0) || !(toServings > 0) || fromServings === toServings)
    return ingredients.map((i) => ({ ...i }));
  const factor = toServings / fromServings;
  return ingredients.map((ing) => {
    if (
      !ing.scalable ||
      ing.quantity === null ||
      unitFamily(ing.unit, ing.quantity) === "unspecified" ||
      isMinorIngredient(ing)
    ) {
      return { ...ing };
    }
    return { ...ing, quantity: roundKitchenQuantity(ing.quantity * factor, ing.unit) };
  });
}
