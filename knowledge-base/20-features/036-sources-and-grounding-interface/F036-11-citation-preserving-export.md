---
id: "F036-11"
type: "feature"
title: "Citation-preserving export"
aliases: ["Citation-preserving export (S36.25)", "Export report", "Download report", "Share report", "research-report-export-markdown/pdf/docx"]
area: "36 Sources and grounding interface"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/research/reports", "table:research_reports", "file:packages/ui/unified-chat/src/lib/research-report.ts", "file:apps/web/features/chat/services/document-export-service.ts", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-11 Citation-preserving export

Exports a Deep Research report with its inline [n] markers and a numbered Sources list. Web (and Desktop, which shows the web app) offers Markdown, PDF and Word buttons. Mobile has Download and Share with the same markdown, though the brief calls Mobile export missing. CLI, VS Code and Chrome have none.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.25](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3625).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Builds one markdown document from the report (title, summary, key findings, body, and a '## Sources' list of 'n. [title](url)') and saves or shares it (packages/ui/unified-chat/src/lib/research-report.ts:13-38). Web turns it into a .md, .pdf or .docx file in the browser (apps/web/features/chat/services/document-export-service.ts:68-87).

**Why it exists.** The brief: exporting keeps citations and the source list (S36.25). The product contract: export and reopen the report with sources intact (doc: docs/product/experience-contract.md:781 W08).

**Who uses it.** Researchers and professionals who share reports outside the product.

**Problems it solves**

- A report copied out without its sources cannot be checked.
- Silent export failure.

**Use cases**

- Download a PDF with clickable source links.
- Share markdown to another app from Mobile.
- Save the report into the Library or a project.

## 2. User experience

**Where to find it**

- Web: report header buttons 'Markdown', 'PDF', 'Word' (aria-labels 'Export report as Markdown' etc.) (apps/web/features/chat/components/research/ResearchReportView.tsx:133-136,420-434).
- Desktop (Electron): same, via the hosted web app (doc: AGENTS.md section 5). The retained Tauri build has an 'Export PDF' button that writes a plain text report with no source list (apps/desktop/src/features/research/ResearchReport.tsx:53-66,114-118,189-203).
- Mobile: report screen More menu: 'Download' (export sheet), 'Share', 'Save to Library' (apps/mobile/src/features/research/ReportsScreen.tsx:340-352; test ReportsScreenActions.test.tsx:126-135). The brief lists Mobile export as missing; the code and test show these actions exist, so the brief appears out of date.
- CLI, VS Code, Chrome: not available (brief).

**Before you start**

- A report with content. Mobile hides Download and Share when the content is empty (ReportsScreen.tsx:341).
- Mobile report list needs Cloud mode and sign-in (ReportsScreen.tsx:532).
- Web 'Save to library' only when the host supplies it.

**Screens and controls**

- Web: three download buttons, disabled while one export runs (ResearchReportView.tsx:426).
- Web: error line with role alert.
- Mobile: ArtifactExportSheet and the system share sheet.

**Journey**

1. Open a finished report.
2. Click Markdown, PDF or Word (Web) or open More then Download or Share (Mobile).
3. The file downloads or the share sheet opens.
4. Open the file and check the markers and the Sources list.

**What the person sees and gets**

- Web failure: red alert with the error text or 'Export failed' (ResearchReportView.tsx:274,465-471; test line 115-122).
- Web file name from the report title, up to 80 characters (research-report.ts:79-87).
- Markdown export has a front-matter header with status, source count and generated date (ResearchReportView.tsx:264-271; document-export-service.ts:13-27).
- Mobile 'Saved to Library' alert on success and 'Could not save to Library' on failure (ReportsScreen.tsx:322-335).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: three formats call the shared export service with the assembled markdown (ResearchReportView.tsx:259-278; test ResearchReportView.test.tsx:86-107).
- Export keeps inline markers because content is included unchanged, and appends a numbered Sources list only when citations exist (research-report.ts:25-37).
- PDF and Word keep links (apps/web/features/chat/services/export-pdf.ts:804-816; export-docx.ts:158-165).
- Failure is shown, not swallowed (ResearchReportView.tsx:273-275).
- Mobile: Download, Share and Save to Library use the same researchReportToMarkdown (ReportsScreen.tsx:281,340-352).
- Chat answers: trailing duplicate source lists are removed from the body only when the tail is just a source list (packages/ui/unified-chat/src/lib/report-sources.ts:37-60,162-176; used at apps/web/features/chat/components/messages/MessageBubble.tsx:2078 and apps/mobile/src/features/chat/components/MessageBubble.tsx:1993).

**Incomplete**

- Export of a report with no captured citations carries the [n] markers but no Sources list and no uncaptured note (research-report.ts:25-37).
- Mobile drops URL-less citations before export (apps/mobile/src/features/research/service.ts:47).
- Tauri desktop export (buildPlainText) has no citation list (ResearchReport.tsx:189-203).
- Export of a normal chat answer (not a report): not examined; report-sources.ts strips lists for display only, and no export of chat answers was traced: unknown.

