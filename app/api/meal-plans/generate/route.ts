// POST /api/meal-plans/generate: GenerateWeekRequest -> GenerateWeekResponse. Owner: Agents.
// 21 OpenAI recipes, validated in code before saving; the previous plan stays if generation fails.
import type { NextRequest } from "next/server";
import type { GenerateWeekResponse } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { GenerateWeekRequestSchema } from "@/agents/schemas/planner";
import { generateWeek } from "@/agents/planner";
import { LIMITS, requireProfile, runPlanner } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { weekStartDate, ...overrides } = await parseBody(req, GenerateWeekRequestSchema, { maxBytes: LIMITS.generate });
  await requireProfile(userId);
  return runPlanner(
    () => generateWeek(userId, weekStartDate, overrides),
    (plan) => json<GenerateWeekResponse>({ plan }),
  );
});
