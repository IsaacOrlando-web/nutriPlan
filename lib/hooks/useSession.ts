"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: () => api.auth.session() });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api.auth.login(input.email, input.password),
    onSuccess: () => qc.clear(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => qc.clear(),
  });
}
