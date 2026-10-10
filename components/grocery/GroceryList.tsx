"use client";

import {
  Carrot,
  Drumstick,
  Milk,
  Package,
  ShoppingBasket,
  ShoppingCart,
  Snowflake,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export const SECTION_META: Record<Food["storeSection"], { label: string; icon: LucideIcon }> = {
  produce: { label: "Produce", icon: Carrot },
  protein: { label: "Meat, fish and protein", icon: Drumstick },
  dairy: { label: "Dairy and eggs", icon: Milk },
  grains: { label: "Grains and bread", icon: Wheat },
  pantry: { label: "Pantry", icon: Package },
  frozen: { label: "Frozen", icon: Snowflake },
  other: { label: "Other", icon: ShoppingBasket },
};

export interface GroceryListProps {
  items: GroceryItem[];
  /** Sends the list to the Kroger cart (api.kroger.cart). Undefined = account not connected: button is disabled. */
  onSendToCart?: () => void;
  className?: string;
}

export function GroceryList({ items, onSendToCart, className }: GroceryListProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<Food["storeSection"], GroceryItem[]>();
    for (const item of items) {
      const arr = map.get(item.storeSection) ?? [];
      arr.push(item);
      map.set(item.storeSection, arr);
    }
    return SECTION_ORDER.filter((s) => map.has(s)).map((s) => ({ section: s, items: map.get(s) ?? [] }));
  }, [items]);

  const total = items.reduce((s, i) => s + i.costUsd, 0);
  const remaining = items.filter((i) => !checked.has(i.foodId)).reduce((s, i) => s + i.costUsd, 0);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sendDisabled = onSendToCart === undefined;

  return (
    <div data-testid="grocery-list" className={cn("space-y-6 pb-20 lg:pb-0", className)}>
      {/* Laptop: progress and actions on top. */}
      <div className="hidden items-center justify-between gap-3 rounded-xl bg-surface-raised px-4 py-3 shadow-sm ring-1 ring-border lg:flex">
        <Progress checked={checked.size} total={items.length} remaining={remaining} />
        <div className="flex items-center gap-2">
          {checked.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())}>
              Uncheck all
            </Button>
          )}
          <SendToKroger disabled={sendDisabled} onClick={onSendToCart} />
        </div>
      </div>

      {groups.map((group) => {
        const meta = SECTION_META[group.section];
        const Icon = meta.icon;
        const done = group.items.filter((i) => checked.has(i.foodId)).length;
        return (
          <section key={group.section} className="space-y-2" aria-labelledby={`section-${group.section}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand-dark">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 id={`section-${group.section}`} className="text-sm font-semibold">
                {meta.label}
              </h2>
              <span className="text-xs text-ink-subtle">
                {done} of {group.items.length}
              </span>
            </div>
            <ul className="divide-y rounded-xl bg-surface-raised shadow-sm ring-1 ring-border">
              {group.items.map((item) => {
                const isDone = checked.has(item.foodId);
                const id = `grocery-${item.foodId}`;
                return (
                  <li
                    key={item.foodId}
                    data-testid="grocery-item"
                    data-checked={isDone}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Checkbox
                      id={id}
                      checked={isDone}
                      onCheckedChange={() => toggle(item.foodId)}
                      aria-label={item.name}
                      className="h-6 w-6 [&_svg]:h-4 [&_svg]:w-4"
                    />
                    <label
                      htmlFor={id}
                      className={cn(
                        "min-w-0 flex-1 cursor-pointer py-1",
                        isDone && "text-ink-subtle line-through",
                      )}
                    >
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block text-xs text-ink-muted">{item.quantityLabel}</span>
                    </label>
                    <span
                      className={cn(
                        "shrink-0 text-sm tabular-nums",
                        isDone ? "text-ink-subtle" : "font-semibold",
                      )}
                    >
                      {fmtUsd(item.costUsd)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="hidden items-center justify-between rounded-xl bg-surface-sunken px-4 py-3 lg:flex">
        <span className="font-semibold">Total for the week</span>
        <span className="text-lg font-bold tabular-nums text-agent-budget">{fmtUsd(total)}</span>
      </div>

      {/* Phone: running total pinned above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[3.75rem] z-20 border-t bg-surface-raised/95 px-4 py-2.5 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.15)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Progress checked={checked.size} total={items.length} remaining={remaining} compact />
          <SendToKroger disabled={sendDisabled} onClick={onSendToCart} compact />
        </div>
      </div>
    </div>
  );
}

function Progress({
  checked,
  total,
  remaining,
  compact,
}: {
  checked: number;
  total: number;
  remaining: number;
  compact?: boolean;
}) {
  return (
    <div className={cn("min-w-0", compact ? "text-xs" : "text-sm")}>
      <p className="text-ink-muted">
        {checked} of {total} in the cart
      </p>
      <p>
        <span className="text-ink-muted">Left to buy </span>
        <span className={cn("font-bold tabular-nums text-agent-budget", compact && "text-base")}>
          {fmtUsd(remaining)}
        </span>
      </p>
    </div>
  );
}

function SendToKroger({
  disabled,
  onClick,
  compact,
}: {
  disabled: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="grocery-send-kroger"
      aria-disabled={disabled}
      title={disabled ? "Connect a Kroger account above to enable" : "Send this list to your Kroger cart"}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
      className={cn("shrink-0 gap-1.5", disabled && "cursor-not-allowed opacity-60 hover:bg-transparent")}
    >
      <ShoppingCart aria-hidden="true" />
      {compact ? "Kroger" : "Send to Kroger cart"}
      {disabled && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
          Connect Kroger
        </Badge>
      )}
    </Button>
  );
}
