---
id: "F016-06"
type: "feature"
title: "Resend / Retry"
aliases: ["Resend / Retry", "Retry this message", "Send again", "Resend message", "Retry-send action (S16.16)", "Delivery failed state (S16.15)", "Resend action (S16.09)"]
area: "16 User-message components"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S16.09", "S16.15", "S16.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-model-catalog-and-routing", "api:POST /api/llm/v1/chat/completions", "mode:local", "mode:own-key", "mode:cloud", "F016-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-06 Resend / Retry

Sends the same message again for a fresh reply and recovers from a failed send. On web the user message has a 'Retry this message' button; after a failure the error notice offers Retry. Mobile shows 'failed to send' with Retry, VS Code marks a message 'Not sent' and offers Retry, Chrome offers Send again and a Retry on errors. CLI has none.

Area: [16. User-message components](README.md). Requirement items: [S16.09](../../10-requirements/capabilities/016-user-message-components.md#s1609), [S16.15](../../10-requirements/capabilities/016-user-message-components.md#s1615), [S16.16](../../10-requirements/capabilities/016-user-message-components.md#s1616).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Re-sends a user message (and its attachments and recorded send options) to get a new reply, and lets a person retry after a turn failed.

**Why it exists.** Retry and regenerate are universal chat concepts (docs/product/requirements.md section 6.2). The briefs require resend from the message (S16.09), a clear failed state (S16.15) and a Retry that replaces the failure (S16.16).

**Who uses it.** Anyone whose reply failed, was poor, or never arrived.

**Problems it solves**

- Retyping a prompt after a network or provider error.
- Duplicate user messages after a retry.
- Not knowing a message did not go through.

**Use cases**

- The connection dropped mid-reply: click Retry in the error notice.
- Ask again for a different answer with 'Retry this message'.
- Phone message queued offline fails: tap Retry next to 'failed to send'.
- VS Code message shows 'Not sent': press Retry in the error block.

## 2. User experience

**Where to find it**

- Web and public Electron desktop: circular-arrow button 'Retry this message' in the user message's action row (apps/web/features/chat/components/messages/MessageBubble.tsx:3708-3722).
- Web failure: an inline notice with a Retry button (aria label 'Retry this turn') when a transcript is shown, or a red banner with Retry and a dismiss button 'Dismiss chat error' when no transcript is mounted (apps/web/features/chat/pages/WebChatPage.tsx:6885-6930, 7556-7580; apps/web/features/chat/lib/turn-failure-notice.ts:20-33).
- Mobile: long-press 'Resend'; a failed offline-queued message shows 'failed to send' and a 'Retry' button (apps/mobile/src/features/chat/components/MessageBubble.tsx:2253-2287, 1645-1651).
- Internal Tauri desktop: a failed assistant turn shows a Retry button; user bubble has no resend (packages/ui/unified-chat/src/components/MessageBubble.tsx:948-985).
- VS Code: hover a user message for the resend and branch actions; a failed message shows 'Not sent'; the error block has Retry (webviewContent.ts:4925-4932, 682-688, 4515-4531).
- Chrome: 'Send again' on the latest sent message and Retry in an error footer (apps/extension/src/features/side-panel/bubbles.ts:295-345, 632-642; apps/extension/_locales/en/messages.json spResendMessage 'Send again', spBubbleRetry 'Retry').
- CLI: no resend or retry control found; a failure is an error line with a cross prefix in the transcript (apps/cli/src/tui/tui_app.rs:2901-2906).

**Before you start**

- Web: not streaming; trial not used up. Mobile: the conversation is not streaming. Chrome: the message is the latest user message.

**Screens and controls**

- Web Retry button disabled while the conversation streams (MessageBubble.tsx:3716).
- Web confirm 'Retry this message?' with button 'Retry' when versions are off and replies would be deleted (WebChatPage.tsx:5832-5846).
- Mobile 'Retry Limit Reached' alert after three failed attempts (chatExecutionStore.ts:1162, 5584-5593).
- VS Code modal confirm before resend (ChatStateManager.ts:6040-6049).

**Journey**

1. A turn fails or you want another answer.
2. Click Retry (error notice) or Retry this message (on your message).
3. The page rolls back or branches from your message so the resend replaces the failed turn rather than duplicating it.
4. A new reply streams.
5. If the failure repeats, the error shows again.

**What the person sees and gets**

- Error text in the notice or banner; Retry clears the error and starts a stream.
- Web: the Retry in the notice calls the same regenerate handler as the message button.
- Mobile: queued and failed chips on the message.

**Settings**

- Message variants switch decides whether a retry keeps the earlier reply as a sibling or replaces it (message-variants-gate.ts:1-60).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Retry on the bubble calls onRegenerate(message.id), disabled during streaming, hidden in voice mode (MessageBubble.tsx:3708-3722).
- Web: retryableUserMessageId finds the user turn to resend: scanning back, it stops at the last successful assistant reply (apps/web/features/chat/lib/retryable-turn.ts:19-31).
- Web: handleRegenerateMessage for a user target: with variants on, resends under regenerateParentMessageId; with variants off, rolls back from that user message inclusive and replaces it, asking first if replies would be lost (WebChatPage.tsx:5703-5866).
- Web: free trial used up opens the upgrade dialog instead (WebChatPage.tsx:5737-5741).
- Web: refuses to cross Local to own-key, refuses an unreplayable turn, and refuses unreplayable connector context (WebChatPage.tsx:5744-5775).
- Mobile: failed offline message resend, retry limit of three, backoff (apps/mobile/app/(app)/chat/[id].tsx:1928-1940; apps/mobile/stores/chat/chatExecutionStore.ts:1162, 5575-5600).
- VS Code: delivery states sending, queued, running, steered, failed ('Not sent'), cancelled; Retry resends lastSendPayload with a new client id; Resend action rewinds then resends (webviewContent.ts:617-689, 4648-4667; ChatStateManager.ts:6032-6063).
- Chrome: Send again on the latest user message when not errored or interrupted; Retry on error footers (bubbles.ts:295-345, 632-642; side_panel.ts:5925-5929).

**Incomplete**

- The draft says Retry is a red banner; the banner is only used when no transcript is mounted. With a transcript the notice is inline (turn-failure-notice.ts:20-33).
- On web the failed state is a notice tied to the last turn, not a mark on the user bubble itself (MessageBubble.tsx:2698-2705 shows the reason on the assistant turn).
- Web 'Retry' with variants on does not roll back; it adds a sibling answer, so the brief's 'replaces' wording applies only to variants-off or the unsaved-conversation case [inferred from WebChatPage.tsx:5780-5826].
- VS Code Retry (error block) resends only lastSendPayload, a single remembered turn (webviewContent.ts:4274, 4648).

**Present but disconnected or switched off**

- Retry is hidden in voice mode on web (MessageBubble.tsx:3708).

**Not available**

- CLI: no resend, retry or failed-send control in the transcript code I read (apps/cli/src/tui/tui_app.rs); the brief's reference at line 2726 is startup hint text.
- Resend on a user bubble in the internal Tauri desktop chat.

## 4. Required behaviour

**Established requirements**

- A sent user message can be re-sent unchanged from the message itself to get a fresh reply. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.09)
- When a user message fails to deliver, the transcript shows a clear failed state for that turn. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.15)
- A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S16.16)
- The failure banner shows the error and Retry only when the last user message has no good reply; Retry rolls back from that user message inclusive so the resend replaces it. (source: S16.15/S16.16 brief Should (code: apps/web/features/chat/lib/retryable-turn.ts:19-31; WebChatPage.tsx:5720-5733))
- Nothing silently routes a Local chat to BYOK or managed cloud. (source: AGENTS.md section 6)
- An irreversible action asks first and names what is lost. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Web: 'Retry this message' sends the same text and attachments again and is disabled while streaming.
2. Web: after a failed turn, the Retry control appears only while the last user message has no successful reply.
3. Web: with versions off and later replies, a confirm 'Retry this message?' names how many replies are deleted.
4. Web: when the free trial is used up, Retry opens the upgrade dialog and sends nothing.
5. Web: retrying a Local conversation under an own-key model shows a refusal and sends nothing.
6. Mobile: a message that failed to send shows 'failed to send' and Retry; after three failures an alert says the limit is reached.
7. VS Code: a failed message shows 'Not sent'; the error Retry resends and clears the error block.
8. Chrome: Send again appears only on the latest user message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The resend should keep attachments; web passes userMsg.attachments [inferred from WebChatPage.tsx:5810].
- CLI should offer some way to re-run the last prompt; today only prompt history exists [inferred from apps/cli/src/tui/prompt_history.rs].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a 'Not sent' mark on the web user bubble itself, as VS Code and mobile do.
- [proposed] Add a CLI retry command or key for the last failed turn.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Retry this message button; failure reason on the turn. |
| service | retryable-turn | `apps/web/features/chat/lib/retryable-turn.ts` | Which user message a failed send should retry. |
| service | turn-failure-notice | `apps/web/features/chat/lib/turn-failure-notice.ts` | Decides inline notice versus banner. |
| hook | use-turn-error-notice | `apps/web/features/chat/hooks/use-turn-error-notice.ts` | Delays the inline notice during a grace period. |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | handleRegenerateMessage, banner and inline Retry, trial and boundary guards. |
| service | localByokHandoff | `apps/web/features/chat/lib/localByokHandoff.ts` | Boundary refusal for regenerate. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | sendMessage, regenerateParentMessageId, error handling. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Passes onRegenerate; retry anchor handling. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | queued and failed chips, Retry, Resend menu entry. |
| screen | Chat screen (mobile) | `apps/mobile/app/(app)/chat/[id].tsx` | handleRetryMessage and retryFailedSend. |
| store | chatExecutionStore.retryMessage | `apps/mobile/stores/chat/chatExecutionStore.ts` | Retry logic, attempt limit, backoff. |
| component | Sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Delivery state styles, resendLastTurn, error Retry. |
| service | ChatStateManager | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | messageAction resend: rewind then resubmit. |
| component | Side-panel bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | Send again button and error Retry. |
| component | Side panel (Chrome) | `apps/extension/src/side_panel.ts` | Wires onRetry and onRegenerate to retryFailedMessage and regenerateTurn. |
| component | MessageBubble (shared UI) | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Failed assistant turn with Retry for Tauri chat. |
| service | TUI error line | `apps/cli/src/tui/tui_app.rs` | Error rows with a cross prefix; no retry. |
| test | retryable-turn test | `apps/web/features/chat/lib/__tests__/retryable-turn.test.ts` | Which turn is offered for retry. |
| test | Chrome stream error retry test | `apps/extension/__tests__/stream-error-retry.test.ts` | Retry after stream error in the side panel. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click Retry: web calls handleRegenerateMessage(id). It stops when not in a conversation or when streaming. | device | WebChatPage.tsx:5703-5705 |
| Guards run: free trial used up opens upgrade; replay options are checked; Local-to-own-key and connector replay are checked. | device | WebChatPage.tsx:5737-5775 |
| For a conversation not yet saved, the user row is deleted locally and sent again, creating the conversation first. | device and our servers | WebChatPage.tsx:5778-5802 |
| With variants on, sendMessage posts the same text and attachments with regenerateParentMessageId = the user message id; no deletion. | device and our servers | WebChatPage.tsx:5804-5826 |
| With variants off, sendReplacingMessages removes rows from the user message on, only after the new turn is committed, behind a confirm when replies would be lost. | our servers | WebChatPage.tsx:5828-5866 |
| The reply streams from the chosen model; a Local model answers on the device. | our servers | apps/web/lib/hooks/useChatStream.ts:4160-4163 (Local stays on device; else completions route) |
| VS Code resend: host checks the runtime offers checkpoints, shows a modal, rewinds the thread to the message, reloads it and posts the text back as a draft that is submitted if no attachments are pending. | device | ChatStateManager.ts:6032-6063, 6175-6195 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New user and assistant rows; for retried failures the old failed rows | Client store; server message rows (web_messages); mobile local store and offline queue | Yes for cloud conversations | Variants off: replaced rows deleted after the new turn is durable (WebChatPage.tsx:5621-5625 comment). Variants on: nothing deleted. |

