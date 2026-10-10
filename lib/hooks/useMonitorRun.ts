"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useInvalidateHealthData } from "./useLogs";

export function useMonitorRun() {
  const invalidate = useInvalidateHealthData();
  return useMutation({
    mutationFn: () => api.monitor.run(),
    onSuccess: invalidate,
  });
}
