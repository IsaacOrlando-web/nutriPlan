"use client";

import { ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { BudgetSlider } from "@/components/meals/BudgetSlider";
import { MealCard } from "@/components/meals/MealCard";
import { WhySheet } from "@/components/meals/WhySheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePlan } from "@/lib/hooks/usePlan";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, fmtDate, fmtNumber, fmtUsd, todayIso } from "@/lib/utils";
import type { Meal, MealPlan } from "@/types/contracts";

export default function PlanPage() {
  const plan = usePlan();
  const profile = useProfile();

  return (
    <div data-testid="plan-screen" className="space-y-6">
      {plan.isLoading && <LoadingState variant="page" />}
      {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
      {plan.data && plan.data.days.length === 0 && (
        <EmptyState
          title="No plan yet"
          body="Finish onboarding and the agents will build your first week."
          action={
            <Button asChild>
              <Link href="/onboarding">Build my plan</Link>
            </Button>
          }
        />
      )}
      {plan.data && plan.data.days.length > 0 && (
        <PlanView plan={plan.data} budget={profile.data?.profile.weeklyBudgetUsd} />
      )}
    </div>
  );
}

function PlanView({ plan, budget }: { plan: MealPlan; budget?: number }) {
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const today = todayIso();
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      plan.days.findIndex((d) => d.date === today),
    ),
  );
  useEffect(() => {
    if (selected >= plan.days.length) setSelected(0);
  }, [plan.days.length, selected]);
  const day = plan.days[selected] ?? plan.days[0];
  const effectiveBudget = budget ?? plan.weeklyCostUsd;
  const overBudget = plan.weeklyCostUsd > effectiveBudget;

  return (
    <>
      <PageHeader
        title="Your week"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">v{plan.version}</Badge>
            <span>{plan.reason}</span>
            {plan.bestEffort && <Badge variant="warning">Best effort</Badge>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/agents/${plan.runId}`}>
                <Sparkles aria-hidden="true" />
                Negotiation
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/grocery">
                <ShoppingCart aria-hidden="true" />
                Grocery list
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-1 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Weekly cost</p>
            <p className="flex items-baseline gap-2">
              <span
                data-testid="weekly-cost"
                className={cn(
                  "text-3xl font-bold tabular-nums",
                  overBudget ? "text-warning" : "text-agent-budget",
                )}
              >
                {fmtUsd(plan.weeklyCostUsd)}
              </span>
              <span className="text-sm text-ink-muted">of {fmtUsd(effectiveBudget)}</span>
            </p>
            <p className="text-xs text-ink-muted">
              {overBudget
                ? "Over budget: the agents accepted a small overage to keep every health rule."
                : `${fmtUsd(effectiveBudget - plan.weeklyCostUsd)} under budget`}
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="p-4 sm:p-5">
            <BudgetSlider value={effectiveBudget} />
          </CardContent>
        </Card>
      </div>

      {/* Day chips */}
      <div
        role="tablist"
        aria-label="Plan days"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {plan.days.map((d, i) => {
          const active = i === selected;
          return (
            <button
              key={d.date}
              role="tab"
              type="button"
              data-testid="plan-day"
              aria-selected={active}
              onClick={() => setSelected(i)}
              className={cn(
                "flex shrink-0 flex-col items-center rounded-xl border px-4 py-2 text-sm transition-colors",
                active
                  ? "border-brand bg-brand text-brand-foreground shadow-sm"
                  : "bg-surface-raised text-ink-muted hover:border-ink-subtle",
                d.date === today && !active && "border-brand/50",
              )}
            >
              <span className="text-[11px] uppercase tracking-wide">
                {fmtDate(d.date, { weekday: "short" })}
              </span>
              <span className="font-semibold">{fmtDate(d.date, { day: "numeric" })}</span>
            </button>
          );
        })}
      </div>

      {/* Day totals */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface-sunken px-4 py-3 text-sm">
        <span className="font-semibold">Day</span>
        <span>{fmtNumber(Math.round(day.dayTotals.calories))} kcal</span>
        <span className="text-ink-muted">Protein {Math.round(day.dayTotals.proteinG)} g</span>
        <span className="text-ink-muted">Carbs {Math.round(day.dayTotals.carbsG)} g</span>
        <span className="text-ink-muted">Fat {Math.round(day.dayTotals.fatG)} g</span>
        <span className="text-ink-muted">Sodium {Math.round(day.dayTotals.sodiumMg)} mg</span>
        <span className="font-semibold text-agent-budget">{fmtUsd(day.dayTotals.costUsd)}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {day.meals.map((meal) => (
          <MealCard key={meal.mealId} meal={meal} onOpen={setOpenMeal} />
        ))}
      </div>

      {plan.shadowPrices.length > 0 && (
        <Card className="border-agent-budget/30">
          <CardContent className="p-4 sm:p-5">
            <p className="mb-2 text-sm font-semibold text-agent-budget">What would change</p>
            <ul className="space-y-1 text-sm text-ink-muted">
              {plan.shadowPrices.map((sp) => (
                <li key={sp.constraint}>{sp.humanText}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <WhySheet meal={openMeal} shadowPrices={plan.shadowPrices} onClose={() => setOpenMeal(null)} />
    </>
  );
}
