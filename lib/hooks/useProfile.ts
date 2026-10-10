"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiRequestError } from "@/lib/api";
import type { ProfileBundle, SessionInfo, UserProfile } from "@/types/contracts";
import { keys } from "./keys";

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: keys.profile,
    queryFn: () => api.profile.get(),
    enabled,
    retry: (failureCount, error) => !isApiRequestError(error, 404) && failureCount < 1,
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<UserProfile, "userId">) => api.profile.save(input),
    onSuccess: (bundle: ProfileBundle) => {
      qc.setQueryData(keys.profile, bundle);
      qc.setQueryData(keys.session, (session: SessionInfo | undefined) =>
        session ? { ...session, hasProfile: true } : session,
      );
      void qc.invalidateQueries({ queryKey: keys.summaryRoot });
    },
  });
}
