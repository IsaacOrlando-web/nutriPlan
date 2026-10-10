// GET /api/agents/runs/[runId]: AgentRunDetail for replay and polling fallback. Owner: Agents.
import type { NextRequest } from "next/server";
import type { AgentRunDetail } from "@/types/contracts";
import { handler, HttpError, json } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ runId: string }> };

export const GET = handler<Ctx>(async (req: NextRequest, ctx) => {
  const { userId } = await requireSession(req);
  const { runId } = await ctx.params;
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run || run.userId !== userId) throw new HttpError(404, "Run not found");
  const events = await store.listEvents(runId);
  return json<AgentRunDetail>({ run, events });
});
