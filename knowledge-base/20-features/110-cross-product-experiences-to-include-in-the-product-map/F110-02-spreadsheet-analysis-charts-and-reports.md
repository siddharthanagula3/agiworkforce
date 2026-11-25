---
id: "F110-02"
type: "feature"
title: "Spreadsheet analysis, charts and reports"
aliases: ["Spreadsheet to chart to report", "Analyse an Excel file", "Chart in a Word report", "Run code (composer toggle)", "Code execution sandbox", "S110.03"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S110.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:free", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "F110-01", "file:apps/web/lib/e2b/gate.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-02 Spreadsheet analysis, charts and reports

A person attaches a spreadsheet and asks for analysis, a chart and a Word report. Code running in a cloud sandbox can read the file and draw charts. The office file tool can write Excel files that contain native charts. Putting that chart inside a Word report has no direct tool; it depends on sandbox code and an unverified template.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.03](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11003).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the assistant read an uploaded .xlsx, compute on it, draw a chart, and deliver files. Two routes exist. Route A: the managed office tool writes or edits Excel files and can add a bar, line or pie chart drawn from the sheet's own cells (apps/web/lib/services/managed-office-file-service.ts:81-91, 163-188; managed-workbook-builder.ts:5-17, 97-113). Route B: the cloud code sandbox runs Python on the staged attachment and may save a chart image or a Word file (apps/web/lib/e2b/attachment-staging.ts:1-12; apps/web/lib/e2b/python-figure-provenance.ts:1-40).

**Why it exists.** Competing assistants analyse spreadsheets and return charts and reports. Data work needs real computation, not a model guess.

**Who uses it.** Analysts and office workers on web and Desktop (hosted web app); phone users who see chart artifacts.

**Problems it solves**

- Models cannot reliably calculate on large tables without running code
- A chart should be a real object, not text
- Reports need the chart inside the document

**Use cases**

- Attach sales.xlsx, ask for totals by region and a bar chart
- Ask the assistant to fix specific cells in a workbook while keeping the other sheets
- Ask for a Word summary that includes the chart
- View a chart artifact on the phone

## 2. User experience

**Where to find it**

- Web: composer plus menu, toggle 'Run code' (ChatComposerNew.tsx:4856-4858 label) and row 'Output' > Spreadsheet or Document (ComposerPlusMenu.tsx:960-1000); attach file through the composer
- Desktop: same as web [inferred from AGENTS.md section 5]
- Mobile: chart artifacts show in chat and full screen (ChartArtifactView.tsx; ArtifactFullScreen.tsx:1887); 'Create file' row in the Add to chat sheet (AddToChatSheet.tsx:1181)
- CLI, VS Code, Chrome: none found

**Before you start**

- Cloud sandbox must be provisioned on the server: AGI_E2B_EXECUTION=1 and a sandbox key and a priceable sandbox rate (apps/web/lib/e2b/gate.ts:20-28)
- Model that is tool capable and, for the hosted route, marked code-execution capable (request-processor.ts:5933-5936)
- Attachment upload scanner configured in production (upload-scan.ts:408-430)
- A streaming request (request-processor.ts:5744-5750)

**Screens and controls**

- Toggle 'Run code' (chip label shown in overflow options, ChatComposerNew.tsx:4856-4858)
- Output row (Document, Presentation, Spreadsheet)
- Chart artifact view on mobile with chart renderer ReportChart

**Journey**

1. 1. Attach the .xlsx in the composer.
2. 2. Turn on 'Run code' or phrase the request so the server turns it on (request-processor.ts:1000-1013).
3. 3. Ask for analysis and a chart.
4. 4. The server stages the attachment into the sandbox, the model runs code, and chart images or files come back as generated files.
5. 5. Ask for a Word report with the chart. The Word builder takes Markdown-like text and tables only, so an embedded chart can only come from sandbox code that writes the .docx itself (managed-office-file-service.ts has no image support; grep for image found none).
6. 6. Open the file cards.

**What the person sees and gets**

- Generated file cards (chart images, .xlsx, .docx)
- Message text when the sandbox is unavailable (codeExecutionUnavailable, request-processor.ts:6417-6425)
- Chart artifact drawn natively on the phone

