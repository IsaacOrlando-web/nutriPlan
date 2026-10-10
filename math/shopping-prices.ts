// Demo shelf prices for the weekly shopping list. Owner: Math. Pure functions, no I/O.
// These are illustrative estimates, not store data: a fixed rate per aisle and unit family, rounded up to a whole
// package, so every line on the list shows a plausible price. Same item in, same price out.
import type { ShoppingListItem } from "./shopping";
import { toBaseQuantity, unitFamily } from "./recipe-units";

/** USD per kg, by aisle. */
const PER_KG: Record<string, number> = {
  produce: 4.4,
  protein: 11,
  dairy: 8.8,
  grains: 3.3,
  pantry: 6.6,
  spices: 30,
  frozen: 5.5,
  other: 6.6,
};

/** USD per liter, by aisle. */
const PER_L: Record<string, number> = {
  produce: 4,
  protein: 6,
  dairy: 1.3,
  grains: 3,
  pantry: 9,
  spices: 30,
  frozen: 5,
  other: 4,
};

/** USD per piece, can or pack, by aisle. */
const PER_COUNT: Record<string, number> = {
  produce: 0.89,
  protein: 0.4,
  dairy: 2.49,
  grains: 2.99,
  pantry: 1.79,
  spices: 2.99,
  frozen: 3.49,
  other: 1.99,
};

/** Smallest thing you can buy in that aisle; also the price of "as needed" lines. */
const MIN_PACKAGE: Record<string, number> = {
  produce: 0.99,
  protein: 2.99,
  dairy: 1.99,
  grains: 1.99,
  pantry: 2.49,
  spices: 2.99,
  frozen: 2.99,
  other: 1.99,
};

const rate = (table: Record<string, number>, category: string) => table[category] ?? table.other;

/** Rounds up to the next price ending in .x9 (2.31 -> 2.39), the way shelf tags look. */
export function shelfPrice(usd: number): number {
  const cents = Math.ceil(Math.round(usd * 100) / 10) * 10 - 1;
  return Math.max(cents, 9) / 100;
}

/** Estimated USD for one shopping line. Spices are one jar for the week, whatever the recipes use. */
export function estimateItemPriceUsd(item: Pick<ShoppingListItem, "category" | "quantity" | "unit">): number {
  const min = rate(MIN_PACKAGE, item.category);
  if (item.category === "spices" || item.quantity === null) return min;
  const family = unitFamily(item.unit, item.quantity);
  let raw: number;
  if (family === "count") raw = item.quantity * rate(PER_COUNT, item.category);
  else if (family === "mass" || family === "volume") {
    const base = toBaseQuantity(item.quantity, item.unit)?.value ?? 0;
    raw = (base / 1000) * rate(family === "mass" ? PER_KG : PER_L, item.category);
  } else return min;
  return shelfPrice(Math.max(raw, min));
}

/** Sum of line prices, in cents first so the total matches the lines exactly. */
export function sumPricesUsd(prices: number[]): number {
  return prices.reduce((s, p) => s + Math.round(p * 100), 0) / 100;
}
