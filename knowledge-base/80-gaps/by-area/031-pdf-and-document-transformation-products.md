---
id: "GAPS-AREA-031"
type: "gap-list"
title: "Gaps: PDF and document-transformation products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 31. PDF and document-transformation products

65 open gaps that touch this area. Area page: [20-features/031-pdf-and-document-transformation-products](../../20-features/031-pdf-and-document-transformation-products/README.md).

## GAP-AREA031-LW09

**The export preview (S31.24) is in office-file-preview.ts, but no non-test caller was confirmed in the first search results. Whether the preview matches the exported file was not shown in code.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-031
- Detail: Area 31. PDF and document-transformation products
- Evidence: apps/web/features/chat/lib/office-file-preview.ts:34-42, 173, 228-233

## GAP-AREA031-LW10

**Mobile attachment limits: attachmentLimitsFor returns one fixed size for one destination (line 39) and a per-type size otherwise. Which destination gets which limit was not confirmed.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-031
- Detail: Area 31. PDF and document-transformation products
- Evidence: apps/mobile/src/features/chat/utils/attachmentValidation.ts:34-51

## GAP-F031-01-01

**Mobile Local has no page labels or page images**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Detail: Affects: Mobile Local users asking page questions or reading scans. Work needed: Emit page-labelled text or use a real PDF reader on the device
- Evidence: docParser.ts:426-433 returns joined text and a page count only

## GAP-F031-01-02

**Mobile Local scanner has no stream decompression**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Detail: Affects: Mobile Local users with ordinary PDFs [inferred]. Work needed: Test on real PDFs; add a decoder
- Evidence: No inflate or Flate code found in apps/mobile/services/docParser.ts; tests use plain-text fixtures (apps/mobile/__tests__/docParser.test.ts:41-82)

## GAP-F031-01-03

**CLI, VS Code and Chrome cannot attach PDFs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Detail: Affects: Those three apps. Work needed: Add attach and read paths or decide to cut
- Evidence: Brief marks them missing

## GAP-F031-01-04

**Limits by plan for PDF size and pages not established beyond attachment counts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Detail: Affects: Free and paid users. Work needed: Confirm per-plan PDF limits
- Evidence: billing-catalog.ts:776-784 gives counts only

## GAP-F031-01-05

**Tauri desktop reads text only and has no scan fallback**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Detail: Affects: Tauri desktop (retained internal build). Work needed: Only if the Tauri build returns to public use
- Evidence: attachments.rs:260-266

## GAP-F031-01-06

**Electron Desktop parity not independently tested here**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Detail: Affects: Electron Desktop. Work needed: Drive the Electron app with a PDF
- Evidence: doc: AGENTS.md section 5 says the window shows the hosted web app

## GAP-F031-01-NOTBUILT

**Ask about an attached PDF (summary, questions, page questions): not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F031-01](../../20-features/031-pdf-and-document-transformation-products/F031-01-ask-about-an-attached-pdf-summary-questions-page-q.md)
- Requirement items: S31.04, S31.05, S31.06
- Detail: CLI: S31.04, S31.05, S31.06; VS Code: S31.04, S31.05, S31.06; Chrome: S31.04, S31.05, S31.06

## GAP-F031-02-01

**No table extraction**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-02](../../20-features/031-pdf-and-document-transformation-products/F031-02-plain-text-and-table-extraction-from-a-pdf.md)
- Detail: Affects: All apps; S31.09. Work needed: Build detection or tell the model to use the sandbox; correct the brief status
- Evidence: No table code found; brief cites unrelated files

## GAP-F031-02-02

**Mobile Local compressed PDFs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-02](../../20-features/031-pdf-and-document-transformation-products/F031-02-plain-text-and-table-extraction-from-a-pdf.md)
- Detail: Affects: Mobile Local. Work needed: Test and fix
- Evidence: No decompression in docParser.ts

## GAP-F031-02-03

**No text download or export**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-02](../../20-features/031-pdf-and-document-transformation-products/F031-02-plain-text-and-table-extraction-from-a-pdf.md)
- Detail: Affects: All apps. Work needed: Decide if wanted
- Evidence: No UI found

