---
id: "F092-05"
type: "feature"
title: "Approvals and pauses"
aliases: ["Approval-policy evaluator", "Tool call gate", "resolveToolCallGate", "Lethal trifecta rule", "Approval checkpoint", "Approval-request store", "Approval-decision store", "Action-binding validator", "Human-input queue", "Tool approvals", "Connector permissions (allow, ask, deny)"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.13", "S92.14", "S92.15", "S92.16", "S92.27"]
depends_on: ["SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "F092-01", "F092-02", "F092-03", "F092-06", "surface:web", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "table:cloud_agent_approval_checkpoints"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-05 Approvals and pauses

For each tool call the server decides run, ask or refuse using a nine-row table: saved Deny first, saved Allow unless untrusted content plus private data plus an outbound path meet, then the account default. A call that needs a person pauses the run in a stored checkpoint; a decision from any device resumes it, only for the exact calls asked.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.13](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9213), [S92.14](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9214), [S92.15](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9215), [S92.16](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9216), [S92.27](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9227).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** resolveToolCallGate walks a frozen table of nine ranks and returns allow, ask or deny with a machine reason (apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68-160). Calls that must ask are saved with the messages and arguments in a checkpoint row and the stream ends; the approve endpoint claims the row and resumes the loop (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:200-230; apps/web/lib/services/cloud-agent-run-service.ts:1908-2000).

**Why it exists.** The assistant can act on real accounts. The person must control risky actions, and a prompt-injection that tries to send private data out must not run silently. D-2026-09-15-01 sets the default posture: read-only tools run without asking and writes, sends and similar keep asking (doc: docs/decisions/2026-09-15-founder-decisions.md:40-46).

**Who uses it.** Every hosted chat user whose model calls tools; workspace admins (autonomous approvals can be disabled for members); scheduled and unattended runs.

**Problems it solves**

- Risky or unknown tools cannot run without a decision (tool-metadata.ts:1070-1081).
- Private data cannot be sent out after untrusted content without asking, even if the tool was saved as 'allow' (tool-call-gate.ts:86-92).
- An approval answered on one device cannot be replayed or answered twice (cloud-agent-run-service.ts:1930-1995).
- Unattended runs do not hang on a question nobody can answer (tool-call-gate.ts:146-157).

**Use cases**

- Model wants to post a GitHub comment; a card asks Allow or Deny.
- User sets a connector tool to Always allow; later a page with hidden instructions makes the model call the same tool with data; the trifecta rule asks again.
- A scheduled agent hits a trifecta call and is denied, or pauses if the run can pause.
- User starts a task on the web, approves from a phone.

## 2. User experience

**Where to find it**

- Web chat: a tool card in the activity list shows buttons 'Allow', 'Allow for this chat' (not for high-risk) and 'Deny' (packages/ui/unified-chat/src/components/ToolCallCard.tsx:409-440; labels from packages/contracts/types/src/tool-approval-policy.ts:20-31).
- Web Settings, Capabilities: 'Tool approvals' with options 'Ask before every action', 'Run read-only actions without asking', 'Skip approvals' (apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx:98-125; tool-approval-policy.ts:50-78).
- Web Connectors: 'Tool Permissions' panel with per-tool Allow, Ask, Deny and a 'Recent calls' log (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:46,377).
- Mobile: Cloud tool approval controls with Allow and Deny wording and approval history (apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:309; apps/mobile/src/features/settings/tool-approvals/ApprovalHistory.tsx).
- Chrome extension: calls the hosted approval resume (apps/extension/src/features/cloud-bridge/managedChatHandler.ts:198-255).
- CLI: managed approvals module reads the same x_tool_approval_request events (apps/cli/src/models/managed_approvals.rs:7).
- Desktop public app: hosted web chat; internal Tauri build has tool_confirmation commands (apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs).
- VS Code: no approval code found in the files searched.

**Before you start**

- Signed-in account; a turn that offers a tool needing approval.
- For 'Skip approvals' the workspace must allow autonomous approvals (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:29-41).

**Screens and controls**

- Tool card: 'This tool requires approval before execution.' or the high-risk notice 'Private data from this chat could be sent outside AGI. Check where it goes before you allow it.' (ToolCallCard.tsx:404-408; tool-approval-policy.ts:34-35).
- Buttons Allow, Allow for this chat, Deny.
- Account default radio group 'Default approval for tool actions'.

**Journey**

1. The model calls a tool.
2. Server gates each call (F092-05 table); calls with bad arguments are dropped first (F092-02).
3. If any call must ask, approval events are sent and the run is saved in a checkpoint; the stream ends in a paused state.
4. The person sees cards with Allow and Deny.
5. The client posts decisions to /api/llm/v1/chat/completions/approve with the run id.
6. Server claims the checkpoint under a lease, checks that the decisions match exactly the pending calls, records an audit event per decision, and resumes the loop.
7. Approved calls run with the stored arguments; denied calls give the model a denial message; the run continues.

**What the person sees and gets**

- Events 'approval-requested' and 'approval-resolved' per call (tool-loop.ts:7822-7835,6551-6561).
- Errors: 400 'Approval decisions do not match the pending tool calls.', 410 'This approval request expired and can no longer be resumed.', 404 'Pending approval not found.', 409 'This approval is already being resumed.' (approve/route.ts:90-155).
- Audit event 'tool_approval_decided' per decision (approve/route.ts:629-642).

**Settings**

- Account default policy: ask_every_time, auto_approve_read_only, autonomous; an unset website account resolves to autonomous, unreadable settings to ask_every_time (packages/contracts/types/src/tool-approval-policy.ts:3-13; apps/web/shared/types/toolApprovalPolicy.ts:44-52; docs/security/security.md section 1.1).
- Per-tool saved levels allow, ask, deny; a critical tool cannot be saved as always allow (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:45-61).
- Workspace key allowAutonomousToolApprovals (tool-approval-policy.ts:84).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nine-rank gate: 1 saved deny; 2 device step with a device host allowed; 3 saved allow with trifecta escalates; 4 saved allow; 5 saved ask; 6 manual mode with a policy auto-approved tool allows; 7 manual mode asks; 8 trifecta escalates; 9 otherwise allow (tool-call-gate.ts:68-128; doc: docs/security/security.md section 1.1).
- Trifecta is true when untrusted content is in context or arrives in the same batch, a sensitive source is reachable, and the tool creates an egress path; an undeclared tool counts as egress (tool-call-gate.ts:130-136; tool-metadata.ts:876-882).
- Escalate means ask when attended; deny when unattended unless the run can pause and the caller allows it (tool-call-gate.ts:146-157; tool-loop.ts:3841-3846).
- In 'auto' approval mode the account policy is not consulted (rank 6 needs manual mode) but a saved deny and the trifecta still apply (tool-call-gate.ts:68-128). The mode is manual when any MCP or connector tool is offered or any tool is not auto-approved by the policy (tool-loop-routing.ts:144-151).
- Policy auto-approval: under auto_approve_read_only only declared, read, reversible, no-egress tools run unasked, plus flagged web search, fetch and sandbox code; autonomous allows all non-destructive tools; ask_every_time allows none; device steps and browser commands never auto-approve (tool-metadata.ts:1083-1100).
- Checkpoint save validates the pending calls (1 to 32), event cursor continuity and a complete approval boundary, or throws (cloud-agent-run-service.ts:1416-1470).
- Claim: only a pending checkpoint younger than 24 hours; decisions must name exactly the pending call ids; the row moves to 'resuming' under a lease token; a second answer gets a conflict 'already answered on another device' (cloud-agent-run-service.ts:1908-2000). The approve route passes a 86,400 second lease (approve/route.ts:227).
- Resumed approved calls use the stored pending call arguments and are still blocked if the tool has since been denied (tool-loop.ts:6563-6590).
- Migration 0062 table with states pending, resuming, resolved, failed, one active row per run, row-level security (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql:8-60).
- Input and device checkpoints reuse the same table with checkpoint_kind (apps/web/db/neon/0148_mrtr_input_checkpoint.sql:19-20; cloud-agent-run-service.ts:2090-2700).

**Incomplete**

- There is no separate per-call decision table; per-call outcomes are kept as the 'approval-resolved' event in the run journal and the audit event 'tool_approval_decided', while the checkpoint row holds only the run-level state (0062_cloud_agent_approval_checkpoints.sql:22-24; approve/route.ts:629-642).
- Which unattended callers set unattendedEscalationPauses: the scheduled executor builds a tool plan with the approval policy (apps/web/lib/services/scheduled-agent-executor.ts:222-300), but whether it can pause was not confirmed.
- Voice tools use their own table with a 'requiresApproval' flag and the same policy (apps/web/lib/voice/live-voice-tools.ts:215-240); equivalence with the gate not verified.

**Present but disconnected or switched off**

- Autonomous policy is ignored when the workspace forbids it (tool-approval-policy.ts:29-41,86-96).

**Not available**

- VS Code approval UI: none found.
- A reject-with-reason beyond optional 'guidance' text: guidance exists but its UI was not opened (approve/route.ts:236-250).

## 4. Required behaviour

**Established requirements**

- A policy evaluator decides allow, ask or deny for every tool call from the account policy, saved per-tool levels and the lethal-trifecta rule, on every path that runs tools. (source: Brief S92.13)
- Pending approval requests are persisted with the exact calls, messages and request so any device can answer them later. (source: Brief S92.14)
- Each approval decision is recorded per call with outcome and the checkpoint is resolved exactly once. (source: Brief S92.15)
- A decision applies only to the exact pending calls; mismatched or stale decisions are refused and resumed calls use stored arguments. (source: Brief S92.16)
- Requests for human input queue durably and the run resumes when answered. (source: Brief S92.27)
- In the default read-only mode, sandboxed code, web search, page fetch and other non-mutating tools run without asking; external writes, purchases, messages, destructive actions, credential changes and consequential commands on the user's machine keep asking. (source: doc: docs/decisions/2026-09-15-founder-decisions.md:40-46)
- Approval prompts are required for connector writes, shell and file operations outside safe defaults, and must show action, target, provider/tool, risk, scope and choices. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. A saved Deny blocks the call under every policy and the result says it is blocked.
2. A saved Allow runs unasked unless untrusted content, a reachable private source and an egress tool all hold; then it asks.
3. Under 'Run read-only actions without asking', web search and a read tool run unasked; a write tool asks.
4. An unattended run refuses a trifecta call, or pauses if it can checkpoint.
5. Approving on a second device after the first answered returns a conflict.
6. Sending decisions that miss or add a call id returns 400 and runs nothing.
7. A checkpoint older than 24 hours returns 410.
8. A resumed approved call runs with the arguments saved at pause.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Approval mode 'auto' is used when the turn offers only tools the policy auto-approves; combined with rank 9, those run unasked [inferred from tool-loop-routing.ts:144-151].
- The 'allow once' and 'always allow' choices go through the scoped-approval planner (approve/route.ts:236-250,340-470) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-call decision table or explicit journal query so 'recorded per call' is one lookup.
- [proposed] Show the person which rule row asked (reason code) on the card.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveToolCallGate / TOOL_CALL_GATE_RANKS | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Nine-row decision table and trifecta test |
| service | policyAutoApprovesTool | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Which tools run unasked under each account policy (line 1083) |
| service | loadToolApprovalPolicy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Reads account default and applies the workspace autonomy rule |
| service | connector tool permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saved allow, ask, deny levels, lockdown, workspace rules |
| service | conversation grants | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts` | Allow for this chat grants |
| service | gateForToolCall and pause | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Applies the gate (line 4140), builds approval events and checkpoint (7485-7890) |
| service | saveCloudAgentApprovalCheckpoint | `apps/web/lib/services/cloud-agent-run-service.ts` | Validates and stores the pending approval (line 1416) |
| service | claimCloudAgentApprovalCheckpoint | `apps/web/lib/services/cloud-agent-run-service.ts` | Exact-match claim with lease (line 1908); complete (2000) and release (2027) |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Receives decisions, claims, audits and resumes the loop |
| endpoint | resume-input route | `apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts` | Answers connector input requests |
| table | cloud_agent_approval_checkpoints | `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql` | Pending approvals with messages, calls, state, lease |
| schema | checkpoint_kind column | `apps/web/db/neon/0148_mrtr_input_checkpoint.sql` | Separates approval and input checkpoints |
| service | approval-checkpoint-request | `apps/web/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.ts` | Private keys kept in the saved request |
| config | approval policy contract | `packages/contracts/types/src/tool-approval-policy.ts` | Policy names, labels and option text |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Allow, Allow for this chat, Deny buttons |
| component | MessageBubble approval wiring | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Connects buttons to the resolver (lines 965-975) |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends tool_approvals to the approve endpoint (line 5729) |
| component | ToolApprovalDefaultsPanel | `apps/web/features/settings/components/ToolApprovalDefaultsPanel.tsx` | Account default setting |
| component | ToolPermissionsPanel | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool permission levels |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile approval controls |
| service | managed approvals (CLI) | `apps/cli/src/models/managed_approvals.rs` | CLI handling of approval events |
| service | managed chat approval (Chrome) | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Chrome extension resume call |
| config | approval resume path | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | TOOL_APPROVAL_RESUME_PATH constant (line 35) |
| service | scheduled agent executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Unattended tool plan with approval policy |
| test | tool-call-gate test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts` | Gate table (by file name) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server loads the account policy and per-tool levels for the turn. | our servers | tool-approval-policy.ts:84-122 |
| Each call is run through the gate with the turn context (mode, policy, unattended, device host, untrusted content, sensitive source). | our servers | tool-loop.ts:4140-4160; tool-call-gate.ts:138-160 |
| Deny: refusal result. Allow: run. Ask: events and checkpoint saved, stream ends paused. | our servers | tool-loop.ts:7485-7520,7822-7890 |
| The person's device shows cards; decisions are posted to the approve endpoint. | device | apps/web/lib/hooks/useChatStream.ts:5729; ToolCallCard.tsx:409-440 |
| Server validates the request, claims the checkpoint under a lease, writes audit events, rebuilds the request from stored messages and resumes the loop. | our servers | approve/route.ts:200-260,620-660 |
| Approved calls run; denied calls give the model a denial message; the loop continues with the model provider. | our servers | tool-loop.ts:6551-6620 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval checkpoint (request, messages, pending calls, state, lease) | table cloud_agent_approval_checkpoints with row-level security | Yes, any signed-in device of the same user can answer | Claimable for 24 hours; rows cascade with the run; further retention unknown |
| Decision audit events 'tool_approval_decided' | Security audit log (recordAuditEvent) | Server side | unknown |
| Saved per-tool levels | Connector tool permission storage (table not opened) | Per account | Until the user changes them |

**Models and providers.** The gate is model-neutral. Model route is restored from the saved request on resume (approval-checkpoint-request.ts:20-60).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the approve endpoint authenticates the user and uses a user-scoped database (approve/route.ts:160-215). |
| Permissions | Workspace rules can block tools or forbid autonomous approvals; saved Deny always wins (tool-call-gate.ts:69-74; tool-approval-policy.ts:29-41). |
| Subscription | The approve route runs the managed compute, organization policy and spend limit gates before resuming (approve/route.ts:160-195). |
| Limits and metering | 1 to 32 pending calls per checkpoint; 24 hour claim window; lease default clamp 60 to 86,400 s (cloud-agent-run-service.ts:457-461; 0062 migration check). |
| Feature flags | unattendedEscalationPauses option on the loop (tool-loop.ts:3841-3846). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | This gate runs on our servers in Cloud mode. The internal Tauri build has its own local tool confirmation with a never-remember list (apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:25-30); the CLI has its own approval broker (apps/cli/src/tui/approval_broker.rs referenced from managed_approvals.rs:5). Their equivalence with this gate was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Pending | Card shows Allow, Allow for this chat, Deny until answered | ToolCallCard.tsx:409-440 |
| Expired | Buttons hidden when the turn expired; server returns 410 after 24 hours | ToolCallCard.tsx:289; approve/route.ts:145 |
| Answered elsewhere | 409 'already answered on another device' | cloud-agent-run-service.ts:1943-1951 |
| Mismatched decisions | 400; nothing runs | cloud-agent-run-service.ts:1964-1968; approve/route.ts:96-98 |
| Tool denied after pause | Approved call is refused with 'blocked by this account's connector permissions' | tool-loop.ts:6563-6577,4120-4125 |
| Unattended with trifecta | Denied (or paused if allowed) | tool-call-gate.ts:146-157 |
| Broken checkpoint (events do not line up) | Saving throws 'events do not match the durable event cursor' or 'do not form a complete approval boundary' | cloud-agent-run-service.ts:1436-1465 |
| Retry after failure | Lease can be released so the decision can be retried | approve/route.ts:100-115 |
| Accessibility | Settings radio group has aria-label; tool card buttons are text buttons; screen reader behaviour of the card not examined | ToolApprovalDefaultsPanel.tsx:125 |
| Offline | Not handled in the code read; the run stays pending in the checkpoint | 0062_cloud_agent_approval_checkpoints.sql:8-60 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Gate table (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.approval-policy.test.ts`: Approval policy in the loop (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.permission-matrix.test.ts`: Permission matrix (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.resume.test.ts`: Resume (by file name)
- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Approve endpoint (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.test.ts`: Checkpoint request handling (by file name)
- `apps/web/lib/services/cloud-agent-run-service.test.ts`: Run service (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/documented-approval-posture.test.ts`: Document and code agree on approval posture (by file name)
- apps/web/features/chat/components/messages/__tests__/MessageList.toolApproval.test.tsx (not found) (not found): Approval UI in the message list (by file name)

**Test scenarios**

- **Saved deny**
  1. Set a connector tool to Deny.
  2. Ask the model to use it.
  - Expected: Tool not run; result says it is blocked by connector permissions.
- **Read-only default**
  1. Set 'Run read-only actions without asking'.
  2. Ask for a web search then a file write.
  - Expected: Search runs unasked; write shows Allow and Deny.
- **Cross-device approval**
  1. Start a task on web that needs approval.
  2. Open the run on a second device and Allow.
  3. Try to answer again on the first device.
  - Expected: Run resumes once; the second answer gets 409.
- **Trifecta**
  1. Save a tool as Always allow.
  2. Load an untrusted page, then ask the model to send private data with that tool.
  - Expected: Approval is requested with the high-risk notice despite the saved Allow.
- **Stale decision**
  1. Send decisions that omit one pending call id.
  - Expected: 400 and nothing runs.
- **Expired checkpoint**
  1. Wait over 24 hours then answer.
  - Expected: 410 'expired'.

**Where to look when it fails**

- Log '[tool-loop] lethal-trifecta escalation ... requiring approval' (tool-loop.ts:7798).
- Log '[tool-loop] approval rejected: tool is blocked by the user permission store' (tool-loop.ts:6566).
- Error codes tool_approval_invalid, tool_approval_scope_refused (approve/route.ts).
- Table cloud_agent_approval_checkpoints state column.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Per-call decision record is an event and an audit row, not a table; the brief implies a decision store.** Affects: Auditors and testers. Evidence: 0062 migration table has run-level state only (lines 8-24); approve/route.ts:629-642. Work needed: Confirm it meets 'recorded per call' or add a store.
- **Brief line numbers 2578, 1605, 3731, 4494 for the evaluator and decisions do not match the files; the gate lives in tool-call-gate.ts.** Affects: Documentation. Evidence: audit briefs S92.13 to S92.16. Work needed: Refresh the brief.
- **Apps differ: Desktop Tauri, CLI and mobile have their own approval UIs and local confirmation rules.** Affects: Desktop, CLI, mobile. Evidence: tool_confirmation.rs, managed_approvals.rs, CloudToolApprovalControls.tsx. Work needed: Run per-app approval tests against the hosted gate table.
- **Documented posture says website accounts default to autonomous approvals; the shared default is ask_every_time, so different surfaces can behave differently.** Affects: New accounts across apps. Evidence: packages/contracts/types/src/tool-approval-policy.ts:11-13; docs/security/security.md section 1.1. Work needed: Test each app against the account default.

**Depends on**

- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- F092-01
- F092-02
- F092-03
- F092-06
- surface:web
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- table:cloud_agent_approval_checkpoints

## Unknown

- Whether the scheduled executor can pause on a trifecta call.
- Exact approve and deny wording on mobile and the extension.
- Retention of the audit log and of resolved checkpoint rows.
- Whether Own key and Local modes use any of this gate.
- Contents of the approval tests.
