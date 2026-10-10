# Math brief (Role 4: Math)

Read `/math/CLAUDE.md`, the `nutriplan-math` skill and spec section 10 before starting.

## What you own

`/math` only: `targets.ts`, `optimizer.ts`, `lp.ts`, `totals.ts`, `kalman.ts`, `metabolism.ts`, stretch files (`glucoseResponse.ts`, `simulate.ts`, `taste.ts`), `index.ts`, `__tests__/`.

## What exists already (all real, all tested)

| Piece                      | Status                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targets.ts`               | `calculateTargets`, `mifflinStJeor`, `formulaTdee`, `safeGoalRate`, activity factors, carb cap redistribution.                                                                                                              |
| `optimizer.ts` + `lp.ts`   | Portion pattern MILP on HiGHS WebAssembly with `javascript-lp-solver` fallback, week mode with day by day fallback, elastic conflict reporting, shadow prices by re-solve, `verifyPlan`, `filterPool`, `enumeratePatterns`. |
| `totals.ts`                | `computeTotals` (throws on unknown food), rounding, glycemic load, sum and subtract.                                                                                                                                        |
| `kalman.ts`                | Local linear trend filter, per type noise, alerts (rising, falling, stalled, too_fast).                                                                                                                                     |
| `metabolism.ts`            | `observeTdee`, `updateTdee` normal-normal update.                                                                                                                                                                           |
| Stretch                    | `fitGlucoseResponse`, `simulate`, `sampleTaste` exist with tests.                                                                                                                                                           |
| `scripts/try-optimizer.ts` | Timing harness for a full week (budget 5 s).                                                                                                                                                                                |

Nothing in `/math` is a stub. Day 1 is hardening, speed and the numbers the demo depends on.

## Day 1 tasks (in order)

1. Run `npm test -- math` and `npx tsx scripts/try-optimizer.ts`; record solve times for Alex (3 meals, $50) and Maria (4 meals, $70, diabetes + hypertension). Both must be under 5 s with shadow prices.
2. Demo numbers: confirm Alex's seeded weights give `stalled`, Maria's fasting glucose gives `rising`, BP stays `none`; confirm `updateTdee` on a 14 day stall at plan intake lowers TDEE by a believable amount (100 to 250 kcal). These feed the Monitor story.
3. Budget story: with Alex at $35 the optimizer must still return a plan (`withinBudget: false` or `bestEffort` after slack) and a `weekly_budget` shadow price with concrete `humanText`. Make the text name a real dish or food from the pool.
4. Shadow price text quality: every `humanText` reads like one sentence a user understands ("Raising your budget by $5 would let Chef add salmon twice").
5. Harden inputs from Agents: empty pool, candidates with unknown `foodId`, `minServings > maxServings`, missing `priceUsdPer100g` (treat as expensive, not free) all produce clear errors or safe results, with tests.
6. Help Agents wire `/agents/tools/math.ts` (review only; they own that file).

## Definition of done

- `npm test -- math` green, every exported function has a test, demo assertions in tests (stall, rising, budget shadow price).
- Week solve under 5 s for both demo users including shadow prices; document the numbers in `docs/decisions.md` if a formulation change is made.
- No `MedicalConstraints` field is ever relaxed by any code path; `verifyPlan` catches any violation in a returned plan.
- No I/O, no network, no `Date.now()` except `solveMs`.

## How to run and test

```
npm test -- math
npm test -- math/__tests__/optimizer.test.ts
npx tsx scripts/try-optimizer.ts
npm run mocks          # regenerates /mocks from your math; check the diff makes sense
```

## Never touch

Anything outside `/math`. If Agents need a new signature, agree on it in chat and export it from `math/index.ts`; if a contract type is missing a field, ask the Lead.

## Requesting a contract change

Group chat: "Contract request: <type>.<field> because <math needs it>". Math internal types (`OptimizeOptions`, `PortionPattern`, `HardConstraintName`, `TdeeObservation`) stay in `/math` and are exported from `index.ts`.