## GAP-F031-02-04

**Brief status mismatch for S31.09 (done vs code)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-02](../../20-features/031-pdf-and-document-transformation-products/F031-02-plain-text-and-table-extraction-from-a-pdf.md)
- Detail: Affects: Documentation. Work needed: Update the brief
- Evidence: Brief S31.09 lists apps/web/lib/server/container-files.ts:196, which handles provider-hosted file fetches (container-files.ts:190-200), not tables

## GAP-F031-02-NOTBUILT

**Plain text and table extraction from a PDF: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F031-02](../../20-features/031-pdf-and-document-transformation-products/F031-02-plain-text-and-table-extraction-from-a-pdf.md)
- Requirement items: S31.07, S31.09
- Detail: CLI: S31.07, S31.09; VS Code: S31.07, S31.09; Chrome: S31.07, S31.09

## GAP-F031-03-01

**Page image is an embedded bitmap, not a rendered page**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-03](../../20-features/031-pdf-and-document-transformation-products/F031-03-read-scanned-image-only-pdfs.md)
- Detail: Affects: Web chat users with non-RGB scans or scans with several images per page. Work needed: Render pages or handle more bitmap kinds; list skipped pages
- Evidence: pdf-attachment-content.ts:159-194

## GAP-F031-03-02

**Large-file OCR path not connected**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-03](../../20-features/031-pdf-and-document-transformation-products/F031-03-read-scanned-image-only-pdfs.md)
- Detail: Affects: Web users with big scanned PDFs. Work needed: Pass an entitled OCR object or remove
- Evidence: tool-loop.ts:5635 passes null

## GAP-F031-03-03

**Mobile Local and Tauri have no scan reading**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-03](../../20-features/031-pdf-and-document-transformation-products/F031-03-read-scanned-image-only-pdfs.md)
- Detail: Affects: Mobile Local, Tauri. Work needed: On-device OCR or route to Cloud with consent
- Evidence: docParser.ts:427-429; attachments.rs:260-266

## GAP-F031-03-04

**Mobile Cloud scan path not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-03](../../20-features/031-pdf-and-document-transformation-products/F031-03-read-scanned-image-only-pdfs.md)
- Detail: Affects: Mobile Cloud. Work needed: Verify on a device
- Evidence: chatExecutionStore.ts:2720-2745 sends an asset id

## GAP-F031-03-05

**No searchable output**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-03](../../20-features/031-pdf-and-document-transformation-products/F031-03-read-scanned-image-only-pdfs.md)
- Detail: Affects: All apps. Work needed: Out of scope here
- Evidence: Brief S31.21 missing

## GAP-F031-03-NOTBUILT

**Read scanned (image-only) PDFs: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F031-03](../../20-features/031-pdf-and-document-transformation-products/F031-03-read-scanned-image-only-pdfs.md)
- Requirement items: S31.08
- Detail: Mobile: S31.08; CLI: S31.08; VS Code: S31.08; Chrome: S31.08

## GAP-F031-04-01

**No conversion of existing Word, spreadsheet or slide files to PDF**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Detail: Affects: All apps; S31.01, S31.02, S31.03. Work needed: Use the office sandbox to convert and return the PDF; finish the owner template step
- Evidence: Searches found only text-to-PDF, artifact exports and a render check

## GAP-F031-04-02

**Brief says mobile done for S31.01 and S31.02 but cited code is attachment validation and parsing, not PDF creation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief; Mobile exports artifacts to PDF instead
- Evidence: apps/mobile/src/features/chat/utils/attachmentValidation.ts:121; apps/mobile/services/docParser.ts

## GAP-F031-04-03

**Sandbox render depends on an owner-run template step and flags**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Detail: Affects: Web verified-render requests. Work needed: Owner builds the template and sets the flags, then live-check
- Evidence: Brief S31.03 'Unfinished'; build-e2b-office-template.mjs

## GAP-F031-04-04

**Table layout in the PDF tool unconfirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Detail: Affects: Web tool users. Work needed: Test pipe tables
- Evidence: managed-office-file-service.ts:276 vs 796-822

