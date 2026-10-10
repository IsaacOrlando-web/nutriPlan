"use client";

import { Pencil } from "lucide-react";
import { Controller, useFormContext, useWatch, type FieldError } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn, fmtUsd } from "@/lib/utils";
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
      <div className="space-y-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
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
          Other
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
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
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
        <p className="text-xs text-ink-subtle">For the metabolism formula only.</p>
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
    <div className="space-y-6">
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
            <Section title="Pace" hint="0.5 kg a week is steady. Faster is capped for safety.">
              <div className="space-y-3 pt-1">
                <p className="text-3xl font-bold tabular-nums tracking-tight">
                  {field.value || DEFAULT_RATE_KG_PER_WEEK}
                  <span className="ml-1.5 text-base font-medium text-ink-muted">kg a week</span>
                </p>
                <Slider
                  id="goalRate"
                  aria-label="Pace in kg per week"
                  min={0.25}
                  max={1}
                  step={0.25}
                  value={[field.value || DEFAULT_RATE_KG_PER_WEEK]}
                  onValueChange={([v]) => field.onChange(v)}
                />
                <div className="flex justify-between text-xs tabular-nums text-ink-subtle">
                  <span>0.25</span>
                  <span>1</span>
                </div>
              </div>
            </Section>
          )}
        />
      )}
    </div>
  );
}

export function HealthStep() {
  const { control } = useFormContext<OnboardingValues>();
  return (
    <div className="space-y-8">
      <Section title="Conditions">
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
      <Section title="Medications" hint="Some change what is safe, for example potassium.">
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
      <Section title="Allergies" hint="Never planned, not even as a swap.">
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
    </div>
  );
}

export function PreferencesStep() {
  const { control } = useFormContext<OnboardingValues>();
  return (
    <div className="space-y-8">
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
      <Section title="Love">
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
      <Section title="Avoid" hint="Dislikes, not allergies.">
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
    <div className="space-y-8">
      <Section title="Weekly grocery budget">
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <Label
              htmlFor="weeklyBudgetUsd"
              className="pb-2 text-3xl font-bold tabular-nums text-agent-budget"
            >
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
                "h-14 w-[7.5rem] px-3 text-4xl font-bold tabular-nums tracking-tight",
                errors.weeklyBudgetUsd && "border-danger",
              )}
              {...register("weeklyBudgetUsd", { valueAsNumber: true })}
            />
            <span className="pb-2 text-sm text-ink-muted">a week</span>
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
          <div className="flex justify-between text-xs tabular-nums text-ink-subtle">
            <span>{fmtUsd(BUDGET_MIN, true)}</span>
            <span>{fmtUsd(BUDGET_MAX, true)}</span>
          </div>
          <FieldMessage error={errors.weeklyBudgetUsd} />
        </div>
      </Section>
      <Section title="Meals a day">
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
      <Section title="Activity" hint="A normal week.">
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
      label: "Body",
      value: `${SEX_LABEL[v.sex]}, ${v.age} years, ${v.heightCm} cm, ${v.weightKg} kg`,
      step: 0,
    },
    {
      label: "Goal",
      value:
        v.goal === "maintain"
          ? GOAL_LABEL[v.goal]
          : `${GOAL_LABEL[v.goal]}, ${v.goalRateKgPerWeek} kg a week`,
      step: 1,
    },
    { label: "Conditions", value: list(v.conditions.map((c) => CONDITION_LABEL[c])), step: 2 },
    { label: "Medications", value: list(v.medications), step: 2 },
    { label: "Allergies", value: list(v.allergies, ALLERGY_OPTIONS), step: 2 },
    {
      label: "Diet style",
      value: v.restrictions.length ? list(v.restrictions, RESTRICTION_OPTIONS) : "No restrictions",
      step: 3,
    },
    { label: "Love", value: list(v.likes), step: 3 },
    { label: "Avoid", value: list(v.dislikes), step: 3 },
    { label: "Budget", value: `${fmtUsd(v.weeklyBudgetUsd, true)} a week`, step: 4 },
    { label: "Meals a day", value: String(v.mealsPerDay), step: 4 },
    { label: "Activity", value: ACTIVITY_LABEL[v.activityLevel], step: 4 },
  ];
  return (
    <dl data-testid="onboarding-summary" className="divide-y divide-border/70 rounded-2xl bg-surface-raised">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 py-1 pl-4 pr-1.5">
          <div className="min-w-0 flex-1 py-2">
            <dt className="text-xs text-ink-subtle">{r.label}</dt>
            <dd className="break-words text-sm font-medium text-ink">{r.value}</dd>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`Edit ${r.label.toLowerCase()}`}
            onClick={() => onEdit(r.step)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </dl>
  );
}
