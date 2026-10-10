# NutriPlan AI: Master Spec for Claude Code

Read this entire file before doing anything. It is the single source of truth for this repository. When this file and any other instruction disagree, ask the human before acting.

---

## 0. Why this exists (read this first, Claude)

We are a team of 5 friends competing in the **Ensign BUILD hackathon**. We are committed to winning. Not placing. Winning.

That means three things for how you work in this repo:

1. **The demo is the product.** Everything we build must serve a flawless, unforgettable live demo. If a feature does not show up in the demo or make the demo more reliable, it waits.
2. **Real engineering, not a ChatGPT wrapper.** Judges have seen a hundred "ask an LLM for a meal plan" apps. We win because we have real multi agent orchestration, real mathematical optimization, real statistical adaptation, and real computer vision voting. Never fake these with a prompt.
3. **Five people, one repo, zero merge pain.** Every role builds against shared contracts with mock data, owns its own folders, and never edits another role's folders. You enforce this.

Your job in this repo: scaffold the full structure, then help each team member build their part fast, cleanly, and in a way that merges perfectly.

---

## 1. The product in simple words

NutriPlan AI is an app that tells anyone exactly what to eat each day, based on their goals, their body, their taste, and their budget.

Four AI helpers work together to build the plan:

1. **Doctor** makes sure the food is healthy and safe for you.
2. **Chef** makes sure the food tastes good.
3. **Budget** makes sure you can afford it.
4. **Monitor** watches how you are doing and fixes the plan by itself when needed.

They negotiate with each other, and the user can watch them do it live. Then math turns their agreement into an exact plan: every meal, every portion, and a grocery list.

Every day the user can photograph their food (two AI models identify it) and log their weight. Users with diabetes or high blood pressure can also log glucose or blood pressure, and the app gives them stricter health rules.

**One sentence:** a team of AI helpers that builds a healthy, affordable meal plan for anyone, and keeps fixing it as your body and life change.

**Technical one sentence (for judges):** a multi agent AI nutrition web app combining LLM agent orchestration, computer vision, and mathematical optimization to generate, monitor, and autonomously adapt personalized meal plans, with extra support for conditions such as diabetes and hypertension.

---

## 2. What makes us win

### Core (must ship, polished)

1. **Four agents that negotiate, visibly.** Doctor, Chef, Budget, Monitor, plus an Orchestrator. They propose, object, concede, and decide. Every step streams live to the **Agent Room** screen.
2. **Real optimization.** A mixed integer program builds every 7 day plan. Health rules are hard constraints. Cost, taste, and variety are in the objective. Portions come out as real servings.
3. **Shadow prices as explanations.** The optimizer reports what each constraint costs. "Raising your budget by $5 would let Chef add salmon twice" is a computed number, not an LLM guess.
4. **Autonomous adaptation.** Kalman filters extract true trends from noisy weight, glucose, and blood pressure readings. A Bayesian model learns each user's real metabolism. Monitor replans without being asked.
5. **Two vision models vote on food photos** from two different providers. Agreement means auto log. Disagreement means one quick question to the user.
6. **Explainable meals.** Tap any meal to see each agent's reasoning.

### Stretch (only after the core freeze, each on its own branch)

7. Personal glucose response model (Bayesian regression per user).
8. 12 week outcome simulator (Monte Carlo with uncertainty bands).
9. Taste learning with Thompson sampling on meal ratings.
10. Fridge scan: photo of the fridge, Chef plans around it, Budget trims the grocery list.
11. Voice mode for the Coach.

---

## 3. The demo (this is what must work on stage)

**Part 1: Alex, 22, college student, wants to lose fat, $50 per week.**

1. Signs up and onboards: goal, body, activity, likes, dislikes, allergies, budget.
2. Doctor sets healthy limits. Math calculates targets. "Your plan rules" screen appears.
3. Agent Room opens. Chef, Doctor, Budget negotiate live. At least one objection and one concession. Optimizer runs. The 7 day plan and grocery list slide in. Total cost shown.
4. Alex photographs lunch. Both vision models analyze it. Totals logged. Dashboard updates.
5. Alex's seeded data shows a 2 week weight stall. Monitor detects it from the Kalman trend, updates the metabolism estimate, and replans on its own, explaining why.
6. Budget slider: $50 to $35. Agent Room reopens, agents renegotiate, plan and grocery list rebuild in seconds.