**Present but disconnected or switched off**

- Tauri build is retained internal code, not the public Desktop (doc: AGENTS.md section 5).

**Not available**

- Export on CLI, VS Code, Chrome (brief: missing).

## 4. Required behaviour

**Established requirements**

- Exporting an answer or report keeps its citations and source list. (source: S36.25 (brief))
- Export and reopen the report with sources intact. (source: doc: docs/product/experience-contract.md:781 (W08))
- The trailing source list is removed from the display body only when the block really is just a list of sources. (source: packages/ui/unified-chat/src/lib/report-sources.ts:9-16 (code comment, brief draft))
- A failed export shows an error. (source: apps/web/features/chat/components/research/ResearchReportView.tsx:273)

**Acceptance criteria**

1. Markdown export contains the body with [n] markers and a '## Sources' list numbered to match.
2. PDF and Word exports contain clickable source links.
3. A forced export failure shows an alert with the message.
4. A body whose last section is titled Sources but carries prose is not stripped.
5. Mobile Share sends the same markdown as Download.
6. A report with an empty citation list exports without a Sources section (current behaviour; decide if a note is required).
7. Export buttons are disabled while an export runs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Export of a report with uncaptured sources should say so, to match the on-screen notice. [inferred from F036-07]
- Mobile export should be recorded as built in the brief. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add retrieval date and publisher to each exported source line.
- [proposed] Update brief S36.25 for Mobile after a device check.
- [proposed] Add citation list to the Tauri export or retire it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Web export buttons, handleExport, export error alert |
| service | researchReportToMarkdown | `packages/ui/unified-chat/src/lib/research-report.ts` | Builds the document with inline markers and numbered Sources list |
| service | researchReportFilename | `packages/ui/unified-chat/src/lib/research-report.ts` | Safe file name from the title |
| service | documentExportService | `apps/web/features/chat/services/document-export-service.ts` | Produces .md, .pdf, .docx in the browser |
| service | export-pdf | `apps/web/features/chat/services/export-pdf.ts` | PDF renderer with link annotations |
| service | export-docx | `apps/web/features/chat/services/export-docx.ts` | Word builder with hyperlinks |
| service | report-sources | `packages/ui/unified-chat/src/lib/report-sources.ts` | Strips trailing source lists and reconciles markers for display |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Applies report-sources helpers to chat answers (lines 2075-2082) |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Applies the same helpers (lines 1990-1996) |
| screen | ReportsScreen | `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile Download, Share, Save to Library |
| component | ArtifactExportSheet | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | Mobile export sheet (path inferred from import at ReportsScreen.tsx:42; file not opened) |
| service | research service mapper | `apps/mobile/src/features/research/service.ts` | Maps citations; drops URL-less ones |
| endpoint | GET /api/research/reports | `apps/web/app/api/research/reports/route.ts` | Source of the saved report |
| table | research_reports | `apps/web/db/neon/0094_research_reports.sql` | Stores content and citations |
| component | ResearchReport (Tauri) | `apps/desktop/src/features/research/ResearchReport.tsx` | Retained Tauri Export PDF without source list |
| test | ResearchReportView.test.tsx | `apps/web/features/chat/components/research/ResearchReportView.test.tsx` | Export call, formats, failure alert |
| test | research-report.test.ts | `packages/ui/unified-chat/src/lib/research-report.test.ts` | Markdown assembly and file names |
| test | report-sources.test.ts | `packages/ui/unified-chat/src/lib/report-sources.test.ts` | Source-list stripping and marker reconciliation |
| test | ReportsScreenActions.test.tsx | `apps/mobile/src/features/research/__tests__/ReportsScreenActions.test.tsx` | Mobile Download and Share content |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Report row is loaded from the server with content and citations. | our servers | apps/web/app/api/research/reports/route.ts:19-60; 0094_research_reports.sql:28-45 |
| The device builds the markdown with researchReportToMarkdown. | device | ResearchReportView.tsx:210; research-report.ts:13-38 |
| On click, exportDocument creates a file in the browser (Blob, PDF or Word) and downloads it. No server call. | device | document-export-service.ts:68-87; ResearchReportView.tsx:259-278 (comment: export runs in the browser) |
| On Mobile, the markdown goes to the export sheet or the system share sheet. | device | ReportsScreen.tsx:340-348,502-506 |
| Mobile Save to Library saves the report as a cloud-owned library item. | device and our servers | ReportsScreen.tsx:322-335 (provenance scope 'cloud'); service internals not read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file (.md, .pdf, .docx) | The person's downloads or chosen app | No | Outside the product's control |
| Markdown front matter (status, source count, generated time) | Inside the .md file | No | With the file |

**Models and providers.** No model is called during export. The report text was produced earlier by the Cloud research run.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading a report needs sign-in; export itself runs on the device (route.ts:46; document-export-service.ts). |
| Permissions | Browser download permission; Mobile share sheet. |
| Subscription | none found in the code for exporting an existing report. |
| Limits and metering | none found in the code for export. Follow-up grounding is cut at 8000 characters, but that is a different action (research-report.ts:42). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Export builds the file on the device, but reports come from the Cloud server, so the Mobile report list is not loaded in Local mode (ReportsScreen.tsx:532). A Local-mode answer export: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Export in progress (Web) | All three buttons disabled | ResearchReportView.tsx:426 |
| Export error (Web) | Alert text with the error message or 'Export failed' | ResearchReportView.tsx:274,465-471 |
| No citations | No Sources section in the export | research-report.ts:25 |
| Source list that carries prose (display) | Kept, not stripped | report-sources.ts:9-16; report-sources.test.ts:45 |
| Mobile empty content | Download and Share hidden | ReportsScreen.tsx:341 |
| Mobile save to Library error | Alert 'Could not save to Library' | ReportsScreen.tsx:333 |
| Cancel, timeout, offline during export | not handled in the code beyond the error alert; no cancel control for exports | handleExport has no abort logic |
| Accessibility | Buttons carry aria-labels such as 'Export report as PDF' | ResearchReportView.tsx:429 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Markdown export call arguments, PDF format option, export failure alert
- `packages/ui/unified-chat/src/lib/research-report.test.ts`: Markdown assembly with sources, omission of empty sections, file names, follow-up grounding
- `packages/ui/unified-chat/src/lib/report-sources.test.ts`: Trailing source list stripping and marker reconciliation
- `apps/mobile/src/features/research/__tests__/ReportsScreenActions.test.tsx`: Mobile menu lists Download and Share; content equals the report markdown
- `apps/mobile/__tests__/sharedChatEntries.test.ts`: Mobile use of stripTrailingSourceList
- `apps/web/features/chat/components/research/ResearchReportView.projectSave.test.tsx`: Saving the report markdown into a project

**Test scenarios**

- **Markdown export keeps sources**
  1. Open a report with two citations on Web.
  2. Click Markdown.
  3. Open the file.
  - Expected: Body has [1] and [2]; '## Sources' lists 1 and 2 with links.
- **PDF links**
  1. Click PDF.
  2. Click a source in the PDF.
  - Expected: Opens the source URL.
- **Export failure**
  1. Make the download fail (for example block downloads or inject a failing service).
  2. Click Markdown.
  - Expected: Red alert with the message.
- **Sources title with prose**
  1. Send a chat answer whose last section is 'Sources' with a sentence of prose.
  - Expected: The section stays in the displayed answer.
- **Mobile share**
  1. Open a report in Cloud mode.
  2. More, then Share.
  - Expected: Share sheet carries title and full markdown including Sources.
- **Report without captured links**
  1. Export a report with empty citations.
  - Expected: Markers remain, no Sources list (compare with the on-screen notice).

**Where to look when it fails**

- Web alert text from toUserMessage.
- Mobile alert 'Could not save to Library'.
- Analytics citation_rendered failed outcome for broken markers.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/036-sources-and-grounding-interface.md](../../70-qa/test-plans/web/036-sources-and-grounding-interface.md)
- Desktop: [70-qa/test-plans/desktop/036-sources-and-grounding-interface.md](../../70-qa/test-plans/desktop/036-sources-and-grounding-interface.md)
- Mobile: [70-qa/test-plans/mobile/036-sources-and-grounding-interface.md](../../70-qa/test-plans/mobile/036-sources-and-grounding-interface.md)

## 10. Gaps and dependencies

- **Brief says Mobile export is missing, code shows Download, Share and Save to Library** Affects: Mobile (documentation). Evidence: ReportsScreen.tsx:340-352; ReportsScreenActions.test.tsx:126-135. Work needed: Verify on a device, then correct the brief.
- **Export of an uncaptured-source report has no note** Affects: Web, Desktop, Mobile. Evidence: research-report.ts:25-37. Work needed: Add a one-line note to the exported document.
- **Tauri export has no citations** Affects: Retained Tauri desktop. Evidence: ResearchReport.tsx:189-203. Work needed: Decide to fix or retire.
- **No export on CLI, VS Code, Chrome** Affects: CLI, VS Code, Chrome. Evidence: Brief S36.25 missing. Work needed: Not examined: unknown.
- **Export of ordinary chat answers with citations not traced** Affects: All apps. Evidence: Only report export read. Work needed: Trace message export paths.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/research/reports
- table:research_reports
- file:packages/ui/unified-chat/src/lib/research-report.ts
- file:apps/web/features/chat/services/document-export-service.ts
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts

## Unknown

- Whether chat answers (not reports) can be exported with citations.
- Internals of ArtifactExportSheet and saveArtifactToLibrary.
- How the Electron desktop handles a browser-style file download.
- Whether any test has been run: no result file recorded.
- Retention of exported files and Library items.
