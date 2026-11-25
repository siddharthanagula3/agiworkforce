---
id: "F031-09"
type: "feature"
title: "Insert, remove, reorder, merge and split pages"
aliases: ["Page insertion and removal", "Page reordering", "Merge and split PDFs", "S31.15", "S31.16", "S31.17"]
area: "31 PDF and document-transformation products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.15", "S31.16", "S31.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-local-inference", "file:apps/web/lib/services/managed-office-file-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-09 Insert, remove, reorder, merge and split pages

Inserting, removing, reordering, merging and splitting PDF pages is not built on any AGI Workforce app. The only PDF writer makes a new text-only PDF from text. The word 'pdf-merge' appears only as a name in a mobile test fixture.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.15](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3115), [S31.16](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3116), [S31.17](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3117).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would change a PDF's page layout: add or delete pages, change page order, join several PDFs into one, or cut one into parts. Today it does nothing.

**Why it exists.** Briefs S31.15, S31.16 and S31.17 require it (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). People often need to assemble or trim PDFs before sending them.

**Who uses it.** Would be used by office staff, students and anyone assembling documents. No one can use it today.

**Problems it solves**

- Combining scans into one file.
- Removing pages with private content before sharing.
- Sending only a chapter of a long PDF.

**Use cases**

- Merge three invoices into one PDF.
- Split a 100-page report into chapters.
- Move the signature page to the end.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, CLI, VS Code, Chrome: not available.

**Before you start**

- None, because it does not exist.

**Screens and controls**

- No page-thumbnail grid, merge or split control exists. Labels: none found in the code.

**Journey**

1. 1. A person attaches PDFs and asks to merge or reorder them.
2. 2. The model has no such tool; the create tool takes a title and text only (apps/web/lib/services/managed-office-file-service.ts:190-196) and the PDF skill says it cannot merge an existing PDF (.agents/skills/pdf-creation/SKILL.md).
3. 3. [inferred] The assistant explains it cannot, or writes a new text-only PDF from extracted text, which loses the original pages.

**What the person sees and gets**

- No merged or split file. [inferred] A text reply.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- New text PDFs can be generated and spread over pages automatically as text fills them (apps/web/lib/services/managed-office-file-service.ts:796-812, page add at the line using addPage).
- PDF text can be read page by page (brief S31.06: apps/web/lib/server/pdf-attachment-content.ts:170,217).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Insert or remove pages: missing on all six apps (S31.15).
- Reorder pages: missing on all six apps (S31.16).
- Merge and split: missing on all six apps (S31.17).
- A 'pdf-merge' or 'pdf-forms' product skill: not present; those names are test fixtures only (apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts:39-45).

## 4. Required behaviour

**Established requirements**

- The user can insert or remove pages in a PDF. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.15)
- The user can reorder the pages of a PDF. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.16)
- The user can merge several PDFs into one or split one into parts. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.17)

**Acceptance criteria**

