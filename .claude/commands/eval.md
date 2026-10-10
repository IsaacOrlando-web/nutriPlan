---
description: Run the agent evals (npm run evals) plus typecheck and unit tests, and summarize failures by owner.
---

Run the NutriPlan AI evals and summarize.

1. `npm run typecheck`
2. `npm test`
3. `npm run evals` (runs `agents/evals/run-evals.ts`). If the file does not exist yet, say so and stop after step 2.
4. If a model key is present in `.env.local`, run the evals again in offline mode so the demo fallback is proven: PowerShell `$env:AGENTS_MODE='scripted'; npm run evals`; bash `AGENTS_MODE=scripted npm run evals`.

Summarize in a table: check, pass or fail, duration, first failing assertion, likely file, owner (Frontend, Agents, Backend, Math, Lead). The eval criteria are: 15 to 25 events per run, at least one objection and one concession, every text under 140 characters, no number in event text missing from math output, Doctor constraints unchanged across the run, Maria's plan respects carbs and glycemic load per meal, Alex's plan within budget or `bestEffort`. Finish with one sentence: is the demo flow safe to merge.
