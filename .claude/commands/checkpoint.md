---
description: Run the checks for merge checkpoint n (1 to 6) and report pass or fail per check.
argument-hint: <1 | 2 | 3 | 4 | 5 | 6>
---

Run merge checkpoint `$ARGUMENTS` for NutriPlan AI (see `docs/lead-brief.md` and `docs/contributing.md`). Run every command listed for that checkpoint and all earlier ones, then print a table: check, command, pass or fail, note. Never fix code during a checkpoint; list owners instead.

Checkpoint 1, contracts locked, app runs on mocks:
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `git diff --stat origin/main -- types/contracts.ts` is empty (contracts locked)
- With `NEXT_PUBLIC_USE_MOCKS=true` (PowerShell: `$env:NEXT_PUBLIC_USE_MOCKS='true'; npm run test:e2e -- --project=laptop`; bash: `NEXT_PUBLIC_USE_MOCKS=true npm run test:e2e -- --project=laptop`) the e2e spec passes. If it fails only on screens not built yet, list them.

Checkpoint 2, Backend + Math:
- `npm test -- math` and `npm test -- lib`
- `npx tsx scripts/try-optimizer.ts` reports a week under 5 s
- With the dev server on memory backend: `curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"alex\"}" -c cookies.txt` then `curl -s -b cookies.txt http://localhost:3000/api/profile`, `/api/plan/current`, `/api/trends?type=weight`, `/api/summary` return JSON matching the contracts (no `{ "error" }`)
- `npm run mocks` runs clean and `git status` shows no unexpected diff in `/mocks`

Checkpoint 3, Agents live:
- `npm run evals` passes in scripted mode and, if keys exist, in live mode
- `POST /api/plan/generate` returns `{ runId }` and `GET /api/agents/stream?runId=` streams `agent_event` then `done` (use `curl -N`)
- `/replay alex` and `/replay maria` show >= 1 objection and >= 1 concession, 15 to 25 events, all under 140 chars
- `safety-checker` subagent reports no blocking issue

Checkpoint 4, Frontend on real data:
- `npm run test:e2e` with `NEXT_PUBLIC_USE_MOCKS=false` (default) on the memory backend, both projects
- `ui-reviewer` on Agent Room, Plan, Trends; screenshots at 390 and 1440 attached to the PR
- `/translate` reports no missing keys

Checkpoint 5, Core freeze, demo passes on the live URL:
- `E2E_BASE_URL=https://<vercel-url> npm run test:e2e -- --project=laptop` passes
- `docs/demo-script.md` walked through end to end on the live URL with a stopwatch, under 6 minutes
- `agents/fallbacks` replays load when `AGENTS_MODE=scripted` is forced on the deployment
- `contract-guard` passes on every open PR

Checkpoint 6, Feature freeze:
- `npm run build` succeeds locally with `NEXT_OUTPUT=standalone`
- Backup video recorded and linked in `docs/runbook.md`
- README quick start executed on a clean clone by one teammate (`npm run setup`, `npm run dev`, "Try as Alex")
- No open PR touches `types/contracts.ts`
