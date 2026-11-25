---
id: "F084-01"
type: "feature"
title: "Theme (light, dark or system)"
aliases: ["Theme", "Appearance", "Light, dark or system", "/theme picker", "Appearance row (Chrome Options)", "themeMode (mobile store field)", "S84.03"]
area: "84 General and appearance settings"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S84.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "table:user_settings", "store:agiworkforce-web-settings", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "api:GET /api/settings/sync", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-01 Theme (light, dark or system)

Lets a person choose light, dark or follow-the-device colours on Web, Desktop, Mobile, CLI and Chrome. Web and Mobile also save the choice to the signed-in account. The CLI has seven terminal themes. VS Code has no theme setting of its own.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.03](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8403).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Switches the colour palette of the app. Web, Desktop, Mobile and Chrome offer System, Light and Dark. The CLI offers seven terminal themes. The choice is kept on the device and, for signed-in Web and Mobile Cloud users, in the account.

**Why it exists.** People work in bright rooms, dark rooms and terminals. Claude and ChatGPT both let the person choose, so the product must too (doc: docs/product/requirements.md, section 16.1 lists Theme under Appearance settings). Accessible palettes in the CLI help low-vision and colour-blind people (apps/cli/src/tui/widgets/theme_picker.rs:40-57).

**Who uses it.** Every person on Web, Desktop, Mobile, CLI and Chrome. People who need high contrast or a colour-blind palette use the CLI themes.

**Problems it solves**

- A bright screen at night, or a dark screen in sunlight.
- A second device that does not match the first (Web and Mobile Cloud settings sync).
- Native dialogs on Desktop that did not match the chosen theme (apps/desktop/electron/main.ts:606-618).
- A flash of the wrong colour before the page loads (apps/web/shared/components/seo/theme-init-script.ts:1-40).

**Use cases**

- A person on Web switches from System to Dark in the evening, and the change shows at once.
- A person signs in on a second browser and finds the same theme already applied.
- A CLI user on a light terminal picks Auto or a high-contrast theme and the choice is still there next launch.
- A Chrome user forces the side panel to Dark while the browser stays light.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Appearance, row 'Theme' with three buttons System, Light, Dark (apps/web/features/settings/sections/AppearanceSection.tsx:23-27, 44-73). Desktop shows the same hosted page (doc: AGENTS.md section 5).
- Mobile: Settings, group 'Device', row 'Appearance', screen 'Appearance' with System, Light, Dark (apps/mobile/src/features/settings/index.tsx:670-676; apps/mobile/src/features/settings/appearance/index.tsx:13-17).
- CLI: type /theme with no argument to open the picker, or /theme <name> (apps/cli/src/repl/slash_commands.rs:575-598, 793-799). Names: auto, dark, light, ansi, high-contrast-dark, high-contrast-light, colorblind (apps/cli/src/tui/widgets/theme_picker.rs:51-59). Also 'theme' as a config key (apps/cli/src/config.rs:1562-1570).
- Chrome: extension Options page, section 'Appearance', row 'Theme' with System, Light, Dark (apps/extension/src/features/options/appearance-section.ts:36-70; apps/extension/src/features/appearance/themePreference.ts:5-9).
- VS Code: no theme setting found in apps/extension-vscode/package.json; the only 'theme' key there is the marketplace banner (package.json:26).

**Before you start**

- None for the device choice. Web keeps it in browser storage even when signed out.
- Account sync happens only when signed in on Web (apps/web/features/settings/components/CloudSettingsSync.tsx:192-201).

**Screens and controls**

- Web: three icon buttons labelled 'System theme', 'Light theme', 'Dark theme' with a pressed state (AppearanceSection.tsx:50-57).
- Mobile: three rows each with a title, a one-line description ('Match this device.', 'Bright neutral interface.', 'Dark neutral interface.') and a check mark on the active one (appearance/index.tsx:13-17, 39-73).
- CLI: an overlay list of seven themes with a code preview (theme_picker.rs header comment and ThemeChoice::ALL at line 51).
- Chrome: a drop-down. While loading it is disabled. A status line under the label describes the choice: 'Always light.', 'Always dark.', or "Follows your device's appearance." (appearance-section.ts:20-24, 66-77; themePreference.ts:15-19).

