// fitGlucoseResponse (stretch): personal glucose response model, Bayesian linear regression per user. Owner: Math.
// Model: post meal glucose rise = b0 + b1 x glycemicLoad + noise. Readings of type glucose_post_meal with a
// relatedLogId are paired with that food log. Gaussian prior on (b0, b1), known noise variance.
import type { FoodLogEntry, Reading } from "@/types/contracts";

export interface GlucoseModel {
  /** Expected rise in mg/dL above fasting baseline for a meal with glycemic load 0. */
  intercept: number;
  /** Extra mg/dL per glycemic load unit. */
  perGlycemicLoad: number;
  /** Posterior standard deviation of perGlycemicLoad. */
  perGlycemicLoadSd: number;
  baselineFasting: number;
  observations: number;
  predict: (glycemicLoad: number) => { mean: number; sd: number };
}

const PRIOR = { b0: 20, b1: 2.0, sd0: 15, sd1: 1.0 };
const NOISE_SD = 15;

export function fitGlucoseResponse(logs: FoodLogEntry[], readings: Reading[]): GlucoseModel {
  const fasting = readings.filter((r) => r.type === "glucose_fasting").map((r) => r.value);
  const baselineFasting = fasting.length ? fasting.reduce((a, b) => a + b, 0) / fasting.length : 100;
  const byLog = new Map(logs.map((l) => [l.logId, l]));

  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of readings) {
    if (r.type !== "glucose_post_meal" || !r.relatedLogId) continue;
    const log = byLog.get(r.relatedLogId);
    if (!log) continue;
    xs.push(log.totals.glycemicLoad);
    ys.push(r.value - baselineFasting);
  }

  // Posterior precision = prior precision + X'X / s^2 ; mean = cov (prior precision * prior mean + X'y / s^2).
  const s2 = NOISE_SD ** 2;
  let a = 1 / PRIOR.sd0 ** 2;
  let b = 0;
  let d = 1 / PRIOR.sd1 ** 2;
  let r0 = PRIOR.b0 / PRIOR.sd0 ** 2;
  let r1 = PRIOR.b1 / PRIOR.sd1 ** 2;
  xs.forEach((x, i) => {
    a += 1 / s2;
    b += x / s2;
    d += (x * x) / s2;
    r0 += ys[i] / s2;
    r1 += (x * ys[i]) / s2;
  });
  const det = a * d - b * b;
  const c00 = d / det;
  const c01 = -b / det;
  const c11 = a / det;
  const b0 = c00 * r0 + c01 * r1;
  const b1 = c01 * r0 + c11 * r1;

  return {
    intercept: Math.round(b0 * 10) / 10,
    perGlycemicLoad: Math.round(b1 * 100) / 100,
    perGlycemicLoadSd: Math.round(Math.sqrt(c11) * 100) / 100,
    baselineFasting: Math.round(baselineFasting),
    observations: xs.length,
    predict: (gl: number) => {
      const mean = baselineFasting + b0 + b1 * gl;
      const varMean = c00 + 2 * gl * c01 + gl * gl * c11;
      return { mean: Math.round(mean), sd: Math.round(Math.sqrt(varMean + s2)) };
    },
  };
}
