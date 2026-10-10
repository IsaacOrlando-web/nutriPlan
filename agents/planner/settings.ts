// Planner settings, favorites and per week state (completed meals, shopping edits). Owner: Agents.
// Thin store helpers so routes stay small; allergies, restrictions and dislikes are read from the profile and are
// never stored or edited here.
import type {
  PlannerMonthResponse,
  PlannerPreferences,
  PlannerSettings,
  PlannerSettingsResponse,
  PlannerWeekState,
  Recipe,
  UpdateWeekStateRequest,
  WeekPlanResponse,
} from "@/types/contracts";
import type { Store } from "@/lib/db/store";
import { emptyShoppingState } from "@/math/shopping";
import { buildMonthSchedule, monthWeekRange } from "@/lib/planner/month";
import { loadUserBundle } from "../tools/backend";
import { defaultSettings } from "./index";

export const MAX_FAVORITES = 100;

export function emptyWeekState(): PlannerWeekState {
  return { completed: {}, shopping: emptyShoppingState() };
}

async function settingsFor(store: Store, userId: string): Promise<PlannerSettings> {
  const stored = await store.getPlannerSettings(userId);
  // Settings saved before the shopping day existed have no `shoppingWeekday`.
  if (stored)
    return {
      ...stored,
      preferences: { ...stored.preferences, shoppingWeekday: stored.preferences.shoppingWeekday ?? null },
    };
  const profile = await store.getProfile(userId);
  return defaultSettings(profile ?? { language: "en" });
}

export async function getPlannerSettingsResponse(
  store: Store,
  userId: string,
): Promise<PlannerSettingsResponse> {
  const { profile, constraints } = await loadUserBundle(store, userId);
  const settings = await settingsFor(store, userId);
  return {
    ...settings,
    locked: {
      allergies: profile.allergies,
      restrictions: profile.restrictions,
      dislikes: profile.dislikes,
      excludedFoodTags: constraints.excludedFoodTags,
      weeklyBudgetUsd: profile.weeklyBudgetUsd,
    },
  };
}

export async function savePlannerPreferences(
  store: Store,
  userId: string,
  preferences: PlannerPreferences,
): Promise<PlannerSettingsResponse> {
  const settings = await settingsFor(store, userId);
  await store.savePlannerSettings(userId, { ...settings, preferences });
  return getPlannerSettingsResponse(store, userId);
}

export async function setSelectedWeek(store: Store, userId: string, weekStartDate: string): Promise<void> {
  const settings = await settingsFor(store, userId);
  if (settings.selectedWeek === weekStartDate) return;
  await store.savePlannerSettings(userId, { ...settings, selectedWeek: weekStartDate });
}

/** Adds or removes a favorite by recipe id. Favorites keep the full recipe so they survive plan changes. */
export async function setFavorite(
  store: Store,
  userId: string,
  recipe: Recipe,
  favorite: boolean,
): Promise<Recipe[]> {
  const settings = await settingsFor(store, userId);
  const others = settings.favorites.filter((r) => r.id !== recipe.id);
  const favorites = favorite ? [recipe, ...others].slice(0, MAX_FAVORITES) : others;
  await store.savePlannerSettings(userId, { ...settings, favorites });
  return favorites;
}

export async function getWeek(
  store: Store,
  userId: string,
  weekStartDate: string,
): Promise<WeekPlanResponse> {
  const rec = await store.getPlannerWeek(userId, weekStartDate);
  return { plan: rec?.plan ?? null, state: rec?.state ?? emptyWeekState() };
}

/** Dish titles of every saved day in a YYYY-MM month, for the planner calendar. */
export async function getMonthSchedule(
  store: Store,
  userId: string,
  month: string,
): Promise<PlannerMonthResponse> {
  const { fromWeek, toWeek } = monthWeekRange(month);
  const plans = await store.listPlannerWeekPlans(userId, fromWeek, toWeek);
  return buildMonthSchedule(month, plans);
}

/** Merges completed flags and replaces the shopping state when given. */
export async function updateWeekState(
  store: Store,
  userId: string,
  req: UpdateWeekStateRequest,
): Promise<PlannerWeekState> {
  const rec = await store.getPlannerWeek(userId, req.weekStartDate);
  const prev = rec?.state ?? emptyWeekState();
  const next: PlannerWeekState = {
    completed: req.completed ? { ...prev.completed, ...req.completed } : prev.completed,
    shopping: req.shopping ?? prev.shopping,
  };
  await store.savePlannerWeekState(userId, req.weekStartDate, next);
  return next;
}
