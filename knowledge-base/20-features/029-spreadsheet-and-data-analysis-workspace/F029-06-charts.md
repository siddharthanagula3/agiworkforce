---
id: "F029-06"
type: "feature"
title: "Charts"
aliases: ["Charts", "Chart artifact", "Workbook chart", "Chart type", "Chart export", "PNG download", "S29.17", "S29.18", "S29.19", "S29.36", "ChartArtifact", "ReportChart"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S29.17", "S29.18", "S29.19", "S29.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "F029-01", "file:packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx", "file:apps/web/lib/services/managed-workbook-builder.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-06 Charts

Two chart features exist. The Excel file tool can add one bar, line or pie chart per sheet as a real chart in the .xlsx. Separately, chat can draw a chart artifact (bar, line, pie, scatter) with a data table and a PNG download on web, desktop-hosted web and mobile. No chart-type selector or data-range editor exists.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.17](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2917), [S29.18](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2918), [S29.19](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2919), [S29.36](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2936).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Plots a label column against a value column. In a workbook, the chart is a real Excel chart tied to sheet cells. In chat, a chart artifact is drawn from a data spec and can be saved as an image.

**Why it exists.** People want to see data as a picture and to take a chart into other documents.

**Who uses it.** Anyone asking for a chart or a workbook with a chart.

**Problems it solves**

- A chart in the .xlsx stays linked to cells (managed-workbook-builder.ts:97-108).
- A chart in chat can be saved as a PNG (ChartArtifact.tsx:39-79,147-170).
- Screen readers get a text summary of each chart (ChartArtifact.tsx:134-136).

**Use cases**

- Ask for a monthly sales sheet with a bar chart beside it.
- Ask chat to chart a table and download the PNG.
- On the phone, save a chart as an image and share it.

## 2. User experience

**Where to find it**

- Workbook chart: web composer Output, then Spreadsheet, then ask for a chart; open the .xlsx in a spreadsheet app (ComposerPlusMenu.tsx:957-990).
- Chart artifact on web and desktop-hosted web: the figure in the message, with a 'PNG' button labelled 'Download <chart name> as PNG' (ChartArtifact.tsx:147-170).
- Mobile: chart view with a control labelled 'Save <chart name> as an image' (ReportChart.tsx:915).
- CLI, VS Code: not found. Chrome: not confirmed.

**Before you start**

- Workbook chart: Cloud mode, a tool-capable model, signed in (tool-loop.ts:2565).
- Chart artifact: the assistant produces a chart spec; no account rule found for viewing.

**Screens and controls**

- Chart header shows the kind (capitalised) and counts such as '12 points · 1 series' (ChartArtifact.tsx:137-153).
- A 'PNG' button; an alert line if the export fails (ChartArtifact.tsx:171-175).
- A 'View chart data' fold-out table named '<chart> data' (ChartArtifact.tsx:212-215).
- Loading text 'Drawing chart…' (ChartArtifact.tsx:198).
- A note 'Plotting the first 500 of N points…' when cut (ChartArtifact.tsx:249-252).
- The kind label is a badge, not a selector.

**Journey**

1. Ask for a chart, in chat or inside a spreadsheet request with type, title, label column, value column and first and last row.
2. The assistant sends the spec (for the workbook, via the file tool).
3. The workbook is built with a chart part, or the chart artifact is drawn in the message.
4. Press PNG (web) or the save control (mobile) to get an image.
5. Open the .xlsx in a spreadsheet app to see the real chart; the in-app grid does not draw it.

**What the person sees and gets**

- A .xlsx with a chart on the sheet.
- A PNG file named from the chart title (ChartArtifact.tsx:31-37).
- An error message under the header if the PNG fails: 'The chart has not been drawn yet.' or 'The chart could not be converted to an image.' (ChartArtifact.tsx:43,59-63).

**Settings**

- Light and dark theme follow the document (ChartArtifact.tsx:107-108).
- Reduced motion turns animation off (ChartArtifact.tsx:111,192).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Workbook chart schema: type bar, line or pie; title up to 200 characters; column letters one to three letters; rows 1 to 100,000 (managed-office-file-service.ts:81-94).
- The chart is written as a chart part with series referencing the sheet's cells, plus a drawing part (managed-workbook-builder.ts:97-156).
- One chart per sheet (managed-workbook-builder.ts:17,240-253).
- First and last row are swapped if reversed (managed-office-file-service.ts:783-784).
- Chart artifact types: bar, line, pie, scatter; at most 500 points and 12 series (chart-spec.ts in packages/contracts/types/src: lines 1-8).
- PNG download on web: SVG drawn to a canvas at 2x scale (ChartArtifact.tsx:23,39-79).
- Mobile image export and share (ReportChart.tsx:829-830,915).

**Incomplete**

- The workbook chart refers to the value column header at row 1 for its series name, even if the header is elsewhere (managed-workbook-builder.ts:103).
- Chart in the in-app workbook preview is not drawn (grid reads cells only: workbook-sheets.ts:682) [inferred from absence].
- The brief's 'done' for S29.18 and S29.19 on web, desktop and Chrome cites the tool schema; the code has no selector or range editor.

