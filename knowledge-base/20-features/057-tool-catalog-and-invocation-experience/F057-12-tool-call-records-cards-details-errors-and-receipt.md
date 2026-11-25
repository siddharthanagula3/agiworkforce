---
id: "F057-12"
type: "feature"
title: "Tool call records: cards, details, errors and receipts"
aliases: ["Tool call card", "ToolCallCard", "ToolTimeline", "ToolCallTimeline", "Tool receipts", "Recent calls", "Large-result reference", "read_tool_result", "S57.30 to S57.38"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.30", "S57.31", "S57.32", "S57.33", "S57.34", "S57.35", "S57.36", "S57.37", "S57.38"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "table:connector_call_events", "api:GET /api/connectors/calls", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-12 Tool call records: cards, details, errors and receipts

Every tool call appears in the transcript with its arguments, a running then done or failed status, a result preview and full detail on expand. Failed calls show an error and return to the model. Results over the inline limit are kept up to a cap for 24 hours and read back with read_tool_result. Records of calls exist but differ per app. Cost per call is not shown.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.30](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5730), [S57.31](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5731), [S57.32](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5732), [S57.33](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5733), [S57.34](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5734), [S57.35](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5735), [S57.36](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5736), [S57.37](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5737), [S57.38](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5738).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Renders tool calls as cards (web and desktop through the shared ToolCallCard, mobile through ToolCallTimeline, Chrome through side-panel bubbles, VS Code through its webview, CLI through the TUI). Replaces oversized results with a reference. Records connector calls in a log and session approvals in the developer sessions.

**Why it exists.** So people can see and trust what the assistant did, and so long outputs do not fill the context.

**Who uses it.** Everyone who uses tools; developers who debug runs.

**Problems it solves**

- Not knowing what a tool did.
- Big outputs exhausting context.
- Finding which connector calls worked.

**Use cases**

- Watch a web search card run, then open it to see the query.
- See a failed fetch card with its error.
- Ask the assistant to read the rest of a large result.
- Open 'Recent calls' for a connector.

## 2. User experience

**Where to find it**

- Web and Desktop: tool rows in the message (apps/web/features/chat/components/messages/ToolTimeline.tsx) built on ToolCallCard (packages/ui/unified-chat/src/components/ToolCallCard.tsx).
- Mobile: ToolCallTimeline with a tap to expand and 'Close tool details' (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:223-300,712).
- Chrome: agent activity cards in the side panel (apps/extension/src/features/side-panel/bubbles.ts).
- VS Code: tool cards in the webview and a session receipt list (apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:41).
- CLI: tool cells in the TUI.
- Recent calls: Settings, Connectors, a connector's tool permissions dialog (apps/web/features/connectors/components/ConnectorCallLog.tsx:36).

**Before you start**

- A turn that called a tool.

**Screens and controls**

- Status words from the timeline: 'Running: <tool>', '<n> tool calls failed', 'You denied <n> tool calls', 'Tool calls queued', 'Tool run complete' (ToolTimeline.tsx:555-583).
- Card sections 'Request', 'Response', 'Error' and 'No parameters' (ToolCallCard.tsx:480-520).
- Controls 'Cancel' and 'Copy' (ToolCallCard.tsx:549-565); live elapsed time while running (ToolCallCard.tsx:275-282).
- Approval buttons 'Allow', 'Allow for this chat', 'Deny'; expired approvals show 'Resend' (ToolCallCard.tsx:371-435).
- Retry: 'Try again' on the failed turn (apps/web/features/chat/components/messages/ChatMessageList.tsx:1959).

**Journey**

1. 1. The model calls a tool and a card appears as running with elapsed time.
2. 2. The card changes to done or failed.
3. 3. The person opens the card to see the request and response, and closes it again.
4. 4. A long result is shown cut with a notice naming a reference.
5. 5. The model reads the rest with read_tool_result and an offset.
6. 6. After a failure the person uses 'Try again', which re-runs the whole turn.

**What the person sees and gets**