## GAP-F031-04-05

**Tool output storage and retention not documented**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Detail: Affects: All Web users. Work needed: Trace
- Evidence: not traced

## GAP-F031-04-NOTBUILT

**Create a PDF or other document from text: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Requirement items: S31.01, S31.02, S31.03
- Detail: Mobile: S31.03; CLI: S31.01, S31.02, S31.03; VS Code: S31.01, S31.02, S31.03; Chrome: S31.01, S31.02, S31.03

## GAP-F031-04-PARTLY

**Create a PDF or other document from text: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F031-04](../../20-features/031-pdf-and-document-transformation-products/F031-04-create-a-pdf-or-other-document-from-text.md)
- Requirement items: S31.03
- Detail: Web S31.03: owner: run node apps/web/scripts/build-e2b-office-template.mjs with E2B credentials, set AGI_E2B_CHAT_TEMPLATE=agi-office-interpreter and AGI_E2B_EXECUTION=1; live-check a PPTX converts to PDF | Desktop S31.03: owner: run node apps/web/scripts/build-e2b-office-template.mjs with E2B credentials, set AGI_E2B_CHAT_TEMPLATE=agi-office-interpreter and AGI_E2B_EXECUTION=1; live-check a PPTX converts to PDF

## GAP-F031-05-01

**No preview before export and no layout preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-05](../../20-features/031-pdf-and-document-transformation-products/F031-05-preview-a-file-before-it-is-exported.md)
- Detail: Affects: Web and Desktop users. Work needed: Render pages (the sandbox can) and show them
- Evidence: The preview reads the finished file's text (office-file-preview.ts:173)

## GAP-F031-05-02

**No test compares preview and exported file**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-05](../../20-features/031-pdf-and-document-transformation-products/F031-05-preview-a-file-before-it-is-exported.md)
- Detail: Affects: The S31.24 claim. Work needed: Add a comparison test
- Evidence: Tests found check parsing only

## GAP-F031-05-03

**Mobile has no preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-05](../../20-features/031-pdf-and-document-transformation-products/F031-05-preview-a-file-before-it-is-exported.md)
- Detail: Affects: Mobile. Work needed: Design a mobile preview
- Evidence: Brief S31.24 mobile missing

## GAP-F031-05-04

**Message bubble shows only the first sheet**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-05](../../20-features/031-pdf-and-document-transformation-products/F031-05-preview-a-file-before-it-is-exported.md)
- Detail: Affects: Web users with multi-sheet workbooks in chat. Work needed: Point to the artifact panel or show tabs
- Evidence: MessageBubble.tsx:1602 uses sheets[0]

## GAP-F031-05-05

**Brief code cites differ in line numbers from the code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-05](../../20-features/031-pdf-and-document-transformation-products/F031-05-preview-a-file-before-it-is-exported.md)
- Detail: Affects: Documentation. Work needed: Update the brief
- Evidence: Brief lists MessageBubble.tsx:1368 and ArtifactPreview.tsx:417, while the preview code is at 1590-1610 and 1836-1860

## GAP-F031-05-NOTBUILT

**Preview a file before it is exported: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F031-05](../../20-features/031-pdf-and-document-transformation-products/F031-05-preview-a-file-before-it-is-exported.md)
- Requirement items: S31.24
- Detail: Mobile: S31.24; CLI: S31.24; VS Code: S31.24; Chrome: S31.24

## GAP-F031-06-01

**Document comparison does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-06](../../20-features/031-pdf-and-document-transformation-products/F031-06-compare-documents-and-original-versus-transformed.md)
- Detail: Affects: All six apps. Work needed: Design, build and test
- Evidence: Brief S31.10 missing on every app; no code found

## GAP-F031-06-02

**Original-versus-transformed view does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-06](../../20-features/031-pdf-and-document-transformation-products/F031-06-compare-documents-and-original-versus-transformed.md)
- Detail: Affects: All six apps. Work needed: Show before and after for assistant edits
- Evidence: Brief S31.25 missing on every app; the server edit receipts are not shown to the person

