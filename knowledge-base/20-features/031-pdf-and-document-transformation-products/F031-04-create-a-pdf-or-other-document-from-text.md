---
id: "F031-04"
type: "feature"
title: "Create a PDF or other document from text"
aliases: ["Create PDF", "Text to PDF", "Download as PDF", "Export to PDF", "S31.01", "S31.02", "S31.03", "managed office file tool", "exportToPDF", "document_create_pdf"]
area: "31 PDF and document-transformation products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.01", "S31.02", "S31.03"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "mode:local", "api:POST /api/llm/v1/chat/completions", "file:apps/web/lib/services/managed-office-file-service.ts", "file:apps/web/lib/e2b/gate.ts", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "5 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-04 Create a PDF or other document from text

Makes a PDF from text. On Web the assistant has a file tool that builds a PDF from a title and markdown-like text, and artifacts have a 'Download as PDF' action for documents and slide decks. Mobile exports documents and decks to PDF on the device. Word, spreadsheet or slide file conversion to PDF was not found.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.01](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3101), [S31.02](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3102), [S31.03](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3103).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Produces a downloadable PDF from text content. The Web tool takes a filename, a title and up to 100,000 characters (apps/web/lib/services/managed-office-file-service.ts:190-197) and lays them out on A4 pages with 20 mm margins using a PDF library (managed-office-file-service.ts:796-842). Artifact and deck PDFs are made in the browser (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1642-1666).

**Why it exists.** Brief S31.01 to S31.03 want text documents, spreadsheets and slide decks turned into PDF (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). People expect to receive a real file.

**Who uses it.** Web, Mobile and Tauri desktop users who ask for a PDF or press a download button.

**Problems it solves**

- Sharing a chat answer or report as a file
- Printing or sending a slide deck as PDF

**Use cases**

- Ask 'make a PDF of this report'
- Open a document artifact and choose 'Download as PDF'
- Open a slide-deck artifact and download it as a PDF
- On a phone, export an artifact as PDF from the export sheet

## 2. User experience

**Where to find it**

- Web chat: the model calls the file tool when asked for a PDF; creation intent is detected from words such as create, make, export together with pdf (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:914-916, 993-997)
- Web artifacts: menu items 'Download as PDF' for presentations and text documents (ArtifactPreview.tsx:2397-2411)
- Mobile: artifact export sheet with 'PDF' and details 'A styled document' or 'A document you can print' (apps/mobile/src/features/chat/utils/artifactExport.ts:62, 95)
- Desktop Electron: hosted web app; Tauri build has a document_create_pdf agent tool that takes output_path, title, author and a paragraphs list and writes to a local path on the device, with no markdown headings or bullets (apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs:321-347)
- CLI, VS Code, Chrome: missing

**Before you start**

- Web file tool: signed-in chat turn in which office creation is on; the request must be streaming and the model tool-capable, otherwise HTTP 422 office_creation_stream_required or office_creation_model_unsupported (request-processor.ts:5460-5490)
- Render check: sandbox execution set up (see current_implementation)

**Screens and controls**

- Web: download chip or card for the generated file; artifact menu entries; toasts 'Preparing the PDF…', 'PDF downloaded', 'The PDF could not be made' (ArtifactPreview.tsx:1643-1655)
- Mobile: export list in apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx

**Journey**

1. Ask for a PDF, or open an artifact
2. Web tool: the model sends filename, title, content
3. Server builds the PDF and attaches it to the reply
4. Person downloads it

**What the person sees and gets**

- A PDF file
- On a failed tool call: 'The file could not be created.' (managed-office-file-service.ts:1066-1078) or the render-check error 'Rendering verification requires an available Office execution environment.' (managed-office-file-service.ts:1038-1041)
- When persistence of the generated file fails: 'The Office file could not be attached.' (tool-loop.ts:2575-2606)
- Mobile error 'Cannot export empty content' (apps/mobile/services/fileCreation.ts:186-188)

**Settings**

