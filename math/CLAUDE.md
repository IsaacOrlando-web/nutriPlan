# /math rules (owner: Role 4, Math)

Read `NUTRIPLAN_MASTER_SPEC.md` section 10 and the `nutriplan-math` skill first.

- Pure TypeScript. No side effects, no I/O, no network, no database, no `Date.now()` in results except `solveMs`.
- Types only from `/types/contracts.ts`. Math-internal helper types stay inside `/math` and are exported from `index.ts`.
- Every public function is exported from `math/index.ts` and has tests in `math/__tests__`.
- Units: kg, cm, kcal, g, mg, USD. Totals are rounded with `roundTotals` (kcal and mg to 1, g to 0.1, USD to 0.01).
- `computeTotals` throws on unknown foodIds. Never default missing data to zero silently.
- Optimizer: Doctor rules are hard constraints. Elastic slacks exist only to _report_ conflicts; a plan with any conflict is `feasible: false` and must be rejected by the Orchestrator. Never add a code path that relaxes a MedicalConstraints field.
- Allergies and restrictions are filtered in `filterPool` before optimization.
- Performance budget: a full week under 5 s for a ~30 meal pool (`npx tsx scripts/try-optimizer.ts`).
- Kalman alerts must fire on seeded Alex (weight stall) and Maria (glucose drift) data and stay quiet on normal noise. Tests guard this.
- Run `npm test -- math` before saying you are done.

## Budget curve (feature 7, `math/curve.ts`)

- `computeBudgetCurve(input, budgets, opts?)` solves the plan once per budget on one shared `PreparedContext` (`prepareContext` + `withBudget`, patterns enumerated once) with `CURVE_SOLVE_OPTIONS` (`mode: "daily"`, `timeLimitSec: 3`, no shadow prices); under 1 s per point on a Chef sized pool, about 2.6 s on the full 64 meal pool (1.5 s was measured noisier and no faster). `opts.focusBudgetUsd` is the budget the insights talk about.
- `optimizePlanDetailed` / `optimizePrepared` return `OptimizeResult & { objective }`; `optimizePlan` strips the objective. `OptimizeResult` itself never changes (contract type).
- `repairDominated` is a Pareto repair: a cheaper plan that beats a pricier point's objective is reused at the higher budget, so objective and `withinBudget` are monotone in budget.
- Insights are sentences assembled by code from the points (`summarizeCurve`); every number in them is a point field. No LLM anywhere in this file.
- `planFromCurve(point, { startDate? })` turns a point into an `OptimizeResult` without re-solving (re-dates days and mealIds). Agents use it to save a slider choice as a MealPlan.
- `BudgetCurve*` types live here until the Lead promotes them to `/types/contracts.ts`.

## Allowed exception: the curve cache (`math/curve-cache.ts`)

`/math` has no state, except this in-process LRU (max 20 curves, `getCachedCurve` / `setCachedCurve` / `getOrComputeCurve`). It does no I/O, no `Date.now()`, and holds only solver output. Keys come from `curveCacheKey` (stable hash of user, candidate ids, constraints, targets, meals per day, concessions). The route `/app/api/plan/curve` is the only consumer.
