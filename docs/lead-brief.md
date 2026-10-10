# Lead brief (Role 5: Lead / Integration)

## What you own

`/types/contracts.ts` (the only editor), root config (`package.json`, `tsconfig.json`, `next.config.mjs`, `playwright.config.ts`, `vitest.config.ts`, eslint, prettier), every `CLAUDE.md`, `/docs`, `/.github`, `/.claude`, `/tests/e2e`, `scripts/generate-mocks.ts`, `scripts/setup.mjs`, Docker files, merges and deploys, the demo.

## What exists already

| Piece                         | Status                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toolchain                     | Real: Next 15, React 19, TS strict, Tailwind 3.4, Vitest, Playwright (projects `laptop` 1440x900 and `phone` 390x844), ESLint flat config, Prettier.                                                                                             |
| `types/contracts.ts`          | Real and locked at checkpoint 1, including API envelopes (D-003).                                                                                                                                                                                |
| `scripts/generate-mocks.ts`   | Real: regenerates `/mocks` and `/agents/fallbacks` from real math.                                                                                                                                                                               |
| `tests/e2e/demo-flow.spec.ts` | Real: six tests over the demo flow using the stable test ids; runs on mocks or memory backend.                                                                                                                                                   |
| `.claude/`                    | Skills (ui, agents, math), subagents (ui-reviewer, mock-builder, prompt-reviewer, eval-runner, safety-checker, contract-guard), commands (screen, agent, eval, replay, states, translate, checkpoint), settings with format and typecheck hooks. |
| CI                            | `.github/workflows/ci.yml`: typecheck, lint, vitest on PR and main; e2e job on mocks (continue-on-error for now).                                                                                                                                |
| Docker                        | `Dockerfile` (standalone) and `docker-compose.yml`.                                                                                                                                                                                              |
| `NUTRIPLAN_MASTER_SPEC.md`    | Being written by you. Keep it the source of truth; these docs summarize it.                                                                                                                                                                      |

## Day 1 tasks (in order)

1. Finish `NUTRIPLAN_MASTER_SPEC.md`; announce "contracts locked" (checkpoint 1).
2. Make sure every teammate ran `npm run setup` and sees the app on mocks; fix onboarding problems in README and `setup.mjs`.
3. Create the Vercel project with env vars (`DATA_BACKEND=supabase`, `AUTH_MODE=local` for the demo unless Supabase auth is ready, model keys, `AGENTS_FALLBACK=true`), deploy `main` on every merge.
4. Review PRs with the `contract-guard` subagent; merge in checkpoint order; keep `main` green.
5. Rehearse the demo on the live URL from `docs/demo-script.md`; record the backup video at checkpoint 5.
6. Keep `docs/decisions.md` current.

## Merge checkpoints (run `/checkpoint <n>`)

1. Contracts locked, app runs on mocks (typecheck, tests, lint, e2e on mocks).
2. Backend + Math: routes on memory backend return contract data; optimizer under 5 s; mocks regenerate clean.
3. Agents live: scripted and live negotiation pass evals; SSE works; safety-checker clean.
4. Frontend on real data: e2e on memory backend both projects; ui-reviewer on the three hero screens; translations complete.
5. Core freeze: e2e passes on the live URL; demo rehearsed under 6 minutes; fallbacks verified on the deployment.
6. Feature freeze: standalone build works; backup video linked; clean clone quick start verified; no open contract PRs.

## Definition of done (for the hackathon)

- Live URL passes `E2E_BASE_URL=<url> npm run test:e2e -- --project=laptop`.
- Demo script runs in under 6 minutes for both users with no console errors.
- Backups ready: `AGENTS_MODE=scripted` toggle on the deployment, cached replays, recorded video.
- README quick start works on a clean Windows and Mac clone.

## How to run and test

```
npm run doctor                     # versions and env summary
npm run typecheck && npm test && npm run lint
npm run test:e2e                   # memory backend
NEXT_PUBLIC_USE_MOCKS=true npm run test:e2e -- --project=laptop
npm run mocks && git status        # mock drift check
docker compose up --build          # optional container check
```

## Contract change procedure

1. Request arrives in the group chat with type, field, reason.
2. You edit `/types/contracts.ts` only (additive when possible, optional fields preferred).
3. `npm run typecheck` (schemas in `agents/schemas/index.ts` fail if they drift; ask Agents to update) and `npm run mocks`.
4. Commit `types: add <Type>.<field> (<reason>)`, post the commit hash, log it in `docs/decisions.md` if it changes behavior.

## Never do

- Merge a PR that fails typecheck or touches folders outside its role without an agreement in chat.
- Change contracts silently. Change `guidelines.json` numbers without a source.
- Deploy with secrets in the repo; keys only live in Vercel env and `.env.local`.
