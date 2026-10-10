"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Asks the recipes agent for two meal ideas built from the stored profile. */
export function useRecipeIdeas() {
  return useMutation({
    mutationFn: () => api.agents.recipes(),
  });
}
