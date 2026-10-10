import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatPillProps {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
  "data-testid"?: string;
}

const TONES = {
  neutral: "text-ink",
  success: "text-brand-dark",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export function StatPill({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "neutral",
  className,
  ...rest
}: StatPillProps) {
  return (
    <div
      className={cn("flex items-center gap-3 rounded-xl border bg-surface-raised p-3 shadow-sm", className)}
      {...rest}
    >
      {Icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
          <Icon className="h-5 w-5 text-ink-muted" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-muted">{label}</p>
        <p className={cn("text-lg font-semibold leading-tight tabular-nums", TONES[tone])}>
          {value}
          {unit && <span className="ml-1 text-xs font-normal text-ink-subtle">{unit}</span>}
        </p>
        {hint && <p className="truncate text-[11px] text-ink-subtle">{hint}</p>}
      </div>
    </div>
  );
}
