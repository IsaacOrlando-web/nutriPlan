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
]);

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
export function searchTermFor(food: Pick<Food, "name">): string {
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
    return round(grams * packs * multiplier);
  }
  if (counted) {
    const units = counted.n * (counted.kind === "dozen" ? 12 : 1) * multiplier;
    return round(units * Math.max(servingG, 1));
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ScoredCandidate {
  product: KrogerProduct;
  coverage: number;
  score: number;
}

/** Token coverage of the food name by the product description, minus noise and processed-form penalties. */
export function scoreCandidate(food: Pick<Food, "name">, product: KrogerProduct): ScoredCandidate {
  const want = foodTokens(food);
  const wantSet = new Set(want);
  const brand = new Set(normalizeTokens(product.brand ?? ""));
  const desc = unique(normalizeTokens(product.description));
  const have = new Set([...desc, ...brand]);
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
  food: Pick<Food, "name" | "servingG">,
  candidates: KrogerProduct[],
): KrogerMatch | null {
  let best: KrogerMatch | null = null;
  for (const product of candidates) {
    const { coverage, score } = scoreCandidate(food, product);
    if (coverage < 0.5 || score < 0.3) continue;
    const unitPriceUsd = unitPriceOf(product);
    const packageGrams = parseSizeToGrams(product.size, food.servingG);
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
