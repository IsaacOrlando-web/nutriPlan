// GET /api/summary?date= -> DaySummary (targets, eaten so far, remaining). Owner: Backend.
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { DaySummary } from "@/types/contracts";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseQuery } from "@/lib/api/http";
import { subtractTotals, sumTotals } from "@/math";
import { getBundle, targetsAsTotals, todayDate } from "../profile/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional() });

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { date = todayDate() } = parseQuery(req, QuerySchema);
  const store = getStore();
  const bundle = await getBundle(store, userId);
  if (!bundle) throw new HttpError(404, "No profile yet");

  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const logs = (await store.listFoodLogs(userId, { from: date, to: `${next}T00:00:00.000Z` })).filter((l) => l.eatenAt.startsWith(date));
  const eaten = sumTotals(logs.map((l) => l.totals));
  const summary: DaySummary = {
    date,
    targets: bundle.targets,
    eaten,
    remaining: subtractTotals(targetsAsTotals(bundle.targets), eaten),
  };
  return json(summary);
});
