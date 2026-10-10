import { z } from "zod";
import type { ProfileBundle, UserProfile } from "@/types/contracts";

const num = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `Enter your ${label}.`, required_error: `Enter your ${label}.` })
    .min(min, `${label[0].toUpperCase()}${label.slice(1)} must be at least ${min}.`)
    .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be at most ${max}.`);

// Mirrors UserProfile (minus userId). Ranges match goalsSchema so both screens accept the same profiles.
export const onboardingSchema = z.object({
  name: z.string().trim().min(1, "Tell us what to call you.").max(40, "Keep it under 40 characters."),
  language: z.enum(["en", "es"]),
  sex: z.enum(["male", "female"], { required_error: "Pick one." }),
  age: num("age", 13, 100).int("Age must be a whole number."),
  heightCm: num("height", 120, 230),
  weightKg: num("weight", 30, 300),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"], {
    required_error: "Pick how active you are.",
  }),
  goal: z.enum(["lose", "maintain", "gain"], { required_error: "Pick a goal." }),
  goalRateKgPerWeek: z.number().min(0).max(1),
  conditions: z.array(z.enum(["type2_diabetes", "hypertension", "kidney_disease", "high_cholesterol"])),
  medications: z.array(z.string()),
  allergies: z.array(z.string()),
  restrictions: z.array(z.string()),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  weeklyBudgetUsd: num("budget", 20, 150),
  mealsPerDay: z.union([z.literal(3), z.literal(4)]),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

export const STEPS = [
  {
    id: "about",
    title: "About you",
    help: "Sizes your portions and daily targets.",
    fields: ["name", "sex", "age", "heightCm", "weightKg"],
  },
  {
    id: "goal",
    title: "What's your goal?",
    help: "Doctor keeps a safe calorie floor either way.",
    fields: ["goal", "goalRateKgPerWeek"],
  },
  {
    id: "health",
    title: "Any health needs?",
    help: "Optional. Adds stricter, cited rules.",
    fields: ["conditions", "medications", "allergies"],
    optional: true,
  },
  {
    id: "preferences",
    title: "What do you like to eat?",
    help: "Chef builds the week around this.",
    fields: ["restrictions", "likes", "dislikes"],
  },
  {
    id: "lifestyle",
    title: "Budget and routine",
    help: "Budget keeps every week under your number.",
    fields: ["activityLevel", "weeklyBudgetUsd", "mealsPerDay"],
  },
  {
    id: "summary",
    title: "Check your answers",
    help: "Tap a row to change it.",
    fields: [],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  help: string;
  fields: readonly (keyof OnboardingValues)[];
  optional?: boolean;
}[];

export type StepId = (typeof STEPS)[number]["id"];

/** Keys match agents/rules/guidelines.json allergyTags so the Doctor can map them to food tags. */
export const ALLERGY_OPTIONS = [
  { value: "peanut", label: "Peanuts" },
  { value: "tree_nut", label: "Tree nuts" },
  { value: "milk", label: "Milk" },
  { value: "egg", label: "Eggs" },
  { value: "wheat", label: "Wheat" },
  { value: "soy", label: "Soy" },
  { value: "fish", label: "Fish" },
  { value: "shellfish", label: "Shellfish" },
  { value: "sesame", label: "Sesame" },
] as const;

/** Keys match agents/rules/guidelines.json restrictionTags. */
export const RESTRICTION_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "halal", label: "Halal" },
  { value: "kosher", label: "Kosher" },
  { value: "no_pork", label: "No pork" },
  { value: "gluten_free", label: "Gluten free" },
  { value: "dairy_free", label: "Dairy free" },
] as const;

export const BUDGET_MIN = 20;
export const BUDGET_MAX = 150;
export const DEFAULT_RATE_KG_PER_WEEK = 0.5;

export function onboardingDefaults(bundle?: ProfileBundle | null): OnboardingValues {
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

export function blankOnboardingDefaults(): Partial<OnboardingValues> {
  return {
    name: "",
    language: "en",
    sex: undefined,
    age: undefined,
    heightCm: undefined,
    weightKg: undefined,
    activityLevel: undefined,
    goal: undefined,
    goalRateKgPerWeek: undefined,
    conditions: [],
    medications: [],
    allergies: [],
    restrictions: [],
    likes: [],
    dislikes: [],
    weeklyBudgetUsd: undefined,
    mealsPerDay: undefined,
  };
}

export function toProfileInput(values: OnboardingValues): Omit<UserProfile, "userId"> {
  return {
    ...values,
    name: values.name.trim(),
    goalRateKgPerWeek: values.goal === "maintain" ? 0 : values.goalRateKgPerWeek,
  };
}

// Unit display helpers. The form always stores cm and kg.
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}

export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * CM_PER_IN * 10) / 10;
}

export function kgToLb(kg: number): number {
  return Math.round((kg / KG_PER_LB) * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 10) / 10;
}

// Draft persistence: unfinished answers survive a refresh. Only read and written in this browser.
const DRAFT_KEY = "nutriplan.onboarding.draft.v1";

export interface OnboardingDraft {
  step: number;
  values: Partial<OnboardingValues>;
}

export function loadDraft(): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (typeof parsed.step !== "number" || typeof parsed.values !== "object" || !parsed.values) return null;
    // Keep each answer that is still valid; drop half typed or stale ones.
    const values: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(onboardingSchema.shape)) {
      const result = field.safeParse((parsed.values as Record<string, unknown>)[key]);
      if (result.success) values[key] = result.data;
    }
    return {
      step: Math.min(Math.max(0, Math.floor(parsed.step)), STEPS.length - 1),
      values: values as Partial<OnboardingValues>,
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: OnboardingDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked or full: the draft is a convenience, so ignore.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
