// POST /api/log/photo: two vision models read the photo, code votes, logs or asks one question. Owner: Agents.
import type { NextRequest } from "next/server";
import type { AgentNote, FoodLogEntry, PhotoLogResult } from "@/types/contracts";
import { handler, HttpError, json, parseBody } from "@/lib/api/http";
import { requireSession } from "@/lib/auth/session";
import { getStore, newId, nowIso } from "@/lib/db";
import { PhotoLogRequestSchema } from "@/agents/schemas";
import { analyzePhoto } from "@/agents/vision/analyze";
import { voteOnReadings } from "@/agents/vision/vote";
import { computeTotals } from "@/agents/tools/math";
import { runMonitor } from "@/agents/monitor";
import { buildConstraints } from "@/agents/rules/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONITOR_CAP_MS = 8_000;

export const POST = handler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await parseBody(req, PhotoLogRequestSchema);
  const store = getStore();
  const profile = await store.getProfile(userId);
  if (!profile) throw new HttpError(404, "Complete onboarding before logging meals");
  const constraints = (await store.getConstraints(userId)) ?? buildConstraints(profile);

  const { a, b } = await analyzePhoto(body.photoUrl, store);
  const vote = voteOnReadings(a, b);

  const foods = await store.getFoods(vote.items.map((i) => i.foodId));
  const items = vote.items.filter((i) => foods[i.foodId]);
  const totals = computeTotals(items, foods);

  // Flags are code checks against the Doctor's rules; the text is plain language with math numbers.
  const flags: AgentNote[] = [];
  const sodiumShare =
    constraints.maxSodiumMgPerDay > 0
      ? Math.round((totals.sodiumMg / constraints.maxSodiumMgPerDay) * 100)
      : 0;
  if (sodiumShare >= 50)
    flags.push({
      agent: "doctor",
      text: `This meal carries ${sodiumShare}% of your ${constraints.maxSodiumMgPerDay} mg daily sodium cap. Go light on salt for the rest of the day.`,
    });
  if (constraints.maxCarbsPerMealG !== undefined && totals.carbsG > constraints.maxCarbsPerMealG)
    flags.push({
      agent: "doctor",
      text: `${totals.carbsG} g carbs is over your ${constraints.maxCarbsPerMealG} g per meal cap. A short walk after eating helps.`,
    });
  if (
    constraints.maxGlycemicLoadPerMeal !== undefined &&
    totals.glycemicLoad > constraints.maxGlycemicLoadPerMeal
  )
    flags.push({
      agent: "doctor",
      text: `Glycemic load ${totals.glycemicLoad} is above your per meal limit of ${constraints.maxGlycemicLoadPerMeal}.`,
    });
  if (flags.length === 0)
    flags.push({
      agent: "monitor",
      text: vote.logged
        ? `Logged: ${totals.calories} kcal, ${totals.proteinG} g protein. Right on track.`
        : "Almost there, one quick question and I will log it.",
    });

  const entry: FoodLogEntry = {
    logId: newId(),
    userId,
    eatenAt: body.eatenAt ?? nowIso(),
    photoUrl: body.photoUrl.startsWith("data:") ? null : body.photoUrl,
    source: "photo",
    visionAgreement: vote.agreement,
    question: vote.logged ? null : vote.question,
    items,
    totals,
    flags,
  };

  if (vote.logged) {
    await store.addFoodLog(entry);
    // Monitor reacts to the new log; capped so the photo response stays fast.
    await Promise.race([
      runMonitor(userId, "log", { store }).catch((err) =>
        console.warn("[log/photo] monitor failed:", (err as Error).message),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, MONITOR_CAP_MS)),
    ]);
  }

  const result: PhotoLogResult = { logged: vote.logged, entry, votes: { a, b, agreement: vote.agreement } };
  return json(result);
});
