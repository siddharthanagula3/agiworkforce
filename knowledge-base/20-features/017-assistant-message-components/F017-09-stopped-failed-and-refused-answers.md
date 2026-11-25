---
id: "F017-09"
type: "feature"
title: "Stopped, failed and refused answers"
aliases: ["Stopped answer", "Interrupted state", "Partial result", "Incomplete answer", "Refusal state", "Declined response", "Empty-output error", "No response", "Try again", "Retry", "S17.37", "S17.38", "S17.39", "S17.40"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S17.37", "S17.38", "S17.39", "S17.40"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-local-inference", "F017-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-09 Stopped, failed and refused answers

Shows what happened when an answer did not end normally: it failed after some text (kept, marked incomplete with a reason), the model refused, the person stopped it, or nothing came back. Each case has its own notice and a next step such as Retry, Try again or Switch model. Chrome lacks a refusal state; VS Code does not mark a stopped answer.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.37](../../10-requirements/capabilities/017-assistant-message-components.md#s1737), [S17.38](../../10-requirements/capabilities/017-assistant-message-components.md#s1738), [S17.39](../../10-requirements/capabilities/017-assistant-message-components.md#s1739), [S17.40](../../10-requirements/capabilities/017-assistant-message-components.md#s1740).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** When an assistant turn ends abnormally the app keeps whatever text arrived and adds a notice that says which case it is and what to do next. The four cases are partial failure, refusal by the model's safety layer, stop by the person, and an empty reply.

**Why it exists.** A cut-off answer that looks like a normal one misleads people, and a blank bubble says nothing. The server and clients already share wording so a person who meets the same failure on web, mobile, CLI or an editor reads the same thing (apps/cli/src/errors.rs:70-76 comment; apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.ts header). Brief items S17.37-S17.40.

**Who uses it.** Anyone using chat on any of the six apps when a model, connection, safety layer or their own Stop button ends a turn early.

**Problems it solves**

- Partial answers passing as complete.
- Refusals read as generic errors or as normal answers.
- Blank assistant bubbles after an empty model reply.
- No clear route to try again, switch model or appeal a refusal.

**Use cases**

- A connection drops half way through a long answer: the text stays, a notice gives the reason and Retry.
- The model declines for safety reasons: the notice says so; on web an appeal dialog and Retry, on mobile Switch model and Report.
- The person presses Stop: the answer keeps what arrived and reads 'Response stopped.' with Try again.
- The provider returns nothing: web shows 'The model finished without returning a response.'; the CLI retries once automatically.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): notices under the last assistant message in the transcript: 'Response stopped.' with 'Try again'; a failure row with 'Retry' and sometimes 'Switch model'; 'The model declined to finish this response for safety reasons.' with an appeal control and 'Retry'; 'Continue generating' for cut-off answers (apps/web/features/chat/components/messages/ChatMessageList.tsx:1840-1847, 1938-1989). The empty-reply card is inside the bubble: 'The model finished without returning a response. Use Regenerate below to run it again.' (apps/web/features/chat/components/messages/MessageBubble.tsx:2879).
- Mobile: under the answer, a red failure notice that starts 'Response may be incomplete:' when text arrived, with 'Retry' and sometimes 'Switch model'; 'Response stopped.' with 'Try again' (only when no text arrived); the refusal notice 'The model declined to finish this response for safety reasons. Rephrase your message, or try a different model.' with 'Switch model' and 'Report'; 'Continue generating' (apps/mobile/src/features/chat/components/MessageBubble.tsx:2838-2980).
- CLI: text lines in the terminal. A cut answer prints a warning with both sentences; a refusal or empty reply ends the turn with an error and a hint; Esc or Ctrl-C shows '⊘ Stopped' (apps/cli/src/agent/chat.rs:2303-2321; apps/cli/src/errors.rs:88-114; apps/cli/src/tui/tui_app.rs:8720-8732).
- VS Code sidebar: an error block with a headline and buttons 'Retry' (L10N retry), 'Switch model' and sign-in or upgrade actions (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4506-4560; errorPresentation.ts:421-424, 430).
- Chrome side panel: an error footer with the error text, 'Retry' and sometimes 'Switch model'; an interrupted footer with a task-state label and 'Retry' (apps/extension/src/features/side-panel/bubbles.ts:295-360); empty reply text 'No response was returned. Try again.' (apps/extension/_locales/en/messages.json spEmptyResponse). Refusal state: not found.

**Before you start**

