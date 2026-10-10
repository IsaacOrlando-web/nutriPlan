// Chef agent: passionate and playful. Owner: Agents.
// Live mode: the LLM proposes meals by ingredient names; code maps names to foods (allergies excluded in the search),
// prices nothing and never lets the model state a number. Scripted mode: scored meal templates.
import type { CandidateMeal, Concessions, MealType } from "@/types/contracts";
import { ChefProposalSchema } from "./schemas";
import { callObject, NoLlmError } from "./llm";
import { loadPrompt } from "./prompts";
import { profileSummary, slugify, type AgentContext } from "./context";
import { filterPool, SLOTS_BY_MEALS } from "./tools/math";
import { mapQueryToFood } from "./tools/backend";

type Template = Omit<CandidateMeal, "tasteScore">;

/** Deterministic taste score from likes and dislikes (same formula as scripts/generate-mocks.ts poolFor). */
export function scoreTemplate(t: Template, index: number, likes: string[], dislikes: string[]): number {
  const text = `${t.name} ${t.cuisine} ${t.ingredients.map((x) => x.foodId).join(" ")}`.toLowerCase();
  let score = 0.5 + ((index * 37) % 30) / 100;
  for (const like of likes) if (text.includes(like.toLowerCase().split(" ")[0])) score += 0.15;
  for (const dislike of dislikes) if (text.includes(dislike.toLowerCase().split(" ")[0])) score -= 0.4;
  return Math.min(1, Math.max(0.05, score));
}

export function templateToCandidate(
  t: Template,
  index: number,
  likes: string[],
  dislikes: string[],
): CandidateMeal {
  return {
    ...t,
    tasteScore: scoreTemplate(t, index, likes, dislikes),
    pitch: t.pitch || `${t.name}, ${t.cuisine} style, ready in ${t.prepMinutes} minutes.`,
  };
}

const QUOTA: Record<MealType, number> = { breakfast: 9, lunch: 12, dinner: 12, snack: 8 };
export const MIN_PER_TYPE = 4;

/** Every safe template scored for this person, best first (used for the scripted pool and for top ups). */
export async function scoredTemplates(ctx: AgentContext): Promise<CandidateMeal[]> {
  const templates = await ctx.store.getMealTemplates();
  const all = templates.map((t, i) => templateToCandidate(t, i, ctx.profile.likes, ctx.profile.dislikes));
  const { kept } = filterPool(all, ctx.foods, ctx.constraints.excludedFoodTags);
  return kept.sort((a, b) => b.tasteScore - a.tasteScore);
}

/** Picks a varied pool of about 32 meals (quota per slot) from the scored templates. */
export function pickScriptedPool(scored: CandidateMeal[], mealsPerDay: 3 | 4): CandidateMeal[] {
  const slots = SLOTS_BY_MEALS[mealsPerDay];
  const out: CandidateMeal[] = [];
  for (const slot of slots) out.push(...scored.filter((c) => c.type === slot).slice(0, QUOTA[slot]));
  return out;
}

/** Guarantees at least MIN_PER_TYPE candidates per slot by topping up from templates not already in the pool. */
export function topUpPool(
  pool: CandidateMeal[],
  scored: CandidateMeal[],
  mealsPerDay: 3 | 4,
  min = MIN_PER_TYPE,
): CandidateMeal[] {
  const ids = new Set(pool.map((c) => c.candidateId));
  const out = [...pool];
  for (const slot of SLOTS_BY_MEALS[mealsPerDay]) {
    let have = out.filter((c) => c.type === slot).length;
    for (const t of scored) {
      if (have >= min) break;
      if (t.type !== slot || ids.has(t.candidateId)) continue;
      out.push(t);
      ids.add(t.candidateId);
      have++;
    }
  }
  return out;
}

