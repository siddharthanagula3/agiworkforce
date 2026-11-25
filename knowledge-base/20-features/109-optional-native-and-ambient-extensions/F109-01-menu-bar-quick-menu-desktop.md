---
id: "F109-01"
type: "feature"
title: "Menu-bar quick menu (desktop)"
aliases: ["Tray menu", "Menu bar item", "Menu-bar quick actions", "Garnish shortcuts (code name in garnishCore.ts)", "S109.03"]
area: "109 Optional native and ambient extensions"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.03"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/tray.ts", "file:apps/desktop/electron/shortcuts.ts", "file:packages/contracts/local-runtime/src/host-bridge.ts", "store:electron-settings-file", "SYS-execution-boundaries", "SYS-shared-ui-and-design", "F109-03", "F109-02", "F109-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-01 Menu-bar quick menu (desktop)

A menu-bar icon on macOS, or a tray icon on Windows and Linux, in AGI Desktop (Electron). One click starts a new chat, opens Quick Ask, takes a screenshot or window capture, starts dictation, stops running agents, or changes the shortcut keys. Mobile has no menu bar; its quick actions are F109-05.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.03](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10903).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Desktop adds a small menu to the system menu bar or tray. It lists running and waiting coding sessions, a Stop All Agents item, the four ambient actions (Quick Ask, Screenshot to Chat, Window to Chat, Dictation) with their keys, and a Shortcuts submenu for choosing keys. (apps/desktop/electron/tray.ts:166-206)

**Why it exists.** The brief says a quick menu should offer one-click AGI actions such as new chat, quick ask, screenshot and voice (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md S109.03). The code also states the tray is one of two ways to stop an agent from outside its window, the Stop Agents shortcut being the other (apps/desktop/electron/main.ts:1851-1857 comment above trayNeeded at :1858).

**Who uses it.** People using AGI Desktop who want AGI actions without bringing the main window forward, and people who need to stop an agent that is using their screen.

**Problems it solves**

- Starting AGI actions without finding and focusing the main window.
- Seeing which coding sessions run or wait for approval, and opening one.
- Stopping agents and revoking computer-use access from outside the app window.
- Learning which shortcut key does what, and fixing a key another app already holds.

**Use cases**

- Click the menu-bar icon, then New Chat, to open a fresh conversation.
- Click Quick Ask to raise the compact panel (F109-03) without remembering the key.
- See 'Waiting for Approval' and open the session that needs a decision.
- Open Shortcuts and pick another key for Screenshot to Chat when the default clashes with another app.

## 2. User experience

**Where to find it**

- Desktop on macOS: the icon in the menu bar. Desktop on Windows and Linux: the tray icon; a left click opens the main window (apps/desktop/electron/tray.ts:216-218). On macOS the code names it 'menu bar', elsewhere 'tray menu' (apps/desktop/electron/shortcuts.ts:38-40).
- Desktop settings (the hosted settings page inside the app): section 'General desktop settings', row 'Menu bar', hint 'Show Desktop in the menu bar.' (apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:51-52). Shortcut rows 'Quick Ask shortcut', 'New chat shortcut', 'Screenshot to chat shortcut', 'Window to chat shortcut', 'Voice shortcut', 'Stop agents shortcut' (DesktopSettingsSection.tsx:92-120).
- Web, mobile, CLI, VS Code, Chrome: not present (brief marks the quick menu desktop only; mobile counted through widgets, see F109-05).

**Before you start**

- AGI Desktop (Electron) running.
- The tray exists only while 'Menu bar' is on, or computer use is granted, or an agent turn is running (apps/desktop/electron/main.ts:1858-1864).

**Screens and controls**

- Top items: 'Open Desktop', 'New Chat' (tray.ts:169-170; the product name comes from PRODUCT_NAMES.desktop, packages/contracts/types/src/product-names.ts:10).
- Activity block: heading 'Waiting for Approval' and 'Running' (each lists sessions, label cut at 60 characters), 'Stop All Agents…' (enabled only when a turn is running), 'Hand Back Screen Control' (only while the screen is taken over), 'Stop Computer Use and Revoke Access…' (only while computer use is granted) (tray.ts:46,141-164).
- Action items with the current key shown: 'Quick Ask', 'Screenshot to Chat', 'Window to Chat', 'Dictation' (tray.ts:173-196; labels in apps/desktop/electron/garnishCore.ts:86-93).
- 'Shortcuts' submenu: for each of six shortcuts a disabled heading plus radio choices (tray.ts:110-119). The six are Quick Ask, New Chat Window, Screenshot to Chat, Window to Chat, Dictation, Stop Agents.
- 'Check for Updates…' and 'Quit Desktop' (tray.ts:203-205).