**Settings**

- 'Run code' toggle
- Output format choice
- Server settings (names only): AGI_E2B_EXECUTION, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE (apps/web/lib/e2b/gate.ts:6-7; chat-template.ts:1)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Excel writing with formulas, up to 20 sheets, and a per-sheet chart of type bar, line or pie from named columns and row range (managed-office-file-service.ts:81-110, 163-188)
- Excel editing of an attached workbook by cell edits with expected old value, up to 1000 edits (managed-office-file-service.ts:163-186)
- Attachment staging into the sandbox and python chart output handling (attachment-staging.ts; python-figure-provenance.ts)
- Mobile draws chart artifacts as charts using a shared parser (ChartArtifactView.tsx:8-10; ArtifactFullScreen.tsx:1887)

**Incomplete**

- Chart inside a Word report: no direct support in the Word builder; relies on sandbox code and a template the brief says has python-docx and matplotlib. I could not verify the template contents (apps/web/lib/e2b/chat-template.ts only reads the template name from a setting).
- Mobile: only the chart display; the report step needs the web sandbox

**Present but disconnected or switched off**

- Sandbox route is off until the server settings are set; then e2bProvisioningReady() is false and code execution tools are not offered (gate.ts:20-28; request-processor.ts:6417-6425). Whether production has it on: unknown.
- Free managed chat refuses code_execution true (free-quota.ts:125 shows code_execution literal false)

**Not available**

- CLI, VS Code, Chrome: no spreadsheet analysis or chart feature found for this item. The CLI reads xlsx text (apps/cli/src/documents.rs) but has no chart flow found.

## 4. Required behaviour

**Established requirements**

- A spreadsheet the user brings is analysed, charted, and turned into a report that contains the chart. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.03)
- Creating sheets with charts is part of the office file tool. (source: apps/web/lib/services/managed-office-file-service.ts:253-259 (tool description))
- Running analysis code needs the cloud sandbox, offered only when e2bProvisioningReady() is true. (source: apps/web/lib/e2b/gate.ts:20-28; apps/web/lib/voice/live-voice-tools.ts:404-406)
- Switch-on needs AGI_E2B_EXECUTION=1, a sandbox key, AGI_E2B_CHAT_TEMPLATE and the upload scanner, then a live check of a chart-into-docx prompt. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.03)

**Acceptance criteria**

