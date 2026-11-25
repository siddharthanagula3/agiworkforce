---
id: "F035-07"
type: "feature"
title: "Report reader"
aliases: ["Report reader", "Research report view", "Report tab", "ResearchReportView", "Reports screen detail (mobile)", "Full report reader (S35.20)", "Report outline (S35.21)", "Linked citations (S35.22)", "Tables and charts (S35.23)", "Supporting attachments (S35.24)"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.20", "S35.21", "S35.22", "S35.23", "S35.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:research_reports", "api:GET /api/research/reports", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F035-08", "F035-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-07 Report reader

The report reader shows one finished Deep Research report: title, source count, duration and credit cost, a contents list, the body with clickable [n] citations, tables, mermaid charts and a Sources list. Web and the public Desktop (which shows the web app) have a Report tab; mobile has a Reports screen. Supporting attachments are not built.

Area: [35. Research workspace](README.md). Requirement items: [S35.20](../../10-requirements/capabilities/035-research-workspace.md#s3520), [S35.21](../../10-requirements/capabilities/035-research-workspace.md#s3521), [S35.22](../../10-requirements/capabilities/035-research-workspace.md#s3522), [S35.23](../../10-requirements/capabilities/035-research-workspace.md#s3523), [S35.24](../../10-requirements/capabilities/035-research-workspace.md#s3524).

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

**What it does.** Takes a saved research report (title, summary, key findings, planned questions, markdown body, citations) and presents it for reading. It builds a contents list from the headings, turns [n] markers into links to a numbered Sources list, and renders markdown tables and mermaid charts through the shared markdown renderer on web and a chart view on mobile.

**Why it exists.** A research run produces a long, cited document. People need to read it comfortably, jump around it, and check where each claim came from, instead of reading raw model output in a chat bubble.

**Who uses it.** Paid-plan people who ran Deep Research (the server refuses research on plans without the capability, see D-2026-09-28-11), on web, public Desktop and mobile; testers and engineers checking citations.

**Problems it solves**

- Long reports are hard to navigate without a contents list.
- A numbered claim cannot be checked if the number does not lead to a source.
- Reports that cite sources the run never captured would otherwise look sourceless; the reader says so.
- Figures in a comparison are easier to read as a table or chart.

**Use cases**

- Open the Report tab after a run, click a heading in Contents to jump to a section.
- Click [3] in a sentence to scroll to source 3 and open its link.
- Open the full-screen reader to read a long report in a narrow column.
- On the phone, open Reports from the drawer, open a report and tap a section.

## 2. User experience

**Where to find it**

- Web (and public Desktop, which shows the hosted web app, doc: AGENTS.md section 5): Research panel opened with the sources toggle (aria-label 'Open sources panel'), tab 'Report' shows the newest report of the open conversation (apps/web/features/chat/components/research/ResearchPanel.tsx:418-431,214-313). Tab 'Library' opens any report in the same viewer (ResearchPanel.tsx:432-445).
- Mobile: drawer item 'reports' opens the 'Reports' screen, then tap a row (apps/mobile/src/features/drawer/components/DrawerContent.tsx:160; apps/mobile/src/features/research/ReportsScreen.tsx:517).
- CLI, VS Code, Chrome: not available (doc: docs/product/surface-feature-matrix.md, Deep Research section).

**Before you start**

- A saved report exists. The panel says 'No saved report yet' until a run finishes (ResearchPanel.tsx:295-303).
- Web: signed in; the report API uses the user-scoped database (apps/web/app/api/research/reports/route.ts:45).
- Mobile: Cloud mode and Clerk sign-in, otherwise the screen shows 'Sign in to read your reports' (ReportsScreen.tsx:532,605). The feature flag FEATURES.research must be on, else 'Deep research' unavailable (ReportsScreen.tsx:593).

**Screens and controls**

- Web header: title, '{n} sources', seconds, settled credits (ResearchReportView.tsx:335-349). Buttons: Run again, Artifact, Library, Project, Markdown, PDF, Word, full-screen toggle ('Read report full screen' / 'Exit full screen'), Close (ResearchReportView.tsx:353-461).
- Web body: summary, 'Key findings', 'Planned questions' (Answered / Not answered), 'Contents' (only when the report has 3 or more headings), the article, 'Sources' list with favicons and dates (ResearchReportView.tsx:519-643).
- Web follow-up box 'Ask a follow-up about this report' when the host allows (ResearchReportView.tsx:647-690).
- Mobile: header with back and a 'More report actions' menu (Download, Share, Save to Library, 'Report this research report'); summary, 'Key findings', 'Sections · n' list, body, sources appendix, 'Sources retrieved <date>', follow-up input (ReportsScreen.tsx:343-353,447,481-497).

**Journey**

1. Run Deep Research and wait for it to finish (feature F035-10 tells you when).
2. Open the Report tab (web) or Reports screen (mobile).
3. Read the header: title, source count, duration, cost (web). The mobile screen shows the title in its header and no duration or cost.
4. Use Contents (web) or Sections (mobile) to jump to a heading.
5. Click or tap a [n] citation to reach the source; on web it scrolls to the Sources row, whose link opens in a new tab.
6. Optionally press the full-screen button for a centred column of max-w-3xl and larger text (ResearchReportView.tsx:327,597).
7. Scroll to Sources to open the original pages.

**What the person sees and gets**

- Paused, stopped or failed reports show a banner: 'This research is paused. Resume it from its card in the chat...' or 'This report is <status>: <error>' (ResearchReportView.tsx:503-510).
- A report with numbered references but no captured links shows an explanation instead of a Sources list (ResearchReportView.tsx:618-642).
- A product event 'citation_rendered' with outcome succeeded or failed is sent (ResearchReportView.tsx:222-225).

**Settings**

- Mobile feature flag FEATURES.research (apps/mobile/lib/v1FeatureFlags.ts:24).
- No reader settings found in the code (no font size or width setting beyond the full-screen toggle).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web reader renders header, key findings, planned questions, contents, body, sources (apps/web/features/chat/components/research/ResearchReportView.tsx:329-645).
- Contents built from markdown headings h1-h4, skipping fenced code; ids stamped onto rendered headings in order (packages/ui/unified-chat/src/lib/markdown-headings.ts; ResearchReportView.tsx:211,230-237).
- [n] markers become links to the numbered source only when source n exists and outside code (apps/web/features/chat/lib/citation-links.ts:22).
- Report generator is told to put comparisons in markdown tables and to add at most 3 mermaid charts (xychart-beta or pie) from cited figures (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1426-1444,1479).
- Mobile renders mermaid blocks and chart fences as SVG charts (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1533-1544; apps/mobile/src/features/chat/components/ReportChart.tsx).
- Mobile reader has sections list, citations, sources appendix, follow-up (apps/mobile/src/features/research/ReportsScreen.tsx:278-500).

**Incomplete**

- Mobile header does not show source count, duration or settled cost; the web header does (ReportsScreen.tsx:278-500 shows no such line; ResearchReportView.tsx:338-349).
- Contents appears only with 3 or more headings on both apps (ResearchReportView.tsx:563; ReportsScreen.tsx sections condition 'sections.length >= 3').
- Charts are produced only as mermaid blocks by the generator; a 'chart' fence is recognised by the renderer (packages/ui/unified-chat/src/components/markdown/richBlocks.ts:31) but the generator does not ask for it. Whether charts survive PDF and Word export is unknown.

**Present but disconnected or switched off**

- Mobile reader hides entirely when FEATURES.research is off (ReportsScreen.tsx:593).
- Tauri-based desktop code has its own separate reader (apps/desktop/src/features/research/ResearchReport.tsx) fed by a local store; AGENTS.md says the public Desktop shows the hosted web app, so this is retained internal code (doc: AGENTS.md section 5).

**Not available**

- Supporting attachments (data files, source documents): not built on any app (brief S35.24; no code found).
- CLI, VS Code and Chrome extension: no reader (doc: docs/product/surface-feature-matrix.md).
- Contradictory-evidence side-by-side display: not built (brief S35.14).

## 4. Required behaviour

**Established requirements**

- A finished report opens in a dedicated reader with title, summary, body and sources. (source: brief S35.20)
- The reader shows an outline of sections the user can navigate. (source: brief S35.21)
- Citations in the report link to their sources. (source: brief S35.22)
- Reports can include tables and charts that render in the reader. (source: brief S35.23)
- A report can carry supporting attachments the user can open or download. Status missing on every app. (source: brief S35.24)
- Research is offered on paid plans and the server refuses a research request the capability document denies. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-11))

