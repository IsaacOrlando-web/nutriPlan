"use client";

import { cn, fmtNumber } from "@/lib/utils";

export interface CalorieRingProps {
  eaten: number;
  target: number;
  size?: number;
  stroke?: number;
  className?: string;
}

/** The dashboard hero: how many calories are left today, inside a ring that fills as the day is eaten. */
export function CalorieRing({ eaten, target, size = 176, stroke = 12, className }: CalorieRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? eaten / target : 0;
  const shown = Math.min(ratio, 1);
  const over = ratio > 1;
  const left = Math.round(target - eaten);
  return (
    <div
      data-testid="calorie-ring"
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${Math.round(eaten)} of ${Math.round(target)} calories eaten today`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          className="stroke-surface-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            over ? "stroke-warning" : "stroke-brand",
          )}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={cn(
            "text-4xl font-bold leading-none tracking-tight tabular-nums",
            over && "text-warning",
          )}
        >
          {fmtNumber(Math.abs(left))}
        </span>
        <span className="mt-1.5 text-xs font-medium text-ink-muted">{over ? "kcal over" : "kcal left"}</span>
        <span className="mt-0.5 text-[11px] tabular-nums text-ink-subtle">
          {fmtNumber(Math.round(eaten))} of {fmtNumber(Math.round(target))}
        </span>
      </div>
    </div>
  );
}
