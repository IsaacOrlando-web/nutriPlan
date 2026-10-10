"use client";

import { cn } from "@/lib/utils";
import type { AgentName } from "@/types/contracts";
import { AGENT_NAMES, AGENT_THEME } from "./agent-theme";

const SIZES = {
  xs: { box: "h-6 w-6", icon: "h-3.5 w-3.5" },
  sm: { box: "h-8 w-8", icon: "h-4 w-4" },
  md: { box: "h-12 w-12", icon: "h-6 w-6" },
  lg: { box: "h-16 w-16 sm:h-20 sm:w-20", icon: "h-8 w-8 sm:h-10 sm:w-10" },
} as const;

export interface AgentAvatarProps {
  agent: AgentName;
  size?: keyof typeof SIZES;
  /** Pulses with the agent color (currently talking). */
  speaking?: boolean;
  /** Steady glow (decision reached). */
  glow?: boolean;
  showLabel?: boolean;
  /** Small grey word under the name, for example the agent's role. */
  sublabel?: string;
  className?: string;
}

export function AgentAvatar({
  agent,
  size = "md",
  speaking = false,
  glow = false,
  showLabel = false,
  sublabel,
  className,
}: AgentAvatarProps) {
  const theme = AGENT_THEME[agent];
  const Icon = theme.icon;
  const s = SIZES[size];
  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div
        role="img"
        aria-label={AGENT_NAMES[agent]}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full text-white shadow-md transition-transform duration-300",
          s.box,
          theme.bg,
          theme.pulse,
          speaking && "animate-agent-pulse scale-110",
          glow && "ring-4 ring-offset-2 ring-offset-surface animate-agent-pulse",
          glow && theme.ring,
        )}
      >
        <Icon className={s.icon} aria-hidden="true" />
      </div>
      {showLabel && (
        <span className="flex flex-col items-center leading-tight">
          <span className={cn("text-xs font-semibold", theme.text)}>{AGENT_NAMES[agent]}</span>
          {sublabel && <span className="text-[10px] text-ink-subtle">{sublabel}</span>}
        </span>
      )}
    </div>
  );
}
