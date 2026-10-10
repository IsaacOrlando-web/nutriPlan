import { describe, expect, it } from "vitest";
import { observeTdee, updateTdee } from "@/math/metabolism";
import { getTrends } from "@/math/kalman";
import { alexReadings, demoIntakeKcal, flatNoiseReadings } from "@/lib/db/seed/demo-users";

describe("updateTdee (normal-normal conjugate)", () => {
  it("pulls Alex's metabolism estimate down after a stall on plan", () => {
    const prior = { mean: 2630, sd: 300 };
    const trend = getTrends(alexReadings("2026-10-09"), "weight", "lose");
    const post = updateTdee(prior, demoIntakeKcal("alex", 14), trend);
    expect(post.mean).toBeLessThan(prior.mean);
    expect(post.mean).toBeGreaterThan(2080);
    expect(post.sd).toBeLessThan(prior.sd);
  });

  it("returns the prior when there is not enough data", () => {
    const trend = getTrends(alexReadings("2026-10-09").slice(-3), "weight", "lose");
    expect(updateTdee({ mean: 2500, sd: 300 }, [2000, 2000, 2000], trend)).toEqual({ mean: 2500, sd: 300 });
  });

  it("reads maintenance at intake when weight is flat", () => {
    const trend = getTrends(flatNoiseReadings("weight", 80, 0.2, 21, 2), "weight", "maintain");
    const obs = observeTdee(Array(20).fill(2300), trend);
    expect(obs).not.toBeNull();
    expect(Math.abs(obs!.tdee - 2300)).toBeLessThan(250);
  });

  it("is a proper conjugate update (posterior between prior and observation)", () => {
    const trend = getTrends(flatNoiseReadings("weight", 80, 0.2, 21, 2), "weight", "maintain");
    const obs = observeTdee(Array(20).fill(2000), trend)!;
    const post = updateTdee({ mean: 2600, sd: 300 }, Array(20).fill(2000), trend);
    expect(post.mean).toBeLessThan(2600);
    expect(post.mean).toBeGreaterThan(Math.min(obs.tdee, 2600) - 1);
  });
});
