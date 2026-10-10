// updateTdee: Bayesian (normal-normal conjugate) estimate of a user's real metabolism. Owner: Math.
// Observation: TDEE ~= mean intake - (change in filtered weight x 7700 / days).
// Prior comes from Mifflin St Jeor with sd 300 kcal (see targets.ts).
import type { Trend } from "@/types/contracts";
import { KCAL_PER_KG } from "./targets";

/** Typical error of self-reported or plan-based intake, kcal per day. */
export const INTAKE_SD = 150;
const Z95 = 1.96;

export interface TdeeObservation {
  tdee: number;
  sd: number;
  days: number;
}

/** Builds the TDEE observation from intake history and the filtered weight trend. */
export function observeTdee(intakeKcal: number[], weightTrend: Trend): TdeeObservation | null {
  const valid = intakeKcal.filter((k) => Number.isFinite(k) && k > 0);
  const points = weightTrend.points;
  const days = Math.min(valid.length, points.length - 1);
  if (days < 7) return null;

  const end = points[points.length - 1];
  const start = points[points.length - 1 - days];
  const deltaKg = end.filtered - start.filtered;
  const meanIntake = valid.slice(-days).reduce((a, b) => a + b, 0) / days;

  // The band is +-1.96 sd; the start and end errors combine.
  const sdEnd = (end.upper - end.lower) / (2 * Z95);
  const sdStart = (start.upper - start.lower) / (2 * Z95);
  const deltaSd = Math.sqrt(sdEnd ** 2 + sdStart ** 2);

  const tdee = meanIntake - (deltaKg * KCAL_PER_KG) / days;
  const sd = Math.sqrt(INTAKE_SD ** 2 + ((deltaSd * KCAL_PER_KG) / days) ** 2);
  return { tdee, sd, days };
}

export function updateTdee(
  prior: { mean: number; sd: number },
  intakeKcal: number[],
  weightTrend: Trend,
): { mean: number; sd: number } {
  const obs = observeTdee(intakeKcal, weightTrend);
  if (!obs) return { mean: Math.round(prior.mean), sd: Math.round(prior.sd) };

  const priorVar = prior.sd ** 2;
  const obsVar = obs.sd ** 2;
  const postVar = 1 / (1 / priorVar + 1 / obsVar);
  const mean = postVar * (prior.mean / priorVar + obs.tdee / obsVar);
  return { mean: Math.round(mean), sd: Math.round(Math.sqrt(postVar)) };
}
