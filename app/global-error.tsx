"use client";

// Last-resort boundary for errors thrown by the root layout itself. Must render its own <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface font-sans text-ink">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">NutriPlan AI</p>
          <h1 className="text-2xl font-semibold tracking-tight">The app could not start</h1>
          <p className="max-w-sm text-sm text-ink-muted">
            Reload the page. If it keeps happening, tell the team.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-dark"
          >
            Reload
          </button>
          {error.digest && <p className="text-xs text-ink-subtle">Reference {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
