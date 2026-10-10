// GET /api/trends?type= -> Trend (Kalman filtered; empty points when no data). Owner: Backend.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ReadingTypeSchema } from "@/agents/schemas";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { handler, json, parseQuery } from "@/lib/api/http";
import { getTrends } from "@/math";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({ type: ReadingTypeSchema.optional() });

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { type = "weight" } = parseQuery(req, QuerySchema);
  const store = getStore();
  const [readings, profile] = await Promise.all([store.listReadings(userId, { type }), store.getProfile(userId)]);
  return json(getTrends(readings, type, profile?.goal));
});
