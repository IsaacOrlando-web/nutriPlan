"use client";

import { Flame, Package, ShoppingBasket, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateWeekState } from "@/lib/hooks/usePlanner";
import { cn, fmtUsd } from "@/lib/utils";
import { aggregateShopping, applyShoppingState, groupByCategory } from "@/math/shopping";
import type { Food, PlannerWeekState, Recipe, WeeklyMealPlan } from "@/types/contracts";
import { SECTION_META } from "./GroceryList";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;

/** Recipe aisles reuse the optimizer list's labels and icons; the planner adds "spices". */
function sectionMeta(category: string): { label: string; icon: LucideIcon } {
  if (category === "spices") return { label: "Spices and seasonings", icon: Flame };
  return SECTION_META[category as Food["storeSection"]] ?? { label: "Other", icon: Package };
}

export interface RecipeGroceryListProps {
  plan: WeeklyMealPlan;
  state: PlannerWeekState;
  className?: string;
}

/** Shopping list for the week's 21 recipes: aggregated by Math, ticks saved to the week state. */
export function RecipeGroceryList({ plan, state, className }: RecipeGroceryListProps) {
  const update = useUpdateWeekState();
  const recipes = useMemo<Recipe[]>(() => plan.days.flatMap((d) => MEAL_TYPES.map((t) => d[t])), [plan]);
  const view = useMemo(
    () => applyShoppingState(aggregateShopping(recipes), state.shopping),
    [recipes, state.shopping],
  );
  const groups = useMemo(() => groupByCategory(view.items), [view.items]);

  // Display sum of Math's per serving costs; recipes without a price are named, never guessed.
  const priced = recipes.filter((r) => r.estimatedCostPerServing !== null);
  const total = priced.reduce((s, r) => s + (r.estimatedCostPerServing ?? 0) * r.servings, 0);
  const unpriced = recipes.length - priced.length;

  const saveChecked = (checked: Record<string, boolean>) =>
    update.mutate(
      { weekStartDate: plan.weekStartDate, shopping: { ...state.shopping, checked } },
      { onError: () => toast.error("Could not save that tick. Try again.") },
    );
  const toggle = (key: string) =>
    saveChecked({ ...state.shopping.checked, [key]: !state.shopping.checked[key] });

  return (
    <div data-testid="grocery-list" className={cn("space-y-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-raised px-4 py-3 shadow-sm ring-1 ring-border">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">
            {view.purchased} of {view.items.length} items bought
          </p>
          <p className="text-xs text-ink-muted">
            Estimated week:{" "}
            <span className="font-semibold tabular-nums text-agent-budget">{fmtUsd(total)}</span>
            {unpriced > 0 && ` · ${unpriced} ${unpriced === 1 ? "recipe" : "recipes"} not priced`}
          </p>
        </div>
        {view.purchased > 0 && (
          <Button variant="ghost" size="sm" onClick={() => saveChecked({})} disabled={update.isPending}>
            Uncheck all
          </Button>
        )}
      </div>

      {groups.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ShoppingBasket className="h-4 w-4" aria-hidden="true" />
          These recipes have no ingredients to buy.
        </p>
      )}

      {groups.map((group) => {
        const meta = sectionMeta(group.category);
        const Icon = meta.icon;
        const done = group.items.filter((i) => i.checked).length;
        return (
          <section key={group.category} className="space-y-2" aria-labelledby={`section-${group.category}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand-dark">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 id={`section-${group.category}`} className="text-sm font-semibold">
                {meta.label}
              </h2>
              <span className="text-xs text-ink-subtle">
                {done} of {group.items.length}
              </span>
            </div>
            <ul className="divide-y rounded-xl bg-surface-raised shadow-sm ring-1 ring-border">
              {group.items.map((item) => {
                const id = `grocery-${item.key}`;
                return (
                  <li
                    key={item.key}
                    data-testid="grocery-item"
                    data-checked={item.checked}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Checkbox
                      id={id}
                      checked={item.checked}
                      onCheckedChange={() => toggle(item.key)}
                      aria-label={item.name}
                      className="h-6 w-6 [&_svg]:h-4 [&_svg]:w-4"
                    />
                    <label
                      htmlFor={id}
                      className={cn(
                        "min-w-0 flex-1 cursor-pointer py-1",
                        item.checked && "text-ink-subtle line-through",
                      )}
                    >
                      <span className="block text-sm font-medium first-letter:uppercase">{item.name}</span>
                      {item.sources.length > 0 && (
                        <span
                          className="block truncate text-xs text-ink-subtle"
                          title={item.sources.join(", ")}
                        >
                          For {item.sources.slice(0, 2).join(", ")}
                          {item.sources.length > 2 && ` and ${item.sources.length - 2} more`}
                        </span>
                      )}
                    </label>
                    <span
                      className={cn(
                        "shrink-0 text-right text-sm tabular-nums",
                        item.checked ? "text-ink-subtle" : "font-semibold",
                      )}
                    >
                      {item.quantityLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
