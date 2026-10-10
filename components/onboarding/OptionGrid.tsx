"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

export interface OptionGridProps<T extends string | number> {
  options: Option<T>[];
  value: T | T[] | undefined;
  onChange: (value: T) => void;
  multiple?: boolean;
  columns?: 1 | 2;
  "aria-label": string;
}

export function OptionGrid<T extends string | number>({
  options,
  value,
  onChange,
  multiple = false,
  columns = 1,
  ...rest
}: OptionGridProps<T>) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={rest["aria-label"]}
      className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}
    >
      {options.map((opt) => {
        const active = selected(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              active
                ? "bg-brand-soft text-brand-dark ring-1 ring-brand"
                : "bg-surface-raised text-ink ring-1 ring-border hover:ring-ink-subtle",
            )}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium sm:text-base">{opt.label}</span>
              {opt.hint && (
                <span className={cn("block text-xs", active ? "text-brand-dark/80" : "text-ink-muted")}>
                  {opt.hint}
                </span>
              )}
            </span>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                active ? "bg-brand text-brand-foreground" : "ring-1 ring-ink-subtle",
              )}
              aria-hidden="true"
            >
              {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