**Part 2: Maria, 45, type 2 diabetes and high blood pressure, $70 per week.**

7. Same app, different plan. Doctor adds carb per meal, glycemic load, sodium, and potassium rules with guideline sources.
8. Maria logs a high fasting glucose reading. Monitor sees the rising trend and rebalances tomorrow's meals.
9. Trends screen: raw readings as dots, filtered true trend as a line, uncertainty band.

**Close:** under the hood slides (agent architecture, optimizer with shadow prices, Kalman and Bayesian adaptation), impact, what's next.

**Backups:** cached negotiation replays for both users, and a recorded video of the full demo.

---

## 4. Team and ownership

| Role | Owns these folders | Never edits |
| --- | --- | --- |
| 1. Design / Frontend | `/app/(app)`, `/app/(auth)`, `/components`, `/lib/api.ts`, `/lib/hooks`, `/mocks`, `/i18n`, `/public`, `tailwind.config.ts` | `/agents`, `/math`, `/app/api`, `/supabase`, `/types` |
| 2. AI Agents | `/agents`, `/app/api/plan`, `/app/api/agents`, `/app/api/log/photo`, `/app/api/coach`, `/app/api/monitor` | screens, `/math`, `/supabase`, `/types` |
| 3. Backend / Data | `/supabase`, `/lib/supabase`, `/lib/db`, `/scripts/data`, all other `/app/api` routes | screens, `/agents`, `/math`, `/types` |
| 4. Math | `/math` | everything else |
| 5. Lead / Integration | `/types`, root config files, `CLAUDE.md` files, `/docs`, `/.github`, `/.claude`, merges | nothing is off limits, but changes to other folders go through the owner |

**Contract changes:** only the Lead edits `/types/contracts.ts`. Anyone who needs a change asks the Lead in the group chat. The Lead updates the file and tells everyone.

**When a human asks you to edit outside their folders:** stop and remind them who owns it. Offer to write the request for the owner instead.

---

## 5. Tech stack (locked)

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14+ App Router, TypeScript strict |
| Styling | Tailwind CSS, shadcn/ui, lucide-react icons, Inter font |
| Animation | Framer Motion |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query |
| i18n | next-intl (English and Spanish) |
| Database, auth, storage, realtime | Supabase (Postgres) |
| AI | Vercel AI SDK (`ai`) with `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` |
| Validation | Zod everywhere |
| Optimization | `highs` (HiGHS solver compiled to WebAssembly, supports mixed integer programs). Fallback: `javascript-lp-solver` |
| Testing | Vitest for `/math` and `/agents`, Playwright for end to end demo flow |
| Deploy | Vercel |
| Package manager | npm |

No LangChain, no LangGraph, no extra state libraries. Hand written orchestration gives us full control over every Agent Room event.

---

## 6. Repository structure

Scaffold exactly this. Create every folder. Create every file listed with a short header comment saying what it is for and which role owns it. Files marked (stub) get a working placeholder implementation that returns realistic mock data matching the contracts, so the app runs end to end from day one.

