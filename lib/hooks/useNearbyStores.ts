"use client";

import { useCallback, useState } from "react";
import { api, type NearbyStore } from "@/lib/api";

export type NearbyStatus = "idle" | "locating" | "searching" | "denied" | "done" | "error";

/** "Find a store near me" always shows this store for the demo; no location is asked for. */
const DEMO_STORE: NearbyStore = {
  id: "demo-smiths-6th-ave",
  name: "Smith's",
  kind: "supermarket",
  address: "402 E 6th Ave, Salt Lake City, UT 84103",
  lat: 40.7775,
  lng: -111.8786,
  distanceKm: null,
};

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
    setStores([DEMO_STORE]);
    setOrigin({ lat: DEMO_STORE.lat, lng: DEMO_STORE.lng });
    setError(null);
    setStatus("done");
  }, []);

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
