"use client";

import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtUsd } from "@/lib/utils";
import type { BudgetCurvePointSummary, BudgetCurveSummary } from "@/types/contracts";
import { CHART } from "./tokens";

export interface BudgetCurveChartProps {
  curve: BudgetCurveSummary;
  /** Budget the thumb is on. */
  current: number;
  /** Budget of the plan the user has today. */
  applied?: number;
  height?: number;
}

interface Row {
  budget: number;
  quality: number | null;
}

/**
 * "Plan quality" is a 0 to 100 display index derived from the optimizer objective (lower objective is better).
 * Objectives are penalty sums that span orders of magnitude, so the index is linear in log(objective):
 * the best point on the curve is 100 and the worst feasible one is 0. It is for the picture only.
 */
export function qualityIndex(points: BudgetCurvePointSummary[]): Map<number, number | null> {
  const logs = points
    .filter((p) => p.feasible && p.objective !== null && p.objective > 0)
    .map((p) => Math.log(p.objective as number));
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const out = new Map<number, number | null>();
  for (const p of points) {
    if (!p.feasible || p.objective === null || p.objective <= 0) {
      out.set(p.budgetUsd, null);
      continue;
    }
    const q = hi === lo ? 100 : (100 * (hi - Math.log(p.objective))) / (hi - lo);
    out.set(p.budgetUsd, Math.round(Math.max(0, Math.min(100, q))));
  }
  return out;
}

export function BudgetCurveChart({ curve, current, applied, height = 132 }: BudgetCurveChartProps) {
  const quality = qualityIndex(curve.points);
  const rows: Row[] = curve.points.map((p) => ({ budget: p.budgetUsd, quality: quality.get(p.budgetUsd) ?? null }));
  const min = curve.budgets[0];
  const max = curve.budgets[curve.budgets.length - 1];
  const minFeasible = curve.minFeasibleBudgetUsd;
  const saturation = curve.saturationBudgetUsd;

  return (
    <div data-testid="budget-curve-chart" className="w-full" style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
          {minFeasible !== null && minFeasible > min && (
            <ReferenceArea x1={min} x2={minFeasible} fill={CHART.danger} fillOpacity={0.08} stroke="none" />
          )}
          {saturation !== null && saturation < max && (
            <ReferenceArea x1={saturation} x2={max} fill={CHART.inkSubtle} fillOpacity={0.12} stroke="none" />
          )}
          {/* Sweet spot: every dollar here still buys a better week. */}
          <ReferenceArea
            x1={minFeasible ?? min}
            x2={saturation ?? max}
            fill={CHART.brand}
            fillOpacity={0.06}
            stroke="none"
          />
          <XAxis
            dataKey="budget"
            type="number"
            domain={[min, max]}
            ticks={curve.budgets.filter((_, i) => i % 3 === 0 || i === curve.budgets.length - 1)}
            tickFormatter={(v) => fmtUsd(Number(v), true)}
            tick={{ fontSize: 10, fill: CHART.inkMuted }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tick={{ fontSize: 10, fill: CHART.inkSubtle }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: CHART.inkSubtle, strokeDasharray: "3 3" }}
            labelFormatter={(label) => `${fmtUsd(Number(label), true)} per week`}
            formatter={(value) => [value === null ? "no safe plan" : `${value} / 100`, "Plan quality"]}
            contentStyle={{ borderRadius: 12, borderColor: CHART.border, fontSize: 12 }}
          />
          {applied !== undefined && applied !== current && (
            <ReferenceLine x={applied} stroke={CHART.inkSubtle} strokeDasharray="2 4" />
          )}
          <ReferenceLine x={current} stroke={CHART.brand} strokeWidth={2} strokeDasharray="4 3" />
          <Line
            type="monotone"
            dataKey="quality"
            stroke={CHART.brand}
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: CHART.brand, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: CHART.brand, stroke: CHART.brandSoft, strokeWidth: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
