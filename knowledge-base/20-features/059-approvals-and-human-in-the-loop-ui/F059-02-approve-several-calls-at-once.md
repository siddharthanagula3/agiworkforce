---
id: "F059-02"
type: "feature"
title: "Approve several calls at once"
aliases: ["Batch approval (S59.02)", "Approve all", "Deny all", "Allow All / Deny All (CLI)", "Pending approval for a run"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.02"]
depends_on: ["F059-01", "SYS-api-and-contracts", "SYS-sync-and-continuity", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "table:cloud_agent_approval_checkpoints"]
basis: "code inspection"
second_reader: "8 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-02 Approve several calls at once

A run can pause on several tool calls at once. The server only resumes when it gets one decision for every pending call, then resumes once. Tasks screens apply one Approve or Deny to all calls. The CLI has Allow All and Deny All for the rest of a turn.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.02](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5902).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person answer all pending calls of one run together so the run resumes a single time (apps/web/lib/services/cloud-agent-run-service.ts:1964-1972).

**Why it exists.** A model can ask for several tools in one step; asking one by one would need many resumes, and the server refuses a partial answer.

**Who uses it.** People managing background work on Web, Desktop, Mobile, VS Code and the CLI.

**Problems it solves**

- No half-answered step: the server rejects a decision set that does not match the pending set (cloud-agent-run-service.ts:1964).
- No repeated prompts for the rest of a CLI turn (apps/cli/src/tui/approval_broker.rs:325-326).

**Use cases**

- Tasks page: a run waits on three calls; the person presses Approve once.
- Mobile run detail: Reject all pending calls.
- CLI: press t (Allow All) to allow the rest of the turn except high-risk calls.
- VS Code: command 'Approve and continue' on a cloud task.

## 2. User experience

**Where to find it**

- Web, Desktop (hosted web app) and shared Tasks page: 'Waiting for your approval' card, buttons 'Approve' and 'Deny' (TasksPage.tsx:891-900).
- Mobile: Tasks screen run detail sheet with approve and reject, store action resolveApproval (apps/mobile/src/features/tasks/store.ts:311, apps/mobile/src/features/tasks/CloudTasksScreen.tsx:840).
- CLI: 'd Deny All' and 't Allow All' buttons (approval_overlay.rs:5-21, :95-118).
- VS Code: commands agi-workforce.approveCloudTask and agi-workforce.rejectCloudTask, confirmation 'Approve and continue' (apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:38-41).
- Web chat card: calls of one step are answered one by one on their cards; the request is sent when the last one is decided (useChatStream.ts:~5565-5585). Any call left undecided is sent as 'rejected' (useChatStream.ts:~5592).

**Before you start**

- A signed-in account with a paused cloud run.
- For CLI: an interactive terminal.

**Screens and controls**

- The list of calls with a short preview of each (argsPreview) (TasksPage.tsx:892-896).
- Optional guidance box 'Add guidance to steer this run (optional)' (TasksPage.tsx, after line 891).

**Journey**

1. 1. Open Tasks and filter to runs that need you.
2. 2. Read the list of pending calls.
3. 3. Press Approve or Deny; one decision is applied to every call (TasksPage.tsx:471-480).
4. 4. The list reloads; the run shows running or done.

**What the person sees and gets**

- The Approve button shows pending while sending (TasksPage.tsx:901).
- On a race: 'Another device already answered this approval.' (TasksPage.tsx:178).
- VS Code: 'your decision could not be sent, another device already answered this one' (cloudRunApproval.ts:30-32, :157).

**Settings**

- none specific; CLI Allow All respects the high-risk exception in code (approval_broker.rs:196).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server accepts 1 to 32 decisions and demands the exact pending set (cloud-agent-run-service.ts:1920-1972; packages/contracts/cloud-contracts/src/tool-approval-resume.ts:34).
- The Tasks page sends the same decision for every call in the run (TasksPage.tsx:476-480); Mobile does the same (apps/mobile/src/features/tasks/store.ts:326-332); VS Code does the same (cloudRunApproval.ts:22-26).
- Web and Mobile chat cards collect one decision per call and send the request once decisions.size equals calls.length (useChatStream.ts:~5565-5585; apps/mobile/stores/chat/chatExecutionStore.ts:4420). The send loop treats any undecided call as 'rejected' (useChatStream.ts:~5592).
- A saved Deny in the permission store overrides an approval in the batch (approve/route.ts:516-523).
- An approved call whose tool is no longer offered gets 'Tool X is not available and was not executed.' and the batch continues; rejected calls get the denied message (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6575-6600).
- CLI broker supports deny_all and allow_all for a turn (approval_broker.rs:325-326, :401, :437); Allow All excludes high-risk and some kinds (approval_broker.rs:196-215).
- CLI Deny All resolves requests as Cancel, not as a per-call denial, and it latches for the rest of the turn because the broker is per-turn and discarded at turn end (approval_broker.rs:429-445, 325).

