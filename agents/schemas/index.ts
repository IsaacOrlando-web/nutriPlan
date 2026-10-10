// Zod schemas mirroring /types/contracts.ts. Owner: Agents. Used for generateObject outputs and API validation.
// Keep in lockstep with the contracts; the type assertions at the bottom fail typecheck if they drift.
import { z } from "zod";
import type * as C from "@/types/contracts";

export const SexSchema = z.enum(["male", "female"]);
export const ActivityLevelSchema = z.enum(["sedentary", "light", "moderate", "active", "very_active"]);
export const GoalSchema = z.enum(["lose", "maintain", "gain"]);
export const ConditionSchema = z.enum(["type2_diabetes", "hypertension", "kidney_disease", "high_cholesterol"]);
export const LanguageSchema = z.enum(["en", "es"]);
export const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const AgentNameSchema = z.enum(["doctor", "chef", "budget", "monitor", "orchestrator"]);
export const AgentEventKindSchema = z.enum(["proposal", "objection", "concession", "tool_call", "decision"]);
export const ReadingTypeSchema = z.enum(["weight", "glucose_fasting", "glucose_post_meal", "bp"]);
export const StoreSectionSchema = z.enum(["produce", "protein", "dairy", "grains", "pantry", "frozen", "other"]);

export const UserProfileSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(60),
  language: LanguageSchema,
  sex: SexSchema,
  age: z.number().int().min(13).max(110),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(350),
  activityLevel: ActivityLevelSchema,
  goal: GoalSchema,
  goalRateKgPerWeek: z.number().min(0).max(2),
  conditions: z.array(ConditionSchema),
  medications: z.array(z.string()),
  allergies: z.array(z.string()),
  restrictions: z.array(z.string()),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  weeklyBudgetUsd: z.number().min(10).max(1000),
  mealsPerDay: z.union([z.literal(3), z.literal(4)]),
});

/** What the onboarding form submits: everything except the server-assigned userId. */
export const ProfileInputSchema = UserProfileSchema.omit({ userId: true });

export const ReasonSchema = z.object({ rule: z.string(), why: z.string(), source: z.string() });

export const MedicalConstraintsSchema = z.object({
  minCaloriesPerDay: z.number(),
  minFiberG: z.number(),
  maxAddedSugarG: z.number(),
  maxSodiumMgPerDay: z.number(),
  maxSatFatPct: z.number(),
  maxCarbsPerMealG: z.number().optional(),
  maxGlycemicLoadPerMeal: z.number().optional(),
  minPotassiumMgPerDay: z.number().optional(),
  excludedFoodTags: z.array(z.string()),
  reasons: z.array(ReasonSchema),
  summary: z.string(),
});

export const DailyTargetsSchema = z.object({
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  sodiumMg: z.number(),
  potassiumMg: z.number(),
  tdeeEstimate: z.number(),
  tdeeUncertainty: z.number(),
});

export const NutrientsSchema = z.object({
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  sugarG: z.number(),
  addedSugarG: z.number(),
  satFatG: z.number(),
  sodiumMg: z.number(),
  potassiumMg: z.number(),
});

export const MealTotalsSchema = NutrientsSchema.extend({ glycemicLoad: z.number(), costUsd: z.number() });

export const FoodSchema = z.object({
  foodId: z.string(),
  name: z.string(),
  nameEs: z.string().optional(),
  per100g: NutrientsSchema,
  glycemicIndex: z.number().optional(),
  giEstimated: z.boolean(),
  priceUsdPer100g: z.number().optional(),
  servingG: z.number(),
  servingLabel: z.string(),
  tags: z.array(z.string()),
  storeSection: StoreSectionSchema,
});

export const MealItemSchema = z.object({ foodId: z.string(), name: z.string(), servings: z.number(), grams: z.number() });
export const AgentNoteSchema = z.object({ agent: AgentNameSchema, text: z.string() });

export const MealSchema = z.object({
  mealId: z.string(),
  type: MealTypeSchema,
  name: z.string(),
  cuisine: z.string(),
  recipeSteps: z.array(z.string()),
  prepMinutes: z.number(),
  items: z.array(MealItemSchema),
  totals: MealTotalsSchema,
  explanation: z.array(AgentNoteSchema),
});

export const PlanDaySchema = z.object({ date: z.string(), meals: z.array(MealSchema), dayTotals: MealTotalsSchema });

export const GroceryItemSchema = z.object({
  foodId: z.string(),
  name: z.string(),
  quantityG: z.number(),
  quantityLabel: z.string(),
  costUsd: z.number(),
  storeSection: StoreSectionSchema,
});

export const ShadowPriceSchema = z.object({ constraint: z.string(), value: z.number(), humanText: z.string() });

export const MealPlanSchema = z.object({
  planId: z.string(),
  userId: z.string(),
  version: z.number(),
  reason: z.string(),
  runId: z.string(),
  startDate: z.string(),
  weeklyCostUsd: z.number(),
  days: z.array(PlanDaySchema),
  groceryList: z.array(GroceryItemSchema),
  shadowPrices: z.array(ShadowPriceSchema),
  bestEffort: z.boolean(),
});

export const FoodLogItemSchema = z.object({ foodId: z.string(), name: z.string(), grams: z.number(), confidence: z.number().min(0).max(1) });

export const FoodLogEntrySchema = z.object({
  logId: z.string(),
  userId: z.string(),
  eatenAt: z.string(),
  photoUrl: z.string().nullable(),
  source: z.enum(["photo", "manual", "plan"]),
  visionAgreement: z.number().nullable(),
  question: z.object({ text: z.string(), options: z.array(z.string()) }).nullable(),
  items: z.array(FoodLogItemSchema),
  totals: MealTotalsSchema,
  flags: z.array(AgentNoteSchema),
});

