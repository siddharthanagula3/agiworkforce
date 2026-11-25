---
id: "F031-01"
type: "feature"
title: "Ask about an attached PDF (summary, questions, page questions)"
aliases: ["PDF summarization", "PDF question answering", "Page-specific questions", "Attached PDF in chat", "S31.04", "S31.05", "S31.06", "PdfAttachmentContent"]
area: "31 PDF and document-transformation products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.04", "S31.05", "S31.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:local", "mode:cloud", "api:POST /api/llm/v1/chat/completions", "file:apps/web/lib/server/pdf-attachment-content.ts", "file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-local-inference"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-01 Ask about an attached PDF (summary, questions, page questions)

A person attaches a PDF to a chat in the Web app (or the mobile app) and asks for a summary or an answer. Web sends the page text with [Page n] labels, page images for scans, and the raw PDF to models that accept PDFs. Mobile Local reads text on the device. CLI, VS Code and Chrome have no path.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.04](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3104), [S31.05](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3105), [S31.06](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3106).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a chat model read a PDF the person attached. On Web the server turns the file into labelled page text and page images, and also marks the original PDF so a model that takes PDFs natively can get it whole (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:680-752). Summaries and page answers are produced by the chat model itself; no separate summary code was found [inferred from reading the PDF path].

**Why it exists.** Leading assistants let people ask questions about a PDF. The brief requires summary, question answering and page-specific questions (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md S31.04-S31.06). A code comment says a route with no document channel would otherwise fail the turn (apps/web/lib/server/pdf-attachment-content.ts:147-154).

**Who uses it.** Any signed-in person who attaches a PDF in chat on Web, the Electron Desktop (which shows the hosted web app, doc: AGENTS.md section 5) or the Mobile app.

**Problems it solves**

- Reading a long report without opening it
- Finding what one page says about a topic
- Asking about a scanned file that has no text
- Asking about a PDF on a model that cannot take PDF files natively

**Use cases**

- Attach a contract and ask 'summarise this'
- Attach a report and ask 'what does page 4 say about fees'
- Attach a scanned letter and ask who sent it
- On a phone in Local mode, attach a text-based PDF and ask for key points

## 2. User experience

**Where to find it**

- Web: the chat composer attach controls; the PDF type is handled in apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1538-1546 (exact visible control label not traced)
- Desktop (Electron): shows the hosted web app, so the same composer (doc: AGENTS.md section 5)
- Desktop (Tauri build, retained internal): attachment policy accepts a PDF (apps/desktop/src/runtime/localChatTurn.ts:23-31)
- Mobile: the chat attach flow; PDFs are allowed by apps/mobile/src/features/chat/utils/attachmentValidation.ts:121-124
- CLI, VS Code, Chrome: not available (brief: missing)

**Before you start**

- A chat model that can read the file. On Web a model without document or image input blocks the send with: 'The selected model can't read the attached document. Switch to Auto, choose a document-capable model, or remove the file.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5444-5450)
- A free promotional model accepts images only or text only, so a PDF is blocked there (ChatComposerNew.tsx:1550-1553, 5441-5444)
- The plan allows enough attachments per message: the server limit comes from the plan (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4178-4184; packages/contracts/types/src/billing-catalog.ts:776-778)
- Mobile Local: a Local model loaded on the device; Mobile Cloud: sign-in and consent to upload

**Screens and controls**

- Web composer: attach control, drag-and-drop, warning banner with a button to switch to Auto (ChatComposerNew.tsx:5436-5456)
- Mobile composer: attach, file chip, Retry or remove on a failed upload (apps/mobile/src/features/chat/upload/uploadAttachment.ts:40)

**Journey**

1. Attach the PDF to the composer
2. Type a request such as 'summarise this' or 'what does page 4 say about fees'
3. Send
4. Web server reads the PDF, builds page text and images, and sends them to the model with the turn
5. The answer streams into the chat
6. If the file is cut short, the server reports the file name as truncated (chat-attachment-hydration.ts:696-699)

**What the person sees and gets**

- Answer text in the chat
- A note that a scanned page 'did not fit in this message and was not included' (chat-attachment-hydration.ts:709-713)
- Errors: '<name> could not be read as a PDF.' or '<name> is password protected. Remove the password and upload it again.' (apps/web/lib/server/pdf-attachment-content.ts:44-47) returned as HTTP 400 unreadable_attachment for a file on this turn (chat-attachment-hydration.ts:686)
- Mobile: a password-protected PDF makes the model tell the user to attach an unprotected copy (apps/mobile/services/attachmentContext.ts:43-46)

