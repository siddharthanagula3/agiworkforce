---
id: "GAPS-AREA-029"
type: "gap-list"
title: "Gaps: Spreadsheet and data-analysis workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 29. Spreadsheet and data-analysis workspace

74 open gaps that touch this area. Area page: [20-features/029-spreadsheet-and-data-analysis-workspace](../../20-features/029-spreadsheet-and-data-analysis-workspace/README.md).

## CMP-W118

**Ask about or change a selected range of spreadsheet cells**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md), [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Spreadsheet artifacts are read-only tables with sorting; cells cannot be selected to ask about.
- Evidence: packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:21-27 (read-only)

## CMP-WP104

**Design export to zip, PDF, PowerPoint or standalone HTML, with handoff to code**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: No zip, PowerPoint or handoff to a coding session A design downloads as HTML, PDF or source; no zip, PowerPoint or handoff to a coding session.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2380-2402

## CMP-WP106

**Export a deck to PowerPoint, PDF or Google Slides**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md), [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md), [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md), [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: A .pptx comes only when the assistant creates a file A deck downloads as PDF, HTML or Markdown; a .pptx comes only when the assistant creates a file; no Google Slides export.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2390; apps/web/lib/tool-copy.ts:92

## CMP-WP93

**Spreadsheet and data artifacts with working formulas (Data, Sheets)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md), [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Are read-only CSV, table and workbook artifacts show with sorting and sheet tabs but are read-only; .xlsx files come from the assistant.
- Evidence: packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:24; apps/web/lib/tool-copy.ts:92

## CMP-WP98

**Bring data into a sheet from CSV, Excel, Google Sheets or paste; export xlsx or CSV**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F025-03](../../20-features/025-file-previews-and-readers/F025-03-preview-office-files-and-archives.md), [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md), [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: No import into an editable sheet and no .xlsx export Attached CSV and Excel files preview as tables and a sheet downloads as CSV; no import into an editable sheet and no .xlsx export.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2375; packages/ui/unified-chat/src/lib/workbook-sheets.ts:673

## GAP-AREA029-LW06

**Chart placement is computed from the length of the value column letter, not the data position. For single-letter columns the anchor is always column 5, and the chart always ends at column 14 and row 18.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-029
- Detail: Area 29. Spreadsheet and data-analysis workspace
- Evidence: apps/web/lib/services/managed-workbook-builder.ts:148-149

## GAP-AREA029-LW09

**Workbook cells have one default style only; number formats, dates, currency, conditional formatting and validation cannot be written, but the tool description does not say so.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-029
- Detail: Area 29. Spreadsheet and data-analysis workspace
- Evidence: apps/web/lib/services/managed-workbook-builder.ts:225-238

## GAP-CAP-artifacts-and-documents-07

**Export documents and decks to Word, PDF, Markdown, PowerPoint: Export fidelity: seen duplicated title and a page footer without a number in a Word file; export to Google formats gated while connectors are unreleased. Two near-identical download entries.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Requirement items: S27.35, S27.36, S27.37, S29.34, S29.35, S29.36, S30.28, S30.29, S96.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-09

**Spreadsheet artifact edited together with the assistant: No confirmed cell editing with formulas, no range questions, no accept/reject of proposed range changes; Mobile partial; CLI and VS Code none.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md), [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Requirement items: S29.05, S29.06, S29.17, S29.18, S29.19, S29.31, S29.32, S29.33, S29.34, S29.35
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-F029-01-01

**The xlsx title is required but never written; no author or description exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-01](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-01-workbook-structure-title-metadata-sheets.md)
- Detail: Affects: Web, desktop-hosted web, mobile and Chrome users who ask for a titled workbook. Work needed: Write document properties from the title or drop the field; add author and description only if S29.01 is kept.
- Evidence: managed-office-file-service.ts:154,766-789; managed-workbook-builder.ts:172-253

## GAP-F029-01-02

**Sheet add, rename, duplicate and delete are not in the product.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-01](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-01-workbook-structure-title-metadata-sheets.md)
- Detail: Affects: All apps. Work needed: None while the founder decision stands; keep the brief aligned.
- Evidence: No code found; doc: docs/decisions/2026-09-27-founder-decisions.md:119-123

## GAP-F029-01-03

**The brief says nothing about the read-only tab view that exists on web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-01](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-01-workbook-structure-title-metadata-sheets.md)
- Detail: Affects: Anyone reading the brief. Work needed: Update the brief status for S29.02.
- Evidence: SpreadsheetArtifact.tsx:35-70; TabularGridView.tsx:93-134

