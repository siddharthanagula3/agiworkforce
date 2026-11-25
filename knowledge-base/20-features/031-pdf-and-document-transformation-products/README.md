---
id: "AREA-031"
type: "area"
title: "PDF and document-transformation products"
features: ["F031-01", "F031-02", "F031-03", "F031-04", "F031-05", "F031-06", "F031-07", "F031-08", "F031-09", "F031-10", "F031-11", "F031-12", "F031-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 31. PDF and document-transformation products

Lets a person attach a PDF, Word, spreadsheet or slide file to a chat and ask about it, and get back a file the product made. Working today: reading PDFs into text and page images for the model (web and mobile), and creating a simple PDF from text in the web app. Most other document work (merge, split, redaction, annotation, form filling, comparison, compression, e-signature, PDF-to-PDF editing) has no code in the parts read, so it is missing.

**Who uses it.** The code shows no plan or role gate on the PDF reading path in the files opened, so any signed-in chat user who can attach files reaches it. Office-type attachments are allowed on mobile only when the send goes to the cloud (apps/mobile/src/features/chat/utils/attachmentValidation.ts:113-115). The PDF creation tool is a model-callable managed office format on the web (apps/web/lib/services/managed-office-file-service.ts:192-197). The LibreOffice template build is run by the owner with a secret key, not by end users (apps/web/scripts/build-e2b-office-template.mjs:28-31). Project knowledge extraction is used by project members (apps/web/lib/server/project-knowledge-extraction.ts). Plan gates were not traced in the files read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F031-01](F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md) | Ask about an attached PDF (summary, questions, page questions) | built | built | built | no | no | no |
| [F031-02](F031-02-plain-text-and-table-extraction-from-a-pdf.md) | Plain text and table extraction from a PDF | built | built | built | no | no | no |
| [F031-03](F031-03-read-scanned-image-only-pdfs.md) | Read scanned (image-only) PDFs | built | built | no | no | no | no |
| [F031-04](F031-04-create-a-pdf-or-other-document-from-text.md) | Create a PDF or other document from text | partly | partly | partly | no | no | no |
| [F031-05](F031-05-preview-a-file-before-it-is-exported.md) | Preview a file before it is exported | built | built | no | no | no | no |
| [F031-06](F031-06-compare-documents-and-original-versus-transformed.md) | Compare documents and original versus transformed | no | no | no | no | no | no |
| [F031-07](F031-07-annotate-highlight-and-comment-on-a-pdf.md) | Annotate, highlight and comment on a PDF | no | no | no | no | no | no |
| [F031-08](F031-08-fill-pdf-forms.md) | Fill PDF forms | no | no | no | no | no | no |
| [F031-09](F031-09-insert-remove-reorder-merge-and-split-pages.md) | Insert, remove, reorder, merge and split pages | no | no | no | no | no | no |
| [F031-10](F031-10-shrink-redact-and-edit-metadata.md) | Shrink, redact and edit metadata | no | no | no | no | no | no |
| [F031-11](F031-11-searchable-and-accessible-pdf-output.md) | Searchable and accessible PDF output | no | no | no | no | no | no |
| [F031-12](F031-12-send-a-document-for-e-signature.md) | Send a document for e-signature | partly | partly | no | no | no | no |
| [F031-99](F031-99-other-items.md) | Other items in PDF and document-transformation products | n/a | n/a | partly | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/031-pdf-and-document-transformation-products.md](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md).

## How this area works in the code