- Argument and result previews; code blocks and file diffs are highlighted (ToolCallCard.tsx:286-300).
- Error text through humanizeToolErrorText (ToolCallCard.tsx:305-307).
- Mobile spoken status such as '<name>, <status>' (ToolCallTimeline.tsx:284).
- Notice text 'Call read_tool_result with reference ...' in the result (apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts, referenceOversizedToolResult).

**Settings**

- Tool approval policy.
- Show parameters flag on the timeline (showParameters).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared tool card with request, response, error, elapsed time, cancel, copy, expand (packages/ui/unified-chat/src/components/ToolCallCard.tsx:255-570).
- Status mapping running, complete, error, awaiting approval (ToolTimeline.tsx:206-222).
- Oversized results: inline cap 100,000 bytes, kept up to 900,000 characters for 24 hours, page size 40,000 characters, referenced by a random id and read back through read_tool_result (apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:15-19,148-190,263-325; apps/web/lib/e2b/types.ts:117,120).
- Failed tool results are appended as error tool messages so the model sees them (tool-loop.ts, isError results at lines 2705-2717 and the execution wrappers).
- Connector call log: tool name, outcome, duration, time; arguments and results are never recorded (apps/web/features/connectors/components/ConnectorCallLog.tsx:36-37; apps/web/lib/services/connector-call-log-service.ts:55-70).
- CLI session activity records approvals, file changes and validations (apps/cli/src/platform/runtime/session_activity.rs:1-60); VS Code lists them as a session receipt (sessionReceipt.ts:12-60).

**Incomplete**

- Retry re-runs the whole turn; no per-tool retry on web (MessageBubble.tsx:983-985,1054).
- Stored results are cut to the kept cap and need a key-value store; without one the reply falls back to a capped inline output (tool-result-store.ts, referenceOversizedToolResult).
- Secret policy can redact or block a stored result (tool-result-store.ts, evaluateToolResultSecretPolicy calls).

**Present but disconnected or switched off**

- The call log covers connector tools only, not built-in tools (connector-call-log-service.ts:52-70; written from apps/web/lib/connectors/health.ts:281).

**Not available**

- Per-tool cost or usage display on every app (brief S57.38 not applicable).
- A per-call receipt with input on Web, Desktop, Mobile, Chrome: the web log excludes arguments. Chrome and CLI per-call receipts: unknown (the brief's code pointers resolved to unrelated code).

## 4. Required behaviour

**Established requirements**

- A tool call shows its arguments and a result preview. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.31, S57.33)
- A failed call shows its error text on the card and goes back to the model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.35)
- Results longer than the size cap are stored for 24 hours and replaced by a reference. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.36)
- The receipt lists which tool ran, its input and its outcome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.37)
- Costs per tool call are not applicable on any app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.38)
- Show tool calls and results. (source: doc: docs/product/requirements.md:430)

**Acceptance criteria**

