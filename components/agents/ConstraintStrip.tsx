"use client";

import { Check, Circle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SourceLink } from "@/components/common/SourceLink";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ruleLabel } from "./agent-theme";

export interface ConstraintChip {
  id: string;
  satisfied: boolean;
  why?: string;
  source?: string;
}

/** Doctor's hard rules as a quiet one line strip. Chips with a reason open it on tap. */
export function ConstraintStrip({ chips, className }: { chips: ConstraintChip[]; className?: string }) {
  const [open, setOpen] = useState<ConstraintChip | null>(null);
  const done = chips.filter((c) => c.satisfied).length;
  const allDone = chips.length > 0 && done === chips.length;
  return (
    <section
      data-testid="constraint-strip"
      aria-label="Doctor's rules"
      className={cn("flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4", className)}
    >
      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        <ShieldCheck
          className={cn("h-4 w-4", allDone ? "text-brand" : "text-agent-doctor")}
          aria-hidden="true"
        />
        <span className="font-semibold uppercase tracking-wide text-ink-subtle">Doctor&apos;s rules</span>
        <span className="tabular-nums text-ink-muted">
          {chips.length > 0 ? `· ${done} of ${chips.length} verified` : "· waiting for Doctor"}
        </span>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {chips.length === 0 && (
          <>
            <li className="h-7 w-24 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
            <li className="h-7 w-28 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
            <li className="h-7 w-20 shrink-0 animate-pulse rounded-full bg-surface-sunken" />
          </>
        )}
        {chips.map((chip) => (
          <li key={chip.id} data-satisfied={chip.satisfied} className="shrink-0">
            <button
              type="button"
              onClick={() => chip.why && setOpen(chip)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                chip.satisfied ? "bg-success-soft text-brand-dark" : "bg-surface-sunken text-ink-muted",
                chip.why ? "cursor-pointer hover:brightness-95" : "cursor-default",
              )}
            >
              {chip.satisfied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-2.5 w-2.5 text-ink-subtle" aria-hidden="true" />
              )}
              {ruleLabel(chip.id)}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open ? ruleLabel(open.id) : ""}</DialogTitle>
            <DialogDescription>{open?.why}</DialogDescription>
          </DialogHeader>
          {open?.source && <SourceLink source={open.source} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
