// GET /api/kroger/locations?zip=45202[&limit=5][&chain=Kroger] -> { locations: KrogerLocation[] }. Owner: Backend.
// Uses the app (client credentials) token; 503 { error, code: "kroger_not_configured" } without credentials.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { json, parseQuery } from "@/lib/api/http";
import { searchLocations } from "@/lib/kroger/client";
import { krogerHandler } from "@/lib/kroger/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  zip: z.string().regex(/^\d{5}$/, "must be a 5 digit US zip code"),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  chain: z.string().min(1).max(40).optional(),
});

export const GET = krogerHandler(async (req: NextRequest) => {
  await requireSession(req);
  const { zip, limit, chain } = parseQuery(req, querySchema);
  const locations = await searchLocations(zip, { limit: limit ?? 5, chain });
  return json({ locations });
});
