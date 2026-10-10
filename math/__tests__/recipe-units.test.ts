import { describe, expect, it } from "vitest";
import type { RecipeIngredient } from "@/types/contracts";
import {
  analyzeRecipe,
  isMinorIngredient,
  normalizeUnit,
  roundKitchenQuantity,
  scaleIngredients,
  toGrams,
  unitFamily,
} from "../recipe-units";
import { computeTotalsRaw } from "../totals";
import { FOODS } from "./fixtures";

function ing(partial: Partial<RecipeIngredient> & { name: string }): RecipeIngredient {
  return {
    id: partial.name,
    quantity: 1,
    unit: "",
    category: "other",
    optionalNotes: "",
    scalable: true,
    foodId: null,
    ...partial,
  };
}

describe("units", () => {
  it("normalizes unit aliases in English and Spanish", () => {
    expect(normalizeUnit("Tablespoons")).toBe("tbsp");
    expect(normalizeUnit("cucharadita")).toBe("tsp");
    expect(normalizeUnit("lbs")).toBe("lb");
    expect(normalizeUnit("cups")).toBe("cup");
  });

  it("classifies unit families", () => {
    expect(unitFamily("g", 100)).toBe("mass");
    expect(unitFamily("cup", 1)).toBe("volume");
    expect(unitFamily("clove", 2)).toBe("count");
    expect(unitFamily("", 2)).toBe("count");
    expect(unitFamily("pinch", 1)).toBe("unspecified");
    expect(unitFamily("g", null)).toBe("unspecified");
  });

  it("converts to grams: mass exactly, volume by density, counts by serving", () => {
    expect(toGrams(200, "g", FOODS.chicken_breast)).toBe(200);
    expect(toGrams(1, "lb", FOODS.chicken_breast)).toBeCloseTo(453.6);
    expect(toGrams(1, "tbsp", FOODS.olive_oil)).toBeCloseTo(14.79);
    expect(toGrams(1, "cup", FOODS.spinach)).toBeCloseTo(36); // leafy greens are airy
    expect(toGrams(2, "", FOODS.eggs)).toBe(100);
    expect(toGrams(null, "g", FOODS.eggs)).toBeNull();
    expect(toGrams(1, "to taste", FOODS.eggs)).toBeNull();
  });
});

describe("isMinorIngredient", () => {
  it("flags seasonings, aromatics and liquids but not real foods", () => {
    expect(isMinorIngredient(ing({ name: "Salt", unit: "tsp" }))).toBe(true);
    expect(isMinorIngredient(ing({ name: "minced garlic cloves", unit: "clove" }))).toBe(true);
    expect(isMinorIngredient(ing({ name: "Low-sodium chicken broth", unit: "cup" }))).toBe(true);
    expect(isMinorIngredient(ing({ name: "Smoked paprika", category: "spices" }))).toBe(true);
    expect(isMinorIngredient(ing({ name: "Anything", unit: "pinch" }))).toBe(true);
    expect(isMinorIngredient(ing({ name: "Salmon fillet", unit: "g" }))).toBe(false);
    expect(isMinorIngredient(ing({ name: "Red bell pepper", unit: "" }))).toBe(false);
    expect(isMinorIngredient(ing({ name: "Watercress", unit: "cup" }))).toBe(false);
  });
});

describe("analyzeRecipe", () => {
  it("computes per serving nutrition and cost with /math totals, ignoring minor ingredients", () => {
    const ingredients = [
      ing({ name: "Chicken breast", quantity: 400, unit: "g", foodId: "chicken_breast" }),
      ing({ name: "Brown rice", quantity: 392, unit: "g", foodId: "brown_rice" }),
      ing({ name: "Salt", quantity: 1, unit: "tsp" }),
    ];
    const a = analyzeRecipe(ingredients, FOODS, 4);
    const raw = computeTotalsRaw(
      [
        { foodId: "chicken_breast", grams: 400 },
        { foodId: "brown_rice", grams: 392 },
      ],
      FOODS,
    );
    expect(a.nutritionSource).toBe("math");
    expect(a.unmatched).toEqual([]);
    expect(a.nutrition.calories).toBe(Math.round(raw.calories / 4));
    expect(a.nutrition.proteinGrams).toBeCloseTo(raw.proteinG / 4, 1);
    expect(a.costPerServing).toBeCloseTo(raw.costUsd / 4, 2);
    expect(a.carbsPerServingG).toBeCloseTo(raw.carbsG / 4, 1);
  });

  it("returns null nutrition (never a partial sum) when a main ingredient is unmatched", () => {
    const a = analyzeRecipe(
      [
        ing({ name: "Chicken breast", quantity: 400, unit: "g", foodId: "chicken_breast" }),
        ing({ name: "Butter", quantity: 2, unit: "tbsp" }),
      ],
      FOODS,
      2,
    );
    expect(a.nutritionSource).toBe("unavailable");
    expect(a.unmatched).toEqual(["Butter"]);
    expect(a.nutrition).toEqual({
      calories: null,
      proteinGrams: null,
      carbohydratesGrams: null,
      fatGrams: null,
    });
    expect(a.costPerServing).toBeNull();
    expect(a.carbsPerServingG).toBeNull();
  });

  it("treats a matched food with no usable quantity as unmatched", () => {
    const a = analyzeRecipe([ing({ name: "Eggs", quantity: null, unit: "", foodId: "eggs" })], FOODS, 1);
    expect(a.nutritionSource).toBe("unavailable");
    expect(a.unmatched).toEqual(["Eggs"]);
  });
});

describe("scaleIngredients", () => {
  const base = [
    ing({ name: "Eggs", quantity: 2, unit: "" }),
    ing({ name: "Rolled oats", quantity: 1, unit: "cup" }),
    ing({ name: "Chicken breast", quantity: 300, unit: "g" }),
    ing({ name: "Salt", quantity: 0.5, unit: "tsp" }),
    ing({ name: "Baking powder", quantity: 1, unit: "tsp", scalable: false }),
    ing({ name: "Water for boiling", quantity: 2, unit: "l", scalable: false }),
    ing({ name: "Black pepper", quantity: null, unit: "to taste" }),
  ];

  it("scales only scalable ingredients and rounds to kitchen measures", () => {
    const out = scaleIngredients(base, 2, 3);
    expect(out[0].quantity).toBe(3);
    expect(out[1].quantity).toBe(1.5);
    expect(out[2].quantity).toBe(450);
    expect(out[3].quantity).toBe(0.5); // seasoning unchanged
    expect(out[4].quantity).toBe(1); // leavener unchanged
    expect(out[5].quantity).toBe(2); // cooking liquid unchanged
    expect(out[6].quantity).toBeNull();
  });

  it("does not mutate the input and is a no-op for equal or invalid servings", () => {
    const copy = JSON.parse(JSON.stringify(base));
    scaleIngredients(base, 2, 5);
    expect(base).toEqual(copy);
    expect(scaleIngredients(base, 2, 2)).toEqual(base);
    expect(scaleIngredients(base, 0, 2)).toEqual(base);
  });

  it("rounds kitchen quantities sensibly", () => {
    expect(roundKitchenQuantity(1.13, "cup")).toBe(1.25);
    expect(roundKitchenQuantity(0.05, "tsp")).toBe(0.25);
    expect(roundKitchenQuantity(1.2, "")).toBe(1);
    expect(roundKitchenQuantity(0.1, "")).toBe(0.5);
    expect(roundKitchenQuantity(123, "g")).toBe(125);
    expect(roundKitchenQuantity(7.4, "g")).toBe(7);
  });
});
