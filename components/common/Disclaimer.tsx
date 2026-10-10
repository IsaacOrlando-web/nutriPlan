import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted",
        className,
      )}
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <span>
        NutriPlan AI supports, never replaces, your doctor or dietitian. It gives general nutrition guidance
        from published guidelines and is not medical advice. Talk to your doctor before changing medication or
        diet for a medical condition.
      </span>
    </p>
  );
}
