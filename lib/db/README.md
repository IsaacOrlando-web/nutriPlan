# lib/db: the data layer

Owner: Backend. Application code (routes, agents, scripts) touches persisted data only through the
`Store` interface in `store.ts`, obtained with `getStore()` from `index.ts`.

## Backends

| `DATA_BACKEND` | Class           | Where data lives                                                                                                                          |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `memory`       | `MemoryStore`   | JSON at `MEMORY_STORE_FILE` (default `.data/store.json`); `none` keeps it in RAM only. Seeded with foods, meal templates, Alex and Maria. |
| `supabase`     | `SupabaseStore` | Postgres through `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role bypasses RLS). Schema in `/supabase/migrations`.              |

Both implementations have the same semantics: `savePlan` marks the plan current and keeps history,
`searchFoods` is trigram fuzzy (pg_trgm in Postgres, a local approximation in memory) and honours
`excludeTags`, `waitForEvents` long-polls agent events, `resetUser` restores the seeded demo state.

## Environment variables

| Variable                        | Used by                                                   | Default                                  |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| `DATA_BACKEND`                  | `getStore()`                                              | `memory`                                 |
| `MEMORY_STORE_FILE`             | `MemoryStore` persistence path (`none` = RAM)             | `.data/store.json`                       |
| `AUTH_MODE`                     | `lib/auth/session.ts` (`local` cookie or `supabase` auth) | `local`                                  |
| `SUPABASE_URL`                  | `SupabaseStore`, `/api/upload` (server side)              | falls back to `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY`     | `SupabaseStore`, `/api/upload`                            | required for `DATA_BACKEND=supabase`     |
| `NEXT_PUBLIC_SUPABASE_URL`      | `lib/supabase/{client,server}.ts` (auth, realtime)        | required for `AUTH_MODE=supabase`        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same                                                      | required for `AUTH_MODE=supabase`        |
| `USDA_API_KEY`                  | `scripts/data/import-usda.ts`                             | only for the importer                    |
| `AGENTS_MODE`                   | reported by `/api/health`                                 | `auto`                                   |

## Local Supabase

```
npm run db:start        # supabase start: Postgres 54322, API 54321, Studio 54323
npm run db:reset        # supabase db reset: applies migrations/0001_init.sql, 0002_rls.sql, then seed.sql
```

`supabase start` prints the anon and service role keys; put them in `.env.local` together with
`DATA_BACKEND=supabase`, `AUTH_MODE=supabase`, `SUPABASE_URL=http://127.0.0.1:54321` and the two
`NEXT_PUBLIC_*` values. The seed creates `alex@demo.nutriplan.app` and `maria@demo.nutriplan.app`
(password `demo1234`) with the fixed ids from `seed/demo-users.ts`, their profiles, 21 days of readings
relative to today, all foods and meal templates. Regenerate the seed after changing any of those with
`npx tsx scripts/data/print-seed-readings.ts > supabase/seed.sql`.

## Routes built on this layer

See the header of `lib/api.ts` for the endpoint map. Backend-owned routes: `/api/auth/*`, `/api/profile`,
`/api/foods/search`, `/api/plan/current`, `/api/plan/rate`, `/api/upload`, `/api/upload/[id]`, `/api/log`,
`/api/readings`, `/api/trends`, `/api/summary`, `/api/demo/reset`, `/api/simulate`, `/api/health`.
`app/api/profile/bundle.ts` holds the shared "build constraints + targets" helper; demo users get them
lazily on the first `GET /api/profile` or `/api/summary`.

## Tests

```
npx vitest run lib
```

`__tests__/memory-store.test.ts` covers the store; `__tests__/routes.test.ts` calls the route handlers with
`NextRequest` against `new MemoryStore(null)` (the Monitor agent is mocked).
