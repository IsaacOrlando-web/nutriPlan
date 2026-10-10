"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { GoalsForm } from "@/components/onboarding/GoalsForm";
import { toProfileInput } from "@/components/onboarding/goalsSchema";
import { Button } from "@/components/ui/button";
import { useProfile, useSaveProfile } from "@/lib/hooks/useProfile";

export default function GoalsPage() {
  const router = useRouter();
  const profile = useProfile();
  const save = useSaveProfile();

  return (
    <div data-testid="goals-screen" className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Define your goals"
        subtitle="Doctor, Chef and Budget plan your week around these answers."
      />

      {profile.isPending && <LoadingState variant="page" />}

      {profile.isError && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}

      {profile.isSuccess && !profile.data.profile && (
        <EmptyState
          icon={UserRound}
          title="No profile yet"
          body="Answer a few questions first, then come back to fine tune your goals."
          action={
            <Button asChild>
              <Link href="/onboarding">Start onboarding</Link>
            </Button>
          }
        />
      )}

      {profile.isSuccess && profile.data.profile && (
        <GoalsForm
          profile={profile.data.profile}
          saving={save.isPending}
          onSkip={() => router.push("/")}
          onSubmit={(values) =>
            save.mutate(toProfileInput(values, profile.data.profile), {
              onSuccess: () => {
                toast.success("Goals saved.");
                router.push("/");
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Could not save your goals."),
            })
          }
        />
      )}
    </div>
  );
}
