# AGI Desktop — Volume 31 — Localization

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and real repo paths: `apps/desktop/src/i18n/index.ts`, `apps/desktop/src/providers/I18nProvider.tsx`, `apps/desktop/src/i18n/locales/*`, `apps/desktop/src/App.tsx`, `apps/desktop/src/features/settings/{GeneralSettings,SettingsPanel,DesktopCloudSettingsModal,FontSelector}.tsx`, `apps/desktop/src/stores/settingsStore.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume covers how AGI Desktop presents itself in different languages, scripts, writing directions, and regional formats. Localization on Desktop is a UI-layer concern that must behave identically across all three trust modes — **Local**, **BYOK**, and **Managed Cloud** — because the strings, layout direction, dates, and number/currency formats are rendered by the Tauri/React shell regardless of where inference runs. Model-generated content is **not** translated by the app: chat output is whatever the selected provider returns, and its language must never be silently rewritten. Locale is a user preference stored on-device (`settingsStore` `windowPreferences.language`); it is not routed across trust boundaries and does not itself trigger any Local→BYOK or Local→Cloud fork. Currency and plan localization apply only to the Managed-Cloud billing surface (Local and BYOK are free access modes, not plans). The pricing shown anywhere must follow the canon ladder — Free $0; Basic $8 / ₹399; Pro $20; Max $100 and $200; Enterprise custom — with Pro/Max INR still TBD.

## RTL

Right-to-left rendering is wired but minimal. `apps/desktop/src/App.tsx` sets `document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr'` on language change, so Arabic (`ar`) flips document direction. **🟡 Partial** (`apps/desktop/src/App.tsx`): the check is hardcoded to `ar` only, so any future RTL locale (Hebrew, Farsi, Urdu) will not flip; component styles are not audited for CSS logical properties, so mirrored padding/margins, icon direction, and chat-bubble alignment are unverified. Target: derive direction from a locale→direction map, apply logical properties (`margin-inline`, `padding-inline`, `text-align: start`) shell-wide, and mirror directional glyphs. **🔭 Planned**: automated RTL snapshot tests per surface panel.

## LTR

LTR is the default and covers 11 of the 12 shipped locales. **✅ Built** (`apps/desktop/src/App.tsx`, `apps/desktop/src/i18n/index.ts`): `en, es, zh, ja, ko, fr, de, pt, it, ru, hi` render LTR with `dir="ltr"`. Requirement: LTR must remain the safe fallback whenever a locale's direction is unknown, and mixed-direction runs (LTR UI containing an RTL model reply, or vice-versa) must isolate the bidi run so surrounding chrome is not reordered. **🔭 Planned**: Unicode bidi isolation wrappers around user/model message bodies.

## Time Zones

Desktop currently renders timestamps in the host OS time zone via the platform `Date` object with no explicit IANA zone. **🟡 Partial** (`apps/desktop/src/features/settings/UsageDashboard.tsx`, `apps/desktop/src/features/research/ResearchHistory.tsx`, `apps/desktop/src/features/experimental/MessagingPanel.tsx`): `toLocaleTimeString`/`toLocaleDateString` are called without a `timeZone` option, so display follows the machine clock — correct for a local host but not pinned. Managed-Cloud rows synced from Neon (chat/memory/projects delta-sync) carry UTC timestamps; the app must render them in the user's zone and never assume the sync origin's zone. **🔭 Planned**: a shared time-zone-aware formatter and an optional explicit-zone setting for users who work across zones.

## Dates

Date formatting is functional but inconsistent, which is the primary localization debt. **🟡 Partial**: some call sites pass `undefined` (system locale) e.g. `apps/desktop/src/features/settings/AccountSettings.tsx`; some pass `[]` e.g. `apps/desktop/src/features/research/DeepResearchPage.tsx`; others hardcode `'en-US'` indirectly. The active app language (`i18n.language`) is **not** threaded into these formatters, so a user in `de` or `ja` can see English-ordered dates. Requirement: route all date/time formatting through one locale-aware helper seeded from `i18n.language` so ordering (DMY/MDY/YMD), month names, and era are correct per locale. **🔭 Planned**: lint rule banning bare `toLocaleDateString()` outside the shared helper.

## Numbers

Numeric formatting uses `Number.prototype.toLocaleString()` and `Intl.NumberFormat`/`Intl.RelativeTimeFormat`. **🟡 Partial** (`apps/desktop/src/features/settings/UsageDashboard.tsx`, `apps/desktop/src/features/settings/CostEstimator.tsx`, `apps/desktop/src/features/quick-query/index.tsx`): token counts and relative times format via `Intl`, but most `toLocaleString()` calls omit an explicit locale so grouping/decimal separators follow the host, not the chosen app language. Requirement: pass the resolved app locale to every numeric formatter so thousands separators and decimal marks match the UI language.

## Currency

Currency is USD-only today and diverges from the canon ladder. **🟡 Partial** (`apps/desktop/src/features/roi-dashboard/components/{RealtimeROIDashboard,ComparisonSection,RecentActivityFeed}.tsx` hardcode `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`; `apps/desktop/src/stores/authOrchestrator.ts` uses Stripe `currency: 'usd'`). Requirement: localized currency for the billing surface must present the canon tiers — Free $0; Basic $8 / ₹399; Pro $20; Max $100 and $200; Enterprise custom — with **no invented INR** for Pro/Max and **no credit top-ups**. The known gap: `packages/contracts/types/src/billing-catalog.ts` and pricing UIs still encode retired tiers; reconciliation is a separately tracked task. **🔭 Planned**: locale/region → currency mapping (₹ for India, $ elsewhere) driven by the account region, not the UI language, so display currency never contradicts what Stripe charges.

