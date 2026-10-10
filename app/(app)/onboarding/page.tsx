"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { LoadingState } from "@/components/common/LoadingState";
import { ChipInput } from "@/components/onboarding/ChipInput";
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  CONDITION_LABEL,
  GOAL_HINT,
  GOAL_LABEL,
  SEX_LABEL,
} from "@/components/onboarding/labels";
import { OptionGrid } from "@/components/onboarding/OptionGrid";
import { RulesScreen } from "@/components/onboarding/RulesScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useGeneratePlan } from "@/lib/hooks/usePlan";
import { useProfile, useSaveProfile } from "@/lib/hooks/useProfile";
import type { ProfileBundle } from "@/types/contracts";

// Mirrors UserProfile (minus userId). Kept local to the screen on purpose.
const schema = z.object({
  name: z.string().trim().min(1).max(40),
  language: z.enum(["en", "es"]),
  sex: z.enum(["male", "female"]),
  age: z.coerce.number().int().min(13).max(100),
  heightCm: z.coerce.number().min(120).max(230),
  weightKg: z.coerce.number().min(30).max(300),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goal: z.enum(["lose", "maintain", "gain"]),
  goalRateKgPerWeek: z.coerce.number().min(0).max(1),
  conditions: z.array(z.enum(["type2_diabetes", "hypertension", "kidney_disease", "high_cholesterol"])),
  medications: z.array(z.string()),
  allergies: z.array(z.string()),
  restrictions: z.array(z.string()),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  weeklyBudgetUsd: z.coerce.number().min(20).max(150),
  mealsPerDay: z.union([z.literal(3), z.literal(4)]),
});
type Values = z.infer<typeof schema>;

type StepId =
  | "name"
  | "sex"
  | "age"
  | "height"
  | "weight"
  | "activity"
  | "goal"
  | "likes"
  | "dislikes"
  | "allergies"
  | "restrictions"
  | "health"
  | "budget"
  | "mealsPerDay";

interface Step {
  id: StepId;
  fields: (keyof Values)[];
  title: string;
  help: string;
  optional?: boolean;
}

const STEPS: Step[] = [
  {
    id: "name",
    fields: ["name"],
    title: "What should we call you?",
    help: "The agents will use your name when they talk about your plan.",
  },
  { id: "sex", fields: ["sex"], title: "What is your sex?", help: "Used only for the metabolism formula." },
  { id: "age", fields: ["age"], title: "How old are you?", help: "Age shifts your calorie needs." },
  { id: "height", fields: ["heightCm"], title: "How tall are you?", help: "In centimeters." },
  {
    id: "weight",
    fields: ["weightKg"],
    title: "What do you weigh today?",
    help: "In kilograms. A rough number is fine, Monitor will learn the truth from your readings.",
  },
  {
    id: "activity",
    fields: ["activityLevel"],
    title: "How active are you?",
    help: "Pick the closest match for a normal week.",
  },
  {
    id: "goal",
    fields: ["goal", "goalRateKgPerWeek"],
    title: "What is your goal?",
    help: "Doctor sets a safe calorie floor whatever you pick.",
  },
  {
    id: "likes",
    fields: ["likes"],
    title: "What do you love eating?",
    help: "Chef builds around these. Cuisines and ingredients both work.",
  },
  {
    id: "dislikes",
    fields: ["dislikes"],
    title: "Anything you never want to see?",
    help: "Chef keeps these out of the pool.",
  },
  {
    id: "allergies",
    fields: ["allergies"],
    title: "Any allergies?",
    help: "Allergens are removed in code before any meal is planned.",
  },
  {
    id: "restrictions",
    fields: ["restrictions"],
    title: "Any diet restrictions?",
    help: "Vegetarian, halal, no pork and so on.",
  },
  {
    id: "health",
    fields: ["conditions", "medications"],
    optional: true,
    title: "Any health conditions?",
    help: "Optional. Doctor adds stricter, cited rules for diabetes, blood pressure, kidneys and cholesterol.",
  },
  {
    id: "budget",
    fields: ["weeklyBudgetUsd"],
    title: "What is your weekly food budget?",
    help: "Budget prices every meal and keeps the week under this number.",
  },
  {
    id: "mealsPerDay",
    fields: ["mealsPerDay"],
    title: "How many meals a day?",
    help: "You can change this any time.",
  },
];

