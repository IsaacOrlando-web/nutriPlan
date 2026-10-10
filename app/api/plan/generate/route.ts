// POST /api/plan/generate: starts a negotiation run and returns { runId } immediately. Owner: Agents.
import type { NextRequest } from "next/server";
import type { GeneratePlanResponse } from "@/types/contracts";
import { handler, HttpError, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { GeneratePlanRequestSchema } from "@/agents/schemas";
import { startPlanRun } from "@/agents/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await parseBody(req, GeneratePlanRequestSchema);
  const store = getStore();
  const profile = await store.getProfile(userId);
  if (!profile) throw new HttpError(404, "Complete onboarding before generating a plan");

  if (body.weeklyBudgetUsd !== undefined && body.weeklyBudgetUsd !== profile.weeklyBudgetUsd) {
    await store.saveProfile({ ...profile, weeklyBudgetUsd: body.weeklyBudgetUsd });
  }
  const trigger = body.trigger ?? (body.weeklyBudgetUsd !== undefined ? "budget_change" : "manual");
  const { runId } = await startPlanRun({
    userId,
    trigger,
    reason: body.reason ?? null,
    weeklyBudgetUsd: body.weeklyBudgetUsd,
  });
  return json<GeneratePlanResponse>({ runId }, { status: 202 });
});
