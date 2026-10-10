"use client";

import { useCallback, useState } from "react";
import { api, type NearbyStore } from "@/lib/api";

export type NearbyStatus = "idle" | "locating" | "searching" | "denied" | "done" | "error";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Could not find stores.");

/**
 * Nearest shops for the grocery list. The browser asks for location only when `locate()` runs (a tap),
 * never on page load. When permission is denied, `searchByText("city or ZIP")` geocodes and searches instead.
 */
export function useNearbyStores() {
  const [status, setStatus] = useState<NearbyStatus>("idle");
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; label?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchAt = useCallback(async (lat: number, lng: number, label?: string) => {
    setStatus("searching");
    setOrigin({ lat, lng, label });
    try {
      setStores(await api.places.nearbyStores(lat, lng));
      setError(null);
      setStatus("done");
    } catch (err) {
      setError(errorMessage(err));
      setStatus("error");
    }
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("denied");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => void searchAt(pos.coords.latitude, pos.coords.longitude),
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [searchAt]);

  const searchByText = useCallback(
    async (query: string) => {
      setStatus("searching");
      try {
        const place = await api.places.geocode(query);
        if (!place) {
          setStores([]);
          setError(`We could not find "${query}". Try a city name or postal code.`);
          setStatus("error");
          return;
        }
        await searchAt(place.lat, place.lng, place.label);
      } catch (err) {
        setError(errorMessage(err));
        setStatus("error");
      }
    },
    [searchAt],
  );

  return { status, stores, origin, error, locate, searchByText };
}
