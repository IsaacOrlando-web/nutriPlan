---
name: nutriplan-ui
description: Design system, screens, states and test ids for NutriPlan AI's frontend. Use when building or reviewing anything under /app/(app), /app/(auth), /components, /lib/hooks or /mocks, or when a screen, component, color or data-testid is mentioned.
---

# NutriPlan UI skill

Spec section 11. Rules also in `/app/CLAUDE.md`. Data always through `/lib/api.ts`; types from `/types/contracts.ts`.

## Design tokens (tailwind.config.ts)

| Token                      | Hex               | Use                                   |
| -------------------------- | ----------------- | ------------------------------------- |
| `brand`                    | #16A34A           | Primary buttons, active nav, progress |
| `brand-dark`               | #15803D           | Hover                                 |
| `brand-soft`               | #DCFCE7           | Tinted backgrounds, chips             |
| `ink`                      | #0F172A           | Headings, body text                   |
| `ink-muted`                | #475569           | Secondary text                        |
| `ink-subtle`               | #94A3B8           | Placeholders, captions                |
| `surface`                  | #F8FAFC           | Page background                       |
| `surface-raised`           | #FFFFFF           | Cards, sheets                         |
| `surface-sunken`           | #F1F5F9           | Wells, inputs                         |
| `success` / `success-soft` | #22C55E / #DCFCE7 | On track                              |
| `warning` / `warning-soft` | #F59E0B / #FEF3C7 | Stalled, near a cap                   |
| `danger` / `danger-soft`   | #EF4444 / #FEE2E2 | Danger readings, errors               |

Type: Inter via `font-sans`. Radius `rounded-lg` (var `--radius`). Spacing scale 4 px. Shadows: `shadow-sm` on cards, none on page. Icons: `lucide-react` only, 20 px in text, 24 px in nav.

## Agent identities

| Agent        | Token                | Hex     | Icon          | Voice                                |
| ------------ | -------------------- | ------- | ------------- | ------------------------------------ |
| Doctor       | `agent-doctor`       | #2563EB | `Stethoscope` | Calm, cites a source, never concedes |
| Chef         | `agent-chef`         | #EA580C | `ChefHat`     | Enthusiastic, names dishes           |
| Budget       | `agent-budget`       | #059669 | `Wallet`      | Dry, exact dollars                   |
| Monitor      | `agent-monitor`      | #7C3AED | `Activity`    | Observant, trend language            |
| Orchestrator | `agent-orchestrator` | #475569 | `Network`     | Neutral narrator                     |

Event kinds and motion: `proposal` plain bubble; `objection` `animate-shake` + danger left border; `concession` `animate-agent-pulse` with `--pulse-color` set to the agent color; `tool_call` small mono chip; `decision` full width brand card.

## Reusable components (/components)

1. `AgentAvatar` (agent -> color + icon, sizes sm/md/lg)
2. `AgentBubble` (AgentEvent -> colored bubble with kind badge and motion)
3. `ConstraintStrip` (MedicalConstraints -> horizontal chips with a "why" popover showing `reasons[]` and source)
4. `MealCard` (Meal -> name, cuisine, kcal, protein, cost, agent explanation count; click opens WhySheet)
5. `WhySheet` (Meal -> bottom sheet/dialog with `explanation[]` grouped by agent, items with grams, totals)
6. `CalorieRing` (DaySummary -> ring with eaten/remaining; `calorie-ring`)
7. `MacroBars` (MealTotals vs DailyTargets -> protein/carbs/fat/fiber/sodium bars)
8. `TrendChart` (Trend -> Recharts: raw dots, filtered line, shaded lower/upper band, alert badge)
9. `BudgetSlider` (Radix slider $20 to $150, commits on release/keyup, shows `weekly-cost`)
10. `ReadingForm` (type select, value, value2 for BP, submit; shows MonitorResult)
11. `Disclaimer` (health disclaimer; on Plan, Dashboard, Trends, Log, Coach)
12. `StateView` (loading skeleton / empty / error with retry; wraps every screen body)
13. `DemoUserSwitch` (Profile)

## Screens and rules

| Route             | Purpose                                                                   | Must have                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/welcome`        | Pitch + "Try as Alex" / "Try as Maria" / sign in                          | `cta-start`, `cta-maria`; calls `api.auth.login` then `/` (dashboard)                                                                         |
| `/login`          | Identifier login (local) or Supabase form                                 | `login-identifier`, `login-submit`                                                                                                            |
| `/onboarding`     | 4 to 5 steps: body, goal, health, food, budget; ends at "Your plan rules" | `onboarding-next`, `onboarding-skip`, `rules-screen` (constraints with sources), `rules-continue` -> `api.plan.generate` -> `/agents/[runId]` |
| `/agents/[runId]` | Agent Room live negotiation                                               | `agent-room`, `agent-event[data-kind][data-agent]`, `constraint-strip`, `plan-ready`                                                          |
| `/` (dashboard)   | Today: ring, macros, next meal, Monitor note                              | `dashboard`, `calorie-ring`                                                                                                                   |
| `/plan`           | 7 day tabs, meal cards, budget slider, weekly cost, shadow price hints    | `plan-screen`, `plan-day` x7, `meal-card` (3 or 4 per selected day; 21+ across the week), `budget-slider`, `why-sheet`, `weekly-cost`         |
| `/grocery`        | Grouped by `storeSection`, check off, total                               | `grocery-list`, `grocery-item`                                                                                                                |
| `/log/photo`      | Upload -> two model votes -> confirm or answer one question               | `photo-input`, `photo-analyze`, `vision-result`, `photo-confirm`                                                                              |
| `/log/reading`    | Weight / glucose / BP entry -> Monitor result                             | `reading-type` (native `<select>`), `reading-value`, `reading-value2` (BP), `reading-submit`, `monitor-result`                                |
| `/trends`         | Tabs weight / glucose / BP, Kalman chart, alert                           | `trend-chart`, `trend-alert`, `trend-tab-weight` / `trend-tab-glucose` / `trend-tab-bp`                                                       |
| `/coach`          | Chat with context; replies may link a replan run                          | `coach-input`, `coach-send`, `coach-message`                                                                                                  |
| `/profile`        | Edit profile, demo user switch                                            | `profile-screen`, `demo-user-switch` (`demo-user-alex`, `demo-user-maria`)                                                                    |

Navigation ids: `nav-dashboard`, `nav-plan`, `nav-log`, `nav-trends`, `nav-coach`. Phone: bottom tab bar. Laptop: left rail.

## States

Every screen renders loading (skeleton shaped like the content), empty (one sentence + one action), error (message + retry via `refetch`) and data. Check with `/states <screen>`.

## Text

English only (D-009). Format numbers with `Intl.NumberFormat` / `toLocaleString("en-US")`; units kg, mg/dL, mmHg, USD.

## Test ids

Full table in `/app/CLAUDE.md`. Never rename. Use `data-testid` on the semantic element the test interacts with (the `<select>`, the `<button>`, the slider root).

## Done checklist

- Mocks and real data both render
- 390 and 1440 screenshots (`/screen <name>`)
- Four states
- No hex in components
- `npm run typecheck && npm run lint`
