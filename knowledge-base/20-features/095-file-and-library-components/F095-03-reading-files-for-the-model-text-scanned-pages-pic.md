---
id: "F095-03"
type: "feature"
title: "Reading files for the model (text, scanned pages, pictures)"
aliases: ["Document parsers", "OCR", "Scanned page reading", "Extraction store", "extracted_text", "Library thumbnail", "Image preprocessing", "Model image preparation", "chat file preparation"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.07", "S95.08", "S95.14", "S95.09", "S95.12", "S95.13"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "F095-01", "F095-02", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-03 Reading files for the model (text, scanned pages, pictures)

Turns uploaded files into things a model and a person can use. PDFs, Office files, notebooks and text give their text. Scanned PDF pages are read by a vision model on a metered managed route. The Library draws a small WebP preview of pictures on request. Pictures are shrunk at request time for models.

Area: [95. File and Library components](README.md). Requirement items: [S95.07](../../10-requirements/capabilities/095-file-and-library-components.md#s9507), [S95.08](../../10-requirements/capabilities/095-file-and-library-components.md#s9508), [S95.14](../../10-requirements/capabilities/095-file-and-library-components.md#s9514), [S95.09](../../10-requirements/capabilities/095-file-and-library-components.md#s9509), [S95.12](../../10-requirements/capabilities/095-file-and-library-components.md#s9512), [S95.13](../../10-requirements/capabilities/095-file-and-library-components.md#s9513).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Extracts text and page anchors for project sources (apps/web/lib/server/project-knowledge-extraction.ts:286), reads scanned pages through a model (apps/web/lib/server/scanned-document-text.ts:97), prepares chat files in steps (apps/web/lib/server/chat-file-preparation), makes a model-sized copy of pictures (apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:63) and renders Library thumbnails (apps/web/lib/server/library-thumbnail.ts:51).

**Why it exists.** Models read text and images, not file formats. A scan has no text layer, so without OCR the file would be listed but unanswerable (apps/web/lib/server/project-knowledge-extraction.ts:121-130 comment).

**Who uses it.** People asking questions about attached files or project sources, and anyone browsing the Library.

**Problems it solves**

- Scanned PDFs become searchable text.
- Large pictures fit provider limits without changing the stored file (model-image.ts comment).
- The Library shows previews without storing derivatives.

**Use cases**

- Ask about a scanned contract added to a project.
- Attach a spreadsheet and ask for totals.
- Browse picture thumbnails in the Library.
- Attach a large photo to chat.

## 2. User experience

**Where to find it**

- No dedicated screen. Triggered by upload and by asking about a file in web, desktop, mobile, CLI and Chrome chat (trigger screens not opened).
- Thumbnails: Library grid on web and desktop (shared view, packages/ui/unified-chat/src/components/library/LibraryView.tsx); mobile library uses a thumbnail hook (apps/mobile/src/features/library/useLibraryThumbnail.ts:2).

**Before you start**

- A Cloud account, a supported file, a plan with a vision-capable managed route for scans [inferred].

**Screens and controls**

- Library tile image; project source row summary; 'Ask about this file' composer in the viewer (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1349).

**Journey**

1. 1. Upload a document.
2. 2. The server extracts text; a scanned PDF page is sent as an image to a model.
3. 3. The text is saved on the source row with a note when a model read it.
4. 4. Ask a question; the model uses the text.

**What the person sees and gets**

- Row note: 'Some pages of this document had no text layer, so their text was read from the scan by a model and may contain mistakes.' (apps/web/lib/server/scanned-document-text.ts:30).
- Withheld notice when privacy settings block every vision route (apps/web/lib/server/scanned-document-text.ts:79).
- Errors such as 'This PDF has more scanned pages than project knowledge extraction reads. Split it and upload the parts.' (apps/web/lib/server/project-knowledge-extraction.ts:173-176).

**Settings**

- Privacy setting that keeps content away from providers that may train (apps/web/lib/server/scanned-document-text.ts:102-115).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- PDF text with page anchors, Office, notebook and plain text extraction for project sources (apps/web/lib/server/project-knowledge-extraction.ts:286-419).
- OCR through an admitted managed vision route with a usage reservation and finalization (apps/web/lib/server/scanned-document-text.ts:102-200).
- Chat file preparation readers for PDF, Office, spreadsheet, delimited and text, with OCR page files (apps/web/lib/server/chat-file-preparation/derived-keys.ts:86; apps/web/lib/server/tools/file-search-tool.ts:613).
- Thumbnail route renders a 640 px WebP from jpeg, png, webp or gif up to 30 MiB, auto-rotated (apps/web/lib/server/library-thumbnail.ts:6-9,51; apps/web/app/api/files/[id]/thumbnail/route.ts:50-104).
- Library list adds thumbnail_uri only when the file qualifies (apps/web/app/api/library/route.ts:76).
- Model picture copy: decode, resize and re-encode until it fits; stored file unchanged (apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:63).

**Incomplete**

- Extracted text is stored on project_knowledge_files (apps/web/lib/server/project-knowledge-files.ts:393), but where anchors are stored is not shown in the insert I read: unknown.
- Brief says thumbnails are 'missing' (S95.13); code has them. The brief is stale.

**Present but disconnected or switched off**

- Scans can be withheld when no no-training route exists (apps/web/lib/server/scanned-document-text.ts:79,102-115).

**Not available**

- Stored thumbnails: none, each request renders again (apps/web/app/api/files/[id]/thumbnail/route.ts:103 no-store).
- Metadata stripping on stored images: none found at upload; thumbnails go through sharp [inferred that sharp drops metadata by default].
- Previews for non-image files as generated files: not applicable per brief S95.12; text preview is served by /api/files/[id]/text (route folder exists).
- On-device OCR: none found.

## 4. Required behaviour

**Established requirements**

- Document parsers extract text from PDFs and office files for use by the model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.07)
- Scanned (image-only) pages are OCR-ed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.08)
- Images are preprocessed (resize, normalise, strip metadata) before storage or model use. (source: S95.09 (brief: platform missing))
- Thumbnails are generated for files. (source: S95.13 (brief: platform missing))
- Extracted text and anchors are stored for reuse. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.14)

