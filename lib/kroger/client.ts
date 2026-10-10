// Kroger Public API client (https://developer.kroger.com/documentation). Owner: Backend.
// Uses fetch only. Every failure becomes a KrogerError { status, code, message } with no secrets in the message.
// KROGER_API_BASE overrides the base URL so a mock server can stand in during tests and demos.
import type { KrogerLocation, KrogerProduct, KrogerTokens } from "./types";

export type KrogerErrorCode =
  | "kroger_not_configured"
  | "kroger_not_connected"
  | "kroger_auth_failed"
  | "kroger_timeout"
  | "kroger_upstream"
  | "kroger_bad_state"
  | "kroger_no_location";

export class KrogerError extends Error {
  constructor(
    public status: number,
    public code: KrogerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KrogerError";
  }
}

const DEFAULT_BASE = "https://api.kroger.com/v1";
const TIMEOUT_MS = 10_000;
const PRODUCT_SCOPE = "product.compact";
export const USER_SCOPES = "cart.basic:write profile.compact";

export function apiBase(): string {
  return (process.env.KROGER_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

function credentials(): { id: string; secret: string } | null {
  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/** true when a client id and secret exist (enough for product and location search). */
export function isKrogerConfigured(): boolean {
  return credentials() !== null;
}

export function redirectUri(): string {
  const uri = process.env.KROGER_REDIRECT_URI;
  if (!uri)
    throw new KrogerError(
      503,
      "kroger_not_configured",
      "Kroger is not configured (KROGER_REDIRECT_URI missing)",
    );
  return uri;
}

function requireCredentials(): { id: string; secret: string } {
  const c = credentials();
  if (!c) {
    throw new KrogerError(
      503,
      "kroger_not_configured",
      "Kroger is not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.",
    );
  }
  return c;
}

function basicAuth(): string {
  const { id, secret } = requireCredentials();
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

// ---------------------------------------------------------------- low level fetch
interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

async function krogerFetch(url: string, opts: FetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError")
      throw new KrogerError(504, "kroger_timeout", "Kroger did not answer within 10 seconds");
    throw new KrogerError(502, "kroger_upstream", "Could not reach Kroger");
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the upstream error body for a short reason. Never echoes tokens or credentials. */
async function upstreamError(res: Response, what: string): Promise<KrogerError> {
  let reason = "";
  try {
    const body = (await res.json()) as {
      error?: unknown;
      error_description?: unknown;
      errors?: { reason?: unknown };
    };
    const candidate = body.error_description ?? body.errors?.reason ?? body.error;
    if (typeof candidate === "string") reason = candidate.slice(0, 160);
  } catch {
    // non JSON body: keep the generic message
  }
  const suffix = reason ? `: ${reason}` : "";
  if (res.status === 401 || res.status === 403)
    return new KrogerError(401, "kroger_auth_failed", `Kroger rejected ${what}${suffix}`);
  if (res.status === 429)
    return new KrogerError(429, "kroger_upstream", "Kroger rate limit reached (10,000 calls per day)");
  return new KrogerError(502, "kroger_upstream", `Kroger ${what} failed (${res.status})${suffix}`);
}

async function readJson<T>(res: Response, what: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new KrogerError(502, "kroger_upstream", `Kroger ${what} returned an unreadable body`);
  }
}

// ---------------------------------------------------------------- tokens
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

async function tokenRequest(params: Record<string, string>, what: string): Promise<KrogerTokens> {
  const res = await krogerFetch(`${apiBase()}/connect/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw await upstreamError(res, what);
  const body = await readJson<TokenResponse>(res, what);
  if (!body.access_token) throw new KrogerError(502, "kroger_upstream", `Kroger ${what} returned no token`);
  const ttl = Number.isFinite(body.expires_in) ? body.expires_in : 1800;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

interface AppTokenCache {
  token: string;
  expiresAtMs: number;
  base: string;
}
const globalRef = globalThis as unknown as { __krogerAppToken?: AppTokenCache | null };

/** Client credentials token for product and location search; cached in-process until a minute before expiry. */
export async function getAppToken(): Promise<string> {
  const cached = globalRef.__krogerAppToken;
  if (cached && cached.base === apiBase() && cached.expiresAtMs - 60_000 > Date.now()) return cached.token;
  const tokens = await tokenRequest({ grant_type: "client_credentials", scope: PRODUCT_SCOPE }, "app token");
  globalRef.__krogerAppToken = {
    token: tokens.accessToken,
    expiresAtMs: Date.parse(tokens.expiresAt),
    base: apiBase(),
  };
  return tokens.accessToken;
}

/** Tests only: drop the cached app token. */
export function resetAppTokenCache(): void {
  globalRef.__krogerAppToken = null;
}

/** Where to send the browser to approve cart access. */
export function authorizeUrl(state: string): string {
  const { id } = requireCredentials();
  const q = new URLSearchParams({
    scope: USER_SCOPES,
    response_type: "code",
    client_id: id,
    redirect_uri: redirectUri(),
    state,
  });
  return `${apiBase()}/connect/oauth2/authorize?${q.toString()}`;
}

export function exchangeCode(code: string): Promise<KrogerTokens> {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri() },
    "code exchange",
  );
}

export function refreshToken(refresh: string): Promise<KrogerTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refresh }, "token refresh");
}

// ---------------------------------------------------------------- locations
interface RawLocation {
  locationId?: string;
  name?: string;
  chain?: string;
  address?: { addressLine1?: string; city?: string; state?: string; zipCode?: string };
}

export async function searchLocations(
  zip: string,
  opts: { limit?: number; chain?: string } = {},
): Promise<KrogerLocation[]> {
  const token = await getAppToken();
  const limit = opts.limit ?? 5;
  // Ask for extra rows: Kroger lists internal fulfillment nodes ("Spoke Forecast", "Unused Spoke") next to stores.
  const q = new URLSearchParams({ "filter.zipCode.near": zip, "filter.limit": String(limit * 2) });
  if (opts.chain) q.set("filter.chain", opts.chain);
  const res = await krogerFetch(`${apiBase()}/locations?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw await upstreamError(res, "location search");
  const body = await readJson<{ data?: RawLocation[] }>(res, "location search");
  return (body.data ?? [])
    .filter((l) => l.locationId && !isInternalNode(l.name))
    .slice(0, limit)
    .map((l) => {
      const a = l.address ?? {};
      const address = [a.addressLine1, [a.city, a.state].filter(Boolean).join(", "), a.zipCode]
        .filter(Boolean)
        .join(", ");
      return { id: String(l.locationId), name: l.name ?? l.chain ?? "Kroger", address };
    });
}

/** Kroger's locations feed includes warehouse and forecasting nodes nobody can shop at. */
export function isInternalNode(name: string | undefined): boolean {
  return /\b(spoke|forecast|unused|shed|trans|fulfillment|warehouse|hub|delivery center)\b/i.test(name ?? "");
}

// ---------------------------------------------------------------- products
export interface RawProduct {
  productId?: string;
  upc?: string;
  description?: string;
  brand?: string;
  images?: { perspective?: string; sizes?: { size?: string; url?: string }[] }[];
  items?: {
    size?: string;
    price?: { regular?: number; promo?: number };
    fulfillment?: { inStore?: boolean; curbside?: boolean; delivery?: boolean; shipToHome?: boolean };
  }[];
}

export function normalizeProduct(raw: RawProduct): KrogerProduct | null {
  if (!raw.productId || !raw.description) return null;
  const item = raw.items?.[0];
  const price = item?.price;
  const front = raw.images?.find((i) => i.perspective === "front") ?? raw.images?.[0];
  const imageUrl = front?.sizes?.find((s) => s.size === "medium")?.url ?? front?.sizes?.[0]?.url;
  const regular = typeof price?.regular === "number" && price.regular > 0 ? price.regular : undefined;
  const promo = typeof price?.promo === "number" && price.promo > 0 ? price.promo : undefined;
  return {
    productId: String(raw.productId),
    upc: String(raw.upc ?? raw.productId),
    description: raw.description,
    brand: raw.brand || undefined,
    size: item?.size || undefined,
    price: regular !== undefined || promo !== undefined ? { regular, promo } : undefined,
    inStore: item?.fulfillment?.inStore,
    imageUrl,
  };
}

export async function searchProducts(term: string, locationId: string, limit = 5): Promise<KrogerProduct[]> {
  const token = await getAppToken();
  const q = new URLSearchParams({
    "filter.term": term,
    "filter.locationId": locationId,
    "filter.limit": String(Math.min(Math.max(limit, 1), 50)),
    "filter.fulfillment": "ais",
  });
  const res = await krogerFetch(`${apiBase()}/products?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw await upstreamError(res, "product search");
  const body = await readJson<{ data?: RawProduct[] }>(res, "product search");
  return (body.data ?? []).map(normalizeProduct).filter((p): p is KrogerProduct => p !== null);
}

// ---------------------------------------------------------------- cart
export interface CartItem {
  upc: string;
  quantity: number;
  modality?: "PICKUP" | "DELIVERY";
}

/** PUT /cart/add with the user's token. Kroger answers 204 on success. */
export async function addToCart(userAccessToken: string, items: CartItem[]): Promise<void> {
  if (items.length === 0) return;
  const res = await krogerFetch(`${apiBase()}/cart/add`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      items: items.map((i) => ({
        upc: i.upc,
        quantity: Math.max(1, Math.round(i.quantity)),
        modality: i.modality ?? "PICKUP",
      })),
    }),
  });
  if (!res.ok) throw await upstreamError(res, "cart add");
}