## GAP-F029-01-04

**The Tauri workbook writer can write metadata and many sheets but the tool only writes one sheet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-01](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-01-workbook-structure-title-metadata-sheets.md)
- Detail: Affects: Tauri desktop (internal). Work needed: Decide whether Tauri stays; if so extend the tool or retire the code.
- Evidence: create_excel.rs:161-191; document_tools.rs:229-272

## GAP-F029-01-05

**CLI and VS Code have no workbook creation or view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-01](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-01-workbook-structure-title-metadata-sheets.md)
- Detail: Affects: CLI and VS Code users. Work needed: Not specified; owner decision needed.
- Evidence: apps/cli/src/documents.rs:569-584 reads only

## GAP-F029-01-NOTBUILT

**Workbook structure: title, metadata, sheets: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F029-01](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-01-workbook-structure-title-metadata-sheets.md)
- Requirement items: S29.01, S29.02, S29.03
- Detail: CLI: S29.01, S29.02, S29.03; VS Code: S29.01, S29.02, S29.03

## GAP-F029-02-01

**No cell editing, formula bar, range selection, freeze command or resize.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md)
- Detail: Affects: All apps. Work needed: Nothing while decision D-2026-09-27-02 stands; otherwise a grid editor is a large build.
- Evidence: No such code found; SpreadsheetArtifact.tsx:81 selection is one cell

## GAP-F029-02-02

**The brief's listed missing status for CLI, VS Code and Chrome is correct; web, desktop and mobile statuses omit the read-only grid that exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md)
- Detail: Affects: Readers of the brief. Work needed: Update brief wording.
- Evidence: SpreadsheetArtifact.tsx; TabularGridView.tsx

## GAP-F029-02-03

**Rows beyond 500 cannot be seen in app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Paging or download hint if wanted.
- Evidence: tabular.ts:78

## GAP-F029-02-NOTBUILT

**Grid view and cell editing: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F029-02](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-02-grid-view-and-cell-editing.md)
- Requirement items: S29.04, S29.05, S29.06, S29.11, S29.12
- Detail: CLI: S29.04, S29.05, S29.06, S29.11; VS Code: S29.04, S29.05, S29.06, S29.11, S29.12; Chrome: S29.04, S29.05, S29.06, S29.11, S29.12

## GAP-F029-03-01

**No formula explanation, named range creation or error display with explanation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md)
- Detail: Affects: All apps. Work needed: Chat can already explain a formula in text, but no dedicated action exists; build it only if wanted.
- Evidence: No code found for S29.07, S29.08, S29.33

## GAP-F029-03-02

**Voice cannot build a workbook with formulas.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md)
- Detail: Affects: Voice on web and desktop. Work needed: Pass an executor or remove formulas from voice instructions.
- Evidence: live-voice-tool-runner.ts:155; managed-office-file-service.ts:1004-1011

## GAP-F029-03-03

**Brief marks all six apps missing, but formula writing and recalculation work server-side for web, desktop-hosted, mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md)
- Detail: Affects: Readers of the brief. Work needed: Split S29.07, S29.08, S29.33 from formula creation in the brief.
- Evidence: managed-workbook-builder.ts:70-71

## GAP-F029-03-04

**A fixed function list means common functions such as lookups may be refused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md)
- Detail: Affects: Users asking for advanced formulas. Work needed: Review the list against what leaders support.
- Evidence: managed-office-preservation.ts:395-460 (full list not read)

## GAP-F029-03-NOTBUILT

**Formulas and named ranges: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F029-03](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-03-formulas-and-named-ranges.md)
- Requirement items: S29.07, S29.08, S29.33
- Detail: CLI: S29.07, S29.08, S29.33; VS Code: S29.07, S29.08, S29.33; Chrome: S29.07, S29.08, S29.33

## GAP-F029-04-01

**No filter and no table object.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-04](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-04-tables-sort-and-filter.md)
- Detail: Affects: All apps. Work needed: Follow the founder decision; otherwise build both.
- Evidence: No code; managed-workbook-builder.ts:172-253

## GAP-F029-04-02

**Brief marks sort missing only on CLI, VS Code, Chrome but marks S29.09 missing on all six; no mention that sort exists on web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-04](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-04-tables-sort-and-filter.md)
- Detail: Affects: Readers of the brief. Work needed: Clarify brief.
- Evidence: tabular.ts:80-106