## GAP-F031-06-NOTBUILT

**Compare documents and original versus transformed: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F031-06](../../20-features/031-pdf-and-document-transformation-products/F031-06-compare-documents-and-original-versus-transformed.md)
- Requirement items: S31.10, S31.25
- Detail: Web: S31.10, S31.25; Desktop: S31.10, S31.25; Mobile: S31.10, S31.25; CLI: S31.10, S31.25; VS Code: S31.10, S31.25; Chrome: S31.10, S31.25

## GAP-F031-07-01

**Annotation, drawing, highlight and comment on a PDF are not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-07](../../20-features/031-pdf-and-document-transformation-products/F031-07-annotate-highlight-and-comment-on-a-pdf.md)
- Detail: Affects: All users on web, desktop, mobile, CLI, VS Code, Chrome.. Work needed: Choose an annotation engine, add viewer tools and save-to-file on each app, then add tests and a model tool if the assistant should annotate.
- Evidence: S31.11, S31.12 in the area brief; no code found.

## GAP-F031-07-02

**Mobile PDF viewer is read-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-07](../../20-features/031-pdf-and-document-transformation-products/F031-07-annotate-highlight-and-comment-on-a-pdf.md)
- Detail: Affects: Mobile users.. Work needed: Add an annotation layer to the viewer page or a native editor.
- Evidence: apps/mobile/scripts/vendor-pdfjs-viewer.cjs:60-79

## GAP-F031-07-03

**The PDF create tool cannot take an existing file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-07](../../20-features/031-pdf-and-document-transformation-products/F031-07-annotate-highlight-and-comment-on-a-pdf.md)
- Detail: Affects: Assistant-driven annotation on web and desktop.. Work needed: Add a separate tool with a source-file input.
- Evidence: apps/web/lib/services/managed-office-file-service.ts:190-196

## GAP-F031-07-NOTBUILT

**Annotate, highlight and comment on a PDF: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F031-07](../../20-features/031-pdf-and-document-transformation-products/F031-07-annotate-highlight-and-comment-on-a-pdf.md)
- Requirement items: S31.11, S31.12
- Detail: Web: S31.11, S31.12; Desktop: S31.11, S31.12; Mobile: S31.11, S31.12; CLI: S31.11, S31.12; VS Code: S31.11, S31.12; Chrome: S31.11, S31.12

## GAP-F031-08-01

**Native form-field filling is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-08](../../20-features/031-pdf-and-document-transformation-products/F031-08-fill-pdf-forms.md)
- Detail: Affects: All users on all six apps.. Work needed: Add a PDF library that reads and writes form fields, a tool, UI and tests.
- Evidence: S31.13 in the area brief; no code found.

## GAP-F031-08-02

**Visual form completion is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-08](../../20-features/031-pdf-and-document-transformation-products/F031-08-fill-pdf-forms.md)
- Detail: Affects: All users on all six apps.. Work needed: Render pages, locate lines, place text, preview the result; add tests.
- Evidence: S31.14 in the area brief; no code found.

## GAP-F031-08-03

**The create tool cannot accept an existing file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-08](../../20-features/031-pdf-and-document-transformation-products/F031-08-fill-pdf-forms.md)
- Detail: Affects: Web and desktop assistant flows.. Work needed: A new tool with a source input.
- Evidence: apps/web/lib/services/managed-office-file-service.ts:190-196

## GAP-F031-08-NOTBUILT

**Fill PDF forms: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F031-08](../../20-features/031-pdf-and-document-transformation-products/F031-08-fill-pdf-forms.md)
- Requirement items: S31.13, S31.14
- Detail: Web: S31.13, S31.14; Desktop: S31.13, S31.14; Mobile: S31.13, S31.14; CLI: S31.13, S31.14; VS Code: S31.13, S31.14; Chrome: S31.13, S31.14

## GAP-F031-09-01