**Acceptance criteria**

1. A text PDF added to a project has extracted text and page anchors.
2. A scanned PDF gets text with the OCR note and a usage reservation.
3. A scan for an account that opted out of training providers is stored without text and the person is told why.
4. A 40 MiB PNG gets no thumbnail (404 Thumbnail not available).
5. A 2 MP JPEG gets a WebP thumbnail with long edge 640 or less.
6. A PDF over the page limit is refused with the 'Split it' message.
7. The Library list carries thumbnail_uri only for qualifying pictures.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Costs of OCR should appear in the person's usage like other managed calls (reservation with plan tier).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief rows for S95.09 and S95.13 to partial.
- [proposed] Cache thumbnails if render cost matters; today none.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | extractProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-extraction.ts` | Per-type extraction and anchors. |
| service | transcribeScannedPages | `apps/web/lib/server/scanned-document-text.ts` | Vision call, admission, reservation, withheld reasons. |
| service | registerProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-files.ts` | Calls extraction with the OCR context; stores text. |
| service | project-knowledge-anchors | `apps/web/lib/server/project-knowledge-anchors.ts` | KnowledgeAnchor type and anchor building. |
| service | office-document-text | `apps/web/lib/server/office-document-text.ts` | Office text extraction. |
| service | chat-file-preparation | `apps/web/lib/server/chat-file-preparation/index.ts` | Step-wise reading of chat files. |
| service | derived-keys | `apps/web/lib/server/chat-file-preparation/derived-keys.ts` | Storage keys for OCR page text. |
| service | file-search-tool | `apps/web/lib/server/tools/file-search-tool.ts` | Reads pages and OCR on demand for a turn. |
| service | scanned-page-reader | `apps/web/lib/server/tools/scanned-page-reader.ts` | Scanned page reading helper. |
| service | prepareModelImage | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Request-time picture shrink. |
| service | library-thumbnail | `apps/web/lib/server/library-thumbnail.ts` | Rules and renderer. |
| endpoint | GET /api/files/[id]/thumbnail | `apps/web/app/api/files/[id]/thumbnail/route.ts` | Serves the thumbnail. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Adds thumbnail_uri. |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | extracted_text, extracted_at, summary. |
| config | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | OCR page limits per file and per turn. |
| hook | useLibraryThumbnail | `apps/mobile/src/features/library/useLibraryThumbnail.ts` | Mobile thumbnail path. |
| service | image-normalization | `apps/mobile/src/features/media/image-normalization.ts` | Mobile picker options: exif off, compatible format. |
| service | chat-attachment-hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Turns attachments into model input (named by the brief; not opened). |
| test | scanned-document-text.test.ts | `apps/web/lib/server/scanned-document-text.test.ts` | OCR routing and refusals. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| After the checks, the server extracts text; text PDFs use the text layer. | our servers | apps/web/lib/server/project-knowledge-extraction.ts:151-203 |
| Scanned pages are rendered as PNG images and sent to an admitted managed vision route. | outside service | apps/web/lib/server/scanned-document-text.ts:102-145 (provider chosen by routing; not named in code read) |
| The call is reserved and settled against managed usage. | our servers | apps/web/lib/server/scanned-document-text.ts:146-200 |
| Text is saved on the project source row. | our servers | apps/web/lib/server/project-knowledge-files.ts:393 |
| Thumbnail: read stored bytes, render WebP, return, nothing saved. | our servers | apps/web/app/api/files/[id]/thumbnail/route.ts:70-104 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Extracted text, summary, extracted_at | table:project_knowledge_files | Via server | Follows the source row; superseded on new version. |
| Chat OCR page text | object storage derived keys (apps/web/lib/server/chat-file-preparation/derived-keys.ts:86) | Server only | Rules not read: unknown. |
| Thumbnail | not stored | No | Rendered per request. |

