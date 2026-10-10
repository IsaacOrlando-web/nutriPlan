"use client";

import { Check, Lightbulb, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BudgetCurveChart } from "@/components/charts/BudgetCurveChart";
import { ErrorState } from "@/components/common/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { ApiRequestError } from "@/lib/api";
import { useBudgetCurve, useCurvePlanAt } from "@/lib/hooks/useBudgetCurve";
import { useGeneratePlan } from "@/lib/hooks/usePlan";
import { cn, fmtDate, fmtUsd } from "@/lib/utils";
import type { BudgetCurvePointSummary, BudgetCurveSummary, PlanDay } from "@/types/contracts";

export const BUDGET_MIN = 20;
export const BUDGET_MAX = 150;
export const BUDGET_STEP = 5;
const MAX_CONSTRAINT_CHIPS = 4;

export interface BudgetSliderProps {
  /** Budget of the plan the user has today (profile budget). */
  value: number;
  /** Render the curve insights under the slider. The Plan page renders them in its own list instead. */
  showInsights?: boolean;
  className?: string;
}

/** Grid used while the curve is still computing, so the slider is never blocked. */
function fallbackGrid(value: number): number[] {
  const grid: number[] = [];
  for (let b = BUDGET_MIN; b <= BUDGET_MAX; b += BUDGET_STEP) grid.push(b);
  if (!grid.includes(value)) grid.push(value);
  return grid.sort((a, b) => a - b);
}

function nearest(grid: number[], target: number): number {
  return grid.reduce((best, b) => (Math.abs(b - target) < Math.abs(best - target) ? b : best), grid[0]);
}

const humanize = (id: string) => id.replace(/_/g, " ");

