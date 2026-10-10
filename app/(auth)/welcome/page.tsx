"use client";

import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { AGENT_ORDER } from "@/components/agents/agent-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";

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
              <AgentAvatar agent={a} size="md" showLabel />
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
