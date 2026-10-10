"use client";

import { Check, Circle } from "lucide-react";
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

export function ConstraintStrip({ chips, className }: { chips: ConstraintChip[]; className?: string }) {
  const [open, setOpen] = useState<ConstraintChip | null>(null);
  const done = chips.filter((c) => c.satisfied).length;
  return (
    <section
      data-testid="constraint-strip"
      aria-label="Doctor's rules"
      className={cn("space-y-2", className)}
    >
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span className="font-medium uppercase tracking-wide">Doctor&apos;s rules</span>
        <span>{chips.length > 0 ? `${done} of ${chips.length} verified` : "Waiting for Doctor…"}</span>
      </div>
      <ul className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-wrap">
        {chips.length === 0 && <li className="h-7 w-32 animate-pulse rounded-full bg-surface-sunken" />}
        {chips.map((chip) => (
          <li key={chip.id} data-satisfied={chip.satisfied} className="shrink-0">
            <button
              type="button"
              onClick={() => chip.why && setOpen(chip)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-500",
                chip.satisfied
                  ? "border-success bg-success-soft text-brand-dark"
                  : "border-border bg-surface-raised text-ink-muted",
                chip.why ? "cursor-pointer hover:border-ink-subtle" : "cursor-default",
              )}
            >
              {chip.satisfied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-3 w-3" aria-hidden="true" />
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
