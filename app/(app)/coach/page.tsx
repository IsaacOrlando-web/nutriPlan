"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/button";
import { useCoach } from "@/lib/hooks/useCoach";
import { usePlan } from "@/lib/hooks/usePlan";
import { cn, fmtUsd } from "@/lib/utils";
import type { CoachMessage } from "@/types/contracts";

/** The first chip quotes the week's real cost from the API when a plan exists. */
function suggestions(weeklyCostUsd: number | undefined): string[] {
  return [
    weeklyCostUsd === undefined
      ? "Why does my plan cost what it does?"
      : `Why is my plan ${fmtUsd(weeklyCostUsd)}?`,
    "Swap tonight's dinner",
    "What should I eat before the gym?",
    "Why is my sodium capped?",
  ];
}

export default function CoachPage() {
  const coach = useCoach();
  const plan = usePlan();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replanRunId, setReplanRunId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, coach.isPending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || coach.isPending) return;
    const next: CoachMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    coach.mutate(next, {
      onSuccess: (res) => {
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
        if (res.replanRunId) setReplanRunId(res.replanRunId);
      },
    });
  };

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] min-h-[480px] w-full max-w-3xl flex-col lg:h-[calc(100vh-9rem)]">
      <header className="flex items-center gap-3">
        <AgentAvatar agent="orchestrator" size="sm" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Coach</h1>
          <p className="text-sm text-ink-muted">Knows your plan, rules and logs.</p>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto py-5" aria-live="polite">
        {empty && !coach.isPending && !coach.error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <AgentAvatar agent="orchestrator" size="lg" />
            <p className="text-sm text-ink-muted">Ask about a meal, a swap or your budget.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-testid="coach-message"
            data-role={m.role}
            className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "assistant" && <AgentAvatar agent="orchestrator" size="xs" className="mb-1" />}
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[70%]",
                m.role === "user"
                  ? "rounded-br-md bg-brand-soft text-ink"
                  : "rounded-bl-md bg-surface-raised text-ink shadow-sm",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {coach.isPending && (
          <div className="flex items-end gap-2" aria-label="Coach is typing">
            <AgentAvatar agent="orchestrator" size="xs" className="mb-1" />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-raised px-4 py-3.5 shadow-sm">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-subtle"
                  style={{ animationDelay: `${i * 180}ms` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        )}
        {coach.error && !coach.isPending && (
          <ErrorState error={coach.error} onRetry={() => coach.mutate(messages)} />
        )}
        {replanRunId && (
          <div className="flex justify-center pt-1">
            <Button asChild variant="outline" size="sm">
              <Link href={`/agents/${replanRunId}`}>
                <Sparkles aria-hidden="true" />
                Watch the agents replan
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 bg-surface pt-1">
        {empty && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {suggestions(plan.data?.weeklyCostUsd).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={coach.isPending}
                className="h-10 shrink-0 whitespace-nowrap rounded-full bg-surface-raised px-4 text-sm font-medium text-ink ring-1 ring-border transition-colors hover:text-brand-dark hover:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            data-testid="coach-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message Coach"
            aria-label="Message the coach"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-full bg-surface-raised px-5 text-base text-ink shadow-sm ring-1 ring-border placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:text-sm"
          />
          <Button
            type="submit"
            data-testid="coach-send"
            size="icon"
            className="h-12 w-12 shrink-0 rounded-full"
            disabled={!draft.trim() || coach.isPending}
            aria-label="Send"
          >
            <ArrowUp aria-hidden="true" strokeWidth={2.5} />
          </Button>
        </form>
      </div>
    </div>
  );
}
