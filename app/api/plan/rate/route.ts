// POST /api/plan/rate { mealName, liked } -> 204. Feeds Chef's taste model (Thompson sampling). Owner: Backend.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { handler, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RateSchema = z.object({
  mealName: z.string().trim().min(1).max(120),
  liked: z.boolean(),
});

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const rating = await parseBody(req, RateSchema);
  await getStore().addMealRating(userId, rating);
  return new NextResponse(null, { status: 204 });
});
