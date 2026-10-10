// Generates every file in /mocks from real math so mock data is internally consistent. Owner: Lead.
// Plans come from the actual optimizer, trends from the Kalman filter, totals from computeTotals.
// Agent events and the plan come from a real scripted negotiation (the same orchestrator code the Agent Room
// runs, AGENTS_MODE=scripted, no API keys), so mocks and fallback replays always match the live story.
// Usage: npm run mocks
process.env.AGENTS_MODE = "scripted";
process.env.AGENT_EVENT_DELAY_MS = "0";
process.env.AGENTS_FALLBACK = "false";
import fs from "node:fs";
import path from "node:path";
import foodsList from "./data/foods.json";
import type {
  AgentEvent,
  DaySummary,
  Food,
  FoodLogEntry,
  GroceryItem,
  MealPlan,
  UserProfile,
} from "@/types/contracts";
import { buildConstraints } from "@/agents/rules/engine";
import { runPlanNegotiation } from "@/agents/orchestrator";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { buildGroceryList } from "@/agents/tools/math";
import { calculateTargets } from "@/math/targets";
import { verifyPlan } from "@/math/optimizer";
import { computeTotals, emptyTotals, subtractTotals, sumTotals } from "@/math/totals";
import { getTrends } from "@/math/kalman";
import {
  ALEX_PROFILE,
  MARIA_PROFILE,
  alexReadings,
  mariaReadings,
  type DemoUserKey,
} from "@/lib/db/seed/demo-users";

const OUT = path.resolve(__dirname, "../mocks");
const FALLBACKS = path.resolve(__dirname, "../agents/fallbacks");
const TODAY = "2026-10-09";

const foods: Record<string, Food> = Object.fromEntries((foodsList as Food[]).map((f) => [f.foodId, f]));

function write(dir: string, name: string, data: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), path.join(dir, name)));
}

export function groceryListFrom(plan: Pick<MealPlan, "days">): GroceryItem[] {
  return buildGroceryList(plan.days, foods);
}

async function buildUser(key: DemoUserKey, profile: UserProfile) {
  const constraints = buildConstraints(profile);
  const targets = calculateTargets(profile, constraints);

  // Fresh in-RAM store seeded with this user only; the negotiation reads templates and foods from it.
  const store = new MemoryStore(null);
  setStore(store);
  await store.resetUser(profile.userId);
  await store.saveProfile(profile);
  await store.saveConstraints(profile.userId, constraints);
  await store.saveTargets(profile.userId, targets);
  const run = await store.createRun({ userId: profile.userId, trigger: "onboarding", reason: "Onboarding plan" });
  const outcome = await runPlanNegotiation({
    userId: profile.userId,
    runId: run.runId,
    trigger: "onboarding",
    reason: "Onboarding plan",
    store,
    optimize: { timeLimitSec: 6 },
  });
  if (outcome.status !== "done" || !outcome.plan) throw new Error(`${key}: negotiation failed`);
  const runId = `${key}-run-0001`;
  const plan: MealPlan = { ...outcome.plan, planId: `${key}-plan-0001`, runId, version: 1, startDate: outcome.plan.startDate };
  const events: AgentEvent[] = outcome.events.map((e, i) => ({
    ...e,
    eventId: `${key}-ev-${String(i + 1).padStart(2, "0")}`,
    runId,
    at: new Date(Date.parse(`${TODAY}T15:00:00Z`) + i * 1400).toISOString(),
    ...(e.kind === "decision" ? { data: { ...(e.data ?? {}), planId: plan.planId } } : {}),
  }));
  const violations = verifyPlan(plan.days, constraints);
  if (violations.length) throw new Error(`${key}: plan breaks rules: ${violations.join("; ")}`);

  write(OUT, `profile-${key}.json`, profile);
  write(OUT, `constraints-${key}.json`, constraints);
  write(OUT, `targets-${key}.json`, targets);
  write(OUT, `plan-${key}.json`, plan);
  write(OUT, `agent-events-${key}.json`, events);
  write(FALLBACKS, `${key}-plan-run.json`, {
    run: { runId, userId: profile.userId, trigger: "onboarding", reason: "Onboarding plan", status: "done", createdAt: events[0].at },
    events,
    plan,
  });
  console.log(`${key}: ${events.length} events, $${plan.weeklyCostUsd}, v${plan.version}`);
  return { plan, targets };
}

