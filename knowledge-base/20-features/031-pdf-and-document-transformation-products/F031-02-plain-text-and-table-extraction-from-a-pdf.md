---
id: "F031-02"
type: "feature"
title: "Plain text and table extraction from a PDF"
aliases: ["PDF text extraction", "PDF table extraction", "S31.07", "S31.09", "pdfPageText", "extract_pdf_text"]
area: "31 PDF and document-transformation products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.07", "S31.09"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:local", "file:apps/web/lib/server/pdf-attachment-content.ts", "file:apps/mobile/services/docParser.ts", "F031-01", "F031-03", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-02 Plain text and table extraction from a PDF

Gets the plain text of an attached PDF so a model can use it. Web reads each page with pdf.js and labels pages. Mobile Local scans the file on the device. Tauri desktop uses a Rust reader. No PDF table detection exists in any app; table cells arrive as run-together text.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.07](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3107), [S31.09](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3109).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns the text layer of a PDF into plain text for the chat model. Web joins text pieces on a page with spaces (apps/web/lib/server/pdf-attachment-content.ts:207-214). Tables are not detected: no code that finds rows or columns in a PDF was found.

**Why it exists.** The brief asks for plain PDF text (S31.07) and for tables as structured rows and columns (S31.09) (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md).

**Who uses it.** People who want the words of a PDF, and the chat and project-knowledge systems that feed the model.

**Problems it solves**

- Getting the words out of a PDF so the model can quote them
- Keeping page numbers so answers can cite pages

**Use cases**

- Ask 'give me the text of this file'
- Add a PDF to a project so it can be searched
- Ask 'list the table on page 2' and receive best-effort text, not true rows [inferred]

## 2. User experience

**Where to find it**

- Web chat composer and project knowledge upload (apps/web/lib/server/project-knowledge-extraction.ts:378-384)
- Mobile chat attach (Local mode reads on the device)
- Desktop Electron: hosted web app (doc: AGENTS.md section 5)
- Tauri desktop: chat attach (attachments.rs:240-290) and a file-read tool (apps/desktop/src-tauri/src/core/llm/tool_executor/file_tools.rs:242-305)
- CLI, VS Code, Chrome: not available

**Before you start**

- A text-based PDF (with a text layer)
- Not password protected

**Screens and controls**

- The same attach control and chat as F031-01; no 'extract text' button was found. The person asks in chat.

**Journey**

1. Attach the PDF
2. Ask for its text or a table
3. The model replies using the extracted text

**What the person sees and gets**

- Model answer
- Web: text longer than the cap is shortened by truncateExtractedText (pdf-attachment-content.ts:141-145)
- Mobile: '…[truncated]' after 100,000 characters and '…[only part of this file could be read, so some of its text is missing]' (apps/mobile/services/attachmentContext.ts, readDocumentContext)
- Mobile errors: 'content could not be extracted on-device'

**Settings**

- Text cap MAX_FILE_TEXT_CHARS from the shared attachment policy (packages/contracts/types/src/file-reference.ts:32)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: page text via getTextContent, items joined with a space (pdf-attachment-content.ts:207-214)
- Web: empty pages stay as empty entries so index equals page number (pdf-attachment-content.ts:24-28, 242-245)
- Web: text under 16 characters in total counts as no text layer (pdf-attachment-content.ts:17, 141-143)
- Web project knowledge: pages are joined with anchors recording where each page starts (apps/web/lib/server/project-knowledge-anchors.ts:30-49)
- Large files: page batches read by the same pdfPageText (apps/web/lib/server/chat-file-preparation/pdf.ts:169-190)
- Mobile Local: text-object scanner with caps of 50,000 parts, 500,000 characters, 2,000,000 scanned characters (apps/mobile/services/docParser.ts:166-168)
- Tauri desktop: pdf_extract text (attachments.rs:387-389)

**Incomplete**

- Mobile Local: no decompression code found, so many PDFs may give no text [inferred]
- Page order and spacing on Web are whatever pdf.js returns; columns may interleave [inferred]

**Present but disconnected or switched off**

