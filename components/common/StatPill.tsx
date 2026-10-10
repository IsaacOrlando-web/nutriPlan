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

/** One reading: label, number, when. Borderless so a row of them reads as one line, not three boxes. */
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
    <div className={cn("flex min-w-0 items-start gap-2.5", className)} {...rest}>
      {Icon && <Icon className="mt-1 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />}
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-subtle">{label}</p>
        <p className={cn("text-xl font-semibold leading-tight tabular-nums", TONES[tone])}>
          {value}
          {unit && <span className="ml-1 text-xs font-normal text-ink-subtle">{unit}</span>}
        </p>
        {hint && <p className="truncate text-[11px] text-ink-subtle">{hint}</p>}
      </div>
    </div>
  );
}
