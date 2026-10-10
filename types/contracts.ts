// /types/contracts.ts  (owner: Lead)
// ALL shared types. Every role imports from here. Only the Lead edits this file.
// Units: kilograms, centimeters, kcal, grams, milligrams, US dollars.

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type Condition = "type2_diabetes" | "hypertension" | "kidney_disease" | "high_cholesterol";
export type Language = "en" | "es";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type AgentName = "doctor" | "chef" | "budget" | "monitor" | "orchestrator";
export type AgentEventKind = "proposal" | "objection" | "concession" | "tool_call" | "decision";
export type ReadingType = "weight" | "glucose_fasting" | "glucose_post_meal" | "bp";

export interface UserProfile {
  userId: string;
  name: string;
  language: Language;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  goalRateKgPerWeek: number; // 0 for maintain
  conditions: Condition[]; // empty for most users
  medications: string[];
  allergies: string[]; // e.g. "peanut"
  restrictions: string[]; // e.g. "vegetarian", "halal", "no_pork"
  likes: string[];
  dislikes: string[];
  weeklyBudgetUsd: number;
  mealsPerDay: 3 | 4;
}

export interface MedicalConstraints {
  minCaloriesPerDay: number;
  minFiberG: number;
  maxAddedSugarG: number;
  maxSodiumMgPerDay: number;
  maxSatFatPct: number;
  maxCarbsPerMealG?: number; // diabetes
  maxGlycemicLoadPerMeal?: number; // diabetes
  minPotassiumMgPerDay?: number; // hypertension, never with kidney_disease
  excludedFoodTags: string[]; // allergies and restrictions
  reasons: { rule: string; why: string; source: string }[];
  summary: string;
}

export interface DailyTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
  potassiumMg: number;
  tdeeEstimate: number;
  tdeeUncertainty: number; // standard deviation, kcal
}

export interface Food {
  foodId: string;
  name: string;
  nameEs?: string;
  per100g: Nutrients;
  glycemicIndex?: number;
  giEstimated: boolean;
  priceUsdPer100g?: number;
  servingG: number;
  servingLabel: string; // "1 egg", "1 cup cooked"
  tags: string[]; // "meat", "fish", "dairy", "vegan", "gluten", "nuts", "peanut", "pork", "legume"
  storeSection: "produce" | "protein" | "dairy" | "grains" | "pantry" | "frozen" | "other";
}

export interface Nutrients {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  addedSugarG: number;
  satFatG: number;
  sodiumMg: number;
  potassiumMg: number;
}

export interface MealTotals extends Nutrients {
  glycemicLoad: number;
  costUsd: number;
}

export interface MealItem {
  foodId: string;
  name: string;
  servings: number; // integer servings from the optimizer
  grams: number;
}

export interface AgentNote {
  agent: AgentName;
  text: string;
}

export interface Meal {
  mealId: string;
  type: MealType;
  name: string;
  cuisine: string;
  recipeSteps: string[];
  prepMinutes: number;
  items: MealItem[];
  totals: MealTotals;
  explanation: AgentNote[];
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  meals: Meal[];
  dayTotals: MealTotals;
}

export interface GroceryItem {
  foodId: string;
  name: string;
  quantityG: number;
  quantityLabel: string;
  costUsd: number;
  storeSection: Food["storeSection"];
}

export interface ShadowPrice {
  constraint: string; // "weekly_budget", "max_sodium", ...
  value: number; // objective improvement per unit relaxed
  humanText: string; // "Raising your budget by $5 would let Chef add salmon twice"
}

export interface MealPlan {
  planId: string;
  userId: string;
  version: number;
  reason: string;
  runId: string;
  startDate: string;
  weeklyCostUsd: number;
  days: PlanDay[];
  groceryList: GroceryItem[];
  shadowPrices: ShadowPrice[];
  bestEffort: boolean;
}

export interface FoodLogItem {
  foodId: string;
  name: string;
  grams: number;
  confidence: number; // 0 to 1
}

