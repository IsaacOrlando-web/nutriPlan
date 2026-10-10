// Store helpers for agents. Owner: Agents. Everything goes through getStore(), never an implementation.
import type { DailyTargets, Food, MedicalConstraints, UserProfile } from "@/types/contracts";
import { getStore } from "@/lib/db";
import type { Store } from "@/lib/db/store";
import { buildConstraints } from "@/agents/rules/engine";
import { calculateTargets } from "@/math/targets";

export { getStore };

export interface UserBundle {
  profile: UserProfile;
  constraints: MedicalConstraints;
  targets: DailyTargets;
  tdee: { mean: number; sd: number } | null;
}

/** Loads the profile bundle, building and saving constraints and targets when they are missing. */
export async function loadUserBundle(store: Store, userId: string): Promise<UserBundle> {
  const profile = await store.getProfile(userId);
  if (!profile) throw new Error("Profile not found. Complete onboarding first.");
  let constraints = await store.getConstraints(userId);
  if (!constraints) {
    constraints = buildConstraints(profile);
    await store.saveConstraints(userId, constraints);
  }
  const tdee = await store.getTdeePosterior(userId);
  let targets = await store.getTargets(userId);
  if (!targets) {
    targets = calculateTargets(profile, constraints, tdee ?? undefined);
    await store.saveTargets(userId, targets);
  }
  return { profile, constraints, targets, tdee };
}

export async function loadFoodsMap(store: Store): Promise<Record<string, Food>> {
  const all = await store.getAllFoods();
  return Object.fromEntries(all.map((f) => [f.foodId, f]));
}

/** Maps a free text ingredient name to the best matching safe food, or null. */
export async function mapQueryToFood(store: Store, query: string, excludeTags: string[] = []): Promise<Food | null> {
  const q = query.trim();
  if (!q) return null;
  const hits = await store.searchFoods(q, { limit: 3, excludeTags });
  return hits[0] ?? null;
}

export async function nextPlanVersion(store: Store, userId: string): Promise<number> {
  const current = await store.getCurrentPlan(userId);
  return (current?.version ?? 0) + 1;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfTodayIso(): string {
  return `${todayIso()}T00:00:00.000Z`;
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
