"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AgentName } from "@/types/contracts";
import { AGENT_ROLES, AGENT_THEME, ALL_AGENTS } from "./agent-theme";
import { AgentAvatar } from "./AgentAvatar";

export interface RoundTableProps {
  speaking: AgentName | null;
  decided: boolean;
  /** Last thing each agent said (tool calls excluded). */
  lastByAgent: Map<AgentName, string>;
  className?: string;
}

const SEAT_POS: Record<AgentName, string> = {
  orchestrator: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  doctor: "left-1/2 top-0 -translate-x-1/2",
  chef: "right-0 top-1/2 -translate-y-1/2",
  budget: "bottom-0 left-1/2 -translate-x-1/2",
  monitor: "left-0 top-1/2 -translate-y-1/2",
};

/** Laptop: the five agents around a table, each with its latest line. */
export function RoundTable({ speaking, decided, lastByAgent, className }: RoundTableProps) {
  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[460px]", className)} aria-hidden="true">
      <div
        className={cn(
          "absolute inset-[24%] rounded-full border border-dashed transition-colors duration-700",
          decided ? "border-brand/50 bg-brand-soft/40" : "border-border bg-surface-sunken/80",
        )}
      />
      {ALL_AGENTS.map((agent) => {
        const text = lastByAgent.get(agent);
        const isSpeaking = speaking === agent;
        const theme = AGENT_THEME[agent];
        return (
          <div
            key={agent}
            className={cn("absolute flex w-36 flex-col items-center gap-1.5", SEAT_POS[agent])}
          >
            <AgentAvatar
              agent={agent}
              size="lg"
              showLabel
              sublabel={AGENT_ROLES[agent]}
              speaking={isSpeaking}
              glow={decided}
              muted={speaking !== null && !isSpeaking && !decided}
            />
            <AnimatePresence mode="wait">
              {text && (
                <motion.p
                  key={text}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "line-clamp-3 rounded-lg border-l-2 bg-surface-raised px-2 py-1 text-center text-[11px] leading-snug shadow-sm",
                    isSpeaking ? cn("text-ink", theme.accent) : "border-l-transparent text-ink-muted",
                  )}
                >
                  {text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Phone: one row of avatars, the speaker lit, everyone else faded. */
export function AgentRow({
  speaking,
  decided,
  className,
}: {
  speaking: AgentName | null;
  decided: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between", className)} aria-hidden="true">
      {ALL_AGENTS.map((agent) => (
        <AgentAvatar
          key={agent}
          agent={agent}
          size="md"
          showLabel
          speaking={speaking === agent}
          glow={decided}
          muted={speaking !== null && speaking !== agent && !decided}
        />
      ))}
    </div>
  );
}
