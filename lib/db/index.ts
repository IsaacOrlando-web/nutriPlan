// getStore(): picks the Store implementation from DATA_BACKEND. Owner: Backend.
//   DATA_BACKEND=memory    (default) JSON under .data/, seeded with Alex and Maria. Zero setup.
//   DATA_BACKEND=supabase  Postgres through SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (migrations in /supabase).
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MemoryStore } from "./memory-store";
import { SupabaseStore } from "./supabase-store";
import type { Store } from "./store";

export type { Store, AgentLogRecord, FoodSearchOptions, MealRating } from "./store";
export { newId, nowIso } from "./store";

const globalRef = globalThis as unknown as { __nutriplanStore?: Store };

export function getStore(): Store {
  if (globalRef.__nutriplanStore) return globalRef.__nutriplanStore;
  const backend = process.env.DATA_BACKEND ?? "memory";
  let store: Store;
  if (backend === "supabase") {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("DATA_BACKEND=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    store = new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  } else {
    const file =
      process.env.MEMORY_STORE_FILE === "none"
        ? null
        : path.resolve(process.cwd(), process.env.MEMORY_STORE_FILE ?? ".data/store.json");
    store = new MemoryStore(file);
  }
  globalRef.__nutriplanStore = store;
  return store;
}

/** Tests and scripts can swap the store (for example an in-memory store with no file). */
export function setStore(store: Store | undefined): void {
  globalRef.__nutriplanStore = store;
}
