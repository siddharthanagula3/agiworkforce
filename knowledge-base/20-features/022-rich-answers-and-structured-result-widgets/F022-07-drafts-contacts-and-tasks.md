---
id: "F022-07"
type: "feature"
title: "Drafts, contacts and tasks"
aliases: ["Email draft widget", "Email block", "Email artifact", "Writing block", "Message draft", "Draft surface", "EmailBlock", "EmailDraftSurface", "WritingDraftSurface", "S22.24", "S22.25", "S22.26", "S22.27"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.24", "S22.25", "S22.26", "S22.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "file:packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx", "file:packages/ui/unified-chat/src/components/markdown/richBlocks.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-07 Drafts, contacts and tasks

When the assistant writes an email, a card shows To, Subject and body with Edit, Copy and Open-in-mail actions. Other drafts (chat message, post, document, snippet) show as a plain draft card with copy. Contact cards and task or issue cards do not exist. No action sends a message directly.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.24](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2224), [S22.25](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2225), [S22.26](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2226), [S22.27](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2227).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns an assistant reply that contains an email fence (a code block labelled email) into an editable email card with To, Cc, Bcc, Subject and body. Other writing fences (message, post, document, snippet, writing) become a labelled draft card. An email-type artifact opens in the artifact panel as a read-only email preview with a Copy button. (packages/ui/unified-chat/src/components/markdown/assistantFence.ts:219-241; packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx:81-167)

**Why it exists.** The brief says an email draft should read as an email, not as a code block, and should offer copy, send and open actions (S22.25). Message drafts (S22.26) and contact and task cards (S22.24, S22.27) are listed as the same kind of widget. (doc: knowledge-base/data/area-briefs/022-rich-answers-and-structured-result-widgets.md)

**Who uses it.** Any signed-in person who asks the assistant to write an email or a message on web, desktop (which shows the hosted web app), mobile, VS Code and Chrome. [inferred from shared fence pipeline]

**Problems it solves**

- A draft email no longer has to be copied out of a code block and reformatted.
- A long email can be handed to the mail app even when it is too long for a mail link (the body is copied instead).
- A person can fix a word in the draft before using it, and can save the edit back into the chat message when the chat allows it.

**Use cases**

- Ask 'write an email to my landlord about the leak', read the card, press Copy email, paste into a mail client.
- Press Open in mail app to start a new mail with To and Subject filled in.
- Ask for a chat message reply, get a 'Chat message' card, copy it.
- Open an email artifact in the artifact panel and copy it as text.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): inside an assistant reply in chat; card header reads 'Email'; actions 'Edit', 'Copy email', 'Open in mail app' (packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx:113-116). Email-type artifacts open in the artifact panel (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1812,1981).
- Mobile: inside an assistant reply; card titled 'Email' with actions 'Copy email', 'Edit', 'Open in Mail' (apps/mobile/src/features/chat/components/DraftSurfaces.tsx:413-459). Other drafts show their label with Copy and Share (DraftSurfaces.tsx:154,611-700).
- VS Code and Chrome: the reply renders an 'Email' section with a 'Copy email' button only; writing drafts have an editable text area and 'Copy draft' in VS Code (packages/ui/unified-chat/src/components/markdown/assistantFence.ts:515-535; apps/extension-vscode/src/webview/render.ts:60-70; apps/extension/src/features/side-panel/markdown.ts:191).
- CLI: none found; no email fence handling in the CLI markdown renderer (apps/cli/src/tui/markdown_renderer.rs searched for email).

**Before you start**

- A reply where the model wrote an email fence. A finished email block needs a recipient or a subject, and a body; otherwise it falls back to ordinary text (packages/ui/unified-chat/src/components/markdown/richBlocks.ts:122-152).
- Edits can be saved only where the chat provides an edit handler; otherwise the card says 'Edits are temporary in this view.' (EmailBlock.tsx:267).

**Screens and controls**

