// MemoryStore planner methods: week plan and state are stored independently, records are copies, reset clears them.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore } from "@/lib/db/memory-store";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import type { PlannerWeekState, WeeklyMealPlan } from "@/types/contracts";

const ALEX = DEMO_USER_IDS.alex;
const WEEK = "2026-10-12";
const plan = (id: string): WeeklyMealPlan => ({ id, userId: ALEX, weekStartDate: WEEK, language: "en", createdAt: "2026-10-10T00:00:00.000Z", days: [] });
const state: PlannerWeekState = {
  completed: { "2026-10-12:lunch": true },
  shopping: { checked: {}, quantityOverrides: {}, removed: [], customItems: [] },
};

describe("MemoryStore planner", () => {
  it("saves the plan without losing the week state and vice versa", async () => {
    const store = new MemoryStore(null);
    expect(await store.getPlannerWeek(ALEX, WEEK)).toBeNull();
    await store.savePlannerWeekState(ALEX, WEEK, state);
    await store.savePlannerWeekPlan(ALEX, plan("p1"));
    expect(await store.getPlannerWeek(ALEX, WEEK)).toEqual({ plan: plan("p1"), state });
    await store.savePlannerWeekPlan(ALEX, plan("p2"));
    expect((await store.getPlannerWeek(ALEX, WEEK))?.state).toEqual(state);
    expect(await store.getPlannerWeek(ALEX, "2026-10-19")).toBeNull();
  });

  it("returns copies so callers cannot mutate stored data", async () => {
    const store = new MemoryStore(null);
    await store.savePlannerWeekPlan(ALEX, plan("p1"));
    const rec = (await store.getPlannerWeek(ALEX, WEEK))!;
    rec.plan!.id = "changed";
    expect((await store.getPlannerWeek(ALEX, WEEK))?.plan?.id).toBe("p1");
  });

  it("stores settings and clears everything on reset", async () => {
    const store = new MemoryStore(null);
    const settings = {
      preferences: { servings: 3, dietaryPreferences: [], excludedIngredients: [], preferredCuisines: [], maxPreparationMinutes: null, availableIngredients: [], kitchenEquipment: [], language: "en" as const },
      favorites: [],
      selectedWeek: WEEK,
    };
    await store.savePlannerSettings(ALEX, settings);
    expect(await store.getPlannerSettings(ALEX)).toEqual(settings);
    await store.savePlannerWeekPlan(ALEX, plan("p1"));
    await store.resetUser(ALEX);
    expect(await store.getPlannerSettings(ALEX)).toBeNull();
    expect(await store.getPlannerWeek(ALEX, WEEK)).toBeNull();
  });

  it("loads snapshots written before the planner existed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "np-store-"));
    const file = path.join(dir, "store.json");
    const seeded = new MemoryStore(file);
    await seeded.getProfile(ALEX);
    await new Promise((r) => setTimeout(r, 400)); // let the debounced persist write
    const old = new MemoryStore(file);
    expect(await old.getPlannerWeek(ALEX, WEEK)).toBeNull();
    expect(await old.getPlannerSettings(ALEX)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
