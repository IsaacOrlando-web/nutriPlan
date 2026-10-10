"use client";

import { Activity, Camera, ChevronRight, ClipboardList, Droplets, Scale, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { CalorieRing } from "@/components/charts/CalorieRing";
import { MacroBar } from "@/components/charts/MacroBar";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatPill } from "@/components/common/StatPill";
import { MEAL_TYPE_LABELS } from "@/components/meals/MealCard";
import { MealCardCompact } from "@/components/meals/MealCardCompact";
import { nextMealType } from "@/components/meals/mealTime";
import { planReasonSentence } from "@/components/meals/planReason";
import { WhySheet } from "@/components/meals/WhySheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFoodLogs } from "@/lib/hooks/useLogs";
import { useMonitorRun } from "@/lib/hooks/useMonitorRun";
import { usePlan } from "@/lib/hooks/usePlan";
import { useProfile } from "@/lib/hooks/useProfile";
import { useReadings } from "@/lib/hooks/useReadings";
import { useSummary } from "@/lib/hooks/useSummary";
import { cn, fmtDate, fmtNumber, fmtRelative, todayIso } from "@/lib/utils";
import type { DaySummary, FoodLogEntry, Meal, PlanDay, Reading } from "@/types/contracts";

const LABEL = "text-xs font-semibold uppercase tracking-wide text-ink-subtle";

const SOURCE_LABEL: Record<FoodLogEntry["source"], string> = {
  photo: "photo",
  manual: "typed",
  plan: "from plan",
};

function latest(readings: Reading[] | undefined, type: Reading["type"]): Reading | undefined {
  return readings?.filter((r) => r.type === type).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
}

/** The meal the Today line talks about: the next slot by wall clock, if the plan has one. */
function pickNextMeal(day: PlanDay | undefined, now: Date): Meal | undefined {
  if (!day || day.meals.length === 0) return undefined;
  const type = nextMealType(
    now.getHours(),
    day.meals.map((m) => m.type),
  );
  return day.meals.find((m) => m.type === type);
}

/**
 * One short line about today. Every number is the server's; the only arithmetic is the difference
 * between what is left and the next planned meal, which picks the wording.
 */
function todayLine(summary: DaySummary, next: Meal | undefined): string {
  const left = Math.round(summary.targets.calories - summary.eaten.calories);
  if (left <= 0) return `${fmtNumber(-left)} kcal over target. Tomorrow starts fresh.`;
  if (!next) return `${fmtNumber(left)} kcal left for the rest of today.`;
  const mealKcal = Math.round(next.totals.calories);
  const label = MEAL_TYPE_LABELS[next.type];
  const spare = left - mealKcal;
  if (spare >= 150) return `${label} is next at ${fmtNumber(mealKcal)} kcal. Room for a snack after.`;
  if (spare >= 0)
    return `${label} is next at ${fmtNumber(mealKcal)} kcal. Fits, with ${fmtNumber(spare)} to spare.`;
  return `${label} is next at ${fmtNumber(mealKcal)} kcal. A lighter portion keeps you on target.`;
}