- Email card: To, Cc, Bcc (only if present or after Edit), Subject, body text area; buttons Edit, Copy email, Open in mail app; when edited: 'Save changes', 'Cancel' (EmailBlock.tsx:96-118,255-290).
- Cancel with unsaved changes asks 'Discard unsaved changes?' with 'Discard changes' and 'Keep editing' (EmailBlock.tsx:276-286).
- Email artifact preview: subject heading, recipient rows, Copy button, body rendered as markdown (EmailArtifact.tsx:100-167).

**Journey**

1. Ask the assistant to draft an email.
2. While the reply streams, the card shows the fields read-only and hides the action buttons (EmailBlock.tsx:120,205).
3. When the reply ends, Edit, Copy email and Open in mail app appear.
4. Optionally press Edit, change the fields, press Save changes (or Cancel and confirm discard).
5. Press Copy email to put 'To:/Cc:/Bcc:/Subject:' lines and the body on the clipboard, or Open in mail app to open a mailto link.

**What the person sees and gets**

- Copy button label changes to 'Email copied' or 'Copy failed, clipboard unavailable' (EmailBlock.tsx:109-114).
- If the mail link would exceed 2000 characters, the body is copied and the mail app opens without it; the card says 'This message is too long for a mail link, so it was copied. Paste it into the new email.' (richBlocks.ts:176-200; EmailBlock.tsx:90-103,160-180).
- If saving fails: 'Changes could not be saved. Your draft is kept here; try again.' (EmailBlock.tsx:155-160).
- Mobile shows an alert 'Could not open Mail' when the link cannot be opened (DraftSurfaces.tsx:385-391).

**Settings**

- None found in the code for the draft widgets themselves.
- Text strings go through the shared UI translation keys such as richBlock.copyEmail (EmailBlock.tsx:113).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Email fence parsing and card on web/desktop: parseEmailBlock accepts To, Cc, Bcc, Subject headers, then a blank line and body (richBlocks.ts:122-152); MarkdownContent renders EmailBlock (MarkdownContent.tsx:640-642).
- Copy, Edit, Open in mail app with a 2000-character mailto cap (richBlocks.ts:176-200; EmailBlock.tsx:92-103).
- Mobile email draft surface with Copy email, Edit, Open in Mail and save-back (apps/mobile/src/features/chat/components/DraftSurfaces.tsx:340-460; AssistantSurface.tsx:589-650). The brief lists no mobile status for S22.25 but the code exists.
- Writing drafts (message, document, post, snippet, writing) on web as WritingBlock, on mobile as WritingDraftSurface (assistantFence.ts:233-241; MarkdownContent.tsx:665-689; DraftSurfaces.tsx:611). The brief says message drafts are missing on every app (S22.26); the code contradicts it for the card with copy.
- VS Code and Chrome render an email section with Copy email and writing sections through the shared classifier (assistantFence.ts:515-535; render.ts:60-70; markdown.ts:191). The brief says missing for these apps; the code contradicts it for a copy-only card.
- Email artifact type in the artifact panel with Copy (ArtifactPreview.tsx:1812,1981; EmailArtifact.tsx:81-167).

**Incomplete**

- No Send action on any app: the widget offers copy and open-in-mail only (EmailBlock.tsx:123-158; DraftSurfaces.tsx:448-459). The brief asks for 'copy/send/open'.
- Message draft has copy (and share on mobile) but no send to chat, SMS or Slack (WritingBlock.tsx:30-60; DraftSurfaces.tsx:154).
- VS Code and Chrome email cards cannot open a mail app or edit the fields (assistantFence.ts:515-516).

**Present but disconnected or switched off**

- EmailArtifact (artifact panel) is separate from EmailBlock (chat fence); it has no Edit or Open-in-mail action (EmailArtifact.tsx:100-167). Whether the model produces email-type artifacts in practice is unknown.

**Not available**

