// POST /api/planner/favorites: FavoriteRequest -> { favorites: Recipe[] }. Owner: Agents.
import type { NextRequest } from "next/server";
import type { Recipe } from "@/types/contracts";
import { handler, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { FavoriteRequestSchema } from "@/agents/schemas/planner";
import { setFavorite } from "@/agents/planner/settings";
import { LIMITS, requireProfile } from "@/app/api/meal-plans/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { recipe, favorite } = await parseBody(req, FavoriteRequestSchema, { maxBytes: LIMITS.favorites });
  await requireProfile(userId);
  const favorites = await setFavorite(getStore(), userId, recipe as Recipe, favorite);
  return json<{ favorites: Recipe[] }>({ favorites });
});
