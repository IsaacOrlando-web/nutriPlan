---
description: Check that a screen renders loading, empty, error and data states correctly on mocks.
argument-hint: <screen name or route>
---

Verify the four states of the `$ARGUMENTS` screen.

1. Read the screen's page file under `/app/(app)` or `/app/(auth)` and the hook it uses in `/lib/hooks`. Confirm the body is wrapped by the shared state component (`StateView` or equivalent) and that `isLoading`, `isError` + `refetch`, and an empty check are all handled.
2. Loading: skeleton shaped like the content (no bare spinner). Data: all fields from the contract are shown and formatted via next-intl.
3. Empty: simulate by temporarily reasoning about an empty response (`[]`, `null` plan, zero readings). The screen must show one sentence and one action (for example "Generate your plan" -> `api.plan.generate`). Do not edit the mock files to test this; use a scratchpad copy or describe the expected rendering.
4. Error: `ApiRequestError` from `/lib/api.ts` must produce a message and a retry button; a 401 must redirect to `/welcome`.
5. If the dev server runs, take screenshots of the data state at 390 and 1440 (`npx playwright screenshot --viewport-size=390,844 ...`) and inspect them.
6. Report a table: state, implemented (yes/no), file:line, what to fix. Fix missing states if the screen belongs to the Frontend role and you are helping that role; otherwise list them for the owner.
