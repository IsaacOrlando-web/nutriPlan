---
description: Sync i18n/en.json and i18n/es.json, add missing Spanish strings, and find hardcoded text in components.
argument-hint: [namespace, e.g. dashboard]
---

Keep NutriPlan AI bilingual. Scope: `$ARGUMENTS` (all namespaces when empty).

1. Diff the key sets of `i18n/en.json` and `i18n/es.json` (write a small Node script in the scratchpad that flattens both files to dotted keys and prints keys missing on either side, plus values identical in both files, which usually means an untranslated string).
2. Add the missing Spanish translations. Tone: friendly, neutral Latin American Spanish, "tu" form, no medical jargon beyond what English uses. Keep placeholders (`{count}`, `{name}`) and ICU plural forms intact. Units stay metric (kg, mg/dL, mmHg). Agent names stay English in both (Doctor, Chef, Budget, Monitor).
3. Grep `app` and `components` for hardcoded user visible strings in JSX (`>Some text<`, `placeholder="..."`, `aria-label="..."`, `title="..."`) and replace them with `useTranslations` keys in the correct namespace.
4. Confirm `i18n/request.ts` loads both locales and that the `lang-switch` on Profile persists the choice (cookie or profile `language`).
5. Run `npm run typecheck && npm run lint`. Report keys added, strings replaced, and anything that needs a native speaker's eye.