**Journey**

1. Click the menu-bar or tray icon.
2. Pick an item. The matching handler runs (apps/desktop/electron/main.ts:1932-1947).
3. To change a key, open Shortcuts and pick a radio choice. The choice is saved, keys are re-registered and the menu is rebuilt (tray.ts:73-89).
4. If the new key could not be kept, a notification titled 'Shortcut not changed' gives the reason (tray.ts:47,86-88).

**What the person sees and gets**

- A key that could not be registered is named in its heading: '(is already in use by another app)', '(is already assigned to another Desktop shortcut)' or '(is not a valid accelerator)' (shortcuts.ts:36-37,45-50; tray.ts:104-108).
- One notification 'Shortcut unavailable' per registration pass says to use the menu bar or tray instead (shortcuts.ts:34,52-63).
- The 'Stop All Agents…' item opens a confirmation prompt before stopping (main.ts:1822-1826).

**Settings**

- showInMenuBar preference, default true (apps/desktop/electron/garnishCore.ts:566).
- Six shortcut preferences with defaults and preset lists from the contract (packages/contracts/local-runtime/src/host-bridge.ts:161-168).
- Stop Agents can never be set to none (host-bridge.ts:179).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Tray is created and destroyed by syncTray according to trayNeeded (apps/desktop/electron/main.ts:1858-1873).
- Menu is rebuilt on shortcut change and on activity change (tray.ts:223-225; main.ts:1745).
- Shortcut changes are validated, saved durably, re-registered, and rolled back if an always-on shortcut (Stop Agents) is lost (apps/desktop/electron/shortcuts.ts:150-169).
- Accelerators are shown in macOS symbols or as Ctrl+... elsewhere (packages/contracts/local-runtime/src/host-bridge.ts:227-241).
- The 'Menu bar' switch applies live: saving it calls syncTray (main.ts:2203-2206).
- Without a tray image the tray falls back to text only (tray.ts:67-70).

**Incomplete**

- Only four actions show an accelerator at top level. 'New Chat' shows none, and New Chat Window and Stop Agents keys appear only in the Shortcuts submenu (tray.ts:169-196,110-119).
- The 'shortcut unavailable' notification fires once per registration pass, not once per failed key (shortcuts.ts:42,56-57).
- 'Waiting for Approval' and 'Running' list coding sessions only, labelled 'Coding in <folder>' (main.ts:1753-1769).

**Present but disconnected or switched off**

- The user preference can hide the tray, but it is ignored while an agent turn runs or computer use is granted (main.ts:1851-1864).

**Not available**

- Mobile, web, CLI, VS Code, Chrome: no quick menu in this feature (brief).
- Tauri build: a tray file exists (apps/desktop/src-tauri/src/ui/tray.rs:11) but was not read; behaviour unknown.

## 4. Required behaviour

**Established requirements**

- A menu-bar or equivalent quick menu offers one-click AGI actions such as new chat, quick ask, screenshot and voice. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.03)
- Settings must include run on startup, quick access shortcut, voice shortcut and menu bar for the desktop app. (source: doc: docs/product/definition.md:406)
- Stop Agents must stay reachable: the settings page cannot clear it or hide the menu bar item while an agent holds the pointer. (source: doc: docs/decisions/wire-or-cut.md:734)
- A shortcut takes only a chord the shell offers for it, the one it has, or none where none is allowed. (source: doc: docs/decisions/wire-or-cut.md:737)

**Acceptance criteria**

