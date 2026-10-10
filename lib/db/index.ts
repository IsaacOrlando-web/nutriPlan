// getStore(): returns the local JSON-backed store. Owner: Backend.
import path from "node:path";
import { MemoryStore } from "./memory-store";
import type { Store } from "./store";

export type { Store, AgentLogRecord, AppUser, FoodSearchOptions, MealRating } from "./store";
export { newId, nowIso } from "./store";

const globalRef = globalThis as unknown as { __nutriplanStore?: Store };

/** True when a store cached before a hot reload lacks methods added to MemoryStore since (dev only). */
function isStale(store: Store): boolean {
  if (!(store instanceof Object) || store.constructor?.name !== MemoryStore.name) return false;
  return Object.getOwnPropertyNames(MemoryStore.prototype).some(
    (m) => typeof (store as unknown as Record<string, unknown>)[m] !== "function",
  );
}

export function getStore(): Store {
  const cached = globalRef.__nutriplanStore;
  // A file-backed store reloads from disk, so rebuilding it after a hot reload keeps every saved record.
  if (cached && !(isStale(cached) && process.env.MEMORY_STORE_FILE !== "none")) return cached;
  const file =
    process.env.MEMORY_STORE_FILE === "none"
      ? null
      : path.resolve(process.cwd(), process.env.MEMORY_STORE_FILE ?? ".data/store.json");
  const store: Store = new MemoryStore(file);
  globalRef.__nutriplanStore = store;
  return store;
}

/** Tests and scripts can swap the store (for example an in-memory store with no file). */
export function setStore(store: Store | undefined): void {
  globalRef.__nutriplanStore = store;
}