async function main() {
  const alex = await buildUser("alex", ALEX_PROFILE);
  const maria = await buildUser("maria", MARIA_PROFILE);

  const alexR = alexReadings(TODAY);
  const mariaR = mariaReadings(TODAY);
  write(OUT, "readings-alex.json", alexR);
  write(OUT, "readings-maria.json", mariaR);
  write(OUT, "trend-weight.json", getTrends(alexR, "weight", "lose"));
  write(OUT, "trend-glucose.json", getTrends(mariaR, "glucose_fasting"));
  write(OUT, "trend-bp.json", getTrends(mariaR, "bp"));

  const lunch = alex.plan.days[0].meals.find((m) => m.type === "lunch")!;
  const items = lunch.items.map((i) => ({
    foodId: i.foodId,
    name: i.name,
    grams: i.grams,
    confidence: 0.86,
  }));
  const log: FoodLogEntry = {
    logId: "alex-log-0001",
    userId: ALEX_PROFILE.userId,
    eatenAt: `${TODAY}T12:40:00.000Z`,
    photoUrl: "/demo/lunch-bowl.jpg",
    source: "photo",
    visionAgreement: 0.84,
    question: null,
    items,
    totals: computeTotals(items, foods),
    flags: [{ agent: "monitor", text: "Right on plan for lunch. Nice." }],
  };
  write(OUT, "food-log.json", [log]);

  const breakfast = alex.plan.days[0].meals.find((m) => m.type === "breakfast")!;
  const eaten = sumTotals([breakfast.totals, lunch.totals]);
  const targetTotals = {
    ...emptyTotals(),
    calories: alex.targets.calories,
    proteinG: alex.targets.proteinG,
    carbsG: alex.targets.carbsG,
    fatG: alex.targets.fatG,
    fiberG: alex.targets.fiberG,
    sodiumMg: alex.targets.sodiumMg,
    potassiumMg: alex.targets.potassiumMg,
  };
  const summary: DaySummary = {
    date: TODAY,
    targets: alex.targets,
    eaten,
    remaining: subtractTotals(targetTotals, eaten),
  };
  write(OUT, "summary-alex.json", summary);
  const mariaEaten = sumTotals(maria.plan.days[0].meals.slice(0, 2).map((m) => m.totals));
  const mariaTargets = {
    ...emptyTotals(),
    calories: maria.targets.calories,
    proteinG: maria.targets.proteinG,
    carbsG: maria.targets.carbsG,
    fatG: maria.targets.fatG,
    fiberG: maria.targets.fiberG,
    sodiumMg: maria.targets.sodiumMg,
    potassiumMg: maria.targets.potassiumMg,
  };
  write(OUT, "summary-maria.json", {
    date: TODAY,
    targets: maria.targets,
    eaten: mariaEaten,
    remaining: subtractTotals(mariaTargets, mariaEaten),
  } satisfies DaySummary);

  write(OUT, "foods-sample.json", (foodsList as Food[]).slice(0, 50));
  write(OUT, "monitor-alex.json", {
    action: "replan",
    reason:
      "Weight has stalled for 14 days while intake stayed on plan. Real metabolism looks lower than estimated.",
    runId: "alex-run-0002",
    alerts: [
      {
        level: "info",
        title: "Plan updated",
        body: "Monitor lowered your calorie target by 150 kcal and asked Chef for a fresh week.",
      },
    ],
    tdee: { mean: 2495, sd: 239 },
  });
  write(OUT, "monitor-maria.json", {
    action: "replan",
    reason:
      "Fasting glucose trend is rising (about +15 mg/dL per week). Tomorrow's meals get lower glycemic load.",
    runId: "maria-run-0002",
    alerts: [
      {
        level: "warning",
        title: "Glucose trending up",
        body: "Four mornings in a row above your usual range. Tomorrow's carbs are spread out more evenly. If this continues, contact your care team.",
      },
    ],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
