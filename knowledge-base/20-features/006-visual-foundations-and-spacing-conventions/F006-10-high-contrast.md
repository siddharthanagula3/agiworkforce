---
id: "F006-10"
type: "feature"
title: "High contrast"
aliases: ["High contrast", "Contrast", "prefers-contrast", "forced-colors", "data-contrast", "Darker system colours", "High Contrast Dark/Light theme", "S6.33"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.33"]
depends_on: ["F006-09", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "api:PUT /api/settings/preferences", "table:user_settings", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-10 High contrast

A stronger look for text, borders and focus for people who need it. Web has a Contrast setting (System or High) plus the OS setting. Mobile and Chrome follow the device. The CLI has two high-contrast themes. VS Code follows the editor's high-contrast theme.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.33](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s633).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** It raises the contrast of muted text, borders and focus rings, and on Windows forced-colours swaps colours for system colours. (apps/web/app/globals.css:1258-1330)

**Why it exists.** Low-vision users and people in bright light need clearer edges and text. The apps answer both the device setting and, on Web, an in-app switch. (globals.css:1258-1270)

**Who uses it.** Users with low vision or contrast sensitivity; engineers adding colours.

**Problems it solves**

- Faint borders and muted text.
- Thin focus rings that are hard to see.
- Brand gradients hiding selected states in forced colours.

**Use cases**

- Web user picks High under Contrast.
- iPhone user turns on Increase Contrast and the app uses its high-contrast palette.
- CLI user on a light terminal picks High Contrast Light.
- Windows user in forced-colours mode opens the Chrome side panel.

## 2. User experience

**Where to find it**

- Web (and Desktop): Settings > Appearance > Contrast, a dropdown with System and High; hint 'System follows your device setting.' (AppearanceSection.tsx:155-173)
- Mobile: device accessibility setting (iOS darker system colours; Android high text contrast). No in-app toggle. (apps/mobile/src/ui/theme/useSystemHighContrast.ts:36-50)
- Chrome: OS forced-colours. No in-app toggle. (apps/extension/src/tokens.ts:36-60)
- CLI: /theme then High Contrast Dark or High Contrast Light. (theme_picker.rs:41-70)
- VS Code: host high-contrast theme; the sidebar also has a forced-colours block. (webviewContent.ts:2783-2810)

**Before you start**

- None.

**Screens and controls**

- Web: select labelled Contrast with options System and High.

**Journey**

1. Web: open Settings, Appearance, choose High under Contrast.
2. Muted text and borders darken (or lighten in dark mode) and focus outlines thicken.
3. Choose System to follow the device again.

**What the person sees and gets**

- Visual change only.

**Settings**

- Web store key highContrast in agiworkforce-web-settings; synced with appearance. (web-settings-store.ts:87,138,180; appearance-namespace.ts:23)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: OS prefers-contrast rule raises muted text, border, input, focus ring colours and makes focus outlines 3px for light and dark. (globals.css:1271-1296)
- Web: in-app High sets data-contrast=more on html and an equal rule set applies, including dark mode and focus outline. (AppearancePreferences.tsx:40-44; globals.css:1298-1320)
- Web: forced-colours block uses system colour keywords. (globals.css:1322)
- Mobile: system high contrast read on iOS (darker system colours) and Android (high text contrast), live updates, and a high-contrast palette replaces the normal one; accent colour is disabled. (useSystemHighContrast.ts:36-60; useTheme.ts:31-34; tokens.ts:34-44)
- Chrome: forced-colours block maps tokens to system colours. (apps/extension/src/tokens.ts:36-60)
- CLI: two high-contrast palettes. (apps/cli/src/tui/terminal_palette.rs:129-156; theme_picker.rs:41-58)
- VS Code: sidebar uses host tokens and a forced-colours block; focus outlines use the host focus border. (webviewContent.ts:549,2783-2810)

**Incomplete**

- The two web rule sets are deliberate duplicates because CSS cannot union a media query with a selector. (globals.css:1260-1263)
- Web 'High' is one switch (no levels). (AppearanceSection.tsx:155-173)

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile has no in-app high-contrast toggle.
- Chrome has no in-app high-contrast toggle.
- VS Code has no AGI control; depends on the host theme.

## 4. Required behaviour

**Established requirements**

- A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.33)

**Acceptance criteria**

1. Web: choosing High adds data-contrast=more and darkens border and muted text colours.
2. Web: with High on, a focused control shows a thicker outline than before.
3. Web: dark mode uses lighter borders under High.
4. Mobile: enabling the device setting switches to the high-contrast palette without restart and removes the accent colour.
5. CLI: High Contrast Dark and Light each paint with their own palette.
6. Chrome: under Windows forced colours, borders use CanvasText.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Selected states must stay visible without colour alone under high contrast. [inferred from forced-colors comment]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an in-app contrast option to Mobile and Chrome for people whose device setting is off.
- [proposed] Test the web High setting contrast ratios in a test, not only the stylesheet shape.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | web contrast rules | `apps/web/app/globals.css` | OS rule (1271), in-app rule (1298-1320), forced colours (1322). |
| component | ContrastRow | `apps/web/features/settings/sections/AppearanceSection.tsx` | System / High select (155-173). |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Stamps data-contrast=more. |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | highContrast flag. |
| other | appearance namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Synced highContrast field. |
| hook | useSystemHighContrast | `apps/mobile/src/ui/theme/useSystemHighContrast.ts` | Reads iOS and Android settings and listens for changes. |
| hook | useTheme | `apps/mobile/src/ui/theme/useTheme.ts` | Chooses high-contrast colours and drops accent. |
| config | mobile colour tokens | `apps/mobile/src/ui/theme/tokens.ts` | highContrastColors and getColors (18-44). |
| config | shared high-contrast palette | `packages/ui/design-tokens/src/index.ts` | agiMobileHighContrastColors (863). |
| component | Chrome tokens | `apps/extension/src/tokens.ts` | Forced-colours variable block. |
| service | CLI palettes | `apps/cli/src/tui/terminal_palette.rs` | PALETTE_HIGH_CONTRAST_DARK and LIGHT (141-156). |
| component | CLI theme picker | `apps/cli/src/tui/widgets/theme_picker.rs` | High Contrast entries. |
| component | VS Code sidebar styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Forced-colours block (2783) and host focus border. |
| component | VS Code settings webview | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Forced-colours block (1209). |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs the setting to the account. |
| endpoint | preferences route | `apps/web/app/api/settings/preferences/route.ts` | Stores the settings JSON. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the select changes highContrast in the store; AppearancePreferences sets or clears data-contrast on html. | device | AppearanceSection.tsx:160-170; AppearancePreferences.tsx:40-44 |
| CSS variables for borders, muted text and focus are overridden for that attribute. | device | globals.css:1298-1320 |
| Signed-in web: the setting is saved to the account. | device and our servers | appearance-namespace.ts:23; route.ts:107-125 |
| Mobile: the OS accessibility service is queried and subscribed to; theme picks the matching palette. | device | useSystemHighContrast.ts:36-60; useTheme.ts:31-34 |
| Chrome and VS Code: the browser or editor reports forced colours via media query. | device | tokens.ts:36; webviewContent.ts:2783 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web highContrast flag | localStorage agiworkforce-web-settings; user_settings row when signed in | Yes when signed in | Kept until changed |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account needed; sync needs sign-in. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Works on the device in Local mode; no server needed. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Platform not iOS or Android (mobile) | High contrast reported as off, no subscription. | useSystemHighContrast.ts:36-60; apps/mobile/__tests__/SystemHighContrast.test.tsx:60 |
| Native query throws (mobile) | Treated as off. | useSystemHighContrast.ts:46-50 |
| Stale initial read | Does not overwrite a newer native event. | SystemHighContrast.test.tsx:102 |
| Both OS and in-app High on (web) | Same values apply twice; no conflict. | globals.css:1271-1320 |
| Offline, error, retry | Cloud save notice as in theme; otherwise not handled in the code. | features/settings/components/SettingsPreferenceRow.tsx:8-25 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/__tests__/high-contrast-css.test.ts`: Contrast rules exist, in-app High gets same treatment, forced-colours uses system tokens.
- `apps/mobile/__tests__/SystemHighContrast.test.tsx`: Android and iOS reads, live change, unsupported platforms, shared subscription, stale reads.
- `apps/mobile/__tests__/theme-contrast.test.ts`: Text readable on each surface per theme.
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Appearance controls list; contrast control detail not opened.

**Test scenarios**

- **Web High**
  1. Settings, Appearance, Contrast, High.
  2. Tab through controls.
  - Expected: data-contrast=more is set and focus outline is thicker.
- **Web OS setting**
  1. Turn on the OS increased-contrast setting with Contrast on System.
  - Expected: Same stronger borders appear.
- **Mobile device setting**
  1. Turn on Increase Contrast (iOS) or high contrast text (Android).
  2. Open the app.
  - Expected: High-contrast palette applies and the accent colour is not used.
- **CLI**
  1. /theme high-contrast-light on a light terminal.
  - Expected: Palette changes to the high-contrast one.
- **Windows forced colours**
  1. Enable Windows contrast themes.
  2. Open the Chrome side panel and VS Code sidebar.
  - Expected: Borders and send button use system colours and stay visible.

**Where to look when it fails**

- Inspect html data-contrast.
- Compute contrast of --border and --muted-foreground in devtools.
- Run the web high-contrast-css test.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **No in-app high-contrast control on Mobile or Chrome.** Affects: Users whose device setting is off or unsupported.. Evidence: No control found in apps/mobile or apps/extension options. Work needed: Add a setting if wanted.
- **Web contrast rules duplicated in two blocks.** Affects: Engineers; risk of drift.. Evidence: globals.css:1271-1320. Work needed: Keep in sync; the test covers some parity.
- **Whether the web High values meet a numeric contrast ratio is not tested.** Affects: Web users.. Evidence: high-contrast-css.test.ts checks shape (test titles lines 9-22). Work needed: Add computed-ratio test.

**Depends on**

- F006-09
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- api:PUT /api/settings/preferences
- table:user_settings
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Exact contrast ratios achieved by the web High values.
- Whether Electron Desktop passes the OS contrast setting through to the hosted page.
- CLI palette values were not read in full.
- How the VS Code settings page differs from the sidebar for contrast.
- Whether Chrome options page follows forced colours the same as the side panel.
