"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/types/contracts";

/** The six stages a negotiation goes through, in order. Advanced by event kind and agent, never by time. */
export const PHASES = ["Rules", "Ideas", "Negotiation", "Optimize", "Verify", "Done"] as const;

export function phaseIndex(events: AgentEvent[]): number {
  let idx = -1;
  for (const e of events) {
    const tool = e.data?.tool;
    if (e.kind === "decision") idx = Math.max(idx, 5);
    else if (e.kind === "tool_call" && tool === "verifyPlan") idx = Math.max(idx, 4);
    else if (e.kind === "tool_call" && tool === "optimizePlan") idx = Math.max(idx, 3);
    else if (e.kind === "objection" || e.kind === "concession") idx = Math.max(idx, 2);
    else if (e.agent === "chef") idx = Math.max(idx, 1);
    else if (e.agent === "doctor") idx = Math.max(idx, 0);
  }
  return idx;
}

/** Where the negotiation is, as a thin line of six steps. */
export function PhaseTrack({ current, done }: { current: number; done: boolean }) {
  return (
    <ol
      className="no-scrollbar -mx-4 flex items-center overflow-x-auto px-4 text-[11px] font-medium sm:text-xs lg:mx-0 lg:px-0"
      aria-label="Negotiation progress"
      data-testid="agent-progress"
    >
      {PHASES.map((label, i) => {
        const complete = i < current || done;
        const active = i === current && !done;
        return (
          <li key={label} className="flex shrink-0 items-center">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 transition-colors",
                active && "bg-ink px-2.5 text-white",
                complete && "text-brand-dark",
                !complete && !active && "text-ink-subtle",
              )}
            >
              {complete ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    active ? "animate-pulse bg-white" : "bg-ink-subtle/60",
                  )}
                  aria-hidden="true"
                />
              )}
              {label}
            </span>
            {i < PHASES.length - 1 && (
              <span
                className={cn(
                  "mx-1.5 h-px w-4 sm:mx-2 sm:w-7",
                  i < current || done ? "bg-brand" : "bg-border",
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
