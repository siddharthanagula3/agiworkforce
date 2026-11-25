---
id: "F011-10"
type: "feature"
title: "Languages and translated messages"
aliases: ["Pluralization", "Plural rules", "Translated error messages", "Display Language", "App language", "i18n", "Localized errors", "S11.24", "S11.25"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.24", "S11.25"]
depends_on: ["SYS-shared-ui-and-design", "SYS-api-and-contracts", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "file:packages/ui/ui/src/lib/translate.ts", "file:packages/ui/i18n/src/languages.ts", "file:scripts/check-i18n-parity.mjs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-10 Languages and translated messages

Counted phrases pick the right plural form through shared plural-aware helpers, and common error messages go through the translation catalog. Only English and Spanish are selectable on Web and Desktop; Mobile language choice is switched off; VS Code uses all twelve catalogs; Chrome ships English only; the CLI has no translation.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.24](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1124), [S11.25](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1125).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Looks up counted phrases by language plural category (one, few, many and so on) and shows error messages from the language catalog instead of fixed English text.

**Why it exists.** An English 's' suffix is wrong in many languages, and error text in the wrong language is hard to act on (brief S11.24, S11.25; decision D-2026-09-15-03 on complete catalogs only).

**Who uses it.** Non-English users and the translators who maintain catalogs.

**Problems it solves**

- '1 files' or Arabic dual and few forms read wrong.
- Error toasts stuck in English.
- Half-translated screens (decision hides incomplete languages).

**Use cases**

- A Spanish user reads counts from the catalog.
- A user sees 'You appear to be offline' in their language.
- A VS Code user sees chat errors in the editor's display language.
- A translator adds plural keys for a new language and a guard checks them.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): Settings, General, 'Display Language' (GeneralSection.tsx:524-537); hint says 'Translates menus, navigation and pricing. Settings labels and conversations are unaffected.' (packages/ui/i18n/locales/en/settings.json:65).
- Mobile: Settings, General, 'App language' (hidden while the flag is off) (apps/mobile/src/features/settings/general/AppLanguageScreen.tsx:22, :58).
- VS Code: follows the editor display language (apps/extension-vscode/src/l10n/index.ts:24-31).
- Chrome: follows the browser UI language through chrome.i18n (apps/extension/src/i18n.ts:9-12).
- CLI: no language setting.

**Before you start**

- A selectable language: English or Spanish on Web (packages/ui/i18n/src/languages.ts:25-34).

**Screens and controls**

- Select 'Display language' with flag and native name (LanguageSelector.tsx:19-37).
- Counts such as '1 point' and '3 points' in chart headers and tool summaries (ChartArtifact.tsx:147-155; packages/ui/unified-chat/src/lib/compactToolSummary.ts:33).

**Journey**

1. Open Settings, General.
2. Choose Display Language.
3. Read menus and counted phrases in the new language.
4. Trigger an error such as going offline and read the translated message.

**What the person sees and gets**

- Translated network and HTTP error text such as 'You appear to be offline. Check your connection.' (packages/ui/ui/src/lib/network-error.ts:6-13).
- Wait times with plural forms: seconds, minutes, hours (apps/web/features/chat/lib/turn-error-notice.ts:207-219).
- Desktop-native error cards use catalog title, message and suggestion keys (apps/desktop/src/constants/errorMessages.ts:45-55).

**Settings**

