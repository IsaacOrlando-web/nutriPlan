// Coach agent: the person's day to day guide. Owner: Agents.
// Live: LLM with a code-built context (every number comes from math). Scripted: rule-based replies that
// name tonight's dinner, quote remaining calories from math and trigger a replan on budget requests.
import type { CoachMessage, CoachResponse, Meal, MealTotals, PlanDay } from "@/types/contracts";
import { getStore } from "@/lib/db";
import type { Store } from "@/lib/db/store";
import { CoachReplySchema } from "./schemas";
import { callObject, llmAvailable, NoLlmError, onlyAllowedNumbers } from "./llm";
import { loadPrompt } from "./prompts";
import { profileSummary } from "./context";
import { loadUserBundle, todayIso } from "./tools/backend";
import { emptyTotals, getTrends, money, subtractTotals, sumTotals } from "./tools/math";
import { startPlanRun } from "./orchestrator";

export interface CoachOptions {
  store?: Store;
  dryRun?: boolean;
}

interface CoachContext {
  profileSummary: string;
  constraintsSummary: string;
  rules: { rule: string; why: string; source: string }[];
  today: string;
  planDay: PlanDay | null;
  planVersion: number | null;
  weeklyCostUsd: number | null;
  weeklyBudgetUsd: number;
  eaten: MealTotals;
  remaining: MealTotals;
  targets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sodiumMg: number;
  };
  alerts: string[];
}

function mealByType(day: PlanDay | null, type: Meal["type"]): Meal | null {
  return day?.meals.find((m) => m.type === type) ?? null;
}

async function buildContext(store: Store, userId: string): Promise<CoachContext> {
  const { profile, constraints, targets } = await loadUserBundle(store, userId);
  const today = todayIso();
  const plan = await store.getCurrentPlan(userId);
  const planDay = plan?.days.find((d) => d.date === today) ?? plan?.days[0] ?? null;
  const logs = await store.listFoodLogs(userId, {
    from: `${today}T00:00:00.000Z`,
    to: `${today}T23:59:59.999Z`,
  });
  const eaten = sumTotals(logs.map((l) => l.totals));
  const targetTotals: MealTotals = {
    ...emptyTotals(),
    calories: targets.calories,
    proteinG: targets.proteinG,
    carbsG: targets.carbsG,
    fatG: targets.fatG,
    fiberG: targets.fiberG,
    sodiumMg: targets.sodiumMg,
    potassiumMg: targets.potassiumMg,
  };
  const remaining = subtractTotals(targetTotals, eaten);
  const readings = await store.listReadings(userId);
  const alerts: string[] = [];
  const w = getTrends(readings, "weight", profile.goal);
  if (w.alert !== "none") alerts.push(`weight ${w.alert} (${w.slopePerWeek} kg/week)`);
  const g = getTrends(readings, "glucose_fasting");
  if (g.alert !== "none") alerts.push(`fasting glucose ${g.alert} (${g.slopePerWeek} mg/dL per week)`);
  const b = getTrends(readings, "bp");
  if (b.alert !== "none") alerts.push(`blood pressure ${b.alert} (${b.slopePerWeek} mmHg per week)`);
  return {
    profileSummary: profileSummary(profile),
    constraintsSummary: constraints.summary,
    rules: constraints.reasons,
    today,
    planDay,
    planVersion: plan?.version ?? null,
    weeklyCostUsd: plan?.weeklyCostUsd ?? null,
    weeklyBudgetUsd: profile.weeklyBudgetUsd,
    eaten,
    remaining,
    targets: {
      calories: targets.calories,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      fiberG: targets.fiberG,
      sodiumMg: targets.sodiumMg,
    },
    alerts,
  };
}

