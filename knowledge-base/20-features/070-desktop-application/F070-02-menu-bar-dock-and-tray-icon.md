---
id: "F070-02"
type: "feature"
title: "Menu bar, Dock and tray icon"
aliases: ["Menu bar", "Application menu", "Dock menu", "Tray", "Menu bar icon", "Show in menu bar", "S70.02", "S70.03"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.02", "S70.03"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/appMenu.ts", "file:apps/desktop/electron/tray.ts", "F070-01", "F070-03", "F070-04", "F070-05", "SYS-shared-ui-and-design", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-02 Menu bar, Dock and tray icon

The desktop app installs a native menu bar (File, Edit, View, History, Window, Help, plus an app menu on Mac), a Dock menu on Mac, and a tray or menu bar icon with quick actions and agent activity. The icon follows a Menu bar switch but stays while an agent runs or computer use is granted.

Area: [70. Desktop application](README.md). Requirement items: [S70.02](../../10-requirements/capabilities/070-desktop-application.md#s7002), [S70.03](../../10-requirements/capabilities/070-desktop-application.md#s7003).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives native menus whose items send real actions to the main process or to the page, and a tray icon listing open, new chat, running agents, shortcuts, update check and quit. (appMenu.ts:579-593, tray.ts:166-207)

**Why it exists.** The brief requires a native menu bar with real actions and a tray that can be turned off (S70.02, S70.03). The tray is also one of two ways to stop an agent from outside its window (main.ts:1850-1857 comment).

**Who uses it.** Desktop users who prefer menus, keyboard accelerators and quick access while the window is hidden.

**Problems it solves**

- Without a menu Electron shows a default menu with developer tools (appMenu.ts:12-19).
- A hidden app needs a way back; the tray and Dock menu provide it.
- An agent that controls the screen must always be stoppable from outside the window; the tray stays then (main.ts:1858-1864).

**Use cases**

- Choose File > New Chat to open a chat.
- Click the tray icon on Windows to open the window.
- See a running agent in the tray list and click it to open that session (tray.ts:126-139).
- Choose Help > Troubleshooting > Copy Diagnostics when contacting support (appMenu.ts:564-571).

## 2. User experience

**Where to find it**

- Desktop only. Mac: menu bar at the top of the screen, app menu named after the app, Dock right-click menu with 'New Chat', 'New Window', 'Quick Ask' (appMenu.ts:617-623). Windows/Linux: window menu bar and the system tray.
- Settings switch labelled 'Menu bar' with hint 'Show Desktop in the menu bar.' (DesktopSettingsSection.tsx:51-52, :355-361).

**Before you start**

- Desktop app running. The menu bar switch defaults to on (garnishCore.ts:566).

**Screens and controls**

- File: New Chat, New Temporary Chat, New Project, Open Folder, Close, Close All, Quick Ask, Screenshot to Chat, Stop Computer Use, Take Over Screen Control, Hand Back Screen Control; on Windows/Linux also Settings, Launch at Login, Quit (appMenu.ts:159-232).
- Edit: Undo, Redo, Cut, Copy, Paste, Select All, Find submenu, Focus Follow-up (appMenu.ts:261-281).
- View: Toggle Sidebar, Search, Show/Hide Terminal, Show/Hide Side Chat, tab items, Copy URL, Show Changes, Show Files, zoom items, full screen, Reload (appMenu.ts:283-415).
- History: Back, Forward, Previous Chat, Next Chat (appMenu.ts:417-436).
- Window: see F070-04.
- Help: Help, What's New, Support, Keyboard Shortcuts, Send Feedback, Start Performance Trace, Troubleshooting (Open Logs, Copy Diagnostics, Clear Cache and Restart...), Open-Source Licenses, Check for Updates on Windows/Linux (appMenu.ts:545-577).
- Tray: Open <app name>, New Chat, 'Waiting for Approval' and 'Running' session lists, 'Stop All Agents...', 'Hand Back Screen Control', 'Stop Computer Use and Revoke Access...', Quick Ask, Screenshot to Chat, Window to Chat, Dictation (each with its chord), Shortcuts submenu, 'Check for Updates...', Quit (tray.ts:141-207).

**Journey**

1. Open a menu and pick an item.
2. Items that depend on state are disabled, for example 'Move Conversation to New Window' without a conversation, or 'Take Over Screen Control' unless computer use is active (appMenu.ts:206, :456-461).
3. For the tray, click the icon (Windows/Linux click opens the window; Mac shows the menu) (tray.ts:216-218).
4. Turn the icon off from Settings; it is removed if nothing needs it (main.ts:2203-2206, :1858-1872).

**What the person sees and gets**

- The menu is rebuilt on window focus and blur so labels like Show Terminal and Always on Top stay true (main.ts:2625-2628).
- A native notification 'Shortcut not changed' when a tray shortcut change is refused (tray.ts:47, :86-88).
- Tray tooltip shows the app name (tray.ts:213).

**Settings**

- Menu bar (showInMenuBar, default on) (garnishCore.ts:566).
- Launch at Login checkbox in the menu (appMenu.ts:140-145).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Menu template builds all six named menus and calls real handlers (appMenu.ts:579-593, main.ts:2503-2560).
- Items that depend on state are disabled (appMenu.ts:200, :206, :212, :298-308, :352, :455-461, :467).
- Menu is reinstalled on focus, blur and computer-use change (main.ts:2625-2628, main.ts:2647-2653).
- Dock menu on Mac (appMenu.ts:625-627, main.ts:2621-2625).
- Tray is created, destroyed and refreshed by syncTray using trayNeeded (main.ts:1858-1872).
- Tray stays while an agent turn runs or computer use is granted (main.ts:1858-1864).
- Tray falls back to a text-only tray if icon assets are missing (tray.ts:67-70).
- Developer Tools item appears only in non-packaged builds (appMenu.ts:411-413).

**Incomplete**

- Some items only send a host command to the page (for example Find, tabs); they work only if the page handles them. The page-side handler is hooks use-host-commands (DesktopHostMount.tsx:11).
- The Settings page is a website; whether it disables the Menu bar switch while an agent runs was not seen (DesktopSettingsSection.tsx:355-361 shows no such disable).

**Present but disconnected or switched off**

- View > Show Terminal and Show Side Chat are disabled until the page reports the pane (main.ts:1531-1556).

**Not available**

- No tray or Dock on web, mobile, CLI, VS Code or Chrome (brief n/a).
- The tray menu has no separate 'voice' or 'screenshot' wording; they appear as Dictation, Screenshot to Chat and Window to Chat (tray.ts:174-196).

## 4. Required behaviour

**Established requirements**

- The app installs a native menu bar (File, Edit, View, History, Window, Help) whose items perform real actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.02)
- A menu-bar/tray icon offers open, new chat, Quick Ask, screenshot, voice, shortcuts and quit, and can be turned off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.03)
- Items that are not ready are disabled, not silent. (source: task Should list for F070-02)
- The tray is shown when the preference is on, or an agent runs, or computer use is granted; otherwise removed. (source: task Should list; code main.ts:1858-1864)
- The tray hide preference is honoured only while there is nothing to stop. (source: main.ts:1850-1857 comment)