## Unicode

The app is UTF-8 end to end. **✅ Built** (`apps/desktop/src/i18n/index.ts`): locale JSON bundles are UTF-8 with native scripts (`中文`, `日本語`, `العربية`, `हिन्दी`); i18next runs with `interpolation.escapeValue: false` because React escapes rendered output, preventing injection while preserving multibyte text. Requirement: input fields, filenames, and clipboard paths must preserve grapheme clusters and combining marks without truncation, and search/compare over user text should use Unicode-aware normalization. **🔭 Planned**: NFC normalization on stored chat titles and search keys so canonically-equivalent strings match.

## Fonts

Font selection is user-facing but not script-complete. **✅ Built** (`apps/desktop/src/features/settings/FontSelector.tsx`): a font picker offers System, Inter, and OpenDyslexic, applied live via the `--chat-font-family` CSS variable. **🟡 Partial**: no CJK- or Arabic-specific webfont is bundled — rendering of `zh/ja/ko/ar/hi` relies on the host OS font stack (`-apple-system`, `Segoe UI`, `Roboto`, `system-ui`), so glyph coverage varies by machine. Requirement: guarantee fallback coverage for every shipped locale's script; verify the OpenDyslexic path degrades gracefully for non-Latin text. **🔭 Planned**: bundled Noto-class fallback fonts for CJK/Arabic/Devanagari.

## Translation

UI translation is real and reasonably broad; content translation is out of scope. **✅ Built** (`apps/desktop/src/i18n/index.ts`, `apps/desktop/src/providers/I18nProvider.tsx`, `apps/desktop/src/i18n/locales/*`): 12 languages × 8 namespaces (`common, errors, auth, chat, settings, pricing, models, v3`) via react-i18next with browser language detection persisted to `localStorage` (`agiworkforce-language`) and mirrored in `settingsStore`; the selector lives in `GeneralSettings.tsx`, `SettingsPanel.tsx`, and `DesktopCloudSettingsModal.tsx`. **🟡 Partial**: `missingKeyHandler` is a no-op, so missing keys fall back silently to English with no telemetry; per-namespace coverage across the 12 locales is unverified. Model IDs and provider names in the `models` namespace must come from `packages/contracts/types/src/models.json` and never be translated or invented. **🔭 Planned**: coverage CI, a pseudo-locale for expansion testing, and explicit fallback logging.

## Repository map

- `apps/desktop/src/i18n/index.ts` — i18next init, `SUPPORTED_LANGUAGES`, resource map.
- `apps/desktop/src/i18n/locales/{en,es,zh,ja,ko,fr,de,pt,it,ru,ar,hi}/*.json` — per-language namespace bundles.
- `apps/desktop/src/providers/I18nProvider.tsx` — context bridging i18next and `settingsStore`.
- `apps/desktop/src/App.tsx` — document `dir` (RTL/LTR) application.
- `apps/desktop/src/features/settings/{GeneralSettings,SettingsPanel,DesktopCloudSettingsModal,FontSelector}.tsx` — language + font pickers.
- `apps/desktop/src/stores/settingsStore.ts` — `language` persistence + migrations.
- `apps/desktop/src/features/{settings,research,roi-dashboard,quick-query}/…` — date/number/currency call sites.

## Competitor notes

Claude, ChatGPT, and Codex ship broad UI translations and follow OS locale for dates/numbers; ChatGPT localizes billing currency by region. AGI's deliberate divergence: localization is **local-first and trust-mode-neutral** — the locale preference stays on-device and is never used to route Local/BYOK data to Cloud. AGI is **multi-provider**, so model output language is left to the chosen provider and never machine-rewritten, and model IDs are read from `packages/contracts/types/src/models.json` rather than a single vendor catalog. Currency localization is tied to the Managed-Cloud account region, honoring the canon tiers (Basic ₹399 for India) instead of a one-currency store.

## Acceptance / Definition of Done

Production-ready when: every shipped locale renders correct direction and full glyph coverage; all date/number/currency output derives from the active app locale via a shared helper; RTL is data-driven (not hardcoded to `ar`); billing display matches the canon ladder and the account's Stripe currency; and missing translation keys are logged, not silently dropped.

- [ ] Build: shared locale-aware date/number/currency helper adopted; bare `toLocaleDateString()` call sites removed; RTL derived from a locale→direction map.
- [ ] Trust: locale preference stays on-device; no locale-driven cross-trust routing; Cloud-synced timestamps rendered in user zone without leaking origin zone.
- [ ] Security: UTF-8/Unicode inputs preserved and normalized; no unescaped interpolation regressions; currency display never contradicts the amount Stripe charges.

## Anti-patterns

- Hardcoding `dir="rtl"` to a single locale or omitting logical properties so RTL breaks silently.
- Formatting dates/numbers with the host locale while the UI is in another language (the current inconsistency).
- Inventing INR prices for Pro/Max, showing removed tiers ("Plus", `pro_plus`, "Hobby"), or adding credit top-ups.
- Translating or hardcoding model IDs instead of reading `packages/contracts/types/src/models.json`.
- Machine-translating model output or routing locale metadata across the Local/BYOK/Cloud boundary.
- Referencing Supabase or renaming Next.js `proxy.ts` — neither belongs in this surface.
- Claiming full multi-script font or 100% translation coverage without a cited path; mark unverified coverage 🟡/🔭.
