---
id: "PLAN-desktop-029"
type: "test-plan"
title: "Desktop · 29. Spreadsheet and data-analysis workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "29"
---
# Desktop · 29. Spreadsheet and data-analysis workspace

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S29.17 Chart insertion.

- **Expected:** The user can insert a chart built from sheet data into the workbook.
- **Code:** done. Evidence present: apps/web/lib/services/managed-office-file-service.ts:370; apps/web/lib/services/managed-workbook-builder.ts:169
- **Where to find it:** not found in the code. No insert-chart button, menu or dialog found. Charts are built by the assistant only when asked for an .xlsx workbook: managed-workbook-builder and managed-office-file-service take a per-sheet chart (bar, line, pie) from the sheet's own cells. Searched 'Insert chart', 'Add chart', 'Chart type' and 'chart' in the chat and artifact files.

## S29.18 Chart-type selector.

- **Expected:** The user can pick or change a chart type from a selector.
- **Code:** done. Evidence present: apps/web/lib/services/managed-office-file-service.ts:370
- **Where to find it:** Artifact panel for a slide deck with a chart > Edit chart data > Chart type (labels found in the code)
- **Needs:** a request to the assistant for a slide deck with a chart
- **Steps:**
  1. Ask the assistant for a slide deck that contains a chart, and wait for the deck to appear in the artifact panel.
  2. Click the button labelled Edit chart data (appears only when the deck has a chart).
  3. Open the Chart type select and choose Line, then Pie, then Bar.
  4. Look at whether the chart preview changes to the chosen type, and compare with Expected.

## S29.19 Chart data-range editor.

- **Expected:** The user can view and edit the cell range a chart plots.
- **Code:** done. Evidence present: apps/web/lib/services/managed-office-file-service.ts:370
- **Where to find it:** Artifact panel for a slide deck with a chart > Edit chart data (labels found in the code)
- **Needs:** a request to the assistant for a slide deck with a chart
- **Steps:**
  1. Open a slide deck that contains a chart, as in S29.18.
  2. Click Edit chart data.
  3. Read the table of rows and columns (the first column is the label column, then one column per series).
  4. Change a value, add or remove a row, and click the apply control; then compare the chart with Expected.

## S29.27 Python analysis panel.

- **Expected:** A panel lets the user run Python analysis on data and see code, output and charts.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666; apps/web/lib/server/container-files.ts:197
- **Where to find it:** Add attachment (+ button in the chat box) > Run code (labels found in the code)
- **Needs:** a model and plan that allow code execution; a data file to upload is useful
- **Steps:**
  1. Open a chat with a model that supports code execution.
  2. Click the + button labelled Add attachment next to the chat box.
  3. Turn on the Run code item (it is greyed out when the model or plan does not allow it).
  4. Send a request that analyses data, then look for the Code execution block under the reply, expand it, and compare its stdout, stderr and images with Expected.

## S29.28 Query-result table.

- **Expected:** Results of a query or analysis appear in a sortable result table.
- **Code:** done. Evidence present: apps/web/lib/server/container-files.ts:197
- **Where to find it:** Artifact panel for a spreadsheet > click a column heading (path not confirmed in the code; trust the screen)
- **Needs:** a request to the assistant that returns a spreadsheet artifact
- **Steps:**
  1. Ask the assistant for a table or spreadsheet of results, and wait for it to open in the artifact panel.
  2. Click a column heading once to sort ascending, again to sort descending, and a third time to clear the sort.
  3. Watch the rows reorder and the heading's sort state change.
  4. Compare with Expected.

## S29.34 Export workbook.

- **Expected:** The user can export data or a sheet as a downloadable .xlsx workbook.
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now)
- **Where to find it:** Artifact panel for a spreadsheet > Download (button) > Download generated file (labels found in the code)
- **Needs:** a request to the assistant that produces an .xlsx file
- **Steps:**
  1. Ask the assistant for a spreadsheet (.xlsx) and wait for it to appear in the artifact panel.
  2. Click the Download button (title Download) in the artifact header.
  3. Click Download generated file in the menu, if it is listed.
  4. Open the downloaded file in a spreadsheet app and compare with Expected.

## S29.35 Export CSV.

- **Expected:** The user can download tabular data as a CSV file.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3486; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1874
- **Where to find it:** Artifact panel for a spreadsheet > Download (button) > Download as CSV (labels found in the code)
- **Needs:** a request to the assistant for a table or spreadsheet
- **Steps:**
  1. Open a spreadsheet, table or CSV artifact in the artifact panel.
  2. Click the Download button (title Download) in the artifact header.
  3. Click Download as CSV.
  4. Open the file that downloads, and compare its rows and columns with the artifact.

## S29.36 Export chart.

- **Expected:** The user can export a chart as an image or file.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:39; packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:169
- **Where to find it:** Chart artifact in the chat > PNG (button in the chart header) (labels found in the code)
- **Needs:** a request to the assistant for a chart
- **Steps:**
  1. Ask the assistant for a chart, and wait for it to draw in the chat.
  2. Click the button with the Download icon and the text PNG in the chart's header.
  3. Open the downloaded PNG file.
  4. Compare the picture with the chart on screen.

## S29.38 Generate a report from analysis.

- **Expected:** From an analysis, the user can get a formatted report document (docx or pdf).
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now)
- **Where to find it:** Artifact panel for a document > Download (button) > Download as Word (.docx) (labels found in the code)
- **Needs:** a request to the assistant for a report
- **Steps:**
  1. Ask the assistant for a written report based on an analysis, and wait for the document artifact to open.
  2. Click the Download button (title Download) in the artifact header.
  3. Click Download as Word (.docx), then open the file; repeat with Download as PDF.
  4. Compare the formatted file with the artifact text and with Expected.

## S29.39 Generate slides from analysis.

- **Expected:** From an analysis, the user can get a slide deck (pptx).
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now); apps/web/lib/server/container-files.ts:197
- **Where to find it:** Artifact panel for a slide deck > Download (button) > Download as PDF (labels found in the code)
- **Needs:** a request to the assistant for a slide deck
- **Steps:**
  1. Ask the assistant for a slide deck based on an analysis, and wait for the deck to open in the artifact panel.
  2. Click the Download button (title Download) in the artifact header.
  3. Click Download as PDF and open the file.
  4. Compare with Expected, which asks for a .pptx slide deck.
