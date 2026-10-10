"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ruleLabel } from "@/components/agents/agent-theme";
import { SourceLink } from "@/components/common/SourceLink";
import { StickyActions } from "@/components/onboarding/StickyActions";
import { Button } from "@/components/ui/button";
import { fmtNumber } from "@/lib/utils";
import type { ProfileBundle } from "@/types/contracts";

export interface RulesScreenProps {
  bundle: ProfileBundle;
  onContinue: () => void;
  pending: boolean;
  error?: string | null;
}

export function RulesScreen({ bundle, onContinue, pending, error }: RulesScreenProps) {
  const { constraints, targets } = bundle;
  const secondary: { label: string; value: string }[] = [
    { label: "Protein", value: `${fmtNumber(targets.proteinG)} g` },
    { label: "Carbs", value: `${fmtNumber(targets.carbsG)} g` },
    { label: "Fat", value: `${fmtNumber(targets.fatG)} g` },
    { label: "Fiber", value: `${fmtNumber(targets.fiberG)} g` },
    { label: "Sodium", value: `${fmtNumber(targets.sodiumMg)} mg` },
    { label: "Potassium", value: `${fmtNumber(targets.potassiumMg)} mg` },
    {
      label: "Metabolism",
      value: `${fmtNumber(targets.tdeeEstimate)} ± ${fmtNumber(targets.tdeeUncertainty)}`,
    },
  ];

  return (
    <div data-testid="rules-screen" className="mx-auto flex w-full max-w-xl flex-col">
      <header className="space-y-3">
        <div className="flex items-center gap-2.5">
          <AgentAvatar agent="doctor" size="sm" />
          <span className="text-xs font-semibold uppercase tracking-wide text-agent-doctor">Doctor</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your plan rules</h1>
        <p className="text-sm text-ink-muted">{constraints.summary}</p>
      </header>

      <section className="mt-8 space-y-4" aria-labelledby="rules-targets">
        <h2 id="rules-targets" className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Daily target
        </h2>
        <p className="text-5xl font-bold tabular-nums tracking-tight">
          {fmtNumber(targets.calories)}
          <span className="ml-2 text-lg font-medium text-ink-muted">kcal</span>
        </p>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4">
          {secondary.map((t) => (
            <div key={t.label}>
              <dt className="text-xs text-ink-subtle">{t.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">{t.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 space-y-2" aria-labelledby="rules-list">
        <h2 id="rules-list" className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          {constraints.reasons.length} hard rules
        </h2>
        <ul className="divide-y divide-border/70">
          {constraints.reasons.map((r) => (
            <li key={r.rule} className="grid gap-1 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-agent-doctor">
                <span className="h-4 w-0.5 shrink-0 rounded-full bg-agent-doctor" aria-hidden="true" />
                {ruleLabel(r.rule)}
              </p>
              <div className="space-y-1 sm:pt-px">
                <p className="text-sm text-ink">{r.why}</p>
                <SourceLink source={r.source} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <StickyActions className="mt-6">
        <Button
          data-testid="rules-continue"
          size="lg"
          className="w-full"
          onClick={onContinue}
          disabled={pending}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Build my plan
          {!pending && <ArrowRight aria-hidden="true" />}
        </Button>
      </StickyActions>
    </div>
  );
}
