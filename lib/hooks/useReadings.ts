"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateReadingRequest, ReadingType } from "@/types/contracts";
import { keys } from "./keys";
import { useInvalidateHealthData } from "./useLogs";

export function useReadings(type?: ReadingType) {
  return useQuery({ queryKey: keys.readings(type), queryFn: () => api.readings.list(type) });
}

export function useCreateReading() {
  const invalidate = useInvalidateHealthData();
  return useMutation({
    mutationFn: (body: CreateReadingRequest) => api.readings.create(body),
    onSuccess: invalidate,
  });
}

export function useTrend(type: ReadingType, enabled = true) {
  return useQuery({ queryKey: keys.trend(type), queryFn: () => api.trends.get(type), enabled });
}
