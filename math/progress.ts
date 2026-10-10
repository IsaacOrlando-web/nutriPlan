// Progress toward a weight goal, from the Kalman weight trend. Owner: Math. Pure functions, no I/O.
// Uses the filtered trend (not raw readings) so one heavy morning never moves the bar backwards. All results are
// rounded for display: kg to 0.1, percent to whole numbers, weeks up to whole weeks.

export type GoalDirection = "lose" | "gain" | "maintain";

export interface GoalProgressInput {
  /** Trend value at the first reading (kg). */
  startKg: number;
  /** Trend value now (kg). */
  currentKg: number;
  /** Goal weight (kg). */
  goalKg: number;
  /** Trend slope, kg per week (negative = losing). */
  slopePerWeek: number;
  /** Today, YYYY-MM-DD, for the estimated date. */
  today: string;
  /** The trend's own stall alert (Kalman). A stalled trend counts as flat even when the slope is not quite zero. */
  stalled?: boolean;
  /** Within this many kg of the goal counts as reached / maintaining. */
  bandKg?: number;
}

export interface GoalProgress {
  direction: GoalDirection;
  /** Signed change since the start (current - start), kg. */
  changedKg: number;
  /** Distance left to the goal, kg, never negative. */
  remainingKg: number;
  /** 0 to 100 share of the way from start to goal; 100 when reached. */
  percent: number;
  reached: boolean;
  /** "toward" the goal, "away" from it, or "flat" (under 0.05 kg per week). */
  pace: "toward" | "away" | "flat";
  /** Whole weeks to the goal at the current slope; null when reached, flat or moving away. */
  weeksToGoal: number | null;
  /** today + weeksToGoal, YYYY-MM-DD; null when weeksToGoal is null. */
  etaDate: string | null;
}

/** Slopes under this (kg per week) count as no movement. Matches the trends screen's "holding steady". */
export const FLAT_SLOPE_KG_PER_WEEK = 0.05;
const DEFAULT_BAND_KG = 1;

const r1 = (n: number) => Math.round(n * 10) / 10;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function goalProgress(input: GoalProgressInput): GoalProgress {
  const { startKg, currentKg, goalKg, slopePerWeek, today } = input;
  const band = input.bandKg ?? DEFAULT_BAND_KG;
  const startGap = goalKg - startKg;
  const direction: GoalDirection = Math.abs(startGap) < band ? "maintain" : startGap < 0 ? "lose" : "gain";
  const gap = goalKg - currentKg;
  const remainingKg = r1(
    Math.max(0, direction === "lose" ? -gap : direction === "gain" ? gap : Math.abs(gap)),
  );
  const reached = direction === "maintain" ? Math.abs(gap) <= band : remainingKg === 0;

  const percent =
    direction === "maintain"
      ? reached
        ? 100
        : 0
      : Math.round(Math.min(100, Math.max(0, ((currentKg - startKg) / startGap) * 100)));

  const flat = input.stalled === true || Math.abs(slopePerWeek) < FLAT_SLOPE_KG_PER_WEEK;
  const pace: GoalProgress["pace"] = flat
    ? "flat"
    : Math.sign(slopePerWeek) === Math.sign(gap)
      ? "toward"
      : "away";

  const weeksToGoal =
    reached || pace !== "toward" || direction === "maintain"
      ? null
      : Math.ceil(remainingKg / Math.abs(slopePerWeek));

  return {
    direction,
    changedKg: r1(currentKg - startKg),
    remainingKg,
    percent,
    reached,
    pace,
    weeksToGoal,
    etaDate: weeksToGoal === null ? null : addDays(today, weeksToGoal * 7),
  };
}
