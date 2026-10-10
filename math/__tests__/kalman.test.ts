import { describe, expect, it } from "vitest";
import { getTrends } from "@/math/kalman";
import { alexReadings, flatNoiseReadings, mariaReadings } from "@/lib/db/seed/demo-users";

describe("getTrends (Kalman local linear trend)", () => {
  it("flags Alex's 14 day weight stall", () => {
    const trend = getTrends(alexReadings("2026-10-09"), "weight", "lose");
    expect(trend.points).toHaveLength(21);
    expect(trend.alert).toBe("stalled");
  });

  it("flags Maria's rising fasting glucose", () => {
    const trend = getTrends(mariaReadings("2026-10-09"), "glucose_fasting");
    expect(trend.alert).toBe("rising");
    expect(trend.slopePerWeek).toBeGreaterThan(10);
  });

  it("stays quiet on normal glucose noise", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const trend = getTrends(flatNoiseReadings("glucose_fasting", 120, 8, 28, seed), "glucose_fasting");
      expect(trend.alert).toBe("none");
    }
  });

  it("stays quiet on normal blood pressure noise", () => {
    for (const seed of [1, 2, 3]) {
      expect(getTrends(flatNoiseReadings("bp", 130, 5, 28, seed), "bp").alert).toBe("none");
    }
  });

  it("does not call a steady loss a stall", () => {
    const readings = flatNoiseReadings("weight", 0, 0.25, 28, 9).map((r, i) => ({ ...r, value: 95 - 0.08 * i + r.value }));
    expect(getTrends(readings, "weight", "lose").alert).toBe("none");
  });

  it("flags losing weight too fast", () => {
    const readings = flatNoiseReadings("weight", 0, 0.2, 21, 4).map((r, i) => ({ ...r, value: 100 - 0.3 * i + r.value }));
    expect(getTrends(readings, "weight", "lose").alert).toBe("too_fast");
  });

  it("produces a 95% band around the filtered value and fills missing days", () => {
    const readings = alexReadings("2026-10-09").filter((_, i) => i % 3 !== 1);
    const trend = getTrends(readings, "weight", "lose");
    expect(trend.points).toHaveLength(21);
    expect(trend.points.some((p) => p.raw === null)).toBe(true);
    for (const p of trend.points) {
      expect(p.lower).toBeLessThanOrEqual(p.filtered);
      expect(p.upper).toBeGreaterThanOrEqual(p.filtered);
    }
  });

  it("returns an empty trend with no readings", () => {
    expect(getTrends([], "weight")).toEqual({ type: "weight", points: [], slopePerWeek: 0, alert: "none" });
  });
});
