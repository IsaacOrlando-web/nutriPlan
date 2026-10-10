// Kroger integration tests: matching, pricing, state signing, store methods and routes. Owner: Backend.
// No network: `fetch` is stubbed with a tiny fake Kroger API so the client, cache and routes run end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Food, MealPlan } from "@/types/contracts";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import {
  getAppToken,
  isInternalNode,
  KrogerError,
  normalizeProduct,
  resetAppTokenCache,
  searchLocations,
} from "@/lib/kroger/client";
import {
  headToken,
  matchFoodToKroger,
  parseSizeToGrams,
  scoreCandidate,
  searchTermFor,
  tokenize,
} from "@/lib/kroger/match";
import { mapPool, priceGroceryList, resetProductCache } from "@/lib/kroger/pricing";
import { signState, STATE_COOKIE, verifyState } from "@/lib/kroger/state";
import type { KrogerProduct } from "@/lib/kroger/types";
import { GET as statusGet } from "@/app/api/kroger/status/route";
import { GET as locationsGet } from "@/app/api/kroger/locations/route";
import { POST as locationPost } from "@/app/api/kroger/location/route";
import { GET as connectGet, DELETE as connectDelete } from "@/app/api/kroger/connect/route";
import { GET as callbackGet } from "@/app/api/kroger/callback/route";
import { POST as pricePost } from "@/app/api/kroger/price/route";
import { POST as cartPost } from "@/app/api/kroger/cart/route";

process.env.MEMORY_STORE_FILE = "none";
process.env.AUTH_MODE = "local";

const ALEX = DEMO_USER_IDS.alex;
const ALEX_COOKIE = `np_uid=${ALEX}|alex@demo.nutriplan.app`;
const BASE = "https://kroger.test/v1";
const ENV_KEYS = [
  "KROGER_CLIENT_ID",
  "KROGER_CLIENT_SECRET",
  "KROGER_REDIRECT_URI",
  "KROGER_API_BASE",
  "KROGER_LOCATION_ID",
  "KROGER_STATE_SECRET",
];

function configure(extra: Record<string, string> = {}) {
  process.env.KROGER_CLIENT_ID = "test-client-id";
  process.env.KROGER_CLIENT_SECRET = "s3cret-value";
  process.env.KROGER_REDIRECT_URI = "http://localhost:3000/api/kroger/callback";
  process.env.KROGER_API_BASE = BASE;
  Object.assign(process.env, extra);
}
function unconfigure() {
  for (const k of ENV_KEYS) delete process.env[k];
}

// ---------------------------------------------------------------- fixtures
const product = (p: Partial<KrogerProduct> & { description: string }): KrogerProduct => ({
  productId: p.productId ?? p.description.replace(/\W+/g, "-").toLowerCase(),
  upc: p.upc ?? "0001111000000",
  ...p,
});

const CHICKEN: KrogerProduct[] = [
  product({
    productId: "nuggets",
    upc: "0001111000001",
    description: "Chicken Breast Nuggets",
    brand: "Tyson",
    size: "20 oz",
    price: { regular: 5.99 },
  }),
  product({
    productId: "breast",
    upc: "0001111000002",
    description: "Boneless Skinless Chicken Breast",
    brand: "Kroger",
    size: "2 lb",
    price: { regular: 8.49 },
  }),
  product({
    productId: "thighs",
    upc: "0001111000003",
    description: "Chicken Thighs",
    brand: "Kroger",
    size: "1 lb",
    price: { regular: 4.99 },
  }),
  product({
    productId: "nopice",
    upc: "0001111000004",
    description: "Chicken Breast",
    brand: "Simple Truth",
    size: "1 lb",
  }),
];
const YOGURT: KrogerProduct[] = [
  product({
    productId: "chobani",
    upc: "0001111000011",
    description: "Vanilla Greek Yogurt",
    brand: "Chobani",
    size: "5.3 oz",
    price: { regular: 1.29 },
  }),
  product({
    productId: "kroger-yogurt",
    upc: "0001111000012",
    description: "Plain Nonfat Greek Yogurt",
    brand: "Kroger",
    size: "32 oz",
    price: { regular: 4.99, promo: 4.49 },
  }),
];
const EGGS: KrogerProduct[] = [
  product({
    productId: "eggs",
    upc: "0001111000021",
    description: "Grade A Large Eggs",
    brand: "Kroger",
    size: "12 ct",
    price: { regular: 2.99 },
  }),
];
const FIXTURES: Record<string, KrogerProduct[]> = {
  "chicken breast": CHICKEN,
  "greek yogurt": YOGURT,
  "large eggs dozen": EGGS,
  nopales: [],
};

