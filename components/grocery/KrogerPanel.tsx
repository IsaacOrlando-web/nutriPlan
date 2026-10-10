"use client";

// Kroger strip inside the grocery hero: store, connection, and the real shelf total once priced.
// Owner: Frontend. Renders nothing when the server has no Kroger credentials (nothing to promise).
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, MapPin, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  krogerErrorMessage,
  useKrogerPrices,
  useKrogerStatus,
  useSetKrogerLocation,
} from "@/lib/hooks/useKroger";
import { cn, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KrogerLocation } from "@/types/contracts";

export function KrogerPanel({ className }: { className?: string }) {
  const status = useKrogerStatus();
  const params = useSearchParams();
  const justConnected = params.get("kroger") === "connected";
  const connectError = params.get("kroger") === "error";
  const [pickerOpen, setPickerOpen] = useState(false);

  if (status.isLoading || !status.data || !status.data.configured) return null;
  const { connected, location } = status.data;
  const showPicker = pickerOpen || !location;

  return (
    <section
      data-testid="kroger-panel"
      className={cn("space-y-3", className)}
      aria-labelledby="kroger-heading"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="kroger-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4 text-brand" aria-hidden="true" />
          Kroger
        </h2>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{location ? location.name : "Pick a store"}</span>
        </span>
        {location && (
          <button
            type="button"
            className="rounded text-sm font-medium text-brand-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={showPicker}
          >
            {showPicker ? "Keep store" : "Change"}
          </button>
        )}
        <div className="ml-auto">
          {connected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-brand-dark">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Connected
            </span>
          ) : (
            <Button asChild size="sm" data-testid="kroger-connect">
              {/* Full navigation: the route answers with a 302 to Kroger's consent page. */}
              <a href={api.kroger.connectUrl}>Connect</a>
            </Button>
          )}
        </div>
      </div>
      {justConnected && !location && (
        <p className="text-sm text-brand-dark">Connected. Pick a store to price the list.</p>
      )}
      {connectError && <p className="text-sm text-danger">Kroger sign-in did not finish. Try again.</p>}
      {showPicker && <StorePicker onPicked={() => setPickerOpen(false)} />}
      {location && <PriceSummary storeName={location.name} />}
    </section>
  );
}

function StorePicker({ onPicked }: { onPicked: () => void }) {
  const [zip, setZip] = useState("");
  const [options, setOptions] = useState<KrogerLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const setLocation = useSetKrogerLocation();

  const search = async () => {
    if (!/^\d{5}$/.test(zip)) {
      toast.error("Enter a 5 digit ZIP code");
      return;
    }
    setSearching(true);
    try {
      const res = await api.kroger.locations(zip);
      setOptions(res.locations);
      if (res.locations.length === 0) toast("No Kroger stores near that ZIP");
    } catch (err) {
      toast.error(krogerErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="ZIP code"
          aria-label="ZIP code"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="h-9 max-w-[140px]"
          data-testid="kroger-zip"
        />
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={searching}>
          {searching ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Search aria-hidden="true" />
          )}
          Find stores
        </Button>
      </form>
      {options.length > 0 && (
        <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="kroger-stores">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full rounded-lg bg-surface-sunken px-3 py-2 text-left text-sm hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() =>
                  setLocation.mutate(
                    { locationId: o.id, name: o.name, zip },
                    {
                      onSuccess: () => {
                        setOptions([]);
                        onPicked();
                        toast.success(`Store set to ${o.name}`);
                      },
                      onError: (err) => toast.error(krogerErrorMessage(err)),
                    },
                  )
                }
              >
                <span className="block font-medium">{o.name}</span>
                <span className="block text-xs text-ink-muted">{o.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceSummary({ storeName }: { storeName: string }) {
  const prices = useKrogerPrices(true);
  if (prices.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Looking up shelf prices…
      </p>
    );
  }
  if (prices.error) return <p className="text-sm text-danger">{krogerErrorMessage(prices.error)}</p>;
  if (!prices.data) return null;
  const { totalUsd, matched, items } = prices.data;
  return (
    <div className="rounded-xl bg-surface-sunken px-4 py-3" data-testid="kroger-prices">
      <p className="text-sm">
        Shelf total at {storeName}: <span className="font-semibold tabular-nums">{fmtUsd(totalUsd)}</span> for{" "}
        <span className="tabular-nums">
          {matched} of {items.length}
        </span>{" "}
        items
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">Counts whole packages. Leftovers carry to next week.</p>
    </div>
  );
}