- Tauri has a document search and metadata reader (apps/desktop/src-tauri/src/features/document/pdf.rs:66-196), but its IPC creation commands were cut or deregistered per doc: docs/decisions/wire-or-cut.md:843-844; whether reading is registered for the UI was not checked

**Not available**

- Table extraction in any app: no PDF table detection code found
- A dedicated 'extract text' command or export in the UI: not found
- CLI, VS Code, Chrome

## 4. Required behaviour

**Established requirements**

- The user can get the plain text of a PDF. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.07)
- Tables in a PDF come out as structured rows and columns the user can use. (source: S31.09 (same brief))
- The brief marks S31.09 done on web, desktop and mobile, but the code it cites holds no PDF table logic in the lines read (source: code reading, apps/web/lib/server/pdf-attachment-content.ts:207-214)

**Acceptance criteria**

1. A 2-page PDF with distinct text: the model can quote both pages
2. A PDF with an empty middle page keeps page numbering of the pages after it
3. Text longer than the cap is shortened and flagged
4. A corrupt file gives 'could not be read as a PDF.'
5. A PDF with a table: the person can obtain rows and columns (currently expected to fail; status unverified)
6. Mobile Local with an image-only PDF gives the 'could not be extracted' note

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Tables require layout awareness that joined text items do not give [inferred from pdfPageText]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Detect tables from text positions and return them as Markdown or CSV
- [proposed] Offer 'Download text' for an attached PDF

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | pdfPageText | `apps/web/lib/server/pdf-attachment-content.ts` | Joins text items of one page (line 207) |
| service | boundText | `apps/web/lib/server/pdf-attachment-content.ts` | Normalises newlines, applies 16-char minimum and size cap (141-145) |
| service | loadPdfjs | `apps/web/lib/server/pdf-attachment-content.ts` | Loads pdf.js and its worker (199-205) |
| service | extractTextFromPdfBuffer | `apps/mobile/services/docParser.ts` | Mobile on-device text scanner (302-360) |
| service | readDocumentContext | `apps/mobile/services/attachmentContext.ts` | Wraps parse result with truncation and error notes |
| service | extractPdfText | `apps/web/lib/server/project-knowledge-extraction.ts` | Project-knowledge PDF text with page anchors (151-204) |
| service | joinPagesWithAnchors | `apps/web/lib/server/project-knowledge-anchors.ts` | Joins pages and records page start offsets (line 34) |
| service | readPdfBatch | `apps/web/lib/server/chat-file-preparation/pdf.ts` | Page text for large files (169-190) |
| command | extract_pdf_text | `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs` | Rust text extraction for Tauri chat (387) |
| service | file read tool PDF branch | `apps/desktop/src-tauri/src/core/llm/tool_executor/file_tools.rs` | Tauri agent reads PDF text (242-305) |
| service | PDF document reader | `apps/desktop/src-tauri/src/features/document/pdf.rs` | Rust read, metadata, search of PDFs (66-196) |
| config | mobile document picker types | `apps/mobile/services/docParser.ts` | pickableDocumentMimeTypes used by chat screens |
| test | pdf-attachment-content test | `apps/web/lib/server/pdf-attachment-content.test.ts` | Extractor tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: pdf.js on the server reads each page's text items and joins them with spaces | our servers | pdf-attachment-content.ts:207-214, 243-245 |
| Pages are assembled with [Page n] labels and shortened if over the cap | our servers | pdf-attachment-content.ts:271-285 |
| Mobile Local: the file is read as base64 and scanned for text objects on the phone | device | docParser.ts:416-433 |
| Tauri: Rust pdf_extract reads the decoded bytes | device | attachments.rs:248, 387-389 |
| The text joins the model prompt | device and our servers | chatExecutionStore.ts:2722-2728 (Mobile); hydration (Web) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Extracted text | Memory for a chat turn; for project knowledge stored as an extracted-text row with page anchors (project-knowledge-extraction.ts:378-384) | Project knowledge is server-side | Project cleanup and lifecycle files exist (apps/web/lib/server/project-knowledge-cleanup.ts); rules not read |