1. A running call shows elapsed time then switches to done or failed.
2. Opening a card shows the request and response; closing hides them.
3. A failed call shows an Error section and the next model step receives the error.
4. A result over 100,000 bytes shows a notice with a reference and read_tool_result with that reference and offset 0 returns the first 40,000 characters.
5. After 24 hours the reference returns 'No stored tool result matches'.
6. A reference from another conversation or user is refused (tests: tool-result-store.test.ts:210,246).
7. 'Try again' on a failed turn re-runs the turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief's 'stored whole' is true only up to the kept cap and only when the store works.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-call retry on web and mobile.
- [proposed] Extend the call log to built-in tools or record that it is connector only.
- [proposed] Correct the brief's receipt wording to match the log fields.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared card with request, response, error, status |
| component | ToolTimeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Groups and summarises tool calls on web |
| component | web ToolCallCard wrapper | `apps/web/features/chat/components/ToolCallCard.tsx` | Web adapter |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Wires approve, reject, resend and retry |
| component | ToolCallTimeline (mobile) | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Mobile cards |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile tool state (line 2523) |
| component | side panel bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | Chrome agent activity cards |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code tool cards |
| service | VS Code session receipt | `apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts` | Approvals and file changes list |
| service | CLI session activity | `apps/cli/src/platform/runtime/session_activity.rs` | Records approvals, file changes, validations |
| component | CLI TUI | `apps/cli/src/tui/tui_app.rs` | Tool cells and status |
| service | tool result store | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Keeps, references and reads oversized results |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Oversize handling (2850, 2912, 3008) and error messages |
| config | e2b limits | `apps/web/lib/e2b/types.ts` | MAX_EXECUTION_OUTPUT_BYTES and MAX_KEPT_TOOL_OUTPUT_CHARS |
| service | connector call log | `apps/web/lib/services/connector-call-log-service.ts` | Writes and reads call outcomes |
| endpoint | GET /api/connectors/calls | `apps/web/app/api/connectors/calls/route.ts` | Returns recent calls |
| component | ConnectorCallLog | `apps/web/features/connectors/components/ConnectorCallLog.tsx` | Recent calls list |
| table | connector_call_events | `apps/web/lib/services/connector-call-log-service.ts` | Stores call outcomes (insert at line 55) |
| config | tool copy | `apps/web/lib/tool-copy.ts` | Plain labels for tools |
| test | ToolTimeline tests | `apps/web/features/chat/components/messages/ToolTimeline.test.tsx` | Timeline behaviour |
| test | mobile ToolCallTimeline test | `apps/mobile/__tests__/ToolCallTimeline.test.tsx` | Mobile card behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The loop executes a tool; if the result is over the inline limit it is policed for secrets, stored with a 24 hour life and replaced by a notice with a reference. | our servers | tool-result-store.ts:148-190 |
| The loop streams tool start, progress and result events; errors are returned to the model as error tool messages. | our servers | tool-loop.ts:2850-3008 |
| The client renders the card, with elapsed time while running and expand and collapse on tap or click. | device | ToolCallCard.tsx:275-282; ToolCallTimeline.tsx:223-300 |
| read_tool_result reads a page of 40,000 characters from the store for the same user and conversation. | our servers | tool-result-store.ts:263-325 |
| For connector tools the outcome is inserted into connector_call_events without awaiting. | our servers | connector-call-log-service.ts:52-70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Oversized tool result | key-value store (provider unknown) keyed by user, conversation and reference | no | 24 hours, index of up to 10 listed results (tool-result-store.ts:15-17) |
| Call outcome | connector_call_events | server | reads cap at 100 entries; deletion rule unknown |
| Tool entries in message metadata | message metadata | with the conversation | with the chat |

