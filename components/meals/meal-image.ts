import type { Meal, Recipe } from "@/types/contracts";

const IMAGE_BY_KEYWORD: Array<[string, string]> = [
  ["oat", "https://images.unsplash.com/photo-1517673400267-0251440c45dc?auto=format&fit=crop&w=900&q=80"],
  ["pancake", "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=900&q=80"],
  ["egg", "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80"],
  ["salad", "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80"],
  ["chicken", "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=80"],
  ["salmon", "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80"],
  ["rice", "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80"],
  ["pasta", "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80"],
  ["bean", "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80"],
];

export const DEFAULT_MEAL_IMAGE =
  "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80";

export function mealImageUrl(meal: Pick<Meal, "name" | "items">): string {
  const text = `${meal.name} ${meal.items.map((item) => item.name).join(" ")}`.toLowerCase();
  return IMAGE_BY_KEYWORD.find(([keyword]) => text.includes(keyword))?.[1] ?? DEFAULT_MEAL_IMAGE;
}

/** Weekly planner recipes: the verified image when the server has one, else the same keyword lookup. */
export function recipeImageUrl(
  recipe: Pick<Recipe, "title" | "imageUrl" | "ingredients">,
  { ignoreProvided = false }: { ignoreProvided?: boolean } = {},
): string {
  if (recipe.imageUrl && !ignoreProvided) return recipe.imageUrl;
  const text = `${recipe.title} ${recipe.ingredients.map((i) => i.name).join(" ")}`.toLowerCase();
  return IMAGE_BY_KEYWORD.find(([keyword]) => text.includes(keyword))?.[1] ?? DEFAULT_MEAL_IMAGE;
}
