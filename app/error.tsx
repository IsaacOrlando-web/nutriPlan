"use client";

// Route error boundary: a calm, branded page with one retry instead of Next's raw "Application error".
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Something broke</p>
      <h1 className="text-2xl font-semibold tracking-tight">This screen hit an error</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        Your plan and readings are safe. Try again, or go back to the dashboard.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg px-4 py-2 text-sm font-medium text-ink hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Go to dashboard
        </Link>
      </div>
      {error.digest && <p className="text-xs text-ink-subtle">Reference {error.digest}</p>}
    </main>
  );
}
