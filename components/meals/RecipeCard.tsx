"use client";

import { ChevronRight, Clock, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, fmtNumber, fmtUsd } from "@/lib/utils";
import type { Recipe } from "@/types/contracts";
import { MEAL_TYPE_LABELS, TYPE_VARIANT } from "./MealCard";
import { MEAL_TIME_OF_DAY } from "./mealTime";
import { DEFAULT_MEAL_IMAGE, recipeImageUrl } from "./meal-image";

export interface RecipeCardProps {
  recipe: Recipe;
  onOpen: (recipe: Recipe) => void;
  onSwap: (recipe: Recipe) => void;
  /** This card is being swapped right now. */
  swapping?: boolean;
  /** Another action (week regeneration or a different swap) is running. */
  disabled?: boolean;
  className?: string;
}

export function RecipeCard({
  recipe,
  onOpen,
  onSwap,
  swapping = false,
  disabled = false,
  className,
}: RecipeCardProps) {
  const n = recipe.nutritionPerServing;
  const time = MEAL_TIME_OF_DAY[recipe.mealType];

  return (
    <article
      data-testid="meal-card"
      aria-busy={swapping}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-surface-raised p-4 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
        swapping && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(recipe)}
        disabled={swapping}
        className="flex flex-col gap-2 text-left focus:outline-none"
        aria-label={`Recipe for ${recipe.title}`}
      >
        <img
          src={recipeImageUrl(recipe)}
          onError={(e) => {
            // Provider image fails -> keyword photo; keyword photo fails -> the generic one.
            const keyword = recipeImageUrl(recipe, { ignoreProvided: true });
            const next = e.currentTarget.src === keyword ? DEFAULT_MEAL_IMAGE : keyword;
            if (e.currentTarget.src !== next) e.currentTarget.src = next;
          }}
          alt={`${recipe.title} dish`}
          loading="lazy"
          className="h-40 w-full rounded-lg object-cover"
        />
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Badge variant={TYPE_VARIANT[recipe.mealType]}>{MEAL_TYPE_LABELS[recipe.mealType]}</Badge>
            <span className="text-xs text-ink-subtle">{time.label}</span>
          </span>
          <span className="flex items-center gap-1 text-xs text-ink-subtle">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {recipe.totalMinutes} min
          </span>
        </div>
        <h3 className="font-semibold leading-snug">{recipe.title}</h3>
        {recipe.description && <p className="line-clamp-2 text-xs text-ink-muted">{recipe.description}</p>}
        {recipe.ruleWarnings.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{recipe.ruleWarnings[0]}</span>
          </p>
        )}
        {recipe.nutritionSource === "math" && n.calories !== null ? (
          <dl className="grid grid-cols-4 gap-1 text-center text-xs">
            <Stat label="kcal" value={fmtNumber(Math.round(n.calories))} />
            <Stat label="Prot" value={n.proteinGrams === null ? "–" : `${Math.round(n.proteinGrams)}g`} />
            <Stat
              label="Carbs"
              value={n.carbohydratesGrams === null ? "–" : `${Math.round(n.carbohydratesGrams)}g`}
            />
            <Stat
              label="Cost"
              value={recipe.estimatedCostPerServing === null ? "–" : fmtUsd(recipe.estimatedCostPerServing)}
              highlight
            />
          </dl>
        ) : (
          <p className="rounded-md bg-surface-sunken px-2 py-1.5 text-xs text-ink-muted">
            Nutrition unavailable: some ingredients could not be matched.
          </p>
        )}
        <span className="flex items-center gap-0.5 text-xs font-medium text-brand group-hover:underline">
          View recipe & ingredients
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
      <div className="mt-auto flex items-center justify-end border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="meal-swap"
          onClick={() => onSwap(recipe)}
          disabled={swapping || disabled}
          aria-label={`Swap ${recipe.title} for another ${MEAL_TYPE_LABELS[recipe.mealType].toLowerCase()}`}
        >
          {swapping ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          {swapping ? "Finding another…" : "Swap dish"}
        </Button>
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
