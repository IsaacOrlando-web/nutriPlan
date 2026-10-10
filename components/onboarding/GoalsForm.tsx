"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import { Controller, useForm, type FieldError } from "react-hook-form";
import { ACTIVITY_HINT, ACTIVITY_LABEL } from "@/components/onboarding/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function FieldMessage({ error }: { error?: FieldError }) {
  if (!error?.message) return null;
  return <p className="text-xs text-danger">{error.message}</p>;
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
        className={cn(errors[name] && "border-danger")}
        {...register(name, { valueAsNumber: true })}
      />
      <FieldMessage error={errors[name]} />
    </div>
  );

  return (
    <form data-testid="goals-form" className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>Math turns these into your daily targets.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {numberField("heightCm", "Height", "cm")}
          {numberField("age", "Age", "years")}
          {numberField("weightKg", "Current weight", "kg")}
          {numberField("goalWeightKg", "Goal weight", "kg")}
          <div className="space-y-1.5">
            <Label htmlFor="activityLevel">How active?</Label>
            <Controller
              control={control}
              name="activityLevel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v as ActivityLevel)}>
                  <SelectTrigger
                    id="activityLevel"
                    data-testid="goals-activityLevel"
                    aria-invalid={!!errors.activityLevel}
                    className={cn(errors.activityLevel && "border-danger")}
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
              activity && <p className="text-xs text-ink-muted">{ACTIVITY_HINT[activity]}</p>
            )}
          </div>
          {numberField("weeklyBudgetUsd", "Weekly budget", "USD")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Food preferences</CardTitle>
          <CardDescription>Allergies, foods to avoid, diet related conditions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="foodPreferences" className="sr-only">
            Food preferences
          </Label>
          <Textarea
            id="foodPreferences"
            data-testid="goals-foodPreferences"
            placeholder="No peanuts, I avoid pork, I love Mexican food..."
            {...register("foodPreferences")}
          />
          <FieldMessage error={errors.foodPreferences} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal goal</CardTitle>
          <CardDescription>What do you want from your plan?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="personalGoal" className="sr-only">
            Personal goal
          </Label>
          <Textarea
            id="personalGoal"
            data-testid="goals-personalGoal"
            placeholder="Lose weight, save money, find new recipes..."
            {...register("personalGoal")}
          />
          <FieldMessage error={errors.personalGoal} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Things AI should know about you</CardTitle>
          <CardDescription>Anything else that helps the agents plan for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="aiNotes" className="sr-only">
            Things AI should know about you
          </Label>
          <Textarea
            id="aiNotes"
            data-testid="goals-aiNotes"
            placeholder="I work night shifts, I cook on Sundays, I only have a microwave..."
            {...register("aiNotes")}
          />
          <FieldMessage error={errors.aiNotes} />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          data-testid="goals-skip"
          onClick={onSkip}
          disabled={saving}
        >
          Change later
        </Button>
        <Button type="submit" size="lg" data-testid="goals-submit" disabled={!isDirty || saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