**Insert, remove, reorder, merge and split are not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-09](../../20-features/031-pdf-and-document-transformation-products/F031-09-insert-remove-reorder-merge-and-split-pages.md)
- Detail: Affects: All users on all six apps.. Work needed: Choose a PDF library, add an on-device function, UI and tool, then tests.
- Evidence: S31.15-S31.17 in the area brief; apps/web/lib/services/managed-office-file-service.ts:190-196

## GAP-F031-09-02

**No library for editing existing PDFs is in the manifests searched.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-09](../../20-features/031-pdf-and-document-transformation-products/F031-09-insert-remove-reorder-merge-and-split-pages.md)
- Detail: Affects: Engineering.. Work needed: Add and vet one through the package manager.
- Evidence: apps/web/package.json:141,151 list only a writer and a reader.

## GAP-F031-09-NOTBUILT

**Insert, remove, reorder, merge and split pages: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F031-09](../../20-features/031-pdf-and-document-transformation-products/F031-09-insert-remove-reorder-merge-and-split-pages.md)
- Requirement items: S31.15, S31.16, S31.17
- Detail: Web: S31.15, S31.16, S31.17; Desktop: S31.15, S31.16, S31.17; Mobile: S31.15, S31.16, S31.17; CLI: S31.15, S31.16, S31.17; VS Code: S31.15, S31.16, S31.17; Chrome: S31.15, S31.16, S31.17

## GAP-F031-10-01

**Compression is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-10](../../20-features/031-pdf-and-document-transformation-products/F031-10-shrink-redact-and-edit-metadata.md)
- Detail: Affects: All users, all six apps.. Work needed: Pick an engine, expose levels, show size saved, test.
- Evidence: S31.18 in the area brief.

## GAP-F031-10-02

**Permanent redaction is not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-10](../../20-features/031-pdf-and-document-transformation-products/F031-10-shrink-redact-and-edit-metadata.md)
- Detail: Affects: All users, all six apps.. Work needed: Remove underlying text, add confirmation, prove removal with tests.
- Evidence: S31.19 in the area brief; secret scrubbing is a different feature.

## GAP-F031-10-03

**Metadata view and edit are not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-10](../../20-features/031-pdf-and-document-transformation-products/F031-10-shrink-redact-and-edit-metadata.md)
- Detail: Affects: All users, all six apps.. Work needed: Read and write document info, add UI and tests.
- Evidence: S31.20 in the area brief; no property calls found in apps/web/lib/services/managed-office-file-service.ts:796-842.

## GAP-F031-10-NOTBUILT

**Shrink, redact and edit metadata: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F031-10](../../20-features/031-pdf-and-document-transformation-products/F031-10-shrink-redact-and-edit-metadata.md)
- Requirement items: S31.18, S31.19, S31.20
- Detail: Web: S31.18, S31.19, S31.20; Desktop: S31.18, S31.19, S31.20; Mobile: S31.18, S31.19, S31.20; CLI: S31.18, S31.19, S31.20; VS Code: S31.18, S31.19, S31.20; Chrome: S31.18, S31.19, S31.20

## GAP-F031-11-01

**No searchable-PDF output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-11](../../20-features/031-pdf-and-document-transformation-products/F031-11-searchable-and-accessible-pdf-output.md)
- Detail: Affects: All users with scans, six apps.. Work needed: Add an OCR step that writes an invisible text layer, with on-device option.
- Evidence: S21 equivalent S31.21 in the area brief.

## GAP-F031-11-02

**Generated PDFs are untagged and plain.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-11](../../20-features/031-pdf-and-document-transformation-products/F031-11-searchable-and-accessible-pdf-output.md)
- Detail: Affects: Screen reader users on every app that creates PDFs (web, desktop, mobile per brief S31.01).. Work needed: Tag tree, language, title and alt text support, or route accessible output through another format.
- Evidence: apps/web/lib/services/managed-office-file-service.ts:796-842

## GAP-F031-11-03

**Non-Latin scripts are not supported in generated PDFs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-11](../../20-features/031-pdf-and-document-transformation-products/F031-11-searchable-and-accessible-pdf-output.md)
- Detail: Affects: Users writing Chinese, Arabic or Hindi.. Work needed: Embed fonts.
- Evidence: .agents/skills/pdf-creation/SKILL.md

