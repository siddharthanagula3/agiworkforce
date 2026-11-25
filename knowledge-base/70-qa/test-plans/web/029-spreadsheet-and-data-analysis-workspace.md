---
id: "PLAN-web-029"
type: "test-plan"
title: "Web · 29. Spreadsheet and data-analysis workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "29"
---
# Web · 29. Spreadsheet and data-analysis workspace

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S29.17 Chart insertion.

- **Expected:** The user can insert a chart built from sheet data into the workbook.
- **Code:** done. Evidence present: apps/web/lib/services/managed-office-file-service.ts:370; apps/web/lib/services/managed-workbook-builder.ts:169
- **Where to find it:** not found in the code. No insert-chart control was found in apps/web or packages/ui. Charts come only from the workbook file builder (apps/web/lib/services/managed-workbook-builder.ts, a sheet's optional chart field, bar, line or pie), so the route is asking chat for an .xlsx file with a chart. The visible route and its download control were not verified.
- **Needs:** a Free account or a paid account, and a workbook request

## S29.18 Chart-type selector.

- **Expected:** The user can pick or change a chart type from a selector.
- **Code:** done. Evidence present: apps/web/lib/services/managed-office-file-service.ts:370
- **Where to find it:** Presentation artifact > Edit chart data > Chart type (labels found in the code)
- **Needs:** a presentation with a chart (ask chat to make one)
- **Steps:**
  1. Ask chat for a slide deck that includes a chart, then open the presentation artifact.
  2. Click the Edit chart data button under the slide.
  3. Open the Chart type selector and choose Line or Pie (Bar, Line and Pie are the options).
  4. Click Apply.
  5. Compare the chart on the slide with the chosen type.

## S29.19 Chart data-range editor.

- **Expected:** The user can view and edit the cell range a chart plots.
- **Code:** done. Evidence present: apps/web/lib/services/managed-office-file-service.ts:370
- **Where to find it:** Presentation artifact > Edit chart data (labels found in the code)
- **Needs:** a presentation with a chart
- **Steps:**
  1. Open a presentation artifact that has a chart.
  2. Click Edit chart data.
  3. Look at the Chart data table: one row per data point, one column per series.
  4. Change a value in a cell, add or remove a row, then click Apply.
  5. Compare the plotted values with the table.

## S29.27 Python analysis panel.

- **Expected:** A panel lets the user run Python analysis on data and see code, output and charts.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:666; apps/web/lib/server/container-files.ts:197
- **Where to find it:** Chat > Code Execution block > click Code Execution to expand (labels found in the code)
- **Needs:** a data file to upload, and an account that allows code execution (plan not verified)
- **Steps:**
  1. Attach a data file and ask chat to analyse it with Python and draw a chart.
  2. Wait until a Code Execution block appears under the reply; it says Running Python… while it runs.
  3. Click the Code Execution header to expand it.
  4. Look for the Output label, any text output, and any chart image.
  5. Compare with Expected: code, output and charts should all be visible.

## S29.28 Query-result table.

- **Expected:** Results of a query or analysis appear in a sortable result table.
- **Code:** done. Evidence present: apps/web/lib/server/container-files.ts:197
- **Where to find it:** Chat > table artifact > click a column heading to sort (labels found in the code)
- **Needs:** none beyond a chat that returns a table
- **Steps:**
  1. Ask chat for a result as a table or spreadsheet, then open the table artifact.
  2. Click a column heading.
  3. Look for the arrow and the change in row order.
  4. Click the same heading again and check that the order reverses.
  5. Compare with Expected: the result table is sortable.

## S29.34 Export workbook.

- **Expected:** The user can export data or a sheet as a downloadable .xlsx workbook.
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now)
- **Where to find it:** not found in the code. The web download menu offers only Download as CSV for tables. The Export as Excel item in packages/ui/unified-chat/src/components/ArtifactRenderer.tsx shows only when a host passes onExportNative, and apps/web does not use ArtifactRenderer. An .xlsx file can be requested from chat through the file tool in apps/web/lib/services/managed-office-file-service.ts, but its download control was not found.
- **Needs:** a spreadsheet artifact

## S29.35 Export CSV.

- **Expected:** The user can download tabular data as a CSV file.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3486; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1874
- **Where to find it:** Spreadsheet artifact > Download artifact > Download as CSV (labels found in the code)
- **Needs:** a spreadsheet or table artifact
- **Steps:**
  1. Open a spreadsheet or table artifact.
  2. Click the download icon (its hidden name is Download artifact).
  3. Click Download as CSV.
  4. Open the saved .csv file.
  5. Compare the rows and columns with the table on screen.

## S29.36 Export chart.

- **Expected:** The user can export a chart as an image or file.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:39; packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:169
- **Where to find it:** Chart artifact > PNG (labels found in the code)
- **Needs:** a chart artifact
- **Steps:**
  1. Ask chat for a chart, then open the chart artifact.
  2. Click the PNG button in the chart toolbar.
  3. Open the saved .png file.
  4. Compare the picture with the chart on screen.

## S29.38 Generate a report from analysis.

- **Expected:** From an analysis, the user can get a formatted report document (docx or pdf).
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now)
- **Where to find it:** Document artifact > Download artifact > Download as Word (.docx) (labels found in the code)
- **Needs:** a document artifact
- **Steps:**
  1. Ask chat to analyse the data and write a report, then open the document artifact.
  2. Click the download icon (its hidden name is Download artifact).
  3. Click Download as Word (.docx) or Download as PDF.
  4. Open the saved file.
  5. Compare its formatting with Expected: a formatted report.

## S29.39 Generate slides from analysis.

- **Expected:** From an analysis, the user can get a slide deck (pptx).
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now); apps/web/lib/server/container-files.ts:197
- **Where to find it:** not found in the code. The presentation download menu offers Download as PDF only, in apps/web/features/chat/components/artifacts/ArtifactPreview.tsx. No pptx download label was found. A .pptx file can be requested from chat through apps/web/lib/services/managed-office-file-service.ts, but its download control was not found.
- **Needs:** a slide deck from chat
