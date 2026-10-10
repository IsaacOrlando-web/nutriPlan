"use client";

import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLaptop } from "@/lib/hooks/useMediaQuery";
import { fmtNumber, fmtUsd } from "@/lib/utils";
import type { Recipe } from "@/types/contracts";
import { MEAL_TYPE_LABELS } from "./MealCard";
import { DEFAULT_MEAL_IMAGE, recipeImageUrl } from "./meal-image";

export interface RecipeSheetProps {
  recipe: Recipe | null;
  onClose: () => void;
}

const grams = (n: number | null, unit = "g") =>
  n === null ? "–" : `${fmtNumber(n, { maximumFractionDigits: 1 })} ${unit}`;

export function RecipeSheet({ recipe, onClose }: RecipeSheetProps) {
  const laptop = useIsLaptop();

  return (
    <Sheet open={recipe !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={laptop ? "right" : "bottom"} data-testid="recipe-sheet" className="gap-5">
        {recipe && (
          <>
            <SheetHeader>
              <img
                src={recipeImageUrl(recipe)}
                onError={(e) => {
                  // Provider image fails -> keyword photo; keyword photo fails -> the generic one.
                  const keyword = recipeImageUrl(recipe, { ignoreProvided: true });
                  const next = e.currentTarget.src === keyword ? DEFAULT_MEAL_IMAGE : keyword;
                  if (e.currentTarget.src !== next) e.currentTarget.src = next;
                }}
                alt={`${recipe.title} dish`}
                className="h-44 w-full rounded-lg object-cover"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{MEAL_TYPE_LABELS[recipe.mealType]}</Badge>
                <span className="text-xs text-ink-subtle">
                  {recipe.totalMinutes} min · {recipe.difficulty} · {recipe.servings}{" "}
                  {recipe.servings === 1 ? "serving" : "servings"}
                </span>
              </div>
              <SheetTitle>{recipe.title}</SheetTitle>
              {recipe.description && <SheetDescription>{recipe.description}</SheetDescription>}
            </SheetHeader>

            {recipe.ruleWarnings.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
                {recipe.ruleWarnings.map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            <section>
              <h4 className="mb-2 text-sm font-semibold">Per serving</h4>
              {recipe.nutritionSource === "math" ? (
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <Total
                    label="kcal"
                    value={
                      recipe.nutritionPerServing.calories === null
                        ? "–"
                        : fmtNumber(Math.round(recipe.nutritionPerServing.calories))
                    }
                  />
                  <Total label="Protein" value={grams(recipe.nutritionPerServing.proteinGrams)} />
                  <Total label="Carbs" value={grams(recipe.nutritionPerServing.carbohydratesGrams)} />
                  <Total label="Fat" value={grams(recipe.nutritionPerServing.fatGrams)} />
                  <Total
                    label="Cost"
                    value={
                      recipe.estimatedCostPerServing === null ? "–" : fmtUsd(recipe.estimatedCostPerServing)
                    }
                  />
                </dl>
              ) : (
                <p className="text-sm text-ink-muted">
                  Nutrition unavailable. Not matched:{" "}
                  {recipe.unmatchedIngredients.join(", ") || "some ingredients"}.
                </p>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Ingredients</h4>
              <ul className="divide-y rounded-lg border">
                {recipe.ingredients.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      {item.name}
                      {item.optionalNotes && <span className="text-ink-subtle"> · {item.optionalNotes}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {item.quantity === null ? item.unit : `${fmtNumber(item.quantity)} ${item.unit}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {recipe.instructions.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold">
                  Steps · {recipe.preparationMinutes} min prep
                  {recipe.cookingMinutes > 0 && ` + ${recipe.cookingMinutes} min cooking`}
                </h4>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
                  {recipe.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            {recipe.storageNotes && <p className="text-sm text-ink-muted">{recipe.storageNotes}</p>}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-2 py-1.5">
      <dt className="text-[11px] uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
