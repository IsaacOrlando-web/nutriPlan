// POST /api/simulate { weeks? } -> SimulationResult (stretch: 12 week Monte Carlo outcome). Owner: Backend.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { HttpError, handler, json, parseBody } from "@/lib/api/http";
import { simulate } from "@/math";
import { getBundle } from "../profile/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SimulateSchema = z.object({ weeks: z.number().int().min(1).max(52).optional() });

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { weeks } = await parseBody(req, SimulateSchema);
  const store = getStore();
  const bundle = await getBundle(store, userId);
  if (!bundle) throw new HttpError(404, "No profile yet");
  const plan = await store.getCurrentPlan(userId);
  if (!plan) throw new HttpError(404, "No plan yet");
  const posterior = (await store.getTdeePosterior(userId)) ?? {
    mean: bundle.targets.tdeeEstimate,
    sd: bundle.targets.tdeeUncertainty,
  };
  return json(simulate(bundle.profile, plan, posterior, weeks ?? 12));
});
