---
id: "F031-03"
type: "feature"
title: "Read scanned (image-only) PDFs"
aliases: ["Scanned-document OCR", "Scanned PDF reading", "Image-only PDF", "S31.08", "transcribeScannedPages", "scanned-page-reader"]
area: "31 PDF and document-transformation products"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "F031-01", "F031-02", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-03 Read scanned (image-only) PDFs

A PDF with no text layer is read from page images. Web extracts embedded page bitmaps and sends them to a vision model with the chat turn. For project knowledge, a model transcribes the images into stored text, with usage billed. Mobile Local and Tauri desktop report 'no text' instead.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.08](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3108).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Makes scanned PDFs usable. For chat, Web turns image-only pages into PNG images and attaches them (apps/web/lib/server/pdf-attachment-content.ts:247-268). For project knowledge, a model reads the images back as text on a managed route (apps/web/lib/server/scanned-document-text.ts:97-228).

**Why it exists.** Brief S31.08: text in a scanned PDF must be recognised and usable (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). Without it a scan would be an empty file.

**Who uses it.** People with scanned letters, forms and books, on Web or the Electron Desktop.

**Problems it solves**

- A scan has no copyable text
- Project files that used to be stored empty and could never be answered from (project-knowledge-extraction.ts:123-128 comment)

**Use cases**

- Attach a scanned receipt and ask for the total
- Upload a scanned book chapter into a project and ask questions
- Attach a mixed PDF where only some pages are scans

## 2. User experience

**Where to find it**

- Web chat composer (same attach control as F031-01)
- Web project knowledge upload (apps/web/app/api/projects/[id]/knowledge-files/route.ts:109)
- Desktop Electron: hosted web
- Mobile and Tauri: not available as image reading
- CLI, VS Code, Chrome: missing

**Before you start**

- A model that can read images for the chat path
- For project knowledge: a managed route admitted for the plan; the privacy setting 'Only use models that do not train on your chats' may block reading (scanned-document-text.ts:62-68)

**Screens and controls**

- Same attach control; the model is told '[name has no text layer; its pages are attached as images]' (chat-attachment-hydration.ts:732-738)
- Project knowledge: a message when scanned text was withheld (scanned-document-text.ts:68-69)

**Journey**

1. Attach or upload a scanned PDF
2. Ask a question
3. Web sends page images; the model reads them and answers
4. For project knowledge the file is stored with transcribed text and a note that it was read from a scan

**What the person sees and gets**

- Answer from page images
- Note for omitted pages '[name: scanned pages ... did not fit in this message and were not included]'
- Stored note: 'Recognised from page images. This document had no text layer, so the text below was read from the scan by a model and may contain mistakes.' (scanned-document-text.ts, SCANNED_DOCUMENT_OCR_NOTE)
- Refusal for projects: 'This PDF has more scanned pages than project knowledge extraction reads. Split it and upload the parts.' (project-knowledge-extraction.ts:173-177)

**Settings**

- Privacy setting that keeps files away from models that may train on them (scanned-document-text.ts:62-68)
- Policy caps: maxOcrPagesPerFile 100, ocrPagesPerTurn 8, ocrBatchPages 4 (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:75-81 region)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chat: if no page has text, every page is a candidate for an image; otherwise only blank pages (pdf-attachment-content.ts:247-250)
- Web chat: up to 30 images and 8 MB of images; extra pages are listed as omitted (pdf-attachment-content.ts:10, 16, 255-266)
- Web chat: image parts are added after a '[Page n]' text part (chat-attachment-hydration.ts:701-707)
- Project knowledge: a managed vision route reads page images, with a cost reservation and a failure path that records zero cost (scanned-document-text.ts:97-228)
- Project knowledge: mixed PDFs have blank-page text replaced by the transcription (project-knowledge-extraction.ts:180-193)
- Reading is withheld when no route that keeps inputs out of training exists, with a reason (scanned-document-text.ts:102-115)

**Incomplete**

- Web: renderPageImage does not draw the page; it takes the first embedded image on the page and only if it is an RGB or RGBA bitmap (pdf-attachment-content.ts:159-194). Other image kinds return null and the page is skipped without being listed as omitted (line 261) [inferred consequence]
- Web: when no page has text, image candidates cover all pages of the file, not only the first 250 (pdf-attachment-content.ts:250)
- Project knowledge: transcription output is split on blank lines; if the part count differs from the image count, all text lands on the first scanned page (project-knowledge-extraction.ts:182-190)
- Output capped at 4,000 tokens per transcription call (scanned-document-text.ts:41)

**Present but disconnected or switched off**

- Large-file scanned-page reading is written (apps/web/lib/server/tools/scanned-page-reader.ts:138-) but the one turn caller found passes scannedPages: null (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5635), so it answers 'could not be read'

**Not available**

- Searchable-PDF output with a text layer (S31.21 missing)
- Mobile Local image reading: the parser throws 'No readable text was found in this PDF' (apps/mobile/services/docParser.ts:427-429); the prompt gets 'content could not be extracted on-device' (attachmentContext.ts:47-52). Whether Mobile Cloud sends scans to the same server path was not traced
- Tauri desktop: text-only note (attachments.rs:260-266)
- CLI, VS Code, Chrome

