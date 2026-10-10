// Orchestrator: plain code that runs the negotiation protocol (spec section 9). Owner: Agents.
// Agents decide, argue and explain; math calculates. Doctor hard constraints are never relaxed here.
import fs from "node:fs";
import path from "node:path";
import type {
  AgentEvent,
  AgentRun,
  AgentRunTrigger,
  CandidateMeal,
  Concessions,
  MealPlan,
  MealType,
  OptimizeInput,
  OptimizeResult,
  PlanDay,
  ShadowPrice,
  UserProfile,
} from "@/types/contracts";
import { getStore } from "@/lib/db";
import { newId } from "@/lib/db/store";
import type { Store } from "@/lib/db/store";
import { DEMO_USER_IDS, type DemoUserKey } from "@/lib/db/seed/demo-users";
import { warmBudgetCurve } from "@/lib/plan/curve-input";
import { llmAvailable } from "./llm";
import type { AgentContext } from "./context";
import { emitEvent, emitterFor, eventDelayMs } from "./tools/events";
import { loadFoodsMap, loadUserBundle, nextPlanVersion, todayIso } from "./tools/backend";
import { buildGroceryList, money, optimizePlan, verifyPlan, type OptimizeOptions } from "./tools/math";
import { runDoctor, doctorReviewPool, reviewPool } from "./doctor";
import { runChef, chefConcede, chefAcceptSwap, chefReplaceRemoved, scoredTemplates } from "./chef";
import { buildScarcityBrief, proteinDeviation, runChefColumns } from "./chef-columns";
import { runBudget, budgetConcede } from "./budget";

export interface PlanRunArgs {
  userId: string;
  runId: string;
  trigger: AgentRunTrigger;
  reason?: string | null;
  weeklyBudgetUsd?: number;
  /** Optimizer options (tests and evals pass { shadowPrices: false, timeLimitSec: 2 }). */
  optimize?: OptimizeOptions;
  store?: Store;
}

export interface PlanRunOutcome {
  plan: MealPlan | null;
  events: AgentEvent[];
  status: "done" | "failed";
  fallback: boolean;
}

export const MAX_ROUNDS = 3;

/**
 * Shadow prices run only inside the second solve (after Chef's columns), day by day with a short time limit,
 * and only when the first solve on the same size of pool was quick enough that the extra re-solves fit the
 * run's time budget. Otherwise Budget speaks from the binding constraints instead.
 */
export const SHADOW_SOLVE_MAX_MS = 3_500;
export const SHADOW_ELAPSED_BUDGET_MS = 14_000;
export const SHADOW_SOLVE_OPTS: OptimizeOptions = { mode: "daily", timeLimitSec: 1, mipRelGap: 0.05 };
/** The first solve only has to reveal what is scarce; a short time limit keeps it near 2 s. */
export const FIRST_SOLVE_TIME_SEC = 2;
/** The second solve (base pool + Chef's columns) is the plan: a little more time, still bounded. */
export const SECOND_SOLVE_TIME_SEC = 3;
/** Deferred shadow pricing waits this long after the decision so the plan page loads before the solver runs. */
export const DEFERRED_SHADOW_DELAY_MS = 1_500;
/** Curve warm up starts this long after a run completes, after the deferred shadow prices have had their turn. */
export const CURVE_WARM_DELAY_MS = 4_000;

/** AGENTS_SHADOW_MAX_MS overrides the gate (0 disables shadow prices, a large value forces them). */
function shadowSolveMaxMs(): number {
  const n = Number(process.env.AGENTS_SHADOW_MAX_MS);
  return Number.isFinite(n) && n >= 0 ? n : SHADOW_SOLVE_MAX_MS;
}

/** How many of the Chef's new columns the solver actually scheduled (by candidateId in the mealId suffix). */
export function usedColumns(days: PlanDay[], columns: CandidateMeal[]): number {
  const ids = columns.map((c) => c.candidateId);
  const used = new Set<string>();
  for (const d of days)
    for (const m of d.meals) {
      const hit = ids.find((id) => m.mealId.endsWith(`_${id}`));
      if (hit) used.add(hit);
    }
  return used.size;
}