**Settings**

- Model picker (Auto or a document-capable model)
- Plan tier sets attachments per message and daily uploads (packages/contracts/types/src/billing-catalog.ts:776-784)
- Shared attachment limits file packages/contracts/cloud-contracts/src/chat-attachment-policy.json

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: text is read page by page with pdf.js and each page is written as '[Page n]' then its text (apps/web/lib/server/pdf-attachment-content.ts:271-285)
- Web: at most 250 pages are read as text by default; more sets pagesOmitted (pdf-attachment-content.ts:9, 240-241)
- Web: a file without the '%PDF-' header is refused (pdf-attachment-content.ts:225-227); a password error becomes the 'password protected' message (pdf-attachment-content.ts:296-298)
- Web: if the model lists PDF input, the raw PDF is sent as a file part and the fallback parts are skipped; otherwise text and images are used (apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:80-127; canonical-request.ts:178)
- Web: the file is also staged into the code sandbox for the turn (a stageForSandbox call inside the PDF block, chat-attachment-hydration.ts:680-752)
- Web: a larger-file path exists: files over the inline limit are prepared page by page with an outline and searchable passages (apps/web/app/api/llm/v1/chat/completions/lib/prepared-attachments.ts:119-129; apps/web/lib/server/chat-file-preparation/pdf.ts:169-190)
- Mobile Local: text is pulled out on the device by a hand-written scanner and added to the prompt (apps/mobile/services/docParser.ts:302-360, 416-433; apps/mobile/stores/chat/chatExecutionStore.ts:2722-2728)
- Mobile Cloud: the file is uploaded and sent as an asset reference so the Web server does the reading (chatExecutionStore.ts:2470-2490, 2720-2745) [that the server reads it through the same hydration path is inferred]
- Desktop Tauri build: PDF text is extracted in Rust and added to the turn (apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs:240-290, 387-389)

**Incomplete**

- Mobile Local: no '[Page n]' labels and no page images, only one joined text and a page count in metadata (docParser.ts:426-433), so page-specific questions have no page structure there
- Mobile Local: the scanner reads raw file bytes and no decompression code was found in apps/mobile/services/docParser.ts, so PDFs whose text is stored compressed probably yield no text [inferred]
- Tauri desktop: text only; an image-only PDF gets the note '[PDF attached but no text could be extracted - may be image-based or scanned]' (attachments.rs:260-266)
- Web: the page-image fallback only lifts the first RGB or RGBA image on a page (pdf-attachment-content.ts:159-194)

**Present but disconnected or switched off**

- Web large-file scanned-page reading: the only turn caller found passes scannedPages: null (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5635), so a model asking for a scanned page of a large file gets 'This page has no text layer and could not be read.' (apps/web/lib/server/tools/scanned-page-reader.ts:27, 149)

**Not available**

- CLI, VS Code extension and Chrome extension: no PDF attach path found (brief: missing)
- A separate summarisation routine: none found; quality depends on the model

## 4. Required behaviour

**Established requirements**

- The user attaches a PDF and gets a summary of its content. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.04)
- The user attaches a PDF and gets answers to questions about its content. (source: S31.05 (same brief))
- The user can ask about a specific page and the answer uses that page. (source: S31.06 (same brief))
- PDFs are an accepted chat file kind. (source: doc: docs/product/requirements.md:1444)

**Acceptance criteria**

