---
id: "F025-03"
type: "feature"
title: "Preview Office files and archives"
aliases: ["Spreadsheet preview", "Word document preview", "Presentation preview", "Archive preview", "Office reader", "S25.08 Spreadsheet preview", "S25.09 Presentation preview", "S25.10 Document preview", "S25.11 Archive-content preview", "Download as text"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.08", "S25.09", "S25.10", "S25.11"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-security-and-privacy", "surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "api:GET /api/files/[id]/text", "table:project_knowledge_files"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-03 Preview Office files and archives

Shows spreadsheets as a table, Word files as text and presentations as slide text or slides. The server extracts the text for web, Electron Desktop and the CLI; mobile reads spreadsheets on the device and draws other Office files with the iOS system view. Archive (zip) listing does not exist.

Area: [25. File previews and readers](README.md). Requirement items: [S25.08](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2508), [S25.09](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2509), [S25.10](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2510), [S25.11](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2511).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns Office files into something readable in the product. The server returns the first sheet of a workbook as CSV and Word or slide text as plain text (apps/web/lib/server/file-text-preview.ts:46-71); the viewer draws a CSV as a table (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:57-85). The web project modal also draws a presentation as slides in the browser (apps/web/features/projects/components/FilePreviewModal.tsx:419-425).

**Why it exists.** People attach spreadsheets, documents and decks and want to check them without another app. The brief asks for spreadsheet, presentation, document and archive previews (S25.08-S25.11).

**Who uses it.** Web, Electron Desktop, mobile and CLI users with Office files.

**Problems it solves**

- Checking a file's content quickly.
- Saving the extracted text via 'Download as text'.
- Safe reading: archives are bounded and encrypted files are refused (office-document-text.ts:82-119, 801-806).

**Use cases**

- Open budget.xlsx in the Library and see the first sheet as a table.
- Open a .docx in a project and read its text.
- Open a .pptx in a project and see slides.
- Print an Office file's text in the terminal with agi library show.

## 2. User experience

**Where to find it**

- Web and Electron: Library tile or project knowledge row.
- Mobile: Library file card or Sources tab.
- CLI: agi library show <id>.

**Before you start**

- Signed in with a Cloud account.
- File of type xlsx, docx or pptx (also csv or tsv for tables) (file-text-preview.ts:28-38).

**Screens and controls**

- Library viewer: table or text block; 'Download as text' button (shown for non-text/* files once the preview is ready) with accessible label 'Download the text of <file>'; 'Download <file>'; 'Close file viewer' (LibraryView.tsx:1253-1280).
- Project modal: table or text, slides view for pptx, 'Download', 'Close'.
- Mobile: spreadsheet grid with one tab per sheet; docx or pptx on iOS in the system view; on Android a panel 'Open it in another app to read it.' with Share.

**Journey**

1. Open the Office file.
2. Wait for the spinner.
3. Read the table or text; scroll.
4. Optionally 'Download as text' or download the original.

**What the person sees and gets**

- 'Showing the start of this file. Download it to see all of it.' when cut (FileTextPreview.tsx:91-95).
- 'This document could not be read' for an unreadable file (file-text-preview.ts:57-59).
- 'This presentation is too large to preview. Download it to open it.' over 40 MB; 'This presentation has no slides to show.'; 'This presentation could not be opened for preview.' (PptxFilePreview.tsx:44-79).
- Mobile: 'This workbook is too large to show here' (WorkbookFileView.tsx:18, 153-166).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server extracts xlsx first non-empty sheet to CSV with at most 5000 rows and the character cap; marked incomplete when more than one sheet has data (office-document-text.ts:37, 715-755). docx via a Word reader, pptx slides as '## Slide N' with speaker notes up to 200 slides (office-document-text.ts:38, 760-830).
- Library viewer shows table up to 500 rows or text (FileTextPreview.tsx:14, 50-95). A pptx appears there as extracted slide text, because pptx is an 'office' kind and previewable (file-text-preview.ts:35, apps/web/app/api/library/route.ts:51-58) [inferred from code, not run].
- Web project modal: office files go through the project text route; pptx is drawn as slides in the browser (FilePreviewModal.tsx:245-247, 419-427; PptxFilePreview.tsx:45-79).
- Mobile: xlsx read on the device into tabs with a limit check, falling back to the document view (WorkbookFileView.tsx:27-175). docx and pptx: iOS system view; Android share only (DocumentFileView.tsx:32-35, 138-148).
- CLI: show reads the same /text route, so docx, xlsx and pptx print as text [inferred, not run] (library.rs:98-100, lib.rs:7318-7334).

**Incomplete**

- Only the first sheet of a multi-sheet workbook shows on web and CLI, and the viewer cuts at 500 rows; the notice for a cut applies, but a hidden second sheet is reported only as 'start of this file' [inferred] (office-document-text.ts:726-727).
- Library viewer has no slide view; a pptx there is text only.
- No per-case partial-extraction warning beyond the single truncation line (S25.31).

**Present but disconnected or switched off**

- Tauri DesktopLibrary: no text preview loader, so Office files show no preview (DesktopLibrary.tsx:59-72 lists only pdf, image, text kinds; and openPreview is never called).

**Not available**

- Archive (zip) listing: no code found; zip appears only as an upload media type (packages/contracts/types/src/file-model.ts, MEDIA_TYPES_BY_EXTENSION).
- VS Code and Chrome: no Office preview found.
- Mobile Android docx and pptx: not drawn in app.

## 4. Required behaviour

**Established requirements**

- Spreadsheets preview as a table. (source: S25.08)
- Presentations (pptx) preview in the product. (source: S25.09)
- Word documents preview in the product. (source: S25.10)
- Archive contents can be listed or previewed. (source: S25.11)
- When only part of a file could be extracted, the product warns the user. (source: S25.31)

**Acceptance criteria**

1. An xlsx in the web Library opens as a table with at most 500 rows and shows the cut note when longer.
2. A docx opens as readable text.
3. A corrupt Office file answers 'This document could not be read' and the viewer falls back to 'Preview isn’t available' with a download button.
4. A pptx over 40 MB in the project modal shows the too-large message.
5. A text over 200000 characters is cut and flagged truncated.
6. Mobile opens an xlsx as tabs, one per sheet.
7. 'Download as text' saves <name>.txt with the extracted text.
8. [proposed] A zip lists its entries without extracting them.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A multi-sheet workbook should tell the person other sheets exist [inferred from complete=false rule].

**Proposed improvements** (suggestions, not requirements)

- Add a sheet picker on web and CLI; add slide view to the Library viewer; add a zip listing endpoint with entry-count and size limits.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | file-text-preview | `apps/web/lib/server/file-text-preview.ts` | Kind detection and rendering of table, text, office previews. |
| service | office-document-text | `apps/web/lib/server/office-document-text.ts` | docx, xlsx, pptx extraction with archive limits, extractSpreadsheetTable (line 715). |
| endpoint | GET /api/files/[id]/text | `apps/web/app/api/files/[id]/text/route.ts` | Library Office preview. |
| endpoint | GET /api/projects/[id]/knowledge-files/[fileId]/text | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts` | Project Office preview, source limit MAX_PLAN_ATTACHMENT_BYTES. |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Sets textPreview true for table and office kinds (line 87). |
| component | FileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Table render with 500-row cap. |
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Download as text button and downloadText (lines 1130-1140, 1253-1262). |
| schema | FileTextPreviewSchema | `packages/contracts/cloud-contracts/src/library.ts` | Wire shape (kind table/text). |
| config | attachment policy | `packages/contracts/types/src/attachment-policy.json` | 200000 character preview cap. |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Office and pptx branches (lines 245-247, 419-427). |
| component | PptxFilePreview | `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.tsx` | Browser-side slide preview, 40 MB limit. |
| service | office-file-preview | `apps/web/features/chat/lib/office-file-preview.ts` | pptxToSlidesMarkdown and preview limit errors in the browser. |
| service | tabular parser | `packages/ui/unified-chat/src/lib/tabular.ts` | parseTabular and readWorkbookSheets used by web viewer and mobile (import in FileTextPreview.tsx:6, WorkbookFileView.tsx:5). |
| component | WorkbookFileView | `apps/mobile/src/features/chat/components/artifact-viewers/WorkbookFileView.tsx` | On-device xlsx read into sheet tabs. |
| component | TabularGridView | `apps/mobile/src/features/chat/components/artifact-viewers/TabularGridView.tsx` | Grid for csv, tsv and sheets. |
| component | DocumentFileView | `apps/mobile/src/features/chat/components/artifact-viewers/DocumentFileView.tsx` | iOS system view for docx and pptx; Android hand-off. |
| config | Document classes | `packages/contracts/types/src/file-model.ts` | Declares docx, xlsx, pptx, csv, tsv classes. |
| command | agi library show | `apps/cli/src/lib.rs` | Prints extracted text (lines 7318-7334). |
| service | CLI library client | `apps/cli/src/cloud/library.rs` | text() call. |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Rows read for project previews (select at lines 50-60). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Viewer asks the /text route for the file. | device | LibraryView.tsx:667-670 |
| Server reads the object (cap 30 MB for Library, plan attachment limit for projects) and extracts text or the first sheet as CSV inside bounded archive limits. | our servers | text/route.ts:17-62; file-text-preview.ts:40-71; office-document-text.ts:254-304 |
| Bytes come from private storage. | outside service | text/route.ts:45 |
| Browser parses CSV and shows up to 500 rows. | device | FileTextPreview.tsx:46-51 |
| Project pptx: browser downloads the file and converts slides locally. | device and our servers | PptxFilePreview.tsx:51-57 |
| Mobile xlsx: file copied to cache then parsed on the device. | device and our servers | WorkbookFileView.tsx:27-30, 116-118 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Extracted CSV or text | Not stored; returned no-store; 'Download as text' creates a local .txt on demand | No | Browser memory only |
| Original file | Cloud storage; mobile cache copy | Cloud is source | Mobile cache cleared on Clear cache and sign-out |

**Models and providers.** No model or provider is used for preview; extraction is plain code. 'Ask about this file' starts a chat (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with a Cloud account; CLI requires managed Cloud. |
| Permissions | Workspace-scoped asset or project read. |
| Subscription | The /text routes call no download allowance check; the project pptx path fetches the original file route (may be metered, unknown). |
| Limits and metering | 30 MB source on Library text, 200000 characters, 5000 sheet rows, 200 slides, 500 rows shown, 40 MB pptx in browser (text/route.ts:17; attachment-policy.json:50; office-document-text.ts:37-38; FileTextPreview.tsx:14; PptxFilePreview.tsx:19). |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | Not provider dependent. |
| Local mode | Needs the Cloud copy of the file; CLI refuses Local and own-key sessions. Mobile xlsx parsing and iOS system view run on the device after the copy is fetched. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner; mobile 'Opening <file>'. | LibraryView.tsx:1313; WorkbookFileView.tsx:140-148 |
| Unreadable or encrypted | Server answers validation 'This document could not be read'; the Library viewer then shows the generic fallback. | file-text-preview.ts:56-61; FileTextPreview.tsx:35-37; LibraryView.tsx:1319 |
| Truncated | Cut note; truncated flag. | FileTextPreview.tsx:51, 91-95 |
| Too large | 'This file is too large to preview'; pptx 40 MB message; mobile workbook too-large panel. | text/route.ts:38-40; PptxFilePreview.tsx:44-49; WorkbookFileView.tsx:153-166 |
| Workbook unreadable on mobile | Falls back to the document view. | WorkbookFileView.tsx:151 |
| Android docx or pptx | 'Open it in another app to read it.' plus Share. | DocumentFileView.tsx:138-148 |
| Formulas without results | Shown as =formula text. | office-document-text.ts:733-736 |
| Archive | Not handled in the code. | No zip listing code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/office-document-text.test.ts`: Office kind detection, docx, xlsx sheets and number formats, slide numbering and notes, rejected bytes, spreadsheet preview table.
- `apps/web/app/api/files/[id]/text/__tests__/route.test.ts`: Text route errors and csv table render.
- `apps/web/features/projects/components/__tests__/FilePreviewModal.pptx.test.tsx`: A pptx source previews as slides in the project modal.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/WorkbookFileView.test.tsx`: Sheet tabs, single grid, too-large, share CSV, fallbacks, retry.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/DocumentFileView.test.tsx`: Office file hand-off on Android and system draw on iOS.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx`: Grid view (file exists; contents not read).
- `packages/ui/unified-chat/src/lib/__tests__/tabular.test.ts`: Tabular parsing (file exists; contents not read).

**Test scenarios**

- **Multi-sheet workbook**
  1. Upload an xlsx with two filled sheets.
  2. Open from the web Library.
  - Expected: First sheet table with the cut note; record whether the second sheet is mentioned.
- **Corrupt docx**
  1. Upload a renamed text file as .docx.
  2. Open it.
  - Expected: Server 'This document could not be read'; viewer fallback with Download to view.
- **pptx on web**
  1. Open a pptx in a project and in the Library.
  - Expected: Slides in the project modal; slide text in the Library viewer.
- **Mobile Android docx**
  1. Open a docx on Android.
  - Expected: 'Open it in another app to read it.' and Share.
- **CLI Office**
  1. Run agi library show <xlsx id>.
  - Expected: CSV text printed; record the result (not verified).
- **Zip**
  1. Upload a zip and click it in the Library.
  - Expected: No preview opens today.

**Where to look when it fails**

- OfficeDocumentUnreadableError reasons including archive_bomb (office-document-text.ts:82-119, 757-760).
- HTTP responses of /text routes.
- Mobile testIDs workbook-file-failed, workbook-file-too-large.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)
- CLI: [70-qa/test-plans/cli/025-file-previews-and-readers.md](../../70-qa/test-plans/cli/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **No archive (zip) listing anywhere.** Affects: All apps.. Evidence: No code found; brief S25.11.. Work needed: Add a bounded listing endpoint and viewer.
- **Library viewer lacks the slide view that the project modal has; Library pptx is text.** Affects: Web and Electron Library users.. Evidence: FilePreviewModal.tsx:419-425 versus LibraryView.tsx:1171-1176.. Work needed: Reuse PptxFilePreview in the shared viewer.
- **Multi-sheet workbooks show only the first sheet on web and CLI with no sheet picker.** Affects: Web, Electron, CLI users.. Evidence: office-document-text.ts:715-727.. Work needed: Sheet selection or tabs.
- **Brief says CLI and mobile are missing for Office files; code shows CLI reads the same text route and mobile has viewers.** Affects: Brief accuracy.. Evidence: lib.rs:7318-7334; WorkbookFileView.tsx; DocumentFileView.tsx.. Work needed: Run to confirm, then correct the brief.
- **Tauri desktop shows no Office preview.** Affects: Retained Tauri tree.. Evidence: DesktopLibrary.tsx:59-72.. Work needed: Wire textPreviewUri or retire.
- **VS Code and Chrome have no Office preview.** Affects: VS Code, Chrome.. Evidence: No code under their artifact or side-panel folders.. Work needed: Decide scope.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-security-and-privacy
- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- api:GET /api/files/[id]/text
- table:project_knowledge_files

## Unknown

- Whether the CLI prints Office files correctly when run.
- Whether a hidden second sheet is signalled anywhere in the web viewer.
- How the iOS system view renders docx and pptx (not run).
- Whether any zip preview is planned (no spec read).
- No test results recorded.
