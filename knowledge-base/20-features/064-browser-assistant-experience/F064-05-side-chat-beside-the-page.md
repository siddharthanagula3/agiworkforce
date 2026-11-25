---
id: "F064-05"
type: "feature"
title: "Side chat beside the page"
aliases: ["Side chat beside the page", "Browser side conversation (S64.08)", "AGI side panel", "Extension side panel", "assistant window (fallback popup)"]
area: "64 Browser-assistant experience"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S64.08"]
depends_on: ["surface:chrome", "mode:cloud", "store:chrome.storage.local", "store:chrome.storage.session", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "api:GET /api/usage", "file:apps/extension/src/side_panel.ts", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-05 Side chat beside the page

The Chrome side panel is a full chat that stays open next to the page. It keeps its own conversation while the person switches tabs, can add the current page, selected text or tabs as context, and saves its history in the browser. It needs an AGI sign-in. If Chrome lacks the side panel, a popup window is used.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.08](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6408).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Provides a persistent chat beside any web page in Chrome, with its own history, new-chat button and temporary-chat mode, and tools for adding page context.

**Why it exists.** Brief item S64.08: a chat sits beside the page in the browser and keeps its own conversation while the person browses. [inferred] A panel lets people ask follow-ups while reading.

**Who uses it.** Chrome users who want to chat while reading or working in tabs.

**Problems it solves**

- Switching between a chat tab and the page.
- Losing the conversation when moving between pages.

**Use cases**

- Keep a research conversation open while moving through sites.
- Ask a follow-up about a different page without losing the thread.
- Start a temporary chat that is not saved.

## 2. User experience

**Where to find it**

- Click the AGI toolbar button (title 'AGI Extension') or press Command+Shift+K on Mac or Alt+Shift+K elsewhere (apps/extension/manifest.json:52-72; apps/extension/src/background.ts:7677-7681).
- Chrome declares the panel page in the manifest (apps/extension/manifest.json:83-85).
- Right-click items also open it (background.ts:7499-7676).
- If chrome.sidePanel is unavailable a popup window 440 by 860 holds the same page (apps/extension/src/features/surface/assistantPanel.ts:5-6,12-17,60-70).

**Before you start**

- Signed in to AGI. The panel has states loading, ready, signed_out and unavailable (apps/extension/src/side_panel.ts:723-726).

**Screens and controls**

- New chat button (label 'New chat', id sp-new-chat-btn) (side_panel.ts:11533-11545; messages.json:947).
- Composer with placeholder 'How can I help you today?' and plus menu items 'Add the browser page', 'Add selected text', 'Attach tabs' (messages.json:212; side_panel.ts:14797-14975).
- Model selector, Recents list, temporary chat toggle (side_panel.ts:1095-1100).

**Journey**

1. Person clicks the toolbar button; Chrome opens the panel for that tab.
2. If signed out, the panel shows the sign-in state; after sign-in it is ready.
3. Person chats; replies stream in; history is saved after each turn.
4. Person switches tabs; the conversation stays and only the page host label refreshes (side_panel.ts:16154-16156).
5. Person presses New chat to reset the view and start fresh (side_panel.ts:1901-1915).
6. Person reopens the panel later; the saved conversation is restored (save path side_panel.ts:1294-1331; restore path not opened).

**What the person sees and gets**

- Streaming answers, thinking indicator, tool activity lines, cards for approvals.
- Notices in the composer area for context problems.
- When the real side panel is open the in-page launcher hides (apps/extension/src/inPagePanel/setup.ts:8-14, 24-34).

**Settings**

- Model and effort selectors; ask-before-acting mode; site approvals and blocked sites; in-page panel toggle (side_panel.ts:6030, 11111, 15535).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Side panel opens from the toolbar button and from right-click requests (background.ts:7677-7681; assistantPanel.ts:60-70).
- Conversation persists to local extension storage and can sync to the cloud account (side_panel.ts:1294-1346, 1375-1390; apps/extension/src/features/background/conversation-history.ts:1388-1440).
- New chat clears messages and pending context (side_panel.ts:1901-1915).
- Temporary chat skips saving (side_panel.ts:1095, 1296, 1334).
- Tab switching does not reset the chat; it only refreshes the host label (side_panel.ts:16154-16156).

**Incomplete**

- History restore, recents list and the cloud mirror rules were only skimmed; details are in unknowns.

**Present but disconnected or switched off**

- Sync to the cloud applies only to conversations whose turns all ran in Managed Cloud; others stay in the browser (doc: docs/product/experience-contract.md:296-298).

