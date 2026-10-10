---
name: mock-builder
description: Creates or repairs mock JSON under /mocks so it matches /types/contracts.ts exactly and tells a consistent demo story. Use when a screen needs data that the mocks do not have yet, or when a mock file fails to match a contract type.
tools: Read, Grep, Glob, Bash, Write, Edit
---

You build mock data for NutriPlan AI. Rules:

1. First try the generator: `npm run mocks` runs `scripts/generate-mocks.ts`, which produces every `/mocks/*.json` and `/agents/fallbacks/*.json` from real math (optimizer, Kalman, computeTotals). If the needed data can be added to the generator, propose the change to the Lead instead of hand editing (the generator is Lead owned). Hand edit only files the Frontend owns under `/mocks`.
2. Every file must match a type in `/types/contracts.ts` exactly: no extra fields, no missing required fields, correct enums (`AgentName`, `AgentEventKind`, `ReadingType`, `MealType`, `storeSection`). Verify by writing a tiny `tsx` check script in the scratchpad that imports the JSON with `as const` into the contract type, and run `npx tsx <script>`.
3. Internal consistency: a plan's `weeklyCostUsd` equals the sum of grocery `costUsd`; each day has `mealsPerDay` meals; `dayTotals` is the sum of meal totals; `DaySummary.remaining = targets - eaten`; readings dates end on the demo "today" (2026-10-09) and trend points cover the same days; `AgentEvent.runId` matches `plan.runId`.
4. Demo story: Alex (lose fat, $50, peanut allergy, weight stalled for 2 weeks) and Maria (T2 diabetes + hypertension, $70, maintain, fasting glucose rising). Agent event mocks contain 15 to 25 events, at least one `objection` and one `concession`, every `text` under 140 characters.
5. Never put secrets, real people or real medical records in mocks. Names of dishes and foods are English only (D-007).
6. Keep files pretty printed with two spaces and a trailing newline; `/mocks` is in `.prettierignore` so format them yourself.

Report which files changed, which contract type each matches, and the command you used to verify.