const TRIGGER_TEXT: Record<AgentRunTrigger, string> = {
  onboarding: "Onboarding plan",
  budget_change: "Budget changed",
  monitor: "Monitor asked for a new week",
  coach: "Coach asked for changes",
  manual: "New week requested",
};

function optimizeOptions(override?: OptimizeOptions): OptimizeOptions {
  const env: OptimizeOptions = {};
  if (process.env.AGENTS_SHADOW_PRICES === "false") env.shadowPrices = false;
  const t = Number(process.env.AGENTS_OPT_TIME_SEC);
  if (Number.isFinite(t) && t > 0) env.timeLimitSec = t;
  return { ...env, ...override };
}

/** Per meal explanations from the three agents, numbers pasted from math (same shape as scripts/generate-mocks explain()). */
export function explainPlan(plan: MealPlan, profile: UserProfile, result: OptimizeResult): void {
  const budgetSp = result.shadowPrices.find((s) => s.constraint === "weekly_budget");
  const diabetic = profile.conditions.includes("type2_diabetes");
  for (const d of plan.days) {
    const daySodium = d.dayTotals.sodiumMg || plan.days[0].dayTotals.sodiumMg || 1;
    for (const m of d.meals) {
      const sodiumShare = Math.round((m.totals.sodiumMg / daySodium) * 100);
      m.explanation = [
        {
          agent: "chef",
          text: `${m.name}: ${m.cuisine} flavors you said you like, ${m.prepMinutes} minutes of prep.`,
        },
        {
          agent: "doctor",
          text: diabetic
            ? `${m.totals.carbsG} g carbs and glycemic load ${m.totals.glycemicLoad}: inside the per meal caps.`
            : profile.goal === "lose"
              ? `${m.totals.proteinG} g protein and ${m.totals.fiberG} g fiber keep you full while losing fat safely.`
              : `${m.totals.proteinG} g protein and ${m.totals.fiberG} g fiber, ${m.totals.sodiumMg} mg sodium: inside every rule.`,
        },
        {
          agent: "budget",
          text: `${money(m.totals.costUsd)} for this meal, ${sodiumShare}% of today's sodium. ${budgetSp?.humanText ?? ""}`.trim(),
        },
      ];
    }
  }
}

function demoKeyFor(userId: string): DemoUserKey | null {
  for (const key of Object.keys(DEMO_USER_IDS) as DemoUserKey[])
    if (DEMO_USER_IDS[key] === userId) return key;
  return null;
}

function fallbackEnabled(): boolean {
  return (process.env.AGENTS_FALLBACK ?? "true") !== "false";
}

interface FallbackFile {
  run: AgentRun;
  events: AgentEvent[];
  plan: MealPlan;
}

function loadFallback(key: DemoUserKey): FallbackFile | null {
  const candidates = [
    path.join(process.cwd(), "agents", "fallbacks", `${key}-plan-run.json`),
    ...(typeof __dirname !== "undefined" ? [path.join(__dirname, "fallbacks", `${key}-plan-run.json`)] : []),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as FallbackFile;
    } catch {
      // try next
    }
  }
  return null;
}

/** Replays the saved negotiation for a demo user so the demo never dies. Saves the saved plan as a new version. */
async function replayFallback(
  store: Store,
  userId: string,
  runId: string,
  key: DemoUserKey,
): Promise<MealPlan | null> {
  const fb = loadFallback(key);
  if (!fb) return null;
  const version = await nextPlanVersion(store, userId);
  const plan: MealPlan = {
    ...fb.plan,
    planId: newId(),
    userId,
    runId,
    version,
    reason: `${fb.plan.reason} (replayed)`,
  };
  for (const e of fb.events) {
    const data = e.kind === "decision" ? { ...(e.data ?? {}), planId: plan.planId, replayed: true } : e.data;
    if (e.kind === "decision") await store.savePlan(plan);
    await emitEvent(store, runId, e.agent, e.kind, e.text, data);
  }
  return plan;
}

function safeReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/[\r\n]+/g, " ").slice(0, 90);
}

/**
 * Runs the whole negotiation for one AgentRun. Resolves when the run is done or failed; never throws.
 */