export interface FoodLogEntry {
  logId: string;
  userId: string;
  eatenAt: string;
  photoUrl: string | null;
  source: "photo" | "manual" | "plan";
  visionAgreement: number | null;
  question: { text: string; options: string[] } | null;
  items: FoodLogItem[];
  totals: MealTotals;
  flags: AgentNote[];
}

export interface Reading {
  readingId: string;
  userId: string;
  type: ReadingType;
  value: number; // kg, mg/dL, or systolic mmHg
  value2?: number; // diastolic mmHg
  unit: "kg" | "mg/dL" | "mmHg";
  takenAt: string;
  relatedLogId?: string;
}

export interface TrendPoint {
  date: string;
  raw: number | null;
  filtered: number;
  lower: number;
  upper: number;
}

export interface Trend {
  type: ReadingType;
  points: TrendPoint[];
  slopePerWeek: number;
  alert: "none" | "rising" | "falling" | "stalled" | "too_fast";
}

export interface AgentEvent {
  eventId: string;
  runId: string;
  agent: AgentName;
  kind: AgentEventKind;
  text: string; // under 140 characters
  at: string;
  data?: Record<string, unknown>;
}

export interface DaySummary {
  date: string;
  targets: DailyTargets;
  eaten: MealTotals;
  remaining: MealTotals;
}

// Math interfaces (agreed between Agents and Math on day one)

export interface CandidateMeal {
  candidateId: string;
  type: MealType;
  name: string;
  cuisine: string;
  recipeSteps: string[];
  prepMinutes: number;
  ingredients: { foodId: string; minServings: number; maxServings: number }[];
  tasteScore: number; // 0 to 1, from Chef (or Thompson sampling)
  pitch: string;
}

export interface Concessions {
  maxRepeatsPerWeek: 2 | 3;
  budgetSlackPct: 0 | 5 | 10;
}

export interface OptimizeInput {
  pool: CandidateMeal[];
  foods: Record<string, Food>;
  targets: DailyTargets;
  constraints: MedicalConstraints;
  weeklyBudgetUsd: number;
  concessions: Concessions;
  startDate: string;
  mealsPerDay: 3 | 4;
}

export interface OptimizeResult {
  feasible: boolean;
  withinBudget: boolean;
  days: PlanDay[];
  weeklyCostUsd: number;
  shadowPrices: ShadowPrice[];
  bindingConstraints: string[];
  conflicts: string[]; // empty when feasible
  solveMs: number;
}

// ---------------------------------------------------------------------------
// API envelopes (added by Lead at bootstrap, see docs/decisions.md D-003).
// These describe request and response bodies of /app/api routes so /lib/api.ts
// and the route handlers agree. They wrap the core types above; they add no
// new domain fields.
// ---------------------------------------------------------------------------

export type AgentRunTrigger = "onboarding" | "budget_change" | "monitor" | "coach" | "manual";
export type AgentRunStatus = "running" | "done" | "failed";

export interface AgentRun {
  runId: string;
  userId: string;
  trigger: AgentRunTrigger;
  reason: string | null;
  status: AgentRunStatus;
  createdAt: string;
}

/** GET /api/profile and POST /api/profile response. */
export interface ProfileBundle {
  profile: UserProfile;
  constraints: MedicalConstraints;
  targets: DailyTargets;
}

/** POST /api/plan/generate request. */
export interface GeneratePlanRequest {
  trigger?: AgentRunTrigger;
  reason?: string;
  weeklyBudgetUsd?: number; // budget slider; also saved to the profile
}

/** POST /api/plan/generate response (returns immediately; the run continues in the background). */
export interface GeneratePlanResponse {
  runId: string;
}

/** GET /api/agents/runs/[runId] response: used for replay and polling fallback. */
export interface AgentRunDetail {
  run: AgentRun;
  events: AgentEvent[];
}

/** POST /api/log request (manual or confirmed photo log). */
export interface CreateLogRequest {
  items: { foodId: string; grams: number; confidence?: number }[];
  eatenAt?: string;
  source: FoodLogEntry["source"];
  photoUrl?: string | null;
  visionAgreement?: number | null;
}

/** One vision model's independent read of a photo. */
export interface VisionReading {
  model: string;
  items: FoodLogItem[];
}

