---
id: "F084-11"
type: "feature"
title: "Desktop launch and quick access"
aliases: ["Run on startup", "Launch at Login", "Open at login", "Quick Ask shortcut", "Quick-ask window", "Companion window", "Startup destination", "Garnish shortcuts", "S84.20", "S84.21", "S84.22"]
area: "84 General and appearance settings"
available_on: ["desktop"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S84.20", "S84.21", "S84.22"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/launchAtLogin.ts", "file:apps/desktop/electron/shortcuts.ts", "file:packages/contracts/local-runtime/src/host-bridge.ts", "store:settings.json", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-observability-and-operations", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-11 Desktop launch and quick access

The public Desktop app (Electron) can start at login ('Run on startup' in Settings, or 'Launch at Login' in the app menu) and lets the person pick the Quick Ask shortcut from a short list. The quick-ask window cannot be switched off or moved. A choice of what the app opens to has no control on any app.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.20](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8420), [S84.21](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8421), [S84.22](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8422).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Desktop: starts the app when the person logs in to the computer, and sets the global shortcut that opens the small Quick Ask window from any app. The same settings page also sets five other global shortcuts (new chat, screenshot, window shot, voice, stop agents).

**Why it exists.** Quick access from anywhere is the main reason to install a desktop app. Launch at login keeps it ready. The brief's S84.20 asks for a startup destination, S84.21 for launch at login and S84.22 for companion window options (enable, shortcut, placement).

**Who uses it.** Desktop people who want AGI one key press away.

**Problems it solves**

- Having to open the app each day
- A default shortcut clashing with another app
- Reaching AGI without switching windows

**Use cases**

- A person turns on Run on startup so Desktop is waiting after login.
- A person moves Quick Ask from the default to another listed shortcut because another app uses it.
- A person turns Quick Ask off by choosing 'No shortcut'.

## 2. User experience

**Where to find it**

- Desktop (Electron): Settings, group 'Desktop app', item 'General', section 'General desktop settings': row 'Run on startup' (hint 'Start Desktop when you log in to this computer.') and row 'Quick Ask shortcut' (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:36, 92-96, 290-327; nav in packages/ui/ui/src/settings-nav.ts:296).
- Desktop menu: on macOS the app menu has a check item 'Launch at Login' (apps/desktop/electron/appMenu.ts:139-145); other systems have it in another menu (line 221). File menu has item 'Quick Ask' showing the shortcut (appMenu.ts:183-187); the tray menu also has 'Quick Ask' (appMenu.ts:621).
- Desktop (Tauri retained build): a 'Launch at login' setting (apps/desktop/src/features/settings/tabs/General/index.tsx:228-285).
- Chrome: no companion window setting found; the brief's Chrome line points at approval code (apps/extension/src/side_panel.ts:7380-7392) which is unrelated.
- Web, mobile, VS Code, CLI: nothing.

**Before you start**

- Desktop app running (the section appears only when the host bridge exists; DesktopSettingsSection returns null otherwise, line 275).
- A shortcut can be registered only if the operating system and other apps have not taken it.

**Screens and controls**

- Switch 'Run on startup'.
- Select 'Quick Ask shortcut' with the listed choices plus 'No shortcut' (choices Alt+Shift+Space, CommandOrControl+Shift+Space, CommandOrControl+Alt+A per packages/contracts/local-runtime/src/host-bridge.ts:162).
- A note under the row when the shell reports 'Already used by another Desktop shortcut.', 'Already used by another app.' or 'Not a shortcut this computer can register.' (DesktopSettingsSection.tsx:158-168).
- A confirmation dialog 'Open <product> at login?' with buttons 'Cancel' and 'Open at login' when turning it on (main.ts:2060-2073).

**Journey**

1. Open Settings, then Desktop app, then General.
2. Turn on Run on startup; confirm 'Open at login'.
3. The switch shows what the system accepted.
4. Choose another Quick Ask shortcut in the select; the shell registers it.
5. Press the shortcut anywhere; the Quick Ask window opens near the top center of the display the pointer is on.

**What the person sees and gets**

- Switch reflects the system's answer, not only the request (launchAtLogin.ts:25-28).
- A note appears when a shortcut could not be claimed; a native notification 'Shortcut unavailable' appears once with a menu fallback hint (shortcuts.ts:34-60).
- Error line 'That setting was not saved.' when a write is refused.