## GAP-F029-04-03

**Sort is not saved or written to the file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-04](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-04-tables-sort-and-filter.md)
- Detail: Affects: All apps. Work needed: None unless required.
- Evidence: Component state only

## GAP-F029-04-NOTBUILT

**Tables, sort and filter: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F029-04](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-04-tables-sort-and-filter.md)
- Requirement items: S29.09, S29.10
- Detail: CLI: S29.09, S29.10; VS Code: S29.09, S29.10; Chrome: S29.09, S29.10

## GAP-F029-05-01

**Tool cannot write number, date, currency formats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-05](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-05-number-date-and-currency-formats-conditional-forma.md)
- Detail: Affects: Web, desktop-hosted, mobile, Chrome users making workbooks. Work needed: Extend schema and styles part.
- Evidence: managed-workbook-builder.ts:225-238

## GAP-F029-05-02

**No conditional formatting, validation or protection creation or display.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-05](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-05-number-date-and-currency-formats-conditional-forma.md)
- Detail: Affects: All apps. Work needed: Extend schema and viewer.
- Evidence: No code found for S29.14-S29.16

## GAP-F029-05-03

**The tool description does not say formats are unsupported, so a model may promise them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-05](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-05-number-date-and-currency-formats-conditional-forma.md)
- Detail: Affects: Users. Work needed: State the limit in the tool text.
- Evidence: managed-office-file-service.ts:253

## GAP-F029-05-04

**Brief marks formats missing everywhere, but reading and showing existing formats works.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-05](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-05-number-date-and-currency-formats-conditional-forma.md)
- Detail: Affects: Readers of the brief. Work needed: Split read from write in the brief.
- Evidence: workbook-number-formats.ts:345

## GAP-F029-05-NOTBUILT

**Number, date and currency formats, conditional formatting, data validation, protection: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F029-05](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-05-number-date-and-currency-formats-conditional-forma.md)
- Requirement items: S29.13, S29.14, S29.15, S29.16
- Detail: CLI: S29.13, S29.14, S29.15, S29.16; VS Code: S29.13, S29.14, S29.15, S29.16; Chrome: S29.13, S29.14, S29.15, S29.16

## GAP-F029-06-01

**No chart-type selector or data-range editor.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Detail: Affects: Web, desktop-hosted, Chrome (brief says done), mobile. Work needed: Correct the brief, or build editable chart settings.
- Evidence: No code; ChartArtifact.tsx:138-141 badge only

## GAP-F029-06-02

**Workbook charts are bar, line, pie only; chart artifacts also have scatter; scatter cannot go in a workbook.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Detail: Affects: Workbook users. Work needed: Add scatter to the workbook writer if wanted.
- Evidence: managed-office-file-service.ts:82; chart-spec.ts:1-3

## GAP-F029-06-03

**One chart per sheet and a fixed position.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Detail: Affects: Workbook users. Work needed: Allow a list of charts.
- Evidence: managed-workbook-builder.ts:143-156,240-253

## GAP-F029-06-04

**The in-app workbook preview does not draw the file's charts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Detail: Affects: Web and mobile viewers. Work needed: Draw or note embedded charts.
- Evidence: workbook-sheets.ts:682 returns CSV only [inferred]

## GAP-F029-06-05

**Brief evidence for Chrome and mobile export points at unrelated lines (generatedFiles.ts:229 is video-cache code; ReportChart.tsx:394,398,474 are drawing).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Detail: Affects: Brief accuracy. Work needed: Repoint brief to ChartArtifact.tsx:39-79,147-170 and ReportChart.tsx:829,915.
- Evidence: Lines read

## GAP-F029-06-06

**CLI and VS Code have no chart creation or export.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Detail: Affects: CLI and VS Code. Work needed: Owner decision.
- Evidence: No code found

## GAP-F029-06-NOTBUILT

**Charts: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md)
- Requirement items: S29.17, S29.18, S29.19, S29.36
- Detail: CLI: S29.17, S29.18, S29.19, S29.36; VS Code: S29.17, S29.18, S29.19, S29.36; Chrome: S29.17, S29.18, S29.19, S29.36

## GAP-F029-07-01

**No pivot or grouped summary view**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-07](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-07-pivot-tables-data-cleaning-and-data-profiling.md)
- Detail: Affects: All six apps. Work needed: Build a deterministic grouping function and a result view; decide the home (shared UI package).
- Evidence: Brief S29.20

