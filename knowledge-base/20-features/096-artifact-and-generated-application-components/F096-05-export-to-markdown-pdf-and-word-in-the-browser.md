---
id: "F096-05"
type: "feature"
title: "Export to Markdown, PDF and Word in the browser"
aliases: ["Document export", "Download as Markdown, PDF, Word", "document-export-service", "Download artifact menu", "Export report as"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.11"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "surface:web", "F096-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-05 Export to Markdown, PDF and Word in the browser

In the browser, a document artifact, research report or whole chat can be downloaded as Markdown, PDF or Word, built on the device with no server call. The artifact Download menu also offers CSV, HTML, SVG, source, deck PDF and generated files, depending on artifact type. Only web code was read.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.11](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9611).

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

**What it does.** Converts markdown-like content into blocks and renders Word (docx library) or PDF (jsPDF-based renderer) in the browser, or saves Markdown, then downloads via a temporary link (apps/web/features/chat/services/document-export-service.ts:13-87).

**Why it exists.** People need to take an answer out of the app as a normal file, and doing it on the device avoids server work and uploads.

**Who uses it.** Web users with document artifacts, research reports and chat exports.

**Problems it solves**

- Keeping a document outside the app
- Spreadsheet-formula injection in CSV or source downloads (spreadsheetSafeExport, ArtifactPreview.tsx:1408)

**Use cases**

- Download a document artifact as Word
- Export a research report as PDF with a metadata header in Markdown
- Download a table artifact as CSV
- Export a conversation

## 2. User experience

**Where to find it**

- Web artifact panel: download button 'Download artifact' (title 'Download'); one item shows a button, several show a menu (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2782-2815)
- Research report: buttons labelled 'Export report as <format>' (apps/web/features/chat/components/research/ResearchReportView.tsx:429)
- Chat export dialog (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:132-150)
- Library view export (apps/web/features/library/components/LibraryView.tsx:271)
- CLI: 'agi artifacts show --out' writes an artifact to a file (apps/cli/src/lib.rs:10148; apps/cli/src/cloud/artifacts.rs:280-290). Chrome side panel has its own download code (apps/extension/src/features/side-panel/artifactPanel.ts imports saveBlob), not examined. Public Desktop shows the hosted web app (doc: AGENTS.md section 5).

**Before you start**

- An artifact with content in the panel; type decides which items appear (ArtifactPreview.tsx:2383-2420)

**Screens and controls**

- Menu items: 'Download as CSV' (tabular), 'Download as SVG' (mermaid with SVG), 'Download as HTML', 'Download source (.ext)', 'Download as Markdown', 'Download as PDF' (presentation deck), 'Download as Word (.docx)' and 'Download as PDF' (text documents), 'Download generated file' (ArtifactPreview.tsx:2383-2420)

**Journey**

1. Open the artifact
2. Click Download and pick a format
3. The browser builds the file and downloads it
4. On error a message names the format

**What the person sees and gets**

- File saved by the browser; deck PDF shows 'Preparing the PDF…' then 'PDF downloaded' (ArtifactPreview.tsx:1643-1652)
- Error 'This document could not be exported as Word|PDF' (ArtifactPreview.tsx:1659-1664); research report shows the export error under the buttons (ResearchReportView.tsx:274)

**Settings**

- Chat export dialog: custom file name, include timestamps, include metadata (EnhancedExportDialog.tsx:110-125)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Markdown, PDF and Word build from the same blocks in the browser (document-export-service.ts:30-55)
- exportDocument picks the format and swaps the file extension (service lines 68-87)
- Markdown metadata header 'key: value' between --- lines when metadata is given (service lines 19-26); used by research report and chat export (ResearchReportView.tsx:264-270; EnhancedExportDialog.tsx:132)
- Artifact menu with CSV, HTML, SVG, source, Markdown, deck PDF, Word, PDF (ArtifactPreview.tsx:2383-2420)
- Spreadsheet formula neutralisation on source and CSV downloads (ArtifactPreview.tsx:1408; test ArtifactPreview.csvInjection.test.tsx)

**Incomplete**

- The artifact 'Download as Markdown' does not use downloadAsMarkdown, so it gets no metadata header; it wraps non-markdown content in a fenced block (ArtifactPreview.tsx:1393-1401)
- Word and PDF only for artifacts of type document (isTextDocument, ArtifactPreview.tsx:1484); other types are not exportable to Word or PDF

**Present but disconnected or switched off**

- exportDocument's 'markdown' case is not called from the artifact panel, which only passes docx and pdf (ArtifactPreview.tsx:1655)

**Not available**

- Mobile, VS Code: export not examined; CLI writes a file by artifact type, not into Word or PDF

## 4. Required behaviour

**Established requirements**

- Adapters convert artifact or document content into export formats (Markdown, PDF, DOCX, HTML, CSV). (source: brief S96.11)
- Markdown export adds a metadata header when metadata is given. (source: apps/web/features/chat/services/document-export-service.ts:19-26)
- Artifact UI must include copy and download/export actions. (source: doc: docs/product/requirements.md section 17)
- Spreadsheet downloads must not carry live formulas from untrusted text. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1405-1408 comment)

**Acceptance criteria**

