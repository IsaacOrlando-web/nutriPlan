"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { BudgetSlider } from "@/components/meals/BudgetSlider";
import { MonthSchedule, monthOfWeek } from "@/components/meals/MonthSchedule";
import { RecipeCard } from "@/components/meals/RecipeCard";
import { RecipeSheet } from "@/components/meals/RecipeSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBudgetCurve } from "@/lib/hooks/useBudgetCurve";
import { usePlan } from "@/lib/hooks/usePlan";
import {
  mondayOf,
  useGenerateWeek,
  useRegenerateAgentPlan,
  useReplaceRecipe,
  useWeekPlan,
} from "@/lib/hooks/usePlanner";
import { useProfile } from "@/lib/hooks/useProfile";
import { addDays, formatWeekRange, weekStartOf } from "@/lib/planner/dates";
import { cn, fmtDate, fmtUsd, todayIso } from "@/lib/utils";
import type { MealPlan, PlannerDay, PlannerMealType, Recipe, WeeklyMealPlan } from "@/types/contracts";

const MEAL_TYPES: PlannerMealType[] = ["breakfast", "lunch", "dinner"];
const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export default function PlanPage() {
  const today = todayIso();
  const currentWeek = mondayOf(today);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [focusDate, setFocusDate] = useState(today);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [monthOpen, setMonthOpen] = useState(false);
  const week = useWeekPlan(weekStart);
  const agentPlan = usePlan();
  const profile = useProfile();
  const generate = useGenerateWeek();
  const agentRegen = useRegenerateAgentPlan();
  const plan = week.data?.plan ?? null;
  const isCurrentWeek = weekStart === currentWeek;

  /** Opens the week that contains `date` with that day selected (from the calendar or the week arrows). */
  const openDate = (date: string) => {
    setWeekStart(weekStartOf(date));
    setFocusDate(date);
    setMonth(date.slice(0, 7));
    setMonthOpen(false);
  };
  const openWeek = (monday: string) => {
    setWeekStart(monday);
    setFocusDate(monday === currentWeek ? today : monday);
    setMonth(monthOfWeek(monday));
  };

  const calendar = (className?: string) => (
    <MonthSchedule
      month={month}
      onMonthChange={setMonth}
      weekStart={weekStart}
      focusDate={focusDate}
      today={today}
      onPickDate={openDate}
      className={className}
    />
  );
  const weekSwitcher = (
    <WeekSwitcher
      weekStart={weekStart}
      isCurrentWeek={isCurrentWeek}
      onChange={openWeek}
      onToday={() => openDate(today)}
      onOpenMonth={() => setMonthOpen(true)}
    />
  );

  // One click refreshes both: the recipes (planner) and the agents' optimizer plan behind the grocery list,
  // weekly cost, budget tradeoff and "What would change". They run in parallel and settle independently.
  const regenerate = () => {
    generate.mutate(
      { weekStartDate: weekStart },
      {
        onSuccess: () => toast.success(`Fresh recipes for ${formatWeekRange(weekStart)}.`),
        onError: (err) => toast.error(errorMessage(err, "Could not generate the week.")),
      },
    );
    // The agents' optimizer plan (grocery list, budget) is about this week only; other weeks just get recipes.
    if (isCurrentWeek && !agentRegen.isPending)
      agentRegen.mutate(undefined, {
        onSuccess: () => toast.success("Grocery list and budget updated."),
        onError: (err) => toast.error(errorMessage(err, "Could not update the grocery list and budget.")),
      });
  };

  return (
    <div data-testid="plan-screen" className="space-y-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-6">
          {week.isLoading && <PlanSkeleton />}
          {week.error && <ErrorState error={week.error} onRetry={() => void week.refetch()} />}
          {!week.isLoading && !week.error && !plan && (
            <>
              <PageHeader
                title={isCurrentWeek ? "Your week" : "Plan a week"}
                subtitle="Seven days of breakfasts, lunches and dinners, built around your rules."
              />
              {weekSwitcher}
              {generate.isPending ? (
                <GeneratingWeek />
              ) : (
                <EmptyState
                  title={isCurrentWeek ? "No plan yet" : "No plan for this week yet"}
                  body="Chef writes 21 recipes that respect your allergies, restrictions and budget."
                  action={
                    <div className="flex flex-col items-center gap-2">
                      <Button data-testid="plan-build" onClick={regenerate}>
                        <Sparkles aria-hidden="true" />
                        Generate my week
                      </Button>
                      {isCurrentWeek && (
                        <Link
                          href="/onboarding"
                          className="text-sm text-ink-muted underline-offset-4 hover:underline"
                        >
                          Answer a few questions first
                        </Link>
                      )}
                    </div>
                  }
                />
              )}
            </>
          )}
          {plan && (
            <WeekView
              key={plan.weekStartDate}
              plan={plan}
              isCurrentWeek={isCurrentWeek}
              focusDate={focusDate}
              onFocusDate={setFocusDate}
              weekSwitcher={weekSwitcher}
              regenerating={generate.isPending}
              onRegenerate={regenerate}
              agentRunId={agentPlan.data?.runId}
            />
          )}
        </div>
        {calendar("hidden lg:sticky lg:top-6 lg:block")}
      </div>

      <Sheet open={monthOpen} onOpenChange={setMonthOpen}>
        <SheetContent side="bottom" className="gap-4 lg:hidden">
          <SheetHeader>
            <SheetTitle>Month schedule</SheetTitle>
            <SheetDescription>Every week you generate is saved. Tap a day to open it.</SheetDescription>
          </SheetHeader>
          {calendar("shadow-none ring-0")}
        </SheetContent>
      </Sheet>

      {!isCurrentWeek ? null : agentPlan.data && agentPlan.data.days.length > 0 ? (
        <BudgetSection
          plan={agentPlan.data}
          budget={profile.data?.profile.weeklyBudgetUsd}
          updating={agentRegen.isPending}
        />
      ) : (
        agentRegen.isPending && <BudgetUpdating />
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

function GeneratingWeek() {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
        Chef is writing 21 recipes. This can take a minute.
      </p>
      <LoadingState variant="cards" rows={3} />
    </div>
  );
}

function WeekSwitcher({
  weekStart,
  isCurrentWeek,
  onChange,
  onToday,
  onOpenMonth,
}: {
  weekStart: string;
  isCurrentWeek: boolean;
  onChange: (monday: string) => void;
  onToday: () => void;
  onOpenMonth: () => void;
}) {
  return (
    <div className="flex items-center gap-1" data-testid="plan-week-switcher">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        data-testid="plan-week-prev"
        aria-label="Previous week"
        onClick={() => onChange(addDays(weekStart, -7))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <p className="min-w-0 text-sm font-medium tabular-nums" aria-live="polite">
        {formatWeekRange(weekStart)}
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        data-testid="plan-week-next"
        aria-label="Next week"
        onClick={() => onChange(addDays(weekStart, 7))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      {!isCurrentWeek && (
        <Button variant="link" size="sm" className="px-1" onClick={onToday}>
          This week
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="ml-auto lg:hidden"
        data-testid="plan-month-open"
        onClick={onOpenMonth}
      >
        <CalendarDays aria-hidden="true" />
        Month
      </Button>
    </div>
  );
}

function WeekView({
  plan,
  isCurrentWeek,
  focusDate,
  onFocusDate,
  weekSwitcher,
  regenerating,
  onRegenerate,
  agentRunId,
}: {
  plan: WeeklyMealPlan;
  isCurrentWeek: boolean;
  focusDate: string;
  onFocusDate: (date: string) => void;
  weekSwitcher: ReactNode;
  regenerating: boolean;
  onRegenerate: () => void;
  agentRunId?: string;
}) {
  const today = todayIso();
  const [selected, setSelectedIndex] = useState(() =>
    Math.max(
      0,
      plan.days.findIndex((d) => d.date === focusDate),
    ),
  );
  const setSelected = (i: number) => {
    setSelectedIndex(i);
    if (plan.days[i]) onFocusDate(plan.days[i].date);
  };
  // A tap on the month calendar inside this same week moves the day tab too.
  useEffect(() => {
    const i = plan.days.findIndex((d) => d.date === focusDate);
    if (i >= 0) setSelectedIndex(i);
  }, [focusDate, plan.days]);
  const [openRecipe, setOpenRecipe] = useState<Recipe | null>(null);
  const [swapping, setSwapping] = useState<PlannerMealType | null>(null);
  const swap = useReplaceRecipe();
  useEffect(() => {
    if (selected >= plan.days.length) setSelectedIndex(0);
  }, [plan.days.length, selected]);
  const day = plan.days[selected] ?? plan.days[0];

  const onSwap = (d: PlannerDay, mealType: PlannerMealType) => {
    const current = d[mealType];
    setSwapping(mealType);
    swap.mutate(
      {
        weekStartDate: plan.weekStartDate,
        date: d.date,
        mealType,
        currentRecipe: {
          title: current.title,
          mainIngredients: current.ingredients.slice(0, 3).map((i) => i.name),
        },
      },
      {
        onSuccess: ({ recipe }) => toast.success(`Swapped in ${recipe.title}.`),
        onError: (err) => toast.error(errorMessage(err, "Could not swap that dish.")),
        onSettled: () => setSwapping(null),
      },
    );
  };

  return (
    <>
      <PageHeader
        title={isCurrentWeek ? "Your week" : "Saved week"}
        subtitle={`Week of ${fmtDate(plan.weekStartDate, { month: "long", day: "numeric" })}. Tap a dish for the recipe, or swap it for another.`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              data-testid="plan-regenerate"
              onClick={onRegenerate}
              disabled={regenerating || swapping !== null}
            >
              {regenerating ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              {regenerating ? "Regenerating…" : "Regenerate week"}
            </Button>
            {agentRunId && isCurrentWeek && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/agents/${agentRunId}`}>
                  <Sparkles aria-hidden="true" />
                  Watch the negotiation
                </Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href="/grocery">
                <ShoppingCart aria-hidden="true" />
                Grocery list
              </Link>
            </Button>
          </>
        }
      />

      {weekSwitcher}

      <section className="space-y-4" aria-labelledby="pick-a-day" aria-busy={regenerating}>
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

        {regenerating ? (
          <GeneratingWeek />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MEAL_TYPES.map((type) => (
              <RecipeCard
                key={day[type].id}
                recipe={day[type]}
                onOpen={setOpenRecipe}
                onSwap={() => onSwap(day, type)}
                swapping={swapping === type}
                disabled={swapping !== null}
              />
            ))}
          </div>
        )}
      </section>

      <RecipeSheet recipe={openRecipe} onClose={() => setOpenRecipe(null)} />
    </>
  );
}

/** Budget tradeoff from the agents' optimizer plan (feature 7). */
function BudgetUpdating() {
  return (
    <p
      data-testid="budget-updating"
      role="status"
      className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-muted"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-agent-budget" aria-hidden="true" />
      The agents are rebuilding your grocery list and budget. This takes a moment.
    </p>
  );
}

function BudgetSection({ plan, budget, updating }: { plan: MealPlan; budget?: number; updating: boolean }) {
  const effectiveBudget = budget ?? plan.weeklyCostUsd;
  const overBudget = plan.weeklyCostUsd > effectiveBudget;
  // Mounting the hook here warms the tradeoff curve as soon as the plan is on screen (feature 7).
  const curve = useBudgetCurve();
  const insights = curve.data?.curve.insights ?? [];
  // Budget's notes: what the optimizer says would change (plan shadow prices), then the curve insights.
  const notes = Array.from(new Set([...plan.shadowPrices.map((sp) => sp.humanText), ...insights]));

  return (
    <section className="space-y-4" aria-labelledby="budget-tradeoff" aria-busy={updating}>
      <div>
        <h2 id="budget-tradeoff" className="text-lg font-semibold">
          Budget tradeoff
        </h2>
        <p className="text-sm text-ink-muted">
          What this week costs, and what a different weekly budget would buy.
        </p>
      </div>
      {updating && <BudgetUpdating />}
      <div className={cn("grid gap-4 lg:grid-cols-3", updating && "pointer-events-none opacity-50")}>
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
        <Card className={cn("border-0 shadow-sm ring-1 ring-agent-budget/25", updating && "opacity-50")}>
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
  );
}
