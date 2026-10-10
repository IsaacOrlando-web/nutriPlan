// Seeds Alex and Maria through the running API (any backend). Owner: Backend.
//   npm run seed:demo                      against http://localhost:3000
//   E2E_BASE_URL=http://host:port npm run seed:demo
// Local auth mode only (the np_uid cookie). For Supabase, `supabase db reset` seeds the same data directly.
import fs from "node:fs";
import path from "node:path";
import { DEMO_USER_IDS, demoReadings, type DemoUserKey } from "@/lib/db/seed/demo-users";
import type { ProfileBundle, SessionInfo, UserProfile } from "@/types/contracts";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ROOT = path.resolve(__dirname, "..");

async function call<T>(
  pathname: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; body: T; cookie: string | null }> {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : null;
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as unknown as T;
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status}: ${text.slice(0, 200)}`);
  return { status: res.status, body, cookie };
}

async function seedUser(key: DemoUserKey) {
  const profile = JSON.parse(
    fs.readFileSync(path.join(ROOT, `mocks/profile-${key}.json`), "utf8"),
  ) as UserProfile;
  const login = await call<SessionInfo>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: key }),
  });
  const cookie = login.cookie ?? `np_uid=${DEMO_USER_IDS[key]}|${key}@demo.nutriplan.app`;
  if (login.body.userId !== DEMO_USER_IDS[key])
    throw new Error(`login as ${key} returned user ${login.body.userId}`);

  // Start from the seeded state so re-running the script does not duplicate readings.
  await call("/api/demo/reset", { method: "POST", body: JSON.stringify({ user: key }), cookie });

  const { userId: _ignored, ...input } = profile;
  const bundle = await call<ProfileBundle>("/api/profile", {
    method: "POST",
    body: JSON.stringify(input),
    cookie,
  });
  console.log(
    `${key}: profile saved, ${bundle.body.targets.calories} kcal target, ${bundle.body.constraints.reasons.length} rules`,
  );

  // resetUser already restores the 21 seeded readings; POST only the ones that are missing (none after a reset),
  // which keeps this script honest when pointed at a store that was not seeded (for example a fresh Supabase).
  const existing = await call<{ readingId: string }[]>("/api/readings", { cookie });
  const have = existing.body.length;
  const readings = demoReadings(key);
  let posted = 0;
  if (have < readings.length) {
    for (const r of readings) {
      await call("/api/readings", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          type: r.type,
          value: r.value,
          ...(r.value2 !== undefined ? { value2: r.value2 } : {}),
          takenAt: r.takenAt,
        }),
      });
      posted++;
    }
  }
  console.log(`${key}: ${have} readings already present, ${posted} posted`);
}

async function main() {
  const health = await call<{ ok: boolean; store: string; auth: string }>("/api/health");
  console.log(`API ${BASE}: store=${health.body.store} auth=${health.body.auth}`);
  if (health.body.auth !== "local") {
    console.error("seed-demo.ts needs AUTH_MODE=local; with Supabase run `supabase db reset` instead.");
    process.exit(1);
  }
  await seedUser("alex");
  await seedUser("maria");
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
