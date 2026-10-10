// Doctor agent: calm, firm, never concedes. Owner: Agents.
// Every number comes from buildConstraints (guidelines.json). The LLM may only restyle wording.
import type { CandidateMeal, MedicalConstraints } from "@/types/contracts";
import { buildConstraints, summarize } from "./rules/engine";
import { DoctorReviewSchema } from "./schemas";
import { callObject, NoLlmError, onlyAllowedNumbers } from "./llm";
import { loadPrompt } from "./prompts";
import { profileSummary, type AgentContext } from "./context";
import { candidateTotalsRawAt } from "./tools/math";

function constraintNumbers(c: MedicalConstraints): number[] {
  return [
    c.minCaloriesPerDay,
    c.minFiberG,
    c.maxAddedSugarG,
    c.maxSodiumMgPerDay,
    c.maxSatFatPct,
    c.maxCarbsPerMealG ?? NaN,
    c.maxGlycemicLoadPerMeal ?? NaN,
    c.minPotassiumMgPerDay ?? NaN,
  ].filter(Number.isFinite);
}

/**
 * Doctor states the constraints. Deterministic: constraints always come from buildConstraints(profile).
 * In live mode the LLM may restyle the summary; it is accepted only when every number it mentions is one of ours.
 */
export async function runDoctor(ctx: AgentContext): Promise<MedicalConstraints> {
  const { profile, emit } = ctx;
  await emit("doctor", "tool_call", "Reading guidelines.json for the rules that apply", {
    tool: "buildConstraints",
  });
  const c = buildConstraints(profile);
  // Monitor may have tightened the per meal carb cap (stricter than ADA). Stricter is kept; looser never happens.
  const stored = ctx.constraints;
  if (
    stored.maxCarbsPerMealG !== undefined &&
    c.maxCarbsPerMealG !== undefined &&
    stored.maxCarbsPerMealG < c.maxCarbsPerMealG
  ) {
    c.maxCarbsPerMealG = stored.maxCarbsPerMealG;
    c.summary = summarize(profile, c);
  }

  let message: string | null = null;
  if (ctx.live) {
    try {
      const review = await callObject({
        agent: "doctor",
        schema: DoctorReviewSchema,
        system: loadPrompt("doctor"),
        prompt: `Profile: ${profileSummary(profile)}\nConstraints (JSON, numbers are final): ${JSON.stringify({ ...c, reasons: c.reasons.map((r) => r.rule) })}\nCandidates: none yet. Restyle the summary and write your opening line.`,
        runId: ctx.runId,
        temperature: 0.4,
      });
      const allowed = constraintNumbers(c);
      if (review.summary && onlyAllowedNumbers(review.summary, allowed))
        c.summary = review.summary.slice(0, 400);
      if (review.message && onlyAllowedNumbers(review.message, allowed)) message = review.message;
    } catch (err) {
      if (!(err instanceof NoLlmError)) console.warn("[doctor] llm restyle skipped:", (err as Error).message);
    }
  }

  await emit(
    "doctor",
    "proposal",
    message ??
      `DGA floors and caps: at least ${c.minCaloriesPerDay} kcal, under ${c.maxSodiumMgPerDay} mg sodium, ${c.minFiberG} g fiber.`,
    { constraints: c },
  );
  if (profile.conditions.includes("type2_diabetes")) {
    await emit(
      "doctor",
      "proposal",
      `ADA diabetes rules: max ${c.maxCarbsPerMealG} g carbs and glycemic load ${c.maxGlycemicLoadPerMeal} per meal. Non negotiable.`,
      { rules: ["max_carbs_per_meal", "max_glycemic_load_per_meal"] },
    );
  }
  if (profile.conditions.includes("hypertension")) {
    const potassium = c.minPotassiumMgPerDay !== undefined ? `, potassium ${c.minPotassiumMgPerDay}+ mg` : "";
    await emit(
      "doctor",
      "proposal",
      `DASH rules on: sodium ${c.maxSodiumMgPerDay} mg${potassium}, saturated fat ${c.maxSatFatPct}%.`,
      { rules: ["max_sodium", "min_potassium", "max_sat_fat"] },
    );
  } else if (profile.conditions.includes("high_cholesterol")) {
    await emit(
      "doctor",
      "proposal",
      `AHA cholesterol rule: saturated fat under ${c.maxSatFatPct}% of calories. Heart first.`,
      { rules: ["max_sat_fat"] },
    );
  }
  const potassiumNote = c.reasons.find((r) => r.rule === "no_potassium_target");
  if (potassiumNote) {
    await emit(
      "doctor",
      "proposal",
      profile.conditions.includes("kidney_disease")
        ? "Kidney disease noted: I will not push potassium up. Check your potassium needs with your doctor."
        : "One medication can raise potassium, so no potassium target this week. Check with your doctor.",
      { rules: ["no_potassium_target"] },
    );
  }
  if (profile.allergies.length || profile.restrictions.length) {
    const bits = [
      profile.allergies.length ? `no ${profile.allergies.join(", ")}` : "",
      profile.restrictions.length ? `${profile.restrictions.join(", ")} respected` : "",
    ].filter(Boolean);
    await emit(
      "doctor",
      "proposal",
      `Allergy and restriction filter active: ${bits.join("; ")}. Excluded tags: ${c.excludedFoodTags.join(", ")}.`,
      { excludedFoodTags: c.excludedFoodTags },
    );
  }
  return c;
}