```text
nutriplan-ai/
  NUTRIPLAN_MASTER_SPEC.md         this file
  CLAUDE.md                        root rules for Claude Code (section 13)
  README.md                        setup steps for humans
  .env.example                     every env var, no secrets
  .gitignore
  package.json
  tsconfig.json
  next.config.mjs
  tailwind.config.ts               design tokens (section 11)
  postcss.config.mjs
  components.json                  shadcn config
  vitest.config.ts
  playwright.config.ts
  middleware.ts                    auth redirect + next-intl locale

  /docs
    frontend-brief.md              Role 1 brief (paste from team doc)
    agents-brief.md                Role 2 brief
    backend-brief.md               Role 3 brief
    math-brief.md                  Role 4 brief
    lead-brief.md                  Role 5 brief
    demo-script.md                 exact clicks and lines
    decisions.md                   log of decisions and contract changes

  /types
    contracts.ts                   ALL shared types (section 7). Lead owns.
    index.ts                       re exports

  /app
    layout.tsx
    globals.css
    /(auth)
      /welcome/page.tsx
      /login/page.tsx
      /signup/page.tsx
    /(app)
      layout.tsx                   app shell, bottom nav on phone, sidebar on laptop
      page.tsx                     Dashboard
      /onboarding/page.tsx
      /agents/[runId]/page.tsx     Agent Room
      /plan/page.tsx
      /grocery/page.tsx
      /log/photo/page.tsx
      /log/reading/page.tsx
      /trends/page.tsx
      /coach/page.tsx
      /profile/page.tsx
    /api
      /profile/route.ts            GET, POST (Backend)
      /foods/search/route.ts       GET (Backend)
      /plan/generate/route.ts      POST (Agents)
      /plan/current/route.ts       GET (Backend)
      /agents/stream/route.ts      GET SSE (Agents)
      /upload/route.ts             POST (Backend)
      /log/route.ts                POST (Backend)
      /log/photo/route.ts          POST (Agents)
      /readings/route.ts           POST (Backend)
      /trends/route.ts             GET (Backend, calls Math)
      /summary/route.ts            GET (Backend)
      /coach/route.ts              POST (Agents)
      /monitor/run/route.ts        POST (Agents)
      /simulate/route.ts           POST (Math, stretch)

  /components
    /ui                            shadcn generated
    /agents
      AgentAvatar.tsx
      AgentMessage.tsx
      AgentRoom.tsx
      ConstraintStrip.tsx
    /meals
      MealCard.tsx
      WhySheet.tsx
      BudgetSlider.tsx
    /charts
      CalorieRing.tsx
      MacroBar.tsx
      TrendChart.tsx
    /common
      AlertCard.tsx
      StatPill.tsx
      LoadingState.tsx
      EmptyState.tsx
      ErrorState.tsx
      Disclaimer.tsx

  /lib
    api.ts                         THE ONLY place screens get data. Mock switch inside.
    /hooks                         TanStack Query hooks per resource
    /supabase
      client.ts
      server.ts
    /db                            typed query helpers (Backend)
    utils.ts

  /mocks                           (stub) realistic JSON for every contract
    profile-alex.json
    profile-maria.json
    constraints-alex.json
    constraints-maria.json
    targets-alex.json
    targets-maria.json
    plan-alex.json                 full 7 days, 21 meals, grocery list
    plan-maria.json
    food-log.json
    readings-alex.json             21 days, weight stall last 14
    readings-maria.json            21 days, glucose drift up last 4
    trend-weight.json
    trend-glucose.json
    agent-events-alex.json         full 20 event negotiation
    agent-events-maria.json
    foods-sample.json              50 foods

  /i18n
    en.json
    es.json
    request.ts

  /agents
    CLAUDE.md                      agent rules (section 13)
    config.ts                      model per agent, backups, timeouts
    orchestrator.ts                (stub)
    doctor.ts                      (stub)
    chef.ts                        (stub)
    budget.ts                      (stub)
    monitor.ts                     (stub)
    coach.ts                       (stub)
    /vision
      analyze.ts                   (stub)
      vote.ts                      (stub, implement the math for real, it is simple)
    /prompts
      orchestrator.md
      doctor.md
      chef.md
      budget.md
      monitor.md
      coach.md
      vision.md
    /rules
      guidelines.json              health rules with sources (section 9)
    /tools
      math.ts                      AI SDK tool wrappers for /math
      backend.ts                   AI SDK tool wrappers for /lib/db
      events.ts                    emitEvent()
    /schemas
      index.ts                     Zod schemas mirroring /types/contracts.ts
    /fallbacks
      alex-plan-run.json
      maria-plan-run.json
    /evals
      users.json                   10 sample users
      scenarios.json
      /photos
        answers.json
      run-evals.ts

  /math
    CLAUDE.md                      math rules (section 13)
    index.ts                       exports every public function
    targets.ts                     calculateTargets
    optimizer.ts                   optimizePlan (MILP + shadow prices)
    totals.ts                      computeTotals
    kalman.ts                      getTrends
    metabolism.ts                  updateTdee (Bayesian)
    glucoseResponse.ts             fitGlucoseResponse (stretch)
    simulate.ts                    simulate (stretch)
    taste.ts                       sampleTaste (stretch)
    /__tests__
      targets.test.ts
      optimizer.test.ts
      totals.test.ts
      kalman.test.ts
      metabolism.test.ts

  /supabase
    /migrations
      0001_init.sql                full schema (section 8)
      0002_rls.sql                 row level security policies
    seed.sql                       Alex and Maria demo users

  /scripts
    /data
      import-usda.ts               USDA FoodData Central import
      add-glycemic-index.ts
      add-prices.ts
      load-meal-templates.ts
      meal-templates.json          about 60 templates
      prices.csv                   top 200 foods, one real store, date collected
    seed-demo.ts                   writes Alex and Maria through the API

  /tests
    /e2e
      demo-flow.spec.ts            Playwright: the full section 3 demo

  /.claude
    /skills
      /nutriplan-ui/SKILL.md
      /nutriplan-agents/SKILL.md
      /nutriplan-math/SKILL.md
    /agents
      ui-reviewer.md
      mock-builder.md
      prompt-reviewer.md
      eval-runner.md
      safety-checker.md
      contract-guard.md
    /commands
      screen.md
      agent.md
      eval.md
      replay.md
      states.md
      translate.md
      checkpoint.md
    settings.json                  permissions and hooks (section 13)

  /.github
    pull_request_template.md
    /workflows
      ci.yml                       typecheck, lint, vitest on every PR
```