**Settings**

- launchAtLogin
- quickAskShortcut (default Alt+Shift+Space [the first listed choice, host-bridge.ts:171])
- Other shortcuts in the same list (newChat, screenshot, windowShot, voice, stop)
- showInMenuBar (related)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Launch at login is opt-in. The system's answer is the truth: the app reads the login item state, aligns its stored value with it, and does not re-add the item at launch (apps/desktop/electron/launchAtLogin.ts:4-28).
- Setting it saves the choice, asks the system, then stores what the system now reports (launchAtLogin.ts:23-28).
- Turning it on asks for confirmation; turning it off does not (main.ts:2052-2075, 2185-2190). docs/decisions/wire-or-cut.md:759 records that asking on enable is intended.
- The app menu check item calls the same setter and restores the check when the change fails (appMenu.ts:28-35).
- The page may set a shortcut only to a listed choice, to 'No shortcut' where allowed, or to the value it already has (apps/desktop/electron/garnishCore.ts:192-199). Others are refused with a message (main.ts:2159-2166).
- Shortcuts are registered with the system; a duplicate, taken or malformed chord is reported as a status, not silently dropped (apps/desktop/electron/shortcuts.ts:55-98).
- Stop Agents can never be off or lost: if a change leaves it unregistered, the old chords are restored and the person is told (shortcuts.ts:130-169).
- Quick Ask window opens centred in the upper part of the display nearest the pointer (apps/desktop/electron/quickAsk.ts:140-142).

**Incomplete**

- The brief expects enable and placement options for the companion window; only the shortcut is configurable. There is no way to switch the Quick Ask window off except choosing 'No shortcut', while the menu item still opens it (appMenu.ts:183-187) [inferred].
- The shortcut select offers only a few listed chords, not any chord (host-bridge.ts:161-170).

**Present but disconnected or switched off**

- Tauri build 'Launch at login' belongs to the retained internal code.

**Not available**

- Startup destination (new chat, last conversation, project) on every app.
- Companion window enable switch or placement on Desktop.
- Chrome companion window settings.
- Launch at login on web, mobile, VS Code, CLI (not applicable).

## 4. Required behaviour

**Established requirements**

- The user can choose what the app opens to on launch. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.20)
- The desktop app can be set to launch at login. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.21)
- The user can configure the quick-access window (enable, shortcut, where it appears). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.22)
- Turning launch at login on is asked about; turning it off is not. (source: docs/decisions/wire-or-cut.md:759; apps/desktop/electron/main.ts:2052-2075)
- A shortcut is registered for every app on the computer, so this app does not take a chord a page names; it takes only listed ones. (source: apps/desktop/electron/main.ts:2152-2156)
- The Stop Agents shortcut can never be switched off. (source: apps/desktop/electron/garnishCore.ts (comment above ALWAYS_ON_SHORTCUTS))

**Acceptance criteria**

