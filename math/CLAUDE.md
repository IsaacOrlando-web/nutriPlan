# /math rules (owner: Role 4, Math)

Read `NUTRIPLAN_MASTER_SPEC.md` section 10 and the `nutriplan-math` skill first.

- Pure TypeScript. No side effects, no I/O, no network, no database, no `Date.now()` in results except `solveMs`.
- Types only from `/types/contracts.ts`. Math-internal helper types stay inside `/math` and are exported from `index.ts`.
- Every public function is exported from `math/index.ts` and has tests in `math/__tests__`.
- Units: kg, cm, kcal, g, mg, USD. Totals are rounded with `roundTotals` (kcal and mg to 1, g to 0.1, USD to 0.01).
- `computeTotals` throws on unknown foodIds. Never default missing data to zero silently.
- Optimizer: Doctor rules are hard constraints. Elastic slacks exist only to *report* conflicts; a plan with any conflict is `feasible: false` and must be rejected by the Orchestrator. Never add a code path that relaxes a MedicalConstraints field.
- Allergies and restrictions are filtered in `filterPool` before optimization.
- Performance budget: a full week under 5 s for a ~30 meal pool (`npx tsx scripts/try-optimizer.ts`).
- Kalman alerts must fire on seeded Alex (weight stall) and Maria (glucose drift) data and stay quiet on normal noise. Tests guard this.
- Run `npm test -- math` before saying you are done.