- verify_render option on the tool: asks for a real rendered check of the file (managed-office-file-service.ts:193, 278-282)
- Office render template name set by AGI_E2B_CHAT_TEMPLATE and execution switch AGI_E2B_EXECUTION (apps/web/lib/e2b/chat-template.ts:1; apps/web/lib/e2b/gate.ts:6)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web tool: PDF with title, headings (#), bullets, numbered lines and pipe tables, wrapped on A4 pages (managed-office-file-service.ts:796-842)
- Web tool: pipe tables are rendered as plain text lines with ' | ' separators (no grid) and the divider row is skipped (managed-office-file-service.ts:837-841)
- Web tool: PDF is part of the schema with strict fields (managed-office-file-service.ts:190-197) and the tool description lists PDF (line 253)
- Web tool is added to the turn when creation intent is detected (request-processor.ts:1258-1266, 5494) and runs in the tool loop (tool-loop.ts:2562-2575)
- Web tool: the generated bytes are saved through persistGeneratedFileBytes (provider 'agi-managed-office', origin 'managed-office-tool', tied to the conversation) and attached to the conversation; files over 20 MiB are rejected (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2575-2606; apps/web/lib/server/generated-file-persist.ts:17, 217, 242)
- Web tool: PDF creation requires a streaming chat request and a tool-capable model, otherwise HTTP 422 office_creation_stream_required or office_creation_model_unsupported (request-processor.ts:5460-5490)
- Web artifacts: documents and decks export to PDF in the browser (ArtifactPreview.tsx:1642-1666; apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts:491-494; apps/web/features/chat/services/export-pdf.ts:1179)
- Mobile: markdown to PDF and deck HTML to PDF on the device through the system print service (apps/mobile/services/fileCreation.ts:181-215; apps/mobile/src/features/chat/utils/artifactExport.ts:122-125, 138)
- Tauri desktop: document_create_pdf tool via printpdf; it needs app_handle and takes output_path (required), optional title and author, and a required non-empty string array 'paragraphs' (not text or markdown), then calls document_create_pdf_simple and writes to a local path (document_tools.rs:321-347; apps/desktop/src-tauri/src/features/document/create_pdf.rs:64)

**Incomplete**

- verify_render: needs a sandbox with LibreOffice and poppler; the build script installs those but an owner step is pending per the brief (apps/web/scripts/build-e2b-office-template.mjs:9-17; brief S31.03 'Unfinished')
- Render check converts and rasterises the file for a receipt (apps/web/lib/services/managed-office-preservation.ts:970-1060); whether a converted PDF of a docx, xlsx or pptx is ever returned to the person: unknown

**Present but disconnected or switched off**

- Tauri direct IPC commands for document creation were cut or deregistered (doc: docs/decisions/wire-or-cut.md:843-844); the agent tool path exists

**Not available**

- Converting an existing Word, spreadsheet or slide file to PDF as a person-facing action: not found in any app (S31.01 conversion, S31.02, S31.03 as written). The brief's code cites (apps/web/lib/server/container-files.ts:196; chat-attachment-hydration.ts:466) do not do this: container-files.ts fetches provider-hosted files
- Mobile server-tool PDF creation: docs say Mobile should not be the first heavy local generation surface (doc: docs/product/definition.md:475)
- CLI, VS Code, Chrome

## 4. Required behaviour

**Established requirements**

- The user can turn a text document (Word, text, markdown) into a PDF file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.01)
- The user can turn a spreadsheet into a PDF file. (source: S31.02 (same brief))
- The user can turn a slide deck into a PDF with one page per slide. (source: S31.03 (same brief); status partial with an owner-run sandbox template step)
- Mobile should not be the first heavy local PDF/PPTX/DOCX generation surface. (source: doc: docs/product/definition.md:475)

**Acceptance criteria**

