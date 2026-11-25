---
id: "F059-01"
type: "feature"
title: "Approve or deny one action"
aliases: ["One-action approval (S59.01)", "Allow action (S59.19)", "Deny action (S59.20)", "Tool approval card", "Permission required prompt", "Approval overlay (CLI)", "tool approval resume"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.01", "S59.19", "S59.20"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-execution-boundaries", "F059-05", "F059-03", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "table:cloud_agent_approval_checkpoints"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-01 Approve or deny one action

When the agent wants to run a tool that needs a decision, the run pauses and shows a card. The person allows it, so it runs, or denies it, so it does not run and the model is told. On Managed Cloud the pause is a saved checkpoint that expires after 24 hours; local apps ask on the device.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.01](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5901), [S59.19](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5919), [S59.20](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5920).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Pauses a run at a tool call that needs a decision, shows the call, and carries the answer back: Allow runs that call and the run continues, Deny skips it and tells the model it was refused (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3163, :3168).

**Why it exists.** The product's rule is that no sensitive action happens without the user's approval (doc: docs/product/requirements.md section 9.7, 'Approvals').

**Who uses it.** Anyone using a tool-using chat, a Work run or a coding session on Web, Desktop, Mobile, CLI, VS Code or Chrome.

**Problems it solves**

- The agent cannot send, write or run something the person did not see.
- A denied call is not retried silently: the model gets a clear 'denied' result (tool-loop.ts:3163).
- A run that waits for a person is saved, so closing the tab does not lose it (apps/web/lib/services/cloud-agent-run-service.ts:1908).

**Use cases**

- Web chat: the agent wants to call a connected app; the person presses Allow once on the card.
- Mobile: the agent wants to run a connector tool; the person presses Deny and types what to do instead.
- CLI: a shell command needs approval; the person presses y or n in the overlay.
- VS Code: the editor is in the background; the person presses Allow once in the notification.

## 2. User experience

**Where to find it**

- Web, and Desktop (the public Desktop shows the hosted web app, per AGENTS.md section 5): a card inside the assistant message. Plain tool card buttons: 'Allow' and 'Deny' (packages/ui/unified-chat/src/components/ToolCallCard.tsx:419 via TOOL_APPROVAL_ACTION_LABELS). Reviewed connector tool card buttons: 'Allow once', 'Allow for this chat', 'Always allow', 'Deny' (packages/contracts/cloud-contracts/src/tool-approval-presentation.ts:25, apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:43).
- Web: 'Approvals (N pending)' button in the chat header opens an inbox with 'Approve' and 'Deny' per request (apps/web/features/chat/components/approvals/ApprovalInbox.tsx:156, :249, :264).
- Web, Desktop, Mobile Tasks list: 'Waiting for your approval' card with 'Approve' and 'Deny' (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891).
- Mobile chat: the tool row shows 'Allow once', 'Allow for this chat', 'Always allow' (when offered) and 'Deny' (apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:109).
- CLI: 'Tool Approval' overlay with buttons y Yes, n No, s Allow Session, a Always allow, d Deny All, t Allow All; Tab adds a note (apps/cli/src/tui/widgets/approval_overlay.rs:5-21, :51, :100).
- VS Code: an approval card in the chat with 'Approve once', 'Approve ... for session', 'Deny', 'Abort turn' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033); when the window is not focused a notification offers 'Allow once', 'Deny', 'Open chat' (apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:23, :31).
- Chrome side panel: buttons 'Approve', 'Allow for this chat', 'Decline' (apps/extension/src/features/side-panel/bubbles.ts:1004, :1019, :1033; text from apps/extension/_locales/en/messages.json).
- Desktop app device actions (files, shell, screen): a native dialog titled 'Permission required' with 'Deny', 'Allow this session', 'Always allow' (apps/desktop/electron/runtime/permissionManager.ts:373).

**Before you start**

- Cloud approvals need a signed-in account: the approve endpoint runs the auth gate (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:156-200) and Mobile refuses with a sign-in error when no cloud account is active (apps/mobile/stores/chat/chatExecutionStore.ts:4364-4370).
- A tool call that the gate decides must ask (see F059-05).

**Screens and controls**

