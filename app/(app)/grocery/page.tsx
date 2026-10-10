"use client";

import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { usePlan } from "@/lib/hooks/usePlan";
import { cn, fmtUsd } from "@/lib/utils";
import type { Food, GroceryItem } from "@/types/contracts";

const SECTION_ORDER: Food["storeSection"][] = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "pantry",
  "frozen",
  "other",
];
const SECTION_LABEL: Record<Food["storeSection"], string> = {
  produce: "Produce",
  protein: "Protein",
  dairy: "Dairy",
  grains: "Grains",
  pantry: "Pantry",
  frozen: "Frozen",
  other: "Other",
};

export default function GroceryPage() {
  const plan = usePlan();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const list = plan.data?.groceryList ?? [];
    const map = new Map<Food["storeSection"], GroceryItem[]>();
    for (const item of list) {
      const arr = map.get(item.storeSection) ?? [];
      arr.push(item);
      map.set(item.storeSection, arr);
    }
    return SECTION_ORDER.filter((s) => map.has(s)).map((s) => ({ section: s, items: map.get(s) ?? [] }));
  }, [plan.data]);

  const total = plan.data?.groceryList.reduce((s, i) => s + i.costUsd, 0) ?? 0;
  const remaining =
    plan.data?.groceryList.filter((i) => !checked.has(i.foodId)).reduce((s, i) => s + i.costUsd, 0) ?? 0;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grocery list"
        subtitle={
          plan.data ? `${plan.data.groceryList.length} items · ${fmtUsd(total)} for the week` : undefined
        }
        actions={
          plan.data && checked.size > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())}>
              Uncheck all
            </Button>
          ) : undefined
        }
      />
      {plan.isLoading && <LoadingState variant="list" rows={6} />}
      {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
      {!plan.isLoading && !plan.error && (!plan.data || plan.data.groceryList.length === 0) && (
        <EmptyState
          title="No groceries yet"
          body="Your grocery list appears once a plan is built."
          icon={ShoppingBasket}
          action={
            <Button asChild>
              <Link href="/plan">Go to plan</Link>
            </Button>
          }
        />
      )}
      {plan.data && plan.data.groceryList.length > 0 && (
        <div data-testid="grocery-list" className="space-y-5">
          <div className="sticky top-14 z-20 flex items-center justify-between rounded-xl border bg-surface-raised px-4 py-3 shadow-sm lg:top-0">
            <span className="text-sm text-ink-muted">
              {checked.size} of {plan.data.groceryList.length} in the cart
            </span>
            <span className="text-sm">
              <span className="text-ink-muted">Left to buy </span>
              <span className="font-bold tabular-nums text-agent-budget">{fmtUsd(remaining)}</span>
            </span>
          </div>
          {groups.map((group) => (
            <section key={group.section} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                {SECTION_LABEL[group.section]}
              </h2>
              <ul className="divide-y rounded-xl border bg-surface-raised">
                {group.items.map((item) => {
                  const done = checked.has(item.foodId);
                  const id = `grocery-${item.foodId}`;
                  return (
                    <li
                      key={item.foodId}
                      data-testid="grocery-item"
                      data-checked={done}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Checkbox
                        id={id}
                        checked={done}
                        onCheckedChange={() => toggle(item.foodId)}
                        aria-label={item.name}
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          "min-w-0 flex-1 cursor-pointer",
                          done && "text-ink-subtle line-through",
                        )}
                      >
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block text-xs text-ink-muted">{item.quantityLabel}</span>
                      </label>
                      <span
                        className={cn(
                          "shrink-0 text-sm tabular-nums",
                          done ? "text-ink-subtle" : "font-semibold",
                        )}
                      >
                        {fmtUsd(item.costUsd)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-surface-sunken px-4 py-3">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums text-agent-budget">{fmtUsd(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