1. Turning Run on startup on shows a confirmation; Cancel leaves it off and the switch off.
2. After confirming, the system lists the app as a login item and the switch shows on.
3. Removing the login item in system settings makes the switch show off the next time the page reads preferences.
4. Choosing another Quick Ask shortcut makes the new chord open the window and the old one stop.
5. Choosing a chord another app holds shows 'Already used by another app.' and the app keeps working through the menu.
6. Stop Agents cannot be set to 'No shortcut'.
7. Failed save shows 'That setting was not saved.' and leaves the value unchanged.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A startup-destination setting would need a place in the shell's settings or the appearance namespace [inferred].
- A Quick Ask on/off switch is separate from 'No shortcut' because the menu still opens it [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Open on start' with choices New chat, Last conversation, Project, implemented in the hosted page route.
- [proposed] Add a Quick Ask on/off and a placement choice if the owner wants parity with the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Hosted page rows 'Run on startup' and 'Quick Ask shortcut' (lines 290-327). |
| service | launchAtLogin | `apps/desktop/electron/launchAtLogin.ts` | Reads and sets the system login item and mirrors it into settings. |
| command | writeHostPreferences | `apps/desktop/electron/main.ts` | Validates shortcut writes, asks to confirm launch at login, saves other preferences (lines 2152-2225). |
| command | confirmLaunchAtLogin | `apps/desktop/electron/main.ts` | Native question dialog (line 2060). |
| service | shortcuts | `apps/desktop/electron/shortcuts.ts` | Registers global shortcuts, reports status, restores Stop Agents. |
| service | garnishCore | `apps/desktop/electron/garnishCore.ts` | Defaults, normalisation, pageMayWriteShortcut, window position. |
| store | settingsStore (Electron) | `apps/desktop/electron/settingsStore.ts` | settings.json in the user data folder, durable and best-effort saves. |
| service | quickAsk | `apps/desktop/electron/quickAsk.ts` | The Quick Ask window and its placement. |
| component | appMenu | `apps/desktop/electron/appMenu.ts` | 'Launch at Login' check items and 'Quick Ask' item. |
| config | host-bridge contract | `packages/contracts/local-runtime/src/host-bridge.ts` | HostPreferences, shortcut choices and defaults, menu shortcut list. |
| hook | useDesktopHost | `apps/web/features/desktop-host/lib/host.ts` | Bridge to readPreferences and writePreferences. |
| config | settings nav | `packages/ui/ui/src/settings-nav.ts` | 'Desktop app' group with 'General' item. |
| component | Tauri LaunchAtLoginSetting | `apps/desktop/src/features/settings/tabs/General/index.tsx` | Retained build's launch setting (line 228). |
| test | hostPreferences test | `apps/desktop/electron/__tests__/hostPreferences.test.ts` | Host preference handling incl. launchAtLogin. |
| test | garnishCore test | `apps/desktop/electron/__tests__/garnishCore.test.ts` | pageMayWriteShortcut and shortcut rules. |
| test | shortcuts test | `apps/desktop/electron/__tests__/shortcuts.test.ts` | Registration statuses. |
| test | appMenu test | `apps/desktop/electron/__tests__/appMenu.test.ts` | Menu items incl. launch at login. |
| test | DesktopSettingsSection test | `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx` | Hosted rows. |
| test | HostShortcuts test | `apps/web/features/desktop-host/__tests__/HostShortcuts.test.tsx` | Shortcut rows in the page. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips Run on startup; the page calls host.writePreferences({launchAtLogin}). | device | DesktopSettingsSection.tsx:290-297 |
| The shell, if turning on, shows the native 'Open at login?' question; Cancel stops the change. | device | main.ts:2185-2190 |
| The shell saves launchAtLogin to settings.json, sets the system login item and reads back what the system holds. | device | launchAtLogin.ts:23-28 |
| The page receives the new state and shows the system's answer. | device | DesktopSettingsSection.tsx:208-226 |
| Shortcut change: shell checks the value is a listed choice, saves, unregisters and registers all global shortcuts, reports status. | device | main.ts:2159-2181; shortcuts.ts:130-169 |
| Press of the shortcut toggles the Quick Ask window. | device | main.ts:1936; quickAsk.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| launchAtLogin, quickAskShortcut and other shortcuts | settings.json in the Desktop user data folder; login item in the operating system | No account sync | Kept on the computer; the system login item is removed by turning the switch off or in system settings. |

**Models and providers.** None for these settings. The Quick Ask window itself sends chats through the normal chat pipeline (SYS-chat-turn-pipeline), outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required to change these settings; the Quick Ask chat itself follows the normal sign-in rules (not traced). |
| Permissions | Operating system login item permission; global shortcut registration; on macOS the system may show its own login-items notice [inferred]. |
| Subscription | No plan limit was seen. |
| Limits and metering | none found in the code |
| Feature flags | The Desktop section exists only when the Electron host bridge is present. Some rows (menu bar, dictate elsewhere, keep awake) appear only when the shell reports them (DesktopSettingsSection.tsx:302, 380-398). |
| Model compatibility | Not model dependent. |
| Provider restrictions | None. |
| Local mode | Works fully on the device with no account; it is a local shell setting. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Preferences not yet loaded | Controls disabled. | DesktopSettingsSection.tsx:296, 318 |
| Read fails | Error 'These settings could not be read from the app.' | DesktopSettingsSection.tsx:40, 242-244 |
| Write refused (unlisted chord) | Error message from the shell naming the shortcut. | main.ts:2152-2156, 2163-2166 |
| Chord taken by another app | Saved but status taken; note shown; native notification once; menu or tray fallback. | shortcuts.ts:34-60, 80-98 |
| Stop Agents conflict | Change undone; message tells the person to choose another. | shortcuts.ts:114-125, 150-169 |
| System refused the login item | Returned state is off and the switch shows off. | launchAtLogin.ts:25-28 |
| Login item removed outside the app | Next sync of state shows off; the app does not re-add it. | launchAtLogin.ts:4-21 |
| Settings file write fails | Durable saves throw 'The setting could not be saved on this computer, so it was not changed.' | settingsStore.ts:62-74 |
| Window focus returns | The page reloads preferences. | DesktopSettingsSection.tsx:247-249 |
| Startup destination | not handled in the code | No code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/hostPreferences.test.ts`: Host preferences incl. launchAtLogin (20 mentions).
- `apps/desktop/electron/__tests__/garnishCore.test.ts`: pageMayWriteShortcut and defaults.
- `apps/desktop/electron/__tests__/shortcuts.test.ts`: Shortcut registration.
- `apps/desktop/electron/__tests__/appMenu.test.ts`: Menu including launch at login.
- `apps/desktop/electron/__tests__/desktopLifecycle.test.ts`: Lifecycle incl. launch at login.
- `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx`: Hosted settings rows.
- `apps/web/features/desktop-host/__tests__/HostShortcuts.test.tsx`: Shortcut rows.
- `apps/desktop/src/features/settings/tabs/General/LaunchAtLoginSetting.test.tsx`: Tauri build launch setting.

**Test scenarios**

- **Enable launch at login**
  1. Open Settings, Desktop app, General.
  2. Turn on Run on startup.
  3. Confirm 'Open at login'.
  4. Check the system's login items list.
  - Expected: Entry present; switch on.
- **Cancel the question**
  1. Turn the switch on and press Cancel.
  - Expected: Switch stays off.
- **Outside removal**
  1. Remove the app from system login items.
  2. Return to the app window and look at the switch.
  - Expected: Switch shows off.
- **Move Quick Ask**
  1. Choose a different listed shortcut.
  2. Press the old one, then the new one.
  - Expected: Only the new one opens the window.
- **Clash**
  1. Choose a chord another app holds.
  - Expected: Note 'Already used by another app.'; menu item still opens Quick Ask.
- **Stop Agents guard**
  1. Look for 'No shortcut' in the Stop agents shortcut select.
  - Expected: Not offered.

**Where to look when it fails**

- Console warnings '[shortcuts] could not register the <label> shortcut' and '[launch-at-login] the change was not saved:' (shortcuts.ts:48-52; appMenu.ts:33).
- settings.json warning '[settings] could not persist settings.json:'.
- Native notification titled 'Shortcut unavailable'.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **Startup destination has no control.** Affects: All apps. Evidence: S84.20; no code found. Work needed: Decide scope and design; implement per app.
- **Quick Ask has no on/off or placement option.** Affects: Desktop. Evidence: quickAsk.ts:140-142 fixed placement. Work needed: Add settings if wanted.
- **Brief says Chrome companion is done, but the cited code is the approval UI.** Affects: Brief accuracy. Evidence: side_panel.ts:7380-7392. Work needed: Correct the brief row.
- **Shortcut choices limited to a short list.** Affects: Desktop. Evidence: host-bridge.ts:161-170; garnishCore.ts:192. Work needed: Only if owner wants free recording; the shell rule exists for safety.
- **Turning launch at login off is not asked about, by decision.** Affects: Desktop. Evidence: main.ts:2052 comment. Work needed: None.
- Not built on: Web, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:desktop
- file:apps/desktop/electron/launchAtLogin.ts
- file:apps/desktop/electron/shortcuts.ts
- file:packages/contracts/local-runtime/src/host-bridge.ts
- store:settings.json
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-observability-and-operations
- mode:local

## Unknown

- Whether any app besides Desktop opens to a chosen place on launch by other means.
- How the Quick Ask window behaves when signed out (not traced).
- Whether macOS shows a system prompt when the login item is added.
- No test was run here.
