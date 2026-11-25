---
id: "F007-08"
type: "feature"
title: "Browser beside the conversation"
aliases: ["Side panel", "Chrome side panel", "AGI side panel", "Browser beside the conversation", "Open AGI side panel", "S7.06"]
area: "7 Layout systems"
available_on: ["chrome"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S7.06"]
depends_on: ["surface:chrome", "SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "file:apps/extension/manifest.json", "file:apps/extension/src/features/surface/assistantPanel.ts", "file:apps/extension/src/background.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-08 Browser beside the conversation

The Chrome extension shows the AGI chat in the browser's side panel, so the live page stays visible while the person chats. A toolbar click or Alt+Shift+K (Command+Shift+K on Mac) opens it. Browsers without the side panel API get a pop-up window instead. No other app has a live page beside the chat.

Area: [7. Layout systems](README.md). Requirement items: [S7.06](../../10-requirements/capabilities/007-layout-systems.md#s706).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Opens the extension chat page src/side_panel.html in Chrome's side panel, next to the current tab, and lets the chat read and act on that page with the person's approval (apps/extension/manifest.json:83-85; apps/extension/src/features/surface/assistantPanel.ts:66-73).

**Why it exists.** The brief requires that a live web page is shown beside the conversation so the user can watch or use the page while chatting about it (S7.06).

**Who uses it.** Chrome extension users, signed in to an AGI account.

**Problems it solves**

- No tab switching between a page and the chat.
- The chat can know which page is in front.
- Browsers lacking the side panel still get the chat in a small window.

**Use cases**

- Summarise an article while reading it.
- Fill a form while chatting about the fields.
- Ask follow-up questions on a product page.
- Open the chat from the in-page panel with Open in side panel.

## 2. User experience

**Where to find it**

- Chrome: the extension toolbar button titled 'AGI Extension' (apps/extension/manifest.json:61).
- Shortcut: Alt+Shift+K, Command+Shift+K on Mac, labelled 'Open AGI side panel' in chrome://extensions/shortcuts (manifest.json:67-74; _locales/en/messages.json:2-4).
- In-page panel footer link 'Open in side panel' (apps/extension/src/features/content/in-page-panel/panel.ts:155-159).
- Web, Desktop, Mobile, VS Code: not available.

**Before you start**

- Chrome version 132 or later (manifest.json:87).
- An AGI account for chatting; site approval for the page content to be read (background.ts:5568-5573, 4581-4601 related allowlist code).
- The sidePanel permission (manifest.json:17).

**Screens and controls**

- Side panel page src/side_panel.html with its script src/side_panel.ts (manifest.json:83-85).
- Toolbar click and shortcut both go to the same opener (background.ts:7677-7681).
- Panel behaviour is set so a toolbar click does not open it automatically; the extension's own click handler opens it (background.ts:1768-1772).

**Journey**

1. Press the toolbar button or the shortcut.
2. The service worker calls the side panel open for that tab; if the browser has no side panel API it opens a 440 by 860 pop-up window beside the browser window (assistantPanel.ts:3-4, 39-73).
3. The side panel connects to the service worker so the page knows the real side panel is open (side_panel.ts:166; background.ts:1812-1835).
4. Chat while the page stays visible; the in-page launcher hides to avoid two assistants (setup.ts:8-15).
5. Close the panel; the launcher returns.

**What the person sees and gets**

- The side panel itself, with the chat and the page context chip.
- If opening fails the worker logs a warning; the person sees nothing from the toolbar path (background.ts:7678-7680).
- From the in-page panel, a failed open shows a failure text in the response area (panel.ts:651-663).

**Settings**

- Keyboard shortcut can be changed in chrome://extensions/shortcuts (the command has a description for this page).
- Page assistant overlay setting only affects the in-page panel, not the side panel (setup.ts:93-103).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Side panel declared in the manifest with default path src/side_panel.html (apps/extension/manifest.json:83-85).
- Opener uses chrome.sidePanel.open for a tab or window and falls back to a pop-up window (assistantPanel.ts:66-73).
- The open runs in the synchronous turn of the click to keep Chrome's user gesture rule (apps/extension/src/background.ts:4490-4505).
- Presence tracking: the side panel connects on a port; the worker publishes open or closed to the tabs of that window (background.ts:1812-1850; panelPresence.ts:1-17).
- Page queries use the right window when the chat lives in the pop-up (assistantPanel.ts:75-90).

**Incomplete**

- Brief line pointers are stale: manifest.json:78 is now :83; background.ts:1302 and side_panel.ts:5400 were not checked as being the relevant lines.
- The in-page panel also appears when the side panel is closed, so two entry points exist.

**Present but disconnected or switched off**

- Automatic open on toolbar click is turned off on purpose; the extension handler opens it (background.ts:1768-1772).

**Not available**

- Web, Desktop, Mobile, VS Code: no live page beside the chat (brief S7.06 status missing). I found no such code in them.
- CLI: not applicable.

## 4. Required behaviour

**Established requirements**

- A live web page is shown beside the conversation, so the user can watch or use the page while chatting about it. (source: S7.06 (brief))
- Side panel is declared in the manifest and built in apps/extension/src/side_panel.ts and background.ts; the shortcut is Alt+Shift+K (Command+Shift+K on Mac). (source: brief Should lines for S7.06; apps/extension/manifest.json:67-74)

**Acceptance criteria**

1. Clicking the toolbar button opens the side panel next to the page without hiding it.
2. Alt+Shift+K (Command+Shift+K on Mac) opens the same panel.
3. In a Chromium browser with no side panel API a pop-up window opens instead and a second request focuses it.
4. While the side panel is open the in-page launcher is hidden; after closing, it returns.
5. The side panel works on the page in the window where it was opened.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The side panel is the main chat surface of the extension and the in-page panel is a lighter entry [inferred from panel.ts footer link and setup.ts:8-15].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether Desktop should get a browser beside the chat; the brief marks it missing for Web, Desktop, Mobile and VS Code.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | manifest side_panel and commands | `apps/extension/manifest.json` | Declares the side panel page, the sidePanel permission, the shortcut and minimum browser version. |
| screen | side_panel.html | `apps/extension/src/side_panel.html` | The page that is shown in the panel. |
| screen | side_panel.ts | `apps/extension/src/side_panel.ts` | The chat logic of the side panel, including the presence port (line 166). |
| service | background service worker | `apps/extension/src/background.ts` | Panel behaviour setup (1768-1772), presence (1812-1850), OPEN_SIDE_PANEL handling (4490-4505, 5524-5537), toolbar click (7677-7681), GET_SIDE_PANEL_OPEN (5551). |
| service | assistantPanel | `apps/extension/src/features/surface/assistantPanel.ts` | Chooses side panel or pop-up window and finds the page the chat is about. |
| service | panelPresence | `apps/extension/src/features/side-panel/panelPresence.ts` | Port name and presence message types. |
| service | in-page setup | `apps/extension/src/inPagePanel/setup.ts` | Hides the launcher while the side panel is open. |
| component | in-page panel link | `apps/extension/src/features/content/in-page-panel/panel.ts` | The 'Open in side panel' link sends OPEN_SIDE_PANEL. |
| config | message policy | `apps/extension/src/background/policy.ts` | Declares OPEN_SIDE_PANEL as allowed from an allow-listed tab (line 104). |
| config | locale strings | `apps/extension/_locales/en/messages.json` | Shortcut label 'Open AGI side panel'. |
| test | assistant-panel-fallback.test.ts | `apps/extension/__tests__/assistant-panel-fallback.test.ts` | Side panel and pop-up fallback. |
| test | open-side-panel-gesture.test.ts | `apps/extension/__tests__/open-side-panel-gesture.test.ts` | Synchronous open fast path. |
| test | in-page-panel-presence.test.ts | `apps/extension/__tests__/in-page-panel-presence.test.ts` | Launcher hidden while the panel is open. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Toolbar click or shortcut reaches the service worker. | device | apps/extension/manifest.json:67-74; background.ts:7677-7681 |
| The worker calls chrome.sidePanel.open for the tab, or creates a pop-up window. | device | assistantPanel.ts:66-73 |
| The panel page opens a port to the worker; the worker notes the window as open and tells that window's tabs. | device | background.ts:1812-1850; panelPresence.ts |
| Chat messages from the side panel go to Managed Cloud or other routes chosen by the side panel code; this was not traced for this page. | device and our servers | unknown; see SYS-chat-turn-pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Open side panel windows map | service worker memory (openSidePanelWindows) | no | gone when the worker stops; rebuilt via GET_SIDE_PANEL_OPEN (background.ts:5551-5560) |
| Chat history of the side panel | not traced | unknown | unknown |

**Models and providers.** Opening the panel needs no model. What model route the side panel chat uses was not traced in this task (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Opening the panel needs no account in the opener code (assistantPanel.ts). Chatting needs an AGI account (see in-page equivalent at background.ts:9135-9137; side panel chat path not traced). |
| Permissions | sidePanel permission and per-site approval for page access (manifest.json:17; background.ts:4490-4540). |
| Subscription | none found in the code for opening the panel. |
| Limits and metering | none found in the code for opening the panel. Chat usage is outside these files. |
| Feature flags | none found for the side panel itself; the pop-up fallback depends on whether chrome.sidePanel.open exists (assistantPanel.ts:11-13). |
| Model compatibility | unknown; not traced. |
| Provider restrictions | unknown for the side panel chat; opening is provider independent. |
| Local mode | Opening the panel has no Local mode dependency. Chat Local mode in the extension was not traced (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Side panel API missing | Opens a pop-up window 440 wide, placed at the right edge of the browser window. | assistantPanel.ts:39-64 |
| Pop-up already open | Brought to the front rather than opened twice. | assistantPanel.ts:40-44 |
| Dormant worker has not loaded the site list yet | Opens first, answers the page's request after the list loads. | background.ts:4490-4505 |
| Site not approved | The in-page request gets an error reply 'site not approved' while the panel still opens. | background.ts:4497-4505 |
| Two panel documents in one window | Counted; the launcher returns only when all have closed. | background.ts:1826-1850 |
| Open failure from toolbar | Logged only; no visible message. | background.ts:7678-7680 |
| Accessibility | Side panel accessibility is covered by a test file named side-panel-a11y.test.ts (contents not read). | apps/extension/__tests__/side-panel-a11y.test.ts |
| Offline or reconnect | not handled in the opener code; chat-level handling not traced. | assistantPanel.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/assistant-panel-fallback.test.ts`: Opens the side panel in the same tick, pop-up fallback, reuse of the window, which page the panel works on, toolbar without the API.
- `apps/extension/__tests__/open-side-panel-gesture.test.ts`: A synchronous open fast path exists, after the allow-list gate.
- `apps/extension/__tests__/in-page-panel-presence.test.ts`: Launcher hides and shows with the side panel.
- `apps/extension/__tests__/side-panel-restricted-page.test.ts`: Behaviour on restricted pages (not read in detail).
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Side panel accessibility (not read in detail).

**Test scenarios**

- **Open by toolbar**
  1. Load the extension in Chrome 132 or later.
  2. Open any web page.
  3. Click the AGI toolbar button.
  - Expected: The side panel opens beside the page and the page stays visible.
- **Open by shortcut**
  1. Press Alt+Shift+K (Command+Shift+K on Mac).
  - Expected: The same panel opens or stays open.
- **Fallback browser**
  1. Use a Chromium browser without chrome.sidePanel.open.
  2. Click the toolbar button twice.
  - Expected: One 440 pixel wide pop-up opens, then is focused.
- **Launcher exclusion**
  1. On an approved page, show the launcher.
  2. Open the side panel.
  3. Close it.
  - Expected: Launcher hides, then returns.
- **Shortcut conflict**
  1. Open chrome://extensions/shortcuts and check the entry 'Open AGI side panel'.
  - Expected: The entry shows the default chord or a person-chosen one.

**Where to look when it fails**

- Service worker console: 'setPanelBehavior(openPanelOnActionClick) failed', 'OPEN_SIDE_PANEL synchronous open failed', 'Opening the assistant from the toolbar failed' (background.ts:1770, 4500, 7678).
- chrome.runtime.getContexts for SIDE_PANEL shows what is open (background.ts:5551-5560).

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **No live page beside the chat on Web, Desktop, Mobile or VS Code.** Affects: Those four apps. Evidence: Brief S7.06 status; no code found. Work needed: Owner decision on whether each app needs it, then design per surface.
- **Toolbar open failures are logged but not shown.** Affects: Chrome users. Evidence: background.ts:7677-7681. Work needed: Show a visible notice.
- **Brief line pointers are stale.** Affects: Readers of the brief. Evidence: manifest.json side_panel is at :83. Work needed: Refresh the brief.
- **Side panel chat model, mode and plan behaviour not documented here.** Affects: Testers. Evidence: not traced. Work needed: Trace side_panel.ts to the chat pipeline and record it.
- Not built on: Web, Desktop, Mobile, VS Code (from the capability ledger).

**Depends on**

- surface:chrome
- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- file:apps/extension/manifest.json
- file:apps/extension/src/features/surface/assistantPanel.ts
- file:apps/extension/src/background.ts

## Unknown

- Which model route and modes the side panel chat uses and whether Local inference exists in it.
- Which plans can use the side panel chat.
- Where side panel chat history is stored and deleted.
- What background.ts:1302 and side_panel.ts:5400 (brief code pointers) refer to.
