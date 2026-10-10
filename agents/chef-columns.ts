// Chef column generation ("math guided AI", spec feature 6). Owner: Agents.
// The optimizer solves once on the scripted base pool; code turns the binding constraints and target gaps
// into a scarcity brief; the Chef answers the brief with a handful of new candidate meals ("columns"); the
// optimizer solves again on base + columns. Every number in the brief comes from the optimizer, the targets
// or the constraints. Scripted mode picks the templates that best match the brief so the story is the same.
import type {
  CandidateMeal,
  DailyTargets,
  Food,
  MealType,
  MedicalConstraints,
  OptimizeResult,
  UserProfile,
} from "@/types/contracts";
import { ChefColumnsSchema } from "./schemas/chef";
import { callObject, NoLlmError, onlyAllowedNumbers } from "./llm";
import { loadPrompt } from "./prompts";
import { profileSummary, slugify, type AgentContext } from "./context";
import { candidateTotalsAt, filterPool, money, SLOTS_BY_MEALS } from "./tools/math";
import { mapQueryToFood } from "./tools/backend";

export const DEFAULT_COLUMN_COUNT = 6;

export interface ScarcityBrief {
  count: number;
  feasible: boolean;
  weeklyBudgetUsd: number;
  weeklyCostUsd: number;
  bindingConstraints: string[];
  budgetBinding: boolean;
  proteinTargetG: number;
  proteinShortDays: number;
  /** Mean daily protein shortfall on the short days, grams. */
  proteinGapG: number;
  /** Worst day sodium as a percent of the daily cap. */
  sodiumSharePct: number;
  /** Average cost of the chosen meals per slot in the first solve. */
  costPerType: Partial<Record<MealType, number>>;
  /** How many new meals of each type the Chef should propose. */
  typeCounts: Partial<Record<MealType, number>>;
  maxMealCostUsd: number | null;
  minProteinG: number | null;
  maxSodiumMg: number | null;
  maxCarbsG: number | null;
  maxGlycemicLoad: number | null;
  minFiberG: number | null;
  minPotassiumMg: number | null;
  styles: string[];
  /** Names of the scarce resources, e.g. ["budget", "protein"]. */
  scarce: string[];
  /** Human fragments for the Chef, e.g. "high protein (at least 50 g)". */
  needs: string[];
  /** Orchestrator line, under 140 characters. */
  text: string;
}