**Journey**

1. Open the settings screen of the app (or type /theme in the CLI).
2. Pick System, Light or Dark (CLI: pick one of seven).
3. The palette changes at once with no reload (web: AppearanceSection.tsx:53 calls setNextTheme; mobile: appearance/index.tsx:44).
4. The app saves the value on the device. Signed-in Web writes it to the account after 400 ms. Mobile Cloud mode pushes it in the next settings sync.
5. On the next launch the saved value is applied before or as the first screen paints.

**What the person sees and gets**

- The active choice shows as pressed or checked.
- Web shows an alert 'error text + This device keeps your choice.' with a Retry button when the account save or read fails (apps/web/features/settings/components/SettingsPreferenceRow.tsx:8-26).
- CLI prints 'Theme set to X, saved in <path>.' or 'Theme set to X for this session; it could not be saved: ...' (apps/cli/src/tui/tui_app.rs:5232-5245).
- Chrome shows 'Saving…', then the description; on failure 'Could not save your theme. Please try again.' and the old value returns (appearance-section.ts:14-16, 82-99).

**Settings**

- Web storage key 'theme' (apps/web/shared/components/ThemeConstants.ts:3).
- Account namespace 'appearance', field theme (apps/web/features/settings/lib/appearance-namespace.ts:12, 109-111).
- Mobile stores themeMode separately for Local and Cloud (apps/mobile/stores/settings/localSettingsStore.ts:75; apps/mobile/stores/settings/cloudSettingsStore.ts:71).
- CLI config key ui.theme (apps/cli/src/config.rs:1562-1570).
- Chrome storage key agi_theme_preference (themePreference.ts:3).
- Related: Contrast row (System or High) on Web (AppearanceSection.tsx:155-172).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: next-themes provider with default System and storage key 'theme' (apps/web/shared/components/ThemeProvider.tsx:41-54; apps/web/shared/components/ThemeConstants.ts:3-7).
- Web: the page gets data-theme and data-theme-preference attributes after each change (ThemeProvider.tsx:22-26).
- Web: an inline script sets the theme from storage before first paint (apps/web/shared/components/seo/theme-init-script.ts:1-40).
- Web: a stored value that is not light, dark or system is repaired to dark (ThemeProvider.tsx:18-20; ThemeConstants.ts:9-14).
- Web: theme is part of the 'appearance' account namespace, saved after 400 ms and flushed on page hide (CloudSettingsSync.tsx:37, 259-298, 313-326). A theme set while the account read was in flight wins over the late account value (CloudSettingsSync.tsx:48-58, 214-221).
- Desktop: the Electron preload watches the page's data-theme-preference and reports it to the main process (apps/desktop/electron/preload.ts:218-236). The main process sets nativeTheme.themeSource, repaints windows and saves 'appearance' in the shell settings file (apps/desktop/electron/main.ts:613-619). At start it applies the saved value (main.ts:2604-2605).
- Mobile: three modes, kept separately for Local and Cloud (appearance/index.tsx:21-29). The app sets the OS colour scheme from the active mode (apps/mobile/app/_layout.tsx:553-561). Cloud theme is sent to the account in the settings sync (apps/mobile/services/cloudSettingsMapping.ts:130-137, 180-188).
- CLI: seven themes. The saved slug is read before the first frame and defaults to Dark if missing or unknown (apps/cli/src/tui/tui_app.rs:650-660). The picker and /theme <name> both save to the project config (tui_app.rs:5260-5268; slash_commands.rs:793-799; apps/cli/src/config.rs:1263-1266).
- Chrome: Options saves to chrome.storage.local and applies at once; the side panel reads the value on load and on later changes (themePreference.ts:29-43; apps/extension/src/side_panel.ts:16149).

**Incomplete**

