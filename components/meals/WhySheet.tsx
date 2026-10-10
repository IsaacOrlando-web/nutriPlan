"use client";

import { Lightbulb } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AGENT_NAMES } from "@/components/agents/agent-theme";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLaptop } from "@/lib/hooks/useMediaQuery";
import { fmtNumber, fmtUsd, plural } from "@/lib/utils";
import type { Meal, ShadowPrice } from "@/types/contracts";
import { MEAL_TYPE_LABELS } from "./MealCard";

export interface WhySheetProps {
  meal: Meal | null;
  shadowPrices: ShadowPrice[];
  onClose: () => void;
}

export function WhySheet({ meal, shadowPrices, onClose }: WhySheetProps) {
  const laptop = useIsLaptop();

  return (
    <Sheet open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={laptop ? "right" : "bottom"} data-testid="why-sheet" className="gap-5">
        {meal && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{MEAL_TYPE_LABELS[meal.type]}</Badge>
                <span className="text-xs text-ink-subtle">{meal.cuisine}</span>
              </div>
              <SheetTitle>{meal.name}</SheetTitle>
              <SheetDescription>Why this meal, from each agent</SheetDescription>
            </SheetHeader>

            <ul className="space-y-3" aria-label="Agent explanations">
              {meal.explanation.map((note, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <AgentAvatar agent={note.agent} size="sm" />
                  <div className="min-w-0 rounded-2xl rounded-tl-sm border bg-surface-raised px-3 py-2 text-sm">
                    <p className="text-xs font-semibold text-ink-muted">{AGENT_NAMES[note.agent]}</p>
                    <p>{note.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Separator />

            <section>
              <h4 className="mb-2 text-sm font-semibold">Ingredients</h4>
              <ul className="divide-y rounded-lg border">
                {meal.items.map((item) => (
                  <li key={item.foodId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {item.grams} g · {plural(item.servings, "serving")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Totals</h4>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <Total label="kcal" value={fmtNumber(Math.round(meal.totals.calories))} />
                <Total label="Protein" value={`${meal.totals.proteinG} g`} />
                <Total label="Carbs" value={`${meal.totals.carbsG} g`} />
                <Total label="Fat" value={`${meal.totals.fatG} g`} />
                <Total label="Fiber" value={`${meal.totals.fiberG} g`} />
                <Total label="Sodium" value={`${meal.totals.sodiumMg} mg`} />
                <Total label="Glycemic load" value={String(meal.totals.glycemicLoad)} />
                <Total label="Sat. fat" value={`${meal.totals.satFatG} g`} />
                <Total label="Cost" value={fmtUsd(meal.totals.costUsd)} />
              </dl>
            </section>

            {meal.recipeSteps.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold">Recipe · {meal.prepMinutes} min</h4>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
                  {meal.recipeSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            {shadowPrices.length > 0 && (
              <section className="rounded-xl border border-agent-budget/30 bg-agent-budget/10 p-3">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-agent-budget">
                  <Lightbulb className="h-4 w-4" aria-hidden="true" />
                  What would change
                </h4>
                <ul className="space-y-1.5 text-sm">
                  {shadowPrices.map((sp) => (
                    <li key={sp.constraint} className="flex gap-2">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-agent-budget"
                        aria-hidden="true"
                      />
                      <span>{sp.humanText}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
