---
id: "F011-08"
type: "feature"
title: "Chart descriptions and data tables"
aliases: ["Chart descriptions", "Chart summary", "View chart data", "Data table alternative", "Download chart as PNG", "ChartArtifact", "Data table (inline answer chart)", "S11.17", "S11.18"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S11.17", "S11.18"]
depends_on: ["SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "file:packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx", "file:packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts", "file:packages/contracts/types/src/chart-spec.ts", "F011-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-08 Chart descriptions and data tables

A chart in a chat answer or artifact gets a hidden text summary (title, kind, series, first, last, lowest and highest values, pie shares) and a collapsible data table, so people who cannot see the graphic can read the values. The brief wrongly lists the table as missing: it exists on Web and Desktop. Mobile charts have neither.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.17](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1117), [S11.18](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1118).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Pairs each drawn chart with a screen-reader summary and a real HTML table of the plotted values, plus a PNG download and a text fallback if drawing fails.

**Why it exists.** A drawn chart is invisible to a screen reader and hard to read for low-vision users; the brief asks for a description and a table alternative (brief S11.17, S11.18).

**Who uses it.** Screen-reader users, low-vision users, and anyone who wants exact numbers.

**Problems it solves**

- Chart values locked in a picture.
- A crashed chart leaving a blank hole (fallback shows the data text).
- Missing exact values when hovering is not possible.

**Use cases**

- A screen-reader user focuses a revenue chart and hears the summary.
- A user opens 'View chart data' to copy values.
- A user downloads the chart as PNG for a report.
- A chart with broken data shows the raw content instead of nothing.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): chart artifacts in the artifact preview, library, slides and chart blocks in answers, drawn by ChartArtifact (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1979; apps/web/features/chat/components/artifacts/presentation/SlideView.tsx:140).
- Web: inline interactive answer charts (AnswerUiChart) with a disclosure labelled 'Data table' (packages/ui/unified-chat/src/lib/answer-ui.ts:10).
- Mobile: ChartArtifactView in artifact full screen, no summary or table (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1887).

**Before you start**

- A chart artifact or chart block with valid JSON data.

**Screens and controls**

- Figure with accessible name = chart name, described by the hidden summary (ChartArtifact.tsx:132-137).
- Header showing kind, '<n> points · <n> series' (ChartArtifact.tsx:147-155).
- Button 'PNG' with label 'Download <chart name> as PNG' (ChartArtifact.tsx:169).
- Disclosure 'View chart data' containing a table labelled '<chart name> data' with column and row headers (ChartArtifact.tsx:212-240).
- Fallback panel with the raw content and a reason (ChartArtifact.tsx:81-103).

**Journey**

1. Open a chat that has a chart.
2. Focus the chart; a screen reader reads its name and the summary.
3. Optionally open 'View chart data' and read the table by row.
4. Optionally press PNG to download.
5. If data was cut at the row cap, read the note about the first points.

**What the person sees and gets**

- Summary text such as 'Revenue. Bar chart of 4 points, month on the horizontal axis... Sales: starts at ..., lowest ..., highest ....' (chart-spec.ts:127-183).
- PNG file named from the chart title (ChartArtifact.tsx:28-34).
- Error text role=alert if PNG export fails (ChartArtifact.tsx:175-179).
- Truncation note 'Plotting the first 500 of N points. Download the JSON for the full data.' (ChartArtifact.tsx:248-253).

**Settings**

- Reduced motion turns off chart animation (ChartArtifact.tsx uses useReducedMotion, animate={!reducedMotion}).
- Light/dark theme changes chart colours.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The summary names the chart, the kind, the axes, and per series the first, last, lowest and highest value; pies give total, largest and smallest; donuts give each share (packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts:127-183).
- The data table disclosure exists in the shared chart component, with column and row headers and a name (ChartArtifact.tsx:212-240), and a test opens it (packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.draw.test.tsx:110-120).
- AnswerUiChart has its own summary and a 'Data table' disclosure with a caption and a fallback line naming the table (apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiChart.tsx).
- If the chart cannot be parsed or drawn, a fallback shows the reason and raw data (ChartArtifact.tsx:81-103, :189-197).
- Point and series counts use plural-aware translation (ChartArtifact.tsx:147-155; packages/ui/i18n/locales/ar/chat.json:465-476).

**Incomplete**

- Summary sentence frames ('Bar chart of', 'starts at', 'lowest', 'highest', 'Showing the first') and 'View chart data' are English literals; only the point and series counts are translated (chart-spec.ts:134-183; ChartArtifact.tsx:213).
- Table cell numbers are written raw (row[entry.dataKey]) while the summary uses toLocaleString, so formatting differs (ChartArtifact.tsx:235; chart-spec.ts:109).
- The truncation note tells the user to 'Download the JSON for the full data' but ChartArtifact has no JSON download control; whether the artifact host offers one: unknown (ChartArtifact.tsx:251).
- Whether the drawn recharts surface itself is hidden from or exposed to assistive tech in ChartArtifact: unknown (ChartSpecView hides it with aria-hidden, ChartArtifact does not).