**Present but disconnected or switched off**

- The Tauri desktop tool writes no chart (document_tools.rs:229-272).

**Not available**

- Chart type selector and data-range editor in any app: no code found. The type badge is read-only (ChartArtifact.tsx:138-141).
- Chart export as image on CLI and VS Code: none found.
- More than one chart per sheet: not supported by the writer.
- Chrome: no chart-specific code found in apps/extension/src.

## 4. Required behaviour

**Established requirements**

- The user can insert a chart built from sheet data into the workbook. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.17)
- The user can pick or change a chart type from a selector. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.18)
- The user can view and edit the cell range a chart plots. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.19)
- The user can export a chart as an image or file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.36)
- Test previews, charts and the exported file for fidelity and accessibility. (source: doc: docs/product/competitive-guidance.md:333-336)

**Acceptance criteria**

1. A requested bar chart on sheet Sales appears in the downloaded .xlsx and plots the named columns.
2. A chart type outside bar, line, pie is refused.
3. A column of 'ABCD' or a row of 0 is refused.
4. In chat, a chart artifact has a PNG button; the downloaded file opens as an image with the chart.
5. The chart has an accessible name and a text summary.
6. With no drawn SVG the export shows an alert, not a silent failure.
7. A chart with more than 500 points shows the cut-off note.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Selector and range editor would need an editable chart spec; today the only way to change a chart is to ask the assistant again [inferred].
- The brief's done marks are met for insertion (S29.17) and export (S29.36) but not for S29.18 and S29.19 [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Set S29.18 and S29.19 to missing in the brief for web, desktop and Chrome.
- [proposed] Allow more than one chart per sheet and series names from a header row.
- [proposed] Offer an SVG or data download beside PNG.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ChartSchema and SheetSchema | `apps/web/lib/services/managed-office-file-service.ts` | Validates chart type, columns, rows (lines 81-105). |
| service | generateXlsx | `apps/web/lib/services/managed-office-file-service.ts` | Maps chart input to the builder (lines 766-789). |
| service | chart parts writer | `apps/web/lib/services/managed-workbook-builder.ts` | seriesXml, plotXml, chartXml, drawingXml (lines 97-156). |
| component | ChartArtifact | `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx` | Chart figure, summary, data table, PNG download. |
| component | ChartCanvas | `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx` | Draws the chart (lazy loaded, ChartArtifact.tsx:20). |
| service | chart-spec | `packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts` | Chart theme and summary, re-exports kinds and caps. |
| schema | chart spec contract | `packages/contracts/types/src/chart-spec.ts` | CHART_KINDS, CHART_RENDER_KINDS, row and series caps (lines 1-8). |
| component | ReportChart | `apps/mobile/src/features/chat/components/ReportChart.tsx` | Mobile chart drawing and image export (lines 829,915). |
| component | ChartArtifactView | `apps/mobile/src/features/chat/components/ChartArtifactView.tsx` | Mobile chart artifact wrapper (line 26). |
| service | mobile chartArtifact utils | `apps/mobile/src/features/chat/utils/chartArtifact.ts` | Reads a chart artifact for mobile (lines 56-67). |
| service | fileCreation | `apps/mobile/services/fileCreation.ts` | exportPngImage and shareFile for mobile. |
| other | tool-loop office branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the file tool (lines 2562-2600). |
| test | managed-office-file-service tests | `apps/web/lib/services/managed-office-file-service.test.ts` | Workbook with a chart part (line 131). |
| test | ChartArtifact tests | `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx` | Chart spec reading and rendering. |
| test | mobile chart test | `apps/mobile/__tests__/SvgGalleryAndChartArtifact.test.tsx` | Mobile chart artifact; details not read. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Workbook chart: the model sends a sheet with a chart object. | outside service | tool-loop.ts:2569 [inferred that the model call goes to a provider] |
| The server validates the chart, builds the chart and drawing parts and the sheet link. | our servers | managed-office-file-service.ts:81-94,766-789; managed-workbook-builder.ts:97-156,240-253 |
| The file is stored and attached. | our servers | tool-loop.ts:2575-2596 |
| Chart artifact: the spec is parsed and the chart drawn in the browser or on the phone. | device | ChartArtifact.tsx:111-112; ReportChart.tsx |
| PNG export draws the SVG to a canvas and starts a download. | device | ChartArtifact.tsx:39-79 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chart part inside the stored .xlsx | Generated-file storage (generated-file-persist.ts:217-259) | With the account | Retention unknown |
| Exported PNG | The device's downloads or share target; the object URL is released after 60 seconds (ChartArtifact.tsx:75) | No | Owned by the person |