**Not available**

- Web, Desktop, Mobile, CLI, VS Code: no browser side panel (brief status n/a).

## 4. Required behaviour

**Established requirements**

- A chat sits beside the page in the browser and keeps its own conversation while the user browses (S64.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.08)
- Chrome must include a popup or side panel, connected/native host status, ask/act modes and per-site prompts. (source: (doc: docs/product/requirements.md:1197-1204))
- Signed-in Chrome conversations whose turns all ran in Managed Cloud mirror into Cloud Conversation history; unknown, Local or BYOK provenance stays browser-local. (source: (doc: docs/product/experience-contract.md:296-298))
- Browser data must not enter global memory or synced chat by default. (source: (doc: docs/product/requirements.md:1213-1214))

**Acceptance criteria**

1. The toolbar button opens the panel beside the current page.
2. The conversation survives switching tabs.
3. New chat empties the conversation and attached context.
4. A temporary chat is not saved to history.
5. Signed out, the panel shows a sign-in state and does not send.
6. Where the side panel API is missing, a popup window opens the same page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reopening the panel should restore the last conversation [inferred from the save code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show which tab the conversation was last about when the person switches tabs.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | side_panel manifest entry | `apps/extension/manifest.json` | default_path src/side_panel.html (lines 83-85); action and commands (lines 52-72). |
| screen | side panel page | `apps/extension/src/side_panel.ts` | The whole chat UI (about 16,800 lines). |
| component | side_panel.html | `apps/extension/src/side_panel.html` | Markup shell of the panel. |
| service | openAssistantPanel / openAssistantWindow | `apps/extension/src/features/surface/assistantPanel.ts` | Open the side panel or the fallback popup (lines 12-17, 40-70). |
| service | toolbar and menu openers | `apps/extension/src/background.ts` | chrome.action.onClicked (line 7677) and context-menu handler (line 7499). |
| store | conversation history | `apps/extension/src/features/background/conversation-history.ts` | upsertConversation and the local store (line 1388; storage calls 924-948). |
| service | persistMessages / saveMessagesNow | `apps/extension/src/side_panel.ts` | Save after each turn (lines 1294, 1333). |
| service | requestCloudConversationSync | `apps/extension/src/side_panel.ts` | Asks the background to sync (line 1375); handler case SYNC_CONVERSATION at background.ts:6158. |
| service | resetConversationView | `apps/extension/src/side_panel.ts` | New chat reset (line 1901). |
| store | chat-state types | `apps/extension/src/features/side-panel/chat-state.ts` | SidePanelPageReference and message types (lines 32-42). |
| service | panelPresence | `apps/extension/src/features/side-panel/panelPresence.ts` | Tells pages whether the real side panel is open, to hide the launcher. |
| service | managed chat client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chat endpoint, models and usage endpoints (lines 112-116). |
| service | managed chat handler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Streams the turn and tool hand-offs. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Chat route (line 1526). |
| endpoint | GET /api/llm/v1/models | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Model list endpoint constant (line 115). |
| endpoint | GET /api/usage | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Usage endpoint constant (line 116). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The toolbar button or a menu click asks Chrome to open the side panel for the tab or window. | device | background.ts:7677-7681; assistantPanel.ts:60-70 |
| The panel checks the AGI account and sets its state to ready, signed_out or unavailable. | device and our servers | side_panel.ts:723-726; freeTrialClient.ts:115-116 |
| A message with any attached context is sent to AGI Managed Cloud and the reply streams back. | our servers | freeTrialClient.ts:112; background.ts:8061 |
| After the turn the conversation is saved in browser storage and a sync request is sent. | device and our servers | side_panel.ts:1294-1346; background.ts:6158 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation messages and routing state | store:chrome.storage.local via conversation-history.ts | Requested after each save; applies to Managed Cloud conversations only | Kept in the history list; deletion path not opened |
| Pending right-click requests | store:chrome.storage.session key agi_pending_chat | No | Removed when handled; time-limited by PENDING_CHAT_TTL_MS (side_panel.ts:16613) |
| Page references on messages | Title and address only (chat-state.ts:32-35) | With the chat | With the chat |

**Models and providers.** Model chosen with an Auto option or a selector; the route is AGI Managed Cloud only (background.ts:8061). No provider selection by the person was found in the extension chat.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | AGI sign-in required; signed-out state exists (side_panel.ts:723-726; background.ts:9135-9137). |
| Permissions | Site permission policies decide page reads (side_panel.ts:7738-7757). |
| Subscription | The panel loads models and usage from the account (freeTrialClient.ts:115-116) and shows plan notices (apps/extension/src/features/side-panel/freePlanNotices.ts); which plan gets what: unknown, not opened. |
| Limits and metering | Usage windows are shown (apps/extension/src/features/side-panel/usageWindows.ts); limits come from the server. Attachment cap 5 (freeTrialClient.ts:103). |
| Feature flags | none found in the code for the panel itself. |
| Model compatibility | Chat tools are offered only when the chosen model supports tools (side_panel.ts:8769-8773). |
| Provider restrictions | Managed Cloud only. |
| Local mode | Not available in Chrome chat; the in-page code states inference remains Managed Cloud only (background.ts:8061). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | State 'loading' until the account is read | side_panel.ts:723-726 |
| Signed out | Sign-in state; composer actions that need a ready chat are skipped | side_panel.ts:10552, 12016 |
| Unavailable | State 'unavailable' for an account that cannot be read | side_panel.ts:723 |
| Streaming | Context attach actions refuse with 'wait for the reply' | side_panel.ts:10553 |
| Cancel | Stop control cancels the stream | apps/extension/__tests__/side-panel-stop.test.ts |
| No side panel API | Opens a popup window of the same page, reusing an existing one | assistantPanel.ts:12-17,35-45 |
| Return to the panel | Open chat refreshes at most every 10 seconds when idle | side_panel.ts:16165-16175 |
| Offline or reconnect | not handled in the code beyond stream error notices (not examined in depth) | Looked at side_panel.ts:1333-1342 (save failure only logs a warning) and 16165-16175; no offline branch found |
| Accessibility | Tested in side-panel-a11y.test.ts | apps/extension/__tests__/side-panel-a11y.test.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/side-panel-chat-state.test.ts`: Chat state of the side panel.
- `apps/extension/__tests__/side-panel-stream-persistence.test.ts`: Saving partial streams.
- `apps/extension/__tests__/side-panel-history-resume.test.ts`: Resuming a saved conversation.
- `apps/extension/__tests__/conversation-history.test.ts`: The history store.
- `apps/extension/__tests__/assistant-panel-fallback.test.ts`: Fallback popup when the side panel API is missing.
- `apps/extension/__tests__/open-side-panel-gesture.test.ts`: Opening the panel inside a user gesture.
- `apps/extension/__tests__/side-panel-stop.test.ts`: Stopping a reply.
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Accessibility of the panel.
- `apps/extension/__tests__/in-page-panel-presence.test.ts`: Launcher hides while the real side panel is open.

**Test scenarios**

- **Open and chat**
  1. Click the AGI toolbar button.
  2. Sign in if asked; send a message.
  - Expected: Panel opens beside the page and a streamed answer appears.
- **Conversation survives tab changes**
  1. Chat in the panel; switch to another tab.
  - Expected: Messages stay; the host label updates.
- **New chat**
  1. Press New chat.
  - Expected: Messages and attached context are cleared.
- **Temporary chat**
  1. Turn on a temporary chat; send a message; reopen the panel.
  - Expected: The temporary conversation is not in Recents.
- **Signed out**
  1. Sign out; open the panel.
  - Expected: Sign-in state; sending is not possible.

**Where to look when it fails**

- Console warning '[SidePanel] Failed to persist messages:' (side_panel.ts:1339).
- Background logger lines for SYNC_CONVERSATION and context menu failures.
- chrome.storage.local keys of conversation-history.ts.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **History restore, deletion and cloud mirror rules were not opened.** Affects: Chrome. Evidence: Only persist and reset code read. Work needed: Read and document restore and delete paths.
- **Conversation does not follow the page: it is the same thread on every tab by design.** Affects: Chrome. Evidence: side_panel.ts:16154-16156. Work needed: Decide if a per-tab thread is wanted.
- **No Local mode for the side chat.** Affects: Chrome. Evidence: background.ts:8061. Work needed: Product decision only.

**Depends on**

- surface:chrome
- mode:cloud
- store:chrome.storage.local
- store:chrome.storage.session
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- api:GET /api/usage
- file:apps/extension/src/side_panel.ts
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-memory-projects-and-context

## Unknown

- How history restore and deletion work and what the person sees.
- Exact rules for which conversations sync to the cloud.
- Plans that change what the panel offers.
- Whether the side panel API exists in every supported Chrome version (manifest minimum is 132, manifest.json:87).
- Behaviour while offline.
