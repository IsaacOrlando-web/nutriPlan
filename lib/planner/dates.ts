// Week and date helpers for the weekly planner. Shared by the client and the planner agent.
// Dates are plain "YYYY-MM-DD" strings; arithmetic runs in UTC on the date only, so time zones and DST never shift
// a day. "Today" is read from the caller's local clock (pass a Date) and only inside effects or handlers on the client.

export const WEEKDAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = parseIsoDate(value);
  return toIsoDate(d) === value;
}

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Local calendar date of a Date as YYYY-MM-DD (the user's "today"). */
export function localIsoDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (parseIsoDate(date).getUTCDay() + 6) % 7;
}

export function isMonday(date: string): boolean {
  return isIsoDate(date) && weekdayIndex(date) === 0;
}

/** Monday of the week that contains `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** The 7 dates Monday to Sunday starting at `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** True when `dates` are exactly 7 consecutive days starting on a Monday. */
export function isFullWeek(dates: string[]): boolean {
  if (dates.length !== 7 || !isMonday(dates[0])) return false;
  return dates.every((d, i) => d === addDays(dates[0], i));
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Oct 6 – 12, 2026", "Sep 29 – Oct 5, 2026" or "Dec 28, 2026 – Jan 3, 2027". */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy !== ey) return `${MONTH_SHORT[sm - 1]} ${sd}, ${sy} – ${MONTH_SHORT[em - 1]} ${ed}, ${ey}`;
  if (sm !== em) return `${MONTH_SHORT[sm - 1]} ${sd} – ${MONTH_SHORT[em - 1]} ${ed}, ${sy}`;
  return `${MONTH_SHORT[sm - 1]} ${sd} – ${ed}, ${sy}`;
}

/** "Wednesday, October 8". */
export function formatLongDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${WEEKDAY_LONG[weekdayIndex(date)]}, ${months[m - 1]} ${d}`;
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a month in YYYY-MM form. */
export function isIsoMonth(value: string): boolean {
  return ISO_MONTH.test(value);
}

/** First and last date (YYYY-MM-DD) of a YYYY-MM month. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  return { first: `${month}-01`, last: toIsoDate(new Date(Date.UTC(y, m, 0))) };
}

/** The month before or after `month` (YYYY-MM). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return toIsoDate(new Date(Date.UTC(y, m - 1 + delta, 1))).slice(0, 7);
}

/** Calendar grid for a month: whole Monday to Sunday weeks covering it (35 or 42 dates, sometimes 28). */
export function monthGrid(month: string): string[] {
  const { first, last } = monthBounds(month);
  const start = weekStartOf(first);
  const end = addDays(weekStartOf(last), 6);
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}
