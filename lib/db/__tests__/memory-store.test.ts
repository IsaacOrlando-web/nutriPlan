// MemoryStore behaviour: seeding, fuzzy search, plan history, event waiting, demo reset. Owner: Backend.
import { describe, expect, it } from "vitest";
import { MemoryStore, similarity } from "@/lib/db/memory-store";
import { DEMO_USER_IDS, demoReadings } from "@/lib/db/seed/demo-users";
import type { AgentEvent, MealPlan, Reading } from "@/types/contracts";

const ALEX = DEMO_USER_IDS.alex;
const MARIA = DEMO_USER_IDS.maria;

function plan(userId: string, planId: string, version: number): MealPlan {
  return {
    planId,
    userId,
    version,
    reason: "test",
    runId: `run-${planId}`,
    startDate: "2026-10-12",
    weeklyCostUsd: 42,
    days: [],
    groceryList: [],
    shadowPrices: [],
    bestEffort: false,
  };
}

describe("MemoryStore (no file)", () => {
  it("seeds Alex and Maria with profiles and 21 days of readings", async () => {
    const store = new MemoryStore(null);
    expect(store.kind).toBe("memory");
    const ids = await store.listUserIds();
    expect(ids).toContain(ALEX);
    expect(ids).toContain(MARIA);
    expect((await store.getProfile(ALEX))?.name).toBe("Alex");
    expect((await store.getProfile(MARIA))?.conditions).toContain("type2_diabetes");
    expect(await store.listReadings(ALEX, { type: "weight" })).toHaveLength(21);
    expect((await store.listReadings(MARIA, { type: "glucose_fasting" })).length).toBe(21);
    expect((await store.listReadings(MARIA, { type: "bp" })).length).toBeGreaterThan(0);
    // constraints and targets are NOT seeded: the profile route builds them lazily
    expect(await store.getConstraints(ALEX)).toBeNull();
    expect(await store.getTargets(ALEX)).toBeNull();
  });

  it("loads the food database and meal templates", async () => {
    const store = new MemoryStore(null);
    const foods = await store.getAllFoods();
    expect(foods.length).toBeGreaterThanOrEqual(75);
    expect((await store.getFood("chicken_breast"))?.per100g.proteinG).toBe(31);
    expect((await store.getMealTemplates()).length).toBeGreaterThan(10);
    const some = await store.getFoods(["eggs", "nope"]);
    expect(Object.keys(some)).toEqual(["eggs"]);
  });

  it("searchFoods is fuzzy (chiken -> chicken) and ranks exact matches first", async () => {
    const store = new MemoryStore(null);
    const results = await store.searchFoods("chiken");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("chicken");
    expect(similarity("chiken", "chicken breast, roasted")).toBeGreaterThan(0.2);
    const exact = await store.searchFoods("salmon", { limit: 3 });
    expect(exact[0].foodId).toBe("salmon");
    expect(exact.length).toBeLessThanOrEqual(3);
  });

  it("searchFoods excludeTags removes allergens", async () => {
    const store = new MemoryStore(null);
    const all = await store.searchFoods("peanut");
    expect(all.some((f) => f.tags.includes("peanut"))).toBe(true);
    const safe = await store.searchFoods("peanut", { excludeTags: ["peanut"] });
    expect(safe.some((f) => f.tags.includes("peanut"))).toBe(false);
    const noMeat = await store.searchFoods("", { excludeTags: ["meat", "fish"], limit: 200 });
    expect(noMeat.every((f) => !f.tags.includes("meat") && !f.tags.includes("fish"))).toBe(true);
    expect(noMeat.length).toBeGreaterThan(20);
  });

  it("savePlan marks the latest plan current and keeps history", async () => {
    const store = new MemoryStore(null);
    expect(await store.getCurrentPlan(ALEX)).toBeNull();
    await store.savePlan(plan(ALEX, "p1", 1));
    await store.savePlan(plan(ALEX, "p2", 2));
    expect((await store.getCurrentPlan(ALEX))?.planId).toBe("p2");
    const history = await store.listPlans(ALEX);
    expect(history.map((p) => p.planId)).toEqual(["p2", "p1"]);
    // re-saving an existing plan does not duplicate it
    await store.savePlan(plan(ALEX, "p1", 1));
    expect((await store.listPlans(ALEX)).length).toBe(2);
    expect((await store.getCurrentPlan(ALEX))?.planId).toBe("p1");
  });

  it("waitForEvents resolves when an event is added, [] when the run is done or on timeout", async () => {
    const store = new MemoryStore(null);
    const run = await store.createRun({ userId: ALEX, trigger: "manual", reason: "test" });
    expect(run.status).toBe("running");

    const waiting = store.waitForEvents(run.runId, 0, 5000);
    const event: AgentEvent = {
      eventId: "e1",
      runId: run.runId,
      agent: "chef",
      kind: "proposal",
      text: "Tacos",
      at: new Date().toISOString(),
    };
    setTimeout(() => void store.addEvent(event), 20);
    const got = await waiting;
    expect(got.map((e) => e.eventId)).toEqual(["e1"]);

    // already available events return immediately
    expect(await store.waitForEvents(run.runId, 0, 10)).toHaveLength(1);
    // nothing new within the timeout
    expect(await store.waitForEvents(run.runId, 1, 30)).toEqual([]);

    await store.setRunStatus(run.runId, "done");
    expect(await store.waitForEvents(run.runId, 1, 5000)).toEqual([]);
    expect(await store.waitForEvents("missing-run", 0, 5000)).toEqual([]);
    expect((await store.getRun(run.runId))?.status).toBe("done");
    expect((await store.listRuns(ALEX)).map((r) => r.runId)).toContain(run.runId);
  });

  it("resetUser restores the seeded profile and readings and drops runs", async () => {
    const store = new MemoryStore(null);
    const extra: Reading = {
      readingId: "x",
      userId: ALEX,
      type: "weight",
      value: 80,
      unit: "kg",
      takenAt: new Date().toISOString(),
    };
    await store.addReading(extra);
    await store.saveTargets(ALEX, {
      calories: 1,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
      fiberG: 1,
      sodiumMg: 1,
      potassiumMg: 1,
      tdeeEstimate: 1,
      tdeeUncertainty: 1,
    });
    const run = await store.createRun({ userId: ALEX, trigger: "manual" });
    expect(await store.listReadings(ALEX)).toHaveLength(22);

    await store.resetUser(ALEX);
    const readings = await store.listReadings(ALEX);
    expect(readings).toHaveLength(21);
    expect(readings.map((r) => r.value)).toEqual(demoReadings("alex").map((r) => r.value));
    expect(await store.getTargets(ALEX)).toBeNull();
    expect((await store.getProfile(ALEX))?.name).toBe("Alex");
    expect(await store.getRun(run.runId)).toBeNull();
    // other users untouched
    expect((await store.listReadings(MARIA)).length).toBeGreaterThan(21);
  });

  it("food logs filter by date range and meal ratings accumulate", async () => {
    const store = new MemoryStore(null);
    const totals = {
      calories: 1,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      addedSugarG: 0,
      satFatG: 0,
      sodiumMg: 0,
      potassiumMg: 0,
      glycemicLoad: 0,
      costUsd: 0,
    };
    const base = {
      userId: ALEX,
      photoUrl: null,
      source: "manual" as const,
      visionAgreement: null,
      question: null,
      items: [],
      totals,
      flags: [],
    };
    await store.addFoodLog({ ...base, logId: "a", eatenAt: "2026-10-08T12:00:00.000Z" });
    await store.addFoodLog({ ...base, logId: "b", eatenAt: "2026-10-09T08:00:00.000Z" });
    await store.addFoodLog({ ...base, logId: "c", eatenAt: "2026-10-10T08:00:00.000Z" });
    const day = await store.listFoodLogs(ALEX, { from: "2026-10-09", to: "2026-10-10T00:00:00.000Z" });
    expect(day.map((l) => l.logId)).toEqual(["b"]);
    await store.addMealRating(ALEX, { mealName: "Tacos", liked: true });
    await store.addMealRating(ALEX, { mealName: "Oats", liked: false });
    expect(await store.listMealRatings(ALEX)).toHaveLength(2);
  });
});
