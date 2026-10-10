"use client";

import { Lightbulb, TrendingUp } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AGENT_NAMES } from "@/components/agents/agent-theme";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsLaptop } from "@/lib/hooks/useMediaQuery";
import { fmtNumber, fmtUsd, plural } from "@/lib/utils";
import type { Meal, ShadowPrice } from "@/types/contracts";
import { MEAL_TYPE_LABELS } from "./MealCard";

export interface WhySheetProps {
  meal: Meal | null;
  shadowPrices: ShadowPrice[];
  /** One sentence from the budget tradeoff curve (feature 7), when it has loaded. */
  curveInsight?: string;
  onClose: () => void;
}

const LABEL = "text-xs font-semibold uppercase tracking-wide text-ink-subtle";

export function WhySheet({ meal, shadowPrices, curveInsight, onClose }: WhySheetProps) {
  const laptop = useIsLaptop();

  return (
    <Sheet open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={laptop ? "right" : "bottom"} data-testid="why-sheet" className="gap-6">
        {meal && (
          <>
            <SheetHeader>
              <p className={LABEL}>
                {MEAL_TYPE_LABELS[meal.type]} · {meal.cuisine} · {meal.prepMinutes} min
              </p>
              <SheetTitle>{meal.name}</SheetTitle>
              <SheetDescription>What each agent said</SheetDescription>
            </SheetHeader>

            <ul className="space-y-3" aria-label="Agent explanations">
              {meal.explanation.map((note, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <AgentAvatar agent={note.agent} size="sm" />
                  <div className="min-w-0 rounded-2xl rounded-tl-sm bg-surface-sunken px-3 py-2 text-sm">
                    <p className="text-xs font-semibold text-ink-muted">{AGENT_NAMES[note.agent]}</p>
                    <p>{note.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <section>
              <h4 className={`${LABEL} mb-2`}>Ingredients</h4>
              <ul className="divide-y divide-border/70">
                {meal.items.map((item) => (
                  <li key={item.foodId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {item.grams} g · {plural(item.servings, "serving")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h4 className={`${LABEL} mb-2`}>Totals</h4>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
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
                <h4 className={`${LABEL} mb-2`}>Recipe</h4>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
                  {meal.recipeSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </section>
            )}

            {curveInsight && (
              <p data-testid="why-curve" className="flex items-start gap-2 text-sm text-ink-muted">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-agent-budget" aria-hidden="true" />
                <span>
                  <span className="font-semibold text-ink">On the budget curve:</span> {curveInsight}
                </span>
              </p>
            )}

            {shadowPrices.length > 0 && (
              <section>
                <h4 className={`${LABEL} mb-2 flex items-center gap-1.5`}>
                  <Lightbulb className="h-3.5 w-3.5 text-agent-budget" aria-hidden="true" />
                  What would change
                </h4>
                <ul className="space-y-1.5 text-sm text-ink-muted">
                  {shadowPrices.map((sp) => (
                    <li key={sp.constraint} className="flex gap-2">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-agent-budget"
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
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-ink-subtle">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
