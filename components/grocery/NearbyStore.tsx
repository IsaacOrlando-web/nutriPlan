"use client";

import { ExternalLink, Loader2, LocateFixed, MapPin, Navigation, Search, Store } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NearbyStore as NearbyStoreItem } from "@/lib/api";
import { useNearbyStores } from "@/lib/hooks/useNearbyStores";
import { cn, fmtNumber } from "@/lib/utils";

const KIND_LABEL: Record<NearbyStoreItem["kind"], string> = {
  supermarket: "Supermarket",
  greengrocer: "Produce shop",
  convenience: "Convenience store",
};

const directionsUrl = (s: NearbyStoreItem) =>
  `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
const mapsSearchUrl = (near?: { lat: number; lng: number } | null) =>
  near
    ? `https://www.google.com/maps/search/supermarket/@${near.lat},${near.lng},15z`
    : "https://www.google.com/maps/search/supermarket+near+me";
const distanceLabel = (km: number) =>
  km < 1
    ? `${fmtNumber(Math.round(km * 1000))} m away`
    : `${fmtNumber(km, { maximumFractionDigits: 1 })} km away`;

/** "Where to buy": nearest supermarket for the whole list, from the browser location (asked on tap only). */
export function NearbyStore({ className }: { className?: string }) {
  const nearby = useNearbyStores();
  const [query, setQuery] = useState("");
  const busy = nearby.status === "locating" || nearby.status === "searching";
  const [best, ...others] = nearby.stores;
  const showSearch =
    nearby.status === "denied" || nearby.status === "error" || (nearby.status === "done" && !best);

  return (
    <section
      data-testid="nearby-store"
      aria-labelledby="nearby-store-heading"
      className={cn("space-y-3 rounded-xl bg-surface-raised p-4 shadow-sm ring-1 ring-border", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="nearby-store-heading" className="flex items-center gap-2 font-semibold">
            <Store className="h-4 w-4 text-brand" aria-hidden="true" />
            Where to buy
          </h2>
          <p className="text-sm text-ink-muted">A supermarket near you carries everything on this list.</p>
        </div>
      </div>

      {nearby.status === "idle" && (
        <Button data-testid="nearby-store-locate" onClick={nearby.locate} className="w-full sm:w-auto">
          <MapPin aria-hidden="true" />
          Find a store near me
        </Button>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
          {nearby.status === "locating" ? "Getting your location…" : "Looking for stores nearby…"}
        </p>
      )}

      {nearby.status === "done" && best && (
        <div className="space-y-3">
          <div
            data-testid="nearby-store-best"
            className="flex flex-col gap-3 rounded-lg bg-brand-soft/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{best.name}</span>
                <Badge variant="success">{KIND_LABEL[best.kind]}</Badge>
              </div>
              {best.address && <p className="text-sm text-ink-muted">{best.address}</p>}
              {best.distanceKm !== null && (
                <p className="text-sm font-medium tabular-nums text-brand-dark">
                  {distanceLabel(best.distanceKm)}
                </p>
              )}
            </div>
            <Button asChild className="shrink-0">
              <a href={directionsUrl(best)} target="_blank" rel="noopener noreferrer">
                <Navigation aria-hidden="true" />
                Directions
              </a>
            </Button>
          </div>
          {others.length > 0 && (
            <ul className="divide-y rounded-lg ring-1 ring-border" aria-label="Other stores nearby">
              {others.slice(0, 2).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {KIND_LABEL[s.kind]}
                      {s.distanceKm !== null && ` · ${distanceLabel(s.distanceKm)}`}
                    </span>
                  </span>
                  <a
                    href={directionsUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"
                  >
                    Directions
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showSearch && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            {nearby.status === "denied"
              ? "Location is off. Type your city or postal code instead."
              : nearby.status === "done"
                ? "No stores found near there. Try another place."
                : nearby.error}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim().length >= 2) void nearby.searchByText(query.trim());
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="City or postal code"
              aria-label="City or postal code"
              data-testid="nearby-store-query"
            />
            <Button type="submit" variant="outline" disabled={query.trim().length < 2}>
              <Search aria-hidden="true" />
              Search
            </Button>
          </form>
          <a
            href={mapsSearchUrl(nearby.origin)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            Search supermarkets on Google Maps
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}

      <p className="text-[11px] text-ink-subtle">
        Your location goes to OpenStreetMap only to find stores. It is not saved.
      </p>
    </section>
  );
}
