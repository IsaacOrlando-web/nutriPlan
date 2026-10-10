# End to end tests

`tests/e2e/demo-flow.spec.ts` walks the demo (spec section 3) with the stable `data-testid`s listed in `/app/CLAUDE.md`. The same spec runs in every mode; it logs in through the UI ("Try as Alex" / "Try as Maria") so it never depends on cookies or localStorage directly.

## Modes

| Mode                            | Command                                                                                                                    | Notes                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory backend (default)        | `npm run test:e2e`                                                                                                         | `playwright.config.ts` starts `npm run dev` with `AGENT_EVENT_DELAY_MS=40`. Scripted agents when no key is set.                                   |
| Mocks only (Frontend day 1, CI) | bash: `NEXT_PUBLIC_USE_MOCKS=true npm run test:e2e` <br> PowerShell: `$env:NEXT_PUBLIC_USE_MOCKS='true'; npm run test:e2e` | The dev server inherits the variable; `/lib/api.ts` serves `/mocks`. Mock replay paces events at ~1.3 s, so the Agent Room test takes about 30 s. |
| Live URL (checkpoint 5)         | `E2E_BASE_URL=https://<url> npm run test:e2e -- --project=laptop`                                                          | No local server is started.                                                                                                                       |

Useful flags: `-- --project=laptop` or `--project=phone`, `-- --headed`, `-- --ui`, `-- -g "Agent Room"`. Report: `npx playwright show-report`. If a dev server is already running on 3000, Playwright reuses it (`reuseExistingServer: true`), so make sure its env matches the mode you want.

## Test list

1. Alex: welcome -> dashboard (`/`) -> plan (7 days, >= 21 meal cards summed across day tabs) -> why sheet -> grocery items.
2. Agent Room: budget slider keyboard change -> `/agents/<runId>` -> objection and concession events -> plan ready.
3. Reading: weight 89.2 -> Monitor result.
4. Trends: chart and alert visible on the weight tab.
5. Maria: glucose tab (`trend-tab-glucose`) shows "rising".
6. Profile: `demo-user-maria` inside `demo-user-switch` switches the demo user.

## Assumptions the Frontend must keep (matches the current implementation)

- `cta-start` / `cta-maria` log in and land on `/` (the dashboard, `data-testid="dashboard"`). If a future flow lands on `/onboarding`, `onboarding-skip` then `rules-continue` must lead to the dashboard or an Agent Room run.
- `budget-slider` is the Radix slider root (thumb has `role="slider"`); a keyboard step commits (debounced 500 ms) and navigates to `/agents/<runId>`.
- `reading-type` is a native `<select>` with `ReadingType` values.
- Trend tabs are `trend-tab-weight`, `trend-tab-glucose`, `trend-tab-bp`; `trend-alert` contains the alert word.
- `demo-user-switch` contains `demo-user-alex` and `demo-user-maria`.
- Navigation ids `nav-dashboard`, `nav-plan`, `nav-log`, `nav-trends`, `nav-coach`.

Add new tests with `getByTestId`, generous timeouts and `>=` assertions where counts may vary.
