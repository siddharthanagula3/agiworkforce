---
id: "F059-07"
type: "feature"
title: "Edit or redirect a pending action"
aliases: ["Edit proposed action", "Ask for an alternative", "Guidance", "Approval note", "Review change", "Tell the agent what to do instead", "Add guidance to steer the run", "redirect (S59.22)", "edit (S59.21)"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.21", "S59.22"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F059-08", "file:packages/contracts/cloud-contracts/src/tool-approval-resume.ts", "api:POST /api/llm/v1/chat/completions/approve", "table:cloud_agent_approval_checkpoints"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-07 Edit or redirect a pending action

Lets a person change or steer a pending agent action instead of only allowing or denying it. Redirect (typed guidance sent with the decision) works on all six apps in different forms. Edit works only for file content in VS Code through the local CLI runtime. Editing a command, recipient or text is not built anywhere.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.21](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5921), [S59.22](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5922).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Redirect: the person types a note with Allow or Deny, and the agent receives it and continues with that guidance. Edit: before a file write or edit runs, the person changes the proposed file text and the edited version is written.

**Why it exists.** A plain Deny stops the agent without saying why. A note lets the person correct course without restarting. Edit lets the person fix a small mistake in a proposed file change without a second round trip. Brief items S59.21 and S59.22 define both.

**Who uses it.** Anyone approving agent tool calls: Cloud chat and Work users on Web, Desktop, Mobile and the Chrome extension, and developers in the CLI and VS Code.

**Problems it solves**

- Denying with no reason leaves the model guessing what to do next.
- Approving a nearly right file change forces a deny and a re-ask.
- Long-running Cloud runs would otherwise need a new message to redirect them.

**Use cases**

- On Mobile the person taps Add guidance, types 'use the staging address instead', and presses Deny; the agent continues with that.
- In the CLI the person presses Tab on No, types what to do instead, and presses Enter.
- In VS Code the person presses Review change, edits the proposed file in the diff, then presses Allow once and the edited text is written.
- On the Tasks page the person types guidance and presses Approve to steer a Cloud run.

## 2. User experience

**Where to find it**

- Web: Approvals button (ShieldCheck icon, label 'Approvals') in the chat header opens a popover with a guidance box per request (apps/web/features/chat/components/approvals/ApprovalInbox.tsx:116,237). The inline tool card has Allow and Deny only (packages/ui/unified-chat/src/components/ToolCallCard.tsx:419).
- Web and Desktop Tasks page (web page titled 'Work history', route /tasks; Desktop renders the same TasksPage): card 'Waiting for your approval' with a box 'Add guidance to steer this run (optional)' (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891,921; apps/web/app/tasks/page.tsx:16; apps/desktop/src/features/tasks/DesktopTasks.tsx:13).
- Mobile chat: approval card with an 'Add guidance' button that opens a box 'Tell the agent what to do instead' (apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:305,410).
- CLI TUI: Tool Approval overlay, Tab on Yes or No adds a note (apps/cli/src/tui/widgets/approval_overlay.rs:102,130).
- VS Code: chat approval card has a text box 'Or deny and tell AGI what to do instead, then press Enter' and a 'Review change' button for file changes (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7188,7240). Cloud tasks: Reject opens an input box 'Optional reason, Enter to reject without one, Escape to keep waiting' (apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:94).
- Chrome side panel: approval block under a tool step with a box 'Add guidance to steer the run (optional)' (apps/extension/src/features/side-panel/bubbles.ts:936; apps/extension/_locales/en/messages.json:1956).

**Before you start**

- A pending approval exists (the agent asked to run a tool that needs permission).
- Cloud paths need a signed-in account. CLI and VS Code local runtime need no account for the prompt itself.
- VS Code edit needs a local CLI runtime that advertises approvalEdits and a proposal that carries file content (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6734-6737).

**Screens and controls**

- Guidance text box, up to 4000 characters (packages/contracts/cloud-contracts/src/tool-approval-resume.ts:32).
- Web Approvals popover: Deny and Approve buttons (labels from TOOL_APPROVAL_ACTION_LABELS, packages/contracts/types/src/tool-approval-policy.ts:23); guidance goes with either one (ApprovalInbox.tsx:263).
- Mobile card: Allow once / Allow for this chat / Always allow, Deny, and Add guidance; text goes with any decision (CloudToolApprovalControls.tsx:145).
- CLI overlay buttons: Yes, No, Allow Session, Always allow, Deny All, Allow All; Tab opens the note only for Yes and No (approval_overlay.rs:130,377).
- VS Code card: Allow once, Allow for session, Deny, Abort turn, Review change (webviewContent.ts:7033,7188).
- Chrome block: Approve, Allow for this chat (not for high risk), Decline (bubbles.ts:1004,1011,1033).