- A turn that ended abnormally on the last assistant message. Web shows these notices only on the last message and only once streaming has stopped (ChatMessageList.tsx:1356-1402).
- Retry and Try again need the host to pass a regenerate handler (onRegenerate on web, onRetryMessage on mobile).

**Screens and controls**

- Web: TranscriptNotice rows with an icon, message and action; model picker opens from 'Switch model'; refusal appeal dialog from ComposerFeedbackDialog (variant safety-appeal).
- Mobile: danger-coloured notice box (tap to retry), TurnNotice rows, 'Continue generating' button (testID continue-generating).
- VS Code: .message.error block with .error-actions buttons.
- Chrome: .sp-bubble-error-footer and .sp-bubble-interrupted-footer with Retry buttons.

**Journey**

1. 1. Send a message and watch the answer stream.
2. 2. Something ends the turn early: connection loss, provider failure, refusal, Stop pressed, or an empty reply.
3. 3. The app keeps any text that arrived and adds the matching notice.
4. 4. Read the reason sentence (and the reference id if shown).
5. 5. Press Retry or Try again (or Switch model, Continue generating, or the appeal/Report control).
6. 6. A new attempt replaces or follows the failed one.

**What the person sees and gets**

- Reason sentences by cause on web such as 'the response stopped part way through; the part that arrived is kept above.' and 'the safety system stopped this response.' (ChatMessageList.tsx reason table, lines ~95-115).
- A reference id appended to failure text when the server logged one (web withTurnErrorReference; mobile 'Reference: <id>', messageStreamError.ts).
- Screen-reader announcements on web: 'Generating response', 'Response paused, waiting for your approval' and a settled summary (ChatMessageList.tsx:1790-1803).
- CLI: warning line or error plus hint; --json-events emits a turn_incomplete event with kind and hint (apps/cli/src/errors.rs:117-135; chat.rs:2309-2312).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web partial and failed turns: reason from the stream error code, Retry, and Switch model for provider-side codes, with a Free-plan compatibility gate on the switch (ChatMessageList.tsx:1815-1850).
- Web stopped turns: abort stamps finishReason 'stopped' and keeps content (apps/web/lib/hooks/useChatStream.ts:6137-6150); notice 'Response stopped.' with 'Try again' (ChatMessageList.tsx:1955-1966). Continue is not offered for a stopped turn (line 1356).
- Web refusal: finishReason 'refusal' or 'content_filter' gives the safety notice with appeal and Retry (turn-error-notice.ts:14-17; ChatMessageList.tsx:1396-1402, 1967-1989).
- Web empty reply: the client silently retries once, then shows the empty-reply card (useChatStream.ts:4800-4820, 1731-1770; MessageBubble.tsx:2223-2260, 2879). The server marks empty turns truncated (turn-completeness.ts).
- Mobile all four: failure notice with partial prefix and Retry (MessageBubble.tsx:2838-2900), stop notice (2928-2936), refusal notice (2938-2958), empty reply turned into an error 'The model finished without returning a response. Try again.' (messageStreamError.ts:61-65; chatExecutionStore.ts:3790-3799).
- CLI: judge_generation sorts a finished generation into continues, delivered, delivered-incomplete or failed with a cause (apps/cli/src/agent/chat.rs:338-365); a cut answer prints a warning, an empty reply is retried once, a refusal fails with a hint (chat.rs:2259-2321); Esc or Ctrl-C keeps partial text and prints '⊘ Stopped' (tui_app.rs:8438-8456, 8720-8732).
- VS Code failures: typed failure codes map to headline, category, Retry and Switch model offers, including refused_by_safety and output_limit_reached (errorPresentation.ts:386-441, 446-473).
- Chrome: failed and interrupted turns show a footer with Retry; an empty turn becomes an error with spEmptyResponse (bubbles.ts:295-360; side_panel.ts:9698-9702).

**Incomplete**

- VS Code stop: the extension sends done with stopped true (ChatStateManager.ts:6874-6879) but the sidebar's done handler does not read it, so a stopped answer shows no 'stopped' marker (webviewContent.ts:7870-7900). Only a stored turn gets 'The previous turn stopped early. You can continue here.' (ChatStateManager.ts:6250; en/vscode.json chatNotice.storedTurnStopped).
- VS Code empty reply: no dedicated 'no response' string found; the runtime's empty-reply cause maps to provider_unavailable in the CLI engine (errors.rs:140-146), which VS Code would show as '<provider> could not answer.' [inferred].
- Mobile stopped notice offers 'Try again' only when no text arrived (MessageBubble.tsx:2931-2936).
- Mobile refusal notice has no Retry, only Switch model and Report.
- Web refusal wording does not say 'rephrase or pick another model'; that next-step text is on mobile and VS Code (ChatMessageList.tsx:1971 vs MessageBubble.tsx:2941).