1. Ask on Web for a one-page PDF with a heading and two bullets: a PDF downloads and opens with them
2. Content over 100,000 characters is refused by the tool schema
3. Ask with verify_render and no sandbox: a clear error is returned
4. Download a document artifact as PDF on Web: the file opens
5. Download a slide-deck artifact as PDF: one page per slide
6. Mobile export of an artifact to PDF saves a file and shows it
7. A spreadsheet or Word file attached and 'convert to PDF' asked: record the actual result (feature not found)

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Page breaks for long text are added when the cursor passes the bottom margin [inferred from generatePdf]

**Proposed improvements** (suggestions, not requirements)

- [proposed] A conversion tool for existing docx, xlsx, pptx using the office sandbox

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | generatePdf | `apps/web/lib/services/managed-office-file-service.ts` | A4 layout with jsPDF, including headings, bullets, numbered lines and pipe tables as ' / ' text rows (796-842) |
| schema | ManagedOfficeFileInputSchema (pdf) | `apps/web/lib/services/managed-office-file-service.ts` | filename, title up to 200, content up to 100000 characters, verify_render (190-197) |
| service | createManagedOfficeFileToolDefinition | `apps/web/lib/services/managed-office-file-service.ts` | Tool definition shown to the model (233-290) |
| service | generateManagedOfficeFile | `apps/web/lib/services/managed-office-file-service.ts` | Builds the file and optional render verification (930-1078) |
| service | renderManagedOfficeFile | `apps/web/lib/services/managed-office-preservation.ts` | LibreOffice convert and page raster in the sandbox (970-1060) |
| service | applyManagedOfficeFileCreation | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the tool to the turn (1258-1266, 5494); rejects non-streaming or non-tool models with 422 (5460-5490) |
| service | tool loop office file branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool, obtains the sandbox executor (2562-2575) and persists the generated bytes (2575-2606) |
| service | persistGeneratedFileBytes | `apps/web/lib/server/generated-file-persist.ts` | Saves tool-created file bytes; 20 MiB cap (17, 217, 242) |
| config | E2B gate | `apps/web/lib/e2b/gate.ts` | AGI_E2B_EXECUTION and E2B_API_KEY names (6-13) |
| config | E2B chat template name | `apps/web/lib/e2b/chat-template.ts` | AGI_E2B_CHAT_TEMPLATE name (line 1) |
| job | build-e2b-office-template | `apps/web/scripts/build-e2b-office-template.mjs` | Builds the office sandbox template (LibreOffice, poppler) |
| component | ArtifactPreview export handlers | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Download as PDF for documents and decks (1642-1666, 2392-2411) |
| service | downloadDeckPdf | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Deck to PDF in the browser (491-494) |
| service | renderPdfDocument | `apps/web/features/chat/services/export-pdf.ts` | Document blocks to PDF (1179) |
| service | exportToPDF / exportHtmlToPDF | `apps/mobile/services/fileCreation.ts` | Mobile PDF through the system print service (181-215) |
| service | artifact export options | `apps/mobile/src/features/chat/utils/artifactExport.ts` | PDF entries and deck export (62, 95, 122-138) |
| component | ArtifactExportSheet | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | Mobile export list |
| command | execute_document_create_pdf_tool | `apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs` | Tauri agent tool taking output_path, title, author and a paragraphs list (321-347) |
| service | PDF creator | `apps/desktop/src-tauri/src/features/document/create_pdf.rs` | printpdf creation (64, 326) |
| test | managed-office-file-service test | `apps/web/lib/services/managed-office-file-service.test.ts` | Includes 'creates a real PDF and a real CSV' (line 200) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks for a PDF; the server detects creation intent and adds the file tool to the turn (the request must be streaming and the model tool-capable, else HTTP 422 office_creation_stream_required / office_creation_model_unsupported) | our servers | request-processor.ts:914-916, 993-997, 5460-5494 |
| The chat model calls the tool with filename, title and content | outside service | managed-office-file-service.ts:233-290; model route per SYS-inference-providers |
| The server validates and builds the PDF in process with jsPDF | our servers | managed-office-file-service.ts:796-842, 1034-1035 |
| If verify_render is set, a sandbox converts and rasterises it for a receipt; with no sandbox the call fails | outside service | managed-office-file-service.ts:1036-1042; managed-office-preservation.ts:970-1060 |
| The tool loop saves the bytes with persistGeneratedFileBytes (provider 'agi-managed-office', origin 'managed-office-tool', tied to the conversation) and attaches the file to the reply for download, returning file name, uri, mime and byte_count; if saving fails the reply is 'The Office file could not be attached.' | our servers | managed-office-file-service.ts:1052-1058 result; tool-loop.ts:2575-2606; generated-file-persist.ts:17, 217, 242 |
| Artifact PDF on Web: built in the browser and saved by the browser | device | deck-pdf.ts:491-494 |
| Mobile: the system print service writes a PDF file, moved to an export path | device | fileCreation.ts:190-200 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated PDF (tool path) | Saved through persistGeneratedFileBytes and tied to the conversation; the underlying storage backend and retention period were not traced | Attached to the conversation | Not traced beyond the conversation link; files over 20 MiB are rejected |
| Artifact PDF (Web) and Mobile export file | Downloaded to the device; Mobile export path via allocateExportPath (fileCreation.ts:196-198) | No | Kept by the user |

