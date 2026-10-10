"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, fmtDate } from "@/lib/utils";
import type { TrendPoint } from "@/types/contracts";
import { CHART } from "./tokens";

export interface TrendChartProps {
  points: TrendPoint[];
  unit: string;
  /** Draws a dashed reference line, for example a glucose limit. */
  limit?: { value: number; label: string };
  /** Fixed pixel height. Leave unset and pass a height class in `className` for responsive heights. */
  height?: number;
  className?: string;
}

interface Row {
  date: string;
  raw: number | null;
  filtered: number;
  band: [number, number];
}

export function TrendChart({ points, unit, limit, height, className }: TrendChartProps) {
  const rows: Row[] = points.map((p) => ({
    date: p.date,
    raw: p.raw,
    filtered: p.filtered,
    band: [p.lower, p.upper],
  }));
  const values = points
    .flatMap((p) => [p.lower, p.upper, p.raw ?? p.filtered])
    .concat(limit ? [limit.value] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.15);
  const shortDate = (d: string) => fmtDate(d, { month: "short", day: "numeric" });

  return (
    <div
      data-testid="trend-chart"
      className={cn("w-full", !height && "h-[240px]", className)}
      style={height ? { height } : undefined}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={CHART.border} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: CHART.inkSubtle }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            dy={6}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tick={{ fontSize: 11, fill: CHART.inkSubtle }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: CHART.inkSubtle, strokeDasharray: "3 3" }}
            labelFormatter={(label) => shortDate(String(label))}
            formatter={(value, name) => {
              if (Array.isArray(value)) return [`${value[0]} – ${value[1]} ${unit}`, "Likely range"];
              return [`${value} ${unit}`, name === "raw" ? "Logged" : "Trend"];
            }}
            contentStyle={{
              borderRadius: 12,
              borderColor: CHART.border,
              fontSize: 12,
              boxShadow: "0 4px 12px -4px rgba(15,23,42,0.15)",
            }}
          />
          <Area
            type="monotone"
            dataKey="band"
            stroke="none"
            fill={CHART.brand}
            fillOpacity={0.12}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="filtered"
            stroke={CHART.brand}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Scatter dataKey="raw" fill={CHART.inkMuted} shape={<circle r={3} />} isAnimationActive={false} />
          {limit && (
            <ReferenceLine
              y={limit.value}
              stroke={CHART.danger}
              strokeDasharray="6 4"
              label={{ value: limit.label, position: "insideTopRight", fill: CHART.danger, fontSize: 11 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