## GAP-F031-11-NOTBUILT

**Searchable and accessible PDF output: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F031-11](../../20-features/031-pdf-and-document-transformation-products/F031-11-searchable-and-accessible-pdf-output.md)
- Requirement items: S31.21, S31.22
- Detail: Web: S31.21, S31.22; Desktop: S31.21, S31.22; Mobile: S31.21, S31.22; CLI: S31.21, S31.22; VS Code: S31.21, S31.22; Chrome: S31.21, S31.22

## GAP-F031-12-01

**Docusign is not released: global state is coming soon and Docusign is not on the selective list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: All users on web, desktop (hosted app) and mobile.. Work needed: Owner decision to release, after a live test.
- Evidence: packages/contracts/types/src/connector-release.ts:14-30; apps/web/lib/services/connector-policy-gate.ts:147-153

## GAP-F031-12-02

**Owner has not registered the Docusign app or confirmed credentials and descriptor in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: Web and everything using the hosted app.. Work needed: Register the app and set CONNECTOR_OAUTH_DOCUSIGN_CLIENT_ID/SECRET and the descriptor.
- Evidence: audit/partial/031-pdf-and-document-transformation-products.md S31.23 row; docs/runbooks/connector-oauth-apps.md:368-377

## GAP-F031-12-03

**The brief names DOCUSIGN_* environment variables but the code reads CONNECTOR_OAUTH_DOCUSIGN_*.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: Operators and documentation readers.. Work needed: Correct the brief and audit text.
- Evidence: apps/web/lib/connectors/oauth-registry.ts:96-107; docs/development/connectors-setup.md:645

## GAP-F031-12-04

**Desktop catalog entry is comingSoon, so the brief's 'partial' for desktop is not a visible feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: Tauri desktop catalog users.. Work needed: Decide whether the desktop catalog is still used; match the web release state.
- Evidence: apps/desktop/src/features/connectors/connectorDefinitions.ts:738,940

## GAP-F031-12-05

**No Docusign-specific test, no live test of an envelope from chat, and no traced path for passing a chat file into createEnvelope.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: Quality of the feature when released.. Work needed: Add an end-to-end test with a Docusign sandbox account.
- Evidence: rg for docusign in apps/web tests found only enterprise contract tests, not connector tests.

## GAP-F031-12-06

**No send-confirmation specific to signing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: All users once released.. Work needed: Add confirm step naming recipients and that sending cannot be undone.
- Evidence: Only generic tool approval is documented (apps/web/content/support/connectors-and-mcp.md).

## GAP-F031-12-07

**Mobile, CLI, VS Code, Chrome have no path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Detail: Affects: Users of those apps.. Work needed: Decide per app; mobile may inherit the server directory.
- Evidence: rg found no Docusign in apps/mobile/src or apps/cli/src.

## GAP-F031-12-NOTBUILT

**Send a document for e-signature: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Requirement items: S31.23
- Detail: Mobile: S31.23; CLI: S31.23; VS Code: S31.23; Chrome: S31.23

## GAP-F031-12-PARTLY

**Send a document for e-signature: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F031-12](../../20-features/031-pdf-and-document-transformation-products/F031-12-send-a-document-for-e-signature.md)
- Requirement items: S31.23
- Detail: Web S31.23: owner: register the Docusign developer app (integration key, OAuth client pair, redirect URI) and set the DOCUSIGN_* env vars; catalog and endpoint entries exist (apps/web/lib/connectors/catalog.ts:248) | Desktop S31.23: owner: register the Docusign developer app (integration key, OAuth client pair, redirect URI) and set the DOCUSIGN_* env vars; catalog and endpoint entries exist (apps/web/lib/connectors/catalog.ts:248)

## GAP-F031-99-PARTLY

**Other items in PDF and document-transformation products: partly built on Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F031-99](../../20-features/031-pdf-and-document-transformation-products/F031-99-other-items.md)
- Requirement items: S31.26
- Detail: Mobile S31.26: Create file offers document, presentation and spreadsheet formats. PDF is missing from that menu.
