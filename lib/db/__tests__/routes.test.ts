// Route handler tests: the pure handlers are called with NextRequest against an in-memory store. Owner: Backend.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MemoryStore } from "@/lib/db/memory-store";
import { setStore } from "@/lib/db";
import { DEMO_USER_IDS } from "@/lib/db/seed/demo-users";
import type {
  CreateReadingResponse,
  DaySummary,
  Food,
  MonitorResult,
  ProfileBundle,
  SessionInfo,
  Trend,
} from "@/types/contracts";
import alexProfile from "@/mocks/profile-alex.json";
import mariaProfile from "@/mocks/profile-maria.json";

process.env.MEMORY_STORE_FILE = "none";
process.env.AUTH_MODE = "local";

// /agents/monitor is owned by the Agents role and may not exist yet; the routes only need its shape.
const runMonitor = vi.fn(async (_userId: string, _trigger: string): Promise<MonitorResult> => ({
  action: "none",
  reason: "mocked",
  runId: null,
  alerts: [],
}));
vi.mock("@/agents/monitor", () => ({
  runMonitor: (userId: string, trigger: string) => runMonitor(userId, trigger),
}));

const ALEX = DEMO_USER_IDS.alex;
const MARIA = DEMO_USER_IDS.maria;
const cookieFor = (userId: string, email: string) => `np_uid=${userId}|${email}`;
const ALEX_COOKIE = cookieFor(ALEX, "alex@demo.nutriplan.app");
const MARIA_COOKIE = cookieFor(MARIA, "maria@demo.nutriplan.app");

function req(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== null) headers.cookie = init.cookie ?? ALEX_COOKIE;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(new URL(`http://localhost${path}`), {
    method: init.method ?? "GET",
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    headers,
  });
}

const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  setStore(new MemoryStore(null));
  runMonitor.mockClear();
});

describe("auth", () => {
  it("login as alex sets the np_uid cookie and reports hasProfile", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      req("/api/auth/login", { method: "POST", body: { identifier: "alex" }, cookie: null }),
      ctx,
    );
    expect(res.status).toBe(200);
    const info = (await res.json()) as SessionInfo;
    expect(info).toEqual({ userId: ALEX, email: "alex@demo.nutriplan.app", mode: "local", hasProfile: true });
    expect(res.headers.get("set-cookie")).toContain(
      `np_uid=${ALEX}%7Calex%40demo.nutriplan.app`.replace("%7C", "%7C"),
    );
    expect(res.headers.get("set-cookie")).toMatch(/np_uid=/);
  });

  it("login with an unknown email creates a stable id without a profile", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const a = (await (
      await POST(
        req("/api/auth/login", { method: "POST", body: { identifier: "sam@example.com" }, cookie: null }),
        ctx,
      )
    ).json()) as SessionInfo;
    const b = (await (
      await POST(
        req("/api/auth/login", { method: "POST", body: { identifier: "SAM@example.com" }, cookie: null }),
        ctx,
      )
    ).json()) as SessionInfo;
    expect(a.userId).toBe(b.userId);
    expect(a.hasProfile).toBe(false);
  });

  it("session returns nulls when signed out and the user when signed in", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const anon = (await (await GET(req("/api/auth/session", { cookie: null }), ctx)).json()) as SessionInfo;
    expect(anon).toEqual({ userId: null, email: null, mode: "local", hasProfile: false });
    const alex = (await (await GET(req("/api/auth/session"), ctx)).json()) as SessionInfo;
    expect(alex.userId).toBe(ALEX);
    expect(alex.hasProfile).toBe(true);
  });

  it("logout clears the cookie with 204", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const res = await POST(req("/api/auth/logout", { method: "POST" }), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/np_uid=;/);
  });

  it("protected routes return 401 without a session", async () => {
    const { GET } = await import("@/app/api/profile/route");
    const res = await GET(req("/api/profile", { cookie: null }), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
  });
});

