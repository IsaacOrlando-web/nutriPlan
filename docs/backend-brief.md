# Backend brief (Role 3: Backend / Data)

Read spec sections 6, 7 and 12 and `lib/db/store.ts` before starting.

## What you own

`/supabase` (migrations, seed, config), `/lib/supabase`, `/lib/db`, `/lib/auth`, `/lib/api/http.ts`, `/scripts/data`, `/scripts/seed-demo.ts`, and every `/app/api` route not owned by Agents: `auth/*`, `profile`, `foods/search`, `plan/current`, `plan/rate`, `upload`, `log` (GET and POST, not `log/photo`), `readings`, `trends`, `summary`, `demo/reset`.

## What exists already

| Piece                                                          | Status                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/db/store.ts`                                              | Real. The `Store` interface: profile bundle, foods and templates, plans, logs, readings, ratings, agent runs and events (`waitForEvents` for SSE), demo helpers.             |
| `lib/db/memory-store.ts`                                       | Real. JSON under `.data/store.json` (`MEMORY_STORE_FILE`, `none` for RAM only), seeded from `lib/db/seed/demo-users.ts` and `scripts/data/*.json`.                           |
| `lib/db/supabase-store.ts`                                     | Real, matches the planned migrations. Needs `supabase/migrations` to exist and be tested against local Supabase.                                                             |
| `lib/db/seed/demo-users.ts`                                    | Real. Alex and Maria profiles, 21 days of deterministic readings (Alex weight stall, Maria glucose drift), demo ids and emails. Single source of truth for seeds.            |
| `lib/auth/session.ts`                                          | Real. `AUTH_MODE=local` cookie `np_uid` (`userId                                                                                                                             | email`), `resolveLocalUserId("alex" | "maria" | email)`, `requireSession`; `supabase`mode via`@supabase/ssr`. |
| `lib/api/http.ts`                                              | Real. `handler`, `json`, `error`, `parseBody`, `parseQuery`, `HttpError`. Every route uses them.                                                                             |
| `lib/supabase/client.ts`, `server.ts`                          | Real stubs for browser and server clients.                                                                                                                                   |
| `scripts/data/foods.json`, `meal-templates.json`, `prices.csv` | Real seed data (USDA based foods with GI and prices, ~30 meal templates). Import scripts `data:usda`, `data:gi`, `data:prices`, `data:templates` are yours to write or keep. |
| Route handlers, migrations, `seed-demo.ts`                     | Not started. Yours.                                                                                                                                                          |

## Day 1 tasks (in order)

1. Routes on the memory backend, in the order the Frontend needs them: `auth/session`, `auth/login`, `auth/logout`, `profile` (GET; POST calls `buildConstraints` from `agents/rules/engine.ts` and `calculateTargets` from `/math`), `plan/current`, `summary`, `trends` (`getTrends` over `store.listReadings`), `readings` (POST then call the Monitor entry from `/agents` when it exists, else return `{ action: "none" }`), `log` (GET, POST with `computeTotals`), `foods/search`, `plan/rate`, `upload` (local `/public/uploads` in memory mode, Supabase Storage otherwise), `demo/reset`.
2. Zod request schemas for each route (reuse `agents/schemas/index.ts` where a contract type matches).
3. `scripts/seed-demo.ts` (`npm run seed:demo`) resetting Alex and Maria in whichever backend is configured.
4. `supabase/migrations/0001_init.sql` matching `supabase-store.ts` (tables: profiles, constraints, targets, tdee_posteriors, foods, meal_templates, plans, food_logs, readings, meal_ratings, agent_runs, agent_events, agent_logs), RLS on user tables, `supabase/seed.sql`, `supabase/config.toml`.
5. Run the same route tests against `DATA_BACKEND=supabase` with `npm run db:start`.

## Definition of done

- Every endpoint in the map at the top of `lib/api.ts` responds with the contract type, `{ error }` on failure, 401 without a session.
- `npm run dev` on a clean clone with no `.env.local` works: login as alex, profile, plan, trends, summary all return seeded data.
- `DATA_BACKEND=supabase` passes the same manual checks against local Supabase; Vercel deployment uses the Supabase project.
- `lib/**/*.test.ts` covers the memory store and `resolveLocalUserId`; `npm test -- lib` is green.
- `/api/demo/reset` restores both demo users in under 2 s (used on stage).

## How to run and test

```
npm run dev
curl -s -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"maria\"}" -c c.txt
curl -s -b c.txt localhost:3000/api/profile
curl -s -b c.txt "localhost:3000/api/trends?type=glucose_fasting"
npm test -- lib
npm run db:start && npm run db:reset      # local Supabase (Docker Desktop must be running)
```

Delete `.data/store.json` to reseed the memory store.

## Never touch

`/types/contracts.ts`, `/app/(app)`, `/components`, `/lib/api.ts` (Frontend owns the client; agree on the endpoint map in chat), `/agents/**` except calling exported functions, `/math/**`.

## Requesting a contract change

Group chat: "Contract request: <type>.<field> because <route needs it>". Store internal types (`AgentLogRecord`, `MealRating`, `FoodSearchOptions`) live in `lib/db/store.ts` and are yours.
