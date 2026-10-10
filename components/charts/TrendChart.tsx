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
import { fmtDate } from "@/lib/utils";
import type { TrendPoint } from "@/types/contracts";
import { CHART } from "./tokens";

export interface TrendChartProps {
  points: TrendPoint[];
  unit: string;
  /** Draws a dashed reference line, for example a glucose limit. */
  limit?: { value: number; label: string };
  height?: number;
}

interface Row {
  date: string;
  raw: number | null;
  filtered: number;
  band: [number, number];
}

export function TrendChart({ points, unit, limit, height = 260 }: TrendChartProps) {
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
    <div data-testid="trend-chart" className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={CHART.border} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 11, fill: CHART.inkMuted }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tick={{ fontSize: 11, fill: CHART.inkMuted }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            labelFormatter={(label) => shortDate(String(label))}
            formatter={(value, name) => {
              if (Array.isArray(value)) return [`${value[0]} – ${value[1]} ${unit}`, "Likely range"];
              return [`${value} ${unit}`, name === "raw" ? "Reading" : "Trend"];
            }}
            contentStyle={{ borderRadius: 12, borderColor: CHART.border, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="band"
            stroke="none"
            fill={CHART.brand}
            fillOpacity={0.14}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="filtered"
            stroke={CHART.brand}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter dataKey="raw" fill={CHART.inkMuted} shape={<circle r={3.5} />} isAnimationActive={false} />
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
