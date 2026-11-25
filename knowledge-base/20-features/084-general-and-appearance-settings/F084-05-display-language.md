---
id: "F084-05"
type: "feature"
title: "Display language"
aliases: ["Display language", "App language", "Display Language", "language namespace", "S84.01"]
area: "84 General and appearance settings"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.01"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "table:user_settings", "api:PUT /api/settings/preferences", "api:GET /api/settings/sync", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-05 Display language

Web and Desktop let a person switch the interface language from a list of native names with flags, but only English and Spanish are offered, and settings screens stay in English. The choice is saved on the device and in the account. Mobile has the screen but it is switched off in v1. CLI and VS Code have none.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.01](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8401).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Changes the language of the menus, navigation and pricing text. The hint beside the control says settings labels and conversations are not translated.

**Why it exists.** People expect to use the product in their own language. The founders limited the list to languages that are complete and reviewed (doc: docs/decisions/2026-09-15-founder-decisions.md, lines 66-73).

**Who uses it.** Spanish speakers today on Web and Desktop; later any reviewed language.

**Problems it solves**

- English-only menus for Spanish speakers.
- Half-finished translations being shown (incomplete languages are hidden).

**Use cases**

- A Spanish-speaking user selects Español and the menus change at once.
- A user signs in on a new browser and finds Español already chosen.
- A right-to-left language, once released, flips direction on the page root.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, General, Preferences, row 'Display Language' with a drop-down (apps/web/features/settings/sections/GeneralSection.tsx:526-535).
- Mobile: Settings, General, row 'App language', shown only when the v1 flag appLanguage is on (apps/mobile/src/features/settings/general/index.tsx:107-116; apps/mobile/lib/v1FeatureFlags.ts:35 sets it false).
- CLI and VS Code: none.

**Before you start**

- None. Account sync needs sign-in.

**Screens and controls**

- Drop-down labelled 'Display language'; each option shows the flag and the native name (apps/web/features/settings/components/LanguageSelector.tsx:19-37).
- Hint under the label from the 'translationScope' text: 'Translates menus, navigation and pricing. Settings labels and conversations are unaffected.' (packages/ui/i18n/locales/en/settings.json:65).
- Mobile: a list with Match device as default; the screen asks to reload when direction changes (apps/mobile/src/features/settings/general/AppLanguageScreen.tsx:1-40; apps/mobile/src/i18n/index.ts:20-22).

**Journey**

1. Open Settings, General.
2. Pick a language in 'Display Language'.
3. The interface switches with no reload.
4. The choice is saved in a cookie and local storage, and in the account when signed in.

**What the person sees and gets**

- Menus and navigation change language.
- The page language and text direction attributes change.
- Sync alert with Retry if the account write fails.

**Settings**

- Browser cookie and localStorage key 'agiworkforce-language' (apps/web/app/i18n/index.ts:21, 56-66).
- Account namespace 'language', field locale (CloudSettingsSync.tsx:306-311; appearance-namespace.ts:13, 212-216).
- Mobile preference key 'agiworkforce-language' with value 'device' or a code (apps/mobile/src/i18n/index.ts:18-19).
- Related: speech language on Mobile is separate (apps/mobile/services/cloudSettingsMapping.ts:139-141).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: selecting a language calls i18n.changeLanguage (apps/web/features/settings/components/LanguageSelector.tsx:10-16).
- Web: the page language and direction are set on change; rtl languages get dir=rtl (apps/web/app/i18n/index.ts:72-79).
- Web: the stored value is read from the cookie first, then local storage, and applied after start; an unknown value falls back to English (apps/web/app/i18n/index.ts:23-38, 78-83; packages/ui/i18n/src/languages.ts:38-40).
- Web: signed-in users read and write the 'language' namespace; only supported locales are accepted (CloudSettingsSync.tsx:234-240, 306-311; appearance-namespace.ts:212-216).
- Only English and Spanish are selectable; ten more are registered but hidden (packages/ui/i18n/src/languages.ts:9-31).

**Incomplete**

- The hint says settings labels and conversations stay in English, so the translation is partial on Web (locales/en/settings.json:65). The code state matches the founder rule to show only reviewed languages (packages/ui/i18n/src/languages.ts:26-28).

**Present but disconnected or switched off**

