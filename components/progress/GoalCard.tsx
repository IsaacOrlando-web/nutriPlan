"use client";

import { CalendarCheck, Flag, Gauge, Target, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatPill } from "@/components/common/StatPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTrend } from "@/lib/hooks/useReadings";
import { fmtDate, fmtNumber, todayIso } from "@/lib/utils";
import { goalProgress, type GoalProgress } from "@/math/progress";
import type { UserProfile } from "@/types/contracts";
import { demoGoalWeightKg } from "./demo-goals";

const kg = (n: number) => `${fmtNumber(n, { maximumFractionDigits: 1 })} kg`;
const signedKg = (n: number) => `${fmtNumber(n, { maximumFractionDigits: 1, signDisplay: "exceptZero" })} kg`;
const shortDate = (iso: string) => fmtDate(iso, { month: "short", day: "numeric" });

function goalLine(profile: UserProfile, goalKg: number | null): string {
  if (goalKg === null)
    return `${profile.goal === "gain" ? "Gain" : "Lose"} ${kg(profile.goalRateKgPerWeek)} per week`;
  if (profile.goal === "maintain" || Math.abs(goalKg - profile.weightKg) < 1)
    return `Stay around ${kg(goalKg)}`;
  return `${profile.goal === "gain" ? "Gain" : "Lose"} to ${kg(goalKg)}`;
}

function headline(p: GoalProgress, goalKg: number): string {
  if (p.direction === "maintain")
    return p.reached ? `Holding steady at your goal` : `${kg(p.remainingKg)} off your goal`;
  if (p.reached) return `You reached ${kg(goalKg)}!`;
  return `${kg(p.remainingKg)} to go`;
}

function paceSentence(p: GoalProgress, goalKg: number): string {
  if (p.direction === "maintain")
    return p.reached
      ? "Your trend stays within 1 kg of your goal. Keep doing what you are doing."
      : "Your trend drifted from your goal weight. Monitor adjusts your plan to bring it back.";
  if (p.reached) return "Goal reached. Time to set the next one or switch to maintaining.";
  if (p.pace === "toward" && p.etaDate)
    return `At your current pace you reach ${kg(goalKg)} around ${fmtDate(p.etaDate, { month: "long", day: "numeric", year: "numeric" })} (${p.weeksToGoal} ${p.weeksToGoal === 1 ? "week" : "weeks"}).`;
  if (p.pace === "flat")
    return "Your trend has been flat lately. Plateaus are normal; Monitor watches for them and adjusts your plan.";
  return "Your trend is moving away from your goal right now. Monitor is on it.";
}

/** "How close am I to my goal": start, now and goal weight from the Kalman weight trend; every number from /math. */
export function GoalCard({ profile }: { profile: UserProfile }) {
  const trend = useTrend("weight");

  if (trend.isLoading) return <LoadingState variant="cards" />;
  if (trend.error) return <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />;
  const points = trend.data?.points ?? [];
  if (points.length === 0) {
    return (
      <EmptyState
        title="No weight readings yet"
        body="Log your weight and your progress toward your goal shows up here."
        icon={Target}
        action={
          <Button asChild size="sm">
            <Link href="/log/reading">Log my weight</Link>
          </Button>
        }
      />
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const slope = trend.data!.slopePerWeek;
  const goalKg = demoGoalWeightKg(profile);
  const p =
    goalKg === null
      ? null
      : goalProgress({
          startKg: first.filtered,
          currentKg: last.filtered,
          goalKg,
          slopePerWeek: slope,
          stalled: trend.data!.alert === "stalled",
          today: todayIso(),
        });
  const targetRate = profile.goal === "lose" ? -profile.goalRateKgPerWeek : profile.goalRateKgPerWeek;
  const PaceIcon = slope < 0 ? TrendingDown : TrendingUp;

  return (
    <Card data-testid="progress-goal" className="border-0 shadow-sm ring-1 ring-border">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
              <Target className="h-4 w-4 text-brand" aria-hidden="true" />
              Your goal: {goalLine(profile, goalKg)}
            </p>
            <p data-testid="progress-headline" className="text-2xl font-bold tabular-nums sm:text-3xl">
              {p && goalKg !== null
                ? headline(p, goalKg)
                : `${signedKg(last.filtered - first.filtered)} so far`}
            </p>
          </div>
          {p && p.direction !== "maintain" && (
            <Badge variant={p.reached ? "success" : "secondary"} className="tabular-nums">
              {p.percent}% there
            </Badge>
          )}
        </div>

        {p && goalKg !== null && p.direction !== "maintain" && (
          <div className="space-y-2">
            <Progress
              value={p.percent}
              data-testid="progress-bar"
              aria-label={`${p.percent}% of the way to your goal`}
              className="h-3"
            />
            <div className="flex justify-between text-xs text-ink-muted tabular-nums">
              <span>
                Start {kg(first.filtered)}
                <span className="block text-ink-subtle">{shortDate(first.date)}</span>
              </span>
              <span className="text-center font-semibold text-ink">
                Now {kg(last.filtered)}
                <span className="block font-normal text-ink-subtle">{shortDate(last.date)}</span>
              </span>
              <span className="text-right">
                Goal {kg(goalKg)}
                <span className="block text-ink-subtle">{p.etaDate ? `~${shortDate(p.etaDate)}` : " "}</span>
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatPill
            label="Changed since start"
            value={signedKg(p ? p.changedKg : last.filtered - first.filtered)}
            hint={`Since ${shortDate(first.date)}`}
            icon={Flag}
          />
          <StatPill
            label="Your pace"
            value={`${fmtNumber(slope, { maximumFractionDigits: 2, signDisplay: "exceptZero" })} kg/wk`}
            hint={profile.goal === "maintain" ? "Goal: hold steady" : `Goal pace: ${signedKg(targetRate)}/wk`}
            icon={PaceIcon}
            tone={p?.reached || p?.pace === "toward" ? "success" : p?.pace === "away" ? "warning" : "neutral"}
          />
          {p?.direction === "maintain" && goalKg !== null ? (
            <StatPill
              label="Distance from goal"
              value={kg(p.remainingKg)}
              hint="Within 1 kg counts as on target"
              icon={p.reached ? CalendarCheck : Gauge}
              tone={p.reached ? "success" : "warning"}
            />
          ) : (
            <StatPill
              label="Estimated arrival"
              value={
                p?.etaDate
                  ? fmtDate(p.etaDate, { month: "short", day: "numeric", year: "numeric" })
                  : p?.reached
                    ? "Reached"
                    : "—"
              }
              hint={
                p?.reached
                  ? "Goal weight reached"
                  : p?.weeksToGoal
                    ? `${p.weeksToGoal} weeks at this pace`
                    : "Needs a steady trend toward your goal"
              }
              icon={p?.reached ? CalendarCheck : Gauge}
            />
          )}
        </div>

        {p && goalKg !== null && (
          <p data-testid="progress-pace" className="text-sm text-ink-muted">
            {paceSentence(p, goalKg)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
