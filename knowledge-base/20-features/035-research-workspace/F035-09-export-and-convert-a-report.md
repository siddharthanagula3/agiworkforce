---
id: "F035-09"
type: "feature"
title: "Export and convert a report"
aliases: ["Export report", "Download report", "Save to library", "Report to artifact", "Convert report", "Interactive page from report", "Slides conversion (S35.29)", "Audio overview (S35.30)", "Interactive page (S35.31)"]
area: "35 Research workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S35.28", "S35.29", "S35.30", "S35.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-voice-and-media", "F035-07", "mode:cloud"]
basis: "code inspection"
second_reader: "7 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F035-09 Export and convert a report

Gets a report out of the app. Web has Markdown, PDF and Word buttons, plus Artifact, Project and Library buttons. Mobile has Download, Share and Save to Library in its report menu. Interactive pages come from a chat request routed to Artifacts, not from the reader. Slides and audio overview are not built.

Area: [35. Research workspace](README.md). Requirement items: [S35.28](../../10-requirements/capabilities/035-research-workspace.md#s3528), [S35.29](../../10-requirements/capabilities/035-research-workspace.md#s3529), [S35.30](../../10-requirements/capabilities/035-research-workspace.md#s3530), [S35.31](../../10-requirements/capabilities/035-research-workspace.md#s3531).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Builds one markdown document from the report and hands it to the document export service (web) or the artifact export sheet (mobile), or saves it as an artifact, project source or library file.

**Why it exists.** Reports are work products people share, print and reuse outside the chat.

**Who uses it.** People who finished a Deep Research run.

**Problems it solves**

- Sharing a cited report as a normal file.
- Keeping a report beyond its conversation.
- Turning findings into a visual or interactive page.

**Use cases**

- Export as Word to send to a colleague.
- Save the report to a project so later chats can use it.
- Ask in chat for an interactive visualization of the findings.
- Share the report text from the phone.

## 2. User experience

**Where to find it**

- Web report header buttons 'Markdown', 'PDF', 'Word' (aria-label 'Export report as ...'), 'Artifact', 'Project' (when projects exist), 'Library' (ResearchReportView.tsx:133-137,366-434).
- Mobile: report 'More report actions' menu: 'Download', 'Share', 'Save to Library' (ReportsScreen.tsx:343-351).
- Interactive page: any chat composer on web, by wording (ChatComposerNew.tsx; WebChatPage.tsx:4435).
- CLI, VS Code, Chrome: not available.

**Before you start**

- A report with content. Mobile hides Download, Share and Save to Library when the report has no content (ReportsScreen.tsx:340-352).
- Mobile Save to Library needs a cloud account epoch (ReportsScreen.tsx:351). The button needs a captured cloud account epoch (libraryOwnerId), and the service rejects anything that is not a Cloud artifact ('Only Cloud artifacts can be saved to your Library') [apps/mobile/src/features/artifacts/libraryService.ts:10-12].
- Artifact button appears only where a host supplies it: the Report tab (ResearchPanel.tsx:308), not the Library detail.

**Screens and controls**

- Web export buttons disabled while one export runs.
- Mobile export sheet offers PDF, Markdown, Word and Plain text for research (apps/mobile/src/features/chat/utils/artifactExport.ts:61-97).
- Mobile Share sends the report as plain message text through Share.share, not as a file [apps/mobile/src/features/research/ReportsScreen.tsx:343-347].

**Journey**

1. Open a report.
2. Press Markdown, PDF or Word; the browser downloads the file named from the title.
3. Or press Artifact; the report opens as a document in the artifacts panel and the research panel closes.
4. Or press Project and pick a project; the report becomes one of its sources.
5. For an interactive page, type a request such as 'turn this into an interactive page' in chat.

**What the person sees and gets**

- Export failure shows a red alert with the error or 'Export failed' (ResearchReportView.tsx:272-275,465-472).
- Project save: 'Saved to <project>. It is one of that project's sources now.'
- Mobile: Alert 'Download failed' / 'Saved to Library' / 'Could not save to Library'.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web export: markdown with front matter (status, sources, generated), PDF and DOCX built in the browser from the markdown blocks (apps/web/features/chat/services/document-export-service.ts:12-60; ResearchReportView.tsx:259-280).
- Report to markdown includes title, summary, key findings, body, numbered Sources (packages/ui/unified-chat/src/lib/research-report.ts:13-36).
- Artifact hand-off in the Report tab (ResearchPanel.tsx:232-248).
- Save to project uses the project-knowledge upload (ResearchReportView.tsx:139-141,282-300).
- Mobile Download, Share, Save to Library are wired (ReportsScreen.tsx:343-351,499-504).
- Visual requests are classified to Artifacts by phrases. 'interactive page' and similar phrases (in both INTERACTIVE_SIGNALS and EXPLICIT_ARTIFACT_DESTINATION_SIGNALS) route to Artifacts directly. 'interactive visualization' is only in INTERACTIVE_SIGNALS, and WebChatPage calls routeVisualRequest only when classifyTaskLocally returns image_generation or explicitlyRequestsArtifact is true, so it routes only if the local task classifier first tags the prompt as image generation (apps/web/features/chat/lib/visual-intent.ts:104-122,175-177,210-230; WebChatPage.tsx:4421-4435).

**Incomplete**

- Interactive page is a chat request with no report attached by the reader; the composer does not carry the report text unless the person writes it (visual-intent.ts classifies only the prompt).
- The 'Artifact' button makes a markdown document artifact, not an interactive page (research-report.ts:70-76).
- Public Desktop shows the hosted web app, so it inherits the web buttons; the Tauri ResearchReport.tsx PDF export is separate retained internal code, not the public Desktop's path [apps/desktop/src/features/research/ResearchReport.tsx; AGENTS.md section 5].

**Present but disconnected or switched off**

- Web 'Library' button exists in ResearchReportView but no host passes onSaveToLibrary; grep found it only in ResearchReportView.tsx and tests, so the button never shows in the app (ResearchReportView.tsx:379; ResearchPanel.tsx:306-311).
- Briefs says mobile export missing; the code has it (ReportsScreen.tsx:343-351). Code wins by source rank.

**Not available**

- Slides from a report: not built (brief S35.29). Slide-related helpers exist in packages/ui/unified-chat/src/lib (deck-model.ts, presentation-slides.ts) but nothing connects them to a report; connection status beyond file names unknown.
- Audio overview: not built (brief S35.30).
- Export on CLI, VS Code, Chrome: not available.

## 4. Required behaviour

**Established requirements**

- The user can export a research report (PDF, Word, Markdown). (source: brief S35.28)
- Convert report to slides: not built. (source: brief S35.29)
- Convert report to audio overview: not built. (source: brief S35.30)
- Convert report to interactive page: visual requests recognised by phrases and routed to Artifacts. (source: brief S35.31)
- Export runs in the browser through the shared document export service; failure shows text, not silence. (source: ResearchReportView.tsx:273-275)

**Acceptance criteria**

1. Markdown export downloads a .md file with front matter and numbered Sources.
2. PDF and Word exports download files named from the title.
3. A failing export shows 'Export failed' or the error text in an alert.
4. Artifact button creates a document artifact and closes the research panel.
5. Project menu lists the user's projects and saves one markdown file.
6. Mobile Download offers formats and shares the file.
7. Typing 'interactive page' routes to Artifacts, not image generation. 'interactive visualization of this' is not guaranteed to route: it routes only if the local task classifier first tags the prompt as image generation (visual-intent.ts:104-122,175-177; WebChatPage.tsx:4421-4435).
8. Slides and audio controls do not exist.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Library button was meant to appear in the Report tab; the hosting code does not supply it [inferred].
- Interactive page conversion should carry the report text; today it does not [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass an onSaveToLibrary from the web app or remove the dead button.
- [proposed] Add a reader button 'Interactive page' that sends the report with the visual request.
- [proposed] Slides and audio overview built on the existing slide model and voice system.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ResearchReportView export controls | `apps/web/features/chat/components/research/ResearchReportView.tsx` | Export, artifact, project, library buttons and error display |
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | Markdown, PDF, DOCX download |
| service | researchReportToMarkdown | `packages/ui/unified-chat/src/lib/research-report.ts` | Single markdown document from a report |
| service | markdownDocument | `packages/ui/unified-chat/src/components/markdown/markdownDocument.ts` | Turns markdown into document blocks (imported by the export service as '@agiworkforce/unified-chat/markdown-document'; package export in packages/ui/unified-chat/package.json:20) |
| store | useArtifactsStore | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Receives the report as a document artifact |
| service | uploadProjectKnowledgeFile | `apps/web/features/projects/services/project-knowledge-upload.ts` | Saves report into a project |
| service | visual-intent | `apps/web/features/chat/lib/visual-intent.ts` | Phrase lists and artifact vs image decision |
| service | structuredVisualArtifact | `apps/web/features/chat/components/artifacts/structuredVisualArtifact.ts` | routeVisualRequest to Artifacts |
| component | ChatComposerNew routing | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Calls routeVisualRequest at send |
| screen | WebChatPage routing | `apps/web/features/chat/pages/WebChatPage.tsx` | Calls routeVisualRequest at send |
| component | ArtifactExportSheet | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | Mobile export format sheet |
| service | artifactExport | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Format options and file creation |
| screen | ReportsScreen actions | `apps/mobile/src/features/research/ReportsScreen.tsx` | Download, Share, Save to Library |
| service | saveArtifactToLibrary | `apps/mobile/src/features/artifacts/libraryService.ts` | Mobile library save |
| component | Tauri ResearchReport PDF export | `apps/desktop/src/features/research/ResearchReport.tsx` | Separate internal PDF export and copy |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Report converted to markdown in the browser; PDF or DOCX built in the browser and downloaded. | device | ResearchReportView.tsx:210,259-271; document-export-service.ts:30-60 |
| Save to project uploads the markdown file to the project knowledge store. | our servers | ResearchReportView.tsx:139-141 (uploadProjectKnowledgeFile) |
| Artifact hand-off stays in the browser store. | device | ResearchPanel.tsx:232-247 |
| Interactive page request: classifier decides artifact vs image locally, then the turn goes to the model for generation. | device and our servers | visual-intent.ts:210-230; WebChatPage.tsx:4435 |
| Mobile Download builds the file on the device and opens the share sheet; Mobile Share sends the report as plain message text through Share.share, not a file, also on the device. Save to Library posts the file to the cloud Library API (api.post(LIBRARY_PATH, file)), so it runs on our servers. | device and our servers | ArtifactExportSheet.tsx:51-56; ReportsScreen.tsx:343-351; apps/mobile/src/features/artifacts/libraryService.ts:19 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file | User's device downloads or share target | No | Owned by the user |
| Report saved to a project | Project knowledge files | Project storage; details in SYS-files-artifacts-and-storage | Project rules; unknown here |
| Artifact copy | Browser artifact store | Unknown | Unknown |

**Models and providers.** Export uses no model. Interactive page generation uses the model chosen for the chat turn; the router itself is provider-neutral.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on web; mobile Library save needs a cloud account and only Cloud artifacts can be saved (libraryService.ts:10-12). |
| Permissions | Project save uses the project's own permissions (not read). |
| Subscription | No plan check found in export code. Interactive page generation is an ordinary chat turn metered normally. |
| Limits and metering | None found for export. Chat turn metering for interactive pages not examined: unknown. |
| Feature flags | Mobile FEATURES.research for the screen. |
| Model compatibility | Not applicable for export. |
| Provider restrictions | None found for export. |
| Local mode | Export of an already-loaded report works on the device. Reports exist only in Cloud, so Local mode on mobile cannot reach the screen (ReportsScreen.tsx:532). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Export running | All export buttons disabled until done | ResearchReportView.tsx:426 |
| Export error | role=alert text | ResearchReportView.tsx:465-472 |
| Save to project error | Alert 'That report could not be saved to the project' | ResearchReportView.tsx:294 |
| No projects | Project button not shown | ResearchReportView.tsx:393 |
| Mobile empty content | Download and Share hidden | ReportsScreen.tsx:340-352 |
| Mobile export failure | Alert 'Download failed' | ArtifactExportSheet.tsx:58 |
| Mobile Save to Library with a non-Cloud artifact | Service rejects with 'Only Cloud artifacts can be saved to your Library' | apps/mobile/src/features/artifacts/libraryService.ts:10-12 |
| Charts in exports | unknown | not established |
| Offline | Web export is local and works; project save fails with message | ResearchReportView.tsx:272-275,293-295 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/research/ResearchReportView.test.tsx`: Export call with assembled markdown, formats, failure alert
- `apps/web/features/chat/components/research/ResearchReportView.projectSave.test.tsx`: Save to project
- `apps/web/features/chat/components/research/ResearchPanel.artifact.test.tsx`: Artifact hand-off
- `apps/web/features/chat/__tests__/visual-intent-router.test.ts`: Artifact vs image routing
- `packages/ui/unified-chat/src/lib/research-report.test.ts`: Markdown, artifact input, filename
- `apps/mobile/src/features/chat/components/__tests__/ArtifactExportSheet.test.tsx`: Mobile export sheet
- `apps/mobile/src/features/research/__tests__/ReportsScreenActions.test.tsx`: Mobile report actions

**Test scenarios**

- **Export all formats**
  1. Open a report
  2. Press Markdown, PDF, Word
  - Expected: Three files download; open each and check title, text, sources.
- **Export failure**
  1. Force the export service to throw (test)
  - Expected: Alert shows 'Export failed' or the error.
- **Charts in files**
  1. Export a report containing a mermaid block as PDF
  - Expected: Unknown; record what appears.
- **Interactive request**
  1. Type 'make an interactive page of these findings' in chat
  2. Then try 'make an interactive visualization of these findings'
  - Expected: The 'interactive page' wording routes to Artifacts, not image generation. The 'interactive visualization' wording routes only if the local task classifier tags it as image generation; record what happens.
- **Library button**
  1. Open Report tab
  - Expected: No 'Library' button (disconnected).
- **Mobile menu**
  1. Open a report on mobile
  2. Open More report actions
  - Expected: Download, Share, Save to Library, Report this research report.

**Where to look when it fails**

- Alert text in the report view.
- Mobile Alert titles 'Download failed' and 'Could not save to Library'.
- Artifact store in browser devtools.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/035-research-workspace.md](../../70-qa/test-plans/web/035-research-workspace.md)
- Desktop: [70-qa/test-plans/desktop/035-research-workspace.md](../../70-qa/test-plans/desktop/035-research-workspace.md)
- Mobile: [70-qa/test-plans/mobile/035-research-workspace.md](../../70-qa/test-plans/mobile/035-research-workspace.md)

## 10. Gaps and dependencies

- **Library button is never shown on web** Affects: Web. Evidence: No caller passes onSaveToLibrary (ResearchPanel.tsx:306-311; ResearchReportsGallery.tsx:176). Work needed: Wire it to the library write path or delete the dead control.
- **Brief says mobile export missing but code has it** Affects: Brief accuracy. Evidence: ReportsScreen.tsx:343-351. Work needed: Update brief status after a device check.
- **Interactive page is not a reader action and does not carry the report** Affects: Web, public Desktop. Evidence: visual-intent.ts classifies prompt only. Work needed: Add reader action that sends report plus request.
- **Slides and audio overview not built** Affects: All apps. Evidence: briefs S35.29, S35.30. Work needed: Product decision, then build.
- **Charts in PDF/Word unverified** Affects: Web. Evidence: Not found in export path. Work needed: Test and implement.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-voice-and-media
- F035-07
- mode:cloud

## Unknown

- Whether PDF and Word exports render mermaid charts.
- Whether the slide helpers in unified-chat are connected to anything.
- Where the artifact copy is persisted.
- Whether interactive page generation is plan-gated.
- Web export file naming collisions: not examined.

## Second reader's check

A second reader checked 10 statements of this page against the code: 7 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Visual requests are classified to Artifacts by phrases like 'interactive visualization' and 'interactive page' (visual-intent.ts:104-122,210-230)" The code shows: 'interactive page' is in both INTERACTIVE_SIGNALS and EXPLICIT_ARTIFACT_DESTINATION_SIGNALS. 'interactive visualization' is only in the first list. WebChatPage only calls routeVisualRequest when classifyTaskLocally returns image_generation or explicitlyRequestsArtifact is true, so 'interactive visualization' alone is not guaranteed to route. The page does not mention this gate. (visual-intent.ts:104-122,175-177; WebChatPage.tsx:4421-4435). **Corrected:** 'interactive page' and similar phrases route to Artifacts directly. 'interactive visualization' routes only if the local task classifier first tags the prompt as image generation. Acceptance criterion 7 is not guaranteed.
- **Wrong (section 5):** "markdown-document service at packages/ui/unified-chat/src/lib/markdown-document.ts (not found)" The code shows: The file does not exist. The export service imports '@agiworkforce/unified-chat/markdown-document'. The package export maps that to src/components/markdown/markdownDocument.ts. (packages/ui/unified-chat/package.json:20; document-export-service.ts:2). **Corrected:** Path is packages/ui/unified-chat/src/components/markdown/markdownDocument.ts.
- **Partly wrong (section 6):** "Mobile builds the file on the device and opens the share sheet; Save to Library writes through the library service. Row is marked 'device'." The code shows: Download builds the file and shares it on the device (ArtifactExportSheet.tsx:51-56). Save to Library calls api.post(LIBRARY_PATH, file), which is a server call to the cloud Library. Share sends the markdown via Share.share. (apps/mobile/src/features/artifacts/libraryService.ts:19; ArtifactExportSheet.tsx:51-56). **Corrected:** Mobile Download and Share run on the device. Save to Library posts to the cloud Library API, so it runs on our servers.

**Facts the page missed**

- The mobile Share action sends the report as plain message text through Share.share, not as a file (apps/mobile/src/features/research/ReportsScreen.tsx:343-347). The page's section 6 groups it with file building.
- The mobile Library button needs a captured cloud account epoch (libraryOwnerId), and the service rejects anything that is not a Cloud artifact ('Only Cloud artifacts can be saved to your Library', apps/mobile/src/features/artifacts/libraryService.ts:10-12). The page does not mention this rule.
- The 'Desktop partial' status is not explained. The public Desktop shows the hosted web app, so it inherits the web buttons. The page does not say which desktop code, if any, the Tauri ResearchReport.tsx PDF export row refers to.
