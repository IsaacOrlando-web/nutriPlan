// Dev script: runs the real optimizer for Alex and Maria and prints a summary. Owner: Math.
// Usage: npx tsx scripts/try-optimizer.ts [week|daily|auto]
import foodsList from "./data/foods.json";
import templates from "./data/meal-templates.json";
import type { CandidateMeal, Food, UserProfile } from "@/types/contracts";
import { buildConstraints } from "@/agents/rules/engine";
import { calculateTargets } from "@/math/targets";
import { optimizePlan, verifyPlan } from "@/math/optimizer";

const foods: Record<string, Food> = Object.fromEntries((foodsList as Food[]).map((f) => [f.foodId, f]));
const pool: CandidateMeal[] = (templates as Omit<CandidateMeal, "tasteScore">[]).map((t, i) => ({
  ...t,
  tasteScore: 0.4 + ((i * 37) % 60) / 100,
}));

const alex: UserProfile = {
  userId: "alex", name: "Alex", language: "en", sex: "male", age: 22, heightCm: 180, weightKg: 88,
  activityLevel: "light", goal: "lose", goalRateKgPerWeek: 0.5, conditions: [], medications: [],
  allergies: ["peanut"], restrictions: [], likes: ["chicken", "mexican"], dislikes: ["mushrooms"],
  weeklyBudgetUsd: 50, mealsPerDay: 3,
};
const maria: UserProfile = {
  userId: "maria", name: "Maria", language: "en", sex: "female", age: 45, heightCm: 163, weightKg: 82,
  activityLevel: "light", goal: "lose", goalRateKgPerWeek: 0.25, conditions: ["type2_diabetes", "hypertension"],
  medications: ["metformin", "amlodipine"], allergies: [], restrictions: [], likes: ["beans", "chicken"],
  dislikes: [], weeklyBudgetUsd: 70, mealsPerDay: 4,
};

async function main() {
const mode = (process.argv[2] ?? "auto") as "auto" | "week" | "daily";
for (const [p, budget] of [[alex, 50], [alex, 35], [maria, 70]] as const) {
  const constraints = buildConstraints(p);
  const targets = calculateTargets(p, constraints);
  const t0 = Date.now();
  const res = await optimizePlan(
    { pool, foods, targets, constraints, weeklyBudgetUsd: budget, concessions: { maxRepeatsPerWeek: 2, budgetSlackPct: 0 }, startDate: "2026-10-12", mealsPerDay: p.mealsPerDay },
    { mode },
  );
  console.log(`\n== ${p.name} $${budget} mode=${mode} total=${Date.now() - t0}ms solve=${res.solveMs}ms`);
  console.log("targets", targets);
  console.log("feasible", res.feasible, "withinBudget", res.withinBudget, "cost", res.weeklyCostUsd, "conflicts", res.conflicts);
  console.log("binding", res.bindingConstraints);
  for (const d of res.days) console.log(d.date, d.dayTotals.calories, "kcal", d.dayTotals.proteinG, "P", d.dayTotals.sodiumMg, "Na", d.dayTotals.potassiumMg, "K", "$" + d.dayTotals.costUsd, "|", d.meals.map((m) => m.name).join(" / "));
  console.log("shadow", res.shadowPrices);
  console.log("verify", verifyPlan(res.days, constraints));
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