- Desktop gets the account value only through the hosted web page [inferred from AGENTS.md section 5 and the CloudSettingsSync mount in apps/web/app/AppRuntimeMounts.tsx:18-20].
- CLI persistence is per project (.agiworkforce/config.toml in the working folder) when set from the picker or /theme (apps/cli/src/config.rs:1162-1171, 1263-1266). The user-level key can be set with the config command (config.rs:1562-1570).
- Chrome keeps the theme on one device only; nothing sends it to the account (themePreference.ts:29-43).

**Present but disconnected or switched off**

- nothing found

**Not available**

- VS Code: no theme setting; no matching key in apps/extension-vscode/package.json. The extension has a script that checks its colours use editor theme tokens (apps/extension-vscode/package.json:1573) so it presumably follows the editor theme [inferred].
- CLI has no 'system' value; Auto follows the terminal background instead (theme_picker.rs ThemeChoice::applied at line 123).

## 4. Required behaviour

**Established requirements**

- The user can choose light, dark or system theme and it applies and persists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.03)
- Appearance settings are their own page and include Theme. (source: docs/product/requirements.md section 16.1 (lines 1269-1280))
- A stored value that is not valid falls back to dark on Web. (source: apps/web/shared/components/ThemeConstants.ts:9-14)
- If syncing fails, the device keeps the choice and the person can retry. (source: apps/web/features/settings/components/SettingsPreferenceRow.tsx:8-26)

**Acceptance criteria**