1. With 'Menu bar' on, the icon appears in the macOS menu bar or the Windows or Linux tray.
2. With 'Menu bar' off, no computer use granted and no agent running, the icon is removed; starting an agent turn brings it back.
3. The Quick Ask, Screenshot to Chat, Window to Chat and Dictation items show the current key; changing a key in Shortcuts updates the shown key.
4. 'Stop All Agents…' is disabled when no turn runs and enabled when one runs.
5. A session waiting for approval is listed under 'Waiting for Approval' and clicking it opens that session.
6. Choosing a key another app holds shows the reason in the heading and the Stop Agents key is restored if the change would remove it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The tray itself needs no plan or sign-in, since the code has no gate (none found in apps/desktop/electron/tray.ts) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the accelerator on the New Chat item and show Stop Agents at top level so the menu matches the brief's 'current accelerator next to each action'.
- [proposed] Notify once per failed key instead of once per pass.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | createTray / refreshTrayMenu / buildMenu | `apps/desktop/electron/tray.ts` | Builds the tray icon and its menu. |
| service | syncTray / trayNeeded | `apps/desktop/electron/main.ts` | Creates or destroys the tray from the preference, computer-use grant and running turns (lines 1858-1873). |
| service | garnishHandlers | `apps/desktop/electron/main.ts` | Maps each menu item to its action (lines 1932-1947). |
| service | trayActivity | `apps/desktop/electron/main.ts` | Supplies running and waiting sessions to the menu (lines 1753-1769). |
| service | registerGarnishShortcuts / changeGarnishShortcuts | `apps/desktop/electron/shortcuts.ts` | Registers global keys, reports status, rolls back a lost always-on key. |
| config | garnishCore (labels, defaults, choices) | `apps/desktop/electron/garnishCore.ts` | Shortcut labels, defaults, validity rules, showInMenuBar default. |
| schema | HOST_SHORTCUT_CHOICES / HOST_SHORTCUT_STATUSES | `packages/contracts/local-runtime/src/host-bridge.ts` | One list of default and offered keys and the status words shared by shell and settings page. |
| store | settings store (getShortcuts, saveSettingsDurably) | `apps/desktop/electron/settingsStore.ts` | Persists shortcut and menu-bar preferences. |
| component | DesktopSettingsSection | `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx` | Settings page rows for Menu bar and the six shortcuts. |
| service | window-all-closed handling | `apps/desktop/electron/main.ts` | Keeps the app alive on Windows and Linux while the tray exists (lines 2770-2774). |
| service | createNativeNotification | `apps/desktop/electron/runtime/nativeSurface.ts` | Shows the 'Shortcut not changed' and 'Shortcut unavailable' notifications. |
| other | Tauri tray | `apps/desktop/src-tauri/src/ui/tray.rs` | Retained internal build tray; not read. |
| test | tray tests | `apps/desktop/electron/__tests__/tray.test.ts` | Menu contents, shortcut choice items, activity lists. |
| test | shortcut tests | `apps/desktop/electron/__tests__/shortcuts.test.ts` | Registration statuses and rollback. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Main process starts the tray after the window is ready, then registers global keys. | device | apps/desktop/electron/main.ts:2618-2632 |
| A click on an item calls its handler (open window, new chat, Quick Ask, capture, dictation, stop). | device | apps/desktop/electron/tray.ts:166-206; apps/desktop/electron/main.ts:1932-1947 |
| Choosing a key saves it, unregisters and registers all keys, rebuilds the menu, and shows a notification if refused. | device | apps/desktop/electron/tray.ts:73-89; apps/desktop/electron/shortcuts.ts:150-169 |
| The hosted settings page can change 'Menu bar'; the shell saves it and syncs the tray. | device and our servers | apps/desktop/electron/main.ts:2203-2206 (the page itself is the hosted web app: AGENTS.md section 5) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shortcut keys and menu-bar preference | Electron settings file in the app's user data folder (doc: docs/specs/desktop-global-voice/spec.md 'Settings') | No sync found in the code read | Kept until the user changes it; a bad value resets to the default (apps/desktop/electron/garnishCore.ts:117-118) |

