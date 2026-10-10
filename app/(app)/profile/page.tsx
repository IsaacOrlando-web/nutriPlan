"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, LogOut, Pencil, RotateCcw, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ACTIVITY_LABEL, CONDITION_LABEL, GOAL_LABEL, SEX_LABEL } from "@/components/onboarding/labels";
import { ALLERGY_OPTIONS, RESTRICTION_OPTIONS } from "@/components/onboarding/onboardingSchema";
import { Button } from "@/components/ui/button";
import { api, getMockUser, isApiRequestError, setMockUser, USE_MOCKS } from "@/lib/api";
import { keys } from "@/lib/hooks/keys";
import { useKrogerStatus } from "@/lib/hooks/useKroger";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, fmtNumber, fmtUsd, setCookie } from "@/lib/utils";

type DemoUser = "alex" | "maria";
const DEMO_NAME: Record<DemoUser, string> = { alex: "Alex", maria: "Maria" };

const labelOf = (options: readonly { value: string; label: string }[]) => (v: string) =>
  options.find((o) => o.value === v)?.label ?? v;

export default function ProfilePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const profile = useProfile();
  const session = useQuery({ queryKey: keys.session, queryFn: api.auth.session });
  const kroger = useKrogerStatus();
  const { logout } = useLoginFlow();
  const [busy, setBusy] = useState<string | null>(null);
  const missingProfile = isApiRequestError(profile.error, 404);
  const currentDemo: DemoUser = USE_MOCKS
    ? getMockUser()
    : profile.data?.profile.name.toLowerCase().includes("maria")
      ? "maria"
      : "alex";

  const switchUser = async (user: DemoUser) => {
    setBusy(`user-${user}`);
    try {
      if (USE_MOCKS) {
        setMockUser(user);
        setCookie("np_uid", `mock-${user}`);
      } else {
        await api.auth.login(`${user}@demo.nutriplan.app`, "demo1234");
      }
      await qc.invalidateQueries();
      router.refresh();
      toast.success(`Now viewing as ${DEMO_NAME[user]}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch user.");
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      await api.demo.reset(currentDemo);
      await qc.invalidateQueries();
      toast.success("Demo data reset.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset demo data.");
    } finally {
      setBusy(null);
    }
  };

  if (missingProfile && !profile.data) return <OnboardingFlow forceBlank />;
  const isDemoUser = session.data?.email?.endsWith("@demo.nutriplan.app") ?? false;
  const p = profile.data?.profile;
  const targets = profile.data?.targets;
  const constraints = profile.data?.constraints;

  return (
    <div data-testid="profile-screen" className="mx-auto w-full max-w-3xl space-y-10">
      {profile.isLoading && <LoadingState variant="page" />}
      {profile.error && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}

      {p && (
        <header className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xl font-semibold text-brand-dark sm:h-16 sm:w-16 sm:text-2xl"
            aria-hidden="true"
          >
            {p.name.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{p.name}</h1>
            <p className="text-sm text-ink-muted">
              {GOAL_LABEL[p.goal]}
              {p.goalRateKgPerWeek > 0 && ` · ${p.goalRateKgPerWeek} kg a week`}
              {" · "}
              <span className="tabular-nums">{fmtUsd(p.weeklyBudgetUsd, true)}</span> a week
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-10 shrink-0">
            <Link href="/onboarding">
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </Button>
        </header>
      )}

      {p && (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-6">
          <Stat label="Age" value={fmtNumber(p.age)} />
          <Stat label="Sex" value={SEX_LABEL[p.sex]} />
          <Stat label="Height" value={`${fmtNumber(p.heightCm)} cm`} />
          <Stat label="Weight" value={`${fmtNumber(p.weightKg)} kg`} />
          <Stat label="Activity" value={ACTIVITY_LABEL[p.activityLevel]} />
          <Stat label="Meals a day" value={fmtNumber(p.mealsPerDay)} />
        </dl>
      )}

      {p && (
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-12">
          <Group title="Health rules">
            <ChipRow label="Conditions" items={p.conditions.map((c) => CONDITION_LABEL[c])} />
            <ChipRow label="Medications" items={p.medications} />
            <ChipRow label="Allergies" items={p.allergies.map(labelOf(ALLERGY_OPTIONS))} tone="danger" />
            <ChipRow label="Restrictions" items={p.restrictions.map(labelOf(RESTRICTION_OPTIONS))} />
            {targets && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-ink-subtle">Daily targets</p>
                <p className="text-sm tabular-nums">
                  {fmtNumber(targets.calories)} kcal · {fmtNumber(targets.proteinG)} g protein · metabolism{" "}
                  {fmtNumber(targets.tdeeEstimate)} ± {fmtNumber(targets.tdeeUncertainty)}
                </p>
                {constraints && <p className="text-xs text-ink-muted">{constraints.summary}</p>}
              </div>
            )}
          </Group>

          <Group title="Preferences">
            <ChipRow label="Love" items={p.likes} tone="success" />
            <ChipRow label="Avoid" items={p.dislikes} />
          </Group>
        </div>
      )}

      {kroger.data?.configured && (
        <Link
          href="/grocery"
          className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-raised px-4 py-3 text-sm shadow-sm transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ShoppingCart className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">Kroger</span>
            <span className="text-ink-muted">
              {kroger.data.connected && kroger.data.location
                ? ` · Connected to ${kroger.data.location.name}`
                : kroger.data.connected
                  ? " · Connected, pick a store"
                  : " · Not connected"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        </Link>
      )}

      {isDemoUser && (
        <Group title="Demo user">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              data-testid="demo-user-switch"
              role="group"
              aria-label="Demo user"
              className="inline-flex rounded-full bg-surface-sunken p-1"
            >
              {(["alex", "maria"] as DemoUser[]).map((user) => (
                <button
                  key={user}
                  type="button"
                  data-testid={`demo-user-${user}`}
                  aria-pressed={currentDemo === user}
                  disabled={busy !== null}
                  onClick={() => void switchUser(user)}
                  className={cn(
                    "h-10 flex-1 rounded-full px-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 sm:flex-none",
                    currentDemo === user
                      ? "bg-surface-raised text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {DEMO_NAME[user]}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => void reset()}
              disabled={busy !== null}
              className="h-10 justify-start px-3 text-ink-muted sm:ml-auto"
            >
              <RotateCcw aria-hidden="true" />
              Reset demo data
            </Button>
          </div>
        </Group>
      )}

      <Group title="Account">
        <Button
          variant="ghost"
          size="lg"
          className="-ml-3 h-10 px-3 text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => void logout()}
        >
          <LogOut aria-hidden="true" />
          Log out
        </Button>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4" aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const CHIP_TONE = {
  neutral: "bg-surface-sunken text-ink",
  success: "bg-success-soft text-brand-dark",
  danger: "bg-danger-soft text-danger",
} as const;

function ChipRow({
  label,
  items,
  tone = "neutral",
}: {
  label: string;
  items: string[];
  tone?: keyof typeof CHIP_TONE;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-ink-subtle">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">None</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className={cn("rounded-full px-3 py-1 text-sm font-medium capitalize", CHIP_TONE[tone])}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
