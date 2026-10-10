import { describe, expect, it } from "vitest";
import { mainIngredients, mainProteins, swapSimilarity } from "../planner/variety";

const ing = (name: string, category = "produce", unit = "g") => ({ name, unit, category });
const dish = (title: string, ingredients: ReturnType<typeof ing>[]) => ({ title, ingredients });

const chickenRice = dish("Chicken Teriyaki Rice Bowl", [
  ing("Olive oil", "pantry", "tbsp"),
  ing("Brown rice", "grains"),
  ing("Chicken breasts", "protein"),
  ing("Salt", "spices", "to taste"),
  ing("Broccoli"),
]);

describe("mainProteins / mainIngredients", () => {
  it("puts proteins first and drops seasonings and oil", () => {
    expect(mainProteins(chickenRice)).toEqual(["chicken breast"]);
    expect(mainIngredients(chickenRice)).toEqual(["chicken breast", "brown rice", "broccoli"]);
  });
});

describe("swapSimilarity", () => {
  it("accepts a totally different dish", () => {
    const lentilSoup = dish("Moroccan Lentil Soup", [ing("Lentils", "protein"), ing("Carrots")]);
    expect(swapSimilarity(chickenRice, lentilSoup)).toEqual([]);
  });

  it("rejects the same main protein", () => {
    const wrap = dish("Spicy Wrap", [ing("Chicken breast", "protein"), ing("Tortilla", "grains")]);
    expect(swapSimilarity(chickenRice, wrap)[0]).toMatch(/same main protein .*chicken breast/);
  });

  it("rejects a near copy of the title even with another protein", () => {
    const tofu = dish("Tofu Teriyaki Rice Bowl", [ing("Tofu", "protein"), ing("Brown rice", "grains")]);
    expect(swapSimilarity(chickenRice, tofu).join(" ")).toMatch(/too close/);
  });
});
