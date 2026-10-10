# lib/db: the data layer

Owner: Backend. Application code (routes, agents, scripts) touches persisted data only through the
`Store` interface in `store.ts`, obtained with `getStore()` from `index.ts`.

## Storage

`MemoryStore` is the only implementation. It persists JSON at `MEMORY_STORE_FILE` (default
`.data/store.json`); `none` keeps it in RAM only. It is seeded with foods, meal templates, Alex and Maria.

The store semantics are: `savePlan` marks the plan current and keeps history,
`searchFoods` is trigram fuzzy (pg_trgm in Postgres, a local approximation in memory) and honours
`excludeTags`, `waitForEvents` long-polls agent events, `resetUser` restores the seeded demo state.

## Environment variables

| Variable                        | Used by                                                   | Default                                  |
| ------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| `MEMORY_STORE_FILE`             | `MemoryStore` persistence path (`none` = RAM)             | `.data/store.json`                       |
| `AUTH_MODE`                     | `lib/auth/session.ts`                                     | `local`                                  |
| `USDA_API_KEY`                  | `scripts/data/import-usda.ts`                             | only for the importer                    |
| `AGENTS_MODE`                   | reported by `/api/health`                                 | `auto`                                   |

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
