"use client";

// Grocery list body: sections of tick-off rows, plus the shared action buttons (Copy list, Send to Kroger,
// Open Kroger cart) and the phone sticky footer. Checked state is owned by the page so the hero can show it.
import { motion } from "framer-motion";
import {
  Carrot,
  Copy,
  Drumstick,
  ExternalLink,
  Milk,
  Package,
  ShoppingBasket,
  ShoppingCart,
  Snowflake,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, fmtUsd } from "@/lib/utils";
import type { Food, GroceryItem, PricedGroceryItem } from "@/types/contracts";

export const KROGER_CART_URL = "https://www.kroger.com/cart";

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

export type KrogerMatch = NonNullable<PricedGroceryItem["kroger"]>;

export function groupBySection(items: GroceryItem[]) {
  const map = new Map<Food["storeSection"], GroceryItem[]>();
  for (const item of items) {
    const arr = map.get(item.storeSection) ?? [];
    arr.push(item);
    map.set(item.storeSection, arr);
  }
  return SECTION_ORDER.filter((s) => map.has(s)).map((s) => ({ section: s, items: map.get(s) ?? [] }));
}

/** Plain text of the unchecked items, grouped by store section, for the clipboard. */
export function listAsText(items: GroceryItem[], checked: Set<string>): string {
  const open = items.filter((i) => !checked.has(i.foodId));
  return groupBySection(open)
    .map(
      (g) =>
        `${SECTION_META[g.section].label}\n` +
        g.items.map((i) => `- ${i.name}, ${i.quantityLabel}`).join("\n"),
    )
    .join("\n\n");
}

export interface GroceryListProps {
  items: GroceryItem[];
  checked: Set<string>;
  onToggle: (foodId: string) => void;
  /** Kroger match per foodId. Undefined = prices not loaded; an empty map = loaded, nothing matched. */
  priced?: Map<string, KrogerMatch>;
  /** Sends the list to the Kroger cart (api.kroger.cart). Undefined = account not connected: button is disabled. */
  onSendToCart?: () => void;
  onCopy: () => void;
  /** Set after a successful send: shows the "Open Kroger cart" link. */
  cartSent?: boolean;
  className?: string;
}

export function GroceryList({
  items,
  checked,
  onToggle,
  priced,
  onSendToCart,
  onCopy,
  cartSent,
  className,
}: GroceryListProps) {
  const groups = useMemo(() => groupBySection(items), [items]);
  const remaining = items.filter((i) => !checked.has(i.foodId)).reduce((s, i) => s + i.costUsd, 0);

  return (
    <div data-testid="grocery-list" className={cn("space-y-7 pb-20 lg:pb-0", className)}>
      {groups.map((group, gi) => {
        const meta = SECTION_META[group.section];
        const Icon = meta.icon;
        const done = group.items.filter((i) => checked.has(i.foodId)).length;
        return (
          <motion.section
            key={group.section}
            className="space-y-2.5"
            aria-labelledby={`section-${group.section}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: gi * 0.04 }}
          >
            <div className="flex items-center gap-2 px-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand-dark">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 id={`section-${group.section}`} className="text-sm font-semibold">
                {meta.label}
              </h2>
              <span className="text-xs tabular-nums text-ink-subtle">
                {done} of {group.items.length}
              </span>
            </div>
            <ul className="divide-y rounded-xl bg-surface-raised shadow-sm ring-1 ring-border">
              {group.items.map((item) => (
                <GroceryRow
                  key={item.foodId}
                  item={item}
                  done={checked.has(item.foodId)}
                  onToggle={() => onToggle(item.foodId)}
                  match={priced?.get(item.foodId)}
                  pricesLoaded={priced !== undefined}
                />
              ))}
            </ul>
          </motion.section>
        );
      })}

      {/* Phone: running total and actions pinned above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[3.75rem] z-20 border-t bg-surface-raised/95 px-4 py-2.5 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.15)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-xs">
            <p className="text-ink-muted">
              {checked.size} of {items.length} in the cart
            </p>
            <p className="text-base font-bold tabular-nums">{fmtUsd(remaining)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CopyListButton onClick={onCopy} compact />
            {cartSent && <OpenCartLink compact />}
            <SendToKrogerButton disabled={onSendToCart === undefined} onClick={onSendToCart} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function GroceryRow({
  item,
  done,
  onToggle,
  match,
  pricesLoaded,
}: {
  item: GroceryItem;
  done: boolean;
  onToggle: () => void;
  match?: KrogerMatch;
  pricesLoaded: boolean;
}) {
  const id = `grocery-${item.foodId}`;
  return (
    <li data-testid="grocery-item" data-checked={done} className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        id={id}
        checked={done}
        onCheckedChange={onToggle}
        aria-label={item.name}
        className="mt-0.5 h-6 w-6 [&_svg]:h-4 [&_svg]:w-4"
      />
      <label
        htmlFor={id}
        className={cn(
          "min-w-0 flex-1 cursor-pointer",
          done && "text-ink-subtle line-through decoration-ink-subtle",
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{item.name}</span>
          <span className={cn("shrink-0 text-sm tabular-nums", done ? "text-ink-subtle" : "font-semibold")}>
            {fmtUsd(item.costUsd)}
          </span>
        </span>
        <span className="block text-xs text-ink-muted">{item.quantityLabel}</span>
        {match && (
          <span className="mt-1 flex items-baseline justify-between gap-3 text-xs text-ink-muted">
            <span className="truncate">
              {match.description} {match.size} · {match.packagesNeeded} × {fmtUsd(match.unitPriceUsd)}
            </span>
            <span className="shrink-0 tabular-nums">{fmtUsd(match.lineUsd)} shelf</span>
          </span>
        )}
        {pricesLoaded && !match && (
          <span className="mt-1 block text-xs text-ink-subtle">Not found at this store</span>
        )}
      </label>
    </li>
  );
}

export function CopyListButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={onClick}
        aria-label="Copy list"
        title="Copy the unchecked items"
      >
        <Copy aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      <Copy aria-hidden="true" />
      Copy list
    </Button>
  );
}

export function OpenCartLink({ compact }: { compact?: boolean }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <a href={KROGER_CART_URL} target="_blank" rel="noreferrer" data-testid="grocery-open-cart">
        <ExternalLink aria-hidden="true" />
        {compact ? "Open cart" : "Open Kroger cart"}
      </a>
    </Button>
  );
}

export function SendToKrogerButton({
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
      variant={disabled ? "outline" : "default"}
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
          Connect first
        </Badge>
      )}
    </Button>
  );
}
