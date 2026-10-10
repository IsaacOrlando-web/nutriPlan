// Public math API. Owner: Math. Agents call these through /agents/tools/math.ts.
export { calculateTargets, formulaTdee, mifflinStJeor, safeGoalRate, ACTIVITY_FACTORS, KCAL_PER_KG } from "./targets";
export { optimizePlan, verifyPlan, filterPool, enumeratePatterns, SLOTS_BY_MEALS, WEIGHTS } from "./optimizer";
export type { OptimizeOptions, HardConstraintName, PortionPattern } from "./optimizer";
export { computeTotals, computeTotalsRaw, sumTotals, subtractTotals, emptyTotals, roundTotals, glycemicLoadOf } from "./totals";
export { getTrends, kalmanFilter, NOISE, STALL_DAYS, STALL_KG, TOO_FAST_KG_PER_WEEK } from "./kalman";
export { updateTdee, observeTdee } from "./metabolism";
// stretch
export { fitGlucoseResponse } from "./glucoseResponse";
export type { GlucoseModel } from "./glucoseResponse";
export { simulate } from "./simulate";
export type { SimulationResult, SimulationWeek } from "./simulate";
export { sampleTaste, sampleBeta, seededRandom } from "./taste";
