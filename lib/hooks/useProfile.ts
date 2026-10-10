"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProfileBundle, UserProfile } from "@/types/contracts";
import { keys } from "./keys";

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => api.profile.get() });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UserProfile, "userId">) => api.profile.save(input),
    onSuccess: (bundle: ProfileBundle) => {
      qc.setQueryData(keys.profile, bundle);
      void qc.invalidateQueries({ queryKey: keys.summaryRoot });
    },
  });
}
