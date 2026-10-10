---
name: nutriplan-math
description: Signatures, formulas, optimizer formulation, Kalman and Bayesian TDEE details, tests and performance budget for NutriPlan AI's /math package. Use when editing or calling anything in /math, when targets, optimizer, shadow prices, trends, TDEE, Mifflin St Jeor, HiGHS or Kalman are mentioned, or when an agent needs a number.
---

# NutriPlan math skill

Spec section 10. Rules in `/math/CLAUDE.md`. Pure TypeScript, no I/O, types from `/types/contracts.ts`, everything exported from `math/index.ts`, tests in `math/__tests__`.

## Public signatures (math/index.ts)

```ts
calculateTargets(profile: UserProfile, constraints: MedicalConstraints, tdeePosterior?: { mean: number; sd: number }): DailyTargets
optimizePlan(input: OptimizeInput, opts?: OptimizeOptions): Promise<OptimizeResult>
  // OptimizeOptions: { mode?: "auto"|"week"|"daily"; solver?: "highs"|"jslp"; shadowPrices?: boolean; timeLimitSec?: number; mipRelGap?: number }
verifyPlan(days: PlanDay[], constraints: MedicalConstraints): string[]      // violations, empty when clean
filterPool(pool, foods, constraints)                                        // removes excludedFoodTags before solving
computeTotals(items: { foodId; grams }[], foods: Record<string, Food>): MealTotals   // throws on unknown foodId
sumTotals, subtractTotals, emptyTotals, roundTotals, glycemicLoadOf
getTrends(readings: Reading[], type: ReadingType, goal?: Goal): Trend
updateTdee(prior: { mean; sd }, intakeKcal: number[], weightTrend: Trend): { mean; sd }
observeTdee(intakeKcal, weightTrend): TdeeObservation | null
mifflinStJeor, formulaTdee, safeGoalRate, ACTIVITY_FACTORS, KCAL_PER_KG
// stretch
fitGlucoseResponse(...), simulate(...), sampleTaste(...), sampleBeta, seededRandom
```

## Formulas (targets.ts)

- BMR, Mifflin St Jeor: `10 * kg + 6.25 * cm - 5 * age + (male ? 5 : -161)`.
- TDEE = BMR x activity factor: sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very_active 1.9. Prior sd 300 kcal.
- Goal adjustment per day = `safeGoalRate * 7700 / 7` (negative for lose; rate capped at 1.0 kg/week and 1 percent of body weight).
- Calories = max(TDEE + adjustment, `constraints.minCaloriesPerDay`), rounded to 10.
- Protein 1.6 g/kg (maintain) or 2.0 g/kg (lose, gain), capped at 35 percent of kcal. Fat 25 to 30 percent of kcal. Carbs take the rest; with a diabetes carb cap the overflow moves to fat (up to 35 percent) then protein.
- Fiber, sodium, potassium targets copied from constraints. `tdeeEstimate` and `tdeeUncertainty` are the posterior when given.

## Optimizer (optimizer.ts) as implemented

Portion pattern MILP solved by HiGHS (WebAssembly, `highs` package), fallback `javascript-lp-solver` (`solver: "jslp"`).

- Preparation: `filterPool` drops candidates with excluded tags; `enumeratePatterns` lists every integer serving combination per candidate (`minServings..maxServings`, max 4 per ingredient, max 96 patterns per meal) and precomputes its `MealTotals` with `computeTotals`.
- Variables: binary `x[day, slot, candidate, pattern]`; integer repeat counters per candidate; continuous slacks.
- Objective (WEIGHTS): calorie deviation percent (extra penalty outside 5 percent), protein under (1) and over (0.2), carb and fat deviation (0.3), cost (1 per dollar), minus taste (4 x tasteScore), repetition (2 per repeat, 300 beyond `maxRepeatsPerWeek`), same meal as yesterday (6), budget overrun beyond slack (100), elastic violations (500).
- Hard Doctor rules per day: min_calories, min_fiber, max_added_sugar, max_sodium, max_sat_fat, min_potassium (when set). Per meal carb and glycemic load caps are exact: patterns that break them are never generated. Elastic slacks exist only so a conflict can be named; any nonzero slack makes `feasible: false` and fills `conflicts[]`. Nothing relaxes a `MedicalConstraints` field.
- Budget: weekly cost <= budget x (1 + `budgetSlackPct`/100); `withinBudget` reports the original budget.
- Mode `auto`: whole week in one model with `timeLimitSec`; if the solver times out, fall back to day by day with carry over of repeat counts.
- Shadow prices (`shadowPrices: true`): re-solve with budget +$5, sodium +200 mg, carbs per meal +5 g, calories +100; `value` is the objective improvement and `humanText` names the concrete change ("Raising your budget by $5 would let Chef add salmon twice") when the improvement is at least 0.5 points.
- Output `OptimizeResult`: `days` with `PlanDay.meals[].items[].servings` integer, `totals` rounded, `bindingConstraints`, `solveMs`.

## Kalman trends (kalman.ts)

Local linear trend (state = level, slope) over one point per calendar day; `raw` null on days without a reading; band = +-1.96 sd. Measurement sd: weight 0.8 kg, glucose 10 mg/dL, BP 6 mmHg. Alerts: `rising` / `falling` when weekly slope passes the type threshold (weight 0.5 kg, fasting glucose 10, post meal 12, BP 5) and the band clears the baseline; weight only: `stalled` when the filtered change over 14 days is under 0.3 kg while goal is lose or gain, `too_fast` when losing or gaining over 1 kg per week. `slopePerWeek` in the reading's unit.

## Bayesian TDEE (metabolism.ts)

Prior from Mifflin St Jeor, sd 300. Observation over the last n >= 7 days: `tdee = mean intake - deltaFilteredWeight * 7700 / days`, sd from intake error (150) and the filtered band. Normal-normal update: `postVar = 1 / (1/priorVar + 1/obsVar)`, `mean = postVar * (prior/priorVar + obs/obsVar)`. Rounded to whole kcal. Returned posterior feeds `calculateTargets`.

## Test expectations (math/**tests**)

- targets: Alex (22 M 180 cm 89.3 kg light, lose 0.5) lands near 2250 kcal with protein ~179 g; floors respected; diabetic carb cap redistributes.
- totals: unknown foodId throws; rounding rules; glycemic load uses GI x carbs / 100.
- optimizer: Alex week feasible within $50, 7 days x 3 meals, integer servings, no excluded tags, `verifyPlan` empty; Maria week respects 45 g carbs and GL 20 per meal, sodium 1500; impossible budget returns `withinBudget: false` and a budget shadow price; conflicting constraints return `feasible: false` with named conflicts.
- kalman: seeded Alex weight -> `stalled`; seeded Maria fasting glucose -> `rising`; flat noisy series -> `none`.
- metabolism: a stall at 2000 kcal intake pulls TDEE down; fewer than 7 days returns the prior.

## Performance budget

Full week with a ~30 meal pool under 5 s (`npx tsx scripts/try-optimizer.ts`). Shadow prices add four re-solves; keep them under the same budget in total by reusing the prepared patterns. Run `npm test -- math` before saying done.
