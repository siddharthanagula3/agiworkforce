---
id: "AREA-029"
type: "area"
title: "Spreadsheet and data-analysis workspace"
features: ["F029-01", "F029-02", "F029-03", "F029-04", "F029-05", "F029-06", "F029-07", "F029-08", "F029-09", "F029-10", "F029-11", "F029-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 29. Spreadsheet and data-analysis workspace

Most of this area is not built. The working part is that a person asks the assistant in chat for a spreadsheet, Word, PowerPoint, PDF or CSV file, and gets a real file to download. The assistant calls one server tool, which builds the file, can add a simple chart, and can edit an attached Word or Excel file in place. The in-app grid, formula bar, sorting, cleaning, SQL and connected-data features in the brief have no code in the places I read, so a person cannot yet work in a sheet inside the product.

**Who uses it.** Every chat user who asks for a file. The tool is added to a chat request only when the request carries the office-creation flag (request-processor.ts:1261-1265). The voice path also registers the same tool (live-voice-tools.ts:399, live-voice-tool-runner.ts:155). I found no plan gate on this tool in the code I opened, so whether paid plans only is not established. Workspace admins and developers are not specifically involved in the code I read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F029-01](F029-01-workbook-structure-title-metadata-sheets.md) | Workbook structure: title, metadata, sheets | n/a | n/a | n/a | no | no | n/a |
| [F029-02](F029-02-grid-view-and-cell-editing.md) | Grid view and cell editing | partly | partly | partly | no | no | no |
| [F029-03](F029-03-formulas-and-named-ranges.md) | Formulas and named ranges | partly | partly | partly | no | no | no |
| [F029-04](F029-04-tables-sort-and-filter.md) | Tables, sort and filter | partly | partly | partly | no | no | no |
| [F029-05](F029-05-number-date-and-currency-formats-conditional-forma.md) | Number, date and currency formats, conditional formatting, data validation, protection | partly | partly | partly | no | no | no |
| [F029-06](F029-06-charts.md) | Charts | built | built | built | no | no | no |
| [F029-07](F029-07-pivot-tables-data-cleaning-and-data-profiling.md) | Pivot tables, data cleaning and data profiling | no | no | no | no | no | no |
| [F029-08](F029-08-analysis-history-assumptions-and-templates.md) | Analysis history, assumptions and templates | no | no | no | no | no | no |
| [F029-09](F029-09-sql-and-python-analysis.md) | SQL and Python analysis | partly | partly | partly | no | no | no |
| [F029-10](F029-10-connected-data-source-details-and-refresh.md) | Connected data: source details and refresh | no | no | no | no | no | no |
| [F029-11](F029-11-assistant-changes-to-a-sheet-preview-and-accept-or.md) | Assistant changes to a sheet: preview and accept or reject | no | no | no | no | no | no |
| [F029-12](F029-12-export-and-reports-workbook-csv-chart-report-and-s.md) | Export and reports: workbook, CSV, chart, report and slides | built | built | built | no | no | built |

Requirement items for this area: [10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md).

## How this area works in the code