const food = (name: string, servingG = 100): Pick<Food, "name" | "servingG"> => ({ name, servingG });

/** Fake Kroger API behind global fetch. Records calls and the maximum number in flight. */
function fakeKroger(
  opts: { tokenStatus?: number; productStatus?: number; cartStatus?: number; delayMs?: number } = {},
) {
  const calls: { url: string; method: string; auth: string | null; body: string | null }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: init?.method ?? "GET",
      auth: headers.Authorization ?? null,
      body: (init?.body as string) ?? null,
    });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, opts.delayMs ?? 2));
    inFlight--;
    const u = new URL(url);
    const respond = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (u.pathname.endsWith("/connect/oauth2/token")) {
      if (opts.tokenStatus && opts.tokenStatus !== 200)
        return respond(opts.tokenStatus, { error: "invalid_client", error_description: "bad credentials" });
      const grant = new URLSearchParams(init?.body as string).get("grant_type");
      return respond(200, {
        access_token: `tok-${grant}`,
        refresh_token: grant === "client_credentials" ? undefined : `ref-${grant}`,
        expires_in: 1800,
        token_type: "bearer",
      });
    }
    if (u.pathname.endsWith("/locations")) {
      return respond(200, {
        data: [
          {
            locationId: "01400943",
            name: "Kroger Hyde Park",
            address: { addressLine1: "3760 Paxton Ave", city: "Cincinnati", state: "OH", zipCode: "45209" },
          },
          {
            locationId: "01400376",
            name: "Kroger Corryville",
            address: { addressLine1: "1 W Corry St", city: "Cincinnati", state: "OH", zipCode: "45219" },
          },
        ],
      });
    }
    if (u.pathname.endsWith("/products")) {
      if (opts.productStatus && opts.productStatus !== 200)
        return respond(opts.productStatus, { errors: { reason: "boom" } });
      const term = u.searchParams.get("filter.term") ?? "";
      const data = (FIXTURES[term] ?? []).map((p) => ({
        productId: p.productId,
        upc: p.upc,
        description: p.description,
        brand: p.brand,
        items: [{ size: p.size, price: p.price, fulfillment: { inStore: true } }],
      }));
      return respond(200, { data });
    }
    if (u.pathname.endsWith("/cart/add")) return respond(opts.cartStatus ?? 204);
    return respond(404, { error: "no route" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, maxInFlight: () => maxInFlight, fetchMock };
}

function req(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    rawBody?: string;
    cookie?: string | null;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie !== null) headers.cookie = init.cookie ?? ALEX_COOKIE;
  if (init.body !== undefined || init.rawBody !== undefined) headers["content-type"] = "application/json";
  const body = init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined);
  return new NextRequest(new URL(`http://localhost${path}`), {
    method: init.method ?? "GET",
    ...(body !== undefined ? { body } : {}),
    headers,
  });
}
const ctx = { params: Promise.resolve({}) };

function planFor(userId: string): MealPlan {
  return {
    planId: "plan-1",
    userId,
    version: 1,
    reason: "test",
    runId: "run-1",
    startDate: "2026-10-12",
    weeklyCostUsd: 60,
    days: [],
    groceryList: [
      {
        foodId: "chicken_breast",
        name: "Chicken breast, roasted",
        quantityG: 1400,
        quantityLabel: "1.4 kg",
        costUsd: 15.4,
        storeSection: "protein",
      },
      {
        foodId: "greek_yogurt",
        name: "Greek yogurt, plain, nonfat",
        quantityG: 1020,
        quantityLabel: "6 containers",
        costUsd: 6.1,
        storeSection: "dairy",
      },
      {
        foodId: "eggs",
        name: "Eggs, whole",
        quantityG: 600,
        quantityLabel: "12 eggs",
        costUsd: 2.4,
        storeSection: "dairy",
      },
      {
        foodId: "cactus",
        name: "Cactus paddles, cooked",
        quantityG: 300,
        quantityLabel: "2 cups",
        costUsd: 1.2,
        storeSection: "produce",
      },
    ],
    shadowPrices: [],
    bestEffort: false,
  };
}

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore(null);
  setStore(store);
  resetAppTokenCache();
  resetProductCache();
  unconfigure();
});
afterEach(() => {
  vi.unstubAllGlobals();
  unconfigure();
});