1. Attach a 3-page text PDF on Web and ask about page 2: the answer uses page 2 text
2. Attach a password-protected PDF: the send is refused with the 'password protected' message
3. Attach a non-PDF file renamed .pdf: refused as 'could not be read as a PDF.'
4. Attach a 300-page text PDF: the turn is flagged as truncated and pages after 250 are not in the extracted text
5. On a model that cannot read documents, the composer shows the 'can't read the attached document' banner and offers Auto
6. On Mobile Local with a simple text PDF, the answer reflects the PDF text; with a compressed-stream PDF, the model is told content could not be extracted

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Page questions work only where page labels reach the model (Web); Mobile Local cannot satisfy S31.06 [inferred from docParser.ts:426-433]
- Summary quality is a model property, so it varies with the model chosen

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add page labels to the Mobile Local text so page questions work
- [proposed] Show the person which pages were read and which were left out
- [proposed] Decompress PDF streams on Mobile or use a real PDF library there

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | extractPdfAttachmentContent | `apps/web/lib/server/pdf-attachment-content.ts` | Reads text per page with pdf.js, builds [Page n] text, page images and omitted-page lists (lines 220-304) |
| service | hydrateChatAttachments | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Resolves each attachment into model parts; the PDF block is lines 680-752 |
| service | nativeDocumentAdmission / withNativeDocuments | `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | Decides from model metadata whether the raw PDF goes to the model as a file part |
| service | canonical request build | `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts` | Calls nativeDocumentAdmission and swaps in native document parts (line 178) |
| endpoint | api:POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Chat turn route that calls hydration (route.ts:1526; request-processor.ts:4178) |
| service | prepared-attachments | `apps/web/app/api/llm/v1/chat/completions/lib/prepared-attachments.ts` | Large-file cards, page ranges read, passage search for big PDFs |
| service | chat-file-preparation pdf | `apps/web/lib/server/chat-file-preparation/pdf.ts` | Opens a stored PDF by byte ranges, reads outline and page batches |
| config | chat attachment policy | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Per-file bytes, attachment count, PDF page and scan-read caps |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer: accepts PDFs, model-compatibility banner (1538-1560, 5436-5456) |
| service | getPlanMaxAttachmentsPerMessage | `packages/contracts/types/src/billing-catalog.ts` | Plan-based attachments per message (line 776) |
| service | parseDocument / extractTextFromPdfBuffer | `apps/mobile/services/docParser.ts` | On-device PDF text scanner and error codes (302-360, 416-433) |
| service | buildAttachedDocumentContext | `apps/mobile/services/attachmentContext.ts` | Turns a parsed attachment into a prompt block with truncation and error notes |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile send: Local reads text on device, Cloud uploads assets (2470-2490, 2720-2745) |
| config | attachment validation | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Accepts parseable documents; refusal messages (95-125) |
| service | upload with retry | `apps/mobile/src/features/chat/upload/uploadAttachment.ts` | Uploads a Cloud attachment, retry message (lines 40, 59-131) |
| command | extract_pdf_text | `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs` | Tauri desktop: PDF text extraction with pdf_extract (240-290, 387-389) |
| config | desktop attachment policy | `apps/desktop/src/runtime/localChatTurn.ts` | Accepts image, PDF or text/code files (23-31) |
| test | pdf-attachment-content test | `apps/web/lib/server/pdf-attachment-content.test.ts` | Unit tests of the extractor |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the browser sends the chat turn with the attachment reference; the route reads the stored file bytes | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4178-4184 |
| The server checks the '%PDF-' header, opens the file with pdf.js and reads page text | our servers | apps/web/lib/server/pdf-attachment-content.ts:225-245 |
| Pages with no text get an image; text gets [Page n] labels; limits apply (250 text pages, 30 images, 8 MB images) | our servers | pdf-attachment-content.ts:9-16, 247-285 |
| Model parts are built: text, page images, omission note, and a marker holding the raw PDF | our servers | chat-attachment-hydration.ts:696-752 |
| If the chosen model lists PDF input, the raw file part replaces the fallback parts | our servers | media-input.ts:80-127; canonical-request.ts:178 |
| The model provider reads the parts and streams the answer back | outside service | SYS-inference-providers; the request goes through the provider adapter [inferred] |
| Mobile Local: the app reads the PDF file as base64 and scans text objects on the device; the prompt is built on the device and sent to the on-device model | device | apps/mobile/services/docParser.ts:416-433; apps/mobile/stores/chat/chatExecutionStore.ts:2722-2728 |
| Mobile Cloud: the app asks for consent, uploads the file, then sends an asset id with the turn | device and our servers | apps/mobile/stores/chat/chatExecutionStore.ts:2470-2490, 2745 |
| Tauri desktop: the file is decoded and its text extracted by Rust code on the device | device | apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs:240-290 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded PDF bytes (Web and Mobile Cloud) | Chat attachment storage under a chat-attachments/ key prefix (apps/web/app/api/llm/v1/chat/completions/lib/prepared-attachments.ts:46-47) | Web and Mobile Cloud use the same stored asset | unknown; retention rule not read |
| Extracted text and page images | Built in memory per turn on the server for the small-file path | No | Not stored by this path as far as read; large files keep derived data under preparation keys (apps/web/lib/server/chat-file-preparation/derived-keys.ts) [details unknown] |
| Mobile Local document text | Put into the prompt for the turn; the original file reference is kept locally (apps/mobile/services/localChatAttachments) | No | unknown |

**Models and providers.** The chat model does the summarising and answering. Whether the raw PDF goes natively depends on the model's declared input types and the provider route's accepted document types (media-input.ts:80-100). A model without PDF input gets text and images instead. Own-key mode: unknown whether this route serves it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Mobile Cloud need sign-in (the route is the authenticated chat route). Mobile Local: sign-in requirement for local chat not established in files read. |
| Permissions | Mobile asks for consent before uploading a file to Cloud (apps/mobile/stores/chat/chatExecutionStore.ts:2490-2492). Web: none found beyond sign-in. |
| Subscription | Attachments per message come from the plan (packages/contracts/types/src/billing-catalog.ts:776-778); daily attachment uploads also vary by plan (billing-catalog.ts:780-784). Free promotional models block PDFs on Web (ChatComposerNew.tsx:1550-1553) and non-image files on Mobile (apps/mobile/stores/chat/chatExecutionStore.ts:2404-2412). |
| Limits and metering | Inline: 25 MB per file and 20 files (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2, 5). PDF large-file kind: up to 500 MB, 1000 text pages (json:75-77). Small-file extractor: 250 text pages, 30 images, 8 MB images (pdf-attachment-content.ts:9-16). Per-turn token metering follows the normal chat accounting. |
| Feature flags | none found in the code for this feature |
| Model compatibility | Web blocks send when the model cannot take documents or images and offers Auto (ChatComposerNew.tsx:1538-1560). Native PDF needs the model to list PDF input (media-input.ts:80-90). |
| Provider restrictions | Native PDF only where the provider route lists PDF as an accepted document type (media-input.ts:92-99). Otherwise fallback to text and images. |
| Local mode | Mobile Local: the PDF is read on the device only, text only, with no images and no page labels (docParser.ts:416-433). Web has no Local mode. Tauri desktop extracts text on the device (attachments.rs:240-290). Whether Local needs sign-in: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Password-protected PDF (Web) | Live-turn file raises 400 unreadable_attachment with the password message; an older history file is degraded as unreadable | pdf-attachment-content.ts:296-298; chat-attachment-hydration.ts:685-691 |
| Corrupt or non-PDF bytes | Message 'could not be read as a PDF.' | pdf-attachment-content.ts:45, 225-227, 299-300 |
| Too many attachments | 413 too_many_attachments naming the plan's maximum ('You can attach up to N files to one message.') | apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts (hydrateChatAttachments from line 486, the attachmentCount check) |
| More than 250 pages | Only the first 250 are read; onTruncated is called | pdf-attachment-content.ts:240-241; chat-attachment-hydration.ts:696-699 |
| Scanned pages over budget | Listed in a note to the model and omitted | chat-attachment-hydration.ts:709-713 |
| PDF with no text and no usable image | Model gets '[name contains no readable text]' | chat-attachment-hydration.ts:746-751 |
| Mobile password-protected PDF | Detected by the bytes containing /Encrypt; model is told to ask for an unprotected copy | apps/mobile/services/docParser.ts:318-320; attachmentContext.ts:43-46 |
| Mobile PDF with no extractable text | Parser throws EMPTY_DOCUMENT; the caller turns any error into a note 'content could not be extracted on-device' | docParser.ts:427-429; attachmentContext.ts:47-52 |
| Mobile upload fails | Nothing is sent; message says tap Retry on the file | apps/mobile/src/features/chat/upload/uploadAttachment.ts:40 |
| Offline, cancel, timeout | not handled in the code read for this feature on Web; Mobile has retry wording only | none: searched the files cited in this page and found no offline or cancel handling for PDF reading |
| Accessibility | Web warning banner uses role alert; other states not checked | ChatComposerNew.tsx:5436 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/pdf-attachment-content.test.ts`: Text layer returned, compressed content streams, page cap with omission flag, omitted scanned pages when no images allowed, non-PDF bytes refused
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.test.ts`: Attachment hydration into model parts (PDF cases not individually read)
- `apps/web/app/api/llm/v1/chat/completions/lib/prepared-attachments.test.ts`: Large-file prepared attachments
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.large-file.test.ts`: Large file turn in the request processor
- `apps/web/lib/server/chat-file-preparation/__tests__/pdf.test.ts`: Stored PDF opening and page batches
- `apps/mobile/__tests__/docParser.test.ts`: Mobile PDF text scanning with plain fixtures: escapes, fragments, dangling strings, scan budget
- `apps/mobile/__tests__/attachment-context.test.ts`: Prompt blocks for attached documents
- `apps/mobile/__tests__/attachment-validation.test.ts`: Which attachments are accepted or refused
- `apps/mobile/__tests__/doc-qa.test.ts`: Document question flow on Mobile (contents not read)
- `apps/mobile/__tests__/LocalChatAttachmentsSend.test.ts`: Local send with attachments (contents not read)

