"use client";

import { cn } from "@/lib/utils";

export interface CalorieRingProps {
  eaten: number;
  target: number;
  size?: number;
  stroke?: number;
  className?: string;
}

export function CalorieRing({ eaten, target, size = 168, stroke = 14, className }: CalorieRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? eaten / target : 0;
  const shown = Math.min(ratio, 1);
  const over = ratio > 1;
  const remaining = Math.max(0, Math.round(target - eaten));
  return (
    <div
      data-testid="calorie-ring"
      className={cn("relative inline-flex items-center justify-center", className)}
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
        <span className="text-3xl font-bold leading-none tabular-nums">{Math.round(eaten)}</span>
        <span className="text-xs text-ink-muted">
          / {Math.round(target)} kcal
        </span>
        <span className={cn("mt-1 text-[11px] font-medium", over ? "text-warning" : "text-brand-dark")}>
          {over ? `${Math.round(eaten - target)} kcal over` : `${remaining} kcal left`}
        </span>
      </div>
    </div>
  );
}
