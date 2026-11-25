---
id: "F074-01"
type: "feature"
title: "Open the assistant"
aliases: ["Toolbar action", "Open AGI side panel", "AGI Extension toolbar button", "Side panel host", "S74.01", "S74.02", "S74.03", "assistant window fallback"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.01", "S74.02", "S74.03"]
depends_on: ["surface:chrome", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "file:apps/extension/manifest.json", "file:apps/extension/src/features/surface/assistantPanel.ts", "file:apps/extension/src/background.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-01 Open the assistant

In the Chrome extension, clicking the AGI Extension toolbar button or pressing the open shortcut opens the assistant in Chrome's side panel beside the page. If the browser has no side panel API, a small separate assistant window opens instead. There is no toolbar popup; the brief's popup item is not built.

Area: [74. Browser extension](README.md). Requirement items: [S74.01](../../10-requirements/capabilities/074-browser-extension.md#s7401), [S74.02](../../10-requirements/capabilities/074-browser-extension.md#s7402), [S74.03](../../10-requirements/capabilities/074-browser-extension.md#s7403).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the Chrome extension one entry point. The toolbar button or a keyboard shortcut opens the assistant (the side panel page side_panel.html) next to the current tab. A right-click action, the in-page 'Open in side panel' button and the welcome flow reuse the same opener. [inferred from shared openAssistantPanel callers] (apps/extension/src/features/surface/assistantPanel.ts:66-73; apps/extension/src/background.ts:7677-7681)

**Why it exists.** The brief says clicking the toolbar button or its shortcut opens the assistant (S74.01) and a side panel hosts the assistant beside the page (S74.03). A popup for quick actions was also asked for (S74.02) but is not built. (doc: knowledge-base/data/area-briefs/074-browser-extension.md)

**Who uses it.** Anyone using the AGI Workforce Chrome extension (Chrome 132 or newer). (apps/extension/manifest.json:87)

**Problems it solves**

- The assistant stays visible while the person reads or works on the page, instead of covering it.
- Works from the keyboard as well as the mouse.
- Browsers without the side panel API still get a usable assistant window (assistantPanel.ts:48-73).

**Use cases**

- Open the assistant while reading an article and ask about it.
- Press the shortcut to open the assistant without leaving the keyboard.
- Click the toolbar button on a different tab and get the panel for that tab.
- On a Chromium browser with no side panel API, get a detached assistant window.

## 2. User experience

**Where to find it**

- surface:chrome: toolbar button titled 'AGI Extension' (apps/extension/manifest.json:52-60).
- surface:chrome: keyboard shortcut Alt+Shift+K on Windows and Linux, Command+Shift+K on Mac, described as 'Open AGI side panel' (apps/extension/manifest.json:67-74; apps/extension/_locales/en/messages.json:2-3).
- surface:chrome: the in-page panel button 'Open in side panel' (apps/extension/src/features/content/in-page-panel/panel.ts:156-161).
- Other apps (web, desktop, mobile, CLI, VS Code): not applicable.

**Before you start**

- Chrome 132 or newer (apps/extension/manifest.json:87).
- Not a private (incognito) window: the manifest sets incognito to not_allowed (apps/extension/manifest.json:9).
- Using chat inside the panel needs a signed-in AGI account; opening the panel does not. [inferred from panel gate states] (apps/extension/src/side_panel.ts:723-726)

**Screens and controls**

- Toolbar button 'AGI Extension' with the AGI icon.
- Shortcut Alt+Shift+K / Command+Shift+K. The person can change it in Chrome's shortcut settings. [inferred from Chrome behaviour; the options page also has a shortcut rows file apps/extension/src/features/options/keyboard-shortcut-rows.ts that was not read]
- Side panel (src/side_panel.html) is the assistant itself.
- Fallback: a popup-type browser window 440 px wide showing the same page (assistantPanel.ts:1-4, 48-64).

**Journey**

1. 1. The person clicks the toolbar button or presses the shortcut.
2. 2. Chrome fires the action click for the active tab. The shortcut is declared as the reserved _execute_action command, which Chrome routes to the same click handler. [inferred from Chrome behaviour] (apps/extension/manifest.json:68; apps/extension/src/background.ts:7677)
3. 3. The background worker calls openAssistantPanel with the tab id and window id (background.ts:7677-7681).
4. 4. If the side panel API exists, Chrome opens the panel for that tab; otherwise an assistant window opens, or the existing one is focused (assistantPanel.ts:48-73).
5. 5. The panel loads, checks the account and shows the chat or a sign-in gate. (apps/extension/src/side_panel.ts:723-731)

**What the person sees and gets**

- The side panel appears beside the page.
- If opening fails the worker logs 'Opening the assistant from the toolbar failed' and shows nothing to the person. (background.ts:7678-7680)
- From the in-page panel, a failure shows 'The side panel could not be opened. Use the AGI icon in the Chrome toolbar.' (apps/extension/src/features/content/in-page-panel/panel.ts:434-435)

**Settings**

- Shortcut binding is a Chrome setting; the manifest only suggests keys (apps/extension/manifest.json:68-74).
- No popup setting exists.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Toolbar click opens the side panel for the clicked tab (apps/extension/src/background.ts:7677-7681; apps/extension/src/features/surface/assistantPanel.ts:66-72).
- Panel behaviour is set so Chrome does not open the panel by itself on a click: openPanelOnActionClick false, so the click handler is the single opener (apps/extension/src/background.ts:1768-1771).
- Fallback assistant window when no side panel API: opens a popup window, or focuses the one already open (assistantPanel.ts:36-64).
- In the fallback window the page to work on is the last focused normal browser window (assistantPanel.ts:101-116).
- The in-page panel can ask the worker to open the side panel; the worker opens it in the same synchronous turn so Chrome keeps the user gesture (apps/extension/src/background.ts:4489-4505).

**Incomplete**

- The toolbar popup (S74.02) is not built: the action block has only icons and a title, no default popup (apps/extension/manifest.json:52-60). Brief status: chrome missing.

**Present but disconnected or switched off**

- Chrome's own open-on-click behaviour is deliberately turned off (background.ts:1769).

**Not available**

- Web, desktop, mobile, CLI and VS Code have no such feature (brief items are chrome-only).
- Private windows: the extension is not allowed there (apps/extension/manifest.json:9). Messaging for this is missing (S74.26 missing in brief).

## 4. Required behaviour

**Established requirements**

- Clicking the toolbar button or its shortcut opens the assistant. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.01)
- A small popup opens from the toolbar button for quick actions. (source: S74.02 (same brief); status chrome missing)
- A side panel hosts the assistant beside the page. (source: S74.03 (same brief))
- Chrome must include a popup or side panel. (source: doc: docs/product/requirements.md section 14 (line 1186-1200))

**Acceptance criteria**

1. Clicking the toolbar button on an ordinary web tab opens the side panel on that tab.
2. Pressing Alt+Shift+K (Command+Shift+K on Mac) opens the same panel.
3. Clicking the button a second time does not open a duplicate panel or window.
4. With the side panel API removed, the click opens one assistant window and a second click focuses it.
5. No popup appears when the button is clicked.
6. The extension is not offered in a private window.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the requirements doc allows 'popup or side panel', the missing popup may be acceptable; the brief still lists it as missing. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether S74.02 is wanted. If so, a popup would stop the action click event from firing, so the opener design must change.
- [proposed] Show a visible message when the panel cannot be opened from the toolbar, instead of only a log line.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | manifest action, commands, side_panel | `apps/extension/manifest.json` | Declares the toolbar button (52-60), the _execute_action shortcut (67-74), the side panel page (83-86), incognito not_allowed (9) and minimum Chrome 132 (87). |
| service | chrome.action.onClicked handler | `apps/extension/src/background.ts` | Opens the assistant when the toolbar button or shortcut fires (7677-7681). |
| service | setPanelBehavior | `apps/extension/src/background.ts` | Turns off Chrome's automatic open on click so the handler is the only opener (1768-1771). |
| service | OPEN_SIDE_PANEL message | `apps/extension/src/background.ts` | Lets the in-page panel open the side panel; synchronous fast path keeps the user gesture (4489-4505, 4597-4600, 5524). |
| service | openAssistantPanel / openAssistantWindow | `apps/extension/src/features/surface/assistantPanel.ts` | Chooses side panel or fallback window and places the window (48-73). |
| service | pageWindowQuery / activePageQuery | `apps/extension/src/features/surface/assistantPanel.ts` | Finds the page the panel works on, even from a separate window (101-125). |
| screen | Side panel page | `apps/extension/src/side_panel.html` | The document Chrome loads as the side panel. |
| screen | Side panel script | `apps/extension/src/side_panel.ts` | The assistant UI and chat state (gate states at 723-731). |
| component | In-page 'Open in side panel' button | `apps/extension/src/features/content/in-page-panel/panel.ts` | Sends OPEN_SIDE_PANEL and closes the overlay on success (651-667). |
| config | command and menu strings | `apps/extension/_locales/en/messages.json` | commandOpenSidePanel text 'Open AGI side panel' (line 2). |
| integration | Welcome page on install | `apps/extension/src/background.ts` | Opens a welcome tab on first install (7690-7696). |
| test | assistant-panel-fallback test | `apps/extension/__tests__/assistant-panel-fallback.test.ts` | Covers side panel open, window fallback and toolbar dispatch. |
| test | open-side-panel-gesture test | `apps/extension/__tests__/open-side-panel-gesture.test.ts` | Checks the synchronous OPEN_SIDE_PANEL path. |
| test | manifest-contract test | `apps/extension/__tests__/manifest-contract.test.ts` | Checks the shortcuts and incognito setting in the manifest. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person clicks the toolbar button or presses the shortcut; Chrome raises the action click for the tab. | device | apps/extension/src/background.ts:7677 |
| The worker asks Chrome to open the side panel for that tab, or opens/focuses the assistant window when the API is missing. | device | apps/extension/src/features/surface/assistantPanel.ts:66-73 |
| The panel page loads and checks the account and plan/usage by calling AGI Web endpoints. | device and our servers | apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112-116, 268-269 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No conversation data is created by opening the panel. The assistant window position is not stored. | nothing persisted by this step | no | not applicable |

**Models and providers.** Opening the panel uses no model. Chat inside the panel is Managed Cloud only: the threat model says there is no Local, own-key or Desktop fallback (doc: apps/extension/docs/threat-model.md:23, 208).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Opening needs no account. Chat inside needs a signed-in AGI account (gate states loading, ready, signed_out, unavailable) (apps/extension/src/side_panel.ts:723-726). |
| Permissions | Manifest permission sidePanel is required (apps/extension/manifest.json:19). No site permission is needed to open the panel. |
| Subscription | none found in the code for opening the panel; plan rules apply to chat turns on our servers. |
| Limits and metering | none found in the code for opening. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable to opening. |
| Provider restrictions | none found in the code for opening. |
| Local mode | The extension has no Local mode. Chat is Managed Cloud only (doc: apps/extension/docs/threat-model.md:23). The panel opens without any model. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No side panel API in the browser | Opens a popup-type assistant window, or focuses the existing one. | apps/extension/src/features/surface/assistantPanel.ts:36-73 |
| Open call fails | Logged as a warning; the person sees nothing from the toolbar path. | apps/extension/src/background.ts:7678-7680 |
| Panel opened from the in-page overlay fails | The overlay shows a message pointing to the toolbar icon. | apps/extension/src/features/content/in-page-panel/panel.ts:434-435, 651-663 |
| Worker was asleep when the message came | Opens first, then answers after the site allowlist loads. | apps/extension/src/background.ts:4489-4512 |
| Private window | Extension is not allowed there; no in-product explanation found. | apps/extension/manifest.json:9 |
| Offline | not handled in the code for opening; the panel shows account gate states. | apps/extension/src/side_panel.ts:723-731 |
| Accessibility | unknown for the toolbar button, which is Chrome's own control. | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/assistant-panel-fallback.test.ts`: Side panel opens in the same tick; window fallback; reuse of an open window; toolbar click with and without the API.
- `apps/extension/__tests__/open-side-panel-gesture.test.ts`: OPEN_SIDE_PANEL has a synchronous fast path after the allowlist gate.
- `apps/extension/__tests__/manifest-contract.test.ts`: Manifest shortcuts (open and capture) and incognito not_allowed.
- `apps/extension/__tests__/background-screenshot-capture.test.ts`: Mentions openPanelOnActionClick false in its setup (line 230); full coverage of that file for this feature not read.

**Test scenarios**

- **Open from the toolbar**
  1. Load the unpacked extension in Chrome 132 or newer.
  2. Open an ordinary web page.
  3. Click the AGI Extension toolbar button.
  - Expected: The side panel opens on that tab and shows the chat or the sign-in gate.
- **Open from the shortcut**
  1. Press Alt+Shift+K (Command+Shift+K on Mac) on a web page.
  - Expected: The same side panel opens.
- **No popup**
  1. Click the toolbar button once.
  - Expected: Only the side panel opens; no popup window or bubble appears.
- **Fallback window**
  1. In a Chromium browser without the side panel API (or with it removed in a test), click the toolbar button twice.
  - Expected: One assistant window opens, then the second click focuses it.
- **Private window**
  1. Open a private window and look for the extension.
  - Expected: The extension is not available there.

**Where to look when it fails**

- Service worker console (chrome://extensions, inspect views): 'Opening the assistant from the toolbar failed', 'OPEN_SIDE_PANEL synchronous open failed', 'setPanelBehavior(openPanelOnActionClick) failed'.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **No toolbar popup for quick actions (S74.02).** Affects: surface:chrome users who expect a quick-action popup. Evidence: apps/extension/manifest.json:52-60 has no default popup; brief S74.02 status chrome missing. Work needed: Decide if wanted; if yes design the popup and move the open logic, since a popup stops the click event.
- **Toolbar open failure is silent.** Affects: surface:chrome. Evidence: apps/extension/src/background.ts:7678-7680 logs only. Work needed: Show a notification or badge when the panel cannot open.
- **No in-product message for private windows (related to S74.26).** Affects: surface:chrome. Evidence: apps/extension/manifest.json:9; brief S74.26 chrome missing. Work needed: Add explanatory copy (for example on the welcome or options page).

**Depends on**

- surface:chrome
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- file:apps/extension/manifest.json
- file:apps/extension/src/features/surface/assistantPanel.ts
- file:apps/extension/src/background.ts

## Unknown

- Whether keyboard-shortcut-rows lets the person rebind the shortcut inside Options (file exists, not read).
- Whether any end-to-end spec drives the toolbar click in a real Chrome (apps/extension/e2e was listed but not read).
- Behaviour of the toolbar button for screen readers (Chrome-owned control).