**Models and providers.** No model is used for a text-layer PDF. A model is used only for scans (see F031-03).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: sign-in. Mobile Local and Tauri: not established. |
| Permissions | none found in the code for text extraction itself |
| Subscription | Attachment counts per plan (billing-catalog.ts:776); no extraction-specific entitlement found |
| Limits and metering | 250 pages on the small-file path (pdf-attachment-content.ts:9); 1000 text pages for large files (chat-attachment-policy.json:77); no metering found for text-layer reading |
| Feature flags | none found in the code |
| Model compatibility | Any model can read the text; images need a vision model |
| Provider restrictions | none found for text |
| Local mode | Mobile Local reads the text on the device with no server call. Tauri reads on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Corrupt file | PdfAttachmentUnreadableError 'could not be read as a PDF.' | pdf-attachment-content.ts:45, 299-300 |
| No text layer | Web returns text null and page images instead; Mobile throws EMPTY_DOCUMENT | pdf-attachment-content.ts:247-250, 285; docParser.ts:427-429 |
| Mobile partial read | A 'partial' flag appends a missing-text note | docParser.ts:426-433; attachmentContext.ts readDocumentContext |
| Tauri empty or failed read | Notes '[PDF attached but no text could be extracted - may be image-based or scanned]' or '[PDF attached but text extraction failed: ...]' | attachments.rs:260-276 |
| Tables | No structure; cells appear as space-joined text | pdf-attachment-content.ts:207-214 |
| Offline, retry, cancel | not handled in the code read | none: no such handling found in the files cited on this page |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/pdf-attachment-content.test.ts`: Text layer, compressed streams, page cap, non-PDF refusal
- `apps/web/lib/server/project-knowledge-anchors.test.ts`: Page anchor joining
- `apps/web/lib/server/project-knowledge-extraction.test.ts`: Project knowledge extraction (PDF cases not individually read)
- `apps/mobile/__tests__/docParser.test.ts`: Mobile PDF text scanning with plain fixtures

**Test scenarios**

- **Plain text PDF on Web**
  1. Attach a 2-page text PDF
  2. Ask for the text
  - Expected: Both pages quoted with page references
- **Empty middle page**
  1. Attach a PDF with a blank page 2
  2. Ask about page 3
  - Expected: Page 3 text is labelled [Page 3]
- **Table PDF**
  1. Attach a PDF with a 3x3 table
  2. Ask for it as rows and columns
  - Expected: Today: best-effort from joined text; a tester judges the result
- **Mobile Local compressed PDF**
  1. Local mode
  2. Attach a PDF made by a common word processor
  - Expected: Likely the could-not-extract note (unverified)
- **Corrupt file**
  1. Rename a .txt to .pdf and attach
  - Expected: Unreadable message

**Where to look when it fails**

- Log '[pdf] attachment content extraction failed'
- Mobile DocParseError code
- Tauri log '[Chat] Failed to extract text from PDF'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/web/031-pdf-and-document-transformation-products.md)
- Desktop: [70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md)
- Mobile: [70-qa/test-plans/mobile/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/mobile/031-pdf-and-document-transformation-products.md)

## 10. Gaps and dependencies

- **No table extraction** Affects: All apps; S31.09. Evidence: No table code found; brief cites unrelated files. Work needed: Build detection or tell the model to use the sandbox; correct the brief status
- **Mobile Local compressed PDFs** Affects: Mobile Local. Evidence: No decompression in docParser.ts. Work needed: Test and fix
- **No text download or export** Affects: All apps. Evidence: No UI found. Work needed: Decide if wanted
- **Brief status mismatch for S31.09 (done vs code)** Affects: Documentation. Evidence: Brief S31.09 lists apps/web/lib/server/container-files.ts:196, which handles provider-hosted file fetches (container-files.ts:190-200), not tables. Work needed: Update the brief
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:local
- file:apps/web/lib/server/pdf-attachment-content.ts
- file:apps/mobile/services/docParser.ts
- F031-01
- F031-03
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context

## Unknown

- Whether the Tauri UI exposes PDF reading outside chat attach
- Quality of table-like output on real PDFs
- Whether any plan limits text extraction
- Whether Mobile Local compressed PDFs fail in practice