describe("profile", () => {
  it("POST builds constraints (Doctor rules) and targets (Math) and saves them", async () => {
    const { POST, GET } = await import("@/app/api/profile/route");
    const { userId: _drop, ...input } = mariaProfile;
    const res = await POST(req("/api/profile", { method: "POST", body: input, cookie: MARIA_COOKIE }), ctx);
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as ProfileBundle;
    expect(bundle.profile.userId).toBe(MARIA);
    expect(bundle.constraints.maxCarbsPerMealG).toBeDefined(); // diabetes
    expect(bundle.constraints.maxSodiumMgPerDay).toBeLessThanOrEqual(1500); // hypertension
    expect(bundle.constraints.reasons.length).toBeGreaterThan(0);
    expect(bundle.targets.calories).toBeGreaterThan(1200);
    expect(bundle.targets.tdeeUncertainty).toBeGreaterThan(0);

    const again = (await (
      await GET(req("/api/profile", { cookie: MARIA_COOKIE }), ctx)
    ).json()) as ProfileBundle;
    expect(again).toEqual(bundle);
  });

  it("POST rejects invalid input with 400 { error }", async () => {
    const { POST } = await import("@/app/api/profile/route");
    const res = await POST(req("/api/profile", { method: "POST", body: { ...alexProfile, age: 5 } }), ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("age");
  });

  it("GET lazily builds constraints and targets for seeded demo users", async () => {
    const { GET } = await import("@/app/api/profile/route");
    const res = await GET(req("/api/profile"), ctx);
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as ProfileBundle;
    expect(bundle.profile.name).toBe("Alex");
    expect(bundle.constraints.excludedFoodTags).toContain("peanut");
    expect(bundle.targets.calories).toBeGreaterThan(1500);
  });

  it("GET returns 404 for a user without a profile", async () => {
    const { GET } = await import("@/app/api/profile/route");
    const res = await GET(
      req("/api/profile", { cookie: cookieFor("11111111-1111-4111-8111-111111111111", "x@y.z") }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No profile yet" });
  });
});

describe("readings", () => {
  it("POST bp needs value2", async () => {
    const { POST } = await import("@/app/api/readings/route");
    const res = await POST(req("/api/readings", { method: "POST", body: { type: "bp", value: 120 } }), ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("value2");
  });

  it("POST saves a weight reading with the right unit and calls the monitor", async () => {
    const { POST, GET } = await import("@/app/api/readings/route");
    const res = await POST(
      req("/api/readings", { method: "POST", body: { type: "weight", value: 88.9 } }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateReadingResponse;
    expect(body.reading.unit).toBe("kg");
    expect(body.reading.userId).toBe(ALEX);
    expect(body.monitor.action).toBe("none");
    expect(runMonitor).toHaveBeenCalledWith(ALEX, "reading");
    const list = (await (await GET(req("/api/readings?type=weight"), ctx)).json()) as unknown[];
    expect(list).toHaveLength(22);
  });

  it("POST danger glucose adds an urgent alert even when the monitor fails", async () => {
    runMonitor.mockRejectedValueOnce(new Error("boom"));
    const { POST } = await import("@/app/api/readings/route");
    const res = await POST(
      req("/api/readings", {
        method: "POST",
        body: { type: "glucose_fasting", value: 320 },
        cookie: MARIA_COOKIE,
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateReadingResponse;
    expect(body.monitor.reason).toBe("Monitor is busy");
    expect(body.monitor.action).toBe("alert");
    expect(body.monitor.alerts[0].level).toBe("urgent");
    expect(body.monitor.alerts[0].body).toContain("320");
  });

  it("GET rejects an unknown type", async () => {
    const { GET } = await import("@/app/api/readings/route");
    expect((await GET(req("/api/readings?type=mood"), ctx)).status).toBe(400);
  });
});

describe("log", () => {
  it("POST computes totals, flags sodium against Doctor rules and lists by date", async () => {
    const { POST, GET } = await import("@/app/api/log/route");
    const profile = await import("@/app/api/profile/route");
    await profile.GET(req("/api/profile", { cookie: MARIA_COOKIE }), ctx); // builds constraints
    const res = await POST(
      req("/api/log", {
        method: "POST",
        cookie: MARIA_COOKIE,
        body: {
          items: [
            { foodId: "soy_sauce", grams: 60 },
            { foodId: "white_rice", grams: 300 },
          ],
          source: "manual",
          eatenAt: "2026-10-09T12:30:00.000Z",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      entry: { totals: { sodiumMg: number }; flags: { agent: string; text: string }[] };
      monitor: MonitorResult;
    };
    expect(body.entry.totals.sodiumMg).toBeGreaterThan(750);
    expect(body.entry.flags.some((f) => f.agent === "doctor" && /sodium/.test(f.text))).toBe(true);
    expect(body.entry.flags.some((f) => /carbs/.test(f.text))).toBe(true);
    expect(runMonitor).toHaveBeenCalledWith(MARIA, "log");

    const day = (await (
      await GET(req("/api/log?date=2026-10-09", { cookie: MARIA_COOKIE }), ctx)
    ).json()) as unknown[];
    expect(day).toHaveLength(1);
    const other = (await (
      await GET(req("/api/log?date=2026-10-10", { cookie: MARIA_COOKIE }), ctx)
    ).json()) as unknown[];
    expect(other).toHaveLength(0);
  });

  it("POST rejects unknown foodIds", async () => {
    const { POST } = await import("@/app/api/log/route");
    const res = await POST(
      req("/api/log", {
        method: "POST",
        body: { items: [{ foodId: "unicorn", grams: 10 }], source: "manual" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("unicorn");
  });
});

describe("summary and trends", () => {
  it("GET /api/summary returns targets, eaten and remaining for the day", async () => {
    const log = await import("@/app/api/log/route");
    await log.POST(
      req("/api/log", {
        method: "POST",
        body: {
          items: [{ foodId: "eggs", grams: 100 }],
          source: "manual",
          eatenAt: "2026-10-09T08:00:00.000Z",
        },
      }),
      ctx,
    );
    const { GET } = await import("@/app/api/summary/route");
    const res = await GET(req("/api/summary?date=2026-10-09"), ctx);
    expect(res.status).toBe(200);
    const s = (await res.json()) as DaySummary;
    expect(s.date).toBe("2026-10-09");
    expect(s.eaten.calories).toBeGreaterThan(100);
    expect(s.remaining.calories).toBe(Math.max(0, s.targets.calories - s.eaten.calories));
    expect(s.remaining.costUsd).toBe(0);
  });

  it("GET /api/trends?type=weight flags Alex as stalled, glucose rising for Maria", async () => {
    const { GET } = await import("@/app/api/trends/route");
    const alex = (await (await GET(req("/api/trends?type=weight"), ctx)).json()) as Trend;
    expect(alex.type).toBe("weight");
    expect(alex.points.length).toBeGreaterThanOrEqual(21);
    expect(alex.alert).toBe("stalled");
    const maria = (await (
      await GET(req("/api/trends?type=glucose_fasting", { cookie: MARIA_COOKIE }), ctx)
    ).json()) as Trend;
    expect(maria.alert).toBe("rising");
    const empty = (await (await GET(req("/api/trends?type=glucose_post_meal"), ctx)).json()) as Trend;
    expect(empty.points).toEqual([]);
    expect(empty.alert).toBe("none");
  });
});

describe("foods", () => {
  it("GET /api/foods/search is fuzzy and hides the user's allergens", async () => {
    const profile = await import("@/app/api/profile/route");
    await profile.GET(req("/api/profile"), ctx); // Alex: peanut allergy -> excludedFoodTags
    const { GET } = await import("@/app/api/foods/search/route");
    const chicken = (await (await GET(req("/api/foods/search?q=chiken&limit=5"), ctx)).json()) as Food[];
    expect(chicken.length).toBeGreaterThan(0);
    expect(chicken.length).toBeLessThanOrEqual(5);
    expect(chicken[0].name.toLowerCase()).toContain("chicken");
    const peanut = (await (await GET(req("/api/foods/search?q=peanut"), ctx)).json()) as Food[];
    expect(peanut.some((f) => f.tags.includes("peanut"))).toBe(false);
    expect((await GET(req("/api/foods/search?q=x&limit=0"), ctx)).status).toBe(400);
  });
});

describe("misc", () => {
  it("plan current 404s before a plan exists; rate stores a rating", async () => {
    const current = await import("@/app/api/plan/current/route");
    expect((await current.GET(req("/api/plan/current"), ctx)).status).toBe(404);
    const rate = await import("@/app/api/plan/rate/route");
    expect(
      (
        await rate.POST(
          req("/api/plan/rate", { method: "POST", body: { mealName: "Tacos", liked: true } }),
          ctx,
        )
      ).status,
    ).toBe(204);
    expect(
      (await rate.POST(req("/api/plan/rate", { method: "POST", body: { mealName: "", liked: true } }), ctx))
        .status,
    ).toBe(400);
  });

  it("demo reset restores the user and switches the cookie", async () => {
    const { POST } = await import("@/app/api/demo/reset/route");
    const res = await POST(
      req("/api/demo/reset", { method: "POST", body: { user: "maria" }, cookie: null }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain(MARIA);
  });

  it("health needs no session", async () => {
    const { GET } = await import("@/app/api/health/route");
    const body = (await (await GET(req("/api/health", { cookie: null }), ctx)).json()) as {
      ok: boolean;
      store: string;
      auth: string;
    };
    expect(body.ok).toBe(true);
    expect(body.store).toBe("memory");
    expect(body.auth).toBe("local");
  });

  it("simulate 404s without a plan", async () => {
    const { POST } = await import("@/app/api/simulate/route");
    const res = await POST(req("/api/simulate", { method: "POST", body: { weeks: 4 } }), ctx);
    expect(res.status).toBe(404);
  });
});
