// simulate (stretch): 12 week outcome simulator, Monte Carlo with uncertainty bands. Owner: Math.
// Each run draws a true TDEE from the posterior and a daily adherence noise, then integrates
// weight change = (intake - TDEE) / 7700 per day, with TDEE adapting to weight (about 22 kcal per kg).
import type { MealPlan, UserProfile } from "@/types/contracts";
import { KCAL_PER_KG } from "./targets";
import { seededRandom } from "./taste";

export interface SimulationWeek {
  week: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface SimulationResult {
  weeks: SimulationWeek[];
  runs: number;
  expectedChangeKg: number;
}

const KCAL_PER_KG_BODY_PER_DAY = 22; // TDEE falls about 22 kcal/day per kg lost
const ADHERENCE_SD_KCAL = 200;

function normal(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function simulate(
  profile: UserProfile,
  plan: MealPlan,
  tdee: { mean: number; sd: number },
  weeks: number,
  opts: { runs?: number; seed?: number } = {},
): SimulationResult {
  const runs = opts.runs ?? 500;
  const random = seededRandom(opts.seed ?? 42);
  const dailyIntake =
    plan.days.length > 0 ? plan.days.reduce((s, d) => s + d.dayTotals.calories, 0) / plan.days.length : tdee.mean;

  const byWeek: number[][] = Array.from({ length: weeks }, () => []);
  for (let r = 0; r < runs; r++) {
    let weight = profile.weightKg;
    const baseTdee = tdee.mean + tdee.sd * normal(random);
    for (let day = 1; day <= weeks * 7; day++) {
      const adaptedTdee = baseTdee - KCAL_PER_KG_BODY_PER_DAY * (profile.weightKg - weight);
      const intake = dailyIntake + ADHERENCE_SD_KCAL * normal(random);
      weight += (intake - adaptedTdee) / KCAL_PER_KG;
      if (day % 7 === 0) byWeek[day / 7 - 1].push(weight);
    }
  }
  const out = byWeek.map((ws, i) => {
    const sorted = [...ws].sort((a, b) => a - b);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { week: i + 1, p10: r2(quantile(sorted, 0.1)), p50: r2(quantile(sorted, 0.5)), p90: r2(quantile(sorted, 0.9)) };
  });
  return {
    weeks: out,
    runs,
    expectedChangeKg: out.length ? Math.round((out[out.length - 1].p50 - profile.weightKg) * 100) / 100 : 0,
  };
}
