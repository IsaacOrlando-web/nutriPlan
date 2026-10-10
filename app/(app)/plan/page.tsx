"use client";

import { Lightbulb, ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { BudgetSlider } from "@/components/meals/BudgetSlider";
import { MealCard } from "@/components/meals/MealCard";
import { planReasonSentence } from "@/components/meals/planReason";
import { WhySheet } from "@/components/meals/WhySheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBudgetCurve } from "@/lib/hooks/useBudgetCurve";
import { usePlan } from "@/lib/hooks/usePlan";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, fmtDate, fmtNumber, fmtUsd, todayIso } from "@/lib/utils";
import type { Meal, MealPlan } from "@/types/contracts";

export default function PlanPage() {
  const plan = usePlan();
  const profile = useProfile();

  return (
    <div data-testid="plan-screen" className="space-y-6">
      {plan.isLoading && <PlanSkeleton />}
      {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
      {!plan.isLoading && !plan.error && (!plan.data || plan.data.days.length === 0) && (
        <>
          <PageHeader title="Your week" subtitle="Seven days of meals, built by four AI agents." />
          <EmptyState
            title="No plan yet"
            body="Answer a few questions and Doctor, Chef, Budget and Monitor will build your first week."
            action={
              <Button asChild>
                <Link href="/onboarding">Build my plan</Link>
              </Button>
            }
          />
        </>
      )}
      {plan.data && plan.data.days.length > 0 && (
        <PlanView plan={plan.data} budget={profile.data?.profile.weeklyBudgetUsd} />
      )}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading your week">
      <div className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-sunken" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-surface-sunken" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-16 w-14 animate-pulse rounded-xl bg-surface-sunken" />
        ))}
      </div>
      <LoadingState variant="cards" rows={3} />
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
  // Mounting the hook here warms the tradeoff curve as soon as the plan is on screen (feature 7).
  const curve = useBudgetCurve();
  const insights = curve.data?.curve.insights ?? [];
  const curveInsight = insights.find((s) => s.includes(fmtUsd(effectiveBudget, true))) ?? insights[0];
  // Budget's notes: what the optimizer says would change (plan shadow prices), then the curve insights.
  const notes = Array.from(new Set([...plan.shadowPrices.map((sp) => sp.humanText), ...insights]));
  const dayName = fmtDate(day.date, { weekday: "long" });

  return (
    <>
      <PageHeader
        title="Your week"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{planReasonSentence(plan)}</span>
            <Badge variant="secondary" className="font-medium">
              Version {plan.version}
            </Badge>
            {plan.bestEffort && <Badge variant="warning">Best effort</Badge>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/agents/${plan.runId}`}>
                <Sparkles aria-hidden="true" />
                Watch the negotiation
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

      {/* Day selector */}
      <section className="space-y-4" aria-labelledby="pick-a-day">
        <h2 id="pick-a-day" className="sr-only">
          Pick a day
        </h2>
        <div
          role="tablist"
          aria-label="Plan days"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          {plan.days.map((d, i) => {
            const active = i === selected;
            const isToday = d.date === today;
            return (
              <button
                key={d.date}
                role="tab"
                type="button"
                data-testid="plan-day"
                aria-selected={active}
                aria-label={`${fmtDate(d.date, { weekday: "long", month: "long", day: "numeric" })}${isToday ? ", today" : ""}`}
                onClick={() => setSelected(i)}
                className={cn(
                  "flex min-w-[4rem] shrink-0 flex-col items-center rounded-xl px-3 py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "bg-surface-raised text-ink-muted ring-1 ring-border hover:ring-ink-subtle",
                )}
              >
                <span className="text-[11px] uppercase tracking-wide">
                  {fmtDate(d.date, { weekday: "short" })}
                </span>
                <span className="text-lg font-semibold leading-tight">
                  {fmtDate(d.date, { day: "numeric" })}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    active ? "text-brand-foreground/90" : "text-brand",
                    !isToday && "invisible",
                  )}
                >
                  Today
                </span>
              </button>
            );
          })}
        </div>

        {/* Day totals in words */}
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">{dayName}</span> adds up to{" "}
          <span className="font-semibold text-ink tabular-nums">
            {fmtNumber(Math.round(day.dayTotals.calories))} kcal
          </span>
          , {Math.round(day.dayTotals.proteinG)} g protein, {Math.round(day.dayTotals.carbsG)} g carbs,{" "}
          {Math.round(day.dayTotals.fatG)} g fat and {fmtNumber(Math.round(day.dayTotals.sodiumMg))} mg
          sodium, for{" "}
          <span className="font-semibold text-agent-budget tabular-nums">
            {fmtUsd(day.dayTotals.costUsd)}
          </span>
          .
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {day.meals.map((meal) => (
            <MealCard key={meal.mealId} meal={meal} onOpen={setOpenMeal} />
          ))}
        </div>
      </section>

      {/* Budget tradeoff */}
      <section className="space-y-4" aria-labelledby="budget-tradeoff">
        <div>
          <h2 id="budget-tradeoff" className="text-lg font-semibold">
            Budget tradeoff
          </h2>
          <p className="text-sm text-ink-muted">
            What this week costs, and what a different weekly budget would buy.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-0 shadow-sm ring-1 ring-border lg:col-span-1 lg:self-start">
            <CardContent className="space-y-1 p-4 sm:p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted">This week costs</p>
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
                <span className="text-sm text-ink-muted">of your {fmtUsd(effectiveBudget)} budget</span>
              </p>
              <p className="text-xs text-ink-muted">
                {overBudget
                  ? "Over budget: the agents accepted a small overage rather than break a health rule."
                  : `${fmtUsd(effectiveBudget - plan.weeklyCostUsd)} under budget, with every health rule kept.`}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm ring-1 ring-border lg:col-span-2">
            <CardContent className="p-4 sm:p-5">
              <BudgetSlider value={effectiveBudget} showInsights={false} />
            </CardContent>
          </Card>
        </div>

        {notes.length > 0 && (
          <Card className="border-0 shadow-sm ring-1 ring-agent-budget/25">
            <CardContent className="p-4 sm:p-5">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-agent-budget">
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                What would change
              </p>
              <p className="mb-3 text-xs text-ink-muted">
                Straight from the optimizer: how much each rule or dollar is shaping this week.
              </p>
              <ul className="space-y-1.5 text-sm text-ink-muted" data-testid="budget-insights">
                {notes.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-agent-budget"
                      aria-hidden="true"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <WhySheet
        meal={openMeal}
        shadowPrices={plan.shadowPrices}
        curveInsight={curveInsight}
        onClose={() => setOpenMeal(null)}
      />
    </>
  );
}
