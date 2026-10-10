import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import { getCachedCurve } from "@/math";
import { yieldToEventLoop } from "@/math/lp";
import { budgetGrid, buildCurveInput, CURVE_CONCESSIONS } from "@/lib/plan/curve-input";

describe("budgetGrid", () => {
  it("covers 25..100 by 5 and always includes the profile budget", () => {
    const grid = budgetGrid({}, 53);
    expect(grid[0]).toBe(25);
    expect(grid[grid.length - 1]).toBe(100);
    expect(grid).toContain(53);
    expect(grid).toEqual([...grid].sort((a, b) => a - b));
    expect(new Set(grid).size).toBe(grid.length);
  });

  it("adds the focus budget and respects a custom step", () => {
    const grid = budgetGrid({ min: 30, max: 60, step: 10, budget: 47 }, 50);
    expect(grid).toEqual([30, 40, 47, 50, 60]);
  });
});

describe("buildCurveInput", () => {
  it("returns 404 for an unknown user", async () => {
    const res = await buildCurveInput(new MemoryStore(null), "nobody");
    expect(res).toEqual({ ok: false, status: 404, message: "No profile yet" });
  });

  it("builds a safe pool, targets and a stable cache key for a seeded demo user", async () => {
    const store = new MemoryStore(null);
    const a = await buildCurveInput(store, DEMO_USER_IDS.alex);
    const b = await buildCurveInput(store, DEMO_USER_IDS.alex);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.input.pool.length).toBeGreaterThan(5);
    expect(a.input.concessions).toEqual(CURVE_CONCESSIONS);
    expect(a.input.targets.calories).toBeGreaterThan(1000);
    expect(a.key).toBe(b.key);
    expect(getCachedCurve(a.key)).toBeUndefined();
  });
});

describe("yieldToEventLoop", () => {
  it("lets already queued work run before continuing", async () => {
    let fired = false;
    setImmediate(() => {
      fired = true;
    });
    expect(fired).toBe(false);
    await yieldToEventLoop();
    expect(fired).toBe(true);
  });
});