**Incomplete**

- Tasks, Mobile and VS Code cannot mix decisions in one answer (all approve or all reject); mixed decisions are possible only on chat cards (TasksPage.tsx:476, useChatStream.ts:~5565-5585).
- Chrome: brief says unverified; per-call buttons exist (bubbles.ts:1004) but no batch control was found.

**Present but disconnected or switched off**

- none found

**Not available**

- Batch control in the Chrome side panel was not found.

## 4. Required behaviour

**Established requirements**

- The user can approve or deny several pending tool calls of a run in one action. (source: S59.02)
- All pending calls of one run are decided together and the run resumes once. (source: S59.02 (brief) and cloud-agent-run-service.ts:1964)
- The brief does not say what happens when one call in the batch fails; not verified. (source: S59.02)

**Acceptance criteria**

1. One Approve on Tasks resumes the run once with all calls approved.
2. One Deny marks every call rejected and the model gets the denied result for each.
3. A decision set missing a pending call is refused with 400.
4. A second device answering gets 409.
5. CLI Allow All does not auto-allow a high-risk call.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A mixed answer (allow some, deny others) should be possible on Tasks screens; the server allows it [inferred from schema in tool-approval-resume.ts:34].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Per-call checkboxes on the Tasks card.
- [proposed] Define and show what happens when an approved call fails.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | One request carries all decisions. |
| service | claimCloudAgentApprovalCheckpoint | `apps/web/lib/services/cloud-agent-run-service.ts` | Exact match of decision ids to pending ids (line 1964). |
| schema | ToolApprovalResumeRequestSchema | `packages/contracts/cloud-contracts/src/tool-approval-resume.ts` | tool_approvals array 1..max per step. |
| component | TasksPage handleApproval | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | One decision for all calls (line 471). |
| component | TasksBoard | `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx` | Board layout with onApprove and onDeny. |
| hook | useResolveToolApproval | `apps/web/lib/hooks/useChatStream.ts` | Waits until all calls are decided (hook declared at line 5494; gather and send at ~5565-5585; undecided calls sent as 'rejected' at ~5592). |
| store | cloud task store resolveApproval | `apps/mobile/src/features/tasks/store.ts` | Mobile batch answer (line 311). |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | Mobile Tasks list and detail (line 840). |
| service | cloudRunApproval | `apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts` | VS Code approve or reject all pending calls. |
| service | ApprovalBroker deny_all/allow_all | `apps/cli/src/tui/approval_broker.rs` | Turn-wide Allow All and Deny All (lines 325, 401, 437). |
| component | ApprovalChoice DenyAll/AllowAll | `apps/cli/src/tui/widgets/approval_overlay.rs` | d and t keys. |
| service | managed cloud runs client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | resumeRun used by Tasks surfaces (line 403). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Run pauses with several pending calls saved in one checkpoint. | our servers | tool-loop.ts:7867 |
| Client builds the decision list for all pending calls and posts it detached. | device | managed-cloud-agent-runs-client.ts:403-413 |
| Server claims the checkpoint only if the ids match exactly, then resumes once. | our servers | cloud-agent-run-service.ts:1964-1990 |
| CLI turn grant resolves the pending and future requests of that turn on the device. | device | approval_broker.rs:401-450 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending call list with arguments preview | cloud_agent_approval_checkpoints, projected into run.pendingApproval | Yes, read by any device through the runs API | Claimable only within APPROVAL_CHECKPOINT_TTL_HOURS; a later attempt returns 410 (cloud-agent-run-service.ts:1930-1945; approve/route.ts:142-144). Whether the row is deleted after expiry: unknown. |
| CLI turn grant flags | In memory in the broker | No | Dropped with the process |

