## What

<!-- One or two sentences. Link the brief section or spec section if useful. -->

## Role

<!-- frontend | agents | backend | math | lead -->

## Folders touched

<!-- List top level folders. Anything outside your role's folders needs the owner's ok quoted here. -->

## Contract changes requested

<!-- None, or: Type.field: type, because ... (the Lead applies it in /types/contracts.ts) -->

## Checklist

- [ ] `npm run typecheck` clean
- [ ] `npm test` green (and `npm run evals` for agent changes)
- [ ] `npm run lint` clean
- [ ] UI: screenshots at 390 and 1440 attached, four states checked, en and es keys added
- [ ] No secrets, no `.env*` files, no health data in logs
- [ ] `contract-guard` subagent passed (no files outside my folders, shapes match `/types/contracts.ts`)
- [ ] App still runs on mocks and on the memory backend

## Screenshots / output

<!-- UI: 390 and 1440. Agents: /replay output or eval summary. Math: solve times. -->
