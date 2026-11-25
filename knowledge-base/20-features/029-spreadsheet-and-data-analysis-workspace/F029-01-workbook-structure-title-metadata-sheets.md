---
id: "F029-01"
type: "feature"
title: "Workbook structure: title, metadata, sheets"
aliases: ["Workbook structure", "Worksheets", "Sheet tabs", "Workbook title and metadata", "S29.01", "S29.02", "S29.03", "Spreadsheet output format (composer Output menu, label 'Spreadsheet')"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S29.01", "S29.02", "S29.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "file:apps/web/lib/services/managed-office-file-service.ts", "file:apps/web/lib/services/managed-workbook-builder.ts", "table:file_lineage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-01 Workbook structure: title, metadata, sheets

A workbook made by the assistant has named sheets, one tab each, with strict name rules. Web, desktop (hosted web), mobile and the Tauri build can show the tabs read-only. Title and author metadata are not written, and adding, renaming, copying or deleting sheets in the product is not built, by founder decision.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.01](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2901), [S29.02](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2902), [S29.03](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2903).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the assistant build an Excel (.xlsx) file with several named sheets, and lets the apps show those sheets as tabs when a workbook is opened in chat. A 'title' field is required by the tool but is not written into the file (managed-office-file-service.ts:154; managed-office-file-service.ts:766-789).

**Why it exists.** People ask AI assistants for multi-sheet workbooks (for example Sales and Costs) and expect the file to open in Excel with the right tabs. The brief also lists in-app tab, title and sheet-management items (S29.01-S29.03) (doc: knowledge-base/data/area-briefs/029-spreadsheet-and-data-analysis-workspace.md).

**Who uses it.** Anyone who asks the chat for a spreadsheet file, and anyone who opens a workbook the assistant made or a workbook they attached.

**Problems it solves**

- The file opens with the sheet names asked for instead of one default sheet (managed-workbook-builder.ts:203-206).
- Bad or repeated sheet names are refused before a broken file is made (managed-office-file-service.ts:96-105,159-163).
- A person can switch sheets inside the chat preview without leaving the app (SpreadsheetArtifact.tsx:35-70).

**Use cases**

- Ask for 'a budget workbook with Income and Costs sheets' and download the .xlsx.
- Open an attached workbook in the chat preview and click the tab of another sheet.
- On the phone, open a workbook the assistant created and swipe between sheet tabs.

## 2. User experience

**Where to find it**

- Web chat composer: plus menu row 'Output', then the format labelled 'Spreadsheet' (ComposerPlusMenu.tsx:190,957-990; skills.ts:22-26 in packages/contracts/cloud-contracts/src).
- Desktop: the public Electron Desktop shows the hosted web app, so it is the same screen (doc: AGENTS.md section 5). Whether the desktop packaging adds anything is unknown.
- Mobile: the output-format store feeds the same request (chatExecutionStore.ts:3283-3287); the sheet tabs show in the file viewer (WorkbookFileView.tsx:109-175).
- Web preview: sheet tab strip with accessible name 'Worksheets' (SpreadsheetArtifact.tsx:46-49).
- CLI, VS Code: nothing found.

**Before you start**

- Signed in on the web; the tool needs an authenticated owner (tool-loop.ts:2565-2567).
- A model that can call tools, or Auto (ChatComposerNew.tsx:1643-1645).
- Not on the restricted Free chat (ChatComposerNew.tsx:1643-1644; free-quota.ts:126).

**Screens and controls**

- Output menu rows for Document, Presentation and Spreadsheet (skills.ts:22-26). The row is disabled with the text "Office file creation isn't available for this model." when the model cannot use tools (ChatComposerNew.tsx:6123-6128).
- Tab strip over the grid, one tab per sheet; shown only when the workbook has more than one sheet (SpreadsheetArtifact.tsx:75; TabularGridView.tsx:93-95).
- Mobile tab list labelled with the sheet count, for example '3 sheets in this workbook' (TabularGridView.tsx:97-101).