- Card header with tool name, status, Allow/Deny buttons, the Request block (command, diff or JSON) and the stakes list (ToolCallCard.tsx:446, :461).
- Optional guidance text box: web inbox 'Add guidance to steer the run (optional)' (ApprovalInbox.tsx:237); Mobile 'Add guidance' then 'Tell the agent what to do instead' (CloudToolApprovalControls.tsx:305, :421); CLI Tab note (approval_overlay.rs:100); VS Code 'Or deny and tell AGI what to do instead, then press Enter' (webviewContent.ts, guidance input after line 7220).

**Journey**

1. 1. The agent calls a tool the gate says must ask; the server stops the loop, saves a checkpoint and sends an approval request (tool-loop.ts:7867).
2. 2. The card appears with the waiting state; the run is paused.
3. 3. The person reads the call, optionally types guidance.
4. 4. The person presses Allow or Deny. Web posts the decisions to POST /api/llm/v1/chat/completions/approve once every call of the step has a decision (apps/web/lib/hooks/useChatStream.ts:5494).
5. 5. The server claims the checkpoint, rechecks workspace and permission rules, and resumes the run (approve/route.ts:220, :560).
6. 6. The card shows the result: the call runs, or shows 'You denied this tool.' (useChatStream.ts:5601) / 'You denied permission to run this tool.' on Mobile (chatExecutionStore.ts:4439).

**What the person sees and gets**

- Waiting state: the card is open, tone warning, 'This tool requires approval before execution.' (ToolCallCard.tsx:409).
- Decided state: Mobile buttons show 'Allowed' or 'Denied' and are disabled (CloudToolApprovalControls.tsx:109-285); Chrome shows 'Approved · decision recorded' (apps/extension/_locales/en/messages.json:1137).
- Expired: 'This approval request expired or is no longer active.' with a 'Resend' button where regenerate exists (ToolCallCard.tsx:291, apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:362); CLI prints 'The approval for X expired after 10 minutes without an answer, so it did not run.' (apps/cli/src/tui/tui_app.rs:8396).
- Errors: 'Another device already answered this approval.' and 'This approval expired and the task can no longer continue from it.' on the Tasks page (TasksPage.tsx:175-183).

**Settings**

- Default policy that decides whether a call asks at all: see F059-05.
- Saved per-tool choices: see F059-03.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chat: pause, card, Allow/Deny, resume and denial message are connected end to end (ToolCallCard.tsx:419, useChatStream.ts:5494, approve/route.ts:560, tool-loop.ts:3163).
- Server resume claims a pending checkpoint under a lease, refuses a forged decision set (400), an expired one (410), a missing one (404) and one already being resumed (409) (approve/route.ts:140-153, cloud-agent-run-service.ts:1908-1965).
- On any failure after the claim the lease is released so the approval can be tried again (approve/route.ts:122-137, :241-616).
- A tool the person denied gets a fixed tool result telling the model it did not run; with guidance the text tells the model to follow the user's next words (tool-loop.ts:3163, :3168, :6596).
- A decision is written to the audit log as 'tool_approval_decided' (approve/route.ts:631).
- Mobile cloud chat resolves, patches the row to approved or rejected and continues the paused turn (chatExecutionStore.ts:4358-4450).
- CLI overlay returns Yes, No, Allow Session, Always allow, Deny All, Allow All and blocks an allow until the detail was scrolled to the end (approval_overlay.rs:17, :51).
- VS Code card and notification both answer the same pending request (webviewContent.ts:7033, sessionActivityAlert.ts:26-48).
- Chrome side panel Approve/Decline and the Allow for this chat button are built (bubbles.ts:1004-1033).
- Desktop (Electron) device prompt grants or denies a capability and records it (permissionManager.ts:334-407).

**Incomplete**

- Expiry is not one rule: the server keeps an approval 24 hours (cloud-agent-run-service.ts:457), the CLI waits 10 minutes (tui_app.rs:38), the web client treats a card as expired when its in-memory turn is gone or superseded (useChatStream.ts:1066-1075). Expiry is its own brief item S59.23; its feature id was not given, so it is described here only where it touches this feature.
- The VS Code notification appears only when the window is not focused (sessionActivityAlert.ts:31).

**Present but disconnected or switched off**

- Mobile Local mode: the approve route is Managed Cloud only (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts:21), and no Local-mode approval card was found in the Mobile files read [inferred].

**Not available**

