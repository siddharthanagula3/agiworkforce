---
id: "F109-03"
type: "feature"
title: "Compact floating Quick Ask panel"
aliases: ["Quick Ask", "Quick Ask panel", "Compact assistant (S109.05)", "In-page panel (Chrome)", "Ask AGI launcher (Chrome)", "/quick-ask"]
area: "109 Optional native and ambient extensions"
available_on: ["desktop", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S109.05"]
depends_on: ["surface:desktop", "surface:chrome", "surface:web", "file:apps/desktop/electron/quickAsk.ts", "file:apps/web/app/quick-ask/layout.tsx", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "F109-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-03 Compact floating Quick Ask panel

A small always-on-top window on AGI Desktop, opened with a global key, that takes one prompt over any other app. It shows the hosted compact chat page and hands longer work to the main window. Chrome has a matching in-page panel on approved sites. Mobile has none.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.05](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10905).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Desktop keeps a hidden 480 by 620 frameless window loaded with the hosted /quick-ask page (apps/desktop/electron/quickAsk.ts:6-10,52-126). A key press shows it in the upper centre of the display under the cursor. In Chrome, a launcher button and slide-in panel are added to approved web pages for one question about the page (apps/extension/src/inPagePanel/setup.ts:44-66).

**Why it exists.** A compact assistant should float over other content and take a prompt without opening the full app (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md S109.05). The code comment compares it to the ChatGPT and Claude companion windows (quickAsk.ts:43-47).

**Who uses it.** Desktop users who want a fast question without switching windows; Chrome users who want a question about the page they are on.

**Problems it solves**

- Switching to the main app for a one-line question.
- Losing the current context to open a full chat.
- Page questions without leaving the page (Chrome).

**Use cases**

- Press the Quick Ask key, ask for a command, Escape.
- Ask a question, then follow a link in the answer that belongs in the main window.
- In Chrome, click the launcher on a page and ask 'Summarize this'.
- Open Quick Ask, then press the dictation key to speak the question (F109-04).

## 2. User experience

**Where to find it**

- Desktop: global key default 'Alt+Shift+Space' (packages/contracts/local-runtime/src/host-bridge.ts:162); tray item 'Quick Ask' (F109-01); app menu items 'Quick Ask' (apps/desktop/electron/appMenu.ts:183,621); dock menu toggle (apps/desktop/electron/main.ts:2622-2626). Settings row 'Quick Ask shortcut': 'Message AGI from anywhere on your desktop.' (DesktopSettingsSection.tsx:92-96).
- Chrome: round launcher button with label 'Open AGI' and tooltip 'Ask AGI' (apps/extension/src/features/content/in-page-panel/launcher.ts:114,120) and a panel with textarea placeholder 'Ask one question about this page…' and button 'Open in side panel' (apps/extension/src/features/content/in-page-panel/panel.ts, composer and footer built around lines 130-180).
- Mobile: none (brief: missing).
- Web, CLI, VS Code: not part of this feature.

**Before you start**

- Desktop: signed in; the hosted page requires a session, accepted current terms and adult eligibility, else it redirects (apps/web/app/quick-ask/layout.tsx:15-23).
- Chrome: site origin approved and the in-page panel preference not switched off (apps/extension/src/inPagePanel/setup.ts:93-103; apps/extension/src/background.ts:5566-5573); sign-in to AGI Managed Cloud (background.ts:9135-9137).

**Screens and controls**

- Desktop panel: the compact chat page (WebChatRoot with compact set, apps/web/app/quick-ask/page.tsx:6-7). Frameless, not resizable, no taskbar entry (quickAsk.ts:52-66).
- Hides on Escape or when it loses focus (quickAsk.ts:81-89).
- Chrome panel: close, new, settings buttons, page action row, response area, privacy note, context chip, composer, 'Open in side panel' (panel.ts, shell built around lines 100-180).

**Journey**

1. Press the key; the panel is made if missing, reloaded if its page failed or left Quick Ask, placed, shown and focused (quickAsk.ts:150-162).
2. Type a prompt and send; the hosted chat answers.
3. Press Escape or click elsewhere to hide; the key toggles it (quickAsk.ts:164-171).
4. If the page navigates away from Quick Ask (for example to a conversation), the panel hides and the main window opens that route (quickAsk.ts:29-41,97-115).

**What the person sees and gets**

- The streamed answer inside the panel.
- Chrome: failure message with Retry and 'Open in side panel' (panel.ts streamPrompt).
- Sign-out message in Chrome: 'Sign in to use AGI Managed Cloud.' (background.ts:9136).

**Settings**

- quickAskShortcut (default and choices in host-bridge.ts:162).
- Chrome: in-page panel on/off preference stored under IN_PAGE_PANEL_ENABLED_STORAGE_KEY (apps/extension/src/background.ts:382,5573).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Panel size and flags: 480x620, frameless, always on top, hidden from taskbar, all workspaces and fullscreen (quickAsk.ts:6-7,52-77).
- Position: horizontally centred and 18 percent down the work area of the display under the cursor, kept on screen (quickAsk.ts:139-144; garnishCore.ts centeredUpperPosition around line 273).
- Warm-up shortly after launch (apps/desktop/electron/main.ts:2717).
- Reload when the first load failed or the panel left Quick Ask (quickAsk.ts:93-95,152-156).
- Navigation away goes to the main window via openRouteFromQuickAsk (quickAsk.ts:97-115; main.ts:2709).
- Panel uses a sandboxed, context-isolated renderer with the preload attached so dictation can reach it (quickAsk.ts:67-73; main.ts:2702-2708).
- Chrome panel mounts only when approved and enabled, hides when the real side panel is open (setup.ts:8-15,93-103).

**Incomplete**

- If the page cannot load the panel stays blank until the next raise; no error UI in quickAsk.ts (quickAsk.ts:93-95).
- Chat entitlements, model choice and limits inside the compact chat were not traced: unknown.

**Present but disconnected or switched off**

- None found.

**Not available**

- Mobile floating panel: brief says missing; no code found in this review (not exhaustively searched).
- Web, CLI, VS Code: not part of this feature.

## 4. Required behaviour

**Established requirements**

- A compact assistant floats over other apps or pages and can take a prompt without opening the full app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.05)
- Desktop settings must include a quick access shortcut. (source: doc: docs/product/definition.md:406)
- The panel is sized for one exchange; a conversation opened in full, an upgrade page or settings belongs in the main window. (source: apps/desktop/electron/quickAsk.ts:43-47)