**Journey**

1. Choose Output, then Spreadsheet, in the composer.
2. Describe the workbook and name the sheets.
3. The server forces the file tool for this turn when the model accepts forced tool choice (request-processor.ts:6649-6655).
4. The assistant sends sheets with names and rows; the server checks the names and builds the .xlsx.
5. The file is saved and attached to the reply; the person downloads it or opens the preview.
6. In the preview, click a tab to switch sheet; the sort and selection reset on switch (SpreadsheetArtifact.tsx:84-88).

**What the person sees and gets**

- An attached .xlsx file with one tab per requested sheet.
- A one or two sentence reply naming the file (chat-output-format.ts:chatOutputFormatInstruction, lines 23-30).
- A name rule failure is returned to the assistant as text, not shown raw to the person (managed-office-file-service.ts:930-945).

**Settings**

- The Output format choice in the composer (ComposerPlusMenu.tsx:957-990).
- No setting for author, description or title found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Named sheets: names are 1 to 31 characters, no \ / ? * [ ] :, unique ignoring case, 1 to 20 sheets, 1 to 20,000 rows of at most 200 cells (managed-office-file-service.ts:96-105,155-164,103).
- Workbook writer writes one sheet part and one workbook.xml entry per sheet, in the given order (managed-workbook-builder.ts:197-209,240-241).
- A second uniqueness check runs on the finished package, ignoring case and surrounding spaces (managed-office-preservation.ts:311-326,352-353).
- Read-only sheet tabs in the web and desktop-hosted preview (SpreadsheetArtifact.tsx:35-70,73-88; ArtifactPreview.tsx:1836-1870).
- Read-only sheet tabs on mobile (TabularGridView.tsx:93-134; WorkbookFileView.tsx:109-175).
- The reader keeps at most 50 sheets (workbook-sheets.ts:13,302).
- Editing an attached workbook by cell edits keeps the other parts untouched (managed-office-file-service.ts:165-184; managed-office-preservation.ts:1364).

**Incomplete**

- The tool's 'title' is required and validated but never reaches the file: generateXlsx passes only sheets to buildWorkbook (managed-office-file-service.ts:154,766-789; managed-workbook-builder.ts:167).
- No author, description or document-properties part is written (managed-workbook-builder.ts:172-253 lists every part written).

**Present but disconnected or switched off**

- Tauri desktop code can write title, author, subject and company and several sheets (create_excel.rs:6-12,57-68), but the tool entry point uses create_simple, which writes one sheet and sets the title to the sheet name (create_excel.rs:161-191; document_tools.rs:229-272). Tauri is retained internal code (doc: AGENTS.md section 5).
- Tauri workbook editing refuses every edit variant (edit_excel.rs:94-130, tests).

**Not available**

- Add, rename, duplicate, delete a sheet in an open workbook on any app: no code found. Founder decision lists S29.01-S29.04 among features the leaders do not offer and that are not built (doc: docs/decisions/2026-09-27-founder-decisions.md:73,119-123).
- CLI and VS Code: no xlsx creation or sheet view found; the CLI only reads spreadsheet text (apps/cli/src/documents.rs:569-584).
- Chrome extension: no office or workbook code in apps/extension/src found by search.

## 4. Required behaviour

**Established requirements**

- A workbook carries a user-visible title and metadata (author, description) that can be viewed and set. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S29.01)
- A workbook shows its sheets as tabs the user can switch between. (source: S29.02 in the same brief)
- The user can add, rename, duplicate and delete sheets in an open workbook. (source: S29.03 in the same brief)
- S29.01-S29.04 are recorded as features ChatGPT and Claude do not offer and are not built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:73,119-123)
- Prefer real editable XLSX outputs and test the exported file, not only the preview. (source: doc: docs/product/competitive-guidance.md:333-336)

**Acceptance criteria**

