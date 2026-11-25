# Area 29. Spreadsheet and data-analysis workspace

40 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S29.01 Workbook title and metadata.
- Should: A workbook carries a user-visible title and document metadata (author, description) that can be viewed and set.
- Status: cli missing, vscode missing

## S29.02 Sheet tabs.
- Should: A workbook shows its sheets as tabs the user can switch between.
- Status: cli missing, vscode missing

## S29.03 Add, rename, duplicate, and delete sheets.
- Should: The user can add, rename, duplicate and delete sheets in an open workbook.
- Status: cli missing, vscode missing

## S29.04 Grid selection.
- Should: The user can select cells and ranges in a spreadsheet grid with mouse and keyboard.
- Status: cli missing, vscode missing, chrome missing

## S29.05 Cell editing.
- Should: The user can edit a cell value in place and the change is kept.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.06 Formula bar.
- Should: A formula bar shows and edits the selected cell formula.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.07 Formula explanations.
- Should: The product explains a selected formula in plain language via a dedicated action.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.08 Named ranges.
- Should: The user or tool can define and use named ranges in a workbook.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.09 Tables.
- Should: A range can be turned into a structured table (header, banding, table name) in the workbook.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.10 Sort and filter.
- Should: The user can sort and filter rows in a sheet by column.
- Status: cli missing, vscode missing, chrome missing

## S29.11 Freeze rows and columns.
- Should: The user can freeze chosen rows or columns so they stay visible while scrolling.
- Status: cli missing, vscode missing, chrome missing

## S29.12 Row and column resizing.
- Should: The user can resize rows and columns by dragging or setting a size.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S29.13 Number, date, and currency formats.
- Should: The user or tool can apply number, date and currency formats to cells.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.14 Conditional formatting.
- Should: The user or tool can add conditional formatting rules to a range.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.15 Data validation.
- Should: The user or tool can add data-validation rules (lists, ranges) to cells.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.16 Protected cells and ranges.
- Should: The user or tool can lock cells, ranges or sheets against editing.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.17 Chart insertion.
- Should: The user can insert a chart built from sheet data into the workbook.
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/managed-office-file-service.ts:225; apps/web/lib/services/managed-workbook-builder.ts:147; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:69; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.18 Chart-type selector.
- Should: The user can pick or change a chart type from a selector.
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/managed-office-file-service.ts:225; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:69; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.19 Chart data-range editor.
- Should: The user can view and edit the cell range a chart plots.
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/managed-office-file-service.ts:225; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:69; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.20 Pivot or aggregate views where supported.
- Should: The user can create a pivot table or grouped aggregate view from sheet data.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.21 Data-cleaning preview.
- Should: Before applying a data-cleaning step, the product previews the rows it would change.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.22 Missing-value summary.
- Should: The product shows a per-column summary of missing values in a dataset.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.23 Duplicate-row summary.
- Should: The product shows how many rows are duplicates and which ones.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.24 Type-inference summary.
- Should: The product shows the inferred data type of each column in a dataset.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.25 Transformation history.
- Should: The product lists the transformations applied to a dataset in order and lets the user revisit them.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.26 SQL query panel.
- Should: A panel lets the user write and run SQL against a dataset or connected source.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.27 Python analysis panel.
- Should: A panel lets the user run Python analysis on data and see code, output and charts.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:466; apps/web/lib/server/container-files.ts:196; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:438

## S29.28 Query-result table.
- Should: Results of a query or analysis appear in a sortable result table.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/container-files.ts:196

## S29.29 Data-source details.
- Should: For data pulled from a source, the product shows where it came from (connector, table, query, time).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.30 Refresh connected data.
- Should: The user can refresh sheet data from its connected source.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.31 Proposed-change preview.
- Should: Before the assistant changes a sheet, the product previews the proposed cell changes.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.32 Accept/reject range changes.
- Should: The user can accept or reject each proposed range change.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.33 Formula-error display.
- Should: Cells with formula errors (#REF!, #DIV/0!) are flagged with an explanation.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.34 Export workbook.
- Should: The user can export data or a sheet as a downloadable .xlsx workbook.
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/managed-office-file-service.ts:162; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:620; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.35 Export CSV.
- Should: The user can download tabular data as a CSV file.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1444; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:988; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:394; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:120; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.36 Export chart.
- Should: The user can export a chart as an image or file.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:97; packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:250; apps/mobile/src/features/chat/components/ReportChart.tsx:394; apps/mobile/src/features/chat/components/ReportChart.tsx:398; apps/mobile/src/features/chat/components/ReportChart.tsx:474; apps/mobile/services/fileCreation.ts:206

## S29.37 Explain analytical assumptions.
- Should: The product states the assumptions behind an analysis in a dedicated, reviewable place.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S29.38 Generate a report from analysis.
- Should: From an analysis, the user can get a formatted report document (docx or pdf).
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/managed-office-file-service.ts:162; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:408; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.39 Generate slides from analysis.
- Should: From an analysis, the user can get a slide deck (pptx).
- Status: web done, desktop done, cli missing, vscode missing, chrome done
- Code: apps/web/lib/services/managed-office-file-service.ts:162; apps/web/lib/server/container-files.ts:196; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724; apps/web/lib/services/managed-office-file-service.ts:513; apps/extension/src/features/side-panel/generatedFiles.ts:229

## S29.40 Reusable analysis template.
- Should: The user can save an analysis as a template and rerun it on new data.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
