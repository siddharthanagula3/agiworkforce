---
id: "F059-08"
type: "feature"
title: "Approval timing and resuming a run"
aliases: ["Approval expiration (S59.23)", "Resume after user intervention (S59.30)", "Action receipt and outcome display (S59.31)", "approval checkpoint", "APPROVAL_CHECKPOINT_TTL_HOURS", "approval lease"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.23", "S59.30", "S59.31"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "F059-07", "F059-09", "table:cloud_agent_approval_checkpoints", "api:POST /api/llm/v1/chat/completions/approve", "file:apps/web/lib/services/cloud-agent-run-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-08 Approval timing and resuming a run

A pending approval waits a limited time that differs by path: 24 hours for Cloud tool approvals, 15 minutes for device steps, 10 minutes in the CLI, 30 minutes for Cloud Code sessions. After a decision the same run resumes and the transcript shows ran or denied. Late answers are refused with an expiry message.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.23](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5923), [S59.30](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5930), [S59.31](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5931).

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

**What it does.** Stores a paused run as a checkpoint, accepts one decision before it expires, refuses late or duplicate answers, resumes the same run, and shows what was decided and what happened.

**Why it exists.** An agent cannot wait forever and a stale approval must never run an action the user no longer expects. Resuming the same run avoids restarting the work.

**Who uses it.** Everyone who approves agent actions on any app, and engineers who debug stuck approvals.

**Problems it solves**

- Stale approvals running late.
- Two devices answering the same approval.
- Lost progress when a person decides after leaving.
- Unclear outcome after pressing Allow.

**Use cases**

- Answer an approval in a Web chat 5 minutes later; the run continues in the same message.
- Come back the next day; the Cloud approval is older than 24 hours and the server refuses with an expiry message.
- A CLI prompt left alone for 10 minutes ends as 'did not run'.
- After Deny, the transcript marks the tool denied and the model is told it was denied.

## 2. User experience

**Where to find it**

- Web and Desktop chat: inline tool card and Approvals popover (ToolCallCard.tsx:371; ApprovalInbox.tsx:224).
- Web and Desktop Tasks page: 'Waiting for your approval' card with 'asked <time ago>' (TasksPage.tsx:891-905).
- Mobile: chat tool timeline and Tasks detail sheet (ToolCallTimeline.tsx:362,396; CloudRunDetailSheet.tsx:417).
- CLI: Tool Approval overlay and a system line after expiry (tui_app.rs:8396).
- VS Code: chat approval card outcome line and Cloud task commands (webviewContent.ts:7040-7046; cloudRunApproval.ts:30-35).
- Chrome: side panel approval block (bubbles.ts:970-1040).

**Before you start**

- A run paused on an approval or device step.
- Cloud: signed-in account; the run must still be pending.

**Screens and controls**

- Allow, Deny, Approve, Decline buttons by app; 'Resend' button on an expired inline card where regenerate is wired (ToolCallCard.tsx:372-380).
- Expired card text: 'This approval request expired or is no longer active.' with 'Send a new message to try again.' (ToolCallCard.tsx:371; ToolCallTimeline.tsx:362).
- Web popover expired text: 'This request expired. Open the conversation to rerun the turn.' (ApprovalInbox.tsx:224).
- Device step expired text: 'This step waited too long for <device>. Ask again on that device.' (ToolCallCard.tsx:362).
- Tasks page conflict text 'Another device already answered this approval.' and 'This approval expired and the task can no longer continue from it.' (TasksPage.tsx:175-184).

**Journey**

1. 1. The agent pauses on an approval. The server saves a checkpoint in state pending.
2. 2. The card shows waiting buttons.
3. 3. The person presses a decision for every pending call.
4. 4. The server claims the checkpoint (state resuming, with a lease) and resumes the same run.
5. 5. The card changes: denied calls show 'You denied this tool.', approved calls show running and then their result.
6. 6. When the turn ends the checkpoint is completed. If it expired first, step 4 returns 410 and the action does not run.