1. Merging two PDFs of 3 and 5 pages gives one PDF of 8 pages in the chosen order.
2. Removing page 2 of a 4-page PDF gives 3 pages and page 2's content is absent.
3. Reordering moves the chosen page and the page text order matches.
4. Splitting by page ranges yields files whose page counts match the ranges.
5. Original pages keep their images, fonts and links (not re-typed as plain text).
6. Encrypted PDFs give a clear message; the original is not overwritten without consent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Page operations need no model and can run fully on device, so they fit the Local mode rule [inferred].
- Large merges need size and page limits like those in PDF inspection (apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-75) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A thumbnail grid with drag-to-reorder on web and desktop, and a simple pick-pages sheet on mobile.
- [proposed] Also expose it as an assistant tool so the model can merge or split on request.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Area brief items S31.15-S31.17 | `knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md` | Requirement; all apps missing. |
| service | generatePdf | `apps/web/lib/services/managed-office-file-service.ts` | Makes new text-only PDFs with jsPDF (line 796); handles page breaks of generated text only. |
| schema | ManagedOfficeFileInputSchema pdf variant | `apps/web/lib/services/managed-office-file-service.ts` | Strict input; no source files (lines 190-196). |
| other | pdf-creation skill | `.agents/skills/pdf-creation/SKILL.md` | States merge and edit are not possible. |
| service | PDF attachment content reader | `apps/web/lib/server/pdf-attachment-content.ts` | Reads pages for chat; page-specific reading exists (brief S31.06). |
| service | PDF inspection | `apps/web/lib/server/chat-file-intake/pdf-inspection.ts` | Page-count and time limits for scanning uploaded PDFs (constants 'scan_pages', 'scan_time', lines 66-75). |
| service | PDF range source | `apps/web/lib/server/chat-file-preparation/pdf-range-source.ts` | Reads PDF byte ranges for preparation. |
| test | skillRequirements fixtures | `apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts` | Fixture skill names pdf-forms and pdf-merge (lines 39-45); not real features. |
| other | Dependencies list | `apps/web/package.json` | Lists jspdf (line 141, writer) and pdfjs-dist (line 151, reader); no library that merges or splits PDFs was found in the package manifests searched. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches PDFs and asks to merge or reorder. | device | Client attach action [inferred]; no page-edit code found. |
| Server reads text from the PDFs for the model; nothing rearranges pages. | our servers | apps/web/lib/server/pdf-attachment-content.ts |
| The only file tool creates a new text-only PDF. | our servers | apps/web/lib/services/managed-office-file-service.ts:1034-1050 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Merged or split files | nowhere: none created | not applicable | not applicable |

**Models and providers.** No model is needed for page operations. A model would only help choose pages from a request [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for page operations. |
| Permissions | none found in the code |
| Subscription | none found in the code. [proposed] Local page operations free of any plan. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Nothing in Local mode: the feature does not exist. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Request to merge PDFs | No tool; text reply [inferred]. | .agents/skills/pdf-creation/SKILL.md; apps/web/lib/services/managed-office-file-service.ts:190-196 |
| Encrypted PDF | Reading is refused with reason 'encrypted' in inspection; no merge behaviour. | apps/web/lib/server/chat-file-intake/pdf-inspection.ts:70 |
| Too many pages or too slow a scan | Inspection has 'scan_pages' and 'scan_time' limits for reading. | apps/web/lib/server/chat-file-intake/pdf-inspection.ts:66-75 |
| Retry, cancel, offline, accessibility | not handled in the code (no feature) | no page-edit code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: New PDF creation only.
- `apps/web/lib/server/pdf-attachment-content.test.ts`: PDF reading (by name; not opened).
- `apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts`: Skill mention matching with fixture names pdf-forms and pdf-merge (lines 39-45).

**Test scenarios**

- **Merge request today**
  1. Attach two PDFs.
  2. Ask to merge them into one.
  3. Inspect the reply.
  - Expected: No merged PDF is returned (current). When built: one PDF with all pages in order.
- **Page count after merge (future)**
  1. Merge a 3-page and a 5-page PDF.
  2. Open result.
  - Expected: 8 pages, original appearance kept.
- **Remove a private page (future)**
  1. Remove page 2.
  2. Search the output for page 2 text.
  - Expected: Text is absent.
- **Local offline (future)**
  1. Go offline on desktop.
  2. Split a PDF.
  - Expected: Works with no network.

**Where to look when it fails**

- No logs or tables exist for this feature.
- rg -i 'mergepdf|splitpdf|pdf-merge' apps packages finds only the test fixture.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Insert, remove, reorder, merge and split are not built.** Affects: All users on all six apps.. Evidence: S31.15-S31.17 in the area brief; apps/web/lib/services/managed-office-file-service.ts:190-196. Work needed: Choose a PDF library, add an on-device function, UI and tool, then tests.
- **No library for editing existing PDFs is in the manifests searched.** Affects: Engineering.. Evidence: apps/web/package.json:141,151 list only a writer and a reader.. Work needed: Add and vet one through the package manager.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-local-inference
- file:apps/web/lib/services/managed-office-file-service.ts

## Unknown

- Whether the Tauri desktop tree or CLI Rust crates contain PDF page tools was not found by search but not fully read.
- No document sets limits for page counts or file size for merges.
