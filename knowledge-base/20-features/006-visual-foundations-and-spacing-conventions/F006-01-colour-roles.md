---
id: "F006-01"
type: "feature"
title: "Colour roles"
aliases: ["Colour roles", "Theme", "Light, Dark, System", "Accent colour", "Accent Color", "Contrast", "semantic tokens", "design tokens", "colour tokens"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.01", "S6.02", "S6.03", "S6.04", "S6.05", "S6.06"]
depends_on: ["SYS-shared-ui-and-design", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "F006-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-01 Colour roles

Every AGI Workforce app paints its page, panels, text, borders, accent and status colours from named role tokens, separately for light and dark. People pick Light, Dark or System, and on web and mobile also an accent colour. VS Code follows the editor's own colours.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.01](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s601), [S6.02](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s602), [S6.03](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s603), [S6.04](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s604), [S6.05](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s605), [S6.06](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s606).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Defines colour once as named roles (page, subtle and elevated surface, primary, secondary, muted text, borders, accent fill, text and on-fill, and success, warning, danger, info) with separate light and dark values, and lets each app switch between them. Web foundation roles live in packages/ui/design-tokens/src/foundation.css (:181 surface-page, :185 text-primary, :193 rule-strong, :210 accent-text, :215-:227 status text) with a separate .dark block (:433).

**Why it exists.** So components never hold their own colour literals, text stays readable (the file states each pair is asserted at 4.5:1 or better against every surface it can land on) and a theme or accent change reaches the whole app at once (doc: packages/ui/design-tokens/src/foundation.css header comment, lines 1-16). The owner decision of 2026-11-19 lists Theme, Accent colour and Contrast as required Appearance settings (doc: docs/product/requirements.md, section on Appearance settings).

**Who uses it.** Anyone who wants a light or dark app, a calmer accent or higher contrast; engineers who build UI from tokens; testers who check contrast.

**Problems it solves**

- White flash or wrong theme for people who use a dark OS
- Unreadable status text on a coloured background
- Each app drifting to its own colours
- A theme choice that dies when the app restarts

**Use cases**

- A person on web switches Theme from System to Dark in Settings > Appearance and the page repaints at once.
- A person on mobile picks Violet in Settings > Accent Color.
- A CLI user runs /theme high-contrast-dark on a dim terminal.
- A Chrome extension user forces Light in Options > Appearance while the OS is dark.

## 2. User experience

**Where to find it**

- Web: Settings > Appearance, rows 'Theme' (System, Light, Dark), 'Accent colour' (AGI amber, Green, Blue, Violet, Rose) and 'Contrast' (System, High) (apps/web/features/settings/sections/AppearanceSection.tsx:44,75-76; apps/web/shared/stores/web-settings-store.ts:13-19).
- Desktop: the same hosted web Settings > Appearance, because the public desktop shows the hosted web app (doc: AGENTS.md section 5).
- Mobile: Settings > Appearance (System, Light, Dark) and Settings > Accent Color (Neutral, Blue, Cyan, Green, Lime, Yellow, Orange, Rose, Magenta, Violet) (apps/mobile/src/features/settings/index.tsx:673-683 region; apps/mobile/src/features/settings/appearance/index.tsx:14-18; apps/mobile/src/features/settings/accent-color/index.tsx:14-25).
- CLI: type /theme for a picker or /theme <name> (apps/cli/src/tui/tui_app.rs:6372-6395); choices Auto, Dark, Light, Ansi, High Contrast Dark, High Contrast Light, Colorblind (apps/cli/src/tui/widgets/theme_picker.rs:1-20).
- Chrome extension: Options page > Appearance > Theme (System, Light, Dark) (apps/extension/src/features/options/appearance-section.ts; apps/extension/src/features/appearance/themePreference.ts:5-9).
- VS Code: no AGI colour control; the sidebar takes surfaces, text, focus and state colours from the editor theme (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:118-129).

**Before you start**

- No account or plan is needed to change the choice on any app; on web the choice also syncs to the account when the person is signed in (apps/web/features/settings/components/CloudSettingsSync.tsx:260,301).
- Accent colour on mobile is ignored while the OS high-contrast setting is on (apps/mobile/src/ui/theme/useTheme.ts, resolve step: accent is null when isHighContrast).

**Screens and controls**

- Web Theme: three icon buttons labelled System, Light, Dark with aria-pressed (AppearanceSection.tsx:44-70).
- Web Accent colour: round swatches with a check on the chosen one (AppearanceSection.tsx:92-112).
- Web Contrast: a select with System and High (AppearanceSection.tsx:150-165 region).
- Mobile Appearance: three rows with description and a check mark (appearance/index.tsx:34-70).
- Mobile Accent Color: ten rows each with a swatch circle (accent-color/index.tsx:48-80).
- CLI theme picker overlay with a three-line code preview (theme_picker.rs:1-20, 245-262).
- Chrome Options: one select, a status line and a disabled state while saving (appearance-section.ts).

**Journey**

1. Open the app's appearance control (see where_to_find_it).
2. Choose a theme or accent.
3. The app repaints at once; no reload on web, mobile, CLI or Chrome.
4. The choice is kept: web in browser storage and, when signed in, the account; mobile on the device; CLI in the project settings file; Chrome in extension storage.
5. Reopen the app and check the same choice is still applied.

**What the person sees and gets**

- Web and mobile show the selected option with a check or pressed state.
- CLI prints 'Theme set to <name>, saved in <path>.' or 'Theme set to <name> for this session; it could not be saved: <error>' (tui_app.rs:5233-5246).
- Chrome shows 'Saving…', then 'Always light.', 'Always dark.' or 'Follows your device's appearance.' (appearance-section.ts; themePreference.ts:17-21).
- Web shows a red notice 'This device keeps your choice.' with a Retry button when the account sync fails (apps/web/features/settings/components/SettingsPreferenceRow.tsx:8-26).

**Settings**

- Web Contrast High stamps data-contrast=more on the page (apps/web/shared/components/AppearancePreferences.tsx:35-39; apps/web/app/globals.css:1298,1308).
- Web Motion and code theme sit on the same page but belong to other features.
- Chrome storage key agi_theme_preference (themePreference.ts:3).
- CLI config key ui.theme with values auto, dark, light, ansi, high-contrast-dark, high-contrast-light, colorblind (apps/cli/src/config.rs:142-146).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: roles in foundation.css for light (:181-:227) and a separate .dark block (:433-:500) with their own status hues (foundation.css:426-432 comment); theme provider uses next-themes with system support and key 'theme' (apps/web/shared/components/ThemeProvider.tsx; ThemeConstants.ts:3-5).
- Web accent: html[data-accent] overrides for green, blue, violet, rose (apps/web/app/globals.css:725-744); AppearancePreferences stamps the attribute (AppearancePreferences.tsx:30-34).
- Web high contrast: data-contrast=more strengthens muted text, borders and focus ring in both themes (globals.css:1298-1321), plus a forced-colors block (globals.css:1336 region).
- Web accent has separate fill, text and on-fill roles in foundation (foundation.css:210-212) and per-swatch --chat-accent-primary, -primary-text and -on-primary (globals.css:725-744).
- Desktop: the page theme is reported to the Electron process, which sets nativeTheme.themeSource so native dialogs match (apps/desktop/electron/preload.ts:218-235; apps/desktop/electron/main.ts:613-619).
- Mobile: light, dark and high-contrast palettes from @agiworkforce/design-tokens (apps/mobile/src/ui/theme/tokens.ts:1-16, getColors) and ten accent swatches (tokens.ts accentSwatches); ThemeVars exposes surfaces and text to NativeWind (apps/mobile/src/ui/theme/ThemeVars.tsx:14-28).
- CLI: six palettes (terminal_palette.rs:44,59,74,88,102,118) selected by set_active_theme (terminal_palette.rs:138); choice persists to project settings and is restored at start (apps/cli/src/config.rs:1263-1266; tui_app.rs:652-658).
- VS Code: root variables map to host tokens with AGI fallbacks (webviewContent.ts:189-218); test panelPaletteConsistency asserts no host/fixed colour pairing (apps/extension-vscode/src/__tests__/panelPaletteConsistency.test.ts:34).
- Chrome: agiExtensionCssVars light and dark, auto-switching on prefers-color-scheme and [data-theme] (apps/extension/src/tokens.ts:17-40); Options theme select persists to chrome.storage.local and panels follow changes (themePreference.ts:29-41).

**Incomplete**

- Web light chat tokens: --chat-surface-base and --chat-surface-elevated are both #ffffff in light, so chat cards and menus drawn from them are not distinct from the page ground (packages/ui/design-tokens/src/chat.css:60-61; dark values differ at :172-173).
- Web Dialog and AlertDialog paint bg-background/95, not the elevated token (packages/ui/ui/src/primitives/Dialog.tsx:115; AlertDialog.tsx:104).
- Mobile Appearance has no Contrast control; high contrast follows the OS only (appearance/index.tsx has only theme rows; apps/mobile/src/ui/theme/useSystemHighContrast.ts).

**Present but disconnected or switched off**

- Mobile keeps separate theme and accent values for Local and Cloud app modes, chosen by appMode (apps/mobile/src/ui/theme/useTheme.ts:19-26; appearance/index.tsx:24-30). I found no call from the mobile src or stores folders to /api/settings/preferences, so these choices stay on the device [inferred from a search that returned nothing].

**Not available**

- Accent colour control on CLI, VS Code and Chrome (no such control found in theme_picker.rs, appearance-section.ts or webviewContent.ts).
- Chrome and VS Code do not sync theme to the account (Chrome stores locally: themePreference.ts:29-41).

## 4. Required behaviour

**Established requirements**

- Surfaces paint page and panel backgrounds from named semantic tokens per theme, not component literals. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.01)
- Raised surfaces (cards, menus, popovers, dialogs) use an elevated-surface token distinct from the page ground in each theme. (source: S6.02 (brief))
- Primary and muted text use tokens meeting 4.5:1 on every surface they land on, without opacity dilution. (source: S6.03 (brief))
- Borders and dividers use named subtle and strong tokens per theme. (source: S6.04 (brief))
- Accent and selection have separate fill, text and on-fill roles that each meet contrast. (source: S6.05 (brief))
- Success, warning, error and info each have text and fill roles; status text meets 4.5:1 in both themes. (source: S6.06 (brief))
- Appearance settings are their own page and include Theme, Accent colour and Contrast. (source: docs/product/requirements.md (Appearance settings, owner decision 2026-11-19))

**Acceptance criteria**

1. Switching Theme to Light, Dark or System repaints the whole page without reload on web.
2. After reload, the chosen theme and accent are still applied on web, mobile, CLI and Chrome.
3. An invalid stored web theme value resolves to Dark (ThemeConstants.ts:9,13); a missing one resolves to System.
4. Every status text token reads at 4.5:1 or better on its surfaces in both themes (checked by apps/web/shared/components/__tests__/theme-contrast.test.ts).
5. With Contrast set to High on web, muted text, borders and the focus ring are visibly stronger in both themes.
6. In light theme, a dialog or card is visibly distinct from the page behind it.
7. On desktop, switching the web theme changes native dialog appearance to match.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A disabled control may dim with opacity, but running text should not [inferred from S6.03 and Button.tsx:9 using disabled:opacity-50].
- Mobile accent should apply identically in Local and Cloud modes unless the person chose otherwise [inferred from separate stores].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give light chat surface-elevated a value different from surface-base, or drop the chat alias and use --surface-elevated.
- [proposed] Add a Contrast control to mobile Appearance and a visible Accent control to Chrome and CLI, or record that they are intentionally absent.
- [proposed] Make Dialog and AlertDialog draw from the elevated surface token.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | foundation tokens | `packages/ui/design-tokens/src/foundation.css` | Layers of primitives (--n-*, --hue-*), semantic roles and a separate .dark block |
| config | chat tokens | `packages/ui/design-tokens/src/chat.css` | --chat-* aliases for the chat surface in light and dark |
| config | token module | `packages/ui/design-tokens/src/index.ts` | Exports agiMobileColors (:714), agiMobileAccentSwatches (:939), agiExtensionCssVars (:971), agiVsCodeCssVars (:1074) for hosts that cannot import CSS |
| component | AppearanceSection | `apps/web/features/settings/sections/AppearanceSection.tsx` | Web Theme, Accent colour and Contrast controls |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Stamps data-accent and data-contrast on the html element |
| component | ThemeProvider and ThemeConstants | `apps/web/shared/components/ThemeProvider.tsx` | next-themes wrapper; default System, invalid value falls back to Dark (ThemeConstants.ts) |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | ACCENT_COLORS list and persisted accentColor and highContrast (localStorage key agiworkforce-web-settings, :210) |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs the appearance namespace to the account when signed in, debounced |
| endpoint | preferences route | `apps/web/app/api/settings/preferences/route.ts` | GET and PUT /api/settings/preferences (:252-253), reads and writes public.user_settings |
| table | user_settings | `apps/web/app/api/settings/preferences/route.ts` | Account-side home of the synced appearance values (:68,107,124) |
| config | web CSS overrides | `apps/web/app/globals.css` | Accent, contrast and forced-colors overrides (:725-744, :1298-1321) |
| hook | desktop theme bridge | `apps/desktop/electron/preload.ts` | watchThemePreference sends the page theme to the main process (:218-235) |
| service | desktop native theme handler | `apps/desktop/electron/main.ts` | Sets nativeTheme.themeSource and saves the appearance preference (:613-619) |
| hook | mobile useTheme | `apps/mobile/src/ui/theme/useTheme.ts` | Resolves palette from mode, OS scheme, high contrast and accent |
| config | mobile tokens | `apps/mobile/src/ui/theme/tokens.ts` | getColors, accent swatches, typeScale, spacing |
| screen | mobile Appearance and Accent Color screens | `apps/mobile/src/features/settings/appearance/index.tsx` | Theme rows; the accent screen is apps/mobile/src/features/settings/accent-color/index.tsx |
| store | mobile local and cloud settings stores | `apps/mobile/stores/settings/cloudSettingsStore.ts` | Per-mode themeMode and accentColor persisted in MMKV (:124-125); the local store is localSettingsStore.ts |
| config | CLI palettes | `apps/cli/src/tui/terminal_palette.rs` | Six palettes, ui_* role functions and set_active_theme |
| component | CLI theme picker | `apps/cli/src/tui/widgets/theme_picker.rs` | ThemeChoice enum and picker overlay |
| command | /theme | `apps/cli/src/tui/tui_app.rs` | Slash command (:6372) and picker key handling with persistence (:5250-5275) |
| config | CLI persisted theme | `apps/cli/src/config.rs` | ui.theme field (:142-146) and persist_theme_project (:1263) |
| component | VS Code sidebar colours | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Host-token variables with AGI fallbacks (:189-218) |
| component | Chrome theme preference | `apps/extension/src/features/appearance/themePreference.ts` | Parse, apply and follow the stored preference |
| component | Chrome Options appearance section | `apps/extension/src/features/options/appearance-section.ts` | Theme select, save, revert on failure |
| test | theme-contrast test | `apps/web/shared/components/__tests__/theme-contrast.test.ts` | Contrast and token completeness for web, extension, mobile and VS Code palettes |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a theme in web Settings > Appearance; next-themes sets the class on the page and stores the key 'theme'. | device | apps/web/features/settings/sections/AppearanceSection.tsx:53; apps/web/shared/components/ThemeProvider.tsx; ThemeConstants.ts:3 |
| The .dark block swaps every semantic role at once. | device | packages/ui/design-tokens/src/foundation.css:433 |
| When signed in, CloudSettingsSync sends the appearance namespace after a short delay via PUT /api/settings/preferences, stored in user_settings. | our servers | apps/web/features/settings/components/CloudSettingsSync.tsx:260,301; apps/web/app/api/settings/preferences/route.ts:253,107,124 |
| On desktop the page's theme attribute is observed and sent over IPC; the main process sets the native theme and saves it. | device | apps/desktop/electron/preload.ts:218-235; apps/desktop/electron/main.ts:613-619 |
| On mobile, the screen writes themeMode or accentColor to the store for the current app mode; useTheme recomputes colours. | device | apps/mobile/src/features/settings/appearance/index.tsx:24-30; apps/mobile/src/ui/theme/useTheme.ts:19-36 |
| On CLI, set_active_theme changes the palette and the choice is written to the project settings file. | device | apps/cli/src/tui/tui_app.rs:5257-5265; apps/cli/src/config.rs:1263-1266 |
| On Chrome, the select applies data-theme immediately and writes chrome.storage.local; if the write fails it reverts and shows an error. | device | apps/extension/src/features/options/appearance-section.ts; themePreference.ts:23-27 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web appearance settings (theme, accent, contrast) | Browser localStorage 'agiworkforce-web-settings' and 'theme'; account table public.user_settings when signed in | Yes when signed in; not when signed out | Local copy stays until browser data is cleared; account copy retention not found in the files I read |
| Mobile theme and accent | On-device MMKV stores, one per app mode | No sync call found | Kept on device; removal rules unknown |
| CLI theme | Project settings file via save_project_ui_settings | No | Kept until the file is changed |
| Chrome theme preference | chrome.storage.local key agi_theme_preference | No (local area) | Kept until extension data is cleared |

**Models and providers.** No model or provider takes part; colour choice never reaches a model (none found in the files read).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed to change colours on any app; web syncs only when signed in (CloudSettingsSync.tsx:260). |
| Permissions | none found in the code |
| Subscription | none found in the code; AppearanceSection.tsx has no plan check. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code for colour roles. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Works fully on device in Local mode: no sign-in or payment needed, and mobile stores values on device (cloudSettingsStore.ts:124-125). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid stored theme (web) | Resolves to Dark; missing resolves to System | apps/web/shared/components/ThemeConstants.ts:9-13 |
| Account sync fails (web) | Red notice 'This device keeps your choice.' with Retry | apps/web/features/settings/components/SettingsPreferenceRow.tsx:8-26 |
| Storage load fails (Chrome) | Select re-enabled, text says the panel follows the device | apps/extension/src/features/options/appearance-section.ts (LOAD_FAILURE_TEXT) |
| Storage save fails (Chrome) | Reverts to the previous theme and shows 'Could not save your theme. Please try again.' | appearance-section.ts (SAVE_FAILURE_TEXT) |
| Save fails (CLI) | Theme applies for the session; message says it could not be saved | apps/cli/src/tui/tui_app.rs:5241-5246 |
| OS high contrast (mobile) | High-contrast palette used and accent ignored | apps/mobile/src/ui/theme/useTheme.ts:34-36 |
| Forced colours (web) | Shadows removed and system colours used | apps/web/app/globals.css:1336 region (forced-colors block) |
| Offline | Local choices still apply; account sync not handled beyond the error notice | SettingsPreferenceRow.tsx:8-26 |
| VS Code high-contrast host | Follows host tokens | webviewContent.ts:118-129 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: WCAG ratios in light and dark, accent swatch legibility, brand ramp ownership, theme completeness, status role tokens, Chrome, mobile and VS Code palettes
- `apps/web/shared/components/__tests__/ThemeProvider.test.tsx`: THEME_STORAGE_KEY 'theme', DEFAULT_THEME 'system', context and data-theme mirroring
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Theme buttons expose aria-pressed, set Light, eight controls listed, accent, contrast and code controls
- `apps/mobile/__tests__/ThemePrefs.test.tsx`: themeMode defaults to system, round-trips, getColors resolution including high contrast
- `apps/mobile/__tests__/theme-contrast.test.ts`: Mobile palette contrast (file exists; titles not read)
- `apps/mobile/__tests__/SystemHighContrast.test.tsx`: OS high-contrast handling (file exists; titles not read)
- `apps/extension/__tests__/panel-theme.test.ts`: Both palettes emitted with light behind the media query; different background per scheme; shadow-DOM selector
- `apps/extension-vscode/src/__tests__/panelPaletteConsistency.test.ts`: No host colour paired with a fixed colour; policy header truthful; host aliases have AGI fallbacks
- `apps/cli/src/tui/terminal_palette.rs`: Unit tests: each theme index resolves to its own palette and a distinct dark or light base (:837,:852)

**Test scenarios**

- **Web theme persists**
  1. Open web Settings > Appearance
  2. Choose Light
  3. Reload the page
  - Expected: Page is light before and after reload; Light button shows pressed
- **Invalid stored theme**
  1. In browser storage set key 'theme' to an unknown word
  2. Reload web
  - Expected: Page renders dark
- **Accent on mobile**
  1. Open Settings > Accent Color
  2. Pick Violet
  3. Return to chat
  - Expected: Selected controls use the violet swatch for the current theme; switch OS to high contrast and the accent is ignored
- **CLI theme restore**
  1. Run /theme high-contrast-dark
  2. Quit and start the CLI in the same project
  - Expected: High-contrast dark palette is active from the first frame
- **Desktop native dialog**
  1. In the desktop app set web Theme to Light
  2. Trigger a native permission dialog
  - Expected: Dialog uses the light appearance
- **Light elevated surface**
  1. On web light theme open a dialog and a chat menu
  2. Compare their ground with the page
  - Expected: Raised surface visibly differs from the page (currently a gap for chat tokens)

**Where to look when it fails**

- Browser devtools: html class dark, data-theme, data-theme-preference, data-accent, data-contrast attributes.
- Chrome: chrome.storage.local key agi_theme_preference.
- CLI: result line after /theme shows the saved path or the error.
- Web sync failures show in the settings notice; server errors come from GET/PUT /api/settings/preferences.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Light chat surface base and elevated are the same colour** Affects: Web and desktop, light theme. Evidence: packages/ui/design-tokens/src/chat.css:60-61 (both #ffffff); requirement S6.02. Work needed: Pick a distinct elevated value or point chat cards at --surface-elevated and extend theme-contrast.test.ts
- **Dialog and AlertDialog use the page background at 95 percent, not the elevated token** Affects: Web and desktop. Evidence: packages/ui/ui/src/primitives/Dialog.tsx:115; AlertDialog.tsx:104. Work needed: Switch to the elevated surface role and re-run contrast tests
- **Mobile has no in-app contrast control and no accent control outside a separate screen** Affects: Mobile. Evidence: apps/mobile/src/features/settings/appearance/index.tsx lists theme rows only. Work needed: Decide whether the Appearance requirement applies to mobile; add Contrast if so
- **No accent control on CLI, VS Code or Chrome, and no account sync of theme on those apps** Affects: CLI, VS Code, Chrome. Evidence: theme_picker.rs, appearance-section.ts and webviewContent.ts show no accent control. Work needed: Record intent in the surface matrix or add controls
- **Disabled web buttons dim with opacity 50 percent** Affects: Web, desktop. Evidence: packages/ui/ui/src/primitives/Button.tsx:9. Work needed: Confirm disabled controls are exempt from the no-opacity rule, or use a disabled token (text-disabled exists at foundation.css:188 region)

**Depends on**

- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- F006-02

## Unknown

- Whether the 4.5:1 claim holds today: I did not run theme-contrast.test.ts and no file records a run.
- Retention and deletion of the account copy in user_settings.
- Which mobile Settings menu entry opens the Code screen that holds Code font and Transcript font (see F006-02).
- The Tauri build's colour handling (AGENTS.md section 5 calls Tauri internal).
- Whether mobile Cloud mode syncs appearance to the server through another path I did not search.
- Exact line of the web forced-colors block: I read it near globals.css:1336 but did not capture the number.
