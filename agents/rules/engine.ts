// Deterministic rule engine: UserProfile -> MedicalConstraints from guidelines.json only. Owner: Agents (Doctor).
// Doctor's LLM may phrase the summary, but every number here comes from guidelines.json.
// Doctor hard constraints are never relaxed by any code path.
import type { MedicalConstraints, UserProfile } from "@/types/contracts";
import guidelines from "./guidelines.json";

type SourceKey = keyof typeof guidelines.sources;
type RuleRef = { rule: string; why: string; source: string };

export const GUIDELINES = guidelines;

function cite(r: RuleRef): RuleRef {
  const src = guidelines.sources[r.source as SourceKey];
  return { rule: r.rule, why: r.why, source: src ? `${src.name} (${src.url})` : r.source };
}

/** Rough calorie estimate used only to size percentage-based limits before targets exist. */
function calorieBasis(p: UserProfile): number {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }[p.activityLevel];
  const adj = p.goal === "lose" ? -(Math.min(p.goalRateKgPerWeek, 1) * 7700) / 7 : p.goal === "gain" ? (Math.min(p.goalRateKgPerWeek, 1) * 7700) / 7 : 0;
  return Math.max(bmr * factor + adj, p.sex === "male" ? guidelines.everyone.calorieFloor.male : guidelines.everyone.calorieFloor.female);
}

export function excludedTagsFor(p: Pick<UserProfile, "allergies" | "restrictions">): string[] {
  const tags = new Set<string>();
  const allergyMap = guidelines.allergyTags as Record<string, string[]>;
  const restrictionMap = guidelines.restrictionTags as Record<string, string[]>;
  for (const a of p.allergies) {
    const key = a.trim().toLowerCase();
    (allergyMap[key] ?? [key]).forEach((t) => tags.add(t));
  }
  for (const r of p.restrictions) {
    const key = r.trim().toLowerCase().replace(/[\s-]+/g, "_");
    (restrictionMap[key] ?? []).forEach((t) => tags.add(t));
  }
  return [...tags].sort();
}

export function takesPotassiumAffectingMedication(p: Pick<UserProfile, "medications">): boolean {
  const meds = p.medications.map((m) => m.toLowerCase());
  return guidelines.potassiumAffectingMedications.patterns.some((pat) => meds.some((m) => m.includes(pat)));
}

