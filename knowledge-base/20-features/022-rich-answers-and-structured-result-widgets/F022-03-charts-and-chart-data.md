---
id: "F022-03"
type: "feature"
title: "Charts and chart data"
aliases: ["Interactive charts", "Chart data view", "Chart artifact", "ChartArtifact", "ReportChart", "Answer UI chart", "S22.08", "S22.09"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.08", "S22.09"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "file:packages/contracts/types/src/chart-spec.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-03 Charts and chart data

Charts in answers draw as bar, line, pie, donut or scatter charts that show values on hover or tap. A data table sits under the chart, and Web offers a PNG download. Built on Web, Desktop and Mobile; CLI, VS Code and Chrome have no chart drawing.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.08](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2208), [S22.09](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2209).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws a chart from structured data in an answer, lets the person read exact values and inspect the underlying numbers in a table, and exports the picture.

**Why it exists.** Numbers are easier to understand as charts, and a person must be able to check the data behind a picture. The brief requires interactive charts (S22.08) and inspectable data (S22.09). The requirements list 'Charts and inline visualizations' among outputs.

**Who uses it.** Web, Desktop (Electron hosted web) and Mobile users who ask for analysis, comparisons or reports.

**Problems it solves**

- Reading values off a static picture.
- A chart that cannot be checked against data.
- A chart failing silently (error fallback and data table remain).

**Use cases**

- Ask for a bar chart of monthly sales and hover a bar for its value.
- Open 'View chart data' to copy numbers.
- Download the chart as a PNG for a slide.
- Read a chart in a report on Mobile and scrub across points.

## 2. User experience

**Where to find it**

- Web and Desktop artifact: chart artifact preview (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1979) with a 'PNG' download button and a 'View chart data' disclosure (packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx).
- Web and Desktop answer-ui card: chart block with a data table under a disclosure labelled by ANSWER_UI_CHART_DATA_LABEL (apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiChart.tsx:25-110).
- Web and Desktop chart fence: AnswerSurface renders chart fences through the same chart view (packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx:616-640).
- Mobile: ReportChart with data table toggle and a 'Save ... as an image' button (apps/mobile/src/features/chat/components/ReportChart.tsx:811-930); answer-ui scatter (cards/AnswerUiScatter.tsx).
- CLI, VS Code, Chrome: not found.

**Before you start**

- The answer contains a chart artifact, chart fence, mermaid-style chart (Mobile) or an answer-ui chart block.

**Screens and controls**

- Hover tooltip with label and value (packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:45-65,152).
- Legend for multi-series charts.
- 'View chart data' table with row headers.
- 'PNG' download button with aria-label 'Download <name> as PNG' (ChartArtifact.tsx:163).
- Mobile scrub across categories (testID report-chart-scrub), data toggle button, save-as-image button.

**Journey**

1. Model produces chart data in an artifact, fence or answer-ui block.
2. App parses and validates it, draws it (Web chunk loads lazily with 'Drawing chart…').
3. Person hovers or taps for values, opens the data table, optionally downloads.
4. If drawing fails the person sees an error message plus the raw data.

**What the person sees and gets**

- Tooltip text.
- Summary text for screen readers (summarizeChart).
- 'Plotting the first 500 of N points. Download the JSON for the full data.' when truncated (ChartArtifact.tsx).
- PNG file named from the chart title.

**Settings**

- Theme (light or dark) and reduced motion change palette and animation (ChartArtifact.tsx uses useDocumentTheme and useReducedMotion).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Bar, line, pie, donut and scatter drawing with hover on Web (ChartCanvas.tsx; packages/contracts/types/src/chart-spec.ts:1-5).
- Error boundary with a fallback showing the content (ChartArtifact.tsx:182-209).
- Data table under every chart on Web (ChartArtifact.tsx, AnswerUiChart.tsx).
- PNG download on the chart artifact (ChartArtifact.tsx:39,163).
- Mobile chart with data table, truncation notice and save-as-image (ReportChart.tsx:811-930).
- Row cap 500 and series cap 12 (chart-spec.ts:7-8).