1. Ask for a workbook with sheets named Sales and Costs; the downloaded file shows exactly those two tabs in that order.
2. A sheet name of 32 characters, or one containing a colon, is refused and the assistant gets a message about it.
3. Two sheets named 'Data' and 'data' are refused as duplicates.
4. Opening a three-sheet workbook in the chat preview shows three tabs; clicking one shows that sheet's rows and clears any sort.
5. A one-sheet workbook shows no tab strip.
6. A workbook with more than 50 sheets shows no more than 50 tabs [inferred from workbook-sheets.ts:302].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's S29.01 title means the visible workbook title; the file's own title property is the likely place to hold it [inferred].
- Given the founder decision, the in-app tab view is the intended end state for S29.02 and S29.03 and S29.01 stay unbuilt [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Write the tool's title into the file's document properties so the required field has an effect, or remove the field from the xlsx schema.
- [proposed] Update the brief so S29.02 shows web, desktop and mobile as done (read-only tabs), because the code has them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Validates the xlsx request (sheet names, row limits), calls the builder, checks formulas, returns the file. |
| service | managed-workbook-builder | `apps/web/lib/services/managed-workbook-builder.ts` | Writes the .xlsx package parts, one sheet part per sheet. |
| service | managed-office-preservation | `apps/web/lib/services/managed-office-preservation.ts` | Checks the finished package, rejects repeated sheet names, edits an attached workbook. |
| other | tool-loop office branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the file tool and saves the result (lines 2562-2600). |
| other | applyManagedOfficeFileCreation | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers the file tool only when the request asks for office creation (lines 1257-1266). |
| config | CHAT_OUTPUT_FORMATS | `packages/contracts/cloud-contracts/src/skills.ts` | Defines docx, pptx, xlsx and the visible labels (lines 20-26). |
| component | ComposerPlusMenu OutputRows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | The 'Output' menu where Spreadsheet is chosen. |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Shared read-only grid with a sheet tab strip. |
| service | readWorkbookSheets | `packages/ui/unified-chat/src/lib/workbook-sheets.ts` | Reads an .xlsx into one CSV per sheet, with size and decompression limits. |
| service | office-file-preview loadWorkbookSheets | `apps/web/features/chat/lib/office-file-preview.ts` | Fetches the stored file and reads its sheets in the browser (lines 233-239). |
| component | ArtifactPreview workbook loading | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Loads sheets and passes them to SpreadsheetArtifact (lines 1836-1870,1941-1950). |
| component | WorkbookFileView | `apps/mobile/src/features/chat/components/artifact-viewers/WorkbookFileView.tsx` | Mobile: reads the .xlsx on the device and shows tabs. |
| component | TabularGridView | `apps/mobile/src/features/chat/components/artifact-viewers/TabularGridView.tsx` | Mobile grid with a tab list. |
| store | chatExecutionStore office request | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sets office_creation and office_format on the mobile request (lines 3283-3287,3430-3441). |
| other | Tauri create_excel | `apps/desktop/src-tauri/src/features/document/create_excel.rs` | Native workbook writer with metadata; reached only through create_simple. |
| other | Tauri document tool | `apps/desktop/src-tauri/src/core/llm/tool_executor/document_tools.rs` | Desktop tool that creates a one-sheet workbook (lines 229-272). |
| test | managed-office-file-service tests | `apps/web/lib/services/managed-office-file-service.test.ts` | Covers xlsx creation, repeated sheet names and edits. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Output then Spreadsheet; the web request carries office_creation and the format. | device | useChatStream.ts:4641; ComposerPlusMenu.tsx:957-990 |
| The server adds the file tool to the request and, if the model accepts forced tool choice, forces it. | our servers | request-processor.ts:1257-1266,6649-6657 |
| The model (a chosen provider) returns a tool call with named sheets and rows. | outside service | tool-loop.ts:2562-2569 [inferred that the model call goes to the routed provider] |
| The server validates names and sizes with a schema and builds the package. | our servers | managed-office-file-service.ts:96-105,930-1031; managed-workbook-builder.ts:167-256 |
| The file is stored as a generated file with lineage and attached to the reply. | our servers | tool-loop.ts:2575-2596; generated-file-persist.ts:217-259 |
| The browser downloads the file and reads its sheets to show tabs; mobile copies it to the device and reads it there. | device | office-file-preview.ts:233-239; WorkbookFileView.tsx:23-26,109 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated .xlsx file and its metadata (format, verification receipt) | Generated-file storage and media assets, plus a file_lineage insert (generated-file-persist.ts:70,259; tool-loop.ts:2575-2596) | Available to every app that opens the same account's conversation [inferred]; no sync code opened | Retention rules unknown; cap is 20 MB per generated file (generated-file-persist.ts:17,242) |
| Sheet list read for display | In memory in the browser or phone; mobile also holds a local copy of the file (WorkbookFileView.tsx:109) | No | Lives while the viewer is open [inferred] |

**Models and providers.** Any model that can call tools can fill the file tool; the tool is a plain function, not tied to a provider (managed-office-file-service.ts:248-253). Auto counts as capable (ChatComposerNew.tsx:1643-1645). Reading tabs uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Creating a file needs an authenticated owner (tool-loop.ts:2565-2567). Reading a workbook in the viewer needs access to the file only. |
| Permissions | Organization policy for this tool: none found in the code read. |
| Subscription | The restricted Free chat has office creation switched off (free-quota.ts:126; ChatComposerNew.tsx:1643-1644). Per-plan entitlement for paid plans: not found in the files read. |
| Limits and metering | 20 sheets, 20,000 rows, 200 cells per row, 2,000 characters per cell (managed-office-file-service.ts:79,103,158); generated file cap 20 MB (generated-file-persist.ts:17). Viewer limits: 50 sheets, 500 shown rows (workbook-sheets.ts:13; tabular.ts:78). |
| Feature flags | Mobile also needs the code-execution feature flag, entitlement and capability before it asks for a file (chatExecutionStore.ts:3273-3287). |
| Model compatibility | Needs a tool-calling model or Auto; otherwise the Output row is disabled (ChatComposerNew.tsx:1643-1645,6123-6128). |
| Provider restrictions | None found in the file service. |
| Local mode | File creation runs on our servers, so it is not a Local feature. On mobile it is requested only when cloud execution is permitted (chatExecutionStore.ts:3273-3287,3430-3441). Reading and showing a workbook runs on the device and needs no subscription [inferred from WorkbookFileView.tsx:23-26]. Local-mode behaviour of the desktop Tauri tool: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile shows a spinner labelled 'Opening <file name>'. | WorkbookFileView.tsx:117-126 |
| Empty sheet | Mobile shows 'This sheet is empty.' | TabularGridView.tsx:225 |
| Invalid or repeated sheet name | Request refused with a message; the assistant can retry. | managed-office-file-service.ts:930-945; managed-office-preservation.ts:311-326 |
| Workbook too large to preview | Web shows a too-large notice and keeps the table; mobile shows 'This workbook is too large to show here' with Share, or the document view on iOS. | ArtifactPreview.tsx:1941-1945; WorkbookFileView.tsx:18,150-163 |
| Unreadable workbook | Mobile falls back to the document view. | WorkbookFileView.tsx:148 |
| File fetch failed | Mobile shows 'Could not open this file' with Retry when retryable. | WorkbookFileView.tsx:100-114 |
| Cancel | An aborted turn throws before the file is returned. | managed-office-file-service.ts:1031 |
| Offline | Not handled in the code read for file creation. | not handled in the code |
| Accessibility | Tabs use tablist and tab roles with selected state on web and mobile. | SpreadsheetArtifact.tsx:46-57; TabularGridView.tsx:97-115 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Workbook creation with named sheets, distinct sheet names, and existing-workbook edits (tests at lines 131,583,603,631,721).
- `apps/web/lib/services/managed-office-preservation.test.ts`: Package preservation; content not read in detail.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.sheets.test.tsx`: Tab strip hidden for one sheet, one tab per sheet, switching resets selection and sort (lines 20-51).
- `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx`: Tabs for every worksheet, unreadable and oversized workbook fallbacks (lines 62-126).
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/WorkbookFileView.test.tsx`: Mobile spinner, tabs, one-sheet grid, too-large, unreadable and retry (lines 126-227).
- `packages/ui/unified-chat/src/lib/workbook-sheets.test.ts`: Workbook reading; content not read in detail.

**Test scenarios**

- **Two named sheets**
  1. On web choose Output, Spreadsheet.
  2. Ask for a workbook with sheets Sales and Costs, three rows each.
  3. Download and open in a spreadsheet app.
  - Expected: Two tabs named Sales and Costs, in that order, with the rows.
- **Invalid name**
  1. Ask for a sheet named 'Q1/Q2'.
  - Expected: The assistant is told the request is invalid and either renames the sheet or explains; no file with that name is attached.
- **Title check**
  1. Ask for a workbook titled 'Plan'.
  2. Open File, Info (properties) in a spreadsheet app.
  - Expected: Current code: the title is not present in the properties (gap). Record the observed result.
- **Phone tabs**
  1. On the phone, open a three-sheet workbook from a chat.
  - Expected: Grid with three tabs; tapping a tab changes the sheet.
- **Oversized workbook**
  1. Attach a very large .xlsx and open the preview.
  - Expected: A too-large notice, not a hang.

**Where to look when it fails**

- Tool errors come back as text starting 'The Office file request is invalid.' (managed-office-file-service.ts:925-928).
- Error codes invalid_office_file_request and office_file_generation_failed (managed-office-file-service.ts:224-228).
- Attachment failure text 'The Office file could not be attached.' (tool-loop.ts:2592).
- Tables: file_lineage and the media asset table written by generated-file-persist.ts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The xlsx title is required but never written; no author or description exists.** Affects: Web, desktop-hosted web, mobile and Chrome users who ask for a titled workbook. Evidence: managed-office-file-service.ts:154,766-789; managed-workbook-builder.ts:172-253. Work needed: Write document properties from the title or drop the field; add author and description only if S29.01 is kept.
- **Sheet add, rename, duplicate and delete are not in the product.** Affects: All apps. Evidence: No code found; doc: docs/decisions/2026-09-27-founder-decisions.md:119-123. Work needed: None while the founder decision stands; keep the brief aligned.
- **The brief says nothing about the read-only tab view that exists on web and mobile.** Affects: Anyone reading the brief. Evidence: SpreadsheetArtifact.tsx:35-70; TabularGridView.tsx:93-134. Work needed: Update the brief status for S29.02.
- **The Tauri workbook writer can write metadata and many sheets but the tool only writes one sheet.** Affects: Tauri desktop (internal). Evidence: create_excel.rs:161-191; document_tools.rs:229-272. Work needed: Decide whether Tauri stays; if so extend the tool or retire the code.
- **CLI and VS Code have no workbook creation or view.** Affects: CLI and VS Code users. Evidence: apps/cli/src/documents.rs:569-584 reads only. Work needed: Not specified; owner decision needed.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- file:apps/web/lib/services/managed-office-file-service.ts
- file:apps/web/lib/services/managed-workbook-builder.ts
- table:file_lineage

## Unknown

- Whether the Chrome extension can trigger the file tool: no office_creation or xlsx code found in apps/extension/src, and the brief's cited line (generatedFiles.ts:229) is video-cache code.
- Whether the Electron Desktop adds any workbook feature beyond the hosted web app.
- How long generated files are kept and where the storage bucket is configured.
- Whether the Tauri tool is reachable in any shipped build.
- Exact table name behind insertMediaAsset (media-assets.ts not opened).