**Models and providers.** The chat model only writes the text and calls the tool. PDF layout is done by code, not by a model. The server requires a tool-capable model (tools !== false) and a streaming request for office creation (request-processor.ts:5460-5490).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web tool: signed-in chat. Artifact download and Mobile export: not checked for sign-in. |
| Permissions | none found in the code for the tool beyond the chat turn rules |
| Subscription | Render check availability is an environment gate: e2bExecutionEnabled is true with an E2B_API_KEY or AGI_E2B_EXECUTION=1 (apps/web/lib/e2b/gate.ts:9-13); provisioning needs the flag =1 and the key and sandboxComputeIsPriceable (gate.ts:23-30). The managed-compute beta gate is separate. No plan check appears in these lines (gate.ts:9-37); plan rules for the tool itself: none found in the code read |
| Limits and metering | Content up to 100,000 characters, title up to 200 (managed-office-file-service.ts:195-196); a generated file is capped at 20 MiB (20 * 1024 * 1024 bytes) and larger output is rejected (generated-file-persist.ts:17, 242); sandbox compute metered by compute-metering (imported in gate.ts) |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE (names only) |
| Model compatibility | Web PDF creation requires a streaming chat request and a tool-capable model; otherwise HTTP 422 office_creation_stream_required or office_creation_model_unsupported (request-processor.ts:5460-5490) |
| Provider restrictions | none found in the code read |
| Local mode | Mobile exports on the device in any mode. The Tauri tool creates on the device. The Web tool needs our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid tool input | Returns an invalid-request failure describing the bad field | managed-office-file-service.ts:937-940 |
| Render check without sandbox | Error 'Rendering verification requires an available Office execution environment.' | managed-office-file-service.ts:1038-1041 |
| Any build error | code office_file_generation_failed with message 'The file could not be created.' unless a ManagedOfficeProcessingError | managed-office-file-service.ts:1066-1078 |
| Non-streaming request or model without tool support | HTTP 422 office_creation_stream_required or office_creation_model_unsupported | request-processor.ts:5460-5490 |
| Generated file over 20 MiB or persistence failure | File is rejected and the reply says 'The Office file could not be attached.' | tool-loop.ts:2575-2606; generated-file-persist.ts:17, 242 |
| Web artifact PDF failure | Toast 'The PDF could not be made' or 'This document could not be exported as PDF' | ArtifactPreview.tsx:1649-1665 |
| Mobile empty content | Throws 'Cannot export empty content' | fileCreation.ts:186-188 |
| Cancel (tool) | The abort signal is passed to the render call on the PDF path; plain generation is not interruptible | managed-office-file-service.ts:1047 |
| Offline | not handled in the code read | none: no offline handling found in the files cited on this page |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Tool output including a real PDF and CSV
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Render of office files (needs the sandbox; run state unknown)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Tool loop with the office file tool
- `apps/web/lib/services/chat-tool-provider-schemas.test.ts`: Tool schema shape per provider
- `apps/mobile/__tests__/file-creation-managed-file.test.ts`: Mobile exports including PDF with a mocked print service
- `apps/mobile/__tests__/file-creation-native-names.test.ts`: Mobile export file names
- `apps/web/features/chat/components/artifacts/InlineArtifactCards.test.tsx`: Artifact cards listing the PDF format

