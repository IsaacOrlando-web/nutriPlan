"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";

export function useSummary(date?: string) {
  return useQuery({ queryKey: keys.summary(date), queryFn: () => api.summary.get(date) });
}