function contextNumbers(ctx: CoachContext): string[] {
  const text = JSON.stringify(ctx);
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

/** Rule-based replies so the demo works with no keys. Numbers come from the code-built context. */
export function scriptedReply(
  ctx: CoachContext,
  messages: CoachMessage[],
): { reply: string; wantsReplan: boolean; replanReason: string | null } {
  const last =
    [...messages]
      .reverse()
      .find((m) => m.role === "user")
      ?.content.toLowerCase() ?? "";
  const dinner = mealByType(ctx.planDay, "dinner");
  const lunch = mealByType(ctx.planDay, "lunch");
  const breakfast = mealByType(ctx.planDay, "breakfast");
  const noPlan =
    "You do not have a plan yet. Generate one and the Doctor, Chef and Budget will negotiate your week.";
  const left = `You have ${ctx.remaining.calories} kcal and ${ctx.remaining.proteinG} g protein left today (${ctx.eaten.calories} kcal eaten of ${ctx.targets.calories}).`;

  if (has(last, "cheaper", "budget", "expensive", "cost", "afford", "money", "barato", "presupuesto")) {
    return {
      reply: `Got it. Your current week costs ${ctx.weeklyCostUsd !== null ? money(ctx.weeklyCostUsd) : "nothing yet"} against a $${ctx.weeklyBudgetUsd} budget. I am asking Budget and Chef to renegotiate a cheaper week with the same rules. Watch the Agent Room.`,
      wantsReplan: true,
      replanReason: "Coach: make the week cheaper without breaking any rule",
    };
  }
  if (
    has(
      last,
      "swap",
      "replace",
      "don't like",
      "do not like",
      "hate",
      "sick of",
      "cambiar",
      "variety",
      "boring",
    )
  ) {
    const target = dinner ? dinner.name : "that meal";
    return {
      reply: `Fair enough. I am asking Chef for more variety and to replace ${target.toLowerCase()} with something you will enjoy. Doctor keeps the same rules.`,
      wantsReplan: true,
      replanReason: `Coach: more variety, replace ${target}`,
    };
  }
  if (has(last, "dinner", "tonight", "cena")) {
    if (!dinner) return { reply: noPlan, wantsReplan: false, replanReason: null };
    const doc = dinner.explanation.find((e) => e.agent === "doctor")?.text ?? "";
    return {
      reply: `Tonight's dinner is ${dinner.name} (${dinner.cuisine}, ${dinner.prepMinutes} min). ${dinner.totals.calories} kcal, ${dinner.totals.proteinG} g protein, ${dinner.totals.sodiumMg} mg sodium. ${doc} ${left}`,
      wantsReplan: false,
      replanReason: null,
    };
  }
  if (has(last, "lunch", "almuerzo", "comida")) {
    if (!lunch) return { reply: noPlan, wantsReplan: false, replanReason: null };
    return {
      reply: `Lunch today is ${lunch.name}: ${lunch.totals.calories} kcal, ${lunch.totals.proteinG} g protein, ${lunch.totals.fiberG} g fiber. ${lunch.recipeSteps[0] ?? ""} ${left}`,
      wantsReplan: false,
      replanReason: null,
    };
  }
  if (has(last, "breakfast", "desayuno", "morning")) {
    if (!breakfast) return { reply: noPlan, wantsReplan: false, replanReason: null };
    return {
      reply: `Breakfast is ${breakfast.name}: ${breakfast.totals.calories} kcal and ${breakfast.totals.fiberG} g fiber to start the day. ${left}`,
      wantsReplan: false,
      replanReason: null,
    };
  }
  if (has(last, "calorie", "left", "remaining", "how much", "eaten", "today", "calorías", "quedan")) {
    const next = dinner ? ` Dinner tonight, ${dinner.name}, fits with ${dinner.totals.calories} kcal.` : "";
    return { reply: `${left}${next}`, wantsReplan: false, replanReason: null };
  }
  if (has(last, "sodium", "salt", "sugar", "carb", "rule", "why", "limit", "sal", "azúcar")) {
    const rule = ctx.rules.find((r) => has(last, r.rule.split("_")[1] ?? r.rule)) ?? ctx.rules[0];
    return {
      reply:
        `${ctx.constraintsSummary} ${rule ? `${rule.why} Source: ${rule.source.split(" (")[0]}.` : ""}`.trim(),
      wantsReplan: false,
      replanReason: null,
    };
  }
  if (has(last, "weight", "glucose", "pressure", "trend", "progress", "peso")) {
    const trend = ctx.alerts.length
      ? `Monitor sees: ${ctx.alerts.join("; ")}.`
      : "Monitor sees steady trends, nothing to change.";
    return {
      reply: `${trend} Keep logging readings and I will adjust the plan when the data says so.`,
      wantsReplan: false,
      replanReason: null,
    };
  }
  if (has(last, "hello", "hi", "hey", "hola")) {
    return {
      reply:
        `Hi! ${dinner ? `Tonight is ${dinner.name}.` : ""} ${left} Ask me about any meal, your rules, or say "cheaper" and I will send the agents back to work.`.replace(
          /\s+/g,
          " ",
        ),
      wantsReplan: false,
      replanReason: null,
    };
  }
  const summary = dinner
    ? `Today: ${breakfast?.name ?? "breakfast"}, ${lunch?.name ?? "lunch"} and ${dinner.name}.`
    : noPlan;
  return {
    reply: `${summary} ${left} I can explain any meal, your health rules, or ask the agents for a cheaper or more varied week.`,
    wantsReplan: false,
    replanReason: null,
  };
}

export async function runCoach(
  userId: string,
  messages: CoachMessage[],
  options: CoachOptions = {},
): Promise<CoachResponse> {
  const store = options.store ?? getStore();
  let ctx: CoachContext;
  try {
    ctx = await buildContext(store, userId);
  } catch {
    return {
      reply: "I need your profile first. Finish onboarding and I will be right here.",
      replanRunId: null,
    };
  }

  let out = scriptedReply(ctx, messages);
  if (llmAvailable("coach")) {
    try {
      const transcript = messages
        .slice(-12)
        .map((m) => `${m.role === "user" ? "Person" : "Coach"}: ${m.content}`)
        .join("\n");
      const llm = await callObject({
        agent: "coach",
        schema: CoachReplySchema,
        system: loadPrompt("coach"),
        prompt: `Context (JSON, all numbers computed by code):\n${JSON.stringify({ ...ctx, planDay: ctx.planDay ? { date: ctx.planDay.date, meals: ctx.planDay.meals.map((m) => ({ type: m.type, name: m.name, cuisine: m.cuisine, prepMinutes: m.prepMinutes, totals: m.totals, explanation: m.explanation })) } : null })}\n\nConversation:\n${transcript}\n\nReply as the Coach.`,
        temperature: 0.6,
      });
      if (onlyAllowedNumbers(llm.reply, contextNumbers(ctx)))
        out = { reply: llm.reply, wantsReplan: llm.wantsReplan, replanReason: llm.replanReason };
      else
        out = {
          ...out,
          wantsReplan: out.wantsReplan || llm.wantsReplan,
          replanReason: out.replanReason ?? llm.replanReason,
        };
    } catch (err) {
      if (!(err instanceof NoLlmError)) console.warn("[coach] llm reply skipped:", (err as Error).message);
    }
  }

  let replanRunId: string | null = null;
  if (out.wantsReplan && !options.dryRun) {
    const { runId } = await startPlanRun({
      userId,
      trigger: "coach",
      reason: (out.replanReason ?? "Coach asked for changes").slice(0, 200),
    });
    replanRunId = runId;
  }
  return { reply: out.reply, replanRunId };
}