1. On Web, pressing Dark changes the page at once and a reload keeps Dark.
2. With System selected, changing the operating system appearance changes the app without a reload.
3. Signing in on a second browser shows the theme saved from the first.
4. On Desktop, a permission dialog drawn by the shell matches the chosen theme.
5. On Mobile, Local mode and Cloud mode can hold different themes.
6. In the CLI, choose High Contrast Dark, quit, start again in the same folder, and the theme is the same.
7. In Chrome Options, choose Light, then open the side panel: it is light.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A first frame before React loads should already show the right palette; the inline script is the mechanism [inferred from theme-init-script.ts:1-40].
- The CLI should offer a user-wide default as well as a project value [inferred; only the project path is used by the picker].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the CLI picker choice at user level by default, so one choice covers all folders.
- [proposed] Sync Chrome's theme to the account like Web.
- [proposed] Add an explicit theme note for VS Code stating it follows the editor theme.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AppearanceSection (Theme row) | `apps/web/features/settings/sections/AppearanceSection.tsx` | Web and Desktop Theme buttons |
| component | ThemeProvider | `apps/web/shared/components/ThemeProvider.tsx` | Wraps next-themes; repairs bad values; sets data-theme attributes |
| config | ThemeConstants | `apps/web/shared/components/ThemeConstants.ts` | Storage key 'theme', default System, fallback dark |
| hook | useAppTheme | `apps/web/shared/hooks/useAppTheme.ts` | Accepts only light, dark, system |
| other | THEME_INIT_SCRIPT | `apps/web/shared/components/seo/theme-init-script.ts` | Applies stored theme before first paint |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Reads and writes the account appearance namespace |
| service | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Maps the local settings to the account shape and back |
| endpoint | api:GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores account namespaces in public.user_settings |
| endpoint | api:GET/POST /api/settings/sync | `apps/web/app/api/settings/sync/route.ts` | Cloud-safe namespace pull and push used by Mobile |
| hook | watchThemePreference | `apps/desktop/electron/preload.ts` | Reports the page theme to Electron |
| service | rendererTheme handler | `apps/desktop/electron/main.ts` | Sets nativeTheme, repaints windows, saves appearance |
| service | paintWindows | `apps/desktop/electron/windowChrome.ts` | Repaints window backgrounds for the theme |
| screen | AppearanceScreen | `apps/mobile/src/features/settings/appearance/index.tsx` | Mobile theme choice |
| store | localSettingsStore / cloudSettingsStore | `apps/mobile/stores/settings/localSettingsStore.ts` | Per-mode themeMode; Cloud store is at apps/mobile/stores/settings/cloudSettingsStore.ts |
| hook | useTheme | `apps/mobile/src/ui/theme/useTheme.ts` | Resolves the colours from the active mode and the device scheme |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps themeMode to and from the account appearance object |
| component | ThemePicker | `apps/cli/src/tui/widgets/theme_picker.rs` | CLI theme list, slugs and preview |
| service | persist_theme_project | `apps/cli/src/config.rs` | Writes ui.theme to the project config |
| command | /theme | `apps/cli/src/repl/slash_commands.rs` | Lists, applies and saves a theme |
| service | terminal_palette | `apps/cli/src/tui/terminal_palette.rs` | Semantic colours for each theme |
| component | createAppearanceSection | `apps/extension/src/features/options/appearance-section.ts` | Chrome Options Theme drop-down |
| service | themePreference | `apps/extension/src/features/appearance/themePreference.ts` | Parse, apply and follow the saved Chrome theme |
| table | public.user_settings | `apps/web/app/api/settings/preferences/route.ts` | Row per user with a settings JSON and updated_at |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses a theme button; the hook passes the value to next-themes, which sets the page class and saves it in browser storage. | device | apps/web/features/settings/sections/AppearanceSection.tsx:53; apps/web/shared/hooks/useAppTheme.ts:12-21; apps/web/shared/components/ThemeProvider.tsx:41-54 |
| Desktop only: the preload sees the page attribute change and tells the main process, which sets the native theme and saves it in the shell settings file. | device | apps/desktop/electron/preload.ts:218-236; apps/desktop/electron/main.ts:613-619 |
| Signed-in Web: the sync component notices the change, waits 400 ms, then sends only the changed keys to the account settings endpoint. | device and our servers | apps/web/features/settings/components/CloudSettingsSync.tsx:259-298; apps/web/features/settings/lib/appearance-namespace.ts:181-195 |
| The server merges the patch into the user's settings row. | our servers | apps/web/app/api/settings/preferences/route.ts:108-125 |
| On another Web device, after sign-in the sync component reads the namespace and sets the theme, unless the person changed it meanwhile. | device and our servers | CloudSettingsSync.tsx:203-221 |
| Mobile Cloud mode: the theme is put in the settings snapshot and pushed with the sync engine; the pull applies it to the Cloud store. | device and our servers | apps/mobile/services/cloudSyncEngine.ts:905-925, 963-972; apps/mobile/services/cloudSettingsMapping.ts:130-137, 180-188 |
| CLI: the chosen slug is applied to the palette, then written to .agiworkforce/config.toml of the project. | device | apps/cli/src/tui/tui_app.rs:5260-5268; apps/cli/src/config.rs:1114-1142 |
| Chrome: the Options page writes agi_theme_preference to chrome.storage.local; the side panel listens for storage changes. | device | apps/extension/src/features/options/appearance-section.ts:79-99; apps/extension/src/features/appearance/themePreference.ts:29-43 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web theme choice | Browser localStorage key 'theme' | Yes for signed-in Web to the account namespace 'appearance' | Stays until the browser data is cleared or the person changes it; account copy stays in public.user_settings (no deletion rule found for the theme field). |
| Account appearance namespace | public.user_settings.settings (JSON) in the server database | Read by Web and Mobile | unknown deletion rule beyond account deletion (not traced) |
| Desktop appearance preference | Electron shell settings file under the user data folder | No; separate from the account value | Kept until changed (apps/desktop/electron/settingsStore.ts:20-60). |
| Mobile themeMode (Local and Cloud) | MMKV store 'settings-store-local' for Local (apps/mobile/stores/settings/localSettingsStore.ts:109-110); Cloud store persisted separately | Cloud only | Kept on the device until changed or the app data is removed. |
| CLI theme slug | .agiworkforce/config.toml in the project folder (picker) or ~/.agiworkforce/config.toml (config command) | No | Kept in the file |
| Chrome theme preference | chrome.storage.local key agi_theme_preference | No | Kept until the extension data is cleared |

