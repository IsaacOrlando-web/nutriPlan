// Generates every file in /mocks from real math so mock data is internally consistent. Owner: Lead.
// Plans come from the actual optimizer, trends from the Kalman filter, totals from computeTotals.
// Agent event mocks follow the spec's negotiation script (section 9) with numbers taken from the real plan.
// Usage: npm run mocks
import fs from "node:fs";
import path from "node:path";
import foodsList from "./data/foods.json";
import templates from "./data/meal-templates.json";
import type {
  AgentEvent,
  CandidateMeal,
  DaySummary,
  Food,
  FoodLogEntry,
  GroceryItem,
  MealPlan,
  OptimizeResult,
  UserProfile,
} from "@/types/contracts";
import { buildConstraints } from "@/agents/rules/engine";
import { calculateTargets } from "@/math/targets";
import { optimizePlan } from "@/math/optimizer";
import { computeTotals, emptyTotals, subtractTotals, sumTotals } from "@/math/totals";
import { getTrends } from "@/math/kalman";
import { ALEX_PROFILE, MARIA_PROFILE, alexReadings, mariaReadings, type DemoUserKey } from "@/lib/db/seed/demo-users";

const OUT = path.resolve(__dirname, "../mocks");
const FALLBACKS = path.resolve(__dirname, "../agents/fallbacks");
const START = "2026-10-12";
const TODAY = "2026-10-09";

const foods: Record<string, Food> = Object.fromEntries((foodsList as Food[]).map((f) => [f.foodId, f]));

function write(dir: string, name: string, data: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", path.relative(process.cwd(), path.join(dir, name)));
}

/** Chef-like taste scores from likes and dislikes, deterministic. */
function poolFor(profile: UserProfile): CandidateMeal[] {
  return (templates as Omit<CandidateMeal, "tasteScore">[]).map((t, i) => {
    const text = `${t.name} ${t.cuisine} ${t.ingredients.map((x) => x.foodId).join(" ")}`.toLowerCase();
    let score = 0.5 + ((i * 37) % 30) / 100;
    for (const like of profile.likes) if (text.includes(like.toLowerCase().split(" ")[0])) score += 0.15;
    for (const dislike of profile.dislikes) if (text.includes(dislike.toLowerCase().split(" ")[0])) score -= 0.4;
    return { ...t, tasteScore: Math.min(1, Math.max(0.05, score)), pitch: t.pitch || `${t.name}, ${t.cuisine} style, ready in ${t.prepMinutes} minutes.` };
  });
}

export function groceryListFrom(plan: Pick<MealPlan, "days">): GroceryItem[] {
  const grams = new Map<string, number>();
  for (const d of plan.days) for (const m of d.meals) for (const i of m.items) grams.set(i.foodId, (grams.get(i.foodId) ?? 0) + i.grams);
  const order = ["produce", "protein", "dairy", "grains", "pantry", "frozen", "other"];
  return [...grams]
    .map(([foodId, g]): GroceryItem => {
      const f = foods[foodId];
      const servings = Math.round((g / f.servingG) * 10) / 10;
      return {
        foodId,
        name: f.name,
        quantityG: Math.round(g),
        quantityLabel: `${Math.round(g)} g (about ${servings} x ${f.servingLabel})`,
        costUsd: Math.round(((f.priceUsdPer100g ?? 0) * g) / 100 * 100) / 100,
        storeSection: f.storeSection,
      };
    })
    .sort((a, b) => order.indexOf(a.storeSection) - order.indexOf(b.storeSection) || a.name.localeCompare(b.name));
}

function explain(plan: MealPlan, profile: UserProfile, result: OptimizeResult): void {
  const budgetSp = result.shadowPrices.find((s) => s.constraint === "weekly_budget");
  for (const d of plan.days) {
    for (const m of d.meals) {
      const sodiumShare = Math.round((m.totals.sodiumMg / plan.days[0].dayTotals.sodiumMg) * 100);
      m.explanation = [
        { agent: "chef", text: `${m.name}: ${m.cuisine} flavors you said you like, ${m.prepMinutes} minutes of prep.` },
        {
          agent: "doctor",
          text: profile.conditions.includes("type2_diabetes")
            ? `${m.totals.carbsG} g carbs and glycemic load ${m.totals.glycemicLoad}: inside the per meal caps.`
            : `${m.totals.proteinG} g protein and ${m.totals.fiberG} g fiber keep you full while losing fat safely.`,
        },
        {
          agent: "budget",
          text: `$${m.totals.costUsd.toFixed(2)} for this meal, ${sodiumShare}% of today's sodium. ${budgetSp?.humanText ?? ""}`.trim(),
        },
      ];
    }
  }
}

