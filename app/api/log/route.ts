// GET /api/log?date=YYYY-MM-DD -> FoodLogEntry[]. POST /api/log CreateLogRequest -> CreateLogResponse. Owner: Backend.
// POST computes totals with Math, flags the meal against Doctor's constraints in code, saves it and asks the
// Monitor agent (best effort, 8 s cap) whether anything should change.
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { AgentNote, CreateLogResponse, FoodLogEntry, MedicalConstraints, MonitorResult } from "@/types/contracts";
import { CreateLogRequestSchema } from "@/agents/schemas";
import { requireSession } from "@/lib/auth/session";
import { getStore, newId, nowIso } from "@/lib/db";
import { HttpError, handler, json, parseBody, parseQuery } from "@/lib/api/http";
import { computeTotals } from "@/math";
import { todayDate } from "../profile/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONITOR_TIMEOUT_MS = 8000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({ date: z.string().regex(DATE_RE, "expected YYYY-MM-DD").optional() });

export const GET = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { date = todayDate() } = parseQuery(req, QuerySchema);
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const logs = await getStore().listFoodLogs(userId, { from: date, to: `${next}T00:00:00.000Z` });
  return json(logs.filter((l) => l.eatenAt.startsWith(date)));
});

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await parseBody(req, CreateLogRequestSchema);
  const store = getStore();

  const ids = [...new Set(body.items.map((i) => i.foodId))];
  const foods = await store.getFoods(ids);
  const missing = ids.filter((id) => !foods[id]);
  if (missing.length) throw new HttpError(400, `Unknown foodId: ${missing.join(", ")}`);

  const totals = computeTotals(body.items, foods);
  const constraints = await store.getConstraints(userId);
  const entry: FoodLogEntry = {
    logId: newId(),
    userId,
    eatenAt: body.eatenAt ?? nowIso(),
    photoUrl: body.photoUrl ?? null,
    source: body.source,
    visionAgreement: body.visionAgreement ?? null,
    question: null,
    items: body.items.map((i) => ({ foodId: i.foodId, name: foods[i.foodId].name, grams: i.grams, confidence: i.confidence ?? 1 })),
    totals,
    flags: constraints ? flagMeal(totals, constraints) : [],
  };
  await store.addFoodLog(entry);

  const monitor = await runMonitorSafely(userId, "log");
  const res: CreateLogResponse = { entry, monitor };
  return json(res, { status: 201 });
});

/** Code checks of one meal against Doctor's hard limits (no LLM involved). */
function flagMeal(totals: FoodLogEntry["totals"], c: MedicalConstraints): AgentNote[] {
  const flags: AgentNote[] = [];
  if (totals.sodiumMg > c.maxSodiumMgPerDay * 0.5) {
    flags.push({ agent: "doctor", text: `This meal has ${totals.sodiumMg} mg sodium, over half your ${c.maxSodiumMgPerDay} mg daily cap.` });
  }
  if (c.maxCarbsPerMealG !== undefined && totals.carbsG > c.maxCarbsPerMealG) {
    flags.push({ agent: "doctor", text: `${totals.carbsG} g carbs is above your ${c.maxCarbsPerMealG} g per meal limit.` });
  }
  if (c.maxGlycemicLoadPerMeal !== undefined && totals.glycemicLoad > c.maxGlycemicLoadPerMeal) {
    flags.push({ agent: "doctor", text: `Glycemic load ${totals.glycemicLoad} is above your ${c.maxGlycemicLoadPerMeal} per meal limit.` });
  }
  if (totals.addedSugarG > c.maxAddedSugarG * 0.5) {
    flags.push({ agent: "doctor", text: `${totals.addedSugarG} g added sugar is over half your ${c.maxAddedSugarG} g daily cap.` });
  }
  return flags;
}

const MONITOR_BUSY: MonitorResult = { action: "none", reason: "Monitor is busy", runId: null, alerts: [] };

type MonitorModule = { runMonitor: (userId: string, trigger: "log" | "reading") => Promise<MonitorResult> };

/** Runs the Monitor agent with a timeout; a slow or missing agent never blocks logging. */
async function runMonitorSafely(userId: string, trigger: "log" | "reading"): Promise<MonitorResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<MonitorResult>((resolve) => {
      timer = setTimeout(() => resolve(MONITOR_BUSY), MONITOR_TIMEOUT_MS);
    });
    const run = (async () => {
      const mod = (await import("@/agents/monitor")) as unknown as MonitorModule;
      return mod.runMonitor(userId, trigger);
    })();
    return await Promise.race([run, timeout]);
  } catch {
    return MONITOR_BUSY;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
