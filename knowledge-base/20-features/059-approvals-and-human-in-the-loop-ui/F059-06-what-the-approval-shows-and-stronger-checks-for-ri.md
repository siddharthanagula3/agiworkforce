---
id: "F059-06"
type: "feature"
title: "What the approval shows, and stronger checks for risky actions"
aliases: ["Approval summary (S59.12)", "Exact recipients (S59.13)", "Exact destination (S59.14)", "Exact amount or purchase (S59.15)", "Exact command (S59.16)", "Files or records affected (S59.17)", "Proposed-diff preview (S59.18)", "Stronger confirmation (S59.28)", "Stakes list", "Risk label", "Request block"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.12", "S59.13", "S59.14", "S59.15", "S59.16", "S59.17", "S59.18", "S59.28"]
depends_on: ["F059-01", "F059-03", "F059-05", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "SYS-agents-tools-and-automation", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-06 What the approval shows, and stronger checks for risky actions

Each approval shows what the tool will do: a stakes list for recipients, amounts and items, the command, or the file diff, plus a risk label. Risky tools get a warning, and a permanent allow is not offered for critical ones. Destructive allows need a second confirmation. A tool with no readable parameters says so.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.12](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5912), [S59.13](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5913), [S59.14](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5914), [S59.15](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5915), [S59.16](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5916), [S59.17](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5917), [S59.18](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5918), [S59.28](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5928).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a tool call's arguments and the server's risk review into a readable card (packages/contracts/types/src/tool-approval-stakes.ts:122, packages/contracts/cloud-contracts/src/tool-approval-presentation.ts:39-87).

**Why it exists.** A person can only decide well if the card names who gets a message, what is bought and what changes; requirements say prompts show action, target, tool, risk, scope and choices (doc: docs/product/requirements.md section 9.7).

**Who uses it.** Everyone who answers an approval.

**Problems it solves**

- Approving a send without knowing the recipients.
- Approving an edit without seeing the diff.
- Granting a permanent allow to a tool that deletes data.

**Use cases**

- See 'To: a@x.com' before an email goes out.
- Read the exact shell command in the CLI overlay.
- Review a file diff on the card.
- Read 'Critical risk' and be offered only Allow once and Allow for this chat.

## 2. User experience

**Where to find it**

- Web, Desktop (hosted web app): on the tool card, a stakes grid (labels such as 'To', 'Amount'), a 'Request' block with command, diff or JSON, and 'No parameters' when empty (ToolCallCard.tsx:446, :461-466, :506). The connector card ToolApprovalCard shows a risk badge ('Low risk' to 'Critical risk'), the destructive notice and 'Raw JSON' (ToolApprovalCard.tsx:43-120, tool-approval-presentation.ts:16-23).
- Mobile: risk label, destructive notice, stakes lines, diff block, parameter rows, 'Raw JSON' (CloudToolApprovalControls.tsx:109-285).
- CLI: overlay with question, targets, scrollable detail and lines 'Who receives it', 'Subject', 'Amount', 'What is bought' (apps/cli/src/approval_details.rs:89-103, apps/cli/src/tui/widgets/approval_overlay.rs:5-21).
- VS Code: card with summary, highlights (label: value), a detail block, and 'Review change' that opens the proposed file in a diff (webviewContent.ts:7101, :7161-7188; apps/extension-vscode/src/features/permissions/proposedChangeReview.ts).
- Chrome side panel: summary 'Your approval is required before this tool can run.' (with risk when known) and a stakes list (bubbles.ts:962-971).
- Desktop (Electron) device prompt: 'Allow <app> to <what> in <folder>?' with the reason in the detail (permissionManager.ts:373-382).

**Before you start**

- A pending approval.

**Screens and controls**

- Risk badge, destructive notice, stakes, request block, scope buttons, guidance box.

**Journey**

1. 1. An approval appears.
2. 2. Read the risk and stakes.
3. 3. Open Raw JSON or the diff if needed.
4. 4. For a destructive tool pressing Allow for this chat or Always allow opens a confirm dialog naming the consequence (tool-approval-presentation.ts:88-115).
5. 5. Choose Allow once or Deny.

**What the person sees and gets**

- Long values are cut: at most 6 values, 160 characters, then 'and N more' (tool-approval-stakes.ts:61-62, :102-104); parameter rows cut at 280 characters and raw JSON at 20,000 (tool-approval-presentation.ts:44-45, test tool-approval-presentation.test.ts:21).
- Diffs render up to 400 lines then '... N more lines' (ToolCallCard.tsx:122).

**Settings**

- none specific; scope offers come from the server review (F059-03).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Stakes: send-like tool names show recipient fields; payment-like names show amount and item fields; phone-step tools use their own stakes; other tools show no stakes (tool-approval-stakes.ts:122-134).
- Server review attaches risk tier, destructive flag and offered scopes to each approval request (tool-loop.ts:4113-4127, connector-tool-session-grants.ts:272-287); risk tier is derived from action class and reversibility (tool-metadata.ts:933-939).
- An unreviewed call is treated as high risk, destructive and once only (tool-approval-presentation.ts:8-14).
- Critical tools never offer Always allow; destructive ones need a second confirmation (connector-tool-session-grants.ts:282, ToolApprovalCard.tsx:60-72).
- The plain card shows a stronger red warning with TOOL_APPROVAL_HIGH_RISK_NOTICE and hides 'Allow for this chat' only when the server marks the call high risk, which the server does for the egress escalation (ToolCallCard.tsx:290, :422; tool-loop.ts:7836-7842; tool-approval-policy.ts:38).
- File edits and code show as a diff or highlighted code (ToolCallCard.tsx:299, :466).
- CLI risk level and reversibility are computed per request kind and shown; Allow All excludes high-risk (approval_broker.rs:99-196).
- Electron high-risk capabilities get a warning dialog and no permanent grant (permissionManager.ts:360-382, capabilities.ts:66-73).
- Mobile shows stakes and diff (CloudToolApprovalControls.tsx:75-77, :189-215).

**Incomplete**

- Stakes only cover recipient, amount and item kinds; no dedicated 'destination' stake exists in the shared contract, so a destination or a file path appears only inside the Request block or raw parameters (tool-approval-stakes.ts:3-6).
- Stakes depend on tool names matching text patterns; a send tool with an unusual name shows none (tool-approval-stakes.ts:13-16).
- The plain tool card only shows the red warning for the egress escalation, not for every destructive tool; the destructive notice lives on the connector card (ToolCallCard.tsx:290, tool-approval-presentation.ts:22).

**Present but disconnected or switched off**

- none found

**Not available**

- Editing the proposed action before approving (S59.21) is missing on all apps per brief.

## 4. Required behaviour

**Established requirements**

- An approval request shows a plain summary of what the tool will do and why it needs approval. (source: S59.12)
- Before a send is approved the approval names exactly who will receive it. (source: S59.13)
- Before an outbound action is approved the approval shows the exact destination. (source: S59.14)
- Before a payment is approved the approval shows the exact amount and what is bought. (source: S59.15)
- Before a command runs the approval shows the exact command line and where it runs. (source: S59.16)
- Before a write the approval shows exactly which files or records change. (source: S59.17)
- Before a file edit is approved the user sees the proposed diff. (source: S59.18)
- Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask). (source: S59.28)
- Approval prompts show action, target, provider/tool, risk, scope and choices. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. A send tool call shows its recipients before approval.
2. A payment tool call shows amount and item.
3. A shell command shows the full command text.
4. A file edit shows a diff with additions and deletions.
5. A critical tool does not offer Always allow.
6. A destructive tool asks a second question before Allow for this chat or Always allow.
7. A tool with no parameters shows 'No parameters'.
8. A value with more than six entries shows 'and N more'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Destination should be a first-class stake alongside recipient, amount, item [inferred from S59.14 and tool-approval-stakes.ts:3-6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add destination and path kinds to the shared stakes.
- [proposed] Show the destructive notice on every card, not only the connector card.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | toolApprovalStakes | `packages/contracts/types/src/tool-approval-stakes.ts` | Derives recipient, amount, item stakes (line 122). |
| service | detectFileDiff / detectResultDiff | `packages/contracts/types/src/tool-request-diff.ts` | Builds diff views from arguments (detectFileDiff at line 63). |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Stakes grid, request block, diff, high-risk warning (lines 122, 290, 446, 461). |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Risk badge, destructive notice, parameter rows, raw JSON. |
| config | tool approval presentation | `packages/contracts/cloud-contracts/src/tool-approval-presentation.ts` | Labels, notices, caps, confirmation text. |
| service | toolApprovalReview | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Server review of each call (line 4113). |
| service | deriveRiskTier | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Risk tier from class and reversibility (line 933). |
| component | CloudToolApprovalControls | `apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx` | Mobile stakes, diff, parameters. |
| component | ToolFileDiffBlock | `apps/mobile/src/features/chat/components/ToolFileDiffBlock.tsx` | Mobile diff view (imported at CloudToolApprovalControls.tsx:46). |
| service | approval_details | `apps/cli/src/approval_details.rs` | CLI key details and argument preview (lines 78-103). |
| component | approval overlay detail | `apps/cli/src/tui/widgets/approval_overlay.rs` | Scrollable detail and scroll gate. |
| service | ApprovalRisk | `apps/cli/src/tui/approval_broker.rs` | CLI risk level and reversibility (line 99). |
| component | VS Code approval card | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Highlights, detail, Review change (lines 7101-7188). |
| service | proposedChangeReview | `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | Opens the proposed file in a diff in a virtual file system. |
| component | Chrome approval stakes | `apps/extension/src/features/side-panel/bubbles.ts` | buildApprovalStakes (line 971). |
| service | approvalReview | `apps/desktop/electron/runtime/approvalReview.ts` | Reserved-category read of a coding-session approval (outside folder, protected path, unknown remote, named host). |
| service | permissionManager prompt | `apps/desktop/electron/runtime/permissionManager.ts` | High-impact warning text (line 382). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server classifies each pending call: risk tier, destructive flag, offered scopes; marks egress escalation as high risk. | our servers | tool-loop.ts:4113-4127, :7836-7842 |
| Approval request event carries tool name, arguments and review to the client. | our servers | tool-loop.ts:7820-7830 |
| Client derives stakes from arguments, detects diffs and renders the card. | device | ToolCallCard.tsx:299-303 |
| CLI builds details and risk from the request kind locally. | device | approval_details.rs:89, approval_broker.rs:99 |
| Electron main composes the dialog text from the capability, scope and reason. | device | permissionManager.ts:360-390 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval review (risk tier, destructive, scopes) | Pending call record inside the checkpoint | Yes | With the checkpoint |
| Parameters shown | Message tool metadata and checkpoint | Yes for saved chats | With the chat |

**Models and providers.** The arguments come from the model's tool call, so a model that writes odd argument names can change what is shown; the display does not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud cards need sign-in; CLI and Electron prompts need none. |
| Permissions | Anyone who may answer the approval sees its arguments. |
| Subscription | none found in the code. |
| Limits and metering | Display caps: 6 values, 160 chars, 280 chars per row, 20,000 raw, 400 diff lines (tool-approval-stakes.ts:61, tool-approval-presentation.ts:44, ToolCallCard.tsx:122). |
| Feature flags | none found in the code. |
| Model compatibility | Quality of stakes depends on the tool arguments the model produced [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | CLI and Electron cards are built on the device. Mobile Local: no card found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No parameters | 'No parameters' / 'No parameters.' shown. | ToolCallCard.tsx:506, tool-approval-presentation.ts:29 |
| Too many recipients | First 6 then 'and N more'. | tool-approval-stakes.ts:102 |
| Very long diff | First 400 lines and a count of the rest. | ToolCallCard.tsx:122-140 |
| Unreviewed call | High risk, destructive, once only. | tool-approval-presentation.ts:8-14 |
| Expired | Stakes are not shown; the expired notice replaces the buttons. | ToolCallCard.tsx:301-303, :291 |
| CLI detail longer than screen | Allow is blocked until the last row was drawn. | approval_overlay.rs:17-24 |
| Accessibility | Stakes are a definition list; CLI text is sanitised against terminal escapes. | ToolCallCard.tsx:446, approval_overlay.rs (sanitize_terminal_text import) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/tool-review-details.test.ts`: Stakes show real recipients and payment items without unrelated args; bounded values; phone stakes; file-change detection.
- `packages/contracts/cloud-contracts/src/__tests__/tool-approval-presentation.test.ts`: Unreviewed is high risk; caps of 280 and 20,000; names tool on connector for Always allow.
- `packages/ui/unified-chat/src/components/__tests__/ToolCallCard.fileDiff.test.tsx`: Diff rendering on the card.
- `packages/ui/unified-chat/src/components/__tests__/MessageList.toolApproval.test.tsx`: Tool approval inside the message list; cases not read.
- `apps/web/features/chat/components/approvals/ToolApprovalCard.test.tsx`: Parameters, raw JSON, risk, scopes, destructive confirm.
- `apps/mobile/__tests__/CloudToolApprovalReview.test.tsx`: Mobile rows, raw JSON, risk, scopes, missing review treated as high risk.
- `apps/extension-vscode/src/__tests__/approvalCard.webview.test.ts`: Card renders choices; question answers.
- `apps/desktop/electron/__tests__/approvalReview.test.ts`: Approval kind and command reading for coding-session approvals.
- `apps/cli/src/approval_details.rs`: Inline tests (4 test attributes); cases not read.

**Test scenarios**

- **Send recipients**
  1. Trigger a mail-send tool with 8 recipients
  - Expected: Six listed plus 'and 2 more'.
- **Payment**
  1. Trigger a tool named like purchase with amount and item
  - Expected: Amount and Item rows on the card.
- **Critical tool**
  1. Trigger a delete or send tool marked irreversible
  - Expected: 'Critical risk' badge, no Always allow button.
- **Edit diff**
  1. Trigger a file edit with old and new text
  - Expected: Diff block with +/- counts.
- **CLI long detail**
  1. Trigger a patch with 200 lines
  2. Press y at once
  - Expected: Not accepted until scrolled to the end.

**Where to look when it fails**

- Look at the checkpoint's pendingToolCalls approvalScopes in cloud_agent_approval_checkpoints.
- Test ids tool-approval-stakes and tool-file-diff on the web card (ToolCallCard.tsx:446, FileDiffBlock).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- Mobile: [70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/mobile/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **No first-class destination stake; destination and path only inside the raw request.** Affects: All apps using shared stakes. Evidence: tool-approval-stakes.ts:3-6. Work needed: Add destination and path stakes and show them first.
- **Stakes depend on tool-name patterns.** Affects: Tools with other names. Evidence: tool-approval-stakes.ts:13-16. Work needed: Use tool metadata (action class) instead of names.
- **Warning copy differs by card: plain card warns only on escalation, connector card on destructive.** Affects: Web, Desktop hosted. Evidence: ToolCallCard.tsx:290, tool-approval-presentation.ts:22. Work needed: Use the server review on every card.
- **VS Code and Chrome cards read details built elsewhere (CLI text, extension code); parity with the shared stakes not verified.** Affects: VS Code, Chrome. Evidence: webviewContent.ts:7101, bubbles.ts:971. Work needed: Compare and align.

**Depends on**

- F059-01
- F059-03
- F059-05
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- SYS-agents-tools-and-automation
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop

## Unknown

- How the VS Code approvalHighlights function derives labels (line 7101 not read in full).
- Whether Chrome buildApprovalStakes uses the shared stakes function.
- Brief citations such as approve/route.ts:328 and useChatStream.ts:4047 do not point at stake or diff code.
- Whether the desktop Tauri build (internal) shows the same card; not traced.
