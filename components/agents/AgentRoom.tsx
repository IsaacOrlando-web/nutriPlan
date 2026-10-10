"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { keys } from "@/lib/hooks/keys";
import { usePrefetchBudgetCurve } from "@/lib/hooks/useBudgetCurve";
import { cn, plural } from "@/lib/utils";
import type { AgentEvent, AgentName, MedicalConstraints } from "@/types/contracts";
import { AGENT_ORDER, AGENT_THEME } from "./agent-theme";
import { AgentAvatar } from "./AgentAvatar";
import { AgentMessage } from "./AgentMessage";
import { ConstraintStrip, type ConstraintChip } from "./ConstraintStrip";

type Phase = "live" | "replay" | "done" | "error";
type Speed = 1 | 2;

const STATUS_LABEL: Record<Phase, string> = {
  live: "Live",
  replay: "Replaying",
  done: "Plan approved",
  error: "Connection lost",
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const delayFor = (e: AgentEvent) => (e.kind === "tool_call" ? 700 : 1300);

/** Rules shown in the strip, derived from the stream itself. */
function deriveChips(events: AgentEvent[]): ConstraintChip[] {
  const constraintsEvent = events.find(
    (e) => e.agent === "doctor" && e.data && typeof e.data.constraints === "object",
  );
  const constraints = constraintsEvent?.data?.constraints as MedicalConstraints | undefined;
  if (!constraints) return [];
  const verified = events.some(
    (e) =>
      e.kind === "decision" ||
      (e.kind === "tool_call" && e.data?.tool === "verifyPlan" && Number(e.data?.violations ?? 1) === 0),
  );
  const solved = events.some((e) => e.data && typeof e.data.weeklyCostUsd === "number");
  const chips: ConstraintChip[] = constraints.reasons.map((r) => ({
    id: r.rule,
    satisfied: verified,
    why: r.why,
    source: r.source,
  }));
  chips.push({ id: "weekly_budget", satisfied: solved || verified });
  return chips;
}

export function AgentRoom({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [phase, setPhase] = useState<Phase>("live");
  const [speed, setSpeed] = useState<Speed>(1);
  const speedRef = useRef<Speed>(1);
  const cancelRef = useRef<() => void>(() => undefined);
  const feedRef = useRef<HTMLDivElement>(null);
  speedRef.current = speed;

  const loadStored = useCallback(
    () =>
      qc.fetchQuery({
        queryKey: keys.agentRun(runId),
        queryFn: () => api.agents.run(runId),
        staleTime: Infinity,
      }),
    [qc, runId],
  );

  useEffect(() => {
    setEvents([]);
    setPhase("live");
    const unsubscribe = api.agents.subscribe(
      runId,
      (e) => setEvents((prev) => (prev.some((p) => p.eventId === e.eventId) ? prev : [...prev, e])),
      () => setPhase("done"),
      () => {
        loadStored()
          .then((detail) => {
            setEvents(detail.events);
            setPhase("done");
          })
          .catch(() => setPhase("error"));
      },
    );
    cancelRef.current = unsubscribe;
    return unsubscribe;
  }, [runId, loadStored]);

  const replay = useCallback(async () => {
    cancelRef.current();
    let cancelled = false;
    cancelRef.current = () => {
      cancelled = true;
    };
    setEvents([]);
    setPhase("replay");
    try {
      const detail = await loadStored();
      for (const e of detail.events) {
        if (cancelled) return;
        await sleep(delayFor(e) / speedRef.current);
        if (cancelled) return;
        setEvents((prev) => [...prev, e]);
      }
      if (!cancelled) setPhase("done");
    } catch {
      if (!cancelled) setPhase("error");
    }
  }, [loadStored]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const latest = events[events.length - 1];
  const decided = events.some((e) => e.kind === "decision");
  // Warm the budget tradeoff curve for the new plan so the slider is ready when the user lands on /plan.
  const prefetchCurve = usePrefetchBudgetCurve();
  useEffect(() => {
    if (decided) prefetchCurve({ invalidate: true });
  }, [decided, prefetchCurve]);
  const running = phase === "live" || phase === "replay";
  const speaking: AgentName | null = running && latest && !decided ? latest.agent : null;
  const optimizing = running && latest?.kind === "tool_call" && latest.data?.tool === "optimizePlan";
  const chips = useMemo(() => deriveChips(events), [events]);
  const lastByAgent = useMemo(() => {
    const map = new Map<AgentName, string>();
    for (const e of events) if (e.kind !== "tool_call") map.set(e.agent, e.text);
    return map;
  }, [events]);

  if (phase === "error" && events.length === 0) {
    return <ErrorState message="We could not load this negotiation." onRetry={() => void replay()} />;
  }

  return (
    <div data-testid="agent-room" className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge
            variant={phase === "done" ? "success" : phase === "replay" ? "secondary" : "default"}
            className="gap-1.5"
          >
            {running && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />}
            {STATUS_LABEL[phase]}
          </Badge>
          <span className="text-xs text-ink-subtle">
            {events.length === 0 ? "no messages yet" : plural(events.length, "message")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Replay speed"
            className="flex rounded-lg border bg-surface-raised p-0.5"
          >
            {([1, 2] as Speed[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  speed === s ? "bg-ink text-white" : "text-ink-muted hover:text-ink",
                )}
              >
                {s}x
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void replay()}
            disabled={phase === "replay" && events.length === 0}
          >
            <RotateCcw aria-hidden="true" />
            Replay
          </Button>
        </div>
      </div>

      <ConstraintStrip chips={chips} />

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Table */}
        <div className="min-w-0 lg:col-span-7">
          <Card className="overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              {/* Phone: row of avatars */}
              <div className="flex items-start justify-between gap-2 lg:hidden">
                {[...AGENT_ORDER, "orchestrator" as const].map((a) => (
                  <AgentAvatar
                    key={a}
                    agent={a}
                    size="md"
                    showLabel
                    speaking={speaking === a}
                    glow={decided}
                  />
                ))}
              </div>

              {/* Laptop: round table */}
              <div className="relative mx-auto hidden aspect-square w-full max-w-[560px] lg:block">
                <div
                  className="absolute inset-[22%] rounded-full border-2 border-dashed border-border bg-surface-sunken/70"
                  aria-hidden="true"
                />
                <TableSeat
                  agent="orchestrator"
                  pos="center"
                  speaking={speaking}
                  decided={decided}
                  text={lastByAgent.get("orchestrator")}
                />
                <TableSeat
                  agent="doctor"
                  pos="top"
                  speaking={speaking}
                  decided={decided}
                  text={lastByAgent.get("doctor")}
                />
                <TableSeat
                  agent="chef"
                  pos="right"
                  speaking={speaking}
                  decided={decided}
                  text={lastByAgent.get("chef")}
                />
                <TableSeat
                  agent="budget"
                  pos="bottom"
                  speaking={speaking}
                  decided={decided}
                  text={lastByAgent.get("budget")}
                />
                <TableSeat
                  agent="monitor"
                  pos="left"
                  speaking={speaking}
                  decided={decided}
                  text={lastByAgent.get("monitor")}
                />
              </div>

              <AnimatePresence>
                {optimizing && (
                  <motion.div
                    key="optimizer"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-4 flex items-center gap-3 rounded-xl border border-agent-orchestrator/30 bg-surface-sunken p-3"
                    role="status"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-agent-orchestrator" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">Optimizer running</p>
                      <p className="text-xs text-ink-muted">
                        Solving 7 days of meals as a mixed integer program: health rules are hard constraints,
                        cost, taste and variety are the objective.
                      </p>
                    </div>
                  </motion.div>
                )}
                {decided && (
                  <motion.div
                    key="decision"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="mt-4 flex flex-col items-center gap-3 rounded-xl border-2 border-brand bg-brand-soft p-4 text-center sm:flex-row sm:text-left"
                  >
                    <Sparkles className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="font-semibold text-brand-dark">Your plan is ready</p>
                      <p className="text-sm text-ink-muted">
                        Every day passes every rule and the week fits your budget.
                      </p>
                    </div>
                    <Button asChild size="lg" data-testid="plan-ready">
                      <Link href="/plan">
                        See your plan
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>

        {/* Feed */}
        <div className="min-w-0 lg:col-span-5">
          <Card className="flex h-[420px] flex-col overflow-hidden lg:h-[640px]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Negotiation</h2>
              {phase === "error" && (
                <span className="text-xs text-danger">Showing the saved negotiation</span>
              )}
            </div>
            <div ref={feedRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {events.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Agents are joining the room…
                </p>
              )}
              <AnimatePresence initial={false}>
                {events.map((e) => (
                  <motion.div
                    key={e.eventId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    layout
                  >
                    <AgentMessage event={e} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const SEAT_POS: Record<"center" | "top" | "right" | "bottom" | "left", string> = {
  center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  top: "left-1/2 top-0 -translate-x-1/2",
  right: "right-0 top-1/2 -translate-y-1/2",
  bottom: "bottom-0 left-1/2 -translate-x-1/2",
  left: "left-0 top-1/2 -translate-y-1/2",
};

function TableSeat({
  agent,
  pos,
  speaking,
  decided,
  text,
}: {
  agent: AgentName;
  pos: keyof typeof SEAT_POS;
  speaking: AgentName | null;
  decided: boolean;
  text?: string;
}) {
  const theme = AGENT_THEME[agent];
  const isSpeaking = speaking === agent;
  return (
    <div className={cn("absolute flex w-40 flex-col items-center gap-2", SEAT_POS[pos])}>
      <AgentAvatar agent={agent} size="lg" showLabel speaking={isSpeaking} glow={decided} />
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "line-clamp-2 rounded-lg border bg-surface-raised px-2 py-1 text-center text-[11px] leading-snug text-ink-muted shadow-sm",
              isSpeaking && cn("text-ink", theme.border),
            )}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
