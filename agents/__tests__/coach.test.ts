import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import { mondayOf, runCoach } from "../coach";

process.env.AGENTS_MODE = "scripted";

let store: MemoryStore;

beforeAll(() => {
  store = new MemoryStore(null);
  setStore(store);
});

describe("mondayOf", () => {
  it("returns the Monday of the week for any weekday", () => {
    expect(mondayOf("2026-10-10")).toBe("2026-10-05"); // Saturday
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-10-06T23:00:00.000Z")).toBe("2026-10-05");
  });
});

describe("runCoach", () => {
  it("answers a demo user with the full context in scripted mode", async () => {
    const userId = DEMO_USER_IDS.alex;
    const res = await runCoach(userId, [{ role: "user", content: "How many calories do I have left?" }], {
      store,
      dryRun: true,
    });
    expect(res.reply).toMatch(/kcal/);
    expect(res.replanRunId).toBeNull();
  });
});