**Models and providers.** The tray calls no model. Actions it starts (Quick Ask, dictation) use the models and providers of the chat they open (see F109-03, F109-04).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The tray needs no account (none found in apps/desktop/electron/tray.ts). The pages it opens need sign-in (apps/web/app/quick-ask/layout.tsx:15-23). |
| Permissions | Global key registration depends on no other app holding the key (shortcuts.ts:65-90). Stop Computer Use item appears only when computer use is granted (main.ts:1854-1860). |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | The showInMenuBar preference only (garnishCore.ts:566). |
| Model compatibility | Not applicable; the menu uses no model. |
| Provider restrictions | Not applicable. |
| Local mode | The tray works with no network: it is a local menu. What each action then does in Local mode is covered in F109-02 to F109-04. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No tray image file | Falls back to a text-only tray with a console warning | apps/desktop/electron/tray.ts:67-70 |
| Key held by another app | Heading shows the reason; one notification; menu fallback named | apps/desktop/electron/shortcuts.ts:45-63 |
| Key change would drop Stop Agents | Old keys restored and a message names the reason | apps/desktop/electron/shortcuts.ts:130-142,162-168 |
| Save to disk fails | The error message is returned and shown as 'Shortcut not changed' | apps/desktop/electron/shortcuts.ts:156-159; tray.ts:86-88 |
| Menu bar off but agent running | Tray stays | apps/desktop/electron/main.ts:1858-1864 |
| All windows closed on Windows or Linux | App keeps running if the tray exists, else quits | apps/desktop/electron/main.ts:2770-2774 |
| Screen reader or keyboard use of the menu | not handled in the code beyond the native menu; not verified | apps/desktop/electron/tray.ts |
| Offline | Menu works; actions that need pages depend on the hosted app (see F109-03) | apps/desktop/electron/quickAsk.ts:93-95 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/tray.test.ts`: Persisting a chosen key and rebuilding the menu, Stop Agents rollback, hand-edited accelerators, reason headings, disabled Stop All, session lists, mac symbols and Ctrl rendering.
- `apps/desktop/electron/__tests__/shortcuts.test.ts`: Shortcut registration statuses and change behaviour.
- `apps/desktop/electron/__tests__/garnishCore.test.ts`: Defaults, normalisation, duplicates, choices.
- `apps/desktop/electron/__tests__/hostPreferences.test.ts`: Host preference reads and writes, including shortcuts.
- `apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx`: Settings page shortcut rows, no-shortcut option, Stop Agents never none, refusal messages.

**Test scenarios**

- **Hide the tray**
  1. Turn 'Menu bar' off in settings with no agent running and computer use not granted.
  - Expected: The icon disappears. Start an agent turn and it returns.
- **Change a key**
  1. Open Shortcuts, pick the second Screenshot to Chat choice.
  - Expected: The menu shows the new key; pressing it takes a screenshot; the old key no longer does.
- **Key conflict**
  1. Hold a chord in another app, then choose it for Quick Ask.
  - Expected: The heading names 'is already in use by another app' and a notification appears.
- **Stop agents**
  1. Start a coding turn, open the menu, click 'Stop All Agents…', confirm.
  - Expected: The turn stops; item disables when none run.
- **Approval listing**
  1. Trigger a coding session approval request.
  - Expected: It appears under 'Waiting for Approval' and clicking opens it.

**Where to look when it fails**

- Console lines '[tray] tray icon assets missing', '[shortcuts] could not register the <label> shortcut', '[shortcuts] accelerator rejected' (tray.ts:68; shortcuts.ts:53,69).
- Settings file in the Electron user data folder.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Top-level menu shows keys for four items only; New Chat and Stop Agents show none** Affects: Desktop users reading the menu. Evidence: apps/desktop/electron/tray.ts:169-196. Work needed: Add accelerator display to New Chat and Stop item or document it.
- **Conflict notification is sent once per pass, so a second failed key is silent beyond its heading** Affects: Desktop users with several clashing keys. Evidence: apps/desktop/electron/shortcuts.ts:42,56-57. Work needed: Decide whether one notice is enough; brief says 'a notification explains it'.
- **Tauri tray not checked** Affects: Retained internal Tauri build. Evidence: apps/desktop/src-tauri/src/ui/tray.rs:11. Work needed: Read and record parity or retire it.
- **Windows and Linux tray not recorded as run by any file** Affects: Desktop on Windows and Linux. Evidence: no run record found. Work needed: Run on each OS and record.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:desktop
- file:apps/desktop/electron/tray.ts
- file:apps/desktop/electron/shortcuts.ts
- file:packages/contracts/local-runtime/src/host-bridge.ts
- store:electron-settings-file
- SYS-execution-boundaries
- SYS-shared-ui-and-design
- F109-03
- F109-02
- F109-04

## Unknown

- Behaviour of the Tauri tray (apps/desktop/src-tauri/src/ui/tray.rs not read).
- Whether the tray shows correctly on Windows and Linux; no test run record.
- Which function openNewChat performs (not read).
- Accessibility behaviour of the native menu.
