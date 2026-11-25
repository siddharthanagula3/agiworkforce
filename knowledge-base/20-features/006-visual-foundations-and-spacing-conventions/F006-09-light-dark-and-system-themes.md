---
id: "F006-09"
type: "feature"
title: "Light, dark and system themes"
aliases: ["Light, dark and system themes", "Theme", "Appearance", "Dark mode", "Light mode", "Theme picker", "/theme", "S6.32", "agi_theme_preference", "ui.theme"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.32"]
depends_on: ["SYS-shared-ui-and-design", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "api:PUT /api/settings/preferences", "api:GET /api/settings/preferences", "table:user_settings", "store:settings-store-local", "store:chrome.storage.local", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "F006-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-09 Light, dark and system themes

Lets a person pick Light, Dark or follow the device, and the whole app follows, including code blocks. Web, Mobile and Chrome have System, Light, Dark. The CLI has a seven-entry theme picker. VS Code follows the editor theme. On Desktop, the choice also recolours native windows and dialogs.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.32](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s632).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** It stores the person's appearance choice and makes the surface use matching colours; 'System' follows the device. (apps/web/shared/components/ThemeProvider.tsx:41-53)

**Why it exists.** People work in bright and dark rooms and expect the app to match the device. A dark app in a light editor looks like two unrelated products. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:118-121)

**Who uses it.** Every user of every app; engineers who add themed UI.

**Problems it solves**

- Eye strain in the wrong theme.
- Native dialogs on Desktop staying dark when the page is light. (apps/desktop/electron/main.ts:605-617)
- Light mode code colours being hard to read (light mode keeps a high-contrast code look). (AppearanceSection.tsx:250-253)

**Use cases**

- A Web user sets Dark and reloads; it stays dark.
- A phone user leaves System and the app switches at sunset.
- A CLI user opens /theme and picks High Contrast Dark.
- A Chrome user picks Light in Options, Appearance and the side panel updates live.

## 2. User experience

**Where to find it**

- Web (and Desktop): Settings > Appearance > Theme, buttons System, Light, Dark (aria-labels 'System theme', 'Light theme', 'Dark theme'). (AppearanceSection.tsx:23-27,44-67)
- Web: also a theme action in the command palette. (CommandPalette.tsx:143-161 per brief; not opened)
- Mobile: Settings > Appearance, rows System ('Match this device.'), Light ('Bright neutral interface.'), Dark ('Dark neutral interface.'). (apps/mobile/src/features/settings/appearance/index.tsx:13-17)
- CLI: /theme opens a picker titled Theme; /theme <name> sets directly; list: Auto, Dark, Light, Ansi, High Contrast Dark, High Contrast Light, Colorblind. (apps/cli/src/tui/tui_app.rs:6371-6392; tui/widgets/theme_picker.rs:41-71)
- Chrome: Options > Appearance > Theme dropdown with System, Light, Dark. (apps/extension/src/features/options/appearance-section.ts:35-60; features/appearance/themePreference.ts:5-9)
- VS Code: no AGI control; follows the editor theme. (webviewContent.ts:118-121,195-203)

**Before you start**

- None to choose. Web account sync needs sign-in. Mobile Cloud-mode choice is synced via the cloud store.

**Screens and controls**

- Web: three toggle buttons with icons and labels; the active one has aria-pressed. Also Code theme dropdown with hint 'Colours code blocks in dark mode. Light mode keeps high contrast.' (AppearanceSection.tsx:245-265)
- Mobile: three rows with a check on the selected one. (appearance/index.tsx:42-72)
- CLI: list with a bullet marking the active theme and a Preview of code lines. (theme_picker.rs:297-335)
- Chrome: select plus status text such as 'Follows your device's appearance.' (themePreference.ts:17-21)

**Journey**

1. Open the appearance control for the app.
2. Choose System, Light or Dark.
3. The surface recolours immediately.
4. The choice is remembered and, where supported, synced to the account.

**What the person sees and gets**

- Immediate recolour. CLI prints a confirmation message after choosing. Chrome shows 'Saving' then the description, or a load-failure text. (appearance-section.ts:66-100)