async function liveProposal(ctx: AgentContext): Promise<{ pool: CandidateMeal[]; message: string } | null> {
  const { profile, constraints, foods } = ctx;
  const excluded = constraints.excludedFoodTags;
  const available = Object.values(foods)
    .filter((f) => !f.tags.some((t) => excluded.includes(t)))
    .map((f) => f.name.split(",")[0].toLowerCase());
  const slots = SLOTS_BY_MEALS[profile.mealsPerDay];
  let proposal;
  try {
    proposal = await callObject({
      agent: "chef",
      schema: ChefProposalSchema,
      system: loadPrompt("chef"),
      prompt: [
        `Person: ${profileSummary(profile)}`,
        `Doctor summary (context only): ${constraints.summary}`,
        `Excluded food groups (never use): ${excluded.length ? excluded.join(", ") : "none"}`,
        `Meal types to cover: ${slots.join(", ")} (at least 5 ideas each, 24 to 36 total).`,
        `Ingredient names in the database: ${[...new Set(available)].join("; ")}`,
      ].join("\n"),
      runId: ctx.runId,
      temperature: 0.9,
    });
  } catch (err) {
    if (!(err instanceof NoLlmError)) console.warn("[chef] llm proposal failed:", (err as Error).message);
    return null;
  }

  const pool: CandidateMeal[] = [];
  const seen = new Set<string>();
  for (const [i, m] of proposal.meals.entries()) {
    if (!slots.includes(m.type)) continue;
    const ingredients: CandidateMeal["ingredients"] = [];
    for (const ing of m.ingredients) {
      const food = await mapQueryToFood(ctx.store, ing.query, excluded);
      if (!food || ingredients.some((x) => x.foodId === food.foodId)) continue;
      const max = Math.max(1, Math.min(4, ing.maxServings));
      ingredients.push({
        foodId: food.foodId,
        minServings: Math.min(max, Math.max(0, ing.minServings)),
        maxServings: max,
      });
    }
    if (!ingredients.some((x) => x.minServings > 0)) continue; // no required ingredient survived mapping
    let id = slugify(m.name) || `chef_meal_${i}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    pool.push({
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
  // Allergy and restriction filter in code, even though the search already excluded them.
  const { kept } = filterPool(pool, foods, excluded);
  return { pool: kept, message: proposal.message };
}

/** Chef proposes the candidate pool. */
export async function runChef(ctx: AgentContext): Promise<CandidateMeal[]> {
  const { profile, emit } = ctx;
  await emit("chef", "tool_call", "Searching the food database for ingredients", { tool: "searchFoods" });
  const scored = await scoredTemplates(ctx);

  let pool: CandidateMeal[] | null = null;
  let message: string | null = null;
  if (ctx.live) {
    const live = await liveProposal(ctx);
    if (live && live.pool.length >= 8) {
      pool = topUpPool(live.pool, scored, profile.mealsPerDay);
      message = live.message;
    }
  }
  if (!pool) pool = topUpPool(pickScriptedPool(scored, profile.mealsPerDay), scored, profile.mealsPerDay);

  const likes = profile.likes.slice(0, 3).join(", ") || "real variety";
  await emit(
    "chef",
    "proposal",
    message ?? `I have ${pool.length} ideas: ${likes} with real variety. Let me cook!`,
    { poolSize: pool.length, source: message ? "llm" : "templates" },
  );
  return pool;
}

/** Chef gives ground after an objection. Round 1 allows repeats of 3 and opens the full recipe book. */
export async function chefConcede(
  ctx: AgentContext,
  round: number,
  current: Concessions,
  detail?: string,
  data?: Record<string, unknown>,
): Promise<Concessions> {
  const next: Concessions = { ...current, maxRepeatsPerWeek: 3 };
  const text = detail
    ? `${detail} Fine: favorites may repeat three times this week and I open the full recipe book.`
    : round <= 1
      ? "Fine, favorites may repeat three times this week and I open the full recipe book. Flavor stays."
      : "Alright, I keep the swaps and let the optimizer pick. Chef's pride survives.";
  await ctx.emit("chef", "concession", text, { concessions: next, round, ...(data ?? {}) });
  return next;
}

/** Chef accepts the Budget swap: keeps the expensive protein once and leans on the cheaper one. */
export async function chefAcceptSwap(
  ctx: AgentContext,
  expensiveName: string,
  cheapName: string,
): Promise<void> {
  await ctx.emit(
    "chef",
    "concession",
    `Fine, I keep ${expensiveName.split(",")[0].toLowerCase()} once and lean on ${cheapName.split(",")[0].toLowerCase()} for the rest. Flavor stays.`,
  );
}

/** Chef replaces meals the Doctor removed with safe templates of the same meal types. */
export async function chefReplaceRemoved(
  ctx: AgentContext,
  pool: CandidateMeal[],
  removedTypes: MealType[],
  scored: CandidateMeal[],
): Promise<CandidateMeal[]> {
  const ids = new Set(pool.map((c) => c.candidateId));
  const out = [...pool];
  const added: string[] = [];
  for (const type of new Set(removedTypes)) {
    const safe = scored.filter((t) => t.type === type && !ids.has(t.candidateId));
    for (const t of safe.slice(0, 2)) {
      out.push(t);
      ids.add(t.candidateId);
      added.push(t.name);
    }
  }
  const topped = topUpPool(out, scored, ctx.profile.mealsPerDay);
  const first = added[0]?.toLowerCase();
  await ctx.emit(
    "chef",
    "concession",
    first
      ? `Removed. I swap in ${first} instead, lighter on the carbs and just as tasty.`
      : "Removed. The rest of the pool stands, and it is plenty.",
    { added: added.length },
  );
  return topped;
}
