// Shared negotiation context handed to every agent inside one run. Owner: Agents.
import type { DailyTargets, Food, MedicalConstraints, UserProfile } from "@/types/contracts";
import type { Store } from "@/lib/db/store";
import type { Emit } from "./tools/events";

export interface AgentContext {
  store: Store;
  runId: string;
  profile: UserProfile;
  constraints: MedicalConstraints;
  targets: DailyTargets;
  foods: Record<string, Food>;
  emit: Emit;
  /** True when LLM calls may be attempted; agents always keep a scripted path. */
  live: boolean;
}

/** Short profile summary that is safe to hand to an LLM (no identifiers beyond the first name). */
export function profileSummary(p: UserProfile): string {
  const parts = [
    `${p.name}, ${p.sex}, ${p.age} years, goal ${p.goal}${p.goal !== "maintain" ? ` ${p.goalRateKgPerWeek} kg/week` : ""}`,
    `activity ${p.activityLevel}, ${p.mealsPerDay} meals a day, budget $${p.weeklyBudgetUsd}/week`,
    p.conditions.length ? `conditions: ${p.conditions.join(", ")}` : "no diagnosed conditions",
    p.medications.length ? `medications: ${p.medications.join(", ")}` : "no medications",
    p.allergies.length ? `allergies: ${p.allergies.join(", ")}` : "no allergies",
    p.restrictions.length ? `restrictions: ${p.restrictions.join(", ")}` : "no restrictions",
    p.likes.length ? `likes: ${p.likes.join(", ")}` : "",
    p.dislikes.length ? `dislikes: ${p.dislikes.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(". ") + ".";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
