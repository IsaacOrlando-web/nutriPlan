"use client";

import { cn } from "@/lib/utils";
import { MACRO_CLASSES } from "./tokens";

export interface MacroBarProps {
  eaten: { proteinG: number; carbsG: number; fatG: number };
  target: { proteinG: number; carbsG: number; fatG: number };
  className?: string;
}

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
type Macro = keyof typeof KCAL_PER_G;
const MACRO_LABELS: Record<Macro, string> = { protein: "Protein", carbs: "Carbs", fat: "Fat" };

export function MacroBar({ eaten, target, className }: MacroBarProps) {
  const rows: { key: Macro; eaten: number; target: number }[] = [
    { key: "protein", eaten: eaten.proteinG, target: target.proteinG },
    { key: "carbs", eaten: eaten.carbsG, target: target.carbsG },
    { key: "fat", eaten: eaten.fatG, target: target.fatG },
  ];
  const totalKcal = rows.reduce((s, r) => s + r.target * KCAL_PER_G[r.key], 0);
  return (
    <div className={cn("space-y-3", className)}>
      {/* Stacked bar: each segment is sized by the macro's share of target calories and filled by eaten / target. */}
      <div
        className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label="Protein, carbs and fat eaten versus targets"
      >
        {rows.map((r) => {
          const widthPct = totalKcal > 0 ? ((r.target * KCAL_PER_G[r.key]) / totalKcal) * 100 : 33;
          const fillPct = r.target > 0 ? Math.min(100, (r.eaten / r.target) * 100) : 0;
          return (
            <div
              key={r.key}
              className={cn("relative h-full", MACRO_CLASSES[r.key].soft)}
              style={{ width: `${widthPct}%` }}
            >
              <div
                className={cn("h-full transition-[width] duration-700", MACRO_CLASSES[r.key].fill)}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg bg-surface-sunken px-2 py-1.5">
            <dt
              className={cn("text-[11px] font-semibold uppercase tracking-wide", MACRO_CLASSES[r.key].text)}
            >
              {MACRO_LABELS[r.key]}
            </dt>
            <dd className="text-sm tabular-nums">
              <span className="font-semibold">{Math.round(r.eaten)}</span>
              <span className="text-ink-subtle"> / {Math.round(r.target)} g</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