---

## 7. Shared contracts (`/types/contracts.ts`)

Create this file exactly. Every role imports from here. Units: kilograms, centimeters, kcal, grams, milligrams, US dollars.

The canonical copy lives in `/types/contracts.ts` (the file in the repo is authoritative; it also carries API envelope types added by the Lead at bootstrap, see `docs/decisions.md` D-003). Core types:

```ts
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type Condition = "type2_diabetes" | "hypertension" | "kidney_disease" | "high_cholesterol";
export type Language = "en" | "es";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type AgentName = "doctor" | "chef" | "budget" | "monitor" | "orchestrator";
export type AgentEventKind = "proposal" | "objection" | "concession" | "tool_call" | "decision";
export type ReadingType = "weight" | "glucose_fasting" | "glucose_post_meal" | "bp";

export interface UserProfile { userId; name; language; sex; age; heightCm; weightKg; activityLevel; goal; goalRateKgPerWeek; conditions; medications; allergies; restrictions; likes; dislikes; weeklyBudgetUsd; mealsPerDay: 3 | 4 }
export interface MedicalConstraints { minCaloriesPerDay; minFiberG; maxAddedSugarG; maxSodiumMgPerDay; maxSatFatPct; maxCarbsPerMealG?; maxGlycemicLoadPerMeal?; minPotassiumMgPerDay?; excludedFoodTags; reasons: { rule; why; source }[]; summary }
export interface DailyTargets { calories; proteinG; carbsG; fatG; fiberG; sodiumMg; potassiumMg; tdeeEstimate; tdeeUncertainty }
export interface Food { foodId; name; nameEs?; per100g: Nutrients; glycemicIndex?; giEstimated; priceUsdPer100g?; servingG; servingLabel; tags; storeSection }
export interface Nutrients { calories; proteinG; carbsG; fatG; fiberG; sugarG; addedSugarG; satFatG; sodiumMg; potassiumMg }
export interface MealTotals extends Nutrients { glycemicLoad; costUsd }
export interface MealItem { foodId; name; servings; grams }
export interface AgentNote { agent: AgentName; text }
export interface Meal { mealId; type; name; cuisine; recipeSteps; prepMinutes; items; totals; explanation: AgentNote[] }
export interface PlanDay { date; meals; dayTotals }
export interface GroceryItem { foodId; name; quantityG; quantityLabel; costUsd; storeSection }
export interface ShadowPrice { constraint; value; humanText }
export interface MealPlan { planId; userId; version; reason; runId; startDate; weeklyCostUsd; days; groceryList; shadowPrices; bestEffort }
export interface FoodLogItem { foodId; name; grams; confidence }
export interface FoodLogEntry { logId; userId; eatenAt; photoUrl; source; visionAgreement; question; items; totals; flags }
export interface Reading { readingId; userId; type; value; value2?; unit; takenAt; relatedLogId? }
export interface TrendPoint { date; raw; filtered; lower; upper }
export interface Trend { type; points; slopePerWeek; alert: "none" | "rising" | "falling" | "stalled" | "too_fast" }
export interface AgentEvent { eventId; runId; agent; kind; text /* under 140 chars */; at; data? }
export interface DaySummary { date; targets; eaten; remaining }
export interface CandidateMeal { candidateId; type; name; cuisine; recipeSteps; prepMinutes; ingredients: { foodId; minServings; maxServings }[]; tasteScore; pitch }
export interface Concessions { maxRepeatsPerWeek: 2 | 3; budgetSlackPct: 0 | 5 | 10 }
export interface OptimizeInput { pool; foods; targets; constraints; weeklyBudgetUsd; concessions; startDate; mealsPerDay }
export interface OptimizeResult { feasible; withinBudget; days; weeklyCostUsd; shadowPrices; bindingConstraints; conflicts; solveMs }
```

