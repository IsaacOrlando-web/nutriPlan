// Store interface: the ONLY way application code touches persisted data. Owner: Backend.
//
// Two implementations exist:
//   - MemoryStore   (lib/db/memory-store.ts)   JSON on disk under .data/, seeded with Alex and Maria. Zero setup.
//   - SupabaseStore (lib/db/supabase-store.ts) Postgres through Supabase, matches supabase/migrations.
// `getStore()` in lib/db/index.ts picks one from DATA_BACKEND. Agents and API routes never import an
// implementation directly, so the whole app runs locally on day one and scales to Supabase unchanged.
import type {
  AgentEvent,
  AgentRun,
  AgentRunStatus,
  AgentRunTrigger,
  CandidateMeal,
  DailyTargets,
  Food,
  FoodLogEntry,
  MealPlan,
  MedicalConstraints,
  PlannerSettings,
  PlannerWeekState,
  Reading,
  UserProfile,
  WeeklyMealPlan,
} from "@/types/contracts";
import type { KrogerConnection } from "@/lib/kroger/types";

export interface AgentLogRecord {
  runId: string | null;
  agent: string;
  model: string;
  input: unknown;
  output: unknown;
  ms: number;
}

export interface AppUser {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
  emailVerified: boolean;
  verificationTokenHash: string | null;
  verificationExpiresAt: string | null;
  createdAt: string;
}

export interface MealRating {
  mealName: string;
  liked: boolean;
}

export interface FoodSearchOptions {
  limit?: number;
  /** Only foods without any of these tags (allergies and restrictions). */
  excludeTags?: string[];
}

export interface PlannerWeekRecord {
  plan: WeeklyMealPlan | null;
  state: PlannerWeekState | null;
}

export interface Store {
  readonly kind: "memory" | "supabase";

  // Auth identities
  createUser(user: AppUser): Promise<void>;
  getUserByEmail(email: string): Promise<AppUser | null>;
  findUserByVerificationToken(tokenHash: string): Promise<AppUser | null>;
  getUser(userId: string): Promise<AppUser | null>;
  updateUser(user: AppUser): Promise<void>;
  deleteUser(userId: string): Promise<void>;

  // Profile bundle
  getProfile(userId: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  getConstraints(userId: string): Promise<MedicalConstraints | null>;
  saveConstraints(userId: string, constraints: MedicalConstraints): Promise<void>;
  getTargets(userId: string): Promise<DailyTargets | null>;
  saveTargets(userId: string, targets: DailyTargets): Promise<void>;
  getTdeePosterior(userId: string): Promise<{ mean: number; sd: number } | null>;
  saveTdeePosterior(userId: string, posterior: { mean: number; sd: number }): Promise<void>;

  // Foods and templates (shared, read mostly)
  getFood(foodId: string): Promise<Food | null>;
  getFoods(foodIds: string[]): Promise<Record<string, Food>>;
  getAllFoods(): Promise<Food[]>;
  searchFoods(query: string, opts?: FoodSearchOptions): Promise<Food[]>;
  upsertFoods(foods: Food[]): Promise<void>;
  getMealTemplates(): Promise<Omit<CandidateMeal, "tasteScore">[]>;
  upsertMealTemplates(templates: Omit<CandidateMeal, "tasteScore">[]): Promise<void>;

  // Plans
  getCurrentPlan(userId: string): Promise<MealPlan | null>;
  listPlans(userId: string): Promise<MealPlan[]>;
  savePlan(plan: MealPlan): Promise<void>; // marks it current, previous plans stay as history

  // Logs and readings
  addFoodLog(entry: FoodLogEntry): Promise<void>;
  listFoodLogs(
    userId: string,
    opts?: { from?: string; to?: string; limit?: number },
  ): Promise<FoodLogEntry[]>;
  addReading(reading: Reading): Promise<void>;
  listReadings(
    userId: string,
    opts?: { type?: Reading["type"]; from?: string; limit?: number },
  ): Promise<Reading[]>;
  addMealRating(userId: string, rating: MealRating): Promise<void>;
  listMealRatings(userId: string): Promise<MealRating[]>;

  // Agent runs and events
  createRun(run: { userId: string; trigger: AgentRunTrigger; reason?: string | null }): Promise<AgentRun>;
  getRun(runId: string): Promise<AgentRun | null>;
  listRuns(userId: string, opts?: { limit?: number; since?: string }): Promise<AgentRun[]>;
  setRunStatus(runId: string, status: AgentRunStatus): Promise<void>;
  addEvent(event: AgentEvent): Promise<void>;
  listEvents(runId: string): Promise<AgentEvent[]>;
  /** Resolves with events appended after `afterEventId` (or any new event) or an empty list on timeout. */
  waitForEvents(runId: string, afterCount: number, timeoutMs: number): Promise<AgentEvent[]>;
  addAgentLog(log: AgentLogRecord): Promise<void>;

  // Kroger connection (tokens + chosen store). Type lives in lib/kroger/types.ts until the Lead promotes it.
  getKrogerConnection(userId: string): Promise<KrogerConnection | null>;
  saveKrogerConnection(userId: string, conn: KrogerConnection): Promise<void>;
  deleteKrogerConnection(userId: string): Promise<void>;

  // Weekly meal planner (/plan): one record per user and Monday, plus per user settings and favorites.
  getPlannerWeek(userId: string, weekStartDate: string): Promise<PlannerWeekRecord | null>;
  savePlannerWeekPlan(userId: string, plan: WeeklyMealPlan): Promise<void>;
  savePlannerWeekState(userId: string, weekStartDate: string, state: PlannerWeekState): Promise<void>;
  getPlannerSettings(userId: string): Promise<PlannerSettings | null>;
  savePlannerSettings(userId: string, settings: PlannerSettings): Promise<void>;

  // Demo helpers
  listUserIds(): Promise<string[]>;
  resetUser(userId: string): Promise<void>;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
