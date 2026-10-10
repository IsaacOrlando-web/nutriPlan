"use client";

import { ChefHat } from "lucide-react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { fmtUsd } from "@/lib/utils";
import type { RecipeIdea } from "@/types/contracts";

export interface RecipeIdeasProps {
  meals?: RecipeIdea[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

/** Two recipe ideas from the recipes agent: name, price (from /math) and ingredients. */
export function RecipeIdeas({ meals, isLoading, error, onRetry }: RecipeIdeasProps) {
  if (isLoading) return <LoadingState variant="cards" rows={2} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!meals?.length) return null;

  return (
    <section className="space-y-3" aria-labelledby="recipe-ideas" data-testid="recipe-ideas">
      <h2 id="recipe-ideas" className="flex items-center gap-1.5 text-lg font-semibold">
        <ChefHat className="h-5 w-5 text-agent-chef" aria-hidden="true" />
        Recipe ideas for you
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {meals.map((meal) => (
          <Card key={meal.name} data-testid="recipe-idea" className="border-0 shadow-sm ring-1 ring-border">
            <CardContent className="space-y-2 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{meal.name}</p>
                <span className="shrink-0 font-semibold tabular-nums text-agent-budget">
                  {fmtUsd(meal.price)}
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5 text-xs text-ink-muted">
                {meal.ingredients.map((ing) => (
                  <li key={ing} className="rounded-full bg-surface-sunken px-2 py-0.5">
                    {ing}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
