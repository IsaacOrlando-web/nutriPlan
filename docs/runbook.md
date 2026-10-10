# Runbook

How to run the demo, switch modes, reset data and recover on stage. Pair with `docs/demo-script.md`.

## Run the demo

| Where                  | Command / action                                          | Mode                                                  |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Live URL (preferred)   | open `https://<vercel-url>/welcome`                       | Supabase + live agents, `AGENTS_FALLBACK=true`        |
| Laptop with keys       | `npm run dev` with keys in `.env.local`                   | memory backend + live agents                          |
| Laptop offline         | `npm run dev` with no keys, or `AGENTS_MODE=scripted`     | memory backend + scripted agents, identical on screen |
| Container              | `docker compose up --build` then `http://localhost:3000`  | memory backend persisted in `./.data`                 |
| Phone on the same wifi | `http://<laptop-ip>:3000` (Next dev binds all interfaces) | any                                                   |

Startup time on a cold `npm run dev` is 10 to 20 s; open `/welcome` once before the demo so routes are compiled.

## Reset demo users

- UI: Profile -> "Reset demo data".
- API: `curl -X POST http://localhost:3000/api/demo/reset -H "Content-Type: application/json" -d "{\"user\":\"alex\"}"` (and `maria`). PowerShell: `Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/demo/reset -ContentType application/json -Body '{"user":"alex"}'`.
- Nuclear, memory backend: stop the server, delete `.data/store.json`, start again (reseeds from `lib/db/seed/demo-users.ts`).
- Supabase: `npm run seed:demo` with the project keys in `.env.local`.

## Switch modes

Edit `.env.local` and restart `npm run dev` (Next only reads env at start).

| Want                      | Set                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend only, no backend | `NEXT_PUBLIC_USE_MOCKS=true`                                                                          |
| Offline full stack        | `AGENTS_MODE=scripted` (or just no keys)                                                              |
| Live agents               | keys set, `AGENTS_MODE=` blank or `live`                                                              |
| Faster Agent Room         | `AGENT_EVENT_DELAY_MS=300` (demo default 900)                                                         |
| Postgres                  | `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; local: `npm run db:start` first |
| Supabase auth             | `AUTH_MODE=supabase` plus `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                 |

On Vercel, change the env var and redeploy (Deployments -> Redeploy), about one minute.

## Check health before stage

```
npm run doctor                 # versions, which keys exist, which mode will run
curl -s http://localhost:3000/api/auth/session
E2E_BASE_URL=https://<url> npm run test:e2e -- --project=laptop
```

## If X fails on stage

| Symptom                                  | Do this                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Room shows nothing for 15 s        | Reload the page (stream resumes from stored events). Still nothing: click "Replay saved negotiation". Still nothing: `/plan` already has the previous plan; narrate from it and continue. |
| Agent events look wrong or stop mid run  | Finish the sentence, open `/plan`; the Orchestrator saves the plan before the `decision` event. Mention "the saved negotiation is here" and move on.                                      |
| Model provider error (429, 500)          | Nothing to do if `AGENTS_FALLBACK=true`: the replay kicks in. If the UI shows an error, switch to the laptop server (scripted).                                                           |
| Live URL down                            | Laptop `npm run dev` (no keys). Same script. Have the tab already open.                                                                                                                   |
| Photo analysis fails                     | Click analyze again (scripted fallback returns the lunch bowl reading). Or skip to manual log: the narrative still works with the saved `food-log` entry on the dashboard.                |
| Reading submit returns no Monitor result | Open `/trends` directly; the seeded data already shows the stall / rising alert. Say "the Monitor flagged this earlier".                                                                  |
| Trends chart empty                       | Switch tab and back (refetch). If still empty, `POST /api/demo/reset` and reload.                                                                                                         |
| Port 3000 busy                           | `npx kill-port 3000` is not installed; on Windows `netstat -ano                                                                                                                           | findstr :3000`then`taskkill /PID <pid> /F`; on Mac `lsof -ti:3000 | xargs kill`. Or `npm run dev -- -p 3001` and use that URL. |
| HiGHS wasm fails to load                 | The optimizer falls back to `javascript-lp-solver` (slower, same answer for the demo pool). If a plan takes over 20 s, pre generate it before the demo and use the saved one.             |
| Laptop dies                              | Play the backup video. Path: `docs/backup/demo.mp4` (record at checkpoint 5; keep a copy on a phone).                                                                                     |
| Someone asks "is this medical advice?"   | "No. It applies published guidelines with sources and shows the disclaimer on every health screen; it tells users to contact a professional on danger readings."                          |

## Logs

- Dev server console shows `[api] METHOD /path: message` for 500s (no bodies, no health data).
- Agent calls are logged with `store.addAgentLog` (model, ms, input and output); inspect `.data/store.json` -> `agentLogs` locally.
- Playwright: `playwright-report/index.html` after `npm run test:e2e`; traces on failure in `test-results/`.

## Keys and secrets

Only in `.env.local` (git ignored) and Vercel env. Claude Code is denied reading or writing `.env*` files by `.claude/settings.json`. If a key leaks in a commit, rotate it at the provider first, then rewrite history.
