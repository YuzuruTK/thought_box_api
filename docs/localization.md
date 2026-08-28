# Localization (Issue #21)

How language selection, locale formatting, and AI language propagation work in Thought Box.

## UI language selection (client-side only)

Supported languages: `en` (default/fallback) and `pt-BR`.

Resolution order at startup (`client/src/i18n/index.ts`):

1. Saved preference — `localStorage["thoughtbox_locale"]` (invalid values are ignored).
2. Browser language — first entry of `navigator.languages` that maps to a supported language (`pt*` → `pt-BR`, `en*` → `en`).
3. English fallback.

Runtime switching lives in `client/src/contexts/LanguageContext.tsx` (mirrors ThemeContext): the Settings selector calls `setLanguage`, which persists the choice best-effort, calls `i18next.changeLanguage()` (all `t()` consumers re-render instantly, no reload), and keeps `<html lang>` in sync.

There is **no server-side i18n**: backend error messages are displayed exactly as received; only client-owned strings and status-code fallbacks (`client/src/lib/errors.ts`) are translated.

## Locale-aware formatting (client-side only)

- `client/src/lib/dates.ts` — `formatShortDate`, `formatTimestamp`, `formatTime` use `Intl.DateTimeFormat` with the locale derived from the active i18next language.
- `client/src/lib/numbers.ts` — `formatNumber` uses `Intl.NumberFormat` the same way; used for thought counts and cooldown minutes.

There is no duplicated locale state: formatting always follows the active UI language.

## AI output language

Generated summaries and documents follow the language of the source thoughts, **not** the UI language. This is intentional (deliberate scope decision): no database language columns and no language metadata are stored — the language is re-inferred on every synthesis from the thought contents.

Implementation (`src/services/ai/prompts.ts`):

1. `detectPredominantLanguage(thoughts)` scores the concatenated thoughts against word lists for `pt-BR`, `en`, and `es` and returns the predominant language (ties/no signal → highest score; deterministic).
2. The synthesis prompt embeds a strict **LANGUAGE REQUIREMENT** section naming the detected language as authoritative — the model must not infer a different language from the box name, model defaults, or a previously generated document.
3. Mixed-language boxes resolve to the language of the majority of meaningful content.

Test coverage: `src/services/ai/prompts.test.ts` (detection per language, mixed-language predominance, and prompt-level English/Portuguese propagation).

## Future work

- Server-side i18n (translated backend error messages) — separate issue.
- Additional locales (e.g. Spanish) — add a locale JSON bundle and extend the AI word lists.
