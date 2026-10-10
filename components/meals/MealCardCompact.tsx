"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, fmtNumber, fmtUsd } from "@/lib/utils";
import type { Meal } from "@/types/contracts";
import { MEAL_TYPE_LABELS, TYPE_VARIANT } from "./MealCard";
import { MEAL_TIME_OF_DAY } from "./mealTime";

export interface MealCardCompactProps {
  meal: Meal;
  onOpen: (meal: Meal) => void;
  /** Marks the meal the sentence on the Today card talks about. */
  highlighted?: boolean;
  className?: string;
}

/** Small meal card for the dashboard row: slot, time of day, name and the three numbers people look for. */
export function MealCardCompact({ meal, onOpen, highlighted, className }: MealCardCompactProps) {
  const time = MEAL_TIME_OF_DAY[meal.type];
  const TimeIcon = time.icon;
  return (
    <button
      type="button"
      data-testid="meal-card"
      onClick={() => onOpen(meal)}
      aria-label={`${MEAL_TYPE_LABELS[meal.type]}: ${meal.name}. Tap for why.`}
      className={cn(
        "group flex min-w-0 flex-col gap-2 rounded-xl bg-surface-raised p-4 text-left shadow-sm transition-shadow",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        highlighted ? "ring-2 ring-brand/60" : "ring-1 ring-border",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant={TYPE_VARIANT[meal.type]}>{MEAL_TYPE_LABELS[meal.type]}</Badge>
        <span className="flex items-center gap-1 text-xs text-ink-subtle">
          <TimeIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {time.label}
        </span>
      </div>
      <h3 className="line-clamp-2 min-h-[2.5rem] font-semibold leading-snug">{meal.name}</h3>
      <p className="text-sm tabular-nums text-ink-muted">
        <span className="font-semibold text-ink">{fmtNumber(Math.round(meal.totals.calories))} kcal</span>
        {" · "}
        {Math.round(meal.totals.proteinG)} g protein
        {" · "}
        <span className="text-agent-budget">{fmtUsd(meal.totals.costUsd)}</span>
      </p>
      <span className="mt-auto flex items-center gap-0.5 text-xs font-medium text-brand group-hover:underline">
        Why this meal
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}