**Models and providers.** The resumed step calls the same model; batch size does not change routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for Tasks surfaces. |
| Permissions | Run owner only (tenant-scoped claim). |
| Subscription | No batch-specific entitlement found; resume passes the same managed gates as F059-01 (approve/route.ts:167-197). |
| Limits and metering | At most 32 decisions per request (cloud-agent-run-service.ts:1920 region). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | Managed Cloud only for the HTTP batch; the CLI broker is local. |
| Local mode | CLI Allow All and Deny All work locally. Web, Desktop, Mobile Tasks are Cloud features; no Local batch was found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Partial decision set | 400 'Approval decisions do not match the pending tool calls.' | approve/route.ts:141 |
| Already resumed elsewhere | 409 | cloud-agent-run-service.ts:1957 |
| Expired | 410; the pending checkpoint is only claimable within APPROVAL_CHECKPOINT_TTL_HOURS. | approve/route.ts:142-144; cloud-agent-run-service.ts:1930-1945 |
| A call blocked after the question was asked | Its approval is flipped to rejected, the others proceed. | approve/route.ts:516-523 |
| An approved call's tool is no longer offered | Gets 'Tool X is not available and was not executed.' and the batch continues; rejected calls get the denied message. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6575-6600 |
| Chat card call left undecided when the request is sent | Sent as 'rejected'. | apps/web/lib/hooks/useChatStream.ts:~5592 (turn.decisions.get(...) ?? 'rejected') |
| CLI Deny All | Resolves requests as Cancel, not as a per-call denial, and latches for the rest of the turn; the broker is per-turn and discarded at turn end. | approval_broker.rs:429-445, 325 |
| An approved call fails when run | unknown; not read. | not established |
| Empty list | Tasks returns early; server requires at least one decision. | TasksPage.tsx:473, tool-approval-resume.ts:34 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: One decision for every pending call because the server rejects a partial answer; explicit rejection; reload after decision.
- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Forged decision sets are rejected.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetApproval.test.tsx`: Mobile detail sheet names each tool and lists parameters.
- `apps/cli/src/tui/approval_broker.rs`: Inline tests: deny_all resolves future requests and cancels the pending one (lines 668, 681).

**Test scenarios**

- **Approve three calls**
  1. Start a run that asks for three tools
  2. Open Tasks
  3. Press Approve
  - Expected: Run resumes once, all three execute, one audit row per call.
- **Partial body**
  1. Send POST approve with two of three ids
  - Expected: HTTP 400.
- **Deny all on phone**
  1. Open run detail on Mobile
  2. Reject
  - Expected: All calls rejected; model told.
- **CLI Allow All**
  1. Trigger two shell approvals in one turn
  2. Press t on the first
  - Expected: Second call runs without a prompt unless it is high risk.

**Where to look when it fails**

- HTTP codes 400/404/409/410 from approve route.
- Log 'Tool approval overridden: the resumed tool is blocked by the user permission store' (approve/route.ts, near line 530).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **No way to mix allow and deny from Tasks, Mobile or VS Code.** Affects: Tasks users on Web, Desktop, Mobile, VS Code. Evidence: TasksPage.tsx:476. Work needed: Per-call controls on the Tasks card.
- **Chrome batch status unverified; no batch control found.** Affects: Chrome users. Evidence: bubbles.ts:1004. Work needed: Verify and either add or mark n/a.
- **Behaviour when one approved call fails is not defined in the brief or confirmed in code.** Affects: All. Evidence: S59.02 'not verified'. Work needed: Read the runner and state the rule.

**Depends on**

- F059-01
- SYS-api-and-contracts
- SYS-sync-and-continuity
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- table:cloud_agent_approval_checkpoints

## Unknown

- Behaviour when one approved call fails.
- Whether Desktop (Electron) adds anything beyond the hosted web Tasks page.
- Brief citations TasksPage.tsx:728 and CloudTasksScreen.tsx:573 land on different code than approval; not traced.
- Chrome batch behaviour.

## Second reader's check

A second reader checked 11 statements of this page against the code: 8 correct, 2 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Web and Mobile chat gather per-call decisions and send once when all are decided (useChatStream.ts:5494; chatExecutionStore.ts:4358)" The code shows: The logic exists, but the cited lines are only the hook declaration (useChatStream.ts:5494) and the function header (apps/mobile/stores/chat/chatExecutionStore.ts:4358). The gather is at useChatStream.ts:~5565-5590 (return while decisions.size < calls.length, otherwise send) and mobile chatExecutionStore.ts:4420. A desktop copy of the store also exists. (useChatStream.ts:5564-5585; apps/mobile/stores/chat/chatExecutionStore.ts:4420). **Corrected:** Web and Mobile chat cards collect one decision per call and send the request once decisions.size equals calls.length (useChatStream.ts:~5565-5585; chatExecutionStore.ts:4420). The send loop treats any undecided call as 'rejected' (useChatStream.ts:~5592).
- **Partly wrong (section 3 / 8):** "A tool no longer available gets a 'not available and was not executed' result (tool-loop.ts:6580-6600)" The code shows: The file is apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts, not a bare tool-loop.ts. The message applies only to an approved call whose tool is not offered (:6576-6588). Rejected calls get the denied message. (lib/tool-loop.ts:6575-6600). **Corrected:** An approved call whose tool is no longer offered gets 'Tool X is not available and was not executed.' and the batch continues.

**Facts the page missed**

- Chat cards treat any call left undecided as 'rejected' when the request is finally sent (apps/web/lib/hooks/useChatStream.ts:~5592, turn.decisions.get(...) ?? 'rejected'). The page does not say this.
- Approvals expire: the pending checkpoint is only claimable within APPROVAL_CHECKPOINT_TTL_HOURS, and a later attempt returns 410 (cloud-agent-run-service.ts:1930-1945; approve/route.ts:142-144). Section 6 lists retention as unknown.
- CLI Deny All resolves requests as Cancel, not as a per-call denial. It also latches for the rest of the turn, because the broker is per-turn and discarded at turn end (approval_broker.rs:429-445, 325).
