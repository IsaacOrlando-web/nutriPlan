# Demo script (spec section 3)

Target: 5 minutes 30 seconds of demo plus 30 seconds of intro. Two presenters: Driver (clicks) and Narrator (speaks). Rehearse with a stopwatch; the timings below are cumulative.

## Before walking on stage (checklist, 10 minutes before)

- Live URL open in Chrome at 1440x900, zoom 100 percent, one tab; second tab on `/welcome` as backup.
- `POST /api/demo/reset` for both users (Profile screen "Reset demo data" or `curl -X POST <url>/api/demo/reset -d '{"user":"alex"}'`).
- Confirm keys are present on the deployment (`/api/auth/session` works, Agent Room shows live events in a dry run) or decide to run `AGENTS_MODE=scripted`; both look identical to the audience.
- Backup video on the laptop desktop, `docs/runbook.md` open on the phone.
- Phone with the live URL at `/dashboard` logged in as Alex, for the "it is mobile first" moment.

## Intro (0:00 to 0:30)

Narrator: "Meal planning apps give you a list. NutriPlan AI gives you a team. A Doctor who sets the rules from published guidelines, a Chef who cooks for your taste, a Budget agent who counts every dollar, and a Monitor that watches your body and fixes the plan on its own. They negotiate in front of you, and every number comes from real math, not from a language model guessing."

## Part 1: Alex (0:30 to 3:40)

| Time | Driver                                                                                                                                                                                 | Narrator                                                                                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:30 | `/welcome`, click "Try as Alex" (`cta-start`). If the demo starts with onboarding instead: click "Start" and walk steps 1 to 5 with the prefilled values, `onboarding-next` each time. | "Alex is 22, a student, wants to lose fat on $50 a week and is allergic to peanuts."                                                                                                                                                                                                |
| 0:50 | "Your plan rules" (`rules-screen`): hover a rule chip to show the source, then `rules-continue`.                                                                                       | "Before anyone cooks, the Doctor reads the Dietary Guidelines: at least 1500 calories, under 2300 mg sodium, 29 g fiber. Each rule links to its source. Peanuts are removed in code, not by a prompt."                                                                              |
| 1:05 | Agent Room opens (`/agents/<runId>`). Let events stream. Point at the objection (shake) and the concession (pulse).                                                                    | "Watch the negotiation. The Chef proposes thirty dishes Alex likes. Budget objects: this week costs 54 dollars. Chef concedes variety, repeats a cheap dinner, and the mixed integer optimizer re-solves. The Doctor never concedes; her rules are hard constraints in the solver." |
| 1:50 | `plan-ready` appears, click "See my plan". `/plan`: tap Wednesday (`plan-day`), open a `meal-card`, show the `why-sheet`.                                                              | "Seven days, three meals, integer portions. Open any meal and each agent explains its part. These sentences are generated, but the numbers are pasted from the solver."                                                                                                             |
| 2:10 | Scroll to `weekly-cost` and the shadow price hint. Then `/grocery`.                                                                                                                    | "The solver also tells us what is binding: raising the budget by five dollars would add salmon twice. The grocery list is grouped by store section and sums to the plan cost."                                                                                                      |
| 2:25 | `/log/photo`: choose the lunch bowl photo (`photo-input`), `photo-analyze`, show `vision-result` with two model columns and the agreement score, `photo-confirm`.                      | "Logging is a photo. Two different vision models read it independently and vote. Agreement above 70 percent logs automatically; below that the app asks exactly one question."                                                                                                      |
| 2:50 | `/trends` (weight tab): point at raw dots, filtered line, the band, and the `trend-alert` "stalled".                                                                                   | "Alex has been weighing daily for two weeks. Raw scale readings bounce; the Kalman filter sees through the noise. The Monitor detected a stall."                                                                                                                                    |
| 3:05 | `/dashboard`: show the Monitor card ("Metabolism updated, plan replanned by itself") and the new calorie target on `calorie-ring`.                                                     | "So the Monitor updated Alex's metabolism estimate with a Bayesian update, lowered the target by about 150 calories, and replanned on its own. No tap required."                                                                                                                    |
| 3:20 | `/plan`: drag `budget-slider` from 50 to 35. Agent Room reopens; show Budget objection and Chef swaps; `plan-ready`.                                                                   | "Money got tight. Drop the budget to 35 dollars and the team renegotiates live. Budget swaps proteins within ten percent, Chef gives up a dish, Doctor still says no to sodium."                                                                                                    |

## Part 2: Maria (3:40 to 5:10)

| Time | Driver                                                                                      | Narrator                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3:40 | `/profile`, `demo-user-switch` -> Maria (or `/welcome` -> `cta-maria`).                     | "Maria is 45, lives with type 2 diabetes and high blood pressure, budget 70 dollars."                                                                                                                                                                               |
| 3:55 | "Your plan rules" or Profile rules panel: show the stricter list with ADA and DASH sources. | "Her rules are stricter: 45 grams of carbs per meal, glycemic load under 20, sodium 1500, potassium at least 3500, every one cited from the ADA Standards of Care and the DASH plan. And because of her medication, the app knows when it must not push potassium." |
| 4:15 | `/log/reading`: type `glucose_fasting`, value 142, `reading-submit`; show `monitor-result`. | "She logs a high fasting glucose. The Monitor checks the trend, not the single reading, and rebalances carbs across her meals within the ADA rule."                                                                                                                 |
| 4:35 | `/trends` glucose tab: raw dots, filtered line, band, `trend-alert` "rising".               | "Her fasting glucose has drifted up ten points over two weeks; the filtered line shows it clearly while the raw dots hide it."                                                                                                                                      |
| 4:50 | `/coach`: type "Can I have rice tonight?" `coach-send`; show the reply (`coach-message`).   | "The coach answers from her actual plan and limits, in English or Spanish, and never invents a number."                                                                                                                                                             |
| 5:00 | `/profile` -> `lang-switch` Spanish, back to `/dashboard`.                                  | "Todo funciona en español también."                                                                                                                                                                                                                                 |

## Close (5:10 to 5:40)

Narrator: "Under the hood: a hand written multi agent orchestrator on the Vercel AI SDK, a mixed integer program solved by HiGHS compiled to WebAssembly with shadow prices as explanations, Kalman filters on weight, glucose and blood pressure, Bayesian metabolism updates, two vision models voting, and diabetes and hypertension rules with sources. It runs offline on a laptop and on Vercel. Thank you."

## Backups, in order

1. Agent Room stalls for more than 15 s: click "Replay saved negotiation" (loads `GET /api/agents/runs/<runId>`), or reload the page; the stream resumes from the stored events.
2. Live models fail: deployment has `AGENTS_FALLBACK=true`; the run replays `agents/fallbacks/<user>-plan-run.json` automatically. If the whole provider is down, flip `AGENTS_MODE=scripted` in Vercel env (takes a redeploy, ~1 minute) or switch to the laptop running `npm run dev` with no keys.
3. Live URL down: laptop `npm run dev` on the memory backend with `AGENTS_MODE=scripted`; everything above works identically, including photo voting (scripted result).
4. Laptop down: play the recorded video (`docs/runbook.md` has the path) and narrate over it.
5. Demo data looks wrong (someone played with it): Profile "Reset demo data" or `POST /api/demo/reset`.

## Spoken lines to never skip

- "Numbers come from math, not from the language model."
- "The Doctor never concedes."
- "It replanned by itself."
- "Every rule has a source."
