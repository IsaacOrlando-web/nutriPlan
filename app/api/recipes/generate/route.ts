// POST /api/recipes/generate: ReplaceRecipeRequest -> ReplaceRecipeResponse. Owner: Agents.
// One replacement recipe of the same meal type, swapped into the saved week; no other meal changes.
import type { NextRequest } from "next/server";
import type { ReplaceRecipeResponse } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { ReplaceRecipeRequestSchema } from "@/agents/schemas/planner";
import { replaceRecipe } from "@/agents/planner";
import { LIMITS, requireProfile, runPlanner } from "@/app/api/meal-plans/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { weekStartDate, date, mealType, currentRecipe, ...overrides } = await parseBody(req, ReplaceRecipeRequestSchema, {
    maxBytes: LIMITS.generate,
  });
  await requireProfile(userId);
  return runPlanner(
    () => replaceRecipe(userId, weekStartDate, date, mealType, currentRecipe, overrides),
    (res) => json<ReplaceRecipeResponse>(res),
  );
});