- Display language (Web), App language (Mobile, off), editor language (VS Code), browser language (Chrome).
- Response language in Personalization is a separate setting (PersonalizationSection.tsx:430-441).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web, Desktop-hosted web and shared UI: translateUiPlural passes count and English fallbacks to i18next, which picks the plural key by language; without i18next it falls back to English one/other (packages/ui/ui/src/lib/translate.ts:32-57).
- Mobile has a matching translatePlural helper used in 21 files (apps/mobile/src/i18n/plural.ts:16-36).
- VS Code picks the category with Intl.PluralRules and formats the count with the locale (apps/extension-vscode/src/l10n/index.ts:57-65).
- Chrome chooses keys by Intl.PluralRules with an _other fallback (apps/extension/src/i18n.ts:13-23).
- Catalog guard: check:i18n-parity compares each locale to English and understands plural suffixes per language (scripts/check-i18n-parity.mjs:1-30; package.json script check:i18n-parity).
- Arabic catalog carries zero, one, two, few, many and other forms (packages/ui/i18n/locales/ar/chat.json:465-476).
- Web error text: network, HTTP status, turn wait and cause messages go through translateUi (packages/ui/ui/src/lib/network-error.ts:6-47; apps/web/features/chat/lib/turn-error-notice.ts:185-250).
- VS Code chat errors use t and tPlural (apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:340-380).

**Incomplete**

- Only English and Spanish are selectable on Web, so users cannot choose any other catalog (packages/ui/i18n/src/languages.ts:25-34).
- Many strings carry English defaults in code and reach users only if a catalog key exists; billing helper words '/month', '/year', 'plus tax' are English literals (apps/web/features/billing/lib/billing-format.ts:32-48).
- Mobile numbers and counts: some counts use toLocaleString with a hand-picked singular and plural word instead of plural rules (apps/mobile/src/features/settings/cloud-usage/index.tsx:205).
- Server-sent error messages shown as-is: whether they are localized: unknown.
- Desktop-native error table lives in apps/desktop/src, the retained Tauri code, which the public Desktop window does not show (AGENTS.md section 5).

**Present but disconnected or switched off**

- Mobile language choice is off (apps/mobile/lib/v1FeatureFlags.ts:36); getDeviceLanguage then always returns English (apps/mobile/src/i18n/index.ts:29-35).
- Ten non-selectable catalogs exist in packages/ui/i18n/locales (ar, de, fr, hi, it, ja, ko, pt, ru, zh) but are hidden on Web and Mobile by policy.

**Not available**

- Mobile error messages are English literals (apps/mobile/src/features/voice/services/liveVoiceAvailability.ts:5-16).
- CLI has no translation layer (no i18n dependency found in apps/cli/Cargo.toml or src/lib.rs).
- Chrome ships only an English catalog folder (apps/extension/_locales/en).

## 4. Required behaviour

**Established requirements**

- Counted phrases follow each language's plural rules rather than an English 's' suffix. Done on web, desktop, mobile, VS Code and Chrome. (source: brief S11.24)
- Error messages appear in the user's chosen language. Done on web, desktop, VS Code, Chrome; missing on mobile and CLI. (source: brief S11.25)
- Offer English plus only complete and reviewed languages; hide incomplete ones; every client follows the account language where supported with English as fallback; the catalog is shared, not hardcoded per client. (source: doc: docs/decisions/2026-09-15-founder-decisions.md (D-2026-09-15-03))

**Acceptance criteria**

