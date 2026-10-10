// THE ONLY place screens get data. Owner: Frontend (shape agreed with Backend and Agents at bootstrap).
//
// NEXT_PUBLIC_USE_MOCKS=true  -> every function resolves from /mocks after a 600 ms fake delay.
// NEXT_PUBLIC_USE_MOCKS=false -> real fetches to /app/api routes. Same return types either way.
//
// Endpoint map (route handlers live in /app/api, see docs/backend-brief.md):
//   GET  /api/auth/session            SessionInfo
//   POST /api/auth/login              { identifier } -> SessionInfo      (local auth mode)
//   POST /api/auth/logout
//   GET  /api/profile                 ProfileBundle
//   POST /api/profile                 ProfileInput -> ProfileBundle      (Doctor builds constraints, Math builds targets)
//   GET  /api/foods/search?q=&limit=  Food[]
//   POST /api/plan/generate           GeneratePlanRequest -> GeneratePlanResponse
//   GET  /api/plan/current            MealPlan
//   GET  /api/agents/runs/[runId]     AgentRunDetail
//   GET  /api/agents/stream?runId=    Server Sent Events of AgentEvent, closes after "decision"
//   POST /api/agents/recipes          RecipeIdeasResponse                (2 ideas from the stored profile)
//   POST /api/upload                  multipart file -> UploadResponse
//   POST /api/log                     CreateLogRequest -> CreateLogResponse
//   POST /api/log/photo               { photoUrl, eatenAt? } -> PhotoLogResult
//   GET  /api/log?date=YYYY-MM-DD     FoodLogEntry[]
//   POST /api/readings                CreateReadingRequest -> CreateReadingResponse
//   GET  /api/readings?type=          Reading[]
//   GET  /api/trends?type=            Trend
//   GET  /api/summary?date=           DaySummary
//   POST /api/coach                   CoachRequest -> CoachResponse
//   POST /api/monitor/run             MonitorResult
//   POST /api/plan/rate               { mealName, liked }
//   GET  /api/meal-plans?weekStart=   WeekPlanResponse                   (weekly recipe planner)
//   POST /api/meal-plans/generate     GenerateWeekRequest -> GenerateWeekResponse
//   POST /api/recipes/generate        ReplaceRecipeRequest -> ReplaceRecipeResponse (swap one recipe)
//   PATCH /api/meal-plans/state       UpdateWeekStateRequest -> PlannerWeekState (grocery ticks)
//
// External, public, no keys (browser -> OpenStreetMap), only after the user taps "Find a store near me":
//   POST https://overpass-api.de/api/interpreter          supermarkets around a point
//   GET  https://nominatim.openstreetmap.org/search      city or ZIP -> coordinates
//   POST /api/demo/reset              { user: "alex" | "maria" }         (demo helper)
import type {
  AgentEvent,
  AgentRunDetail,
  BudgetCurveResponse,
  BudgetCurveSummary,
  CoachRequest,
  CoachResponse,
  CreateLogRequest,
  CreateLogResponse,
  CreateReadingRequest,
  CreateReadingResponse,
  DaySummary,
  Food,
  FoodLogEntry,
  GeneratePlanRequest,
  GeneratePlanResponse,
  GenerateWeekRequest,
  GenerateWeekResponse,
  KrogerCartItemInput,
  KrogerCartResponse,
  KrogerLocation,
  KrogerPriceResponse,
  KrogerStatus,
  MealPlan,
  MonitorResult,
  PlannerWeekState,
  PhotoLogResult,
  ProfileBundle,
  Reading,
  ReadingType,
  Recipe,
  RecipeIdeasResponse,
  ReplaceRecipeRequest,
  ReplaceRecipeResponse,
  SessionInfo,
  Trend,
  UpdateWeekStateRequest,
  UploadResponse,
  UserProfile,
  WeekPlanResponse,
  WeeklyMealPlan,
} from "@/types/contracts";

export interface BudgetCurveParams {
  min?: number;
  max?: number;
  step?: number;
  budget?: number;
  refresh?: boolean;
}

