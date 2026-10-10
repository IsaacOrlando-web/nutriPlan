// optimizePlan: mixed integer program that turns the agents' agreement into an exact 7 day plan. Owner: Math.
//
// Formulation (spec section 10.2), written as a portion-pattern model:
//   For every candidate meal we enumerate its integer serving combinations ("patterns": each ingredient
//   0..4 servings within the Chef's min/max). z[d,s,c,p] is binary: day d, slot s uses candidate c with
//   pattern p. This is exactly the spec's y[d,s,c] binary + integer servings x[d,s,c,i] model
//   (y = sum_p z, x_i = sum_p servings_i(p) z), but without big-M linking, so the LP relaxation is much
//   tighter and HiGHS solves a full week in a few seconds.
//
//   Objective   weighted macro deviation (slack variables for absolute values)
//               + cost - taste + repetition penalty
//   Hard        every MedicalConstraints field. Daily rules use elastic slacks with a huge penalty so an
//               impossible rule set is reported in `conflicts` (and the plan is rejected) instead of a
//               solver error. Per meal rules (carb cap, glycemic load cap) are exact: only patterns that
//               satisfy them are offered.
//   Soft        calories within 5%, weekly cost <= budget x (1 + slack), repeats <= maxRepeatsPerWeek
//
// Mode "week" solves all 7 days in one MILP. Mode "daily" solves day by day with the weekly budget split
// across remaining days and repeat counts carried forward (the spec's fallback). "auto" tries the week
// model and falls back to daily.
//
// Shadow prices: for budget, sodium, carb cap and calorie target, re-solve with the constraint relaxed by a
// small amount and report the objective change plus the concrete meal that would change.
import type {
  CandidateMeal,
  Food,
  Meal,
  MealItem,
  MealTotals,
  MealType,
  MedicalConstraints,
  OptimizeInput,
  OptimizeResult,
  PlanDay,
  ShadowPrice,
} from "@/types/contracts";
import { LinearModel, solveLinear, type LinearSolution } from "./lp";
import { computeTotals, computeTotalsRaw, emptyTotals, sumTotals, TOTAL_KEYS } from "./totals";

export const SLOTS_BY_MEALS: Record<3 | 4, MealType[]> = {
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "dinner", "snack"],
};

/** Objective weights. Units: points per percent deviation, per dollar, per meal. */
export const WEIGHTS = {
  calPct: 1,
  calOutside5Pct: 4,
  proteinUnderPct: 1,
  proteinOverPct: 0.2,
  carbPct: 0.3,
  fatPct: 0.3,
  cost: 1,
  taste: 4,
  repeat: 2,
  repeatOverLimit: 300,
  sameAsYesterday: 6,
  budgetOver: 100,
  elastic: 500,
} as const;

export const MAX_SERVINGS_PER_INGREDIENT = 4;
/** Upper bound on enumerated portion patterns per meal (ranges are small, so this rarely bites). */
export const MAX_PATTERNS_PER_MEAL = 96;
/** Objective points a relaxation must save before a shadow price claims a concrete meal change. */
const SHADOW_MIN_IMPROVEMENT = 0.5;
const DAYS = 7;

export type HardConstraintName =
  | "min_calories"
  | "min_fiber"
  | "max_added_sugar"
  | "max_sodium"
  | "max_sat_fat"
  | "min_potassium"
  | "max_carbs_per_meal"
  | "max_glycemic_load_per_meal";

export interface OptimizeOptions {
  mode?: "auto" | "week" | "daily";
  solver?: "highs" | "jslp";
  shadowPrices?: boolean;
  /** Solver time budget in seconds for the main solve (split across days in daily mode). */
  timeLimitSec?: number;
  mipRelGap?: number;
}

interface Relax {
  budgetUsd: number;
  sodiumMg: number;
  carbsPerMealG: number;
  calories: number;
}
const NO_RELAX: Relax = { budgetUsd: 0, sodiumMg: 0, carbsPerMealG: 0, calories: 0 };

interface PreparedIngredient {
  foodId: string;
  name: string;
  min: number;
  max: number;
  servingG: number;
  perServing: MealTotals;
}

/** One concrete portion choice for a candidate meal: integer servings per ingredient and resulting totals. */
export interface PortionPattern {
  servings: number[];
  totals: MealTotals;
}

interface PreparedCandidate {
  idx: number;
  meal: CandidateMeal;
  ingredients: PreparedIngredient[];
  patterns: PortionPattern[];
}

