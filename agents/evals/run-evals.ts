// Agent evals: runs the scripted negotiation for every user in users.json against an in-memory store and
// checks the rules in scenarios.json. Usage: npm run evals   (exit code 1 on any failure)
// Env: EVAL_SHADOW_PRICES=true to include shadow price re-solves (slower), EVAL_USER=<substring> to run one user.
import fs from "node:fs";
import path from "node:path";

process.env.AGENTS_MODE = "scripted";
process.env.AGENT_EVENT_DELAY_MS = "0";
process.env.AGENTS_FALLBACK = "false";

import type { AgentEvent, Food, MealPlan, MedicalConstraints, UserProfile } from "@/types/contracts";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { verifyPlan } from "@/math/optimizer";
import { runPlanNegotiation } from "@/agents/orchestrator";
import { analyzePhoto } from "@/agents/vision/analyze";
import { voteOnReadings } from "@/agents/vision/vote";

interface Check {
  id: string;
  ok: boolean;
  detail?: string;
}

interface PhotoAnswer {
  photoUrl: string;
  expected: { foodId: string; gramsRange: [number, number] }[];
  expectLogged: boolean;
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

function allowedNumbers(
  profile: UserProfile,
  constraints: MedicalConstraints,
  plan: MealPlan | null,
  events: AgentEvent[],
): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      out.add(String(v));
      out.add(String(Math.round(v)));
      out.add(String(Math.round(v * 10) / 10));
      out.add(v.toFixed(1).replace(/\.0$/, ""));
      out.add(v.toFixed(2));
      out.add(String(Number(v.toFixed(2))));
    } else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === "object") Object.values(v).forEach(add);
  };
  add(profile);
  add(constraints);
  add(plan);
  for (const e of events) add(e.data);
  ["1", "2", "3", "4", "5", "7", "10", "14", "100"].forEach((n) => out.add(n)); // counts and percentages used in fixed phrases
  return out;
}

async function evalUser(
  profile: UserProfile,
  foods: Record<string, Food>,
  shadow: boolean,
): Promise<{ checks: Check[]; ms: number; events: number; cost: number | null }> {
  const store = new MemoryStore(null);
  setStore(store);
  await store.saveProfile(profile);
  const run = await store.createRun({ userId: profile.userId, trigger: "onboarding", reason: "eval" });
  const t0 = Date.now();
  const outcome = await runPlanNegotiation({
    userId: profile.userId,
    runId: run.runId,
    trigger: "onboarding",
    store,
    optimize: { shadowPrices: shadow, timeLimitSec: 3 },
  });
  const ms = Date.now() - t0;
  const events = await store.listEvents(run.runId);
  const status = (await store.getRun(run.runId))!.status;
  const constraints = (await store.getConstraints(profile.userId))!;
  const plan = await store.getCurrentPlan(profile.userId);
  const checks: Check[] = [];
  const push = (id: string, ok: boolean, detail?: string) => checks.push({ id, ok, detail });

  push("run_done", status === "done" && !outcome.fallback, `status=${status} fallback=${outcome.fallback}`);
  push("event_count", events.length >= 15 && events.length <= 25, `${events.length} events`);
  push(
    "objection_and_concession",
    events.some((e) => e.kind === "objection") && events.some((e) => e.kind === "concession"),
  );
  const long = events.filter((e) => e.text.length > 140);
  push("text_length", long.length === 0, long.map((e) => e.text.length).join(","));
  const decisions = events.filter((e) => e.kind === "decision");
  push(
    "decision_last",
    decisions.length === 1 &&
      events[events.length - 1].kind === "decision" &&
      typeof decisions[0]?.data?.planId === "string",
  );
  push(
    "tool_calls_named",
    events.filter((e) => e.kind === "tool_call").every((e) => typeof e.data?.tool === "string"),
  );
  const stated = events.find((e) => e.agent === "doctor" && e.kind === "proposal")?.data?.constraints;
  push("doctor_constraints_data", JSON.stringify(stated) === JSON.stringify(constraints));
  push(
    "plan_saved",
    !!plan && plan.days.length === 7 && plan.days.every((d) => d.meals.length === profile.mealsPerDay),
    plan ? `${plan.days.length} days` : "no plan",
  );
  if (plan) {
    const violations = verifyPlan(plan.days, constraints);
    push("verify_plan_clean", violations.length === 0, violations.slice(0, 2).join("; "));
    push(
      "best_effort_only_budget",
      !plan.bestEffort || plan.weeklyCostUsd > profile.weeklyBudgetUsd,
      `bestEffort=${plan.bestEffort} cost=${plan.weeklyCostUsd} budget=${profile.weeklyBudgetUsd}`,
    );
    const excluded = new Set(constraints.excludedFoodTags);
    const bad = plan.days.flatMap((d) =>
      d.meals.flatMap((m) =>
        m.items.filter((i) => foods[i.foodId].tags.some((t) => excluded.has(t))).map((i) => i.foodId),
      ),
    );
    push("no_excluded_tags", bad.length === 0, bad.slice(0, 3).join(","));
    const capOk = plan.days.every((d) =>
      d.meals.every(
        (m) =>
          (constraints.maxCarbsPerMealG === undefined ||
            m.totals.carbsG <= constraints.maxCarbsPerMealG + 0.2) &&
          (constraints.maxGlycemicLoadPerMeal === undefined ||
            m.totals.glycemicLoad <= constraints.maxGlycemicLoadPerMeal + 0.2),
      ),
    );
    push("per_meal_caps", capOk);
    const groceryTotal = plan.groceryList.reduce((s, g) => s + g.costUsd, 0);
    push(
      "grocery_list",
      plan.groceryList.length > 0 && Math.abs(groceryTotal - plan.weeklyCostUsd) <= 0.5,
      `${plan.groceryList.length} items, $${groceryTotal.toFixed(2)} vs $${plan.weeklyCostUsd}`,
    );
    push(
      "explanations",
      plan.days.every((d) =>
        d.meals.every((m) =>
          ["chef", "doctor", "budget"].every((a) => m.explanation.some((x) => x.agent === a)),
        ),
      ),
    );
  }
  const allowed = allowedNumbers(profile, constraints, plan, events);
  const strays = events.flatMap((e) =>
    numbersIn(e.text)
      .filter((n) => !allowed.has(n))
      .map((n) => `${e.agent}:${n}`),
  );
  push("numbers_from_math", strays.length === 0, strays.slice(0, 4).join(","));
  return { checks, ms, events: events.length, cost: plan?.weeklyCostUsd ?? null };
}