**Test scenarios**

- **Page question on Web**
  1. Attach a 3-page PDF whose pages have distinct words
  2. Ask 'what does page 2 say'
  3. Send
  - Expected: Answer matches page 2 (no result of any run is recorded here)
- **Protected PDF**
  1. Attach an encrypted PDF
  2. Send
  - Expected: The 'password protected' message; no answer
- **Model cannot read documents**
  1. Pick a model without document input
  2. Attach a PDF
  - Expected: Banner offers Auto; after switching, the send works
- **Long PDF**
  1. Attach a 300-page text PDF
  2. Ask about page 280
  - Expected: Model says it cannot see page 280 or the turn is flagged truncated
- **Mobile Local**
  1. Switch to Local mode
  2. Attach an uncompressed-text PDF and a typical compressed PDF
  3. Ask for a summary
  - Expected: First is summarised; second probably gets the 'could not be extracted' note (to confirm)
- **Free plan**
  1. Use a Free promotional model
  2. Attach a PDF on Web and on Mobile
  - Expected: Web banner and Mobile error block the send

**Where to look when it fails**

- Server log '[pdf] attachment content extraction failed' (pdf-attachment-content.ts:299)
- Error name PdfAttachmentUnreadableError; HTTP 400 code unreadable_attachment; HTTP 413 too_many_attachments
- Mobile: DocParseError codes CORRUPT_FILE, ENCRYPTED_PDF, EMPTY_DOCUMENT, READ_ERROR (docParser.ts:24)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/web/031-pdf-and-document-transformation-products.md)
- Desktop: [70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md)
- Mobile: [70-qa/test-plans/mobile/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/mobile/031-pdf-and-document-transformation-products.md)

