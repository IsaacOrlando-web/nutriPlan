import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  variant?: "page" | "list" | "cards" | "chart" | "chat";
  rows?: number;
  className?: string;
}

export function LoadingState({ variant = "page", rows = 3, className }: LoadingStateProps) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className={cn("space-y-4", className)}>
      {variant === "page" && (
        <>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </>
      )}
      {variant === "list" &&
        Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      {variant === "cards" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}
      {variant === "chart" && (
        <>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </>
      )}
      {variant === "chat" &&
        Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn("h-12 w-3/4 rounded-2xl", i % 2 === 1 && "ml-auto")} />
        ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
