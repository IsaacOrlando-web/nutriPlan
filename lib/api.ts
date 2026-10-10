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
//   POST /api/demo/reset              { user: "alex" | "maria" }         (demo helper)
import type {
  AgentEvent,
  AgentRunDetail,
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
  MealPlan,
  MonitorResult,
  PhotoLogResult,
  ProfileBundle,
  Reading,
  ReadingType,
  SessionInfo,
  Trend,
  UploadResponse,
  UserProfile,
} from "@/types/contracts";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers },
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
  constraints: (u: MockUser) => import(`@/mocks/constraints-${u}.json`).then((m) => m.default as ProfileBundle["constraints"]),
  targets: (u: MockUser) => import(`@/mocks/targets-${u}.json`).then((m) => m.default as ProfileBundle["targets"]),
  plan: (u: MockUser) => import(`@/mocks/plan-${u}.json`).then((m) => m.default as MealPlan),
  events: (u: MockUser) => import(`@/mocks/agent-events-${u}.json`).then((m) => m.default as AgentEvent[]),
  readings: (u: MockUser) => import(`@/mocks/readings-${u}.json`).then((m) => m.default as Reading[]),
  summary: (u: MockUser) => import(`@/mocks/summary-${u}.json`).then((m) => m.default as DaySummary),
  monitor: (u: MockUser) => import(`@/mocks/monitor-${u}.json`).then((m) => m.default as MonitorResult),
  trend: (type: ReadingType) =>
    import(`@/mocks/trend-${type === "weight" ? "weight" : type === "bp" ? "bp" : "glucose"}.json`).then((m) => m.default as Trend),
  foodLog: () => import("@/mocks/food-log.json").then((m) => m.default as FoodLogEntry[]),
  foods: () => import("@/mocks/foods-sample.json").then((m) => m.default as Food[]),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    session: (): Promise<SessionInfo> =>
      USE_MOCKS
        ? mock(async (u) => ({ userId: u, email: `${u}@demo.nutriplan.app`, mode: "local" as const, hasProfile: true }))
        : request("/api/auth/session"),
    login: (identifier: string): Promise<SessionInfo> =>
      USE_MOCKS
        ? mock(async () => {
            const u: MockUser = identifier.toLowerCase().includes("maria") ? "maria" : "alex";
            setMockUser(u);
            return { userId: u, email: `${u}@demo.nutriplan.app`, mode: "local" as const, hasProfile: true };
          })
        : post("/api/auth/login", { identifier }),
    logout: (): Promise<void> => (USE_MOCKS ? mock(async () => undefined) : request("/api/auth/logout", { method: "POST" })),
  },

  profile: {
    get: (): Promise<ProfileBundle> =>
      USE_MOCKS
        ? mock(async (u) => ({ profile: await mocks.profile(u), constraints: await mocks.constraints(u), targets: await mocks.targets(u) }))
        : request("/api/profile"),
    save: (input: Omit<UserProfile, "userId">): Promise<ProfileBundle> =>
      USE_MOCKS
        ? mock(async (u) => ({ profile: { ...(await mocks.profile(u)), ...input }, constraints: await mocks.constraints(u), targets: await mocks.targets(u) }))
        : post("/api/profile", input),
  },

  foods: {
    search: (q: string, limit = 20): Promise<Food[]> =>
      USE_MOCKS
        ? mock(async () => (await mocks.foods()).filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, limit))
        : request(`/api/foods/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  },

  plan: {
    generate: (body: GeneratePlanRequest = {}): Promise<GeneratePlanResponse> =>
      USE_MOCKS ? mock(async (u) => ({ runId: `${u}-run-0001` })) : post("/api/plan/generate", body),
    current: (): Promise<MealPlan> => (USE_MOCKS ? mock(mocks.plan) : request("/api/plan/current")),
    rate: (mealName: string, liked: boolean): Promise<void> =>
      USE_MOCKS ? mock(async () => undefined) : post("/api/plan/rate", { mealName, liked }),
  },

  agents: {
    run: (runId: string): Promise<AgentRunDetail> =>
      USE_MOCKS
        ? mock(async (u) => {
            const events = await mocks.events(u);
            return { run: { runId, userId: u, trigger: "onboarding", reason: "Onboarding plan", status: "done", createdAt: events[0].at }, events };
          })
        : request(`/api/agents/runs/${encodeURIComponent(runId)}`),
    /** Live event stream. In mock mode the saved negotiation is replayed with realistic pacing. */
    subscribe(runId: string, onEvent: (e: AgentEvent) => void, onDone: () => void, onError?: (err: Error) => void): () => void {
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
      source.addEventListener("agent_event", (msg) => onEvent(JSON.parse((msg as MessageEvent).data) as AgentEvent));
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
            const entry = (await mocks.foodLog())[0];
            return {
              logged: true,
              entry,
              votes: {
                a: { model: "claude-sonnet", items: entry.items },
                b: { model: "gemini-flash", items: entry.items.map((i) => ({ ...i, grams: Math.round(i.grams * 0.9) })) },
                agreement: entry.visionAgreement ?? 0.84,
              },
            };
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
            reading: { readingId: "mock", userId: u, type: body.type, value: body.value, ...(body.value2 ? { value2: body.value2 } : {}), unit: body.type === "weight" ? "kg" : body.type === "bp" ? "mmHg" : "mg/dL", takenAt: body.takenAt ?? new Date().toISOString() },
            monitor: await mocks.monitor(u),
          }))
        : post("/api/readings", body),
  },

  trends: {
    get: (type: ReadingType): Promise<Trend> => (USE_MOCKS ? mock(async () => mocks.trend(type)) : request(`/api/trends?type=${type}`)),
  },

  summary: {
    get: (date?: string): Promise<DaySummary> =>
      USE_MOCKS ? mock(mocks.summary) : request(`/api/summary${date ? `?date=${date}` : ""}`),
  },

  coach: {
    send: (body: CoachRequest): Promise<CoachResponse> =>
      USE_MOCKS
        ? mock(async () => ({
            reply: "Great question. Your plan already covers that: dinner tonight is high in fiber and under your sodium cap. Want me to ask Chef for a swap?",
            replanRunId: null,
          }))
        : post("/api/coach", body),
  },

  monitor: {
    run: (): Promise<MonitorResult> => (USE_MOCKS ? mock(mocks.monitor) : request("/api/monitor/run", { method: "POST" })),
  },

  demo: {
    reset: (user: MockUser): Promise<void> => (USE_MOCKS ? mock(async () => undefined) : post("/api/demo/reset", { user })),
  },
};

export type Api = typeof api;