async function evalPhotos(): Promise<Check[]> {
  const store = new MemoryStore(null);
  setStore(store);
  const file = path.join(process.cwd(), "agents", "evals", "photos", "answers.json");
  const answers = JSON.parse(fs.readFileSync(file, "utf8")) as PhotoAnswer[];
  const checks: Check[] = [];
  for (const a of answers) {
    const { a: ra, b: rb } = await analyzePhoto(a.photoUrl, store);
    const vote = voteOnReadings(ra, rb);
    const ok =
      ra.items.length > 0 &&
      rb.items.length > 0 &&
      typeof vote.agreement === "number" &&
      (vote.logged || vote.question !== null);
    checks.push({
      id: `photo ${a.photoUrl}`,
      ok,
      detail: `agreement=${vote.agreement} logged=${vote.logged} items=${vote.items.map((i) => i.foodId).join("+")}`,
    });
  }
  return checks;
}

async function main() {
  const usersFile = path.join(process.cwd(), "agents", "evals", "users.json");
  const users = JSON.parse(fs.readFileSync(usersFile, "utf8")) as UserProfile[];
  const filter = process.env.EVAL_USER;
  const selected = filter
    ? users.filter((u) => u.userId.includes(filter) || u.name.toLowerCase() === filter.toLowerCase())
    : users;
  const shadow = process.env.EVAL_SHADOW_PRICES === "true";
  const foods: Record<string, Food> = Object.fromEntries(
    (await new MemoryStore(null).getAllFoods()).map((f) => [f.foodId, f]),
  );

  let failures = 0;
  const rows: { user: string; events: number; cost: string; ms: string; result: string }[] = [];
  for (const u of selected) {
    const r = await evalUser(u, foods, shadow);
    const failed = r.checks.filter((c) => !c.ok);
    failures += failed.length;
    rows.push({
      user: `${u.name} (${u.userId.slice(0, 9)})`,
      events: r.events,
      cost: r.cost === null ? "-" : `$${r.cost.toFixed(2)}`,
      ms: `${(r.ms / 1000).toFixed(1)}s`,
      result: failed.length
        ? `FAIL ${failed.map((c) => `${c.id}${c.detail ? ` [${c.detail}]` : ""}`).join("; ")}`
        : "pass",
    });
    console.log(
      `${failed.length ? "FAIL" : "ok  "} ${u.name.padEnd(8)} events=${r.events} ${r.cost === null ? "" : `cost=$${r.cost.toFixed(2)}`} ${(r.ms / 1000).toFixed(1)}s${failed.length ? ` -> ${failed.map((c) => `${c.id}${c.detail ? ` [${c.detail}]` : ""}`).join("; ")}` : ""}`,
    );
  }
  const photoChecks = await evalPhotos();
  for (const c of photoChecks) {
    if (!c.ok) failures++;
    console.log(`${c.ok ? "ok  " : "FAIL"} ${c.id} ${c.detail ?? ""}`);
  }
  console.log("");
  console.table(rows);
  console.log(
    failures === 0
      ? `All ${selected.length} users and ${photoChecks.length} photos passed.`
      : `${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
