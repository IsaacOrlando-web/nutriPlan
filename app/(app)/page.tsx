"use client";

import { Activity, Camera, ClipboardList, Droplets, Scale, Sparkles } from "lucide-react";
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
import { MealCard } from "@/components/meals/MealCard";
import { WhySheet } from "@/components/meals/WhySheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFoodLogs } from "@/lib/hooks/useLogs";
import { useMonitorRun } from "@/lib/hooks/useMonitorRun";
import { usePlan } from "@/lib/hooks/usePlan";
import { useProfile } from "@/lib/hooks/useProfile";
import { useReadings } from "@/lib/hooks/useReadings";
import { useSummary } from "@/lib/hooks/useSummary";
import { fmtDate, fmtRelative, todayIso } from "@/lib/utils";
import type { FoodLogEntry, Meal, Reading } from "@/types/contracts";

const SOURCE_LABEL: Record<FoodLogEntry["source"], string> = {
  photo: "photo",
  manual: "manual",
  plan: "from plan",
};

function latest(readings: Reading[] | undefined, type: Reading["type"]): Reading | undefined {
  return readings?.filter((r) => r.type === type).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
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

  const weight = latest(readings.data, "weight");
  const glucose = latest(readings.data, "glucose_fasting");
  const bp = latest(readings.data, "bp");
  const hasConditions = (profile.data?.profile.conditions.length ?? 0) > 0;
  const showMonitor = (plan.data?.version ?? 1) > 1 || monitor.data !== undefined;

  return (
    <div data-testid="dashboard" className="space-y-6">
      <PageHeader
        title={profile.data ? `Hi ${profile.data.profile.name}` : "Hi there"}
        subtitle={fmtDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/log/reading">
                <ClipboardList aria-hidden="true" />
                Log reading
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/log/photo">
                <Camera aria-hidden="true" />
                Log photo
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isLoading && <LoadingState variant="page" />}
            {summary.error && <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />}
            {summary.data && (
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <CalorieRing eaten={summary.data.eaten.calories} target={summary.data.targets.calories} />
                <div className="w-full flex-1 space-y-3">
                  <MacroBar eaten={summary.data.eaten} target={summary.data.targets} />
                  <p className="text-xs text-ink-muted">
                    Fiber {Math.round(summary.data.eaten.fiberG)} / {summary.data.targets.fiberG} g · Sodium{" "}
                    {Math.round(summary.data.eaten.sodiumMg)} / {summary.data.targets.sodiumMg} mg
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Readings */}
        <div className="space-y-3">
          {readings.isLoading ? (
            <LoadingState variant="list" rows={2} />
          ) : readings.error ? (
            <ErrorState error={readings.error} onRetry={() => void readings.refetch()} />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Monitor note */}
      <Card className="border-agent-monitor/30">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <AgentAvatar agent="monitor" size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-agent-monitor">Monitor</p>
            {monitor.isPending ? (
              <p className="text-sm text-ink-muted">Checking your trends…</p>
            ) : monitor.data ? (
              <>
                <p className="text-sm">{monitor.data.reason}</p>
                {monitor.data.alerts[0] && (
                  <p className="text-xs text-ink-muted">{monitor.data.alerts[0].body}</p>
                )}
              </>
            ) : plan.data && showMonitor ? (
              <p className="text-sm">
                Plan v{plan.data.version}: {plan.data.reason}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                Watching weight, glucose and logs daily. Nothing to change yet.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {monitor.data?.runId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/agents/${monitor.data.runId}`}>
                  <Sparkles aria-hidden="true" />
                  Watch the replan
                </Link>
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => monitor.mutate()}
              disabled={monitor.isPending}
            >
              Check now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's meals */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Today&apos;s meals</h2>
          <Link href="/plan" className="text-sm font-medium text-brand hover:underline">
            Full plan
          </Link>
        </div>
        {plan.isLoading && <LoadingState variant="cards" rows={3} />}
        {plan.error && <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />}
        {plan.data && !todayDay && (
          <EmptyState
            title="No plan yet"
            body="Answer a few questions and the agents will build your first week."
            action={
              <Button asChild>
                <Link href="/onboarding">Build my plan</Link>
              </Button>
            }
          />
        )}
        {todayDay && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {todayDay.meals.map((meal) => (
              <MealCard key={meal.mealId} meal={meal} onOpen={setOpenMeal} />
            ))}
          </div>
        )}
      </section>

      {/* Recent logs */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent logs</h2>
        {logs.isLoading && <LoadingState variant="list" rows={2} />}
        {logs.error && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
        {logs.data && logs.data.length === 0 && (
          <EmptyState
            title="Nothing logged yet"
            body="Photograph a meal and two vision models will identify it."
            icon={Camera}
            action={
              <Button asChild size="sm">
                <Link href="/log/photo">Log photo</Link>
              </Button>
            }
          />
        )}
        {logs.data && logs.data.length > 0 && (
          <ul className="divide-y rounded-xl border bg-surface-raised">
            {logs.data.slice(0, 5).map((entry) => (
              <li key={entry.logId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                  <Camera className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.items.map((i) => i.name).join(", ")}</p>
                  <p className="text-xs text-ink-muted">
                    {fmtDate(entry.eatenAt, { hour: "numeric", minute: "2-digit" })} ·{" "}
                    {SOURCE_LABEL[entry.source]}
                    {entry.visionAgreement !== null &&
                      ` · ${Math.round(entry.visionAgreement * 100)}% model agreement`}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {Math.round(entry.totals.calories)} kcal
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WhySheet
        meal={openMeal}
        shadowPrices={plan.data?.shadowPrices ?? []}
        onClose={() => setOpenMeal(null)}
      />
    </div>
  );
}
