// emitEvent: the only way agents talk to the Agent Room. Owner: Agents.
// Clamps text to 140 characters, persists through the Store and paces events so the room looks live.
import type { AgentEvent, AgentEventKind, AgentName } from "@/types/contracts";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/db/store";

export const MAX_EVENT_TEXT = 140;

/** AGENT_EVENT_DELAY_MS wins; otherwise 0 under vitest, 900 ms elsewhere. */
export function eventDelayMs(): number {
  const raw = process.env.AGENT_EVENT_DELAY_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (process.env.VITEST || process.env.NODE_ENV === "test") return 0;
  return 900;
}

export function clampText(text: string, max = MAX_EVENT_TEXT): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3).trimEnd() + "...";
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export async function emitEvent(
  store: Store,
  runId: string,
  agent: AgentName,
  kind: AgentEventKind,
  text: string,
  data?: Record<string, unknown>,
): Promise<AgentEvent> {
  const event: AgentEvent = {
    eventId: newId(),
    runId,
    agent,
    kind,
    text: clampText(text),
    at: nowIso(),
    ...(data ? { data } : {}),
  };
  await store.addEvent(event);
  await sleep(eventDelayMs());
  return event;
}

/** Bound emitter so agents do not pass store and runId around. */
export function emitterFor(store: Store, runId: string) {
  return (agent: AgentName, kind: AgentEventKind, text: string, data?: Record<string, unknown>) =>
    emitEvent(store, runId, agent, kind, text, data);
}

export type Emit = ReturnType<typeof emitterFor>;
