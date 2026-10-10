"use client";

import { motion } from "framer-motion";
import { Activity, ArrowRight, Handshake, Loader2, Sigma, type LucideIcon } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AGENT_ORDER, AGENT_ROLES } from "@/components/agents/agent-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";

const HOW_IT_WORKS: { step: string; title: string; body: string; icon: LucideIcon; tone: string }[] = [
  {
    step: "1",
    title: "Negotiate",
    body: "Doctor, Chef, Budget and Monitor argue over your week. Doctor's health rules never move.",
    icon: Handshake,
    tone: "bg-agent-doctor/10 text-agent-doctor",
  },
  {
    step: "2",
    title: "Optimize",
    body: "A solver picks seven days of real meals that fit every rule and your budget. No guessing.",
    icon: Sigma,
    tone: "bg-agent-orchestrator/10 text-agent-orchestrator",
  },
  {
    step: "3",
    title: "Adapt",
    body: "Monitor watches your weight and readings and rebuilds the week when the trend says so.",
    icon: Activity,
    tone: "bg-agent-monitor/10 text-agent-monitor",
  },
];

export default function WelcomePage() {
  const { login, pending, error } = useLoginFlow("/");

  return (
    <div className="w-full max-w-3xl space-y-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <div className="flex justify-center gap-3">
          {[...AGENT_ORDER, "orchestrator" as const].map((a, i) => (
            <motion.div
              key={a}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.08 }}
            >
              <AgentAvatar agent={a} size="md" showLabel sublabel={AGENT_ROLES[a]} />
            </motion.div>
          ))}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          A team of AI helpers plans what you eat.
        </h1>
        <p className="mx-auto max-w-xl text-base text-ink-muted sm:text-lg">
          Doctor, Chef, Budget and Monitor negotiate a healthy, affordable week for you, then keep fixing it
          as your body and life change.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DemoCard
          testId="cta-start"
          name="Alex, 22"
          blurb="College student. Wants to lose fat on $50 a week. Allergic to peanuts."
          cta="Try as Alex"
          loading={pending === "alex"}
          disabled={pending !== null}
          onClick={() => void login("alex")}
        />
        <DemoCard
          testId="cta-maria"
          name="Maria, 45"
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

      <section aria-labelledby="how-it-works" className="space-y-3">
        <h2 id="how-it-works" className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          How it works
        </h2>
        <ol className="grid gap-3 text-left sm:grid-cols-3">
          {HOW_IT_WORKS.map((item, i) => {
            const Icon = item.icon;
            return (
              <li
                key={item.title}
                className="relative flex gap-3 rounded-xl bg-surface-raised p-4 shadow-sm ring-1 ring-border sm:flex-col"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.tone}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="text-ink-subtle">{item.step}. </span>
                    {item.title}
                  </p>
                  <p className="text-sm text-ink-muted">{item.body}</p>
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ArrowRight
                    className="absolute -right-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-ink-subtle sm:block"
                    aria-hidden="true"
                  />
                )}
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
  name,
  blurb,
  cta,
  loading,
  disabled,
  onClick,
}: {
  testId: string;
  name: string;
  blurb: string;
  cta: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="text-left">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <p className="text-lg font-semibold">{name}</p>
        <p className="flex-1 text-sm text-ink-muted">{blurb}</p>
        <Button data-testid={testId} size="lg" onClick={onClick} disabled={disabled} className="w-full">
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight aria-hidden="true" />
          )}
          {cta}
        </Button>
      </CardContent>
    </Card>
  );
}
