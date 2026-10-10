"use client";

import { Activity, Camera, ChevronRight, ClipboardList, Droplets, Scale, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { CalorieRing } from "@/components/charts/CalorieRing";
import { MacroBar } from "@/components/charts/MacroBar";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatPill } from "@/components/common/StatPill";
import { MEAL_TYPE_LABELS } from "@/components/meals/MealCard";
import { MealCardCompact } from "@/components/meals/MealCardCompact";
import { nextMealType } from "@/components/meals/mealTime";
import { planReasonSentence } from "@/components/meals/planReason";
import { WhySheet } from "@/components/meals/WhySheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFoodLogs } from "@/lib/hooks/useLogs";
import { useMonitorRun } from "@/lib/hooks/useMonitorRun";
import { usePlan } from "@/lib/hooks/usePlan";
import { useProfile } from "@/lib/hooks/useProfile";
import { useReadings } from "@/lib/hooks/useReadings";
import { useSummary } from "@/lib/hooks/useSummary";
import { cn, fmtDate, fmtNumber, fmtRelative, todayIso } from "@/lib/utils";
import type { DaySummary, FoodLogEntry, Meal, PlanDay, Reading } from "@/types/contracts";

const SOURCE_LABEL: Record<FoodLogEntry["source"], string> = {
  photo: "from a photo",
  manual: "typed in",
  plan: "from your plan",
};

function latest(readings: Reading[] | undefined, type: Reading["type"]): Reading | undefined {
  return readings?.filter((r) => r.type === type).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
}

/** The meal the Today sentence talks about: the next slot by wall clock, if the plan has one. */
function pickNextMeal(day: PlanDay | undefined, now: Date): Meal | undefined {
  if (!day || day.meals.length === 0) return undefined;
  const type = nextMealType(
    now.getHours(),
    day.meals.map((m) => m.type),
  );
  return day.meals.find((m) => m.type === type);
}

/**
 * One plain sentence about today. Every number is the server's; the only arithmetic is the
 * difference between what is left and the next planned meal, which picks the wording.
 */
