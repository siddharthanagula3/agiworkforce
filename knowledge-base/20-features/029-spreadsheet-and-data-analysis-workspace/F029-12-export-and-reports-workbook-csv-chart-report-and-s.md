---
id: "F029-12"
type: "feature"
title: "Export and reports: workbook, CSV, chart, report and slides"
aliases: ["Export workbook (S29.34)", "Export CSV (S29.35)", "Generate a report from analysis (S29.38)", "Generate slides from analysis (S29.39)", "create_office_file", "Office file creation", "Create file", "Output", "Download as CSV"]
area: "29 Spreadsheet and data-analysis workspace"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S29.34", "S29.35", "S29.38", "S29.39"]
depends_on: ["F029-11", "F029-09", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F029-12 Export and reports: workbook, CSV, chart, report and slides

Ask the assistant for a Word, PowerPoint, Excel, PDF or CSV file and it is built on our servers and attached to the chat as a download. A spreadsheet or table in chat can also be downloaded as CSV on web, and on mobile. Built on web, desktop, mobile and Chrome; missing on CLI and VS Code.

Area: [29. Spreadsheet and data-analysis workspace](README.md). Requirement items: [S29.34](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2934), [S29.35](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2935), [S29.38](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2938), [S29.39](../../10-requirements/capabilities/029-spreadsheet-and-data-analysis-workspace.md#s2939).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates real files (docx, pptx, xlsx, pdf, csv) from chat content and lets the person download them; also exports tables and spreadsheet artifacts to CSV with spreadsheet-formula protection (apps/web/lib/services/managed-office-file-service.ts:126-207; packages/ui/unified-chat/src/lib/tabular.ts:380-480).

**Why it exists.** People need analysis in a file they can send, open in Office or import elsewhere (briefs S29.34, S29.35, S29.38, S29.39).

**Who uses it.** Anyone turning an analysis into a workbook, report, deck or CSV.

**Problems it solves**

- Copying chat text into Office is slow and loses structure.
- CSV with commas or line breaks breaks without quoting.
- A cell starting with = can run as a formula when opened (guarded in client exports).

**Use cases**

- Ask for a quarterly workbook with a chart and formulas.
- Ask for a Word report with a table.
- Ask for a slide deck of key findings.
- Download a table in chat as CSV.

## 2. User experience

**Where to find it**

- Web: composer plus menu row 'Output' with Document, Presentation, Spreadsheet (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:190, 975-1000; labels packages/contracts/cloud-contracts/src/skills.ts:22-26). Spreadsheet artifact: Download button (aria-label 'Download artifact', title 'Download') then 'Download as CSV' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3472-3487; also a menu entry at 2383). Generated files show 'Download file' (ArtifactPreview.tsx:2370-2379).
- Desktop: the public Desktop shows the hosted web app, so the same (doc: AGENTS.md section 5). The Tauri build has its own artifact adapter that uses the same CSV-safe export (apps/desktop/src/features/artifacts/publishAdapter.ts).
- Mobile: 'Create file' row in the add-to-chat sheet with Document, Presentation, Spreadsheet (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1182-1215). Tables in messages have a download button labelled 'Download table as CSV' and 'Copy table' (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:331, 376).
- Chrome side panel: file cards with open and download buttons using the localized labels spAnswerFileOpen and spAnswerFileDownload (apps/extension/src/features/side-panel/generatedFiles.ts:280-310; artifactPanel.ts:970-995). No output-format picker found.
- CLI and VS Code: missing (brief); the server does not infer Office creation differently for them but excludes implicit sandbox for them (request-processor.ts:928).

**Before you start**

- Cloud mode, signed in, streaming turn, tool-capable model (request-processor.ts:5460-5493).
- Not a free-offering request (free-quota.ts:126).
- For formulas in xlsx or render checks: sandbox execution available (managed-office-file-service.ts:1007-1014).

**Screens and controls**

- Output or Create file choice (Document, Presentation, Spreadsheet).
- File card with Download.
- Artifact download menu: 'Download as CSV', 'Download as HTML', 'Download as Markdown', source download (ArtifactPreview.tsx:2383-2395).
- Mobile table actions: Copy table, Download table as CSV, Expand table (MessageContentRenderer.tsx:376, 594).
- Chrome file card buttons.

**Journey**

1. 1. Choose an output type in the menu, or just write 'create a spreadsheet of ...'. The server also turns Office creation on from create-like verbs plus words like excel, spreadsheet, slide deck, pdf or csv (request-processor.ts:914-916, 993-998).
2. 2. Send. The assistant calls create_office_file with fields for the chosen format.
3. 3. The server validates, builds the file (and recalculates formulas if present), and stores it.
4. 4. A file card appears in chat.
5. 5. Tap or click Download (Chrome: the download button saves via the browser).
6. 6. For a table already in chat: open the artifact Download menu on web, or tap 'Download table as CSV' on mobile.

**What the person sees and gets**

- File card with name, type and size (tool result: name, uri, mime_type, byte_count, tool-loop.ts:2594-2604).
- Mobile alert 'Download failed: Could not save this table as CSV. Try again.' (MessageContentRenderer.tsx:441).
- Chrome status text for downloading and failure (generatedFiles.ts:297-304).
- Error text from the tool such as 'The file could not be created.'

**Settings**

- Output format selection per message; web stores it as officeOutputFormat (apps/web/shared/stores/web-chat-store.ts:88).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Five formats built on the server: docx, pptx, xlsx, pdf, csv (managed-office-file-service.ts:126-207, 952-1064).
- XLSX: up to 20 uniquely named sheets, formulas, optional bar, line or pie chart per sheet (managed-office-file-service.ts:81-94, 773-790; managed-workbook-builder.ts).
- CSV: quotes fields with comma, quote or line break; CRLF line ends (managed-office-file-service.ts:759-765).
- PPTX: up to 40 slides with bullets and speaker notes; DOCX and PDF from markdown-like content (managed-office-file-service.ts:73-77).
- Optional render verification (verify_render) fails clearly without a sandbox (managed-office-file-service.ts:960-966).
- Tool loop stores and emits the file (tool-loop.ts:2562-2608).
- Web artifact CSV download neutralizes formula-like cells (ArtifactPreview.tsx:1873-1881; tabular.ts:380, 476).
- Mobile table CSV download via share sheet (MessageContentRenderer.tsx:438-443).
- Chrome saves server files with a blob link (generatedFiles.ts:167-190).
- Voice offers the same tool (live-voice-tools.ts:399).

**Incomplete**

- The draft cited ArtifactPreview.tsx:2383 and 3486 for the menu items; they are correct ('Download as CSV' at 2383 and 3486). It said the CSV helper builds the file at 1873-1879; it does so in the client with spreadsheetSafeExport, not through the server tool.
- The server csv path (generateCsv) does not neutralize cells that begin with =, + or -, while client exports do; so a CSV made by the assistant tool may carry formula text [inferred from managed-office-file-service.ts:759-766 and tabular.ts:380]. Not tested.
- Chat output choices offer only docx, pptx, xlsx; csv and pdf only come from the wording (packages/contracts/cloud-contracts/src/skills.ts:20).
- Receipt display: unknown.

**Present but disconnected or switched off**

- Voice has no attachments, so it can create but not edit (live-voice-tools.ts:399).

**Not available**

- CLI and VS Code: no Office creation or CSV export in the code searched (searches of apps/cli and apps/extension-vscode for create_office_file found nothing).
- Chrome: no output-format picker found.
- Mobile xlsx or docx download uses the same server file; mobile CSV for artifacts: see mobile artifact export (apps/mobile/src/features/chat/utils/artifactExport.ts).

## 4. Required behaviour

**Established requirements**

- The user can export data or a sheet as a downloadable .xlsx workbook. (source: S29.34 in the brief)
- The user can download tabular data as a CSV file. (source: S29.35 in the brief)
- From an analysis, the user can get a formatted report document (docx or pdf). (source: S29.38 in the brief)
- From an analysis, the user can get a slide deck (pptx). (source: S29.39 in the brief)
- Generated documents, spreadsheets and presentations are versioned objects with preview, edit, export and reopen behaviour. (source: doc: docs/product/experience-contract.md:43-46)
- The file build runs on our servers; web search, code and similar abilities depend on a harness, not on the model alone. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Asking for an xlsx returns a file that opens in Excel with the named sheets, formulas computed and the chart present.
2. A CSV with a comma, a quote and a line break in cells opens with columns intact.
3. A table cell starting with = is exported as text, not a formula, on every export path.
4. A docx report shows pipe tables as Word tables.
5. A pptx has one slide per outline entry with speaker notes.
6. If the sandbox is missing and formulas are present, the request fails with the stated message, not a stale file.
7. A model without tools gets the 422 message, not a silent text reply.
8. Mobile CSV download and Chrome download both save a file the user can open.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The server CSV path should use the same formula protection as client exports [inferred from security rule in AGENTS.md section 9].
- Chrome should offer an output picker or rely on wording; not defined.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse neutralizeSpreadsheetText inside generateCsv.
- [proposed] Offer pdf and csv in the Output menu.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | generateManagedOfficeFile | `apps/web/lib/services/managed-office-file-service.ts` | Validates and builds docx, pptx, xlsx, pdf, csv (lines 930-1076). |
| config | create_office_file definition | `apps/web/lib/services/managed-office-file-service.ts` | Tool schema offered to models (lines 233-410). |
| service | CSV builder | `apps/web/lib/services/managed-office-file-service.ts` | csvField and generateCsv (lines 759-766). |
| service | Workbook builder | `apps/web/lib/services/managed-workbook-builder.ts` | Builds xlsx sheets, formulas and charts. |
| service | Office preservation and render | `apps/web/lib/services/managed-office-preservation.ts` | Package check, recalculation and render receipts. |
| service | Tool loop Office branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool, stores the file (lines 2562-2608). |
| service | Request processor Office gates | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Fields office_creation and office_format (780-781), implicit intent (914-916, 993-998), gates (5460-5495). |
| service | File persistence | `apps/web/lib/server/generated-file-persist.ts` | Stores bytes and rows, 20 MB cap. |
| config | Output format contract | `packages/contracts/cloud-contracts/src/skills.ts` | Tool name and the three chat formats with labels (lines 18-26). |
| service | Output format instruction | `apps/web/lib/chat-output-format.ts` | Prompt line telling the model to create the chosen file. |
| component | Output menu (web) | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Choose output type (975-1000). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Download menu, CSV download (1873-1881, 2383, 3486), workbook sheet preview (1840-1860). |
| service | Workbook preview loader | `apps/web/features/chat/lib/office-file-preview.ts` | loadWorkbookSheets for xlsx preview (line 233). |
| service | tabular helpers | `packages/ui/unified-chat/src/lib/tabular.ts` | toCsv, formula neutralizing and spreadsheetSafeExport (lines 315-480). |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Shared grid showing the table that is exported. |
| component | Mobile MarkdownTable | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Download table as CSV (lines 376, 438-443). |
| service | Mobile artifact export | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Spreadsheet-safe export on the phone. |
| component | Mobile Create file row | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Choose output format (1182-1215). |
| store | Mobile output format store | `apps/mobile/src/features/chat/store/outputFormatStore.ts` | Holds the chosen format until sent. |
| service | Chrome file saving | `apps/extension/src/features/side-panel/generatedFiles.ts` | saveBlob and saveAnswerFile (167-190); file card buttons (280-310). |
| component | Chrome artifact panel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Output rows with Download (970-995). |
| service | Desktop artifact publish adapter | `apps/desktop/src/features/artifacts/publishAdapter.ts` | Uses spreadsheet-safe export in the Tauri build. |
| service | Voice tools | `apps/web/lib/voice/live-voice-tools.ts` | Offers the Office tool to voice (line 399). |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Row per stored file. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Output or writes a request; app sends office_creation and office_format. | device | apps/web/lib/hooks/useChatStream.ts:4641-4642; apps/mobile/stores/chat/chatExecutionStore.ts:3434-3441 |
| Server adds the tool if streaming and tool-capable, else returns 422. | our servers | request-processor.ts:5460-5494 |
| Model calls create_office_file; server validates fields and file name. | our servers | managed-office-file-service.ts:938-949 |
| File bytes are built in process (docx, pptx, pdf, csv, xlsx). | our servers | managed-office-file-service.ts:952-1064 |
| xlsx formulas are recalculated and optional render checks run in a sandbox. | outside service | managed-office-file-service.ts:1007-1030 |
| File stored; a file entry is returned to the chat. | our servers | tool-loop.ts:2577-2607 |
| The app downloads the file (web blob link, mobile share sheet, Chrome blob link). | device | ArtifactPreview.tsx:1873-1881; MessageContentRenderer.tsx:438-443; generatedFiles.ts:167-190 |
| Table CSV export for chat tables is done entirely on the device. | device | packages/ui/unified-chat/src/lib/tabular.ts:327, 476; MessageContentRenderer.tsx:438 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated file bytes | Generated-media storage | Account-wide, reachable from any signed-in app [inferred] | 20 MB cap; retention not read, unknown |
| File record with name, type, size, checksum, verification receipt | media_assets (and file_lineage) | Server side | Not read; unknown |
| Client CSV exports | Device downloads only | No | User's own files |

**Models and providers.** Any tool-capable model may call the tool; the server, not the model, builds the file bytes. A model that cannot use tools is refused with 422 (request-processor.ts:5477-5493). The tool schema is non-strict so models need not fill unused fields (managed-office-file-service.ts:406-407).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; owner required (tool-loop.ts:2566). |
| Permissions | Tool approval for the Office tool not found in the lines read; unknown. |
| Subscription | No plan gate on Office creation found in the sections read; free-offering requests carry office_creation false (free-quota.ts:126). Paid-plan rules: unknown. |
| Limits and metering | Sheets 20; rows 20,000; columns 200; cell text 2,000 characters; slides 40; docx and pdf content 100,000 characters; file name 120; edits 1000; 20 MB per stored file (managed-office-file-service.ts:73-108, 126-207; generated-file-persist.ts:17). Metering for building files: none found. |
| Feature flags | Sandbox for formulas and render: AGI_E2B_EXECUTION and E2B_API_KEY (gate.ts:6-8). |
| Model compatibility | Needs tools support (request-processor.ts:5477). |
| Provider restrictions | none found in the code |
| Local mode | Not available in Local mode: file building happens in the Cloud chat route. Client-only CSV export of tables works on the device without any account or server [inferred from tabular.ts and MessageContentRenderer.tsx:438]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid request | Message starting 'The Office file request is invalid.' with a detail. | managed-office-file-service.ts:922-928 |
| Bad filename | Error naming the needed extension. | managed-office-file-service.ts:944-949 |
| Generation error | 'The file could not be created.' or a specific processing message. | managed-office-file-service.ts:1066-1075 |
| Render check without sandbox | Fails with 'Rendering verification requires an available Office execution environment.' | managed-office-file-service.ts:960-966 |
| Formulas without sandbox | Fails and suggests values instead. | managed-office-file-service.ts:1009-1012 |
| Non-streaming request | 422 office_creation_stream_required. | request-processor.ts:5461-5475 |
| Download failure (mobile) | Alert 'Download failed'. | MessageContentRenderer.tsx:441 |
| Download in progress (Chrome) | Button disabled, aria-busy, status text, failure text. | generatedFiles.ts:293-307 |
| Large spreadsheet preview | Shows first 500 rows and tells the person to download CSV. | SpreadsheetArtifact.tsx:330; tabular.ts:78 |
| Oversized workbook preview | Handled with a limit error state. | ArtifactPreview.tsx:1862-1866 |
| Accessibility | Download button has an aria-label; menu radio roles on output choices. | ArtifactPreview.tsx:3478; ComposerPlusMenu.tsx:990-995 |
| Offline | not handled in the code read | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/managed-office-file-service.test.ts`: Tool definition, path-free names, real DOCX with pipe table, XLSX with named sheets, formula receipts and chart, real PDF and CSV, real PPTX, no images in deck, refusal of formulas without an evaluator.
- `apps/web/lib/services/managed-workbook-builder.test.ts`: Workbook builder (name only; contents not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Creates, persists and emits a real Office file; fails closed without an owner.
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Render verification (name only).
- `apps/web/lib/services/chat-tool-provider-schemas.test.ts`: Provider schema handling of tools including this one (name only).
- `packages/ui/unified-chat/src/components/__tests__/ArtifactRenderer.csvExport.test.tsx`: Formula neutralizing in CSV downloads, benign tables left identical, tab-delimited under .csv, JSON cells.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx`: Web artifact CSV and source downloads neutralize formula cells; benign output unchanged.
- `apps/mobile/src/features/chat/components/__tests__/MarkdownTableActions.test.tsx`: Mobile table copy, CSV download, formula guard.
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Mobile artifact export (name only; imports spreadsheetSafeExport).
- `apps/extension/__tests__/side-panel-media.test.ts`: References saveAnswerFile and savedFileName in the Chrome side panel; detail not read.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.test.ts`: Routing when Office file tools are present (name only).

**Test scenarios**

- **Workbook with formula and chart**
  1. On web choose Output then Spreadsheet.
  2. Ask for sales by region with a total row formula and a bar chart.
  3. Download and open in Excel.
  - Expected: Sheet names as asked, totals computed, chart drawn.
- **CSV quoting**
  1. Ask for a CSV with a cell containing a comma, a quote and a newline.
  2. Open in a spreadsheet app.
  - Expected: One cell per field; CRLF line ends.
- **Formula injection**
  1. Ask for a CSV whose cell reads =1+1.
  2. Open it; also download a chat table with such a cell via Download as CSV.
  - Expected: Client download shows text. Server CSV: check, may open as a formula (open question).
- **Report and deck**
  1. Ask for a Word report with a pipe table, then a 5 slide deck.
  - Expected: Real docx with a Word table; pptx with 5 slides and notes.
- **No sandbox formulas**
  1. Run with sandbox execution disabled; ask for an xlsx with =SUM.
  - Expected: Error suggesting values instead.
- **Mobile and Chrome download**
  1. On mobile tap Download table as CSV; in Chrome side panel press the file download button.
  - Expected: A file is saved or shared; on failure the stated message appears.

**Where to look when it fails**

- Error text 'The Office file request is invalid.' and 'The file could not be created.'
- HTTP 422 codes office_creation_stream_required and office_creation_model_unsupported.
- Log lines 'Generated file exceeds persistence cap; skipping'.
- Table media_assets, origin managed-office-tool.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/web/029-spreadsheet-and-data-analysis-workspace.md)
- Desktop: [70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/desktop/029-spreadsheet-and-data-analysis-workspace.md)
- Mobile: [70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/mobile/029-spreadsheet-and-data-analysis-workspace.md)
- Chrome: [70-qa/test-plans/chrome/029-spreadsheet-and-data-analysis-workspace.md](../../70-qa/test-plans/chrome/029-spreadsheet-and-data-analysis-workspace.md)

## 10. Gaps and dependencies

- **Server CSV does not neutralize formula cells** Affects: Web, Desktop, Mobile, Chrome (assistant-made CSV). Evidence: managed-office-file-service.ts:759-766 vs tabular.ts:380. Work needed: Apply the shared neutralizer in generateCsv and add a test.
- **CLI and VS Code cannot create files or export CSV** Affects: CLI, VS Code. Evidence: Brief; no create_office_file code in those trees. Work needed: Decide scope and expose the tool or a local equivalent.
- **Output menu lists only Document, Presentation, Spreadsheet** Affects: Web, Mobile. Evidence: skills.ts:20. Work needed: Decide whether PDF and CSV should be pickable.
- **Local mode cannot build files** Affects: Desktop and Mobile local inference. Evidence: Tool runs in the Cloud route. Work needed: Define Local behaviour or state it plainly.
- **Brief's request-processor.ts:724 pointer is stale** Affects: Documentation. Evidence: Line 724 is a schema field; the real code is at 1258 and 5460. Work needed: Update the brief.
- **No chart-image export in this feature** Affects: All. Evidence: Chart export belongs to another item (S29.36). Work needed: Cover in the chart feature page.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- F029-11
- F029-09
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome

## Unknown

- Whether any paid plan or workspace policy gates Office creation.
- Whether the receipt is shown to the person.
- Whether Chrome sends office_creation explicitly or only relies on wording.
- Retention of generated files.
- Whether the Tauri desktop build offers any Office creation: none found.
- Whether mobile downloads of xlsx cards use a separate path from the artifact export.