1. A document artifact downloads as .docx that opens in Word with headings, tables and lists intact
2. The same document downloads as .pdf
3. A research report exported as Markdown starts with a --- header holding status, sources and generated
4. A CSV download of a cell beginning with = does not run as a formula
5. An export failure shows a visible message
6. No network request is made during Word or PDF export

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Export works offline because it is built on the device [inferred from document-export-service.ts:1-87]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Route the artifact Markdown download through the shared service so metadata is consistent
- [proposed] Offer Word and PDF for more artifact types

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | Markdown, PDF, Word downloads and exportDocument |
| service | export-docx | `apps/web/features/chat/services/export-docx.ts` | Builds Word document from blocks (line 360) |
| service | export-pdf | `apps/web/features/chat/services/export-pdf.ts` | Renders PDF from blocks (line 1179) |
| service | export-math | `apps/web/features/chat/services/export-math.ts` | Math handling in exports |
| schema | DocumentFormat | `apps/web/features/chat/types/message-metadata.ts` | markdown, pdf, docx (line 10) |
| component | ArtifactPreview download menu | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | handleDownload, handleExportDocument, menu items (lines 1381,1655,2383-2420) |
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Export buttons with metadata |
| component | EnhancedExportDialog | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` | Chat export in several formats |
| component | LibraryView | `apps/web/features/library/components/LibraryView.tsx` | Library export to Word or PDF (line 271) |
| service | conversation-export | `apps/web/features/chat/services/conversation-export.ts` | Markdown and HTML for chats |
| service | deck-pdf | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Deck to PDF (dynamic import, ArtifactPreview.tsx:1647) |
| service | spreadsheetSafeExport | `packages/ui/unified-chat/src` | Formula-safe CSV and source output (imported from @agiworkforce/unified-chat/tabular) |
| command | agi artifacts show --out | `apps/cli/src/cloud/artifacts.rs` | CLI file output with extension by type (lines 236,280) |
| component | Chrome side panel artifacts | `apps/extension/src/features/side-panel/artifactPanel.ts` | Own save code (saveBlob, spreadsheetSafeExport imports) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a format in the artifact menu | device | ArtifactPreview.tsx:2383-2420 |
| Content is parsed into document blocks | device | document-export-service.ts:35,48 |
| Word is packed to a Blob; PDF is saved by the PDF library; Markdown is a text Blob | device | document-export-service.ts:13-55 |
| A temporary link downloads the file and is revoked | device | document-export-service.ts:57-66 |
| For a generated file the stored link is fetched from the server | our servers | ArtifactPreview.tsx:1668-1676 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file | The person's downloads folder | No | Owned by the person; the app keeps nothing |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for export itself |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | Presentation and connector items depend on other flags (ArtifactPreview.tsx:2448 connectorsReleased) but download items do not |
| Model compatibility | Independent of model. |
| Provider restrictions | none found in the code |
| Local mode | Fully on the device; works for Local chats because no server call is made [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Deck PDF shows a loading toast | ArtifactPreview.tsx:1644 |
| Error | Toast or inline error naming the format | ArtifactPreview.tsx:1659-1664; ResearchReportView.tsx:274 |
| Exporting | Research view tracks exportingFormat | ResearchReportView.tsx:261 |
| Single item | Menu collapses to one button | ArtifactPreview.tsx:2782-2795 |
| Binary artifacts | Word and PDF items hidden; generated-file download used | ArtifactPreview.tsx:2274,2370 |
| Offline | Works for local content; generated-file download needs the server [inferred] | apps/web/features/chat/services/document-export-service.ts:13-87 (no fetch call); ArtifactPreview.tsx:1668-1676 |
| Cancel | not handled in the code | apps/web/features/chat/services/document-export-service.ts (no abort path) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/services/__tests__/document-export-service.test.ts`: Markdown to blocks: kinds, marks, fenced blocks, tables, lists, task state, math, paragraphs
- `apps/web/features/chat/services/export-math.test.ts`: Math in exports
- `apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx`: Markdown document downloads as Markdown, not one code fence
- `apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx`: Formula neutralisation for CSV, JSON and source downloads
- `apps/web/features/chat/components/dialogs/EnhancedExportDialog.test.tsx`: Chat export dialog
- `apps/web/features/chat/pages/__tests__/WebChatPage.export.test.tsx`: Page-level export wiring

**Test scenarios**

- **Word export**
  1. Open a document artifact with a table
  2. Download > Download as Word (.docx)
  3. Open in Word
  - Expected: Heading, table and lists are present
- **Report metadata**
  1. Export a research report as Markdown
  - Expected: File begins with --- status, sources, generated ---
- **CSV injection**
  1. Open a table with a cell '=1+1'
  2. Download as CSV
  - Expected: Cell is neutralised
- **Offline export**
  1. Go offline
  2. Download a document as PDF
  - Expected: File is produced
- **Artifact Markdown**
  1. Download an HTML artifact as Markdown
  - Expected: Title heading and fenced code block, no metadata header

**Where to look when it fails**

- Toast text 'This document could not be exported as ...'
- Browser console errors from docx or PDF libraries

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief lists CSV and HTML export as missing from code; they exist in the artifact menu** Affects: Docs. Evidence: ArtifactPreview.tsx:2383-2388. Work needed: Update brief
- **Artifact Markdown download bypasses the shared service and its metadata header** Affects: Web. Evidence: ArtifactPreview.tsx:1393-1401. Work needed: Use downloadAsMarkdown
- **Word and PDF only for document-type artifacts** Affects: Web. Evidence: ArtifactPreview.tsx:1484. Work needed: Decide scope
- **Mobile, VS Code and Chrome export formats not established** Affects: Those apps. Evidence: Not read. Work needed: Audit
- **No server adapters; brief calls them platform components** Affects: Docs. Evidence: No server export route found for artifacts. Work needed: Clarify

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- surface:web
- F096-04

## Unknown

- Export formats on mobile, VS Code and Chrome
- Whether HTML conversation export mentioned in the brief maps to artifact HTML
- Fonts and layout quality of PDF output (no human check recorded)
- Whether a plan limit applies: none found
