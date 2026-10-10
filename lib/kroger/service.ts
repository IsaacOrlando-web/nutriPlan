// Route-level Kroger operations shared by several /app/api/kroger handlers. Owner: Backend.
import { getStore } from "@/lib/db";
import { HttpError } from "@/lib/api/http";
import { isKrogerConfigured, KrogerError } from "./client";
import { hasUserTokens, resolveLocation } from "./connection";
import { priceGroceryList } from "./pricing";
import type { KrogerConnection, KrogerPriceResponse, KrogerStatus } from "./types";

export function statusFor(conn: KrogerConnection | null): KrogerStatus {
  let location: KrogerStatus["location"] = null;
  try {
    location = resolveLocation(conn);
  } catch {
    location = null;
  }
  return { configured: isKrogerConfigured(), connected: hasUserTokens(conn), location };
}

/** Prices the user's current plan grocery list at their store. Throws KrogerError / HttpError(404) when it cannot. */
export async function priceCurrentPlan(userId: string): Promise<KrogerPriceResponse> {
  if (!isKrogerConfigured()) {
    throw new KrogerError(
      503,
      "kroger_not_configured",
      "Kroger is not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.",
    );
  }
  const store = getStore();
  const conn = await store.getKrogerConnection(userId);
  const location = resolveLocation(conn);
  const plan = await store.getCurrentPlan(userId);
  if (!plan) throw new HttpError(404, "No plan yet");
  const foods = await store.getFoods(plan.groceryList.map((g) => g.foodId));
  return priceGroceryList(plan.groceryList, foods, location.id);
}
