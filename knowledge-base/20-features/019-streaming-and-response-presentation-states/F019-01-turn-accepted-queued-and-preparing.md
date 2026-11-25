---
id: "F019-01"
type: "feature"
title: "Turn accepted, queued and preparing"
aliases: ["Request accepted", "Waiting in queue", "Preparing context", "Queued follow-up", "Typing indicator", "Preparing label", "Steer"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.01", "S19.02", "S19.03"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "SYS-local-inference", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-01 Turn accepted, queued and preparing

When a person sends a message, the app shows it at once with a working row, shows any follow-up that waits behind a running answer as Queued, and shows a Preparing or Thinking label until the first output. Web, mobile, VS Code, Chrome and CLI each implement this separately.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.01](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1901), [S19.02](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1902), [S19.03](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1903).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 3) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the person that a sent message was taken, that work has started, and that later messages are waiting their turn. Each app shows a label before the first output arrives and lets the person edit or cancel a waiting follow-up.

**Why it exists.** A silent gap after pressing send looks like a hang. The product contract says every async flow needs designed loading and state views (doc: docs/product/experience-contract.md:82).

**Who uses it.** Anyone chatting on Web, Desktop (which shows the hosted web app), Mobile, CLI, VS Code or Chrome.

**Problems it solves**

- No dead time after sending: the user bubble and an assistant placeholder paint before any network wait on web (apps/web/lib/hooks/useChatStream.ts:4288-4309).
- A second message typed while an answer streams is not lost or sent in the middle: it waits in a visible queue (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3948-3972).
- A slow first token does not look like a freeze: web names the model being connected to and counts seconds (apps/web/lib/hooks/agentActivityLabel.ts:90-101); the CLI adds a still-working hint after 10 seconds (apps/cli/src/tui/tui_app.rs:3000-3010).

**Use cases**

- Send a question on web and see Preparing, then Connecting to the model with a second counter, then the answer.
- Type a follow-up while a long answer streams; it shows as Queued with Edit and Cancel, and sends when the answer ends.
- On a phone with no network, write a message and see it marked queued offline until the connection returns.
- In the CLI, type while a turn runs and see '1 message queued' in the composer hint.

## 2. User experience

**Where to find it**

- Web (and Desktop, which loads the hosted web app: apps/desktop/electron/main.ts:1065-1066, doc: AGENTS.md section 5): the composer send button, the Queued chip beside it, the queued row above the composer, and the Preparing row in the transcript.
- Mobile: the composer queued rows (labelled 'Queued message N of M'), the 'queued' badge on an offline message bubble, and the Preparing line in the assistant bubble.
- CLI: the composer hint line during a turn and the spinner line with 'Thinking' or 'Preparing context'.
- VS Code: the sidebar chat; the user message shows 'Sending' or 'Queued' under it; the send button reads 'Queue follow-up' or 'Steer follow-up' while a turn runs.
- Chrome side panel: the 'Queued messages' list above the composer and the Preparing thinking row.

**Before you start**

- A chat open with a model route that can answer (Local, own key or Cloud).
- To queue: a turn must already be running; the composer must have text or an attachment.

**Screens and controls**

- Web: send button (modes send, stop, queue; title 'Queue message · will send after current response finishes'), chip 'Queued' or 'Queued N', row text 'Queued 1 of 2: <preview>' with buttons Steer, Edit queued message, Cancel queued message (ChatComposerNew.tsx:5022-5053; SendButton.tsx:57-76,113-115).
- Mobile: queued row buttons 'Edit queued message' and 'Cancel queued message' (ChatInput.tsx:1856-1902); offline placeholder 'Offline, message will send on reconnect (N queued)' (ChatInput.tsx:1645-1650).
- CLI: hint ' … working, Esc or Ctrl-C to cancel · type to queue a message' and '(Enter to queue, /btw to ask aside)' (tui_app.rs:2064-2075).
- VS Code: icon buttons with aria labels 'Edit this queued message' and 'Cancel this queued message' (webviewContent.ts:5554-5590).
- Chrome: list items 'Queued: text' or 'Queued 1 of 3: text' with Edit and Cancel (side_panel.ts:15312-15345; _locales/en/messages.json spQueuedLead, spQueuedLeadNumbered).

**Journey**

