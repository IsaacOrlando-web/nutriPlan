---
name: nutriplan-agents
description: Agent roster, plan run protocol, event rules, SSE contract, vision voting, Monitor triggers and guideline numbers for NutriPlan AI. Use when working under /agents or on /app/api/plan/generate, /app/api/agents, /app/api/log/photo, /app/api/coach or /app/api/monitor, or when prompts, negotiation events, scripted mode or guidelines.json are mentioned.
---

# NutriPlan agents skill

Spec sections 8 and 9. Hand written orchestration on the Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`). No LangChain. LLMs never produce numbers shown to users; numbers come from `/math` and `/agents/rules/guidelines.json`. Structured outputs use `generateObject` with the Zod schemas in `/agents/schemas`.

## Agent table

| Agent               | Job                                                                                                                                                                          | Tools                                              | Concedes                                                          | Default model                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Doctor              | Builds `MedicalConstraints` from `guidelines.json` only (`buildConstraints` in `/agents/rules/engine.ts`). Writes the plain language `summary` and objects to any violation. | `buildConstraints`, `verifyPlan`                   | Never. Hard constraints are never relaxed by any code path.       | Claude Sonnet                                       |
| Chef                | Proposes ~30 `CandidateMeal`s from meal templates and the user's likes; every ingredient mapped to a real `foodId` via `searchFoods`; sets `tasteScore`.                     | `searchFoods`, `getMealTemplates`, `computeTotals` | Variety first (`maxRepeatsPerWeek` 2 -> 3), then favorite dishes. | GPT mini or Gemini Flash                            |
| Budget              | Prices candidates with `computeTotals`, finds cheaper swaps that keep protein within 10 percent, reads `shadowPrices`.                                                       | `computeTotals`, `optimizePlan`                    | Up to 10 percent over budget (`budgetSlackPct` 0 -> 5 -> 10).     | Claude Haiku                                        |
| Monitor             | Watches readings and logs, runs `getTrends` and `updateTdee`, decides none / alert / replan.                                                                                 | `getTrends`, `updateTdee`, `calculateTargets`      | Replans at most once per day per user.                            | Claude Haiku                                        |
| Orchestrator        | Mostly plain code: runs the protocol, calls the optimizer, emits events, saves the plan. LLM only to narrate.                                                                | everything                                         | n/a                                                               | Claude Sonnet                                       |
| Vision A / Vision B | Two different providers read a food photo independently into `FoodLogItem[]`.                                                                                                | `searchFoods`                                      | n/a                                                               | A: Claude Sonnet, B: Gemini Flash (backup GPT mini) |
| Coach               | Chat grounded in the current plan, targets and constraints; may start a replan (`replanRunId`). Never diagnoses or changes medication.                                       | plan, targets, `searchFoods`                       | n/a                                                               | Claude Sonnet                                       |

Model table lives in `agents/config.ts` (defaults: `claude-sonnet-5-5`, `claude-haiku-5-5`, `gemini-3.5-flash`, `gpt-4.1-mini` as optional backup, each with a backup provider). Env overrides `MODEL_DOCTOR`, `MODEL_CHEF`, `MODEL_BUDGET`, `MODEL_MONITOR`, `MODEL_ORCHESTRATOR`, `MODEL_COACH`, `MODEL_VISION_A`, `MODEL_VISION_B` accept `provider:model-id` or `model-id`. Per call timeout 12 s, one retry, then backup model, then scripted fallback. `AGENTS_MODE=scripted` runs the same protocol with canned agent outputs and real math, so the demo works with no keys.

## Plan run protocol (POST /api/plan/generate)

1. Orchestrator creates an `AgentRun` (trigger, reason), returns `{ runId }` immediately, continues in the background.
2. Doctor: `buildConstraints(profile)` -> `MedicalConstraints`; `calculateTargets(profile, constraints, tdeePosterior)` -> `DailyTargets`. Emits proposal with `data.constraints`.
3. Chef: candidate pool (~30, all slots covered, every ingredient a real `foodId`), `filterPool` removes allergies and restrictions.
4. Budget: prices the pool, flags expensive candidates, proposes swaps.
5. Orchestrator: `optimizePlan({ pool, foods, targets, constraints, weeklyBudgetUsd, concessions: { maxRepeatsPerWeek: 2, budgetSlackPct: 0 }, startDate, mealsPerDay })`.
6. Negotiation loop (max 3 rounds): if `!feasible` -> Doctor objects, Chef concedes variety, then Budget concedes slack, re-solve. If `feasible && !withinBudget` -> Budget objects, Chef swaps, re-solve. Doctor never changes constraints.
7. Decision: `verifyPlan` must return no violations; save `MealPlan` (version+1, `reason`, `runId`, `shadowPrices`, `bestEffort` when a concession was used), emit `decision`, close the stream.

Shadow prices become `ShadowPrice.humanText` sentences; the Orchestrator may ask an LLM to phrase them but the numbers are pasted from the optimizer.

## Event rules (AgentEvent)

- 15 to 25 events per run. `text` under 140 characters, in the user's language.
- At least one `objection` and one `concession` in every run (the demo depends on it).
- Personalities: Doctor cites sources ("DGA: ..."); Chef names dishes; Budget quotes exact dollars; Monitor talks trends; Orchestrator narrates steps.
- `tool_call` events carry `data.tool`; Doctor's proposal carries `data.constraints`; the decision carries `data.planId`.
- Events are persisted with `store.addEvent` as they happen so replay (`GET /api/agents/runs/[runId]`) always works.
- Pace with `AGENT_EVENT_DELAY_MS` (default 900 ms, tests use 40).

## SSE streaming contract (GET /api/agents/stream?runId=)

- `Content-Type: text/event-stream`, no buffering (`Cache-Control: no-cache`, `X-Accel-Buffering: no`).
- `event: agent_event` + `data: <AgentEvent JSON>` for every event, including ones that already exist when the client connects.
- `event: done` + `data: {"runId":"..."}` after the `decision` event or when the run status is `failed`; then close.
- Keep alive comment `: ping` every 15 s. Clients fall back to polling `GET /api/agents/runs/[runId]`.

## Vision voting (POST /api/log/photo)

- Vision A and Vision B each return `FoodLogItem[]` (foodId via `searchFoods`, grams, confidence).
- Match items by `foodId`. For a matched pair `similarity = min(gramsA, gramsB) / max(gramsA, gramsB)`; unmatched foods contribute 0.
- `agreement = sum(similarity) / number of distinct foodIds across both`.
- `agreement >= 0.7`: auto log with averaged grams, `logged: true`, `question: null`.
- Otherwise `logged: false` and exactly one `question` ("Was that about 150 g or 250 g of rice?") with options; the client answers through `POST /api/log`.
- Totals always from `computeTotals`. `flags` from Doctor rules (sodium share, carbs per meal). No keys: scripted mode returns the saved lunch bowl reading.

## Monitor (POST /api/monitor/run, also after readings and logs)

Triggers for `replan` (max once per day): weight trend `stalled` (14 days, under 0.3 kg change) or `too_fast` (over 1 kg per week) -> `updateTdee` then `calculateTargets` with the posterior; glucose `rising` for a diabetic user -> tighten `maxCarbsPerMealG` within the ADA rule and replan; budget change comes through `plan.generate`, not Monitor.
Danger readings (from `guidelines.json.dangerReadings`): glucose under 70 or over 300 mg/dL, blood pressure over 180/120 -> `action: "alert"` with an `urgent` alert "Contact a health professional now", no replan.
`MonitorResult.reason` is one sentence; `alerts[]` carry `source`.

## Guidelines summary (/agents/rules/guidelines.json, the only source of medical numbers)

- DGA (everyone): fiber 14 g per 1000 kcal; added sugar under 10 percent of kcal; sodium under 2300 mg; saturated fat under 10 percent; calorie floors 1200 female / 1500 male.
- ADA (type2_diabetes): carbs per meal 45 g; glycemic load per meal 20; added sugar under 5 percent.
- DASH (hypertension): sodium 1500 mg; potassium at least 3500 mg; saturated fat under 6 percent (AHA).
- high_cholesterol: saturated fat under 6 percent.
- kidney_disease or potassium affecting medications (ACE inhibitors, ARBs, potassium sparing diuretics, etc.): never set a potassium floor, say so with the NKF source.
- Every rule carries `{ rule, why, source }`; `MedicalConstraints.reasons` is built from them and shown on "Your plan rules".

## Evals and fallbacks

- `npm run evals` runs `/agents/evals/run-evals.ts`: every demo run has >= 1 objection and concession, 15 to 25 events, all under 140 chars, zero numbers that do not appear in math output, Doctor constraints unchanged start to end, Maria's plan respects carbs per meal.
- `/agents/fallbacks/<user>-plan-run.json` are full `AgentRunDetail` replays regenerated by `npm run mocks`. `AGENTS_FALLBACK=true` replays them on any live failure.
- Every new function in `/agents` gets a Vitest test under `agents/**/*.test.ts`.
