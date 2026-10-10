import type { UserProfile } from "@/types/contracts";

// Demo only: UserProfile has no goal weight yet (owner: Lead, /types/contracts.ts), so the two demo users get a
// fixed one here. Everyone else maintains their profile weight when their goal is "maintain", or has no goal weight.
const DEMO_GOAL_WEIGHT_KG: Record<string, number> = {
  "00000000-0000-4000-8000-00000000a1e1": 82, // Alex: lose fat, 0.5 kg per week
  "00000000-0000-4000-8000-0000000a7a1a": 82, // Maria: maintain
};

export function demoGoalWeightKg(profile: UserProfile): number | null {
  return DEMO_GOAL_WEIGHT_KG[profile.userId] ?? (profile.goal === "maintain" ? profile.weightKg : null);
}
