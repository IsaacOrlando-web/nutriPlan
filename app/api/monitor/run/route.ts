// POST /api/monitor/run: runs Monitor manually and returns MonitorResult. Owner: Agents.
import type { NextRequest } from "next/server";
import type { MonitorResult } from "@/types/contracts";
import { handler, json } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { runMonitor } from "@/agents/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const result = await runMonitor(userId, "manual");
  return json<MonitorResult>(result);
});