1. 1. Type a message and press Enter or the send button.
2. 2. The message appears as your bubble at once; on web an assistant placeholder appears in the same frame (useChatStream.ts:4288-4290).
3. 3. A waiting row shows: web 'Preparing' with a spinning mark (TypingIndicator.tsx:15-18); mobile 'Preparing' (MessageBubble.tsx:2504-2510); Chrome 'Preparing' (side_panel.ts:6339); CLI 'Preparing context' until the model request starts, then 'Thinking' (tui_app.rs:8226,8429,8544).
4. 4. On web the timeline then reads 'Connecting to <model> · Ns' and later 'Waiting for the first token from <model> · Ns' (agentActivityLabel.ts:90-101).
5. 5. If you send another message while the turn runs it joins the queue; you can Edit it (text returns to the composer) or Cancel it.
6. 6. When the turn ends, the first queued message is sent automatically (web ChatComposerNew.tsx:4346-4383; mobile ChatInput.tsx:1170-1195; Chrome side_panel.ts:8736-8756; CLI tui_app.rs:7274-7283).
7. 7. If the turn was stopped, the CLI returns queued text to the composer instead of sending it (tui_app.rs:8754-8760).

**What the person sees and gets**

- Web: chip 'Queued' (one) or 'Queued 2' (several); row 'Sent to the running reply' for a message steered into a running Cloud run (ChatComposerNew.tsx:360).
- Web notice if you switch chats with a queued message: 'Your queued message was not sent: you switched chats before the reply finished.' plus whether it was saved as a draft (ChatComposerNew.tsx:4403-4415).
- Mobile offline: bubble badge 'queued' (accessibility label 'Message queued offline'), or 'failed to send' with a Retry button when the offline send failed (MessageBubble.tsx:2228-2290).
- Chrome: 'You can queue up to N messages. Wait for the answer, or cancel one.' when the lane is full; 'Your queued message was not sent because the chat changed. It is back in the composer.' (messages.json spQueuedFull, spQueuedReturned).

**Settings**

- Web: followUpBehavior setting decides whether Enter queues or steers a follow-up; Cmd/Ctrl+Shift+Enter inverts it for one message (ChatComposerNew.tsx:1791,4494-4507; test ChatComposerNew.followUpSteer.test.tsx).
- VS Code: followUpBehavior (steer or queue) and enterBehavior (webviewContent.ts:5081-5092).
- Mobile, CLI, Chrome: no queue setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: sent message and placeholder painted synchronously before the first await (useChatStream.ts:4288-4309).
- Web: Preparing indicator shown while loading and the last message is not yet streaming (ChatMessageList.tsx:1350,2000-2008; TypingIndicator.tsx:17).
- Web: in-memory follow-up queue per composer with Queued chip and count, Edit, Cancel, Steer into a running Cloud run, auto-flush at turn end, and stranded-queue handling when the chat changes (ChatComposerNew.tsx:302,910,3948-3972,4346-4527).
- Web: Connecting to <model> and Waiting for the first token labels with elapsed seconds (turnStartProgress.ts:41-65; agentActivityLabel.ts:18-19,90-101).
- Mobile: in-composer follow-up queue with Edit and Cancel and auto-send at stream end; a refused or failed send returns the text to the composer (ChatInput.tsx:940-955,1128-1195).
- Mobile: separate offline queue: enqueueOfflineMessage marks the bubble isQueued, failOfflineMessage marks it queueFailed (stores/chat/chatMessageStore.ts:1140-1157,1712-1727; app/(app)/chat/[id].tsx:911).
- CLI: queued_prompts list, '1 message queued' or 'N messages queued' in the hint, joined with a blank line and sent as one message after the turn (tui_app.rs:2064-2075,7274-7283,8482). The brief marks CLI queue as missing; the code contradicts that (doc: knowledge-base/data/area-briefs/019-streaming-and-response-presentation-states.md S19.02).
- CLI: Preparing context then Thinking, with a 'still working' hint after 10 s with no text (tui_app.rs:2155,3000-3010,8544).
- VS Code: delivery-state labels 'Sending' and 'Queued', queued Edit and Cancel controls, Steer or Queue send button, 'Stopping…' status (webviewContent.ts:634-635,5554-5590,5776-5777,5081-5092).
- Chrome: queued list capped by LANE_CAP (100), Edit and Cancel, next follow-up sent after a finish or a failure, queue returned to composer when the chat changes (side_panel.ts:8719-8765,9855; packages/client/client-runtime/src/queue/types.ts:9).

**Incomplete**

- Mobile: the visible waiting text is only Preparing; the text does not say which context is being read (MessageBubble.tsx:2504-2510).
- Web and mobile queues are held in component memory; a queued message is not stored across an app restart [inferred from useState and useRef use at ChatComposerNew.tsx:910-911 and ChatInput.tsx:490-513].
- VS Code: no visible 'Preparing' word was found; the typing indicator only has the accessibility label 'AGI is responding' (webviewContent.ts:5019-5033). Searched the file for Preparing: no match.

