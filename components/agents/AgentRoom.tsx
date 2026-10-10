"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { keys } from "@/lib/hooks/keys";
import { usePrefetchBudgetCurve } from "@/lib/hooks/useBudgetCurve";
import { cn, plural } from "@/lib/utils";
import type { AgentEvent, AgentName, MedicalConstraints } from "@/types/contracts";
import { AgentMessage } from "./AgentMessage";
import { AgentSummary } from "./AgentSummary";
import { ConstraintStrip, type ConstraintChip } from "./ConstraintStrip";
import { PhaseTrack, phaseIndex } from "./PhaseTrack";
import { AgentRow, RoundTable } from "./RoundTable";
import { ShareButton } from "./ShareButton";

type Phase = "live" | "replay" | "done" | "error";
type Speed = 1 | 2;

const STATUS_LABEL: Record<Phase, string> = {
  live: "Live",
  replay: "Replaying",
  done: "Plan approved",
  error: "Saved copy",
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
  const readyRef = useRef<HTMLDivElement>(null);
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

  // Follow the stream: scrolls the feed on laptop and the page on phone, whichever is nearest.
  useEffect(() => {
    const last = feedRef.current?.lastElementChild;
    if (last instanceof HTMLElement) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [events.length]);

  const latest = events[events.length - 1];
  const decided = events.some((e) => e.kind === "decision");
  // Warm the budget tradeoff curve for the new plan so the slider is ready when the user lands on /plan.
  const prefetchCurve = usePrefetchBudgetCurve();
  useEffect(() => {
    if (decided) prefetchCurve({ invalidate: true });
  }, [decided, prefetchCurve]);
  useEffect(() => {
    if (decided) readyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [decided]);

  const running = phase === "live" || phase === "replay";
  const speaking: AgentName | null = running && latest && !decided ? latest.agent : null;
  const optimizing = running && latest?.kind === "tool_call" && latest.data?.tool === "optimizePlan";
  const chips = useMemo(() => deriveChips(events), [events]);
  const phaseIdx = useMemo(() => phaseIndex(events), [events]);
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
      <PageHeader
        title="Agent Room"
        subtitle="Four agents, one referee, your week."
        actions={
          <>
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums",
                phase === "done"
                  ? "bg-success-soft text-brand-dark"
                  : phase === "error"
                    ? "bg-warning-soft text-warning"
                    : "bg-ink text-white",
              )}
              role="status"
            >
              {running && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />
              )}
              {STATUS_LABEL[phase]}
              {events.length > 0 && (
                <span className={cn("font-normal", phase === "done" ? "text-brand-dark/70" : "opacity-70")}>
                  · {plural(events.length, "message")}
                </span>
              )}
            </span>
            <div
              role="group"
              aria-label="Replay speed"
              className="flex h-8 rounded-md border border-input bg-surface-raised p-0.5 shadow-sm"
            >
              {([1, 2] as Speed[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cn(
                    "rounded px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
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
            <ShareButton />
          </>
        }
      />

      <PhaseTrack current={phaseIdx} done={decided} />
      <ConstraintStrip chips={chips} />

      {/* Phone: compact header, pinned under the app bar, the speaker lit. */}
      <AgentRow
        speaking={speaking}
        decided={decided}
        className="sticky top-[53px] z-20 -mx-4 border-b border-border/60 bg-surface/95 px-5 py-2.5 backdrop-blur lg:hidden"
      />

      <div className="grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_1fr] lg:gap-x-6">
        {/* Laptop: the table */}
        <div className="hidden lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:block">
          <RoundTable speaking={speaking} decided={decided} lastByAgent={lastByAgent} className="py-2" />
          <AnimatePresence>
            {optimizing && (
              <motion.div
                key="optimizer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-3 flex items-center gap-3 rounded-xl bg-surface-sunken px-3 py-2.5"
                role="status"
              >
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin text-agent-orchestrator"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold">Optimizer running</p>
                  <p className="text-xs text-ink-muted">
                    Health rules are hard constraints. Cost, taste and variety are the objective.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Transcript: the page on phone, a scrolling panel on laptop */}
        <section
          aria-label="Negotiation transcript"
          className="min-w-0 lg:col-span-7 lg:col-start-6 lg:row-span-3 lg:row-start-1 lg:flex lg:h-[calc(100vh-19rem)] lg:min-h-[520px] lg:flex-col lg:rounded-2xl lg:bg-surface-sunken/70"
        >
          <div className="hidden items-center justify-between px-5 pb-2 pt-4 lg:flex">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Negotiation</h2>
            {phase === "error" && (
              <span className="text-xs text-warning">Live stream lost, showing the saved run</span>
            )}
          </div>
          {phase === "error" && (
            <p className="mb-2 text-xs text-warning lg:hidden">Live stream lost, showing the saved run</p>
          )}
          <div
            ref={feedRef}
            className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-4 lg:pb-4"
            aria-live="polite"
          >
            {events.length === 0 && (
              <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">
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
        </section>

        {decided && (
          <AgentSummary
            events={events}
            className="lg:col-span-5 lg:col-start-1 lg:row-start-2 lg:self-start"
          />
        )}

        {decided && (
          <motion.div
            ref={readyRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="sticky bottom-[4.25rem] z-20 flex items-center gap-3 rounded-2xl bg-brand-soft p-3 shadow-lg ring-2 ring-brand sm:p-4 lg:static lg:col-span-5 lg:col-start-1 lg:row-start-3 lg:self-start lg:shadow-none"
          >
            <Sparkles className="hidden h-6 w-6 shrink-0 text-brand sm:block" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-brand-dark">Your plan is ready</p>
              <p className="text-xs text-ink-muted sm:text-sm">
                Every day passes every rule, inside your budget.
              </p>
            </div>
            <Button asChild size="lg" data-testid="plan-ready" className="shrink-0 px-4 sm:px-6">
              <Link href="/plan">
                See plan
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
