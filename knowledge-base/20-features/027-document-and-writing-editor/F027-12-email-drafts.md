---
id: "F027-12"
type: "feature"
title: "Email drafts"
aliases: ["Email draft card", "Email block", "answer-surface-email", "Edit email", "Copy email", "Open in mail app", "Open in Mail", "Approval details (CLI)", "S27.39 to S27.41"]
area: "27 Document and writing editor"
available_on: ["cli", "vscode", "chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S27.39", "S27.40", "S27.41"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:local", "mode:own-key", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "file:packages/ui/unified-chat/src/components/markdown/richBlocks.ts", "F027-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-12 Email drafts

When the assistant writes an email, web and mobile show it as a card with To, Cc, Bcc, Subject and a body that can be edited, copied or opened in the mail app. VS Code and Chrome show a read-only card with Copy email. Nothing sends the email. In the CLI, a generic approval screen shows recipients, subject and arguments before any tool runs.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.39](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2739), [S27.40](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2740), [S27.41](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2741).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Recognises an ```email block in the assistant's answer and renders it as an email form. The person can adjust fields, copy the whole email as text, or open it in their own mail app with a mailto link. Separately, the CLI approval screen shows who receives a connector or tool action and its subject before the person allows it.

**Why it exists.** An email should look and behave like an email, not a code block, and a person must review what would be sent in their name. The brief asks for an email presentation, editable recipient, subject and attachment fields, and a review step before sending.

**Who uses it.** People drafting messages with the assistant on web, mobile, VS Code and Chrome; CLI users approving tool actions that contact people.

**Problems it solves**

- Copying an email out of a code block
- Missing recipient or subject
- Approving a send without seeing the recipients

**Use cases**

- Ask for a reply to a customer; edit the subject; press 'Open in mail app'.
- On mobile, tap Edit, add a Cc, tap Copy email.
- In the CLI, a tool call with a 'to' argument shows 'Who receives it: to: ...' before 'Allow'.
- In VS Code, press Copy email under the drafted message.

## 2. User experience

**Where to find it**

- Web and the Electron window (hosted web app): a card labelled 'Email' inside the chat answer (packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx:56-190, label 'Email'). Web also has an 'email' artifact type shown in the panel (apps/web/features/chat/components/artifacts/ArtifactLabels.tsx:107; ArtifactPreview.tsx:1812).
- Mobile: the same card as 'Email' with actions 'Copy email', 'Edit', 'Open in Mail' (apps/mobile/src/features/chat/components/DraftSurfaces.tsx:340-460; used from AssistantSurface.tsx:589-650).
- VS Code and Chrome side panel: a read-only section headed 'Email' with a 'Copy email' button (packages/ui/unified-chat/src/components/markdown/assistantFence.ts:520-521; apps/extension-vscode/src/__tests__/answerSurfaces.webview.test.ts:71-99; apps/extension/src/features/side-panel/markdown.ts:406).
- CLI: the approval prompt for an MCP tool or a managed connector action (apps/cli/src/agent/tools.rs:138-165; apps/cli/src/models/managed_approvals.rs:128-141).
- Tauri desktop: the shared chat markdown component renders the card in the floating chat (apps/desktop/src/features/floating-chat/index.tsx uses the shared markdown); main chat not traced.

**Before you start**

- The assistant's answer must contain a fenced block with the language 'email', starting with header lines (To:, Cc:, Bcc:, Subject:), a blank line, then the body. A finished block needs a recipient or a subject and a non-empty body, otherwise it shows as ordinary markdown (packages/ui/unified-chat/src/components/markdown/richBlocks.ts:116-150).
- The model is told about ```email blocks in the answer-UI tool description (apps/web/lib/services/answer-ui-tool-service.ts:52).
- CLI approval: a tool whose arguments contain keys such as to, cc, bcc, recipient, subject, and the person has approvals turned on [approvals gating not traced].

**Screens and controls**