1. With Spanish selected, a count of 1 and a count of 2 show different catalog forms.
2. translateUiPlural with i18next not initialised returns English one for 1 and other for any other count.
3. Every locale passes check:i18n-parity including plural categories required by its language.
4. Going offline shows the network-offline message in the selected language.
5. A VS Code window set to a supported display language shows chat errors in that language.
6. Switching language does not change conversation content (hint text says so).
7. On Mobile, errors are in English until a catalog path exists (documents the gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop users get the Web behaviour through the hosted web app [inferred].
- Chrome translation depends on adding _locales folders [inferred from apps/extension/src/i18n.ts].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Route Mobile error strings through the catalog and shared plural helper.
- [proposed] Replace manual singular/plural words in Mobile usage text with translatePlural.
- [proposed] Add a plural-aware path for the billing helper words.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | translateUi / translateUiPlural | `packages/ui/ui/src/lib/translate.ts` | Shared translate helpers with English fallbacks |
| service | networkErrorMessage / httpStatusMessage | `packages/ui/ui/src/lib/network-error.ts` | Translated network and HTTP errors |
| service | turn error notice helpers | `apps/web/features/chat/lib/turn-error-notice.ts` | Translated turn failures, wait times, references |
| config | locale catalogs | `packages/ui/i18n/locales` | JSON catalogs for twelve languages across eight namespaces plus vscode |
| config | language table | `packages/ui/i18n/src/languages.ts` | Supported and selectable languages |
| service | web i18n init | `apps/web/app/i18n/index.ts` | i18next setup, detection, lazy catalogs |
| component | LanguageSelector | `apps/web/features/settings/components/LanguageSelector.tsx` | Display language select |
| service | mobile translatePlural | `apps/mobile/src/i18n/plural.ts` | Mobile plural helper |
| service | mobile i18n | `apps/mobile/src/i18n/index.ts` | Language preference, device language, direction |
| config | FEATURES.appLanguage | `apps/mobile/lib/v1FeatureFlags.ts` | Switch for mobile language choice (false) |
| service | VS Code l10n | `apps/extension-vscode/src/l10n/index.ts` | t, tPlural, locale resolution from editor language |
| service | VS Code catalogs | `packages/ui/i18n/src/vscode.ts` | Imports twelve vscode.json catalogs |
| component | VS Code errorPresentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Translated chat error text and actions |
| service | Chrome i18n | `apps/extension/src/i18n.ts` | t and tPlural over chrome.i18n |
| config | Chrome message catalog | `apps/extension/_locales/en/messages.json` | English messages with plural keys |
| service | desktop error messages | `apps/desktop/src/constants/errorMessages.ts` | Catalog-backed native error cards (Tauri code) |
| service | compactToolSummary | `packages/ui/unified-chat/src/lib/compactToolSummary.ts` | Plural tool summaries |
| job | check-i18n-parity guard | `scripts/check-i18n-parity.mjs` | Fails missing keys and wrong plural categories |
| test | i18n parity guard test | `scripts/check-i18n-parity.test.mjs` | Tests the guard |
| test | VS Code l10n test | `apps/extension-vscode/src/__tests__/l10n.test.ts` | VS Code catalog behaviour |
| test | Chrome i18n test | `apps/extension/__tests__/i18n.test.ts` | Manifest and key resolution, dead keys, packaging |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The user picks a display language, or the app starts with the stored one. | device | apps/web/app/i18n/index.ts:60-83 |
| Catalogs load lazily per language. | device | apps/web/app/i18n/index.ts:12 (lazyLocaleBackend import) |
| A counted phrase calls translateUiPlural with the count and English fallbacks; i18next selects the plural key. | device | packages/ui/ui/src/lib/translate.ts:50-57 |
| An error is mapped to a catalog key (network, HTTP status or turn cause) and shown. | device | packages/ui/ui/src/lib/network-error.ts:6-47 |
| VS Code resolves the locale from vscode.env.language each time it formats a message. | device | apps/extension-vscode/src/l10n/index.ts:24-47 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Language preference | Web cookie and browser storage; Mobile encrypted storage | no account sync seen | One-year cookie |
| Catalog JSON | Bundled in the apps or packages | not applicable | Shipped with releases |

**Models and providers.** None for UI strings. The decision doc says further languages are model-translated then human-reviewed before release (D-2026-09-15-03), which is a content process, not runtime behaviour.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code; language is a device preference. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Mobile FEATURES.appLanguage false; selectable language list fixed (SELECTABLE_LANGUAGE_CODES = en, es). |
| Model compatibility | Not related to models. |
| Provider restrictions | none found in the code. |
| Local mode | Fully on device; Local mode does not change translation. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| i18next not initialised | English fallback with one/other | translate.ts:32-38, :50-52 |
| Missing catalog key | English default text from the call site is shown | translate.ts:40-48 |
| Unsupported VS Code language | Falls back to English | apps/extension-vscode/src/l10n/index.ts:24-27 |
| Missing Chrome plural form | Falls back to the _other message | apps/extension/src/i18n.ts:19-23 |
| Offline | Offline message selected from navigator.onLine | network-error.ts:10-13 |
| Mobile error text | English only | liveVoiceAvailability.ts:5-16 |
| CLI | English only; not handled in the code | no i18n code found in apps/cli |
| Unknown error type on desktop-native cards | Uses the UNKNOWN_ERROR entry | apps/desktop/src/constants/errorMessages.ts:45-47 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `scripts/check-i18n-parity.test.mjs`: The parity guard, including plural suffix rules
- `apps/extension-vscode/src/__tests__/l10n.test.ts`: VS Code l10n (file opened header only)
- `apps/extension/__tests__/i18n.test.ts`: Manifest key resolution, unused keys, packaging of _locales
- `apps/web/app/i18n/lazy-locales.test.ts`: Lazy loading of locale catalogs
- `apps/mobile/__tests__/mobile-i18n.test.ts`: Mobile language selection and storage
- `apps/mobile/__tests__/MobileI18nKeys.test.ts`: Mobile i18n keys
- `packages/ui/ui/src/lib/network-error.test.ts`: Network and HTTP error mapping
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx`: Counts text '1 point ·'

**Test scenarios**

- **Spanish plural**
  1. Choose Spanish
  2. Open a chart with 1 point, then one with 3
  - Expected: Singular and plural forms from the catalog, not an added 's'
- **Plural categories**
  1. Run pnpm check:i18n-parity
  - Expected: No missing or extra keys; plural categories match each language (not run here)
- **Offline error**
  1. Set Spanish
  2. Go offline and send a message
  - Expected: Offline message in Spanish
- **VS Code language**
  1. Set the editor display language to a supported one
  2. Trigger a chat error
  - Expected: Error and wait phrases in that language with a correct plural
- **Mobile**
  1. Set phone language to Spanish
  2. Open the app
  - Expected: English, because appLanguage is off
- **CLI**
  1. Run the CLI with a Spanish system language
  - Expected: English output

**Where to look when it fails**

- Missing-key behaviour shows the English fallback, visible in the UI
- check:i18n-parity output
- Console warnings on Mobile language save failures

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **Mobile errors and most Mobile text are not translated and language choice is off** Affects: Mobile non-English users. Evidence: apps/mobile/lib/v1FeatureFlags.ts:36; liveVoiceAvailability.ts:5-16. Work needed: Route strings through catalogs, review languages, enable the flag
- **CLI has no translation** Affects: CLI non-English users. Evidence: no i18n code in apps/cli. Work needed: Decide scope; add a catalog layer if required
- **Only two languages are selectable** Affects: Web and Desktop users of other languages. Evidence: languages.ts:25. Work needed: Review and release catalogs per decision D-2026-09-15-03
- **Manual singular/plural words in Mobile usage text** Affects: Mobile users in languages with more plural forms. Evidence: apps/mobile/src/features/settings/cloud-usage/index.tsx:205. Work needed: Use translatePlural
- **Chrome ships English only** Affects: Chrome users. Evidence: apps/extension/_locales contains only en. Work needed: Add reviewed locale folders
- **Brief says desktop done using apps/desktop/src errorMessages, which is not the public Desktop window** Affects: Accuracy of desktop status. Evidence: apps/desktop/src/constants/errorMessages.ts:45; AGENTS.md section 5. Work needed: Confirm the hosted web path covers desktop errors
- Not built on: CLI (from the capability ledger).

**Depends on**

- SYS-shared-ui-and-design
- SYS-api-and-contracts
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- file:packages/ui/ui/src/lib/translate.ts
- file:packages/ui/i18n/src/languages.ts
- file:scripts/check-i18n-parity.mjs

## Unknown

- Whether server-sent error text is localized.
- Whether the non-selectable catalogs are complete and reviewed.
- Whether account-level language sync exists.
- Whether the Electron window uses browser language detection for the hosted app.
- Contents of VS Code l10n.test.ts beyond its header.
