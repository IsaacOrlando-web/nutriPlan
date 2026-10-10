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
import { krogerErrorMessage, useKrogerStatus, useSendToKrogerCart } from "@/lib/hooks/useKroger";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/lib/hooks/usePlan";
import { fmtUsd } from "@/lib/utils";

export default function GroceryPage() {
  const plan = usePlan();
  const total = plan.data?.groceryList.reduce((s, i) => s + i.costUsd, 0) ?? 0;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grocery list"
        subtitle={
          plan.data && plan.data.groceryList.length > 0
            ? `Everything for this week's plan: ${plan.data.groceryList.length} items, ${fmtUsd(total)}. Tick items off as you shop.`
            : "Everything your week's plan needs, grouped the way the store is."
        }
      />
      {plan.isLoading && <LoadingState variant="list" rows={6} />}
      {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
      {!plan.isLoading && !plan.error && (!plan.data || plan.data.groceryList.length === 0) && (
        <EmptyState
          title="No groceries yet"
          body="Your grocery list appears once the agents have built a plan."
          icon={ShoppingBasket}
          action={
            <Button asChild>
              <Link href="/plan">Go to your week</Link>
            </Button>
          }
        />
      )}
      {plan.data && plan.data.groceryList.length > 0 && (
        <>
          <Suspense fallback={null}>
            <KrogerPanel />
          </Suspense>
          <GroceryList items={plan.data.groceryList} onSendToCart={onSendToCart} />
        </>
      )}
    </div>
  );
}
