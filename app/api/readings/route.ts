// GET /api/readings?type= -> Reading[]. POST /api/readings CreateReadingRequest -> CreateReadingResponse. Owner: Backend.
// POST saves the reading, runs Doctor's danger check in code (always an urgent alert, even if the Monitor agent
// is unavailable) and then asks the Monitor agent (best effort, 8 s cap).
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { CreateReadingResponse, MonitorAlert, MonitorResult, Reading } from "@/types/contracts";
import { CreateReadingRequestSchema, ReadingTypeSchema } from "@/agents/schemas";
import { checkDangerReading } from "@/agents/rules/engine";
import { requireSession } from "@/lib/auth/session";
import { getStore, newId, nowIso } from "@/lib/db";
import { HttpError, handler, json, parseBody, parseQuery } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONITOR_TIMEOUT_MS = 8000;

const UNIT_BY_TYPE: Record<Reading["type"], Reading["unit"]> = {
  weight: "kg",
  glucose_fasting: "mg/dL",
  glucose_post_meal: "mg/dL",
  bp: "mmHg",
};

const QuerySchema = z.object({ type: ReadingTypeSchema.optional() });

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { type } = parseQuery(req, QuerySchema);
  const readings = await getStore().listReadings(userId, type ? { type } : {});
  return json(readings);
});

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await parseBody(req, CreateReadingRequestSchema);
  if (body.type === "bp" && body.value2 === undefined) throw new HttpError(400, "value2: diastolic value is required for bp");
  if (body.takenAt !== undefined && Number.isNaN(Date.parse(body.takenAt))) throw new HttpError(400, "takenAt: invalid date");

  const reading: Reading = {
    readingId: newId(),
    userId,
    type: body.type,
    value: body.value,
    ...(body.type === "bp" ? { value2: body.value2 } : {}),
    unit: UNIT_BY_TYPE[body.type],
    takenAt: body.takenAt ? new Date(body.takenAt).toISOString() : nowIso(),
  };
  await getStore().addReading(reading);

  const danger = checkDangerReading(reading.type, reading.value, reading.value2);
  const monitor = await runMonitorSafely(userId, "reading");
  if (danger.danger && danger.message) {
    const urgent: MonitorAlert = { level: "urgent", title: "Reading in the danger range", body: danger.message, source: "doctor" };
    const already = monitor.alerts.some((a) => a.level === "urgent" && a.body === urgent.body);
    if (!already) monitor.alerts = [urgent, ...monitor.alerts];
    if (monitor.action === "none") monitor.action = "alert";
  }
  const res: CreateReadingResponse = { reading, monitor };
  return json(res, { status: 201 });
});

const MONITOR_BUSY = (): MonitorResult => ({ action: "none", reason: "Monitor is busy", runId: null, alerts: [] });

type MonitorModule = { runMonitor: (userId: string, trigger: "log" | "reading") => Promise<MonitorResult> };

async function runMonitorSafely(userId: string, trigger: "log" | "reading"): Promise<MonitorResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<MonitorResult>((resolve) => {
      timer = setTimeout(() => resolve(MONITOR_BUSY()), MONITOR_TIMEOUT_MS);
    });
    const run = (async () => {
      const mod = (await import("@/agents/monitor")) as unknown as MonitorModule;
      return mod.runMonitor(userId, trigger);
    })();
    const result = await Promise.race([run, timeout]);
    return { ...result, alerts: [...(result.alerts ?? [])] };
  } catch {
    return MONITOR_BUSY();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
