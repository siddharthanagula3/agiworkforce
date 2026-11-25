---
id: "F019-05"
type: "feature"
title: "How a turn ends: completed, partly done, stopped"
aliases: ["Completed", "Partially completed", "Cancel requested", "Cancelled", "Stopped", "Stopping the Cloud task", "Finished with errors", "Worked for"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.15", "S19.16", "S19.17", "S19.18"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-05 How a turn ends: completed, partly done, stopped

After a turn ends, the screen says whether it completed, finished with errors, or was stopped, and while a stop is in progress it says so. A Cloud stop on web waits up to about 30 seconds for the server to confirm. Text that already arrived is kept.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.15](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1915), [S19.16](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1916), [S19.17](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1917), [S19.18](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1918).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the end state of a turn and the stopping state, and records a user stop as stopped, not failed.

**Why it exists.** People need to know whether to trust the answer and whether the assistant is still working.

**Who uses it.** Everyone who sends turns and anyone who presses Stop.

**Problems it solves**

- A stop is not mistaken for an error.
- A Cloud task that did not stop is not hidden: the person is told to check its activity.
- Partial success is distinct from success and failure.

**Use cases**

- Press Stop mid-answer and keep the part already written.
- See 'Worked for 42s' after an agent run.
- See 'Finished with errors' when one step failed.
- Stop a Cloud agent task and wait for the confirmation.

## 2. User experience

**Where to find it**

- Web and Desktop: the Stop button (aria 'Stop the current response', title 'Stop generation') replacing send; the status line 'Stopping the Cloud task…' under the message; the activity summary.
- Mobile: stop control in the composer; the 'Response stopped.' notice under the bubble.
- CLI: Esc or Ctrl-C; transcript line '⊘ Stopped'; status 'stopping the turn…'.
- VS Code: Stop button; 'Stopping…' status and 'Stop response' label.
- Chrome: send button in stopping mode; 'Stopping…' status in the bubble; 'Cancelled after <time>' summary.

**Before you start**

- A running turn.

**Screens and controls**

- Web SendButton stop mode (SendButton.tsx:40-55).
- Web StreamPhaseNotice role status with 'Stopping the Cloud task…' or 'Reconnecting…' (StreamPhaseNotice.tsx:11-16).
- CLI cancel keys (tui_app.rs:8442-8460).
- VS Code stopBtn sets aria-busy and aria-label 'Stopping' (webviewContent.ts:5865-5872).

**Journey**

1. 1. Press Stop.
2. 2. Web: the request is aborted at once; if the turn belongs to a Cloud run, 'Stopping the Cloud task…' shows and a cancel request is sent, then the run is polled once a second up to 30 times for a terminal state (cancel-cloud-run.ts:4-20; useChatStream.ts:5408-5453).
3. 3. If confirmed, the loading state clears; if not, an error toast says 'The Cloud task has not confirmed it stopped. Check its activity before retrying.' and the stop stays unconfirmed (useChatStream.ts:5427-5438).
4. 4. The message is marked finishReason stopped and the activity cancelled; the text that arrived is kept and saved (useChatStream.ts:6136-6170).
5. 5. The summary reads Stopped (or the last real step), the screen reader says 'Response cancelled. Partial response saved.' (ChatMessageList.tsx:1155-1159).

**What the person sees and gets**

- Web completed: 'Worked for <time>' or 'Searched the web · N sources' (AgentActivityTimeline.tsx:316-355); aria 'Agent activity completed'.
- Web partial: 'Finished with errors' (or the last step summary) and aria 'Agent activity finished with errors'; a partial run whose last step succeeded reads as completed (activity-status.ts:57-64).
- Mobile: 'Worked for <t> · <summary>', 'Finished with errors after <t>', 'Stopped after <t>', 'Failed after <t>' (AgentActivityTimeline.tsx:259-266).
- Chrome: 'Worked for <t>', 'Finished with errors · <t>', 'Cancelled after <t>' (bubbles.ts:1160-1190).
- Mobile stop notice: 'Response stopped.' with 'Try again' only when no text arrived (MessageBubble.tsx:2928-2935).
- CLI: '⊘ Stopped' and 'stopped the turn' (tui_app.rs:8725-8730).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: stop aborts the stream and, for a Cloud run, cancels and confirms (useChatStream.ts:5391-5459; cancel-cloud-run.ts).
- Web: stopped finish reason and cancelled activity recorded on abort, saved to the database for non-temporary chats (useChatStream.ts:6136-6170).
- Web: stopped turn handled separately from failure (turn-error-notice.ts:19-29,299-300).
- Mobile: stop aborts locally, marks messages cancelled, and sends a cancel request without waiting; on error shows 'Could not stop the Cloud task. Check its activity before retrying.' (chatExecutionStore.ts:5423-5545).
- CLI: Esc or Ctrl-C drops the in-flight future, keeps partial text, persists the stopped turn and records generation_stopped (tui_app.rs:8442-8503,8713-8745).
- VS Code: Stopping state with aria-busy; stored turn notice shows when the thread status is failed (ChatStateManager.ts:6249-6251).
- Chrome: stoppingStreamId state, 'Stopping…' on the button and bubble, cancellation confirmation timeout of 15 seconds (side_panel.ts:7045,9904-9909; managedRunControl.ts:36-37).
- Run summary labels for partial on web, mobile and Chrome (above).

