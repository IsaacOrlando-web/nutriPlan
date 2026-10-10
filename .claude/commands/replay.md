---
description: Replay a full plan negotiation for a demo user and print every AgentEvent, to inspect the negotiation without the UI.
argument-hint: <alex | maria>
---

Replay the negotiation for `$ARGUMENTS`.

1. If `agents/evals/replay.ts` exists, run `npx tsx agents/evals/replay.ts $ARGUMENTS` and show its output.
2. Otherwise run the scripted orchestrator directly with no keys. Write a one off script in the scratchpad that:
   - sets `process.env.AGENTS_MODE = "scripted"`, `process.env.MEMORY_STORE_FILE = "none"`, `process.env.AGENT_EVENT_DELAY_MS = "0"`;
   - imports the orchestrator entry from `/agents` (look for the function used by `app/api/plan/generate/route.ts`) and the demo profile from `lib/db/seed/demo-users.ts` (`ALEX_PROFILE` or `MARIA_PROFILE`);
   - runs a plan generation for that user and prints each `AgentEvent` as `[agent] kind: text (len)` in order, then the resulting plan's `weeklyCostUsd`, `bestEffort`, `shadowPrices[].humanText` and `verifyPlan` violations.
     Run it with `npx tsx <script>`.
3. If no orchestrator exists yet, print the saved replay instead: read `agents/fallbacks/$ARGUMENTS-plan-run.json` and print the events the same way.
4. Report: number of events, counts per kind (must include >= 1 objection and >= 1 concession), any text over 140 characters, any number in an event that is not in the plan or constraints, and whether Doctor's constraints at the start equal those at the end.