export interface BriefArgs {
  result: OptimizeResult;
  targets: DailyTargets;
  constraints: MedicalConstraints;
  profile: UserProfile;
  count?: number;
  /** Size of the pool the first solve ran on (only for the headline). */
  poolSize?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function pad(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Protein deviation of a solved week: mean absolute distance from the daily target, grams (code only). */
export function proteinDeviation(result: OptimizeResult, targets: DailyTargets): number {
  if (!result.days.length) return targets.proteinG;
  const sum = result.days.reduce((s, d) => s + Math.abs(targets.proteinG - d.dayTotals.proteinG), 0);
  return Math.round(sum / result.days.length);
}

/** Builds the scarcity brief from the first solve. Pure code: every number is pasted from math. */
export function buildScarcityBrief(args: BriefArgs): ScarcityBrief {
  const { result, targets, constraints, profile } = args;
  const count = args.count ?? DEFAULT_COLUMN_COUNT;
  const slots = SLOTS_BY_MEALS[profile.mealsPerDay];
  const days = result.days;
  const feasible = result.feasible && days.length > 0;
  const binding = new Set(result.bindingConstraints);
  const budgetBinding = binding.has("weekly_budget") || (days.length > 0 && !result.withinBudget);

  let shortDays = 0;
  let gapSum = 0;
  const tolerance = Math.max(5, 0.05 * targets.proteinG);
  for (const d of days) {
    const gap = targets.proteinG - d.dayTotals.proteinG;
    if (gap > tolerance) {
      shortDays++;
      gapSum += gap;
    }
  }
  const proteinGapG = shortDays ? Math.round(gapSum / shortDays) : 0;
  const sodiumSharePct = days.length
    ? Math.round((Math.max(...days.map((d) => d.dayTotals.sodiumMg)) / constraints.maxSodiumMgPerDay) * 100)
    : 0;

  const costPerType: Partial<Record<MealType, number>> = {};
  for (const slot of slots) {
    const meals = days.flatMap((d) => d.meals.filter((m) => m.type === slot));
    if (meals.length)
      costPerType[slot] = round2(meals.reduce((s, m) => s + m.totals.costUsd, 0) / meals.length);
  }
  // Ask for the two slots where money goes (or the two main meals when nothing solved yet).
  const ranked = feasible
    ? [...slots].sort((a, b) => (costPerType[b] ?? 0) - (costPerType[a] ?? 0))
    : slots.filter((s) => s === "lunch" || s === "dinner");
  const chosenTypes = ranked.slice(0, 2);
  const typeCounts: Partial<Record<MealType, number>> = {};
  chosenTypes.forEach((t, i) => {
    typeCounts[t] = i === 0 ? Math.ceil(count / chosenTypes.length) : Math.floor(count / chosenTypes.length);
  });

  const perSlot = profile.weeklyBudgetUsd / (7 * profile.mealsPerDay);
  const proteinShort = shortDays > 0 || !feasible;
  const sodiumTight = binding.has("max_sodium") || sodiumSharePct >= 90;
  const nothingScarce =
    !budgetBinding &&
    !proteinShort &&
    !sodiumTight &&
    !binding.has("min_fiber") &&
    !binding.has("min_potassium");
  const maxMealCostUsd = budgetBinding || nothingScarce ? Math.round(perSlot * 0.9 * 20) / 20 : null;
  const minProteinG = proteinShort
    ? Math.round(((targets.proteinG / profile.mealsPerDay) * 1.1) / 5) * 5
    : null;
  const maxSodiumMg = sodiumTight
    ? Math.round(((constraints.maxSodiumMgPerDay / profile.mealsPerDay) * 0.8) / 50) * 50
    : null;
  const maxCarbsG = constraints.maxCarbsPerMealG ?? null;
  const maxGlycemicLoad = constraints.maxGlycemicLoadPerMeal ?? null;
  const minFiberG = binding.has("min_fiber")
    ? Math.round((constraints.minFiberG / profile.mealsPerDay) * 1.2)
    : null;
  const minPotassiumMg =
    binding.has("min_potassium") && constraints.minPotassiumMgPerDay !== undefined
      ? Math.round(((constraints.minPotassiumMgPerDay / profile.mealsPerDay) * 1.1) / 50) * 50
      : null;

  const scarce: string[] = [];
  if (budgetBinding) scarce.push("budget");
  if (proteinShort) scarce.push("protein");
  if (sodiumTight) scarce.push("sodium");
  if (minFiberG !== null) scarce.push("fiber");
  if (minPotassiumMg !== null) scarce.push("potassium");
  if (binding.has("max_carbs_per_meal")) scarce.push("carb cap");

  const needs: string[] = [];
  if (minProteinG !== null) needs.push(`high protein (at least ${minProteinG} g)`);
  if (maxSodiumMg !== null) needs.push(`low sodium (under ${maxSodiumMg} mg)`);
  if (maxMealCostUsd !== null) needs.push(`under ${money(maxMealCostUsd)}`);
  if (maxCarbsG !== null) needs.push(`under ${maxCarbsG} g carbs`);
  if (minFiberG !== null) needs.push(`at least ${minFiberG} g fiber`);
  if (minPotassiumMg !== null) needs.push(`at least ${minPotassiumMg} mg potassium`);
  if (needs.length === 0) needs.push("real variety");

  const facts: string[] = [];
  if (!feasible) facts.push("no feasible week yet");
  if (budgetBinding) facts.push(`budget binding at $${profile.weeklyBudgetUsd}`);
  if (shortDays > 0)
    facts.push(`protein ${proteinGapG} g under target on ${shortDays} ${shortDays === 1 ? "day" : "days"}`);
  if (sodiumTight) facts.push(`sodium at ${sodiumSharePct}% of the cap`);
  const headline = scarce.length
    ? `${pad(scarce)} ${scarce.length === 1 ? "is" : "are"} the scarce ${scarce.length === 1 ? "resource" : "resources"}`
    : "nothing binds, room for variety";
  // Under 140 characters by construction: drop the pool size, then the facts, before the clamp would cut.
  const tail = `Chef: ${count} new meals.`;
  const onPool = args.poolSize ? ` on ${args.poolSize} candidates` : "";
  const factText = facts.length ? ` (${facts.join("; ")})` : "";
  const text =
    [
      `First solve${onPool}: ${headline}${factText}. ${tail}`,
      `First solve: ${headline}${factText}. ${tail}`,
      `First solve: ${headline}. ${tail}`,
    ].find((s) => s.length <= 140) ?? `First solve: ${headline}. ${tail}`;

  return {
    count,
    feasible,
    weeklyBudgetUsd: profile.weeklyBudgetUsd,
    weeklyCostUsd: result.weeklyCostUsd,
    bindingConstraints: result.bindingConstraints,
    budgetBinding,
    proteinTargetG: targets.proteinG,
    proteinShortDays: shortDays,
    proteinGapG,
    sodiumSharePct,
    costPerType,
    typeCounts,
    maxMealCostUsd,
    minProteinG,
    maxSodiumMg,
    maxCarbsG,
    maxGlycemicLoad,
    minFiberG,
    minPotassiumMg,
    styles: profile.likes.slice(0, 3),
    scarce,
    needs,
    text,
  };
}

/** Numbers the Chef is allowed to echo back (everything in the brief). */
export function briefNumbers(brief: ScarcityBrief): number[] {
  return [
    brief.count,
    brief.weeklyBudgetUsd,
    brief.weeklyCostUsd,
    brief.proteinGapG,
    brief.proteinShortDays,
    brief.sodiumSharePct,
    brief.maxMealCostUsd,
    brief.minProteinG,
    brief.maxSodiumMg,
    brief.maxCarbsG,
    brief.maxGlycemicLoad,
    brief.minFiberG,
    brief.minPotassiumMg,
    ...Object.values(brief.typeCounts),
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
}

/** One line the Chef says when the brief arrives (scripted). */
export function chefBriefLine(brief: ScarcityBrief, names: string[]): string {
  const adjectives = [
    brief.minProteinG !== null ? "high-protein" : "",
    brief.maxSodiumMg !== null ? "low-sodium" : "",
    brief.maxCarbsG !== null ? "low-carb" : "",
  ].filter(Boolean);
  const under = brief.maxMealCostUsd !== null ? ` under ${money(brief.maxMealCostUsd)}` : "";
  const head = `Brief received: ${names.length} ${adjectives.join(", ")} meals${under}.`;
  // Name two dishes when they fit in 140 characters, otherwise one, otherwise none.
  const lower = names.map((n) => n.toLowerCase());
  return (
    [
      `${head} Here they come: ${lower.slice(0, 2).join(" and ")}.`,
      `${head} First up: ${lower[0]}.`,
      `${head} Here they come.`,
    ].find((s) => s.length <= 140) ?? head
  );
}

/** Score how well a candidate answers the brief (mid portions). Negative means the Doctor would remove it. */
export function columnScore(c: CandidateMeal, brief: ScarcityBrief, foods: Record<string, Food>): number {
  if (c.ingredients.some((i) => !foods[i.foodId])) return -1;
  const t = candidateTotalsAt(c, foods, "mid");
  if (brief.maxCarbsG !== null && candidateTotalsAt(c, foods, "min").carbsG > brief.maxCarbsG) return -1;
  if (
    brief.maxGlycemicLoad !== null &&
    candidateTotalsAt(c, foods, "min").glycemicLoad > brief.maxGlycemicLoad
  )
    return -1;
  let s = c.tasteScore;
  if (brief.minProteinG !== null) s += t.proteinG >= brief.minProteinG ? 2 : t.proteinG / brief.minProteinG;
  if (brief.maxMealCostUsd !== null)
    s +=
      t.costUsd <= brief.maxMealCostUsd
        ? 2
        : Math.max(0, 1 - (t.costUsd - brief.maxMealCostUsd) / brief.maxMealCostUsd);
  if (brief.maxSodiumMg !== null) s += t.sodiumMg <= brief.maxSodiumMg ? 1 : 0;
  if (brief.minFiberG !== null) s += t.fiberG >= brief.minFiberG ? 1 : 0;
  if (brief.minPotassiumMg !== null) s += t.potassiumMg >= brief.minPotassiumMg ? 1 : 0;
  return s;
}

/** Scripted column generation: the templates outside the pool that best match the brief, per requested type. */
export function pickScriptedColumns(
  brief: ScarcityBrief,
  scored: CandidateMeal[],
  pool: CandidateMeal[],
  foods: Record<string, Food>,
): CandidateMeal[] {
  const inPool = new Set(pool.map((c) => c.candidateId));
  const candidates = [
    ...scored.filter((c) => !inPool.has(c.candidateId)),
    ...boostedVariants(pool, brief, foods),
  ];
  const out: CandidateMeal[] = [];
  for (const [type, n] of Object.entries(brief.typeCounts) as [MealType, number][]) {
    const ranked = candidates
      .filter((c) => c.type === type)
      .map((c) => ({ c, s: columnScore(c, brief, foods) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, n);
    out.push(...ranked.map((x) => x.c));
  }
  return out;
}

/**
 * New columns derived from the pool when protein is scarce: the same favorite meal with one more portion of
 * its main protein allowed, so the solver can buy protein where taste is already high. Code only.
 */
export function boostedVariants(
  pool: CandidateMeal[],
  brief: ScarcityBrief,
  foods: Record<string, Food>,
): CandidateMeal[] {
  if (brief.minProteinG === null) return [];
  const out: CandidateMeal[] = [];
  for (const c of pool) {
    if (!brief.typeCounts[c.type] || c.candidateId.includes("__")) continue;
    let best = -1;
    let bestProtein = 0;
    c.ingredients.forEach((ing, i) => {
      const f = foods[ing.foodId];
      if (!f || ing.maxServings >= 4) return;
      const proteinPerServing = (f.per100g.proteinG * f.servingG) / 100;
      if (proteinPerServing > bestProtein) {
        bestProtein = proteinPerServing;
        best = i;
      }
    });
    if (best < 0 || bestProtein < 10) continue;
    const f = foods[c.ingredients[best].foodId];
    out.push({
      ...c,
      candidateId: `${c.candidateId}__xp`,
      name: `${c.name}, extra ${f.name.split(",")[0].toLowerCase()}`,
      ingredients: c.ingredients.map((ing, i) =>
        i === best
          ? {
              ...ing,
              minServings: Math.min(4, ing.minServings + 1),
              maxServings: Math.min(4, ing.maxServings + 1),
            }
          : ing,
      ),
      tasteScore: Math.max(0.05, c.tasteScore - 0.02),
      pitch: `${c.pitch} Protein-forward version for the second solve.`,
    });
  }
  return out;
}

const MAX_FOOD_NAMES = 60;

/** Food names the Chef may use, ordered by usefulness for the brief, at most 60. */
export function allowedFoodNames(
  foods: Record<string, Food>,
  excluded: string[],
  brief: ScarcityBrief,
): string[] {
  const safe = Object.values(foods).filter((f) => !f.tags.some((t) => excluded.includes(t)));
  const price = (f: Food) => f.priceUsdPer100g ?? 1;
  const usefulness = (f: Food) => {
    let u = 0;
    if (brief.minProteinG !== null) u += f.per100g.proteinG / 10;
    if (brief.maxMealCostUsd !== null) u += f.per100g.proteinG / Math.max(0.05, price(f)) / 20 - price(f);
    if (brief.maxSodiumMg !== null) u -= f.per100g.sodiumMg / 200;
    if (brief.minFiberG !== null) u += f.per100g.fiberG / 3;
    if (brief.minPotassiumMg !== null) u += f.per100g.potassiumMg / 300;
    if (brief.maxCarbsG !== null) u -= f.per100g.carbsG / 30;
    return u;
  };
  const names = safe
    .sort((a, b) => usefulness(b) - usefulness(a))
    .slice(0, MAX_FOOD_NAMES)
    .map((f) => f.name.split(",")[0].toLowerCase());
  return [...new Set(names)];
}

export interface ColumnResult {
  columns: CandidateMeal[];
  message: string | null;
  source: "llm" | "templates";
}

/** Live column generation: a small Chef call answering the brief, mapped to real foods by code. */
export async function liveColumns(
  ctx: AgentContext,
  brief: ScarcityBrief,
  pool: CandidateMeal[],
): Promise<ColumnResult | null> {
  const { profile, constraints, foods } = ctx;
  const excluded = constraints.excludedFoodTags;
  const wanted = (Object.entries(brief.typeCounts) as [MealType, number][])
    .map(([t, n]) => `${t} x${n}`)
    .join(", ");
  const taken = pool
    .filter((c) => brief.typeCounts[c.type])
    .slice(0, 12)
    .map((c) => c.name);
  let proposal;
  try {
    proposal = await callObject({
      agent: "chef",
      schema: ChefColumnsSchema,
      system: loadPrompt("chef_columns"),
      prompt: [
        `Person: ${profileSummary(profile)}`,
        `Doctor rules (code enforces them): ${constraints.summary}`,
        `Excluded food groups (never use): ${excluded.length ? excluded.join(", ") : "none"}`,
        `Optimizer brief (computed by code): ${brief.text}`,
        `Need exactly ${brief.count} meals: ${wanted}. Every meal must be ${brief.needs.join(", ")}.`,
        brief.maxCarbsG !== null
          ? "Per meal carb cap is checked at the smallest portion: starches (rice, tortilla, bread, pasta, potato, quinoa, oats) at most one portion with minServings 0 or 1; build on beans, vegetables, eggs, fish and poultry."
          : "",
        brief.styles.length ? `Styles this person likes: ${brief.styles.join(", ")}.` : "",
        taken.length ? `Already in the pool, do not repeat: ${taken.join("; ")}.` : "",
        `Allowed ingredient names (use these exact words): ${allowedFoodNames(foods, excluded, brief).join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
      runId: ctx.runId,
      temperature: 0.8,
    });
  } catch (err) {
    if (!(err instanceof NoLlmError)) console.warn("[chef] column call failed:", (err as Error).message);
    return null;
  }

  const slots = SLOTS_BY_MEALS[profile.mealsPerDay];
  const seen = new Set(pool.map((c) => c.candidateId));
  const columns: CandidateMeal[] = [];
  // One food lookup per distinct query, all in parallel (each is a store round trip on Supabase).
  const queries = [
    ...new Set(proposal.meals.flatMap((m) => m.ingredients.map((ing) => ing.query.trim().toLowerCase()))),
  ];
  const found = await Promise.all(queries.map((q) => mapQueryToFood(ctx.store, q, excluded)));
  const foodFor = new Map(queries.map((q, i) => [q, found[i]]));
  for (const [i, m] of proposal.meals.entries()) {
    if (!slots.includes(m.type)) continue;
    const ingredients: CandidateMeal["ingredients"] = [];
    for (const ing of m.ingredients) {
      const food = foodFor.get(ing.query.trim().toLowerCase()) ?? null;
      if (!food || ingredients.some((x) => x.foodId === food.foodId)) continue;
      const max = Math.max(1, Math.min(4, ing.maxServings));
      ingredients.push({
        foodId: food.foodId,
        minServings: Math.min(max, Math.max(0, ing.minServings)),
        maxServings: max,
      });
    }
    if (ingredients.length < 2 || !ingredients.some((x) => x.minServings > 0)) continue;
    let id = `col_${slugify(m.name) || `chef_${i}`}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    columns.push({
      candidateId: id,
      type: m.type,
      name: m.name,
      cuisine: m.cuisine,
      recipeSteps: m.recipeSteps,
      prepMinutes: m.prepMinutes,
      ingredients,
      tasteScore: m.tasteScore,
      pitch: m.pitch,
    });
  }
  const { kept } = filterPool(columns, foods, excluded);
  if (kept.length === 0) return null;
  const message = onlyAllowedNumbers(proposal.message, briefNumbers(brief)) ? proposal.message : null;
  return { columns: kept, message, source: "llm" };
}

/** Chef answers the brief: live LLM columns when available, otherwise the best matching templates. Never throws. */
export async function runChefColumns(
  ctx: AgentContext,
  brief: ScarcityBrief,
  pool: CandidateMeal[],
  scored: CandidateMeal[],
): Promise<ColumnResult> {
  let result: ColumnResult | null = null;
  if (ctx.live) result = await liveColumns(ctx, brief, pool);
  if (!result) {
    const columns = pickScriptedColumns(brief, scored, pool, ctx.foods);
    result = { columns, message: null, source: "templates" };
  }
  const names = result.columns.map((c) => c.name);
  await ctx.emit(
    "chef",
    "proposal",
    names.length
      ? (result.message ?? chefBriefLine(brief, names))
      : "Brief received, but my pantry has nothing new that fits. The pool stands.",
    {
      brief: { needs: brief.needs, typeCounts: brief.typeCounts },
      columns: names,
      source: result.source,
      count: names.length,
    },
  );
  return result;
}