**Models and providers.** OCR uses a managed route admitted for task type multimodal with the account's plan; the provider is whatever routing admits (SYS-model-catalog-and-routing). A Google-sourced scan may only use a provider that keeps inputs out of training (apps/web/lib/server/scanned-document-text.ts:55-70). Output is capped at 4,000 tokens per call (:41). Picture shrinking and thumbnails use the sharp library, no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Thumbnail route loads the asset in the caller's workspace only (apps/web/app/api/files/[id]/thumbnail/route.ts:61). |
| Subscription | OCR passes the plan tier into route admission and a managed usage reservation (apps/web/lib/server/scanned-document-text.ts:102-170). Free and paid differences: not read beyond that. |
| Limits and metering | OCR output 4,000 tokens per call; per-file OCR pages 100 and per-turn 8 for chat (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:81-82); thumbnails 30 MiB and 8192x8192 total pixels (apps/web/lib/server/library-thumbnail.ts:8-9). Thumbnail egress is recorded and exempt from the download allowance (apps/web/app/api/files/[id]/thumbnail/route.ts:92). |
| Feature flags | None found for thumbnails. OCR depends on route admission. |
| Model compatibility | Needs a vision-capable route [inferred from task type]; if none is admitted the scan is stored without text (apps/web/lib/server/scanned-document-text.ts:116-124 region). |
| Provider restrictions | No-training rule and Google Limited Use (apps/web/lib/server/scanned-document-text.ts:55-70). |
| Local mode | No on-device OCR or thumbnail code found in the files read. Local-mode behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No admitted vision route | File stored without text. | apps/web/lib/server/scanned-document-text.ts:116-124 |
| Privacy blocks all routes | ScannedTextWithheldError; row notes why. | apps/web/lib/server/scanned-document-text.ts:79; apps/web/lib/server/project-knowledge-extraction.ts:139-148 |
| Too many pages | document_too_complex error. | apps/web/lib/server/project-knowledge-extraction.ts:165-176 |
| Unreadable PDF or Office file | document_unreadable validation error. | apps/web/lib/server/project-knowledge-extraction.ts:158-163,392-396 |
| Thumbnail not applicable or too big | 404 Thumbnail not available. | apps/web/app/api/files/[id]/thumbnail/route.ts:64,74-79 |
| Same file re-uploaded | OCR reservation keyed by project and checksum so it is not paid twice. | apps/web/lib/server/project-knowledge-files.ts:319-330 comment |
| Mobile HEIC | Picker asks for a compatible format because chat refuses HEIC. | apps/mobile/src/features/media/image-normalization.ts:50-58 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/scanned-document-text.test.ts`: Route request, no-training withholding, reservation.
- `apps/web/lib/server/project-knowledge-extraction.test.ts`: Text, spreadsheet, size and checksum checks.
- `apps/web/lib/server/__tests__/library-thumbnail.test.ts`: Pixel budget, non-raster refusal, small WebP output.
- `apps/web/app/api/files/[id]/thumbnail/route.test.ts`: Thumbnail route (titles not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/model-image.test.ts`: Model picture preparation (titles not read).
- `apps/web/lib/server/tools/__tests__/scanned-page-reader.test.ts`: Scanned page reader.
- `packages/contracts/cloud-contracts/src/__tests__/library-thumbnail.test.ts`: Thumbnail contract.
- `apps/web/lib/server/project-knowledge-anchors.test.ts`: Anchors.