/**
 * Everything the solver needs that does not depend on the budget: filtered pool, enumerated portion patterns
 * with precomputed totals, slot layout. Build it once with `prepareContext` and reuse it across solves
 * (shadow prices, the budget curve) with `withBudget`. Treat it as opaque outside /math.
 */
export interface PreparedContext {
  input: OptimizeInput;
  slots: MealType[];
  bySlot: Map<MealType, PreparedCandidate[]>;
  budgetCap: number;
  droppedCandidates: string[];
}
type Context = PreparedContext;

// ---------------------------------------------------------------------------
// Preparation: allergy and restriction filtering happens here, in code, before optimization.
// ---------------------------------------------------------------------------

export function filterPool(
  pool: CandidateMeal[],
  foods: Record<string, Food>,
  excludedTags: string[],
): { kept: CandidateMeal[]; dropped: string[] } {
  const excluded = new Set(excludedTags.map((t) => t.toLowerCase()));
  const kept: CandidateMeal[] = [];
  const dropped: string[] = [];
  for (const c of pool) {
    const ingredients: CandidateMeal["ingredients"] = [];
    let ok = true;
    for (const ing of c.ingredients) {
      const food = foods[ing.foodId];
      const banned = !food || food.tags.some((t) => excluded.has(t.toLowerCase()));
      if (!banned) {
        ingredients.push(ing);
      } else if (ing.minServings > 0) {
        ok = false; // a required ingredient is unsafe or unknown: drop the whole meal
        break;
      } // an optional unsafe ingredient is dropped from the meal
    }
    if (ok && ingredients.length > 0) kept.push({ ...c, ingredients });
    else dropped.push(c.candidateId);
  }
  return { kept, dropped };
}

/**
 * Enumerates every integer serving combination for a meal (the cartesian product of ingredient ranges).
 */
export function enumeratePatterns(
  ingredients: PreparedIngredient[],
  maxPatterns = MAX_PATTERNS_PER_MEAL,
): PortionPattern[] {
  let combos: number[][] = [[]];
  for (const ing of ingredients) {
    const next: number[][] = [];
    for (const combo of combos) for (let k = ing.min; k <= ing.max; k++) next.push([...combo, k]);
    combos = next;
  }
  combos = combos.filter((c) => c.some((k) => k > 0));
  if (combos.length > maxPatterns) {
    const step = combos.length / maxPatterns;
    combos = Array.from({ length: maxPatterns }, (_, i) => combos[Math.floor(i * step)]);
  }
  return combos.map((servings) => {
    const totals = emptyTotals();
    servings.forEach((k, i) => {
      for (const key of TOTAL_KEYS) totals[key] += ingredients[i].perServing[key] * k;
    });
    return { servings, totals };
  });
}

export function prepareContext(input: OptimizeInput): PreparedContext {
  const slots = SLOTS_BY_MEALS[input.mealsPerDay];
  const { kept, dropped } = filterPool(input.pool, input.foods, input.constraints.excludedFoodTags);
  const bySlot = new Map<MealType, PreparedCandidate[]>(slots.map((s) => [s, []]));
  kept.forEach((meal, idx) => {
    const list = bySlot.get(meal.type);
    if (!list) return;
    const ingredients = meal.ingredients.map((ing): PreparedIngredient => {
      const food = input.foods[ing.foodId];
      const max = Math.min(MAX_SERVINGS_PER_INGREDIENT, Math.max(0, Math.round(ing.maxServings)));
      const min = Math.min(max, Math.max(0, Math.round(ing.minServings)));
      return {
        foodId: ing.foodId,
        name: food.name,
        min,
        max,
        servingG: food.servingG,
        perServing: computeTotalsRaw([{ foodId: ing.foodId, grams: food.servingG }], input.foods),
      };
    });
    list.push({ idx, meal, ingredients, patterns: enumeratePatterns(ingredients) });
  });
  const budgetCap = budgetCapFor(input.weeklyBudgetUsd, input.concessions.budgetSlackPct);
  return { input, slots, bySlot, budgetCap, droppedCandidates: dropped };
}

function budgetCapFor(weeklyBudgetUsd: number, budgetSlackPct: number): number {
  return weeklyBudgetUsd * (1 + budgetSlackPct / 100);
}

/** Same prepared pool and patterns, different weekly budget. Patterns are shared, not copied. */
export function withBudget(ctx: PreparedContext, weeklyBudgetUsd: number): PreparedContext {
  const input = { ...ctx.input, weeklyBudgetUsd };
  return { ...ctx, input, budgetCap: budgetCapFor(weeklyBudgetUsd, input.concessions.budgetSlackPct) };
}