---

## 8. Database (`/supabase/migrations/0001_init.sql`)

Tables (all user tables keyed by `user_id uuid references auth.users on delete cascade`, contract JSON in a `data jsonb` column): `profiles`, `medical_constraints`, `daily_targets`, `tdee_posteriors`, `foods` (text pk, trigram indexes on `name` and `name_es`, `tags text[]`), `meal_templates`, `meal_plans` (version, is_current), `food_logs`, `readings` (typed columns), `meal_ratings`, `agent_runs`, `agent_events` (added to `supabase_realtime`), `agent_logs` (service role only). `0002_rls.sql`: enable row level security on every user table; users can only select, insert, update their own rows. `foods` and `meal_templates` are readable by all authenticated users. `agent_logs` is service role only.

---

## 9. AI Agents (owner: Role 2)

**Golden rule: agents decide, argue, and explain. Math calculates.** An LLM never produces a number shown to the user. Calories, grams, cost, and limits come from `/math` or from `guidelines.json`.

| Agent | Job | Model (in `config.ts`) | Concedes? |
| --- | --- | --- | --- |
| Doctor | Builds MedicalConstraints from `guidelines.json` only. Flags risky meals and danger readings. | Strong reasoning (Claude Sonnet) | Never |
| Chef | Proposes about 30 candidate meals that fit likes, dislikes, culture, restrictions. Maps every ingredient to a real `foodId` with `searchFoods`. | Creative and fast (GPT mini tier or Gemini Flash) | Variety first |
| Budget | Prices candidates with `computeTotals`, objects with cheaper swaps (protein within 10%), builds the grocery list. | Fast (Claude Haiku) | Up to 10% over |
| Monitor | After every reading or log, reads Trends and decides whether to replan. Max one auto replan per day. | Fast (Claude Haiku) | n/a |
| Orchestrator | Runs the negotiation, calls the optimizer, resolves conflicts, writes the decision. Mostly plain code. | Strong reasoning (Claude Sonnet) | Final say |
| Vision A and B | Identify foods and grams from a photo, independently, in parallel. | Two providers (Claude Sonnet + Gemini) | n/a |

Every agent uses `generateObject` with a Zod schema, a 15 second timeout, one retry, and a backup model from another provider. Use the latest model versions available; names live only in `config.ts`.

**Plan run protocol**

1. `POST /api/plan/generate` creates an `agent_runs` row and returns `{ runId }` immediately. The run continues in the background.
2. Doctor publishes constraints.
3. Chef proposes the pool.
4. Budget objects and swaps.
5. Orchestrator calls `optimizePlan`. If infeasible or over budget, ask concessions in order: Chef (repeats 3 per week, more cheap meals), then Budget (5%, then 10% slack). Doctor never concedes. Max 3 rounds.
6. Code verifies every hard constraint again after the optimizer. Violations reject the plan.
7. Orchestrator writes `explanation` notes per meal (using shadow prices) and the decision event. Plan saved.

**Events:** 15 to 25 per run, each under 140 characters, at least one objection and one concession per run, each agent with a distinct personality (Doctor calm and firm, Chef passionate and playful, Budget practical and funny about money, Monitor observant and encouraging, Orchestrator neutral referee).

**Streaming:** `GET /api/agents/stream?runId=` is Server Sent Events: replay saved events for the run, then push new ones, close after `decision`. Frontend may alternatively subscribe to `agent_events` through Supabase Realtime.

**Vision voting (`vote.ts`, implement for real):** match foods across both models by `foodId`; gram similarity = smaller ÷ larger; agreement = sum of similarity over matched foods ÷ count of distinct foods found by either. Agreement 0.7 or more: auto log with averaged grams. Below: return one question about the biggest disagreement.

**Monitor replans when:** weight trend stalled 14+ days for lose or gain goals; weight changing faster than safe; glucose or BP trend alert from Math; same planned meal skipped 3 times; sodium or sugar limit exceeded 3 days running. Danger readings (glucose under 70 or over 300 mg/dL, BP over 180/120) produce an urgent "contact a professional" alert.

**`/agents/rules/guidelines.json` must contain, with source links:**

