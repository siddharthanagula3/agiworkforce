---
id: "F019-08"
type: "feature"
title: "Saving and restoring results"
aliases: ["Saved to your account", "Saved on this device", "Syncing to your account", "Sync needs attention", "Session restore", "Managed session saved", "/save", "persistAssistant", "finishReason", "Conversation restore"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.14", "S19.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "table:web_messages", "table:web_conversations", "store:mmkv", "api:POST /api/chat/conversations/{id}/messages", "file:apps/web/lib/hooks/useChatStream.ts", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "SYS-authentication-and-identity", "F019-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-08 Saving and restoring results

Each finished turn is stored with its final state (done, failed or stopped) and returns after a restart. Web, Desktop, Mobile and the CLI restore the conversation. Only the Chrome extension shows a saved label; the CLI has a /save command. No app shows a save time or a visible save-failed notice.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.14](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1914), [S19.28](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1928).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Saves the assistant turn and its metadata, including the finish reason, stream error, activity and run reference, then loads them again when the conversation is reopened. Web writes the turn to the server (apps/web/lib/hooks/useChatStream.ts:2779-2840); Mobile keeps Local chats in device storage and loads Cloud chats from the server (apps/mobile/stores/chat/chatMessageStore.ts:1729-1735, 772-830); the CLI writes a session file (apps/cli/src/agent/mod.rs:2627-2670); the Chrome extension keeps history in browser storage and mirrors it to the account with a visible label (apps/extension/src/side_panel.ts:587-690).

**Why it exists.** A person must find the conversation and each turn's outcome after closing the app, and must know whether the work is kept. Brief items S19.14 (saving results) and S19.28 (session restored after restart) require this (doc: knowledge-base/data/area-briefs/019-streaming-and-response-presentation-states.md).

**Who uses it.** Anyone who closes and reopens a conversation on any of the six apps.

**Problems it solves**

- Lost answers after a restart.
- A stopped or failed turn reappearing as if it were complete (stopped turns keep finishReason 'stopped', apps/web/lib/hooks/useChatStream.ts:693, 2809-2815).
- Not knowing whether a Chrome chat is on the account or only in the browser.
- A cancelled CLI turn leaving a lone prompt in the session file (apps/cli/src/lib.rs:8613-8626).

**Use cases**

- Reopen a Web conversation after a restart and see the last turn marked stopped.
- Open the Chrome side panel and read 'Saved to your account' under the title.
- Run 'agi resume latest' in the CLI to continue an earlier session.
- Open an earlier VS Code session from the session list.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): reopen any conversation from the sidebar; the last turn shows its state (apps/web/features/chat/components/messages/ChatMessageList.tsx:1207, 1758). No save notice was found.
- Mobile: reopen a chat from the chats list (apps/mobile/src/features/chat/ChatsListScreen.tsx); Cloud chats load via the server, Local chats from the phone.
- CLI: '/save' in the TUI, '/resume', 'agi resume [session]', 'agi history' (apps/cli/src/tui/tui_app.rs:6002-6012; apps/cli/src/lib.rs:910-925, 966-980).
- VS Code: the sessions list in the sidebar opens a previous session (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1562).
- Chrome: under the conversation title the labels 'Saved to your account', 'Saved on this device', 'Syncing to your account', 'Sync needs attention', 'Sign in to sync', 'Not syncing', 'New chat' (apps/extension/src/side_panel.ts:587-690).

**Before you start**

- Web, Desktop, Mobile Cloud: signed in; the conversation is not temporary (apps/web/lib/hooks/useChatStream.ts:2796).
- Chrome: account mirroring turned on and a Cloud-eligible chat for the 'Saved to your account' label (apps/extension/src/side_panel.ts:595-690).
- CLI: session persistence on; '--no-session-persistence' disables writing (apps/cli/src/repl/registry.rs:110-120).

**Screens and controls**

- Chrome: persistence label with detail text under the title.
- CLI: '/save' prints 'Managed session saved: <id>' or an error (apps/cli/src/repl/registry.rs:140-152).
- Web/Desktop/Mobile: no save control; saving is automatic.

**Journey**

