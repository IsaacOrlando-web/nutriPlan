"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateLogRequest } from "@/types/contracts";
import { keys } from "./keys";

export function useFoodLogs(date?: string) {
  return useQuery({ queryKey: keys.logs(date), queryFn: () => api.log.list(date) });
}

/** Invalidate everything a new log or reading can change. */
export function useInvalidateHealthData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.summaryRoot });
    void qc.invalidateQueries({ queryKey: keys.readingsRoot });
    void qc.invalidateQueries({ queryKey: keys.trendRoot });
    void qc.invalidateQueries({ queryKey: keys.logsRoot });
    void qc.invalidateQueries({ queryKey: keys.plan });
  };
}

export function useCreateLog() {
  const invalidate = useInvalidateHealthData();
  return useMutation({
    mutationFn: (body: CreateLogRequest) => api.log.create(body),
    onSuccess: invalidate,
  });
}

export function useUploadPhoto() {
  return useMutation({ mutationFn: (file: File) => api.log.upload(file) });
}

export function usePhotoLog() {
  const invalidate = useInvalidateHealthData();
  return useMutation({
    mutationFn: ({ photoUrl, eatenAt }: { photoUrl: string; eatenAt?: string }) => api.log.photo(photoUrl, eatenAt),
    onSuccess: (result) => {
      if (result.logged) invalidate();
    },
  });
}