function eventsFor(key: DemoUserKey, profile: UserProfile, plan: MealPlan, result: OptimizeResult, runId: string): AgentEvent[] {
  const c = buildConstraints(profile);
  const t0 = Date.parse(`${TODAY}T15:00:00Z`);
  let i = 0;
  const ev = (agent: AgentEvent["agent"], kind: AgentEvent["kind"], text: string, data?: Record<string, unknown>): AgentEvent => ({
    eventId: `${key}-ev-${String(++i).padStart(2, "0")}`,
    runId,
    agent,
    kind,
    text: text.length > 140 ? text.slice(0, 137) + "..." : text,
    at: new Date(t0 + i * 1400).toISOString(),
    ...(data ? { data } : {}),
  });
  const expensive = plan.groceryList.slice().sort((a, b) => b.costUsd - a.costUsd)[0];
  const cheapProtein = key === "alex" ? "eggs and black beans" : "lentils and tofu";
  const diabetic = profile.conditions.includes("type2_diabetes");
  const out: AgentEvent[] = [
    ev("orchestrator", "proposal", `New plan for ${profile.name}: ${profile.goal} goal, $${profile.weeklyBudgetUsd}/week, ${profile.mealsPerDay} meals a day. Doctor first.`),
    ev("doctor", "tool_call", "Reading guidelines.json for the rules that apply", { tool: "buildConstraints" }),
    ev("doctor", "proposal", `Floors and caps are set: at least ${c.minCaloriesPerDay} kcal, under ${c.maxSodiumMgPerDay} mg sodium, ${c.minFiberG} g fiber.`, { constraints: c }),
  ];
  if (diabetic) out.push(ev("doctor", "proposal", `Diabetes rules on: max ${c.maxCarbsPerMealG} g carbs and glycemic load ${c.maxGlycemicLoadPerMeal} per meal. Non negotiable.`));
  if (profile.conditions.includes("hypertension")) out.push(ev("doctor", "proposal", `DASH rules on: sodium ${c.maxSodiumMgPerDay} mg, potassium ${c.minPotassiumMgPerDay}+ mg, saturated fat ${c.maxSatFatPct}%.`));
  if (profile.allergies.length) out.push(ev("doctor", "proposal", `Allergy filter active: no ${profile.allergies.join(", ")} anywhere in the plan.`));
  out.push(
    ev("chef", "tool_call", "Searching the food database for ingredients", { tool: "searchFoods" }),
    ev("chef", "proposal", `I have ${Math.min(32, templates.length)} ideas: ${profile.likes.slice(0, 3).join(", ")} with real variety. Let me cook!`, { poolSize: 32 }),
    ev("budget", "tool_call", "Pricing every candidate with computeTotals", { tool: "computeTotals" }),
    ev("budget", "objection", `${expensive?.name ?? "Salmon"} alone eats $${expensive?.costUsd.toFixed(2) ?? "9.00"} of the $${profile.weeklyBudgetUsd}. Swap half of it for ${cheapProtein}?`, { foodId: expensive?.foodId }),
    ev("chef", "concession", `Fine, I keep ${expensive?.name.split(",")[0].toLowerCase() ?? "salmon"} once and lean on ${cheapProtein} for the rest. Flavor stays.`),
    ev("doctor", "objection", diabetic ? "Two breakfast ideas push carbs past 45 g per meal. Those are out." : "One snack idea is 40% saturated fat. Out of the pool.", { removed: 2 }),
    ev("chef", "concession", "Removed. I swap in a yogurt bowl with pumpkin seeds instead."),
    ev("orchestrator", "tool_call", `Running the optimizer: 7 days, ${plan.days[0].meals.length} slots a day, integer servings`, { tool: "optimizePlan" }),
    ev("orchestrator", "proposal", `Optimizer solved in ${(result.solveMs / 1000).toFixed(1)} s. Weekly cost $${plan.weeklyCostUsd.toFixed(2)}.`, { solveMs: result.solveMs, weeklyCostUsd: plan.weeklyCostUsd }),
    ev("doctor", "tool_call", "Re-checking every hard rule on the final plan", { tool: "verifyPlan", violations: 0 }),
    ev("doctor", "proposal", "All seven days pass every rule. I am satisfied."),
  );
  const sp = result.shadowPrices.find((s) => s.constraint === "weekly_budget");
  if (sp) out.push(ev("budget", "proposal", sp.humanText, { shadowPrice: sp }));
  out.push(
    ev("budget", "proposal", `Grocery list ready: ${plan.groceryList.length} items, $${plan.weeklyCostUsd.toFixed(2)} total.`, { items: plan.groceryList.length }),
    ev("monitor", "proposal", "I will watch weight, glucose and logs daily and replan when the trend says so."),
    ev("orchestrator", "decision", `Plan v${plan.version} approved: ${plan.days.length} days, $${plan.weeklyCostUsd.toFixed(2)}, zero rule violations.`, { planId: plan.planId }),
  );
  return out;
}