const SUGGEST = {
  likes: ["chicken", "beans", "rice bowls", "eggs", "salmon", "mexican", "soups", "fruit", "pasta", "tofu"],
  dislikes: ["mushrooms", "cottage cheese", "sardines", "liver", "cilantro", "olives"],
  allergies: ["peanut", "nuts", "dairy", "gluten", "shellfish", "egg", "soy"],
  restrictions: ["vegetarian", "vegan", "halal", "kosher", "no_pork", "pescatarian"],
} as const;
type ChipStep = keyof typeof SUGGEST;
const CHIP_LABEL: Record<ChipStep, string> = {
  likes: "Foods you like",
  dislikes: "Foods you avoid",
  allergies: "Allergies",
  restrictions: "Diet restrictions",
};

const CONDITIONS = ["type2_diabetes", "hypertension", "kidney_disease", "high_cholesterol"] as const;
const ACTIVITIES = ["sedentary", "light", "moderate", "active", "very_active"] as const;
const GOALS = ["lose", "maintain", "gain"] as const;

function defaults(bundle?: ProfileBundle): Values {
  const p = bundle?.profile;
  return {
    name: p?.name ?? "",
    language: p?.language ?? "en",
    sex: p?.sex ?? "male",
    age: p?.age ?? 30,
    heightCm: p?.heightCm ?? 170,
    weightKg: p?.weightKg ?? 75,
    activityLevel: p?.activityLevel ?? "light",
    goal: p?.goal ?? "maintain",
    goalRateKgPerWeek: p?.goalRateKgPerWeek ?? 0,
    conditions: p?.conditions ?? [],
    medications: p?.medications ?? [],
    allergies: p?.allergies ?? [],
    restrictions: p?.restrictions ?? [],
    likes: p?.likes ?? [],
    dislikes: p?.dislikes ?? [],
    weeklyBudgetUsd: p?.weeklyBudgetUsd ?? 60,
    mealsPerDay: p?.mealsPerDay ?? 3,
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const existing = useProfile();
  const save = useSaveProfile();
  const generate = useGeneratePlan();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<ProfileBundle | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
    mode: "onTouched",
  });

  useEffect(() => {
    if (existing.data) form.reset(defaults(existing.data));
  }, [existing.data, form]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  const next = async () => {
    const ok = await form.trigger(current.fields);
    if (!ok) return;
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    const values = form.getValues();
    const payload: Values = {
      ...values,
      goalRateKgPerWeek: values.goal === "maintain" ? 0 : values.goalRateKgPerWeek,
    };
    save.mutate(payload, {
      onSuccess: (bundle) => setSaved(bundle),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save your profile."),
    });
  };

  const skipHealth = () => {
    form.setValue("conditions", []);
    form.setValue("medications", []);
    setStep((s) => s + 1);
  };

  const build = () => {
    generate.mutate(
      { trigger: "onboarding" },
      {
        onSuccess: ({ runId }) => router.push(`/agents/${runId}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not start your plan."),
      },
    );
  };

  if (saved) {
    return (
      <RulesScreen
        bundle={saved}
        onContinue={build}
        pending={generate.isPending}
        error={generate.error instanceof Error ? generate.error.message : null}
      />
    );
  }

  if (existing.isLoading) return <LoadingState variant="page" />;

  const goal = form.watch("goal");
  const budget = form.watch("weeklyBudgetUsd");
  const isChipStep = (id: StepId): id is ChipStep => id in SUGGEST;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          {current.optional && <span>Optional</span>}
        </div>
        <Progress value={progress} aria-label="Onboarding progress" />
      </div>

      <form
        className="flex flex-1 flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{current.title}</h1>
          <p className="text-sm text-ink-muted">{current.help}</p>
        </div>

        <div className="flex-1 space-y-4">
          {current.id === "name" && (
            <Field id="name" label="First name" error={form.formState.errors.name?.message}>
              <Input id="name" autoFocus autoComplete="given-name" {...form.register("name")} />
            </Field>
          )}
          {current.id === "sex" && (
            <Controller
              control={form.control}
              name="sex"
              render={({ field }) => (
                <OptionGrid
                  aria-label="Sex"
                  columns={2}
                  value={field.value}
                  onChange={field.onChange}
                  options={(["male", "female"] as const).map((v) => ({ value: v, label: SEX_LABEL[v] }))}
                />
              )}
            />
          )}
          {current.id === "age" && (
            <Field id="age" label="Age" error={form.formState.errors.age?.message}>
              <Input id="age" type="number" inputMode="numeric" autoFocus {...form.register("age")} />
            </Field>
          )}
          {current.id === "height" && (
            <Field id="heightCm" label="Height (cm)" error={form.formState.errors.heightCm?.message}>
              <Input
                id="heightCm"
                type="number"
                inputMode="decimal"
                autoFocus
                {...form.register("heightCm")}
              />
            </Field>
          )}
          {current.id === "weight" && (
            <Field id="weightKg" label="Weight (kg)" error={form.formState.errors.weightKg?.message}>
              <Input
                id="weightKg"
                type="number"
                inputMode="decimal"
                step="0.1"
                autoFocus
                {...form.register("weightKg")}
              />
            </Field>
          )}
          {current.id === "activity" && (
            <Controller
              control={form.control}
              name="activityLevel"
              render={({ field }) => (
                <OptionGrid
                  aria-label="Activity"
                  value={field.value}
                  onChange={field.onChange}
                  options={ACTIVITIES.map((v) => ({
                    value: v,
                    label: ACTIVITY_LABEL[v],
                    hint: ACTIVITY_HINT[v],
                  }))}
                />
              )}
            />
          )}
          {current.id === "goal" && (
            <>
              <Controller
                control={form.control}
                name="goal"
                render={({ field }) => (
                  <OptionGrid
                    aria-label="Goal"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      form.setValue("goalRateKgPerWeek", v === "maintain" ? 0 : 0.5);
                    }}
                    options={GOALS.map((v) => ({ value: v, label: GOAL_LABEL[v], hint: GOAL_HINT[v] }))}
                  />
                )}
              />
              {goal !== "maintain" && (
                <Controller
                  control={form.control}
                  name="goalRateKgPerWeek"
                  render={({ field }) => (
                    <div className="space-y-2 rounded-xl border bg-surface-raised p-4">
                      <div className="flex items-center justify-between text-sm">
                        <Label htmlFor="goalRate">Pace</Label>
                        <span className="font-semibold tabular-nums">{field.value} kg per week</span>
                      </div>
                      <Slider
                        id="goalRate"
                        min={0.25}
                        max={1}
                        step={0.25}
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                      />
                      <p className="text-xs text-ink-muted">
                        0.5 kg a week is a steady, sustainable pace. Faster rates are capped for safety.
                      </p>
                    </div>
                  )}
                />
              )}
            </>
          )}
          {isChipStep(current.id) && (
            <Controller
              control={form.control}
              name={current.id}
              render={({ field }) => (
                <div className="space-y-2">
                  <Label htmlFor={current.id}>{CHIP_LABEL[current.id as ChipStep]}</Label>
                  <ChipInput
                    id={current.id}
                    value={field.value}
                    onChange={field.onChange}
                    suggestions={[...SUGGEST[current.id as ChipStep]]}
                    tone={
                      current.id === "allergies" ? "danger" : current.id === "likes" ? "success" : "neutral"
                    }
                  />
                </div>
              )}
            />
          )}
          {current.id === "health" && (
            <>
              <Controller
                control={form.control}
                name="conditions"
                render={({ field }) => (
                  <OptionGrid
                    aria-label="Conditions"
                    multiple
                    columns={2}
                    value={field.value}
                    onChange={(v) =>
                      field.onChange(
                        field.value.includes(v) ? field.value.filter((c) => c !== v) : [...field.value, v],
                      )
                    }
                    options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABEL[c] }))}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="medications"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="medications">Medications</Label>
                    <ChipInput
                      id="medications"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="e.g. metformin"
                    />
                  </div>
                )}
              />
              <p className="text-xs text-ink-subtle">
                Health details only tighten your rules. They never leave your account.
              </p>
            </>
          )}
          {current.id === "budget" && (
            <Controller
              control={form.control}
              name="weeklyBudgetUsd"
              render={({ field }) => (
                <div className="space-y-4 rounded-xl border bg-surface-raised p-4">
                  <p className="text-center text-4xl font-bold tabular-nums text-agent-budget">${budget}</p>
                  <Slider
                    aria-label="Weekly budget"
                    min={20}
                    max={150}
                    step={5}
                    value={[field.value]}
                    onValueChange={([v]) => field.onChange(v)}
                  />
                  <div className="flex justify-between text-xs text-ink-subtle">
                    <span>$20</span>
                    <span>$150</span>
                  </div>
                </div>
              )}
            />
          )}
          {current.id === "mealsPerDay" && (
            <Controller
              control={form.control}
              name="mealsPerDay"
              render={({ field }) => (
                <OptionGrid
                  aria-label="Meals per day"
                  columns={2}
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 3, label: "3 meals", hint: "Breakfast, lunch, dinner" },
                    { value: 4, label: "4 meals", hint: "Plus a snack" },
                  ]}
                />
              )}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>
          <div className="flex gap-2">
            {current.optional && (
              <Button type="button" variant="outline" data-testid="onboarding-skip" onClick={skipHealth}>
                Skip
              </Button>
            )}
            <Button type="submit" data-testid="onboarding-next" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              {isLast ? "See my rules" : "Next"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-danger">Please check this value.</p>}
    </div>
  );
}
