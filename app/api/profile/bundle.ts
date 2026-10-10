// Profile bundle helpers shared by the backend routes. Owner: Backend.
// Doctor's deterministic rule engine (buildConstraints) and Math (calculateTargets) run here so that
// demo users (seeded with a profile only) get constraints and targets lazily without onboarding.
import type { DailyTargets, MealTotals, ProfileBundle, UserProfile } from "@/types/contracts";
import type { Store } from "@/lib/db";
import { buildConstraints } from "@/agents/rules/engine";
import { calculateTargets, emptyTotals } from "@/math";

/** Builds constraints and targets for a profile, saves everything and returns the bundle. */
export async function rebuildBundle(store: Store, profile: UserProfile): Promise<ProfileBundle> {
  const constraints = buildConstraints(profile);
  const posterior = await store.getTdeePosterior(profile.userId);
  const targets = calculateTargets(profile, constraints, posterior ?? undefined);
  await store.saveProfile(profile);
  await store.saveConstraints(profile.userId, constraints);
  await store.saveTargets(profile.userId, targets);
  return { profile, constraints, targets };
}

/** Returns the saved bundle, filling in missing constraints/targets for users seeded with a profile only. */
export async function getBundle(store: Store, userId: string): Promise<ProfileBundle | null> {
  const profile = await store.getProfile(userId);
  if (!profile) return null;
  const [constraints, targets] = await Promise.all([store.getConstraints(userId), store.getTargets(userId)]);
  if (constraints && targets) return { profile, constraints, targets };
  return rebuildBundle(store, profile);
}

/** DailyTargets as MealTotals so they can be subtracted from what was eaten. */
export function targetsAsTotals(t: DailyTargets): MealTotals {
  const out = emptyTotals();
  out.calories = t.calories;
  out.proteinG = t.proteinG;
  out.carbsG = t.carbsG;
  out.fatG = t.fatG;
  out.fiberG = t.fiberG;
  out.sodiumMg = t.sodiumMg;
  out.potassiumMg = t.potassiumMg;
  return out;
}

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