1. 1. A turn finishes, is stopped or fails.
2. 2. The app builds the message metadata (finish reason, stream error, activity, run reference) and saves the assistant message.
3. 3. The person closes the app.
4. 4. The person reopens the app or the conversation.
5. 5. The app loads the stored messages with their metadata.
6. 6. Each turn renders its final state: done, failed or stopped.
7. 7. Chrome shows the persistence label; the CLI shows 'Managed session saved' only after /save.

**What the person sees and gets**

- Chrome label and detail (see above).
- CLI messages: 'Managed session saved: <id>', 'Nothing to save, no messages in session yet.', 'Cannot save, this run was started with --no-session-persistence…' (apps/cli/src/repl/registry.rs:115-152).
- Web: a failed assistant save is logged to the console only: 'Failed to save assistant message' (apps/web/lib/hooks/useChatStream.ts:813-815).
- No save timestamp is shown on any app; Chrome shows only a state label.

**Settings**

- Chrome: account mirroring setting (apps/extension/src/side_panel.ts:595).
- CLI: --no-session-persistence flag.
- Web: temporary conversations are not saved (apps/web/lib/hooks/useChatStream.ts:2796).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: assistant turn is saved with finishReason, streamError, agentActivity and cloudAgentRun metadata (apps/web/lib/hooks/useChatStream.ts:2779-2815); the server stores it in table web_messages (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts) and marks a cancelled run's turn 'stopped' (apps/web/app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts:11-50).
- Desktop (Electron): shows the hosted web app, so Web storage applies [inferred from doc: AGENTS.md section 5]; the retained Tauri CloudRuntime also saves turns (apps/desktop/src/runtime/CloudRuntime.ts:366-386).
- Mobile: Local chats persist to device storage under 'chat-message-store-local' (apps/mobile/stores/chat/chatMessageStore.ts:1729); Cloud messages load from the server in pages (apps/mobile/stores/chat/chatMessageStore.ts:795-830); a stopped message is stamped finishReason 'stopped' (apps/mobile/stores/chat/chatMessageStore.ts:415).
- Chrome: conversation history in browser storage, mirrored to the account, with the saved-state label (apps/extension/src/side_panel.ts:587-690; apps/extension/src/features/background/conversation-history.ts:924-948).
- CLI: the session file is written after turns, on exit and on a cancelled turn; '/save' and 'agi resume' work (apps/cli/src/lib.rs:8613-8626; apps/cli/src/tui/tui_app.rs:7143).
- VS Code: earlier sessions resume through the runtime (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2913).

**Incomplete**

- No app shows when a result was saved. Chrome shows a state label but no time (apps/extension/src/side_panel.ts:587-690).
- Web assistant save failure is only logged (apps/web/lib/hooks/useChatStream.ts:813-815); a visible notice was not found. Web does set a conflict flag contentSaveConflict on one failure type (apps/web/lib/hooks/useChatStream.ts:2842-2850) whose display was not traced.
- CLI: automatic saving exists but gives no 'saved' notice during a normal turn; the explicit notice appears only for /save. A failed save on exit is written to the log only (apps/cli/src/lib.rs:8624-8626).
- VS Code: no save notice found.

**Present but disconnected or switched off**

- Temporary conversations on Web are never saved (apps/web/lib/hooks/useChatStream.ts:2796).
- CLI saving is off with --no-session-persistence (apps/cli/src/repl/registry.rs:110-120).

**Not available**

- Save-time display on all six apps (none found).
- Visible save-failed message on Web, Desktop and Mobile (none found in the code read).

## 4. Required behaviour

**Established requirements**

- After output completes, the surface shows results being saved or synced and when they are saved. (source: S19.14 (brief))
- After the app restarts, the conversation and each turn's final state (done, failed or stopped) come back as they were. (source: S19.28 (brief))
- The final state of each turn is stored with the message and comes back on reload. (source: task text for F019-08)
- A save that fails should say so (not verified). (source: task text for F019-08)

**Acceptance criteria**

