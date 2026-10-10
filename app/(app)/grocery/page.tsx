"use client";

import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  CopyListButton,
  GroceryList,
  OpenCartLink,
  SendToKrogerButton,
  listAsText,
  type KrogerMatch,
} from "@/components/grocery/GroceryList";
import { KrogerPanel } from "@/components/grocery/KrogerPanel";
import { NearbyStore } from "@/components/grocery/NearbyStore";
import { RecipeGroceryList } from "@/components/grocery/RecipeGroceryList";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  krogerErrorMessage,
  useKrogerPrices,
  useKrogerStatus,
  useSendToKrogerCart,
} from "@/lib/hooks/useKroger";
import { usePlan } from "@/lib/hooks/usePlan";
import { mondayOf, useWeekPlan } from "@/lib/hooks/usePlanner";
import { fmtDate, fmtUsd, plural } from "@/lib/utils";
import type { GroceryItem } from "@/types/contracts";

export default function GroceryPage() {
  // The recipe week on /plan is the source of truth; the agents' optimizer list is the fallback.
  const week = useWeekPlan(mondayOf());
  const plan = usePlan();
  const recipeWeek = week.data?.plan ?? null;
  const agentItems = plan.data?.groceryList ?? [];
  const kroger = useKrogerStatus();
  const sendToCart = useSendToKrogerCart();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [cartSent, setCartSent] = useState(false);

  const items = useMemo(() => plan.data?.groceryList ?? [], [plan.data]);
  const canPrice = Boolean(kroger.data?.configured && kroger.data.location);
  const prices = useKrogerPrices(canPrice);
  const priced = useMemo(() => {
    if (!prices.data) return undefined;
    const map = new Map<string, KrogerMatch>();
    for (const item of prices.data.items) if (item.kroger) map.set(item.foodId, item.kroger);
    return map;
  }, [prices.data]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = async () => {
    const text = listAsText(items, checked);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      toast.success("List copied");
    } catch {
      toast.error("Could not copy. Select the list and copy it by hand.");
    }
  };

  const canSend = Boolean(kroger.data?.connected && kroger.data.location);
  const onSendToCart = canSend
    ? () =>
        sendToCart.mutate(undefined, {
          onSuccess: (res) => {
            if (res.added > 0) {
              setCartSent(true);
              toast.success(
                `Added ${res.added} items to your Kroger cart${res.skipped.length ? `, ${res.skipped.length} not found` : ""}`,
              );
            } else toast.error("Nothing could be added: no items matched at this store");
          },
          onError: (err) => toast.error(krogerErrorMessage(err)),
        })
    : undefined;

  const loading = week.isLoading || (!recipeWeek && plan.isLoading);
  const error = week.error ?? (!recipeWeek ? plan.error : null);
  const empty = !loading && !error && !recipeWeek && agentItems.length === 0;

  const subtitle = recipeWeek
    ? `Recipes for the week of ${fmtDate(recipeWeek.weekStartDate, { month: "long", day: "numeric" })}`
    : plan.data
      ? `Week of ${fmtDate(plan.data.startDate, { month: "long", day: "numeric" })}`
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Grocery list" subtitle={subtitle} />
      {loading && <LoadingState variant="list" rows={6} />}
      {error && (
        <ErrorState
          error={error}
          onRetry={() => {
            void week.refetch();
            void plan.refetch();
          }}
        />
      )}
      {empty && (
        <EmptyState
          title="No groceries yet"
          body="The list appears once your week is planned."
          icon={ShoppingBasket}
          action={
            <Button asChild>
              <Link href="/plan">Go to your week</Link>
            </Button>
          }
        />
      )}
      {!loading && !error && !empty && (
        <>
          {recipeWeek && week.data ? (
            <>
              <NearbyStore />
              <RecipeGroceryList plan={recipeWeek} state={week.data.state} />
            </>
          ) : (
            <>
              <GroceryHero
                items={items}
                checked={checked}
                onReset={() => setChecked(new Set())}
                onCopy={() => void copy()}
                onSendToCart={onSendToCart}
                cartSent={cartSent}
              />
              <GroceryList
                items={items}
                checked={checked}
                onToggle={toggle}
                priced={priced}
                onSendToCart={onSendToCart}
                onCopy={() => void copy()}
                cartSent={cartSent}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function GroceryHero({
  items,
  checked,
  onReset,
  onCopy,
  onSendToCart,
  cartSent,
}: {
  items: GroceryItem[];
  checked: Set<string>;
  onReset: () => void;
  onCopy: () => void;
  onSendToCart?: () => void;
  cartSent: boolean;
}) {
  const total = items.reduce((s, i) => s + i.costUsd, 0);
  const remaining = items.filter((i) => !checked.has(i.foodId)).reduce((s, i) => s + i.costUsd, 0);
  const pct = items.length ? Math.round((checked.size / items.length) * 100) : 0;

  return (
    <section
      className="rounded-2xl bg-surface-raised p-5 shadow-sm ring-1 ring-border sm:p-6"
      aria-label="This week's total"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Plan estimate</p>
          <p
            className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl"
            data-testid="grocery-total"
          >
            {fmtUsd(total)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{plural(items.length, "item")} for the week</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          <div className="min-w-0 sm:w-64" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-muted">In the cart</span>
              <span className="font-semibold tabular-nums">
                {checked.size} of {items.length}
              </span>
            </div>
            <Progress
              value={pct}
              className="mt-2"
              aria-label={`${checked.size} of ${items.length} items checked`}
            />
            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-muted">Left to buy</span>
              <span className="font-semibold tabular-nums">{fmtUsd(remaining)}</span>
            </div>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            {checked.size > 0 && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                Reset
              </Button>
            )}
            <CopyListButton onClick={onCopy} />
            {cartSent && <OpenCartLink />}
            <SendToKrogerButton disabled={onSendToCart === undefined} onClick={onSendToCart} />
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <KrogerPanel className="mt-5 border-t pt-4" />
      </Suspense>
    </section>
  );
}
