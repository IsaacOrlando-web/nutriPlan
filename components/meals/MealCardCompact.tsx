"use client";

import { ChevronRight } from "lucide-react";
import { cn, fmtNumber, fmtUsd } from "@/lib/utils";
import type { Meal } from "@/types/contracts";
import { MEAL_TYPE_LABELS } from "./MealCard";
import { MEAL_TIME_OF_DAY } from "./mealTime";

export interface MealCardCompactProps {
  meal: Meal;
  onOpen: (meal: Meal) => void;
  /** Marks the next meal by wall clock, the one the Today line talks about. */
  highlighted?: boolean;
  className?: string;
}

/** Dashboard meal: slot, name, the three numbers people look for. Tap anywhere for the why. */
export function MealCardCompact({ meal, onOpen, highlighted, className }: MealCardCompactProps) {
  const time = MEAL_TIME_OF_DAY[meal.type];
  const TimeIcon = time.icon;
  return (
    <button
      type="button"
      data-testid="meal-card"
      onClick={() => onOpen(meal)}
      aria-label={`${MEAL_TYPE_LABELS[meal.type]}: ${meal.name}. Why this meal?`}
      className={cn(
        "group flex min-w-0 flex-col gap-2 rounded-2xl bg-surface-raised p-4 text-left shadow-sm transition-shadow",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        highlighted ? "ring-1 ring-brand" : "ring-1 ring-border",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={cn(
            "font-semibold uppercase tracking-wide",
            highlighted ? "text-brand-dark" : "text-ink-subtle",
          )}
        >
          {MEAL_TYPE_LABELS[meal.type]}
          {highlighted && " · next"}
        </span>
        <span className="flex items-center gap-1 text-ink-subtle">
          <TimeIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {time.label}
        </span>
      </span>
      <span className="line-clamp-2 min-h-[2.75rem] text-[15px] font-semibold leading-snug">{meal.name}</span>
      <span className="mt-auto flex items-center justify-between gap-2">
        <span className="truncate text-sm tabular-nums text-ink-muted">
          <span className="font-semibold text-ink">{fmtNumber(Math.round(meal.totals.calories))} kcal</span>
          {" · "}
          {Math.round(meal.totals.proteinG)} g protein
          {" · "}
          {fmtUsd(meal.totals.costUsd)}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-ink-subtle transition-colors group-hover:text-ink"
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