**Incomplete**

- The artifact chart kinds list is bar, line, pie (chart-spec.ts:1) with scatter added for render (chart-spec.ts:3); donut is detected separately (chart-spec.ts:5). Which entry paths accept scatter is not fully traced.
- The truncation note says 'Download the JSON' but a JSON download control was not found in ChartArtifact.tsx [inferred gap].

**Present but disconnected or switched off**

- none found

**Not available**

- CLI, VS Code and Chrome: no chart drawing found (the brief agrees).
- The draft's pointer to ArtifactPreview line 1050 was wrong; the chart renders at ArtifactPreview.tsx:1979.

## 4. Required behaviour

**Established requirements**

- Charts in answers render interactively (hover or tap values, legend). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.08)
- The data behind a chart can be inspected (values on hover, source table or JSON view or download). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.09)
- Answer UI chart types are bar, line, pie, scatter with at most 4 series and 24 points per series. (source: packages/contracts/types/src/answer-ui.ts:15-16,60)
- Generated outputs include 'Charts and inline visualizations'. (source: doc: docs/product/requirements.md:1449)
- A chart that fails to draw shows an error fallback, not a blank area. (source: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:182-209)

**Acceptance criteria**

1. Hovering a bar shows its label and value.
2. 'View chart data' lists the same values as the chart.
3. A malformed chart shows the fallback text and raw content.
4. More than 500 points shows the truncation note.
5. PNG download produces a file; a failed export shows an alert message.
6. Mobile data toggle reports its expanded state to assistive technology.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chart summary text must exist for screen readers [inferred from summarizeChart and the hidden paragraph in AnswerUiChart.tsx:50].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a JSON or CSV download so the truncation note is true.
- [proposed] Add charts to the Chrome side panel.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChartArtifact | `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx` | Chart panel with PNG download, data table, truncation note |
| component | ChartCanvas | `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx` | Recharts drawing with hover tooltip, lazy loaded |
| service | chart-spec (UI) | `packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts` | Palette, chrome, hover text, summaries |
| schema | chart-spec contract | `packages/contracts/types/src/chart-spec.ts` | Kinds, row cap 500, series cap 12, parsing |
| component | ArtifactPreview chart | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Mounts ChartArtifact (:1979) |
| component | AnswerUiChart (web) | `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiChart.tsx` | answer-ui chart block with table |
| component | AnswerSurface chart fence | `packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx` | Chart fence mapped to chart view (:616-640) |
| schema | answer-ui contract | `packages/contracts/types/src/answer-ui.ts` | Chart block shape and limits |
| component | ReportChart (mobile) | `apps/mobile/src/features/chat/components/ReportChart.tsx` | Mobile bar, line and pie drawing, table, save as image |
| component | AnswerUiScatter (mobile) | `apps/mobile/src/features/chat/components/cards/AnswerUiScatter.tsx` | Mobile scatter |
| component | ChartArtifactView (mobile) | `apps/mobile/src/features/chat/components/ChartArtifactView.tsx` | Mobile chart artifact view [inferred] |
| test | ChartArtifact tests | `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx` | Chart artifact |
| test | ChartArtifact boundary test | `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.boundary.test.tsx` | Error boundary |
| test | chart-spec test | `packages/contracts/types/src/__tests__/chart-spec.test.ts` | Parsing |
| test | ReportChartData test | `apps/mobile/__tests__/ReportChartData.test.tsx` | Mobile data table |
| test | ReportChartExport test | `apps/mobile/__tests__/ReportChartExport.test.tsx` | Mobile save as image |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Model writes chart data (artifact, fence or render_answer_ui call). | outside service | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1300-1316 (answer-ui tool offer) |
| Server validates answer-ui card bodies and streams them. | our servers | apps/web/lib/services/answer-ui-tool-service.ts |
| Client parses and caps the data, then draws it. | device | ChartArtifact.tsx; packages/contracts/types/src/chart-spec.ts:7-8 |
| PNG export draws the SVG to a canvas and saves a file. | device | ChartArtifact.tsx:39-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chart data | Inside the artifact or card in message metadata | With the message | Follows the message |
| PNG file | Download folder chosen by the browser | No | Person controlled |