## GAP-F029-07-02

**No cleaning preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-07](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-07-pivot-tables-data-cleaning-and-data-profiling.md)
- Detail: Affects: All six apps. Work needed: Compute proposed row changes, show them, apply only after approval.
- Evidence: Brief S29.21

## GAP-F029-07-03

**No missing-value, duplicate or type summaries**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-07](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-07-pivot-tables-data-cleaning-and-data-profiling.md)
- Detail: Affects: All six apps. Work needed: Add a profiling function and a summary card on a dataset.
- Evidence: Briefs S29.22-S29.24

## GAP-F029-07-04

**Not defined: failure, limits, subscription and Local-mode behaviour**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-07](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-07-pivot-tables-data-cleaning-and-data-profiling.md)
- Detail: Affects: All. Work needed: Write the requirement first, then implement.
- Evidence: No code to inspect

## GAP-F029-07-NOTBUILT

**Pivot tables, data cleaning and data profiling: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F029-07](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-07-pivot-tables-data-cleaning-and-data-profiling.md)
- Requirement items: S29.20, S29.21, S29.22, S29.23, S29.24
- Detail: Web: S29.20, S29.21, S29.22, S29.23, S29.24; Desktop: S29.20, S29.21, S29.22, S29.23, S29.24; Mobile: S29.20, S29.21, S29.22, S29.23, S29.24; CLI: S29.20, S29.21, S29.22, S29.23, S29.24; VS Code: S29.20, S29.21, S29.22, S29.23, S29.24; Chrome: S29.20, S29.21, S29.22, S29.23, S29.24

## GAP-F029-08-01

**No ordered transformation history**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-08](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-08-analysis-history-assumptions-and-templates.md)
- Detail: Affects: All six apps. Work needed: Define a step record, store it, and add a list view.
- Evidence: Brief S29.25

## GAP-F029-08-02

**No assumptions place**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-08](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-08-analysis-history-assumptions-and-templates.md)
- Detail: Affects: All six apps. Work needed: Have analyses emit assumptions as structured data and show them.
- Evidence: Brief S29.37

## GAP-F029-08-03

**No analysis templates**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-08](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-08-analysis-history-assumptions-and-templates.md)
- Detail: Affects: All six apps. Work needed: Decide storage (skills or new table) and add save and rerun.
- Evidence: Brief S29.40

## GAP-F029-08-04

**Failure and limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-08](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-08-analysis-history-assumptions-and-templates.md)
- Detail: Affects: All. Work needed: Write requirements for mismatched columns and missing inputs.
- Evidence: No code

## GAP-F029-08-NOTBUILT

**Analysis history, assumptions and templates: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F029-08](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-08-analysis-history-assumptions-and-templates.md)
- Requirement items: S29.25, S29.37, S29.40
- Detail: Web: S29.25, S29.37, S29.40; Desktop: S29.25, S29.37, S29.40; Mobile: S29.25, S29.37, S29.40; CLI: S29.25, S29.37, S29.40; VS Code: S29.25, S29.37, S29.40; Chrome: S29.25, S29.37, S29.40

## GAP-F029-09-01

**No SQL panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Detail: Affects: All six apps. Work needed: Choose a query engine and build a panel with sortable results.
- Evidence: Brief S29.26; searches found no SQL engine

## GAP-F029-09-02

**No single Python panel showing code, output and charts together**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome, CLI, VS Code. Work needed: Compose existing cards into one panel.
- Evidence: Brief S29.27 plus code read

## GAP-F029-09-03

**Chrome, CLI and VS Code cannot run analysis code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Decide whether those surfaces offer Run code and expose it.
- Evidence: Brief; request-processor.ts:928 excludes vscode and cli from implicit execution

## GAP-F029-09-04

**Mobile has no query-result table (chat tables only)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Detail: Affects: Mobile. Work needed: Confirm requirement and extend.
- Evidence: Brief S29.28; MessageContentRenderer.tsx:311

## GAP-F029-09-05

**Local-mode behaviour undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Detail: Affects: Desktop and Mobile local inference. Work needed: State clearly in the product that code runs in Cloud, or build a local runner.
- Evidence: No local sandbox found

## GAP-F029-09-06

**Brief code pointers are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: chat-attachment-hydration.ts:466 is an attachment function, container-files.ts:196 is a mime step

