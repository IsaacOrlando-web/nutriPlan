// In-process LRU for budget curves. Owner: Math.
//
// This is the one allowed exception to "no state in /math": a cache with no I/O. It keeps the last 20
// curves (with their per-budget plans) so the budget slider answers instantly after the first request.
// Keys are a stable hash of everything the solve depends on; see `curveCacheKey`.
import type { BudgetCurve } from "./curve";

export const CURVE_CACHE_MAX = 20;

const cache = new Map<string, BudgetCurve>();
const inflight = new Map<string, Promise<BudgetCurve>>();

/** JSON with object keys sorted at every level, so equal inputs hash equal regardless of key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** FNV-1a over the string, two lanes, as 16 hex characters. Deterministic across processes. */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export interface CurveKeyParts {
  userId: string;
  /** Candidate ids after allergy filtering (order does not matter). */
  candidateIds: string[];
  constraints: unknown;
  targets: unknown;
  mealsPerDay: number;
  concessions: unknown;
}

/** Stable key for a curve: same user, pool, rules, targets and concessions give the same key. */
export function curveCacheKey(parts: CurveKeyParts): string {
  return stableHash(
    stableStringify({
      v: 1,
      userId: parts.userId,
      candidateIds: [...parts.candidateIds].sort(),
      constraints: parts.constraints,
      targets: parts.targets,
      mealsPerDay: parts.mealsPerDay,
      concessions: parts.concessions,
    }),
  );
}

export function getCachedCurve(key: string): BudgetCurve | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // move to most recently used
    cache.set(key, hit);
  }
  return hit;
}

export function setCachedCurve(key: string, curve: BudgetCurve): void {
  cache.delete(key);
  cache.set(key, curve);
  while (cache.size > CURVE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Returns the cached curve or computes it once, sharing the in-flight promise with concurrent callers
 * (a slider dragged during the first solve must not start a second solve).
 */
export async function getOrComputeCurve(
  key: string,
  compute: () => Promise<BudgetCurve>,
): Promise<BudgetCurve> {
  const hit = getCachedCurve(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = compute()
    .then((curve) => {
      setCachedCurve(key, curve);
      return curve;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function clearCurveCache(): void {
  cache.clear();
  inflight.clear();
}

export function curveCacheSize(): number {
  return cache.size;
}