**Test scenarios**

- **Chat PDF**
  1. On Web ask 'create a PDF titled Plan with 3 bullets'
  2. Download and open
  - Expected: A4 PDF with title and bullets
- **Long text**
  1. Ask for a PDF of 5 pages of text
  - Expected: Several pages, 20 mm margins
- **Pipe table**
  1. Ask for a PDF containing a markdown pipe table
  - Expected: Rows appear as text lines with ' | ' separators, no grid, divider row skipped
- **Render check**
  1. With no sandbox configured request a verified PDF
  - Expected: Clear error about the environment
- **Deck PDF**
  1. Open a slide-deck artifact
  2. Download as PDF
  - Expected: One page per slide
- **Mobile export**
  1. Open an artifact on Mobile
  2. Choose PDF
  - Expected: A PDF file is saved
- **Convert existing file**
  1. Attach a .docx and ask for a PDF copy
  - Expected: Record what happens; a direct conversion path was not found

**Where to look when it fails**

- Failure code office_file_generation_failed
- Tool loop message 'Unknown tool' when the tool is not offered (tool-loop.ts:2564)
- HTTP 422 codes office_creation_stream_required and office_creation_model_unsupported (request-processor.ts:5460-5490)
- Reply 'The Office file could not be attached.' when persistence fails (tool-loop.ts:2575-2606)
- Mobile export errors from fileCreation.ts

**Hands-on test plans**

- Web: [70-qa/test-plans/web/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/web/031-pdf-and-document-transformation-products.md)
- Desktop: [70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md)
- Mobile: [70-qa/test-plans/mobile/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/mobile/031-pdf-and-document-transformation-products.md)

## 10. Gaps and dependencies

- **No conversion of existing Word, spreadsheet or slide files to PDF** Affects: All apps; S31.01, S31.02, S31.03. Evidence: Searches found only text-to-PDF, artifact exports and a render check. Work needed: Use the office sandbox to convert and return the PDF; finish the owner template step
- **Brief says mobile done for S31.01 and S31.02 but cited code is attachment validation and parsing, not PDF creation** Affects: Brief accuracy. Evidence: apps/mobile/src/features/chat/utils/attachmentValidation.ts:121; apps/mobile/services/docParser.ts. Work needed: Correct the brief; Mobile exports artifacts to PDF instead
- **Sandbox render depends on an owner-run template step and flags** Affects: Web verified-render requests. Evidence: Brief S31.03 'Unfinished'; build-e2b-office-template.mjs. Work needed: Owner builds the template and sets the flags, then live-check
- **Storage backend and retention period of tool-created files not traced beyond persistGeneratedFileBytes** Affects: All Web users. Evidence: tool-loop.ts:2575-2606; generated-file-persist.ts:17, 217, 242. Work needed: Trace the storage backend and retention
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- mode:local
- api:POST /api/llm/v1/chat/completions
- file:apps/web/lib/services/managed-office-file-service.ts
- file:apps/web/lib/e2b/gate.ts
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries

## Unknown

- Storage backend and retention period of the tool-created PDF (it is saved through persistGeneratedFileBytes and attached to the conversation)
- Whether the sandbox-rendered PDF of office files is ever returned
- Whether Electron Desktop was driven for this
- Whether the owner template step is done

## Second reader's check

