# NutriPlan AI design pass: shared brief for screen agents

Goal: a hackathon-winning, modern product. Calm, confident, uncluttered. Every screen answers one question
first, then offers one action. No generic "card grid of boxes", no fluffy copy, no explanatory paragraphs
where a label will do.

## Principles

1. **One hero per screen.** The most important number or object is big and alone. Everything else is
   secondary and visually quieter (smaller, muted ink, less contrast).
2. **Fewer borders, more space.** Prefer whitespace and subtle background shifts (surface / surface-sunken)
   over bordered cards. Use `ring-1 ring-border` only for actionable containers. Never nest a card in a card.
3. **Copy is terse.** Headlines up to 6 words. Subtitles one short sentence or none. Delete any sentence
   that explains what the UI already shows. Never start with "Here is", "This is", "Everything".
4. **Numbers come from the API**, formatted with `fmtUsd` / `fmtNumber`. Tabular numerals on anything numeric.
5. **Hierarchy with type, not boxes.** Type scale: page title `text-2xl font-semibold tracking-tight`
   (phone) / `text-3xl` (laptop); section label `text-xs font-semibold uppercase tracking-wide text-ink-subtle`;
   body `text-sm`; hero number `text-4xl/5xl font-bold tabular-nums`.
6. **Color is meaning.** Brand green for the primary action only. Agent colors only for agents. Status colors
   only for status. Everything else is ink on surface.
7. **Motion is quiet.** Framer Motion for entrance (fade + 8px rise, 200ms, staggered 40ms) and for the
   Agent Room. No bouncing, no gradients that move.
8. **Phone first, laptop composed.** 390px: single column, 16px gutters, bottom tab bar, sticky primary action
   when a screen has one. 1440px: max 1120px content, two columns where it helps (hero + detail), never three
   equal cards in a row unless they are the same kind of thing.
9. **States.** Loading = skeleton shaped like the data. Empty = one line + one button. Error = one line + Retry.
10. **Accessibility.** Real buttons and links, focus rings (`focus-visible:ring-2 ring-brand`), 44px tap targets,
    `aria-label` on icon-only buttons, contrast at least 4.5:1 for text.

## Rules you must keep

- Tokens only (tailwind.config.ts). No hex, no arbitrary colors. Icons from lucide-react only.
- All `data-testid`s in app/CLAUDE.md stay exactly as they are. Add new ones in the same style.
- Data only via `/lib/api.ts` and hooks in `/lib/hooks`. Types only from `/types/contracts.ts`.
- Do not edit `components/ui/*`, `tailwind.config.ts`, `app/globals.css`, `components/shell/AppShell.tsx`
  (the Lead owns those in this pass). If you need a primitive that does not exist, build it locally in your
  screen's components folder.
- Do not edit screens outside your assignment.
- `npm run typecheck && npm run lint` clean before you report. Verify with screenshots at 390 and 1440
  against the production server at http://localhost:3400 (login: POST /api/auth/login {"identifier":"alex"}
  sets the `np_uid` cookie). Use `node .data/shot-one.mjs <path> <name>` to capture both widths.

## Vocabulary

Agents: Doctor (safety), Chef (taste), Budget (money), Monitor (progress), Orchestrator (referee).
Plan = the 7 day meal plan. Week = the plan week. Rules = Doctor's hard constraints. Targets = daily numbers.
