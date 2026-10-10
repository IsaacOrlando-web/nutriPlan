---
description: Implement or improve one NutriPlan agent (doctor, chef, budget, monitor, orchestrator, vision) with its tests and scripted mode.
argument-hint: <doctor | chef | budget | monitor | orchestrator | vision>
---

Work on the `$ARGUMENTS` agent for NutriPlan AI.

1. Load the `nutriplan-agents` skill, read `docs/agents-brief.md` and the agent's row in the agent table. Read `/types/contracts.ts` for the exact shapes it produces and `/agents/schemas/index.ts` for the Zod schema to use with `generateObject`.
2. Plan first: which files under `/agents` (prompt, tool wrappers in `/agents/tools`, the agent module, `agents/**/*.test.ts`) and which route under your ownership (`/app/api/plan/generate`, `/app/api/agents`, `/app/api/log/photo`, `/app/api/coach`, `/app/api/monitor`).
3. Rules that cannot be broken: numbers come from `/math` tool results and `guidelines.json` only; Doctor never relaxes a constraint; Chef ingredients are real `foodId`s from `store.searchFoods`; `AgentEvent.text` under 140 characters; 15 to 25 events per run with at least one objection and one concession; events persisted with `store.addEvent` as they happen.
4. Scripted mode: the same agent must work with `AGENTS_MODE=scripted` and no API keys, using deterministic canned outputs plus real math. Live mode uses the model from `MODEL_<AGENT>` env with the documented default. Wrap live calls so a failure falls back to the scripted output when `AGENTS_FALLBACK=true`.
5. Tests: add Vitest tests under `agents/**/*.test.ts` for every new function (scripted mode, no network). Include a test that the agent output validates against the Zod schema.
6. Run `npm run typecheck && npm test`, then `npm run evals` if the eval runner exists. Use the `prompt-reviewer` subagent on any prompt you wrote.
7. Report: files changed, how to trigger the agent from the UI or with curl, scripted vs live behavior, open questions for the Lead.
