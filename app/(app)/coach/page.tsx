"use client";

import { Loader2, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCoach } from "@/lib/hooks/useCoach";
import { cn } from "@/lib/utils";
import type { CoachMessage } from "@/types/contracts";

const SUGGESTIONS = ["Swap tonight's dinner", "Can I eat well on less?", "Why is my sodium capped?"];

export default function CoachPage() {
  const coach = useCoach();
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

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[480px] flex-col gap-4 lg:h-[calc(100vh-9rem)]">
      <PageHeader
        title="Coach"
        subtitle="Ask anything about your plan. The coach knows your rules, targets and logs."
      />
      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-surface-raised p-4"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <AgentAvatar agent="orchestrator" size="lg" />
            <p className="max-w-sm text-sm text-ink-muted">
              Hi! I know your plan, your rules and your logs. What would you like to change or understand?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-testid="coach-message"
            data-role={m.role}
            className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "assistant" && <AgentAvatar agent="orchestrator" size="sm" />}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%]",
                m.role === "user"
                  ? "rounded-br-sm bg-brand text-brand-foreground"
                  : "rounded-bl-sm border bg-surface-raised",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {coach.isPending && (
          <div className="flex items-end gap-2">
            <AgentAvatar agent="orchestrator" size="sm" />
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Thinking…
            </div>
          </div>
        )}
        {coach.error && !coach.isPending && (
          <ErrorState error={coach.error} onRetry={() => coach.mutate(messages)} />
        )}
        {replanRunId && (
          <div className="flex justify-center">
            <Button asChild variant="outline" size="sm">
              <Link href={`/agents/${replanRunId}`}>
                <Sparkles aria-hidden="true" />
                Watch the agents replan
              </Link>
            </Button>
          </div>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <Input
          data-testid="coach-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about a meal, a swap, your budget…"
          aria-label="Message the coach"
          autoComplete="off"
        />
        <Button
          type="submit"
          data-testid="coach-send"
          size="icon"
          disabled={!draft.trim() || coach.isPending}
          aria-label="Send"
        >
          <Send aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
