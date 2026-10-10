"use client";

import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Suspense } from "react";
import { toast } from "sonner";
import { GroceryList } from "@/components/grocery/GroceryList";
import { KrogerPanel } from "@/components/grocery/KrogerPanel";
import { NearbyStore } from "@/components/grocery/NearbyStore";
import { RecipeGroceryList } from "@/components/grocery/RecipeGroceryList";
import { krogerErrorMessage, useKrogerStatus, useSendToKrogerCart } from "@/lib/hooks/useKroger";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/lib/hooks/usePlan";
import { mondayOf, useWeekPlan } from "@/lib/hooks/usePlanner";
import { fmtDate, fmtUsd } from "@/lib/utils";

export default function GroceryPage() {
  // The recipe week on /plan is the source of truth; the agents' optimizer list is the fallback.
  const week = useWeekPlan(mondayOf());
  const plan = usePlan();
  const recipeWeek = week.data?.plan ?? null;
  const agentItems = plan.data?.groceryList ?? [];
  const total = agentItems.reduce((s, i) => s + i.costUsd, 0);
  const kroger = useKrogerStatus();
  const sendToCart = useSendToKrogerCart();
  const canSend = Boolean(kroger.data?.connected && kroger.data.location);
  const onSendToCart = canSend
    ? () =>
        sendToCart.mutate(undefined, {
          onSuccess: (res) =>
            toast.success(
              res.added > 0
                ? `Added ${res.added} items to your Kroger cart${res.skipped.length ? `, ${res.skipped.length} not found` : ""}`
                : "Nothing could be added: no items matched at this store",
            ),
          onError: (err) => toast.error(krogerErrorMessage(err)),
        })
    : undefined;

  const loading = week.isLoading || (!recipeWeek && plan.isLoading);
  const error = week.error ?? (!recipeWeek ? plan.error : null);
  const empty = !loading && !error && !recipeWeek && agentItems.length === 0;

  const subtitle = recipeWeek
    ? `Everything for your recipes for the week of ${fmtDate(recipeWeek.weekStartDate, { month: "long", day: "numeric" })}, grouped by aisle. Tick items off as you shop.`
    : agentItems.length > 0
      ? `Everything for this week's plan: ${agentItems.length} items, ${fmtUsd(total)}. Tick items off as you shop.`
      : "Everything your week's plan needs, grouped the way the store is.";

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
          body="Generate your week of recipes and the shopping list builds itself."
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
          <NearbyStore />
          {recipeWeek && week.data ? (
            <RecipeGroceryList plan={recipeWeek} state={week.data.state} />
          ) : (
            <>
              <Suspense fallback={null}>
                <KrogerPanel />
              </Suspense>
              <GroceryList items={agentItems} onSendToCart={onSendToCart} />
            </>
          )}
        </>
      )}
    </div>
  );
}
