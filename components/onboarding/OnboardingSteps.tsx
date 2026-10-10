"use client";

import { Pencil } from "lucide-react";
import { Controller, useFormContext, useWatch, type FieldError } from "react-hook-form";
import { Disclaimer } from "@/components/common/Disclaimer";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { ActivityLevel, Condition, Goal } from "@/types/contracts";
import { HeightField, WeightField } from "./MeasureFields";
import {
  ALLERGY_OPTIONS,
  BUDGET_MAX,
  BUDGET_MIN,
  DEFAULT_RATE_KG_PER_WEEK,
  RESTRICTION_OPTIONS,
  type OnboardingValues,
} from "./onboardingSchema";

const CONDITIONS: Condition[] = ["type2_diabetes", "hypertension", "high_cholesterol", "kidney_disease"];
const ACTIVITIES: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];
const NONE = "__none__";

const LIKE_SUGGESTIONS = [
  "chicken",
  "beans",
  "rice bowls",
  "eggs",
  "salmon",
  "mexican",
  "italian",
  "soups",
  "tofu",
];
const DISLIKE_SUGGESTIONS = ["mushrooms", "cilantro", "olives", "liver", "sardines", "cottage cheese"];

function FieldMessage({ error }: { error?: FieldError }) {
  if (!error?.message) return null;
  return <p className="text-xs text-danger">{error.message}</p>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Preset options as a multi select grid, plus free text chips for anything else. */
function PresetMulti({
  id,
  label,
  presets,
  value,
  onChange,
  tone,
  noneLabel,
}: {
  id: string;
  label: string;
  presets: readonly { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  tone: "neutral" | "danger";
  noneLabel?: string;
}) {
  const presetValues = presets.map((p) => p.value);
  const custom = value.filter((v) => !presetValues.includes(v));
  const options = [...(noneLabel ? [{ value: NONE, label: noneLabel }] : []), ...presets];
  const selected = value.length === 0 && noneLabel ? [NONE] : value;

  return (
    <div className="space-y-3">
      <OptionGrid
        aria-label={label}
        multiple
        columns={2}
        value={selected}
        onChange={(v: string) => {
          if (v === NONE) return onChange([]);
          onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
        }}
        options={options}
      />
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs text-ink-muted">
          Other (type and press Enter)
        </Label>
        <ChipInput
          id={id}
          value={custom}
          tone={tone}
          onChange={(nextCustom) =>
            onChange([...value.filter((v) => presetValues.includes(v)), ...nextCustom])
          }
        />
      </div>
    </div>
  );
}

export function AboutStep() {
  const { register, control, formState } = useFormContext<OnboardingValues>();
  const { errors } = formState;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="name">What should we call you?</Label>
          <Input
            id="name"
            data-testid="onboarding-name"
            autoComplete="given-name"
            placeholder="First name or nickname"
            aria-invalid={!!errors.name}
            className={cn("h-12 text-base", errors.name && "border-danger")}
            {...register("name")}
          />
          <FieldMessage error={errors.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            data-testid="onboarding-age"
            type="number"
            inputMode="numeric"
            min={13}
            max={100}
            aria-invalid={!!errors.age}
            className={cn("h-12 text-base", errors.age && "border-danger")}
            {...register("age", { valueAsNumber: true })}
          />
          <FieldMessage error={errors.age} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Sex</Label>
        <Controller
          control={control}
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
        <p className="text-xs text-ink-subtle">Used only in the metabolism formula.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <HeightField />
        <WeightField />
      </div>
    </div>
  );
}

export function GoalStep() {
  const { control, setValue } = useFormContext<OnboardingValues>();
  const goal = useWatch<OnboardingValues, "goal">({ name: "goal" });
  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="goal"
        render={({ field }) => (
          <OptionGrid
            aria-label="Goal"
            value={field.value}
            onChange={(v) => {
              field.onChange(v);
              setValue("goalRateKgPerWeek", v === "maintain" ? 0 : DEFAULT_RATE_KG_PER_WEEK);
            }}
            options={GOALS.map((v) => ({ value: v, label: GOAL_LABEL[v], hint: GOAL_HINT[v] }))}
          />
        )}
      />
      {goal !== "maintain" && (
        <Controller
          control={control}
          name="goalRateKgPerWeek"
          render={({ field }) => (
            <div className="space-y-2 rounded-xl border bg-surface-raised p-4">
              <div className="flex items-center justify-between text-sm">
                <Label htmlFor="goalRate">Pace</Label>
                <span className="font-semibold tabular-nums">{field.value} kg per week</span>
              </div>
              <Slider
                id="goalRate"
                aria-label="Pace in kg per week"
                min={0.25}
                max={1}
                step={0.25}
                value={[field.value || DEFAULT_RATE_KG_PER_WEEK]}
                onValueChange={([v]) => field.onChange(v)}
              />
              <p className="text-xs text-ink-muted">
                0.5 kg a week is a steady, sustainable pace. Faster rates are capped for safety.
              </p>
            </div>
          )}
        />
      )}
    </div>
  );
}

export function HealthStep() {
  const { control } = useFormContext<OnboardingValues>();
  return (
    <div className="space-y-6">
      <Section
        title="Health conditions"
        hint="Doctor adds stricter, cited rules for these. Pick any that apply."
      >
        <Controller
          control={control}
          name="conditions"
          render={({ field }) => (
            <OptionGrid
              aria-label="Health conditions"
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
      </Section>
      <Section title="Medications" hint="Some medications change what is safe, for example potassium.">
        <Controller
          control={control}
          name="medications"
          render={({ field }) => (
            <ChipInput
              id="medications"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. metformin"
            />
          )}
        />
      </Section>
      <Section title="Food allergies" hint="Kept separate from dislikes. Allergens are never planned.">
        <Controller
          control={control}
          name="allergies"
          render={({ field }) => (
            <PresetMulti
              id="allergies-other"
              label="Food allergies"
              presets={ALLERGY_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              tone="danger"
            />
          )}
        />
      </Section>
      <Disclaimer />
    </div>
  );
}

export function PreferencesStep() {
  const { control } = useFormContext<OnboardingValues>();
  return (
    <div className="space-y-6">
      <Section title="Diet style">
        <Controller
          control={control}
          name="restrictions"
          render={({ field }) => (
            <PresetMulti
              id="restrictions-other"
              label="Diet style"
              presets={RESTRICTION_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              tone="neutral"
              noneLabel="No restrictions"
            />
          )}
        />
      </Section>
      <Section title="Foods and cuisines you love" hint="Chef builds around these.">
        <Controller
          control={control}
          name="likes"
          render={({ field }) => (
            <ChipInput
              id="likes"
              value={field.value}
              onChange={field.onChange}
              suggestions={LIKE_SUGGESTIONS}
              tone="success"
            />
          )}
        />
      </Section>
      <Section title="Foods you'd rather avoid" hint="Dislikes, not allergies. Chef keeps them out.">
        <Controller
          control={control}
          name="dislikes"
          render={({ field }) => (
            <ChipInput
              id="dislikes"
              value={field.value}
              onChange={field.onChange}
              suggestions={DISLIKE_SUGGESTIONS}
            />
          )}
        />
      </Section>
    </div>
  );
}

export function LifestyleStep() {
  const { control, register, setValue, formState } = useFormContext<OnboardingValues>();
  const budget = useWatch<OnboardingValues, "weeklyBudgetUsd">({ name: "weeklyBudgetUsd" });
  const { errors } = formState;
  return (
    <div className="space-y-6">
      <Section
        title="Weekly grocery budget"
        hint="If the budget is tight, Budget swaps in cheaper meals and tells you."
      >
        <div className="space-y-4 rounded-xl border bg-surface-raised p-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="weeklyBudgetUsd" className="text-2xl font-bold text-agent-budget">
              $
            </Label>
            <Input
              id="weeklyBudgetUsd"
              data-testid="onboarding-budget"
              type="number"
              inputMode="numeric"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={1}
              aria-invalid={!!errors.weeklyBudgetUsd}
              className={cn(
                "h-12 max-w-[8rem] text-2xl font-bold tabular-nums",
                errors.weeklyBudgetUsd && "border-danger",
              )}
              {...register("weeklyBudgetUsd", { valueAsNumber: true })}
            />
            <span className="text-sm text-ink-muted">per week (USD)</span>
          </div>
          <Slider
            aria-label="Weekly budget"
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            step={5}
            value={[
              Number.isFinite(budget) ? Math.min(Math.max(budget, BUDGET_MIN), BUDGET_MAX) : BUDGET_MIN,
            ]}
            onValueChange={([v]) =>
              setValue("weeklyBudgetUsd", v, { shouldValidate: true, shouldDirty: true })
            }
          />
          <div className="flex justify-between text-xs text-ink-subtle">
            <span>${BUDGET_MIN}</span>
            <span>${BUDGET_MAX}</span>
          </div>
          <FieldMessage error={errors.weeklyBudgetUsd} />
        </div>
      </Section>
      <Section title="Meals per day">
        <Controller
          control={control}
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
      </Section>
      <Section title="Activity level" hint="Pick the closest match for a normal week.">
        <Controller
          control={control}
          name="activityLevel"
          render={({ field }) => (
            <OptionGrid
              aria-label="Activity level"
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
      </Section>
    </div>
  );
}

const list = (items: string[], labels?: readonly { value: string; label: string }[]) =>
  items.length ? items.map((i) => labels?.find((l) => l.value === i)?.label ?? i).join(", ") : "None";

export function SummaryStep({ onEdit }: { onEdit: (step: number) => void }) {
  const v = useWatch<OnboardingValues>() as OnboardingValues;
  const rows: { label: string; value: string; step: number }[] = [
    { label: "Name", value: v.name || "Not set", step: 0 },
    {
      label: "About you",
      value: `${SEX_LABEL[v.sex]}, ${v.age} years, ${v.heightCm} cm, ${v.weightKg} kg`,
      step: 0,
    },
    {
      label: "Goal",
      value:
        v.goal === "maintain"
          ? GOAL_LABEL[v.goal]
          : `${GOAL_LABEL[v.goal]}, ${v.goalRateKgPerWeek} kg per week`,
      step: 1,
    },
    { label: "Health considerations", value: list(v.conditions.map((c) => CONDITION_LABEL[c])), step: 2 },
    { label: "Medications", value: list(v.medications), step: 2 },
    { label: "Allergies", value: list(v.allergies, ALLERGY_OPTIONS), step: 2 },
    {
      label: "Diet style",
      value: v.restrictions.length ? list(v.restrictions, RESTRICTION_OPTIONS) : "No restrictions",
      step: 3,
    },
    { label: "Loves", value: list(v.likes), step: 3 },
    { label: "Avoids", value: list(v.dislikes), step: 3 },
    { label: "Weekly budget", value: `$${v.weeklyBudgetUsd}`, step: 4 },
    { label: "Meals per day", value: String(v.mealsPerDay), step: 4 },
    { label: "Activity", value: ACTIVITY_LABEL[v.activityLevel], step: 4 },
  ];
  return (
    <div className="space-y-4">
      <dl data-testid="onboarding-summary" className="divide-y rounded-xl border bg-surface-raised">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <dt className="text-xs text-ink-muted">{r.label}</dt>
              <dd className="break-words text-sm font-medium text-ink">{r.value}</dd>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={`Edit ${r.label.toLowerCase()}`}
              onClick={() => onEdit(r.step)}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </div>
        ))}
      </dl>
      <Disclaimer />
    </div>
  );
}
