---
id: "F104-03"
type: "feature"
title: "Files and PDFs: reading PDFs and storing uploads"
aliases: ["PDF attachment reading", "pdf-attachment-content", "resumable upload", "large file upload", "chat file intake", "object storage", "S3 adapter"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.12"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "table:chat_file_intakes", "api:POST /api/files/uploads", "file:apps/web/lib/server/pdf-attachment-content.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-03 Files and PDFs: reading PDFs and storing uploads

A PDF attached to chat is read on our servers with PDF.js: text per page, page images for scanned pages, size limits and clear errors. Uploads and generated files go to S3-compatible storage, large files in resumable parts. On web a PDF artifact opens in the browser's own viewer; mobile ships its own PDF.js viewer.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.12](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10412).

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

**What it does.** Extracts text and scanned-page images from PDFs so any model can use them, and stores uploaded and generated files in object storage with resumable multipart upload. (apps/web/lib/server/pdf-attachment-content.ts:220-300; apps/web/app/api/files/uploads/resumable-upload.ts)

**Why it exists.** A model route may have no document channel; turning a PDF into text or images works with every route (comment at pdf-attachment-content.ts:146-153). Large files need parts so a dropped connection does not restart the transfer.

**Who uses it.** People attaching documents to Cloud chats and project knowledge.

**Problems it solves**

- Chat turn failing because a route cannot take PDF bytes.
- Scanned PDFs with no text.
- Large uploads that fail midway.

**Use cases**

- Attach a contract and ask for a summary.
- Attach a scanned form; pages go in as images.
- Upload a 300 MB file in parts on a weak connection.

## 2. User experience

**Where to find it**

- Web composer attach control; the resulting PDF artifact opens in the panel (ArtifactPreview.tsx:2011).
- Mobile: viewer opens a PDF in a bundled PDF.js page in a WebView (PdfFileView.tsx).
- Desktop: hosted web (AGENTS.md section 5).
- CLI: account file uploads (apps/cli/src/app_server/account_uploads.rs exists; behaviour not read).

**Before you start**

- Signed in for Cloud upload routes (uploads route is user scoped).

**Screens and controls**

- Panel fallback: 'Inline preview unavailable' or "This PDF couldn't be displayed." with Retry and download (ArtifactPreview.tsx:2022-2040).
- Error text for unreadable files: '<name> could not be read as a PDF.' or '<name> is password protected. Remove the password and upload it again.' (pdf-attachment-content.ts:41-44).

**Journey**

1. Attach a PDF (type application/pdf is in the allowed list: packages/contracts/types/src/attachment-policy.json).
2. The file is uploaded; large files use parts and a signed session.
3. On send, the server loads the object, runs PDF.js, builds text with '[Page N]' markers and page images for scanned pages.
4. The model receives text, images and a note for pages left out (chat-attachment-hydration.ts:681-740).
5. Ask about the file.

**What the person sees and gets**

- A truncation notice is raised when pages, scanned pages or text were cut (chat-attachment-hydration.ts:693-699).
- A live turn gets a 400 'unreadable_attachment' error; a replayed history degrades the part (chat-attachment-hydration.ts:684-690).

**Settings**

- Attachment policy JSON: max 25 MB inline, 20 attachments, large files up to 500 MB, cellular confirm over 50 MB (chat-attachment-policy.json:2-5, 66-70).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server-side extraction with the legacy PDF.js build, up to 250 text pages and 30 scanned page images, 8 MB total image bytes, text truncated to the shared limit (pdf-attachment-content.ts:9-17,144,196-204,229-260).
- Encrypted and corrupt files raise a typed error (pdf-attachment-content.ts:51-60,288-295).
- Resumable multipart upload with signed sessions, 5 MB parts, 4 MB relay segments, session lifetime equal to the orphan multipart age of 24 hours (resumable-upload.ts:50; upload-contract.json; lifecycle.ts:8).
- S3-compatible adapter plus an in-memory adapter and a 'none' provider choice (object-storage/src/types.ts:3; factory.ts; adapters/s3.ts).
- Upload routes: POST create, part and complete routes under /api/files/uploads, rate-limited (uploads/route.ts:~224; parts/route.ts).
- Intake record table for large chat files (0422_chat_file_intakes.sql:42).
- Mobile on-device PDF viewer assembled from a vendored PDF.js (apps/mobile/scripts/vendor-pdfjs-viewer.cjs; PdfFileView.tsx:30-40).

**Incomplete**

- Brief says T08 'in-product viewer backed by a rendering engine'. On web the viewer is the browser's built-in viewer through an iframe, not PDF.js on the client (ArtifactPreview.tsx:2011-2018; PDF.js used only in server files, grep of apps/web).

**Present but disconnected or switched off**

- Resumable upload throws 'Uploading a file in parts is not available on this deployment.' when private storage or multipart support is not configured (resumable-upload.ts:66-80).

**Not available**

- PDF text extraction on the device for Local chat: none found in the code (extraction is a server module marked server-only).
- Client-side PDF.js viewer on web: none found.

## 4. Required behaviour

**Established requirements**

- S104.12: uploaded and generated files are stored in S3-compatible object storage. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.12)
- T08: PDFs open in an in-product viewer backed by a PDF engine and PDF text is parsed by a PDF engine. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.12)
- Local files remain local in Local mode; no hidden cloud call. (source: (doc: docs/product/requirements.md section 7.1))
- Object storage is resolved in one place so the host can change by environment. (source: packages/platform/object-storage/src/factory.ts:30-37)

