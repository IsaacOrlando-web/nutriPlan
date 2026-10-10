# Contributing

Five people, three days, one `main`. Keep it green.

## Branches

`<role>/<feature>` in kebab case: `frontend/agent-room`, `agents/chef-candidates`, `backend/readings-route`, `math/shadow-prices`, `lead/ci`. Branch from `main`, rebase on `main` before opening the PR (`git fetch origin && git rebase origin/main`). Never commit to `main` directly; the Lead merges.

## Commits

Short imperative subject with a scope: `plan: budget slider commits on release`, `agents: chef maps ingredients via searchFoods`, `math: shadow price text names a dish`, `types: add MonitorResult.tdee`. One logical change per commit. Commit before any large refactor so Claude Code sessions can be rolled back.

## Pull requests

1. Fill `.github/pull_request_template.md` (role, folders touched, contract changes requested, checklist).
2. Run locally: `npm run typecheck && npm run lint && npm test`. UI PRs attach screenshots at 390 and 1440. Agent PRs run `npm run evals`.
3. Run the `contract-guard` subagent (or `/checkpoint` for the current checkpoint). A PR that touches another role's folder needs a one line agreement from that owner in the chat, quoted in the PR.
4. Keep PRs small (one screen, one agent, one route group). Open them early as drafts so the Lead can see direction.
5. CI must be green (typecheck, lint, vitest). The e2e job is advisory until checkpoint 4, then required.

## Merge checkpoints

The Lead merges in this order and announces each in chat. `/checkpoint <n>` lists the exact commands.

1. Contracts locked, app runs on mocks.
2. Backend + Math.
3. Agents live.
4. Frontend on real data.
5. Core freeze: demo passes `test:e2e` on the live URL. After this only bug fixes and copy.
6. Feature freeze: nothing but demo blockers.

## Working with Claude Code

- Start every session with the role brief (`docs/<role>-brief.md`) and the matching skill; use `/screen`, `/agent`, `/states`, `/replay`, `/eval`, `/checkpoint`.
- Plan mode for anything bigger than a small fix; one feature per session; `/clear` between features.
- Hooks format every written file with Prettier and run `npm run typecheck` when Claude stops. Fix typecheck errors before pushing.
- Claude cannot read or write `.env*` files; set keys yourself.
- Ask before adding a dependency; the human runs `npm install`.

## Code style

Prettier (110 columns, double quotes, trailing commas), ESLint `next/core-web-vitals` + `next/typescript`. TypeScript strict, no `any`, no `@ts-ignore`. Types from `/types/contracts.ts`. Comments explain why, not what. Tests next to the code (`__tests__` or `*.test.ts`).

## Line endings

`.gitattributes` normalizes to LF. On Windows run `git config core.autocrlf false` once in the repo so Prettier and git agree.