**Models and providers.** Any model can produce chart text. The answer-ui tool needs a tool-capable model and a client declaring support (request-processor.ts:1300-1316).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Drawing needs no account; the answer-ui tool runs in Cloud chat. |
| Permissions | none found in the code. |
| Subscription | none found in the code for chart drawing. |
| Limits and metering | 500 rows and 12 series for artifact charts (chart-spec.ts:7-8); answer-ui: 4 series, 24 points (answer-ui.ts:15-16). |
| Feature flags | none found in the code. |
| Model compatibility | The answer-ui chart needs a tool-capable streaming model; artifacts and fences do not [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Artifact and fence charts draw from message text on the device and need no server [inferred]; the answer-ui card is produced by the Cloud server tool loop, so it does not exist in Local mode [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Drawing chart…' while the chunk loads | ChartArtifact.tsx:195-200 |
| Parse or draw error | Fallback 'This chart could not be drawn from the data provided.' with raw content | ChartArtifact.tsx:182-190 |
| Too many points | First 500 plotted with a note | ChartArtifact.tsx truncation note; chart-spec.ts:7 |
| Export error | Alert text shown | ChartArtifact.tsx:158-172 |
| Reduced motion | Animation off | ChartArtifact.tsx animate={!reducedMotion} |
| Accessibility | Figure with title, summary text and data table; Mobile figure has role image and a label | AnswerUiChart.tsx:40-58; ReportChart.tsx:854-856 |
| Offline, retry, cancel | not handled in the code (drawing is local) | none found in ChartArtifact.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx`: Chart artifact rendering (file exists; bodies not read)
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.boundary.test.tsx`: Error boundary (by name)
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.donut.test.tsx`: Donut (by name)
- `packages/contracts/types/src/__tests__/chart-spec.test.ts`: Spec parsing (by name)
- `apps/mobile/__tests__/ReportChartData.test.tsx`: Data table (by name)
- `apps/mobile/__tests__/ReportChartExport.test.tsx`: Export (by name)
- `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiCard.test.tsx`: Answer UI card (file exists)
- `apps/mobile/src/features/chat/components/cards/__tests__/answerUiScatter.test.ts`: Mobile scatter (by name)

**Test scenarios**

- **Hover values**
  1. Ask for a bar chart with 5 values on Web.
  2. Hover each bar.
  - Expected: Tooltip shows label and value for each.
- **Data table matches**
  1. Open 'View chart data'.
  - Expected: Rows equal the plotted points.
- **Bad data**
  1. Send chart JSON with a missing x key.
  - Expected: Fallback message with raw content, no blank area.
- **Truncation**
  1. Provide 600 points.
  - Expected: Note reads first 500 of 600.
- **Mobile save**
  1. Open a chart on Mobile and tap Save as an image.
  - Expected: Image saved or a clear failure message.

**Where to look when it fails**

- data-testid values chart-hover, chart-artifact-loading, chart-truncation-note, answer-ui-chart-table.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **The truncation note mentions a JSON download that was not found** Affects: Web, Desktop. Evidence: ChartArtifact.tsx truncation text versus controls. Work needed: Add the download or change the text
- **No charts on CLI, VS Code, Chrome** Affects: Those users. Evidence: Brief and no code found. Work needed: Decide scope per app
- **The draft said data download unverified; PNG exists, data export does not** Affects: Web. Evidence: ChartArtifact.tsx:163. Work needed: Data export if required by S22.09
- **Mobile chart source differs (mermaid-based)** Affects: Mobile consistency. Evidence: ReportChart.tsx uses MermaidChart types. Work needed: Confirm the same data reaches both
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- file:packages/contracts/types/src/chart-spec.ts

## Unknown

- Whether a JSON or CSV download exists elsewhere.
- Whether Desktop Tauri renders charts (only hosted web is public).
- Bodies of listed tests.
- How mobile chart data and web chart data share one contract.