- Mobile: the App language row, the screen and the stored preference are switched off by FEATURES.appLanguage = false (apps/mobile/lib/v1FeatureFlags.ts:35; apps/mobile/src/features/settings/general/index.tsx:107; apps/mobile/src/features/settings/general/AppLanguageScreen.tsx:20-23; apps/mobile/src/i18n/index.ts:29-35). A decision dated 2026-11-13 says the row should be present with Match device as the default (doc: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-04), so code and decision disagree.

**Not available**

- CLI and VS Code: no display language setting found (brief S84.01 marks them missing).
- Chrome: not applicable per the brief; the extension has an _locales folder (apps/extension/_locales) but no picker was found [inferred not a user choice].

## 4. Required behaviour

**Established requirements**

- The user can choose the interface display language and the UI switches to it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.01)
- Offer English plus only languages that are complete and reviewed; hide incomplete ones. (source: docs/decisions/2026-09-15-founder-decisions.md lines 66-73)
- Settings, General has an App language row on Mobile, with Match device as the default; the picker offers only reviewed languages. (source: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-04)
- The language catalogue is shared, not hardcoded per client. (source: docs/decisions/2026-09-15-founder-decisions.md lines 69-70)

**Acceptance criteria**

1. Choosing Español on Web changes menus at once with no reload and sets <html lang=es>.
2. Reload keeps the language (cookie and local storage).
3. Signing in on another browser applies the account language.
4. A stored unsupported value falls back to English.
5. Only English and Spanish appear in the list.
6. On Mobile with the flag on, App language shows Match device by default.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Settings screens being untranslated is a known limit stated to the user in the hint, not a defect [inferred from the hint text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Turn on the Mobile row to match D-2026-11-13-04, or amend the decision.
- [proposed] Translate settings labels, then retire the scope hint.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DisplayLanguageRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Row with label and scope hint (lines 526-535) |
| component | LanguageSelector | `apps/web/features/settings/components/LanguageSelector.tsx` | The drop-down |
| service | i18n init | `apps/web/app/i18n/index.ts` | Cookie and storage, document lang and dir, first-load apply |
| config | languages catalogue | `packages/ui/i18n/src/languages.ts` | 12 supported, 2 selectable, default English |
| config | English settings strings | `packages/ui/i18n/locales/en/settings.json` | translationScope hint (line 65) |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Reads and writes the 'language' namespace |
| service | appearance-namespace (readStoredLocale) | `apps/web/features/settings/lib/appearance-namespace.ts` | Accepts only supported locales |
| endpoint | api:PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Account write |
| endpoint | api:GET /api/settings/sync | `apps/web/app/api/settings/sync/route.ts` | 'language' is a cloud-safe namespace (lines 14-25) |
| table | public.user_settings | `apps/web/app/api/settings/preferences/route.ts` | Account store |
| config | FEATURES.appLanguage | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile switch, false |
| screen | AppLanguageScreen | `apps/mobile/src/features/settings/general/AppLanguageScreen.tsx` | Mobile picker; redirects when the flag is off |
| screen | GeneralSettingsScreen | `apps/mobile/src/features/settings/general/index.tsx` | Hosts the App language row |
| service | mobile i18n | `apps/mobile/src/i18n/index.ts` | Device language, stored preference, RTL setup |
| test | DisplayLanguageRow.test | `apps/web/features/settings/sections/__tests__/DisplayLanguageRow.test.tsx` | Scope hint and selector description |
| test | AppLanguageSettings.test | `apps/mobile/__tests__/AppLanguageSettings.test.tsx` | Mobile language settings (file exists, cases not opened) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a language; i18n loads the needed text (lazy backend) and switches. | device | LanguageSelector.tsx:10-16; apps/web/app/i18n/index.ts:43-47 |
| A listener sets lang and dir on <html>; the detector writes cookie and local storage. | device | apps/web/app/i18n/index.ts:56-66, 72-79 |
| Signed-in Web writes {locale} to the 'language' namespace. | device and our servers | CloudSettingsSync.tsx:306-311 |
| On another browser after sign-in, the stored locale is read and applied if it differs. | device and our servers | CloudSettingsSync.tsx:234-239 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Language code | Cookie and localStorage 'agiworkforce-language' (cookie max age one year); account namespace 'language' | Yes on Web when signed in | Cookie expires after 365 days (apps/web/app/i18n/index.ts:64); account copy kept |
| Mobile language preference | MMKV key 'agiworkforce-language' (only read when the flag is on) | No sync code seen | Kept on device |

**Models and providers.** No model or provider takes part in switching the interface language. Whether the model replies in that language is a separate setting (Mobile personalization responseLanguage, apps/mobile/services/cloudSettingsMapping.ts:48-49).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed for the device value; needed for account sync. |
| Permissions | none found in the code. |
| Subscription | No plan limit seen. |
| Limits and metering | Settings endpoints rate limited; nothing metered. |
| Feature flags | Mobile FEATURES.appLanguage is false (apps/mobile/lib/v1FeatureFlags.ts:35). Web selectable list is controlled by SELECTABLE_LANGUAGE_CODES (packages/ui/i18n/src/languages.ts:28). |
| Model compatibility | Not related to any model. |
| Provider restrictions | none found in the code. |
| Local mode | Works in Local mode with no payment or sign-in on Web and Desktop. Mobile screen is off in v1. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown stored language | English is applied. | packages/ui/i18n/src/languages.ts:38-40; apps/web/app/i18n/index.ts:78-83 |
| Account has a locale the build does not ship | Ignored by readStoredLocale. | appearance-namespace.ts:212-216 |
| Right-to-left language | dir=rtl is set on the page root (none selectable today). | apps/web/app/i18n/index.ts:75; packages/ui/i18n/src/languages.ts:12 (Arabic rtl) |
| Account write fails | Alert with Retry. | CloudSettingsSync.tsx:182-186 |
| Mobile flag off | The row is hidden and the screen redirects to General; the app uses English. | general/index.tsx:107; AppLanguageScreen.tsx:20-23; i18n/index.ts:29-35 |
| Accessibility | The drop-down has label 'Display language' and is linked to the hint by aria-describedby. | LanguageSelector.tsx:22-23 |
| Offline, timeout | not handled in the code beyond the failed-save alert. | CloudSettingsSync.tsx:182-186 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/LanguageSelector.test.tsx`: Takes its description from the row, offers every selectable language, switches the language.
- `apps/web/features/settings/sections/__tests__/DisplayLanguageRow.test.tsx`: States the translation scope once, links the helper to the selector, translates the helper.
- `apps/web/features/settings/sections/GeneralSection.test.tsx`: States how far display-language translation actually reaches (line 186).
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Accepts only a locale the product ships.
- `apps/mobile/__tests__/AppLanguageSettings.test.tsx`: Mobile language settings; cases not opened.
- `apps/mobile/__tests__/mobile-i18n.test.ts`: Mobile i18n setup; cases not opened.

**Test scenarios**

- **Switch to Spanish**
  1. Settings, General, Display Language, Español.
  - Expected: Menus switch at once; <html lang=es>; cookie agiworkforce-language=es.
- **Restart**
  1. Reload the page.
  - Expected: Spanish remains.
- **Account carry-over**
  1. Sign in on a second browser.
  - Expected: Spanish is applied after the account read.
- **Only reviewed languages**
  1. Open the list.
  - Expected: Exactly English and Español.
- **Mobile flag**
  1. Open Mobile Settings, General.
  - Expected: No App language row while the flag is off.

**Where to look when it fails**

- Cookie and localStorage key 'agiworkforce-language' (apps/web/app/i18n/index.ts:21).
- Account: settings.language.locale in public.user_settings.
- Alert texts from CloudSettingsSync.tsx:183, 249.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **Only two languages are selectable and settings screens stay English.** Affects: Web, Desktop. Evidence: packages/ui/i18n/src/languages.ts:28; locales/en/settings.json:65. Work needed: Finish and review more catalogues and the settings strings.
- **Mobile App language row is off, though the 2026-11-13 decision wants it on.** Affects: Mobile. Evidence: apps/mobile/lib/v1FeatureFlags.ts:35; docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-04. Work needed: Turn the flag on or amend the decision.
- **CLI and VS Code have no display language setting.** Affects: CLI, VS Code. Evidence: Brief S84.01. Work needed: Decide scope.
- **Mobile language is not synced to the account.** Affects: Mobile. Evidence: toCloudSettings in apps/mobile/services/cloudSettingsMapping.ts sends only speechLanguage under 'language' (lines 139-141). Work needed: Decide whether to sync.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- table:user_settings
- api:PUT /api/settings/preferences
- api:GET /api/settings/sync
- SYS-authentication-and-identity

## Unknown

- Whether Desktop adds anything to the language (the Electron shell has its own screens; not traced).
- Whether the Chrome extension chooses its language from the browser (only an _locales folder was seen).
- Content of the Mobile language tests (not opened).
- Whether the hidden languages have complete catalogues today.
