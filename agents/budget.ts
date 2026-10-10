// Budget agent: practical and funny about money. Owner: Agents.
// Code prices the pool and decides the swap; the LLM (live mode) only phrases the objection with the given figures.
import type { CandidateMeal, Concessions, Food } from "@/types/contracts";
import { BudgetReviewSchema } from "./schemas";
import { callObject, NoLlmError, onlyAllowedNumbers } from "./llm";
import { loadPrompt } from "./prompts";
import type { AgentContext } from "./context";
import { candidateItemsAt, candidateTotalsAt, money } from "./tools/math";

export const PROTEIN_TAGS = [
  "meat",
  "poultry",
  "beef",
  "pork",
  "fish",
  "shellfish",
  "legume",
  "egg",
  "dairy",
  "soy",
];

export interface BudgetReview {
  pool: CandidateMeal[];
  expensive: { food: Food; poolCostUsd: number } | null;
  swap: Food | null;
  objected: boolean;
}

function isProtein(f: Food): boolean {
  return f.tags.some((t) => PROTEIN_TAGS.includes(t)) && f.per100g.proteinG >= 7;
}

function shortName(f: Food): string {
  return f.name.split(",")[0];
}

/** Total cost each protein food contributes across the pool at mid servings (code, no LLM). */
export function proteinCosts(pool: CandidateMeal[], foods: Record<string, Food>): Map<string, number> {
  const cost = new Map<string, number>();
  for (const c of pool) {
    for (const item of candidateItemsAt(c, foods, "mid")) {
      const f = foods[item.foodId];
      if (!f || !isProtein(f)) continue;
      cost.set(f.foodId, (cost.get(f.foodId) ?? 0) + ((f.priceUsdPer100g ?? 0) * item.grams) / 100);
    }
  }
  return cost;
}

/** Finds a cheaper food with protein per 100 g within 10% of the expensive one, respecting exclusions and dislikes. */
export function findCheaperSwap(
  expensive: Food,
  foods: Record<string, Food>,
  excludedTags: string[],
  dislikes: string[],
): Food | null {
  const excluded = new Set(excludedTags.map((t) => t.toLowerCase()));
  const price = expensive.priceUsdPer100g ?? 0;
  const candidates = Object.values(foods).filter((f) => {
    if (f.foodId === expensive.foodId || !isProtein(f)) return false;
    if (f.tags.some((t) => excluded.has(t.toLowerCase()))) return false;
    if ((f.priceUsdPer100g ?? Infinity) >= price * 0.9) return false;
    const ratio = f.per100g.proteinG / Math.max(1, expensive.per100g.proteinG);
    if (ratio < 0.9 || ratio > 1.1) return false;
    const lower = f.name.toLowerCase();
    if (dislikes.some((d) => lower.includes(d.toLowerCase().split(" ")[0]))) return false;
    // Keep the swap within the same protein family where possible: a meat for a meat, a plant for a plant.
    const family = (x: Food) =>
      x.tags.some((t) => ["meat", "poultry", "beef", "pork", "fish", "shellfish"].includes(t))
        ? "animal"
        : "plant";
    return family(f) === family(expensive) || family(expensive) === "animal";
  });
  candidates.sort((a, b) => (a.priceUsdPer100g ?? 0) - (b.priceUsdPer100g ?? 0));
  return candidates[0] ?? null;
}

/** Adds cheaper variants of every candidate that uses the expensive food. Chef's originals are never removed. */
export function addSwapVariants(pool: CandidateMeal[], from: Food, to: Food): CandidateMeal[] {
  const variants: CandidateMeal[] = [];
  for (const c of pool) {
    if (
      !c.ingredients.some((i) => i.foodId === from.foodId) ||
      c.ingredients.some((i) => i.foodId === to.foodId)
    )
      continue;
    variants.push({
      ...c,
      candidateId: `${c.candidateId}__${to.foodId}`,
      name: `${c.name} (${shortName(to).toLowerCase()} version)`,
      ingredients: c.ingredients.map((i) => (i.foodId === from.foodId ? { ...i, foodId: to.foodId } : i)),
      tasteScore: Math.max(0.05, c.tasteScore - 0.05),
      pitch: `${c.pitch} Budget twist: ${shortName(to).toLowerCase()} instead of ${shortName(from).toLowerCase()}.`,
    });
  }
  return [...pool, ...variants];
}