export function BudgetSlider({ value, showInsights = true, className }: BudgetSliderProps) {
  const router = useRouter();
  const generate = useGeneratePlan();
  const curve = useBudgetCurve();
  const [local, setLocal] = useState(value);
  const [committed, setCommitted] = useState<number | null>(null);
  const planAt = useCurvePlanAt(committed);

  const summary = curve.data?.curve;
  const budgets = useMemo(
    () => (summary && summary.budgets.length > 0 ? summary.budgets : fallbackGrid(value)),
    [summary, value],
  );

  useEffect(() => {
    setLocal(value);
    setCommitted(null);
  }, [value]);
  // When the real grid arrives, snap the thumb onto it.
  useEffect(() => {
    setLocal((cur) => (budgets.includes(cur) ? cur : nearest(budgets, cur)));
  }, [budgets]);

  const index = Math.max(0, budgets.indexOf(local));
  const point = summary?.points.find((p) => p.budgetUsd === local) ?? null;

  const noProfile = curve.error instanceof ApiRequestError && curve.error.status === 404;
  if (noProfile) return null;

  const commit = (next: number) => {
    setLocal(next);
    setCommitted(next === value ? null : next);
  };

  const apply = (budget: number) => {
    generate.mutate(
      {
        trigger: "budget_change",
        reason: `Budget set to ${fmtUsd(budget, true)} from the tradeoff curve`,
        weeklyBudgetUsd: budget,
      },
      {
        onSuccess: ({ runId }) => router.push(`/agents/${runId}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not start a new plan."),
      },
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Label htmlFor="budget-slider" className="text-sm font-semibold">
            Weekly budget
          </Label>
          <p className="text-xs text-ink-subtle" data-testid="budget-explainer">
            Drag to see what each budget buys. Release to preview.
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums tracking-tight">
          {fmtUsd(local, true)}
          <span className="text-xs font-normal text-ink-subtle"> / week</span>
        </span>
      </div>

      {/* Curve: the real chart once computed, a skeleton while the optimizer sweeps the budgets. */}
      {summary ? (
        <>
          <BudgetCurveChart curve={summary} current={local} applied={value} />
          <CurveLegend />
        </>
      ) : curve.error ? (
        <ErrorState
          error={curve.error}
          onRetry={() => void curve.refresh().catch(() => undefined)}
          className="py-4"
        />
      ) : (
        <Skeleton className="h-[132px] w-full rounded-xl" />
      )}

      <Slider
        id="budget-slider"
        data-testid="budget-slider"
        min={0}
        max={budgets.length - 1}
        step={1}
        value={[index]}
        onValueChange={([i]) => setLocal(budgets[i] ?? local)}
        onValueCommit={([i]) => commit(budgets[i] ?? local)}
        disabled={generate.isPending}
        aria-label="Weekly budget"
        aria-valuetext={`${fmtUsd(local, true)} per week`}
        className="py-1"
      />
      <div className="flex justify-between text-[11px] tabular-nums text-ink-subtle">
        <span>{fmtUsd(budgets[0], true)}</span>
        <span>{fmtUsd(budgets[budgets.length - 1], true)}</span>
      </div>

      {/* Point badges: read locally from the curve while dragging, no network. */}
      <div data-testid="budget-point" className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold tabular-nums text-ink-muted">At {fmtUsd(local, true)}</span>
        {point ? (
          <PointBadges point={point} />
        ) : summary ? (
          <span className="text-ink-subtle">No data at this budget</span>
        ) : curve.error ? (
          <span className="text-ink-subtle">Tradeoffs unavailable</span>
        ) : (
          <span className="flex items-center gap-1.5 text-ink-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Computing tradeoffs…
          </span>
        )}
      </div>

      {generate.isPending && (
        <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Opening the Agent Room…
        </p>
      )}

      {committed !== null && (
        <BudgetPreview
          budget={committed}
          days={planAt.data}
          loading={planAt.isPending || planAt.isPlaceholderData}
          error={planAt.error}
          busy={generate.isPending}
          onApply={() => apply(committed)}
          onCancel={() => {
            setCommitted(null);
            setLocal(value);
          }}
        />
      )}

      {showInsights && summary && summary.insights.length > 0 && (
        <BudgetInsights insights={summary.insights} />
      )}
    </div>
  );
}

/** Words for the three regions of the chart, so nobody has to guess what the shading means. */
function CurveLegend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-subtle"
      aria-label="Chart legend"
    >
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-sm bg-danger/20" aria-hidden="true" />
        No safe plan
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-sm bg-brand/15" aria-hidden="true" />
        Sweet spot
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-sm bg-ink-subtle/30" aria-hidden="true" />
        No extra benefit
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-3.5 rounded bg-brand" aria-hidden="true" />
        Plan quality, 0 to 100
      </li>
    </ul>
  );
}

function PointBadges({ point }: { point: BudgetCurvePointSummary }) {
  const chips = point.bindingConstraints.slice(0, MAX_CONSTRAINT_CHIPS);
  const more = point.bindingConstraints.length - chips.length;
  return (
    <>
      <Badge variant={point.withinBudget ? "success" : "warning"} className="tabular-nums">
        {fmtUsd(point.weeklyCostUsd)} / week
      </Badge>
      {!point.feasible && <Badge variant="danger">No safe plan</Badge>}
      {point.feasible && !point.withinBudget && <Badge variant="warning">Over budget</Badge>}
      {point.proteinGapG >= 1 && (
        <Badge variant="warning" className="tabular-nums">
          Protein gap {Math.round(point.proteinGapG)} g
        </Badge>
      )}
      <Badge variant={point.sodiumUsePct >= 90 ? "warning" : "secondary"} className="tabular-nums">
        Sodium {Math.round(point.sodiumUsePct)}% of cap
      </Badge>
      {chips.map((c) => (
        <Badge key={c} variant="outline" className="font-normal text-ink-muted">
          {humanize(c)}
        </Badge>
      ))}
      {more > 0 && (
        <Badge variant="outline" className="font-normal text-ink-subtle">
          +{more} more
        </Badge>
      )}
    </>
  );
}

export function BudgetInsights({
  insights,
  className,
}: {
  insights: BudgetCurveSummary["insights"];
  className?: string;
}) {
  return (
    <ul
      data-testid="budget-insights"
      className={cn("space-y-1.5 text-sm", className)}
      aria-label="Budget insights"
    >
      {insights.map((line) => (
        <li key={line} className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-agent-budget" aria-hidden="true" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

interface BudgetPreviewProps {
  budget: number;
  days: PlanDay[] | undefined;
  loading: boolean;
  error: unknown;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}

function BudgetPreview({ budget, days, loading, error, busy, onApply, onCancel }: BudgetPreviewProps) {
  return (
    <section
      data-testid="budget-preview"
      className="space-y-3 rounded-xl bg-surface-sunken p-3 sm:p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Week at {fmtUsd(budget, true)}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            aria-label="Discard preview"
          >
            <X aria-hidden="true" />
            Cancel
          </Button>
          <Button type="button" size="sm" data-testid="budget-apply" onClick={onApply} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
            Apply this budget
          </Button>
        </div>
      </div>
      {days && days.length > 0 ? (
        <ul className={cn("grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2", loading && "opacity-60")}>
          {days.map((d) => (
            <li key={d.date} className="flex gap-2">
              <span className="w-8 shrink-0 font-semibold uppercase tracking-wide text-ink-subtle">
                {fmtDate(d.date, { weekday: "short" })}
              </span>
              <span className="min-w-0 text-ink">{d.meals.map((m) => m.name).join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : error ? (
        <p className="text-xs text-danger">
          Could not build a preview at this budget
          {error instanceof Error && error.message ? `: ${error.message}` : "."}
        </p>
      ) : loading ? (
        <div className="grid gap-1.5 sm:grid-cols-2" role="status" aria-label="Building preview">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
          <span className="sr-only">Building the week at this budget…</span>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">No preview available at this budget.</p>
      )}
    </section>
  );
}