export async function runPlanNegotiation(args: PlanRunArgs): Promise<PlanRunOutcome> {
  const store = args.store ?? getStore();
  const { userId, runId, trigger } = args;
  const emit = emitterFor(store, runId);
  const reasonText = args.reason?.trim() || TRIGGER_TEXT[trigger];
  const runStartedAt = Date.now();

  try {
    if (args.weeklyBudgetUsd !== undefined) {
      const p = await store.getProfile(userId);
      if (p && p.weeklyBudgetUsd !== args.weeklyBudgetUsd)
        await store.saveProfile({ ...p, weeklyBudgetUsd: args.weeklyBudgetUsd });
    }
    const bundle = await loadUserBundle(store, userId);
    const foods = await loadFoodsMap(store);
    const live = llmAvailable("orchestrator") || llmAvailable("chef");
    const ctx: AgentContext = {
      store,
      runId,
      profile: bundle.profile,
      constraints: bundle.constraints,
      targets: bundle.targets,
      foods,
      emit,
      live,
    };
    const { profile } = ctx;

    // 1. Opening
    await emit(
      "orchestrator",
      "proposal",
      `New plan for ${profile.name}: ${profile.goal} goal, $${profile.weeklyBudgetUsd}/week, ${profile.mealsPerDay} meals a day. Doctor first.`,
      { trigger, reason: reasonText },
    );

    // 2. Doctor (deterministic constraints; saved so the profile bundle matches what was negotiated)
    const constraints = await runDoctor(ctx);
    ctx.constraints = constraints;
    await store.saveConstraints(userId, constraints);

    // 3. Chef pool
    let pool = await runChef(ctx);
    const scored = await scoredTemplates(ctx);

    // 4. Budget objection -> Chef concession (always one of each)
    const budgetReview = await runBudget(ctx, pool);
    pool = budgetReview.pool;
    if (budgetReview.expensive) {
      await chefAcceptSwap(
        ctx,
        budgetReview.expensive.food.name,
        budgetReview.swap?.name ?? "beans and eggs",
      );
    } else {
      await emit("chef", "concession", "Fair. I keep the pricey touches as garnish, not as the main act.");
    }

    // 5. Doctor pool review -> Chef replaces what was removed
    const review = await doctorReviewPool(ctx, pool);
    pool = review.kept;
    if (review.removed.length > 0) {
      pool = await chefReplaceRemoved(
        ctx,
        pool,
        review.removed.map((r) => r.type as MealType),
        scored,
      );
    }

    // 6. Optimizer with concession rounds (Chef repeats 3, Budget 5%, Budget 10%)
    let concessions: Concessions = { maxRepeatsPerWeek: 2, budgetSlackPct: 0 };
    const startDate = todayIso();
    const baseInput: OptimizeInput = {
      pool,
      foods,
      targets: ctx.targets,
      constraints,
      weeklyBudgetUsd: profile.weeklyBudgetUsd,
      concessions,
      startDate,
      mealsPerDay: profile.mealsPerDay,
    };
    const opts = optimizeOptions(args.optimize);
    const timing: Record<string, number> = {};

    // 6a. First solve on the base pool, no shadow prices: fast, and it tells us what is scarce.
    let t = Date.now();
    const first = await optimizePlan(baseInput, {
      ...opts,
      shadowPrices: false,
      timeLimitSec: opts.timeLimitSec ?? FIRST_SOLVE_TIME_SEC,
    });
    timing.firstSolveMs = Date.now() - t;
    let result = first;
    const brief = buildScarcityBrief({
      result: first,
      targets: ctx.targets,
      constraints,
      profile,
      poolSize: pool.length,
    });
    await emit("orchestrator", "tool_call", brief.text, {
      tool: "optimizePlan",
      solve: 1,
      poolSize: pool.length,
      solveMs: first.solveMs,
      brief,
    });

    // 6b. Column generation: Chef answers the brief with new candidates, Doctor checks them in code, solve again.
    let shadowPrices: ShadowPrice[] = [];
    let shadowLater: OptimizeInput | null = null;
    let summaryEmitted = false;
    t = Date.now();
    const columns = await runChefColumns(ctx, brief, pool, scored);
    timing.chefColumnsMs = Date.now() - t;
    if (columns.columns.length > 0) {
      const check = reviewPool(columns.columns, constraints, foods);
      if (check.removed.length > 0) {
        const n = check.removed.length;
        await emit(
          "doctor",
          "objection",
          `${n} of Chef's new ${n === 1 ? "idea breaks" : "ideas break"} a cap even at the smallest portion (${check.removed[0].why}). Out.`,
          { tool: "reviewPool", removed: n, candidateIds: check.removed.map((r) => r.candidateId) },
        );
      }
      if (check.kept.length > 0) {
        pool = [...pool, ...check.kept];
        timing.elapsedBeforeSecondSolveMs = Date.now() - runStartedAt;
        t = Date.now();
        const second = await optimizePlan(
          { ...baseInput, pool },
          { ...opts, shadowPrices: false, timeLimitSec: opts.timeLimitSec ?? SECOND_SOLVE_TIME_SEC },
        );
        timing.secondSolveMs = Date.now() - t;
        const keep = second.feasible && (second.withinBudget || !first.withinBudget || !first.feasible);
        if (keep) result = second;
        // Shadow prices are explanatory, not the plan: they run on the critical path only when the second solve
        // was very quick and the run is on time (measured: 8 to 9 s for 3 to 4 relaxations, too slow for the
        // room). Otherwise Budget speaks from the binding constraints now and the prices are computed after the
        // decision and written into the saved plan for the Why sheet.
        timing.shadowPricesMs = 0;
        if (keep && opts.shadowPrices !== false) {
          const wantNow =
            second.solveMs <= shadowSolveMaxMs() && Date.now() - runStartedAt <= SHADOW_ELAPSED_BUDGET_MS;
          if (wantNow) {
            t = Date.now();
            const priced = await optimizePlan(
              { ...baseInput, pool },
              { ...opts, ...SHADOW_SOLVE_OPTS, shadowPrices: true },
            );
            timing.shadowPricesMs = Date.now() - t;
            shadowPrices = priced.shadowPrices;
          } else {
            shadowLater = { ...baseInput, pool };
          }
        }
        const used = usedColumns(second.days, check.kept);
        const before = proteinDeviation(first, ctx.targets);
        const after = proteinDeviation(second, ctx.targets);
        const change = !first.feasible
          ? `a feasible week appeared`
          : !first.withinBudget && second.withinBudget
            ? `weekly cost went from ${money(first.weeklyCostUsd)} to ${money(second.weeklyCostUsd)}, inside the $${profile.weeklyBudgetUsd}`
            : before !== after
              ? `protein deviation went from ${before} g to ${after} g`
              : `weekly cost went from ${money(first.weeklyCostUsd)} to ${money(second.weeklyCostUsd)}`;
        await emit(
          "orchestrator",
          "proposal",
          keep
            ? `Second solve used ${used} of Chef's ${check.kept.length} new meals; ${change}. Solved in ${(second.solveMs / 1000).toFixed(1)} s.`
            : `Second solve did not beat the first plan (${second.conflicts[0] ?? "over budget"}); keeping the first solve.`,
          {
            solve: 2,
            usedColumns: used,
            offeredColumns: check.kept.length,
            kept: keep,
            proteinDeviationBeforeG: before,
            proteinDeviationAfterG: after,
            weeklyCostBeforeUsd: first.weeklyCostUsd,
            weeklyCostAfterUsd: second.weeklyCostUsd,
            solveMs: second.solveMs,
            solveSec: Number((second.solveMs / 1000).toFixed(1)),
            shadowPricesMs: timing.shadowPricesMs,
          },
        );
        summaryEmitted = true;
      }
    }

    // 6c. Concession rounds (Chef repeats 3, Budget 5%, Budget 10%) when still infeasible or over budget.
    let round = 0;
    let concededAny = false;
    while ((!result.feasible || !result.withinBudget) && round < MAX_ROUNDS) {
      round++;
      concededAny = true;
      const overBy = Math.max(0, result.weeklyCostUsd - profile.weeklyBudgetUsd);
      const problem = !result.feasible
        ? `Rules collide (${result.conflicts.slice(0, 2).join(", ")}).`
        : `Week costs ${money(result.weeklyCostUsd)}, ${money(overBy)} over.`;
      if (round === 1) {
        concessions = await chefConcede(ctx, round, concessions, problem, {
          weeklyCostUsd: result.weeklyCostUsd,
          overBy: Math.round(overBy * 100) / 100,
          conflicts: result.conflicts,
        });
        pool = [...pool, ...scored.filter((t) => !pool.some((c) => c.candidateId === t.candidateId))];
        pool = reviewSafe(
          pool,
          review.removed.map((r) => r.candidateId),
        );
      } else {
        concessions = await budgetConcede(ctx, round - 1, concessions, overBy);
      }
      t = Date.now();
      result = await optimizePlan({ ...baseInput, pool, concessions }, { ...opts, shadowPrices: false });
      timing[`round${round}SolveMs`] = Date.now() - t;
    }
    if (shadowLater) {
      if (round > 0) shadowLater = { ...baseInput, pool, concessions };
      timing.shadowPricesDeferred = 1;
    }
    if (round > 0 || !summaryEmitted)
      await emit(
        "orchestrator",
        "proposal",
        `Optimizer solved in ${(result.solveMs / 1000).toFixed(1)} s. Weekly cost ${money(result.weeklyCostUsd)}${round ? ` after ${round} ${round === 1 ? "round" : "rounds"}` : ""}.`,
        {
          solveMs: result.solveMs,
          solveSec: Number((result.solveMs / 1000).toFixed(1)),
          weeklyCostUsd: result.weeklyCostUsd,
          rounds: round,
          concessions,
        },
      );
    if (!result.feasible)
      throw new Error(
        `the rules cannot all be met together (${result.conflicts.join(", ") || "no safe candidates"})`,
      );

    // 7. Code re-verifies every hard rule. Violations reject the plan.
    const violations = verifyPlan(result.days, constraints);
    await emit("doctor", "tool_call", "Re-checking every hard rule on the final plan", {
      tool: "verifyPlan",
      violations: violations.length,
    });
    if (violations.length > 0) throw new Error(`verification failed: ${violations[0]}`);
    await emit("doctor", "proposal", "All seven days pass every rule. I am satisfied.", { violations: 0 });

    // 8. Save plan with explanations and grocery list
    const version = await nextPlanVersion(store, userId);
    const bestEffort = !result.withinBudget;
    const plan: MealPlan = {
      planId: newId(),
      userId,
      version,
      reason: reasonText,
      runId,
      startDate,
      weeklyCostUsd: result.weeklyCostUsd,
      days: result.days,
      groceryList: buildGroceryList(result.days, foods),
      shadowPrices,
      bestEffort,
    };
    explainPlan(plan, profile, { ...result, shadowPrices });
    await store.savePlan(plan);

    // Budget's "what would more money buy" line: a shadow price when one was computed in time, otherwise the
    // binding constraints of the final solve (both come from the optimizer, never from a model).
    const budgetSp = shadowPrices.find((s) => s.constraint === "weekly_budget");
    if (budgetSp && budgetSp.value > 0)
      await emit("budget", "proposal", budgetSp.humanText, { shadowPrice: budgetSp });
    else if (!budgetSp && result.bindingConstraints.includes("weekly_budget"))
      await emit(
        "budget",
        "proposal",
        `Budget is the binding constraint: ${money(result.weeklyCostUsd)} of your $${profile.weeklyBudgetUsd} is working. Every extra dollar buys variety.`,
        { bindingConstraints: result.bindingConstraints, weeklyCostUsd: result.weeklyCostUsd },
      );
    await emit(
      "budget",
      "proposal",
      `Grocery list ready: ${plan.groceryList.length} items, ${money(plan.weeklyCostUsd)} total.`,
      { items: plan.groceryList.length, weeklyCostUsd: plan.weeklyCostUsd },
    );
    await emit(
      "monitor",
      "proposal",
      "I will watch weight, glucose and logs daily and replan when the trend says so.",
    );
    await emit(
      "orchestrator",
      "decision",
      bestEffort
        ? `Plan v${version} approved as best effort: every rule met, ${money(plan.weeklyCostUsd)} is over the $${profile.weeklyBudgetUsd} budget.`
        : `Plan v${version} approved: ${plan.days.length} days, ${money(plan.weeklyCostUsd)}, zero rule violations.`,
      { planId: plan.planId, version, bestEffort, concededAny, timingMs: timing },
    );
    await store.setRunStatus(runId, "done");
    if (shadowLater) void priceShadowsLater(store, plan, profile, result, shadowLater, opts);
    return { plan, events: await store.listEvents(runId), status: "done", fallback: false };
  } catch (err) {
    console.error(`[orchestrator] run ${runId} failed:`, err instanceof Error ? err.message : err);
    const key = demoKeyFor(userId);
    if (trigger === "onboarding" && fallbackEnabled() && key) {
      try {
        await emit(
          "orchestrator",
          "proposal",
          "Negotiation hit a snag; replaying the saved plan for this demo user.",
          { fallback: true, reason: safeReason(err) },
        );
        const plan = await replayFallback(store, userId, runId, key);
        if (plan) {
          await store.setRunStatus(runId, "done");
          return { plan, events: await store.listEvents(runId), status: "done", fallback: true };
        }
      } catch (inner) {
        console.error(`[orchestrator] fallback failed:`, inner instanceof Error ? inner.message : inner);
      }
    }
    try {
      await emit("orchestrator", "decision", `Plan could not be built: ${safeReason(err)}`, { error: true });
      await store.setRunStatus(runId, "failed");
    } catch {
      // store is unreachable; nothing else to do
    }
    return {
      plan: null,
      events: await store.listEvents(runId).catch(() => []),
      status: "failed",
      fallback: false,
    };
  }
}

