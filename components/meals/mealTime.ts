import { Cookie, Moon, Sun, Sunrise, type LucideIcon } from "lucide-react";
import type { MealType } from "@/types/contracts";

/** Plain time-of-day words for each meal slot. Fixed labels, not computed from data. */
export const MEAL_TIME_OF_DAY: Record<MealType, { label: string; icon: LucideIcon }> = {
  breakfast: { label: "Morning", icon: Sunrise },
  lunch: { label: "Midday", icon: Sun },
  snack: { label: "Afternoon", icon: Cookie },
  dinner: { label: "Evening", icon: Moon },
};

/** Which plan slot comes next, by wall clock. Used only to pick a meal to talk about. */
export function nextMealType(hour: number, available: MealType[]): MealType | undefined {
  const order: MealType[] = hour < 10 ? ["breakfast", "lunch", "snack", "dinner"]
    : hour < 14 ? ["lunch", "snack", "dinner"]
    : hour < 17 ? ["snack", "dinner"]
    : ["dinner"];
  return order.find((t) => available.includes(t)) ?? available[available.length - 1];
}
