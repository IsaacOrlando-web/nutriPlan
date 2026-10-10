"use client";

import { SignOutButton } from "@clerk/nextjs";
import {
  Camera,
  Home,
  Leaf,
  MessageCircle,
  TrendingUp,
  UserCircle,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Disclaimer } from "@/components/common/Disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/lib/hooks/useProfile";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";
import { cn } from "@/lib/utils";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

interface NavItem {
  key: "dashboard" | "plan" | "log" | "trends" | "coach";
  label: string;
  href: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: Home,
    match: (p) => p === "/" || p === "/dashboard",
  },
  {
    key: "plan",
    label: "Plan",
    href: "/plan",
    icon: UtensilsCrossed,
    match: (p) => p.startsWith("/plan") || p.startsWith("/grocery"),
  },
  { key: "log", label: "Log", href: "/log/photo", icon: Camera, match: (p) => p.startsWith("/log") },
  {
    key: "trends",
    label: "Trends",
    href: "/trends",
    icon: TrendingUp,
    match: (p) => p.startsWith("/trends"),
  },
  { key: "coach", label: "Coach", href: "/coach", icon: MessageCircle, match: (p) => p.startsWith("/coach") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const profile = useProfile();
  const name = profile.data?.profile.name;

  return (
    <div className="flex min-h-screen">
      {/* Laptop sidebar */}
      <aside
        className="hidden w-60 shrink-0 flex-col border-r bg-surface-raised lg:flex"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex items-center gap-2 px-5 py-5 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </span>
          NutriPlan AI
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.key}
                href={item.href}
                data-testid={`nav-${item.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-soft text-brand-dark"
                    : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
                )}
              >
                <item.icon className="h-6 w-6" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <ProfileLink name={name} loading={profile.isLoading} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-surface-raised/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <Leaf className="h-4 w-4" aria-hidden="true" />
            </span>
            NutriPlan AI
          </Link>
          <ProfileLink name={name} loading={profile.isLoading} compact />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-6">
          <Disclaimer />
        </footer>
      </div>

      {/* Phone bottom nav */}
      <nav
        aria-label="Main navigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-surface-raised/95 backdrop-blur lg:hidden"
      >
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              data-testid={`nav-${item.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-brand-dark" : "text-ink-muted",
              )}
            >
              <item.icon className="h-6 w-6" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function ProfileLink({ name, loading, compact }: { name?: string; loading: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { logout } = useLoginFlow();

  return (
    <div className={cn("relative", compact ? "" : "w-full")}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex items-center gap-2 rounded-lg text-sm font-medium text-ink hover:bg-surface-sunken",
          compact ? "px-2 py-1" : "w-full px-3 py-2",
        )}
        aria-label="Profile"
      >
        <UserCircle className="h-6 w-6 text-ink-muted" aria-hidden="true" />
        {loading ? <Skeleton className="h-4 w-16" /> : <span className="truncate">{name ?? "Profile"}</span>}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-40 min-w-40 rounded-lg border bg-surface-raised p-1 shadow-sm",
            compact ? "top-full mt-2" : "bottom-full mb-2",
          )}
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-sm text-ink hover:bg-surface-sunken"
          >
            My profile
          </Link>
          {clerkEnabled ? (
            <SignOutButton redirectUrl="/welcome">
              <button
                type="button"
                role="menuitem"
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
              >
                Sign out
              </button>
            </SignOutButton>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => void logout()}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