// ---------------------------------------------------------------- match.ts
describe("searchTermFor", () => {
  it.each([
    ["Chicken breast, roasted", "chicken breast"],
    ["Chicken thigh, skinless, roasted", "chicken thigh"],
    ["Ground turkey 93% lean, cooked", "ground turkey lean"],
    ["Tuna, canned in water, drained", "tuna canned"],
    ["Greek yogurt, plain, nonfat", "greek yogurt"],
    ["Eggs, whole", "eggs whole"],
    ["Milk, 2%", "milk"],
    ["Whole wheat flour tortilla", "whole wheat tortilla"],
    ["Popcorn, air-popped", "popcorn"],
    ["Blueberries, frozen", "blueberries frozen"],
    ["Olive oil", "olive oil"],
    ["Diced tomatoes, no salt added", "tomatoes salt"],
    ["Mixed vegetables, frozen, cooked", "mixed vegetables"],
  ])("%s -> %s", (name, expected) => {
    expect(searchTermFor(food(name))).toBe(expected);
  });

  it("drops numbers, percentages and prep words", () => {
    expect(tokenize("Ground beef 90% lean, cooked and drained")).toEqual(["ground", "beef", "lean"]);
  });
});

describe("parseSizeToGrams", () => {
  it.each<[string | undefined, number, number | null]>([
    ["16 oz", 100, 453.6],
    ["1 lb", 100, 453.6],
    ["2 lb", 100, 907.2],
    ["12 ct", 50, 600],
    ["1 gal", 244, 3785],
    ["32 fl oz", 244, 946.24],
    ["500 g", 100, 500],
    ["1.5 kg", 100, 1500],
    ["6 ct / 5.3 oz", 170, 901.53],
    ["2 x 1 lb", 100, 907.2],
    ["each", 118, 118],
    ["per lb", 118, 453.6],
    ["1 dozen", 50, 600],
    ["1 qt", 244, 946],
    ["large", 100, null],
    ["", 100, null],
    [undefined, 100, null],
  ])("%s (serving %d g) -> %s", (size, servingG, grams) => {
    expect(parseSizeToGrams(size, servingG)).toBe(grams);
  });
});