- Contact cards (S22.24): no contact card kind in the fence classifier or the interactive card registry (assistantFence.ts:82-141; InteractiveCardBlock.tsx:38-51). Missing on all six apps.
- Task and issue cards (S22.27): no such card kind found. Missing on all six apps.
- Email draft widget on CLI: none found.

## 4. Required behaviour

**Established requirements**

- An email draft renders as an email widget (to, subject, body) with copy/send/open actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.25)
- A chat/SMS/Slack message draft renders as a message widget with copy/send. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.26)
- Person/contact answers render a contact card (name, role, email/phone actions). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.24)
- Tasks/issues (e.g. Linear, GitHub, Jira) render as task/issue cards with status and link. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.27)
- An action a user cannot undo asks first and names the consequence; a mutation fired straight from onClick is a defect. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. An assistant reply with an email fence containing To, Subject and body shows an Email card on web, mobile, VS Code and Chrome.
2. On web and mobile, Copy email puts To/Subject lines and the body on the clipboard.
3. On web and mobile, Open in mail app builds a mailto link; for a body that makes the link longer than 2000 characters the body is copied and the notice is shown.
4. While the reply is still streaming the fields are read-only and the action buttons are hidden on web.
5. Edit then Cancel with changes asks to confirm discard.
6. An email fence without recipient/subject or without body renders as ordinary text.
7. Contact, message-send and task cards: absent today; a tester records them as not built.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Direct send needs an account connection (mail or chat connector) and an approval step, so it must go through the tool approval system. [inferred from AGENTS.md section 9 and the connector system]
- VS Code and Chrome cards should offer the same copy behaviour; open-in-mail is not required there. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Send action that calls a connected mail connector after an approval card; keep Copy and Open as fallbacks.
- [proposed] Add contact and task card kinds to the interactive card registry (packages/contracts/types/src/interactive-cards.ts) so every app renders them or falls back to text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | EmailBlock | `packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx` | Email card: fields, Edit, Copy email, Open in mail app, Save changes, discard confirmation. |
| service | richBlocks (parseEmailBlock, emailPlainText, emailMailtoLink) | `packages/ui/unified-chat/src/components/markdown/richBlocks.ts` | Parses the email fence, builds plain text and the mailto link with a 2000-character cap; lists writing fence languages. |
| service | classifyAssistantFence / renderClassifiedFenceHtml | `packages/ui/unified-chat/src/components/markdown/assistantFence.ts` | Decides whether a fence is email, writing or another surface; builds the HTML used by VS Code and Chrome. |
| component | WritingBlock | `packages/ui/unified-chat/src/components/markdown/WritingBlock.tsx` | Draft card for message, document, post, snippet and writing fences with copy and edit. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Chooses EmailBlock or WritingBlock when a fence has that language. |
| component | RichBlockEdit | `packages/ui/unified-chat/src/components/markdown/RichBlockEdit.tsx` | Save-back context; canPersist is false when no edit handler is provided. |
| component | RichBlockCard | `packages/ui/unified-chat/src/components/markdown/RichBlockCard.tsx` | Shared card frame and copy hook for rich blocks. |
| component | EmailArtifact | `packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx` | Read-only email preview for email-type artifacts with Copy. |
| component | ArtifactPreview (email branch) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Renders EmailArtifact when artifact type is email (lines 1812, 1981). |
| component | EmailDraftSurface / WritingDraftSurface | `apps/mobile/src/features/chat/components/DraftSurfaces.tsx` | Mobile email and writing draft cards with Copy, Edit, Open in Mail, Share. |
| component | AssistantSurface | `apps/mobile/src/features/chat/components/AssistantSurface.tsx` | Mobile dispatcher that mounts the draft surfaces for classified fences. |
| service | VS Code markdown renderer | `apps/extension-vscode/src/webview/render.ts` | Sends fences through the shared classifier in 'vscode' mode. |
| service | Chrome side-panel markdown | `apps/extension/src/features/side-panel/markdown.ts` | Sends fences through the shared classifier in 'chrome' mode. |
| schema | conversation artifact types (includes email) | `packages/contracts/types/src/conversation.ts` | Declares 'email' as an artifact type (line 96). |
| test | richBlocks.test.ts | `packages/ui/unified-chat/src/components/markdown/__tests__/richBlocks.test.ts` | Unit tests for email parsing and mailto links. |
| test | WritingDraft.test.tsx | `apps/mobile/__tests__/WritingDraft.test.tsx` | Mobile writing draft behaviour. |
| test | EmailArtifact.test.tsx | `packages/ui/unified-chat/src/components/artifact-components/__tests__/EmailArtifact.test.tsx` | Email artifact preview. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model writes a reply containing an email fence; the chat stream delivers it to the app. | our servers | Chat completions route builds the stream (apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts). Local and own-key paths for mobile and desktop not traced: unknown. |
| The renderer classifies the fence and parses To/Cc/Bcc/Subject/body. | device | packages/ui/unified-chat/src/components/markdown/richBlocks.ts:122-152; assistantFence.ts:219-232 |
| Copy writes text to the clipboard; Open in mail app sets a mailto link handled by the operating system mail client. | device | EmailBlock.tsx:92-103; richBlocks.ts:183-200 |
| Save changes sends the edited text to the chat's edit handler, which rewrites the fence in the stored message. | device and our servers | RichBlockEdit.tsx:6-48 (handler is provided by the host; the server write path was not traced: unknown) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft text inside the assistant message | Message content in the chat store (web_messages on web per the card respond route; mobile local store unknown) | With the conversation when saved; unsaved edits stay in the view only (EmailBlock.tsx:267) | Lives and dies with the message. Mobile keeps unsaved edits in an answer-draft store (imported by DraftSurfaces.tsx); retention unknown. |