**Acceptance criteria**

1. A text PDF of 3 pages produces text with '[Page 1]' markers.
2. A scanned PDF produces page images, up to the image cap, and a note for omitted pages.
3. A password-protected PDF returns the 'is password protected' message.
4. A non-PDF file renamed .pdf returns 'could not be read as a PDF'.
5. A 100 MB upload resumes after a dropped connection without restarting.
6. A deployment with no storage returns the capability-unavailable message instead of failing silently.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plan limits on attachment size are defined by shared policy constants (MAX_PLAN_ATTACHMENT_BYTES in billing-catalog.ts:748) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] State clearly in docs that the web PDF view is the browser viewer; add a shared PDF.js viewer if the same look is needed on every app.
- [proposed] Add a Local-mode PDF text path on mobile if Local chat should read PDFs.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | extractPdfAttachmentContent | `apps/web/lib/server/pdf-attachment-content.ts` | PDF.js text and image extraction with limits and typed errors. |
| service | chat-attachment-hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Turns stored PDF into message parts (681-740). |
| service | pdf-range-source / pdf.ts | `apps/web/lib/server/chat-file-preparation/pdf.ts` | Preparation of large PDFs. |
| service | pdf-inspection | `apps/web/lib/server/chat-file-intake/pdf-inspection.ts` | Inspection step in file intake. |
| endpoint | POST /api/files/uploads | `apps/web/app/api/files/uploads/route.ts` | Creates a resumable upload session. |
| endpoint | /api/files/uploads/[uploadId] | `apps/web/app/api/files/uploads/[uploadId]/route.ts` | Status, complete or abort. |
| endpoint | /api/files/uploads/[uploadId]/parts | `apps/web/app/api/files/uploads/[uploadId]/parts/route.ts` | Part upload. |
| service | resumable-upload | `apps/web/app/api/files/uploads/resumable-upload.ts` | Session signing, target store, part math. |
| endpoint | /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Serves a stored file (with ?preview=pdf). |
| service | object-storage-runtime | `apps/web/lib/server/object-storage-runtime.ts` | One resolver for the storage backend. |
| service | S3 adapter | `packages/platform/object-storage/src/adapters/s3.ts` | S3-compatible store with timeouts. |
| service | object-storage factory | `packages/platform/object-storage/src/factory.ts` | Chooses provider s3, memory or none. |
| service | lifecycle | `packages/platform/object-storage/src/lifecycle.ts` | Orphan multipart age (24 h). |
| schema | upload-contract.json | `packages/contracts/cloud-contracts/src/upload-contract.json` | Part sizes, concurrency, timeouts. |
| schema | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Attachment limits. |
| table | chat_file_intakes | `apps/web/db/neon/0422_chat_file_intakes.sql` | Intake rows for large files. |
| component | PDF iframe viewer | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Browser viewer in panel (808-870, 2000-2045). |
| component | PdfFileView (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/PdfFileView.tsx` | On-device PDF.js page in a WebView. |
| command | vendor-pdfjs-viewer | `apps/mobile/scripts/vendor-pdfjs-viewer.cjs` | Builds the bundled viewer asset. |
| config | next.config pdfjs | `apps/web/next.config.ts` | Server bundling of PDF.js (mentions pdfjs). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client requests an upload session; server signs it and starts a multipart upload. | our servers | resumable-upload.ts:50-120; uploads/route.ts |
| Parts go to storage by presigned URL (15 min) or relayed in 4 MB segments. | outside service | RESUMABLE_PART_URL_TTL_SECONDS=900 (resumable-upload.ts:52); upload-contract.json |
| Upload is scanned and checked before use. | our servers | imports from @/lib/security/upload-scan in resumable-upload.ts:30-37 |
| On send, server reads the object and runs PDF.js with its worker bundled. | our servers | pdf-attachment-content.ts:199-205,229-240 |
| Text and images are sent to the chosen model route. | outside service | chat-attachment-hydration.ts:710-745 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded and generated files | S3-compatible private bucket | Fetched via /api/files | Orphan multiparts expire after 24 hours; deletion of finished files: unknown |
| Intake row | table chat_file_intakes | server only | erasure.ts exists in chat-file-intake; rule unknown |
| Extracted text | Built per request; project knowledge keeps extracted text (project-knowledge-extraction.ts) | server | unknown |

**Models and providers.** The extracted content is sent as text and image parts to whichever model the turn routes to; image parts need a vision-capable route (comment at pdf-attachment-content.ts:146-153). Storage host is chosen by environment, not code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; user-scoped database access (uploads/route.ts withRateLimit 'uploads-presign' by user id). |
| Permissions | Upload kind is validated; supported file types checked (resumable-upload route:~243). |
| Subscription | Large files are offered only when the server offers them (largeFilesAvailable in chat-attachments.ts:49); the per-plan rule is not read here. |
| Limits and metering | 25 MB per inline file, 20 files; large files to 500 MB; knowledge file cap from plan constants; storage remaining reported (chat-attachment-policy.json; chat-attachments.ts:49-53). |
| Feature flags | Resumable upload needs private object storage configured (resumable-upload.ts:66-80). |
| Model compatibility | Pages as images need vision; text works with any route. |
| Provider restrictions | Storage provider s3, memory or none (types.ts:3). |
| Local mode | This pipeline is server-only. Local mode PDF reading on the device: not available in this code path; mobile only views PDFs. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Corrupt file | PdfAttachmentUnreadableError reason corrupt. | pdf-attachment-content.ts:226-228 |
| Encrypted | reason encrypted with message. | pdf-attachment-content.ts:289-291 |
| Over page cap | First 250 pages read, pagesOmitted true, truncation notice. | pdf-attachment-content.ts:229-236 |
| Scanned pages over budget | Listed as omitted with a note to the model. | pdf-attachment-content.ts:260-268; chat-attachment-hydration.ts:700-709 |
| Storage not configured | Capability-unavailable error. | resumable-upload.ts:66-80 |
| Interrupted upload | Resumable; test exists. | app/api/files/uploads/__tests__/resumable-upload-interruption.test.ts |
| Upload failure messages by plan | not verified; constants exist for scan, storage-full, limits (resumable-upload.ts:30-37). | same |
| Web viewer error | Fallback with Retry. | ArtifactPreview.tsx:2022-2040 |
| Mobile viewer silent | A silence timeout reports failure. | PdfFileView.tsx imports PDF_VIEWER_SILENCE_MS |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/pdf-attachment-content.test.ts`: Extraction.
- `apps/web/lib/server/chat-file-preparation/__tests__/pdf.test.ts`: PDF preparation.
- `apps/web/lib/server/chat-file-intake/__tests__/pdf-inspection.test.ts`: PDF inspection.
- `apps/web/app/api/files/uploads/__tests__/route.test.ts`: Create route.
- `apps/web/app/api/files/uploads/__tests__/resumable-upload-interruption.test.ts`: Interrupted upload.
- `apps/web/app/api/files/uploads/[uploadId]/route.test.ts`: Upload status and complete.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PdfFileView.test.tsx`: Mobile viewer.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/pdfViewerAsset.test.ts`: Viewer asset.
- `apps/mobile/__tests__/OssLicensesVendoredPdfjs.test.ts`: Licence for vendored PDF.js.

**Test scenarios**

- **Text PDF**
  1. Attach a 3-page text PDF in Cloud chat.
  2. Ask 'what is on page 2?'
  - Expected: Answer from page 2.
- **Scanned PDF**
  1. Attach a scanned PDF with a vision model.
  - Expected: Answer from the images; omitted pages noted.
- **Locked PDF**
  1. Attach a password-protected PDF.
  - Expected: 'is password protected' error.
- **Resume**
  1. Start a 200 MB upload.
  2. Cut the network midway.
  3. Restore it.
  - Expected: Upload continues from the stored parts.
- **Web viewer**
  1. Open a generated PDF in the panel.
  - Expected: Browser viewer in an iframe; fallback if blocked.

**Where to look when it fails**

- Log '[pdf] attachment content extraction failed' (pdf-attachment-content.ts:292).
- Table chat_file_intakes.
- Error code unreadable_attachment.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **T08 says an in-product PDF engine viewer; web uses the browser's viewer, only mobile bundles PDF.js.** Affects: Web, desktop. Evidence: ArtifactPreview.tsx:2011-2018. Work needed: Reword requirement or add a client viewer.
- **No PDF reading in Local mode.** Affects: Mobile Local. Evidence: extraction file is server-only (line 1). Work needed: Decide and build or state Local limits.
- **Upload failure messages and plan limits are not verified.** Affects: Web, mobile. Evidence: brief 'Not verified'. Work needed: Test and document.
- **Brief line cites pdf-attachment-content.ts:196-204 for the legacy build; code at those lines matches (loadPdfjs 199-205).** Affects: none. Evidence: lines checked. Work needed: none

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- table:chat_file_intakes
- api:POST /api/files/uploads
- file:apps/web/lib/server/pdf-attachment-content.ts

## Unknown

- Deletion and retention of stored files and intake rows.
- How the desktop, Chrome, VS Code and CLI handle PDF attachments.
- Plan-specific attachment limits and upload error wording.
- The exact storage host used in production (environment, not in code).