A second reader checked 11 statements of this page against the code: 5 correct, 6 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Wrong (section 3):** "Pipe tables: PDF layout lines read handle headings and bullets only; table output not confirmed" The code shows: generatePdf has an explicit table branch: isTableRow, skips dividers and writes cells joined with ' | '. (apps/web/lib/services/managed-office-file-service.ts:837-841). **Corrected:** The PDF tool renders pipe tables as plain text lines with ' | ' separators (no grid), and skips the divider row. Headings, bullets, numbered lines and tables are all handled.
- **Partly wrong (section 3/10):** "Web tool: PDF with title, headings (#), bullets and numbered lines, wrapped on A4 pages (796-822)" The code shows: A4 wrap, headings (#{1,3}) and bullets/numbered lines are correct, but the function runs to about line 842, and the table branch sits after line 822. Margin constant PDF_MARGIN_MM is used (page's '20 mm' not checked here). (managed-office-file-service.ts:796-842). **Corrected:** Cite 796-842; add table rows.
- **Wrong (section 6/7/8):** "Generated PDF (tool path) stored in: unknown; file size cap MAX_GENERATED_FILE_BYTES value not read; file attached to reply, 'storage path not traced'" The code shows: The tool loop persists the bytes with persistGeneratedFileBytes (provider 'agi-managed-office', origin 'managed-office-tool', tied to conversationId) and returns file name/uri/mime/byte_count plus generatedFiles. The cap is 20 * 1024 * 1024 bytes (20 MiB); larger output is rejected, and the reply is 'The Office file could not be attached.' when persistence fails. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2575-2606; apps/web/lib/server/generated-file-persist.ts:17, 217, 242). **Corrected:** The tool-created PDF is saved through persistGeneratedFileBytes and attached to the conversation; the cap is 20 MiB. Remove these from Unknown.
- **Partly wrong (section 7):** "Model compatibility: Needs a model that can call tools [inferred]; Permissions/limits: none found" The code shows: Not inferred. The server rejects office creation with 422 office_creation_stream_required when the request is not streaming, and 422 office_creation_model_unsupported when the resolved model has tools === false. (request-processor.ts:5460-5490). **Corrected:** Web PDF creation requires a streaming chat request and a tool-capable model; otherwise HTTP 422 with those codes.
- **Partly wrong (section 3):** "Tauri desktop: document_create_pdf tool via printpdf; text from the user" The code shows: The executor needs app_handle and takes output_path (required), optional title and author, and a required non-empty string array 'paragraphs' (not text/markdown), then calls document_create_pdf_simple. Page implies same text/markdown input as Web. (apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs:321-347). **Corrected:** The Tauri tool takes output_path, title, author and a paragraphs list and writes to a local path on the device; no markdown headings or bullets.
- **Partly wrong (section 7):** "Subscription: Sandbox render check depends on managed compute and provisioning gates (gate.ts:15-30)" The code shows: e2bExecutionEnabled is true with an E2B_API_KEY OR the flag =1 (lines 9-13); provisioning needs flag=1 AND key AND sandboxComputeIsPriceable (23-30). The managed-compute beta gate is a separate gate, not required for e2bExecutionEnabled. No plan check appears in these lines. (apps/web/lib/e2b/gate.ts:9-37). **Corrected:** Render check availability is an environment gate (key or AGI_E2B_EXECUTION=1; provisioning also needs priceable compute). The beta gate is separate.

**Facts the page missed**

- Tool-created files are persisted and attached to the conversation through persistGeneratedFileBytes, capped at 20 MiB (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2575-2606; apps/web/lib/server/generated-file-persist.ts:17,242). The page lists this as unknown.
- Web PDF creation requires stream:true and a tool-capable model, else HTTP 422 office_creation_stream_required / office_creation_model_unsupported (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5460-5490).
- The PDF generator renders pipe tables as ' | ' text rows (apps/web/lib/services/managed-office-file-service.ts:837-841); the Tauri tool takes a paragraphs array and output_path rather than markdown (apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs:321-347).
