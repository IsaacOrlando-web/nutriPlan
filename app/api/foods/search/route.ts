// GET /api/foods/search?q=&limit= -> Food[]. Excludes the user's allergens and restrictions. Owner: Backend.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { handler, json, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { q = "", limit = 20 } = parseQuery(req, QuerySchema);
  const store = getStore();
  const constraints = await store.getConstraints(userId);
  const foods = await store.searchFoods(q, { limit, excludeTags: constraints?.excludedFoodTags ?? [] });
  return json(foods);
});