**Present but disconnected or switched off**

- ChartSpecView (used by AnswerUiChart) wraps the canvas in aria-hidden, so the summary and table carry all the meaning there (packages/ui/unified-chat/src/components/artifact-components/ChartSpecView.tsx:57).

**Not available**

- Mobile ChartArtifactView has no summary and no table; it only sets an alert role for errors (apps/mobile/src/features/chat/components/ChartArtifactView.tsx:35).
- CLI, VS Code and Chrome: brief says n/a; not checked further.

## 4. Required behaviour

**Established requirements**

- A chart comes with a text description (title, what is plotted, key values) that assistive tech can read. Web and desktop done. (source: brief S11.17)
- A chart can be viewed as a data table (or its data read in order) as an alternative to the graphic. The brief lists web and desktop as missing. (source: brief S11.18)
- Controls have accessible names; focus, keyboard, zoom, reduced motion and screen reader are verified for core flows. (source: doc: docs/product/experience-contract.md (check W23))

**Acceptance criteria**

1. A valid line chart renders role=figure with an accessible name equal to the title.
2. The hidden summary contains the title, kind, series name, lowest and highest values.
3. A pie summary lists total, largest and smallest; a donut lists each share, with under 1 percent shown as '<1%'.
4. Opening 'View chart data' shows one row per plotted point with a header for each series.
5. A malformed JSON chart shows the fallback with the raw text instead of throwing.
6. Data above 500 rows shows the truncation note and the summary says it shows the first N of M.
7. The PNG button downloads a file named from the chart title.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web and Desktop share the chart code because the public Desktop window shows the hosted web app [inferred from AGENTS.md section 5].
- The brief's 'missing' for S11.18 is out of date [inferred from ChartArtifact.tsx:212-240 and its test].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Translate the summary sentences and the disclosure label.
- [proposed] Format table cells with the same locale formatter as the summary.
- [proposed] Give Mobile charts a summary and a table, or mark the brief item 'Mobile missing'.
- [proposed] Fix the truncation note or add the JSON download.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChartArtifact | `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx` | Figure, summary, header, PNG download, data table, fallback, truncation note |
| service | summarizeChart / describeSeries | `packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts` | Builds the text summary |
| service | parseChartArtifact and caps | `packages/contracts/types/src/chart-spec.ts` | Parses chart JSON, row cap 500, series cap 12 |
| component | ChartCanvas | `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx` | Lazy drawing surface |
| component | ChartSpecView / ChartErrorBoundary | `packages/ui/unified-chat/src/components/artifact-components/ChartSpecView.tsx` | Canvas wrapper (aria-hidden) and error boundary |
| component | ArtifactRenderer chart case | `packages/ui/unified-chat/src/components/ArtifactRenderer.tsx` | Routes artifact type chart to ChartArtifact |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web artifact preview renders ChartArtifact |
| component | SlideView | `apps/web/features/chat/components/artifacts/presentation/SlideView.tsx` | Charts inside slides |
| component | AnswerUiChart | `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiChart.tsx` | Inline answer chart with summary and Data table disclosure |
| service | answer-ui helpers | `packages/ui/unified-chat/src/lib/answer-ui.ts` | Defines 'Data table' label and chart spec builder |
| service | translateUiPlural | `packages/ui/ui/src/lib/translate.ts` | Plural-aware translation for point and series counts |
| config | chat locale catalogs | `packages/ui/i18n/locales/en/chat.json` | counts.chartPoints and counts.chartSeries plural keys |
| component | ChartArtifactView (mobile) | `apps/mobile/src/features/chat/components/ChartArtifactView.tsx` | Mobile chart view, no summary or table |
| service | chart theme hooks | `packages/ui/unified-chat/src/components/artifact-components/chartTheme.ts` | Document theme and reduced-motion detection |
| test | ChartArtifact tests | `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx` | Parsing, summary, fallback, truncation, recovery |
| test | ChartArtifact draw test | `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.draw.test.tsx` | Drawing and the data table |
| test | ChartArtifact donut test | `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.donut.test.tsx` | Donut shares in summary |
| test | AnswerUiCard test | `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiCard.test.tsx` | Answer chart accessible description and data table |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A chart artifact or chart block arrives in the chat as JSON text. | our servers | packages/ui/unified-chat/src/components/ArtifactRenderer.tsx:76 |
| The component parses the JSON, caps rows and series, and builds the spec. | device | ChartArtifact.tsx (parseChartArtifact useMemo); packages/contracts/types/src/chart-spec.ts:186 |
| It writes the summary into a hidden paragraph and the data into a table. | device | ChartArtifact.tsx:136-137, :212-240 |
| The graphic loads lazily and draws; an error boundary swaps in the fallback if it throws. | device | ChartArtifact.tsx:19-22, :189-212 |
| PNG download clones the drawn SVG, paints it on a canvas and downloads it. | device | ChartArtifact.tsx:39-79 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chart data and summary | Inside the artifact content; summary is computed on the fly, not stored | With the artifact | Follows the artifact lifecycle |
| Downloaded PNG | User's downloads folder | no | Object URL revoked after 60 seconds (ChartArtifact.tsx:75) |

