// Pure matching between our Food catalog and Kroger products. Owner: Backend. No network, fully unit tested.
//   searchTermFor(food)                 "Chicken breast, roasted" -> "chicken breast"
//   parseSizeToGrams(size, servingG)    "32 fl oz" -> 946 g, "12 ct" -> 12 * servingG
//   matchFoodToKroger(food, candidates) best priceable candidate with price per 100 g, or null
import type { Food } from "@/types/contracts";
import type { KrogerMatch, KrogerProduct } from "./types";

/** Preparation words and connectors that never help a shelf search. */
const STRIP = new Set([
  "roasted",
  "cooked",
  "boiled",
  "baked",
  "raw",
  "drained",
  "shredded",
  "grilled",
  "steamed",
  "fried",
  "sauteed",
  "scrambled",
  "poached",
  "toasted",
  "uncooked",
  "dry",
  "popped",
  "air",
  "chopped",
  "cubes",
  "pieces",
  "sliced",
  "diced",
  "in",
  "of",
  "and",
  "or",
  "with",
  "without",
  "the",
  "a",
  "an",
  "no",
  "added",
  "water",
  "per",
  "fresh",
]);

/** Processed forms that usually mean "not the ingredient we want" (unless the food itself names them). */
const PROCESSED = new Set([
  "nuggets",
  "nugget",
  "strips",
  "strip",
  "patties",
  "patty",
  "tenders",
  "tender",
  "sausage",
  "seasoned",
  "breaded",
  "marinated",
  "flavored",
  "flavor",
  "sauce",
  "soup",
  "mix",
  "dip",
  "chips",
  "chip",
  "bar",
  "bars",
  "snack",
  "snacks",
  "cereal",
  "juice",
  "drink",
  "powder",
  "candy",
  "cookie",
  "cookies",
  "cracker",
  "crackers",
  "gummies",
  "dog",
  "cat",
  "treats",
  "cake",
  "pie",
  "sweetened",
  "dessert",
  "frosting",
  "syrup",
  "jerky",
  "pudding",
  "smoothie",
  "spread",
  // prepared entrees and seasoned forms ("Garlic & Herb Tilapia", "Salsa Style Tomatoes")
  "garlic",
  "herb",
  "herbs",
  "entree",
  "entrée",
  "meal",
  "dinner",
  "kit",
  "stuffed",
  "glazed",
  "battered",
  "crusted",
  "style",
]);

/** Modifiers that are never the head noun of a food name ("Ground beef 90% lean" -> head "beef"). */
const MODIFIERS = new Set([
  "lean",
  "whole",
  "fresh",
  "large",
  "plain",
  "nonfat",
  "skinless",
  "boneless",
  "lowfat",
  "reduced",
  "light",
  "organic",
  "frozen",
  "low",
  "sodium",
  "shelled",
  "unsalted",
  "salted",
  "extra",
  "virgin",
  "instant",
  "canned",
  "wild",
  "smoked",
  "ground",
  "mixed",
  "greek",
]);

/**
 * Foods whose plain name searches badly on Kroger: a better shelf query and the word the product must contain.
 * Keyed by foodId; everything else goes through `searchTermFor` / `headToken`.
 */
export const SEARCH_OVERRIDES: Record<string, { term: string; head: string }> = {
  eggs: { term: "large eggs dozen", head: "egg" },
  egg_whites: { term: "liquid egg whites", head: "egg" },
  tilapia: { term: "tilapia fillets", head: "tilapia" },
  salmon: { term: "salmon fillet", head: "salmon" },
  edamame: { term: "edamame", head: "edamame" },
  farmer_cheese: { term: "queso fresco", head: "queso" },
  cactus: { term: "nopales", head: "nopal" },
  arepa: { term: "arepa corn", head: "arepa" },
  fresh_salsa: { term: "fresh salsa", head: "salsa" },
};

type FoodRef = Pick<Food, "name"> & { foodId?: string };

/**
 * Grams of food as eaten per gram bought, for foods whose catalog entry is cooked but the shelf product is
 * dry or raw. Rice triples when cooked; roasted meat loses about a quarter of its raw weight.
 */
export const COOKED_YIELD: Record<string, number> = {
  brown_rice: 3,
  white_rice: 3,
  quinoa: 2.75,
  ww_pasta: 2.2,
  lentils: 2.5,
  chicken_breast: 0.75,
  chicken_thigh: 0.75,
  ground_turkey: 0.75,
  lean_ground_beef: 0.75,
  flank_steak: 0.75,
  pork_loin: 0.75,
  salmon: 0.8,
  tilapia: 0.8,
  shrimp: 0.85,
};

/** Typical weight of one piece for produce Kroger sells by count ("1 ct", "each"), in grams. */
export const UNIT_GRAMS: Record<string, number> = {
  spinach: 280,
  avocado: 150,
  apple: 180,
  mango: 335,
  plantain: 180,
  kiwi: 75,
  banana: 120,
  orange: 130,
  onion: 150,
  bell_pepper: 150,
  cucumber: 300,
  zucchini: 200,
  potato: 170,
  sweet_potato: 200,
  tomato: 125,
  cabbage: 900,
  broccoli: 300,
  cassava: 400,
  papaya: 1000,
  cactus: 100,
  mixed_greens: 140,
};