**Test scenarios**

- **Scanned PDF**
  1. Add a 3-page scanned PDF to a project on a paid plan.
  2. Open the source.
  - Expected: Text present with the model-read note; one usage reservation.
- **No-training setting**
  1. Turn on the setting that avoids training providers.
  2. Add the same scan.
  - Expected: No text and a notice explaining why.
- **Thumbnail limits**
  1. Upload a 35 MiB PNG.
  2. Open the Library.
  - Expected: No thumbnail_uri; the tile uses an icon.
- **Large photo**
  1. Attach a very large JPEG to a chat.
  - Expected: The model receives a smaller copy; the stored file is the original size.

**Where to look when it fails**

- Log '[ocr] no managed vision route is admitted; the scan is stored without text'.
- Error codes document_unreadable, document_too_complex, byte_count_mismatch.
- Managed usage reservations with type scanned_document_ocr.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief marks thumbnails and image preprocessing missing, but code exists.** Affects: Planning readers. Evidence: apps/web/lib/server/library-thumbnail.ts:51; apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts:63. Work needed: Update brief rows.
- **Thumbnails are re-rendered on every request.** Affects: Library on all hosts. Evidence: apps/web/app/api/files/[id]/thumbnail/route.ts:103. Work needed: Optional cache.
- **No metadata stripping on stored images.** Affects: All apps. Evidence: no upload-time image processing found. Work needed: Decide and implement or record policy.
- **No on-device OCR or text extraction for Local mode.** Affects: surface:desktop, surface:mobile in Local mode. Evidence: none found. Work needed: Decide the Local boundary (SYS-local-inference).
- **Brief citations for the extraction owners do not match the files.** Affects: Maintainers. Evidence: knowledge-files route has 113 lines; brief cites :430 and :502. Work needed: Re-anchor.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- F095-01
- F095-02
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile

## Unknown

- Which provider and model serve OCR in production.
- Where anchors are stored.
- Whether mobile and desktop request thumbnail_uri.
- Retention of OCR page files for chat.
- What chat-attachment-hydration does for each type (named by brief, not opened).