**Settings**

- Web default System, storage key theme. (ThemeConstants.ts:3-5)
- Mobile themeMode per store (local and cloud), default system. (localSettingsStore.ts:75; cloudSettingsStore.ts:71)
- Chrome key agi_theme_preference. (themePreference.ts:3)
- CLI config key theme.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: next-themes sets the dark or light class, default System, key 'theme'; data-theme and data-theme-preference are mirrored onto html. (ThemeProvider.tsx:41-53,22-26)
- Web: stored value outside light, dark, system is replaced with dark (not the default). (ThemeConstants.ts:9-14; ThemeProvider.tsx:15-20)
- Web: theme syncs to the account in the appearance namespace. (appearance-namespace.ts:14-27; CloudSettingsSync.tsx:96,124)
- Desktop (Electron): page reports preference to the main process, which sets the native theme, repaints windows and saves it. (apps/desktop/electron/preload.ts:218-236; main.ts:613-617,2604-2605)
- Mobile: theme picked from the local or cloud store depending on app mode; resolves System from the device scheme. (useTheme.ts:17-32; appearance/index.tsx:21-29)
- Mobile: cloud theme maps to the cloud settings payload. (apps/mobile/services/cloudSettingsMapping.ts:118-133,184-185)
- CLI: six palettes plus Auto; Auto picks Light on a light terminal. (theme_picker.rs:41-58,111-127; terminal_palette.rs:402,436)
- CLI: choosing saves to the project's UI settings. (config.rs:1263-1266; tui_app.rs:5262-5268)
- CLI: invalid theme in config is rejected with the allowed list. (config.rs:1562-1570)
- Chrome: choice stored in chrome.storage.local, applied as data-theme, side panel follows live changes. (themePreference.ts:29-41; side_panel.ts:16149)
- VS Code: webview colours come from editor theme variables with AGI fallbacks. (webviewContent.ts:195-203)

**Incomplete**

- CLI /theme sets only the project's setting; whether a user-wide default exists is not shown in the code opened. (config.rs:1263-1266)
- Web code-theme picker colours only dark mode; light mode uses a fixed high-contrast look. (AppearanceSection.tsx:250-253)

**Present but disconnected or switched off**

- nothing found

**Not available**

- VS Code has no AGI theme control by design.
- Mobile local choice does not sync; only the cloud store does. (cloudSettingsStore.ts:86 vs localSettingsStore.ts:91)

## 4. Required behaviour

**Established requirements**

- The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.32)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing silently routes Local data to the cloud. (source: (doc: AGENTS.md section 6) - mobile keeps a separate local and cloud theme store, which matches this.)

**Acceptance criteria**