**Models and providers.** Model neutral: cards and storage sit outside the model. The model receives the error text and the notice.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in for the hosted store and log; the CLI keeps session activity on the device. |
| Permissions | Stored results are readable only by the same user and conversation (test tool-result-store.test.ts:210-246); the call log is read under the caller's scoped database (apps/web/app/api/connectors/calls/route.ts:19). |
| Subscription | none found in the code for cards, references or the log. Cost per call is not metered or shown. |
| Limits and metering | Inline 100,000 bytes, kept 900,000 characters, page 40,000 characters, 24 hours, 10 listed results (tool-result-store.ts:15-19; e2b/types.ts:117,120). Call log default 50 (calls/route.ts:14), at most 100 stored entries read (connector-call-log-service.ts MAX_LOG_ENTRIES). |
| Feature flags | none found in the code. |
| Model compatibility | Any model that returns tool calls. |
| Provider restrictions | none found in the code. |
| Local mode | Card rendering works in every mode. The 24 hour result store and the call log are hosted server features, so they apply to Cloud turns only. CLI Local mode keeps its own tool cells and session activity on the device. Mobile Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Running | Card shows a live timer updated every 100 ms | ToolCallCard.tsx:275-282 |
| Failed | Error section with humanised text; call counted separately from a denied call | ToolCallCard.tsx:305-307,494-503; ToolTimeline.tsx:230-232 |
| Denied | Shown as denied, not failed | ToolTimeline.tsx:230-232,571-577 |
| Approval expired | Expired notice with Resend | ToolCallCard.tsx:371-380 |
| No parameters | Shows 'No parameters' | ToolCallCard.tsx:517 |
| Reference expired or wrong owner | 'No stored tool result matches' with a one-day note | tool-result-store.ts, readStoredToolResult |
| Offset past the end | Error naming the length | tool-result-store.ts, readStoredToolResult |
| No store available | Falls back to a capped inline result | tool-result-store.ts, referenceOversizedToolResult |
| Accessibility | Mobile card has role button, spoken label and expand hint | ToolCallTimeline.tsx:281-286 |
| Offline and reconnect | not handled in the code for the card itself | No offline branch in ToolCallCard.tsx or ToolTimeline.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/ToolTimeline.test.tsx`: Timeline rendering (name only)
- `apps/web/features/chat/components/ToolCallCard.test.ts`: Web tool card (name only)
- `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.failureReason.test.tsx`: Failure reason display (name only)
- `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.fileDiff.test.tsx`: File diff display (name only)
- `apps/mobile/__tests__/ToolCallTimeline.test.tsx`: Mobile card (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.test.ts`: Reference reuse, ownership, expiry, no store, trimmed results readable
- `apps/web/lib/services/__tests__/connector-call-log-service.test.ts`: Call log service (name only)
- `apps/web/features/connectors/components/__tests__/ConnectorCallLog.test.tsx`: Recent calls list (name only)
- `apps/extension/__tests__/side-panel-bubbles.test.ts`: Chrome bubbles (name only)

**Test scenarios**

- **Progress and expand**
  1. Run a web search
  2. Watch the card
  3. Open it, then close it
  - Expected: Running with timer, then done; request and response visible while open
- **Failure**
  1. Ask for a fetch of an address that fails
  - Expected: Error section on the card; the assistant explains the failure
- **Large result**
  1. Run code that prints over 100,000 bytes
  2. Ask the assistant to read the end
  - Expected: Notice with a reference; read_tool_result pages through it
- **Expiry**
  1. Use a reference after 24 hours
  - Expected: No stored tool result matches
- **Retry**
  1. Cause a turn failure
  2. Press Try again
  - Expected: The whole turn runs again
- **Recent calls**
  1. Call a released connector
  2. Open its tool permissions dialog
  - Expected: A row with outcome and time, no arguments

**Where to look when it fails**

- Logger line '[tool-result-store] oversized result not kept'.
- Logger line '[connector-call-log] a connector call was not logged'.
- Table connector_call_events.
- Result text 'The stored tool result could not be read. Try again.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **Retry is whole-turn only.** Affects: Web, Desktop, Mobile. Evidence: MessageBubble.tsx:983-985. Work needed: Per-tool retry if wanted.
- **Receipt omits input and covers connector tools only.** Affects: Web, Desktop, Mobile, Chrome. Evidence: ConnectorCallLog.tsx:36-37; connector-call-log-service.ts:55-70. Work needed: Decide the receipt content; change brief or code.
- **Stored results are capped, not whole.** Affects: Hosted turns. Evidence: apps/web/lib/e2b/types.ts:120; tool-result-store.ts referenceOversizedToolResult. Work needed: Correct the brief wording.
- **CLI error and retry and per-call receipts could not be located; brief pointers resolve to unrelated code.** Affects: CLI, VS Code, Chrome. Evidence: apps/cli/src/claude_parity.rs:1034-1098 is table, links and schedule prompt. Work needed: Find the real code and record it.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- table:connector_call_events
- api:GET /api/connectors/calls
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-observability-and-operations

## Unknown

- Which key-value store backs the 24 hour result store.
- Deletion rule for connector_call_events.
- Chrome and CLI per-call receipt code, if any.
- CLI tool error display and retry control, if any.
- Whether VS Code and Chrome tool cards show elapsed time.
- Mobile Local mode tool cards.