describe("matchFoodToKroger", () => {
  const chicken = food("Chicken breast, roasted");

  it("prefers the plain ingredient over processed forms and computes price per 100 g", () => {
    const m = matchFoodToKroger(chicken, CHICKEN);
    expect(m?.product.productId).toBe("breast");
    expect(m?.packageGrams).toBe(907.2);
    expect(m?.unitPriceUsd).toBe(8.49);
    expect(m?.pricePer100g).toBe(0.94);
    expect(m?.score).toBeGreaterThan(0.8);
  });

  it("scores nuggets and thighs below the real thing", () => {
    const breast = scoreCandidate(chicken, CHICKEN[1]).score;
    expect(scoreCandidate(chicken, CHICKEN[0]).score).toBeLessThan(breast);
    expect(scoreCandidate(chicken, CHICKEN[2]).score).toBeLessThan(breast);
  });

  it("skips candidates without a price or a parsable size", () => {
    expect(matchFoodToKroger(chicken, [CHICKEN[3]])).toBeNull();
    expect(
      matchFoodToKroger(chicken, [
        product({ description: "Chicken Breast", size: "family pack", price: { regular: 9 } }),
      ]),
    ).toBeNull();
  });

  it("returns null when nothing covers half of the food name", () => {
    expect(matchFoodToKroger(food("Cactus paddles, cooked"), CHICKEN)).toBeNull();
    expect(matchFoodToKroger(chicken, [])).toBeNull();
  });

  it("uses the promo price when there is one and compares plural forms", () => {
    const m = matchFoodToKroger(food("Greek yogurt, plain, nonfat", 170), YOGURT);
    expect(m?.product.productId).toBe("kroger-yogurt");
    expect(m?.unitPriceUsd).toBe(4.49);
    expect(m?.pricePer100g).toBe(0.49);
    const eggs = matchFoodToKroger(food("Eggs, whole", 50), EGGS);
    expect(eggs?.packageGrams).toBe(600);
    expect(eggs?.pricePer100g).toBe(0.5);
  });

  it("breaks score ties by the cheaper price per 100 g", () => {
    const a = product({
      productId: "a",
      description: "Rolled Oats",
      size: "18 oz",
      price: { regular: 3.99 },
    });
    const b = product({
      productId: "b",
      description: "Rolled Oats",
      size: "42 oz",
      price: { regular: 5.49 },
    });
    expect(matchFoodToKroger(food("Rolled oats, dry", 40), [a, b])?.product.productId).toBe("b");
  });

  it("requires the head word: whole milk is not eggs, ground beef needs beef", () => {
    expect(headToken(food("Eggs, whole"))).toBe("egg");
    expect(headToken(food("Ground beef 90% lean, cooked"))).toBe("beef");
    expect(headToken(food("Chicken breast, roasted"))).toBe("breast");
    expect(headToken({ foodId: "cactus", name: "Cactus paddles, cooked" })).toBe("nopal");
    const milk = product({
      productId: "milk",
      description: "Horizon Organic Vitamin D Whole Milk",
      size: "1/2 gal",
      price: { regular: 6.79 },
    });
    expect(scoreCandidate(food("Eggs, whole"), milk).score).toBe(0);
    expect(matchFoodToKroger(food("Eggs, whole", 50), [milk])).toBeNull();
    const nopales = product({
      productId: "nop",
      description: "Nopales Cactus Leaves",
      size: "1 lb",
      price: { regular: 2.49 },
    });
    expect(
      matchFoodToKroger({ foodId: "cactus", name: "Cactus paddles, cooked", servingG: 75 }, [nopales])
        ?.product.productId,
    ).toBe("nop");
  });

  it("uses shelf search overrides by foodId and penalizes prepared entrees", () => {
    expect(searchTermFor({ foodId: "eggs", name: "Eggs, whole" })).toBe("large eggs dozen");
    expect(searchTermFor({ foodId: "unknown_food", name: "Eggs, whole" })).toBe("eggs whole");
    const entree = product({
      productId: "entree",
      description: "Sea Cuisine Garlic & Herb Tilapia",
      size: "9 oz",
      price: { regular: 12.49 },
    });
    const plain = product({
      productId: "plain",
      description: "Tilapia Fillets",
      size: "1 lb",
      price: { regular: 6.99 },
    });
    expect(matchFoodToKroger(food("Tilapia, baked", 100), [entree, plain])?.product.productId).toBe("plain");
    expect(scoreCandidate(food("Tilapia, baked"), entree).score).toBeLessThan(0.3);
  });
});

describe("cooked yield and piece weights", () => {
  it("prices dry rice per cooked gram and counted produce by piece weight", () => {
    const rice = product({
      productId: "rice",
      description: "Brown Rice",
      size: "14 oz",
      price: { regular: 1.99 },
    });
    const m = matchFoodToKroger({ foodId: "brown_rice", name: "Brown rice, cooked", servingG: 98 }, [rice]);
    expect(m?.packageGrams).toBe(1190.7); // 396.9 g dry x 3
    expect(m?.pricePer100g).toBe(0.17);
    const bunch = product({
      productId: "sp",
      description: "Spinach",
      size: "1 ct",
      price: { regular: 1.99 },
    });
    const s = matchFoodToKroger({ foodId: "spinach", name: "Spinach, raw", servingG: 30 }, [bunch]);
    expect(s?.packageGrams).toBe(280);
    expect(s?.pricePer100g).toBe(0.71);
  });

  it("reads '30 ct / 24.9 oz' as a total, not thirty bags", () => {
    expect(parseSizeToGrams("30 ct / 24.9 oz", 26)).toBe(705.92);
    expect(parseSizeToGrams("6 ct / 5.3 oz", 170)).toBe(901.53);
  });
});

describe("isInternalNode", () => {
  it("drops Kroger's warehouse and forecast rows but keeps stores", () => {
    expect(isInternalNode("Harris Teeter - Spoke Forecast - HT Trans")).toBe(true);
    expect(isInternalNode("Harris Teeter - - Unused Spoke")).toBe(true);
    expect(isInternalNode("Kroger - Kroger On the Rhine")).toBe(false);
    expect(isInternalNode(undefined)).toBe(false);
  });
});