**Models and providers.** The card is rendered from text any model returns; it does not depend on a provider. Whether a model writes the email fence depends on the prompt; the prompt that asks for it was not found: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rendering needs no extra account. Chat itself needs sign-in on web (see SYS-authentication-and-identity). |
| Permissions | none found in the code for the draft widgets. Open in mail uses the device's default mail handler. |
| Subscription | none found in the code for the widget; the chat turn that produces it follows SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Mail link cap of 2000 characters (richBlocks.ts:176). No metering of the widget. |
| Feature flags | none found in the code |
| Model compatibility | Any model that writes the fence. The fence format is not tied to a model. |
| Provider restrictions | none found in the code |
| Local mode | The card renders from text on the device, so a Local reply that contains the fence would render the same way. [inferred] Whether local models are prompted to write it is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Fields read-only, action buttons hidden; a partial header line is accepted so the card does not flicker. | EmailBlock.tsx:120,205; richBlocks.ts:131-135 |
| Empty or invalid email fence | Falls back to plain text rendering. | richBlocks.ts:146-151; assistantFence.ts:221 |
| Empty email artifact | Shows 'Empty email draft'. | EmailArtifact.tsx:88-98 |
| Copy fails | Shows 'Copy failed, clipboard unavailable' (web card) or 'Retry' (artifact view). | EmailBlock.tsx:111; EmailArtifact.tsx:118-130 |
| Mail link too long | Body copied, mail opens without body, notice shown; if copy fails the mail app is not opened. | EmailBlock.tsx:93-103,166-171 |
| Save fails | Draft kept, error message shown, retry possible. | RichBlockEdit.tsx:33-42; EmailBlock.tsx:155 |
| Offline | not handled in the code beyond clipboard and mail link being local. | searched EmailBlock.tsx for network handling; none found |
| Accessibility | Labelled fields, status region with aria-live, labelled buttons; body label is screen-reader only. | EmailBlock.tsx:150-158,219-224 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/richBlocks.test.ts`: Email fence parsing and mailto link building
- `packages/ui/unified-chat/src/components/markdown/__tests__/RichBlocks.test.tsx`: Rendering of email and writing blocks
- `packages/ui/unified-chat/src/components/markdown/__tests__/assistantFenceClassify.test.ts`: Fence classification
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/EmailArtifact.test.tsx`: Email artifact preview
- `apps/mobile/__tests__/WritingDraft.test.tsx`: Mobile writing draft
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.surfaces.test.tsx`: Mobile answer surfaces including email
- `apps/extension-vscode/src/__tests__/answerSurfaces.webview.test.ts`: VS Code email and writing sections

**Test scenarios**

- **Email card on web**
  1. Open a saved chat.
  2. Ask 'Write an email to a colleague about moving a meeting to Friday.'
  3. When the reply ends, press Copy email and paste into a text field.
  - Expected: A card titled Email shows To and Subject; pasted text starts with Subject lines then the body.
- **Long body mail link**
  1. Ask for a very long email (over 2000 characters in the link).
  2. Press Open in mail app.
  - Expected: The body is copied, the notice about the long message appears, and the mail app opens with To and Subject only.
- **Edit and discard**
  1. Press Edit, change the subject, press Cancel.
  - Expected: A confirmation 'Discard unsaved changes?' appears; choosing Discard changes restores the original.
- **Mobile draft**
  1. On mobile ask for an email.
  2. Press Open in Mail.
  - Expected: The mail app opens with the draft, or an alert 'Could not open Mail' appears.
- **No contact or task cards**
  1. Ask 'Who is the CEO of X? Show as a contact card.'
  2. Ask 'Show my open issues as cards.'
  - Expected: Answers appear as normal text; no contact or task card (feature not built).
- **VS Code copy-only email**
  1. Ask for an email in the VS Code chat.
  2. Press Copy email.
  - Expected: An Email section with a Copy email button; no Open-in-mail or Edit.

**Where to look when it fails**

- Fallback paragraph with data-answer-fallback attribute means the fence failed to parse (assistantFence.ts:493-495).
- Console or log lines: none found for the email card.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- VS Code: [70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **No Send action on the email widget.** Affects: All apps. Evidence: EmailBlock.tsx:123-158; DraftSurfaces.tsx:448-459. Work needed: Design send through a connected mail account with an approval card; define entitlement and audit.
- **Contact cards not built.** Affects: All six apps. Evidence: No contact kind in assistantFence.ts:82-141 or InteractiveCardBlock.tsx:38-51. Work needed: Add card kind to contracts, renderers on each app, and a prompt or tool that produces it.
- **Task and issue cards not built.** Affects: All six apps. Evidence: Same as above; no issue card in the registry. Work needed: Add card kind fed by Linear/GitHub/Jira connector results; open-link action.
- **Message drafts have no send, only copy and (mobile) share.** Affects: Web, desktop, mobile, VS Code, Chrome. Evidence: WritingBlock.tsx; assistantFence.ts:530-535. Work needed: Decide send targets (chat, SMS, Slack) and wire through connectors.
- **Brief status is out of date: it says email missing on CLI/VS Code/Chrome and message drafts missing everywhere, while code shows copy-only cards in VS Code and Chrome and writing cards on web and mobile.** Affects: Brief accuracy. Evidence: render.ts:60-70; markdown.ts:191. Work needed: Update the brief; live-check VS Code and Chrome.
- **CLI has no email or draft card.** Affects: CLI. Evidence: no email handling in apps/cli/src/tui/markdown_renderer.rs. Work needed: Render the fence as a boxed block in the terminal.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- file:packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx
- file:packages/ui/unified-chat/src/components/markdown/richBlocks.ts

## Unknown

- Which prompt tells the model to write the email fence, and whether the model does so reliably.
- Whether the desktop Tauri build (apps/desktop/src) has its own draft rendering; public desktop shows the hosted web app (doc: AGENTS.md section 5).
- How edits saved from the card are written to the stored message on the server.
- Whether email-type artifacts are ever produced by the model.
- Whether Chrome and VS Code cards render correctly in the real apps (only a unit test exists for VS Code).