export default function DashboardPage() {
  const profile = useProfile();
  const summary = useSummary();
  const plan = usePlan();
  const logs = useFoodLogs();
  const readings = useReadings();
  const monitor = useMonitorRun();
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);

  const today = todayIso();
  const todayDay = useMemo(() => {
    const days = plan.data?.days ?? [];
    return days.find((d) => d.date === today) ?? days[0];
  }, [plan.data, today]);
  const next = useMemo(() => pickNextMeal(todayDay, new Date()), [todayDay]);

  const weight = latest(readings.data, "weight");
  const glucose = latest(readings.data, "glucose_fasting");
  const bp = latest(readings.data, "bp");
  const hasConditions = (profile.data?.profile.conditions.length ?? 0) > 0;
  const noticed =
    monitor.isPending ||
    monitor.data !== undefined ||
    (plan.data ? plan.data.version > 1 || plan.data.bestEffort : false);
  const mealCols = (todayDay?.meals.length ?? 0) >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <div data-testid="dashboard" className="space-y-8">
      <PageHeader title={profile.data ? `Hi ${profile.data.profile.name}` : "Hi there"} />

      {/* 1. Today: the hero */}
      <section className="rounded-2xl bg-surface-raised p-5 shadow-sm sm:p-6" aria-labelledby="today">
        <h2 id="today" className={LABEL}>
          Today · {fmtDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        {summary.isLoading && <TodaySkeleton />}
        {summary.error && (
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} className="mt-4" />
        )}
        {summary.data && (
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
            <CalorieRing eaten={summary.data.eaten.calories} target={summary.data.targets.calories} />
            <div className="w-full min-w-0 flex-1 space-y-5">
              <p className="text-base font-medium leading-snug sm:text-lg" data-testid="today-sentence">
                {todayLine(summary.data, next)}
              </p>
              <MacroBar eaten={summary.data.eaten} target={summary.data.targets} />
            </div>
          </div>
        )}
      </section>

      {/* 2. Today's meals */}
      <section className="space-y-3" aria-labelledby="todays-meals">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="todays-meals" className={LABEL}>
            Today&apos;s meals
          </h2>
          <Link
            href="/plan"
            className="flex shrink-0 items-center gap-0.5 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Full week
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {plan.isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        )}
        {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
        {!plan.isLoading && !plan.error && !todayDay && (
          <EmptyLine text="No plan yet.">
            <Button asChild size="sm">
              <Link href="/onboarding">Build my plan</Link>
            </Button>
          </EmptyLine>
        )}
        {todayDay && (
          <div
            className={cn(
              "no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0",
              mealCols,
            )}
          >
            {todayDay.meals.map((meal) => (
              <MealCardCompact
                key={meal.mealId}
                meal={meal}
                onOpen={setOpenMeal}
                highlighted={next?.mealId === meal.mealId}
                className="w-[250px] shrink-0 snap-start sm:w-auto"
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. Your agents noticed */}
      {noticed && (
        <section
          className="flex flex-col gap-4 rounded-2xl bg-agent-monitor/5 p-5 sm:flex-row sm:items-center"
          aria-label="Your agents noticed"
        >
          <AgentAvatar agent="monitor" size="sm" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-agent-monitor">
              Monitor noticed
            </p>
            {monitor.isPending ? (
              <p className="text-sm text-ink-muted">Reading your trends…</p>
            ) : monitor.data ? (
              <>
                <p className="text-sm">{monitor.data.reason}</p>
                {monitor.data.alerts[0] && (
                  <p className="text-sm text-ink-muted">{monitor.data.alerts[0].body}</p>
                )}
              </>
            ) : plan.data ? (
              <>
                <p className="text-sm">{planReasonSentence(plan.data)}</p>
                <p className="text-xs text-ink-subtle">
                  Plan version {plan.data.version}. Doctor&apos;s rules kept.
                </p>
              </>
            ) : null}
          </div>
          {monitor.data?.runId && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={`/agents/${monitor.data.runId}`}>
                <Sparkles aria-hidden="true" />
                Watch the replan
              </Link>
            </Button>
          )}
        </section>
      )}

      {/* 4. Log and recent */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <section className="space-y-3" aria-labelledby="quick-actions">
          <h2 id="quick-actions" className={LABEL}>
            Log
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Button asChild size="lg" className="h-12 justify-start px-4">
              <Link href="/log/photo">
                <Camera aria-hidden="true" />
                Meal photo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 justify-start px-4">
              <Link href="/log/reading">
                <ClipboardList aria-hidden="true" />
                Reading
              </Link>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 text-ink-muted"
            onClick={() => monitor.mutate()}
            disabled={monitor.isPending}
          >
            <Activity aria-hidden="true" />
            {monitor.isPending ? "Monitor is checking…" : "Ask Monitor to check my trends"}
          </Button>
        </section>

        <section className="space-y-3" aria-labelledby="recent">
          <h2 id="recent" className={LABEL}>
            Recent
          </h2>
          {readings.isLoading ? (
            <div className="flex gap-8" role="status" aria-label="Loading readings">
              <Skeleton className="h-11 w-28 rounded-lg" />
              <Skeleton className="h-11 w-28 rounded-lg" />
            </div>
          ) : readings.error ? (
            <ErrorState error={readings.error} onRetry={() => void readings.refetch()} />
          ) : (
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <StatPill
                label="Weight"
                value={weight ? weight.value : "–"}
                unit={weight?.unit}
                hint={weight ? fmtRelative(weight.takenAt) : "No reading yet"}
                icon={Scale}
              />
              {(hasConditions || glucose) && (
                <StatPill
                  label="Fasting glucose"
                  value={glucose ? glucose.value : "–"}
                  unit={glucose?.unit}
                  hint={glucose ? fmtRelative(glucose.takenAt) : "No reading yet"}
                  icon={Droplets}
                />
              )}
              {(hasConditions || bp) && (
                <StatPill
                  label="Blood pressure"
                  value={bp ? `${bp.value}/${bp.value2 ?? "–"}` : "–"}
                  unit={bp?.unit}
                  hint={bp ? fmtRelative(bp.takenAt) : "No reading yet"}
                  icon={Activity}
                />
              )}
            </div>
          )}
          {logs.isLoading && (
            <div className="space-y-2" role="status" aria-label="Loading meals">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          )}
          {logs.error && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
          {logs.data && logs.data.length === 0 && (
            <EmptyLine text="No meals logged yet.">
              <Button asChild size="sm" variant="outline">
                <Link href="/log/photo">Log a meal</Link>
              </Button>
            </EmptyLine>
          )}
          {logs.data && logs.data.length > 0 && (
            <ul className="divide-y divide-border/70 rounded-2xl bg-surface-raised px-4 shadow-sm">
              {logs.data.slice(0, 5).map((entry) => (
                <li key={entry.logId} className="flex items-center gap-3 py-3">
                  <Camera className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.items.map((i) => i.name).join(", ")}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {fmtDate(entry.eatenAt, { hour: "numeric", minute: "2-digit" })} ·{" "}
                      {SOURCE_LABEL[entry.source]}
                      {entry.visionAgreement !== null &&
                        ` · models agreed ${Math.round(entry.visionAgreement * 100)}%`}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {fmtNumber(Math.round(entry.totals.calories))} kcal
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <WhySheet
        meal={openMeal}
        shadowPrices={plan.data?.shadowPrices ?? []}
        onClose={() => setOpenMeal(null)}
      />
    </div>
  );
}

/** Empty state as the brief asks: one line and one button, no box. */
function EmptyLine({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-sunken px-4 py-3">
      <p className="text-sm text-ink-muted">{text}</p>
      {children}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div
      className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8"
      role="status"
      aria-label="Loading today"
    >
      <Skeleton className="h-[176px] w-[176px] shrink-0 rounded-full" />
      <div className="w-full flex-1 space-y-5">
        <Skeleton className="h-6 w-3/4 max-w-md" />
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
