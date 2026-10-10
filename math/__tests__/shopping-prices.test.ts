import { describe, expect, it } from "vitest";
import { estimateItemPriceUsd, shelfPrice, sumPricesUsd } from "../shopping-prices";

describe("shelfPrice", () => {
  it("rounds up to a price ending in 9 cents", () => {
    expect(shelfPrice(2.31)).toBe(2.39);
    expect(shelfPrice(2.4)).toBe(2.39);
    expect(shelfPrice(0)).toBe(0.09);
  });
});

describe("estimateItemPriceUsd", () => {
  it("prices mass lines per kg of their aisle", () => {
    // 900 g chicken at 11 USD/kg = 9.90 -> 9.89
    expect(estimateItemPriceUsd({ category: "protein", quantity: 900, unit: "g" })).toBe(9.89);
    expect(estimateItemPriceUsd({ category: "protein", quantity: 0.9, unit: "kg" })).toBe(9.89);
  });

  it("prices count lines per piece", () => {
    // 3 bell peppers at 0.89 = 2.67 -> 2.69
    expect(estimateItemPriceUsd({ category: "produce", quantity: 3, unit: "" })).toBe(2.69);
  });

  it("never goes below the smallest package of the aisle", () => {
    expect(estimateItemPriceUsd({ category: "dairy", quantity: 330, unit: "ml" })).toBe(1.99);
    expect(estimateItemPriceUsd({ category: "produce", quantity: 1, unit: "" })).toBe(0.99);
  });

  it("charges one jar for spices and a minimum package for as-needed lines", () => {
    expect(estimateItemPriceUsd({ category: "spices", quantity: 0.5, unit: "tsp" })).toBe(2.99);
    expect(estimateItemPriceUsd({ category: "pantry", quantity: null, unit: "" })).toBe(2.49);
  });

  it("falls back to the other aisle for unknown categories and is deterministic", () => {
    const item = { category: "mystery", quantity: 2, unit: "" };
    expect(estimateItemPriceUsd(item)).toBe(estimateItemPriceUsd(item));
    expect(estimateItemPriceUsd(item)).toBe(3.99);
  });
});

describe("sumPricesUsd", () => {
  it("adds in cents so the total matches the lines", () => {
    expect(sumPricesUsd([0.1, 0.2])).toBe(0.3);
    expect(sumPricesUsd([])).toBe(0);
  });
});