## 4. Required behaviour

**Established requirements**

- Text in a scanned (image-only) PDF is recognised and usable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.08)
- A transcription from a scan must say so where a reader sees it, because a model's reading can be wrong. (source: apps/web/lib/server/scanned-document-text.ts (comment above SCANNED_PAGES_OCR_NOTE and the note text))

**Acceptance criteria**

1. Attach a scanned 2-page PDF to a Web chat on an image-capable model: the answer uses the printed words
2. Attach a 40-page scan: pages beyond the image or byte budget are named in an omission note
3. Upload a scanned PDF to a project: stored text begins with the 'Recognised from page images' note
4. Upload a scan while 'Only use models that do not train on your chats' is on and no such route exists: the file is kept and a withheld message is shown
5. Upload a project PDF with more scanned pages than the cap: refused with 'Split it and upload the parts.'
6. Mobile Local with a scan: no crash, and the model is told content could not be extracted

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Scans that store their image in a form other than RGB or RGBA may be skipped silently on Web

**Proposed improvements** (suggestions, not requirements)

- [proposed] Render the page instead of lifting an embedded bitmap
- [proposed] List skipped pages in the omission note
- [proposed] Connect scanned-page OCR for large files or remove the dead path

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | renderPageImage / encodePng | `apps/web/lib/server/pdf-attachment-content.ts` | Lifts an embedded bitmap and writes a PNG (94-194) |
| service | extractPdfAttachmentContent | `apps/web/lib/server/pdf-attachment-content.ts` | Picks which pages become images and enforces caps (247-268) |
| service | PDF block in hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Builds image_url parts and omission note (700-745) |
| service | transcribeScannedPages | `apps/web/lib/server/scanned-document-text.ts` | Managed vision call, admission, reservation, usage record (97-228) |
| service | extractPdfText (project knowledge) | `apps/web/lib/server/project-knowledge-extraction.ts` | Chooses transcription, merges with text pages, refuses oversize (151-204) |
| service | project knowledge file create | `apps/web/lib/server/project-knowledge-files.ts` | Passes transcribeScans with plan tier and a per-document id (line 319) |
| endpoint | api:POST /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Create knowledge file (line 109) |
| service | readScannedPages | `apps/web/lib/server/tools/scanned-page-reader.ts` | Per-page OCR for large files with turn and file caps (25-31, 138-) |
| service | file search tool | `apps/web/lib/server/tools/file-search-tool.ts` | Accepts scannedPages and calls the reader (195, 624) |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Passes scannedPages: null (5635) |
| service | admitManagedCloudRoute | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Chooses the managed vision route (imported at scanned-document-text.ts) |
| service | parseDocument pdf case | `apps/mobile/services/docParser.ts` | Throws EMPTY_DOCUMENT for no text (416-433) |
| command | extract_pdf_text | `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs` | Tauri: notes image-based PDFs (255-266) |
| config | chat attachment policy | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | OCR page caps |
| test | scanned-document-text test | `apps/web/lib/server/scanned-document-text.test.ts` | Transcription tests |
| test | scanned-page-reader test | `apps/web/lib/server/tools/__tests__/scanned-page-reader.test.ts` | Reader tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server opens the PDF, finds pages with no text and lifts their embedded bitmap to PNG | our servers | pdf-attachment-content.ts:247-268 |
| Chat: PNG parts go to the chat model with the turn | our servers | chat-attachment-hydration.ts:701-707 |
| The model provider reads the images and answers | outside service | SYS-inference-providers |
| Project knowledge: a managed route is admitted for the plan, a cost reservation is taken, a vision model transcribes up to the output cap, usage is finalised | our servers | scanned-document-text.ts:102-200 |
| Transcribed text is stored with page anchors and a mistakes-possible note | our servers | project-knowledge-extraction.ts:180-203 |
| Mobile Local and Tauri: no image path; text-only parse and a note | device | docParser.ts:427-429; attachments.rs:260-266 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Page images | Memory during the turn; sent inline as base64 data | No | Not stored by this path as far as read |
| Transcribed text for project knowledge | Project knowledge extracted-text store (table name not read) | Server side | Project lifecycle and cleanup files exist (project-knowledge-lifecycle.ts, project-knowledge-cleanup.ts); rules not read |
| Cost reservation and usage record of type scanned_document_ocr | Managed usage request records (managed-usage-request-service) | Server side | unknown |

