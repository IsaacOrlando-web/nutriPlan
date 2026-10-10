// POST /api/meal-plans/generate-day: GenerateDayRequest -> GenerateDayResponse. Owner: Agents.
// Regenerates breakfast, lunch and dinner for one day of a saved week; other days are untouched.
import type { NextRequest } from "next/server";
import type { GenerateDayResponse } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { GenerateDayRequestSchema } from "@/agents/schemas/planner";
import { generateDay } from "@/agents/planner";
import { LIMITS, requireProfile, runPlanner } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { weekStartDate, date, ...overrides } = await parseBody(req, GenerateDayRequestSchema, { maxBytes: LIMITS.generate });
  await requireProfile(userId);
  return runPlanner(
    () => generateDay(userId, weekStartDate, date, overrides),
    (res) => json<GenerateDayResponse>(res),
  );
});
