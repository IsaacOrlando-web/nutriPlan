// POST /api/kroger/location { locationId, name, zip? } -> KrogerStatus. Owner: Backend.
// Saves the chosen store on the user's Kroger connection (a shell without tokens is fine).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { json, parseBody } from "@/lib/api/http";
import { krogerHandler } from "@/lib/kroger/http";
import type { KrogerConnection } from "@/lib/kroger/types";
import { statusFor } from "@/lib/kroger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  locationId: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  zip: z
    .string()
    .regex(/^\d{5}$/, "must be a 5 digit US zip code")
    .optional(),
});

export const POST = krogerHandler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const { locationId, name, zip } = await parseBody(req, bodySchema);
  const store = getStore();
  const existing = await store.getKrogerConnection(userId);
  const conn: KrogerConnection = {
    ...(existing ?? {}),
    locationId,
    locationName: name,
    zip: zip ?? existing?.zip,
  };
  await store.saveKrogerConnection(userId, conn);
  return json(statusFor(conn));
});
