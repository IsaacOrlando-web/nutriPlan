// POST /api/kroger/cart { items?: [{ upc, quantity }] } -> KrogerCartResponse { added, skipped }. Owner: Backend.
// Without items: prices the current grocery list and adds every matched product (packagesNeeded each).
// Refreshes the user's Kroger token when it has expired. 401 { code: "kroger_not_connected" } before OAuth.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { HttpError, json } from "@/lib/api/http";
import { addToCart, type CartItem } from "@/lib/kroger/client";
import { getUserAccessToken } from "@/lib/kroger/connection";
import { krogerHandler } from "@/lib/kroger/http";
import type { KrogerCartResponse } from "@/lib/kroger/types";
import { priceCurrentPlan } from "@/lib/kroger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        upc: z.string().regex(/^\d{6,14}$/, "must be a UPC"),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .max(200)
    .optional(),
  modality: z.enum(["PICKUP", "DELIVERY"]).optional(),
});

/** Body is optional: an empty request means "send the whole grocery list". */
async function readBody(req: NextRequest): Promise<z.infer<typeof bodySchema>> {
  const raw = (await req.text()).trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  const result = bodySchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, `${issue.path.join(".") || "body"}: ${issue.message}`);
  }
  return result.data;
}

export const POST = krogerHandler(async (req: NextRequest) => {
  const { userId } = await requireSession(req);
  const body = await readBody(req);
  const token = await getUserAccessToken(userId);

  let items: CartItem[];
  let skipped: string[] = [];
  if (body.items) {
    items = body.items.map((i) => ({ upc: i.upc, quantity: i.quantity, modality: body.modality }));
  } else {
    const priced = await priceCurrentPlan(userId);
    items = priced.items
      .filter((i) => i.kroger)
      .map((i) => ({ upc: i.kroger!.upc, quantity: i.kroger!.packagesNeeded, modality: body.modality }));
    skipped = priced.unmatched;
  }
  await addToCart(token, items);
  const res: KrogerCartResponse = { added: items.length, skipped };
  return json(res);
});
