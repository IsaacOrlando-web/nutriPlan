import { z } from "zod";
import type { Goal, UserProfile } from "@/types/contracts";

const num = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `Enter your ${label}.`, required_error: `Enter your ${label}.` })
    .min(min, `${label[0].toUpperCase()}${label.slice(1)} must be at least ${min}.`)
    .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be at most ${max}.`);

// Ranges mirror the onboarding schema so both screens accept the same profiles.
export const goalsSchema = z.object({
  heightCm: num("height", 120, 230),
  age: num("age", 13, 100).int("Age must be a whole number."),
  weightKg: num("current weight", 30, 300),
  goalWeightKg: num("goal weight", 30, 300),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"], {
    required_error: "Pick how active you are.",
  }),
  weeklyBudgetUsd: num("budget", 20, 150),
  // Free text. UserProfile has no field for these yet, see toProfileInput.
  foodPreferences: z.string().trim().max(500, "Keep it under 500 characters."),
  personalGoal: z.string().trim().max(500, "Keep it under 500 characters."),
  aiNotes: z.string().trim().max(500, "Keep it under 500 characters."),
});

export type GoalsValues = z.infer<typeof goalsSchema>;

/** Within this many kg of the goal weight counts as "maintain". */
const MAINTAIN_BAND_KG = 1;
const DEFAULT_RATE_KG_PER_WEEK = 0.5;

export function goalFromWeights(weightKg: number, goalWeightKg: number): Goal {
  const diff = goalWeightKg - weightKg;
  if (Math.abs(diff) < MAINTAIN_BAND_KG) return "maintain";
  return diff < 0 ? "lose" : "gain";
}

/** Prefill from the saved profile. Goal weight is not stored, so it starts at the current weight only for maintainers. */
export function goalsDefaults(p?: UserProfile): Partial<GoalsValues> {
  if (!p) return { foodPreferences: "", personalGoal: "", aiNotes: "" };
  return {
    heightCm: p.heightCm,
    age: p.age,
    weightKg: p.weightKg,
    goalWeightKg: p.goal === "maintain" ? p.weightKg : undefined,
    activityLevel: p.activityLevel,
    weeklyBudgetUsd: p.weeklyBudgetUsd,
    foodPreferences: "",
    personalGoal: "",
    aiNotes: "",
  };
}

/**
 * Merge the form into the saved profile so every other field (name, sex,
 * allergies, conditions...) is kept untouched. foodPreferences, personalGoal and aiNotes
 * are not sent: UserProfile has no field for them (owner: Lead, /types/contracts.ts).
 */
export function toProfileInput(values: GoalsValues, current: UserProfile): Omit<UserProfile, "userId"> {
  const { userId: _userId, ...rest } = current;
  const goal = goalFromWeights(values.weightKg, values.goalWeightKg);
  return {
    ...rest,
    heightCm: values.heightCm,
    age: values.age,
    weightKg: values.weightKg,
    activityLevel: values.activityLevel,
    weeklyBudgetUsd: values.weeklyBudgetUsd,
    goal,
    goalRateKgPerWeek:
      goal === "maintain"
        ? 0
        : current.goalRateKgPerWeek > 0
          ? current.goalRateKgPerWeek
          : DEFAULT_RATE_KG_PER_WEEK,
  };
}
