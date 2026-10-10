// Demo users Alex and Maria with 21 days of readings. Owner: Backend.
// Single source of truth for seeded demo data: the in-memory store, mocks, Supabase seed and tests all use it.
// Data is deterministic (seeded noise) and dated relative to `endDate` so the demo always looks current.
import type { Reading, UserProfile } from "@/types/contracts";

export const DEMO_USER_IDS = {
  alex: "00000000-0000-4000-8000-00000000a1e1",
  maria: "00000000-0000-4000-8000-0000000a7a1a",
} as const;

export type DemoUserKey = keyof typeof DEMO_USER_IDS;

export const DEMO_EMAILS: Record<DemoUserKey, string> = {
  alex: "alex@demo.nutriplan.app",
  maria: "maria@demo.nutriplan.app",
};

export const ALEX_PROFILE: UserProfile = {
  userId: DEMO_USER_IDS.alex,
  name: "Alex",
  language: "en",
  sex: "male",
  age: 22,
  heightCm: 180,
  weightKg: 89.3,
  activityLevel: "light",
  goal: "lose",
  goalRateKgPerWeek: 0.5,
  conditions: [],
  medications: [],
  allergies: ["peanut"],
  restrictions: [],
  likes: ["chicken", "mexican", "rice bowls", "eggs", "salmon"],
  dislikes: ["mushrooms", "cottage cheese"],
  weeklyBudgetUsd: 50,
  mealsPerDay: 3,
};

export const MARIA_PROFILE: UserProfile = {
  userId: DEMO_USER_IDS.maria,
  name: "Maria",
  language: "en",
  sex: "female",
  age: 45,
  heightCm: 163,
  weightKg: 82,
  activityLevel: "light",
  goal: "maintain",
  goalRateKgPerWeek: 0,
  conditions: ["type2_diabetes", "hypertension"],
  medications: ["metformin", "amlodipine"],
  allergies: [],
  restrictions: [],
  likes: ["beans", "chicken", "mexican", "soups", "fruit"],
  dislikes: ["sardines"],
  weeklyBudgetUsd: 70,
  mealsPerDay: 4,
};

export const DEMO_PROFILES: Record<DemoUserKey, UserProfile> = { alex: ALEX_PROFILE, maria: MARIA_PROFILE };

const DAY_MS = 86_400_000;

/** mulberry32: tiny deterministic PRNG so seeded noise never changes between runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise(random: () => number, sd: number): number {
  // Sum of uniforms approximates a normal and keeps values bounded (no wild outliers in a demo).
  return ((random() + random() + random() - 1.5) / 0.5) * sd;
}

function isoAt(endDate: string, daysBefore: number, hourUtc: number): string {
  const t = Date.parse(`${endDate}T00:00:00Z`) - daysBefore * DAY_MS + hourUtc * 3_600_000;
  return new Date(t).toISOString();
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Alex: 21 days of weight. Week 1 loses about 0.8 kg, then 14 days stall around 89.3 kg.
 * The Kalman filter must flag "stalled" on this series.
 */
export function alexReadings(endDate = todayIso()): Reading[] {
  const random = rng(11);
  const out: Reading[] = [];
  for (let i = 20; i >= 0; i--) {
    const day = 20 - i; // 0..20
    const trend = day < 7 ? 90.15 - 0.12 * day : 89.3;
    out.push({
      readingId: `seed-alex-w-${day}`,
      userId: DEMO_USER_IDS.alex,
      type: "weight",
      value: round(trend + noise(random, 0.25), 1),
      unit: "kg",
      takenAt: isoAt(endDate, i, 13),
    });
  }
  return out;
}

/**
 * Maria: 21 days of fasting glucose (stable around 127 mg/dL, then drifting up over the last 4 days),
 * stable weight, and blood pressure every other day. The Kalman filter must flag glucose "rising".
 */
export function mariaReadings(endDate = todayIso()): Reading[] {
  const random = rng(29);
  const out: Reading[] = [];
  const drift = [139, 147, 155, 163];
  for (let i = 20; i >= 0; i--) {
    const day = 20 - i;
    const glucose = day >= 17 ? drift[day - 17] + noise(random, 2) : 127 + noise(random, 5);
    out.push({
      readingId: `seed-maria-g-${day}`,
      userId: DEMO_USER_IDS.maria,
      type: "glucose_fasting",
      value: Math.round(glucose),
      unit: "mg/dL",
      takenAt: isoAt(endDate, i, 12),
    });
    out.push({
      readingId: `seed-maria-w-${day}`,
      userId: DEMO_USER_IDS.maria,
      type: "weight",
      value: round(82.2 + noise(random, 0.25), 1),
      unit: "kg",
      takenAt: isoAt(endDate, i, 12.5),
    });
    if (day % 2 === 0) {
      out.push({
        readingId: `seed-maria-bp-${day}`,
        userId: DEMO_USER_IDS.maria,
        type: "bp",
        value: Math.round(136 + noise(random, 4)),
        value2: Math.round(86 + noise(random, 3)),
        unit: "mmHg",
        takenAt: isoAt(endDate, i, 20),
      });
    }
  }
  return out;
}

export function demoReadings(key: DemoUserKey, endDate = todayIso()): Reading[] {
  return key === "alex" ? alexReadings(endDate) : mariaReadings(endDate);
}

/**
 * Daily intake history (kcal) used by the Bayesian metabolism update. Alex followed his plan
 * (about 2,060 kcal) closely, which is why the stall points to a lower real TDEE.
 */
export function demoIntakeKcal(key: DemoUserKey, days = 21): number[] {
  const random = rng(key === "alex" ? 5 : 7);
  const base = key === "alex" ? 2080 : 1720;
  return Array.from({ length: days }, () => Math.round(base + noise(random, 80)));
}

/** Readings that look like normal day to day noise around a flat level (for "stays quiet" tests). */
export function flatNoiseReadings(type: Reading["type"], level: number, sd: number, days = 28, seed = 3): Reading[] {
  const random = rng(seed);
  const unit: Reading["unit"] = type === "weight" ? "kg" : type === "bp" ? "mmHg" : "mg/dL";
  return Array.from({ length: days }, (_, i) => ({
    readingId: `flat-${type}-${i}`,
    userId: "test",
    type,
    value: round(level + noise(random, sd), 1),
    unit,
    takenAt: isoAt("2026-01-31", days - 1 - i, 12),
  }));
}
