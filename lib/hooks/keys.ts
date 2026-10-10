import type { ReadingType } from "@/types/contracts";

/** Query keys for every resource. Keep them here so invalidation stays consistent. */
export const keys = {
  session: ["session"] as const,
  profile: ["profile"] as const,
  plan: ["plan"] as const,
  curve: ["plan", "curve"] as const,
  curvePlanAt: (budget: number) => ["plan", "curve", "at", budget] as const,
  agentRun: (runId: string) => ["agentRun", runId] as const,
  foodSearch: (q: string) => ["foods", "search", q] as const,
  logs: (date?: string) => ["logs", date ?? "all"] as const,
  logsRoot: ["logs"] as const,
  readings: (type?: ReadingType) => ["readings", type ?? "all"] as const,
  readingsRoot: ["readings"] as const,
  trend: (type: ReadingType) => ["trend", type] as const,
  trendRoot: ["trend"] as const,
  summary: (date?: string) => ["summary", date ?? "today"] as const,
  summaryRoot: ["summary"] as const,
};