**Models and providers.** None for this feature: the summary is built by deterministic code, not by a model. A model produces the chart JSON earlier in the chat turn (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the viewer itself; viewing follows access to the chat or artifact. |
| Permissions | none found in the code. |
| Subscription | none found in the code for summary, table or PNG. |
| Limits and metering | Parser caps: 500 rows and 12 series (packages/contracts/types/src/chart-spec.ts:7-8). No usage metering. |
| Feature flags | none found in the code. |
| Model compatibility | Any model that emits valid chart JSON; the renderer is model-agnostic. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on device in Local mode because rendering and summary need no network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Shows 'Drawing chart…' while the canvas chunk loads | ChartArtifact.tsx:197-203 |
| Invalid JSON or shape | Fallback with reason and raw content | ChartArtifact.tsx:122-126; ChartArtifact.test.tsx:306-313 |
| Streaming broken frame becomes valid | Recovers to the chart | ChartArtifact.test.tsx:323-336 |
| Draw error | Boundary shows 'This chart could not be drawn from the data provided.' with the content | ChartArtifact.tsx:189-197 |
| Too many rows | Cut to 500 with a visible note and a summary sentence | ChartArtifact.tsx:246-253; chart-spec.ts:170-172 |
| PNG export before drawing or canvas failure | Error text with role alert | ChartArtifact.tsx:46, :175-179 |
| Reduced motion | Animation off | ChartArtifact.tsx (animate={!reducedMotion}) |
| Offline | Works; no network used. Late chunk load while offline: not handled in the code beyond the error boundary | ChartArtifact.tsx:19-22 |
| Mobile | No description or table | apps/mobile/src/features/chat/components/ChartArtifactView.tsx:35 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx`: summarizeChart punctuation, parser rules and caps, fallback, truncation note, recovery, ArtifactRenderer routing
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.draw.test.tsx`: Bars, axes, legend, the semantic data table values
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.donut.test.tsx`: Donut shares, legend order, summary text
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.boundary.test.tsx`: Error boundary fallback and recovery
- `packages/ui/unified-chat/src/components/markdown/__tests__/AnswerSurfaces.test.tsx`: Chart summary inside answer surfaces
- `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiCard.test.tsx`: Answer chart accessible description and data table following a slider

**Test scenarios**

- **Screen reader summary**
  1. Create a bar chart artifact with two series
  2. Focus the figure with a screen reader
  - Expected: Name equals title; description lists series with lowest and highest values
- **Data table**
  1. Open 'View chart data'
  - Expected: A table named '<title> data' with one row per point and a header per series
- **Broken data**
  1. Send chart content '{ oops'
  - Expected: Fallback panel shows the reason and the raw text
- **Row cap**
  1. Send 501 points
  - Expected: Note 'Plotting the first 500 of 501 points' and summary says first 500 of 501
- **PNG**
  1. Press PNG
  - Expected: A PNG named from the title downloads
- **Mobile chart**
  1. Open a chart on Mobile with VoiceOver or TalkBack
  - Expected: Today: no summary or table (gap)

**Where to look when it fails**

- Error text in role=alert under the header for export failures
- Console error from the error boundary when drawing throws
- data-testid values chart-artifact, chart-artifact-summary, chart-artifact-fallback, chart-truncation-note

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **Brief says the table alternative is missing on Web and Desktop, but it exists** Affects: Brief readers and planners. Evidence: ChartArtifact.tsx:212-240; ChartArtifact.draw.test.tsx:110-120. Work needed: Update the brief and registry status for S11.18
- **Mobile charts have no description or table** Affects: Mobile screen-reader users. Evidence: apps/mobile/src/features/chat/components/ChartArtifactView.tsx:35. Work needed: Add a summary and a table or list view
- **Summary sentences and 'View chart data' are English only** Affects: Non-English Web and Desktop users. Evidence: chart-spec.ts:134-183; ChartArtifact.tsx:213. Work needed: Move to the catalog with plural-aware keys
- **Truncation note refers to a JSON download that this component does not provide** Affects: Users with charts above 500 rows. Evidence: ChartArtifact.tsx:251. Work needed: Add the control or change the sentence
- **Two different table labels: 'View chart data' and 'Data table'** Affects: Consistency for screen-reader users. Evidence: ChartArtifact.tsx:213; answer-ui.ts:10. Work needed: Choose one label

**Depends on**

- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- file:packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx
- file:packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts
- file:packages/contracts/types/src/chart-spec.ts
- F011-10

## Unknown

- Whether the drawn chart surface is exposed to assistive tech in ChartArtifact (recharts default markup not inspected).
- Whether the artifact host offers a JSON download that the truncation note points to.
- Whether desktop's retained Tauri code (apps/desktop/src) renders charts differently; only the hosted-web path was assumed for public Desktop.
- How Mobile charts are announced by VoiceOver/TalkBack beyond the error role.