**Present but disconnected or switched off**

- Web SendButton 'queue' mode is a presentational mode; which screen passes it was not traced (SendButton.tsx:8).

**Not available**

- No plan-based limit on queueing was found on any app.
- CLI: the live frame shows 'Preparing context' but nothing says which files, memory or attachments are being read (tui_app.rs:8544).

## 4. Required behaviour

**Established requirements**

- After sending, the surface shows the request was accepted and work has started, before any output. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.01)
- A request that cannot start yet is shown as waiting or queued. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.02)
- Before the model answers, the surface shows it is preparing (context, attachments, memory). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.03)
- Every async flow has complete states: loading, empty, disabled, error, offline, retry, cancellation. (source: docs/product/experience-contract.md:82)
- A hidden or disabled control is better than an enabled no-op. (source: docs/product/experience-contract.md:79)

**Acceptance criteria**

1. Press send on web: the user bubble and a waiting row appear in the same frame, with the network blocked.
2. While a turn streams on web, send a second message: the Queued chip shows; send a third: it reads Queued 2; Cancel one: the count drops.
3. Edit a queued message on web: the text returns to the composer and the queued row is replaced when re-sent, not duplicated.
4. End the running turn: the first queued message is sent without a click.
5. On mobile, send while streaming: a 'Queued message 1 of 1' row shows with Edit and Cancel.
6. On mobile in airplane mode: the sent bubble shows 'queued'; if the later send fails it shows 'failed to send' and a Retry button.
7. In the CLI, type during a turn and press Enter: the hint shows '1 message queued'; press Esc: the text returns to the composer.
8. In VS Code, send during a turn: the user message shows 'Queued' with Edit and Cancel icons.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A queue should survive an accidental app restart or say it will not [inferred from the brief's 'is not dropped silently' wording and the in-memory queue code].
- The waiting text on every app should say what is being prepared, as the brief says only CLI says 'Preparing context' [inferred from S19.03].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the same 'Queued N' count on mobile and VS Code as on web.
- [proposed] Say what is being read (attachments, memory, project files) in the Preparing label when that is known.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useChatStream send path | `apps/web/lib/hooks/useChatStream.ts` | Adds the user message and assistant placeholder synchronously, starts the turn-start ticker (4288-4309, 4442-4456). |
| service | startTurnStartTicker | `apps/web/lib/hooks/turnStartProgress.ts` | Updates the local starting entry with Connecting to / Waiting for the first token and elapsed seconds. |
| service | deriveAgentActivityLabel | `apps/web/lib/hooks/agentActivityLabel.ts` | Builds the text of the idle, waiting, thinking and tool labels. |
| service | startAgentActivityLocally and Preparing entry | `packages/client/client-runtime/src/agentActivity.ts` | Creates the local-starting progress entry and the Preparing placeholder entry (220-300, 520-530). |
| component | TypingIndicator | `apps/web/features/chat/components/messages/TypingIndicator.tsx` | Spinning mark plus the word Preparing. |
| component | ChatMessageList typing row | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Decides when the typing indicator shows (1350, 2000-2008). |
| component | SendButton | `apps/web/features/chat/components/Composer/SendButton.tsx` | Send, stop and queue modes and the Queued chip. |
| component | ChatComposerNew queue | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Queue state, flush at turn end, steer, edit, cancel, stranded-queue notice. |
| component | ChatInput follow-up queue | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile queue rows, Edit, Cancel, auto-send and return-to-composer. |
| component | StreamingIndicator | `apps/mobile/src/features/chat/components/StreamingIndicator.tsx` | Mobile spinning mark with label; accessibility label defaults to Generating response. |
| component | MessageBubble queued badges | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | queued and failed to send badges (2228-2290) and the Preparing label (2504-2510). |
| store | chat message store offline queue | `apps/mobile/stores/chat/chatMessageStore.ts` | enqueueOfflineMessage and failOfflineMessage set isQueued and queueFailed; persisted under store:chat-message-store-local. |
| component | CLI turn frame and queue | `apps/cli/src/tui/tui_app.rs` | turn_composer_hint, queued_prompts, Preparing context verb, stall hint, return_queued_prompts_to_composer. |
| component | VS Code webview queue and typing | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Delivery-state labels, queued controls, send/steer button, typing indicator. |
| component | Chrome side panel queue and thinking row | `apps/extension/src/side_panel.ts` | followUpQueue list, submitComposerText, sendNextFollowUp, showThinking. |
| config | LANE_CAP | `packages/client/client-runtime/src/queue/types.ts` | Maximum queued messages in the Chrome lane (100). |
| test | web follow-up queue tests | `apps/web/features/chat/components/Composer/ChatComposerNew.followUpQueue.test.tsx` | Keeps two follow-ups, cancels one, edits in place. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person presses send; the app adds the message and a waiting row to the on-screen list. | device | apps/web/lib/hooks/useChatStream.ts:4288-4309; apps/mobile/src/features/chat/components/ChatInput.tsx:940-955 |
| If a turn is already active, the message goes into an in-memory queue instead of being sent. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3948-3972; apps/cli/src/tui/tui_app.rs:8482 |
| A timer updates the Connecting to or Waiting for the first token label every second until the response starts (web only). | device | apps/web/lib/hooks/turnStartProgress.ts:53-65 |
| The app posts the chat request to the managed chat endpoint for Cloud turns; the label stays until the first event arrives. | our servers | apps/web/lib/hooks/useChatStream.ts:4442-4690 (fetch with abort signal, response checked at 4692) |
| For a Local model on web the turn runs through runLocalTurn on the device and the ticker is stopped at once. | device | apps/web/lib/hooks/useChatStream.ts:4460-4462,4494 |
| When the running turn ends, the first queued message is sent (web, mobile, Chrome) or all queued text is joined and sent once (CLI). | device | ChatComposerNew.tsx:4346-4383; ChatInput.tsx:1170-1195; side_panel.ts:8736-8756; tui_app.rs:7274-7283 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Queued follow-up text and attachment handles | Component memory (web useState/useRef; mobile useState/useRef; CLI queued_prompts field; Chrome followUpQueue) | No; not sent anywhere until its turn | Removed when sent, cancelled, edited back to the composer, or the chat changes (then saved as draft text on web, attachments not kept: ChatComposerNew.tsx:4384-4416) |
| Offline queued mobile message (isQueued, queueFailed, offlineQueueId) | store:chat-message-store-local (persist name in chatMessageStore.ts) | Sent when the connection returns; the queue is separate from any server queue | Removed after a successful send; kept with queueFailed when the send fails (chatMessageStore.ts:1700-1727) |

**Models and providers.** The waiting labels do not depend on a model or provider. Web names the selected model in Connecting to <model> using the catalog name (useChatStream.ts:4443). Which route answers (Local, own key, Cloud) does not change the queue behaviour in the code opened.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for showing accepted, queued or preparing states. Sending itself on a Cloud route needs an account (see SYS-authentication-and-identity). |
| Permissions | None found in the code for these states. |
| Subscription | None found in the code: no entitlement gate on queueing was found on any app. |
| Limits and metering | Chrome caps the queue at 100 (LANE_CAP). Web, mobile, CLI and VS Code caps: not found. Queued messages are metered only when they are actually sent. |
| Feature flags | Web followUpBehavior setting and VS Code followUpBehavior and enterBehavior settings. No feature flag found. |
| Model compatibility | Not model-specific. The Steer path needs a running Cloud agent run (streamingRunId) (ChatComposerNew.tsx:4483-4492). |
| Provider restrictions | None found in the code. |
| Local mode | On web a Local model turn skips the connecting ticker and runs on the device (useChatStream.ts:4460-4462); the transcript is labelled Local (MessageBubble.tsx:465-467). Queueing works the same way because it is composer-side. CLI Local behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty message | Web send button is disabled with the reason 'Send is off until you type a message or attach a file.' (SendButton.tsx:23,79). | apps/web/features/chat/components/Composer/SendButton.tsx:23-79 |
| Send refused while queued flush | Web keeps the queued item if the send is refused; mobile returns the text to the composer with a failed mark on attachments. | ChatComposerNew.tsx:4372-4380; ChatInput.tsx:1181-1191 |
| Chat switched while a message is queued | Web saves the text as a draft in the original chat and shows a notice; Chrome returns it to the composer with a notice. | ChatComposerNew.tsx:4384-4416; side_panel.ts:8758-8770 |
| Offline (mobile) | Message shows 'queued'; placeholder says it will send on reconnect. | ChatInput.tsx:1645-1650; MessageBubble.tsx:2228-2247 |
| Stopped turn (CLI) | Queued text goes back to the composer and nothing is sent. | apps/cli/src/tui/tui_app.rs:8754-8760; test a_stopped_turn_returns_its_queued_prompts_to_the_composer |
| Failed turn (Chrome) | The next queued follow-up is sent after a failure (sendNextFollowUp is called at the end of handleStreamError). | apps/extension/src/side_panel.ts:9741-9830 |
| Slow first token (CLI) | After 10 seconds with no visible text the line adds 'still working'. | apps/cli/src/tui/tui_app.rs:3000-3010 |
| Accessibility | Web SendButton has aria labels; mobile StreamingIndicator has role progressbar and label; VS Code typing indicator has role status; Chrome thinking row has role status and aria-live polite. | SendButton.tsx:50-51,70-71; StreamingIndicator.tsx:18-20; webviewContent.ts:5025-5027; side_panel.ts:6342-6345 |
| Timeout or reconnect while preparing | not handled in the code opened for this feature; see F019-05 and F019-06. | No dedicated handling found in the files opened for this feature. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpQueue.test.tsx`: Titles read: keeps both follow-ups instead of overwriting; marks a delivered follow-up as queued; cancels one queued message without dropping others; edits a queued message in place.
- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpSteer.test.tsx`: Titles read: queue setting Enter queues; Cmd/Ctrl+Shift+Enter steers; steer setting Enter steers.
- `apps/web/features/chat/components/Composer/SendButton.test.tsx`: Send button modes [inferred from file name; titles not read].
- `apps/web/lib/hooks/turnStartProgress.test.ts`: Ticker and starting summary [inferred; titles not read].
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.followUpQueue.test.tsx`: Mobile follow-up queue [inferred from file name].
- `apps/cli/src/tui/tui_app.rs`: In-file test a_stopped_turn_returns_its_queued_prompts_to_the_composer (line 13672).
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: VS Code steer or queue behaviour [inferred from file name].

**Test scenarios**

- **Web queue count**
  1. Open web chat, send a long prompt.
  2. While it streams, type two follow-ups, pressing Enter each time.
  3. Read the chip, then Cancel the first.
  - Expected: Chip shows Queued 2, then Queued; the remaining follow-up sends when the answer ends.
- **Instant accept**
  1. Throttle the network to offline in dev tools.
  2. Send a message on web.
  - Expected: User bubble and waiting row appear immediately; an error path follows later.
- **Mobile offline queue**
  1. Turn on airplane mode.
  2. Send a message.
  3. Turn it off.
  - Expected: Bubble shows queued, then the answer arrives; on a forced failure it shows failed to send with Retry.
- **CLI queue and stop**
  1. Start a turn.
  2. Type a message and Enter.
  3. Press Esc.
  - Expected: Hint shows 1 message queued; after Esc the text is back in the composer and the transcript shows Stopped.
- **Chrome lane cap**
  1. Fill the queue to the cap during one running turn.
  - Expected: The notice 'You can queue up to 100 messages' appears; no 101st item.

**Where to look when it fails**

- Web: look for the typing-indicator and composer-queued-chip test ids in the DOM.
- Mobile: test ids chat.composer.queued-followup and chat.composer.queued-followup-edit.<id>.
- CLI: unit test names in tui_app.rs; log line 'failed to persist the cancelled turn' for save failures.
- Chrome: console warn '[SidePanel] queue lane full:'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **Brief says CLI has no queued status but the code shows a count in the hint.** Affects: CLI; documentation accuracy. Evidence: tui_app.rs:2064-2075 versus S19.02. Work needed: Correct the brief row to done for CLI and re-run the area audit.
- **Queue is lost on restart and the person is not told.** Affects: Web, mobile. Evidence: ChatComposerNew.tsx:910; ChatInput.tsx:490. Work needed: Decide whether to persist or to warn; not decided in any document read.
- **Preparing label does not say what is being prepared.** Affects: Web, mobile, VS Code, Chrome. Evidence: TypingIndicator.tsx:17; MessageBubble.tsx:2506; side_panel.ts:6339. Work needed: Needs the server or client to report context-read steps as events.
- **VS Code has no visible waiting word.** Affects: VS Code. Evidence: webviewContent.ts:5019-5033. Work needed: Add a visible label next to the mark.
- **Brief: mobile queued state is the offline queue marker only.** Affects: Mobile. Evidence: MessageBubble.tsx:2228; but ChatInput.tsx:947 shows a second, real follow-up queue. Work needed: Update the brief; both exist.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- SYS-local-inference
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Desktop Tauri or Electron-specific queue code beyond the hosted web app was not opened.
- Whether Chrome and mobile queues have a visible cap: mobile unknown.
- Where web SendButton mode 'queue' is passed.
- CLI Local or own-key behaviour differences for queueing.