export const ReadingSchema = z.object({
  readingId: z.string(),
  userId: z.string(),
  type: ReadingTypeSchema,
  value: z.number(),
  value2: z.number().optional(),
  unit: z.enum(["kg", "mg/dL", "mmHg"]),
  takenAt: z.string(),
  relatedLogId: z.string().optional(),
});

export const TrendPointSchema = z.object({ date: z.string(), raw: z.number().nullable(), filtered: z.number(), lower: z.number(), upper: z.number() });
export const TrendSchema = z.object({
  type: ReadingTypeSchema,
  points: z.array(TrendPointSchema),
  slopePerWeek: z.number(),
  alert: z.enum(["none", "rising", "falling", "stalled", "too_fast"]),
});

export const AgentEventSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  agent: AgentNameSchema,
  kind: AgentEventKindSchema,
  text: z.string().max(140),
  at: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const CandidateMealSchema = z.object({
  candidateId: z.string(),
  type: MealTypeSchema,
  name: z.string(),
  cuisine: z.string(),
  recipeSteps: z.array(z.string()),
  prepMinutes: z.number(),
  ingredients: z.array(z.object({ foodId: z.string(), minServings: z.number(), maxServings: z.number() })),
  tasteScore: z.number().min(0).max(1),
  pitch: z.string(),
});

export const ConcessionsSchema = z.object({
  maxRepeatsPerWeek: z.union([z.literal(2), z.literal(3)]),
  budgetSlackPct: z.union([z.literal(0), z.literal(5), z.literal(10)]),
});

// ---- API request schemas (envelopes from contracts.ts) ----

export const AgentRunTriggerSchema = z.enum(["onboarding", "budget_change", "monitor", "coach", "manual"]);

export const GeneratePlanRequestSchema = z.object({
  trigger: AgentRunTriggerSchema.optional(),
  reason: z.string().max(200).optional(),
  weeklyBudgetUsd: z.number().min(10).max(1000).optional(),
});

export const CreateLogRequestSchema = z.object({
  items: z.array(z.object({ foodId: z.string(), grams: z.number().min(0).max(5000), confidence: z.number().min(0).max(1).optional() })).min(1),
  eatenAt: z.string().optional(),
  source: z.enum(["photo", "manual", "plan"]),
  photoUrl: z.string().nullable().optional(),
  visionAgreement: z.number().nullable().optional(),
});

export const CreateReadingRequestSchema = z.object({
  type: ReadingTypeSchema,
  value: z.number().min(1).max(600),
  value2: z.number().min(1).max(300).optional(),
  takenAt: z.string().optional(),
});

export const CoachRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(40),
});

export const PhotoLogRequestSchema = z.object({
  photoUrl: z.string().min(1), // https URL or data: URL
  eatenAt: z.string().optional(),
});

// ---- LLM output schemas (what agents are allowed to say; never numbers shown to users) ----

/** Chef proposes meals by ingredient *names*; code maps them to foodIds with searchFoods. */
export const ChefProposalSchema = z.object({
  meals: z
    .array(
      z.object({
        type: MealTypeSchema,
        name: z.string().max(60),
        cuisine: z.string().max(30),
        pitch: z.string().max(140),
        prepMinutes: z.number().int().min(1).max(120),
        recipeSteps: z.array(z.string().max(160)).min(1).max(6),
        ingredients: z.array(z.object({ query: z.string().max(40), minServings: z.number().int().min(0).max(4), maxServings: z.number().int().min(1).max(4) })).min(1).max(7),
        tasteScore: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(40),
  message: z.string().max(140),
});

export const BudgetReviewSchema = z.object({
  objection: z.string().max(140).nullable(),
  swaps: z.array(z.object({ candidateId: z.string(), fromFoodId: z.string(), toFoodId: z.string(), why: z.string().max(100) })).max(10),
  message: z.string().max(140),
});

export const DoctorReviewSchema = z.object({
  summary: z.string().max(400),
  flags: z.array(z.object({ candidateId: z.string(), why: z.string().max(120) })).max(10),
  message: z.string().max(140),
});

export const MonitorDecisionSchema = z.object({
  action: z.enum(["none", "replan", "alert"]),
  message: z.string().max(140),
  reason: z.string().max(200),
});

export const CoachReplySchema = z.object({
  reply: z.string().max(1200),
  wantsReplan: z.boolean(),
  replanReason: z.string().max(140).nullable(),
});

export const VisionOutputSchema = z.object({
  items: z.array(z.object({ query: z.string().max(40), grams: z.number().min(1).max(2000), confidence: z.number().min(0).max(1) })).max(8),
});

// ---- Compile-time drift checks against /types/contracts.ts ----
type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type _1 = Assert<Same<z.infer<typeof UserProfileSchema>, C.UserProfile>>;
type _2 = Assert<Same<z.infer<typeof MedicalConstraintsSchema>, C.MedicalConstraints>>;
type _3 = Assert<Same<z.infer<typeof DailyTargetsSchema>, C.DailyTargets>>;
type _4 = Assert<Same<z.infer<typeof MealPlanSchema>, C.MealPlan>>;
type _5 = Assert<Same<z.infer<typeof FoodLogEntrySchema>, C.FoodLogEntry>>;
type _6 = Assert<Same<z.infer<typeof ReadingSchema>, C.Reading>>;
type _7 = Assert<Same<z.infer<typeof TrendSchema>, C.Trend>>;
type _8 = Assert<Same<z.infer<typeof AgentEventSchema>, C.AgentEvent>>;
type _9 = Assert<Same<z.infer<typeof CandidateMealSchema>, C.CandidateMeal>>;
type _10 = Assert<Same<z.infer<typeof FoodSchema>, C.Food>>;
