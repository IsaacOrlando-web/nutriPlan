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

/** Last emit time per run: pacing guarantees a minimum gap between events instead of sleeping after each one. */
const lastEmitAt = new Map<string, number>();

export async function emitEvent(
  store: Store,
  runId: string,
  agent: AgentName,
  kind: AgentEventKind,
  text: string,
  data?: Record<string, unknown>,
): Promise<AgentEvent> {
  // Wait only for what is left of the gap: an LLM call or a solve that already took longer costs nothing extra.
  const delay = eventDelayMs();
  const last = lastEmitAt.get(runId);
  if (last !== undefined && delay > 0) await sleep(last + delay - Date.now());
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
  lastEmitAt.set(runId, Date.now());
  if (kind === "decision") lastEmitAt.delete(runId);
  return event;
}

/** Bound emitter so agents do not pass store and runId around. */
export function emitterFor(store: Store, runId: string) {
  return (agent: AgentName, kind: AgentEventKind, text: string, data?: Record<string, unknown>) =>
    emitEvent(store, runId, agent, kind, text, data);
}

export type Emit = ReturnType<typeof emitterFor>;