- Editing the proposed action before approving (S59.21) is listed missing on all six apps in the brief.
- Chrome in the brief is 'done'; the Chrome card says 'This approval cannot be continued from the current Chrome session.' when it cannot resume (apps/extension/_locales/en/messages.json:1173).

## 4. Required behaviour

**Established requirements**

- A single tool call that needs approval can be approved or denied and the run continues accordingly. (source: S59.01)
- A pending action that is allowed then runs. (source: S59.19)
- A denied action does not run and the model is told it was denied. (source: S59.20)
- Approval prompts show the action, target, provider/tool, risk, scope and available choices. (source: doc: docs/product/requirements.md section 9.7)
- Approval and permission cards are part of the transcript experience; approval state is a typed durable event. (source: doc: docs/product/experience-contract.md sections 9 and 9.3)

**Acceptance criteria**

1. A call that must ask shows a card and the run does not continue until a decision.
2. Allow runs exactly that call; the result appears in the transcript.
3. Deny leaves the call unexecuted and the model receives the denied message.
4. An answer after the checkpoint expired is refused with 410 and the card shows expired.
5. Two devices answering the same approval: the second gets 409 and a plain message.
6. If the server cannot resume, an error is shown and the same approval can be answered again.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Deny and Allow should read the same on every card; today four wordings exist [inferred from the label lists above].
- Every decision on any app should reach one history; today only cloud approvals do [inferred from approve/route.ts:631].

**Proposed improvements** (suggestions, not requirements)

- [proposed] One shared approval label set across cards.
- [proposed] Show the remaining time before an approval expires.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared card: waiting, expired, Allow/Deny, stakes, request block. |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Web card for a reviewed connector call with scope buttons. |
| component | ApprovalInbox | `apps/web/features/chat/components/approvals/ApprovalInbox.tsx` | Header popover listing pending approvals with Approve/Deny. |
| hook | useResolveToolApproval | `apps/web/lib/hooks/useChatStream.ts` | Collects decisions, posts the resume request, streams the continuation (line 5494). |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Claims the checkpoint, rechecks policy, resumes the run (lines 156, 706). |
| service | claimCloudAgentApprovalCheckpoint / releaseCloudAgentApprovalCheckpoint | `apps/web/lib/services/cloud-agent-run-service.ts` | Lease on the saved approval (lines 1908, 2027). |
| service | tool loop approval pause and denial text | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Emits approval request, saves checkpoint, builds denied result (lines 3163, 7867). |
| schema | ToolApprovalResumeRequestSchema | `packages/contracts/cloud-contracts/src/tool-approval-resume.ts` | Wire shape: run_id, tool_approvals, guidance, detached (line 34). |
| service | managed cloud runs client resumeRun | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Used by Tasks, Mobile and VS Code to answer; maps 409 and 410 (lines 403-430). |
| component | TasksPage approval card | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Approve/Deny a paused run from the Tasks list (lines 471, 891). |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile controls for scope buttons, guidance, stakes. |
| store | chatExecutionStore.resolveToolApproval | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile decision handling and paused turn continuation (lines 4358, 4488). |
| component | ApprovalChoice overlay | `apps/cli/src/tui/widgets/approval_overlay.rs` | CLI choices and keys (line 51). |
| service | ApprovalBroker | `apps/cli/src/tui/approval_broker.rs` | Queues requests; ApprovalDecision enum (line 301). |
| service | run_tui_approval_modal | `apps/cli/src/tui/tui_app.rs` | Key loop and the 10 minute timeout (lines 38, 1651). |
| component | VS Code approval card | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Card buttons and guidance box (line 7033). |
| service | alertSessionActivity | `apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts` | Notification with Allow once and Deny. |
| component | Chrome approval bubble | `apps/extension/src/features/side-panel/bubbles.ts` | Approve, Allow for this chat, Decline (line 1004). |
| service | requestPermission | `apps/desktop/electron/runtime/permissionManager.ts` | Electron device prompt (line 334). |
| table | cloud_agent_approval_checkpoints | `apps/web/lib/services/cloud-agent-run-service.ts` | Pending, resuming and resolved approval rows (query at line 1927). |
| event | tool_approval_decided | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Audit event per decision (line 631). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Tool gate returns ask for a call; the loop saves a checkpoint and streams an approval request, then ends the stream. | our servers | tool-loop.ts:7867, tool-call-gate.ts:138 |
| The client shows the card and keeps decisions in memory until every call of the step is decided. | device | useChatStream.ts:5494 |
| Client posts decisions; server runs managed-compute, workspace-policy and spend gates, parses the body and blocks secrets in guidance. | our servers | approve/route.ts:167-216 |
| Server claims the pending checkpoint (24 hour window, exact decision set) and sets a lease. | our servers | cloud-agent-run-service.ts:1908-1990 |
| Server rebuilds the request, forces approved calls to rejected if the saved permission store now denies them, and resumes the loop. | our servers | approve/route.ts:516-560 |
| Approved tools run; denied tools get a fixed 'did not run' result; the stream continues to the client. | our servers | tool-loop.ts:6596 |
| CLI and Electron device prompts never leave the machine: answer is stored locally and the tool runs on the device. | device | permissionManager.ts:334-407, tui_app.rs:1651 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval checkpoint (messages, pending calls, lease) | table cloud_agent_approval_checkpoints | Server side; any signed-in device can answer (cloud-agent-run-service.ts:1957) | Valid 24 hours (line 457); further retention unknown |
| Decision audit record | security_audit_logs, event tool_approval_decided | Yes, read by /api/settings/approvals | unknown |
| Card state and pending turn | In-memory maps plus message metadata on Web and Mobile | Message metadata is saved for non-temporary chats (useChatStream.ts:5494 region) | Lost when superseded or expired |