**Journey**

1. 1. The agent asks to run a tool and pauses.
2. 2. The person opens the approval card (or the Approvals popover, Tasks page, notification, or CLI overlay).
3. 3. Redirect: the person types a note. Edit (VS Code only): the person presses Review change and edits the proposed file in a diff tab.
4. 4. The person presses Allow or Deny (CLI: Tab, type, Enter).
5. 5. The note or edited text is sent with the decision.
6. 6. The agent continues. With a note on a denied call it is told to follow what the user says next; the card shows the decision.

**What the person sees and gets**

- Cloud: the transcript shows a progress line 'Applied your guidance' with the text (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6669-6680).
- CLI: the tool output gets 'The user added a note when answering the approval prompt: <note>' (apps/cli/src/features/exec/tools/mod.rs:287-290).
- CLI or VS Code edit: the tool result says 'The user edited the change before approving it, so <path> now holds their version' (apps/cli/src/features/exec/tools/mod.rs:280).
- Mobile: card shows 'Decision saved: Allowed' or 'Denied' (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:396).

**Settings**

- Tool approval policy and connector permission levels decide whether an approval is raised at all (packages/contracts/types/src/tool-approval-policy.ts:9-13); no setting turns guidance on or off was found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud API accepts optional guidance (trimmed, 1 to 4000 characters) beside the decisions (packages/contracts/cloud-contracts/src/tool-approval-resume.ts:34-39) and passes it to the resumed turn (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:582).
- Server screens guidance for secrets: a block returns 400, a redaction replaces the text (route.ts:84,205-212 region; applySecretHandlingToTexts call before the claim).
- Model sees a denied-with-guidance result 'The user denied permission to run this tool, so it did not run. Follow what the user says next instead.' (tool-loop.ts:3168,6600) and the guidance as a user message after all tool results (tool-loop.ts:6669).
- Web: Approvals popover and Tasks page send guidance (ApprovalInbox.tsx:237,263; useChatStream.ts:5543,5724; TasksPage.tsx:470-480). Desktop shows the hosted web UI and the same TasksPage.
- Mobile chat sends per-call guidance joined with a blank line (apps/mobile/stores/chat/chatExecutionStore.ts:731-743,4383); unsent text survives list recycling (apps/mobile/__tests__/CloudToolApprovalReview.test.tsx:265).
- CLI TUI note on Yes or No is delivered to the model (approval_overlay.rs:130; apps/cli/src/tui/approval_broker.rs:365; apps/cli/src/agent/chat.rs:3254).
- VS Code local: deny text is sent as an approval note when the runtime offers approvalNotes, else as a new chat message (ChatStateManager.ts:1857,1876). VS Code cloud Reject reason is sent as guidance (cloudRunApproval.ts:94-110).
- Chrome: guidance from all pending cards is joined and sent with RESOLVE_CHAT_APPROVAL (apps/extension/src/side_panel.ts:5642-5662; apps/extension/src/background.ts:8960).
- Edit of file content: the CLI app-server includes proposed content for file write, edit and patch-like tools (apps/cli/src/features/exec/tools/file_ops/mod.rs:905,1227,1580), marks the request editable (crates/agiworkforce-protocol/src/developer_session.rs:1622), accepts editedContent only with an allow decision (apps/cli/src/app_server/developer_host.rs:5198-5207) and the tool writes the edited text (file_ops/mod.rs:995). VS Code opens a diff, reads back the edited text and sends it (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:90,142; ChatStateManager.ts:3440,3460).

**Incomplete**

- Edit covers file content only. No app can edit a command, a recipient, a URL or message text before approval (none found in ToolCallCard.tsx, CloudToolApprovalControls.tsx, bubbles.ts, approval_overlay.rs). The cloud resume request has no edit field (tool-approval-resume.ts:34-39).
- Web inline tool card has no guidance box; only the Approvals popover and Tasks page do (ToolCallCard.tsx:405-430; MessageBubble.tsx:965-975).
- Mobile Tasks detail sheet approves or denies with no guidance (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:417-440; apps/mobile/src/features/tasks/service.ts:64-72).
- VS Code local guidance box works on Deny only (webviewContent.ts:7248).
- CLI note limit in the TUI: not established (the 4000-character limit is in the app-server, apps/cli/src/platform/runtime/session.rs:416).

**Present but disconnected or switched off**