1. With the sandbox ready, an attached .xlsx and the prompt 'total by region and bar chart' returns a chart image or chart file card.
2. A Spreadsheet output request with a chart field returns an .xlsx whose sheet holds a native chart over the stated cells.
3. A request to edit cell B2 with a wrong expected value is refused and the file is unchanged.
4. With the sandbox not ready, the reply says code execution is unavailable and offers no tools.
5. A chart-into-Word request returns a .docx that contains the chart image (to be verified live).
6. On the phone, a chart artifact renders as a chart, not as raw JSON.
7. On the Free plan the request is refused or the toggle is off.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chart in report should work without the person naming a library [inferred]
- Empty or malformed sheets should give a clear error [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the Word builder take an image or chart reference so a report can hold a chart without sandbox code
- [proposed] Add a live end-to-end check to the release checklist

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | e2b gate | `apps/web/lib/e2b/gate.ts` | Decides whether sandbox execution is ready |
| config | chat template setting | `apps/web/lib/e2b/chat-template.ts` | Reads AGI_E2B_CHAT_TEMPLATE |
| service | execution tools | `apps/web/lib/e2b/execution-tools.ts` | Defines execute_code and file tools; render note when template set (lines 31-33, 258-268) |
| service | attachment-staging | `apps/web/lib/e2b/attachment-staging.ts` | Copies attachments into the sandbox workspace |
| service | python figure provenance | `apps/web/lib/e2b/python-figure-provenance.ts` | Marks chart images produced by python |
| service | generated-files (sandbox) | `apps/web/lib/e2b/generated-files.ts` | Collects files the sandbox wrote |
| service | compute-metering | `apps/web/lib/e2b/compute-metering.ts` | Prices sandbox compute; sandboxComputeIsPriceable is part of the gate |
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | xlsx sheets, charts, edits |
| service | managed-workbook-builder | `apps/web/lib/services/managed-workbook-builder.ts` | Writes the workbook and chart XML |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Code execution intent (1000-1013), tool resolution (5929-5945, 6417-6425) |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Run code toggle and Output choice |
| component | ChartArtifactView (mobile) | `apps/mobile/src/features/chat/components/ChartArtifactView.tsx` | Draws chart artifacts on the phone |
| service | chartArtifact reader (mobile) | `apps/mobile/src/features/chat/utils/chartArtifact.ts` | Reads chart spec from artifact content |
| component | ArtifactFullScreen (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Shows chart artifact in full screen (line 1887) |
| service | upload-scan | `apps/web/lib/security/upload-scan.ts` | Scanner needed for the attachment |
| service | voice tools | `apps/web/lib/voice/live-voice-tools.ts` | Offers sandbox tools to voice only when ready (404-406) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches the file; the client uploads it and the server scans it. | our servers | apps/web/lib/security/upload-scan.ts:408-430 |
| The request carries code_execution (toggle or implied from the prompt). | device | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:777, 1000-1013 |
| The server checks the sandbox is ready and the model can run code, then adds the sandbox tools; otherwise marks code execution unavailable. | our servers | request-processor.ts:5929-5945, 6417-6425; execution-tools.ts:258-268 |
| The attachment is staged into the sandbox; the model's code runs there and writes chart files or documents. | outside service | attachment-staging.ts:1-12; the sandbox is a hosted service (E2B names in gate.ts); vendor name is hidden from users (vendor-name-not-user-visible.test.ts) |
| Files the sandbox wrote are returned as generated files; chart images get provenance marks. | our servers | apps/web/lib/e2b/generated-files.ts; python-figure-provenance.ts:1-40 |
| For an Excel chart without code, the office tool writes the workbook in process. | our servers | managed-office-file-service.ts:930-1050 |
| The phone draws a chart artifact from its spec on the device. | device | ChartArtifactView.tsx:8-10 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded spreadsheet | Turn attachment; copy staged in the sandbox workspace | Server side | Sandbox lifetime and reclaim: apps/web/lib/e2b/reclaim.ts exists; policy not read; unknown |
| Generated files (charts, xlsx, docx) | Our file storage as generated files | Server data; clients fetch | unknown |
| Sandbox compute usage | Metered by compute-metering.ts | Server side | unknown |

**Models and providers.** The chat model chooses code and tool calls; it must be tool capable and, for hosted execution, code-execution capable per the catalog (request-processor.ts:5933-5936). The sandbox is an outside hosted service. Whether provider-hosted interpreters apply for some providers: execution-tools.ts:216 resolveCodeExecutionTools by provider exists but was not read in detail.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the server needs a user to own the files (tool-loop.ts:2566). |
| Permissions | Native tool permission check nativeToolPermitted(EXECUTE_CODE_TOOL) (request-processor.ts:5936). |
| Subscription | Free managed chat forbids code execution (free-quota.ts:125). Capability 'canUseCloudExecution' is checked on mobile (apps/mobile/stores/chat/chatExecutionStore.ts:3275-3280). The web plan table has no code execution entry in billing-catalog.ts; the rule for paid plans: none found in the code read. |
| Limits and metering | Sandbox compute is priced and held before the turn (hostedCodeExecutionReserveMicrousd, request-processor.ts:5938-5940; compute-metering.ts). Sheet limits: 20 sheets, 20,000 rows, 200 cells per row, 1000 cell edits (managed-office-file-service.ts:119-190). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY (names only) and AGI_E2B_CHAT_TEMPLATE; also the managed compute private beta gate (apps/web/lib/e2b/gate.ts:30-36); mobile FEATURES.codeExecution (v1FeatureFlags.ts:34). |
| Model compatibility | Model must be tool capable; hosted execution also needs the code-execution capability in the catalog (request-processor.ts:5933-5936). |
| Provider restrictions | Execution routes by provider (providerRoutesToE2B in execution-tools.ts:212); details not read. |
| Local mode | Sandbox analysis and the office tool run on our servers, so Local mode on the phone or desktop cannot use them (AddToChatSheet.tsx:343-346 needs cloud mode). Chart display on the phone works from stored artifact content without the server [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sandbox not provisioned | codeExecutionUnavailable is set and no sandbox tools are offered | request-processor.ts:6417-6425; gate.ts:20-28 |
| Non-streaming request with code execution | Refused with code_execution_stream_required | request-processor.ts:5744-5750 |
| Attachment fails to stage | StagingOutcome lists staged and failed names | attachment-staging.ts:24-28 |
| Workbook edit with wrong expected value | Edit is checked against the expected cell value; refusal text not read | managed-office-file-service.ts:174-186 (expected field) |
| Empty, waiting, retry, cancel, timeout | not established; abort signal is passed to the office tool (tool-loop.ts:2571) but UI states not read | not established |
| Phone with a malformed chart spec | not read | chartArtifact.ts not opened |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__/gate.test.ts`: Sandbox gate (by file name) [inferred]
- `apps/web/lib/e2b/__tests__/attachment-staging.test.ts`: Staging attachments into the sandbox (by file name) [inferred]
- `apps/web/lib/e2b/__tests__/python-figure-provenance.integration.test.ts`: Python chart provenance (by file name) [inferred]
- `apps/web/lib/e2b/__tests__/execution-tools.test.ts`: Execution tool definitions (by file name) [inferred]
- `apps/web/lib/services/managed-workbook-builder.test.ts`: Workbook and chart builder (by file name) [inferred]
- `apps/web/lib/services/managed-office-file-service.test.ts`: Office file builder (by file name) [inferred]
- `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx`: Workbook preview (by file name) [inferred]

**Test scenarios**

- **Excel with native chart**
  1. Choose Output > Spreadsheet
  2. Ask for a sheet of 5 products and prices with a bar chart
  3. Open the .xlsx in a spreadsheet program
  - Expected: A chart over the stated cells.
- **Sandbox analysis**
  1. On a server with the sandbox ready attach a .xlsx
  2. Turn on 'Run code' and ask for totals and a chart
  - Expected: Chart file card appears; numbers match a manual sum.
- **Chart in Word report (live check)**
  1. Same upload
  2. Ask for a Word report that includes the chart
  - Expected: A .docx with the chart image inside. Mark as untested until run.
- **Sandbox off**
  1. Use a server without the sandbox settings
  2. Ask for analysis with 'Run code' on
  - Expected: Clear message that code execution is unavailable; no tool calls.
- **Phone chart artifact**
  1. Open a chat that produced a chart artifact on the phone
  - Expected: A drawn chart in chat and full screen.

**Where to look when it fails**

- Response codes code_execution_stream_required, office_creation_stream_required
- Trace helper apps/web/lib/e2b/tracing.ts
- Message 'Chart output matching is unavailable for this run; all chart files are kept.' written to stderr by the python bootstrap (python-figure-provenance.ts)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Chart inside a Word report has no native path and the template contents are unverified** Affects: Web, Desktop. Evidence: No image support in managed-office-file-service.ts; chat-template.ts reads a name only. Work needed: Live check with the real template or add image support to the Word builder
- **Sandbox switch-on is a server task** Affects: Web, Desktop. Evidence: gate.ts:20-28; brief S110.03 Unfinished. Work needed: Owner sets the settings and runs the live check
- **No spreadsheet analysis on CLI, VS Code, Chrome** Affects: Those apps. Evidence: No code found. Work needed: Decide scope
- **Empty, waiting and failure states and plan limits unknown** Affects: All. Evidence: Not found. Work needed: Read the client code for code-run states and add plan rules
- **Brief cites ArtifactFullScreen.tsx:1012 for mobile charts, but line 1012 is a save call; chart display is at 1887** Affects: Documentation. Evidence: ArtifactFullScreen.tsx:1012, 1887. Work needed: Update the brief reference
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:free
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- F110-01
- file:apps/web/lib/e2b/gate.ts

## Unknown

- Whether production has the sandbox switched on
- What the sandbox template contains (python-docx, matplotlib are claims in the brief only)
- Which paid plans may run code and what the quota is
- Client states for waiting, cancel and timeout of a code run
- How long sandbox files and staged uploads are kept
- Own-key behaviour for code execution