- Web fields: 'To' and 'Subject' always; 'Cc' and 'Bcc' when present or when 'Edit email' is toggled (EmailBlock.tsx:96-104). While streaming, fields are read-only and the action buttons are hidden (EmailBlock.tsx:206, 118).
- Web actions: 'Edit email' (visible text 'Edit', toggles empty fields), 'Copy email' (icon), 'Open in mail app' (EmailBlock.tsx:120-170). When changed: 'Save changes' (or 'Edits are temporary in this view.' when nothing can persist) and 'Cancel' with a 'Discard unsaved changes?' dialog (EmailBlock.tsx:245-300).
- Mail link is limited to 2,000 characters; if the body would exceed it, the body is copied and the mail app opens without it (richBlocks.ts:176-200; EmailBlock.tsx:106-117).
- There is no attachment field: the draft has only to, cc, bcc, subject and body (richBlocks.ts:37-45).
- CLI approval lines: 'Who receives it: ...', 'Subject: ...', 'Amount: ...', 'What is bought: ...', a blank line, then the full arguments as formatted JSON cut at 4,000 characters with '... truncated' (apps/cli/src/approval_details.rs:5-8, 47-56, 78-100).

**Journey**

1. 1. Ask the assistant to draft an email.
2. 2. The answer streams; the card fills in read-only.
3. 3. When finished, press Edit to reveal empty fields and change the text.
4. 4. Press Copy email, or Open in mail app to hand it to your own mail program; send it there.
5. 5. Optionally Save changes so the edited text replaces the block in the saved message.
6. 6. CLI: when a tool that contacts someone is about to run, read the approval lines and choose to allow or refuse.

**What the person sees and gets**

- Copy state 'Email copied' or 'Copy failed, clipboard unavailable'.
- Notice 'This message is too long for a mail link, so it was copied. Paste it into the new email.' or the failure variant (EmailBlock.tsx:140-175).
- Error 'Changes could not be saved. Your draft is kept here; try again.' (EmailBlock.tsx:150-155).
- CLI: the approval screen text only.

**Settings**

- None found for the card. CLI approval behaviour depends on the approval mode, not traced.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web card: parse, render, edit fields, copy, mailto, save and discard (EmailBlock.tsx; richBlocks.ts:122-200). Saving edits to a message in a managed-cloud chat patches the message on the server; in Local or temporary chats the edit stays on the device (apps/web/features/chat/pages/WebChatPage.tsx:6451-6486; apps/web/features/chat/lib/assistant-fence-persistence.ts:9-20).
- Mobile card with the same fields, Edit, Copy email, Open in Mail, draft kept per answer (DraftSurfaces.tsx:340-470).
- VS Code and Chrome read-only card with Copy email (assistantFence.ts:520-521).
- CLI approval details for MCP tools and managed connector actions (approval_details.rs; tools.rs:138-165; managed_approvals.rs:128-141).

**Incomplete**

- Nothing sends the email from any card; the only hand-off is a mailto link or copy. The first draft's 'Edit email shows empty fields' is only part of Edit.
- CLI details are generic: they match keys for recipients, subject, amount and purchase, not email specifically; a channel or phone number is also listed under 'Who receives it' (approval_details.rs:10-30).
- The sending tool is not in this repository: no send-email tool found in apps/cli/src (search for send_email and gmail found only team messaging in teams.rs).

**Present but disconnected or switched off**

- Gmail and other connectors are 'coming soon' (packages/contracts/types/src/connector-release.ts:14, 43-44), so a connector-based send is not reachable for now.

**Not available**

- Attachment field: none in any app.
- Editable email in VS Code and Chrome: read-only.
- Review-before-send as a dedicated email screen: none; decision says no email-send editor is built (doc: docs/decisions/2026-09-27-founder-decisions.md:119-122).
- Tauri desktop main chat: not traced.

## 4. Required behaviour

**Established requirements**