async function buildUser(key: DemoUserKey, profile: UserProfile) {
  const constraints = buildConstraints(profile);
  const targets = calculateTargets(profile, constraints);
  const result = await optimizePlan(
    { pool: poolFor(profile), foods, targets, constraints, weeklyBudgetUsd: profile.weeklyBudgetUsd, concessions: { maxRepeatsPerWeek: 2, budgetSlackPct: 0 }, startDate: START, mealsPerDay: profile.mealsPerDay },
    { timeLimitSec: 8 },
  );
  if (!result.feasible) throw new Error(`${key}: infeasible plan ${result.conflicts.join(",")}`);
  const runId = `${key}-run-0001`;
  const plan: MealPlan = {
    planId: `${key}-plan-0001`,
    userId: profile.userId,
    version: 1,
    reason: "Onboarding plan",
    runId,
    startDate: START,
    weeklyCostUsd: result.weeklyCostUsd,
    days: result.days,
    groceryList: groceryListFrom(result),
    shadowPrices: result.shadowPrices,
    bestEffort: !result.withinBudget,
  };
  explain(plan, profile, result);
  const events = eventsFor(key, profile, plan, result, runId);

  write(OUT, `profile-${key}.json`, profile);
  write(OUT, `constraints-${key}.json`, constraints);
  write(OUT, `targets-${key}.json`, targets);
  write(OUT, `plan-${key}.json`, plan);
  write(OUT, `agent-events-${key}.json`, events);
  write(FALLBACKS, `${key}-plan-run.json`, { run: { runId, userId: profile.userId, trigger: "onboarding", reason: "Onboarding plan", status: "done", createdAt: events[0].at }, events, plan });
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
  const items = lunch.items.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, confidence: 0.86 }));
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
  const targetTotals = { ...emptyTotals(), calories: alex.targets.calories, proteinG: alex.targets.proteinG, carbsG: alex.targets.carbsG, fatG: alex.targets.fatG, fiberG: alex.targets.fiberG, sodiumMg: alex.targets.sodiumMg, potassiumMg: alex.targets.potassiumMg };
  const summary: DaySummary = { date: TODAY, targets: alex.targets, eaten, remaining: subtractTotals(targetTotals, eaten) };
  write(OUT, "summary-alex.json", summary);
  const mariaEaten = sumTotals(maria.plan.days[0].meals.slice(0, 2).map((m) => m.totals));
  const mariaTargets = { ...emptyTotals(), calories: maria.targets.calories, proteinG: maria.targets.proteinG, carbsG: maria.targets.carbsG, fatG: maria.targets.fatG, fiberG: maria.targets.fiberG, sodiumMg: maria.targets.sodiumMg, potassiumMg: maria.targets.potassiumMg };
  write(OUT, "summary-maria.json", { date: TODAY, targets: maria.targets, eaten: mariaEaten, remaining: subtractTotals(mariaTargets, mariaEaten) } satisfies DaySummary);

  write(OUT, "foods-sample.json", (foodsList as Food[]).slice(0, 50));
  write(OUT, "monitor-alex.json", {
    action: "replan",
    reason: "Weight has stalled for 14 days while intake stayed on plan. Real metabolism looks lower than estimated.",
    runId: "alex-run-0002",
    alerts: [{ level: "info", title: "Plan updated", body: "Monitor lowered your calorie target by 150 kcal and asked Chef for a fresh week." }],
    tdee: { mean: 2495, sd: 239 },
  });
  write(OUT, "monitor-maria.json", {
    action: "replan",
    reason: "Fasting glucose trend is rising (about +15 mg/dL per week). Tomorrow's meals get lower glycemic load.",
    runId: "maria-run-0002",
    alerts: [{ level: "warning", title: "Glucose trending up", body: "Four mornings in a row above your usual range. Tomorrow's carbs are spread out more evenly. If this continues, contact your care team." }],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
