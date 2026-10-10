"use client";

import { Handshake, Sigma, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/types/contracts";
import { AGENT_NAMES, AGENT_THEME, KIND_LABELS } from "./agent-theme";
import { AgentAvatar } from "./AgentAvatar";

/**
 * A "math moment": the Orchestrator reporting what the optimizer computed (a solve, its cost, a second solve).
 * These lines carry numbers from /math, never from a model, so they get a calculator mark.
 */
export function isMathMoment(event: AgentEvent): boolean {
  if (event.agent !== "orchestrator" || event.kind !== "proposal") return false;
  const d = event.data ?? {};
  return (
    typeof d.weeklyCostUsd === "number" ||
    typeof d.solveMs === "number" ||
    /\bsolve[ds]?\b|optimi[sz]er|second solve/i.test(event.text)
  );
}

export function AgentMessage({ event }: { event: AgentEvent }) {
  const theme = AGENT_THEME[event.agent];
  const tool = typeof event.data?.tool === "string" ? event.data.tool : null;

  if (event.kind === "tool_call") {
    return (
      <div
        data-testid="agent-event"
        data-kind={event.kind}
        data-agent={event.agent}
        className="ml-10 flex items-center gap-2 border-l-2 border-dashed border-border py-0.5 pl-3 font-mono text-[11px] leading-snug text-ink-subtle"
      >
        <Terminal className={cn("h-3 w-3 shrink-0", theme.text)} aria-hidden="true" />
        <span className={cn("font-semibold", theme.text)}>{AGENT_NAMES[event.agent]}</span>
        {tool && <span className="rounded bg-surface-sunken px-1 py-0.5 text-ink-muted">{tool}()</span>}
        <span className="min-w-0 truncate">{event.text}</span>
      </div>
    );
  }

  if (event.kind === "decision") {
    return (
      <div
        data-testid="agent-event"
        data-kind={event.kind}
        data-agent={event.agent}
        className="w-full rounded-xl border-2 border-brand bg-brand-soft p-4 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <AgentAvatar agent={event.agent} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
              {KIND_LABELS[event.kind]}
            </p>
            <p className="text-base font-semibold text-ink">{event.text}</p>
          </div>
        </div>
      </div>
    );
  }

  const objection = event.kind === "objection";
  const concession = event.kind === "concession";
  const math = isMathMoment(event);
  return (
    <div
      data-testid="agent-event"
      data-kind={event.kind}
      data-agent={event.agent}
      data-math={math || undefined}
      className={cn("flex items-start gap-2.5", objection && "animate-shake")}
    >
      <AgentAvatar agent={event.agent} size="sm" className="mt-0.5" />
      <div
        className={cn(
          "min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-3.5 py-2.5 text-sm shadow-sm",
          objection
            ? "border-l-4 border-danger/40 border-l-danger bg-danger-soft"
            : concession
              ? cn("animate-agent-pulse border-success/40 bg-success-soft", theme.pulse)
              : math
                ? "border-agent-orchestrator/40 bg-agent-orchestrator/10"
                : cn("bg-surface-raised", theme.border),
        )}
      >
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className={cn("text-xs font-semibold", theme.text)}>{AGENT_NAMES[event.agent]}</span>
          <span
            className={cn(
              "text-[11px] uppercase tracking-wide",
              objection ? "text-danger" : concession ? "text-brand-dark" : "text-ink-subtle",
            )}
          >
            {objection ? "Objects" : concession ? "Gives way" : KIND_LABELS[event.kind]}
          </span>
          {concession && <Handshake className="h-3.5 w-3.5 text-brand-dark" aria-hidden="true" />}
          {math && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-agent-orchestrator ring-1 ring-agent-orchestrator/30">
              <Sigma className="h-3 w-3" aria-hidden="true" />
              Computed
            </span>
          )}
        </div>
        <p className={cn("text-ink", math && "font-medium tabular-nums")}>{event.text}</p>
      </div>
    </div>
  );
}