1. **Chat request asks for an office file.** When the chat request has the office-creation flag, the server removes any old copy of the tool and adds a fresh one, with the output format and the attached Word or Excel files offered as editable sources. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1261-1265`, `apps/web/lib/chat-output-format.ts:26`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts:89`)
2. **Tool schema the model sees.** The tool is named create_office_file. Its description and fields tell the model which fields belong to which format. Attached Word and Excel files are listed with name and checksum, so the model can ask to edit them. (`apps/web/lib/services/managed-office-file-service.ts:233-260`, `packages/contracts/cloud-contracts/src/skills.ts:18`)
3. **Validate the request.** The arguments are checked with a schema per format. Unknown fields are rejected. A file name must be a bare name with no folder parts. Sheet and cell limits apply. A failure is sent back to the model as a message. (`apps/web/lib/services/managed-office-file-service.ts:126-207`, `apps/web/lib/services/managed-office-file-service.ts:930-945`)
4. **Run the tool in the chat loop.** The tool loop checks that the tool is available and that a user is signed in. It calls the generator, passing attached files and a sandbox executor that is only started when needed. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2562-2575`)
5. **Build the file.** For spreadsheets the sheets are turned into workbook parts. Text that starts with = becomes a formula. A numeric-looking text becomes a number. Other text becomes an inline string. A chart is added as a drawing part. The zip is written with DEFLATE compression. (`apps/web/lib/services/managed-office-file-service.ts:768-794`, `apps/web/lib/services/managed-workbook-builder.ts:62-75`, `apps/web/lib/services/managed-workbook-builder.ts:143-156`, `apps/web/lib/services/managed-workbook-builder.ts:167-256`)
6. **Recalculate and verify.** If any worksheet holds a formula, the sandbox recalculates the workbook. Without a sandbox the request fails. Optional render checks need the sandbox too. The file is then checked as a package. (`apps/web/lib/services/managed-office-file-service.ts:994-1024`)
7. **Return the file to the client.** The result has the data, filename, file type and verification. Errors come back as a message. The web app shows a spreadsheet artifact and offers CSV download; the extension saves server-made files. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1873-1879`, `apps/extension/src/features/side-panel/generatedFiles.ts:183-190`)
8. **Edit an existing workbook.** When an attached workbook is the source, the server applies explicit cell edits. Each edit first checks that the old value matches the expected one. Parts not touched are kept. A receipt is returned. (`apps/web/lib/services/managed-office-file-service.ts:999-1001`, `apps/web/lib/services/managed-office-file-service.ts:166-182`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/services/managed-office-file-service.ts` | The tool schema, validation, and the generator for docx, pptx, xlsx, pdf and csv. Entry point generateManagedOfficeFile at line 930. |
| `apps/web/lib/services/managed-workbook-builder.ts` | Writes xlsx parts by hand: sheets, formula and text cells, and the chart drawing and chart XML. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the office tool to a chat request when the office-creation flag is set (lines 1261-1265). |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool call and passes the sandbox executor and attachments (lines 2562-2575). |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts` | Detects that the office tool is among the offered tools (line 89). |
| `apps/web/lib/voice/live-voice-tools.ts` | Registers the same office tool for voice sessions (line 399). |
| `apps/web/lib/voice/live-voice-tool-runner.ts` | Runs the office tool for voice (line 155). |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web spreadsheet artifact view: loads sheets and offers Download as CSV (lines 1837, 1873-1879, 2383). |
| `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile table view with the CSV action (line 439), using apps/mobile/src/features/chat/utils/tableCsv.ts. |
| `apps/extension/src/features/side-panel/generatedFiles.ts` | Chrome side panel: downloads a file the server already made (saveAnswerFile, line 183). |
| `apps/web/lib/server/container-files.ts` | Saves files produced by code execution as chat files (around line 161, 196). |

## What is stored

- Attached Word or Excel files that a person sends in the chat turn; the tool reads them by checksum: Chat turn attachments, passed to the tool as TurnAttachment (managed-office-file-service.ts:28, 237-249)
- The generated file bytes returned to the client: Returned in the tool result as data; this code does not save them. Persistence for code-execution files goes through persistGeneratedFileBytes (container-files.ts)
- Code-execution output files: Saved as chat files through persistGeneratedFileBytes with origin code-execution (apps/web/lib/server/container-files.ts)
- Browser-side file download: Browser download, not stored (ArtifactPreview.tsx:1873-1879; generatedFiles.ts:167-190)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **office_creation request flag**: When set, the office tool is added to the chat request. Without it the tool is not offered. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1261-1265)
- **office_format request field**: Limits the tool's format enum to one format, for example only xlsx. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1265 and managed-office-file-service.ts:233-240)
- **verify_render field (per call)**: Asks for a rendered preview check. Fails if no sandbox executor is available. (apps/web/lib/services/managed-office-file-service.ts:966, 985, 1024)
- **Sandbox executor availability**: Formulas and render checks need it. Without it those requests fail with a message. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2573; managed-office-file-service.ts:1004-1011)
- **MAX_GENERATED_FILE_BYTES**: Caps the size of attached source files the tool will read (apps/web/lib/services/managed-office-file-service.ts:26, 237-249)
- **Plan gate for this tool**: Not found in the code read. The voice tool list checks a different capability (agi_work) for another tool. (apps/web/lib/voice/live-voice-tools.ts:401 (not this tool))

## Shared between apps

[{"what":"The office tool schema, validation and the file generators (docx, pptx, xlsx, pdf, csv) are server code in apps/web, shared by the chat route and the voice runner.","where":"apps/web/lib/services/managed-office-file-service.ts; apps/web/lib/voice/live-voice-tool-runner.ts"},{"what":"The workbook writer is server-only (imports server-only).","where":"apps/web/lib/services/managed-workbook-builder.ts:1-3"},{"what":"The tool name constant is shared with the contracts package.","where":"packages/contracts/cloud-contracts/src/skills.ts:18"},{"what":"The web and mobile CSV export are separate per app. Mobile has its own table-to-CSV helper.","where":"apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1873; apps/mobile/src/features/chat/utils/tableCsv.ts"},{"what":"The Chrome side panel has its own download code and does not generate files.","where":"apps/extension/src/features/side-panel/generatedFiles.ts:167-190"}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief S29.17 code refs point to the wrong code. managed-office-file-service.ts:225 is the generation-failure type, not chart code. request-processor.ts:724 is a research-source schema field, not the office tool. The chart code is at managed-office-file-service.ts:778 and managed-workbook-builder.ts:97-156. (apps/web/lib/services/managed-office-file-service.ts:225; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:724)
- Brief S29.36 (export chart) cites ChartArtifact.tsx:97 and :250, which are axis-label and legend rendering. No chart export was found in that file. The mobile ReportChart refs are also chart rendering, not export. Export as an image is not shown in the code read, so the brief's done marks are unconfirmed. (packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:97, 250; apps/mobile/src/features/chat/components/ReportChart.tsx:394-398, 474)
- Brief S29.36 also cites apps/mobile/services/fileCreation.ts:206, which is an HTML-to-PDF export, not a chart export. (apps/mobile/services/fileCreation.ts:206)
- Brief S29.27 (Python analysis panel) is marked done on web, desktop and mobile. The code read shows only file saving for code-execution output, not a panel with code, output and chart. (apps/web/lib/server/container-files.ts:161; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:438-441)
- Brief S29.19 (chart data-range editor) is marked done. Chart columns and rows are fixed in the tool input at creation; no editor for them was found. (apps/web/lib/services/managed-office-file-service.ts:81-94)
- Chart placement is computed from the length of the value column letter, not the data position. For single-letter columns the anchor is always column 5, and the chart always ends at column 14 and row 18. (apps/web/lib/services/managed-workbook-builder.ts:148-149)
- The Chrome side panel is marked done for workbook and report creation (brief S29.34, S29.38, S29.39), but its code only saves files the server already made. (apps/extension/src/features/side-panel/generatedFiles.ts:183-190)
- Mobile CSV export cites line 394 in the brief; the export call is at MessageContentRenderer.tsx:439. Line 394 is table rendering. (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:394, 439)
- Workbook cells have one default style only; number formats, dates, currency, conditional formatting and validation cannot be written, but the tool description does not say so. (apps/web/lib/services/managed-workbook-builder.ts:225-238)

## Not established

- I did not run anything (read-only rule). Every behaviour here is from reading code, not from running the app.
- Whether a plan or account gate limits this tool. I found none in the files read; the voice tool list gates another tool with agi_work (live-voice-tools.ts:401).
- How each of the three modes (Local, own key, Cloud) affects this tool. I did not establish whether Local or own-key chat sends the office-creation flag.
- Where generated workbook files are stored after the tool returns them, and what the browser does with them beyond the download link.
- Whether the desktop, CLI, VS Code and Chrome apps send the office-creation flag; I only traced the web chat route and the voice route.
- Whether there is an in-app chart editor or chart-type selector that I did not find (I did not do a full repository search for them).
- The sandbox executor in tool-loop.ts:2573 was read only at the call site; I did not confirm how it is provisioned.
- Whether the brief's mobile and Chrome done marks for export and charts are backed by code I did not open.
