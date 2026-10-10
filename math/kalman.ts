// getTrends: Kalman filter (local linear trend: level + slope) over noisy readings. Owner: Math.
// Produces one TrendPoint per calendar day (raw is null on days without a reading), a 95% band,
// the weekly slope, and an alert when the slope passes a threshold and the band clears the baseline.
import type { Goal, Reading, ReadingType, Trend, TrendPoint } from "@/types/contracts";

interface NoiseModel {
  /** Measurement noise standard deviation (spec section 10). */
  measurementSd: number;
  /** Process noise on the level, variance per day. */
  levelVar: number;
  /** Process noise on the slope, variance per day. */
  slopeVar: number;
  /** Weekly slope that counts as a meaningful rise or fall. */
  slopeAlertPerWeek: number;
}

export const NOISE: Record<ReadingType, NoiseModel> = {
  weight: { measurementSd: 0.8, levelVar: 0.01, slopeVar: 0.0008, slopeAlertPerWeek: 0.5 },
  glucose_fasting: { measurementSd: 10, levelVar: 2, slopeVar: 0.6, slopeAlertPerWeek: 10 },
  glucose_post_meal: { measurementSd: 10, levelVar: 4, slopeVar: 0.6, slopeAlertPerWeek: 12 },
  bp: { measurementSd: 6, levelVar: 1, slopeVar: 0.15, slopeAlertPerWeek: 5 },
};

/** Weight trend is "stalled" when the filtered change over this many days is under STALL_KG. */
export const STALL_DAYS = 14;
export const STALL_KG = 0.3;
/** Losing or gaining faster than this (kg per week) is unsafe. */
export const TOO_FAST_KG_PER_WEEK = 1.0;

const DAY_MS = 86_400_000;
const Z95 = 1.96;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Average readings that fall on the same day (several glucose checks, for example). */
function dailyObservations(readings: Reading[], type: ReadingType): Map<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of readings) {
    if (r.type !== type || !Number.isFinite(r.value)) continue;
    const k = dayKey(r.takenAt);
    const s = sums.get(k) ?? { sum: 0, n: 0 };
    s.sum += r.value;
    s.n += 1;
    sums.set(k, s);
  }
  return new Map([...sums].map(([k, s]) => [k, s.sum / s.n]));
}

type Mat2 = [number, number, number, number]; // row major 2x2

export interface FilterStep {
  date: string;
  raw: number | null;
  level: number;
  slopePerDay: number;
  levelVar: number;
}

/** Runs the forward filter with a daily time step. Exported for tests and for updateTdee. */
export function kalmanFilter(observations: Map<string, number>, noise: NoiseModel): FilterStep[] {
  const days = [...observations.keys()].sort();
  if (days.length === 0) return [];
  const first = days[0];
  const last = days[days.length - 1];

  const R = noise.measurementSd ** 2;
  let x0 = observations.get(first)!;
  let x1 = 0;
  // Diffuse prior on slope, measurement-level uncertainty on level.
  let P: Mat2 = [R, 0, 0, noise.slopeVar * 400];

  const steps: FilterStep[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (day !== first) {
      // Predict: x = F x, P = F P F' + Q, with F = [[1,1],[0,1]].
      x0 = x0 + x1;
      const [a, b, c, d] = P;
      P = [a + b + c + d + noise.levelVar, b + d, c + d, d + noise.slopeVar];
    }
    const z = observations.get(day);
    if (z !== undefined) {
      // Update with H = [1, 0].
      const S = P[0] + R;
      const k0 = P[0] / S;
      const k1 = P[2] / S;
      const innovation = z - x0;
      x0 += k0 * innovation;
      x1 += k1 * innovation;
      const [a, b, c, d] = P;
      P = [(1 - k0) * a, (1 - k0) * b, c - k1 * a, d - k1 * b];
    }
    steps.push({ date: day, raw: z ?? null, level: x0, slopePerDay: x1, levelVar: Math.max(P[0], 1e-9) });
  }
  return steps;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function getTrends(readings: Reading[], type: ReadingType, goal?: Goal): Trend {
  const noise = NOISE[type];
  const steps = kalmanFilter(dailyObservations(readings, type), noise);
  if (steps.length === 0) return { type, points: [], slopePerWeek: 0, alert: "none" };

  const digits = type === "weight" ? 2 : 1;
  const points: TrendPoint[] = steps.map((s) => {
    const half = Z95 * Math.sqrt(s.levelVar);
    return {
      date: s.date,
      raw: s.raw === null ? null : round(s.raw, digits),
      filtered: round(s.level, digits),
      lower: round(s.level - half, digits),
      upper: round(s.level + half, digits),
    };
  });

  const lastStep = steps[steps.length - 1];
  const slopePerWeek = round(lastStep.slopePerDay * 7, 2);
  return { type, points, slopePerWeek, alert: detectAlert(type, steps, slopePerWeek, goal) };
}

function detectAlert(type: ReadingType, steps: FilterStep[], slopePerWeek: number, goal?: Goal): Trend["alert"] {
  const noise = NOISE[type];
  const last = steps[steps.length - 1];
  const half = Z95 * Math.sqrt(last.levelVar);

  if (type === "weight") {
    if (Math.abs(slopePerWeek) > TOO_FAST_KG_PER_WEEK) return "too_fast";
    if ((goal === "lose" || goal === "gain") && steps.length > STALL_DAYS) {
      const before = steps[steps.length - 1 - STALL_DAYS];
      const change = last.level - before.level;
      const wanted = goal === "lose" ? -1 : 1;
      if (change * wanted < STALL_KG) return "stalled";
    }
    if (goal === "maintain" || goal === undefined) {
      return bandAlert(steps, slopePerWeek, noise.slopeAlertPerWeek, half);
    }
    return "none";
  }
  return bandAlert(steps, slopePerWeek, noise.slopeAlertPerWeek, half);
}

/** Rising or falling only when the slope is large and the 95% band has cleared the earlier baseline. */
function bandAlert(steps: FilterStep[], slopePerWeek: number, threshold: number, half: number): Trend["alert"] {
  if (steps.length < 7) return "none";
  const baselineWindow = steps.slice(0, Math.max(3, steps.length - 7)).filter((s) => s.raw !== null);
  if (baselineWindow.length < 3) return "none";
  const baseline = baselineWindow.reduce((sum, s) => sum + (s.raw as number), 0) / baselineWindow.length;
  const last = steps[steps.length - 1];
  if (slopePerWeek > threshold && last.level - half > baseline) return "rising";
  if (slopePerWeek < -threshold && last.level + half < baseline) return "falling";
  return "none";
}
