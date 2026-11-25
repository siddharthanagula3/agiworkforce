---
id: "F060-06"
type: "feature"
title: "Answer questions and approvals"
aliases: ["Answer questions and approvals", "Clarifying questions", "clarify.v1 card", "ask_clarifying_questions", "Tool approval", "Waiting for your approval", "awaiting_input", "resume-input", "Send answers", "Approve / Deny"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S60.18", "S60.19"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "F060-04", "F060-05", "table:cloud_agent_approval_checkpoints", "api:POST /api/llm/v1/chat/completions/approve", "api:POST /api/llm/v1/chat/completions/resume-input", "api:POST /api/interactive-cards/respond"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-06 Answer questions and approvals

A Work run can stop to ask the person something or to get permission. Clarifying questions are a card whose answers go back as the next message. Tool approvals and connector input pause the run durably; the person approves or denies (or answers a form) and the run resumes. Many Cloud accounts default to auto-approve, so prompts may not appear.

Area: [60. Agentic work product](README.md). Requirement items: [S60.18](../../10-requirements/capabilities/060-agentic-work-product.md#s6018), [S60.19](../../10-requirements/capabilities/060-agentic-work-product.md#s6019).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers a clarify card when a request is ambiguous, pauses the run when a tool needs approval or a connector needs input, and resumes the run with the person's decision.

**Why it exists.** The agent should not guess on ambiguous goals or take risky actions without consent. (doc: docs/product/requirements.md:768-780 lists approval prompts for connector writes, shell, files, sending context to a provider and cloud spend.)

**Who uses it.** Work users on web, desktop, mobile, CLI (local agent approvals), VS Code and Chrome.

**Problems it solves**

- Wrong assumptions on vague goals.
- Unwanted writes, sends or purchases.
- A connector that needs a missing value.

**Use cases**

- The agent asks 'Which market?' with options and an 'Other' answer.
- Approve a file write the agent wants to do.
- Deny a send-email tool call and add guidance.
- Fill a connector form on mobile while away from the desk.

## 2. User experience

**Where to find it**

- Web and Desktop chat: clarify card with 'Send answers' (apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:204-209); tool approval card in the message (apps/web/features/chat/components/approvals/ToolApprovalCard.tsx, buttons labelled by TOOL_APPROVAL_ACTION_LABELS: Allow, Allow once, Allow for this chat, Always allow, Deny, Approve; packages/contracts/types/src/tool-approval-policy.ts:22-33).
- Web Tasks page: card titled 'Waiting for your approval' with 'Approve' and 'Deny' and a guidance box 'Add guidance to steer this run (optional)' (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:887-925); the 'Needs you' filter lists runs waiting (TasksPage.tsx:603).
- Mobile run detail sheet: 'Waiting for your approval' with 'Approve this task' and 'Deny this task'; connector input form with 'Send answer'; device wait 'Waiting for <device>' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:398-440; CloudRunInputForm.tsx:50). Mobile chat shows clarify cards (apps/mobile/src/features/chat/utils/clarifyCard.ts).
- Chrome: clarify card in the side panel (apps/extension/src/features/side-panel/interactiveCards.ts:424-450) and approvals through the free-trial client (freeTrialClient.ts handles x_tool_approval_request).
- VS Code: Cloud task detail quick pick actions 'Approve' and 'Reject' (cloudRunDetail.ts:156-168); local agent approval card in the chat webview (apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts).
- CLI: terminal approval overlay 'Tool Approval' with Yes, No, Allow Session, Always allow, Deny All, Allow All (apps/cli/src/tui/widgets/approval_overlay.rs:1-60); `agi code approvals`, `approve`, `reject` for Cloud Code sessions (apps/cli/src/lib.rs, Code subcommands).
- Approval policy: the composer approval-mode control in Work mode and Settings (ComposerPlusMenu.tsx:1904-1960).

**Before you start**

- A run that reached a tool needing approval or a clarify call.
- Approval policy not 'autonomous' for approvals to appear.

**Screens and controls**

- Clarify card: options, 'Other' text, skip, 'Send answers', dismiss.
- Approval card: Approve/Deny (Tasks, mobile), scope choices Allow once, Allow for this chat, Always allow (chat card), guidance text up to 4,000 characters.
- Policy choices: 'Ask before every action', 'Run read-only actions without asking', and an autonomous option labelled 'Skip' (tool-approval-policy.ts:44-60).

**Journey**

1. Agent hits a gated tool: server saves an approval checkpoint, shows the request and pauses (state awaiting_input).
2. The person opens the card in chat, Tasks, mobile or VS Code and taps Approve or Deny (optionally adds guidance).
3. Client calls the approve endpoint; the server claims the checkpoint, runs only approved calls, records denials, and continues.
4. Clarify: the card appears, the person answers, the answer is saved on the card and the client sends it as the next user turn.

**What the person sees and gets**

- Denied action answer: 'You declined the action, so I did not run it.' (tool-loop.ts:2210).
- Errors: 'Another device already answered this approval.' (409), 'This approval expired and the task can no longer continue from it.' (410) (TasksPage.tsx:175-183).
- Approval requested time: 'asked <time ago>' on the card (TasksPage.tsx:902-906).

**Settings**

- Account tool approval policy: ask_every_time, auto_approve_read_only, autonomous (contracts tool-approval-policy.ts:3-9). Default constant is ask_every_time; the stored default for cloud accounts is autonomous (tool-approval-policy.ts:11-13; apps/web/shared/types/toolApprovalPolicy.ts:29-30, 45-52). A workspace can forbid autonomous (tool-approval-policy.ts:80-95).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Approvals: when a policy requires it the loop saves a server-owned checkpoint before showing x_tool_approval_request, suspends, and resumes via POST /api/llm/v1/chat/completions/approve with run id and per-call decisions approved, approved-for-session, approved-always or rejected (tool-loop.ts header 24-36; packages/contracts/cloud-contracts/src/tool-approval-resume.ts:12-40; approve/route.ts:706).
- Approval expiry: a checkpoint older than 24 hours is no longer pending and returns 410; a second claimer gets 409; mismatched decisions 400 (cloud-agent-run-service.ts:457, 478-490; approve/route.ts:140-155).
- Workspace policy can forbid autonomous approvals and falls back to ask_every_time; read failure fails closed to ask (tool-approval-policy.ts:80-95; apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:35-60).
- Tasks page resolves approvals for the pending call set with optional guidance (TasksPage.tsx:470-500).
- Connector input (MCP input_required): the loop emits input-requested, enters awaiting_input and pauses; POST /resume-input answers (tool-loop.ts:5974-6022; resume-input/route.ts:563). Mobile shows a form; web Tasks page shows no input form (no pendingInput use found in packages/ui/unified-chat or apps/web/features).
- Clarify: tool ask_clarifying_questions offered on web, mobile and chrome surfaces when the client lists clarify.v1, research is off, tools are capable and the message warrants it; in Work mode the explicit-verb exclusion is skipped (request-processor.ts:1269-1297; clarify-tool-service.ts:49-62). The turn ends after the clarify call (tool-loop.ts:6658-6663, 7651-7655). The answer is POSTed to /api/interactive-cards/respond, saved on the message, and the client turns the settled card into the next user message (apps/web/app/api/interactive-cards/respond/route.ts:88-198; useChatStream.ts:1369-1395).
- Mobile run detail has Approve/Deny and the input form wired to the cloud runs client (CloudRunDetailSheet.tsx:398-440).
- VS Code lists Approve and Reject for a run's pending tool calls (cloudRunDetail.ts:156-168).
- CLI approvals are for the local agent (approval overlay), with an approval broker (apps/cli/src/tui/approval_broker.rs:22 per the brief).

**Incomplete**

- Clarify is not a server pause: it ends the turn. A different mechanism from approvals and from connector input; the brief and the first draft merged them.
- Clarify is offered only when the resolved surface is web, mobile or chrome (request-processor.ts:1279). The Electron desktop shell sends surface desktop when a device host is declared (useChatStream.ts:4546; host-headers.ts:38-54), so the clarify card is probably not offered on desktop. [inferred]; the brief says desktop done.
- The Tasks web page shows approvals but not connector input forms.
- Chrome approval handling was not traced end to end.

**Present but disconnected or switched off**

- For web cloud accounts the stored default policy is autonomous, so approval cards may never show unless the person picks a stricter policy. [inferred from toolApprovalPolicy.ts:29-30, 45-52]

**Not available**

- Clarify on VS Code and CLI Cloud Work (no Work there; brief marks VS Code missing).

## 4. Required behaviour

**Established requirements**

- The agent can pause a task to ask the user a clarifying question and continue with the answer. Brief: web, desktop, mobile, CLI, Chrome done; VS Code missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.18)
- When the agent needs permission for an action, the task pauses and the user can approve or deny it. Brief: all done except Chrome unverified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.19)
- Approval prompts are required for Local to BYOK/Cloud crossing, connector writes, new-domain browser actions, computer use, shell/network/file operations outside safe defaults, sending context to a provider, and Cloud spend. (source: doc: docs/product/requirements.md:768-780)
- An action a user cannot undo asks first and the question names the consequence. (source: doc: AGENTS.md section 9)
- Security behaviour fails closed. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With policy 'Ask before every action', a gated tool in a Work run produces an approval card and the run stops until a decision.
2. Approve runs only the approved calls; Deny leaves the call unrun and the agent answers that the action was declined.
3. A checkpoint older than 24 hours cannot be resumed (410).
4. Two devices answering the same approval: the second gets 409 and the UI says another device already answered.
5. A clarify card answer appears in the next turn as a user message; research mode never offers clarify.
6. Mobile shows 'Waiting for your approval' with Approve and Deny for a run needing approval.
7. A workspace that forbids autonomous approvals never runs with 'autonomous'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'clarify pauses the task and continues' is satisfied by turn end plus the next turn, not by a held run. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show connector input forms on the web Tasks page.
- [proposed] Offer clarify on the desktop surface or confirm it works.
- [proposed] Name the consequence in each approval card as AGENTS.md section 9 requires.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Resumes a run with approval decisions (POST at line 706; error mapping 140-155; spend gate 195). |
| endpoint | POST /api/llm/v1/chat/completions/resume-input | `apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts` | Resumes a run with connector input answers (POST at line 563). |
| endpoint | POST /api/llm/v1/chat/completions/runs/{runId}/resume | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts` | Resumes a paused (not approval) run; shares checkpoint plumbing (POST at line 426). |
| endpoint | POST /api/interactive-cards/respond | `apps/web/app/api/interactive-cards/respond/route.ts` | Stores a clarify answer on the message (lines 88-198). |
| service | clarify-tool-service | `apps/web/lib/services/clarify-tool-service.ts` | Tool definition, offer rules, option cleaning (lines 1-140). |
| service | applyClarifyCardCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers the clarify tool on web, mobile, chrome (lines 1269-1297). |
| service | Approval checkpoints and expiry | `apps/web/lib/services/cloud-agent-run-service.ts` | Claim, release, 24 h TTL, pending approval, input and device lookups (lines 450-530). |
| table | cloud_agent_approval_checkpoints | `apps/web/lib/services/cloud-agent-run-service.ts` | Checkpoint rows of kind approval, input, device (lines 478-530). |
| service | Approval policy loader | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Reads the account policy and applies the workspace rule (lines 35-60). |
| config | Tool approval policies and labels | `packages/contracts/types/src/tool-approval-policy.ts` | Policy values, defaults, action labels, workspace rule. |
| schema | ToolApprovalResumeRequestSchema | `packages/contracts/cloud-contracts/src/tool-approval-resume.ts` | Wire shape for decisions and guidance (lines 12-40). |
| service | Approval and input pause in the loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | input-requested, awaiting_input, checkpoints, denied-action answer (lines 2210, 5974-6022, 7768-7790). |
| component | ClarifyCard | `apps/web/features/chat/components/messages/cards/ClarifyCard.tsx` | Web clarify card. |
| hook | respondToInteractiveCard and settled card turn | `apps/web/lib/hooks/useChatStream.ts` | Posts the answer and rebuilds it as a user turn (lines 1369-1395, 5183-5260). |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Approval card in chat. |
| component | ComposerApprovalModeControl | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Chooses the account approval policy from the Work composer (lines 1904-1960). |
| component | TasksPage approvals | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | ApprovalCard with guidance and error messages (lines 175-183, 470-500, 887-925). |
| component | CloudRunDetailSheet and CloudRunInputForm | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile approve, deny and input answers (lines 398-440); form in CloudRunInputForm.tsx. |
| service | Cloud runs client resumeRun | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | Client for approve and resume-input paths, maps 409 and 410 to typed errors (lines 35-36, 403-430). |
| service | VS Code run detail actions | `apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts` | Approve and Reject items (lines 156-168). |
| component | CLI approval overlay | `apps/cli/src/tui/widgets/approval_overlay.rs` | Terminal approval choices for the local agent. |
| component | Chrome clarify card | `apps/extension/src/features/side-panel/interactiveCards.ts` | Renders and describes clarify answers (lines 342-450). |
| config | Approval checkpoint TTL | `apps/web/lib/services/cloud-agent-run-service.ts` | APPROVAL_CHECKPOINT_TTL_HOURS 24, DEVICE_CHECKPOINT_TTL_MINUTES 15 (lines 457, 515). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The loop meets a tool the policy gates; it saves an approval checkpoint (messages, pending calls) and emits x_tool_approval_request; the run state becomes awaiting_input. | our servers | tool-loop.ts header 24-36; cloud-agent-run-service.ts:478-490 |
| Client shows the card (chat, Tasks, mobile, VS Code) and the person decides, optionally adding guidance. | device | TasksPage.tsx:470-500; CloudRunDetailSheet.tsx:398-440 |
| Client posts run_id and decisions to /approve; the server runs auth, managed compute gate, organisation policy gate and the workspace spend gate, claims the checkpoint, restores the request and resumes the loop. | our servers | approve/route.ts:164-196, 706; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:403-430 |
| The loop executes only approved calls (re-running every guard), adds denial results for rejected calls, and continues; the provider is called again. | outside service | tool-loop.ts header 28-32 |
| Clarify: the model calls ask_clarifying_questions, the turn ends; the person answers; the answer is saved on the message and sent as the next user turn. | our servers | tool-loop.ts:6658-6663; respond/route.ts:88-198; useChatStream.ts:1369-1395 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval, input and device checkpoints (pending calls, input requests, request state) | table cloud_agent_approval_checkpoints | Yes, shown on every surface that lists the run | Pending only for 24 hours (approval, input) or 15 minutes (device); later retention: not traced |
| Clarify card state and answers | web_messages.metadata interactive cards | Yes with the message | With the conversation |
| Account approval policy | user_settings.settings under namespace tool-approvals | Yes | Until changed |

**Models and providers.** The model decides when to ask or call a gated tool. Model quality affects how well questions are phrased (clarify service filters delivery-style questions). Approvals do not depend on a provider; resumed turns use the same routed provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in owner of the run; approve and resume-input go through the auth gate. |
| Permissions | Policy: ask_every_time, auto_approve_read_only, autonomous; autonomous needs workspace permission (organizationPermitsAutonomousToolApprovals, tool-approval-policy.ts:80-95). |
| Subscription | Approvals have no plan gate found beyond Work. Free accounts cannot run Work, so no Work approvals. |
| Limits and metering | Spend gates run before resume (managed compute, organisation policy, workspace spend, approve/route.ts:164-196). Guidance up to 4,000 characters (tool-approval-resume.ts:32). A resume takes a turn slot. |
| Feature flags | Policy setting; clarify offer needs client capability clarify.v1 and a tools-capable model. |
| Model compatibility | Clarify needs tool-capable models; clarify questions are not offered when research is on (clarify-tool-service.ts:56-59). |
| Provider restrictions | None found in the code. |
| Local mode | Local agent approvals (desktop developer sessions, CLI, VS Code) are separate on-device flows and are not part of Cloud Work. Cloud Work approvals exist only in Cloud mode. A Local to own-key or Cloud move needs consent by project rule (doc: AGENTS.md section 6). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Approval expired (over 24 h) | 410; web says the approval expired and the task can no longer continue from it. | approve/route.ts:144-146; TasksPage.tsx:180-182 |
| Already answered elsewhere | 409; web says another device already answered. | approve/route.ts:150-151; TasksPage.tsx:177-179 |
| Decisions do not match pending calls | 400 'Approval decisions do not match the pending tool calls.' | approve/route.ts:141-143 |
| Policy unreadable | Falls back to ask_every_time (fail closed). | tool-approval-policy.ts:52-57 (server lib) |
| Workspace forbids autonomous | Stored 'autonomous' is treated as ask_every_time; option hidden. | packages/contracts/types/src/tool-approval-policy.ts:88-95; ComposerPlusMenu.tsx:1951-1958 |
| Scheduled run | Unattended runs never invite connector input; schedule approvals expire after 24 hours with a message. | tool-loop.ts:3892-3895; apps/web/lib/services/schedule-service.ts:79 |
| Clarify card not answerable | Respond returns 409 'no longer accepting a response' or when it changed in flight. | respond/route.ts:150-153, 184-186 |
| Clarify send fails | Toast and a submission error on the card. | useChatStream.ts:5252-5260 |
| Mobile form not showable | 'This question needs a form this device cannot show. Answer it on the web, or decline it here.' | CloudRunInputForm.tsx:68 |
| Accessibility | Mobile Approve/Deny have labels 'Approve this task' and 'Deny this task'; CLI overlay requires reading to the end of the detail before allowing; mobile announces send errors. | CloudRunDetailSheet.tsx:424-433; approval_overlay.rs:29-31; CloudRunInputForm.tsx:406-409 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/clarify-tool-service.test.ts`: Clarify service rules (contents not opened).
- `apps/web/features/chat/components/messages/InteractiveCardBlock.respond.test.tsx`: Card respond flow (contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Approve route (file exists; contents not opened); siblings route.degraded-transport.test.ts, route.serving-model.test.ts, route.web-search-gate.test.ts.
- `apps/web/app/api/llm/v1/chat/completions/resume-input/route.test.ts`: Resume-input route (contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.approval-policy.test.ts`: Approval policy in the loop (contents not opened).
- `apps/web/lib/hooks/useChatStream.approval.test.tsx`: Web approval handling (contents not opened).
- `packages/contracts/cloud-contracts/src/__tests__/tool-approval-resume.test.ts`: Resume wire schema.
- `packages/contracts/types/src/__tests__/tool-approval-policy.test.ts`: Policy contract.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetApproval.test.tsx`: Mobile approval in the detail sheet.
- `apps/mobile/src/features/tasks/__tests__/CloudRunInputForm.test.tsx`: Mobile input form.
- `apps/mobile/__tests__/cloud-tool-approval-expired.test.ts`: Mobile expired approval.
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: VS Code approval card.
- `apps/web/e2e/tool-approval-web-search.spec.ts`: End-to-end approval of web search (contents not opened; never claimed as run).
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx`: Tasks page with Work runs (contents not opened).

**Test scenarios**

- **Approve from Tasks**
  1. Set policy 'Ask before every action'.
  2. Start a Work run that needs a tool.
  3. Open Tasks, find the 'Waiting for your approval' card, tap Approve.
  - Expected: The run resumes and finishes the call; the card disappears.
- **Deny with guidance**
  1. Same as above; enter guidance; tap Deny.
  - Expected: Call not run; the agent answers that the action was declined and follows the guidance.
- **Expired approval**
  1. Leave an approval pending past 24 hours (or edit its created time in a test database).
  2. Try to approve.
  - Expected: 410 and the expiry message.
- **Double answer**
  1. Open the same pending approval on web and mobile; approve on one then the other.
  - Expected: The second shows 'Another device already answered this approval.'
- **Clarify on web and desktop**
  1. Send an ambiguous Work goal on web; answer the card.
  2. Repeat in the desktop app.
  - Expected: Web: card, answer becomes next turn. Desktop: check whether a card appears (code predicts none).
- **Connector input on mobile**
  1. Trigger a connector that asks for input.
  2. Open the run detail sheet and send an answer.
  - Expected: Run resumes via resume-input.
- **Default policy surprise**
  1. On a new cloud account run a Work task that writes a file and watch for prompts.
  - Expected: Record whether any prompt appears (stored default is autonomous).

**Where to look when it fails**

- Log 'Cloud agent approval lease could not be released' and 'Paused cloud agent run lease could not be released'.
- Log '[tool-approvals] account default policy unavailable; requiring approval'.
- HTTP 400, 404, 409, 410 codes from /approve.
- Tables cloud_agent_approval_checkpoints (state, checkpoint_kind) and cloud_agent_runs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- VS Code: [70-qa/test-plans/vscode/060-agentic-work-product.md](../../70-qa/test-plans/vscode/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Clarify is probably not offered on the desktop surface.** Affects: Desktop. Evidence: request-processor.ts:1279 allows web, mobile, chrome; host-headers.ts:38-54 sends desktop. Work needed: Add desktop to the offer list or confirm by running; update the brief.
- **Web Tasks page cannot answer connector input requests.** Affects: Web, desktop. Evidence: No pendingInput use in packages/ui/unified-chat or apps/web/features; mobile has CloudRunInputForm. Work needed: Add the form to the Tasks detail.
- **Approval prompts may never appear on cloud accounts whose stored default is autonomous.** Affects: New cloud accounts. Evidence: toolApprovalPolicy.ts:29-30, 45-52. Work needed: Product check against the approval-prompt requirement in docs/product/requirements.md:768-780.
- **Approval cards do not state the consequence as AGENTS.md section 9 requires; not verified.** Affects: All. Evidence: Card labels are generic (TasksPage.tsx:889-899). Work needed: Review card text.
- **VS Code has no clarify; Chrome approval and CLI Cloud approvals unverified.** Affects: VS Code, Chrome, CLI. Evidence: Brief; no clarify code in apps/extension-vscode/src found. Work needed: Trace and test.
- **The draft claim that clarify uses the paused-run resume route is wrong: that route is the pause resume.** Affects: Documentation. Evidence: runs/[runId]/resume/route.ts imports PausedRunResumeRequestSchema (line 11). Work needed: Use the three mechanisms in this page.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- F060-04
- F060-05
- table:cloud_agent_approval_checkpoints
- api:POST /api/llm/v1/chat/completions/approve
- api:POST /api/llm/v1/chat/completions/resume-input
- api:POST /api/interactive-cards/respond

## Unknown

- Whether the desktop surface actually receives clarify cards.
- How Chrome renders and sends tool approvals end to end.
- Retention of resolved approval checkpoints.
- Assertions inside most approval and clarify test files (names only).
- Whether CLI Cloud Code approvals share the same checkpoint table (the `agi code approvals` path was not traced).
- Whether approval cards state consequences as required.
