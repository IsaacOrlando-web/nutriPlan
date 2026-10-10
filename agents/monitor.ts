// Monitor agent: observant and encouraging. Owner: Agents.
// All decisions are code: Kalman trends, danger checks from guidelines.json, Bayesian TDEE update.
// The LLM (live mode) may only rephrase the reason; it never changes the action or a number.
import type {
  FoodLogEntry,
  MealPlan,
  MonitorAlert,
  MonitorResult,
  Reading,
  ReadingType,
  Trend,
} from "@/types/contracts";
import { getStore } from "@/lib/db";
import type { Store } from "@/lib/db/store";
import { checkDangerReading, summarize } from "./rules/engine";
import { MonitorDecisionSchema } from "./schemas";
import { callObject, llmAvailable, NoLlmError, onlyAllowedNumbers } from "./llm";
import { loadPrompt } from "./prompts";
import { loadUserBundle, startOfTodayIso, daysAgoIso, todayIso } from "./tools/backend";
import { calculateTargets, getTrends, updateTdee } from "./tools/math";
import { startPlanRun } from "./orchestrator";

export type MonitorTrigger = "reading" | "log" | "manual";

/** When fasting glucose trends up for a diabetic user the per meal carb cap is tightened by this much (floor below). */
export const GLUCOSE_RISING_CARB_TIGHTEN_G = 5;
export const CARB_CAP_FLOOR_G = 35;
const INTAKE_WINDOW_DAYS = 14;
const SKIP_THRESHOLD = 3;
const LIMIT_STREAK_DAYS = 3;

export interface MonitorOptions {
  store?: Store;
  /** Skip starting a plan run (tests). */
  dryRun?: boolean;
}

function latestOfType(readings: Reading[], type: ReadingType): Reading | null {
  let best: Reading | null = null;
  for (const r of readings) if (r.type === type && (!best || r.takenAt > best.takenAt)) best = r;
  return best;
}

/** Daily intake in kcal for the Bayesian update: food logs when there are enough days, else the plan, else the targets. */
export function intakeHistory(
  logs: FoodLogEntry[],
  plan: MealPlan | null,
  targetCalories: number,
  days = INTAKE_WINDOW_DAYS,
): { kcal: number[]; source: "logs" | "plan" | "targets" } {
  const byDay = new Map<string, number>();
  for (const l of logs)
    byDay.set(l.eatenAt.slice(0, 10), (byDay.get(l.eatenAt.slice(0, 10)) ?? 0) + l.totals.calories);
  const logged = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, kcal]) => kcal);
  if (logged.length >= 7) return { kcal: logged.slice(-days), source: "logs" };
  if (plan && plan.days.length > 0) {
    const planKcal = plan.days.map((d) => d.dayTotals.calories);
    const kcal = Array.from({ length: days }, (_, i) => planKcal[i % planKcal.length]);
    return { kcal, source: "plan" };
  }
  return { kcal: Array.from({ length: days }, () => targetCalories), source: "targets" };
}

/** Planned meals (by name) that were skipped on at least `threshold` logged days. */
export function skippedMeals(
  plan: MealPlan | null,
  logs: FoodLogEntry[],
  today: string,
  threshold = SKIP_THRESHOLD,
): { name: string; times: number }[] {
  if (!plan) return [];
  const logsByDay = new Map<string, FoodLogEntry[]>();
  for (const l of logs) {
    const d = l.eatenAt.slice(0, 10);
    (logsByDay.get(d) ?? logsByDay.set(d, []).get(d)!).push(l);
  }
  const skips = new Map<string, number>();
  for (const day of plan.days) {
    if (day.date >= today) continue;
    const dayLogs = logsByDay.get(day.date);
    if (!dayLogs || dayLogs.length === 0) continue; // no logging that day: cannot call it a skip
    const eaten = new Set(dayLogs.flatMap((l) => l.items.map((i) => i.foodId)));
    for (const m of day.meals) {
      const hit = m.items.some((i) => eaten.has(i.foodId));
      if (!hit) skips.set(m.name, (skips.get(m.name) ?? 0) + 1);
    }
  }
  return [...skips.entries()].filter(([, n]) => n >= threshold).map(([name, times]) => ({ name, times }));
}

/** Days in a row (ending yesterday or today) where logged sodium or added sugar passed the daily cap. */
export function limitStreak(
  logs: FoodLogEntry[],
  maxSodiumMg: number,
  maxAddedSugarG: number,
  today: string,
  days = LIMIT_STREAK_DAYS,
): { sodium: boolean; sugar: boolean } {
  const byDay = new Map<string, { sodium: number; sugar: number }>();
  for (const l of logs) {
    const d = l.eatenAt.slice(0, 10);
    const cur = byDay.get(d) ?? { sodium: 0, sugar: 0 };
    cur.sodium += l.totals.sodiumMg;
    cur.sugar += l.totals.addedSugarG;
    byDay.set(d, cur);
  }
  const recent = [...byDay.keys()]
    .filter((d) => d <= today)
    .sort()
    .slice(-days);
  if (recent.length < days) return { sodium: false, sugar: false };
  return {
    sodium: recent.every((d) => byDay.get(d)!.sodium > maxSodiumMg),
    sugar: recent.every((d) => byDay.get(d)!.sugar > maxAddedSugarG),
  };
}

