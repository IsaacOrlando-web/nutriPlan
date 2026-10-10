// Vision voting: two independent readings of one photo become one log entry or one question. Owner: Agents.
// Rules (spec section 9): match by foodId; similarity = smaller / larger grams; agreement = sum(similarity) /
// distinct foods found by either model; >= 0.7 auto logs with averaged grams, otherwise exactly one question.
import type { FoodLogItem, VisionReading } from "@/types/contracts";

export const AGREEMENT_THRESHOLD = 0.7;

export interface VoteResult {
  logged: boolean;
  agreement: number;
  /** Merged items: averaged grams for matched foods; single-model foods keep their grams at reduced confidence. */
  items: FoodLogItem[];
  question: { text: string; options: string[] } | null;
  detail: {
    matched: { foodId: string; name: string; gramsA: number; gramsB: number; similarity: number }[];
    onlyA: FoodLogItem[];
    onlyB: FoodLogItem[];
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function shortName(name: string): string {
  return name.split(",")[0].toLowerCase();
}

export function gramSimilarity(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi <= 0) return lo === hi ? 1 : 0;
  return lo / hi;
}

/** Deduplicates a reading by foodId (summing grams, max confidence) so a model listing rice twice counts once. */
function normalize(items: FoodLogItem[]): Map<string, FoodLogItem> {
  const out = new Map<string, FoodLogItem>();
  for (const it of items) {
    if (!it.foodId || !Number.isFinite(it.grams) || it.grams <= 0) continue;
    const prev = out.get(it.foodId);
    if (prev)
      out.set(it.foodId, {
        ...prev,
        grams: prev.grams + it.grams,
        confidence: Math.max(prev.confidence, it.confidence),
      });
    else out.set(it.foodId, { ...it });
  }
  return out;
}

export function voteOnReadings(
  a: VisionReading,
  b: VisionReading,
  threshold = AGREEMENT_THRESHOLD,
): VoteResult {
  const A = normalize(a.items);
  const B = normalize(b.items);
  const distinct = new Set([...A.keys(), ...B.keys()]);

  const matched: VoteResult["detail"]["matched"] = [];
  const onlyA: FoodLogItem[] = [];
  const onlyB: FoodLogItem[] = [];
  for (const id of distinct) {
    const ia = A.get(id);
    const ib = B.get(id);
    if (ia && ib)
      matched.push({
        foodId: id,
        name: ia.name || ib.name,
        gramsA: ia.grams,
        gramsB: ib.grams,
        similarity: gramSimilarity(ia.grams, ib.grams),
      });
    else if (ia) onlyA.push(ia);
    else if (ib) onlyB.push(ib);
  }

  const agreement =
    distinct.size === 0 ? 0 : round2(matched.reduce((s, m) => s + m.similarity, 0) / distinct.size);

  const merged: FoodLogItem[] = [];
  for (const m of matched) {
    const ia = A.get(m.foodId)!;
    const ib = B.get(m.foodId)!;
    merged.push({
      foodId: m.foodId,
      name: m.name,
      grams: Math.round((ia.grams + ib.grams) / 2),
      confidence: round2((ia.confidence + ib.confidence) / 2),
    });
  }
  for (const it of [...onlyA, ...onlyB])
    merged.push({ ...it, grams: Math.round(it.grams), confidence: round2(it.confidence / 2) });

  if (distinct.size === 0) {
    return {
      logged: false,
      agreement: 0,
      items: [],
      question: {
        text: "I could not recognize any food in this photo. What did you eat?",
        options: ["Let me type it", "Try another photo", "Skip this meal"],
      },
      detail: { matched, onlyA, onlyB },
    };
  }

  if (agreement >= threshold) {
    return { logged: true, agreement, items: merged, question: null, detail: { matched, onlyA, onlyB } };
  }

  // Biggest disagreement: the unmatched food with the most grams, else the matched food with the lowest similarity.
  const unmatched = [...onlyA, ...onlyB].sort((x, y) => y.grams - x.grams);
  let question: VoteResult["question"];
  if (unmatched.length > 0) {
    const u = unmatched[0];
    const label = shortName(u.name);
    question = {
      text: `Was there ${label} on the plate?`,
      options: [`Yes, there was ${label}`, `No ${label}`, "Not sure"],
    };
  } else {
    const worst = [...matched].sort((x, y) => x.similarity - y.similarity)[0];
    const lo = Math.round(Math.min(worst.gramsA, worst.gramsB));
    const hi = Math.round(Math.max(worst.gramsA, worst.gramsB));
    question = {
      text: `How much ${shortName(worst.name)} was there: about ${lo} g or ${hi} g?`,
      options: [`About ${lo} g`, `About ${hi} g`, "Somewhere in between"],
    };
  }
  return { logged: false, agreement, items: merged, question, detail: { matched, onlyA, onlyB } };
}
