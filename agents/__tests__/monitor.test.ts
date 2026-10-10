import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import { formulaTdee } from "@/math/targets";
import { intakeHistory, limitStreak, runMonitor, skippedMeals } from "../monitor";
import type { FoodLogEntry, MealPlan } from "@/types/contracts";

process.env.AGENTS_MODE = "scripted";
process.env.AGENT_EVENT_DELAY_MS = "0";

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore(null);
  setStore(store);
});

describe("runMonitor", () => {
  it("Alex: stalled weight -> replan with a lower TDEE posterior and new targets", async () => {
    const alex = (await store.getProfile(DEMO_USER_IDS.alex))!;
    const result = await runMonitor(DEMO_USER_IDS.alex, "manual", { store, dryRun: true });
    expect(result.action).toBe("replan");
    expect(result.reason).toMatch(/stalled/i);
    expect(result.tdee).toBeDefined();
    expect(result.tdee!.mean).toBeLessThan(formulaTdee(alex));
    expect(result.tdee!.sd).toBeLessThan(300);
    const posterior = await store.getTdeePosterior(DEMO_USER_IDS.alex);
    expect(posterior).toEqual(result.tdee);
    const targets = (await store.getTargets(DEMO_USER_IDS.alex))!;
    expect(targets.tdeeEstimate).toBe(result.tdee!.mean);
    expect(targets.calories).toBeGreaterThanOrEqual(1500);
    expect(result.alerts.some((a) => a.title === "Targets updated")).toBe(true);
  });

  it("Maria: rising fasting glucose -> replan, warning alert, carb cap tightened", async () => {
    const result = await runMonitor(DEMO_USER_IDS.maria, "reading", { store, dryRun: true });
    expect(result.action).toBe("replan");
    expect(result.reason).toMatch(/glucose/i);
    expect(result.alerts.some((a) => a.level === "warning" && /glucose/i.test(a.title))).toBe(true);
    const constraints = (await store.getConstraints(DEMO_USER_IDS.maria))!;
    expect(constraints.maxCarbsPerMealG).toBe(40);
    expect(constraints.summary).toContain("40 g carbs");
  });

  it("a danger glucose reading -> urgent alert, no replan", async () => {
    await store.addReading({
      readingId: "danger-1",
      userId: DEMO_USER_IDS.maria,
      type: "glucose_fasting",
      value: 320,
      unit: "mg/dL",
      takenAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const result = await runMonitor(DEMO_USER_IDS.maria, "reading", { store, dryRun: true });
    expect(result.action).toBe("alert");
    expect(result.runId).toBeNull();
    const urgent = result.alerts.find((a) => a.level === "urgent");
    expect(urgent).toBeDefined();
    expect(urgent!.body).toMatch(/health professional/i);
    expect(result.reason).toMatch(/health professional/i);
  });

  it("a danger blood pressure reading -> urgent alert", async () => {
    await store.addReading({
      readingId: "danger-2",
      userId: DEMO_USER_IDS.alex,
      type: "bp",
      value: 185,
      value2: 95,
      unit: "mmHg",
      takenAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const result = await runMonitor(DEMO_USER_IDS.alex, "reading", { store, dryRun: true });
    expect(result.action).toBe("alert");
    expect(result.alerts[0].level).toBe("urgent");
  });

  it("replans at most once per day", async () => {
    const existing = await store.createRun({
      userId: DEMO_USER_IDS.alex,
      trigger: "monitor",
      reason: "earlier today",
    });
    const result = await runMonitor(DEMO_USER_IDS.alex, "manual", { store, dryRun: true });
    expect(result.action).toBe("alert");
    expect(result.runId).toBe(existing.runId);
    expect(result.alerts.some((a) => a.title === "Already replanned today")).toBe(true);
  });

  it("stays quiet for a user with no readings", async () => {
    await store.saveProfile({ ...(await store.getProfile(DEMO_USER_IDS.alex))!, userId: "quiet-user" });
    const result = await runMonitor("quiet-user", "manual", { store, dryRun: true });
    expect(result.action).toBe("none");
    expect(result.runId).toBeNull();
  });

  it("returns none without a profile", async () => {
    const result = await runMonitor("nobody", "manual", { store, dryRun: true });
    expect(result.action).toBe("none");
  });
});

describe("helpers", () => {
  const log = (
    date: string,
    foodIds: string[],
    calories: number,
    sodiumMg = 0,
    addedSugarG = 0,
  ): FoodLogEntry => ({
    logId: `${date}-${foodIds.join("-")}`,
    userId: "u",
    eatenAt: `${date}T12:00:00.000Z`,
    photoUrl: null,
    source: "manual",
    visionAgreement: null,
    question: null,
    items: foodIds.map((foodId) => ({ foodId, name: foodId, grams: 100, confidence: 1 })),
    totals: {
      calories,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      addedSugarG,
      satFatG: 0,
      sodiumMg,
      potassiumMg: 0,
      glycemicLoad: 0,
      costUsd: 0,
    },
    flags: [],
  });

  it("intakeHistory prefers logs, then the plan, then targets", () => {
    const logs = Array.from({ length: 8 }, (_, i) => log(`2026-10-0${i + 1}`, ["eggs"], 1800 + i));
    expect(intakeHistory(logs, null, 2000).source).toBe("logs");
    expect(intakeHistory(logs.slice(0, 3), null, 2000).source).toBe("targets");
    expect(intakeHistory(logs.slice(0, 3), null, 2000).kcal).toHaveLength(14);
  });

  it("skippedMeals counts a planned meal skipped on three logged days", () => {
    const meal = (date: string) => ({
      mealId: `${date}-d`,
      type: "dinner" as const,
      name: "Lentil soup",
      cuisine: "x",
      recipeSteps: [],
      prepMinutes: 1,
      items: [{ foodId: "lentils", name: "Lentils", servings: 1, grams: 100 }],
      totals: log(date, [], 0).totals,
      explanation: [],
    });
    const plan = {
      days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date) => ({
        date,
        meals: [meal(date)],
        dayTotals: log(date, [], 0).totals,
      })),
    } as unknown as MealPlan;
    const logs = [
      log("2026-10-01", ["eggs"], 300),
      log("2026-10-02", ["eggs"], 300),
      log("2026-10-03", ["eggs"], 300),
    ];
    expect(skippedMeals(plan, logs, "2026-10-05")).toEqual([{ name: "Lentil soup", times: 3 }]);
    // A day without any log is not a skip.
    expect(skippedMeals(plan, logs.slice(0, 2), "2026-10-05")).toEqual([]);
    // Eating one ingredient of the meal counts as eaten.
    expect(
      skippedMeals(plan, [...logs.slice(0, 2), log("2026-10-03", ["lentils"], 300)], "2026-10-05"),
    ).toEqual([]);
  });

  it("limitStreak needs three consecutive logged days over the cap", () => {
    const logs = [
      log("2026-10-01", ["a"], 1, 2400),
      log("2026-10-02", ["a"], 1, 2400),
      log("2026-10-03", ["a"], 1, 2400, 60),
    ];
    expect(limitStreak(logs, 2300, 50, "2026-10-03")).toEqual({ sodium: true, sugar: false });
    expect(limitStreak(logs.slice(1), 2300, 50, "2026-10-03")).toEqual({ sodium: false, sugar: false });
  });
});