function todaySentence(summary: DaySummary, next: Meal | undefined): string {
  const eaten = Math.round(summary.eaten.calories);
  const target = Math.round(summary.targets.calories);
  const left = Math.round(summary.targets.calories - summary.eaten.calories);
  const head = `${fmtNumber(eaten)} of ${fmtNumber(target)} kcal eaten.`;
  if (left <= 0) {
    return `${head} You are ${fmtNumber(-left)} kcal over today's target. Tomorrow's plan starts fresh.`;
  }
  if (!next) return `${head} ${fmtNumber(left)} kcal left for the rest of the day.`;
  const mealKcal = Math.round(next.totals.calories);
  const label = MEAL_TYPE_LABELS[next.type].toLowerCase();
  const spare = left - mealKcal;
  if (spare >= 150) {
    return `${head} ${fmtNumber(left)} left: ${label} is ${fmtNumber(mealKcal)}, so you have room for a snack.`;
  }
  if (spare >= 0) {
    return `${head} ${fmtNumber(left)} left: ${label} is ${fmtNumber(mealKcal)}, so it fits with ${fmtNumber(spare)} to spare.`;
  }
  return `${head} ${fmtNumber(left)} left: ${label} is ${fmtNumber(mealKcal)}, so a slightly lighter portion keeps you on target.`;
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

  return (
    <div data-testid="dashboard" className="space-y-6">
      <PageHeader
        title={profile.data ? `Hi ${profile.data.profile.name}` : "Hi there"}
        subtitle={`${fmtDate(new Date(), { weekday: "long", month: "long", day: "numeric" })} · here is where today stands.`}
      />

      {/* 1. Today */}
      <Card className="border-0 shadow-sm">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Today</h2>
            {summary.isLoading && <Skeleton className="h-5 w-3/4 max-w-xl" />}
            {summary.data && (
              <p className="text-sm text-ink-muted sm:text-base" data-testid="today-sentence">
                {todaySentence(summary.data, next)}
              </p>
            )}
          </div>
          {summary.isLoading && <TodaySkeleton />}
          {summary.error && <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />}
          {summary.data && (
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <CalorieRing eaten={summary.data.eaten.calories} target={summary.data.targets.calories} />
              <div className="w-full flex-1 space-y-3">
                <MacroBar eaten={summary.data.eaten} target={summary.data.targets} />
                <p className="text-xs text-ink-muted">
                  Fiber {Math.round(summary.data.eaten.fiberG)} of {summary.data.targets.fiberG} g · Sodium{" "}
                  {fmtNumber(Math.round(summary.data.eaten.sodiumMg))} of{" "}
                  {fmtNumber(summary.data.targets.sodiumMg)} mg
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Today's meals */}
      <section className="space-y-3" aria-labelledby="todays-meals">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 id="todays-meals" className="text-lg font-semibold">
              Today&apos;s meals
            </h2>
            <p className="text-sm text-ink-muted">
              {todayDay
                ? `${todayDay.meals.length} meals planned for ${fmtDate(todayDay.date, { weekday: "long" })}. Tap one to see why the agents chose it.`
                : "What the agents planned for you today."}
            </p>
          </div>
          <Link
            href="/plan"
            className="flex shrink-0 items-center gap-0.5 rounded text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Full week
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {plan.isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}
        {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
        {!plan.isLoading && !plan.error && !todayDay && (
          <EmptyState
            title="No plan yet"
            body="Answer a few questions and four AI agents will build your first week."
            action={
              <Button asChild>
                <Link href="/onboarding">Build my plan</Link>
              </Button>
            }
          />
        )}
        {todayDay && (
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {todayDay.meals.map((meal) => (
              <MealCardCompact
                key={meal.mealId}
                meal={meal}
                onOpen={setOpenMeal}
                highlighted={next?.mealId === meal.mealId}
                className="w-[260px] shrink-0 snap-start sm:w-auto"
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. Your agents noticed */}
      {noticed && (
        <Card className="border-0 shadow-sm ring-1 ring-agent-monitor/25">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <AgentAvatar agent="monitor" size="md" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-agent-monitor">Your agents noticed</p>
              {monitor.isPending ? (
                <p className="text-sm text-ink-muted">Monitor is reading your trends…</p>
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
                    Plan version {plan.data.version}. Doctor&apos;s rules were kept in every version.
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
          </CardContent>
        </Card>
      )}

      {/* 4. Quick actions and recent */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3" aria-labelledby="quick-actions">
          <h2 id="quick-actions" className="text-lg font-semibold">
            Log something
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <ActionTile
              href="/log/photo"
              icon={Camera}
              title="Log a meal photo"
              hint="Two AI models read the photo and vote on what is on the plate."
              primary
            />
            <ActionTile
              href="/log/reading"
              icon={ClipboardList}
              title="Log a reading"
              hint="Weight, glucose or blood pressure. Monitor reads the trend."
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-ink-muted"
            onClick={() => monitor.mutate()}
            disabled={monitor.isPending}
          >
            <Activity aria-hidden="true" />
            {monitor.isPending ? "Monitor is checking…" : "Ask Monitor to check my trends now"}
          </Button>
        </section>

        <section className="space-y-3 lg:col-span-2" aria-labelledby="recent">
          <h2 id="recent" className="text-lg font-semibold">
            Recent
          </h2>
          {readings.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : readings.error ? (
            <ErrorState error={readings.error} onRetry={() => void readings.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatPill
                label="Weight"
                value={weight ? weight.value : "–"}
                unit={weight?.unit}
                hint={weight ? fmtRelative(weight.takenAt) : "No reading yet"}
                icon={Scale}
                className="border-0 ring-1 ring-border"
              />
              {(hasConditions || glucose) && (
                <StatPill
                  label="Fasting glucose"
                  value={glucose ? glucose.value : "–"}
                  unit={glucose?.unit}
                  hint={glucose ? fmtRelative(glucose.takenAt) : "No reading yet"}
                  icon={Droplets}
                  className="border-0 ring-1 ring-border"
                />
              )}
              {(hasConditions || bp) && (
                <StatPill
                  label="Blood pressure"
                  value={bp ? `${bp.value}/${bp.value2 ?? "–"}` : "–"}
                  unit={bp?.unit}
                  hint={bp ? fmtRelative(bp.takenAt) : "No reading yet"}
                  icon={Activity}
                  className="border-0 ring-1 ring-border"
                />
              )}
            </div>
          )}
          {logs.isLoading && <LoadingState variant="list" rows={2} />}
          {logs.error && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
          {logs.data && logs.data.length === 0 && (
            <EmptyState
              title="Nothing logged yet"
              body="Photograph a meal and two vision models will identify it."
              icon={Camera}
              action={
                <Button asChild size="sm">
                  <Link href="/log/photo">Log a meal photo</Link>
                </Button>
              }
            />
          )}
          {logs.data && logs.data.length > 0 && (
            <ul className="divide-y rounded-xl bg-surface-raised shadow-sm ring-1 ring-border">
              {logs.data.slice(0, 5).map((entry) => (
                <li key={entry.logId} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                    <Camera className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.items.map((i) => i.name).join(", ")}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {fmtDate(entry.eatenAt, { hour: "numeric", minute: "2-digit" })} ·{" "}
                      {SOURCE_LABEL[entry.source]}
                      {entry.visionAgreement !== null &&
                        ` · the two models agreed ${Math.round(entry.visionAgreement * 100)}%`}
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

function TodaySkeleton() {
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row" role="status" aria-label="Loading today">
      <Skeleton className="h-[168px] w-[168px] shrink-0 rounded-full" />
      <div className="w-full flex-1 space-y-3">
        <Skeleton className="h-4 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function ActionTile({
  href,
  icon: Icon,
  title,
  hint,
  primary,
}: {
  href: string;
  icon: typeof Camera;
  title: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        primary ? "bg-brand text-brand-foreground" : "bg-surface-raised ring-1 ring-border",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
          primary ? "bg-brand-foreground/20" : "bg-brand-soft text-brand-dark",
        )}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className={cn("block text-xs", primary ? "text-brand-foreground/85" : "text-ink-muted")}>
          {hint}
        </span>
      </span>
      <ChevronRight className="ml-auto h-5 w-5 shrink-0 opacity-70" aria-hidden="true" />
    </Link>
  );
}
