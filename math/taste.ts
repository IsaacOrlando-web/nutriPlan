// sampleTaste (stretch): Thompson sampling over meal ratings. Owner: Math.
// Each meal has a Beta(1 + likes, 1 + dislikes) posterior; we draw one sample per meal.
// Pass a seeded `random` for reproducible tests.

/** Marsaglia and Tsang gamma sampler (shape >= 1), boosted for shape < 1. */
function sampleGamma(shape: number, random: () => number): number {
  if (shape < 1) return sampleGamma(shape + 1, random) * Math.pow(random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normal(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function sampleBeta(a: number, b: number, random: () => number = Math.random): number {
  const x = sampleGamma(a, random);
  const y = sampleGamma(b, random);
  return x / (x + y);
}

export function sampleTaste(
  ratings: { mealName: string; liked: boolean }[],
  mealNames: string[],
  random: () => number = Math.random,
): Record<string, number> {
  const counts = new Map<string, { likes: number; dislikes: number }>();
  for (const r of ratings) {
    const c = counts.get(r.mealName) ?? { likes: 0, dislikes: 0 };
    if (r.liked) c.likes++;
    else c.dislikes++;
    counts.set(r.mealName, c);
  }
  const out: Record<string, number> = {};
  for (const name of mealNames) {
    const c = counts.get(name) ?? { likes: 0, dislikes: 0 };
    out[name] = Math.round(sampleBeta(1 + c.likes, 1 + c.dislikes, random) * 1000) / 1000;
  }
  return out;
}

/** Small deterministic PRNG (mulberry32) for tests and reproducible demos. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
