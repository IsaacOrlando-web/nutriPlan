"use client";

// Kroger hooks: connection status, real shelf pricing and "send to cart". Owner: Frontend.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";
import type { KrogerCartItemInput } from "@/types/contracts";

export const krogerKeys = {
  status: ["kroger", "status"] as const,
  price: ["kroger", "price"] as const,
};

export function useKrogerStatus() {
  return useQuery({
    queryKey: krogerKeys.status,
    queryFn: () => api.kroger.status(),
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 1,
  });
}

/** Real Kroger prices for the current grocery list. Only runs once the user has picked a store. */
export function useKrogerPrices(enabled: boolean) {
  return useQuery({
    queryKey: krogerKeys.price,
    queryFn: () => api.kroger.price(),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useSendToKrogerCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items?: KrogerCartItemInput[]) => api.kroger.cart(items),
    onSuccess: () => void qc.invalidateQueries({ queryKey: krogerKeys.status }),
  });
}

export function useSetKrogerLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loc: { locationId: string; name: string; zip: string }) => api.kroger.setLocation(loc),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: krogerKeys.status });
      void qc.invalidateQueries({ queryKey: krogerKeys.price });
    },
  });
}

/** Human message for a Kroger error code, so screens never show raw codes. */
export function krogerErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 503) return "Kroger is not set up on this server yet.";
    if (err.status === 401 || /connect/i.test(err.message)) return "Connect your Kroger account first.";
    return err.message;
  }
  return "Something went wrong talking to Kroger.";
}
