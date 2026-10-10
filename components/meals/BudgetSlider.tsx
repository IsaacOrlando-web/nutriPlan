"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useGeneratePlan } from "@/lib/hooks/usePlan";
import { cn, fmtUsd } from "@/lib/utils";

export const BUDGET_MIN = 20;
export const BUDGET_MAX = 150;
export const BUDGET_STEP = 5;
const DEBOUNCE_MS = 500;

export interface BudgetSliderProps {
  value: number;
  className?: string;
}

export function BudgetSlider({ value, className }: BudgetSliderProps) {
  const router = useRouter();
  const generate = useGeneratePlan();
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setLocal(value), [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (next: number) => {
    if (timer.current) clearTimeout(timer.current);
    if (next === value) return;
    timer.current = setTimeout(() => {
      generate.mutate(
        {
          trigger: "budget_change",
          reason: `Budget changed from ${fmtUsd(value, true)} to ${fmtUsd(next, true)}`,
          weeklyBudgetUsd: next,
        },
        {
          onSuccess: ({ runId }) => router.push(`/agents/${runId}`),
          onError: (err) => toast.error(err instanceof Error ? err.message : "Could not start a new plan."),
        },
      );
    }, DEBOUNCE_MS);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor="budget-slider">Weekly budget</Label>
        <span className="text-lg font-bold tabular-nums text-agent-budget">
          {fmtUsd(local, true)}
          <span className="text-xs font-normal text-ink-subtle"> per week</span>
        </span>
      </div>
      <Slider
        id="budget-slider"
        data-testid="budget-slider"
        min={BUDGET_MIN}
        max={BUDGET_MAX}
        step={BUDGET_STEP}
        value={[local]}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => commit(v)}
        disabled={generate.isPending}
        aria-label="Weekly budget"
      />
      <div className="flex justify-between text-xs text-ink-subtle">
        <span>{fmtUsd(BUDGET_MIN, true)}</span>
        <span>{fmtUsd(BUDGET_MAX, true)}</span>
      </div>
      {generate.isPending ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Opening the Agent Room…
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          Slide and release. The agents renegotiate and rebuild your week in seconds.
        </p>
      )}
    </div>
  );
}