/** A shop near the user, from OpenStreetMap. UI only (not a shared contract). */
export interface NearbyStore {
  id: string;
  name: string;
  kind: "supermarket" | "greengrocer" | "convenience";
  address: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
}

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
const MOCK_DELAY_MS = 600;

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isApiRequestError(error: unknown, status?: number): error is ApiRequestError {
  if (!error || typeof error !== "object" || !("status" in error)) return false;
  const errorStatus = (error as { status?: unknown }).status;
  return typeof errorStatus === "number" && (status === undefined || errorStatus === status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      // keep statusText
    }
    throw new ApiRequestError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

// ---------------------------------------------------------------------------
// Mock mode. The demo user is chosen with localStorage "np_mock_user" ("alex" | "maria"); default alex.
// ---------------------------------------------------------------------------

type MockUser = "alex" | "maria";

export function getMockUser(): MockUser {
  if (typeof window === "undefined") return "alex";
  try {
    return window.localStorage.getItem("np_mock_user") === "maria" ? "maria" : "alex";
  } catch {
    return "alex";
  }
}

export function setMockUser(user: MockUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("np_mock_user", user);
  } catch {
    // ignore
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mock<T>(load: (user: MockUser) => Promise<T>): Promise<T> {
  await sleep(MOCK_DELAY_MS);
  return load(getMockUser());
}

const mocks = {
  profile: (u: MockUser) => import(`@/mocks/profile-${u}.json`).then((m) => m.default as UserProfile),
  constraints: (u: MockUser) =>
    import(`@/mocks/constraints-${u}.json`).then((m) => m.default as ProfileBundle["constraints"]),
  targets: (u: MockUser) =>
    import(`@/mocks/targets-${u}.json`).then((m) => m.default as ProfileBundle["targets"]),
  plan: (u: MockUser) => import(`@/mocks/plan-${u}.json`).then((m) => m.default as MealPlan),
  curve: (u: MockUser) =>
    import(`@/mocks/curve-${u}.json`).then((m) => m.default.curve as BudgetCurveSummary),
  events: (u: MockUser) => import(`@/mocks/agent-events-${u}.json`).then((m) => m.default as AgentEvent[]),
  readings: (u: MockUser) => import(`@/mocks/readings-${u}.json`).then((m) => m.default as Reading[]),
  summary: (u: MockUser) => import(`@/mocks/summary-${u}.json`).then((m) => m.default as DaySummary),
  monitor: (u: MockUser) => import(`@/mocks/monitor-${u}.json`).then((m) => m.default as MonitorResult),
  recipes: (u: MockUser) => import(`@/mocks/recipes-${u}.json`).then((m) => m.default as RecipeIdeasResponse),
  trend: (type: ReadingType) =>
    import(`@/mocks/trend-${type === "weight" ? "weight" : type === "bp" ? "bp" : "glucose"}.json`).then(
      (m) => m.default as Trend,
    ),
  photoLog: () => import("@/mocks/photo-log.json").then((m) => m.default as PhotoLogResult),
  foodLog: () => import("@/mocks/food-log.json").then((m) => m.default as FoodLogEntry[]),
  foods: () => import("@/mocks/foods-sample.json").then((m) => m.default as Food[]),
  weeklyPlan: (u: MockUser) =>
    import(`@/mocks/weekly-plan-${u}.json`).then((m) => m.default as WeeklyMealPlan),
};

// Mock weekly planner: one in-memory week per demo user so swaps and regenerations stick for the session.
const mockWeeks = new Map<MockUser, WeeklyMealPlan>();
const mockWeekStates = new Map<string, PlannerWeekState>();
const emptyWeekState = (): PlannerWeekState => ({
  completed: {},
  shopping: { checked: {}, quantityOverrides: {}, removed: [], customItems: [] },
});
let mockSwapCursor = 0;

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function mockWeek(u: MockUser, weekStart: string): Promise<WeeklyMealPlan> {
  const current = mockWeeks.get(u);
  if (current?.weekStartDate === weekStart) return current;
  const base = structuredClone(current ?? (await mocks.weeklyPlan(u)));
  const week: WeeklyMealPlan = {
    ...base,
    weekStartDate: weekStart,
    days: base.days.map((d, i) => ({ ...d, date: shiftIsoDate(weekStart, i) })),
  };
  mockWeeks.set(u, week);
  return week;
}

const MOCK_MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;

/** Same recipes, each day gets the dishes of the next day, so every date changes. */
async function mockRegenerateWeek(u: MockUser, weekStart: string): Promise<WeeklyMealPlan> {
  const week = await mockWeek(u, weekStart);
  const next: WeeklyMealPlan = {
    ...week,
    id: `${u}-week-${weekStart}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    days: week.days.map((d, i) => {
      const from = week.days[(i + 1) % week.days.length];
      return { date: d.date, breakfast: from.breakfast, lunch: from.lunch, dinner: from.dinner };
    }),
  };
  mockWeeks.set(u, next);
  return next;
}

/** Picks another recipe of the same meal type from the week, round robin, and swaps it into that day only. */
async function mockReplaceRecipe(u: MockUser, req: ReplaceRecipeRequest): Promise<ReplaceRecipeResponse> {
  const week = await mockWeek(u, req.weekStartDate);
  const day = week.days.find((d) => d.date === req.date);
  if (!day) throw new ApiRequestError(404, "That day is not in this week's plan");
  const current = day[req.mealType];
  const pool = new Map<string, Recipe>();
  const base = await mocks.weeklyPlan(u);
  for (const d of [...week.days, ...base.days]) {
    for (const t of MOCK_MEAL_TYPES)
      if (t === req.mealType && d[t].title !== current.title) pool.set(d[t].title, d[t]);
  }
  const options = [...pool.values()];
  if (options.length === 0) throw new ApiRequestError(422, "No other recipe of this type to swap in");
  const picked = options[mockSwapCursor++ % options.length];
  const recipe: Recipe = { ...picked, id: `${req.date}-${req.mealType}-${Date.now()}` };
  const plan: WeeklyMealPlan = {
    ...week,
    days: week.days.map((d) => (d.date === req.date ? { ...d, [req.mealType]: recipe } : d)),
  };
  mockWeeks.set(u, plan);
  return { recipe, plan };
}

// ---------------------------------------------------------------------------
// OpenStreetMap helpers (public endpoints; the browser sends the coordinates only after a tap).
// ---------------------------------------------------------------------------

const MOCK_STORES: NearbyStore[] = [
  {
    id: "mock-store-1",
    name: "Supermercado demo",
    kind: "supermarket",
    address: "Av. Juárez 120, Centro",
    lat: 19.4352,
    lng: -99.1412,
    distanceKm: 0.8,
  },
  {
    id: "mock-store-2",
    name: "Frutería La Esquina",
    kind: "greengrocer",
    address: "Calle Madero 45, Centro",
    lat: 19.4339,
    lng: -99.1365,
    distanceKm: 1.1,
  },
];

const STORE_KINDS: NearbyStore["kind"][] = ["supermarket", "greengrocer", "convenience"];

/** Great circle distance in km (display only: "0.8 km away"). */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function overpassShops(lat: number, lng: number, radiusM: number): Promise<NearbyStore[]> {
  const query = `[out:json][timeout:15];nwr["shop"~"^(supermarket|greengrocer|convenience)$"]["name"](around:${radiusM},${lat},${lng});out center 60;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new ApiRequestError(res.status, "Could not reach OpenStreetMap to find stores.");
  const { elements } = (await res.json()) as { elements: OverpassElement[] };
  return elements.flatMap((el) => {
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const kind = tags.shop as NearbyStore["kind"];
    if (pLat === undefined || pLng === undefined || !tags.name || !STORE_KINDS.includes(kind)) return [];
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const address = [street, tags["addr:city"] ?? tags["addr:suburb"]].filter(Boolean).join(", ") || null;
    return [
      {
        id: `${el.type}/${el.id}`,
        name: tags.name,
        kind,
        address,
        lat: pLat,
        lng: pLng,
        distanceKm: distanceKm(lat, lng, pLat, pLng),
      },
    ];
  });
}

/** Supermarkets first (they carry the whole list), then by distance. Widens the search once when nothing is close. */
async function fetchNearbyStores(lat: number, lng: number): Promise<NearbyStore[]> {
  let shops = await overpassShops(lat, lng, 3000);
  if (!shops.some((s) => s.kind === "supermarket")) shops = await overpassShops(lat, lng, 8000);
  return shops.sort(
    (a, b) => STORE_KINDS.indexOf(a.kind) - STORE_KINDS.indexOf(b.kind) || a.distanceKm - b.distanceKm,
  );
}

async function geocodePlace(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new ApiRequestError(res.status, "Could not look up that place.");
  const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = hits[0];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    session: (): Promise<SessionInfo> =>
      USE_MOCKS
        ? mock(async (u) => ({
            userId: u,
            email: `${u}@demo.nutriplan.app`,
            mode: "local" as const,
            hasProfile: true,
          }))
        : request("/api/auth/session"),
    login: (email: string, password: string): Promise<SessionInfo> =>
      USE_MOCKS
        ? mock(async () => {
            const u: MockUser = email.toLowerCase().includes("maria") ? "maria" : "alex";
            setMockUser(u);
            return { userId: u, email: `${u}@demo.nutriplan.app`, mode: "local" as const, hasProfile: true };
          })
        : post("/api/auth/login", { email, password }),
    signup: (input: {
      name: string;
      email: string;
      password: string;
    }): Promise<{ message: string; authenticated?: boolean }> =>
      USE_MOCKS
        ? mock(async () => ({ message: "Check your email to verify your account." }))
        : post("/api/auth/signup", input),
    logout: (): Promise<void> =>
      USE_MOCKS ? mock(async () => undefined) : request("/api/auth/logout", { method: "POST" }),
  },

  profile: {
    get: (): Promise<ProfileBundle> =>
      USE_MOCKS
        ? mock(async (u) => ({
            profile: await mocks.profile(u),
            constraints: await mocks.constraints(u),
            targets: await mocks.targets(u),
          }))
        : request("/api/profile"),
    save: (input: Omit<UserProfile, "userId">): Promise<ProfileBundle> =>
      USE_MOCKS
        ? mock(async (u) => ({
            profile: { ...(await mocks.profile(u)), ...input },
            constraints: await mocks.constraints(u),
            targets: await mocks.targets(u),
          }))
        : post("/api/profile", input),
  },

  foods: {
    search: (q: string, limit = 20): Promise<Food[]> =>
      USE_MOCKS
        ? mock(async () =>
            (await mocks.foods())
              .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
              .slice(0, limit),
          )
        : request(`/api/foods/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  },

  plan: {
    generate: (body: GeneratePlanRequest = {}): Promise<GeneratePlanResponse> =>
      USE_MOCKS ? mock(async (u) => ({ runId: `${u}-run-0001` })) : post("/api/plan/generate", body),
    current: (): Promise<MealPlan> => (USE_MOCKS ? mock(mocks.plan) : request("/api/plan/current")),
    /** Budget tradeoff curve (feature 7). Cold compute is slow (~50 s) once per user, then served from cache. */
    curve: (params: BudgetCurveParams = {}): Promise<BudgetCurveResponse> => {
      if (USE_MOCKS) {
        return mock(async (u) => ({
          curve: await mocks.curve(u),
          ...(params.budget !== undefined ? { planAt: (await mocks.plan(u)).days } : {}),
          cached: true,
        }));
      }
      const qs = new URLSearchParams();
      if (params.min !== undefined) qs.set("min", String(params.min));
      if (params.max !== undefined) qs.set("max", String(params.max));
      if (params.step !== undefined) qs.set("step", String(params.step));
      if (params.budget !== undefined) qs.set("budget", String(params.budget));
      if (params.refresh) qs.set("refresh", "1");
      const query = qs.toString();
      return request(`/api/plan/curve${query ? `?${query}` : ""}`);
    },
    rate: (mealName: string, liked: boolean): Promise<void> =>
      USE_MOCKS ? mock(async () => undefined) : post("/api/plan/rate", { mealName, liked }),
  },

  /** Weekly recipe planner (the LLM writes recipes; /math prices them). Generation can take a while live. */
  planner: {
    week: (weekStart: string): Promise<WeekPlanResponse> =>
      USE_MOCKS
        ? mock(async (u) => ({
            plan: await mockWeek(u, weekStart),
            state: mockWeekStates.get(`${u}:${weekStart}`) ?? emptyWeekState(),
          }))
        : request(`/api/meal-plans?weekStart=${weekStart}`),
    generateWeek: (body: GenerateWeekRequest): Promise<GenerateWeekResponse> =>
      USE_MOCKS
        ? mock(async (u) => ({ plan: await mockRegenerateWeek(u, body.weekStartDate) }))
        : post("/api/meal-plans/generate", body),
    replaceRecipe: (body: ReplaceRecipeRequest): Promise<ReplaceRecipeResponse> =>
      USE_MOCKS ? mock((u) => mockReplaceRecipe(u, body)) : post("/api/recipes/generate", body),
    /** Completed meals and grocery edits (ticks) for one week. `shopping` replaces the stored shopping state. */
    updateState: (body: UpdateWeekStateRequest): Promise<PlannerWeekState> =>
      USE_MOCKS
        ? mock(async (u) => {
            const key = `${u}:${body.weekStartDate}`;
            const prev = mockWeekStates.get(key) ?? emptyWeekState();
            const next: PlannerWeekState = {
              completed: { ...prev.completed, ...body.completed },
              shopping: body.shopping ?? prev.shopping,
            };
            mockWeekStates.set(key, next);
            return next;
          })
        : request("/api/meal-plans/state", { method: "PATCH", body: JSON.stringify(body) }),
  },

  /** Nearby shops from OpenStreetMap (public APIs, no keys). Called only after the user asks. */
  places: {
    nearbyStores: (lat: number, lng: number): Promise<NearbyStore[]> =>
      USE_MOCKS ? mock(async () => MOCK_STORES.map((st) => ({ ...st }))) : fetchNearbyStores(lat, lng),
    geocode: (query: string): Promise<{ lat: number; lng: number; label: string } | null> =>
      USE_MOCKS ? mock(async () => ({ lat: 19.4326, lng: -99.1332, label: query })) : geocodePlace(query),
  },

  agents: {
    run: (runId: string): Promise<AgentRunDetail> =>
      USE_MOCKS
        ? mock(async (u) => {
            const events = await mocks.events(u);
            return {
              run: {
                runId,
                userId: u,
                trigger: "onboarding",
                reason: "Onboarding plan",
                status: "done",
                createdAt: events[0].at,
              },
              events,
            };
          })
        : request(`/api/agents/runs/${encodeURIComponent(runId)}`),
    /** Two recipe ideas (name, price, ingredients) written by OpenAI from the stored profile, priced by /math. */
    recipes: (): Promise<RecipeIdeasResponse> =>
      USE_MOCKS ? mock(mocks.recipes) : request("/api/agents/recipes", { method: "POST" }),
    /** Live event stream. In mock mode the saved negotiation is replayed with realistic pacing. */
    subscribe(
      runId: string,
      onEvent: (e: AgentEvent) => void,
      onDone: () => void,
      onError?: (err: Error) => void,
    ): () => void {
      if (USE_MOCKS) {
        let cancelled = false;
        (async () => {
          const events = await mocks.events(getMockUser());
          for (const e of events) {
            if (cancelled) return;
            await sleep(e.kind === "tool_call" ? 700 : 1300);
            if (cancelled) return;
            onEvent({ ...e, runId });
          }
          if (!cancelled) onDone();
        })().catch((err) => onError?.(err as Error));
        return () => {
          cancelled = true;
        };
      }
      const source = new EventSource(`/api/agents/stream?runId=${encodeURIComponent(runId)}`);
      source.addEventListener("agent_event", (msg) =>
        onEvent(JSON.parse((msg as MessageEvent).data) as AgentEvent),
      );
      source.addEventListener("done", () => {
        source.close();
        onDone();
      });
      source.onerror = () => {
        source.close();
        onError?.(new Error("Agent stream disconnected"));
      };
      return () => source.close();
    },
  },

  log: {
    list: (date?: string): Promise<FoodLogEntry[]> =>
      USE_MOCKS ? mock(mocks.foodLog) : request(`/api/log${date ? `?date=${date}` : ""}`),
    create: (body: CreateLogRequest): Promise<CreateLogResponse> =>
      USE_MOCKS
        ? mock(async (u) => ({ entry: (await mocks.foodLog())[0], monitor: await mocks.monitor(u) }))
        : post("/api/log", body),
    upload: async (file: File): Promise<UploadResponse> => {
      if (USE_MOCKS) return mock(async () => ({ url: "/demo/lunch-bowl.jpg" }));
      const form = new FormData();
      form.append("file", file);
      return request("/api/upload", { method: "POST", body: form });
    },
    photo: (photoUrl: string, eatenAt?: string): Promise<PhotoLogResult> =>
      USE_MOCKS
        ? mock(async () => {
            const result = await mocks.photoLog();
            return { ...result, entry: { ...result.entry, photoUrl } };
          })
        : post("/api/log/photo", { photoUrl, eatenAt }),
  },

  readings: {
    list: (type?: ReadingType): Promise<Reading[]> =>
      USE_MOCKS
        ? mock(async (u) => (await mocks.readings(u)).filter((r) => !type || r.type === type))
        : request(`/api/readings${type ? `?type=${type}` : ""}`),
    create: (body: CreateReadingRequest): Promise<CreateReadingResponse> =>
      USE_MOCKS
        ? mock(async (u) => ({
            reading: {
              readingId: "mock",
              userId: u,
              type: body.type,
              value: body.value,
              ...(body.value2 ? { value2: body.value2 } : {}),
              unit: body.type === "weight" ? "kg" : body.type === "bp" ? "mmHg" : "mg/dL",
              takenAt: body.takenAt ?? new Date().toISOString(),
            },
            monitor: await mocks.monitor(u),
          }))
        : post("/api/readings", body),
  },

  trends: {
    get: (type: ReadingType): Promise<Trend> =>
      USE_MOCKS ? mock(async () => mocks.trend(type)) : request(`/api/trends?type=${type}`),
  },

  summary: {
    get: (date?: string): Promise<DaySummary> =>
      USE_MOCKS ? mock(mocks.summary) : request(`/api/summary${date ? `?date=${date}` : ""}`),
  },

  coach: {
    send: (body: CoachRequest): Promise<CoachResponse> =>
      USE_MOCKS
        ? mock(async () => ({
            reply:
              "Great question. Your plan already covers that: dinner tonight is high in fiber and under your sodium cap. Want me to ask Chef for a swap?",
            replanRunId: null,
          }))
        : post("/api/coach", body),
  },

  monitor: {
    run: (): Promise<MonitorResult> =>
      USE_MOCKS ? mock(mocks.monitor) : request("/api/monitor/run", { method: "POST" }),
  },

  demo: {
    reset: (user: MockUser): Promise<void> =>
      USE_MOCKS ? mock(async () => undefined) : post("/api/demo/reset", { user }),
  },

  /** Kroger: real shelf prices and "send to cart". Routes answer 503 { code: "kroger_not_configured" } without keys. */
  kroger: {
    status: (): Promise<KrogerStatus> =>
      USE_MOCKS
        ? mock(async () => ({ configured: false, connected: false, location: null }))
        : request("/api/kroger/status"),
    locations: (zip: string): Promise<{ locations: KrogerLocation[] }> =>
      USE_MOCKS
        ? mock(async () => ({ locations: [] }))
        : request(`/api/kroger/locations?zip=${encodeURIComponent(zip)}`),
    setLocation: (location: { locationId: string; name: string; zip: string }): Promise<void> =>
      USE_MOCKS ? mock(async () => undefined) : post("/api/kroger/location", location),
    /** Browser navigation target that starts the Kroger OAuth flow (ends back on /grocery?kroger=connected). */
    connectUrl: "/api/kroger/connect",
    disconnect: (): Promise<void> =>
      USE_MOCKS ? mock(async () => undefined) : request("/api/kroger/connect", { method: "DELETE" }),
    price: (): Promise<KrogerPriceResponse> =>
      USE_MOCKS
        ? mock(async () => ({ items: [], totalUsd: 0, matched: 0, unmatched: [] }))
        : post("/api/kroger/price", {}),
    cart: (items?: KrogerCartItemInput[]): Promise<KrogerCartResponse> =>
      USE_MOCKS
        ? mock(async () => ({ added: 0, skipped: [] }))
        : post("/api/kroger/cart", items ? { items } : {}),
  },
};

export type Api = typeof api;