**Present but disconnected or switched off**

- VS Code 'stopped: true' payload is sent but unread by the sidebar (see above).

**Not available**

- Chrome refusal state: not found in apps/extension/src.
- CLI Retry control: none; the hint says to send again.
- VS Code Continue generating: not available (brief S17.21).

## 4. Required behaviour

**Established requirements**

- When an answer fails after some output, the partial output is kept and visibly marked incomplete, with the reason. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S17.37)
- When the model or safety layer refuses, the answer shows a distinct refusal state, not a generic error or normal answer, with a next step. Refusal state is missing in Chrome. (source: S17.38 (same brief))
- An answer the user stopped is marked as stopped, keeps what arrived, and offers to try again. (source: S17.39 (same brief))
- A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble. (source: S17.40 (same brief))
- Every async flow has complete states: error, retry, cancellation, offline, permission denial. (source: doc: docs/product/experience-contract.md:82)
- The chat transcript includes an error/retry card and retry/regenerate. (source: doc: docs/product/experience-contract.md:398, 405)
- Never silent failures or dead controls. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Interrupting a stream after some text leaves the text visible and adds a notice naming a reason (not a raw provider payload).
2. A refusal finish shows a notice that is visually and verbally distinct from a failure and offers at least one next step.
3. Pressing Stop keeps the partial text, marks the answer as stopped and offers Try again (when no text arrived) or a way to continue.
4. A turn with no text, tool call or file shows a 'no response' message with Retry rather than an empty bubble.
5. Retry replaces the failure notice with the new attempt's outcome.
6. On Free plan, 'Switch model' is not offered when no compatible Free model exists (web).
7. The same cause reads the same on web, mobile, CLI and VS Code (shared wording).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Stopped answers on VS Code should be marked like other apps [inferred from S17.39 'done' status versus the unread payload].
- Stop, failure and refusal should not be metered as a successful answer: unknown, not checked.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Read payload.stopped in the VS Code done handler and show a stopped notice with a retry.
- [proposed] Add a refusal state to Chrome using the finish reason from the managed stream.
- [proposed] Add a Retry on mobile refusal notices and on mobile stopped answers that kept text.
- [proposed] Give web refusal the same 'rephrase or pick another model' wording as mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatMessageList (web) | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Computes showContinue, showStoppedNotice, showStreamErrorNotice, showRefusalNotice (1355-1402), builds failure reason and actions (1815-1850), renders notices (1938-1989). |
| component | MessageBubble (web) empty card | `apps/web/features/chat/components/messages/MessageBubble.tsx` | producedNoVisibleOutput and the empty-reply notice (2223-2260, 2879); passes failureReason and failureActions (2685-2686). |
| service | turn-error-notice | `apps/web/features/chat/lib/turn-error-notice.ts` | isRefusalFinish, isStoppedTurn, cause table INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE, default copy. |
| service | continue-generation | `apps/web/features/chat/lib/continue-generation.ts` | Re-exports shared isMessageContinuable and hasStreamError from unified-chat. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Stamps finishReason stopped on abort (6137-6150), records stream errors, silent empty-turn retry (4800-4820). |
| service | turn-completeness (server) | `apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.ts` | Defines empty output, truncated turn and classifyEmptyTurn causes. |
| component | ComposerFeedbackDialog safety-appeal | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Appeal control inside the web refusal notice; sends feedback_context safety_refusal. |
| component | TranscriptNotice | `apps/web/features/chat/components/messages/TranscriptNotice.tsx` | Shared notice row component. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Failure notice, stopped, refusal and continue controls (2838-3010); REFUSAL_FINISH_REASONS line 530. |
| service | messageStreamError | `apps/mobile/src/features/chat/utils/messageStreamError.ts` | Parses failure frames, EMPTY_RESPONSE_FAILURE, streamFailureNoticeText with 'Response may be incomplete' prefix. |
| service | continuableAnswer | `apps/mobile/src/features/chat/utils/continuableAnswer.ts` | Decides when a cut-off Cloud answer can continue; stopped answers get Try again, not Continue. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Stamps stopped (1530-1537), turns empty output into EMPTY_RESPONSE_FAILURE (3790-3799). |
| service | judge_generation and settle_generation | `apps/cli/src/agent/chat.rs` | Classifies a finished generation and delivers, retries once or fails (338-365, 2259-2321). |
| schema | IncompleteTurnCause | `apps/cli/src/errors.rs` | NoResponse, RefusedBySafety, OutputLimitReached, StreamEndedEarly with summary, next move, kind and protocol code (70-146). |
| component | TUI cancel handling | `apps/cli/src/tui/tui_app.rs` | Esc or Ctrl-C cancel, keeps partial text, prints '⊘ Stopped' (8438-8456, 8720-8732). |
| service | errorPresentation (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Maps typed turn failures to headline, category, Retry, Switch model (284-473). |
| component | addErrorMessage (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Renders the error block and Retry (4506-4560); done and error handlers (7870, 7974). |
| component | ChatStateManager turn events | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Posts done with stopped true and error payloads (6870-6890). |
| component | bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | Error footer, interrupted footer and Retry button (295-360, 795-810). |
| component | side_panel stream end (Chrome) | `apps/extension/src/side_panel.ts` | Marks empty assistant turn as error with spEmptyResponse (9698-9702); marks cancelled turn interrupted (7624). |
| config | English strings for VS Code errors | `packages/ui/i18n/locales/en/vscode.json` | chatError.safety, interrupted, outputLimit, stoppedPartWay, providerCouldNotAnswer. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client sends the turn and streams the answer; the server judges the ending: empty output, cancelled, error, refusal or output limit, and marks the turn truncated or blocked. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.ts:1-140 |
| A stream failure arrives as a stream-error frame or code with a message, retryable flag and request id; the client stores it on the message metadata. | device and our servers | useChatStream.ts:2115, 3501-3503; mobile messageStreamError.ts parseStreamFailure |
| The client chooses a notice from message metadata: finishReason stopped, refusal or content_filter, a stream error, or no visible output, then renders the reason and actions. | device | ChatMessageList.tsx:1355-1402; mobile MessageBubble.tsx:1952-1968, 2838-2958 |
| Person presses Stop: the client aborts the request and stamps finishReason 'stopped' on the kept message. | device | useChatStream.ts:6137-6150; mobile chatExecutionStore.ts:1530-1537 |
| Person presses Retry or Try again: the client reruns the turn; on web it uses the regenerate path, creating a new attempt. | device and our servers | ChatMessageList.tsx:1840-1847 |
| CLI: a finished generation is judged on the device; an empty reply is sent once more, other failures raise a typed error with a hint. The provider call itself is made by the CLI to the chosen provider. | device | apps/cli/src/agent/chat.rs:2259-2297 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Partial answer text and metadata (finishReason, streamError code, message, requestId, truncated) | Message rows in the conversation store; web persists to the database via saveMessageToDb | Cloud conversations sync; Local conversations stay on the device [inferred] | Kept with the conversation. Web deletes the placeholder assistant message when a turn is abandoned before it starts (useChatStream.ts:4365-4378). |
| CLI session history reconciled after a cancel | Persisted managed session on the device | Not established | app.session.cancel_turn and persist_managed_session (tui_app.rs:8715-8725) |
| Analytics event 'generation_stopped' | Product analytics | Respects privacy mode | unknown |

**Models and providers.** The failure comes from whichever model route served the turn. Reasons are mapped from provider-neutral codes (provider_rate_limited, provider_overloaded, content_filter and so on) in turn-error-notice.ts:83-105 and the web gateway's turn-completeness classifier, so wording does not name vendors. Which providers emit refusals is not established.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No separate account rule: the notices are display of a turn the person already ran. Failure causes can themselves be account issues (session expired, plan restriction, usage limit) shown with their own reasons (ChatMessageList.tsx reason table). |
| Permissions | none found in the code |
| Subscription | Web hides 'Switch model' on the Free plan unless a compatible Free model exists (ChatMessageList.tsx:1822-1830). Plan and usage-limit causes get their own sentences ('the selected model is not part of your plan', 'you have reached a usage limit on your account'). Mobile has Free-quota wording in streamFailureNotice (test: streamFailureNotice.test.ts 'says when a Free account can continue'). |
| Limits and metering | Whether stopped, failed or empty turns are billed or counted: unknown (not traced). CLI records usage for the superseded empty attempt (chat.rs:2279 superseded_usage). |
| Feature flags | none found in the code |
| Model compatibility | Output-limit and refusal behaviour depends on the finish reason the model route reports. Continue and Switch model depend on route and plan. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local turns use the same message bubble, so notices render from the same metadata; which Local-inference code writes streamError or finishReason was not found in the files read: unknown. CLI works the same for any provider. Local inference needs no paid plan (product rule), and these notices have no plan check. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading or streaming | Notices hidden while generating; web announces 'Generating response'. | ChatMessageList.tsx:1351-1366, 1790-1803 |
| Failure with no text | Mobile uses the gateway sentence alone, without the 'may be incomplete' prefix. | messageStreamError.ts streamFailureNoticeText |
| Raw provider payload | Web refuses to show text containing braces and falls back to a cause sentence. | ChatMessageList.tsx RAW_PAYLOAD_MARKERS and streamErrorReason |
| Rate limit with wait | States the wait only if the provider sent one; web and mobile. | turn-error-notice.ts:245-254; messageStreamError.ts statedWait |
| Retry | Web Retry calls regenerate; VS Code disables the button after one press and resends the last turn; Chrome disables the button and calls onRetry. | ChatMessageList.tsx:1840; webviewContent.ts:4520-4532; bubbles.ts:295-306 |
| Cancel before stream starts | Web removes the pending assistant row; mobile removes it and marks the user message stopped. | useChatStream.ts:4365-4378; chatExecutionStore.ts:2975-2990 |
| Offline or reconnect | Mobile can hold an in-flight turn for offline replay instead of showing a failure when nothing was produced. | chatExecutionStore.ts:4055-4090 |
| Waiting for approval | The empty-reply card is suppressed while a tool approval is open. | MessageBubble.tsx (web) 2223-2233 |
| Accessibility | Web notices have roles and aria labels (Retry this response); mobile notice is a button with an accessibility label including 'Tap to try again'; VS Code error block data-error-category; Chrome footers use role alert or status. | ChatMessageList.tsx RETRY_ACTION_ARIA; MessageBubble.tsx (mobile) 2845-2850; bubbles.ts:306-360 |
| Timeout | Cause 'the model took too long to respond.' on web; CLI/VS Code have a timeout code. | ChatMessageList.tsx reason table; errorPresentation.ts timeout case |
| Chrome refusal | not handled in the code | No refusal or content_filter handling in apps/extension/src |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/ChatMessageList.test.tsx`: Web transcript notices (file matched stopped and refusal text; cases not read).
- `apps/web/features/chat/components/messages/__tests__/ChatMessageList.serverStoppedTurn.test.tsx`: Grey stopped notice with no Continue and no failure notice; a cut-off turn without a stop request is kept apart.
- `apps/web/features/chat/components/messages/__tests__/ChatMessageList.noticeAlignment.test.tsx`: Notice layout (matched notice text; cases not read).
- `apps/web/features/chat/components/messages/ChatMessageList.retryAnchor.test.tsx`: Retry anchoring in the web list (name only).
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.emptyTurnActions.test.tsx`: Actions on a stopped or empty turn.
- `apps/web/features/chat/lib/turn-error-notice.message.test.ts`: Failure message mapping (name only).
- `apps/web/features/chat/lib/turn-error-notice.resolve.test.ts`: Cause resolution (name only).
- `apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.test.ts`: Empty and truncated turn rules (name only).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.empty-response.test.ts`: Empty response in the tool loop (name only).
- `apps/mobile/__tests__/MessageBubbleTurnEnd.test.tsx`: Stopped notice alone before any step, Try again when nothing was written, declined versus failure endings.
- `apps/mobile/src/features/chat/utils/__tests__/streamFailureNotice.test.ts`: Wait and reference kept, no invented fields, Free allowance wording, units.
- `apps/mobile/__tests__/ContinueOnlyForCutOffAnswer.test.ts`: Continue offered only for cut-off answers (name only).
- `apps/mobile/__tests__/HydrateStoppedTurn.test.ts`: Stopped turn on reload (name only).
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: Headlines, offers, retryable flag, stated waits.
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Side-panel bubble rendering; retry or interrupted footers not confirmed from titles read.
- `apps/cli/src/errors.rs`: Inline tests: incomplete-turn wording, retryability and exit class (around lines 2150-2270).
- `apps/cli/src/agent/chat.rs`: Inline tests of judge_generation verdicts (around lines 5802-5889).

**Test scenarios**

- **Stop mid-answer on web**
  1. Send a long prompt.
  2. Press Stop after some text appears.
  - Expected: Text stays, 'Response stopped.' with 'Try again' appears, no Continue button; Try again regenerates.
- **Drop the connection mid-stream**
  1. Send a long prompt.
  2. Cut the network after some text.
  - Expected: Text stays; a notice gives a reason and Retry; web and mobile do not show a raw provider payload.
- **Refusal**
  1. Use a test route that ends with finishReason refusal.
  - Expected: Web: safety notice with appeal and Retry. Mobile: notice with Switch model and Report. CLI: error 'The safety system stopped this response.' with the rephrase hint.
- **Empty reply**
  1. Force an empty model output.
  - Expected: Web silently retries once then shows 'The model finished without returning a response.'; mobile shows the Retry notice; CLI says 'Sending it once more.' then fails with a hint; Chrome shows 'No response was returned. Try again.'
- **Stop in VS Code**
  1. Start a turn in the sidebar and press Stop.
  - Expected: Partial text stays. Expected by the brief: a stopped marker. Likely actual: no marker (gap); record what is seen.
- **Free plan switch model**
  1. On a Free account trigger a provider_overloaded failure with no compatible Free model.
  - Expected: Retry shows, Switch model does not (ChatMessageList.tsx:1822-1830).

**Where to look when it fails**

- Stream error code and request id on message metadata (streamError.code, streamError.requestId); the id is shown to the reader as a reference.
- Server log lines carry the same request id (turn-error-notice.ts comment).
- CLI --json-events turn_incomplete event with kind empty_response, refused_by_safety, output_limit_reached or stream_ended_early.
- CLI tracing warning 'failed to persist the cancelled turn' (tui_app.rs:8733).
- Product analytics event generation_stopped.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- CLI: [70-qa/test-plans/cli/017-assistant-message-components.md](../../70-qa/test-plans/cli/017-assistant-message-components.md)
- VS Code: [70-qa/test-plans/vscode/017-assistant-message-components.md](../../70-qa/test-plans/vscode/017-assistant-message-components.md)
- Chrome: [70-qa/test-plans/chrome/017-assistant-message-components.md](../../70-qa/test-plans/chrome/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **VS Code does not mark a stopped answer** Affects: VS Code users. Evidence: done {stopped:true} sent at ChatStateManager.ts:6874-6879; done handler webviewContent.ts:7870-7900 does not read it; brief says done. Work needed: Read payload.stopped, add a stopped notice with retry, add a test.
- **Chrome has no refusal state** Affects: Chrome users. Evidence: Brief S17.38; no refusal handling in apps/extension/src. Work needed: Carry the finish reason through the managed stream and render a refusal notice with a next step.
- **VS Code empty reply has no dedicated message** Affects: VS Code users. Evidence: No 'no response' string in apps/extension-vscode/src or en/vscode.json; CLI maps NoResponse to provider_unavailable. Work needed: Confirm what the runtime sends and add explicit copy.
- **Mobile refusal has no Retry; mobile stopped answer with text has no Try again** Affects: Mobile users. Evidence: MessageBubble.tsx (mobile) 2928-2958. Work needed: Decide the next steps and add actions.
- **CLI has no Retry control for any case** Affects: CLI users. Evidence: Brief S17.20 missing; hints say to send again. Work needed: Add a retry command or keybinding.
- **Web refusal text lacks a rephrase or switch-model next step** Affects: Web and Desktop users. Evidence: ChatMessageList.tsx:1971 versus mobile MessageBubble.tsx:2941. Work needed: Align wording and add a switch-model action.
- **Line references in the brief for CLI, Web and Chrome have drifted** Affects: Brief accuracy. Evidence: tui_app.rs:5234 is not turn-ending code; bubbles.ts:185 is a map card. Work needed: Regenerate the code references.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- mode:own-key
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-local-inference
- F017-08

## Unknown

- Whether stopped, failed or empty turns count against usage or quota on web and desktop.
- Which on-device (Local) inference path on mobile writes streamError or finishReason; the cloud stream code was read, the local path was not located.
- What the Chrome text for the 'cancelled' state says (agentTaskStateLabel not resolved).
- Exact test cases in ChatMessageList.test.tsx, turn-error-notice tests, turn-completeness tests and the Chrome bubbles test.
- Whether the desktop Tauri build duplicates these notices; the public desktop shows the hosted web app (doc: AGENTS.md section 5).
- Which model providers actually emit refusal or content_filter finish reasons.
- Whether VS Code's native chat panel (chatParticipant.ts) shows a stopped state; only the sidebar was read.
- Retention of persisted partial answers after deletion.
