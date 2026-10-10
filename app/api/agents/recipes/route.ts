// POST /api/agents/recipes: two recipe ideas built from the user's stored profile. Owner: Agents.
import type { NextRequest } from "next/server";
import type { RecipeIdeasResponse } from "@/types/contracts";
import { handler, HttpError, json } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { generateRecipeIdeas } from "@/agents/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const store = getStore();
  if (!(await store.getProfile(userId)))
    throw new HttpError(404, "Complete onboarding before asking for recipes");
  const result = await generateRecipeIdeas(userId, { store });
  return json<RecipeIdeasResponse>(result);
});