- CLI Remote Control approvals send proposed_content None, so a phone cannot edit (apps/cli/src/tui/remote_host.rs:316). The Rust GPUI client and ACP pass edited_content None (apps/desktop/gpui/src/ui/conversations.rs:564; apps/cli/src/app_server/acp.rs:965).
- apps/desktop/src is the internal Tauri build; the public Desktop shows the hosted web app (AGENTS.md section 5).

**Not available**

- Edit of any kind on Web, Desktop, Mobile and Chrome (no code found).
- Edit of non-file actions on every app.
- Brief S59.21 says edit is missing on all six apps; the code contradicts this for VS Code and the CLI app-server (file content only).

## 4. Required behaviour

**Established requirements**

- Redirect: instead of just denying, the user can tell the agent what to do instead and the agent continues with that guidance. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S59.22)
- Edit: before approving, the user can edit the proposed action (command, recipient or text) and run the edited version. (source: S59.21 in the same brief)
- Approval prompts must show the action, target, provider/tool, risk, scope and available choices. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. On Web, open Approvals, type a note, press Deny: the request body has guidance and the transcript shows 'Applied your guidance'.
2. On Mobile, tap Add guidance, type, press Allow once: the resume request carries the text; the card shows 'Decision saved: Allowed'.
3. In the CLI, Tab on No, type a note, Enter: the tool does not run and its output ends with the note line.
4. In VS Code, Review change, edit the proposed file, Allow once: the file on disk holds the edited text.
5. A note of 4001 characters is refused or cut at 4000 on each app.
6. A note holding a secret is blocked or redacted before the model sees it (Cloud).
7. Pressing Edit on a command approval (any app) is not offered, and no control claims otherwise.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Guidance should also be offered on the Web inline card and on the Mobile Tasks sheet so every approval surface behaves the same.
- [inferred] An edited approval should be shown to the model as edited, as the CLI already does.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an 'Edit' control for command, recipient and text arguments, with a typed edited-arguments field in the approve request and a re-check of risk on the edited value.
- [proposed] Update the brief rows S59.21 to partial for VS Code and CLI app-server.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ToolApprovalResumeRequestSchema | `packages/contracts/cloud-contracts/src/tool-approval-resume.ts` | Wire shape: run_id, tool_approvals, optional guidance up to 4000 characters, detached |
| endpoint | POST /api/llm/v1/chat/completions/approve | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Validates, screens guidance for secrets, claims the checkpoint, resumes the run with guidance |
| service | tool-loop resume branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Turns guidance into a denied-with-guidance tool result and a user message; emits 'Applied your guidance' |
| component | ApprovalInbox | `apps/web/features/chat/components/approvals/ApprovalInbox.tsx` | Web Approvals popover with guidance box, Deny and Approve |
| hook | useChatStream resolveToolApproval | `apps/web/lib/hooks/useChatStream.ts` | Collects decisions and guidance, posts the resume, restores controls on failure |
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Shared Tasks page (Web and Desktop) with approval card and guidance box |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Inline Allow and Deny card (no guidance box) |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile approval buttons and 'Tell the agent what to do instead' box |
| store | chatExecutionStore resolveToolApproval | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile pending-turn state, joins guidance, posts the resume |
| store | toolApprovalGuidanceDrafts | `apps/mobile/src/features/chat/utils/toolApprovalGuidanceDrafts.ts` | Keeps unsent mobile guidance across list recycling |
| component | ApprovalOverlayState | `apps/cli/src/tui/widgets/approval_overlay.rs` | CLI overlay; Tab note on Yes or No |
| service | ApprovalBroker | `apps/cli/src/tui/approval_broker.rs` | Carries decision plus note to the waiting tool; records the note |
| service | approval notes and edits | `apps/cli/src/features/exec/tools/mod.rs` | record_approval_note, with_approval_notes, record_approved_edit, edited_by_user_note |
| service | developer_host approval reply | `apps/cli/src/app_server/developer_host.rs` | Accepts note and editedContent over the app-server; capability approval_edits and approval_notes |
| schema | ApprovalResponseParams | `crates/agiworkforce-protocol/src/developer_session.rs` | Protocol: decision, note, edited_content; editable flag on approval requested |
| service | file_ops proposals | `apps/cli/src/features/exec/tools/file_ops/mod.rs` | Attaches proposed content and applies the edited text on write, edit and patch tools |
| service | proposedChangeReview | `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | Opens the diff tab, reads back the edited text |
| service | ChatStateManager approvals | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | respondToApproval, reviewApprovalChange, sends note or editedContent |
| component | approval card webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code card buttons, guidance input, Review change |
| service | cloudRunApproval | `apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts` | VS Code Cloud task approve and reject with reason as guidance |
| component | bubbles approval block | `apps/extension/src/features/side-panel/bubbles.ts` | Chrome approval block with guidance textarea |
| service | Chrome approval dispatch | `apps/extension/src/side_panel.ts` | Joins guidance drafts and sends RESOLVE_CHAT_APPROVAL |
| service | managedChatHandler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Forwards guidance to the managed resume |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types a note or edits file text and presses Allow or Deny in the app. | device | ApprovalInbox.tsx:263; CloudToolApprovalControls.tsx:145; approval_overlay.rs:355; ChatStateManager.ts:3440 |
| Cloud: the app posts run id, one decision per pending call and optional guidance to the approve endpoint. | device and our servers | useChatStream.ts:5724; route.ts:200 |
| Server checks managed compute, organization policy and spend limit, screens guidance for secrets, then claims the pending checkpoint. | our servers | route.ts:167-228 |
| Server resumes the same run; the tool loop builds the tool results and the guidance message and calls the model again. | our servers | route.ts:560-590; tool-loop.ts:6600,6669 |
| The model provider answers with the next step. | outside service | route.ts:560 (runCloudAgentTurn uses the resolved model) |
| CLI and VS Code local: the note or edited text goes to the local tool process and is appended to its result; nothing leaves the device for the prompt. | device | approval_broker.rs:365; developer_host.rs:6975-6984; file_ops/mod.rs:995 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Guidance text | Not stored as its own field. It is sent in the request, appended to the model messages and recorded as the 'Applied your guidance' progress event in the run journal | Cloud: yes, with the run events | Follows the run's retention; no separate rule found |
| Decision audit event tool_approval_decided | Security audit log | Server only | unknown (audit retention not read) |
| Edited file text (VS Code) | In-memory agi-proposed file system until the decision, then written to the workspace file | No | Review buffers are deleted when the review ends (proposedChangeReview.ts:142-150 region) |

**Models and providers.** The note reaches whichever model is serving the resumed turn; the code names no model for it. Resume re-runs request processing for the saved request (route.ts:243-252). Provider choice is owned by SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud paths need a signed-in account (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:~1070 auth gate). CLI TUI and VS Code local approvals need none. |
| Permissions | Only the user who owns the run can resume it (claim is scoped by user id, cloud-agent-run-service.ts:1908-1940). Connector permission 'deny' overrides an approve (route.ts:533). |
| Subscription | Resume passes the same managed-compute, organization-policy and spend-limit gates as a new turn (route.ts:167-195). No separate entitlement for guidance or edit was found. |
| Limits and metering | Guidance 4000 characters (tool-approval-resume.ts:32). Proposed content for edit up to 1,000,000 bytes (developer_host.rs:152). The resumed turn is metered like a managed turn (route.ts:508-530). |
| Feature flags | none found in the code for guidance. VS Code edit depends on runtime capability approvalEdits and approvalNotes (ChatStateManager.ts:1857,6737). |
| Model compatibility | none found in the code; guidance is plain text added to the messages. |
| Provider restrictions | none found in the code. |
| Local mode | CLI and VS Code local runtime: note and edit work on device with no account (approval_broker.rs:365). Mobile Local mode: no approval controls were found for local-only turns; the approval store requires a cloud sign-in (chatExecutionStore.ts:4366). Web and Chrome own-key behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Guidance contains a secret | Cloud returns 400 or redacts it before the resume | route.ts:84,205-212 region |
| Decisions do not match pending calls | 400 'Approval decisions do not match the pending tool calls.'; clients send one decision per pending call | route.ts:136-139; cloud-agent-run-service.ts:1964 |
| Approval expired or already answered | 410 or 409; web closes the card with the error, Mobile makes the card inactive | useChatStream.ts:5843; chatExecutionStore.ts:501 |
| VS Code runtime lacks approvalNotes | The text is sent as a new chat message after the deny | ChatStateManager.ts:1857,1876 |
| Notebook file has unsaved edits | VS Code turns the allow into a deny with a reason | ChatStateManager.ts:3423-3430 |
| Edited content sent with a deny | app-server refuses: 'Edited content is sent with an approval, not a denial' | developer_host.rs:5205 |
| Offline or send failure | Web and Mobile restore the approval controls; Chrome shows the error | useChatStream.ts:5560-5600; chatExecutionStore.ts:4846-4990 |
| Accessibility | Mobile box has an accessibility label and hint 'Sent to the agent with Allow or Deny'; Web box has an aria-label; CLI note has a visible 'Note with' line | CloudToolApprovalControls.tsx:309; ApprovalInbox.tsx:238; approval_overlay.rs:415 |
| Countdown or empty-guidance retry | not handled in the code | searched the files above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/tool-approval-resume.test.ts`: Resume request schema and guidance limit
- `apps/web/lib/hooks/useChatStream.approval.test.tsx`: Typed guidance sent with the resume (test at line 238)
- `apps/web/features/chat/components/approvals/ApprovalInbox.test.tsx`: Guidance sent with a decision (line 142)
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.approvals.test.tsx`: Tasks page guidance with the decision (line 149)
- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Approve route including steering guidance forwarded (line 532)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.resume.test.ts`: Resume wording for guidance
- `apps/mobile/__tests__/CloudToolApprovalReview.test.tsx`: Unsent guidance kept when the row is recycled (line 265)
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: VS Code approval card guidance field (line 407)
- `apps/extension-vscode/src/__tests__/cloudTasks.test.ts`: Rejection reason carried as guidance (line 353)
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: Capability race on an editable approval (line 4728); no end-to-end edited-text test found
- `apps/cli/src/tui/widgets/approval_overlay.rs`: Inline test 'a_note_goes_with_the_answer_it_was_written_for' (line 1266)