**What the person sees and gets**

- Web denied tool: error 'You denied this tool.' and result 'The user denied permission to run this tool.' (useChatStream.ts:5601).
- Mobile denied tool: 'You denied permission to run this tool.' (chatExecutionStore.ts:4439); allowed or denied saved line (ToolCallTimeline.tsx:396).
- VS Code outcomes 'Allowed once.', 'Allowed for the rest of this session.', 'Denied.', 'The turn ended before this was answered.' (webviewContent.ts:7040-7046).
- CLI after 10 minutes: 'The approval for <summary> expired after 10 minutes without an answer, so it did not run.' (tui_app.rs:8396).
- Model is told: 'The user denied permission to run this tool.' style result (tool-loop.ts:6600).

**Settings**

- Tool approval policy (ask every time, autonomous and others) decides whether an approval appears (packages/contracts/types/src/tool-approval-policy.ts:9-13). No setting for the wait time was found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud TTL constant 24 hours (apps/web/lib/services/cloud-agent-run-service.ts:457) applied when claiming (1935-1946), when listing pending approvals (478-490) and in the mobile status route (apps/web/app/api/mobile/agent-status/route.ts:66).
- Expired claim throws CloudAgentApprovalCheckpointExpiredError, mapped to 410 'This approval request expired and can no longer be resumed.' (route.ts:145). Unknown run 404, duplicate or already answered 409 'This approval is already being resumed.' (route.ts:148-151).
- The claim moves the checkpoint to resuming with a lease and the run to running in one transaction (cloud-agent-run-service.ts:1966-1992); the approve route asks for an 86,400 second lease (route.ts:227); failures release it back to pending (cloud-agent-run-service.ts:2027-2050).
- The resumed turn continues the same run, session, turn and event sequence (route.ts:560-580) and completes the checkpoint through predecessorApproval.
- Device step checkpoints expire after 15 minutes (cloud-agent-run-service.ts:515; packages/contracts/local-runtime/src/device-steps.ts:428; tool-loop.ts:7735).
- CLI TUI prompt expires after 600 seconds and records a Timeout decision (apps/cli/src/tui/tui_app.rs:38,1658,8396); the app-server waits 600 seconds (apps/cli/src/app_server/developer_host.rs:120,6975).
- Cloud Code session approvals expire after 30 minutes and answer 409 (apps/web/lib/services/cloud-code-agent-service.ts:964; apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:42).
- Web client closes the card on 404, 409, 410 (useChatStream.ts:5843); Mobile treats 404, 409, 410 as terminal (chatExecutionStore.ts:501); Tasks pages map 409 and 410 to clear messages (TasksPage.tsx:175-184; apps/mobile/src/features/tasks/service.ts:26,93-95).
- Transcript receipts: Web, Mobile, VS Code and CLI show denied and allowed results as listed above; the server writes audit event tool_approval_decided per call (route.ts:631).

**Incomplete**

- The brief says a lease expires on its own if a resume stops. For approval checkpoints the claim selects only state pending (cloud-agent-run-service.ts:1935) and a resuming row answers 409; only caller checkpoints reclaim an expired lease (cloud-agent-run-service.ts:1853). Whether another process repairs a stuck resuming approval was not found.
- Web and Mobile 'expired' in a chat card is client state (not live in memory, or superseded by a newer turn), not the 24-hour clock (useChatStream.ts:1138; MessageBubble.tsx:1010; chatExecutionStore.ts:791). A reloaded card older than 24 hours can show buttons until the server answers 410 [inferred].
- No remaining-time display was found on any app.

**Present but disconnected or switched off**

- apps/desktop/src (Tauri) is internal; Desktop public window uses the hosted web code.

**Not available**

- Configurable wait times: none found.
- Brief says device approvals last 15 minutes: the 15 minutes belongs to device-step checkpoints, not to approvals.
- Chrome expiry handling beyond the generic stream error: not established.

