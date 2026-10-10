import { describe, expect, it } from "vitest";
import type { Recipe, RecipeIngredient } from "@/types/contracts";
import {
  aggregateShopping,
  applyShoppingState,
  emptyShoppingState,
  formatQuantity,
  groupByCategory,
  normalizeCategory,
  normalizeIngredientName,
  pruneShoppingState,
} from "../shopping";

let n = 0;
function ing(name: string, quantity: number | null, unit: string, category = "produce"): RecipeIngredient {
  return { id: `i${n++}`, name, quantity, unit, category, optionalNotes: "", scalable: true, foodId: null };
}

function recipe(title: string, ingredients: RecipeIngredient[]): Recipe {
  return {
    id: title,
    title,
    description: "",
    mealType: "lunch",
    ingredients,
    instructions: [],
    preparationMinutes: 5,
    cookingMinutes: 5,
    totalMinutes: 10,
    servings: 2,
    difficulty: "easy",
    estimatedCostPerServing: null,
    currency: "USD",
    nutritionPerServing: { calories: null, proteinGrams: null, carbohydratesGrams: null, fatGrams: null },
    nutritionSource: "unavailable",
    unmatchedIngredients: [],
    ruleWarnings: [],
    dietaryTags: [],
    allergens: [],
    imageSearchTerm: "",
    imageUrl: null,
    storageNotes: "",
  };
}

describe("normalizers", () => {
  it("singularizes simple plurals", () => {
    expect(normalizeIngredientName(" Tomatoes ")).toBe("tomato");
    expect(normalizeIngredientName("Eggs")).toBe("egg");
    expect(normalizeIngredientName("Berries")).toBe("berry");
    expect(normalizeIngredientName("Asparagus")).toBe("asparagus");
    expect(normalizeIngredientName("Hummus")).toBe("hummus");
  });

  it("maps free categories to store sections", () => {
    expect(normalizeCategory("Produce")).toBe("produce");
    expect(normalizeCategory("Seafood")).toBe("protein");
    expect(normalizeCategory("Fresh vegetables")).toBe("produce");
    expect(normalizeCategory("Condiments")).toBe("pantry");
    expect(normalizeCategory("weird")).toBe("other");
  });
});

describe("aggregateShopping", () => {
  it("combines repeated ingredients with the same unit and keeps the cook's unit", () => {
    const items = aggregateShopping([
      recipe("A", [ing("Rolled oats", 1, "cup", "grains")]),
      recipe("B", [ing("rolled oats", 0.5, "cups", "grains")]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 1.5, unit: "cup", sources: ["A", "B"] });
  });

  it("converts mixed compatible units to a base unit", () => {
    const items = aggregateShopping([
      recipe("A", [ing("Chicken breast", 1, "lb", "protein")]),
      recipe("B", [ing("Chicken breast", 200, "g", "protein")]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 654, unit: "g" });
  });

  it("never combines incompatible measurements", () => {
    const items = aggregateShopping([
      recipe("A", [ing("Spinach", 2, "cup")]),
      recipe("B", [ing("Spinach", 100, "g")]),
      recipe("C", [ing("Garlic", 2, "clove")]),
      recipe("D", [ing("Garlic", 1, "head")]),
      recipe("E", [ing("Salt", null, "to taste", "spices")]),
    ]);
    const spinach = items.filter((i) => i.name.toLowerCase() === "spinach");
    expect(spinach).toHaveLength(2);
    expect(spinach.map((i) => i.unit).sort()).toEqual(["cup", "g"]);
    expect(items.filter((i) => i.name === "Garlic")).toHaveLength(2);
    expect(items.find((i) => i.name === "Salt")).toMatchObject({ quantity: null });
  });

  it("sums counts and groups by category in store order", () => {
    const items = aggregateShopping([
      recipe("A", [ing("Eggs", 2, "", "protein"), ing("Milk", 1, "cup", "dairy")]),
      recipe("B", [ing("Eggs", 3, "", "protein"), ing("Banana", 1, "", "produce")]),
    ]);
    expect(items.find((i) => i.name === "Eggs")?.quantity).toBe(5);
    expect(groupByCategory(items).map((g) => g.category)).toEqual(["produce", "protein", "dairy"]);
  });
});

describe("shopping state", () => {
  const items = aggregateShopping([
    recipe("A", [ing("Eggs", 2, "", "protein"), ing("Spinach", 2, "cup")]),
    recipe("B", [ing("Rice", 1, "cup", "grains")]),
  ]);
  const eggs = items.find((i) => i.name === "Eggs")!;
  const rice = items.find((i) => i.name === "Rice")!;

  it("applies checks, overrides, removals and custom items, and counts totals", () => {
    const view = applyShoppingState(items, {
      checked: { [eggs.key]: true, "custom:x": true },
      quantityOverrides: { [rice.key]: "1 bag" },
      removed: [items.find((i) => i.name === "Spinach")!.key],
      customItems: [{ id: "x", name: "Coffee", quantity: 1, unit: "bag", category: "pantry" }],
    });
    expect(view.items.map((i) => i.name).sort()).toEqual(["Coffee", "Eggs", "Rice"]);
    expect(view.items.find((i) => i.name === "Rice")?.quantityLabel).toBe("1 bag");
    expect(view.purchased).toBe(2);
    expect(view.remaining).toBe(1);
  });

  it("keeps the state of unaffected items when recipes change", () => {
    const state = { ...emptyShoppingState(), checked: { [eggs.key]: true, [rice.key]: true } };
    const changed = aggregateShopping([
      recipe("A", [ing("Eggs", 2, "", "protein")]),
      recipe("C", [ing("Pasta", 200, "g", "grains")]),
    ]);
    const pruned = pruneShoppingState(changed, state);
    expect(pruned.checked).toEqual({ [eggs.key]: true });
    expect(applyShoppingState(changed, pruned).items.find((i) => i.name === "Eggs")?.checked).toBe(true);
  });

  it("formats quantities", () => {
    expect(formatQuantity(1.5, "cup")).toBe("1.5 cup");
    expect(formatQuantity(3, "")).toBe("3");
    expect(formatQuantity(null, "")).toBe("as needed");
  });
});
