// Public math API. Owner: Math. Agents call these through /agents/tools/math.ts.
export {
  calculateTargets,
  formulaTdee,
  mifflinStJeor,
  safeGoalRate,
  ACTIVITY_FACTORS,
  KCAL_PER_KG,
} from "./targets";
export {
  optimizePlan,
  optimizePlanDetailed,
  optimizePrepared,
  prepareContext,
  withBudget,
  verifyPlan,
  filterPool,
  enumeratePatterns,
  SLOTS_BY_MEALS,
  WEIGHTS,
} from "./optimizer";
export type {
  OptimizeOptions,
  HardConstraintName,
  PortionPattern,
  PreparedContext,
  DetailedOptimizeResult,
} from "./optimizer";
// Budget curve (feature 7): solve at several budgets, summarize the tradeoff, turn a point into a plan.
//   computeBudgetCurve(input, budgets, opts?)  solves once per budget on a shared prepared context
//   planFromCurve(point, { startDate? })       OptimizeResult for one point without re-solving (Agents: save as MealPlan)
//   summarizeCurve / mergeBudgetCurves         rebuild insights and thresholds from points (route cache merges)
//   stripCurveDays                             curve without the 7 day plans, what the API returns
export {
  computeBudgetCurve,
  planFromCurve,
  pointFromResult,
  summarizeCurve,
  mergeBudgetCurves,
  repairDominated,
  stripCurveDays,
  fmtUsd,
  CURVE_SOLVE_OPTIONS,
  PROTEIN_OK_G,
  SATURATION_REL_IMPROVEMENT,
} from "./curve";
export type {
  BudgetCurve,
  BudgetCurvePoint,
  BudgetCurveSummary,
  BudgetCurvePointSummary,
  BudgetCurveOptions,
  CurveInput,
} from "./curve";
// Warm cache for curves: the one allowed piece of module state in /math (no I/O). See math/CLAUDE.md.
export {
  curveCacheKey,
  getCachedCurve,
  setCachedCurve,
  getOrComputeCurve,
  clearCurveCache,
  curveCacheSize,
  stableHash,
  stableStringify,
  CURVE_CACHE_MAX,
} from "./curve-cache";
export type { CurveKeyParts } from "./curve-cache";
export {
  computeTotals,
  computeTotalsRaw,
  sumTotals,
  subtractTotals,
  emptyTotals,
  roundTotals,
  glycemicLoadOf,
} from "./totals";
export { getTrends, kalmanFilter, NOISE, STALL_DAYS, STALL_KG, TOO_FAST_KG_PER_WEEK } from "./kalman";
export { updateTdee, observeTdee } from "./metabolism";
// stretch
export { fitGlucoseResponse } from "./glucoseResponse";
export type { GlucoseModel } from "./glucoseResponse";
export { simulate } from "./simulate";
export type { SimulationResult, SimulationWeek } from "./simulate";
export { sampleTaste, sampleBeta, seededRandom } from "./taste";
// Weekly planner: recipe units, per-serving nutrition and cost from matched foods, serving scaling, shopping list.
export {
  analyzeRecipe,
  densityGPerMl,
  isMinorIngredient,
  normalizeUnit,
  roundKitchenQuantity,
  scaleIngredients,
  toBaseQuantity,
  toGrams,
  unitFamily,
} from "./recipe-units";
export type { RecipeAnalysis, UnitFamily } from "./recipe-units";
export {
  aggregateShopping,
  applyShoppingState,
  customItemToShopping,
  emptyShoppingState,
  formatQuantity,
  groupByCategory,
  normalizeCategory,
  normalizeIngredientName,
  pruneShoppingState,
  sortShopping,
} from "./shopping";
export type { ShoppingListItem, ShoppingListView } from "./shopping";
export { estimateItemPriceUsd, shelfPrice, sumPricesUsd } from "./shopping-prices";
export { FLAT_SLOPE_KG_PER_WEEK, goalProgress } from "./progress";
export type { GoalDirection, GoalProgress, GoalProgressInput } from "./progress";