function patternAllowed(t: MealTotals, c: MedicalConstraints, relax: Relax): boolean {
  if (c.maxCarbsPerMealG !== undefined && t.carbsG > c.maxCarbsPerMealG + relax.carbsPerMealG + 1e-9)
    return false;
  if (c.maxGlycemicLoadPerMeal !== undefined && t.glycemicLoad > c.maxGlycemicLoadPerMeal + 1e-9)
    return false;
  return true;
}

// ---------------------------------------------------------------------------
// Model building
// ---------------------------------------------------------------------------

interface DayHandles {
  day: number;
  slots: { slot: MealType; options: { cand: PreparedCandidate; pattern: PortionPattern; z: string }[] }[];
}

interface BuiltModel {
  model: LinearModel;
  days: DayHandles[];
  elastic: { varName: string; constraint: HardConstraintName; scale: number }[];
}

interface RepeatState {
  used: Map<string, number>;
  yesterday: Set<string>;
}

function buildModel(
  ctx: Context,
  dayIdxs: number[],
  relax: Relax,
  budgetForTheseDays: number,
  repeatState: RepeatState | null, // null in week mode (repeats handled inside the model)
): BuiltModel {
  const { input } = ctx;
  const { targets, constraints } = input;
  const model = new LinearModel();
  const elastic: BuiltModel["elastic"] = [];
  const days: DayHandles[] = [];
  const costTerms: [string, number][] = [];
  const zByCandidateDay = new Map<string, Map<number, string[]>>();

  const addElastic = (name: string, constraint: HardConstraintName, scale: number) => {
    const v = model.addVar(`e_${name}`, "continuous", 0);
    model.addObjective(v, WEIGHTS.elastic / scale);
    elastic.push({ varName: v, constraint, scale });
    return v;
  };

  const calTarget = targets.calories + relax.calories;
  const repeatLimit = input.concessions.maxRepeatsPerWeek;

  for (const d of dayIdxs) {
    const handles: DayHandles = { day: d, slots: [] };
    const dayTerms: Record<string, [string, number][]> = {
      calories: [],
      proteinG: [],
      carbsG: [],
      fatG: [],
      fiberG: [],
      addedSugarG: [],
      sodiumMg: [],
      potassiumMg: [],
      satFatBalance: [],
    };

    ctx.slots.forEach((slot, s) => {
      const options = ctx.bySlot.get(slot) ?? [];
      const slotHandles: DayHandles["slots"][number] = { slot, options: [] };
      const pickTerms: [string, number][] = [];

      for (const cand of options) {
        const cid = cand.meal.candidateId;
        const used = repeatState?.used.get(cid) ?? 0;
        cand.patterns.forEach((pattern, p) => {
          if (!patternAllowed(pattern.totals, constraints, relax)) return;
          const z = model.addVar(`z${d}_${s}_${cand.idx}_${p}`, "binary");
          pickTerms.push([z, 1]);
          const n = pattern.totals;
          // Taste as a non-negative penalty (equivalent to -taste because each slot picks exactly one meal);
          // a positive objective keeps the MIP gap stopping rule meaningful.
          let coef = WEIGHTS.taste * (1 - clamp01(cand.meal.tasteScore)) + WEIGHTS.cost * n.costUsd;
          if (repeatState) {
            coef += used >= repeatLimit ? WEIGHTS.repeatOverLimit : WEIGHTS.repeat * used;
            if (repeatState.yesterday.has(cid)) coef += WEIGHTS.sameAsYesterday;
          }
          model.addObjective(z, coef);

          if (!zByCandidateDay.has(cid)) zByCandidateDay.set(cid, new Map());
          const perDay = zByCandidateDay.get(cid)!;
          if (!perDay.has(d)) perDay.set(d, []);
          perDay.get(d)!.push(z);

          dayTerms.calories.push([z, n.calories]);
          dayTerms.proteinG.push([z, n.proteinG]);
          dayTerms.carbsG.push([z, n.carbsG]);
          dayTerms.fatG.push([z, n.fatG]);
          dayTerms.fiberG.push([z, n.fiberG]);
          dayTerms.addedSugarG.push([z, n.addedSugarG]);
          dayTerms.sodiumMg.push([z, n.sodiumMg]);
          dayTerms.potassiumMg.push([z, n.potassiumMg]);
          dayTerms.satFatBalance.push([z, 9 * n.satFatG - (constraints.maxSatFatPct / 100) * n.calories]);
          costTerms.push([z, n.costUsd]);
          slotHandles.options.push({ cand, pattern, z });
        });
      }

      if (pickTerms.length > 0) model.addConstraint(`pick${d}_${s}`, pickTerms, { lo: 1, hi: 1 });
      handles.slots.push(slotHandles);
    });

    // Soft macro targets with absolute deviation slacks.
    addDeviation(
      model,
      `cal${d}`,
      dayTerms.calories,
      calTarget,
      WEIGHTS.calPct,
      WEIGHTS.calPct,
      0.05,
      WEIGHTS.calOutside5Pct,
    );
    addDeviation(
      model,
      `pro${d}`,
      dayTerms.proteinG,
      targets.proteinG,
      WEIGHTS.proteinOverPct,
      WEIGHTS.proteinUnderPct,
    );
    addDeviation(model, `carbs${d}`, dayTerms.carbsG, targets.carbsG, WEIGHTS.carbPct, WEIGHTS.carbPct);
    addDeviation(model, `fat${d}`, dayTerms.fatG, targets.fatG, WEIGHTS.fatPct, WEIGHTS.fatPct);

    // Hard daily rules (Doctor). Elastic only so impossible combinations are reported, never silently accepted.
    hardLo(
      model,
      addElastic,
      `mincal${d}`,
      "min_calories",
      dayTerms.calories,
      constraints.minCaloriesPerDay,
      100,
    );
    hardLo(model, addElastic, `fiber${d}`, "min_fiber", dayTerms.fiberG, constraints.minFiberG, 1);
    hardHi(
      model,
      addElastic,
      `sugar${d}`,
      "max_added_sugar",
      dayTerms.addedSugarG,
      constraints.maxAddedSugarG,
      1,
    );
    hardHi(
      model,
      addElastic,
      `sodium${d}`,
      "max_sodium",
      dayTerms.sodiumMg,
      constraints.maxSodiumMgPerDay + relax.sodiumMg,
      100,
    );
    hardHi(model, addElastic, `satfat${d}`, "max_sat_fat", dayTerms.satFatBalance, 0, 9);
    if (constraints.minPotassiumMgPerDay !== undefined) {
      hardLo(
        model,
        addElastic,
        `potassium${d}`,
        "min_potassium",
        dayTerms.potassiumMg,
        constraints.minPotassiumMgPerDay,
        100,
      );
    }
    days.push(handles);
  }

  // Budget (soft): cost - over <= cap.
  const over = model.addVar("budget_over", "continuous", 0);
  model.addObjective(over, WEIGHTS.budgetOver);
  model.addConstraint("budget", [...costTerms, [over, -1]], { hi: budgetForTheseDays });

  // Week mode: repeat limits, repetition penalty and "not twice in one day" inside the model.
  if (!repeatState) {
    for (const [cid, perDay] of zByCandidateDay) {
      const all = [...perDay.values()].flat().map((z) => [z, 1] as [string, number]);
      if (perDay.size > 1) {
        const key = sanitize(cid);
        const extra = model.addVar(`rep_${key}`, "continuous", 0);
        model.addObjective(extra, WEIGHTS.repeat);
        model.addConstraint(`repx_${key}`, [...all, [extra, -1]], { hi: 1 });
        const overLimit = model.addVar(`repo_${key}`, "continuous", 0);
        model.addObjective(overLimit, WEIGHTS.repeatOverLimit);
        model.addConstraint(`repl_${key}`, [...all, [overLimit, -1]], { hi: repeatLimit });
      }
      for (const [d, zs] of perDay) {
        // Candidates belong to one meal type, so this only matters if a type fills several slots.
        if (zs.length > 1 && ctx.slots.length > new Set(ctx.slots).size) {
          model.addConstraint(
            `once${d}_${sanitize(cid)}`,
            zs.map((z) => [z, 1]),
            { hi: 1 },
          );
        }
      }
    }
  }

  return { model, days, elastic };
}