describe("normalizeProduct", () => {
  it("maps the Kroger payload and drops zero prices", () => {
    const p = normalizeProduct({
      productId: "0001111041700",
      upc: "0001111041700",
      description: "Kroger 2% Reduced Fat Milk",
      brand: "Kroger",
      images: [{ perspective: "front", sizes: [{ size: "medium", url: "https://img/medium.jpg" }] }],
      items: [{ size: "1 gal", price: { regular: 3.29, promo: 0 }, fulfillment: { inStore: true } }],
    });
    expect(p).toMatchObject({
      productId: "0001111041700",
      size: "1 gal",
      price: { regular: 3.29, promo: undefined },
      inStore: true,
      imageUrl: "https://img/medium.jpg",
    });
    expect(normalizeProduct({ productId: "x" })).toBeNull();
  });
});

// ---------------------------------------------------------------- client.ts
describe("client", () => {
  it("throws kroger_not_configured without credentials and never calls the network", async () => {
    const api = fakeKroger();
    await expect(getAppToken()).rejects.toMatchObject({ code: "kroger_not_configured", status: 503 });
    expect(api.calls).toHaveLength(0);
  });

  it("caches the app token and sends Basic auth without leaking the secret in errors", async () => {
    configure();
    const api = fakeKroger();
    expect(await getAppToken()).toBe("tok-client_credentials");
    expect(await getAppToken()).toBe("tok-client_credentials");
    expect(api.calls.filter((c) => c.url.endsWith("/connect/oauth2/token"))).toHaveLength(1);
    expect(api.calls[0].auth).toBe(`Basic ${Buffer.from("test-client-id:s3cret-value").toString("base64")}`);
    expect(api.calls[0].body).toContain("grant_type=client_credentials");
    expect(api.calls[0].body).toContain("scope=product.compact");

    resetAppTokenCache();
    fakeKroger({ tokenStatus: 401 });
    const err = await getAppToken().catch((e) => e as KrogerError);
    expect(err).toBeInstanceOf(KrogerError);
    expect(err).toMatchObject({ code: "kroger_auth_failed", status: 401 });
    expect((err as KrogerError).message).not.toContain("s3cret");
  });

  it("maps locations", async () => {
    configure();
    fakeKroger();
    const locations = await searchLocations("45202");
    expect(locations[0]).toEqual({
      id: "01400943",
      name: "Kroger Hyde Park",
      address: "3760 Paxton Ave, Cincinnati, OH, 45209",
    });
  });
});