1. Web: choosing Dark, Light or System changes the page at once and survives reload.
2. Web: an unknown stored theme value becomes dark.
3. Mobile: System follows the device light/dark scheme live.
4. Desktop: choosing Light makes a native dialog light.
5. CLI: /theme high-contrast-dark applies and prints a confirmation; /theme bogus prints the available list.
6. Chrome: choice made in Options changes the open side panel without reload.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The default for a person with no stored choice is System on Web, Mobile and Chrome. [inferred from the defaults cited]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document whether the CLI's project-level theme should also have a user-wide default.
- [proposed] Show the resolved value (light or dark) next to System in the Web control.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | ThemeConstants | `apps/web/shared/components/ThemeConstants.ts` | Theme list, default system, storage key, invalid fallback dark. |
| component | ThemeProvider | `apps/web/shared/components/ThemeProvider.tsx` | Wraps next-themes and mirrors data-theme attributes. |
| component | AppearanceSection | `apps/web/features/settings/sections/AppearanceSection.tsx` | Theme buttons and Code theme dropdown. |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs theme and other appearance fields for signed-in users. |
| other | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Shape of the synced appearance settings. |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Reads and writes the settings JSON. |
| table | user_settings | `apps/web/db/neon/0042_settings_cloud_sync.sql` | Per-user settings row. |
| hook | theme bridge in preload | `apps/desktop/electron/preload.ts` | Watches data-theme-preference and reports it (218-236). |
| service | Electron main theme handler | `apps/desktop/electron/main.ts` | rendererTheme handler (613) and startup apply (2604). |
| service | Electron preferences | `apps/desktop/electron/garnishCore.ts` | APPEARANCE_CHOICES system, light, dark (284) and saved appearance (627). |
| screen | Mobile Appearance screen | `apps/mobile/src/features/settings/appearance/index.tsx` | Three rows. |
| hook | useTheme | `apps/mobile/src/ui/theme/useTheme.ts` | Resolves colours from mode, device scheme and contrast. |
| store | mobile settings stores | `apps/mobile/stores/settings/localSettingsStore.ts` | Local themeMode; cloudSettingsStore.ts holds the cloud copy. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps theme to and from cloud settings. |
| component | CLI theme picker | `apps/cli/src/tui/widgets/theme_picker.rs` | ThemeChoice list, labels, descriptions, picker UI. |
| service | CLI palettes | `apps/cli/src/tui/terminal_palette.rs` | Six palettes and active theme index; light terminal detection. |
| command | CLI /theme | `apps/cli/src/tui/tui_app.rs` | Slash command handler (6371-6392); picker select (5262-5268). |
| config | CLI config theme key | `apps/cli/src/config.rs` | get (1463), set with validation (1562), project persist (1263). |
| component | Chrome theme preference | `apps/extension/src/features/appearance/themePreference.ts` | Parse, apply and follow the preference. |
| component | Chrome options appearance section | `apps/extension/src/features/options/appearance-section.ts` | Theme select in Options. |
| component | Chrome token CSS | `apps/extension/src/tokens.ts` | Light and dark palettes with data-theme override. |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Maps editor theme variables to AGI variables. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the person presses a theme button; next-themes sets the class and saves to localStorage key theme. | device | AppearanceSection.tsx:53; ThemeProvider.tsx:43-50 |
| Signed-in web: CloudSettingsSync PUTs the appearance namespace; the server writes the user_settings row. | device and our servers | CloudSettingsSync.tsx:165-185; route.ts:107-125 |
| Desktop: the preload script sees the attribute change and sends it by IPC; main sets the native theme and saves it. | device | preload.ts:218-236; main.ts:613-619 |
| Mobile: the selected store value and device scheme choose a colour set. | device | useTheme.ts:17-35 |
| Mobile Cloud mode: the cloud store theme is mapped into the cloud settings payload for sync. | device and our servers | cloudSettingsMapping.ts:118-133 (the engine that sends it, services/cloudSyncEngine.ts, was not opened) |
| CLI: choosing a theme sets the active palette and writes the project UI settings. | device | tui_app.rs:5262-5268; config.rs:1263-1266 |
| Chrome: writes agi_theme_preference to extension storage; open pages listen for changes. | device | themePreference.ts:29-41; appearance-section.ts:93-100 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web theme choice | Browser localStorage key theme; for signed-in users also the user_settings row (appearance) | Yes when signed in | Kept until changed or storage is cleared |
| Desktop appearance preference | Desktop preferences file via saveSettings | No | Kept until changed |
| Mobile themeMode | Persisted stores settings-store-local and the cloud store | Cloud store only | Kept; cloud teardown behaviour is covered by apps/mobile/__tests__/cloud-account-teardown.test.ts (not opened) |
| CLI theme | Project UI settings file | No | Kept until edited |
| Chrome theme | chrome.storage.local agi_theme_preference | Not synced (local area) | Kept until changed |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account needed to choose; account sync needs sign-in on Web and Mobile Cloud mode. |
| Permissions | None found in the code beyond the signed-in session and CSRF token on the save route. |
| Subscription | None found in the code; no plan gates themes. |
| Limits and metering | None found in the code for theme; the save route is rate-limited (route.ts:10), limit values unknown. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Theme works fully in Local mode. On Mobile, Local mode uses its own theme store separate from the Cloud one, so a Local choice never goes to the server. (useTheme.ts:17-25) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Before the page is ready (web) | Control shows dark until mounted to avoid a mismatch. | AppearanceSection.tsx:30-37 |
| Invalid stored value (web) | Reset to dark. | ThemeConstants.ts:9-14; ThemeProvider.tsx:18-20 |
| Device scheme unknown (mobile) | Treated as dark. | useTheme.ts:27-30 |
| Chrome storage read fails | Control enabled with a load-failure text; side panel falls back to system. | appearance-section.ts:77-83; themePreference.ts:36-40 |
| Cloud save fails (web) | Notice with retry; device keeps the choice. | SettingsPreferenceRow.tsx:8-25 |
| CLI unknown theme | Message listing available names. | tui_app.rs:6392-6396 |
| Offline, cancel, timeout | not handled in the code beyond local fallback. | AppearanceSection.tsx; ThemeProvider.tsx (no such handling) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/__tests__/ThemeProvider.test.tsx`: Constants, context, delegation to next-themes, data-theme mirroring.
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Theme buttons expose selection, set Light, captions, eight appearance controls.
- `apps/mobile/__tests__/theme-contrast.test.ts`: Mobile text colours readable on every surface in each theme.
- `apps/extension/__tests__/panel-theme.test.ts`: Chrome emits both palettes, themed in-page surfaces.
- `apps/cli/src/tui/widgets/theme_picker.rs`: Inline Rust tests: slug round trip (389), snapshot of the picker (421).
- `apps/web/features/settings/components/__tests__/CloudSettingsSync.test.tsx`: Cloud sync of appearance settings (title only; detail not opened).
- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: Web colour contrast (not opened).

**Test scenarios**

- **Web persist**
  1. Open Settings, Appearance, press Dark.
  2. Reload.
  - Expected: Page stays dark; localStorage theme is dark.
- **Web invalid value**
  1. Set localStorage theme to 'blue'.
  2. Reload.
  - Expected: Page uses dark and the stored value is replaced.
- **Desktop native dialog**
  1. In Desktop choose Light.
  2. Trigger a permission prompt.
  - Expected: The prompt is light.
- **Mobile follow system**
  1. Set Appearance to System.
  2. Change the phone between light and dark.
  - Expected: The app follows without restart.
- **CLI picker**
  1. /theme, choose High Contrast Dark.
  2. Restart in the same folder.
  - Expected: The theme is still applied.
- **Chrome live update**
  1. Open the side panel.
  2. In Options choose Light.
  - Expected: Side panel turns light without reload.

**Where to look when it fails**

- Check html data-theme and data-theme-preference.
- Look at localStorage theme and chrome.storage.local agi_theme_preference.
- Network response of PUT /api/settings/preferences.
- CLI: the config file ui theme value.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **CLI persists the theme only per project.** Affects: CLI users who want one theme everywhere.. Evidence: config.rs:1263-1266. Work needed: Confirm and, if needed, persist at user level.
- **Mobile Local theme does not sync, by design; Cloud theme syncs.** Affects: Mobile users who switch modes.. Evidence: localSettingsStore.ts:91; cloudSettingsStore.ts:86. Work needed: None required; document that theme is per mode.
- **Web invalid-value fallback is dark, not the System default.** Affects: Web users with corrupt storage.. Evidence: ThemeConstants.ts:7,9. Work needed: Decide if System is better; change constant and test.
- **CLI label is 'Ansi' not 'ANSI'.** Affects: Documentation only.. Evidence: theme_picker.rs:61-71. Work needed: Use the exact label in docs.

**Depends on**

- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- api:PUT /api/settings/preferences
- api:GET /api/settings/preferences
- table:user_settings
- store:settings-store-local
- store:chrome.storage.local
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- F006-10

## Unknown

- Whether the CLI reads a user-wide theme default.
- CommandPalette theme action (brief cites CommandPalette.tsx:143-161; not opened).
- How the mobile sync engine pushes theme (cloudSyncEngine not opened).
- Whether Electron shows the web ThemeProvider before the main-process value is applied (flash).
- Rate limit values.
