import { cn } from "@/lib/utils";

export function ProgressSegments({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Onboarding progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-valuetext={`Step ${current + 1} of ${total}`}
      className="flex gap-1"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-300",
            i <= current ? "bg-brand" : "bg-surface-sunken",
          )}
        />
      ))}
    </div>
  );
}