/** POST /api/log/photo response. When `logged` is false, `entry.question` must be answered and re-sent to POST /api/log. */
export interface PhotoLogResult {
  logged: boolean;
  entry: FoodLogEntry;
  votes: { a: VisionReading; b: VisionReading; agreement: number };
}

/** POST /api/readings request. */
export interface CreateReadingRequest {
  type: ReadingType;
  value: number;
  value2?: number;
  takenAt?: string;
}

export type AlertLevel = "info" | "warning" | "urgent";

export interface MonitorAlert {
  level: AlertLevel;
  title: string;
  body: string;
  source?: string;
}

/** POST /api/monitor/run response, also returned inside reading and log responses. */
export interface MonitorResult {
  action: "none" | "replan" | "alert";
  reason: string;
  runId: string | null;
  alerts: MonitorAlert[];
  tdee?: { mean: number; sd: number };
}

/** POST /api/readings response. */
export interface CreateReadingResponse {
  reading: Reading;
  monitor: MonitorResult;
}

/** POST /api/log response. */
export interface CreateLogResponse {
  entry: FoodLogEntry;
  monitor: MonitorResult;
}

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

/** POST /api/coach request and response. */
export interface CoachRequest {
  messages: CoachMessage[];
}
export interface CoachResponse {
  reply: string;
  replanRunId: string | null;
}

/** POST /api/upload response. */
export interface UploadResponse {
  url: string;
}

/** One solve of the budget tradeoff curve (feature 7). `objective` is null when the solver produced no plan. */
export interface BudgetCurvePointSummary {
  budgetUsd: number;
  feasible: boolean;
  withinBudget: boolean;
  weeklyCostUsd: number;
  objective: number | null; // lower is better
  proteinGapG: number; // mean daily shortfall vs target, >= 0
  calorieGapPct: number; // mean abs deviation, % of target
  sodiumUsePct: number; // mean day sodium / Doctor cap, %
  bindingConstraints: string[];
  mealNames: string[]; // distinct dish names, for "what changes"
}

export interface BudgetCurveSummary {
  budgets: number[];
  points: BudgetCurvePointSummary[];
  insights: string[]; // sentences assembled by code from the points, never an LLM
  minFeasibleBudgetUsd: number | null;
  saturationBudgetUsd: number | null;
  computedMs: number;
}

/** GET /api/plan/curve response. `planAt` is present only when `?budget=` was given. */
export interface BudgetCurveResponse {
  curve: BudgetCurveSummary;
  planAt?: PlanDay[];
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Kroger integration (see docs/kroger-setup.md, D-013). Backend owns the implementation in /lib/kroger.
// ---------------------------------------------------------------------------

/** GET /api/kroger/status */
export interface KrogerStatus {
  configured: boolean; // server has KROGER_CLIENT_ID + SECRET
  connected: boolean; // this user completed OAuth
  location: { id: string; name: string } | null;
}

/** GET /api/kroger/locations?zip= */
export interface KrogerLocation {
  id: string;
  name: string;
  address: string;
}

/** A grocery item with its matched Kroger product and shelf price, when one was found. */
export interface PricedGroceryItem extends GroceryItem {
  kroger?: {
    productId: string;
    upc: string;
    description: string;
    brand?: string;
    size: string;
    unitPriceUsd: number;
    packagesNeeded: number;
    lineUsd: number;
  };
}

/** POST /api/kroger/price */
export interface KrogerPriceResponse {
  items: PricedGroceryItem[];
  totalUsd: number;
  matched: number;
  unmatched: string[];
}

/** POST /api/kroger/cart request item. */
export interface KrogerCartItemInput {
  upc: string;
  quantity: number;
}

/** POST /api/kroger/cart response. */
export interface KrogerCartResponse {
  added: number;
  skipped: string[];
}

/** Standard error body for every route. */
export interface ApiError {
  error: string;
}

/** Session info for GET /api/auth/session. */
export interface SessionInfo {
  userId: string | null;
  email: string | null;
  mode: "local" | "supabase";
  hasProfile: boolean;
}
