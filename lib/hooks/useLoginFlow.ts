"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, USE_MOCKS } from "@/lib/api";
import { clearCookie, setCookie } from "@/lib/utils";

export const SESSION_COOKIE = "np_uid";

/** Logs in through lib/api.ts and, in mock mode, sets the same cookie middleware expects from the real backend. */
export function useLoginFlow(redirectTo = "/") {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const login = async (identifier: string) => {
    setPending(identifier);
    setError(null);
    try {
      const session = await api.auth.login(identifier);
      if (USE_MOCKS) setCookie(SESSION_COOKIE, `mock-${session.userId ?? "alex"}`);
      qc.clear();
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(null);
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } finally {
      clearCookie(SESSION_COOKIE);
      qc.clear();
      router.push("/welcome");
      router.refresh();
    }
  };

  return { login, logout, pending, error };
}
