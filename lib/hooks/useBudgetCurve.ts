"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";
import type { BudgetCurveResponse } from "@/types/contracts";
import { keys } from "./keys";

/** The curve is expensive to compute (tens of seconds cold) and only changes with the plan, so keep it warm. */
export const CURVE_STALE_MS = 10 * 60 * 1000;

/** The budget tradeoff curve (feature 7). `refresh()` recomputes server side and replaces the cached curve. */
export function useBudgetCurve() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.curve,
    queryFn: () => api.plan.curve(),
    staleTime: CURVE_STALE_MS,
    retry: 1,
  });
  const refresh = useCallback(
    () =>
      qc.fetchQuery({
        queryKey: keys.curve,
        queryFn: () => api.plan.curve({ refresh: true }),
        staleTime: 0,
      }),
    [qc],
  );
  return { ...query, refresh };
}

/** The 7 days the optimizer builds at one budget on the curve. Only runs once a budget is set. */
export function useCurvePlanAt(budget: number | null) {
  return useQuery({
    queryKey: keys.curvePlanAt(budget ?? -1),
    queryFn: () => api.plan.curve({ budget: budget ?? undefined }),
    enabled: budget !== null,
    staleTime: CURVE_STALE_MS,
    retry: 1,
    placeholderData: keepPreviousData,
    select: (res: BudgetCurveResponse) => res.planAt ?? [],
  });
}

/** Warms the curve cache without rendering anything (Plan page mount, Agent Room "plan ready"). */
export function usePrefetchBudgetCurve() {
  const qc = useQueryClient();
  return useCallback(
    (opts: { invalidate?: boolean } = {}) => {
      if (opts.invalidate) {
        void qc.invalidateQueries({ queryKey: keys.curve, refetchType: "none" });
      }
      void qc.prefetchQuery({ queryKey: keys.curve, queryFn: () => api.plan.curve(), staleTime: CURVE_STALE_MS, retry: 1 });
    },
    [qc],
  );
}
