"use client";

import { motion } from "framer-motion";
import { Activity, ArrowRight, Handshake, Loader2, Sigma, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ALL_AGENTS } from "@/components/agents/agent-theme";
import { Button } from "@/components/ui/button";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";
import { cn } from "@/lib/utils";

const STEPS: { title: string; body: string; icon: LucideIcon; tone: string }[] = [
  {
    title: "Negotiate",
    body: "Doctor, Chef, Budget and Monitor argue over your week.",
    icon: Handshake,
    tone: "text-agent-doctor",
  },
  {
    title: "Optimize",
    body: "A solver picks seven days of real meals inside every rule.",
    icon: Sigma,
    tone: "text-agent-orchestrator",
  },
  {
    title: "Adapt",
    body: "Monitor reads your trend and rebuilds the week when it moves.",
    icon: Activity,
    tone: "text-agent-monitor",
  },
];

export default function WelcomePage() {
  const { login, pending, error } = useLoginFlow("/");

  return (
    <div className="w-full max-w-3xl space-y-10 text-center sm:space-y-12">
      {/* Hero. Only the avatars animate; the text is readable before hydration. */}
      <section className="space-y-5">
        <div className="flex justify-center -space-x-2" aria-hidden="true">
          {ALL_AGENTS.map((a, i) => (
            <motion.div
              key={a}
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.07, duration: 0.3 }}
              className="rounded-full ring-4 ring-surface"
            >
              <AgentAvatar agent={a} size="md" />
            </motion.div>
          ))}
        </div>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
          Four AI agents plan your week.
        </h1>
        <p className="mx-auto max-w-lg text-balance text-base text-ink-muted sm:text-lg">
          Doctor, Chef, Budget and Monitor negotiate every meal. Health rules never move.
        </p>
      </section>

      {/* Primary action: pick a demo persona */}
      <section aria-label="Try a demo" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <DemoCard
            testId="cta-start"
            initial="A"
            name="Alex"
            age={22}
            blurb="Student. Wants to lose fat on $50 a week. Allergic to peanuts."
            cta="Try as Alex"
            loading={pending === "alex"}
            disabled={pending !== null}
            onClick={() => void login("alex")}
          />
          <DemoCard
            testId="cta-maria"
            initial="M"
            name="Maria"
            age={45}
            blurb="Type 2 diabetes and high blood pressure. $70 a week, four meals a day."
            cta="Try as Maria"
            loading={pending === "maria"}
            disabled={pending !== null}
            onClick={() => void login("maria")}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <p className="text-sm text-ink-muted">
          Have an account?{" "}
          <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
            Log in
          </Link>
          <span className="px-1.5 text-ink-subtle">·</span>
          <Link href="/signup" className="font-medium text-brand underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </section>

      {/* How it works: three steps on one line, no boxes */}
      <section aria-labelledby="how-it-works" className="space-y-4">
        <h2 id="how-it-works" className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          How it works
        </h2>
        <ol className="grid gap-4 text-left sm:grid-cols-3 sm:gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3 sm:flex-col sm:items-center sm:text-center">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <Icon className={cn("h-4 w-4", step.tone)} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="mr-1 tabular-nums text-ink-subtle">{i + 1}</span>
                    {step.title}
                  </p>
                  <p className="text-sm text-ink-muted">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function DemoCard({
  testId,
  initial,
  name,
  age,
  blurb,
  cta,
  loading,
  disabled,
  onClick,
}: {
  testId: string;
  initial: string;
  name: string;
  age: number;
  blurb: string;
  cta: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-surface-raised p-5 text-left shadow-sm ring-1 ring-border">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand-dark"
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">
            {name}
            <span className="font-normal text-ink-muted">, {age}</span>
          </p>
          <p className="text-xs text-ink-subtle">Demo account</p>
        </div>
      </div>
      <p className="flex-1 text-sm text-ink-muted">{blurb}</p>
      <Button data-testid={testId} size="lg" onClick={onClick} disabled={disabled} className="w-full">
        {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {cta}
        {!loading && <ArrowRight aria-hidden="true" />}
      </Button>
    </div>
  );
}
