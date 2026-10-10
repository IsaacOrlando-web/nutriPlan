// Weekly planner schemas. Owner: Agents.
// Model-facing schemas carry recipe craft only (names, quantities, units, minutes, steps). No nutrition, no cost,
// no ids: code adds ids, maps ingredients to foods and computes nutrition and cost with /math.
// Request schemas validate every route body with bounded strings and arrays.
import { z } from "zod";
import { isIsoDate, isIsoMonth, isMonday } from "@/lib/planner/dates";

export const PLANNER_MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
export const INGREDIENT_CATEGORIES = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "pantry",
  "spices",
  "frozen",
  "other",
] as const;

export const LlmIngredientSchema = z.object({
  name: z.string().min(1).max(60),
  quantity: z.number().min(0).max(5000).nullable(),
  unit: z.string().max(20),
  category: z.enum(INGREDIENT_CATEGORIES),
  optionalNotes: z.string().max(80),
  scalable: z.boolean(),
});

export const LlmRecipeSchema = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(240),
  mealType: z.enum(PLANNER_MEAL_TYPES),
  ingredients: z.array(LlmIngredientSchema).min(2).max(14),
  instructions: z.array(z.string().min(5).max(300)).min(2).max(12),
  preparationMinutes: z.number().int().min(0).max(240),
  cookingMinutes: z.number().int().min(0).max(480),
  servings: z.number().int().min(1).max(12),
  difficulty: z.enum(["easy", "medium", "hard"]),
  dietaryTags: z.array(z.string().max(30)).max(8),
  allergens: z.array(z.string().max(30)).max(10),
  imageSearchTerm: z.string().max(80),
  storageNotes: z.string().max(300),
});

export type LlmRecipe = z.infer<typeof LlmRecipeSchema>;

export const LlmDaySchema = z.object({
  breakfast: LlmRecipeSchema,
  lunch: LlmRecipeSchema,
  dinner: LlmRecipeSchema,
});

export type LlmDay = z.infer<typeof LlmDaySchema>;

const OutlineMealSchema = z.object({
  title: z.string().min(3).max(80),
  mainIngredients: z.array(z.string().max(40)).min(1).max(5),
});

export const LlmOutlineSchema = z.object({
  days: z
    .array(z.object({ breakfast: OutlineMealSchema, lunch: OutlineMealSchema, dinner: OutlineMealSchema }))
    .length(7),
});

export type LlmOutline = z.infer<typeof LlmOutlineSchema>;

export const LlmReplacementSchema = z.object({ recipe: LlmRecipeSchema });

// ---------------------------------------------------------------- requests

const shortText = z.string().trim().min(1).max(60);
const textList = z.array(shortText).max(30);
export const IsoDateSchema = z.string().refine(isIsoDate, "must be a date in YYYY-MM-DD form");
export const MondaySchema = z.string().refine(isMonday, "must be a Monday in YYYY-MM-DD form");
export const LanguageSchema = z.enum(["en", "es"]);

export const PreferenceOverridesSchema = z.object({
  language: LanguageSchema.optional(),
  servings: z.number().int().min(1).max(12).optional(),
  dietaryPreferences: textList.optional(),
  allergies: textList.optional(),
  excludedIngredients: textList.optional(),
  preferredCuisines: textList.optional(),
  dislikedIngredients: textList.optional(),
  maxPreparationMinutes: z.number().int().min(5).max(240).nullable().optional(),
  weeklyBudget: z.number().min(0).max(2000).optional(),
  currency: z.literal("USD").optional(),
  availableIngredients: textList.optional(),
  kitchenEquipment: textList.optional(),
});

export const GenerateWeekRequestSchema = PreferenceOverridesSchema.extend({
  weekStartDate: MondaySchema,
}).strict();

export const GenerateDayRequestSchema = PreferenceOverridesSchema.extend({
  weekStartDate: MondaySchema,
  date: IsoDateSchema,
}).strict();

export const ReplaceRecipeRequestSchema = PreferenceOverridesSchema.extend({
  weekStartDate: MondaySchema,
  date: IsoDateSchema,
  mealType: z.enum(PLANNER_MEAL_TYPES),
  currentRecipe: z
    .object({ title: z.string().max(80), mainIngredients: z.array(z.string().max(60)).max(14).optional() })
    .optional(),
}).strict();

export const PlannerPreferencesSchema = z
  .object({
    servings: z.number().int().min(1).max(12),
    dietaryPreferences: textList,
    excludedIngredients: textList,
    preferredCuisines: textList,
    maxPreparationMinutes: z.number().int().min(5).max(240).nullable(),
    availableIngredients: textList,
    kitchenEquipment: textList,
    language: LanguageSchema,
  })
  .strict();

const ShoppingStateSchema = z
  .object({
    checked: z.record(z.string().max(200), z.boolean()),
    quantityOverrides: z.record(z.string().max(200), z.string().max(40)),
    removed: z.array(z.string().max(200)).max(500),
    customItems: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          name: z.string().trim().min(1).max(60),
          quantity: z.number().min(0).max(100000).nullable(),
          unit: z.string().max(20),
          category: z.string().max(30),
        }),
      )
      .max(200),
  })
  .strict();

export const UpdateWeekStateRequestSchema = z
  .object({
    weekStartDate: MondaySchema,
    completed: z.record(z.string().max(40), z.boolean()).optional(),
    shopping: ShoppingStateSchema.optional(),
  })
  .strict();

export const WeekQuerySchema = z.object({ weekStart: MondaySchema });

export const MonthQuerySchema = z.object({
  month: z.string().refine(isIsoMonth, "must be a month in YYYY-MM form"),
});

/** A full Recipe as stored and returned by the API (used to validate favorites sent back by the client). */
export const StoredRecipeSchema = LlmRecipeSchema.extend({
  id: z.string().min(1).max(80),
  totalMinutes: z.number().int().min(0).max(720),
  ingredients: z
    .array(
      LlmIngredientSchema.extend({
        id: z.string().min(1).max(80),
        category: z.string().max(30),
        foodId: z.string().max(80).nullable(),
      }),
    )
    .min(1)
    .max(20),
  estimatedCostPerServing: z.number().min(0).max(1000).nullable(),
  currency: z.string().max(8),
  nutritionPerServing: z.object({
    calories: z.number().nullable(),
    proteinGrams: z.number().nullable(),
    carbohydratesGrams: z.number().nullable(),
    fatGrams: z.number().nullable(),
  }),
  nutritionSource: z.enum(["math", "unavailable"]),
  unmatchedIngredients: z.array(z.string().max(60)).max(20),
  ruleWarnings: z.array(z.string().max(200)).max(10),
  imageUrl: z.string().url().max(500).nullable(),
});

export const FavoriteRequestSchema = z.object({ recipe: StoredRecipeSchema, favorite: z.boolean() }).strict();
