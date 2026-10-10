"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/utils";
import type {
  GenerateWeekRequest,
  PlannerSettingsResponse,
  ReplaceRecipeRequest,
  UpdateWeekStateRequest,
  WeekPlanResponse,
  WeeklyMealPlan,
} from "@/types/contracts";
import { keys } from "./keys";

/** Monday (YYYY-MM-DD) of the week that contains `iso`. The planner keys every week by its Monday. */
export function mondayOf(iso: string = todayIso()): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Planner preferences; the /plan screen reads the shopping day from here. */
export function usePlannerSettings() {
  return useQuery({ queryKey: keys.plannerSettings, queryFn: () => api.planner.settings() });
}

/** Saves the grocery weekday (0 = Monday ... 6 = Sunday, null clears it). Optimistic, rolls back on error. */
export function useSaveShoppingDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shoppingWeekday: number | null) => {
      const current =
        qc.getQueryData<PlannerSettingsResponse>(keys.plannerSettings) ?? (await api.planner.settings());
      return api.planner.savePreferences({ ...current.preferences, shoppingWeekday });
    },
    onMutate: async (shoppingWeekday) => {
      await qc.cancelQueries({ queryKey: keys.plannerSettings });
      const prev = qc.getQueryData<PlannerSettingsResponse>(keys.plannerSettings);
      if (prev)
        qc.setQueryData<PlannerSettingsResponse>(keys.plannerSettings, {
          ...prev,
          preferences: { ...prev.preferences, shoppingWeekday },
        });
      return { prev };
    },
    onError: (_err, _day, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.plannerSettings, ctx.prev);
    },
    onSuccess: (settings) => qc.setQueryData(keys.plannerSettings, settings),
  });
}

/** Dish titles of every saved day in a YYYY-MM month, for the calendar in the corner of /plan. */
export function usePlannerMonth(month: string) {
  return useQuery({
    queryKey: keys.plannerMonth(month),
    queryFn: () => api.planner.month(month),
    placeholderData: (prev) => prev,
  });
}

/** Saved recipe week (plan is null until the first generation). */
export function useWeekPlan(weekStart: string) {
  return useQuery({ queryKey: keys.plannerWeek(weekStart), queryFn: () => api.planner.week(weekStart) });
}

function useStoreWeek() {
  const qc = useQueryClient();
  return (plan: WeeklyMealPlan) => {
    qc.setQueryData<WeekPlanResponse>(keys.plannerWeek(plan.weekStartDate), (prev) => ({
      plan,
      state: prev?.state ?? {
        completed: {},
        shopping: { checked: {}, quantityOverrides: {}, removed: [], customItems: [] },
      },
    }));
    // The month calendar lists dish titles, so any saved week can change it.
    void qc.invalidateQueries({ queryKey: keys.plannerMonthRoot });
  };
}

/** Writes 21 new recipes for the week. The previous plan stays on screen (and on the server) if it fails. */
export function useGenerateWeek() {
  const storeWeek = useStoreWeek();
  return useMutation({
    mutationFn: (body: GenerateWeekRequest) => api.planner.generateWeek(body),
    onSuccess: ({ plan }) => storeWeek(plan),
  });
}

/** Swaps one recipe for another of the same meal type; no other meal changes. */
export function useReplaceRecipe() {
  const storeWeek = useStoreWeek();
  return useMutation({
    mutationFn: (body: ReplaceRecipeRequest) => api.planner.replaceRecipe(body),
    onSuccess: ({ plan }) => storeWeek(plan),
  });
}

/**
 * Reruns the agent negotiation and waits for it to finish, then refreshes everything built from the optimizer
 * plan: grocery list, weekly cost, "What would change" (shadow prices) and the budget tradeoff curve.
 */
export function useRegenerateAgentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { runId } = await api.plan.generate({});
      await new Promise<void>((resolve, reject) => {
        const stop = api.agents.subscribe(
          runId,
          () => undefined,
          () => {
            stop();
            resolve();
          },
          (err) => {
            stop();
            reject(err);
          },
        );
      });
      return runId;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.plan, exact: true });
      // The curve only changes with the plan, so recompute it server side now instead of serving the cached one.
      await qc.fetchQuery({
        queryKey: keys.curve,
        queryFn: () => api.plan.curve({ refresh: true }),
        staleTime: 0,
      });
    },
  });
}

/** Saves grocery ticks (and completed meals). Optimistic: the list updates at once and rolls back on error. */
export function useUpdateWeekState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWeekStateRequest) => api.planner.updateState(body),
    onMutate: async (body) => {
      const key = keys.plannerWeek(body.weekStartDate);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlanResponse>(key);
      if (prev)
        qc.setQueryData<WeekPlanResponse>(key, {
          ...prev,
          state: {
            completed: { ...prev.state.completed, ...body.completed },
            shopping: body.shopping ?? prev.state.shopping,
          },
        });
      return { prev };
    },
    onError: (_err, body, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.plannerWeek(body.weekStartDate), ctx.prev);
    },
    onSuccess: (state, body) =>
      qc.setQueryData<WeekPlanResponse>(keys.plannerWeek(body.weekStartDate), (prev) =>
        prev ? { ...prev, state } : prev,
      ),
  });
}
