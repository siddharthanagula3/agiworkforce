---
id: "F007-07"
type: "feature"
title: "Detachable panels and floating Quick Ask"
aliases: ["Detachable panels", "Open in a new window (panel pop-out)", "Panel window", "Quick Ask", "Quick Ask panel", "Floating companion window", "Compact companion mode", "Page assistant overlay", "In-page panel", "Floating launcher (Ask AGI)", "S7.14", "S7.18", "S7.19"]
area: "7 Layout systems"
available_on: ["desktop", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "missing", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S7.14", "S7.18", "S7.19"]
depends_on: ["surface:desktop", "surface:chrome", "surface:vscode", "mode:cloud", "SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-shared-ui-and-design", "file:apps/desktop/electron/quickAsk.ts", "file:apps/web/features/desktop-host/lib/panel-windows.ts", "file:apps/extension/src/inPagePanel/setup.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-07 Detachable panels and floating Quick Ask

On Desktop, the Details and Research panels can be opened in their own OS window, and a small always-on-top Quick Ask window (480 by 620) answers a short question from a global shortcut. In Chrome, a round floating launcher opens a small in-page panel on approved sites. Detach is Desktop only; Quick Ask is Cloud only.

Area: [7. Layout systems](README.md). Requirement items: [S7.14](../../10-requirements/capabilities/007-layout-systems.md#s714), [S7.18](../../10-requirements/capabilities/007-layout-systems.md#s718), [S7.19](../../10-requirements/capabilities/007-layout-systems.md#s719).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Desktop: a button on the Details panel and the Research panel moves that panel into a separate window and back (apps/web/features/desktop-host/components/PanelWindow.tsx:30-56). Desktop: a global shortcut shows or hides a small frameless window that loads the hosted compact chat page /quick-ask (apps/desktop/electron/quickAsk.ts:6-10, 164-171). Chrome: a 48px launcher button on a page opens a 380px in-page panel that takes one question at a time (apps/extension/src/features/content/in-page-panel/launcher.ts:75-78; panelStyles.ts:16).

**Why it exists.** People want to keep a panel beside other work, ask a quick question without opening the main window, or ask about the page they are reading without leaving it. The code comment says Quick Ask follows the ChatGPT and Claude companion windows (apps/desktop/electron/quickAsk.ts:43-47).

**Who uses it.** Desktop (Electron) users with a signed-in account for detach and Quick Ask. Chrome users on sites they approved, who have the page assistant setting on.

**Problems it solves**

- A long research or details panel no longer has to share the main window.
- A one-off question does not need the full app, sidebar and panels.
- On a web page, a person can ask about the page in place without opening the side panel.

**Use cases**

- Pop the Research panel into a window on a second monitor while writing in the main window.
- Press the Quick Ask shortcut from any app, ask one question, press Escape.
- Open a conversation from Quick Ask in the main window with Open full chat.
- On an approved news page in Chrome, click the launcher and choose a page action chip.

## 2. User experience

**Where to find it**

- Desktop: the window button on the right of the Details panel header and the Research panel header. Its label reads 'Open <panel> in a new window' and, once detached, 'Move <panel> back to the main window'; the research label is 'research panel' (apps/web/features/chat/components/research/ResearchPanel.tsx:29, 455-459; apps/web/features/desktop-host/components/PanelWindow.tsx:39-42). The exact Details label text comes from a panelLabel prop that I did not trace (WorkSessionPanel.tsx:1090-1094).
- Desktop: Quick Ask global shortcut. Default chord is the first choice 'Alt+Shift+Space'; alternatives offered are CommandOrControl+Shift+Space and CommandOrControl+Alt+A (packages/contracts/local-runtime/src/host-bridge.ts:162, 170-172). It is also listed in the tray menu as 'Quick Ask' (apps/desktop/electron/tray.ts:174-175) and set in the hosted settings panel under the label 'Quick Ask shortcut' (apps/web/features/desktop-host/__tests__/DesktopSettingsSection.test.tsx:168).
- Chrome: launcher button with aria-label 'Open AGI' and tooltip 'Ask AGI' at bottom right of approved http(s) pages (launcher.ts:106-119, 135-136). Shortcut Alt+Shift+K (Command+Shift+K on Mac) is the _execute_action command, labelled 'Open AGI side panel', and opens the side panel, not the in-page panel (apps/extension/manifest.json:67-74; apps/extension/_locales/en/messages.json:2-4).
- Chrome setting: 'Page assistant overlay' in the extension settings turns the in-page panel on or off (apps/extension/_locales/en/messages.json:488-491).

**Before you start**

- Desktop detach: the Electron shell must be present (host not null) and the page must not be the compact Quick Ask page (apps/web/features/desktop-host/hooks/use-detachable-panels.ts:58; apps/web/features/chat/pages/WebChatPage.tsx:1169-1175).
- Desktop Quick Ask: signed in, current terms accepted and adult check passed, or the page redirects to sign-in (apps/web/app/quick-ask/layout.tsx:14-25).
- Chrome: the site is approved by the person and the page assistant setting is not off (apps/extension/src/background.ts:5568-5573; apps/extension/src/inPagePanel/setup.ts:93-103). The panel only mounts on http or https pages (setup.ts:91).
- Chrome: a signed-in AGI account; otherwise the prompt fails with 'Sign in to use AGI Managed Cloud.' (apps/extension/src/background.ts:9135-9137).

**Screens and controls**

- Detached panel window: 440 by 760, menu bar hidden, minimum 320 by 360, titled 'Details' or 'Research' (apps/desktop/electron/windowPolicy.ts:237-244; apps/web/features/desktop-host/lib/panel-windows.ts:16-19).
- Quick Ask window: 480 by 620, no frame, cannot resize, minimise, maximise or go full screen, hidden from the taskbar, always on top, shown on all workspaces (apps/desktop/electron/quickAsk.ts:53-78).
- Quick Ask on a conversation shows a small header with 'Open full chat' and a 'New chat' icon (apps/web/features/chat/pages/WebChatPage.tsx:7277-7298).
- Chrome in-page panel: provider pill 'Managed Cloud · Auto', buttons 'New question', 'Settings', 'Close panel', page action chips, a prompt box ('Page assistant prompt'), 'Send message', a privacy notice and an 'Open in side panel' link (apps/extension/src/features/content/in-page-panel/panel.ts:72-159).

**Journey**

1. Detach: open the Details or Research panel, press the window button; the panel closes inline and appears in a new window (use-detachable-panels.ts:63-68).
2. Work in the detached window; its content is the same React tree drawn into the other window (apps/web/features/desktop-host/components/PanelWindow.tsx:14-28).
3. Move back: press the button in the detached window, or close the window; the panel reopens inline when moved back with the button (use-detachable-panels.ts:69-75).
4. Quick Ask: press the shortcut; the window appears centred in the upper part of the screen holding the cursor and takes focus (quickAsk.ts:139-162).
5. Type one question and read the answer. Clicking outside the window or pressing Escape hides it (quickAsk.ts:81-89).
6. To continue elsewhere, choose Open full chat; the window hides and the main window opens the route (quickAsk.ts:97-105; apps/desktop/electron/main.ts:1653-1664).
7. Chrome: click the launcher, pick a chip or type a question, read the streamed answer, press Escape or Close panel; use 'Open in side panel' to continue in the side panel (panel.ts:637-663, 686-688).

**What the person sees and gets**

- If the browser blocks the pop-out, detachPanel returns false and the panel stays inline; there is no message (panel-windows.ts:115-116; use-detachable-panels.ts:66).
- Quick Ask that failed to load while offline reloads on the next shortcut press (quickAsk.ts:152-156).
- Chrome shows errors in the response area: 'Sign in to use AGI Managed Cloud.', 'Enter a question or choose a page action.', 'Request cancelled.' (background.ts:9119-9137) and a retryable state on a worker failure (apps/extension/__tests__/in-page-panel-ui.test.ts:278, 368).
- Chrome: if opening the side panel fails the response area shows a failure text (panel.ts:651-663).

**Settings**

- Desktop: Quick Ask shortcut choice, including none, in the hosted desktop settings (host-bridge.ts:141-172, 446; apps/desktop/electron/main.ts:1982).
- Chrome: Page assistant overlay on or off, stored under the key in_page_panel_enabled (apps/extension/src/features/options/preference-rows.ts:10).
- Chrome: per-site approval (apps/extension/src/background.ts:5568-5573).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop panel detach: window.open with a named window agi-panel-<name>, style sheets copied and kept in sync, panel drawn in by a portal (apps/web/features/desktop-host/lib/panel-windows.ts:56-145; PanelWindow.tsx:14-28).
- Desktop window policy lets only about:blank windows named agi-panel-<letters> open as a panel window, locks them from navigating, and closes them when the main window closes (apps/desktop/electron/windowPolicy.ts:246-249, 319-327, 341).
- Detached window closes 2 seconds after the panel unmounts, so a quick re-render does not close it (panel-windows.ts:15, 158-173).
- Quick Ask window is created, warmed after launch, repositioned on each show, and sends non-Quick-Ask destinations to the main window (apps/desktop/electron/quickAsk.ts:52-188; main.ts:2702-2717).
- Quick Ask shortcut registration reports registered, taken, malformed, duplicate or off (apps/desktop/electron/shortcuts.ts:74-110).
- Chrome in-page panel mounts only on approved pages, hides while the real side panel is open, and streams answers through the service worker (apps/extension/src/inPagePanel/setup.ts:8-36, 93-114; apps/extension/src/background.ts:9112-9162).
- Chrome falls back to a 440 by 860 pop-up window when the browser has no side panel API (apps/extension/src/features/surface/assistantPanel.ts:3-4, 39-73).

**Incomplete**

- Detach covers only two panels, 'work' and 'research' (panel-windows.ts:5). Artifacts, Sources and other panels cannot be detached (apps/web/features/chat/pages/WebChatPage.tsx:7843-7896).
- Detached window size and position are not remembered; each detach opens at 440 by 760 chosen by the browser features string (panel-windows.ts:13). No saving code found.
- When the pop-up is blocked the person gets no message (panel-windows.ts:115-116).
- Brief line pointers are stale: windowPolicy.ts:187-230 now holds public page return logic and the panel-window code starts at line 237; manifest.json:78 is now line 83 (checked by opening the files).
- Chrome in-page panel is one question and one answer, not a saved chat (apps/extension/_locales/en/messages.json:508-511).

**Present but disconnected or switched off**

- Detach is switched off in the compact Quick Ask page (enabled: !compact) and on plain web, because the host bridge is null outside the Electron shell (WebChatPage.tsx:1169-1170; use-detachable-panels.ts:58).
- Quick Ask warm-up and shortcut exist only in the Electron app; the retained Tauri build (apps/desktop/src-tauri) was not checked for Quick Ask (unknown).

**Not available**

- Web, Mobile, CLI: no detach and no Quick Ask code found (brief status n/a; no code opened on these surfaces).
- VS Code: the extension has no pop-out code of its own; the brief says it relies on the editor's own windowing. I found no pop-out code in apps/extension-vscode/src/providers/chatEditorPanel.ts [inferred].
- Chrome has no detach of the in-page panel.

## 4. Required behaviour

**Established requirements**

- A panel of the desktop app can be torn off into its own OS window and used there. (source: S7.14 (brief))
- A small always-on-top companion window can float over other apps or pages and be summoned without switching to the main app. (source: S7.18 (brief))
- A compact companion mode shows a reduced chat UI (no sidebar or side panels) sized for quick questions. (source: S7.19 (brief))
- Detach calls window.open with a named window and copies the style sheets; a blocked pop-up returns false. Quick Ask is a frameless 480 by 620 window loading the hosted /quick-ask page; anything else goes to the main window; detached windows are checked by the desktop window policy. (source: brief Should lines for S7.14, S7.18, S7.19)
- Screenshot capture always targets the main window, never Quick Ask. (source: docs/specs/desktop-parity/tasks.md:46)
- Quick Ask, Screenshot and Dictation shortcuts take only a chord the shell offers for them, the one already set, or none. (source: docs/decisions/wire-or-cut.md:737)

**Acceptance criteria**

1. On Desktop, pressing the window button on the Research panel opens a window titled 'Research' and the panel disappears from the main window.
2. Pressing the button in the detached window, or closing it, returns the panel to the main window or closes it, and no second window for the same panel can exist.
3. The Quick Ask shortcut shows a 480 by 620 frameless window that cannot be resized and hides on Escape or when focus moves away.
4. A link inside Quick Ask that leads outside /quick-ask opens in the main window and Quick Ask hides.
5. In Chrome on an approved site the launcher appears; on an unapproved site, or with the setting off, it does not.
6. In Chrome the launcher disappears while the side panel is open and returns when it closes.
7. Signed out, Quick Ask and the Chrome in-page panel ask for sign-in instead of answering.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Detached panels should survive the main page re-rendering; the 2 second release grace exists for this [inferred from panel-windows.ts:15, 158-173].
- Quick Ask should reach the same model and quota rules as the main hosted chat because it loads the same hosted app [inferred from quickAsk.ts:9-10, 124].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Tell the person when the pop-up is blocked.
- [proposed] Remember the detached window position and size like the main window.
- [proposed] Verify Quick Ask in Local mode and document the result.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | panel-windows | `apps/web/features/desktop-host/lib/panel-windows.ts` | Opens, tracks, mirrors styles into, focuses and closes the detached panel windows; exposes usePanelWindow. |
| hook | useDetachablePanels | `apps/web/features/desktop-host/hooks/use-detachable-panels.ts` | Gives the chat page detach availability, inline and detached toggle controls. |
| component | PanelWindowPortal, PanelWindowButton, useDetachedWindowTitle | `apps/web/features/desktop-host/components/PanelWindow.tsx` | Draws the panel into the other window and shows the toggle button. |
| screen | WebChatPage detach wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Calls useDetachablePanels with enabled: !compact and mounts a portal for work and research (lines 1169-1175, 7843-7896); also renders the compact Quick Ask header (7277-7298). |
| component | ResearchPanel window button | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Shows the detach button on the Research panel. |
| component | WorkSessionPanel window button | `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx` | Shows the detach button on the Details panel. |
| service | applyRemoteWindowPolicy | `apps/desktop/electron/windowPolicy.ts` | Allows agi-panel windows with fixed options, locks them, closes them with the opener, refuses other navigation. |
| service | quickAsk | `apps/desktop/electron/quickAsk.ts` | Creates, warms, positions, shows, hides and hands off the Quick Ask window. |
| service | main process wiring | `apps/desktop/electron/main.ts` | Imports quickAsk (223-228), maps the shortcut to toggleQuickAsk (1936), hands routes to the main window (1653-1664), configures bridge and warm-up (2702-2717). |
| service | shortcuts | `apps/desktop/electron/shortcuts.ts` | Registers the global Quick Ask chord and reports its status. |
| config | HOST_SHORTCUT_CHOICES | `packages/contracts/local-runtime/src/host-bridge.ts` | Names the Quick Ask key, default chord and allowed choices. |
| screen | Quick Ask route | `apps/web/app/quick-ask/page.tsx` | Renders the chat page in compact mode. |
| screen | Quick Ask layout | `apps/web/app/quick-ask/layout.tsx` | Requires sign-in, current terms and adult check before showing the page. |
| screen | Quick Ask conversation and dictate routes | `apps/web/app/quick-ask/[sessionId]/page.tsx` | Shows an existing conversation in the compact window; a dictate route sits beside it (apps/web/app/quick-ask/dictate/page.tsx). |
| config | QUICK_ASK_PATH | `apps/web/features/chat/lib/new-chat-entry.ts` | Names the /quick-ask path used by the compact page. |
| service | setupInPagePanel | `apps/extension/src/inPagePanel/setup.ts` | Mounts or removes the launcher and panel according to site approval and the setting; hides them while the side panel is open. |
| component | launcher | `apps/extension/src/features/content/in-page-panel/launcher.ts` | The 48px floating button that hides on scroll down. |
| component | in-page panel | `apps/extension/src/features/content/in-page-panel/panel.ts` | The 380px panel with chips, composer, streamed answer and the Open in side panel link. |
| service | assistantPanel | `apps/extension/src/features/surface/assistantPanel.ts` | Opens the side panel, or a pop-up window when the browser has no side panel API. |
| service | handleInPagePrompt | `apps/extension/src/background.ts` | Checks the account, then sends the in-page question to Managed Cloud with automatic model selection (lines 9112-9162). |
| config | in_page_panel_enabled | `apps/extension/src/features/options/preference-rows.ts` | Storage key of the Page assistant overlay setting. |
| config | manifest commands | `apps/extension/manifest.json` | Declares sidePanel permission, the Alt+Shift+K command and the side panel page (lines 17, 67-86). |
| test | quickAsk.test.ts | `apps/desktop/electron/__tests__/quickAsk.test.ts` | Quick Ask window tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses the detach button; the web page calls window.open with a named about:blank window. | device | apps/web/features/desktop-host/lib/panel-windows.ts:115 |
| The Electron window policy sees an about:blank request named agi-panel-<letters> and allows it with fixed size options. | device | apps/desktop/electron/windowPolicy.ts:246-249, 319-327 |
| The page copies style nodes into the new window and draws the panel there through a portal; the panel's data still comes from the main window's page. | device | panel-windows.ts:56-107, 125-143; PanelWindow.tsx:21-27 |
| Quick Ask shortcut fires; the main process shows the pre-created window and it loads the hosted /quick-ask page from the cloud app origin. | device and our servers | apps/desktop/electron/main.ts:1936; quickAsk.ts:9-10, 124, 150-162 |
| The hosted layout checks identity, terms and adult eligibility before showing the page. | our servers | apps/web/app/quick-ask/layout.tsx:14-25 |
| A question in Quick Ask goes through the same hosted chat page as the main window (compact mode of WebChatPage). | our servers | apps/web/app/quick-ask/page.tsx:6-8; apps/web/app/quick-ask/layout.tsx:27-31. Which model route it uses is unknown. |
| Chrome: the content script asks the service worker if the site is approved and the setting is on, then mounts the launcher. | device | apps/extension/src/background.ts:5568-5573; setup.ts:93-114 |
| Chrome: a question is sent over a port to the service worker, which uses the managed account token and streams the answer from Managed Cloud with automatic model selection. | device and our servers | background.ts:9125-9162; panel.ts:84-85 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Detached panel window state (window handles, style clones) | memory of the web page only | no | released on pagehide or when the panel unmounts after 2 seconds (panel-windows.ts:133-141, 158-173) |
| Quick Ask conversation | our servers, like any hosted chat (inferred from the hosted route) | yes [inferred] | unknown; not traced |
| Chrome in-page prompt and answer | not saved as a conversation; one prompt and response at a time | no | cleared by New question or closing (apps/extension/_locales/en/messages.json:508-511; panel.ts:645-653) |
| Chrome page assistant setting | store:chrome.storage.local key in_page_panel_enabled | unknown | kept until changed |

**Models and providers.** Quick Ask uses the hosted chat page, so models come from the hosted app; I did not trace the compact route to a provider (unknown). The Chrome in-page panel always uses Managed Cloud with automatic model selection (apps/extension/src/features/content/in-page-panel/panel.ts:84-85; background.ts:9157-9162). Detach itself uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop Quick Ask needs sign-in, current terms and adult check (apps/web/app/quick-ask/layout.tsx:14-25). Chrome in-page panel needs a signed-in AGI account (background.ts:9135-9137). Detach: the host being present; no separate account check found in the detach code. |
| Permissions | Chrome: per-site approval and the sidePanel permission (manifest.json:17; background.ts:5568-5573). Desktop: windows run sandboxed with context isolation and no Node access (quickAsk.ts:67-73; windowPolicy.ts:237-241). The Quick Ask window does receive the preload bridge (quickAsk.ts:17-23, 72, main.ts:2702-2708); docs/decisions/wire-or-cut.md:706 says it has none, so the document is out of date. |
| Subscription | none found in the code for detach, the Quick Ask window or the Chrome launcher. What the hosted chat or Managed Cloud does with plans on a question is outside these files (see SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | none found in the code in the files for detach, Quick Ask window or in-page panel. Page text sent from Chrome is bounded by MAX_PAGE_TEXT_CHARACTERS (apps/extension/src/features/content/in-page-panel/panel.ts:50-54). |
| Feature flags | Chrome: in_page_panel_enabled (default on unless set to false) (background.ts:5573). Desktop: Quick Ask shortcut can be set to none (host-bridge.ts:141-172). No other flags found. |
| Model compatibility | Chrome in-page: automatic selection only, the person cannot pick a model there. Quick Ask: unknown. |
| Provider restrictions | Chrome in-page panel is Cloud only (label 'Managed Cloud · Auto'). Quick Ask loads the hosted app; no own-key or local path was found in the Quick Ask files. |
| Local mode | Quick Ask needs the hosted page and a signed-in account, so it does not work offline or without signing in (apps/web/app/quick-ask/layout.tsx:19-21; quickAsk.ts:124). Whether the hosted compact page offers Local inference is unknown. Chrome in-page panel has no Local path. Detach is only window handling and is not tied to a mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Pop-up blocked or child document unreadable | detachPanel returns false and closes the child; the panel stays inline, no message. | apps/web/features/desktop-host/lib/panel-windows.ts:115-123 |
| Panel already detached | Opening again focuses the existing window; opening the Research panel inline while detached closes the inline copy and focuses the window. | panel-windows.ts:110-113; use-detachable-panels.ts:46-50 |
| Main window closes | Detached windows close with it. | apps/desktop/electron/windowPolicy.ts:341; panel-windows.ts:141 |
| Detached window closed by the person | Handles are released; the panel does not reopen inline on its own. | panel-windows.ts:133-140 (no setOpen call on pagehide) |
| Quick Ask first load failed (offline or asleep) | Reloaded on the next show. | quickAsk.ts:91-95, 152-156 |
| Quick Ask loses focus | Hides. | quickAsk.ts:81-83 |
| Quick Ask sent to sign-in or another page | Navigation is stopped, the panel hides and the main window opens the route or its sign-in screen. | quickAsk.ts:97-114; main.ts:1653-1664 |
| Shortcut taken by another app or malformed | Registration status is 'taken' or 'malformed' and a warning is logged once. | apps/desktop/electron/shortcuts.ts:74-110 |
| Chrome side panel open | Launcher and in-page panel are hidden. | apps/extension/src/inPagePanel/setup.ts:8-15 |
| Chrome without side panel API | Opens a pop-up window; a second request focuses the existing one. | assistantPanel.ts:39-73 |
| Chrome keyboard and screen reader | Launcher and panel have aria labels; Escape closes; controls are out of tab order until opened. | launcher.ts:112-116, 135-138; panel.ts:72, 686-688; in-page-panel-ui.test.ts:244 |
| Reduced motion | Chrome launcher transitions are turned off. | launcher.ts:62-64 |
| Keyboard access for the detach button on Desktop | A labelled button with aria-label and title; no other shortcut found. | PanelWindow.tsx:44-52 |
| Offline in the Chrome in-page panel | not handled in the code beyond the generic retryable failure state (not traced). | apps/extension/__tests__/in-page-panel-ui.test.ts:368 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/quickAsk.test.ts`: Loads the compact route and focuses; reloads after a failed warm-up; ignores aborted and subframe failures; names the main-window route; hand-off of navigation out of Quick Ask; no raise for a hidden panel.
- `apps/desktop/electron/__tests__/windowPolicy.test.ts`: Window navigation policy. I found no test line naming agi-panel windows, so the panel-window request path may be untested.
- `apps/desktop/electron/__tests__/shortcuts.test.ts`: Global shortcut registration (not read in detail).
- `apps/web/e2e/quick-ask-entry.spec.ts`: A signed-out visit to /quick-ask or /quick-ask/<id> goes to sign-in with the destination kept.
- `apps/web/app/quick-ask/QuickAskRoute.test.tsx`: Quick Ask route (not read in detail).
- `apps/extension/__tests__/in-page-panel-ui.test.ts`: Reads nothing until opened, bounded page text, no host layout change, tab order, disabled empty send, cloud boundary label, retry, New clears, Settings opens.
- `apps/extension/__tests__/in-page-panel-presence.test.ts`: Launcher hides while the side panel is open and returns after.
- `apps/extension/__tests__/assistant-panel-fallback.test.ts`: Side panel opens in the same tick; pop-up window fallback; reuse of the open window.
- `apps/extension/__tests__/open-side-panel-gesture.test.ts`: OPEN_SIDE_PANEL opens synchronously to keep the user gesture.

**Test scenarios**

- **Detach and return the Research panel**
  1. On the Desktop app open a conversation and the Research panel.
  2. Press the window button.
  3. Press the same button in the new window.
  - Expected: A window titled Research appears and the inline panel closes; the second press closes the window and reopens the panel inline.
- **Pop-up blocked**
  1. In a browser that blocks pop-ups from the page, trigger detach (only where the host exists).
  - Expected: Panel stays inline and no second window exists.
- **Quick Ask lifecycle**
  1. Press the Quick Ask shortcut from another app.
  2. Ask a short question.
  3. Click on another app.
  4. Press the shortcut again and press Escape.
  - Expected: Window shows at 480 by 620, hides on blur, shows again, hides on Escape; it cannot be resized.
- **Quick Ask leaves for the main window**
  1. In Quick Ask open a conversation and choose Open full chat.
  - Expected: Quick Ask hides and the main window shows the conversation.
- **Chrome launcher and side panel exclusion**
  1. Approve a site and keep Page assistant overlay on.
  2. Reload the page; click the launcher.
  3. Press Alt+Shift+K (Command+Shift+K on Mac).
  - Expected: In-page panel opens; with the side panel open the launcher and panel disappear; closing the side panel brings the launcher back.
- **Chrome signed out**
  1. Sign out of the extension.
  2. Ask a question in the in-page panel.
  - Expected: The response area shows 'Sign in to use AGI Managed Cloud.'

**Where to look when it fails**

- Desktop console: '[shortcut]' style warnings from apps/desktop/electron/shortcuts.ts when the chord is taken (exact text not read).
- Desktop: shortcutRegistrations() status for quickAsk shows registered, taken, malformed, duplicate or off (apps/desktop/electron/shortcuts.ts:74-122).
- Chrome service worker log lines: 'OPEN_SIDE_PANEL synchronous open failed', 'Rejected message from non-allowlisted sender', 'Opening the assistant from the toolbar failed' (apps/extension/src/background.ts:4500, 4535, 7678-7680).
- Chrome response codes: request_rejected, cancelled, account_unavailable, signed_out (background.ts:9119-9137).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **No message when the pop-up is blocked.** Affects: Desktop users when a window cannot open. Evidence: apps/web/features/desktop-host/lib/panel-windows.ts:115-116. Work needed: Show a notice when detachPanel returns false.
- **Detached window size and position are not remembered.** Affects: Desktop users who detach often. Evidence: panel-windows.ts:13; no persistence code found. Work needed: Store the frame per panel in the shell window state.
- **Only two panels can be detached.** Affects: Desktop. Evidence: panel-windows.ts:5. Work needed: Extend the panel type to Artifacts and Sources if wanted by the owner.
- **No test found for panel-windows.ts, use-detachable-panels.ts or the agi-panel window policy path.** Affects: Desktop. Evidence: no matching test files found by name; windowPolicy.test.ts has no agi-panel reference. Work needed: Add unit tests for these three.
- **docs/decisions/wire-or-cut.md:706 says Quick Ask has no preload but the code gives it one.** Affects: Maintainers reading the doc. Evidence: quickAsk.ts:17-23, 72; main.ts:2702-2708. Work needed: Update the document, and confirm that the sender trust check still limits what Quick Ask can call.
- **Quick Ask behaviour in Local mode, own key and per plan is unknown.** Affects: Desktop. Evidence: quickAsk.ts loads the hosted page; no mode code in these files. Work needed: Trace the compact route through the chat pipeline and record it.
- **Brief line pointers are out of date.** Affects: Anyone following the brief. Evidence: windowPolicy.ts and manifest.json line numbers differ. Work needed: Refresh the brief.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:desktop
- surface:chrome
- surface:vscode
- mode:cloud
- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-shared-ui-and-design
- file:apps/desktop/electron/quickAsk.ts
- file:apps/web/features/desktop-host/lib/panel-windows.ts
- file:apps/extension/src/inPagePanel/setup.ts

## Unknown

- Whether Quick Ask works in Local mode or with an own key.
- Which plan rules apply to a Quick Ask or in-page question.
- The exact visible label of the Details panel window button (panelLabel value).
- Whether the retained Tauri desktop has any Quick Ask.
- How Quick Ask conversations are listed, kept or deleted.
- Whether detached windows behave the same on Windows and Linux.
