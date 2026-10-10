"use client";

import { cn, plural } from "@/lib/utils";
import type { AgentEvent, AgentName } from "@/types/contracts";
import { AGENT_NAMES, AGENT_THEME, ALL_AGENTS } from "./agent-theme";
import { AgentAvatar } from "./AgentAvatar";

interface Tally {
  proposals: number;
  objections: number;
  concessions: number;
  toolCalls: number;
  decisions: number;
}

/** Counts per agent, straight from the events on screen. Nothing is estimated. */
export function tallyEvents(events: AgentEvent[]): Map<AgentName, Tally> {
  const map = new Map<AgentName, Tally>();
  for (const e of events) {
    const t = map.get(e.agent) ?? { proposals: 0, objections: 0, concessions: 0, toolCalls: 0, decisions: 0 };
    if (e.kind === "proposal") t.proposals += 1;
    else if (e.kind === "decision") t.decisions += 1;
    else if (e.kind === "objection") t.objections += 1;
    else if (e.kind === "concession") t.concessions += 1;
    else if (e.kind === "tool_call") t.toolCalls += 1;
    map.set(e.agent, t);
  }
  return map;
}

function describe(t: Tally): string {
  const parts: string[] = [];
  if (t.proposals) parts.push(plural(t.proposals, "proposal"));
  if (t.objections) parts.push(plural(t.objections, "objection"));
  if (t.concessions) parts.push(plural(t.concessions, "concession"));
  if (t.toolCalls) parts.push(plural(t.toolCalls, "tool call"));
  if (t.decisions) parts.push(plural(t.decisions, "decision"));
  return parts.length > 0 ? parts.join(" · ") : "listened";
}

/** Shown once the run is done: what each agent contributed. */
export function AgentSummary({ events, className }: { events: AgentEvent[]; className?: string }) {
  const tally = tallyEvents(events);
  return (
    <section
      data-testid="agent-summary"
      aria-label="What each agent did"
      className={cn("space-y-2", className)}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">What each agent did</h2>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1">
        {ALL_AGENTS.map((agent) => {
          const t = tally.get(agent);
          if (!t) return null;
          return (
            <li key={agent} className="flex items-center gap-2 text-xs">
              <AgentAvatar agent={agent} size="xs" />
              <span className={cn("w-20 shrink-0 font-semibold", AGENT_THEME[agent].text)}>
                {AGENT_NAMES[agent]}
              </span>
              <span className="tabular-nums text-ink-muted">{describe(t)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
