---
id: "F019-03"
type: "feature"
title: "Pauses that need you: approval, input and device"
aliases: ["Waiting for approval", "Needs approval", "Approval needed", "Waiting for user input", "Waiting for your input", "AGI asks", "Required device unavailable", "Waiting for your desktop"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.07", "S19.08", "S19.24"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-sync-and-continuity", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-03 Pauses that need you: approval, input and device

When a step needs the person's approval, an answer, or an offline device, the turn pauses and says so. Web, mobile and Chrome show Needs approval or input labels and cards; CLI and VS Code have approval modals and cards; device waits show on web, mobile and Chrome.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.07](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1907), [S19.08](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1908), [S19.24](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1924).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Pauses a running turn at a step that needs a human decision or a missing device, and shows exactly what is being asked with the controls to answer.

**Why it exists.** Risky tools must not run unseen; the assistant also sometimes needs facts only the person has, and some steps run on the person's own desktop.

**Who uses it.** Anyone running agent steps: file writes, shell commands, connector actions, desktop steps.

**Problems it solves**

- No tool with side effects runs without a visible decision.
- A paused turn does not look frozen: the summary and the screen reader both say it is waiting.
- An offline desktop shows a clear wait with a cancel option instead of a silent hang.

**Use cases**

- Approve a file write the assistant proposes.
- Answer a clarifying question asked mid-task through a card or form.
- See 'Waiting for your desktop' when a desktop step has no online device.
- Deny a tool with guidance (VS Code, Chrome).

## 2. User experience

**Where to find it**

- Web and Desktop: the tool step card in the activity timeline (ToolCallCard) and interactive cards in the message.
- Mobile: approval controls in the activity timeline and a notice under the bubble.
- CLI: a modal over the transcript for approvals and questions.
- VS Code: an inline card titled 'Approval needed' or 'AGI asks'.
- Chrome: step rows with Approve and Decline, and a connector input form.

**Before you start**

- A turn with a tool that requires approval, an input request, or a device step.
- For a device step: a registered desktop that is currently offline (to see the wait).

**Screens and controls**

- Web buttons: 'Allow', 'Allow for this chat' (hidden for high-risk), 'Deny' (packages/contracts/types/src/tool-approval-policy.ts:22-32; ToolCallCard.tsx:411-440). The brief and the draft say 'Approve'; the web card says Allow.
- Web device wait text: 'Waiting for <device or your desktop>. Open the desktop app to continue.' with a Cancel button, or 'Running on this device. Approve it if your desktop asks.' (ToolCallCard.tsx:340-346).
- Web expired text: 'This approval request expired or is no longer active.' (ToolCallCard.tsx:371).
- Chrome: Approve, Decline, optional 'Allow for this chat' and guidance field (bubbles.ts:959-1042; messages.json spApprovalApprove, spApprovalDecline).
- VS Code: card title 'Approval needed' with risk label and 'Deny and tell AGI what to do instead'; question card 'AGI asks' (webviewContent.ts:7117-7140,7241,7262-7290).
- CLI: approval and question modals (tui_app.rs:1651,1729); request kinds include Question, AskUser and McpElicitation (approval_broker.rs:23-60).

**Journey**

1. 1. A step reaches a gate; the run status becomes awaiting approval, paused with an input request, or awaiting device.
2. 2. The turn summary changes: web 'Needs approval · <step>' or 'Waiting for your input · <step>' (AgentActivityTimeline.tsx:337-343); mobile 'Needs approval' and 'Waiting for <device>' (AgentActivityTimeline.tsx:249-255); Chrome 'Needs your approval · t', 'Needs your input · t', 'Waiting for your desktop · t' (messages.json).
3. 3. The screen reader hears 'Response paused, waiting for your approval' (web, ChatMessageList.tsx:1753-1757) or 'Approval needed: <step>' (AgentActivityTimeline.tsx:375-377).
4. 4. The person chooses; the card shows the recorded outcome (VS Code: 'Approved once.', 'Turn aborted.'; Chrome: recorded Approved or Declined).
5. 5. The run resumes through the server (resume endpoints) or ends if denied.

**What the person sees and gets**

- Web announcement strings: 'Response paused, waiting for your approval', 'Generating response', then 'Response complete' (ChatMessageList.tsx:1144-1169,1750-1759).
- Mobile notice: 'Waiting for approval. This response is partial; review the tool request to continue.' or 'This response is partial. The approval request can no longer be resumed; send a new message to try again.' (MessageBubble.tsx:2776-2782).
- VS Code outcome texts: 'The turn ended before this was answered.' (webviewContent.ts:7045).
- Web interactive cards: send buttons disabled with 'Available when the reply finishes.' while streaming, and 'Buttons that send a message work in saved chats.' in temporary chats (InteractiveCardBlock.tsx:60-61).

**Settings**

- Chat-level allow: 'Allow for this chat' (web, mobile ChatToolGrantControl, Chrome).
- VS Code mode option 'Require Shell Approval' setting disables Auto mode (webviewContent.ts:5215-5222).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: awaiting-approval status derived from open approvals even if a later paused status overwrote it (activity-status.ts:31-64).
- Web: summary labels and screen reader strings for approval and input (AgentActivityTimeline.tsx:337-343,372-385).
- Web: ToolCallCard device wait, expired device and approval prompt states (ToolCallCard.tsx:286-291,335-440).
- Web: interactive card block with response channel, resume and deadline handling (InteractiveCardBlock.tsx:60-130).
- Server routes exist for approving and resuming: approve, resume-input, resume-device under /api/llm/v1/chat/completions (apps/web/app/api/llm/v1/chat/completions/*/route.ts).
- Mobile: Needs approval, Waiting for <device> labels, approval controls, approval expired notice (AgentActivityTimeline.tsx:249-255,409; MessageBubble.tsx:2776-2782).
- CLI: approval broker with kinds including Question and McpElicitation and modals (approval_broker.rs:23-60; tui_app.rs:1651,1729).
- VS Code: approval card and question card with answer via respondToApproval (webviewContent.ts:7117-7290,7397-7415). The brief marks input missing for VS Code; the code has a question card.
- Chrome: approval step actions, input and device labels, connector input form (bubbles.ts:959-1042,1150-1165; connectorInputForm.ts).

**Incomplete**

- Web summary line has no awaiting-device branch: buildAgentActivitySummary falls through to the live label; the device wait shows only in the screen reader text and the step card (AgentActivityTimeline.tsx:330-366 versus 378-379).
- VS Code: no device-wait text was found. Searched apps/extension-vscode/src for awaiting_device, awaiting-device, 'Waiting for your desktop' and 'offline device': no match.
- CLI: no device wait text was found in the files opened; remote or desktop device steps may not apply to the CLI [unknown].

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI device wait: not listed in the brief and not found.

## 4. Required behaviour

**Established requirements**

- A step needing approval pauses the turn visibly in a waiting-for-approval state with approve and deny controls. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.07)
- When the assistant needs information it shows a waiting-for-input state with a way to answer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.08)
- A step needing an offline device shows it is waiting for or cannot reach that device. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.24)
- Capability honesty: a hidden or disabled control is better than an enabled no-op. (source: docs/product/experience-contract.md:79)
- Do not use one generic approval setting; approval domains are separate. (source: docs/product/experience-contract.md:469-471)

**Acceptance criteria**

1. Trigger a tool that needs approval on web: the card shows Allow and Deny and the summary reads Needs approval; a screen reader announces the pause.
2. Click Deny: the step is declined and the turn continues or ends as designed; the card shows Denied.
3. Trigger a question card: the summary reads Waiting for your input; answering resumes the turn.
4. Take the only desktop offline and trigger a desktop step: the step card says Waiting for your desktop with Cancel.
5. On mobile, leave an approval unanswered and reopen after it expires: the expired notice shows.
6. In the CLI, a file write shows a modal; Esc or No denies and the turn continues.
7. In VS Code, an approval card takes keyboard focus on its first action when the transcript is followed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- VS Code should say when a device step cannot run [inferred from S19.24 status 'done' in the brief, contradicted by code search].
- The web summary line should name the device wait like the screen reader line does [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an awaiting-device branch to the web and shared summary.
- [proposed] Show the offered options as buttons on every app for single-choice questions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgentActivityTimeline summary and announcement | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Needs approval, Waiting for your input, Waiting for your desktop strings (116-121,330-385). |
| service | hasOpenApprovalDecision and settledActivityStatus | `packages/ui/unified-chat/src/lib/activity-status.ts` | Reads open approvals from entries so a later paused status cannot hide them. |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Approval buttons, device wait and expiry text. |
| config | TOOL_APPROVAL_ACTION_LABELS | `packages/contracts/types/src/tool-approval-policy.ts` | Allow, Allow for this chat, Deny, Approve label constants. |
| component | InteractiveCardBlock (web) | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Answer card with response channel and resume. |
| component | ChatMessageList announcements | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Screen reader strings (1144-1169,1745-1760). |
| endpoint | approve route | `apps/web/app/api/llm/v1/chat/completions/approve/route.ts` | Server side of an approval decision (method not opened). |
| endpoint | resume-input route | `apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts` | Resumes a run after a user answer. |
| endpoint | resume-device route | `apps/web/app/api/llm/v1/chat/completions/resume-device/route.ts` | Resumes a run after a device step. |
| component | mobile AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Needs approval, device wait labels and approval controls. |
| component | mobile InteractiveCardBlock | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Mobile answer cards. |
| service | approval broker (CLI) | `apps/cli/src/tui/approval_broker.rs` | Request kinds, risk, decision values. |
| component | CLI approval and question modals | `apps/cli/src/tui/tui_app.rs` | run_tui_approval_modal (1651), run_tui_question_modal (1729), Waiting for your approval status (3013). |
| component | VS Code approval and question cards | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | renderApprovalCard, renderQuestionCard, resolveApprovalCard (7117-7415). |
| component | Chrome approval actions | `apps/extension/src/features/side-panel/bubbles.ts` | appendApprovalActions and status labels (959-1042,1150-1165). |
| component | Chrome connector input form | `apps/extension/src/features/side-panel/connectorInputForm.ts` | Form for input requests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The agent run reaches a gated step and the server emits an approval-requested or input-requested event and moves the run to a waiting status. | our servers | AgentActivityTimeline.tsx:116-121 and activity-status.ts:21-42 describe the events and statuses; server emission is in SYS-agents-tools-and-automation |
| The app shows the waiting label and the decision control. | device | ToolCallCard.tsx:286-291,411-440 |
| The person's decision is sent to the approval or resume endpoint. | our servers | apps/web/app/api/llm/v1/chat/completions/approve/route.ts, resume-input/route.ts exist |
| For a device step, the work is handed to the person's desktop app; if it is offline the run waits. | device and our servers | ToolCallCard.tsx:340-346; resume-device route exists |
| In the CLI the approval is asked locally in a modal and resolved in the same process. | device | apps/cli/src/tui/approval_broker.rs:331-340; tui_app.rs:1651 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval decision and scope on the tool entry (approved, approved-for-session, denied) | Agent activity entries in message metadata | Yes with the saved Cloud message [inferred] | Kept with the message |
| Typed answer to a question | Sent to the server as a resume-input request; also recorded on the card | Yes | unknown |

**Models and providers.** The pause belongs to the harness, not the model. Which tools ask for approval is a policy of the tool, not the provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud approvals and resume need sign-in. CLI approvals run locally. |
| Permissions | Per-tool approval; high-risk tools hide 'Allow for this chat' (ToolCallCard.tsx:289-291,422). Workspace policy can turn tools off (turn-error-notice.ts:139-140). |
| Subscription | None found in the code for the pause states. |
| Limits and metering | Approvals have a deadline: web interactive cards compute a response deadline and show expiry (InteractiveCardBlock.tsx:118-130); mobile notes an approval can no longer be resumed (MessageBubble.tsx:2776-2782). The length of the deadline was not read. |
| Feature flags | None found. |
| Model compatibility | Not model-specific. |
| Provider restrictions | None found. |
| Local mode | CLI and VS Code approvals are asked locally. On web a Local model turn has no server agent events, so these server-driven pauses do not occur [inferred from runLocalTurn at useChatStream.ts:4494]. Local desktop steps: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Approval expired | Web shows 'This approval request expired or is no longer active.'; mobile shows send-a-new-message notice; VS Code shows 'The turn ended before this was answered.' | ToolCallCard.tsx:371; MessageBubble.tsx:2776-2780; webviewContent.ts:7045 |
| Approval overwritten by paused | Open approval still reads as awaiting approval. | activity-status.ts:21-41,57-64 |
| Device offline | Wait text with Cancel on web; mobile 'Waiting for <device>'; Chrome 'Waiting for your desktop'. | ToolCallCard.tsx:340-355; AgentActivityTimeline.tsx:251-254; messages.json spActivityWaitingForDesktop |
| Card send while streaming | Buttons that send a message are held back. | InteractiveCardBlock.tsx:60-67 |
| Retry after a failed turn with a pending pause | Chrome keeps the pause and shows an error text instead of marking the turn failed. | side_panel.ts:9794-9808 |
| Accessibility | VS Code approval card has role group and an aria-label; first action focused when following; Chrome buttons have named aria labels. | webviewContent.ts:7122-7132,7255-7258; bubbles.ts:1002,1031 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: VS Code approval card [inferred from file name].
- `apps/web/app/api/llm/v1/chat/completions/approve/route.test.ts`: Approve endpoint [inferred from file name].
- `apps/web/app/api/llm/v1/chat/completions/resume-input/route.test.ts`: Resume-input endpoint [inferred].
- `apps/web/app/api/llm/v1/chat/completions/resume-device/route.test.ts`: Resume-device endpoint [inferred].
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Interactive cards [inferred].
- `packages/ui/unified-chat/src/components/__tests__/AgentActivityTimeline.test.tsx`: Summary labels [inferred].

**Test scenarios**

- **Web approval**
  1. Ask the assistant to write a file.
  2. Leave the card unanswered, then click Allow.
  - Expected: Summary shows Needs approval while waiting; run continues after Allow; announcement made.
- **Web deny**
  1. Trigger a tool and click Deny.
  - Expected: Step shows declined state and no tool output.
- **Offline desktop**
  1. Sign in with a desktop registered but closed.
  2. Ask for a desktop step.
  - Expected: Step card says Waiting for your desktop with Cancel; web summary line gap noted.
- **CLI approval**
  1. Run a turn that writes a file.
  - Expected: Modal with the proposal; choosing deny returns control.
- **VS Code question**
  1. Trigger an assistant question.
  - Expected: A card titled AGI asks with an answer input; answering shows 'Answered: <text>'.

**Where to look when it fails**

- Web: network log for the approve and resume routes.
- Mobile: pendingApprovalTurns state in chatExecutionStore.
- VS Code: postMessage type respondToApproval in the webview.
- Server: run status values in SYS-observability-and-operations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **Web summary line omits awaiting-device.** Affects: Web, Desktop. Evidence: AgentActivityTimeline.tsx:330-366. Work needed: Add a branch like the mobile summary (mobile AgentActivityTimeline.tsx:251-254).
- **Web button says Allow not Approve.** Affects: Documentation, testers. Evidence: tool-approval-policy.ts:23. Work needed: Update any test script that expects Approve on web.
- **VS Code has no device-wait display.** Affects: VS Code. Evidence: Search of apps/extension-vscode/src found nothing. Work needed: Confirm whether VS Code can be sent device steps; if yes, add the label.
- **Brief says VS Code input answering is missing.** Affects: Brief accuracy. Evidence: renderQuestionCard at webviewContent.ts:7262. Work needed: Correct the brief.
- **CLI device wait unknown.** Affects: CLI. Evidence: Not found in tui_app.rs. Work needed: Decide whether it applies.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-sync-and-continuity
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Length of the approval deadline.
- Whether the CLI can receive a device step.
- HTTP methods of the approve and resume routes.
- Exact question card controls on mobile and Chrome.
