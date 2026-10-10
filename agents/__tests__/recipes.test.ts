import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import { candidateToIdea, foodLabel, generateRecipeIdeas, priceItems, RECIPE_COUNT } from "../recipes";
import { loadFoodsMap } from "../tools/backend";
import { computeTotals } from "../tools/math";

process.env.AGENTS_MODE = "scripted";

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore(null);
  setStore(store);
});

describe("generateRecipeIdeas (scripted)", () => {
  it("returns two priced ideas with ingredients for Alex", async () => {
    const res = await generateRecipeIdeas(DEMO_USER_IDS.alex, { store });
    expect(res.source).toBe("templates");
    expect(res.meals).toHaveLength(RECIPE_COUNT);
    for (const m of res.meals) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.price).toBeGreaterThan(0);
      expect(m.ingredients.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("never uses a food from Maria's excluded groups", async () => {
    const res = await generateRecipeIdeas(DEMO_USER_IDS.maria, { store });
    const constraints = (await store.getConstraints(DEMO_USER_IDS.maria))!;
    const foods = Object.values(await loadFoodsMap(store));
    const banned = new Set(
      foods.filter((f) => f.tags.some((t) => constraints.excludedFoodTags.includes(t))).map(foodLabel),
    );
    expect(res.meals).toHaveLength(RECIPE_COUNT);
    for (const m of res.meals) for (const ing of m.ingredients) expect(banned.has(ing)).toBe(false);
  });

  it("throws for an unknown user", async () => {
    await expect(generateRecipeIdeas("nobody", { store })).rejects.toThrow(/profile/i);
  });
});

describe("pricing", () => {
  it("priceItems matches /math computeTotals and skips unknown foods", async () => {
    const foods = await loadFoodsMap(store);
    const [a, b] = Object.values(foods);
    const items = [
      { foodId: a.foodId, grams: a.servingG },
      { foodId: b.foodId, grams: 2 * b.servingG },
    ];
    const expected = computeTotals(items, foods).costUsd;
    expect(priceItems([...items, { foodId: "missing", grams: 100 }], foods)).toBe(expected);
  });

  it("candidateToIdea lists food names and prices at mid servings", async () => {
    const foods = await loadFoodsMap(store);
    const [a, b] = Object.values(foods);
    const idea = candidateToIdea(
      {
        candidateId: "t",
        type: "lunch",
        name: "Test bowl",
        cuisine: "test",
        recipeSteps: [],
        prepMinutes: 10,
        tasteScore: 0.5,
        pitch: "",
        ingredients: [
          { foodId: a.foodId, minServings: 1, maxServings: 1 },
          { foodId: b.foodId, minServings: 1, maxServings: 3 },
        ],
      },
      foods,
    );
    expect(idea.ingredients).toEqual([foodLabel(a), foodLabel(b)]);
    expect(idea.price).toBe(
      computeTotals(
        [
          { foodId: a.foodId, grams: a.servingG },
          { foodId: b.foodId, grams: 2 * b.servingG },
        ],
        foods,
      ).costUsd,
    );
  });
});