export interface PoolReview {
  kept: CandidateMeal[];
  removed: { candidateId: string; name: string; type: CandidateMeal["type"]; why: string }[];
}

/** Code only: drops candidates that cannot satisfy a per meal cap or a daily cap even at their smallest portions. */
export function reviewPool(
  pool: CandidateMeal[],
  constraints: MedicalConstraints,
  foods: AgentContext["foods"],
): PoolReview {
  const kept: CandidateMeal[] = [];
  const removed: PoolReview["removed"] = [];
  for (const c of pool) {
    if (c.ingredients.some((i) => !foods[i.foodId])) {
      removed.push({ candidateId: c.candidateId, name: c.name, type: c.type, why: "unknown ingredient" });
      continue;
    }
    const t = candidateTotalsRawAt(c, foods, "min");
    let why: string | null = null;
    if (constraints.maxCarbsPerMealG !== undefined && t.carbsG > constraints.maxCarbsPerMealG + 1e-9)
      why = "carbs over the per meal cap";
    else if (
      constraints.maxGlycemicLoadPerMeal !== undefined &&
      t.glycemicLoad > constraints.maxGlycemicLoadPerMeal + 1e-9
    )
      why = "glycemic load over the per meal cap";
    else if (t.sodiumMg > constraints.maxSodiumMgPerDay + 1e-9) why = "sodium over the daily cap in one meal";
    else if (t.addedSugarG > constraints.maxAddedSugarG + 1e-9)
      why = "added sugar over the daily cap in one meal";
    if (why) removed.push({ candidateId: c.candidateId, name: c.name, type: c.type, why });
    else kept.push(c);
  }
  return { kept, removed };
}

/** Doctor reviews the Chef's pool. Emits an objection naming how many were removed, or a short approval. */
export async function doctorReviewPool(ctx: AgentContext, pool: CandidateMeal[]): Promise<PoolReview> {
  const review = reviewPool(pool, ctx.constraints, ctx.foods);
  const n = review.removed.length;
  if (n === 0) {
    await ctx.emit(
      "doctor",
      "proposal",
      "Pool reviewed: no idea breaks a per meal cap at its smallest portion. Approved.",
      { tool: "reviewPool", removed: 0 },
    );
    return review;
  }
  const diabetic = ctx.constraints.maxCarbsPerMealG !== undefined;
  const sample = review.removed[0];
  const text = diabetic
    ? `${n} ${n === 1 ? "idea pushes" : "ideas push"} carbs or glycemic load past the per meal caps even at the smallest portion. Out.`
    : `${n} ${n === 1 ? "idea breaks" : "ideas break"} a daily cap in a single meal (${sample.why}). Out of the pool.`;
  await ctx.emit("doctor", "objection", text, {
    tool: "reviewPool",
    removed: n,
    candidateIds: review.removed.map((r) => r.candidateId),
  });
  return review;
}
