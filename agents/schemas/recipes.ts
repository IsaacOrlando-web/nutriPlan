// Recipe ideas schema (POST /api/agents/recipes). Owner: Agents.
// The model names two meals and their ingredients; code maps each ingredient to a food with searchFoods and
// prices the meal with /math. No numbers come back from the model except servings, which code clamps.
import { z } from "zod";

export const RecipeIdeaSchema = z.object({
  name: z.string().max(60),
  ingredients: z
    .array(
      z.object({
        query: z.string().max(40),
        servings: z.number().int().min(1).max(3),
      }),
    )
    .min(2)
    .max(6),
});

export const RecipeIdeasSchema = z.object({
  meals: z.array(RecipeIdeaSchema).length(2),
});

export type RecipeIdeasLlm = z.infer<typeof RecipeIdeasSchema>;
