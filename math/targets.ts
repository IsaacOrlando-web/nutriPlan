// calculateTargets: daily calorie and macro targets. Owner: Math.
// Mifflin St Jeor BMR x activity factor, goal adjustment of rate x 7700 / 7 kcal per day,
// calorie floors from MedicalConstraints, protein by goal, fat 25-30%, carbs fill the rest
// (capped by the per meal carb limit). When a Bayesian TDEE posterior exists, its mean replaces the formula.
import type { ActivityLevel, DailyTargets, MedicalConstraints, UserProfile } from "@/types/contracts";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const KCAL_PER_KG = 7700;
/** Safe rate cap: at most 1% of body weight or 1 kg per week, whichever is lower. */
export const MAX_SAFE_RATE_KG_PER_WEEK = 1.0;
/** Acceptable Macronutrient Distribution Ranges (Institute of Medicine). */
export const AMDR = { proteinMaxPct: 0.35, fatMinPct: 0.25, fatMaxPct: 0.35 };
const FAT_TARGET_PCT = 0.275; // middle of the 25-30% band in the spec
const DEFAULT_TDEE_SD = 300;

export function mifflinStJeor(p: Pick<UserProfile, "sex" | "weightKg" | "heightCm" | "age">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === "male" ? base + 5 : base - 161;
}

export function formulaTdee(p: UserProfile): number {
  return mifflinStJeor(p) * ACTIVITY_FACTORS[p.activityLevel];
}

/** Goal rate clamped to the safe maximum, signed: negative for lose, positive for gain. */
export function safeGoalRate(p: UserProfile): number {
  if (p.goal === "maintain") return 0;
  const cap = Math.min(MAX_SAFE_RATE_KG_PER_WEEK, 0.01 * p.weightKg);
  const rate = Math.min(Math.max(0, p.goalRateKgPerWeek), cap);
  return p.goal === "lose" ? -rate : rate;
}

export function calculateTargets(
  profile: UserProfile,
  constraints: MedicalConstraints,
  tdeePosterior?: { mean: number; sd: number },
): DailyTargets {
  const tdee = tdeePosterior?.mean ?? formulaTdee(profile);
  const tdeeSd = tdeePosterior?.sd ?? DEFAULT_TDEE_SD;

  const adjustment = (safeGoalRate(profile) * KCAL_PER_KG) / 7;
  const rawCalories = Math.max(tdee + adjustment, constraints.minCaloriesPerDay);
  const calories = Math.round(rawCalories / 10) * 10;

  const proteinPerKg = profile.goal === "maintain" ? 1.6 : 2.0;
  let proteinG = Math.min(proteinPerKg * profile.weightKg, (AMDR.proteinMaxPct * calories) / 4);
  let fatG = (FAT_TARGET_PCT * calories) / 9;
  let carbsG = (calories - proteinG * 4 - fatG * 9) / 4;

  if (constraints.maxCarbsPerMealG !== undefined) {
    const carbCap = constraints.maxCarbsPerMealG * profile.mealsPerDay;
    if (carbsG > carbCap) {
      // Move the kcal that no longer fit in carbs into fat (up to the AMDR max), then protein.
      let spareKcal = (carbsG - carbCap) * 4;
      carbsG = carbCap;
      const fatRoom = Math.max(0, (AMDR.fatMaxPct * calories) / 9 - fatG) * 9;
      const toFat = Math.min(spareKcal, fatRoom);
      fatG += toFat / 9;
      spareKcal -= toFat;
      const proteinRoom = Math.max(0, (AMDR.proteinMaxPct * calories) / 4 - proteinG) * 4;
      proteinG += Math.min(spareKcal, proteinRoom) / 4;
    }
  }

  const fiberG = Math.max(constraints.minFiberG, (14 * calories) / 1000);
  const potassiumMg =
    constraints.minPotassiumMgPerDay ?? (profile.sex === "male" ? 3400 : 2600); // NASEM adequate intake

  return {
    calories,
    proteinG: Math.round(proteinG),
    carbsG: Math.round(Math.max(0, carbsG)),
    fatG: Math.round(fatG),
    fiberG: Math.round(fiberG),
    sodiumMg: constraints.maxSodiumMgPerDay,
    potassiumMg,
    tdeeEstimate: Math.round(tdee),
    tdeeUncertainty: Math.round(tdeeSd),
  };
}
