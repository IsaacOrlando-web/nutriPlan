"use client";

// Kroger connection card for the grocery screen: pick a store, connect the account, see real shelf prices.
// Owner: Frontend. Hidden entirely when the server has no Kroger credentials (nothing to promise).
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MapPin, ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  krogerErrorMessage,
  useKrogerPrices,
  useKrogerStatus,
  useSetKrogerLocation,
} from "@/lib/hooks/useKroger";
import { fmtUsd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KrogerLocation } from "@/types/contracts";

export function KrogerPanel() {
  const status = useKrogerStatus();
  const params = useSearchParams();
  const justConnected = params.get("kroger") === "connected";
  const connectError = params.get("kroger") === "error";

  if (status.isLoading || !status.data || !status.data.configured) return null;
  const { connected, location } = status.data;

  return (
    <section
      data-testid="kroger-panel"
      className="space-y-3 rounded-xl bg-surface-raised p-4 shadow-sm ring-1 ring-border"
      aria-labelledby="kroger-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="kroger-heading" className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="h-4 w-4 text-brand" aria-hidden="true" />
          Kroger
          {connected ? (
            <Badge className="bg-success text-white">Connected</Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </h2>
        {!connected && (
          <Button asChild size="sm" data-testid="kroger-connect">
            {/* Full navigation: the route answers with a 302 to Kroger's consent page. */}
            <a href={api.kroger.connectUrl}>Connect Kroger account</a>
          </Button>
        )}
      </div>
      {justConnected && (
        <p className="text-sm text-success">Kroger account connected. Pick a store to see real prices.</p>
      )}
      {connectError && <p className="text-sm text-danger">Kroger sign-in did not finish. Try again.</p>}
      <StorePicker current={location} />
      {location && <PriceSummary />}
    </section>
  );
}

function StorePicker({ current }: { current: { id: string; name: string } | null }) {
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
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        {current ? (
          <>
            Store: <span className="font-medium text-ink">{current.name}</span>
          </>
        ) : (
          "Choose the store you shop at to price the list."
        )}
      </p>
      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          placeholder="ZIP code"
          aria-label="ZIP code"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="max-w-[140px]"
          data-testid="kroger-zip"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void search()} disabled={searching}>
          {searching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Store aria-hidden="true" />}
          Find stores
        </Button>
      </div>
      {options.length > 0 && (
        <ul className="space-y-1" data-testid="kroger-stores">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm ring-1 ring-border hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() =>
                  setLocation.mutate(
                    { locationId: o.id, name: o.name, zip },
                    {
                      onSuccess: () => {
                        setOptions([]);
                        toast.success(`Store set to ${o.name}`);
                      },
                      onError: (err) => toast.error(krogerErrorMessage(err)),
                    },
                  )
                }
              >
                <span className="font-medium">{o.name}</span>
                <span className="block text-ink-muted">{o.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceSummary() {
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
  const { totalUsd, matched, unmatched, items } = prices.data;
  return (
    <div className="space-y-1 text-sm" data-testid="kroger-prices">
      <p>
        Real shelf total: <span className="font-semibold">{fmtUsd(totalUsd)}</span> for {matched} of{" "}
        {items.length} items.
      </p>
      {unmatched.length > 0 && (
        <p className="text-ink-muted">
          Not found at this store: {unmatched.slice(0, 4).join(", ")}
          {unmatched.length > 4 ? ` and ${unmatched.length - 4} more` : ""}.
        </p>
      )}
    </div>
  );
}