1. **Attach and admit files in the chat turn.** When a turn is sent, the server finds every attachment slot in the messages. The turn being sent goes first, so older history cannot use up the file budget. Too many files in the current message is refused with a 413 error. Each file is checked against its recorded size before bytes are read. (`apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:486-510`, `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:523-531`, `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:447-475`, `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:430-434`)
2. **Read the PDF into text and page images.** The PDF bytes are checked for the PDF header, then the PDF library reads every page up to the 250-page cap. Pages with no text get an image render, up to 30 pages and 8 MB. The result is text with [Page n] labels, plus page images. (`apps/web/lib/server/pdf-attachment-content.ts:220-236`, `apps/web/lib/server/pdf-attachment-content.ts:240-268`, `apps/web/lib/server/pdf-attachment-content.ts:283-292`, `apps/web/lib/server/pdf-attachment-content.ts:295-300`)
3. **Send text and images to the model.** The hydrated text and images become part of the model request for that turn. The model writes the summary or answer. No separate summariser was found. (`apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:486-510`)
4. **Project knowledge path (saved files).** Project files keep extracted text. Retrieval picks passages for a request and keeps page markers so the model can cite pages. Scanned pages in project files go to a transcription routine. A file over the page cap is refused with a message to split it. (`apps/web/lib/server/project-knowledge-extraction.ts:154-176`, `apps/web/lib/server/project-knowledge-anchors.ts:34-52`, `apps/web/lib/services/project-context-service.ts:643-692`)
5. **Mobile on-device PDF reading.** On the phone, the parser checks the file, then reads its text. A file with a bad header or password is refused. A file with no readable text is refused as empty. (`apps/mobile/services/docParser.ts:311-319`, `apps/mobile/services/docParser.ts:416-428`, `apps/mobile/src/features/chat/utils/attachmentValidation.ts:113-115`)
6. **Create a PDF from text on the server.** The model can call the managed office tool with format pdf, a filename, a title and content. The server validates the input with a schema, lays out the text on A4 pages with jsPDF, and returns the bytes. Optional render verification needs a sandbox. (`apps/web/lib/services/managed-office-file-service.ts:192-197`, `apps/web/lib/services/managed-office-file-service.ts:796-800`, `apps/web/lib/services/managed-office-file-service.ts:1034-1047`)
7. **Store files the model or sandbox made.** When a provider or code run makes a file, the server fetches it and saves it with the file store, then returns a link under /api/files/. Files are saved only when storage is configured and the file has an ID. Failures are logged and skipped. (`apps/web/lib/server/container-files.ts:170-229`)
8. **Preview office files.** The web preview reads slides into text and workbooks into sheets, with size limits that show a message instead of a broken view. (`apps/web/features/chat/lib/office-file-preview.ts:34-42`, `apps/web/features/chat/lib/office-file-preview.ts:173`, `apps/web/features/chat/lib/office-file-preview.ts:228-233`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/server/pdf-attachment-content.ts` | Core PDF reader on the server: text per page, page images for scans, page and size caps, and the unreadable and password errors. |
| `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Turns chat attachments into model input for each turn, with the current turn first, file-count limit and admission by size. |
| `apps/web/lib/services/managed-office-file-service.ts` | Server tool that creates Word, slide, workbook, PDF and CSV files from validated input; the PDF creator is generatePdf at line 796. |
| `apps/web/lib/server/project-knowledge-extraction.ts` | Extracts text from project files, including PDFs with page anchors, transcribes scanned pages, and refuses files over the limits. |
| `apps/web/lib/server/project-knowledge-anchors.ts` | Keeps page positions in extracted text so retrieved passages can name their page. |
| `apps/web/lib/services/project-context-service.ts` | Builds the knowledge block for a request from stored project files, choosing passages and adding page markers. |
| `apps/web/features/chat/lib/office-file-preview.ts` | Reads slide decks and workbooks for the web preview, with preview size limits. |
| `apps/web/lib/server/container-files.ts` | Saves files that a model provider or code run created, so they can be downloaded later. |
| `apps/mobile/services/docParser.ts` | On-device reader for PDF, text, Markdown, CSV and code files; extracts text and reports empty or encrypted PDFs. |
| `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Decides which file types a phone can attach, per destination (on device or cloud), and their size limits. |
| `apps/web/lib/connectors/catalog.ts` | Connector list; holds the e-signature (DocuSign) OAuth entry. |
| `apps/web/scripts/build-e2b-office-template.mjs` | Owner-run script that builds the sandbox template with the LibreOffice packages for office rendering. |

## What is stored

- Chat attachments read for a turn (text and page images are built in memory for the model request; the raw file is looked up from an asset record): Asset store looked up through lookupAttachment in apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts; the storage backend was not traced
- Files a model provider or code run created, saved as a file with checksum, MIME type and byte size, with the provider file ID kept in extra metadata: File store via persistGeneratedFileBytes, returned as /api/files/<id> (apps/web/lib/server/container-files.ts:197-220)
- Extracted text and page anchors of project knowledge files: Project file record (extractedText, anchors, selection fields read in apps/web/lib/services/project-context-service.ts:643-692); the database table was not traced
- Generated PDF bytes from the managed office tool: Returned to the caller in memory; saving was not traced in the files read (apps/web/lib/services/managed-office-file-service.ts:1034-1047)
- On-device reading of a PDF on mobile: Text is read in memory on the device (apps/mobile/services/docParser.ts:416-428); nothing is written to device storage in the lines read

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Attachment count limit per message**: Refuses a message with more files than the limit with a 413 'too many attachments' error (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:491, 523-531 (value passed in as maxAttachments))
- **Destination (on device or cloud) for mobile attachments**: Cloud sends allow Word, Excel and PowerPoint types as well as PDF, text, Markdown and CSV; on-device sends allow only PDF, text, Markdown and CSV (apps/mobile/src/features/chat/utils/attachmentValidation.ts:112-115 (pickableDocumentMimeTypes), 34-51 (attachmentLimitsFor, maxAttachmentBytesFor))
- **PDF page and image caps**: 250 text pages, 30 page images, 8 MB total image bytes; pages past the caps are omitted and flagged (apps/web/lib/server/pdf-attachment-content.ts:9-10, 16 (constants, not environment values))
- **Project extraction refusal**: A project PDF over the page cap or the scanned-page cap is refused with a message to split it (apps/web/lib/server/project-knowledge-extraction.ts:170-176)
- **Render verification flag on office files**: When set, the server renders the file in the sandbox to check it; refused with an error if no execution environment exists (apps/web/lib/services/managed-office-file-service.ts:130-152 (verify_render in each format schema), 1034-1042)
- **Sandbox execution gate**: Turns sandbox code execution on or off; the office rendering path needs it (apps/web/lib/e2b/gate.ts:6 (AGI_E2B_EXECUTION); apps/web/.env.example:384)
- **Sandbox office template name**: Chooses which sandbox template holds the office packages (apps/web/lib/e2b/chat-template.ts:1 (AGI_E2B_CHAT_TEMPLATE); apps/web/scripts/build-e2b-office-template.mjs:3 (AGI_E2B_OFFICE_BUILD_ALIAS, build time only))

## Shared between apps

Shared server PDF reader apps/web/lib/server/pdf-attachment-content.ts is used by the chat path, the project knowledge path, and connectors and tools for Gmail, Microsoft Graph and URL fetch (apps/web/lib/connectors/gmail-actions.ts:234, apps/web/lib/connectors/microsoft-graph.ts:222, apps/web/lib/url-fetch/url-fetch-tool.ts:503). Shared package @agiworkforce/unified-chat/tabular reads workbooks for the web preview. The managed office tool is web-only. Mobile has its own separate reader (apps/mobile/services/docParser.ts) and its own attachment rules. Desktop and the CLI, VS Code and Chrome apps were not traced for PDF code; the brief's status for desktop is taken as given.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says S31.01 is done on mobile, citing docParser.ts:110. That line is the list of picker MIME types, and docParser.ts only reads PDFs into text (lines 416-428). No mobile code creates a PDF. (apps/mobile/services/docParser.ts:105-110, 416-428)
- Brief says S31.02 (spreadsheet to PDF) is done on web, citing container-files.ts:196. That line is inside persistGeneratedFile, which saves files made by a provider or code run. No spreadsheet-to-PDF code was found. (apps/web/lib/server/container-files.ts:170-229)
- Brief cites apps/mobile/src/features/chat/utils/attachmentValidation.ts:78 for office and PDF handling. Line 78 is the denied-type check; the allowed types are at lines 112-115. (apps/mobile/src/features/chat/utils/attachmentValidation.ts:72-79, 112-115)
- Brief cites apps/web/lib/connectors/catalog.ts:248 for the e-signature entry. Line 248 is the Square connector. The DocuSign entry is at line 256. (apps/web/lib/connectors/catalog.ts:248, 256)
- Several brief citations point at unrelated code: ChatComposerNew.tsx:5228 is a media-generation conflict message; MessageBubble.tsx:1368 and 1377 create an editable document artifact; ArtifactPreview.tsx:417 is a draft-saving helper; mobile [id].tsx:849 is image-generation and skill selection; chatExecutionStore.ts:1722 is a continuation-failure message. The PDF reading code is not at these lines. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5228; apps/web/features/chat/components/messages/MessageBubble.tsx:1368-1377; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:417; apps/mobile/app/(app)/chat/[id].tsx:849; apps/mobile/stores/chat/chatExecutionStore.ts:1722)
- The brief calls scanned-PDF reading OCR. The server code does not run an OCR engine: it sends page images to the model. The project path uses a separate transcription routine. (apps/web/lib/server/pdf-attachment-content.ts:211-268; apps/web/lib/server/project-knowledge-extraction.ts:140-144; apps/web/lib/server/scanned-document-text.ts:97)
- Mobile reports a scanned PDF as having no readable text instead of reading its pages as images. The brief says S31.08 is done on mobile. (apps/mobile/services/docParser.ts:428)
- Brief says the slide-to-PDF conversion (S31.03) is partial on web and desktop. The only code is an owner-run build script that installs LibreOffice packages. No code calls it to convert a deck to PDF. (apps/web/scripts/build-e2b-office-template.mjs:9-17, 20-22)
- The export preview (S31.24) is in office-file-preview.ts, but no non-test caller was confirmed in the first search results. Whether the preview matches the exported file was not shown in code. (apps/web/features/chat/lib/office-file-preview.ts:34-42, 173, 228-233)
- Mobile attachment limits: attachmentLimitsFor returns one fixed size for one destination (line 39) and a per-type size otherwise. Which destination gets which limit was not confirmed. (apps/mobile/src/features/chat/utils/attachmentValidation.ts:34-51)

## Not established

- Desktop code paths for PDF reading and creation: not traced; the brief's desktop status was not checked in code.
- Storage backend for attachment assets and for files saved by the file store: not traced past the function calls.
- Whether the composer attach control accepts PDFs on each app and how drag-and-drop works: the brief's composer line did not show this.
- Plan or role gates for PDF reading, PDF creation and the office tool: not traced.
- Whether the managed office tool is exposed to the model on every plan or route: not traced.
- Exact behaviour of transcribeScannedPages (apps/web/lib/server/scanned-document-text.ts:97): only its signature was seen.
- DOCUSIGN_* environment variables: not found in apps/web outside tests in the search run; the DocuSign signing flow was not traced.
- Whether the Word-to-PDF path in the chat hydration (S31.01 web) uses the managed office tool or another route: only the managed office tool was seen.
- Table output for PDFs (S31.09): no table detection found; status unverified.
- Whether the mobile on-device path sends a scanned PDF to the server for image reading after the empty-document error: not traced.
- The brief's line numbers for several items were checked and many do not match the code (see things_that_look_wrong); the features list uses the lines actually read.
- No build, test, install or server was run, per the task rules; all findings come from reading source only.
