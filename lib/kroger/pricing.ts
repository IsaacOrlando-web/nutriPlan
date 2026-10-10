// Prices a grocery list with real Kroger shelf prices. Owner: Backend.
// Product lookups are cached per (term, locationId) for an hour in-process and run 4 at a time.
import type { Food, GroceryItem } from "@/types/contracts";
import { searchProducts } from "./client";
import { matchFoodToKroger, searchTermFor } from "./match";
import type { KrogerPriceResponse, KrogerProduct, PricedGroceryItem } from "./types";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;
const CANDIDATES = 8;

interface CacheEntry {
  at: number;
  products: KrogerProduct[];
}
const globalRef = globalThis as unknown as { __krogerProductCache?: Map<string, CacheEntry> };
const cache = (): Map<string, CacheEntry> => (globalRef.__krogerProductCache ??= new Map());

/** Tests only. */
export function resetProductCache(): void {
  cache().clear();
}

/** Cached product search: one Kroger call per (term, location) per hour. */
export async function lookupProducts(term: string, locationId: string): Promise<KrogerProduct[]> {
  const key = `${locationId}\u0000${term.toLowerCase()}`;
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.products;
  const products = await searchProducts(term, locationId, CANDIDATES);
  cache().set(key, { at: Date.now(), products });
  return products;
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prices one grocery line. Never throws for a missing match: the item comes back without `kroger`. */
export async function priceGroceryItem(
  item: GroceryItem,
  food: Food | undefined,
  locationId: string,
): Promise<PricedGroceryItem> {
  if (!food) return { ...item };
  const candidates = await lookupProducts(searchTermFor(food), locationId);
  const match = matchFoodToKroger(food, candidates);
  if (!match) return { ...item };
  const packagesNeeded = Math.max(1, Math.ceil(item.quantityG / match.packageGrams));
  return {
    ...item,
    kroger: {
      productId: match.product.productId,
      upc: match.product.upc,
      description: match.product.description,
      brand: match.product.brand,
      size: match.product.size ?? "",
      unitPriceUsd: match.unitPriceUsd,
      packagesNeeded,
      lineUsd: round2(packagesNeeded * match.unitPriceUsd),
    },
  };
}

/**
 * Prices a whole grocery list at one store. Lookup failures for a single item are swallowed into `unmatched`
 * so one odd product never blocks the list; configuration and auth errors (first call) still propagate.
 */
export async function priceGroceryList(
  list: GroceryItem[],
  foods: Record<string, Food>,
  locationId: string,
): Promise<KrogerPriceResponse> {
  let fatal: unknown = null;
  const items = await mapPool(list, CONCURRENCY, async (item) => {
    try {
      return await priceGroceryItem(item, foods[item.foodId], locationId);
    } catch (err) {
      // Not configured / auth failed / rate limited: surface it instead of returning an all-unmatched list.
      const code = (err as { code?: string }).code;
      if (
        code === "kroger_not_configured" ||
        code === "kroger_auth_failed" ||
        (err as { status?: number }).status === 429
      )
        fatal ??= err;
      return { ...item };
    }
  });
  if (fatal) throw fatal;
  const matched = items.filter((i) => i.kroger).length;
  const unmatched = items.filter((i) => !i.kroger).map((i) => i.name);
  const totalUsd = round2(items.reduce((sum, i) => sum + (i.kroger?.lineUsd ?? 0), 0));
  return { items, totalUsd, matched, unmatched };
}
