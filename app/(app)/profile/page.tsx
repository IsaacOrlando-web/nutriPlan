"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, RotateCcw, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { ACTIVITY_LABEL, CONDITION_LABEL, GOAL_LABEL, SEX_LABEL } from "@/components/onboarding/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api, getMockUser, isApiRequestError, setMockUser, USE_MOCKS } from "@/lib/api";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, setCookie } from "@/lib/utils";
import { keys } from "@/lib/hooks/keys";

type DemoUser = "alex" | "maria";
const DEMO_NAME: Record<DemoUser, string> = { alex: "Alex", maria: "Maria" };

export default function ProfilePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const profile = useProfile();
  const session = useQuery({ queryKey: keys.session, queryFn: api.auth.session });
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

  return (
    <div data-testid="profile-screen" className="space-y-6">
      <PageHeader
        title="Profile"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/onboarding">
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </Button>
        }
      />

      {profile.isLoading && <LoadingState variant="page" />}
      {profile.error && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}
      {profile.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{profile.data.profile.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Field label="Age" value={`${profile.data.profile.age}`} />
              <Field label="Sex" value={SEX_LABEL[profile.data.profile.sex]} />
              <Field label="Height" value={`${profile.data.profile.heightCm} cm`} />
              <Field label="Weight" value={`${profile.data.profile.weightKg} kg`} />
              <Field label="Activity" value={ACTIVITY_LABEL[profile.data.profile.activityLevel]} />
              <Field
                label="Goal"
                value={`${GOAL_LABEL[profile.data.profile.goal]}${profile.data.profile.goalRateKgPerWeek ? ` · ${profile.data.profile.goalRateKgPerWeek} kg/wk` : ""}`}
              />
              <Field label="Weekly budget" value={`$${profile.data.profile.weeklyBudgetUsd}`} />
              <Field label="Meals per day" value={`${profile.data.profile.mealsPerDay}`} />
            </dl>
            <Separator />
            <ChipRow
              label="Conditions"
              items={profile.data.profile.conditions.map((c) => CONDITION_LABEL[c])}
            />
            <ChipRow label="Medications" items={profile.data.profile.medications} />
            <ChipRow label="Allergies" items={profile.data.profile.allergies} variant="danger" />
            <ChipRow label="Restrictions" items={profile.data.profile.restrictions} />
            <ChipRow label="Likes" items={profile.data.profile.likes} variant="success" />
            <ChipRow label="Dislikes" items={profile.data.profile.dislikes} />
            <Separator />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Daily targets</p>
              <p className="text-ink-muted">
                {profile.data.targets.calories} kcal · {profile.data.targets.proteinG} g protein · metabolism
                estimate {profile.data.targets.tdeeEstimate} ± {profile.data.targets.tdeeUncertainty} kcal
              </p>
              <p className="text-xs text-ink-subtle">{profile.data.constraints.summary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isDemoUser && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-ink-muted" aria-hidden="true" />
            Demo user
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            data-testid="demo-user-switch"
            role="group"
            aria-label="Demo user"
            className="flex rounded-lg border bg-surface-sunken p-1"
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
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium",
                  currentDemo === user ? "bg-surface-raised shadow-sm" : "text-ink-muted",
                )}
              >
                {DEMO_NAME[user]}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reset()}
            disabled={busy !== null}
            className="w-full sm:w-auto"
          >
            <RotateCcw aria-hidden="true" />
            Reset demo data
          </Button>
        </CardContent>
      </Card>}

      <Button
        variant="ghost"
        className="text-danger hover:bg-danger-soft hover:text-danger"
        onClick={() => void logout()}
      >
        <LogOut aria-hidden="true" />
        Log out
      </Button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ChipRow({
  label,
  items,
  variant = "secondary",
}: {
  label: string;
  items: string[];
  variant?: "secondary" | "success" | "danger";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="mr-1 text-xs text-ink-muted">{label}:</span>
      {items.length === 0 ? (
        <span className="text-xs text-ink-subtle">none</span>
      ) : (
        items.map((item) => (
          <Badge key={item} variant={variant}>
            {item}
          </Badge>
        ))
      )}
    </div>
  );
}