**Acceptance criteria**

1. Every top-level menu named in the brief exists and each item runs an action or is disabled.
2. With Menu bar switch off and nothing running there is no tray icon.
3. With the switch off, start an agent turn: the tray icon appears and its list shows the running session.
4. Grant computer use with the switch off: the tray remains until the grant is revoked.
5. Open Logs and Copy Diagnostics from Help > Troubleshooting complete without error.
6. Window > Move Conversation to New Window is disabled with no conversation open.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The page's Menu bar switch can still show 'off' while the tray is kept for safety [inferred from main.ts:2203-2206 saving the value then calling syncTray].
- Menu text uses 'Settings...' on Mac and 'Settings' elsewhere (appMenu.ts:119).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a hint under the Menu bar switch when it is held on by a running agent or a computer-use grant.
- [proposed] Add a test that each menu item either has a handler or enabled:false.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | appMenu | `apps/desktop/electron/appMenu.ts` | Builds the menu template, Dock menu and installs it (appMenu.ts:579-627). |
| service | tray | `apps/desktop/electron/tray.ts` | Creates, refreshes and destroys the tray; builds its menu (tray.ts:166-234). |
| service | main installMenu | `apps/desktop/electron/main.ts` | Wires menu actions to window, capture and computer-use handlers (main.ts:2503-2560). |
| service | syncTray and trayNeeded | `apps/desktop/electron/main.ts` | Decides whether the tray exists (main.ts:1858-1872). |
| service | garnishHandlers | `apps/desktop/electron/main.ts` | Shared handlers used by tray, menu and shortcuts (main.ts:1932-1948). |
| service | garnishCore | `apps/desktop/electron/garnishCore.ts` | Defaults and normalisation of preferences, including showInMenuBar (garnishCore.ts:528-581). |
| service | launchAtLogin | `apps/desktop/electron/launchAtLogin.ts` | Reads and writes the login item used by the menu checkbox. |
| config | HOST_MENU_SHORTCUTS and HostCommand | `packages/contracts/local-runtime/src/host-bridge.ts` | Contract for menu accelerators and page commands (appMenu.ts:109-113). |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Menu bar switch and shortcut rows (DesktopSettingsSection.tsx:51, :355). |
| hook | useHostCommands | `apps/web/features/desktop-host/hooks/use-host-commands.ts` | Receives menu commands inside the page (DesktopHostMount.tsx:11,:35). |
| service | nativeSurface | `apps/desktop/electron/runtime/nativeSurface.ts` | Native notifications shown by the tray (tray.ts:6). |
| test | appMenu test | `apps/desktop/electron/__tests__/appMenu.test.ts` | Menus present, accelerators shown not claimed, host commands. |
| test | tray test | `apps/desktop/electron/__tests__/tray.test.ts` | Shortcut customisation and agent activity list. |
| test | HostCommands test | `apps/web/features/desktop-host/__tests__/HostCommands.test.tsx` | Page-side handling of menu commands. |
| test | DesktopSettingsSection test | `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx` | Settings rows including menu bar switch. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At ready, the app syncs the tray, installs the menu and Dock menu. | device | main.ts:2621-2628 |
| A menu click calls a main-process function or sends a host command over the bridge to the page. | device | appMenu.ts:166-173, main.ts:2503 |
| The Menu bar switch in the hosted settings page writes showInMenuBar through the bridge; main saves it and calls syncTray. | device and our servers | DesktopSettingsSection.tsx:355-361 (page from cloud), main.ts:2203-2206 |
| Agent activity changes rebuild the tray menu. | device | main.ts:1745, :1800 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| showInMenuBar preference | desktop settings file in user data (settingsStore.ts) | no sync found | Kept until app data is cleared |
| Launch at login state | operating system login item | no | Until turned off |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The menu and tray work before sign-in; items that need the product act on the page and so need an account. |
| Permissions | No OS permission for menus. Launch at Login asks for confirmation on enable (main.ts:2184). |
| Subscription | none found in the code |
| Limits and metering | Menu labels in the tray are cut at 60 characters (tray.ts:46, :121-124). |
| Feature flags | None found for menus. View > Developer Tools only when the app is not packaged (appMenu.ts:411). |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Menus and tray work the same in Local mode; no plan is checked. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty (no tray) | With the switch off and no activity the tray is destroyed. | main.ts:1866-1869 |
| Tray assets missing | Falls back to an empty icon and warns in the console. | tray.ts:67-70 |
| Shortcut change refused | Native notification 'Shortcut not changed' with the reason. | tray.ts:86-88 |
| No running agents | Stop All Agents is disabled and no session list shows. | tray.ts:146-150 |
| No conversation | Copy URL, Open in New Window and Move Conversation items are disabled. | appMenu.ts:352, :455-461 |
| Launch at login fails to save | Checkbox reverts and a warning is logged. | appMenu.ts:28-35 |
| Linux without tray support | not handled in the code | tray.ts has no platform check beyond click handler |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/appMenu.test.ts`: Menu set, accelerators, host commands, zoom, tab items.
- `apps/desktop/electron/__tests__/tray.test.ts`: Tray shortcut changes, dictation chord, agent activity list.
- `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx`: Settings rows on the page side.
- `apps/web/features/desktop-host/__tests__/HostCommands.test.tsx`: Host commands reaching the page.

**Test scenarios**

- **Tray off and idle**
  1. Open Settings and turn Menu bar off.
  2. Make sure no agent runs and computer use is not granted.
  - Expected: The tray icon disappears.
- **Tray held by agent**
  1. Turn Menu bar off.
  2. Start an agent turn.
  - Expected: The tray icon is present with the session under Running.
- **Disabled items**
  1. Open a new chat.
  2. Open the Window menu.
  - Expected: Open in New Window and Move Conversation to New Window are disabled.
- **Troubleshooting**
  1. Help > Troubleshooting > Copy Diagnostics.
  2. Paste into a text editor.
  - Expected: Diagnostics text is on the clipboard.
- **Dock menu**
  1. On Mac right-click the Dock icon.
  - Expected: New Chat, New Window and Quick Ask are listed.

**Where to look when it fails**

- Console warn '[tray] tray icon assets missing' (tray.ts:68).
- '[launch-at-login] the change was not saved' (appMenu.ts:33).
- No run results are recorded in files I read.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **Brief asserts the tray offers Quick Ask, screenshot and voice; the tray labels them as shortcut rows, and no direct 'voice' label exists.** Affects: Testers matching labels. Evidence: tray.ts:174-196. Work needed: Use the exact labels in test scripts.
- **The Menu bar switch does not visibly explain that it is held on while an agent runs.** Affects: Desktop users. Evidence: DesktopSettingsSection.tsx:355-361 vs main.ts:1858. Work needed: Add a hint or disable state.
- **Linux tray support is not handled explicitly.** Affects: Linux users. Evidence: tray.ts:209-221. Work needed: Decide the fallback when no tray host exists.

**Depends on**

- surface:desktop
- file:apps/desktop/electron/appMenu.ts
- file:apps/desktop/electron/tray.ts
- F070-01
- F070-03
- F070-04
- F070-05
- SYS-shared-ui-and-design
- SYS-api-and-contracts

## Unknown

- Whether the hosted settings page disables the Menu bar switch while an agent is running.
- Linux tray behaviour on desktops without a status notifier.
- Exact values of HOST_MENU_SHORTCUTS accelerators (contract not opened).
- Whether menu text is localised (strings are English literals in appMenu.ts).