1. Complete a turn, restart the app, reopen the conversation: the turn shows done.
2. Stop a turn, restart: it shows stopped and keeps the text that arrived.
3. Fail a turn after partial output, restart: partial text and the failure mark remain.
4. Chrome: with mirroring on, after a turn the label moves from 'Syncing to your account' to 'Saved to your account'.
5. Chrome: with mirroring off the label reads 'Saved on this device'.
6. CLI: '/save' prints 'Managed session saved: <id>'; 'agi resume <id>' reloads the transcript.
7. Temporary chat: nothing is stored after a restart.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A saved-time display is implied by the brief's 'when they are saved' but no app has it [inferred].
- A visible failure notice is implied by 'a save that fails should say so' [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a 'Saved' time on each app, or one shared saved indicator.
- [proposed] Surface assistant-save failures on Web and Mobile with a retry action.
- [proposed] Add an automatic saved notice to the CLI turn footer.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useChatStream persistAssistant / buildAssistantMetadata | `apps/web/lib/hooks/useChatStream.ts` | Builds and saves the assistant message with finish state. |
| endpoint | POST /api/chat/conversations/{id}/messages | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Inserts the message and normalised metadata; records stopped runs. |
| table | web_messages | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Stores role, content and JSON metadata (finishReason, cloudAgentRun). |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Conversation row; title and active leaf updated on save. |
| service | recordStoppedRunAssistantTurn | `apps/web/app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts` | Stamps finishReason 'stopped' on the turn of a cancelled run. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Renders the restored turn state (stopped, failed, completed). |
| store | web-chat-store | `apps/web/shared/stores/web-chat-store.ts` | Web message store carrying cloudAgentRun metadata. |
| component | SessionItem | `packages/ui/ui/src/sidebar/SessionItem.tsx` | Shared sidebar row used to reopen a saved conversation. |
| service | CloudRuntime.persistAssistantTurn | `apps/desktop/src/runtime/CloudRuntime.ts` | Retained Tauri-build save of the Cloud turn. |
| store | chat-message-store-local (MMKV) | `apps/mobile/stores/chat/chatMessageStore.ts` | Persists Local chats on the phone; loads Cloud pages from the server. |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Opens a conversation and loads its messages. |
| service | finishedRunAnswer | `apps/mobile/src/features/chat/finishedRunAnswer.ts` | Restores an answer the server finished while the app was closed. |
| service | AgentSession.persist_managed_session | `apps/cli/src/agent/mod.rs` | Writes the CLI session file with messages, model and routing. |
| service | managed session store | `apps/cli/src/platform/runtime/session_control.rs` | Saves, loads, forks and deletes CLI sessions. |
| command | /save and save_session_for_display | `apps/cli/src/repl/registry.rs` | Explicit save with a visible message. |
| component | TUI exit save | `apps/cli/src/lib.rs` | Persists on exit and on a cancelled turn. |
| service | resumeConversation | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code restore of a saved session. |
| component | conversationPersistencePresentation | `apps/extension/src/side_panel.ts` | Chrome saved-state label and detail. |
| store | conversation-history | `apps/extension/src/features/background/conversation-history.ts` | Chrome history in chrome.storage.local with cloud sync metadata. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A turn settles; the app builds metadata including finishReason and streamError. | device | apps/web/lib/hooks/useChatStream.ts:3250-3290 (settleStream), 2779-2815 |
| Web posts the assistant message to the messages endpoint. | device and our servers | apps/web/lib/hooks/useChatStream.ts:2816-2840 |
| The server inserts the message under a lock, sets the active leaf, and stamps 'stopped' if the referenced run was cancelled and no reason was sent. | our servers | apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:100-165 |
| On reopen the app loads stored messages and renders each turn's state from its metadata. | device and our servers | apps/mobile/stores/chat/chatMessageStore.ts:795-830; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207 |
| Mobile Local chats are saved by the persist middleware to MMKV on the phone and never sent to a server. | device | apps/mobile/stores/chat/chatMessageStore.ts:1729-1735 |
| Chrome stores the chat in chrome.storage.local and mirrors it to the account when allowed; the label reflects the sync state. | device and our servers | apps/extension/src/features/background/conversation-history.ts:924-948; apps/extension/src/side_panel.ts:587-690 |
| CLI writes the session file after turns and on exit; sync_to_account runs after exit. | device and our servers | apps/cli/src/lib.rs:8624-8632 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Assistant message and metadata (finish reason, stream error, run reference, activity) | table web_messages (server) for Cloud chats on Web, Desktop and Mobile | Yes, across apps on the same account | Kept with the conversation; deleted when the conversation is deleted (soft delete columns deleted_at seen in apps/web/app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts:30-33). Full retention rules: unknown. |
| Mobile Local chat messages | store:mmkv chat-message-store-local | No | Stays on the phone until deleted |
| Chrome conversation history | chrome.storage.local, plus the account copy when mirrored | Yes when mirroring is on and the chat is Cloud-eligible | Local-only for chats with a Local, own-key or unknown-provenance turn (apps/extension/src/side_panel.ts:620-632) |
| CLI session file (jsonl) | CLI config directory, managed sessions folder | Account sync after exit via sync_to_account | Deleted by session delete command; no automatic expiry found |

**Models and providers.** The model name and provider are saved with the session or message (CLI routing_authority in apps/cli/src/agent/mod.rs:2645-2652; Web message model field in apps/web/lib/hooks/useChatStream.ts:2822). Saving does not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop and Cloud Mobile saves need a signed-in account (token owner check, apps/web/lib/hooks/useChatStream.ts:2780). Local Mobile and CLI saves need no account. |
| Permissions | Messages are saved under the user's conversation scope and organization (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts scope). Chrome cloud copy is blocked by 'auth', 'policy', 'workspace' reasons shown in the label. |
| Subscription | No entitlement check specific to saving a turn was found in the files read. |
| Limits and metering | Mobile cloud history pages of CLOUD_MESSAGE_PAGE_SIZE; message size limits on the server: unknown. |
| Feature flags | CLI --no-session-persistence; Chrome account mirroring setting; Web temporary conversation. |
| Model compatibility | Not model dependent in the code read. |
| Provider restrictions | Chrome chats with a Local, own-key or unknown-provenance turn stay on the device and are labelled 'Saved on this device' (apps/extension/src/side_panel.ts:620-632). |
| Local mode | Mobile Local chats are written to the phone only (apps/mobile/stores/chat/chatMessageStore.ts:1729). The CLI saves locally. Neither needs a paid plan; whether sign-in is needed to open a Local chat: not examined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Success | Message saved; the server may return a different id and the app swaps it. | apps/web/lib/hooks/useChatStream.ts:2830-2834 |
| Save error (Web) | Logged to the console; for a content-changed conflict a contentSaveConflict flag is set on the message; no visible notice found. | apps/web/lib/hooks/useChatStream.ts:813-815, 2836-2850 |
| Stopped turn | finishReason 'stopped' is saved even with no text, and the cancelled-run row is stamped by the server. | apps/web/lib/hooks/useChatStream.ts:3820-3832; apps/web/app/api/llm/v1/chat/completions/lib/stopped-run-turn.ts |
| Empty turn | Nothing is saved when there is no content and no meaningful metadata. | apps/web/lib/hooks/useChatStream.ts:2824 |
| Temporary conversation | Not saved. | apps/web/lib/hooks/useChatStream.ts:2796 |
| Offline | Mobile queues messages while offline; Chrome keeps the latest version on the device and retries ('Sync needs attention'). | apps/mobile/stores/chat/chatMessageStore.ts:1142-1160; apps/extension/src/side_panel.ts:660-668 |
| Signed out (Chrome) | Label 'Sign in to sync'; chat stays on the device. | apps/extension/src/side_panel.ts:643-650 |
| Account copy removed (Chrome) | Label 'Saved on this device' with a detail that syncing stopped. | apps/extension/src/side_panel.ts:664-672 |
| CLI no persistence | /save returns an error naming the flag. | apps/cli/src/repl/registry.rs:115-120 |
| CLI cancelled turn | The session is written so a resume does not show two prompts in a row. | apps/cli/src/lib.rs:8613-8626 |
| Accessibility | not examined for the Chrome label; Web not applicable. | not handled in the code read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/hooks/useChatStream.test.tsx`: Message save and metadata during streaming and stop.
- `apps/web/lib/hooks/useChatStream.turn-finality.test.tsx`: Final state of a turn.
- `apps/web/lib/hooks/useChatStream.session-recovery.test.ts`: Draft parking after a 401, not save of turns.
- `apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts`: Cancelled-run liveness (cited by brief S19.18).
- `apps/mobile/__tests__/local-chats-persist-reload.test.ts`: Local chats survive a reload.
- `apps/mobile/__tests__/chat-local-persistence-durability.test.ts`: Durability of Local chat persistence.
- `apps/mobile/__tests__/mmkv-restore-recovery.test.ts`: Recovery of the MMKV store.
- `apps/extension/__tests__/side-panel-stream-persistence.test.ts`: Chrome persistence of stream state and run references.
- `apps/extension/__tests__/conversation-history.test.ts`: Chrome conversation history storage.
- `apps/extension/__tests__/side-panel-history-resume.test.ts`: Chrome history list refresh and resume.
- `apps/cli/src/repl/registry.rs`: In-file save_tests: /save refuses when persistence is off.
- `apps/extension-vscode/src/__tests__/sessionPickers.test.ts`: VS Code session picker.

**Test scenarios**

- **Restart restores final state**
  1. Complete a turn, stop another, let a third fail.
  2. Fully quit and reopen the app.
  3. Open the conversation.
  - Expected: Turns show done, stopped and failed as before, with text that arrived kept.
- **Chrome saved label**
  1. Turn mirroring on and send a Cloud turn.
  2. Watch the label under the title.
  3. Turn mirroring off and open a new chat.
  - Expected: 'Syncing to your account' then 'Saved to your account'; with mirroring off 'Saved on this device'.
- **Temporary chat**
  1. Start a temporary chat on Web, send a message, reload.
  - Expected: The conversation is gone.
- **CLI save and resume**
  1. Run a turn in the TUI, type /save.
  2. Quit, run 'agi resume latest'.
  - Expected: 'Managed session saved: <id>' appears and the transcript returns.
- **Save failure visibility**
  1. On Web, block the messages endpoint after a turn completes.
  2. Reload.
  - Expected: Expected per the brief: a visible failure notice. Currently only a console log is found; confirm by running.
- **Mobile Local chat**
  1. Send a Local turn, kill the app, reopen.
  - Expected: The chat and last turn state return from device storage.

**Where to look when it fails**

- Web console '[useChatStream] Failed to save assistant message:'.
- Server log 'Failed to save message' (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:140).
- Table web_messages metadata ->> 'finishReason'.
- CLI tracing warning 'failed to persist the session on exit' and 'failed to persist the cancelled turn'.
- Chrome persistence state in cloudSync (state, blockedReason, lastError).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **No app shows when a result was saved.** Affects: All six apps. Evidence: Chrome label has no time (apps/extension/src/side_panel.ts:587-690); CLI message prints an id only (apps/cli/src/repl/registry.rs:152).. Work needed: Add a saved timestamp or relative time to the Chrome label and a saved indicator to the other apps.
- **No visible notice when a save fails on Web, Desktop, Mobile.** Affects: Web, Desktop, Mobile Cloud users. Evidence: notifyPersistenceFailure only calls console.error (apps/web/lib/hooks/useChatStream.ts:813-815).. Work needed: Show a notice with retry; add a test.
- **CLI and VS Code show no saved notice during normal turns.** Affects: CLI and VS Code users. Evidence: Brief S19.14 (missing); only /save prints a message.. Work needed: Add a saved line to the turn footer or status.
- **Brief S19.14 code references for Chrome (side_panel.ts:356, 386) point to import lines; the real label code is at side_panel.ts:587-690.** Affects: Documentation accuracy. Evidence: apps/extension/src/side_panel.ts:356-386 are import statements.. Work needed: Correct the brief references.
- **Brief says CLI saving is missing, but a /save command with a message exists.** Affects: Brief accuracy. Evidence: apps/cli/src/repl/registry.rs:110-152. Work needed: Restate the CLI gap as 'no automatic saved notice'.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- table:web_messages
- table:web_conversations
- store:mmkv
- api:POST /api/chat/conversations/{id}/messages
- file:apps/web/lib/hooks/useChatStream.ts
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- SYS-authentication-and-identity
- F019-07

## Unknown

- Retention and deletion rules for web_messages beyond soft delete.
- Whether a visible save-failed notice exists elsewhere on Web or Mobile (not found in files read).
- Whether Mobile Local chats require sign-in to open.
- How the Web contentSaveConflict flag is displayed.
- Whether VS Code and CLI sessions sync to the account in all modes.
- Any recorded test result for restore on any app: none found.
