---
id: "PLAN-chrome-029"
type: "test-plan"
title: "Chrome · 29. Spreadsheet and data-analysis workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "29"
---
# Chrome · 29. Spreadsheet and data-analysis workspace

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S29.17 Chart insertion.

- **Expected:** The user can insert a chart built from sheet data into the workbook.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts:82; apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** Side panel chat > ask for an Excel workbook with a chart > Files from this answer > Download <file name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome and sign in.
  2. Type a request for an Excel workbook with sheet data and a chart built from those rows, then send it.
  3. When the reply shows the "Files from this answer" list, find the .xlsx file card and click its Download button (its name is "Download <file name>").
  4. Open the saved .xlsx outside the app and check that the chart plots the rows from the sheet, to compare with Expected.

## S29.18 Chart-type selector.

- **Expected:** The user can pick or change a chart type from a selector.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts:82; apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** not found in the code. No chart-type selector found. Searched apps/extension and packages/ui/unified-chat for chart, chart type and select; ChartArtifact only offers a PNG download and the extension does not import it. The chart type (bar, line or pie) is set by the assistant in the schema in apps/web/lib/services/managed-office-file-service.ts.

## S29.19 Chart data-range editor.

- **Expected:** The user can view and edit the cell range a chart plots.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts:82; apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** not found in the code. No chart data-range editor found. Searched apps/extension and packages/ui/unified-chat for range, data range and chart; the column choices (category_column, value_column) are set by the assistant in apps/web/lib/services/managed-office-file-service.ts and no editing control was found.

## S29.34 Export workbook.

- **Expected:** The user can export data or a sheet as a downloadable .xlsx workbook.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts (text found, layout changed); apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** Side panel chat > ask for an Excel workbook > Files from this answer > Download <file name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome and sign in.
  2. Type a request for an Excel workbook (.xlsx) with the sheet data you want, then send it.
  3. When the reply shows the "Files from this answer" list, click the Download button on the .xlsx file card ("Download <file name>").
  4. Open the saved .xlsx and check that its sheets match the data in the reply, to compare with Expected.

## S29.35 Export CSV.

- **Expected:** The user can download tabular data as a CSV file.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts:201; apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** Side panel chat > ask for a CSV file of a table > Files from this answer > Download <file name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome and sign in.
  2. Type a request for a CSV file containing a table of data, then send it.
  3. When the reply shows the "Files from this answer" list, click the Download button on the .csv file card ("Download <file name>").
  4. Open the saved .csv and check that its rows match the table, to compare with Expected.

## S29.38 Generate a report from analysis.

- **Expected:** From an analysis, the user can get a formatted report document (docx or pdf).
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts:556; apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** Side panel chat > ask for a Word report or PDF of an analysis > Files from this answer > Download <file name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome and sign in.
  2. Ask for an analysis of some data, then ask for it as a formatted report in Word (.docx) or PDF.
  3. When the reply shows the "Files from this answer" list, click the Download button on the report's file card ("Download <file name>").
  4. Open the saved report and check that it is a formatted document containing the analysis, to compare with Expected.

## S29.39 Generate slides from analysis.

- **Expected:** From an analysis, the user can get a slide deck (pptx).
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:994; apps/web/lib/services/managed-office-file-service.ts:661; apps/extension/src/features/side-panel/generatedFiles.ts:438
- **Where to find it:** Side panel chat > ask for a slide deck of an analysis > Files from this answer > Download <file name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome and sign in.
  2. Ask for an analysis of some data, then ask for it as a slide deck in PowerPoint (.pptx).
  3. When the reply shows the "Files from this answer" list, click the Download button on the .pptx file card ("Download <file name>").
  4. Open the saved .pptx and check that it holds slides built from the analysis, to compare with Expected.
