import { describe, expect, it } from "vitest";
import { calculateTargets, mifflinStJeor, safeGoalRate } from "@/math/targets";
import { buildConstraints } from "@/agents/rules/engine";
import { ALEX_PROFILE, MARIA_PROFILE } from "@/lib/db/seed/demo-users";
import type { UserProfile } from "@/types/contracts";

describe("calculateTargets", () => {
  it("uses Mifflin St Jeor for men and women", () => {
    expect(mifflinStJeor({ sex: "male", weightKg: 80, heightCm: 180, age: 30 })).toBe(800 + 1125 - 150 + 5);
    expect(mifflinStJeor({ sex: "female", weightKg: 60, heightCm: 165, age: 30 })).toBe(600 + 1031.25 - 150 - 161);
  });

  it("applies activity factor and goal deficit for Alex", () => {
    const c = buildConstraints(ALEX_PROFILE);
    const t = calculateTargets(ALEX_PROFILE, c);
    const bmr = 10 * 89.3 + 6.25 * 180 - 5 * 22 + 5;
    const expected = Math.round((bmr * 1.375 - (0.5 * 7700) / 7) / 10) * 10;
    expect(t.calories).toBe(expected);
    expect(t.proteinG).toBe(Math.round(Math.min(2.0 * 89.3, (0.35 * expected) / 4)));
    expect(t.tdeeUncertainty).toBe(300);
  });

  it("respects calorie floors", () => {
    const tiny: UserProfile = { ...MARIA_PROFILE, weightKg: 45, heightCm: 150, age: 70, activityLevel: "sedentary", goal: "lose", goalRateKgPerWeek: 1 };
    const t = calculateTargets(tiny, buildConstraints(tiny));
    expect(t.calories).toBeGreaterThanOrEqual(1200);
  });

  it("caps the goal rate at a safe pace", () => {
    expect(safeGoalRate({ ...ALEX_PROFILE, goalRateKgPerWeek: 3 })).toBe(-Math.min(1, 0.01 * ALEX_PROFILE.weightKg));
    expect(safeGoalRate({ ...ALEX_PROFILE, goal: "maintain", goalRateKgPerWeek: 3 })).toBe(0);
  });

  it("caps carbs by the per meal limit for diabetes", () => {
    const c = buildConstraints(MARIA_PROFILE);
    const t = calculateTargets(MARIA_PROFILE, c);
    expect(c.maxCarbsPerMealG).toBe(45);
    expect(t.carbsG).toBeLessThanOrEqual(45 * MARIA_PROFILE.mealsPerDay);
    expect(t.potassiumMg).toBe(3500);
    expect(t.sodiumMg).toBe(1500);
  });

  it("uses the Bayesian posterior when available", () => {
    const c = buildConstraints(ALEX_PROFILE);
    const t = calculateTargets(ALEX_PROFILE, c, { mean: 2400, sd: 120 });
    expect(t.tdeeEstimate).toBe(2400);
    expect(t.tdeeUncertainty).toBe(120);
    expect(t.calories).toBe(Math.round((2400 - 550) / 10) * 10);
  });
});
