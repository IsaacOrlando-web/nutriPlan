"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CoachMessage } from "@/types/contracts";
import { keys } from "./keys";

export function useCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messages: CoachMessage[]) => api.coach.send({ messages }),
    onSuccess: (res) => {
      if (res.replanRunId) void qc.invalidateQueries({ queryKey: keys.plan });
    },
  });
}