## 4. Required behaviour

**Established requirements**

- A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.23)
- After the user intervenes the same run resumes where it stopped. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.30)
- After a decision the transcript shows what was decided and what happened (ran, result or denied). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.31)
- Approval is bound to the exact pending action, expires, and cannot be replayed or retargeted. (source: doc: docs/product/experience-contract.md workflow W16)
- Approvals bind to stored commands; denial performs no action. (source: doc: docs/product/experience-contract.md workflow W18)

**Acceptance criteria**

1. A Cloud approval older than 24 hours answers 410 with the exact message and no tool runs.
2. A second answer to the same approval answers 409.
3. After Allow, the same run id continues in the same assistant message.
4. After Deny, the tool shows denied and the model receives a denied result.
5. A CLI prompt left 10 minutes ends with the 'did not run' line.
6. A device step older than 15 minutes shows 'waited too long' and does not run.
7. Expired approval cards show no Allow or Deny buttons.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A stuck resuming approval must recover after its lease ends, as the brief says.
- [inferred] A reloaded card should hide buttons when the checkpoint is past 24 hours.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the claim reclaim a resuming approval whose lease ended, as the caller checkpoint does.
- [proposed] Show 'expires in <time>' on every approval card using the server timestamp.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | cloud_agent_approval_checkpoints | `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql` | Pending, resuming, resolved and failed approval state with lease columns |
| service | APPROVAL_CHECKPOINT_TTL_HOURS and claim | `apps/web/lib/services/cloud-agent-run-service.ts` | 24 hour window, claim, release, complete, pending list |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Maps expiry to 410, conflict to 409, resumes the run |
| schema | approval wire contract | `packages/contracts/cloud-contracts/src/tool-approval-resume.ts` | Decisions, scopes, projection persisted for cards |
| endpoint | GET /api/mobile/agent-status | `apps/web/app/api/mobile/agent-status/route.ts` | Lists pending checkpoints inside the 24 hour window |
| service | device checkpoint TTL | `packages/contracts/local-runtime/src/device-steps.ts` | DEVICE_STEP_TTL_MINUTES 15 |
| service | tool-loop resume and device pause | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Builds resume results, denied message, device step expiry time |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Web pending turn registry, liveness, 404/409/410 handling, transcript updates |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Expired approval and expired device-step messages, Resend |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Computes approvalTurnExpired |
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Conflict and expiry messages on the Tasks page |
| store | chatExecutionStore (mobile) | `apps/mobile/stores/chat/chatExecutionStore.ts` | Pending approval turns, terminal statuses, denied receipt |
| component | ToolCallTimeline (mobile) | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Expired text and 'Decision saved' line |
| service | mobile tasks service | `apps/mobile/src/features/tasks/service.ts` | Expired and already-resumed messages |
| service | CLI approval modal | `apps/cli/src/tui/tui_app.rs` | 600 second expiry, system line, remote-answer handling |
| service | CLI app-server approval wait | `apps/cli/src/app_server/developer_host.rs` | 600 second timeout to Timeout decision; emits approval resolved event |
| service | cloud code approvals | `apps/web/lib/services/cloud-code-agent-approval-service.ts` | 30 minute Cloud Code session approvals, expiry error |
| component | VS Code approval card | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Outcome lines including expired |
| service | VS Code approval state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Posts approvalResolved expired when the turn ends |
| component | Chrome approval block | `apps/extension/src/features/side-panel/bubbles.ts` | Approve, Decline, recorded line, unavailable text |
| event | tool_approval_decided | `apps/web/lib/security-audit.ts` | Audit event recorded per decided call (called at route.ts:631) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Tool loop hits a call that needs approval and saves a checkpoint (messages, request, pending calls, event cursor) in state pending. | our servers | cloud-agent-run-service.ts:1416-1500 |
| The app shows the waiting card from stream events or from the persisted projection. | device | useChatStream.ts:1138; ApprovalInbox.tsx:66-75 |
| Person decides every pending call; the app posts the resume. | device and our servers | useChatStream.ts:5699-5730 |
| Server checks the 24 hour window, locks the row, checks decisions match exactly, sets resuming with a lease, sets the run running. | our servers | cloud-agent-run-service.ts:1930-1992 |
| Server applies connector permission denials, then resumes the turn on a durable workflow or inline fallback. | our servers | route.ts:520-600 |
| Model provider returns the next step; events stream back; checkpoint is completed. | outside service | route.ts:560-600; cloud-agent-run-service.ts:2000 |
| CLI path: modal waits up to 600 seconds, then the broker records Timeout. | device | tui_app.rs:1658-1666,8390 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval checkpoint row | table cloud_agent_approval_checkpoints in the account database, user isolated by row level security | Server only; apps read through the runs API | Deleted with the run (cascade) and by account erasure (apps/web/lib/server/account-erasure.ts); otherwise retention not read |
| Audit event tool_approval_decided | security audit log | Server only | unknown |
| Decision receipt on the card | Message metadata (cloudApproval projection) and tool entries in the chat store | Saved with the message for signed-in chats | Removed from metadata once answered (useChatStream.ts:1473-1475) |