## GAP-F029-09-NOTBUILT

**SQL and Python analysis: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F029-09](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-09-sql-and-python-analysis.md)
- Requirement items: S29.26, S29.27, S29.28
- Detail: Web: S29.26; Desktop: S29.26; Mobile: S29.26, S29.28; CLI: S29.26, S29.28; VS Code: S29.26, S29.28; Chrome: S29.26, S29.27, S29.28

## GAP-F029-10-01

**No source details**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-10](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-10-connected-data-source-details-and-refresh.md)
- Detail: Affects: All six apps. Work needed: Record source on table results and show it.
- Evidence: Brief S29.29

## GAP-F029-10-02

**No refresh**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-10](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-10-connected-data-source-details-and-refresh.md)
- Detail: Affects: All six apps. Work needed: Store the query and add a re-run with approval.
- Evidence: Brief S29.30

## GAP-F029-10-03

**Failure and limits undefined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-10](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-10-connected-data-source-details-and-refresh.md)
- Detail: Affects: All. Work needed: Write the requirement.
- Evidence: No code

## GAP-F029-10-NOTBUILT

**Connected data: source details and refresh: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F029-10](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-10-connected-data-source-details-and-refresh.md)
- Requirement items: S29.29, S29.30
- Detail: Web: S29.29, S29.30; Desktop: S29.29, S29.30; Mobile: S29.29, S29.30; CLI: S29.29, S29.30; VS Code: S29.29, S29.30; Chrome: S29.29, S29.30

## GAP-F029-11-01

**No preview of changed cells**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md)
- Detail: Affects: All six apps. Work needed: Show the edit list as a diff and require approval before running.
- Evidence: Brief S29.31

## GAP-F029-11-02

**No accept or reject per range**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md)
- Detail: Affects: All six apps. Work needed: Group edits by range and apply only accepted groups.
- Evidence: Brief S29.32; single all-or-nothing edit list

## GAP-F029-11-03

**Edit cannot create new cells**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Decide if adding rows or cells is required.
- Evidence: managed-office-preservation.ts:1471-1474

## GAP-F029-11-04

**Voice cannot edit attached workbooks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md)
- Detail: Affects: Web voice. Work needed: Decide whether voice should edit files.
- Evidence: live-voice-tools.ts:399 passes no attachments

## GAP-F029-11-05

**Receipt visibility unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md)
- Detail: Affects: All. Work needed: Check and surface changed parts.
- Evidence: No UI code for the receipt read

## GAP-F029-11-NOTBUILT

**Assistant changes to a sheet: preview and accept or reject: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F029-11](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md)
- Requirement items: S29.31, S29.32
- Detail: Web: S29.31, S29.32; Desktop: S29.31, S29.32; Mobile: S29.31, S29.32; CLI: S29.31, S29.32; VS Code: S29.31, S29.32; Chrome: S29.31, S29.32

## GAP-F029-12-01

**Server CSV does not neutralize formula cells**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome (assistant-made CSV). Work needed: Apply the shared neutralizer in generateCsv and add a test.
- Evidence: managed-office-file-service.ts:759-766 vs tabular.ts:380

## GAP-F029-12-02

**CLI and VS Code cannot create files or export CSV**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide scope and expose the tool or a local equivalent.
- Evidence: Brief; no create_office_file code in those trees

## GAP-F029-12-03

**Output menu lists only Document, Presentation, Spreadsheet**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Affects: Web, Mobile. Work needed: Decide whether PDF and CSV should be pickable.
- Evidence: skills.ts:20

## GAP-F029-12-04

**Local mode cannot build files**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Affects: Desktop and Mobile local inference. Work needed: Define Local behaviour or state it plainly.
- Evidence: Tool runs in the Cloud route

## GAP-F029-12-05

**Brief's request-processor.ts:724 pointer is stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: Line 724 is a schema field; the real code is at 1258 and 5460

## GAP-F029-12-06

**No chart-image export in this feature**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Detail: Affects: All. Work needed: Cover in the chart feature page.
- Evidence: Chart export belongs to another item (S29.36)

## GAP-F029-12-NOTBUILT

**Export and reports: workbook, CSV, chart, report and slides: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md)
- Requirement items: S29.34, S29.35, S29.38, S29.39
- Detail: CLI: S29.34, S29.35, S29.38, S29.39; VS Code: S29.34, S29.35, S29.38, S29.39
