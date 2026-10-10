"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";

export function useFoodSearch(q: string, limit = 20) {
  const query = q.trim();
  return useQuery({
    queryKey: keys.foodSearch(query),
    queryFn: () => api.foods.search(query, limit),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
}