1. Everyone (Dietary Guidelines for Americans): fiber about 14 g per 1,000 kcal; added sugar under 10% of calories; sodium under 2,300 mg; saturated fat under 10% of calories; calorie floors 1,200 (female) and 1,500 (male); allergies always excluded.
2. Type 2 diabetes (ADA Standards of Care): carbs spread evenly with a per meal cap (default 45 g); glycemic load cap per meal (default 20); stricter added sugar.
3. Hypertension (DASH): sodium 1,500 mg; potassium 3,500 mg or more; saturated fat 6% of calories.
4. Exception: kidney disease or potassium affecting medications means never raise potassium; advise checking with their doctor.

---

## 10. Math (owner: Role 4)

Pure TypeScript functions, no side effects, fully unit tested. Agents call them through `/agents/tools/math.ts`.

```ts
calculateTargets(profile: UserProfile, constraints: MedicalConstraints, tdeePosterior?: { mean: number; sd: number }): DailyTargets
optimizePlan(input: OptimizeInput): Promise<OptimizeResult>
computeTotals(items: { foodId: string; grams: number }[], foods: Record<string, Food>): MealTotals
getTrends(readings: Reading[], type: ReadingType, goal?: Goal): Trend
updateTdee(prior: { mean: number; sd: number }, intakeKcal: number[], weightTrend: Trend): { mean: number; sd: number }
// stretch
fitGlucoseResponse(logs: FoodLogEntry[], readings: Reading[]): GlucoseModel
simulate(profile: UserProfile, plan: MealPlan, tdee: { mean: number; sd: number }, weeks: number): SimulationResult
sampleTaste(ratings: { mealName: string; liked: boolean }[], mealNames: string[]): Record<string, number>
```

1. **Targets:** Mifflin St Jeor BMR (10w + 6.25h − 5a + 5 male, − 161 female) × activity factor (1.2, 1.375, 1.55, 1.725, 1.9). Goal adjustment = rate × 7700 ÷ 7 kcal per day. Respect calorie floors. Protein 1.6 g/kg (maintain) or 2.0 g/kg (lose, gain). Fat 25 to 30% of calories. Carbs fill the rest, capped by per meal limits. When a TDEE posterior exists, use its mean instead of the formula.
2. **Optimizer (MILP with HiGHS):** binary variable per (day, slot, candidate meal); integer servings 0 to 4 per ingredient per chosen meal (linearize with big M bounds). Objective minimizes weighted macro deviation (slack variables for absolute values) + cost − taste + repetition penalty. Hard constraints: every MedicalConstraints field, per meal and per day as applicable; glycemic load per item = GI × available carbs ÷ 100. Soft: calories within 5%, weekly cost ≤ budget × (1 + slack), each meal ≤ maxRepeatsPerWeek. Solve a full week in under 5 seconds (if too slow, solve day by day with a weekly budget split and repeat limits carried forward).
3. **Shadow prices:** for budget, sodium, carb cap, and calorie bounds, re solve with the constraint relaxed by a small amount and report the objective change. Convert to `humanText` with the concrete meal that would change.
4. **Kalman filter:** local linear trend (level + slope). Measurement noise: weight 0.8 kg, glucose 10 mg/dL, BP 6 mmHg. Output filtered value, 95% band, weekly slope, and an alert when the slope passes a threshold and the band clears the baseline. Must fire on seeded Alex and Maria data and stay quiet on normal noise.
5. **Bayesian metabolism:** prior from Mifflin with sd 300 kcal. Weekly observation: TDEE ≈ mean intake − (Δ filtered weight × 7700 ÷ days). Normal normal conjugate update. Show "Your real metabolism: 2,140 ± 90 kcal".

---

## 11. Frontend (owner: Role 1)

**Screens:** Welcome and login, Onboarding (one question per screen, optional health step with Skip, ends with "Your plan rules"), Agent Room, Dashboard, Meal plan (with Budget slider and Why sheet), Grocery list, Photo log, Log reading, Trends, Coach chat, Profile.

**Agent Room (the wow screen):** four agent avatars around a table with the Orchestrator in the middle; live message feed; constraint strip turning green as rules are satisfied; avatar pulse when speaking; objections shake in a red tint; concessions show a handshake; optimizer card while solving; on decision all avatars glow and the plan slides in. Replay button and 1x/2x speed toggle. Must look like a product launch on a 1440px screen and still work at 390px.

**Design tokens (`tailwind.config.ts`):**

