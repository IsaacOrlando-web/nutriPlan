"use client";

import { cn, fmtNumber } from "@/lib/utils";
import { MACRO_CLASSES } from "./tokens";

export interface MacroBarProps {
  eaten: { proteinG: number; carbsG: number; fatG: number; fiberG?: number; sodiumMg?: number };
  target: { proteinG: number; carbsG: number; fatG: number; fiberG?: number; sodiumMg?: number };
  className?: string;
}

interface Meter {
  key: string;
  label: string;
  eaten: number;
  target: number;
  unit: string;
  /** "min" meters fill toward a goal, "max" meters fill toward a cap. */
  kind: "min" | "max";
  fill: string;
  soft: string;
}

/**
 * One line of meters: protein, carbs, fat and, when the API gives them, fiber and sodium.
 * Each bar is eaten / target; sodium turns red only past its cap. Numbers are the server's.
 */
export function MacroBar({ eaten, target, className }: MacroBarProps) {
  const meters: Meter[] = [
    {
      key: "protein",
      label: "Protein",
      eaten: eaten.proteinG,
      target: target.proteinG,
      unit: "g",
      kind: "min",
      ...MACRO_CLASSES.protein,
    },
    {
      key: "carbs",
      label: "Carbs",
      eaten: eaten.carbsG,
      target: target.carbsG,
      unit: "g",
      kind: "min",
      ...MACRO_CLASSES.carbs,
    },
    {
      key: "fat",
      label: "Fat",
      eaten: eaten.fatG,
      target: target.fatG,
      unit: "g",
      kind: "min",
      ...MACRO_CLASSES.fat,
    },
  ];
  if (eaten.fiberG !== undefined && target.fiberG !== undefined) {
    meters.push({
      key: "fiber",
      label: "Fiber",
      eaten: eaten.fiberG,
      target: target.fiberG,
      unit: "g",
      kind: "min",
      fill: "bg-ink-muted",
      soft: "bg-surface-sunken",
    });
  }
  if (eaten.sodiumMg !== undefined && target.sodiumMg !== undefined) {
    meters.push({
      key: "sodium",
      label: "Sodium",
      eaten: eaten.sodiumMg,
      target: target.sodiumMg,
      unit: "mg",
      kind: "max",
      fill: "bg-ink-muted",
      soft: "bg-surface-sunken",
    });
  }
  return (
    <dl
      className={cn("grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5", className)}
      aria-label="Today versus targets"
    >
      {meters.map((m) => {
        const ratio = m.target > 0 ? m.eaten / m.target : 0;
        const overCap = m.kind === "max" && ratio > 1;
        return (
          <div key={m.key} className="min-w-0 space-y-1.5">
            <dt className="truncate text-[11px] font-medium text-ink-subtle">{m.label}</dt>
            <dd className="truncate text-sm leading-none tabular-nums">
              <span className="font-semibold">{fmtNumber(Math.round(m.eaten))}</span>
              <span className="text-ink-subtle">
                {" / "}
                {fmtNumber(Math.round(m.target))} {m.unit}
              </span>
            </dd>
            <div className={cn("h-1.5 w-full overflow-hidden rounded-full", m.soft)} aria-hidden="true">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  overCap ? "bg-danger" : m.fill,
                )}
                style={{ width: `${Math.min(100, ratio * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </dl>
  );
}
