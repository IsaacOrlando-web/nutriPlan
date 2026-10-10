# /app rules (owner: Role 1, Design/Frontend)

Read `NUTRIPLAN_MASTER_SPEC.md` section 11, `docs/frontend-brief.md` and the `nutriplan-ui` skill first.
Route handlers under `/app/api` belong to Backend and Agents; this file is about screens.

## Data

- Every screen gets data only through `/lib/api.ts` (`api.*`). Never `fetch` from a component, never import `/mocks` directly.
- `NEXT_PUBLIC_USE_MOCKS=true` makes `/lib/api.ts` resolve from `/mocks/*.json` after a 600 ms fake delay. Build every screen against mocks first; it must look identical on real data.
- Server state lives in TanStack Query hooks under `/lib/hooks`. Forms use React Hook Form + Zod. Never invent fields; types come from `/types/contracts.ts`.
- Numbers shown to users come from the API (which gets them from `/math`). Never compute calories, costs or limits in the UI beyond formatting and simple sums for display.

## Every screen has four states

Loading (skeleton, not a spinner), empty (friendly text + one action), error (message + retry button), and data. Check all four with the `/states` command before calling a screen done.

## Text

- UI is English only (decision D-009; i18n was cut). Keep user visible strings short and plain, in one constants module per screen or inline in JSX. Agent event text arrives from the server as is; never rewrite it in the client.

## Colors and tokens

Never hardcode a color. Use the Tailwind tokens from `tailwind.config.ts`:

| Token                                           | Hex                         | Use                           |
| ----------------------------------------------- | --------------------------- | ----------------------------- |
| `brand` / `brand-dark` / `brand-soft`           | #16A34A / #15803D / #DCFCE7 | Primary actions, highlights   |
| `ink` / `ink-muted` / `ink-subtle`              | #0F172A / #475569 / #94A3B8 | Text                          |
| `surface` / `surface-raised` / `surface-sunken` | #F8FAFC / #FFFFFF / #F1F5F9 | Page, cards, wells            |
| `success` / `warning` / `danger` (+ `-soft`)    | #22C55E / #F59E0B / #EF4444 | Status, alerts                |
| `agent-doctor`                                  | #2563EB                     | Doctor (icon `Stethoscope`)   |
| `agent-chef`                                    | #EA580C                     | Chef (icon `ChefHat`)         |
| `agent-budget`                                  | #059669                     | Budget (icon `Wallet`)        |
| `agent-monitor`                                 | #7C3AED                     | Monitor (icon `Activity`)     |
| `agent-orchestrator`                            | #475569                     | Orchestrator (icon `Network`) |

Font is Inter (`font-sans`). Icons from `lucide-react` only. shadcn/ui components live in `/components/ui`. Animations with Framer Motion; use `animate-agent-pulse` and `animate-shake` from the config for the Agent Room.

## Health screens

Plan, Dashboard, Trends, Log and Coach render the `<Disclaimer />` component: "NutriPlan AI gives general nutrition guidance from published guidelines. It is not medical advice. Talk to your doctor before changing medication or diet for a medical condition." Danger readings (glucose under 70 or over 300 mg/dL, blood pressure over 180/120) show the urgent alert from the API verbatim.

## Agent Room (`/agents/[runId]`)

- Subscribe with `api.agents.subscribe(runId, onEvent, onDone)`; it handles mocks and SSE.
- One bubble per `AgentEvent`, colored by agent, icon by agent, kind badge (proposal, objection, concession, tool_call, decision). Objections shake, concessions pulse. Text is under 140 chars; never truncate.
- `constraint-strip` on top shows Doctor's hard limits (from `data.constraints` on the Doctor proposal event or from `api.profile.get()`).
- When the `decision` event arrives show `plan-ready` with a button to the plan. On `onError` offer "Replay saved negotiation" (`api.agents.run(runId)`).
- Works at 390 px (bubbles full width) and 1440 px (centered 720 px column with the constraint strip pinned).

## Viewports

Design for 390 x 844 (phone) and 1440 x 900 (laptop). Bottom tab bar on phone, left rail on laptop. Both are checked by Playwright projects `phone` and `laptop`.

## data-testid convention (stable, used by `tests/e2e`)

Never rename these. Add new ones with the same `screen-element` style.

| Screen / area                                         | Test ids                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome `/welcome`                                    | `cta-start` ("Try as Alex"), `cta-maria`                                                                                                           |
| Login `/login`                                        | `login-identifier`, `login-submit`                                                                                                                 |
| Onboarding `/onboarding`                              | `onboarding-next`, `onboarding-skip`, `rules-screen`, `rules-continue`                                                                             |
| Agent Room `/agents/[runId]`                          | `agent-room`, `agent-event` (with attributes `data-kind`, `data-agent`), `constraint-strip`, `plan-ready`                                          |
| Dashboard `/` (app root; `nav-dashboard` points here) | `dashboard`, `calorie-ring`                                                                                                                        |
| Plan `/plan`                                          | `plan-screen`, `plan-day` (7), `meal-card`, `budget-slider`, `why-sheet`, `weekly-cost`                                                            |
| Grocery `/grocery`                                    | `grocery-list`, `grocery-item`                                                                                                                     |
| Photo log `/log/photo`                                | `photo-input`, `photo-analyze`, `vision-result`, `photo-confirm`                                                                                   |
| Reading `/log/reading`                                | `reading-type` (native `<select>` with `ReadingType` values), `reading-value`, `reading-value2` (BP diastolic), `reading-submit`, `monitor-result` |
| Trends `/trends`                                      | `trend-chart`, `trend-alert`, tabs `trend-tab-weight`, `trend-tab-glucose`, `trend-tab-bp`                                                         |
| Coach `/coach`                                        | `coach-input`, `coach-send`, `coach-message`                                                                                                       |
| Profile `/profile`                                    | `profile-screen`, `demo-user-switch` (group with `demo-user-alex`, `demo-user-maria`)                                                              |
| Navigation                                            | `nav-dashboard`, `nav-plan`, `nav-log`, `nav-trends`, `nav-coach`                                                                                  |

## Before you say done

`npm run typecheck && npm run lint`, screenshots at 390 and 1440 (`/screen` command), all four states, no hardcoded colors.
