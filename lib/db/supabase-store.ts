// SupabaseStore: Postgres implementation of Store through supabase-js (service role). Owner: Backend.
// Table shapes match supabase/migrations/0001_init.sql. Rows hold the contract JSON in `data`.
import type { SupabaseClient } from "@supabase/supabase-js";
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
  Reading,
  UserProfile,
} from "@/types/contracts";
import type { AgentLogRecord, FoodSearchOptions, MealRating, Store } from "./store";
import { DEMO_PROFILES, demoReadings, type DemoUserKey } from "./seed/demo-users";

type Row = Record<string, unknown>;

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private readonly db: SupabaseClient) {}

  private async one<T>(table: string, match: Record<string, unknown>): Promise<T | null> {
    const { data, error } = await this.db.from(table).select("data").match(match).maybeSingle();
    if (error) throw new Error(`[supabase] ${table}: ${error.message}`);
    return (data?.data as T) ?? null;
  }

  private async upsertData(table: string, keys: Record<string, unknown>, data: unknown): Promise<void> {
    const { error } = await this.db.from(table).upsert({ ...keys, data, updated_at: new Date().toISOString() });
    if (error) throw new Error(`[supabase] ${table}: ${error.message}`);
  }

  // profile bundle
  getProfile(userId: string) {
    return this.one<UserProfile>("profiles", { user_id: userId });
  }
  saveProfile(profile: UserProfile) {
    return this.upsertData("profiles", { user_id: profile.userId }, profile);
  }
  getConstraints(userId: string) {
    return this.one<MedicalConstraints>("medical_constraints", { user_id: userId });
  }
  saveConstraints(userId: string, constraints: MedicalConstraints) {
    return this.upsertData("medical_constraints", { user_id: userId }, constraints);
  }
  getTargets(userId: string) {
    return this.one<DailyTargets>("daily_targets", { user_id: userId });
  }
  saveTargets(userId: string, targets: DailyTargets) {
    return this.upsertData("daily_targets", { user_id: userId }, targets);
  }
  getTdeePosterior(userId: string) {
    return this.one<{ mean: number; sd: number }>("tdee_posteriors", { user_id: userId });
  }
  saveTdeePosterior(userId: string, posterior: { mean: number; sd: number }) {
    return this.upsertData("tdee_posteriors", { user_id: userId }, posterior);
  }

  // foods
  async getFood(foodId: string) {
    return this.one<Food>("foods", { food_id: foodId });
  }
  async getFoods(foodIds: string[]) {
    if (foodIds.length === 0) return {};
    const { data, error } = await this.db.from("foods").select("data").in("food_id", foodIds);
    if (error) throw new Error(`[supabase] foods: ${error.message}`);
    return Object.fromEntries((data ?? []).map((r: Row) => [(r.data as Food).foodId, r.data as Food]));
  }
  async getAllFoods() {
    const { data, error } = await this.db.from("foods").select("data").limit(5000);
    if (error) throw new Error(`[supabase] foods: ${error.message}`);
    return (data ?? []).map((r: Row) => r.data as Food);
  }
  async searchFoods(query: string, opts: FoodSearchOptions = {}) {
    // Uses the pg_trgm index via the search_foods() SQL function (migration 0001).
    const { data, error } = await this.db.rpc("search_foods", {
      q: query,
      max_results: opts.limit ?? 20,
      excluded_tags: opts.excludeTags ?? [],
    });
    if (error) throw new Error(`[supabase] search_foods: ${error.message}`);
    return (data ?? []).map((r: Row) => r.data as Food);
  }
  async upsertFoods(foods: Food[]) {
    const rows = foods.map((f) => ({ food_id: f.foodId, name: f.name, name_es: f.nameEs ?? null, data: f, tags: f.tags }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.db.from("foods").upsert(rows.slice(i, i + 500));
      if (error) throw new Error(`[supabase] foods upsert: ${error.message}`);
    }
  }
  async getMealTemplates() {
    const { data, error } = await this.db.from("meal_templates").select("data");
    if (error) throw new Error(`[supabase] meal_templates: ${error.message}`);
    return (data ?? []).map((r: Row) => r.data as Omit<CandidateMeal, "tasteScore">);
  }
  async upsertMealTemplates(templates: Omit<CandidateMeal, "tasteScore">[]) {
    const { error } = await this.db
      .from("meal_templates")
      .upsert(templates.map((t) => ({ template_id: t.candidateId, data: t })));
    if (error) throw new Error(`[supabase] meal_templates upsert: ${error.message}`);
  }

  // plans
  async getCurrentPlan(userId: string) {
    const { data, error } = await this.db
      .from("meal_plans")
      .select("data")
      .eq("user_id", userId)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`[supabase] meal_plans: ${error.message}`);
    return (data?.data as MealPlan) ?? null;
  }
  async listPlans(userId: string) {
    const { data, error } = await this.db
      .from("meal_plans")
      .select("data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(`[supabase] meal_plans: ${error.message}`);
    return (data ?? []).map((r: Row) => r.data as MealPlan);
  }
  async savePlan(plan: MealPlan) {
    const { error: clearError } = await this.db
      .from("meal_plans")
      .update({ is_current: false })
      .eq("user_id", plan.userId)
      .eq("is_current", true);
    if (clearError) throw new Error(`[supabase] meal_plans: ${clearError.message}`);
    const { error } = await this.db.from("meal_plans").upsert({
      plan_id: plan.planId,
      user_id: plan.userId,
      version: plan.version,
      is_current: true,
      data: plan,
    });
    if (error) throw new Error(`[supabase] meal_plans upsert: ${error.message}`);
  }

  // logs and readings
  async addFoodLog(entry: FoodLogEntry) {
    const { error } = await this.db
      .from("food_logs")
      .upsert({ log_id: entry.logId, user_id: entry.userId, eaten_at: entry.eatenAt, data: entry });
    if (error) throw new Error(`[supabase] food_logs: ${error.message}`);
  }
  async listFoodLogs(userId: string, opts: { from?: string; to?: string; limit?: number } = {}) {
    let q = this.db.from("food_logs").select("data").eq("user_id", userId).order("eaten_at", { ascending: true });
    if (opts.from) q = q.gte("eaten_at", opts.from);
    if (opts.to) q = q.lt("eaten_at", opts.to);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] food_logs: ${error.message}`);
    return (data ?? []).map((r: Row) => r.data as FoodLogEntry);
  }
  async addReading(r: Reading) {
    const { error } = await this.db.from("readings").insert({
      reading_id: r.readingId,
      user_id: r.userId,
      type: r.type,
      value: r.value,
      value2: r.value2 ?? null,
      unit: r.unit,
      taken_at: r.takenAt,
      related_log_id: r.relatedLogId ?? null,
    });
    if (error) throw new Error(`[supabase] readings: ${error.message}`);
  }
  async listReadings(userId: string, opts: { type?: Reading["type"]; from?: string; limit?: number } = {}) {
    let q = this.db.from("readings").select("*").eq("user_id", userId).order("taken_at", { ascending: true });
    if (opts.type) q = q.eq("type", opts.type);
    if (opts.from) q = q.gte("taken_at", opts.from);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] readings: ${error.message}`);
    return (data ?? []).map(
      (r: Row): Reading => ({
        readingId: r.reading_id as string,
        userId: r.user_id as string,
        type: r.type as Reading["type"],
        value: Number(r.value),
        ...(r.value2 !== null && r.value2 !== undefined ? { value2: Number(r.value2) } : {}),
        unit: r.unit as Reading["unit"],
        takenAt: new Date(r.taken_at as string).toISOString(),
        ...(r.related_log_id ? { relatedLogId: r.related_log_id as string } : {}),
      }),
    );
  }
  async addMealRating(userId: string, rating: MealRating) {
    const { error } = await this.db
      .from("meal_ratings")
      .insert({ user_id: userId, meal_name: rating.mealName, liked: rating.liked });
    if (error) throw new Error(`[supabase] meal_ratings: ${error.message}`);
  }
  async listMealRatings(userId: string) {
    const { data, error } = await this.db.from("meal_ratings").select("meal_name, liked").eq("user_id", userId);
    if (error) throw new Error(`[supabase] meal_ratings: ${error.message}`);
    return (data ?? []).map((r: Row) => ({ mealName: r.meal_name as string, liked: r.liked as boolean }));
  }

  // agent runs
  async createRun(run: { userId: string; trigger: AgentRunTrigger; reason?: string | null }) {
    const { data, error } = await this.db
      .from("agent_runs")
      .insert({ user_id: run.userId, trigger: run.trigger, reason: run.reason ?? null })
      .select("*")
      .single();
    if (error) throw new Error(`[supabase] agent_runs: ${error.message}`);
    return toRun(data as Row);
  }
  async getRun(runId: string) {
    const { data, error } = await this.db.from("agent_runs").select("*").eq("run_id", runId).maybeSingle();
    if (error) throw new Error(`[supabase] agent_runs: ${error.message}`);
    return data ? toRun(data as Row) : null;
  }
  async listRuns(userId: string, opts: { limit?: number; since?: string } = {}) {
    let q = this.db.from("agent_runs").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (opts.since) q = q.gte("created_at", opts.since);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] agent_runs: ${error.message}`);
    return (data ?? []).map((r: Row) => toRun(r));
  }
  async setRunStatus(runId: string, status: AgentRunStatus) {
    const { error } = await this.db.from("agent_runs").update({ status }).eq("run_id", runId);
    if (error) throw new Error(`[supabase] agent_runs: ${error.message}`);
  }
  async addEvent(e: AgentEvent) {
    const { error } = await this.db.from("agent_events").insert({
      event_id: e.eventId,
      run_id: e.runId,
      agent: e.agent,
      kind: e.kind,
      text: e.text,
      data: e.data ?? null,
      at: e.at,
    });
    if (error) throw new Error(`[supabase] agent_events: ${error.message}`);
  }
  async listEvents(runId: string) {
    const { data, error } = await this.db.from("agent_events").select("*").eq("run_id", runId).order("at", { ascending: true });
    if (error) throw new Error(`[supabase] agent_events: ${error.message}`);
    return (data ?? []).map(
      (r: Row): AgentEvent => ({
        eventId: r.event_id as string,
        runId: r.run_id as string,
        agent: r.agent as AgentEvent["agent"],
        kind: r.kind as AgentEvent["kind"],
        text: r.text as string,
        at: new Date(r.at as string).toISOString(),
        ...(r.data ? { data: r.data as Record<string, unknown> } : {}),
      }),
    );
  }
  async waitForEvents(runId: string, afterCount: number, timeoutMs: number) {
    // Simple polling; the frontend may also subscribe to agent_events through Supabase Realtime.
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const events = await this.listEvents(runId);
      if (events.length > afterCount) return events.slice(afterCount);
      const run = await this.getRun(runId);
      if (!run || run.status !== "running" || Date.now() >= deadline) return [];
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  async addAgentLog(log: AgentLogRecord) {
    const { error } = await this.db.from("agent_logs").insert({
      run_id: log.runId,
      agent: log.agent,
      model: log.model,
      input: log.input ?? null,
      output: log.output ?? null,
      ms: log.ms,
    });
    if (error) console.warn(`[supabase] agent_logs: ${error.message}`);
  }

  // demo helpers
  async listUserIds() {
    const { data, error } = await this.db.from("profiles").select("user_id");
    if (error) throw new Error(`[supabase] profiles: ${error.message}`);
    return (data ?? []).map((r: Row) => r.user_id as string);
  }
  async resetUser(userId: string) {
    for (const table of ["meal_plans", "food_logs", "readings", "meal_ratings", "agent_runs", "medical_constraints", "daily_targets", "tdee_posteriors"]) {
      const { error } = await this.db.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`[supabase] reset ${table}: ${error.message}`);
    }
    const key = (Object.keys(DEMO_PROFILES) as DemoUserKey[]).find((k) => DEMO_PROFILES[k].userId === userId);
    if (key) {
      await this.saveProfile(DEMO_PROFILES[key]);
      for (const r of demoReadings(key)) await this.addReading(r);
    }
  }
}

function toRun(r: Row): AgentRun {
  return {
    runId: r.run_id as string,
    userId: r.user_id as string,
    trigger: r.trigger as AgentRun["trigger"],
    reason: (r.reason as string | null) ?? null,
    status: r.status as AgentRunStatus,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}
