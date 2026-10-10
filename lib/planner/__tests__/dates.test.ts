import { describe, expect, it } from "vitest";
import {
  addDays,
  formatLongDate,
  formatWeekRange,
  isFullWeek,
  isIsoDate,
  isMonday,
  localIsoDate,
  weekDates,
  weekStartOf,
  weekdayIndex,
} from "../dates";

describe("planner dates", () => {
  it("validates real ISO dates only", () => {
    expect(isIsoDate("2026-10-12")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("nope")).toBe(false);
  });

  it("finds the Monday of any day, including Sundays", () => {
    expect(weekStartOf("2026-10-10")).toBe("2026-10-05"); // Saturday
    expect(weekStartOf("2026-10-11")).toBe("2026-10-05"); // Sunday belongs to the week before
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12"); // Monday
    expect(weekdayIndex("2026-10-11")).toBe(6);
    expect(isMonday("2026-10-12")).toBe(true);
    expect(isMonday("2026-10-13")).toBe(false);
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(weekDates("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("checks a full Monday to Sunday week in order", () => {
    expect(isFullWeek(weekDates("2026-10-05"))).toBe(true);
    expect(isFullWeek(weekDates("2026-10-06"))).toBe(false); // starts Tuesday
    const shuffled = weekDates("2026-10-05");
    [shuffled[1], shuffled[2]] = [shuffled[2], shuffled[1]];
    expect(isFullWeek(shuffled)).toBe(false);
    expect(isFullWeek(weekDates("2026-10-05").slice(0, 6))).toBe(false);
  });

  it("formats ranges and long dates", () => {
    expect(formatWeekRange("2026-10-05")).toBe("Oct 5 – 11, 2026");
    expect(formatWeekRange("2026-09-28")).toBe("Sep 28 – Oct 4, 2026");
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(formatLongDate("2026-10-07")).toBe("Wednesday, October 7");
  });

  it("reads the local calendar date", () => {
    expect(localIsoDate(new Date(2026, 0, 3, 23, 59))).toBe("2026-01-03");
  });
});