function addDeviation(
  model: LinearModel,
  name: string,
  terms: [string, number][],
  target: number,
  overWeightPct: number,
  underWeightPct: number,
  band?: number,
  outsideBandWeightPct?: number,
) {
  if (target <= 0 || terms.length === 0) return;
  const up = model.addVar(`${name}_up`, "continuous", 0);
  const dn = model.addVar(`${name}_dn`, "continuous", 0);
  model.addConstraint(name, [...terms, [up, -1], [dn, 1]], { lo: target, hi: target });
  model.addObjective(up, (overWeightPct * 100) / target);
  model.addObjective(dn, (underWeightPct * 100) / target);
  if (band !== undefined && outsideBandWeightPct !== undefined) {
    const ou = model.addVar(`${name}_ou`, "continuous", 0);
    const od = model.addVar(`${name}_od`, "continuous", 0);
    model.addConstraint(
      `${name}_bu`,
      [
        [ou, 1],
        [up, -1],
      ],
      { lo: -band * target },
    );
    model.addConstraint(
      `${name}_bd`,
      [
        [od, 1],
        [dn, -1],
      ],
      { lo: -band * target },
    );
    model.addObjective(ou, (outsideBandWeightPct * 100) / target);
    model.addObjective(od, (outsideBandWeightPct * 100) / target);
  }
}

