// Month calendar helpers: month bounds and grid, and the dish-title schedule built from saved weeks.
import { describe, expect, it } from "vitest";
import type { PlannerDay, Recipe, WeeklyMealPlan } from "@/types/contracts";
import { isIsoMonth, monthBounds, monthGrid, shiftMonth, weekDates } from "../dates";
import { buildMonthSchedule, monthWeekRange } from "../month";

const recipe = (title: string) => ({ title }) as Recipe;
function week(weekStartDate: string, tag = "a"): WeeklyMealPlan {
  return {
    id: `${weekStartDate}-${tag}`,
    userId: "u",
    weekStartDate,
    language: "en",
    createdAt: "2026-10-10T00:00:00.000Z",
    days: weekDates(weekStartDate).map((date): PlannerDay => ({
      date,
      breakfast: recipe(`${tag} breakfast ${date}`),
      lunch: recipe(`${tag} lunch ${date}`),
      dinner: recipe(`${tag} dinner ${date}`),
    })),
  };
}

describe("month date helpers", () => {
  it("validates YYYY-MM months", () => {
    expect(isIsoMonth("2026-10")).toBe(true);
    expect(isIsoMonth("2026-13")).toBe(false);
    expect(isIsoMonth("2026-1")).toBe(false);
    expect(isIsoMonth("2026-10-01")).toBe(false);
  });

  it("finds month bounds, including leap February", () => {
    expect(monthBounds("2026-10")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
  });

  it("shifts across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("builds a Monday to Sunday grid covering the month", () => {
    const grid = monthGrid("2026-10"); // Oct 1 2026 is a Thursday, Oct 31 a Saturday
    expect(grid[0]).toBe("2026-09-28");
    expect(grid.at(-1)).toBe("2026-11-01");
    expect(grid.length % 7).toBe(0);
    expect(grid).toHaveLength(35);
  });

  it("gives the Mondays of the first and last overlapping week", () => {
    expect(monthWeekRange("2026-10")).toEqual({ fromWeek: "2026-09-28", toWeek: "2026-10-26" });
  });
});

describe("buildMonthSchedule", () => {
  it("keeps only days inside the month, with dish titles and their week", () => {
    const res = buildMonthSchedule("2026-10", [week("2026-10-26"), week("2026-09-28"), week("2026-11-02")]);
    expect(res.month).toBe("2026-10");
    expect(res.plannedWeeks).toEqual(["2026-09-28", "2026-10-26"]);
    expect(res.days.map((d) => d.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    expect(res.days[0]).toEqual({
      date: "2026-10-01",
      weekStartDate: "2026-09-28",
      breakfast: "a breakfast 2026-10-01",
      lunch: "a lunch 2026-10-01",
      dinner: "a dinner 2026-10-01",
    });
  });

  it("returns an empty schedule when nothing is saved", () => {
    expect(buildMonthSchedule("2026-10", [])).toEqual({ month: "2026-10", plannedWeeks: [], days: [] });
  });
});
