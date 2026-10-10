// Month schedule for the planner calendar: dish titles of every saved day inside a month. Pure; shared by the
// month route and mock mode in /lib/api.ts.
import type { PlannerMonthResponse, WeeklyMealPlan } from "@/types/contracts";
import { addDays, monthBounds, weekStartOf } from "./dates";

/** Mondays of the first and last week that overlap a YYYY-MM month. */
export function monthWeekRange(month: string): { fromWeek: string; toWeek: string } {
  const { first, last } = monthBounds(month);
  return { fromWeek: weekStartOf(first), toWeek: weekStartOf(last) };
}

/** Keeps only days inside the month; a later week wins if two plans claim the same date. */
export function buildMonthSchedule(month: string, plans: WeeklyMealPlan[]): PlannerMonthResponse {
  const { first, last } = monthBounds(month);
  const byDate = new Map<string, PlannerMonthResponse["days"][number]>();
  const plannedWeeks = new Set<string>();
  for (const plan of [...plans].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate))) {
    if (plan.weekStartDate > last || addDays(plan.weekStartDate, 6) < first) continue;
    plannedWeeks.add(plan.weekStartDate);
    for (const day of plan.days) {
      if (day.date < first || day.date > last) continue;
      byDate.set(day.date, {
        date: day.date,
        weekStartDate: plan.weekStartDate,
        breakfast: day.breakfast.title,
        lunch: day.lunch.title,
        dinner: day.dinner.title,
      });
    }
  }
  return {
    month,
    plannedWeeks: [...plannedWeeks].sort(),
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
