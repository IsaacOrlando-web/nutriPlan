import { AlertTriangle, Info, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertLevel } from "@/types/contracts";
import { SourceLink } from "./SourceLink";

export interface AlertCardProps {
  level: AlertLevel;
  title: string;
  body: string;
  source?: string;
  className?: string;
  "data-testid"?: string;
}

const STYLES: Record<AlertLevel, { box: string; icon: typeof Info; iconColor: string }> = {
  info: { box: "border-agent-doctor/30 bg-agent-doctor/10", icon: Info, iconColor: "text-agent-doctor" },
  warning: { box: "border-warning/40 bg-warning-soft", icon: AlertTriangle, iconColor: "text-warning" },
  urgent: { box: "border-danger bg-danger-soft", icon: Siren, iconColor: "text-danger" },
};

export function AlertCard({ level, title, body, source, className, ...rest }: AlertCardProps) {
  const s = STYLES[level];
  const Icon = s.icon;
  return (
    <div
      role={level === "urgent" ? "alert" : "status"}
      data-level={level}
      className={cn("flex gap-3 rounded-xl border p-4", s.box, className)}
      {...rest}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", s.iconColor)} aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold leading-tight">{title}</p>
        <p className="text-sm text-ink-muted">{body}</p>
        {level === "urgent" && (
          <p className="text-sm font-semibold text-danger">
            Please contact your doctor or a healthcare professional now.
          </p>
        )}
        {source && <SourceLink source={source} />}
      </div>
    </div>
  );
}