**Models and providers.** No model or provider takes part. The theme is a display setting and never reaches a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed for the device choice on any app. Web and Mobile Cloud mode need a sign-in for the account copy (CloudSettingsSync.tsx:192-201). |
| Permissions | none found in the code. The account write passes the CSRF check and the signed-in user's database scope (apps/web/app/api/settings/preferences/route.ts imports requireCsrfToken and getUserScopedDb). |
| Subscription | No plan limit seen. No entitlement check in AppearanceSection.tsx or appearance/index.tsx. Not governed by plan:free, plan:basic, plan:pro or plan:max. |
| Limits and metering | The settings endpoint is rate limited under the 'settings-activity' and 'settings-org-patch' limits (apps/web/app/api/settings/preferences/route.ts:136, 180). Nothing is metered as usage. |
| Feature flags | none found in the code for the theme itself. |
| Model compatibility | Not related to any model. |
| Provider restrictions | none found in the code. |
| Local mode | Theme works in Local mode on every app and needs no payment or sign-in. On Mobile, Local mode has its own theme value that is never sent to the account (apps/mobile/src/features/settings/appearance/index.tsx:21-29; localSettingsStore.ts:75). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading before mount (Web) | The section shows dark until mounted, then the real value. | apps/web/features/settings/sections/AppearanceSection.tsx:30-37 |
| Invalid stored value | Web repairs to dark; Chrome falls back to system; CLI falls back to Dark. | ThemeProvider.tsx:18-20; themePreference.ts:11-13; apps/cli/src/tui/tui_app.rs:650-657 |
| Account read fails | Nothing is written to the account until a read succeeds; an alert with Retry appears. | CloudSettingsSync.tsx:245-252 |
| Account write fails | Alert shows the error and 'This device keeps your choice.' with Retry. | CloudSettingsSync.tsx:182-186; SettingsPreferenceRow.tsx:8-26 |
| Change made while the account read is in flight | The newer local choice wins, then is saved. | CloudSettingsSync.tsx:214-221; test CloudSettingsSync.theme-change.test.tsx |
| Page closes within 400 ms of a change | A pagehide handler sends the pending patch with keepalive. | CloudSettingsSync.tsx:313-326 |
| Storage unavailable (private window) | The init script catches the error and uses System. | apps/web/shared/components/seo/theme-init-script.ts:12-18 |
| Chrome load or save error | Load error: panel follows the device and a message shows. Save error: the old value is restored. | appearance-section.ts:14-16, 82-99 |
| CLI cannot write the config file | The theme applies for the session and the message says it could not be saved. | apps/cli/src/tui/tui_app.rs:5242-5245 |
| Signed out on Web | Sync is switched off and the status is cleared; local choice keeps working. | CloudSettingsSync.tsx:194-201 |
| Offline | not handled in the code beyond the failed-write alert and Retry; no queue to retry later was found. | CloudSettingsSync.tsx:182-186 |
| Accessibility | Web buttons carry aria-pressed; Mobile rows carry a selected state and a label 'Set appearance to X'; CLI offers high-contrast and colour-blind themes. | AppearanceSection.tsx:55-56; appearance/index.tsx:45-47; theme_picker.rs:40-57 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/__tests__/ThemeProvider.test.tsx`: Storage key is 'theme', default is System, provider delegates to next-themes, data-theme mirrors the resolved theme, unknown values are repaired to dark.
- `apps/web/shared/components/__tests__/theme-init-script.test.ts`: The inline script equals the published file, applies a valid stored theme before hydration, keeps the system preference apart from the palette, fails closed to dark.
- `apps/web/shared/hooks/useAppTheme.test.tsx`: The theme hook (file exists; individual cases not opened).
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Selected theme is exposed to assistive technology, choosing Light sets it, each option shows its name.
- `apps/web/features/settings/components/__tests__/CloudSettingsSync.theme-change.test.tsx`: A newer local theme wins over a late account value and is then saved.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Mapping to and from the account shape, ignoring invalid values, sending only changed keys.
- `apps/desktop/electron/__tests__/preloadBridge.test.ts`: The theme report: sends the resolved theme from an older page, keeps System when only the palette changes.
- `apps/cli/src/tui/widgets/theme_picker.rs`: In-file tests: every slug round-trips through from_arg and a snapshot of the picker.
- `apps/cli/src/tui/terminal_palette.rs`: In-file tests: each theme index resolves to its own palette and a dark or light base.
- `apps/extension/__tests__/panel-theme.test.ts`: Both palettes are emitted and differ; the preference storage itself is not covered by this file.

**Test scenarios**

- **Web theme persists**
  1. Open Settings, Appearance.
  2. Press Dark, then reload the page.
  - Expected: The page is dark immediately after reload with no light flash, and the Dark button is pressed.
- **Account sync across browsers**
  1. Sign in on browser A and press Light.
  2. Wait one second.
  3. Sign in on browser B.
  - Expected: Browser B shows Light. A row in user_settings has appearance.theme = light.
- **Sync failure**
  1. Block the /api/settings/preferences request in dev tools.
  2. Press Dark.
  - Expected: The page turns dark; an alert shows the error text and 'This device keeps your choice.' with Retry. Unblock and press Retry: the alert goes.
- **Desktop native dialog**
  1. In the Desktop app set Light while the operating system is dark.
  2. Trigger a permission prompt.
  - Expected: The prompt is light, matching the page.
- **CLI restart**
  1. In a project folder run the CLI and type /theme, choose Colorblind.
  2. Quit and start the CLI in the same folder.
  - Expected: Colorblind is active and .agiworkforce/config.toml holds ui theme = colorblind.
- **Mobile separate modes**
  1. In Local mode set Light.
  2. Switch to Cloud mode and open Appearance.
  - Expected: Cloud shows its own value (System by default), not Light.

**Where to look when it fails**

- Web: browser storage key 'theme'; attributes data-theme and data-theme-preference on <html>.
- Web sync: alert text 'Your settings did not reach your account.' or 'Your settings could not be synced.' (CloudSettingsSync.tsx:183, 249).
- Server: logger lines 'Settings sync pull failed' in apps/web/app/api/settings/sync/route.ts; table public.user_settings.
- CLI: message 'Theme set to X for this session; it could not be saved'.
- Chrome: status text 'Could not save your theme. Please try again.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- Mobile: [70-qa/test-plans/mobile/084-general-and-appearance-settings.md](../../70-qa/test-plans/mobile/084-general-and-appearance-settings.md)
- CLI: [70-qa/test-plans/cli/084-general-and-appearance-settings.md](../../70-qa/test-plans/cli/084-general-and-appearance-settings.md)
- Chrome: [70-qa/test-plans/chrome/084-general-and-appearance-settings.md](../../70-qa/test-plans/chrome/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **VS Code has no theme setting and no stated rule that it follows the editor theme.** Affects: VS Code. Evidence: No theme key in apps/extension-vscode/package.json (only the banner at line 26).. Work needed: Decide and document; if wanted, add a setting or note.
- **CLI picker and /theme save only to the project folder, so another folder starts on Dark again.** Affects: CLI. Evidence: apps/cli/src/config.rs:1263-1266; slash_commands.rs:793-799. Work needed: Save at user level or fall back to the user value.
- **Chrome theme is not synced to the account.** Affects: Chrome. Evidence: themePreference.ts:29-43 uses chrome.storage.local only. Work needed: Add an account namespace read and write, or record the decision to keep it per device.
- **The Web repair sends invalid values to dark while the default is System; Chrome repairs to System.** Affects: Web, Chrome. Evidence: ThemeConstants.ts:5-9 vs themePreference.ts:11-13. Work needed: Pick one fallback for both (product decision).
- **No retry queue when offline; only manual Retry.** Affects: Web. Evidence: CloudSettingsSync.tsx:182-186. Work needed: Retry on reconnect.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- table:user_settings
- store:agiworkforce-web-settings
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- api:GET /api/settings/sync
- mode:local
- mode:cloud

## Unknown

- Whether Desktop also gets a window theme from the account value on first sign-in before the page reports it (only the preload report path was read).
- How long account settings are retained after account deletion (not traced).
- Individual cases inside apps/web/shared/hooks/useAppTheme.test.tsx and the other Desktop tests were not opened.
- Whether the VS Code extension follows the editor theme everywhere (only a token check script name was seen).
