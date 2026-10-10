"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  clearDraft,
  blankOnboardingDefaults,
  loadDraft,
  onboardingDefaults,
  onboardingSchema,
  saveDraft,
  STEPS,
  toProfileInput,
  type OnboardingValues,
} from "@/components/onboarding/onboardingSchema";
import {
  AboutStep,
  GoalStep,
  HealthStep,
  LifestyleStep,
  PreferencesStep,
  SummaryStep,
} from "@/components/onboarding/OnboardingSteps";
import { ProgressSegments } from "@/components/onboarding/ProgressSegments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProfile, useSaveProfile } from "@/lib/hooks/useProfile";
import { isApiRequestError } from "@/lib/api";

const LAST = STEPS.length - 1;

export default function OnboardingFlow({ forceBlank = false }: { forceBlank?: boolean }) {
  const router = useRouter();
  const existing = useProfile(!forceBlank);
  const save = useSaveProfile();
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: existing.data ? onboardingDefaults(existing.data) : blankOnboardingDefaults(),
    mode: "onTouched",
  });

  // Saved profile first, then any unfinished draft from this browser on top.
  useEffect(() => {
    if (hydrated || (!forceBlank && existing.isPending)) return;
    const draft = forceBlank ? null : loadDraft();
    if (forceBlank) clearDraft();
    form.reset({
      ...(forceBlank ? blankOnboardingDefaults() : existing.data ? onboardingDefaults(existing.data) : blankOnboardingDefaults()),
      ...draft?.values,
    });
    setStep(draft?.step ?? 0);
    setHydrated(true);
  }, [hydrated, existing.isPending, existing.data, forceBlank, form]);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft({ step, values: form.getValues() });
    const sub = form.watch((values) => saveDraft({ step, values: values as Partial<OnboardingValues> }));
    return () => sub.unsubscribe();
  }, [hydrated, step, form]);

  const goTo = (next: number) => {
    setStep(Math.min(Math.max(0, next), LAST));
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const current = STEPS[step];

  const onValid = (values: OnboardingValues) => {
    save.mutate(toProfileInput(values), {
      onSuccess: () => {
        clearDraft();
        router.replace("/");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save your profile."),
    });
  };

  // Any invalid field sends the user back to the first step that owns one.
  const onInvalid = (errors: FieldErrors<OnboardingValues>) => {
    const bad = STEPS.findIndex((s) => s.fields.some((f) => f in errors));
    if (bad >= 0) goTo(bad);
    toast.error("A few answers need another look.");
  };

  const next = async () => {
    if (step === LAST) return form.handleSubmit(onValid, onInvalid)();
    const ok = await form.trigger([...current.fields]);
    if (ok) goTo(step + 1);
  };

  const reset = () => {
    clearDraft();
    form.reset(forceBlank ? blankOnboardingDefaults() : onboardingDefaults(existing.data));
    goTo(0);
  };

  if (!forceBlank && existing.isError && !isApiRequestError(existing.error, 404)) {
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  }
  if (!hydrated) return <LoadingState variant="page" />;

  return (
    <div data-testid="onboarding-screen" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{"optional" in current && current.optional ? "Optional" : ""}</span>
          <span aria-live="polite">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <ProgressSegments current={step} total={STEPS.length} />
      </div>

      <FormProvider {...form}>
        <form
          noValidate
          className="flex flex-col gap-6 rounded-2xl border bg-surface-raised p-5 shadow-sm sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-2xl font-bold tracking-tight outline-none sm:text-3xl"
                >
                  {current.title}
                </h1>
                <p className="text-sm text-ink-muted">{current.help}</p>
              </div>
              {current.id === "about" && <AboutStep />}
              {current.id === "goal" && <GoalStep />}
              {current.id === "health" && <HealthStep />}
              {current.id === "preferences" && <PreferencesStep />}
              {current.id === "lifestyle" && <LifestyleStep />}
              {current.id === "summary" && <SummaryStep onEdit={goTo} />}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="onboarding-reset"
                    className="text-ink-muted"
                  >
                    <RotateCcw aria-hidden="true" />
                    Reset
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start over?</DialogTitle>
                    <DialogDescription>
                      This clears your unsaved answers and takes you back to step 1.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        Keep my answers
                      </Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button type="button" variant="destructive" onClick={reset}>
                        Reset
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex gap-2">
              {"optional" in current && current.optional && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="onboarding-skip"
                  onClick={() => goTo(step + 1)}
                >
                  Skip
                </Button>
              )}
              <Button
                type="submit"
                size={step === LAST ? "lg" : "default"}
                data-testid="onboarding-next"
                disabled={save.isPending}
                className="flex-1 sm:flex-none"
              >
                {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {step === LAST ? "Save and see my rules" : "Continue"}
                {!save.isPending && <ArrowRight aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
