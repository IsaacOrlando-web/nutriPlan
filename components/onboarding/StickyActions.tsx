import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Primary actions pinned above the phone tab bar; in normal flow on laptop.
 * Negative margins bleed the bar to the main gutters so the blur covers scrolled content.
 */
export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-14 z-20 -mx-4 mt-2 border-t border-border/70 bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:pt-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
