# NutriPlan AI

Hackathon project. We are here to win. Read NUTRIPLAN_MASTER_SPEC.md before any task.

## Non negotiables

- Types only from /types/contracts.ts. Never invent fields. Only the Lead edits that file.
- Stay inside the folders of the role you are helping (spec section 4). If asked to edit elsewhere, stop and say who owns it.
- LLMs never produce numbers shown to users. Numbers come from /math or /agents/rules/guidelines.json.
- Doctor hard constraints are never relaxed by any code path.
- Every screen gets data only through /lib/api.ts.
- Every new function in /math and /agents gets a test.
- No secrets in code. Use .env.local.
- No new dependencies without asking the human.
- Keep the app runnable at all times. Stubs return realistic mock data.

## Workflow

- Plan mode first for anything bigger than a small fix.
- One feature per session. /clear between features.
- Commit before large changes.
- Run `npm run typecheck && npm test` before saying you are done.

## Commands

- npm run dev | npm run typecheck | npm run lint | npm test | npm run test:e2e | npm run evals

## Repo map

| Folder                                                                                                             | Owner                                                                         | What lives there                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/types`                                                                                                           | Lead                                                                          | `contracts.ts`: every shared type and API envelope. Read only for everyone else.                                           |
| `/app/(app)`, `/app/(auth)`, `/components`, `/lib/api.ts`, `/lib/hooks`, `/mocks`, `/public`, `tailwind.config.ts` | Frontend                                                                      | Screens, UI kit, the single data gateway, mock JSON. Rules in `/app/CLAUDE.md`.                                            |
| `/agents`, `/app/api/plan/generate`, `/app/api/agents`, `/app/api/log/photo`, `/app/api/coach`, `/app/api/monitor` | AI Agents                                                                     | Doctor, Chef, Budget, Monitor, Orchestrator, Vision A+B, prompts, `rules/guidelines.json`, `fallbacks/` replays, `evals/`. |
| `/supabase`, `/lib/supabase`, `/lib/db`, `/lib/auth`, `/lib/plan`, `/lib/api/http.ts`, `/scripts/data`, all other `/app/api/*` | Backend                                                                       | Store interface (memory + Supabase), session auth, route helpers, data imports, seed users.                                |
| `/math`                                                                                                            | Math                                                                          | Pure TypeScript: targets, MILP optimizer, Kalman trends, Bayesian TDEE. Rules in `/math/CLAUDE.md`.                        |
| `/docs`, `/.claude`, `/.github`, root config, `CLAUDE.md` files, `/tests/e2e`, Docker                              | Lead                                                                          | Briefs, demo script, runbook, skills, subagents, CI, e2e.                                                                  |
| `/scripts`                                                                                                         | Lead (`generate-mocks.ts`, `setup.mjs`) and Backend (`data/`, `seed-demo.ts`) | Tooling. `npm run mocks` regenerates `/mocks` and `/agents/fallbacks` from real math.                                      |

## Runtime modes

All are read from `.env.local` (copy `.env.example`). Defaults need zero setup and zero keys.

| Variable                                                                                                 | Values                                      | Effect                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_USE_MOCKS`                                                                                  | `true` / `false` (default)                  | `true`: `/lib/api.ts` serves `/mocks/*.json` with a 600 ms delay and never calls `/app/api`.                 |
| `DATA_BACKEND`                                                                                           | `memory` (default) / `supabase`             | Store implementation. Memory keeps JSON under `.data/` and is seeded with Alex and Maria.                    |
| `MEMORY_STORE_FILE`                                                                                      | path, default `.data/store.json`, or `none` | Where the memory store persists. `none` keeps everything in RAM.                                             |
| `AUTH_MODE`                                                                                              | `local` (default) / `supabase`              | `local`: cookie `np_uid` set by `POST /api/auth/login` with `alex`, `maria` or any email.                    |
| `AGENTS_MODE`                                                                                            | blank (auto) / `scripted` / `live`          | Auto picks `live` when any model API key exists, else `scripted` (deterministic negotiation, works offline). |
| `AGENT_EVENT_DELAY_MS`                                                                                   | number, default `900`                       | Pacing between Agent Room events. Playwright sets `40`.                                                      |
| `AGENTS_FALLBACK`                                                                                        | `true` (default) / `false`                  | On a live failure, replay `/agents/fallbacks/<user>-plan-run.json` instead of erroring.                      |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`                                    | secrets                                     | Enable live agents and vision voting. Never commit.                                                          |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | secrets                                     | Only for `DATA_BACKEND=supabase` / `AUTH_MODE=supabase`.                                                     |
| `E2E_BASE_URL`                                                                                           | URL                                         | Point Playwright at a deployed URL instead of starting `npm run dev`.                                        |
| `NEXT_OUTPUT`                                                                                            | blank / `standalone`                        | `standalone` for the Docker image.                                                                           |

Full details: `docs/runbook.md`, `docs/architecture.md`, `.env.example`.