**Test scenarios**

- **Web redirect through Approvals popover**
  1. Sign in on Web, ask for a task that needs a tool approval.
  2. Open Approvals, type 'use the other folder', press Deny.
  - Expected: Resume request contains guidance; transcript shows 'Applied your guidance'; the agent continues with the other folder.
- **Mobile redirect**
  1. Trigger a Cloud approval on Mobile.
  2. Tap Add guidance, type text, press Allow once.
  - Expected: Card shows 'Decision saved: Allowed'; the agent output reflects the text.
- **CLI note**
  1. Run the CLI with a tool needing approval.
  2. Press Tab on No, type a note, press Enter.
  - Expected: Tool is skipped and the result ends with 'The user added a note when answering the approval prompt'.
- **VS Code edit before approving**
  1. Ask the local agent to write a file.
  2. Press Review change, change one line, press Allow once.
  - Expected: File on disk holds the edited line and the tool result says the user edited the change.
- **Edit of a command is not offered**
  1. Trigger a shell command approval on every app.
  - Expected: No edit control for the command text (confirms gap).
- **Secret in guidance**
  1. Type a fake API key pattern as guidance and deny on Web.
  - Expected: Request is blocked with 400 or the key is redacted.

**Where to look when it fails**

- Server: audit event tool_approval_decided and log 'Tool approval overridden: the resumed tool is blocked by the user permission store' (route.ts:533,631).
- Error text 'Approval decisions do not match the pending tool calls.' (400).
- VS Code: error 'Edited content is sent with an approval, not a denial' or 'This approval has no proposed content to edit' from the app-server.
- Table cloud_agent_approval_checkpoints for the pending row (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Edit of command, recipient or text is not built** Affects: All six apps. Evidence: No edit field in tool-approval-resume.ts:34-39; read-only args in ToolCallCard.tsx, CloudToolApprovalControls.tsx, bubbles.ts, approval_overlay.rs. Work needed: Design typed edit per tool kind, add to wire schema, re-run risk checks on edited value, build controls per app
- **Brief says edit is missing everywhere but file-content edit works in VS Code and CLI app-server** Affects: Brief accuracy; VS Code, CLI. Evidence: developer_host.rs:5198; ChatStateManager.ts:3440. Work needed: Correct the brief rows; add an end-to-end test
- **Guidance missing on Web inline card and Mobile Tasks sheet** Affects: Web, Desktop chat card, Mobile Tasks. Evidence: ToolCallCard.tsx:405-430; CloudRunDetailSheet.tsx:417-440. Work needed: Add the same box and pass guidance through
- **VS Code guidance only on Deny** Affects: VS Code. Evidence: webviewContent.ts:7248. Work needed: Allow a note with Allow once
- **No CLI TUI note length limit found** Affects: CLI. Evidence: approval_overlay.rs:367-376. Work needed: Cap at the shared 4000 limit

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F059-08
- file:packages/contracts/cloud-contracts/src/tool-approval-resume.ts
- api:POST /api/llm/v1/chat/completions/approve
- table:cloud_agent_approval_checkpoints

## Unknown

- Whether the CLI TUI limits note length.
- Whether Chrome and Web own-key (BYOK) modes raise approvals the same way.
- Retention of audit events and the run journal for guidance text.
- Whether any test sends editedContent end to end in VS Code.
- Whether Mobile Local mode offers any approval controls.
