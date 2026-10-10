import { describe, expect, it } from "vitest";
import type { VisionReading } from "@/types/contracts";
import { AGREEMENT_THRESHOLD, gramSimilarity, voteOnReadings } from "../vision/vote";

const reading = (model: string, items: [string, number, number?][]): VisionReading => ({
  model,
  items: items.map(([foodId, grams, confidence]) => ({
    foodId,
    name: foodId.replace(/_/g, " "),
    grams,
    confidence: confidence ?? 0.8,
  })),
});

describe("gramSimilarity", () => {
  it("is smaller over larger", () => {
    expect(gramSimilarity(100, 120)).toBeCloseTo(100 / 120, 5);
    expect(gramSimilarity(120, 100)).toBeCloseTo(100 / 120, 5);
    expect(gramSimilarity(50, 50)).toBe(1);
  });
  it("handles zero", () => {
    expect(gramSimilarity(0, 100)).toBe(0);
    expect(gramSimilarity(0, 0)).toBe(1);
  });
});

describe("voteOnReadings", () => {
  it("auto logs with averaged grams and confidences when both models agree", () => {
    const a = reading("a", [
      ["chicken_breast", 120, 0.9],
      ["brown_rice", 150, 0.8],
      ["broccoli", 90, 0.7],
    ]);
    const b = reading("b", [
      ["chicken_breast", 110, 0.8],
      ["brown_rice", 160, 0.9],
      ["broccoli", 100, 0.9],
    ]);
    const v = voteOnReadings(a, b);
    // similarities: 110/120 + 150/160 + 90/100 = 0.9167 + 0.9375 + 0.9 = 2.754 / 3 distinct = 0.918
    expect(v.agreement).toBeCloseTo(0.92, 2);
    expect(v.logged).toBe(true);
    expect(v.question).toBeNull();
    const chicken = v.items.find((i) => i.foodId === "chicken_breast")!;
    expect(chicken.grams).toBe(115);
    expect(chicken.confidence).toBeCloseTo(0.85, 2);
    expect(v.items.map((i) => i.foodId).sort()).toEqual(["broccoli", "brown_rice", "chicken_breast"]);
  });

  it("counts unmatched foods as zero similarity against the distinct food count", () => {
    const a = reading("a", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
    ]);
    const b = reading("b", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
      ["avocado", 50],
      ["tomato", 60],
    ]);
    const v = voteOnReadings(a, b);
    expect(v.agreement).toBeCloseTo(2 / 4, 5);
    expect(v.logged).toBe(false);
  });

  it("asks about the unmatched food with the most grams when agreement is low", () => {
    const a = reading("a", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
    ]);
    const b = reading("b", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
      ["avocado", 50],
      ["sweet_potato", 130],
    ]);
    const v = voteOnReadings(a, b);
    expect(v.logged).toBe(false);
    expect(v.question).not.toBeNull();
    expect(v.question!.text).toContain("sweet potato");
    expect(v.question!.options).toEqual(["Yes, there was sweet potato", "No sweet potato", "Not sure"]);
  });

  it("asks a portion question about the matched food with the lowest similarity when nothing is unmatched", () => {
    const a = reading("a", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
    ]);
    const b = reading("b", [
      ["chicken_breast", 100],
      ["brown_rice", 300],
    ]);
    const v = voteOnReadings(a, b);
    // (1 + 1/3) / 2 = 0.667 < 0.7
    expect(v.agreement).toBeCloseTo(0.67, 2);
    expect(v.logged).toBe(false);
    expect(v.question!.text).toBe("How much brown rice was there: about 100 g or 300 g?");
    expect(v.question!.options).toEqual(["About 100 g", "About 300 g", "Somewhere in between"]);
  });

  it("uses the 0.7 threshold inclusively", () => {
    // Similarities 1, 1, 0.1 over 3 distinct foods = 0.7 exactly.
    const a = reading("a", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
      ["broccoli", 10],
    ]);
    const b = reading("b", [
      ["chicken_breast", 100],
      ["brown_rice", 100],
      ["broccoli", 100],
    ]);
    const v = voteOnReadings(a, b);
    expect(v.agreement).toBeCloseTo(AGREEMENT_THRESHOLD, 5);
    expect(v.logged).toBe(true);
  });

  it("keeps single-model foods in the merged items at halved confidence", () => {
    const a = reading("a", [
      ["chicken_breast", 100, 0.9],
      ["brown_rice", 100, 0.9],
      ["broccoli", 100, 0.9],
      ["carrots", 100, 0.9],
    ]);
    const b = reading("b", [
      ["chicken_breast", 100, 0.9],
      ["brown_rice", 100, 0.9],
      ["broccoli", 100, 0.9],
      ["carrots", 100, 0.9],
      ["olive_oil", 10, 0.6],
    ]);
    const v = voteOnReadings(a, b);
    expect(v.agreement).toBeCloseTo(4 / 5, 5);
    expect(v.logged).toBe(true);
    const oil = v.items.find((i) => i.foodId === "olive_oil")!;
    expect(oil.grams).toBe(10);
    expect(oil.confidence).toBeCloseTo(0.3, 2);
  });

  it("merges duplicate foodIds inside one reading before matching", () => {
    const a = reading("a", [
      ["brown_rice", 50],
      ["brown_rice", 50],
    ]);
    const b = reading("b", [["brown_rice", 100]]);
    const v = voteOnReadings(a, b);
    expect(v.agreement).toBe(1);
    expect(v.items).toHaveLength(1);
    expect(v.items[0].grams).toBe(100);
  });

  it("ignores items with zero or invalid grams", () => {
    const a = reading("a", [
      ["brown_rice", 100],
      ["salt", 0],
    ]);
    const b = reading("b", [
      ["brown_rice", 100],
      ["pepper", Number.NaN],
    ]);
    const v = voteOnReadings(a, b);
    expect(v.agreement).toBe(1);
    expect(v.items.map((i) => i.foodId)).toEqual(["brown_rice"]);
  });

  it("asks what was eaten when neither model found food", () => {
    const v = voteOnReadings(reading("a", []), reading("b", []));
    expect(v.logged).toBe(false);
    expect(v.agreement).toBe(0);
    expect(v.items).toEqual([]);
    expect(v.question!.options).toHaveLength(3);
  });

  it("never logs when the models found completely different foods", () => {
    const v = voteOnReadings(reading("a", [["salmon", 130]]), reading("b", [["tilapia", 130]]));
    expect(v.agreement).toBe(0);
    expect(v.logged).toBe(false);
    expect(v.question!.text).toMatch(/salmon|tilapia/);
  });

  it("is symmetric in a and b", () => {
    const a = reading("a", [
      ["chicken_breast", 120],
      ["brown_rice", 150],
      ["avocado", 40],
    ]);
    const b = reading("b", [
      ["chicken_breast", 100],
      ["brown_rice", 170],
    ]);
    const ab = voteOnReadings(a, b);
    const ba = voteOnReadings(b, a);
    expect(ab.agreement).toBe(ba.agreement);
    expect(ab.logged).toBe(ba.logged);
    expect(ab.question?.text).toBe(ba.question?.text);
  });
});
