"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, error, onRetry, className }: ErrorStateProps) {
  const detail = message ?? (error instanceof Error ? error.message : undefined);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-8 text-center",
        className,
      )}
    >
      <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="font-semibold">Something went wrong</p>
      {detail && <p className="max-w-sm text-sm text-ink-muted">{detail}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
