// Chef column generation schema. Owner: Agents.
// After the first optimizer solve, code writes a scarcity brief and the Chef answers with a handful of new
// "columns" (candidate meals) aimed at the scarce resources. Small on purpose so Gemini Flash or Haiku finish
// well inside the per call timeout. Ingredients are names only; code maps them to foodIds with searchFoods.
import { z } from "zod";
import { MealTypeSchema } from "./index";

export const ChefColumnSchema = z.object({
  type: MealTypeSchema,
  name: z.string().max(50),
  cuisine: z.string().max(30),
  pitch: z.string().max(80),
  prepMinutes: z.number().int().min(1).max(60),
  ingredients: z
    .array(
      z.object({
        query: z.string().max(40),
        minServings: z.number().int().min(0).max(4),
        maxServings: z.number().int().min(1).max(4),
      }),
    )
    .min(2)
    .max(5),
  // Short steps keep the whole answer near 1200 output tokens (measured: Haiku 5.5 writes that in 5 to 8 s).
  recipeSteps: z.array(z.string().max(90)).min(2).max(3),
  tasteScore: z.number().min(0).max(1),
});

export const ChefColumnsSchema = z.object({
  meals: z.array(ChefColumnSchema).min(1).max(8),
  message: z.string().max(140),
});

export type ChefColumns = z.infer<typeof ChefColumnsSchema>;
