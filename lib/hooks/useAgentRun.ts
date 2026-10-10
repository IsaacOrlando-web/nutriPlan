"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";

/** Stored events of a run (replay and polling fallback). Live streaming goes through api.agents.subscribe. */
export function useAgentRun(runId: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.agentRun(runId ?? ""),
    queryFn: () => api.agents.run(runId ?? ""),
    enabled: Boolean(runId) && enabled,
    staleTime: Infinity,
  });
}
