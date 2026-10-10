// Per user Kroger connection helpers on top of the Store. Owner: Backend.
import { getStore } from "@/lib/db";
import { KrogerError, refreshToken } from "./client";
import type { KrogerConnection } from "./types";

const REFRESH_SKEW_MS = 60_000;

export function hasUserTokens(
  conn: KrogerConnection | null,
): conn is KrogerConnection & { accessToken: string } {
  return !!conn?.accessToken;
}

/** The store to price at: the user's pick, else KROGER_LOCATION_ID from the environment. */
export function resolveLocation(conn: KrogerConnection | null): { id: string; name: string } {
  const id = conn?.locationId || process.env.KROGER_LOCATION_ID;
  if (!id)
    throw new KrogerError(400, "kroger_no_location", "Pick a Kroger store first (POST /api/kroger/location)");
  return { id, name: conn?.locationId ? (conn.locationName ?? "Kroger") : "Kroger" };
}

/** Valid user access token, refreshing (and persisting) it when it is within a minute of expiring. */
export async function getUserAccessToken(userId: string): Promise<string> {
  const store = getStore();
  const conn = await store.getKrogerConnection(userId);
  if (!hasUserTokens(conn))
    throw new KrogerError(401, "kroger_not_connected", "Connect your Kroger account first");
  const expiresAt = conn.expiresAt ? Date.parse(conn.expiresAt) : 0;
  if (expiresAt - REFRESH_SKEW_MS > Date.now()) return conn.accessToken;
  if (!conn.refreshToken)
    throw new KrogerError(401, "kroger_not_connected", "Kroger session expired; connect again");
  let fresh;
  try {
    fresh = await refreshToken(conn.refreshToken);
  } catch (err) {
    if (err instanceof KrogerError && err.code === "kroger_auth_failed") {
      await store.saveKrogerConnection(userId, {
        ...conn,
        accessToken: undefined,
        refreshToken: undefined,
        expiresAt: undefined,
      });
      throw new KrogerError(401, "kroger_not_connected", "Kroger session expired; connect again");
    }
    throw err;
  }
  const updated: KrogerConnection = {
    ...conn,
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken ?? conn.refreshToken,
    expiresAt: fresh.expiresAt,
  };
  await store.saveKrogerConnection(userId, updated);
  return updated.accessToken!;
}