/**
 * Shadow prices after the decision: re-solves day by day with a short limit, then writes the prices and the
 * refreshed per meal explanations into the saved plan, unless a newer plan replaced it meanwhile. Never throws.
 */
async function priceShadowsLater(
  store: Store,
  plan: MealPlan,
  profile: UserProfile,
  result: OptimizeResult,
  input: OptimizeInput,
  opts: OptimizeOptions,
): Promise<void> {
  try {
    // Let the plan page load first: the WASM solver blocks the event loop between awaits.
    await new Promise<void>((r) => setTimeout(r, DEFERRED_SHADOW_DELAY_MS));
    const t0 = Date.now();
    const priced = await optimizePlan(input, { ...opts, ...SHADOW_SOLVE_OPTS, shadowPrices: true });
    if (!priced.feasible || priced.shadowPrices.length === 0) return;
    const current = await store.getCurrentPlan(plan.userId);
    if (!current || current.planId !== plan.planId) return;
    const updated: MealPlan = { ...current, shadowPrices: priced.shadowPrices };
    explainPlan(updated, profile, { ...result, shadowPrices: priced.shadowPrices });
    await store.savePlan(updated);
    console.info(`[orchestrator] shadow prices for plan ${plan.planId} saved after ${Date.now() - t0} ms`);
  } catch (err) {
    console.warn(`[orchestrator] deferred shadow prices skipped:`, err instanceof Error ? err.message : err);
  }
}