**Models and providers.** The retry is sent under the currently active model (WebChatPage.tsx:5703-5705 targetModelId = activeModelId unless overridden). Own-key and Local boundaries are enforced by resolveRegenerateBoundaryRefusal.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a signed-in session; otherwise the send fails with an authentication error. |
| Permissions | none found in the code beyond the guards above. |
| Subscription | Free website trial: used-up trial opens the upgrade dialog (WebChatPage.tsx:1288-1293, 5737-5741). The retried send is metered like any send on the server (not read here). |
| Limits and metering | Mobile limits retries of one failed message to 3 with exponential backoff starting at 1 second (chatExecutionStore.ts:1162, 5600-5601). |
| Feature flags | Message variants flag decides add-sibling versus replace. |
| Model compatibility | A turn whose recorded send options cannot be replayed on the current model is refused with a message (WebChatPage.tsx:5753-5760). |
| Provider restrictions | Local conversations cannot be retried under an own-key provider (localByokHandoff.ts:105-117). |
| Local mode | Retry on a Local-model turn stays on the device; switching the same conversation to an own-key model is refused with a visible reason. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Retry button disabled; handler returns early. | MessageBubble.tsx:3716; WebChatPage.tsx:5704 |
| Voice mode | Retry button not shown. | MessageBubble.tsx:3708 |
| Failure with a good reply already present | No Retry offered, so an older turn is never silently discarded. | retryable-turn.ts:19-31; retryable-turn.test.ts:22-29 |
| Unsaved new conversation | Conversation is created, then the message sent. | WebChatPage.tsx:5778-5802 |
| Mobile offline queue failure | Shows 'failed to send' and Retry; success resolves the queued row. | apps/mobile/app/(app)/chat/[id].tsx:1931-1940 |
| Mobile retry limit | Alert 'Retry Limit Reached'. | chatExecutionStore.ts:5584-5593 |
| VS Code runtime blocked | resendLastTurn returns without sending. | webviewContent.ts:4649 |
| VS Code runtime too old for checkpoints | Warning 'needsUpdate'; no resend. | ChatStateManager.ts:6038-6042 |
| Offline on web | not handled in the code in this path | No offline branch in handleRegenerateMessage at WebChatPage.tsx:5703-5866 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/__tests__/retryable-turn.test.ts`: Trailing user turn offered; turn behind a failed reply offered; nothing after a successful reply; nothing while streaming.
- `apps/web/features/chat/components/messages/ChatMessageList.retryAnchor.test.tsx`: Scroll anchor and measurement cache when Retry rewrites a row.
- `apps/web/features/chat/lib/turn-failure-notice.test.ts`: Inline versus banner placement of the failure.
- `apps/extension/__tests__/stream-error-retry.test.ts`: Chrome retry after a stream error.
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Cancelled state with a Retry control (lines 469, 480).
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: Matched a search for delivery or messageAction; the exact cases were not opened.

**Test scenarios**

- **Retry after a dropped reply**
  1. Send a message and cut the network before the reply arrives.
  2. Wait for the error notice.
  3. Restore the network and click Retry.
  - Expected: One user message remains (no duplicate); a new reply streams.
- **Retry with versions off**
  1. Open ?variants=off, ask, get a reply, click Retry this message.
  - Expected: Confirm 'Retry this message?' names the deleted reply; Retry replaces it.
- **Trial exhausted**
  1. Use a free website trial until the limit, then click Retry.
  - Expected: Upgrade dialog opens; no request is sent.
- **Local boundary**
  1. Open a Local conversation, pick an own-key model, click Retry this message.
  - Expected: A refusal message; nothing leaves the device.
- **Mobile failed queue**
  1. Send offline, let it fail, tap Retry.
  - Expected: Message sends; the failed chip clears.
- **VS Code resend**
  1. Hover a user message, click the resend action, confirm.
  - Expected: Thread rewinds to the message and the text is sent again.

**Where to look when it fails**

- Web: chatError text and the failing request in the network tab.
- Mobile: console warning '[ChatScreen] Resending a failed queued message failed'.
- VS Code: warning messages 'messageActions.failed', 'notFound', 'needsUpdate' strings in ChatStateManager.ts.
- Server: request logs for the chat completions route.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- Mobile: [70-qa/test-plans/mobile/016-user-message-components.md](../../70-qa/test-plans/mobile/016-user-message-components.md)
- VS Code: [70-qa/test-plans/vscode/016-user-message-components.md](../../70-qa/test-plans/vscode/016-user-message-components.md)
- Chrome: [70-qa/test-plans/chrome/016-user-message-components.md](../../70-qa/test-plans/chrome/016-user-message-components.md)

## 10. Gaps and dependencies

- **CLI has no resend or retry** Affects: CLI. Evidence: No retry or resend handler in apps/cli/src/tui/tui_app.rs; brief S16.16 lists CLI missing but S16.09 lists done. Work needed: Add a retry key or slash command, or correct the brief.
- **Web failed state is not marked on the user bubble** Affects: Web, desktop. Evidence: Failure is an inline notice or banner (turn-failure-notice.ts:20-33). Work needed: Decide whether S16.15 needs a per-message mark.
- **Chrome and VS Code retry only the latest or last turn** Affects: Chrome, VS Code. Evidence: side_panel.ts:5925-5929; webviewContent.ts:4274. Work needed: Allow retry of earlier turns or document the limit.
- **Tauri shared bubble has no resend on the user message** Affects: Internal Tauri desktop. Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:608-648. Work needed: Add to match web.
- **Brief cites CLI code that does not match** Affects: Brief accuracy. Evidence: apps/cli/src/tui/tui_app.rs:2715-2730 is startup hint text. Work needed: Correct the brief.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-model-catalog-and-routing
- api:POST /api/llm/v1/chat/completions
- mode:local
- mode:own-key
- mode:cloud
- F016-05

## Unknown

- Name and file of the mobile offline queue store (only the fields offlineQueueId, queueFailed and resolveOfflineMessage were seen).
- Which cases in chatStateManager.test.ts cover VS Code delivery states.
- Whether the CLI can re-run a prompt by another route (for example a slash command in code I did not read).
- Whether Chrome and web keep the failed message after reload.
- Exact server-side metering of a retried send.