**Models and providers.** Chat path: the user's chosen vision-capable model reads the images. Project knowledge: a managed route chosen by admission for a multimodal task (scanned-document-text.ts:43-44, 102-106); a route that keeps inputs out of training is required when Google data is involved or the person turned the setting on.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in for both server paths. |
| Permissions | Files from a Google connector may only go to a route that keeps inputs out of training (scanned-document-text.ts:58-61, 84-87) |
| Subscription | Plan tier is passed to route admission and cost reservation (scanned-document-text.ts:102-106, 146-165). Chat path: normal attachments-per-plan rules. |
| Limits and metering | Chat: 30 images, 8 MB (pdf-attachment-content.ts:10, 16). Project knowledge: cost is estimated and reserved, usage type scanned_document_ocr, idempotency key per document (scanned-document-text.ts:146-165, 190-196). Large file policy: 100 OCR pages per file, 8 per turn, 4 per batch (chat-attachment-policy.json). |
| Feature flags | none found in the code for the chat path |
| Model compatibility | Chat path needs a vision model; the Web banner blocks otherwise (ChatComposerNew.tsx:1538-1560). |
| Provider restrictions | The managed route must accept images and, when required, keep inputs out of training. |
| Local mode | Mobile Local: the on-device reader gives no image reading. Tauri desktop: no image reading. Whether any on-device vision model reads scans: not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Scan too long for chat | Pages beyond limits listed in the note and omitted | pdf-attachment-content.ts:255-266; chat-attachment-hydration.ts:709-713 |
| Scan, no usable bitmap | '[name contains no readable text]' | chat-attachment-hydration.ts:746-751 |
| No managed vision route admitted | Returns null; the file is stored without text; a warning is logged | scanned-document-text.ts:117-123 |
| Transcription provider error | Warning logged, usage finalised as failed with zero cost, file stored without text | scanned-document-text.ts:206-228 |
| Transcription blank | Null result | scanned-document-text.ts:201 |
| Withheld by privacy setting | File kept; user told why the scanned part is missing | scanned-document-text.ts:68-69; project-knowledge-extraction.ts:181, 198 |
| Cancel, offline, retry | not handled in the code read; the transcription call uses a fresh AbortController that nothing aborts | scanned-document-text.ts:166-170 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/pdf-attachment-content.test.ts`: Omitted scanned pages when images are not allowed (line 152)
- `apps/web/lib/server/scanned-document-text.test.ts`: Transcription of scanned pages (cases not individually read)
- `apps/web/lib/server/project-knowledge-extraction.test.ts`: Project extraction, possibly scans (cases not read)
- `apps/web/lib/server/tools/__tests__/scanned-page-reader.test.ts`: Scanned-page reader caps
- `apps/mobile/__tests__/docParser.test.ts`: Mobile parser; EMPTY_DOCUMENT behaviour not individually read

**Test scenarios**

- **Scanned PDF chat**
  1. On Web with an image-capable model attach a scanned 2-page PDF
  2. Ask what it says
  - Expected: Answer from the printed text
- **Scan with unusual image encoding**
  1. Attach a scan whose pages are grayscale or bilevel
  - Expected: Check whether pages are silently dropped (suspected)
- **Scan over caps**
  1. Attach a 40-page scan
  - Expected: Note listing omitted pages
- **Project knowledge scan**
  1. Upload a scanned PDF to a project
  2. Open its stored text
  - Expected: Begins with the 'Recognised from page images' note
- **Privacy setting**
  1. Turn on 'Only use models that do not train on your chats'
  2. Upload a scan
  - Expected: File kept, withheld message shown
- **Mobile Local scan**
  1. Local mode, attach a scan
  - Expected: Content-not-extracted note, no image reading

**Where to look when it fails**

- Log '[ocr] no managed vision route is admitted; the scan is stored without text'
- Log '[ocr] scanned page transcription failed; the document is stored without text'
- Error name ScannedTextWithheldError
- Usage type scanned_document_ocr
- Messages SCANNED_PAGE_* in scanned-page-reader.ts:25-31

**Hands-on test plans**

- Web: [70-qa/test-plans/web/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/web/031-pdf-and-document-transformation-products.md)
- Desktop: [70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md)

## 10. Gaps and dependencies

- **Page image is an embedded bitmap, not a rendered page** Affects: Web chat users with non-RGB scans or scans with several images per page. Evidence: pdf-attachment-content.ts:159-194. Work needed: Render pages or handle more bitmap kinds; list skipped pages
- **Large-file OCR path not connected** Affects: Web users with big scanned PDFs. Evidence: tool-loop.ts:5635 passes null. Work needed: Pass an entitled OCR object or remove
- **Mobile Local and Tauri have no scan reading** Affects: Mobile Local, Tauri. Evidence: docParser.ts:427-429; attachments.rs:260-266. Work needed: On-device OCR or route to Cloud with consent
- **Mobile Cloud scan path not traced** Affects: Mobile Cloud. Evidence: chatExecutionStore.ts:2720-2745 sends an asset id. Work needed: Verify on a device
- **No searchable output** Affects: All apps. Evidence: Brief S31.21 missing. Work needed: Out of scope here
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- F031-01
- F031-02
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing

## Unknown

- Name of the table holding project knowledge extracted text
- Whether Electron Desktop was verified with a scan
- Quality of results on real scans
- Whether Mobile Cloud scans reach the same server path
- Retention of cost records
- Which bitmap kinds real scanners produce