/** Keeps the Doctor's pool removals in force when the Chef opens the full recipe book. */
function reviewSafe(pool: CandidateMeal[], removedIds: string[]): CandidateMeal[] {
  const removed = new Set(removedIds);
  return pool.filter((c) => !removed.has(c.candidateId));
}

export interface StartPlanRunArgs {
  userId: string;
  trigger: AgentRunTrigger;
  reason?: string | null;
  weeklyBudgetUsd?: number;
  optimize?: OptimizeOptions;
}

/** Creates the run row, starts the negotiation in the background and returns immediately. */
export async function startPlanRun(args: StartPlanRunArgs): Promise<{ runId: string }> {
  const store = getStore();
  const run = await store.createRun({
    userId: args.userId,
    trigger: args.trigger,
    reason: args.reason ?? TRIGGER_TEXT[args.trigger],
  });
  // Start on the next tick so the HTTP response carrying runId is flushed before the first solve runs.
  setTimeout(() => {
    runPlanNegotiation({ ...args, runId: run.runId, store })
      .then((outcome) => {
        // Warm the budget curve now (solves yield between budgets), so the plan page's slider answers from cache.
        if (outcome.status === "done" && !outcome.fallback)
          setTimeout(() => void warmBudgetCurve(args.userId), CURVE_WARM_DELAY_MS);
      })
      .catch((err) => {
        console.error(
          `[orchestrator] unexpected failure in run ${run.runId}:`,
          err instanceof Error ? err.message : err,
        );
      });
  }, 0);
  return { runId: run.runId };
}

export { eventDelayMs };
