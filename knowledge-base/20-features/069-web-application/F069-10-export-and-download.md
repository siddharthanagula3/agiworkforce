---
id: "F069-10"
type: "feature"
title: "Export and download"
aliases: ["Export and download", "Export chat history", "Export...", "Download all artifacts", "S69.17"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen working", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.17"]
depends_on: ["surface:web", "file:apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx", "file:apps/web/features/chat/services/conversation-export.ts", "file:apps/web/features/chat/utils/downloadArtifacts.ts", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-10 Export and download

A web user exports a conversation from the chat title menu ('Export...') to Markdown, PDF, Word, HTML or JSON, built in the browser. Artifacts download one by one from their card ('Download') or all together as a zip ('Download all', shown when there is more than one). Attachment files are not included, only their names.

Area: [69. Web application](README.md). Requirement items: [S69.17](../../10-requirements/capabilities/069-web-application.md#s6917).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | seen working |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns the open conversation into a file in the chosen format and saves it from the browser (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:101-169).

**Why it exists.** Users want to keep, share or archive a conversation outside the product (S69.17).

**Who uses it.** Any web user with a conversation open.

**Problems it solves**

- Keeping a record of a chat.
- Moving content into documents.
- Saving generated files.

**Use cases**

- Export a research chat to Word.
- Export JSON for a backup.
- Download all artifacts of a build as a zip.

## 2. User experience

**Where to find it**

- Web: chat header title menu, item 'Export...' (apps/web/features/chat/components/ConversationTitleMenu.tsx:195-200; wired at apps/web/features/chat/pages/WebChatPage.tsx:7408).
- Dialog 'Export Chat History' (EnhancedExportDialog.tsx:178).
- Artifacts panel: button 'Download all' (title 'Download all artifacts as zip') only when more than one artifact (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:733-751); artifact card button 'Download' (apps/web/features/chat/components/artifacts/ArtifactCard.tsx:28,158).

**Before you start**

- A selected conversation (the export button is disabled without a session, dialog line 277).
- Artifacts for the download actions.

**Screens and controls**

- Format tiles: Markdown .md, PDF .pdf, Word Document .docx, HTML .html, JSON .json (dialog lines 37-85).
- Field 'Filename (Optional)'.
- Checkboxes 'Include metadata (title, date, message count)' (Markdown only) and 'Include message timestamps' (not for JSON).
- Preview card: Session, Messages, Format.
- Buttons 'Cancel' and 'Export <format>'.

**Journey**

1. Open the title menu, choose 'Export...'.
2. Pick a format.
3. Optionally type a file name and set options.
4. Press 'Export <format>'; the button shows 'Exporting...'.
5. The file downloads; toast 'Exported as <format>'; dialog closes.

**What the person sees and gets**

- Toast success 'Exported as ...'; error 'Export failed. Please try again.'; 'No session selected' (dialog lines 103,161,165).
- Artifact zip toast: 'Preparing artifact download...', 'Artifact download ready', or the error text (ArtifactsPanel.tsx:737-741).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- All five formats build in the browser (dialog lines 126-159; apps/web/features/chat/services/conversation-export.ts; apps/web/features/chat/services/document-export-service.ts:13-66).
- Default file name is the title lowercased with non-letters and non-digits replaced by hyphens (dialog lines 109-110).
- Markdown export lists attachment names and sizes and the sources; expiring signed links are replaced by '[expiring link removed from export]' (conversation-export.ts:15-30,100-115).
- Artifact download and zip (apps/web/features/chat/utils/downloadArtifacts.ts, 60 s fetch timeout, unique file names).

**Incomplete**

- Attachment bytes and per-message files are not exported; only names (conversation-export.ts:100-107).
- For PDF and Word the metadata checkbox is hidden and the header block follows the default (dialog lines 137-146,172) [inferred].

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Server-side export of a conversation from this dialog; other apps are n/a per brief. Account-wide data export is a different feature (a test file apps/web/app/api/user/__tests__/export-completeness.test.ts exists).

## 4. Required behaviour

**Established requirements**

- A user exports a conversation from the chat header and the browser downloads it as Markdown, PDF, DOCX, HTML or JSON; files and artifacts download too. (source: S69.17 (brief))
- A downloaded export must not carry expiring signed links. (source: apps/web/features/chat/services/conversation-export.ts:17-22)
- Copy/download/export actions are part of the product requirements. (source: doc: docs/product/requirements.md:749)

**Acceptance criteria**

1. Each of the five formats downloads a file with the right extension.
2. File name defaults from the title as described; a typed name wins.
3. Unchecking metadata removes the title block from Markdown (a test exists).
4. JSON hides the options.
5. No signed storage link appears in any export.
6. Failure shows 'Export failed. Please try again.'
7. Download all appears only with 2 or more artifacts.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Files' in S69.17 means artifacts and generated files, since attachments are not exported.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer an include-attachments option or say so in the dialog.
- [proposed] Show the failure reason, not only a generic message.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | EnhancedExportDialog | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` | Format, options, file name, run export |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Menu item 'Export...' |
| screen | WebChatPage export wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Opens the dialog (lines 2217,7408,7934) |
| service | ChatExportService | `apps/web/features/chat/services/conversation-export.ts` | Markdown, HTML, JSON text and download |
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | Markdown, PDF and DOCX files |
| service | export-docx | `apps/web/features/chat/services/export-docx.ts` | Builds the Word document |
| service | export-pdf | `apps/web/features/chat/services/export-pdf.ts` | Renders the PDF |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Download all button |
| component | ArtifactCard | `apps/web/features/chat/components/artifacts/ArtifactCard.tsx` | Per-artifact Download |
| service | downloadArtifacts | `apps/web/features/chat/utils/downloadArtifacts.ts` | Zip, file names, generated-file fetch, spreadsheet-safe export |
| hook | markdownToDocumentBlocks | `packages/ui/unified-chat` | Shared markdown to blocks for PDF and Word |
| test | EnhancedExportDialog test | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.test.tsx` | Metadata option |
| test | conversation-export test | `apps/web/features/chat/services/conversation-export.test.ts` | Export text |
| test | document-export-service test | `apps/web/features/chat/services/__tests__/document-export-service.test.ts` | File export |
| test | downloadArtifacts tests | `apps/web/features/chat/utils/downloadArtifacts.test.ts` | Artifact download |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User opens the dialog and presses export. | device | EnhancedExportDialog.tsx:101 |
| Messages already in the page are formatted into text, or into PDF/DOCX with browser libraries. | device | dialog lines 126-159; document-export-service.ts:30-55 |
| A blob link is clicked to save the file. | device | document-export-service.ts:58-66; conversation-export.ts:267-277 |
| For a generated artifact file the browser fetches the file URI (same origin sends credentials) and zips. | device and our servers | apps/web/features/chat/utils/downloadArtifacts.ts:62-95 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file | User's Downloads folder | No | Owned by the user; we keep no copy |

**Models and providers.** No model or provider is used. Whether a model id appears in the export is not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs the conversation open in the web app; whether signed-out use exists is not traced. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code; artifact fetch times out at 60 s (downloadArtifacts.ts:17) |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Export is built from data already in the browser, so the text formats need no server. Whether Local-mode chats on web exist is not established here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No session | Toast 'No session selected'; button disabled | dialog lines 102-105,277 |
| In progress | Spinner and 'Exporting...' | dialog lines 278-282 |
| Failure | Console error and toast 'Export failed. Please try again.' | dialog lines 163-166 |
| Empty conversation | not handled in the code (exports a file with no messages) | dialog lines 101-169 |
| Artifact download failure | Toast with user-readable message | ArtifactsPanel.tsx:741 |
| Duplicate artifact names | Numbered suffix | downloadArtifacts.ts uniqueFilename |
| Accessibility | Format tiles are buttons; the selected state is shown by a check icon and border, with no selected attribute | dialog lines 186-208 [inferred] |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/dialogs/EnhancedExportDialog.test.tsx`: Metadata kept or removed in downloaded Markdown
- `apps/web/features/chat/services/conversation-export.test.ts`: Conversation export (name only)
- `apps/web/features/chat/services/__tests__/document-export-service.test.ts`: Document export (name only)
- `apps/web/features/chat/utils/downloadArtifacts.test.ts`: Artifact download (name only)
- `apps/web/features/chat/utils/downloadArtifacts.csvInjection.test.ts`: Spreadsheet injection safety in downloads (name only)
- `apps/web/features/chat/services/export-math.test.ts`: Math in exports (name only)

**Test scenarios**

- **Each format**
  1. Open a chat with 3 messages.
  2. Export once per format.
  - Expected: Five files with the right extensions that open in their apps.
- **File name**
  1. Title 'Q3 plan: v2!'.
  2. Export without typing a name.
  - Expected: q3-plan--v2-.md.
- **Signed link**
  1. Chat with a generated file link.
  2. Export Markdown.
  - Expected: Link replaced by the placeholder text.
- **Zip**
  1. Make two artifacts.
  2. Press 'Download all'.
  - Expected: A zip downloads; toast 'Artifact download ready'.
- **Failure**
  1. Make the PDF build throw (stub).
  - Expected: Toast 'Export failed. Please try again.'

**Where to look when it fails**

- Browser console '[Export] Failed:'.
- Network tab for artifact file fetches.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **Attachment files are not exported, only names.** Affects: Web users. Evidence: conversation-export.ts:100-107. Work needed: Decide scope; document it in the dialog.
- **Generic failure message.** Affects: Web users. Evidence: dialog line 165. Work needed: Show the cause.
- **Empty conversation export not handled.** Affects: Web users. Evidence: dialog lines 101-169. Work needed: Disable or warn.

**Depends on**

- surface:web
- file:apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx
- file:apps/web/features/chat/services/conversation-export.ts
- file:apps/web/features/chat/utils/downloadArtifacts.ts
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations

## Unknown

- Whether organization policy can block export or download; not searched.
- Message count limits and performance on very long chats.
- Exact behaviour for chats not yet saved.
- Contents of most test files beyond the dialog test (names only).
- Whether the 'Include timestamps' option changes HTML output as expected.