**Models and providers.** A tool-capable model writes the chart spec; no provider is required beyond that. Drawing uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Workbook chart: authenticated owner (tool-loop.ts:2565). Chart artifact view: none found. |
| Permissions | None found. |
| Subscription | Workbook chart follows F029-01: restricted Free chat has office creation off (free-quota.ts:126). Chart artifact: no subscription rule found. |
| Limits and metering | Workbook: one chart per sheet, 20 sheets, 100,000 row index. Artifact: 500 points, 12 series (chart-spec.ts:7-8). No metering found. |
| Feature flags | Mobile workbook creation needs the cloud code-execution flag and capability (chatExecutionStore.ts:3273-3287). |
| Model compatibility | Tool-capable model or Auto for the workbook chart. |
| Provider restrictions | None found. |
| Local mode | Drawing and exporting a chart artifact run on the device and work in Local mode. A chart inside a new .xlsx needs our servers, so is not a Local feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid chart input | Returned to the assistant as a validation message. | managed-office-file-service.ts:930-945 |
| Bad chart data on screen | A fallback block shows the reason and the raw content. | ChartArtifact.tsx:81-103,119-123,181-188 |
| Loading | 'Drawing chart…' while the chart code loads. | ChartArtifact.tsx:198 |
| PNG failure | Alert text under the header. | ChartArtifact.tsx:171-175 |
| Over 500 points | Cut-off note. | ChartArtifact.tsx:249-252 |
| Reduced motion | Animation disabled. | ChartArtifact.tsx:111,192 |
| Touch | The PNG button grows to 44 px on coarse pointers. | ChartArtifact.tsx:166 |
| Offline, retry, timeout | Not handled in the code read. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx`: Chart spec reading and defaults (lines 35-148).
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.draw.test.tsx`: Drawing; details not read.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.donut.test.tsx`: Donut variant; details not read.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.boundary.test.tsx`: Error boundary; details not read.
- `apps/web/lib/services/managed-office-file-service.test.ts`: XLSX with named sheets, formula receipts and a chart part (line 131).
- `apps/mobile/__tests__/SvgGalleryAndChartArtifact.test.tsx`: Mobile chart artifact; details not read.

**Test scenarios**

- **Workbook chart**
  1. Ask for a Sales sheet with months in A, revenue in B and a bar chart of rows 2 to 13.
  2. Open the .xlsx in a spreadsheet app.
  - Expected: A bar chart on the sheet plotting B against A for rows 2 to 13.
- **Bad column**
  1. Ask for a chart with category column 'ABCD'.
  - Expected: Refused with a validation message.
- **PNG export**
  1. On web, ask for a chart of a small table.
  2. Press PNG.
  - Expected: A PNG named after the chart opens with the chart.
- **Selector absent**
  1. Look for a chart type control or range editor.
  - Expected: None present (current).
- **Phone export**
  1. On the phone, use 'Save <chart> as an image'.
  - Expected: A share sheet with a PNG.
- **Over 500 points**
  1. Chart a 600-row table.
  - Expected: 500 points plotted and the note shown.

**Where to look when it fails**

- Error codes invalid_office_file_request and office_file_generation_failed.
- Web test ids chart-artifact, chart-artifact-fallback, chart-truncation-note.
- Export error alert text in the chart header area.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **No chart-type selector or data-range editor.** Affects: Web, desktop-hosted, Chrome (brief says done), mobile. Evidence: No code; ChartArtifact.tsx:138-141 badge only. Work needed: Correct the brief, or build editable chart settings.
- **Workbook charts are bar, line, pie only; chart artifacts also have scatter; scatter cannot go in a workbook.** Affects: Workbook users. Evidence: managed-office-file-service.ts:82; chart-spec.ts:1-3. Work needed: Add scatter to the workbook writer if wanted.
- **One chart per sheet and a fixed position.** Affects: Workbook users. Evidence: managed-workbook-builder.ts:143-156,240-253. Work needed: Allow a list of charts.
- **The in-app workbook preview does not draw the file's charts.** Affects: Web and mobile viewers. Evidence: workbook-sheets.ts:682 returns CSV only [inferred]. Work needed: Draw or note embedded charts.
- **Brief evidence for Chrome and mobile export points at unrelated lines (generatedFiles.ts:229 is video-cache code; ReportChart.tsx:394,398,474 are drawing).** Affects: Brief accuracy. Evidence: Lines read. Work needed: Repoint brief to ChartArtifact.tsx:39-79,147-170 and ReportChart.tsx:829,915.
- **CLI and VS Code have no chart creation or export.** Affects: CLI and VS Code. Evidence: No code found. Work needed: Owner decision.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- F029-01
- file:packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx
- file:apps/web/lib/services/managed-workbook-builder.ts

## Unknown

- Whether the Chrome extension can create or show charts (no chart code found in apps/extension/src; brief evidence line points to video-cache code).
- Whether the desktop Electron app adds chart export beyond the hosted web app.
- How ChartCanvas draws (file not read).
- What the mobile export looks like (ReportChart.tsx export layout not fully read).
- Whether the written chart opens correctly in every spreadsheet app: no test run recorded.
