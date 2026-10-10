"use client";

import { Clock, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { Badge } from "@/components/ui/badge";
import { useRateMeal } from "@/lib/hooks/usePlan";
import { cn, fmtNumber, fmtUsd } from "@/lib/utils";
import type { Meal, MealType } from "@/types/contracts";

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const TYPE_VARIANT: Record<MealType, "warning" | "success" | "secondary" | "outline"> = {
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

export function MealCard({ meal, onOpen, className }: MealCardProps) {
  const rate = useRateMeal();
  const [liked, setLiked] = useState<boolean | null>(null);

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
        "group flex flex-col gap-3 rounded-xl border bg-surface-raised p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(meal)}
        className="flex flex-col gap-2 text-left focus:outline-none"
        aria-label={`Why ${meal.name}?`}
      >
        <div className="flex items-start justify-between gap-2">
          <Badge variant={TYPE_VARIANT[meal.type]}>{MEAL_TYPE_LABELS[meal.type]}</Badge>
          <span className="flex items-center gap-1 text-xs text-ink-subtle">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {meal.prepMinutes} min
          </span>
        </div>
        <h3 className="font-semibold leading-snug">{meal.name}</h3>
        <p className="text-xs text-ink-muted">{meal.cuisine}</p>
        <dl className="grid grid-cols-5 gap-1 text-center text-xs">
          <Stat label="kcal" value={fmtNumber(Math.round(meal.totals.calories))} />
          <Stat label="Prot" value={`${Math.round(meal.totals.proteinG)}g`} />
          <Stat label="Carbs" value={`${Math.round(meal.totals.carbsG)}g`} />
          <Stat label="Fat" value={`${Math.round(meal.totals.fatG)}g`} />
          <Stat label="Cost" value={fmtUsd(meal.totals.costUsd)} highlight />
        </dl>
      </button>
      <div className="flex items-center justify-between border-t pt-2">
        <div className="flex -space-x-1">
          {meal.explanation.map((n, i) => (
            <AgentAvatar
              key={`${n.agent}-${i}`}
              agent={n.agent}
              size="xs"
              className="ring-2 ring-surface-raised"
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
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

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-surface-sunken px-1 py-1">
      <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", highlight && "text-agent-budget")}>{value}</dd>
    </div>
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
        "rounded-full p-1.5 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink",
        active && activeClass,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