// ---------------------------------------------------------------- pricing.ts
describe("priceGroceryList", () => {
  const list = planFor(ALEX).groceryList;

  it("prices matched items, counts packages and lists unmatched names", async () => {
    configure();
    const api = fakeKroger();
    const foods = await store.getFoods(list.map((g) => g.foodId));
    const res = await priceGroceryList(list, foods, "01400943");
    expect(res.matched).toBe(3);
    expect(res.unmatched).toEqual(["Cactus paddles, cooked"]);
    const byId = Object.fromEntries(res.items.map((i) => [i.foodId, i]));
    expect(byId.chicken_breast.kroger).toMatchObject({
      upc: "0001111000002",
      size: "2 lb",
      unitPriceUsd: 8.49,
      packagesNeeded: 3,
      lineUsd: 25.47,
    });
    expect(byId.greek_yogurt.kroger).toMatchObject({ packagesNeeded: 2, lineUsd: 8.98, unitPriceUsd: 4.49 });
    expect(byId.eggs.kroger).toMatchObject({ packagesNeeded: 1, lineUsd: 2.99 });
    expect(byId.cactus.kroger).toBeUndefined();
    expect(res.totalUsd).toBe(37.44);
    // every GroceryItem field survives
    expect(byId.chicken_breast).toMatchObject({ quantityG: 1400, costUsd: 15.4, storeSection: "protein" });
    expect(api.calls.filter((c) => c.url.includes("/products")).length).toBe(4);
    expect(api.calls.find((c) => c.url.includes("/products"))?.url).toContain("filter.fulfillment=ais");
  });

  it("caches product lookups per term and location", async () => {
    configure();
    const api = fakeKroger();
    const foods = await store.getFoods(list.map((g) => g.foodId));
    await priceGroceryList(list, foods, "01400943");
    await priceGroceryList(list, foods, "01400943");
    expect(api.calls.filter((c) => c.url.includes("/products")).length).toBe(4);
    await priceGroceryList(list, foods, "01400376");
    expect(api.calls.filter((c) => c.url.includes("/products")).length).toBe(8);
  });

  it("runs at most 4 lookups at a time", async () => {
    configure();
    const api = fakeKroger({ delayMs: 15 });
    const big = Array.from({ length: 12 }, (_, i) => ({ ...list[0], foodId: `f${i}`, name: `Food ${i}` }));
    const foods = Object.fromEntries(
      big.map((g) => [
        g.foodId,
        {
          ...(store as unknown as { data: { foods: Record<string, Food> } }).data.foods.chicken_breast,
          foodId: g.foodId,
          name: `Chicken breast ${g.foodId}`,
        },
      ]),
    );
    await priceGroceryList(big, foods, "01400943");
    expect(api.maxInFlight()).toBeLessThanOrEqual(4);
    expect(api.maxInFlight()).toBeGreaterThan(1);
  });

  it("propagates configuration errors but swallows per-item upstream errors", async () => {
    const foods = await store.getFoods(list.map((g) => g.foodId));
    fakeKroger();
    await expect(priceGroceryList(list, foods, "01400943")).rejects.toMatchObject({
      code: "kroger_not_configured",
    });
    configure();
    fakeKroger({ productStatus: 500 });
    const res = await priceGroceryList(list, foods, "01400943");
    expect(res.matched).toBe(0);
    expect(res.unmatched).toHaveLength(4);
  });

  it("mapPool preserves order", async () => {
    const out = await mapPool([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n * 3));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });
});

// ---------------------------------------------------------------- state.ts
describe("state", () => {
  it("round trips and rejects tampering", () => {
    configure({ KROGER_STATE_SECRET: "state-secret" });
    const state = signState(ALEX, "nonce-1");
    expect(verifyState(state, "nonce-1")).toBe(ALEX);
    expect(verifyState(state, "nonce-2")).toBeNull();
    expect(verifyState(`${state}x`, "nonce-1")).toBeNull();
    const [, nonce, sig] = state.split(".");
    expect(
      verifyState(`${Buffer.from("someone-else").toString("base64url")}.${nonce}.${sig}`, "nonce-1"),
    ).toBeNull();
    expect(verifyState(undefined, "nonce-1")).toBeNull();
  });

  it("falls back to the client secret and fails cleanly with no secret at all", () => {
    configure();
    expect(verifyState(signState(ALEX, "n"), "n")).toBe(ALEX);
    unconfigure();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => signState(ALEX, "n")).toThrow(KrogerError);
  });
});

