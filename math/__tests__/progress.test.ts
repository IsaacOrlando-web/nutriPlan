import { describe, expect, it } from "vitest";
import { goalProgress } from "../progress";

const today = "2026-10-10";

describe("goalProgress", () => {
  it("measures a weight loss goal from start to goal", () => {
    const p = goalProgress({ startKg: 90, currentKg: 88, goalKg: 82, slopePerWeek: -0.5, today });
    expect(p).toMatchObject({
      direction: "lose",
      changedKg: -2,
      remainingKg: 6,
      percent: 25,
      reached: false,
      pace: "toward",
      weeksToGoal: 12,
      etaDate: "2027-01-02",
    });
  });

  it("gives no date when the trend is flat (Alex's stall)", () => {
    const p = goalProgress({ startKg: 90.1, currentKg: 89.3, goalKg: 82, slopePerWeek: -0.01, today });
    expect(p.pace).toBe("flat");
    expect(p.weeksToGoal).toBeNull();
    expect(p.etaDate).toBeNull();
    expect(p.remainingKg).toBe(7.3);
    expect(p.percent).toBe(10);
  });

  it("follows the trend's stall alert even with a small slope", () => {
    const p = goalProgress({
      startKg: 90.2,
      currentKg: 89.1,
      goalKg: 82,
      slopePerWeek: -0.2,
      stalled: true,
      today,
    });
    expect(p).toMatchObject({ pace: "flat", weeksToGoal: null, etaDate: null });
  });

  it("flags moving away from the goal and never shows negative progress", () => {
    const p = goalProgress({ startKg: 90, currentKg: 91, goalKg: 82, slopePerWeek: 0.3, today });
    expect(p.pace).toBe("away");
    expect(p.percent).toBe(0);
    expect(p.weeksToGoal).toBeNull();
  });

  it("caps at 100 percent once the goal is passed", () => {
    const p = goalProgress({ startKg: 90, currentKg: 81.5, goalKg: 82, slopePerWeek: -0.4, today });
    expect(p).toMatchObject({ reached: true, percent: 100, remainingKg: 0, weeksToGoal: null });
  });

  it("handles weight gain goals", () => {
    const p = goalProgress({ startKg: 60, currentKg: 61, goalKg: 64, slopePerWeek: 0.25, today });
    expect(p).toMatchObject({
      direction: "gain",
      percent: 25,
      remainingKg: 3,
      pace: "toward",
      weeksToGoal: 12,
    });
  });

  it("treats a goal within the band as maintain (Maria)", () => {
    const inBand = goalProgress({ startKg: 82.2, currentKg: 82.4, goalKg: 82, slopePerWeek: 0.02, today });
    expect(inBand).toMatchObject({ direction: "maintain", reached: true, percent: 100, weeksToGoal: null });
    const drifted = goalProgress({ startKg: 82.2, currentKg: 83.6, goalKg: 82, slopePerWeek: 0.3, today });
    expect(drifted).toMatchObject({ direction: "maintain", reached: false, remainingKg: 1.6, pace: "away" });
  });
});
