"use client";

import { Clock, Info, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRateMeal } from "@/lib/hooks/usePlan";
import { cn, fmtNumber, fmtUsd } from "@/lib/utils";
import type { Meal, MealType } from "@/types/contracts";
import { MEAL_TIME_OF_DAY } from "./mealTime";

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Badge tone per meal type (used by RecipeCard). */
export const TYPE_VARIANT: Record<MealType, "warning" | "success" | "secondary" | "outline"> = {
  breakfast: "warning",
  lunch: "success",
  dinner: "secondary",
  snack: "outline",
};

export interface MealCardProps {
  meal: Meal;
  onOpen: (meal: Meal) => void;
  className?: string;
}

/** Plan meal: slot, name, cuisine and time, one line of numbers, a quiet Why and the two rating buttons. */
export function MealCard({ meal, onOpen, className }: MealCardProps) {
  const rate = useRateMeal();
  const [liked, setLiked] = useState<boolean | null>(null);
  const time = MEAL_TIME_OF_DAY[meal.type];
  const notes = meal.explanation.length;

  const onRate = (value: boolean) => {
    setLiked(value);
    rate.mutate(
      { mealName: meal.name, liked: value },
      {
        onSuccess: () => toast.success("Thanks, Chef will remember that."),
        onError: () => setLiked(null),
      },
    );
  };

  return (
    <article
      data-testid="meal-card"
      className={cn(
        "group flex flex-col rounded-2xl bg-surface-raised shadow-sm ring-1 ring-border transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(meal)}
        className="flex flex-1 flex-col gap-1.5 p-4 pb-3 text-left focus:outline-none"
        aria-label={`Why ${meal.name}?`}
      >
        <span className="flex items-center justify-between gap-2 text-[11px] text-ink-subtle">
          <span>
            <span className="font-semibold uppercase tracking-wide">{MEAL_TYPE_LABELS[meal.type]}</span>
            {" · "}
            {time.label}
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {meal.prepMinutes} min
          </span>
        </span>
        <span className="text-base font-semibold leading-snug">{meal.name}</span>
        <span className="text-xs text-ink-subtle">{meal.cuisine}</span>
        <span className="mt-1.5 text-sm tabular-nums text-ink-muted">
          <span className="font-semibold text-ink">{fmtNumber(Math.round(meal.totals.calories))} kcal</span>
          {" · "}
          {Math.round(meal.totals.proteinG)} g protein
          {" · "}
          {fmtUsd(meal.totals.costUsd)}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pl-4">
        <button
          type="button"
          onClick={() => onOpen(meal)}
          className="flex h-9 items-center gap-1.5 rounded-md text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Why
          {notes > 0 && (
            <span className="text-ink-subtle">
              · {notes} {notes === 1 ? "note" : "notes"}
            </span>
          )}
        </button>
        <div className="flex items-center">
          <RateButton
            active={liked === true}
            onClick={() => onRate(true)}
            label="I like this meal"
            icon={ThumbsUp}
            activeClass="bg-success-soft text-brand-dark"
          />
          <RateButton
            active={liked === false}
            onClick={() => onRate(false)}
            label="Not for me"
            icon={ThumbsDown}
            activeClass="bg-danger-soft text-danger"
          />
        </div>
      </div>
    </article>
  );
}

function RateButton({
  active,
  onClick,
  label,
  icon: Icon,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof ThumbsUp;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && activeClass,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