| Token | Hex |
| --- | --- |
| brand | #16A34A |
| ink | #0F172A |
| surface | #F8FAFC |
| success | #22C55E |
| warning | #F59E0B |
| danger | #EF4444 |
| agent.doctor | #2563EB (icon Stethoscope) |
| agent.chef | #EA580C (icon ChefHat) |
| agent.budget | #059669 (icon Wallet) |
| agent.monitor | #7C3AED (icon Activity) |
| agent.orchestrator | #475569 (icon Network) |

**Rules:** all data through `/lib/api.ts` with `NEXT_PUBLIC_USE_MOCKS` switch and a 600 ms fake delay in mock mode; every screen has loading, empty, and error states; all text through next-intl; never hardcode colors; health content shows the `Disclaimer` component.

---

## 12. Backend (owner: Role 3)

1. Supabase auth (email and password) and row level security on every user table.
2. Food database: 500 to 1,000 foods from USDA FoodData Central with all `Nutrients` fields; glycemic index from published international GI tables for the top 200 carb foods (others estimated by category and marked `giEstimated`); Latin staples included; Spanish names.
3. Prices: top 200 foods from one real local store, with the date collected, in `prices.csv`.
4. About 60 meal templates.
5. Trigram food search in English and Spanish under 200 ms.
6. Photo upload to Supabase Storage (JPEG or PNG, max 10 MB, compressed), returns a readable URL.
7. After every reading or food log insert, call `POST /api/monitor/run`.
8. Profile save: Doctor builds constraints, Math builds targets, both stored.
9. Seed Alex (lose fat, $50, 21 days, weight stall last 14) and Maria (diabetes + hypertension, $70, 21 days, fasting glucose drifting up last 4).
10. Non AI endpoints under 500 ms. No health data in logs or error messages.

---

## 13. Claude Code configuration

See `CLAUDE.md` (root), `/agents/CLAUDE.md`, `/math/CLAUDE.md`, `/app/CLAUDE.md`, the skills in `/.claude/skills`, subagents in `/.claude/agents`, slash commands in `/.claude/commands` and `/.claude/settings.json`. Recommended MCP servers: Context7 (all), Playwright (frontend, lead), Figma and shadcn (frontend), Supabase (backend, agents).

---

## 14. Bootstrap

Done by the Lead on day one (see git history and `docs/lead-brief.md`): toolchain, contracts, math engine with tests, rules engine, store layer (memory + Supabase), mocks generated from real math, screens on mocks, scripted agents, API routes, Supabase migrations and seed, Claude Code config, docs, Docker, CI, e2e.

---

## 15. Merge checkpoints

| # | Checkpoint | Passes when |
| --- | --- | --- |
| 1 | Contracts locked | Bootstrap done, app runs on mocks, everyone on their branch |
| 2 | Backend + Math | Profile save stores real constraints and targets; optimizer solves real foods; Kalman trends from seeded readings |
| 3 | Agents live | Real negotiation streams events; plan, photo, coach, monitor endpoints return real data |
| 4 | Frontend on real data | `NEXT_PUBLIC_USE_MOCKS=false`; Agent Room shows a live run |
| 5 | Core freeze | Full demo passes `test:e2e` on the live URL; stretch work may start on separate branches |
| 6 | Feature freeze | Only fixes and presentation polish |

---

## 16. Final demo checklist

1. Onboarding produces constraints with guideline sources.
2. Agent Room shows a live negotiation with a visible objection and concession.
3. Plan breaks zero hard constraints and stays within budget.
4. Why sheet shows each agent's reasoning and a shadow price.
5. Photo log: two models vote, dashboard updates.
6. Monitor replans on its own for Alex (stall) and Maria (glucose).
7. Budget slider rebuilds plan and grocery list in seconds.
8. Trends show raw dots, filtered line, band.
9. Works on the presenting laptop and a phone, English and Spanish.
10. Cached replays and backup video ready.

---

## 17. Safety (always on)

The app supports, never replaces, a doctor or dietitian. No diagnosis. Health rules only from cited guidelines. Calorie floors and safe loss rates enforced in code. Allergies filtered in code before optimization. Danger readings always show a "contact a professional" alert. Disclaimer on every screen with health content.

---

## 18. How to talk to the team

Plain, direct language. Short answers. Show what you changed and what to test next. When something is risky for the demo, say so clearly. We are here to win.
