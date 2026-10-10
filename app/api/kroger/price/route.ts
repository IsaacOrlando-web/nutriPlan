// POST /api/kroger/price -> KrogerPriceResponse { items, totalUsd, matched, unmatched }. Owner: Backend.
// Prices the current plan's grocery list at the user's saved store (or KROGER_LOCATION_ID) with real shelf prices.
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { json } from "@/lib/api/http";
import { krogerHandler } from "@/lib/kroger/http";
import { priceCurrentPlan } from "@/lib/kroger/service";
import type { KrogerPriceResponse } from "@/lib/kroger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = krogerHandler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body: KrogerPriceResponse = await priceCurrentPlan(userId);
  return json(body);
});