**Acceptance criteria**

1. The Quick Ask key shows a 480 by 620 panel in the upper centre of the display under the cursor, above other apps.
2. Pressing the key again, Escape, or clicking another window hides it.
3. Navigating inside the panel to a conversation hides it and opens that route in the main window.
4. After a failed first load (offline at launch), the next press reloads the page.
5. Signed out, the panel leads to sign-in instead of a chat.
6. In Chrome on an approved site the launcher appears; on an unapproved site or when switched off it does not.
7. In Chrome, a prompt while signed out shows 'Sign in to use AGI Managed Cloud.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Quick Ask chats count against the same account limits as main-window chats because it loads the same hosted chat [inferred; not traced].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show an error and Retry in the panel when the hosted page fails to load.
- [proposed] Decide on a mobile counterpart or record it as not planned.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Quick Ask window manager | `apps/desktop/electron/quickAsk.ts` | Creates, positions, shows, hides, reloads the panel and hands routes off. |
| service | centeredUpperPosition | `apps/desktop/electron/garnishCore.ts` | Computes the panel's place. |
| service | warm-up and handoff wiring | `apps/desktop/electron/main.ts` | configureQuickAskBridge, configureQuickAskHandoff, warmUpQuickAsk (lines 2702-2717). |
| service | window policy for remote pages | `apps/desktop/electron/windowPolicy.ts` | Applies the remote window policy and sign-in handoff to the panel. |
| screen | /quick-ask page | `apps/web/app/quick-ask/page.tsx` | Renders the compact chat. |
| component | Quick Ask layout | `apps/web/app/quick-ask/layout.tsx` | Requires identity, terms and adult check before the chat. |
| screen | /quick-ask/[sessionId] | `apps/web/app/quick-ask/[sessionId]/page.tsx` | A Quick Ask conversation route. |
| component | WebChatRoot compact | `apps/web/features/chat/components/WebChatRoot.tsx` | Shared chat in compact form. |
| service | registerGarnishShortcuts | `apps/desktop/electron/shortcuts.ts` | Registers the Quick Ask key. |
| service | Chrome setupInPagePanel | `apps/extension/src/inPagePanel/setup.ts` | Mounts or removes the launcher and panel. |
| component | in-page panel UI | `apps/extension/src/features/content/in-page-panel/panel.ts` | Panel DOM, streaming prompt and retry. |
| component | in-page launcher | `apps/extension/src/features/content/in-page-panel/launcher.ts` | Floating button. |
| service | handleInPagePrompt | `apps/extension/src/background.ts` | Runs the Chrome in-page prompt through Managed Cloud (lines 6060-6071, 9112-9205). |
| test | quickAsk tests | `apps/desktop/electron/__tests__/quickAsk.test.ts` | Load, reload, handoff. |
| test | Quick Ask route test | `apps/web/app/quick-ask/QuickAskRoute.test.tsx` | Layout gating and compact root. |
| test | in-page panel UI tests | `apps/extension/__tests__/in-page-panel-ui.test.ts` | Panel UI behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Shortcut toggles the panel; the hidden panel was loaded at launch. | device | apps/desktop/electron/quickAsk.ts:164-171; main.ts:2717 |
| The panel loads the hosted /quick-ask page from the cloud app origin; layout checks identity, terms and age. | our servers | apps/desktop/electron/quickAsk.ts:9-10,124; apps/web/app/quick-ask/layout.tsx:15-23 |
| A prompt is sent through the normal chat pipeline of the hosted app. | our servers | apps/web/app/quick-ask/page.tsx:6-7 (pipeline not traced) |
| A navigation outside Quick Ask hides the panel and opens the route in the main window. | device | apps/desktop/electron/quickAsk.ts:97-115 |
| Chrome: the panel sends IN_PAGE_PROMPT to the background worker, which streams a Managed Cloud completion with automatic model selection. | outside service | apps/extension/src/background.ts:9138-9205 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Quick Ask conversation | Account chat storage on our servers via the hosted app (not traced) | unknown | unknown |
| Chrome in-page prompt and page context | Sent to Managed Cloud; answer shown in panel; no local persistence found in panel.ts | unknown | unknown |

