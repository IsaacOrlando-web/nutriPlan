"use client";

import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ruleLabel } from "@/components/agents/agent-theme";
import { Disclaimer } from "@/components/common/Disclaimer";
import { SourceLink } from "@/components/common/SourceLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProfileBundle } from "@/types/contracts";

export interface RulesScreenProps {
  bundle: ProfileBundle;
  onContinue: () => void;
  pending: boolean;
  error?: string | null;
}

export function RulesScreen({ bundle, onContinue, pending, error }: RulesScreenProps) {
  const { constraints, targets } = bundle;
  return (
    <div data-testid="rules-screen" className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <AgentAvatar agent="doctor" size="md" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your plan rules</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Doctor read the guidelines that apply to you. Every rule below is a hard constraint for the
            optimizer.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-agent-doctor/30 bg-agent-doctor/10 p-4 text-sm">
        {constraints.summary}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily targets</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Target label="Calories" value={`${targets.calories} kcal`} />
            <Target label="Protein" value={`${targets.proteinG} g`} />
            <Target label="Carbs" value={`${targets.carbsG} g`} />
            <Target label="Fat" value={`${targets.fatG} g`} />
            <Target label="Fiber" value={`${targets.fiberG} g`} />
            <Target label="Sodium" value={`${targets.sodiumMg} mg`} />
            <Target label="Potassium" value={`${targets.potassiumMg} mg`} />
            <Target
              label="Metabolism (kcal)"
              value={`${targets.tdeeEstimate} ± ${targets.tdeeUncertainty}`}
            />
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-5 w-5 text-agent-doctor" aria-hidden="true" />
          {constraints.reasons.length} rules with sources
        </h2>
        <ul className="space-y-2">
          {constraints.reasons.map((r) => (
            <li key={r.rule} className="rounded-xl border bg-surface-raised p-4">
              <p className="font-medium">{ruleLabel(r.rule)}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{r.why}</p>
              <p className="mt-1.5">
                <SourceLink source={r.source} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        data-testid="rules-continue"
        size="lg"
        className="w-full"
        onClick={onContinue}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <ArrowRight aria-hidden="true" />
        )}
        Build my plan
      </Button>
      <Disclaimer />
    </div>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