**Models and providers.** The checkpoint freezes the request so the resumed turn uses the same chat request; the serving model is re-resolved and reported in X-AGI-Resolved-Model (route.ts:649-662). No model names are fixed here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud resume needs a signed-in account and owns the checkpoint by user id (cloud-agent-run-service.ts:1930-1940). CLI prompt needs none. |
| Permissions | Row level security and user-scoped queries; a connector set to deny overrides an approve (route.ts:520-535). |
| Subscription | The resume must pass managed compute, organization policy and workspace spend gates, so a run can be refused at resume time (route.ts:167-195). Free-tier requests are flagged (route.ts:157-161). |
| Limits and metering | One turn slot is held during resume (route.ts:700-704). Managed usage is reserved and settled around the resume (route.ts:482-510). Up to 32 pending calls per checkpoint (cloud-agent-run-service.ts:1432-1436). |
| Feature flags | AGI_DURABLE_INITIAL_TURNS kill switch changes transport only (route.ts:545-552 comment). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI local and VS Code local runtime use the 10 minute prompt and need no account (tui_app.rs:38). Mobile Local mode: no checkpoint or approval path was found for local-only turns. Own-key on Web: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Pending | Buttons shown; run state awaiting_input | cloud-agent-run-service.ts:1500 |
| Expired (server) | 410 and the action does not run | route.ts:145; cloud-agent-run-service.ts:1946 |
| Already answered elsewhere | 409; Tasks pages show 'Another device already answered this approval.' | route.ts:151; TasksPage.tsx:177 |
| Resume fails to start | Lease released, 503 'Agent continuation is temporarily unavailable.', approval stays answerable | route.ts:603-625 |
| Stuck resuming after a crash | Not handled in the code that was read; next answer gets 409 | cloud-agent-run-service.ts:1935-1960 |
| Superseded by a newer message | Card marked expired on Web and Mobile | useChatStream.ts:1085-1100; chatExecutionStore.ts:930 |
| Offline or failed send | Web and Mobile restore the buttons for a retry unless the status is 404, 409 or 410 | useChatStream.ts:5806-5812; chatExecutionStore.ts:4850-4880 |
| Cancel | Ctrl-C in the CLI stops the turn and the call does not run; VS Code has Abort turn | tui_app.rs:8350; webviewContent.ts:7036 |
| Accessibility | Mobile buttons carry labels naming the tool; CLI overlay lists keys in help | CloudToolApprovalControls.tsx:340; approval_overlay.rs:134 |
| Countdown timer display | not handled in the code | searched the card components above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/cloud-agent-run-service.test.ts`: Claim, lease length, release, hiding an approval past the claim window
- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Approve route, lease release on failure
- `apps/web/app/api/llm/v1/chat/completions/approve/route.degraded-transport.test.ts`: Inline fallback when the durable workflow is down
- `apps/web/lib/hooks/useChatStream.approval.test.tsx`: Resume flow, expired older approval, remote answer
- `apps/web/features/chat/components/approvals/ApprovalInbox.test.tsx`: Expired approvals stay visible without buttons (line 180)
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: Race and expiry messages (lines 117,132)
- `apps/web/lib/services/__tests__/cloud-agent-device-checkpoint.test.ts`: Device checkpoint
- `apps/mobile/__tests__/cloud-tool-approval-expired.test.ts`: Live and expired approval state, cold start rehydrate
- `apps/mobile/__tests__/cloud-tool-approval-real-result.test.ts`: Receipt after a decision
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: Cloud task approval and failure messages

**Test scenarios**

- **Late answer**
  1. Create a Cloud approval.
  2. In a test database set created_at older than 24 hours.
  3. Post the decision.
  - Expected: 410 with 'This approval request expired and can no longer be resumed.' and the tool does not run.
- **Two devices**
  1. Open the same run on Web and Mobile.
  2. Answer on Web, then answer on Mobile.
  - Expected: Second answer is refused with the already-answered message.
- **Denied receipt**
  1. Deny a shell tool on Web.
  - Expected: Tool shows denied; the model result says the user denied permission.
- **CLI timeout**
  1. Start a CLI tool approval and wait 10 minutes.
  - Expected: System line says it expired and did not run.
- **Stuck resume**
  1. Claim an approval, kill the server before completion, answer again after the lease.
  - Expected: Observe whether a 409 persists (suspected gap).
- **Device step expiry**
  1. Pause a run on a device step, wait 15 minutes, open the card.
  - Expected: 'This step waited too long' and no execution.

**Where to look when it fails**

- Messages: 'This approval request expired and can no longer be resumed.', 'This approval is already being resumed.', 'Pending approval not found.'
- Logs: 'Cloud agent approval lease could not be released'; 'Approval continuation could not be started on either transport' (route.ts:~125,613).
- Table cloud_agent_approval_checkpoints columns state, lease_token, lease_expires_at, created_at.
- Audit event tool_approval_decided.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Approval lease does not clearly recover on its own** Affects: All Cloud approval users after a server failure mid-resume. Evidence: cloud-agent-run-service.ts:1935,1957 versus 1853. Work needed: Reclaim resuming approvals past lease_expires_at or sweep them; add a test
- **Chat-card expiry is not tied to the 24 hour clock** Affects: Web, Desktop, Mobile. Evidence: useChatStream.ts:1138; chatExecutionStore.ts:791. Work needed: Use the checkpoint timestamp to mark cards expired
- **No time-remaining display** Affects: All apps. Evidence: none found in card components. Work needed: Show remaining time
- **Brief wording mixes device steps with approvals; Cloud Code uses 30 minutes and 409** Affects: Brief accuracy, CLI cloud Code users. Evidence: cloud-code-agent-service.ts:964; approvals/route.ts:42. Work needed: Correct brief; consider one expiry code
- **No end-to-end test of a 24 hour expiry through the route found** Affects: Verification. Evidence: route.test.ts has no 410 case (searched). Work needed: Add a route test

**Depends on**

- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- F059-07
- F059-09
- table:cloud_agent_approval_checkpoints
- api:POST /api/llm/v1/chat/completions/approve
- file:apps/web/lib/services/cloud-agent-run-service.ts

## Unknown

- Whether a job repairs approval checkpoints stuck in resuming.
- Retention period for resolved checkpoints and audit events.
- Chrome behaviour on 409 and 410 beyond a generic error.
- Whether Desktop device-step approvals (dispatcher) add their own timeout.
- Own-key and Local mode behaviour on Web and Mobile.