**Models and providers.** Desktop: the model is whatever the hosted chat selects (SYS-model-catalog-and-routing). Chrome: modelSelection is fixed to 'auto' on Managed Cloud (apps/extension/src/background.ts:9164).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop panel requires a signed-in account, accepted terms and adult eligibility (apps/web/app/quick-ask/layout.tsx:15-23). Chrome requires an AGI Managed Cloud credential (background.ts:9135-9137). |
| Permissions | Desktop: none beyond the key; Chrome: site approval per origin (setup.ts:93-103). |
| Subscription | unknown: chat access rules are in SYS-subscriptions-entitlements-and-usage and were not traced for this page. |
| Limits and metering | unknown for Desktop; Chrome calls the managed chat with an unattended completion mode (background.ts:9165). |
| Feature flags | Chrome in-page panel preference. |
| Model compatibility | Any model the hosted chat offers; Chrome uses automatic selection. |
| Provider restrictions | none found in the panel code |
| Local mode | The Desktop panel loads a hosted page, so it needs a network and a session; local inference through this panel was not found (unknown). Chrome in-page panel is Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| First load failed (offline, sleep) | Reloaded on the next raise | quickAsk.ts:93-95,152-156 |
| Aborted load | Ignored, not treated as failure | quickAsk.ts:8,94 |
| Panel left Quick Ask | Hidden; main window opens route; panel reloaded next time | quickAsk.ts:97-115,152-156 |
| Panel not visible when a navigation happens | No main window raise | quickAsk.ts:101 |
| Signed out | Redirect to session-expired sign-in | apps/web/app/quick-ask/layout.tsx:20-22 |
| Page cannot load | Blank panel; no error UI | not handled in the code (quickAsk.ts) |
| Chrome request cancelled or failed | Outcome message with retry | apps/extension/src/features/content/in-page-panel/panel.ts streamPrompt |
| Chrome real side panel open | Launcher and panel hidden | apps/extension/src/inPagePanel/setup.ts:8-15 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/quickAsk.test.ts`: Compact route load and focus, reload after failed load, aborted loads, route handoff, no raise for hidden panel.
- `apps/web/app/quick-ask/QuickAskRoute.test.tsx`: Layout identity, terms and age gating, compact root.
- `apps/web/app/quick-ask/[sessionId]/page.test.tsx`: Quick Ask conversation route.
- `apps/extension/__tests__/in-page-panel-ui.test.ts`: In-page panel UI.
- `apps/extension/__tests__/in-page-panel-presence.test.ts`: Panel hidden while the side panel is open.
- `apps/extension/__tests__/inPagePanel.test.ts`: In-page panel setup.

**Test scenarios**

- **Raise and hide**
  1. Press the Quick Ask key from another app.
  2. Press Escape.
  - Expected: Panel appears in the upper centre, then hides.
- **Offline warm-up**
  1. Launch Desktop offline, go online, press the key.
  - Expected: The page loads on the press.
- **Handoff**
  1. In the panel follow a link to a full conversation.
  - Expected: Panel hides and main window opens that route.
- **Signed-out**
  1. Sign out and press the key.
  - Expected: Sign-in flow is shown, not a chat.
- **Chrome panel**
  1. Approve a site, click the launcher, ask a question.
  - Expected: Answer streams; when signed out the sign-in message shows.

**Where to look when it fails**

- did-fail-load for the panel's main frame sets the failure flag (quickAsk.ts:93-95).
- Chrome failure codes signed_out, account_unavailable, retryable_error (background.ts:9129-9136,9185-9189).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/desktop/109-optional-native-and-ambient-extensions.md)
- Chrome: [70-qa/test-plans/chrome/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/chrome/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **No error UI when the panel page fails to load** Affects: Desktop users offline. Evidence: apps/desktop/electron/quickAsk.ts:93-95,152-156. Work needed: Show a retry message in the panel or on the window.
- **Mobile has no floating assistant** Affects: Mobile users. Evidence: brief S109.05 status. Work needed: Product decision; not traced by code search.
- **Local inference not reachable from the Quick Ask panel in the code read** Affects: Desktop users in Local mode. Evidence: apps/desktop/electron/quickAsk.ts:9-10. Work needed: Trace the compact chat for Local mode and fix or document.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:desktop
- surface:chrome
- surface:web
- file:apps/desktop/electron/quickAsk.ts
- file:apps/web/app/quick-ask/layout.tsx
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- F109-01

## Unknown

- Which provider or model serves Quick Ask chats and Chrome in-page prompts.
- Plan, quota and Local-mode behaviour of the compact chat.
- Value of QUICK_ASK_WARMUP_MS (main.ts:2717 region).
- Whether any mobile floating-panel work exists (brief only).
- Whether the Quick Ask conversation is saved to the account.