function slopeText(t: Trend): string {
  const sign = t.slopePerWeek > 0 ? "+" : "";
  return `${sign}${t.slopePerWeek} per week`;
}

export async function runMonitor(
  userId: string,
  trigger: MonitorTrigger,
  options: MonitorOptions = {},
): Promise<MonitorResult> {
  const store = options.store ?? getStore();
  const alerts: MonitorAlert[] = [];
  let profileBundle;
  try {
    profileBundle = await loadUserBundle(store, userId);
  } catch {
    return {
      action: "none",
      reason: "No profile yet. Finish onboarding and I will start watching.",
      runId: null,
      alerts: [],
    };
  }
  const { profile, constraints, targets } = profileBundle;
  const today = todayIso();

  const readings = await store.listReadings(userId);
  const logs = await store.listFoodLogs(userId, { from: daysAgoIso(INTAKE_WINDOW_DAYS + 1) });
  const plan = await store.getCurrentPlan(userId);

  // 1. Danger readings always win: urgent alert, no replan.
  for (const type of ["glucose_fasting", "glucose_post_meal", "bp"] as ReadingType[]) {
    const latest = latestOfType(readings, type);
    if (!latest) continue;
    const check = checkDangerReading(latest.type, latest.value, latest.value2);
    if (check.danger && check.message) {
      alerts.push({
        level: "urgent",
        title: type === "bp" ? "Blood pressure in the danger range" : "Glucose in the danger range",
        body: check.message,
        source: "guidelines.json dangerReadings (ADA)",
      });
    }
  }
  if (alerts.some((a) => a.level === "urgent")) {
    return {
      action: "alert",
      reason: "A reading is in the danger range. Contact a health professional now.",
      runId: null,
      alerts,
    };
  }

  // 2. Trends (Kalman filter) for weight, glucose and blood pressure.
  const weight = getTrends(readings, "weight", profile.goal);
  const glucose = getTrends(readings, "glucose_fasting");
  const bp = getTrends(readings, "bp");
  const diabetic = profile.conditions.includes("type2_diabetes");

  const replanReasons: string[] = [];
  let tdee: { mean: number; sd: number } | undefined;

  if (weight.alert === "stalled" && (profile.goal === "lose" || profile.goal === "gain")) {
    const prior = { mean: targets.tdeeEstimate, sd: Math.max(50, targets.tdeeUncertainty) };
    const intake = intakeHistory(logs, plan, targets.calories);
    const posterior = updateTdee(prior, intake.kcal, weight);
    await store.saveTdeePosterior(userId, posterior);
    const newTargets = calculateTargets(profile, constraints, posterior);
    await store.saveTargets(userId, newTargets);
    tdee = posterior;
    const direction = posterior.mean < prior.mean ? "lower" : "higher";
    replanReasons.push(
      `Weight has stalled for 14 days while intake stayed near ${intake.source === "logs" ? "what you logged" : "plan"}. Real metabolism looks ${direction} than estimated (about ${posterior.mean} kcal).`,
    );
    alerts.push({
      level: "info",
      title: "Targets updated",
      body: `Daily calories now ${newTargets.calories} kcal (metabolism estimate ${posterior.mean} ± ${posterior.sd} kcal).`,
      source: "updateTdee + calculateTargets",
    });
  } else if (weight.alert === "too_fast") {
    replanReasons.push(
      `Weight is moving ${slopeText(weight)} kg, faster than the safe 1 kg per week. Chef gets a gentler week.`,
    );
    alerts.push({
      level: "warning",
      title: "Weight moving too fast",
      body: `Trend ${slopeText(weight)} kg. Losing or gaining more than 1 kg a week is not safe; if you feel unwell contact a health professional.`,
      source: "getTrends (too_fast)",
    });
  } else if (weight.alert === "rising" || weight.alert === "falling") {
    alerts.push({
      level: "info",
      title: `Weight ${weight.alert}`,
      body: `Trend ${slopeText(weight)} kg while your goal is to maintain. I will keep watching.`,
      source: "getTrends",
    });
  }

  if (glucose.alert === "rising") {
    let tightened = "";
    if (diabetic && constraints.maxCarbsPerMealG !== undefined) {
      const next = Math.max(CARB_CAP_FLOOR_G, constraints.maxCarbsPerMealG - GLUCOSE_RISING_CARB_TIGHTEN_G);
      if (next < constraints.maxCarbsPerMealG) {
        const tighter = { ...constraints, maxCarbsPerMealG: next };
        tighter.summary = summarize(profile, tighter);
        await store.saveConstraints(userId, tighter);
        await store.saveTargets(
          userId,
          calculateTargets(profile, tighter, (await store.getTdeePosterior(userId)) ?? undefined),
        );
        tightened = ` Carbs per meal tightened to ${next} g.`;
      }
    }
    replanReasons.push(
      `Fasting glucose trend is rising (${slopeText(glucose)} mg/dL). Tomorrow's meals get lower glycemic load.${tightened}`,
    );
    alerts.push({
      level: "warning",
      title: "Glucose trending up",
      body: `Fasting glucose is drifting up ${slopeText(glucose)} mg/dL. Meals get lower glycemic load. If this continues, contact your care team.`,
      source: "getTrends (glucose_fasting)",
    });
  } else if (glucose.alert === "falling") {
    alerts.push({
      level: "info",
      title: "Glucose trending down",
      body: `Fasting glucose is coming down ${slopeText(glucose)} mg/dL. Keep going.`,
      source: "getTrends (glucose_fasting)",
    });
  }

  if (bp.alert === "rising") {
    replanReasons.push(
      `Blood pressure trend is rising (${slopeText(bp)} mmHg). Chef gets a lower sodium week.`,
    );
    alerts.push({
      level: "warning",
      title: "Blood pressure trending up",
      body: `Systolic pressure is drifting up ${slopeText(bp)} mmHg. Meals go lower in sodium. If this continues, contact your care team.`,
      source: "getTrends (bp)",
    });
  } else if (bp.alert === "falling") {
    alerts.push({
      level: "info",
      title: "Blood pressure trending down",
      body: `Systolic pressure is coming down ${slopeText(bp)} mmHg. Nice work.`,
      source: "getTrends (bp)",
    });
  }

  // 3. Logs versus plan: skipped meals and limit streaks.
  const skipped = skippedMeals(plan, logs, today);
  if (skipped.length > 0) {
    const s = skipped[0];
    replanReasons.push(
      `${s.name} was skipped ${s.times} times. Chef replaces it with something you will actually eat.`,
    );
    alerts.push({
      level: "info",
      title: "Skipped meal",
      body: `${s.name} was skipped ${s.times} times, so it leaves the plan.`,
      source: "food logs vs plan",
    });
  }
  const streak = limitStreak(logs, constraints.maxSodiumMgPerDay, constraints.maxAddedSugarG, today);
  if (streak.sodium) {
    replanReasons.push(
      `Logged sodium passed ${constraints.maxSodiumMgPerDay} mg three days running. Next week goes lower in salt.`,
    );
    alerts.push({
      level: "warning",
      title: "Sodium over the cap",
      body: `Three days in a row above ${constraints.maxSodiumMgPerDay} mg sodium.`,
      source: "food logs vs constraints",
    });
  }
  if (streak.sugar) {
    replanReasons.push(
      `Logged added sugar passed ${constraints.maxAddedSugarG} g three days running. Sweeter snacks come from fruit next week.`,
    );
    alerts.push({
      level: "warning",
      title: "Added sugar over the cap",
      body: `Three days in a row above ${constraints.maxAddedSugarG} g added sugar.`,
      source: "food logs vs constraints",
    });
  }

  if (replanReasons.length === 0) {
    const quiet =
      readings.length === 0
        ? "No readings yet. Log a weight or glucose reading and I will start watching trends."
        : "Trends look steady. Nothing to change today.";
    return {
      action: alerts.length ? "alert" : "none",
      reason: alerts[0]?.body ?? quiet,
      runId: null,
      alerts,
      ...(tdee ? { tdee } : {}),
    };
  }

  let reason = replanReasons.join(" ");
  if (llmAvailable("monitor")) {
    try {
      const phrased = await callObject({
        agent: "monitor",
        schema: MonitorDecisionSchema,
        system: loadPrompt("monitor"),
        prompt: `Action decided by code: replan.\nTrigger: ${trigger}.\nFacts: ${reason}\nRephrase the reason warmly in one or two sentences, keeping every number exactly.`,
        temperature: 0.5,
      });
      const allowed = reason.match(/\d+(?:\.\d+)?/g) ?? [];
      if (phrased.reason && onlyAllowedNumbers(phrased.reason, allowed)) reason = phrased.reason;
    } catch (err) {
      if (!(err instanceof NoLlmError))
        console.warn("[monitor] llm phrasing skipped:", (err as Error).message);
    }
  }

  // 4. Max one automatic replan per day.
  const todaysRuns = await store.listRuns(userId, { since: startOfTodayIso() });
  const already = todaysRuns.find((r) => r.trigger === "monitor");
  if (already) {
    alerts.push({
      level: "info",
      title: "Already replanned today",
      body: "One automatic replan per day. The new week is already on its way.",
      source: "monitor",
    });
    return {
      action: "alert",
      reason: `${reason} (Already replanned today, run ${already.runId.slice(0, 8)}.)`,
      runId: already.runId,
      alerts,
      ...(tdee ? { tdee } : {}),
    };
  }

  if (options.dryRun) return { action: "replan", reason, runId: null, alerts, ...(tdee ? { tdee } : {}) };
  const { runId } = await startPlanRun({ userId, trigger: "monitor", reason: reason.slice(0, 200) });
  alerts.unshift({
    level: "info",
    title: "Plan updated",
    body: "Monitor asked Chef for a fresh week. Watch the agents negotiate in the Agent Room.",
    source: "monitor",
  });
  return { action: "replan", reason, runId, alerts, ...(tdee ? { tdee } : {}) };
}
