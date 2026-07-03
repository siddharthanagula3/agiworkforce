# AGI Web — Volume 25 — Localization

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/web/AGENTS.md`; grounded in real repo paths `apps/web/app/i18n/index.ts`, `apps/web/app/i18n/locales/{en,es,hi}/*.json`, `apps/web/features/settings/components/LanguageSelector.tsx`, `apps/web/app/providers.tsx`, `apps/web/app/layout.tsx`, `apps/web/features/billing/components/Billing/types.ts`, `apps/web/features/chat/components/tokens/TokenAnalyticsDashboard.tsx`, `apps/web/features/pages/legal/BusinessLegalPage.tsx`, `apps/web/lib/validations/chat.ts`, `apps/web/proxy.ts`. Model facts (unused here beyond policy): `packages/types/src/models.json`.

## Overview & stance

AGI Web is the **cloud-only** surface: no Local, no BYOK — never add either affordance. Localization therefore has one trust context to serve (Managed Cloud, Clerk-authenticated, Neon-backed) and no local-runtime locale to reconcile. This volume defines how AGI Web presents language, writing direction, dates, time zones, numbers, currency, Unicode text, and plurals to a signed-in user.

Today the surface ships a **client-side** i18n layer: i18next + `react-i18next` + `i18next-browser-languagedetector` initialized in `apps/web/app/i18n/index.ts` and mounted via `I18nextProvider` in `apps/web/app/providers.tsx`. `SUPPORTED_LANGUAGES` is `en`, `es`, `hi`; the selected code persists to `localStorage` under `agiworkforce-language`. Most parity work below is 🟡 or 🔭 because formatting is still pinned to `'en-US'` and no server/URL locale negotiation exists. These are target/design requirements — writing them is not authorization to build (Mobile is the active serial surface).

## RTL

🔭 Planned. No right-to-left locale ships: `SUPPORTED_LANGUAGES` in `apps/web/app/i18n/index.ts` is LTR-only (en/es/hi) and there is no Arabic/Hebrew resource bundle, no `dir` wiring, and no logical-property audit. Requirements when built: (a) an RTL locale adds `dir="rtl"` to the document root and each `Intl`/component call resolves direction from the active language, not a constant; (b) CSS uses logical properties (`margin-inline`, `padding-inline`, `inset-inline`) so mirrored layout needs no per-component overrides; (c) mixed LTR content (code blocks, model IDs, URLs) stays LTR inside an RTL page via Unicode bidi isolation; (d) chat composer, artifact panes, and billing tables all pass an RTL snapshot test before an RTL locale is added to `SUPPORTED_LANGUAGES`.

## LTR

🟡 Partial. The app renders LTR by default, but direction is not driven by locale — `apps/web/app/layout.tsx` hardcodes `<html lang="en" suppressHydrationWarning>` with no `dir` attribute, so a client-side switch to `es`/`hi` does not update `lang`/`dir` server-side (hydration mismatch risk). Requirement: root `lang` and `dir` must reflect the resolved language (default `dir="ltr"`), set once at render so first paint is correct; the LanguageSelector (`apps/web/features/settings/components/LanguageSelector.tsx`) must update both. Until server-side locale exists, document the client-only limitation rather than claim SSR-correct locale.

## Dates

🟡 Partial. Date rendering uses `Intl.DateTimeFormat` / `toLocaleDateString`, which is correct API choice, but is pinned to `'en-US'` (e.g. `apps/web/features/pages/legal/BusinessLegalPage.tsx` `new Intl.DateTimeFormat('en-US', …)`; `apps/web/features/settings/sections/UsageSection.tsx`; connector cards). Requirement: replace the literal `'en-US'` with the resolved i18n language so dates follow the user's chosen locale; centralize in one `formatDate`/`formatDateTime` helper so month/day order, separators, and era follow CLDR, not hardcoded strings. Never build date strings by string concatenation.

## Time Zones

🟡 Partial. Timestamps arrive as ISO/epoch from Neon and render through the browser's default zone (no explicit `timeZone` option in the `Intl` calls above), so a user sees their device zone — acceptable as a floor but unaudited. 🔭 Planned: a user time-zone preference (stored in account settings, synced only for Managed-Cloud account state) that overrides the browser zone, plus explicit `timeZone` on server-rendered timestamps so SSR and client agree. Requirement: all displayed times must state or clearly imply their zone; never render a bare wall-clock time whose zone is ambiguous across SSR/CSR.

## Numbers

🟡 Partial. Number formatting mixes `Intl.NumberFormat` and `Number.toLocaleString`, mostly pinned to `'en-US'` (e.g. `apps/web/features/chat/components/tokens/TokenAnalyticsDashboard.tsx` `new Intl.NumberFormat('en-US')`; token/char counters in `ChatComposer`, `MessageBubble`, `BudgetTrackerDisplay`). Requirement: drive locale from the resolved language so grouping separators and decimal marks follow CLDR (e.g. Indian digit grouping `1,00,000` for `hi`); keep `tabular-nums` for counters so digit width stays stable. Do not hand-format thousands separators.

## Currency — INR only where canon fixes it (Basic ₹399)

🟡 Partial. `apps/web/features/billing/components/Billing/types.ts` `formatCurrency(amount, currency)` correctly uses `Intl.NumberFormat` with `style:'currency'`, validates the code against `VALID_CURRENCY_RE`, and defaults to `USD`; USD subscription math flows from `getPlanPriceUsd` (`@agiworkforce/types`). Gaps: the formatter's locale is still `'en-US'`, and plan pricing UI encodes older tiers — `apps/web/features/billing/hooks/use-billing-queries.ts` still references `getPlanPriceUsd('hobby')` and a `team` plan, which the canon removed. That reconciliation (`packages/types/src/billing-catalog.ts` + pricing UIs) is a separate tracked task; flag it 🟡 here.

Canon tier model to display (no other tiers): **Free $0**; **Basic $8 / ₹399**; **Pro $20**; **Max $100 and $200** (two Max tiers); **Enterprise custom**. Local and BYOK are free access modes, not plans, and do not apply to Web. **INR is fixed only for Basic (₹399)** — Pro/Max INR are TBD; do **not** invent INR numbers. No credit top-ups. Requirement: currency selection is derived from account/geo billing config, never spoofable client input; INR display for Basic renders `₹399` via `Intl.NumberFormat('…','INR')`, and Pro/Max show USD until INR is set.

## Unicode

🟡 Partial. UTF-8 flows end to end: locale bundles carry Devanagari (`हिन्दी`) and emoji flags (`apps/web/app/i18n/index.ts`), Neon stores UTF-8, and i18next runs with `interpolation.escapeValue:false` (React escapes output). Gap: length limits count UTF-16 code units, not graphemes — `apps/web/lib/validations/chat.ts` uses `MAX_MESSAGE_LENGTH` with `.length`, which mis-counts astral/combining sequences. Requirements: (a) message/title truncation must be grapheme-aware (no splitting a combining sequence or emoji ZWJ cluster); (b) apply NFC normalization on stored search/identity text; (c) never rely on visible glyph width for validation. Rendering must not mojibake mixed scripts.

## Pluralization

🟡 Partial. The i18next runtime supports CLDR plural categories out of the box through the mounted `I18nextProvider`, but adoption is minimal — the current `en` bundles show no `_one`/`_other` plural keys, so counts are formatted inline. Requirement: user-facing counts ("N tokens", "N messages", "N results") must use i18next plural keys per language (English one/other; Hindi one/other; add categories as RTL/other locales arrive), never `count === 1 ? 'x' : 'xs'` string logic. Plural resolution must use the resolved language, and translated bundles must supply every plural category the language needs.

## Repository map

- `apps/web/app/i18n/index.ts` — i18next init, `SUPPORTED_LANGUAGES`, detection/persistence.
- `apps/web/app/i18n/locales/{en,es,hi}/*.json` — locale bundles (`hi` partial: `common`, `errors`, `settings` only).
- `apps/web/app/providers.tsx` — `I18nextProvider` mount.
- `apps/web/features/settings/components/LanguageSelector.tsx` — language switcher.
- `apps/web/app/layout.tsx` — root `<html lang>` (no `dir`).
- `apps/web/features/billing/components/Billing/types.ts` — `formatCurrency`.
- `apps/web/features/chat/components/tokens/TokenAnalyticsDashboard.tsx`, `apps/web/features/pages/legal/BusinessLegalPage.tsx` — `Intl.NumberFormat`/`DateTimeFormat` usage.
- `apps/web/lib/validations/chat.ts` — text length limits.
- `apps/web/proxy.ts` — request pipeline (no locale routing today).

## Competitor notes

Claude, ChatGPT, and Codex ship server-negotiated locales, RTL, and localized billing. AGI Web's deliberate divergence: locale is an **account-scoped, cloud-only** concern here — there is no Local/BYOK locale to merge, and translated model-catalog copy must never leak or hardcode a model ID (IDs come only from `packages/types/src/models.json`; provider/plan gating stays server-verified). Per-surface trust holds: Web localization never assumes BYOK or on-device state that only Desktop/CLI/VS Code carry. INR-first pricing for Basic (₹399) reflects the India entry-tier strategy competitors do not match at that price.

## Acceptance / Definition of Done

Production-ready when: root `lang`/`dir` reflect the resolved language; date/number/currency formatting is locale-driven (no residual `'en-US'` literals in shipped paths); currency shows canon tiers only with INR fixed for Basic; truncation is grapheme-aware; and counts use plural keys. No fabricated INR numbers, no removed tiers, no hardcoded model IDs.

- [ ] Build: `pnpm --filter @agiworkforce/web typecheck` and `build` pass; switching language updates copy, `lang`/`dir`, dates, numbers, and currency without hydration warnings.
- [ ] Trust: no Local/BYOK affordance appears on Web; currency/plan derive from server billing state, not client input; catalog copy cites no hardcoded model IDs.
- [ ] Security: `escapeValue:false` stays paired with React escaping (no `dangerouslySetInnerHTML` for translated strings); currency code validated against `VALID_CURRENCY_RE` before `Intl` formatting.

## Anti-patterns

- Adding Local or BYOK locale surfaces to Web (trust-boundary violation).
- Claiming RTL, server-negotiated locale, or full `hi` coverage as shipped — they are 🔭/🟡; cite the gap.
- Leaving `'en-US'` pinned in date/number/currency formatters while claiming locale support.
- Inventing INR for Pro/Max, reintroducing Plus/`pro_plus`/Hobby/Team tiers, or adding credit top-ups.
- Hardcoding a model ID in a translated catalog string instead of reading `packages/types/src/models.json`.
- Referencing Supabase (fully migrated away) or renaming `proxy.ts` to `middleware.ts`.
- Byte/code-unit truncation that splits emoji or combining sequences; hand-rolled plural or thousands-separator logic instead of `Intl`/i18next.