// ---------------------------------------------------------------- store
describe("store kroger connection", () => {
  it("saves, reads and deletes", async () => {
    expect(await store.getKrogerConnection(ALEX)).toBeNull();
    await store.saveKrogerConnection(ALEX, { locationId: "1", locationName: "Kroger", zip: "45202" });
    expect(await store.getKrogerConnection(ALEX)).toEqual({
      locationId: "1",
      locationName: "Kroger",
      zip: "45202",
    });
    await store.saveKrogerConnection(ALEX, {
      accessToken: "a",
      refreshToken: "r",
      expiresAt: "2030-01-01T00:00:00.000Z",
      locationId: "1",
    });
    expect((await store.getKrogerConnection(ALEX))?.accessToken).toBe("a");
    await store.deleteKrogerConnection(ALEX);
    expect(await store.getKrogerConnection(ALEX)).toBeNull();
    await expect(store.deleteKrogerConnection("nobody")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------- routes
describe("routes without credentials", () => {
  it("status is a clean 200 and the other routes answer { error, code }", async () => {
    fakeKroger();
    const status = await statusGet(req("/api/kroger/status"), ctx);
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ configured: false, connected: false, location: null });

    const unauth = await statusGet(req("/api/kroger/status", { cookie: null }), ctx);
    expect(unauth.status).toBe(401);

    const locations = await locationsGet(req("/api/kroger/locations?zip=45202"), ctx);
    expect(locations.status).toBe(503);
    expect(await locations.json()).toEqual({
      error: expect.stringContaining("not configured"),
      code: "kroger_not_configured",
    });

    const price = await pricePost(req("/api/kroger/price", { method: "POST" }), ctx);
    expect(price.status).toBe(503);
    expect(await price.json()).toMatchObject({ code: "kroger_not_configured" });

    const cart = await cartPost(req("/api/kroger/cart", { method: "POST" }), ctx);
    expect(cart.status).toBe(401);
    expect(await cart.json()).toMatchObject({ code: "kroger_not_connected" });

    const connect = await connectGet(req("/api/kroger/connect"), ctx);
    expect(connect.status).toBe(503);
    expect(await connect.json()).toMatchObject({ code: "kroger_not_configured" });

    const browser = await connectGet(req("/api/kroger/connect", { headers: { accept: "text/html" } }), ctx);
    expect(browser.status).toBe(302);
    expect(browser.headers.get("location")).toBe(
      "http://localhost/grocery?kroger=error&reason=kroger_not_configured",
    );
  });

  it("validates the zip and saves a store without tokens", async () => {
    const bad = await locationsGet(req("/api/kroger/locations?zip=abc"), ctx);
    expect(bad.status).toBe(400);
    const saved = await locationPost(
      req("/api/kroger/location", {
        method: "POST",
        body: { locationId: "01400943", name: "Kroger Hyde Park", zip: "45202" },
      }),
      ctx,
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      configured: false,
      connected: false,
      location: { id: "01400943", name: "Kroger Hyde Park" },
    });
    expect(await store.getKrogerConnection(ALEX)).toEqual({
      locationId: "01400943",
      locationName: "Kroger Hyde Park",
      zip: "45202",
    });
    const invalid = await locationPost(
      req("/api/kroger/location", { method: "POST", body: { locationId: "", name: "x" } }),
      ctx,
    );
    expect(invalid.status).toBe(400);
  });

  it("status reports KROGER_LOCATION_ID as the default store", async () => {
    process.env.KROGER_LOCATION_ID = "01400943";
    const status = await statusGet(req("/api/kroger/status"), ctx);
    expect(await status.json()).toEqual({
      configured: false,
      connected: false,
      location: { id: "01400943", name: "Kroger" },
    });
  });
});

describe("routes with credentials (fake Kroger)", () => {
  beforeEach(() => configure());

  it("lists stores near a zip", async () => {
    fakeKroger();
    const res = await locationsGet(req("/api/kroger/locations?zip=45202&limit=2"), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { locations: { id: string }[] };
    expect(body.locations.map((l) => l.id)).toEqual(["01400943", "01400376"]);
  });

  it("price needs a store and a plan, then returns the priced list", async () => {
    fakeKroger();
    const noStore = await pricePost(req("/api/kroger/price", { method: "POST" }), ctx);
    expect(noStore.status).toBe(400);
    expect(await noStore.json()).toMatchObject({ code: "kroger_no_location" });

    await locationPost(
      req("/api/kroger/location", {
        method: "POST",
        body: { locationId: "01400943", name: "Kroger Hyde Park" },
      }),
      ctx,
    );
    const noPlan = await pricePost(req("/api/kroger/price", { method: "POST" }), ctx);
    expect(noPlan.status).toBe(404);

    await store.savePlan(planFor(ALEX));
    const res = await pricePost(req("/api/kroger/price", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matched: number;
      totalUsd: number;
      unmatched: string[];
      items: unknown[];
    };
    expect(body.matched).toBe(3);
    expect(body.totalUsd).toBe(37.44);
    expect(body.items).toHaveLength(4);
  });

  it("connect redirects to Kroger with a signed state and a nonce cookie; callback stores the tokens", async () => {
    fakeKroger();
    const res = await connectGet(req("/api/kroger/connect"), ctx);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(`${BASE}/connect/oauth2/authorize`);
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("scope")).toBe("cart.basic:write profile.compact");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/kroger/callback");
    const state = location.searchParams.get("state")!;
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${STATE_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    const nonce = /np_kroger_state=([^;]+)/.exec(setCookie)![1];
    expect(verifyState(state, nonce)).toBe(ALEX);

    // wrong nonce -> error redirect, nothing stored
    const bad = await callbackGet(
      req(`/api/kroger/callback?code=abc&state=${encodeURIComponent(state)}`, {
        cookie: `${ALEX_COOKIE}; ${STATE_COOKIE}=other`,
      }),
      ctx,
    );
    expect(bad.headers.get("location")).toBe("http://localhost/grocery?kroger=error&reason=kroger_bad_state");
    expect(await store.getKrogerConnection(ALEX)).toBeNull();

    // user denied at Kroger
    const denied = await callbackGet(
      req(`/api/kroger/callback?error=access_denied&state=x`, {
        cookie: `${ALEX_COOKIE}; ${STATE_COOKIE}=${nonce}`,
      }),
      ctx,
    );
    expect(denied.headers.get("location")).toContain("kroger=error&reason=access_denied");

    // happy path
    const ok = await callbackGet(
      req(`/api/kroger/callback?code=abc&state=${encodeURIComponent(state)}`, {
        cookie: `${ALEX_COOKIE}; ${STATE_COOKIE}=${nonce}`,
      }),
      ctx,
    );
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("http://localhost/grocery?kroger=connected");
    const conn = await store.getKrogerConnection(ALEX);
    expect(conn).toMatchObject({
      accessToken: "tok-authorization_code",
      refreshToken: "ref-authorization_code",
    });
    expect(Date.parse(conn!.expiresAt!)).toBeGreaterThan(Date.now());
    const status = await statusGet(req("/api/kroger/status"), ctx);
    expect(await status.json()).toMatchObject({ configured: true, connected: true });
  });

  it("cart sends the matched grocery list, refreshes expired tokens and disconnect keeps the store", async () => {
    const api = fakeKroger();
    await store.savePlan(planFor(ALEX));
    await store.saveKrogerConnection(ALEX, {
      accessToken: "stale",
      refreshToken: "ref-old",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      locationId: "01400943",
      locationName: "Kroger Hyde Park",
    });
    const res = await cartPost(req("/api/kroger/cart", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 3, skipped: ["Cactus paddles, cooked"] });
    const cartCall = api.calls.find((c) => c.url.endsWith("/cart/add"))!;
    expect(cartCall.method).toBe("PUT");
    expect(cartCall.auth).toBe("Bearer tok-refresh_token");
    expect(JSON.parse(cartCall.body!)).toEqual({
      items: [
        { upc: "0001111000002", quantity: 3, modality: "PICKUP" },
        { upc: "0001111000012", quantity: 2, modality: "PICKUP" },
        { upc: "0001111000021", quantity: 1, modality: "PICKUP" },
      ],
    });
    expect((await store.getKrogerConnection(ALEX))?.accessToken).toBe("tok-refresh_token");

    // explicit items skip pricing
    const explicit = await cartPost(
      req("/api/kroger/cart", {
        method: "POST",
        body: { items: [{ upc: "0001111041700", quantity: 3 }], modality: "DELIVERY" },
      }),
      ctx,
    );
    expect(await explicit.json()).toEqual({ added: 1, skipped: [] });
    expect(JSON.parse(api.calls.at(-1)!.body!)).toEqual({
      items: [{ upc: "0001111041700", quantity: 3, modality: "DELIVERY" }],
    });
    const invalid = await cartPost(
      req("/api/kroger/cart", { method: "POST", body: { items: [{ upc: "x", quantity: 1 }] } }),
      ctx,
    );
    expect(invalid.status).toBe(400);

    const off = await connectDelete(req("/api/kroger/connect", { method: "DELETE" }), ctx);
    expect(await off.json()).toEqual({
      configured: true,
      connected: false,
      location: { id: "01400943", name: "Kroger Hyde Park" },
    });
    expect(await store.getKrogerConnection(ALEX)).toEqual({
      locationId: "01400943",
      locationName: "Kroger Hyde Park",
      zip: undefined,
    });
  });

  it("cart reports a failed refresh as not connected and clears the dead tokens", async () => {
    fakeKroger({ tokenStatus: 401 });
    await store.saveKrogerConnection(ALEX, {
      accessToken: "stale",
      refreshToken: "dead",
      expiresAt: "2020-01-01T00:00:00.000Z",
      locationId: "1",
    });
    const res = await cartPost(req("/api/kroger/cart", { method: "POST" }), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "kroger_not_connected" });
    expect((await store.getKrogerConnection(ALEX))?.accessToken).toBeUndefined();
  });
});
