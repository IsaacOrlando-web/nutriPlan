// getStore(): returns the local JSON-backed store. Owner: Backend.
import path from "node:path";
import { MemoryStore } from "./memory-store";
import type { Store } from "./store";

export type { Store, AgentLogRecord, AppUser, FoodSearchOptions, MealRating } from "./store";
export { newId, nowIso } from "./store";

const globalRef = globalThis as unknown as { __nutriplanStore?: Store };

export function getStore(): Store {
  if (globalRef.__nutriplanStore) return globalRef.__nutriplanStore;
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