**Acceptance criteria**

1. With a report that has 3 or more headings, 'Contents' lists them and clicking one scrolls to it.
2. A [n] where source n exists is a link; a [n] with n above the source count stays plain text.
3. A report with no captured citations but [n] markers shows the 'run recorded no links' note, not a blank.
4. A markdown table in the body renders as a table; a mermaid xychart-beta or pie block renders as a chart on web and mobile.
5. Header shows source count, seconds and credits when the report has them (web).
6. Full-screen toggle opens a dialog, Escape closes it and focus returns to the toggle.
7. A stopped, paused or failed report shows its banner.
8. Attachments: a tester finds none (documented gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should show the same count, duration and cost as web, since the brief's Should line names them for the header (brief S35.20 lists title, summary, body, sources; the cost line is from the task draft) [inferred].
- Reading mode should keep the report content identical and only change layout [inferred from ResearchReportView.tsx:327].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add source count, duration and cost to the mobile reader header.
- [proposed] Add attachment storage for data files and source documents through the files and artifacts system.
- [proposed] Show a visible contents list on shorter reports or a collapsed outline instead of hiding at fewer than 3 headings.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Web reader: header, banners, contents, body, citations, full-screen portal, follow-up |
| component | ResearchPanel / ReportTab | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Side panel with Sources, Report and Library tabs; ReportTab loads newest report of the conversation |
| service | citation-links | `apps/web/features/chat/lib/citation-links.ts` | linkifyCitations, citedSourceNumbers, citationRenderOutcome, citationAnchorId |
| service | markdown-headings | `packages/ui/unified-chat/src/lib/markdown-headings.ts` | extractMarkdownHeadings used by web and mobile contents |
| service | research-report helpers | `packages/ui/unified-chat/src/lib/research-report.ts` | researchReportToMarkdown, filename, follow-up prompt, artifact input |
| component | MarkdownContent / MermaidDiagram | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Shared markdown renderer for tables and mermaid charts on web |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Returns reports or one report by requestId |
| service | research-report-service | `apps/web/lib/services/research-report-service.ts` | Reads and writes public.research_reports, maps rows to the report contract |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Stores reports |
| service | synthesis directives | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Tells the model to cite [n], use tables and at most 3 mermaid charts |
| screen | ReportsScreen / ReportDetail | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile list and reader |
| service | mobile research service | `apps/mobile/src/features/research/service.ts` | Fetches and maps reports for mobile |
| service | reportSections | `apps/mobile/src/features/research/reportSections.ts` | Section list limited to 60 headings |
| component | MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Mobile markdown, citations and chart dispatch |
| component | ReportChart | `apps/mobile/src/features/chat/components/ReportChart.tsx` | SVG bar, line and pie charts |
| component | ResearchSourcesAppendix | `apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx` | Mobile sources list |
| config | FEATURES.research | `apps/mobile/lib/v1FeatureFlags.ts` | Mobile feature flag |
| component | Tauri ResearchReport | `apps/desktop/src/features/research/ResearchReport.tsx` | Separate retained internal desktop reader, local store |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the Report tab; the panel requests the newest report of the open conversation. | device | apps/web/features/chat/components/research/ResearchPanel.tsx:260-267 |
| Server checks rate limit and user, reads the report row for that user. | our servers | apps/web/app/api/research/reports/route.ts:26,45,56-63; apps/web/lib/services/research-report-service.ts:322-384 |
| Browser builds markdown, headings, linked citations, and renders body with the shared renderer; scrolling and the full-screen portal are local. | device | ResearchReportView.tsx:210-237,601 |
| Favicons load from a third-party favicon service for each source. | outside service | ResearchReportView.tsx:81 |
| Mobile fetches the same endpoint through its API client and maps rows, dropping rows without id and requestId. | device and our servers | apps/mobile/src/features/research/service.ts:100-145 (mapResearchReport, fetchResearchReports) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report: title, summary, content, citations, steps, key findings, status, sources count, duration, settled cost | table public.research_reports (apps/web/db/neon/0094_research_reports.sql) | Read by every app through the API; nothing cached locally was found | Retention and deletion rules for reports: unknown (no delete path found in the files read) |

**Models and providers.** The reader does not call a model. The report text and the model and provider names were stored when the run was made; the model that wrote it is whatever the run used (apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts:72-78).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on every app. Web and mobile read through user-scoped database access (apps/web/app/api/research/reports/route.ts:45). Mobile also needs Cloud mode (ReportsScreen.tsx:532). |
| Permissions | Rows are filtered by user id; the list excludes reports of temporary, deleted or other-organisation conversations (research-report-service.ts:354-360). No other permission found. |
| Subscription | Reading has no plan check in the route (route.ts:25-66 has only a rate limit). Creating a report is gated: Deep Research needs a plan with the deep_research capability (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1508-1518). |
| Limits and metering | Route uses rate-limit bucket 'chat-conversation' (route.ts:26). The settled credit cost of the run is shown in the header (ResearchReportView.tsx:345-348). Reading does not appear to consume credits [inferred]. |
| Feature flags | Mobile FEATURES.research. Web: none found in the reader. |
| Model compatibility | Research runs require a model that supports research (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2477-2483). The reader is model independent. |
| Provider restrictions | None in the reader. Favicons come from a Google favicon URL (ResearchReportView.tsx:81). |
| Local mode | Research and report storage are Cloud features. Mobile in Local or own-key mode shows 'Sign in to read your reports' and 'Research reports are saved to your Managed Cloud account.' (ReportsScreen.tsx:532,605-612). Local inference does not produce these reports. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Panel text 'Loading saved report…'; mobile skeletons. | ResearchPanel.tsx:283-287; ReportsScreen.tsx (Skeleton in list state) |
| Empty | 'No saved report yet' on web; 'No reports yet' on mobile. | ResearchPanel.tsx:295-303; ReportsScreen.tsx:645 |
| Error | Alert text 'Could not load reports'; mobile 'Try again' button. | ResearchPanel.tsx:288-293; ReportsScreen.tsx (error state) |
| Incomplete report | Banner with status and error, paused text points to the chat card. | ResearchReportView.tsx:503-510 |
| Citations without sources | Explains the run recorded no links. | ResearchReportView.tsx:618-642 |
| Non-URL citation | Shown raw with a globe icon. | ResearchReportView.tsx:74-85 |
| Accessibility | Contents is a nav with aria-label 'Report contents'; reader is a modal dialog with keyboard handling and focus return. | ResearchReportView.tsx:563-566,240-243,697-703 |
| Offline / timeout / retry | Web reader: no retry button for the Report tab (not handled in the code); mobile has 'Try again'. | ResearchPanel.tsx:288-293; ReportsScreen.tsx |
| Very long reports | Mobile caps sections at 60. | apps/mobile/src/features/research/reportSections.ts:5 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Title, findings, content, citation list, favicons, export, interrupted banner, uncaptured sources, inline marker links, follow-up
- `apps/web/features/chat/components/research/ResearchReportView.toc.test.tsx`: Contents list and reading mode
- `apps/web/features/chat/components/research/ResearchPanel.sourcesNumbering.test.tsx`: Source numbering in the panel
- `apps/web/features/chat/lib/citation-links.test.ts`: Citation linking rules
- `packages/ui/unified-chat/src/lib/markdown-headings.test.ts`: Heading extraction
- `packages/ui/unified-chat/src/lib/research-report.test.ts`: Report to markdown, filename, follow-up prompt
- `apps/mobile/src/features/research/__tests__/ReportsScreenReport.test.tsx`: Mobile report detail
- `apps/mobile/src/features/research/__tests__/ReportsScreenCitations.test.tsx`: Mobile citations
- `apps/mobile/src/features/research/__tests__/reportSections.test.ts`: Mobile sections

**Test scenarios**

- **Contents jump**
  1. Open a report with 3+ headings on web
  2. Click the 3rd entry under Contents
  - Expected: The matching heading scrolls to the top of the reader.
- **Citation link**
  1. Open a report with [1] and 2 sources
  2. Click [1]
  3. Type [5] text check
  - Expected: [1] jumps to source 1 and its link opens in a new tab; [5] stays plain text.
- **Chart render**
  1. Run research on a topic with comparable figures
  2. Open the report on web and mobile
  - Expected: Tables show as tables; a mermaid chart, if produced, shows as a chart. Not observed in any file; run to confirm.
- **Full screen**
  1. Press 'Read report full screen'
  2. Press Escape
  - Expected: Dialog opens with a narrow column, closes on Escape, focus returns to the toggle.
- **Mobile Local mode**
  1. Switch mobile app to Local mode
  2. Open Reports
  - Expected: 'Sign in to read your reports' message.
- **Attachments**
  1. Open any report
  - Expected: No attachment control exists.

**Where to look when it fails**

- Product event citation_rendered with outcome failed means a [n] had no source.
- HTTP 400 'Invalid research report query' or 'Invalid research report cursor', 404 'Research report not found' from route.ts.
- Table public.research_reports; check status and citations columns.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Supporting attachments are not built** Affects: All apps. Evidence: brief S35.24; no attachment code found. Work needed: Design storage, show list in reader, open and download.
- **Mobile header lacks source count, duration and cost** Affects: Mobile. Evidence: ReportsScreen.tsx:278-500 vs ResearchReportView.tsx:338-349. Work needed: Add a meta line in ReportDetail.
- **Brief says reading mode is a wider layout; code opens a full-screen dialog with a max-w-3xl column** Affects: Web, public Desktop. Evidence: ResearchReportView.tsx:327,694-709. Work needed: Correct the brief or product text; no code change needed.
- **Charts in PDF and Word exports not established** Affects: Web. Evidence: No chart handling found in export path read. Work needed: Check export of mermaid blocks and add rendering if absent.
- **No reader on CLI, VS Code, Chrome** Affects: Those apps. Evidence: docs/product/surface-feature-matrix.md. Work needed: Decide whether a link to the web report suffices.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:research_reports
- api:GET /api/research/reports
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F035-08
- F035-09

## Unknown

- Whether mermaid charts appear in PDF and Word exports.
- Retention and deletion of research_reports rows.
- Whether the public Desktop adds anything beyond the hosted web app for this reader (AGENTS.md says it shows the hosted app; Electron code not read).
- Exact mobile 'sections' threshold wording was read from a condition not shown with line number.
