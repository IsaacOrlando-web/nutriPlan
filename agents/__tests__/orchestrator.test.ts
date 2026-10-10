import { beforeAll, describe, expect, it } from "vitest";
import type { AgentEvent, Food } from "@/types/contracts";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { ALEX_PROFILE, DEMO_USER_IDS, MARIA_PROFILE } from "@/lib/db/seed/demo-users";
import { verifyPlan } from "@/math/optimizer";
import { runPlanNegotiation } from "../orchestrator";

process.env.AGENTS_MODE = "scripted";
process.env.AGENT_EVENT_DELAY_MS = "0";
process.env.AGENTS_FALLBACK = "false";

const OPT = { shadowPrices: false, timeLimitSec: 2 };
const LONG = 180_000;

let store: MemoryStore;
let foods: Record<string, Food>;

beforeAll(async () => {
  store = new MemoryStore(null);
  setStore(store);
  foods = Object.fromEntries((await store.getAllFoods()).map((f) => [f.foodId, f]));
});

async function negotiate(userId: string) {
  const run = await store.createRun({ userId, trigger: "onboarding", reason: "test" });
  const outcome = await runPlanNegotiation({
    userId,
    runId: run.runId,
    trigger: "onboarding",
    optimize: OPT,
    store,
  });
  return {
    run,
    outcome,
    events: await store.listEvents(run.runId),
    status: (await store.getRun(run.runId))!.status,
  };
}

function assertEventRules(events: AgentEvent[]) {
  expect(events.length).toBeGreaterThanOrEqual(15);
  expect(events.length).toBeLessThanOrEqual(25);
  expect(events.some((e) => e.kind === "objection")).toBe(true);
  expect(events.some((e) => e.kind === "concession")).toBe(true);
  for (const e of events) expect(e.text.length).toBeLessThanOrEqual(140);
  expect(events[events.length - 1].kind).toBe("decision");
  expect(events.filter((e) => e.kind === "decision")).toHaveLength(1);
  expect(events[0].agent).toBe("orchestrator");
  const doctorProposal = events.find((e) => e.agent === "doctor" && e.kind === "proposal");
  expect(doctorProposal?.data?.constraints).toBeDefined();
  for (const e of events.filter((x) => x.kind === "tool_call")) expect(e.data?.tool).toBeDefined();
}

describe("runPlanNegotiation (scripted)", () => {
  it(
    "builds Alex's plan: events in range, plan saved with 7 days, no violations, grocery list, version 1",
    async () => {
      const { outcome, events, status } = await negotiate(DEMO_USER_IDS.alex);
      expect(status).toBe("done");
      expect(outcome.fallback).toBe(false);
      assertEventRules(events);
      const plan = outcome.plan!;
      expect(plan).not.toBeNull();
      expect(plan.days).toHaveLength(7);
      expect(plan.version).toBe(1);
      expect(plan.groceryList.length).toBeGreaterThan(0);
      expect(events[events.length - 1].data?.planId).toBe(plan.planId);
      const constraints = (await store.getConstraints(DEMO_USER_IDS.alex))!;
      expect(verifyPlan(plan.days, constraints)).toEqual([]);
      for (const d of plan.days) {
        expect(d.meals).toHaveLength(ALEX_PROFILE.mealsPerDay);
        for (const m of d.meals) {
          expect(m.explanation).toHaveLength(3);
          for (const i of m.items) expect(foods[i.foodId].tags).not.toContain("peanut");
        }
      }
      expect((await store.getCurrentPlan(DEMO_USER_IDS.alex))!.planId).toBe(plan.planId);
    },
    LONG,
  );

  it(
    "increments the version on a second run",
    async () => {
      const { outcome, status } = await negotiate(DEMO_USER_IDS.alex);
      expect(status).toBe("done");
      expect(outcome.plan!.version).toBe(2);
    },
    LONG,
  );

  it(
    "builds Maria's plan with diabetes and DASH rules respected per meal and the Doctor objecting to the pool",
    async () => {
      const { outcome, events, status } = await negotiate(DEMO_USER_IDS.maria);
      expect(status).toBe("done");
      assertEventRules(events);
      expect(events.some((e) => e.agent === "doctor" && e.kind === "objection")).toBe(true);
      const plan = outcome.plan!;
      expect(plan.days).toHaveLength(7);
      const constraints = (await store.getConstraints(DEMO_USER_IDS.maria))!;
      expect(constraints.maxCarbsPerMealG).toBe(45);
      expect(verifyPlan(plan.days, constraints)).toEqual([]);
      for (const d of plan.days) {
        expect(d.meals).toHaveLength(MARIA_PROFILE.mealsPerDay);
        expect(d.dayTotals.sodiumMg).toBeLessThanOrEqual(1500 + 1);
        for (const m of d.meals) expect(m.totals.carbsG).toBeLessThanOrEqual(45.2);
      }
      // Doctor constraints unchanged start to end.
      const stated = events.find((e) => e.agent === "doctor" && e.kind === "proposal")!.data!.constraints;
      expect(stated).toEqual(constraints);
    },
    LONG,
  );

  it("fails cleanly with a decision event when the user has no profile", async () => {
    const userId = "no-such-user";
    const run = await store.createRun({ userId, trigger: "manual" });
    const outcome = await runPlanNegotiation({
      userId,
      runId: run.runId,
      trigger: "manual",
      optimize: OPT,
      store,
    });
    expect(outcome.status).toBe("failed");
    const events = await store.listEvents(run.runId);
    expect(events[events.length - 1].kind).toBe("decision");
    expect(events[events.length - 1].text).toMatch(/could not be built/);
    expect((await store.getRun(run.runId))!.status).toBe("failed");
  });
});
