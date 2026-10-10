"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import { Controller, useForm, type FieldError } from "react-hook-form";
import { ACTIVITY_HINT, ACTIVITY_LABEL } from "@/components/onboarding/labels";
import { StickyActions } from "@/components/onboarding/StickyActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ActivityLevel, UserProfile } from "@/types/contracts";
import { goalsDefaults, goalsSchema, type GoalsValues } from "./goalsSchema";

export interface GoalsFormProps {
  profile?: UserProfile;
  saving?: boolean;
  onSubmit: (values: GoalsValues) => void;
  onSkip: () => void;
}

type NumberField = "heightCm" | "age" | "weightKg" | "goalWeightKg" | "weeklyBudgetUsd";
type TextField = "foodPreferences" | "personalGoal" | "aiNotes";

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

export function GoalsForm({ profile, saving = false, onSubmit, onSkip }: GoalsFormProps) {
  const form = useForm<GoalsValues>({
    resolver: zodResolver(goalsSchema),
    defaultValues: goalsDefaults(profile),
    mode: "onTouched",
  });
  const { register, control, handleSubmit, formState } = form;
  const { errors, isDirty } = formState;
  const activity = form.watch("activityLevel");

  const numberField = (name: NumberField, label: string, unit: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label} <span className="font-normal text-ink-subtle">({unit})</span>
      </Label>
      <Input
        id={name}
        data-testid={`goals-${name}`}
        type="number"
        inputMode="decimal"
        step="any"
        aria-invalid={!!errors[name]}
        className={cn("h-12 text-base tabular-nums", errors[name] && "border-danger")}
        {...register(name, { valueAsNumber: true })}
      />
      <FieldMessage error={errors[name]} />
    </div>
  );

  const textField = (name: TextField, title: string, hint: string, placeholder: string) => (
    <Section title={title} hint={hint}>
      <Label htmlFor={name} className="sr-only">
        {title}
      </Label>
      <Textarea
        id={name}
        data-testid={`goals-${name}`}
        placeholder={placeholder}
        className="min-h-20"
        {...register(name)}
      />
      <FieldMessage error={errors[name]} />
    </Section>
  );

  return (
    <form data-testid="goals-form" className="flex flex-col" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-8 pb-4">
        <Section title="About you" hint="Math turns these into your daily targets.">
          <div className="grid gap-4 sm:grid-cols-2">
            {numberField("heightCm", "Height", "cm")}
            {numberField("age", "Age", "years")}
            {numberField("weightKg", "Current weight", "kg")}
            {numberField("goalWeightKg", "Goal weight", "kg")}
            <div className="space-y-1.5">
              <Label htmlFor="activityLevel">Activity</Label>
              <Controller
                control={control}
                name="activityLevel"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as ActivityLevel)}>
                    <SelectTrigger
                      id="activityLevel"
                      data-testid="goals-activityLevel"
                      aria-invalid={!!errors.activityLevel}
                      className={cn("h-12 text-base", errors.activityLevel && "border-danger")}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((level) => (
                        <SelectItem key={level} value={level}>
                          {ACTIVITY_LABEL[level]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.activityLevel ? (
                <FieldMessage error={errors.activityLevel} />
              ) : (
                activity && <p className="text-xs text-ink-subtle">{ACTIVITY_HINT[activity]}</p>
              )}
            </div>
            {numberField("weeklyBudgetUsd", "Weekly budget", "USD")}
          </div>
        </Section>

        {textField(
          "foodPreferences",
          "Food preferences",
          "Allergies, foods to avoid, diet related conditions.",
          "No peanuts, I avoid pork, I love Mexican food...",
        )}
        {textField(
          "personalGoal",
          "Personal goal",
          "What you want from the plan.",
          "Lose weight, save money, find new recipes...",
        )}
        {textField(
          "aiNotes",
          "Notes for the agents",
          "Anything else that shapes your week.",
          "I work night shifts, I cook on Sundays, I only have a microwave...",
        )}
      </div>

      <StickyActions>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          data-testid="goals-skip"
          className="px-3 text-ink-muted"
          onClick={onSkip}
          disabled={saving}
        >
          Change later
        </Button>
        <span className="flex-1" aria-hidden="true" />
        <Button
          type="submit"
          size="lg"
          data-testid="goals-submit"
          disabled={!isDirty || saving}
          className="min-w-40"
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Save changes
        </Button>
      </StickyActions>
    </form>
  );
}