/** Grams one counted unit weighs for this food: a known piece weight, else the catalog serving. */
export function unitGramsFor(food: FoodRef & Pick<Food, "servingG">): number {
  return (food.foodId && UNIT_GRAMS[food.foodId]) || food.servingG;
}

const GRAMS_PER_UNIT: Record<string, number> = {
  oz: 28.35,
  ounce: 28.35,
  lb: 453.6,
  pound: 453.6,
  g: 1,
  gram: 1,
  kg: 1000,
  floz: 29.57,
  ml: 1,
  l: 1000,
  liter: 1000,
  litre: 1000,
  gal: 3785,
  gallon: 3785,
  qt: 946,
  quart: 946,
  pt: 473,
  pint: 473,
};

function singular(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.endsWith("oes")) return t.slice(0, -2);
  if (t.endsWith("ss")) return t;
  if (t.endsWith("s")) return t.slice(0, -1);
  return t;
}

/** Lowercase word tokens without numbers, percentages or preparation words (plural forms kept). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STRIP.has(t));
}

/** tokenize + singular forms, so "eggs" and "Egg" compare equal when scoring. */
export function normalizeTokens(text: string): string[] {
  return tokenize(text).map(singular);
}

/** Normalized tokens that describe the food itself (all name segments). */
export function foodTokens(food: Pick<Food, "name">): string[] {
  return unique(normalizeTokens(food.name));
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/**
 * Clean shelf query from the food name. Uses the first comma segment, borrows from later segments only when
 * the first one is a single word ("Tuna, canned in water" -> "tuna canned"), keeps at most 3 tokens and when
 * there are more keeps the head noun at the end ("Whole wheat flour tortilla" -> "whole wheat tortilla").
 */
export function searchTermFor(food: FoodRef): string {
  const override = food.foodId ? SEARCH_OVERRIDES[food.foodId] : undefined;
  if (override) return override.term;
  const segments = food.name.split(",").map((s) => tokenize(s));
  let tokens = unique(segments[0] ?? []);
  for (let i = 1; i < segments.length && tokens.length < 2; i++) tokens = unique([...tokens, ...segments[i]]);
  if (tokens.length === 0) tokens = foodTokens(food);
  if (tokens.length > 3) tokens = [tokens[0], tokens[1], tokens[tokens.length - 1]];
  return tokens.join(" ");
}

interface SizePart {
  n: number;
  unit: string;
  kind: "mass" | "volume" | "count" | "dozen";
}

const SIZE_RE =
  /(\d+(?:[.,]\d+)?)?\s*(fl\.?\s*oz|fluid\s+ounces?|ounces?|oz|pounds?|lbs?|grams?|kg|g|ml|liters?|litres?|l|gallons?|gal|quarts?|qt|pints?|pt|count|ct|each|ea|pk|pack|dozen|doz)\b/gi;

function unitKey(unit: string): { key: string; kind: SizePart["kind"] } {
  const u = unit.toLowerCase().replace(/\s+/g, "").replace(".", "");
  if (u.startsWith("fl") || u.startsWith("fluid")) return { key: "floz", kind: "volume" };
  if (u === "ounce" || u === "ounces" || u === "oz") return { key: "oz", kind: "mass" };
  if (u === "pound" || u === "pounds" || u === "lb" || u === "lbs") return { key: "lb", kind: "mass" };
  if (u === "gram" || u === "grams" || u === "g") return { key: "g", kind: "mass" };
  if (u === "kg") return { key: "kg", kind: "mass" };
  if (u === "ml") return { key: "ml", kind: "volume" };
  if (u === "l" || u === "liter" || u === "liters" || u === "litre" || u === "litres")
    return { key: "l", kind: "volume" };
  if (u === "gal" || u === "gallon" || u === "gallons") return { key: "gal", kind: "volume" };
  if (u === "qt" || u === "quart" || u === "quarts") return { key: "qt", kind: "volume" };
  if (u === "pt" || u === "pint" || u === "pints") return { key: "pt", kind: "volume" };
  if (u === "dozen" || u === "doz") return { key: "dozen", kind: "dozen" };
  return { key: "ct", kind: "count" };
}

/**
 * Grams in one package from a Kroger size label. Counts use the food's serving size (12 ct eggs -> 12 * 50 g).
 * Multipacks multiply ("6 ct / 5.3 oz" -> 6 * 5.3 oz, "2 x 1 lb" -> 2 lb). "per lb" and "each" are handled.
 * Returns null when nothing parses.
 */
export function parseSizeToGrams(size: string | undefined, servingG: number): number | null {
  if (!size) return null;
  const parts: SizePart[] = [];
  for (const m of size.matchAll(SIZE_RE)) {
    const { key, kind } = unitKey(m[2]);
    // "family pack" or "value pack" is not a count; only "each" may stand without a number.
    if (!m[1] && (kind === "count" || kind === "dozen") && !/^ea/i.test(m[2])) continue;
    const n = m[1] ? Number(m[1].replace(",", ".")) : 1;
    if (!Number.isFinite(n) || n <= 0) continue;
    parts.push({ n, unit: key, kind });
  }
  const leadMultiplier = size.match(/^\s*(\d+)\s*[x×-]\s*(?=\d)/i);
  const multiplier = leadMultiplier ? Number(leadMultiplier[1]) : 1;

  const measured = parts.find((p) => p.kind === "mass" || p.kind === "volume");
  const counted = parts.find((p) => p.kind === "count" || p.kind === "dozen");
  if (measured) {
    const grams = measured.n * GRAMS_PER_UNIT[measured.unit];
    const packs = counted ? counted.n * (counted.kind === "dozen" ? 12 : 1) : 1;
    // "6 ct / 5.3 oz" is six cups of 5.3 oz; "30 ct / 24.9 oz" is thirty tortillas weighing 24.9 oz in all.
    // Nobody sells a 20 kg pack of anything in a grocery aisle, so past 4 kg the measure is the total.
    const total = grams * packs > MAX_PER_UNIT_PACK_G ? grams : grams * packs;
    return round(total * multiplier);
  }
  if (counted) {
    const units = counted.n * (counted.kind === "dozen" ? 12 : 1) * multiplier;
    return round(units * Math.max(servingG, 1));
  }
  return null;
}

const MAX_PER_UNIT_PACK_G = 4000;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ScoredCandidate {
  product: KrogerProduct;
  coverage: number;
  score: number;
}

/**
 * The word a product must contain to count as this food: the last non-modifier token of the first name
 * segment ("Chicken breast, roasted" -> "breast", "Ground beef 90% lean" -> "beef", "Eggs, whole" -> "egg"),
 * or the override's head. Stops "Eggs, whole" from matching "Whole Milk".
 */
export function headToken(food: FoodRef): string | null {
  const override = food.foodId ? SEARCH_OVERRIDES[food.foodId] : undefined;
  if (override) return override.head;
  const first = normalizeTokens(food.name.split(",")[0] ?? "");
  for (let i = first.length - 1; i >= 0; i--) if (!MODIFIERS.has(first[i])) return first[i];
  return first[first.length - 1] ?? null;
}

/**
 * Token coverage of the food name by the product description, minus noise and processed-form penalties.
 * A product that does not contain the food's head word scores 0 whatever else it shares.
 */
export function scoreCandidate(food: FoodRef, product: KrogerProduct): ScoredCandidate {
  const want = foodTokens(food);
  const wantSet = new Set(want);
  const brand = new Set(normalizeTokens(product.brand ?? ""));
  const desc = unique(normalizeTokens(product.description));
  const have = new Set([...desc, ...brand]);
  const head = headToken(food);
  if (head && !have.has(head) && ![...have].some((t) => t.startsWith(head))) {
    return { product, coverage: 0, score: 0 };
  }
  const matched = want.filter((t) => have.has(t)).length;
  const coverage = want.length ? matched / want.length : 0;
  const extras = desc.filter((t) => !wantSet.has(t) && !brand.has(t));
  const processed = extras.filter((t) => PROCESSED.has(t)).length;
  const noise = Math.min(0.3, 0.03 * (extras.length - processed));
  const score = Math.max(0, Math.min(1, coverage - noise - 0.35 * processed));
  return { product, coverage, score };
}

function unitPriceOf(product: KrogerProduct): number | null {
  const p = product.price?.promo ?? product.price?.regular;
  return typeof p === "number" && p > 0 ? p : null;
}

/**
 * Best priceable candidate for a food. A candidate needs a price and a parsable size; among those the highest
 * score wins (ties: cheaper per 100 g). Returns null when nothing covers at least half of the food name.
 */
export function matchFoodToKroger(
  food: Pick<Food, "name" | "servingG"> & { foodId?: string },
  candidates: KrogerProduct[],
): KrogerMatch | null {
  let best: KrogerMatch | null = null;
  const unitG = unitGramsFor(food);
  // packageGrams is "grams as eaten": a 1 lb bag of rice feeds like 3 lb of cooked rice.
  const yieldFactor = (food.foodId && COOKED_YIELD[food.foodId]) || 1;
  for (const product of candidates) {
    const { coverage, score } = scoreCandidate(food, product);
    if (coverage < 0.5 || score < 0.3) continue;
    const unitPriceUsd = unitPriceOf(product);
    const bought = parseSizeToGrams(product.size, unitG);
    const packageGrams = bought === null ? null : round(bought * yieldFactor);
    if (unitPriceUsd === null || packageGrams === null || packageGrams <= 0) continue;
    const pricePer100g = round((unitPriceUsd / packageGrams) * 100);
    const candidate: KrogerMatch = { product, score: round(score), pricePer100g, packageGrams, unitPriceUsd };
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.pricePer100g < best.pricePer100g)
    ) {
      best = candidate;
    }
  }
  return best;
}
