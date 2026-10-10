"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copies the page URL so the negotiation can be opened by someone else. */
export function ShareButton({ className }: { className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(id);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  const label = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Share";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      data-testid="agent-share"
      aria-label="Share this negotiation: copy the page link"
      title="Share this negotiation"
      className={cn(state === "copied" && "border-brand text-brand-dark", className)}
    >
      {state === "copied" ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      {label}
    </Button>
  );
}
