---
description: Build or finish a screen from docs/frontend-brief.md on mock data, then screenshot it at 390 and 1440.
argument-hint: <screen name, e.g. plan | dashboard | trends | agent-room>
---

Build the `$ARGUMENTS` screen for NutriPlan AI.

1. Load the `nutriplan-ui` skill and read `/app/CLAUDE.md` and the matching section of `docs/frontend-brief.md`. Find the route, required `data-testid`s, the components to reuse and the mock files it reads.
2. Plan first (plan mode): list files to create or change under `/app/(app)` or `/app/(auth)`, `/components` and `/lib/hooks`.
3. Implement against mocks: make sure `.env.local` has `NEXT_PUBLIC_USE_MOCKS=true` for this session (do not edit `.env*` files yourself; ask the human if it is not set). All data comes from `/lib/api.ts` through a hook in `/lib/hooks`. Add loading, empty, error and data states.
4. Verify: `npm run typecheck && npm run lint`.
5. Screenshots (dev server must be running on http://localhost:3000; start it with `npm run dev` in the background if needed). Log in first by visiting `/welcome` and clicking "Try as Alex", then:
   - `npx playwright screenshot --viewport-size=390,844 --full-page http://localhost:3000/<route> test-results/screens/<screen>-390.png`
   - `npx playwright screenshot --viewport-size=1440,900 --full-page http://localhost:3000/<route> test-results/screens/<screen>-1440.png`
     If the route needs a session cookie, use the Playwright spec approach instead: write a one off script in the scratchpad that logs in via the UI and calls `page.screenshot` at both viewports.
6. Look at both screenshots (Read the png files) and fix layout problems before reporting.
7. Report: files changed, test ids present, screenshot paths, anything the Lead must check.