**Models and providers.** The resumed turn calls the same model route as the first leg; the approval itself does not pick a model (approve/route.ts:560, checkpoint request replay). Local and own-key turns never reach this endpoint (connector-tool-session-grants.ts:21).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud approvals need a signed-in account (approve/route.ts:156). Electron device prompts and the CLI need no account to ask. |
| Permissions | Only the owner of the run can claim its checkpoint (tenant-scoped query, cloud-agent-run-service.ts:1927-1940). Workspace controls and context policy are rechecked on resume (approve/route.ts:245-266). |
| Subscription | No approval-specific plan entitlement found. Resume passes the managed-compute gate (with a free-trial flag), the organization policy gate and the spend limit gate (approve/route.ts:167-197). |
| Limits and metering | Decisions per request 1 to 32 (cloud-agent-run-service.ts:1920 region; schema in tool-approval-resume.ts:34); guidance up to 4000 characters (tool-approval-resume.ts:31). The resumed step marks managed usage as started (approve/route.ts, markManagedUsageProviderStarted call). |
| Feature flags | An AGI_DURABLE_INITIAL_TURNS kill switch is named in a comment; resume falls back to inline transport (approve/route.ts:545-558). |
| Model compatibility | none found in the code for the approval itself. |
| Provider restrictions | none found in the code. The approve route is Managed Cloud only (connector-tool-session-grants.ts:21). |
| Local mode | Mobile Local mode: no approval card found [inferred]. Desktop (Electron) device prompts and CLI approvals work with no network (permissionManager.ts, tui_app.rs). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Waiting | Card open, run paused, stream closed after approval event. | ToolCallCard.tsx:409, tool-loop.ts:7867 |
| Expired on server | 410 'This approval request expired and can no longer be resumed.'; clients map it to an expired message. | approve/route.ts:144, managed-cloud-agent-runs-client.ts:428 |
| Already answered elsewhere | 409; Tasks shows 'Another device already answered this approval.' | approve/route.ts:152, TasksPage.tsx:178 |
| Server cannot resume | 503 'Agent continuation is temporarily unavailable.'; lease released; web restores the approval buttons. | approve/route.ts:605-616, useChatStream.ts:5494 region (restoreApprovalControls) |
| Session expired while deciding | Web restores controls and shows 'Your session has expired. Please sign in again.' | useChatStream.ts:5494 region |
| Cancel / abort | If the request is aborted before send, controls are restored; CLI Esc means No; VS Code has Abort turn. | useChatStream.ts:5494 region, approval_overlay.rs:21, webviewContent.ts:7037 |
| Headless CLI | Without a terminal an unanswered approval is denied. | apps/cli/src/features/exec/tools/mod.rs:985 |
| Offline | not handled in the code I read for the card; a failed post restores the web controls. | useChatStream.ts:5494 region |
| Accessibility | Web inbox buttons have aria-labels; Mobile buttons have accessibilityLabel with the summary and selected state; VS Code first button is focused. | ApprovalInbox.tsx:249, CloudToolApprovalControls.tsx:109-285, webviewContent.ts:7290 region |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Checkpoint boundary: malformed body rejected before claim, forged decisions rejected, other users' runs not disclosed, claim released when processing refuses.
- `apps/web/lib/hooks/useChatStream.approval.test.tsx`: Card appears on suspend, allow and deny, resume request, guidance, consecutive approval boundaries.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: Tasks card shows the ask, one decision for all calls, explicit rejection, race with another device.
- `apps/web/features/chat/components/approvals/ApprovalInbox.test.tsx`: Inbox entries, legacy fallback, decisions through the resolver, typed guidance.
- `apps/mobile/__tests__/DeclinedApprovalResume.test.ts`: A declined tool request whose resumed turn ends without text.
- `apps/mobile/__tests__/cloud-tool-approval-expired.test.ts`: isApprovalTurnLive after suspend and after a cold start.
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: The VS Code card renders all four choices and question answers.
- `apps/cli/src/tui/widgets/approval_overlay.rs`: Inline Rust tests (42 test attributes) for the overlay; individual cases not read.
- `apps/desktop/electron/__tests__/permissionManager.test.ts`: Remote command refusal and listing or withdrawing decisions for the Electron prompts.
- `apps/web/e2e/tool-approval-web-search.spec.ts`: Browser spec for a gated web search; scenario text not read.