## 10. Gaps and dependencies

- **Mobile Local has no page labels or page images** Affects: Mobile Local users asking page questions or reading scans. Evidence: docParser.ts:426-433 returns joined text and a page count only. Work needed: Emit page-labelled text or use a real PDF reader on the device
- **Mobile Local scanner has no stream decompression** Affects: Mobile Local users with ordinary PDFs [inferred]. Evidence: No inflate or Flate code found in apps/mobile/services/docParser.ts; tests use plain-text fixtures (apps/mobile/__tests__/docParser.test.ts:41-82). Work needed: Test on real PDFs; add a decoder
- **CLI, VS Code and Chrome cannot attach PDFs** Affects: Those three apps. Evidence: Brief marks them missing. Work needed: Add attach and read paths or decide to cut
- **Limits by plan for PDF size and pages not established beyond attachment counts** Affects: Free and paid users. Evidence: billing-catalog.ts:776-784 gives counts only. Work needed: Confirm per-plan PDF limits
- **Tauri desktop reads text only and has no scan fallback** Affects: Tauri desktop (retained internal build). Evidence: attachments.rs:260-266. Work needed: Only if the Tauri build returns to public use
- **Electron Desktop parity not independently tested here** Affects: Electron Desktop. Evidence: doc: AGENTS.md section 5 says the window shows the hosted web app. Work needed: Drive the Electron app with a PDF
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:local
- mode:cloud
- api:POST /api/llm/v1/chat/completions
- file:apps/web/lib/server/pdf-attachment-content.ts
- file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-local-inference

## Unknown

- Exact visible label of the Web attach control
- Whether Electron Desktop was verified with a PDF
- Whether the completions route serves own-key mode
- Retention of uploaded PDF bytes
- Whether Mobile Cloud and Web read the asset identically
- Per-plan PDF size and page limits
