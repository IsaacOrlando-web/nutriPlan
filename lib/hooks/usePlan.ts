"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GeneratePlanRequest } from "@/types/contracts";
import { keys } from "./keys";

export function usePlan() {
  return useQuery({ queryKey: keys.plan, queryFn: () => api.plan.current() });
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