export function buildConstraints(p: UserProfile): MedicalConstraints {
  const e = guidelines.everyone;
  const kcal = calorieBasis(p);
  const reasons: RuleRef[] = e.rules.map(cite);

  let addedSugarPct = e.addedSugarMaxPctKcal;
  let sodium = e.sodiumMaxMg;
  let satFatPct = e.satFatMaxPct;
  let maxCarbsPerMealG: number | undefined;
  let maxGlycemicLoadPerMeal: number | undefined;
  let minPotassiumMgPerDay: number | undefined;

  const has = (c: UserProfile["conditions"][number]) => p.conditions.includes(c);
  const replaceReason = (r: RuleRef) => {
    const i = reasons.findIndex((x) => x.rule === r.rule);
    if (i >= 0) reasons[i] = cite(r);
    else reasons.push(cite(r));
  };

  if (has("type2_diabetes")) {
    const d = guidelines.conditions.type2_diabetes;
    maxCarbsPerMealG = d.maxCarbsPerMealG;
    maxGlycemicLoadPerMeal = d.maxGlycemicLoadPerMeal;
    addedSugarPct = Math.min(addedSugarPct, d.addedSugarMaxPctKcal);
    d.rules.forEach(replaceReason);
  }
  if (has("hypertension")) {
    const h = guidelines.conditions.hypertension;
    sodium = Math.min(sodium, h.sodiumMaxMg);
    satFatPct = Math.min(satFatPct, h.satFatMaxPct);
    minPotassiumMgPerDay = h.potassiumMinMg;
    h.rules.forEach(replaceReason);
  }
  if (has("high_cholesterol")) {
    const c = guidelines.conditions.high_cholesterol;
    satFatPct = Math.min(satFatPct, c.satFatMaxPct);
    c.rules.forEach(replaceReason);
  }
  // Exception: kidney disease or potassium-affecting medication means never raise potassium.
  if (has("kidney_disease") || takesPotassiumAffectingMedication(p)) {
    minPotassiumMgPerDay = undefined;
    const i = reasons.findIndex((x) => x.rule === "min_potassium");
    if (i >= 0) reasons.splice(i, 1);
    replaceReason(has("kidney_disease") ? guidelines.conditions.kidney_disease.rules[0] : guidelines.potassiumAffectingMedications.rule);
  }

  const floor = p.sex === "male" ? e.calorieFloor.male : e.calorieFloor.female;
  const constraints: MedicalConstraints = {
    minCaloriesPerDay: floor,
    minFiberG: Math.round((e.fiberGPer1000Kcal * kcal) / 1000),
    maxAddedSugarG: Math.round((addedSugarPct / 100) * kcal / 4),
    maxSodiumMgPerDay: sodium,
    maxSatFatPct: satFatPct,
    excludedFoodTags: excludedTagsFor(p),
    reasons,
    summary: "",
  };
  if (maxCarbsPerMealG !== undefined) constraints.maxCarbsPerMealG = maxCarbsPerMealG;
  if (maxGlycemicLoadPerMeal !== undefined) constraints.maxGlycemicLoadPerMeal = maxGlycemicLoadPerMeal;
  if (minPotassiumMgPerDay !== undefined) constraints.minPotassiumMgPerDay = minPotassiumMgPerDay;
  constraints.summary = summarize(p, constraints);
  return constraints;
}

/** Plain-language summary built from the numbers above (Doctor's LLM may restyle it, never change numbers). */
export function summarize(p: UserProfile, c: MedicalConstraints): string {
  const parts = [
    `At least ${c.minCaloriesPerDay} kcal and ${c.minFiberG} g fiber a day`,
    `under ${c.maxSodiumMgPerDay} mg sodium`,
    `under ${c.maxAddedSugarG} g added sugar`,
    `saturated fat under ${c.maxSatFatPct}% of calories`,
  ];
  if (c.maxCarbsPerMealG !== undefined) parts.push(`at most ${c.maxCarbsPerMealG} g carbs per meal`);
  if (c.maxGlycemicLoadPerMeal !== undefined) parts.push(`glycemic load ${c.maxGlycemicLoadPerMeal} or less per meal`);
  if (c.minPotassiumMgPerDay !== undefined) parts.push(`at least ${c.minPotassiumMgPerDay} mg potassium`);
  const excluded = c.excludedFoodTags.length ? ` Never: ${c.excludedFoodTags.join(", ")}.` : "";
  return `${p.name}'s plan rules: ${parts.join(", ")}.${excluded}`;
}

export interface DangerCheck {
  danger: boolean;
  message: string | null;
}

/** Danger readings always produce a "contact a professional" alert (spec section 9 and 17). */
export function checkDangerReading(type: string, value: number, value2?: number): DangerCheck {
  const d = guidelines.dangerReadings;
  if (type.startsWith("glucose")) {
    if (value < d.glucoseLowMgDl)
      return { danger: true, message: `Glucose ${value} mg/dL is low. Treat with fast sugar now and contact a health professional.` };
    if (value > d.glucoseHighMgDl)
      return { danger: true, message: `Glucose ${value} mg/dL is very high. Contact a health professional today.` };
  }
  if (type === "bp" && (value > d.bpSystolicHigh || (value2 ?? 0) > d.bpDiastolicHigh)) {
    return {
      danger: true,
      message: `Blood pressure ${value}/${value2 ?? "?"} is in the danger range. Contact a health professional now, or call emergency services if you feel unwell.`,
    };
  }
  return { danger: false, message: null };
}