**Incomplete**

- Mobile does not wait for the server to confirm the stop; the UI is marked stopped before confirmation (chatExecutionStore.ts:5535-5543).
- VS Code: no distinct partial label found; the activity group has only done, error or working (webviewContent.ts:9011).
- CLI: no run-level Completed or Partially completed label was found in tui_app.rs; each tool cell is Complete or Failed on its own (333-343).
- Chrome confirms for up to 15 seconds, web for about 30 seconds: not the same.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Brief claims the CLI and VS Code show Partially completed; not found in the code opened.

## 4. Required behaviour

**Established requirements**

- A finished turn is clearly shown as completed and the indicator stops. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.15)
- A run that finished with some steps failed is shown as partially completed, distinct from success and failure. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.16)
- After Stop, the surface shows the stop in progress until it takes effect. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.17)
- A stopped turn ends in a clear stopped state that keeps what arrived. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.18)
- Stop/cancel works: interrupted state is recorded and the UI recovers. (source: docs/product/requirements.md:956 (M-CHAT-004))
- Cancellation is one of the states every async flow must design. (source: docs/product/experience-contract.md:82)

**Acceptance criteria**

1. Press Stop on a plain answer on web: streaming ends, the text stays, the summary reads Stopped or similar, and a screen reader hears 'Response cancelled. Partial response saved.'
2. Press Stop on a Cloud agent run on web: 'Stopping the Cloud task…' shows until the run is terminal; the notice disappears.
3. Block the cancel confirmation: after about 30 seconds an error toast says to check the task's activity.
4. Run a task where one step fails but the last succeeds: web summary reads completed; where the last step fails it reads Finished with errors.
5. Stop on mobile: bubble shows 'Response stopped.'; reopening the chat shows the same state.
6. Stop in the CLI: '⊘ Stopped' shows and queued text returns to the composer.
7. Stop twice quickly: the second press does nothing while cancellation is pending.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should confirm the stop or label it as requested, not final, until confirmed [inferred from the web design].
- The stop confirmation time should be the same on web and Chrome [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Finished with errors' label to the VS Code activity group.
- [proposed] Show a stopping state on mobile until the server confirms.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | cancelCloudRunAndConfirm | `apps/web/features/chat/lib/cancel-cloud-run.ts` | Cancel then poll once a second, up to 30 times. |
| store | stream phase store | `apps/web/features/chat/stores/stream-phase-store.ts` | Holds reconnecting or stopping per message id. |
| component | StreamPhaseNotice | `apps/web/features/chat/components/messages/StreamPhaseNotice.tsx` | Shows Stopping the Cloud task or Reconnecting. |
| hook | stopGeneration and abort handling | `apps/web/lib/hooks/useChatStream.ts` | Stop flow (5391-5459) and AbortError handling (6136-6170). |
| service | turn-error-notice stopped helpers | `apps/web/features/chat/lib/turn-error-notice.ts` | isStoppedTurn and exclusion from failure notices. |
| component | AgentActivityTimeline summaries | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Completed, partial and cancelled summaries (316-355). |
| endpoint | cancel run route | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | POST handleCancel (line 112): cancels a managed cloud run. |
| service | managed cloud run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | cancelRun and getRun client calls (389-400). |
| config | TERMINAL_AGENT_TASK_STATES | `packages/contracts/types/src/cross-device.ts` | Set of states treated as stopped or ended (469). |
| store | mobile chatExecutionStore stopStreaming | `apps/mobile/stores/chat/chatExecutionStore.ts` | Local stop plus cancel request (5423-5545). |
| component | mobile stopped notice | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Response stopped. notice (2928-2935). |
| component | CLI cancel path | `apps/cli/src/tui/tui_app.rs` | Esc and Ctrl-C handling and stopped commit (8442-8503,8713-8745). |
| component | VS Code stop button and stopped notice | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Stopping state (5865-5872). |
| service | VS Code stored turn notice | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | stoppedTurnNotice when thread status is failed (6249-6251). |
| component | Chrome stopping state | `apps/extension/src/side_panel.ts` | stoppingStreamId, button stopping mode (9904-9909). |
| service | Chrome managed run control | `apps/extension/src/features/cloud-bridge/managedRunControl.ts` | 15 s cancellation confirmation and unconfirmed message. |
| test | web useChatStream tests | `apps/web/lib/hooks/useChatStream.test.tsx` | Stopping phase tests (2325,2338,2488). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person presses Stop; the local request is aborted immediately. | device | useChatStream.ts:5404-5406 |
| For a Cloud run, a cancel request is posted and the run is polled until terminal. | our servers | cancel-cloud-run.ts:11-19; runs/[runId]/route.ts:112 |
| The message is saved as stopped with its partial text. | our servers | useChatStream.ts:6161-6170 (saveMessageToDb) |
| On mobile the cancel request is fired and the local state is changed at once. | device and our servers | chatExecutionStore.ts:5535-5543 |
| In the CLI the in-flight future is dropped, which cancels the provider stream; the partial text is persisted to the session file. | device | tui_app.rs:8713-8735 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| finishReason stopped and agentActivity status cancelled on the message | Message metadata (web store and saved message; mobile message store; CLI managed session) | Web saved to the server for non-temporary chats; mobile queues a cloud sync (queueCloudTurnForSync); CLI persists the session | Kept |
| Cancellation state per run (pending, unconfirmed) | Web ref cancellationsRef | No | Cleared when confirmed or the chat changes |

**Models and providers.** Stopping aborts the transport; whether the provider stops billing depends on the provider and is not stated in the code. Metering of a stopped turn: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cancelling a Cloud run needs the signed-in token (authority.getToken at useChatStream.ts:5410). |
| Permissions | CSRF headers on mutations (useChatStream.ts:5413). |
| Subscription | None found in the code. |
| Limits and metering | Web polls 30 times at 1,000 ms; Chrome 15,000 ms confirmation; mobile no wait. |
| Feature flags | None found. |
| Model compatibility | None. |
| Provider restrictions | None found. |
| Local mode | On web, Local turns have no run to cancel: the stop clears loading at once (useChatStream.ts:5456). CLI stops locally. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Stop pressed twice | Ignored while cancellation is pending. | useChatStream.ts:5401; webviewContent.ts:5866 |
| Stop not confirmed | Error toast and the run stays marked unconfirmed; loading stays on. | useChatStream.ts:5427-5444 |
| Stop fails to send | Toast 'Could not stop the Cloud task. Check its activity before retrying.' | useChatStream.ts:5440-5445 |
| Mobile cancel request fails | Error message with the same wording; UI already stopped. | chatExecutionStore.ts:5535-5539 |
| Stopped with no text | Mobile offers Try again; with text it hides regenerate. | MessageBubble.tsx:1952-1954,2928-2935 |
| Account change during stop | The ownership check drops late results. | useChatStream.ts:5418-5423 |
| Accessibility | StreamPhaseNotice role status; stop button aria labels. | StreamPhaseNotice.tsx:11; SendButton.tsx:50-51 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/hooks/useChatStream.test.tsx`: Stopping phase set at lines 2325, 2338, 2488 and unconfirmed-stop message at 2015.
- `apps/web/features/chat/lib/turn-error-notice.resolve.test.ts`: Notice resolution [inferred from file name].
- `apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts`: Cloud run liveness [inferred].
- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.stopped.test.tsx`: Stopped run summary [inferred].
- `apps/cli/src/tui/tui_app.rs`: In-file tests a_stopped_turn_returns_its_queued_prompts_to_the_composer (13672), a_stopped_tool_row_keeps_the_time_it_stopped_at (13879).
- `apps/mobile/__tests__/cloud-stream-finish-reason-and-error.test.ts`: Finish reason handling [inferred from file name].

**Test scenarios**

- **Plain stop**
  1. Send a long prompt.
  2. Press Stop at about 2 seconds.
  - Expected: Text kept, state stopped, composer ready.
- **Cloud stop confirmed**
  1. Start a Cloud agent task.
  2. Press Stop.
  3. Watch the status line.
  - Expected: Stopping the Cloud task… then cleared.
- **Cloud stop unconfirmed**
  1. Make the run endpoint keep returning running.
  2. Press Stop; wait 35 seconds.
  - Expected: Toast to check the task's activity; run not marked stopped.
- **Partial run**
  1. Run an agent task with one failing step at the end.
  - Expected: Finished with errors.
- **CLI stop**
  1. Start a turn, press Esc.
  - Expected: '⊘ Stopped' and partial text kept.

**Where to look when it fails**

- Web logs: trackProductEvent generation_stopped; CLI records generation_stopped.
- Mobile: message metadata finishReason.
- Run state via the managed run read endpoint; see SYS-observability-and-operations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **Mobile stop is optimistic.** Affects: Mobile. Evidence: chatExecutionStore.ts:5535-5543. Work needed: Confirm or show a stopping state.
- **VS Code and CLI lack a run-level Finished with errors label.** Affects: VS Code, CLI. Evidence: webviewContent.ts:9011; tui_app.rs:333-343. Work needed: Add a label or correct the brief.
- **Confirmation windows differ (30 s web, 15 s Chrome).** Affects: Web, Chrome. Evidence: cancel-cloud-run.ts:4-5; managedRunControl.ts:36-37. Work needed: Choose one value in shared config.
- **Billing effect of a stopped turn not documented in code opened.** Affects: All. Evidence: None. Work needed: Find the usage accounting path.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Usage metering of a stopped turn.
- Keyboard shortcut for Stop on web.
- Whether Desktop adds its own stop control.
- Mobile stop control label.
