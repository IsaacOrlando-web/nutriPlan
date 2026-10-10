"use client";

import { Check, Lightbulb, ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { BudgetSlider } from "@/components/meals/BudgetSlider";
import { MealCard } from "@/components/meals/MealCard";
import { planReasonSentence } from "@/components/meals/planReason";
import { WhySheet } from "@/components/meals/WhySheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgetCurve } from "@/lib/hooks/useBudgetCurve";
import { usePlan } from "@/lib/hooks/usePlan";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, fmtDate, fmtNumber, fmtUsd, todayIso } from "@/lib/utils";
import type { DailyTargets, Meal, MealPlan, MealTotals } from "@/types/contracts";

const LABEL = "text-xs font-semibold uppercase tracking-wide text-ink-subtle";

export default function PlanPage() {
  const plan = usePlan();
  const profile = useProfile();

  return (
    <div data-testid="plan-screen" className="space-y-8">
      {plan.isLoading && <PlanSkeleton />}
      {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
      {!plan.isLoading && !plan.error && (!plan.data || plan.data.days.length === 0) && (
        <>
          <PageHeader title="Your week" />
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-sunken px-4 py-3">
            <p className="text-sm text-ink-muted">No plan yet.</p>
            <Button asChild size="sm">
              <Link href="/onboarding">Build my plan</Link>
            </Button>
          </div>
        </>
      )}
      {plan.data && plan.data.days.length > 0 && (
        <PlanView
          plan={plan.data}
          budget={profile.data?.profile.weeklyBudgetUsd}
          targets={profile.data?.targets}
          targetsLoading={profile.isLoading}
        />
      )}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading your week">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-12 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

interface PlanViewProps {
  plan: MealPlan;
  budget?: number;
  targets?: DailyTargets;
  targetsLoading: boolean;
}

function PlanView({ plan, budget, targets, targetsLoading }: PlanViewProps) {
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
  const first = plan.days[0].date;
  const last = plan.days[plan.days.length - 1].date;
  const range = `${fmtDate(first, { month: "short", day: "numeric" })} – ${fmtDate(last, { month: "short", day: "numeric" })}`;
  const mealCols = day.meals.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <>
      <PageHeader
        title="Your week"
        subtitle={
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span>
                {range} · Version {plan.version}
              </span>
              {plan.bestEffort && <Badge variant="warning">Best effort</Badge>}
            </span>
            {plan.version > 1 && <span>{planReasonSentence(plan)}</span>}
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

      {/* Day picker, day totals and meals */}
      <section className="space-y-5" aria-labelledby="pick-a-day">
        <h2 id="pick-a-day" className="sr-only">
          Pick a day
        </h2>
        <div
          role="tablist"
          aria-label="Plan days"
          className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
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
                  "flex h-14 min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-xl px-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active ? "bg-ink text-surface-raised shadow-sm" : "text-ink-muted hover:bg-surface-sunken",
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    !active && "text-ink-subtle",
                  )}
                >
                  {fmtDate(d.date, { weekday: "short" })}
                </span>
                <span className="text-base font-semibold leading-tight tabular-nums">
                  {fmtDate(d.date, { day: "numeric" })}
                </span>
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full",
                    active ? "bg-surface-raised" : "bg-brand",
                    !isToday && "invisible",
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-end lg:gap-10">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">{fmtDate(day.date, { weekday: "long" })}</h3>
            <p className="mt-1 text-sm tabular-nums text-ink-muted">
              <span className="font-semibold text-ink">
                {fmtNumber(Math.round(day.dayTotals.calories))} kcal
              </span>
              {" · "}
              {Math.round(day.dayTotals.carbsG)} g carbs · {Math.round(day.dayTotals.fatG)} g fat
              {" · "}
              <span className="font-semibold text-ink">{fmtUsd(day.dayTotals.costUsd)}</span>
            </p>
          </div>
          <DayTargets totals={day.dayTotals} targets={targets} loading={targetsLoading} />
        </div>

        <div className={cn("grid gap-3 sm:grid-cols-2", mealCols)}>
          {day.meals.map((meal) => (
            <MealCard key={meal.mealId} meal={meal} onOpen={setOpenMeal} />
          ))}
        </div>
      </section>

      {/* Budget */}
      <section className="space-y-4" aria-labelledby="budget-tradeoff">
        <h2 id="budget-tradeoff" className={LABEL}>
          Budget
        </h2>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
          <div className="space-y-8">
            <div>
              <p className="text-sm text-ink-muted">This week costs</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span
                  data-testid="weekly-cost"
                  className={cn(
                    "text-5xl font-bold tracking-tight tabular-nums",
                    overBudget ? "text-warning" : "text-ink",
                  )}
                >
                  {fmtUsd(plan.weeklyCostUsd)}
                </span>
                <span className="text-base text-ink-muted">of {fmtUsd(effectiveBudget, true)}</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
                {overBudget ? (
                  "Over budget. A small overage beat breaking a health rule."
                ) : (
                  <>
                    <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    {fmtUsd(effectiveBudget - plan.weeklyCostUsd)} under · every rule kept
                  </>
                )}
              </p>
            </div>

            {notes.length > 0 && (
              <div>
                <p className={cn(LABEL, "flex items-center gap-1.5")}>
                  <Lightbulb className="h-3.5 w-3.5 text-agent-budget" aria-hidden="true" />
                  What would change
                </p>
                <ul
                  className="mt-2 divide-y divide-border/70 text-sm text-ink-muted"
                  data-testid="budget-insights"
                >
                  {notes.map((line) => (
                    <li key={line} className="py-2">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-raised p-4 shadow-sm ring-1 ring-border sm:p-5">
            <BudgetSlider value={effectiveBudget} showInsights={false} />
          </div>
        </div>
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

interface TargetRow {
  key: string;
  label: string;
  value: number;
  target: number;
  unit: string;
  /** "min" targets are met at or above the number, "max" caps are met at or below it. */
  kind: "min" | "max";
}

/**
 * The day against the profile targets: protein, fiber and the sodium cap. Every number comes from the
 * API; the only arithmetic is the ratio that sets a bar's width.
 */
function DayTargets({
  totals,
  targets,
  loading,
}: {
  totals: MealTotals;
  targets?: DailyTargets;
  loading: boolean;
}) {
  if (!targets) {
    if (!loading) return null;
    return (
      <div className="grid grid-cols-3 gap-4" role="status" aria-label="Loading targets">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  const rows: TargetRow[] = [
    {
      key: "protein",
      label: "Protein",
      value: totals.proteinG,
      target: targets.proteinG,
      unit: "g",
      kind: "min",
    },
    { key: "fiber", label: "Fiber", value: totals.fiberG, target: targets.fiberG, unit: "g", kind: "min" },
    {
      key: "sodium",
      label: "Sodium cap",
      value: totals.sodiumMg,
      target: targets.sodiumMg,
      unit: "mg",
      kind: "max",
    },
  ];
  return (
    <ul className="grid grid-cols-3 gap-4" data-testid="plan-targets" aria-label="Day against targets">
      {rows.map((r) => {
        const ratio = r.target > 0 ? r.value / r.target : 0;
        const met = r.kind === "min" ? ratio >= 1 : ratio <= 1;
        const fill = met ? "bg-success" : r.kind === "max" ? "bg-danger" : "bg-ink-subtle";
        return (
          <li
            key={r.key}
            data-testid="plan-target"
            className="min-w-0 space-y-1.5"
            aria-label={`${r.label} ${fmtNumber(Math.round(r.value))} of ${fmtNumber(r.target)} ${r.unit}, ${met ? "met" : "not met"}`}
          >
            <div className="flex items-baseline justify-between gap-1 text-[11px]">
              <span className="flex items-center gap-1 truncate font-medium text-ink-muted">
                {r.label}
                {met && <Check className="h-3 w-3 text-success" aria-hidden="true" />}
              </span>
              <span className="shrink-0 tabular-nums text-ink-subtle">
                {fmtNumber(Math.round(r.value))} / {fmtNumber(r.target)} {r.unit}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", fill)}
                style={{ width: `${Math.min(100, ratio * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