- An email the assistant drafts is presented as an email (S27.39); has editable recipient, subject and attachment fields (S27.40); the person reviews recipients, subject and body before it is sent (S27.41). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.39, S27.40, S27.41)
- Dedicated editors including email-send (S27.39-41) are not built; ChatGPT Canvas and Claude artifacts change files by prompt. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:119-122)
- While streaming the fields are read-only; the card appears only for a block with a recipient or subject and a body. (source: packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx:206; richBlocks.ts:116-150)
- The CLI approval shows recipients, subject and full arguments (cut at 4,000 characters) before the person approves. (source: apps/cli/src/approval_details.rs:5, 47-56, 78-100)

**Acceptance criteria**

1. An ```email block with To, Subject and a body renders as a card on web and mobile.
2. While the answer is streaming the fields cannot be edited.
3. Editing a field and choosing 'Discard' asks before discarding.
4. 'Open in mail app' opens a mailto link with recipients, subject and body; for a body that makes the link longer than 2,000 characters the body is copied first.
5. The card has no attachment control.
6. A CLI tool call with a 'to' and 'subject' argument shows 'Who receives it' and 'Subject' lines before the JSON.
7. Arguments longer than 4,000 characters are shown cut with a truncation note.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'send-email review step' is met only in the sense of a generic approval, because the repository has no email-sending tool [inferred].
- Decision text for mobile naming the email widget (doc: docs/decisions/2026-09-27-founder-decisions.md:280-282, items S16.10, S17.27, S22.25) does not match the mobile code that has an email card; the item mapping was not checked [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an attachments field only if a send path exists.
- [proposed] Show a dedicated 'recipient and subject' header for email-like connector tools in CLI approvals.
- [proposed] Make VS Code and Chrome cards editable or document that they stay read-only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | EmailBlock (web, shared) | `packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx` | The editable card used by web and Tauri chat. |
| service | richBlocks email parsing and mailto | `packages/ui/unified-chat/src/components/markdown/richBlocks.ts` | parseEmailBlock (122), emailPlainText (161), mailto link and 2,000 limit (176-200). |
| service | assistantFence read-only email | `packages/ui/unified-chat/src/components/markdown/assistantFence.ts` | Classifies email fences (219) and renders the read-only section with Copy email (520). |
| hook | RichBlockEdit | `packages/ui/unified-chat/src/components/markdown/RichBlockEdit.tsx` | Save of an edited block back into the message (canPersist). |
| service | assistantFenceEdits | `packages/ui/unified-chat/src/components/markdown/assistantFenceEdits.ts` | applyAssistantFenceEdit (109). |
| hook | handleFenceEdit | `apps/web/features/chat/pages/WebChatPage.tsx` | Local edit vs server patch (6451-6486). |
| service | assistant-fence-persistence | `apps/web/features/chat/lib/assistant-fence-persistence.ts` | PATCH of the message through managedCloudMessagePath. |
| service | answer-ui-tool-service | `apps/web/lib/services/answer-ui-tool-service.ts` | Tells the model that ```email blocks render as cards (52). |
| component | EmailDraftSurface (mobile) | `apps/mobile/src/features/chat/components/DraftSurfaces.tsx` | Mobile card (340-470) with draft kept per answer. |
| component | AssistantSurface (mobile) | `apps/mobile/src/features/chat/components/AssistantSurface.tsx` | Chooses the email surface and streaming variant (589-650). |
| component | VS Code webview answer surfaces | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Styles for .answer-surface-email (2701-2745). |
| component | Chrome side panel markdown | `apps/extension/src/features/side-panel/markdown.ts` | Copy email button for surface:email (406); styles in side_panel.ts:5436-5480. |
| service | approval_details | `apps/cli/src/approval_details.rs` | approval_detail, key_details with recipient and subject keys, 4,000-character preview. |
| hook | request_mcp_tool_approval | `apps/cli/src/agent/tools.rs` | Builds the approval request for MCP tools (138-165). |
| hook | managed connector approvals | `apps/cli/src/models/managed_approvals.rs` | Builds approval requests for connector actions (128-141). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model writes an ```email fenced block in its answer. | our servers | apps/web/lib/services/answer-ui-tool-service.ts:52 instructs the model; which server route or on-device model produces it depends on the mode (unknown) |
| The client parses the block into fields and renders the card; during streaming it renders partial fields read-only. | device | richBlocks.ts:122-150; EmailBlock.tsx:56-110 |
| Edit, Copy and Open in mail app run in the client; the mailto link is handed to the operating system's mail program. | device | EmailBlock.tsx:106-175; richBlocks.ts:176-200 |
| Save changes rewrites the fenced block in the message; in a managed-cloud chat it is patched on the server, in a Local or temporary chat it stays local. | device and our servers | WebChatPage.tsx:6451-6486 |
| In the CLI, before an MCP tool or connector action runs, the approval request lists recipients and subject found in its arguments and the argument JSON. | device | apps/cli/src/agent/tools.rs:144-152; approval_details.rs:47-56 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Email draft text (inside the message content) | The conversation message (browser store, mobile store, or the account for managed-cloud chats); mobile unsaved edits are kept as a per-answer draft | With the conversation in the current mode; mobile drafts local until saved | As the conversation; Cancel discards unsaved edits after confirmation. |
| CLI approval request | In memory for the prompt | No | Not stored by the code read. |

**Models and providers.** The card needs no model to render. The draft itself comes from whichever model answers the chat; the answer-UI tool description tells it how to format an email block. No provider-specific behaviour found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rendering needs no account. Saving edits to the server needs a signed-in account in managed-cloud chats ('Sign in again to save this edit.', WebChatPage.tsx:6477). CLI approvals need whatever the CLI session requires. |
| Permissions | CLI approval is the permission step for a send-type tool; the approval screen is shown for MCP tools and managed connector actions. |
| Subscription | none found in the code for the email card. Connector tools are governed by the connectors capability and release state (F027-11). |
| Limits and metering | mailto link 2,000 characters; CLI argument preview 4,000 characters, detail value 240 characters, depth 4 (approval_details.rs:5-7). |
| Feature flags | none found in the code. |
| Model compatibility | Any model that writes the block format; blocks that do not parse show as normal markdown. |
| Provider restrictions | none found in the code. |
| Local mode | The card works in Local mode: parse, edit, copy and mailto run on the device; edits to Local or temporary chats are saved without the server (WebChatPage.tsx:6474-6476). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Fields read-only, actions hidden | EmailBlock.tsx:118, 206 |
| Unparseable or incomplete block | Shown as ordinary markdown | richBlocks.ts:116-150 |
| Body too long for mailto | Body copied, link opens without it; if copy fails the mail app is not opened and an error is shown | EmailBlock.tsx:106-117, 170-190 |
| Save fails | Draft kept, error text shown | EmailBlock.tsx:150-155 |
| Message changed since the block was drawn | Error 'This block changed. Reopen it before saving your edit.' | WebChatPage.tsx:6466-6468 |
| Another block saving or still streaming | Errors 'Another block in this message is saving...' / 'Wait for this response to finish before editing.' | WebChatPage.tsx:6455-6464 |
| Subject newline | Newlines removed from the subject | EmailBlock.tsx:80-87 |
| Mobile link cannot be opened | Alert 'Could not open Mail' | DraftSurfaces.tsx:384-392 |
| CLI deep or long arguments | Depth capped at 4, values cut at 240, preview cut at 4,000 | approval_details.rs:5-7, 78-88 |
| Offline, timeout, reconnect | not handled in the code beyond the save error. | EmailBlock.tsx shows only saveError text; no retry or reconnect logic in RichBlockEdit.tsx |
| Accessibility | Fields have labels (To, Cc, Bcc, Subject, Message), mobile card has accessibilityLabel 'Email' | EmailBlock.tsx:228-245; DraftSurfaces.tsx:413 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/RichBlocks.test.tsx`: Email card: Edit email button shows empty fields, Copy email, and related behaviour (cases at lines 67-110).
- `packages/ui/unified-chat/src/components/markdown/__tests__/richBlocks.test.ts`: Email parsing and helpers; cases not read.
- `packages/ui/unified-chat/src/components/markdown/__tests__/assistantFenceEdits.test.ts`: Applying edits to fences; cases not read.
- `apps/mobile/__tests__/WritingDraft.test.tsx`: Mobile draft surfaces; cases not read.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.surfaces.test.tsx`: Mobile answer surfaces including email; cases not read.
- `apps/extension-vscode/src/__tests__/answerSurfaces.webview.test.ts`: One email section after growth and mixed reply order in the VS Code webview.
- `apps/cli/src/approval_details.rs`: Inline tests cover only commit_line (lines 231-268); no test found for recipient or subject lines or the 4,000-character cut.

**Test scenarios**

- **Render and edit on web**
  1. Ask 'Draft an email to ada@example.com about Friday notes'.
  2. Wait for the answer to finish.
  3. Press Edit, change the subject, press Save changes.
  - Expected: The card shows To, Subject and body; the edited subject is saved into the message; no attachment control.
- **Streaming read-only**
  1. Start the same request.
  2. Try to type in the card while the answer is still streaming.
  - Expected: Fields do not accept input and the action buttons are absent until the answer ends.
- **Long body mail link**
  1. Ask for a very long email.
  2. Press 'Open in mail app'.
  - Expected: The body is copied and the notice says to paste it; the mail app opens with recipient and subject.
- **CLI approval**
  1. Run a CLI session with an MCP or connector tool whose arguments include to and subject.
  2. Trigger the tool.
  - Expected: The approval prompt shows 'Who receives it:' and 'Subject:' lines, then the JSON arguments.
- **VS Code read-only**
  1. In the VS Code chat ask for an email draft.
  - Expected: A section headed Email with a 'Copy email' button; fields cannot be edited.

**Where to look when it fails**

- Error texts above in the card status line.
- Web chat store message content after a fence edit; PATCH to the message path (assistant-fence-persistence.ts:9-20).
- CLI approval request lines in the terminal prompt.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/027-document-and-writing-editor.md](../../70-qa/test-plans/cli/027-document-and-writing-editor.md)
- VS Code: [70-qa/test-plans/vscode/027-document-and-writing-editor.md](../../70-qa/test-plans/vscode/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No attachment field and nothing sends the email.** Affects: All apps. Evidence: richBlocks.ts:37-45; EmailBlock.tsx actions list. Work needed: Not planned; dedicated email-send editor excluded by founder decision.
- **The send tool is not in this repository, so the CLI review step covers only whichever MCP or connector tool a user installs.** Affects: CLI. Evidence: No send-email tool found in apps/cli/src. Work needed: Verify with a real connector when connectors are released.
- **VS Code and Chrome cards are read-only, brief says missing or unverified.** Affects: VS Code, Chrome. Evidence: assistantFence.ts:520-521. Work needed: Update the brief; decide if editing is wanted.
- **Mobile card exists but the brief says rendering not verified, and a decision text suggests mobile has no email widget.** Affects: Mobile, docs. Evidence: DraftSurfaces.tsx:340; docs/decisions/2026-09-27-founder-decisions.md:280-282. Work needed: Reconcile the decision with the code.
- **No CLI test for recipient and subject lines.** Affects: CLI. Evidence: approval_details.rs tests at 231-268 cover commit_line only. Work needed: Add tests for key_details and truncation.
- **Tauri desktop main chat not confirmed to render the card.** Affects: Tauri desktop. Evidence: Only floating chat was found using the shared markdown. Work needed: Trace the main chat.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:local
- mode:own-key
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- file:packages/ui/unified-chat/src/components/markdown/richBlocks.ts
- F027-11

## Unknown

- Which tool, if any, actually sends email once connectors are released.
- Whether the Chrome side panel is fully equivalent to the VS Code read-only card beyond CSS and the Copy email label.
- Whether the Tauri main chat renders the editable card.
- How CLI approval modes decide when the approval screen appears.
- Which route or on-device model writes the email block in each mode.
- Which decision item S22.25 refers to and whether it concerns the email card.
