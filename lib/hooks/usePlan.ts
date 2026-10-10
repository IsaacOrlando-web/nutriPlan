"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import type { GeneratePlanRequest } from "@/types/contracts";
import { keys } from "./keys";

/** Current plan, or null when the user has not built one yet (404 is an empty state, not an error). */
export function usePlan() {
  return useQuery({
    queryKey: keys.plan,
    queryFn: async () => {
      try {
        return await api.plan.current();
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) return null;
        throw err;
      }
    },
    retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
  });
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GeneratePlanRequest = {}) => api.plan.generate(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.plan });
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export function useRateMeal() {
  return useMutation({
    mutationFn: ({ mealName, liked }: { mealName: string; liked: boolean }) => api.plan.rate(mealName, liked),
  });
}