type ElasticFn = (name: string, c: HardConstraintName, scale: number) => string;

function hardLo(
  model: LinearModel,
  el: ElasticFn,
  name: string,
  c: HardConstraintName,
  terms: [string, number][],
  lo: number,
  scale: number,
) {
  if (terms.length === 0) return;
  const e = el(name, c, scale);
  model.addConstraint(name, [...terms, [e, 1]], { lo });
}

function hardHi(
  model: LinearModel,
  el: ElasticFn,
  name: string,
  c: HardConstraintName,
  terms: [string, number][],
  hi: number,
  scale: number,
) {
  if (terms.length === 0) return;
  const e = el(name, c, scale);
  model.addConstraint(name, [...terms, [e, -1]], { hi });
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

interface SolvedWeek {
  days: PlanDay[];
  objective: number;
  conflicts: string[];
  mode: "week" | "daily";
  solver: LinearSolution["solver"];
}

function addDaysIso(start: string, n: number): string {
  const t = Date.parse(`${start}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

interface ExtractedDay {
  day: PlanDay;
  candidateIds: string[];
}

function extractDays(ctx: Context, built: BuiltModel, sol: LinearSolution): ExtractedDay[] {
  const { foods, startDate } = ctx.input;
  return built.days.map((dh) => {
    const meals: Meal[] = [];
    const candidateIds: string[] = [];
    for (const sh of dh.slots) {
      const chosen = sh.options.find((o) => (sol.values[o.z] ?? 0) > 0.5);
      if (!chosen) continue;
      candidateIds.push(chosen.cand.meal.candidateId);
      const items: MealItem[] = [];
      chosen.cand.ingredients.forEach((ing, i) => {
        const servings = chosen.pattern.servings[i];
        if (servings > 0)
          items.push({ foodId: ing.foodId, name: ing.name, servings, grams: servings * ing.servingG });
      });
      const m = chosen.cand.meal;
      meals.push({
        mealId: `${addDaysIso(startDate, dh.day)}_${sh.slot}_${m.candidateId}`,
        type: sh.slot,
        name: m.name,
        cuisine: m.cuisine,
        recipeSteps: m.recipeSteps,
        prepMinutes: m.prepMinutes,
        items,
        totals: computeTotals(items, foods),
        explanation: [],
      });
    }
    return {
      day: { date: addDaysIso(startDate, dh.day), meals, dayTotals: sumTotals(meals.map((m) => m.totals)) },
      candidateIds,
    };
  });
}

function elasticConflicts(built: BuiltModel, sol: LinearSolution): string[] {
  const out = new Set<string>();
  // Slack is in raw units (kcal, mg, g, sat fat kcal balance). Count it as a conflict only when it is larger
  // than display rounding; verifyPlan() is the final, tolerance-aware check on the extracted plan.
  for (const e of built.elastic) if ((sol.values[e.varName] ?? 0) > 0.5 * e.scale) out.add(e.constraint);
  return [...out];
}

async function solveWeekModel(ctx: Context, relax: Relax, opts: OptimizeOptions): Promise<SolvedWeek | null> {
  const dayIdxs = Array.from({ length: DAYS }, (_, d) => d);
  const built = buildModel(ctx, dayIdxs, relax, ctx.budgetCap + relax.budgetUsd, null);
  const sol = await solveLinear(built.model, {
    prefer: opts.solver,
    timeLimitSec: opts.timeLimitSec ?? 4,
    mipRelGap: opts.mipRelGap ?? 0.01,
    mipAbsGap: 7,
  });
  if (sol.status === "infeasible" || sol.status === "error") return null;
  return {
    days: extractDays(ctx, built, sol).map((e) => e.day),
    objective: sol.objective,
    conflicts: elasticConflicts(built, sol),
    mode: "week",
    solver: sol.solver,
  };
}

async function solveDailyModel(
  ctx: Context,
  relax: Relax,
  opts: OptimizeOptions,
): Promise<SolvedWeek | null> {
  const repeat: RepeatState = { used: new Map(), yesterday: new Set() };
  // Five cents under the cap: seven day costs are each rounded to cents, and "$70.01 of your $70" reads as a
  // broken promise even though withinBudget tolerates a cent.
  const cap = Math.max(0, ctx.budgetCap + relax.budgetUsd - 0.05);
  let spent = 0;
  let objective = 0;
  const days: PlanDay[] = [];
  const conflicts = new Set<string>();
  let solver: LinearSolution["solver"] = "highs";

  for (let d = 0; d < DAYS; d++) {
    const dayBudget = Math.max(0, (cap - spent) / (DAYS - d));
    const built = buildModel(ctx, [d], relax, dayBudget, repeat);
    const dayLimit = Math.max(0.3, (opts.timeLimitSec ?? 4) / DAYS);
    let sol = await solveLinear(built.model, {
      prefer: opts.solver,
      timeLimitSec: dayLimit,
      mipRelGap: opts.mipRelGap ?? 0.01,
      mipAbsGap: 1,
    });
    // A time-limited incumbent that still breaks a hard rule gets one longer retry before we report a conflict.
    if (sol.status === "feasible" && elasticConflicts(built, sol).length > 0) {
      const retry = await solveLinear(built.model, {
        prefer: opts.solver,
        timeLimitSec: dayLimit * 3,
        mipRelGap: opts.mipRelGap ?? 0.01,
        mipAbsGap: 1,
      });
      if (retry.status === "optimal" || (retry.status === "feasible" && retry.objective < sol.objective))
        sol = retry;
    }
    if (sol.status === "infeasible" || sol.status === "error") return null;
    solver = sol.solver;
    objective += sol.objective;
    elasticConflicts(built, sol).forEach((c) => conflicts.add(c));
    const [{ day, candidateIds }] = extractDays(ctx, built, sol);
    days.push(day);
    spent += day.dayTotals.costUsd;
    repeat.yesterday = new Set(candidateIds);
    for (const cid of candidateIds) repeat.used.set(cid, (repeat.used.get(cid) ?? 0) + 1);
  }
  return { days, objective, conflicts: [...conflicts], mode: "daily", solver };
}

async function solve(
  ctx: Context,
  relax: Relax,
  opts: OptimizeOptions,
  forceMode?: "week" | "daily",
): Promise<SolvedWeek | null> {
  const mode = forceMode ?? opts.mode ?? "auto";
  if (mode === "daily") return solveDailyModel(ctx, relax, opts);
  if (mode === "week") return solveWeekModel(ctx, relax, opts);
  // Benchmarks (scripts/try-optimizer.ts): day by day reaches near-optimal feasible plans in 1-4 s, while the
  // single week MILP often hits the time limit in WebAssembly. Try daily first; use the week model as backup.
  const daily = await solveDailyModel(ctx, relax, opts);
  if (daily && daily.conflicts.length === 0) return daily;
  const week = await solveWeekModel(ctx, relax, opts);
  if (!week) return daily;
  if (!daily) return week;
  return week.conflicts.length < daily.conflicts.length ? week : daily;
}

// ---------------------------------------------------------------------------
// Verification (code re-checks every hard rule after the optimizer, spec section 9 step 6)
// ---------------------------------------------------------------------------

export function verifyPlan(days: PlanDay[], constraints: MedicalConstraints): string[] {
  const violations: string[] = [];
  const tol = 1; // display rounding tolerance (1 kcal / 1 mg)
  for (const day of days) {
    const t = day.dayTotals;
    if (t.calories < constraints.minCaloriesPerDay - tol)
      violations.push(`min_calories on ${day.date} (${t.calories} < ${constraints.minCaloriesPerDay})`);
    if (t.fiberG < constraints.minFiberG - 0.2)
      violations.push(`min_fiber on ${day.date} (${t.fiberG} < ${constraints.minFiberG})`);
    if (t.addedSugarG > constraints.maxAddedSugarG + 0.2)
      violations.push(`max_added_sugar on ${day.date} (${t.addedSugarG} > ${constraints.maxAddedSugarG})`);
    if (t.sodiumMg > constraints.maxSodiumMgPerDay + tol)
      violations.push(`max_sodium on ${day.date} (${t.sodiumMg} > ${constraints.maxSodiumMgPerDay})`);
    if (t.calories > 0 && (9 * t.satFatG) / t.calories > constraints.maxSatFatPct / 100 + 0.002)
      violations.push(`max_sat_fat on ${day.date}`);
    if (
      constraints.minPotassiumMgPerDay !== undefined &&
      t.potassiumMg < constraints.minPotassiumMgPerDay - tol
    )
      violations.push(
        `min_potassium on ${day.date} (${t.potassiumMg} < ${constraints.minPotassiumMgPerDay})`,
      );
    for (const meal of day.meals) {
      if (
        constraints.maxCarbsPerMealG !== undefined &&
        meal.totals.carbsG > constraints.maxCarbsPerMealG + 0.2
      )
        violations.push(`max_carbs_per_meal on ${day.date} ${meal.type}`);
      if (
        constraints.maxGlycemicLoadPerMeal !== undefined &&
        meal.totals.glycemicLoad > constraints.maxGlycemicLoadPerMeal + 0.2
      )
        violations.push(`max_glycemic_load_per_meal on ${day.date} ${meal.type}`);
    }
  }
  return violations;
}

function bindingConstraints(
  days: PlanDay[],
  constraints: MedicalConstraints,
  weeklyCost: number,
  budgetCap: number,
): string[] {
  const out = new Set<string>();
  if (weeklyCost >= 0.97 * budgetCap) out.add("weekly_budget");
  for (const day of days) {
    const t = day.dayTotals;
    if (t.sodiumMg >= 0.95 * constraints.maxSodiumMgPerDay) out.add("max_sodium");
    if (t.addedSugarG >= 0.95 * constraints.maxAddedSugarG) out.add("max_added_sugar");
    if (t.calories > 0 && (9 * t.satFatG) / t.calories >= 0.95 * (constraints.maxSatFatPct / 100))
      out.add("max_sat_fat");
    if (t.fiberG <= 1.03 * constraints.minFiberG) out.add("min_fiber");
    if (t.calories <= 1.02 * constraints.minCaloriesPerDay) out.add("min_calories");
    if (
      constraints.minPotassiumMgPerDay !== undefined &&
      t.potassiumMg <= 1.03 * constraints.minPotassiumMgPerDay
    )
      out.add("min_potassium");
    for (const m of day.meals) {
      if (
        constraints.maxCarbsPerMealG !== undefined &&
        m.totals.carbsG >= 0.95 * constraints.maxCarbsPerMealG
      )
        out.add("max_carbs_per_meal");
      if (
        constraints.maxGlycemicLoadPerMeal !== undefined &&
        m.totals.glycemicLoad >= 0.95 * constraints.maxGlycemicLoadPerMeal
      )
        out.add("max_glycemic_load_per_meal");
    }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Shadow prices
// ---------------------------------------------------------------------------

function mealCounts(days: PlanDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of days) for (const meal of d.meals) m.set(meal.name, (m.get(meal.name) ?? 0) + 1);
  return m;
}

function biggestGain(base: PlanDay[], relaxed: PlanDay[]): { name: string; extra: number } | null {
  const a = mealCounts(base);
  const b = mealCounts(relaxed);
  let best: { name: string; extra: number } | null = null;
  for (const [name, n] of b) {
    const extra = n - (a.get(name) ?? 0);
    if (extra > 0 && (!best || extra > best.extra)) best = { name, extra };
  }
  return best;
}

function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

type Gain = { name: string; extra: number } | null;

async function computeShadowPrices(
  ctx: Context,
  base: SolvedWeek,
  opts: OptimizeOptions,
): Promise<ShadowPrice[]> {
  const { constraints } = ctx.input;
  const relaxations: {
    constraint: string;
    relax: Partial<Relax>;
    delta: number;
    text: (g: Gain, value: number) => string;
  }[] = [
    {
      constraint: "weekly_budget",
      relax: { budgetUsd: 5 },
      delta: 5,
      text: (g, v) =>
        g
          ? `Raising your budget by $5 would let Chef add ${g.name.toLowerCase()} ${times(g.extra)}`
          : v > 0
            ? "Raising your budget by $5 would bring the plan a little closer to your targets"
            : "Your budget is not limiting the plan right now",
    },
    {
      constraint: "max_sodium",
      relax: { sodiumMg: 200 },
      delta: 200,
      text: (g) =>
        g
          ? `Your ${constraints.maxSodiumMgPerDay} mg sodium limit keeps ${g.name.toLowerCase()} off the plan. Doctor holds this line`
          : "Your sodium limit is not changing any meals this week",
    },
    {
      constraint: "calorie_target",
      relax: { calories: 100 },
      delta: 100,
      text: (g) =>
        g
          ? `100 more kcal a day would let Chef add ${g.name.toLowerCase()} ${times(g.extra)}`
          : "Your calorie target is not limiting meal choices",
    },
  ];
  if (constraints.maxCarbsPerMealG !== undefined) {
    relaxations.push({
      constraint: "max_carbs_per_meal",
      relax: { carbsPerMealG: 5 },
      delta: 5,
      text: (g) =>
        g
          ? `A carb cap 5 g looser would allow ${g.name.toLowerCase()}. Doctor keeps it at ${constraints.maxCarbsPerMealG} g per meal`
          : "Your per meal carb cap is not changing any meals this week",
    });
  }

  const shadowOpts: OptimizeOptions = { ...opts };
  const out: ShadowPrice[] = [];
  for (const r of relaxations) {
    const relaxed = await solve(ctx, { ...NO_RELAX, ...r.relax }, shadowOpts, base.mode);
    if (!relaxed) continue;
    const improvement = base.objective - relaxed.objective;
    // MILP gaps add noise: only claim a change when the objective improved by a meaningful amount.
    const meaningful = improvement > SHADOW_MIN_IMPROVEMENT;
    const value = meaningful ? Math.round((improvement / r.delta) * 1000) / 1000 : 0;
    out.push({
      constraint: r.constraint,
      value,
      humanText: r.text(meaningful ? biggestGain(base.days, relaxed.days) : null, value),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * OptimizeResult plus the solver's objective value (lower is better). The objective is math-internal: it
 * lets the budget curve compare plans across budgets. `Infinity` when no plan could be produced.
 */
export type DetailedOptimizeResult = OptimizeResult & { objective: number };

/** Solves on an already prepared context (see `prepareContext` / `withBudget`). */
export async function optimizePrepared(
  ctx: PreparedContext,
  opts: OptimizeOptions = {},
): Promise<DetailedOptimizeResult> {
  const started = Date.now();
  const { input } = ctx;

  const emptySlots = ctx.slots.filter((s) => (ctx.bySlot.get(s) ?? []).length === 0);
  if (emptySlots.length === ctx.slots.length) {
    return {
      feasible: false,
      withinBudget: false,
      days: [],
      weeklyCostUsd: 0,
      shadowPrices: [],
      bindingConstraints: [],
      conflicts: ["no_safe_candidates"],
      solveMs: Date.now() - started,
      objective: Infinity,
    };
  }

  const base = await solve(ctx, NO_RELAX, opts);
  // solveMs measures the main plan solve; shadow price re-solves are extra and reported separately by callers.
  const solveMs = Date.now() - started;
  if (!base) {
    return {
      feasible: false,
      withinBudget: false,
      days: [],
      weeklyCostUsd: 0,
      shadowPrices: [],
      bindingConstraints: [],
      conflicts: ["solver_failed"],
      solveMs,
      objective: Infinity,
    };
  }

  const weeklyCostUsd = Math.round(base.days.reduce((s, d) => s + d.dayTotals.costUsd, 0) * 100) / 100;
  const violations = verifyPlan(base.days, input.constraints);
  const conflicts = [
    ...new Set([
      ...base.conflicts,
      ...violations.map((v) => v.split(" ")[0]),
      ...emptySlots.map((s) => `no_candidates_${s}`),
    ]),
  ];
  const shadowPrices = opts.shadowPrices === false ? [] : await computeShadowPrices(ctx, base, opts);

  return {
    feasible: conflicts.length === 0,
    withinBudget: weeklyCostUsd <= ctx.budgetCap + 0.01,
    days: base.days,
    weeklyCostUsd,
    shadowPrices,
    bindingConstraints: bindingConstraints(base.days, input.constraints, weeklyCostUsd, ctx.budgetCap),
    conflicts,
    solveMs,
    objective: base.objective,
  };
}

/** Like `optimizePlan` but keeps the objective value. Used by the budget curve. */
export function optimizePlanDetailed(
  input: OptimizeInput,
  opts: OptimizeOptions = {},
): Promise<DetailedOptimizeResult> {
  return optimizePrepared(prepareContext(input), opts);
}

export async function optimizePlan(
  input: OptimizeInput,
  opts: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const { objective: _objective, ...result } = await optimizePlanDetailed(input, opts);
  return result;
}
