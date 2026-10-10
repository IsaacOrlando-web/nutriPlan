// analyzePhoto: two providers read the same photo independently. Owner: Agents.
// Live: Vision A (Anthropic) and Vision B (Google, backup OpenAI) in parallel through callObject with the image;
// ingredient names are mapped to foodIds with searchFoods. Scripted (no keys): a deterministic plausible reading
// chosen by a hash of the URL, with model B differing by about 10 percent. Never fails.
import type { FoodLogItem, VisionReading } from "@/types/contracts";
import { getStore } from "@/lib/db";
import type { Store } from "@/lib/db/store";
import { VisionOutputSchema } from "@/agents/schemas";
import { callObjectWithModel, llmAvailable, NoLlmError } from "@/agents/llm";
import { loadPrompt } from "@/agents/prompts";
import { mapQueryToFood } from "@/agents/tools/backend";
import type { AgentKey } from "@/agents/config";

interface Template {
  label: string;
  /** URL substrings that select this template in scripted mode. */
  keywords: string[];
  items: { foodId: string; grams: number; confidence: number }[];
  /** Extra food only model B sees (forces a question in the demo). */
  extraB?: { foodId: string; grams: number; confidence: number };
}

export const SCRIPTED_TEMPLATES: Template[] = [
  {
    label: "chicken rice bowl",
    keywords: ["chicken", "lunch-bowl", "rice-bowl"],
    items: [
      { foodId: "chicken_breast", grams: 120, confidence: 0.9 },
      { foodId: "brown_rice", grams: 150, confidence: 0.85 },
      { foodId: "broccoli", grams: 90, confidence: 0.8 },
    ],
  },
  {
    label: "salmon plate",
    keywords: ["salmon", "fish"],
    items: [
      { foodId: "salmon", grams: 130, confidence: 0.88 },
      { foodId: "quinoa", grams: 140, confidence: 0.8 },
      { foodId: "green_beans", grams: 100, confidence: 0.78 },
    ],
  },
  {
    label: "bean tacos",
    keywords: ["taco", "bean"],
    items: [
      { foodId: "black_beans", grams: 120, confidence: 0.86 },
      { foodId: "corn_tortilla", grams: 52, confidence: 0.9 },
      { foodId: "fresh_salsa", grams: 60, confidence: 0.7 },
      { foodId: "avocado", grams: 50, confidence: 0.75 },
    ],
  },
  {
    label: "yogurt bowl with a doubt",
    keywords: ["yogurt", "parfait"],
    items: [
      { foodId: "greek_yogurt", grams: 170, confidence: 0.9 },
      { foodId: "blueberries", grams: 70, confidence: 0.8 },
      { foodId: "oats", grams: 40, confidence: 0.75 },
    ],
    extraB: { foodId: "honey", grams: 21, confidence: 0.55 },
  },
];

/** FNV-1a hash so the same photo always yields the same scripted reading. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export async function scriptedReadings(
  store: Store,
  photoUrl: string,
): Promise<{ a: VisionReading; b: VisionReading }> {
  const key = photoUrl.startsWith("data:") ? photoUrl.slice(0, 256) + photoUrl.length : photoUrl;
  const h = hashString(key);
  // A URL that names a dish (demo photos) picks that template; anything else is chosen by hash.
  const lower = photoUrl.toLowerCase();
  const byName = SCRIPTED_TEMPLATES.find((t) => t.keywords.some((k) => lower.includes(k)));
  const template = byName ?? SCRIPTED_TEMPLATES[h % SCRIPTED_TEMPLATES.length];
  const ids = template.items.map((i) => i.foodId).concat(template.extraB ? [template.extraB.foodId] : []);
  const foods = await store.getFoods(ids);
  const name = (id: string) => foods[id]?.name ?? id;
  const a: FoodLogItem[] = template.items.map((i) => ({
    foodId: i.foodId,
    name: name(i.foodId),
    grams: i.grams,
    confidence: i.confidence,
  }));
  const b: FoodLogItem[] = template.items.map((i, idx) => {
    const wobble = 1 + (((h >> (idx * 3)) & 1) === 0 ? -0.1 : 0.1); // about 10 percent either way
    return {
      foodId: i.foodId,
      name: name(i.foodId),
      grams: Math.round(i.grams * wobble),
      confidence: Math.max(0.3, i.confidence - 0.08),
    };
  });
  if (template.extraB)
    b.push({
      foodId: template.extraB.foodId,
      name: name(template.extraB.foodId),
      grams: template.extraB.grams,
      confidence: template.extraB.confidence,
    });
  return { a: { model: "scripted-a", items: a }, b: { model: "scripted-b", items: b } };
}

async function liveReading(store: Store, agent: AgentKey, photoUrl: string): Promise<VisionReading> {
  const { object, model } = await callObjectWithModel({
    agent,
    schema: VisionOutputSchema,
    system: loadPrompt("vision"),
    prompt: "List the foods on this plate with grams and confidence.",
    images: [photoUrl],
    temperature: 0.2,
  });
  const items: FoodLogItem[] = [];
  for (const it of object.items) {
    const food = await mapQueryToFood(store, it.query);
    if (!food || items.some((x) => x.foodId === food.foodId)) continue;
    items.push({
      foodId: food.foodId,
      name: food.name,
      grams: Math.round(it.grams),
      confidence: Math.round(it.confidence * 100) / 100,
    });
  }
  return { model, items };
}

/** Two independent readings of one photo. Falls back per model to the scripted reading so logging never fails. */
export async function analyzePhoto(
  photoUrl: string,
  store: Store = getStore(),
): Promise<{ a: VisionReading; b: VisionReading }> {
  const scripted = await scriptedReadings(store, photoUrl);
  if (!llmAvailable("visionA") && !llmAvailable("visionB")) return scripted;

  const [ra, rb] = await Promise.allSettled([
    liveReading(store, "visionA", photoUrl),
    liveReading(store, "visionB", photoUrl),
  ]);
  const pick = (
    r: PromiseSettledResult<VisionReading>,
    fallback: VisionReading,
    label: string,
  ): VisionReading => {
    if (r.status === "fulfilled") return r.value;
    const reason = r.reason instanceof NoLlmError ? r.reason.reason : (r.reason as Error)?.message;
    console.warn(`[vision] ${label} failed (${reason}); using scripted reading`);
    return { ...fallback, model: `${fallback.model}-fallback` };
  };
  return { a: pick(ra, scripted.a, "visionA"), b: pick(rb, scripted.b, "visionB") };
}