**Test scenarios**

- **Allow once on web**
  1. Set policy to Ask before every action
  2. Ask for a connected-app action
  3. Press Allow once
  - Expected: Tool runs, result shows, one 'tool_approval_decided' row with status approved appears in Approval history.
- **Deny and redirect**
  1. Trigger a call
  2. Type guidance
  3. Press Deny
  - Expected: Call not executed, card shows denied, the model follows the guidance.
- **Expired approval**
  1. Leave an approval pending
  2. Send the decision after 24 hours (or edit the row timestamp in a test database)
  - Expected: 410 and the card says it expired.
- **Two devices**
  1. Open the same run on web and phone
  2. Answer on phone
  3. Answer on web
  - Expected: Second answer gets 409 and 'Another device already answered this approval.'
- **Resume failure**
  1. Make the continuation fail (stop the workflow transport in a test)
  2. Press Allow
  - Expected: Error shown and the card can be answered again because the lease was released.

**Where to look when it fails**

- Log line 'Approval continuation could not be started on either transport' (approve/route.ts, near line 606).
- Log line 'Cloud agent approval lease could not be released' (approve/route.ts:130).
- Log 'Tool approval overridden: the resumed tool is blocked by the user permission store' (approve/route.ts, near line 530).
- Tables cloud_agent_approval_checkpoints, cloud_agent_runs; audit event tool_approval_decided.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Four label sets for the same decision (Allow, Approve, Allow once, Approve once).** Affects: All apps, tester and user clarity. Evidence: ToolCallCard.tsx:419, ApprovalInbox.tsx:264, tool-approval-presentation.ts:25, webviewContent.ts:7034. Work needed: Pick one wording per scope and use the shared label table.
- **Expiry differs: 24 hours server, 10 minutes CLI, in-memory on web.** Affects: Web, CLI users. Evidence: cloud-agent-run-service.ts:457, tui_app.rs:38. Work needed: Decide one product rule and show the time left.
- **Brief cites stale line numbers for several files (for example tui_app.rs:861 is unrelated).** Affects: Anyone tracing the brief. Evidence: tui_app.rs:850-900 is image attachment code. Work needed: Refresh the brief's code references.
- **Mobile has no Local-mode approval; Local policy is stored but no reader found.** Affects: Mobile Local users. Evidence: apps/mobile/src/features/settings/tool-approvals/toolApprovalPolicyOwner.ts:86, search of toolApprovalPolicy consumers. Work needed: Confirm whether Local tools exist; wire or remove the Local setting.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-execution-boundaries
- F059-05
- F059-03
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- table:cloud_agent_approval_checkpoints

## Unknown

- Retention of resolved checkpoints and audit rows.
- Whether the Desktop (Electron) and Chrome apps show the same denied text as web.
- Brief line references for tui_app.rs:861, ToolCallTimeline.tsx:307 and webviewContent.ts:4596 land on unrelated or different code; their intent was not confirmed.
- What happens when an approved tool then fails at run time (error text path not read).