/** Budget prices the pool, objects to the priciest protein and proposes a cheaper variant. */
export async function runBudget(ctx: AgentContext, pool: CandidateMeal[]): Promise<BudgetReview> {
  const { foods, profile, constraints, emit } = ctx;
  await emit("budget", "tool_call", "Pricing every candidate with computeTotals", {
    tool: "computeTotals",
    candidates: pool.length,
  });

  const costs = proteinCosts(pool, foods);
  let expensiveId: string | null = null;
  for (const [id, cost] of costs)
    if (expensiveId === null || cost > (costs.get(expensiveId) ?? 0)) expensiveId = id;
  if (!expensiveId) {
    const avg = pool.length
      ? pool.reduce((s, c) => s + candidateTotalsAt(c, foods, "mid").costUsd, 0) / pool.length
      : 0;
    await emit(
      "budget",
      "objection",
      `No protein to haggle over, but ${money(avg)} a meal on average is near the edge of $${profile.weeklyBudgetUsd}. Keep it lean.`,
      { avgMealCostUsd: Math.round(avg * 100) / 100 },
    );
    return { pool, expensive: null, swap: null, objected: true };
  }

  const expensive = foods[expensiveId];
  const poolCostUsd = Math.round((costs.get(expensiveId) ?? 0) * 100) / 100;
  const swap = findCheaperSwap(expensive, foods, constraints.excludedFoodTags, profile.dislikes);
  const budget = profile.weeklyBudgetUsd;

  let text = swap
    ? `${expensive.name} alone eats ${money(poolCostUsd)} of the $${budget} across the pool. Swap half of it for ${shortName(swap).toLowerCase()}?`
    : `${expensive.name} alone eats ${money(poolCostUsd)} of the $${budget} across the pool. Lovely, so is rent. Once a week?`;

  if (ctx.live) {
    try {
      const review = await callObject({
        agent: "budget",
        schema: BudgetReviewSchema,
        system: loadPrompt("budget"),
        prompt: [
          `Weekly budget: $${budget}.`,
          `Most expensive protein across the pool (code): ${expensive.name} (foodId ${expensive.foodId}), ${money(poolCostUsd)} at mid portions.`,
          swap
            ? `Cheaper swap found by code: ${swap.name} (foodId ${swap.foodId}), ${money(swap.priceUsdPer100g ?? 0)} per 100 g vs ${money(expensive.priceUsdPer100g ?? 0)}.`
            : "No cheaper swap with similar protein exists; ask to use it less often.",
          "Write the objection using only these figures.",
        ].join("\n"),
        runId: ctx.runId,
        temperature: 0.8,
      });
      const allowed = [
        budget,
        poolCostUsd,
        swap?.priceUsdPer100g ?? NaN,
        expensive.priceUsdPer100g ?? NaN,
        100,
      ].filter(Number.isFinite);
      if (review.objection && onlyAllowedNumbers(review.objection, allowed)) text = review.objection;
    } catch (err) {
      if (!(err instanceof NoLlmError))
        console.warn("[budget] llm phrasing skipped:", (err as Error).message);
    }
  }

  await emit("budget", "objection", text, {
    foodId: expensive.foodId,
    poolCostUsd,
    swapFoodId: swap?.foodId ?? null,
  });
  const nextPool = swap ? addSwapVariants(pool, expensive, swap) : pool;
  return { pool: nextPool, expensive: { food: expensive, poolCostUsd }, swap, objected: true };
}

/** Budget loosens its own belt: 5% then 10% slack. Never touches a Doctor rule. */
export async function budgetConcede(
  ctx: AgentContext,
  round: number,
  current: Concessions,
  overBy?: number,
): Promise<Concessions> {
  const slack: Concessions["budgetSlackPct"] = current.budgetSlackPct === 0 ? 5 : 10;
  const next: Concessions = { ...current, budgetSlackPct: slack };
  const over = overBy !== undefined && overBy > 0 ? `Still ${money(overBy)} over. ` : "";
  const text =
    slack === 5
      ? `${over}Okay, I can stretch the budget 5%. Beans are cheap, so is my patience.`
      : `${over}Last offer: 10% over budget, not a cent more. Rent is also a nutrient.`;
  await ctx.emit("budget", "concession", text, { concessions: next, round, overBy: overBy === undefined ? null : Math.round(overBy * 100) / 100 });
  return next;
}
