---
id: "GAPS-AREA-027"
type: "gap-list"
title: "Gaps: Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 27. Document and writing editor

99 open gaps that touch this area. Area page: [20-features/027-document-and-writing-editor](../../20-features/027-document-and-writing-editor/README.md).

## CMP-M54

**Start an artifact from a template gallery**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: No templates; artifacts exist only once the assistant makes them.
- Evidence: apps/mobile/src/features/artifacts/index.tsx

## CMP-MP41

**Living documents (Docs) drafted in front of you with comments**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: No in-place editing or comments Document artifacts open in a viewer and export to Word or PDF; no in-place editing or comments.
- Evidence: apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx:48; services/fileCreation.ts:73

## CMP-W112

**Save generated files to Google Drive or OneDrive**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: Same feature as the row above but marked Same. The Save to Google Docs, Drive and OneDrive entries are added to the artifact menu only when connectorsReleased() is true (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2440,2451); the release state is 'coming_soon' (packages/contracts
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511,2443

## CMP-W115

**Collapse sections, rename tabs and navigate a document by outline**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md), [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md), [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md), [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md), [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md), [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: The document editor has a formatting toolbar only; no section collapse, document tabs or drag handles.
- Evidence: apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx

## CMP-W116

**Admin enables each artifact template (Slides, Design, Data, Docs)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Artifact types cannot be switched on or off per workspace.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:38-52 (only artifact_connectors)

## CMP-W123

**Live co-editing of a Google Doc, Sheet or Slides file beside the chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: A document can be saved to Google Docs or Drive, but the Google file does not open in a pane for co-editing.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1480-1505 (export only)

## CMP-W133

**Slash menu in a page to generate text, a visualization or an image inline**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md), [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md), [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md), [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md), [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md), [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: The document editor has no slash insert menu; the assistant is used from the chat or the selection toolbar.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx; searched: slash in document-editor-markdown.ts

## CMP-WP101

**Comment @Claude in a document to get an edit**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: The comment itself is not a mention that triggers an edit Comments on a passage can be sent to the assistant with Ask AI to apply; the comment itself is not a mention that triggers an edit.
- Evidence: apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx:204-211,277-283; comment-request.ts:20

## CMP-WP104

**Design export to zip, PDF, PowerPoint or standalone HTML, with handoff to code**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: No zip, PowerPoint or handoff to a coding session A design downloads as HTML, PDF or source; no zip, PowerPoint or handoff to a coding session.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2380-2402

## CMP-WP105

**Designs: edit an HTML design with AI on the selected part, brief dialog, replace images**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: There is no Design destination or free on-canvas drag editing HTML designs get a Design brief dialog, Edit with AI on a selection and image replacement; there is no Design destination or free on-canvas drag editing.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:23; apps/web/features/chat/components/artifacts/design/design-brief.ts:2

## CMP-WP106

**Export a deck to PowerPoint, PDF or Google Slides**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md), [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md), [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md), [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: A .pptx comes only when the assistant creates a file A deck downloads as PDF, HTML or Markdown; a .pptx comes only when the assistant creates a file; no Google Slides export.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2390; apps/web/lib/tool-copy.ts:92

## CMP-WP108

**Pages with comments**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Only the owner can comment, not viewers Artifacts have anchored, resolvable comment threads where the assistant replies; only the owner can comment, not viewers.
- Evidence: apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx:19; apps/web/lib/services/artifact-comment-service.ts:42

## CMP-WP113

**Turn an existing chat or notes into a page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md), [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md), [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md), [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md), [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md), [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: Not a whole chat or notes with files and links An answer can be saved as a document, but not a whole chat or notes with files and links.
- Evidence: apps/web/features/chat/components/artifacts/SaveAnswerAsDocument.tsx; save-answer-as-document.ts

## CMP-WP94

**Table cell actions: merge cells, sort a column, table width**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md), [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md), [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md), [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md), [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md), [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: The toolbar offers no merge, sort or width controls Tables can be inserted, but the toolbar offers no merge, sort or width controls.
- Evidence: apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx:102,214-217

## GAP-AREA027-LW10

**A table with more cells in a row than in its header is shown as read-only source, not as an editable table.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-027
- Detail: Area 27. Document and writing editor
- Evidence: packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:17-45

## GAP-AREA027-LW15

**The VS Code selection action set (Refactor, Explain, Generate Tests) applies to code selections, not to document text.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-027
- Detail: Area 27. Document and writing editor
- Evidence: apps/extension-vscode/src/providers/codeActionProvider.ts:42-60

## GAP-CAP-artifacts-and-documents-04

**Selection-based edit requests and edit-in-place: Reach on Desktop, Mobile, VS Code and Chrome unknown. Spreadsheet range questions and per-slide edits not found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Requirement items: S26.17, S26.19, S27.15, S27.16, S30.20, S96.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-05

**Comments and @mention edits on documents: Reach of @mention edits, and non-web apps, not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Requirement items: S26.18, S27.25, S96.05
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-06

**Living documents (rich-text Docs and Pages): Mobile read-only; no slash menu, section collapse, table merge/sort, placeholders for unwritten sections.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md), [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md), [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md), [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md), [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md), [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Requirement items: S27.02, S27.03, S27.06, S27.07, S27.08, S27.12, S27.13, S27.14, S27.27, S27.28, S27.30, S27.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-07

**Export documents and decks to Word, PDF, Markdown, PowerPoint: Export fidelity: seen duplicated title and a page footer without a number in a Word file; export to Google formats gated while connectors are unreleased. Two near-identical download entries.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Requirement items: S27.35, S27.36, S27.37, S29.34, S29.35, S29.36, S30.28, S30.29, S96.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-20

**Save to or co-edit with Google Docs, Sheets and Slides: Hidden by the connector release switch; no live pane.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Requirement items: S27.38
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-22

**Templates, saved brand style and design systems for documents and decks: No admin per-template switch; Mobile has no template gallery.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Requirement items: S27.32, S27.33, S30.32, S96.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F027-01-01

**No rename on mobile, CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-01](../../20-features/027-document-and-writing-editor/F027-01-document-title.md)
- Detail: Affects: Mobile, CLI, VS Code and Chrome users. Work needed: Decide whether rename is required on each app; if so add a control that calls the shared normalizer.
- Evidence: No rename code found in the files read for these apps.

## GAP-F027-01-02

**Fallback wording differs by app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-01](../../20-features/027-document-and-writing-editor/F027-01-document-title.md)
- Detail: Affects: All apps. Work needed: Choose one fallback rule and share it.
- Evidence: ArtifactLabels.tsx:16; artifacts.rs:76; artifactPresentation.ts:79

## GAP-F027-01-03

**Desktop and Chrome behaviour not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-01](../../20-features/027-document-and-writing-editor/F027-01-document-title.md)
- Detail: Affects: Desktop, Chrome. Work needed: Run the app and record what the title shows.
- Evidence: No desktop artifact code in apps/desktop; brief marks Chrome unverified.

## GAP-F027-01-PARTLY

**Document title: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-01](../../20-features/027-document-and-writing-editor/F027-01-document-title.md)
- Requirement items: S27.01

## GAP-F027-02-01

**Headings 5 and 6 are not listed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Detail: Affects: Web and mobile. Work needed: Raise the limit if wanted.
- Evidence: markdown-headings.ts:17

## GAP-F027-02-02

**No web outline test found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Detail: Affects: Web. Work needed: Add a web test.
- Evidence: No match for the outline test id in apps/web test files.

## GAP-F027-02-03

**Chrome has no outline.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Detail: Affects: Chrome. Work needed: Decide if required; implement using the shared extractor.
- Evidence: No code in artifactPanel.ts

## GAP-F027-02-04

**Brief status for mobile says missing but code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: Brief S27.12 vs ArtifactDocumentOutline.tsx

## GAP-F027-02-NOTBUILT

**Outline of headings: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Requirement items: S27.12
- Detail: Chrome: S27.12

## GAP-F027-02-PARTLY

**Outline of headings: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-02](../../20-features/027-document-and-writing-editor/F027-02-outline-of-headings.md)
- Requirement items: S27.12

## GAP-F027-03-01

**No find and replace.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Detail: Affects: Web, Desktop, mobile, Chrome. Work needed: Design and build search and replace in the editor and source view.
- Evidence: No code found; brief S27.13

## GAP-F027-03-02

**No word or character count.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Detail: Affects: All apps. Work needed: Add a count.
- Evidence: No code found; brief S27.14

## GAP-F027-03-03

**No visual editor on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Detail: Affects: Mobile. Work needed: Decide whether to build one.
- Evidence: Plain TextInput at ArtifactFullScreen.tsx:2016

## GAP-F027-03-04

**Brief S27.02 status is out of date for web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: ArtifactDocumentEditor.tsx exists

## GAP-F027-03-NOTBUILT

**Rich text editing, find and word count: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F027-03](../../20-features/027-document-and-writing-editor/F027-03-rich-text-editing-find-and-word-count.md)
- Requirement items: S27.02, S27.13, S27.14
- Detail: Mobile: S27.02, S27.13, S27.14; Chrome: S27.02, S27.13, S27.14

## GAP-F027-04-01

**No underline, alignment, spacing, indentation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Detail: Affects: Web and Desktop. Work needed: Decide scope; Markdown cannot store most of these, so a storage format decision is needed.
- Evidence: document-editor-markdown.ts:11; no controls in toolbar

## GAP-F027-04-02

**No callouts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Detail: Affects: All apps. Work needed: Define a Markdown form and add render and insert.
- Evidence: No callout code found; brief S27.10

## GAP-F027-04-03

**No formatting on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Detail: Affects: Mobile. Work needed: Decide scope.
- Evidence: ArtifactFullScreen.tsx:2016 plain TextInput

## GAP-F027-04-04

**Invalid link gives no message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Detail: Affects: Web. Work needed: Show an error.
- Evidence: DocumentFormattingToolbar.tsx:109-115

## GAP-F027-04-NOTBUILT

**Text and block formatting: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Requirement items: S27.04, S27.05, S27.06, S27.07, S27.10, S27.11
- Detail: Web: S27.04, S27.05, S27.10; Desktop: S27.04, S27.05, S27.10; Mobile: S27.04, S27.05, S27.06, S27.07, S27.10, S27.11; Chrome: S27.04, S27.05, S27.06, S27.07, S27.10, S27.11

## GAP-F027-04-PARTLY

**Text and block formatting: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-04](../../20-features/027-document-and-writing-editor/F027-04-text-and-block-formatting.md)
- Requirement items: S27.06, S27.07, S27.11

## GAP-F027-05-01

**No Insert image control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Detail: Affects: Web and Desktop. Work needed: Design upload, storage and Markdown form.
- Evidence: No image button in DocumentFormattingToolbar.tsx

## GAP-F027-05-02

**No row or column controls for tables.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Detail: Affects: Web. Work needed: Add table editing buttons.
- Evidence: Toolbar buttons list

## GAP-F027-05-03

**Mobile has no tables or image editing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Detail: Affects: Mobile. Work needed: Decide scope.
- Evidence: Plain text box

## GAP-F027-05-04

**Ragged table fallback unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Detail: Affects: Web. Work needed: Run a test.
- Evidence: Only the signature comparison was read

## GAP-F027-05-NOTBUILT

**Tables and images: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Requirement items: S27.08, S27.09
- Detail: Mobile: S27.08, S27.09

## GAP-F027-05-PARTLY

**Tables and images: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-05](../../20-features/027-document-and-writing-editor/F027-05-tables-and-images.md)
- Requirement items: S27.08, S27.09

## GAP-F027-06-01

**No automatic save of text edits and no 'saving' or 'saved' state; status shows local draft only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Detail: Affects: Web and Desktop (hosted web); mobile. Work needed: Decide whether to autosave versions and show cloud sync state.
- Evidence: ArtifactPreview.tsx:2733; brief S27.27 expects saving and saved

## GAP-F027-06-02

**Mobile has no save-state indicator.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Detail: Affects: Mobile. Work needed: Add a state line.
- Evidence: Only notices at ArtifactFullScreen.tsx:1990-2015

## GAP-F027-06-03

**Draft status text hidden on narrow web panels.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Detail: Affects: Web on narrow widths and phones. Work needed: Show it at all widths.
- Evidence: ArtifactPreview.tsx:2729 (hidden below 30rem)

## GAP-F027-06-04

**No editing on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: No edit code in artifact files read

## GAP-F027-06-05

**Brief status for S27.03 mobile and S27.27 web are out of date or loosely worded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: ArtifactFullScreen.tsx:897-975

## GAP-F027-06-NOTBUILT

**Markdown source, saving and undo: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Requirement items: S27.03, S27.27, S27.28
- Detail: CLI: S27.03; VS Code: S27.03; Chrome: S27.03, S27.27, S27.28

## GAP-F027-06-PARTLY

**Markdown source, saving and undo: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-06](../../20-features/027-document-and-writing-editor/F027-06-markdown-source-saving-and-undo.md)
- Requirement items: S27.03, S27.27, S27.28

## GAP-F027-07-01

**Mobile restore has no confirmation, web does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Detail: Affects: Mobile users. Work needed: Add a confirm dialog naming the version before restoring.
- Evidence: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:811-837 vs apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1030

## GAP-F027-07-02

**Mobile drops the oldest versions beyond 20; no notice and no documented rule.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Detail: Affects: Mobile users with long edit chains. Work needed: Document the cap or raise it; consider telling the person.
- Evidence: apps/mobile/src/features/artifacts/store.ts:45, 175-178

## GAP-F027-07-03

**No version history in CLI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Detail: Affects: CLI and VS Code users. Work needed: Decide whether it is in scope; no decision found in docs/decisions.
- Evidence: apps/cli/src/lib.rs:1359-1415; apps/extension-vscode/package.json:689-719

## GAP-F027-07-04

**The brief's example 'Version 3 of 5' is only the accessible name; the visible label is 'v3/5'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Detail: Affects: Testers and docs. Work needed: Correct test scripts and copy.
- Evidence: ArtifactPreview.tsx:2666-2680

## GAP-F027-07-05

**Brief marks desktop 'done' but only the Tauri build has its own code; the public Electron app shows the web app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Detail: Affects: Desktop. Work needed: Track Electron under web and Tauri separately.
- Evidence: ARCHITECTURE.md:53; apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts

## GAP-F027-07-06

**Chrome status unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Detail: Affects: Chrome extension. Work needed: Search and record.
- Evidence: No version-history code searched in apps/extension.

## GAP-F027-07-NOTBUILT

**Version history: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Requirement items: S27.29
- Detail: CLI: S27.29; VS Code: S27.29

## GAP-F027-07-PARTLY

**Version history: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-07](../../20-features/027-document-and-writing-editor/F027-07-version-history.md)
- Requirement items: S27.29

## GAP-F027-08-01

**Brief marks web 'missing' but the toolbar is built and connected; the brief's 'in place' goal is replaced by a chat round trip.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Detail: Affects: Web and Electron users, planners. Work needed: Correct the brief; decide if in-place preview of the change is wanted.
- Evidence: ArtifactSelectionToolbar.tsx; WebChatPage.tsx:7894

## GAP-F027-08-02

**Mobile has no selection actions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Detail: Affects: Mobile users. Work needed: Decide; if wanted, build a selection menu feeding the existing composer prefill.
- Evidence: No matches in apps/mobile for the action labels; decision on phone document editing at docs/decisions/2026-09-27-founder-decisions.md:285-289

## GAP-F027-08-03

**Tauri desktop shared panel has no selection toolbar.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Detail: Affects: Tauri desktop (internal). Work needed: Decide if the Tauri build needs it.
- Evidence: packages/ui/unified-chat/src/components/ArtifactPanel.tsx has no selection code

## GAP-F027-08-04

**Chrome only translates page text and rewrites editable fields; no tone, audience, shorten or lengthen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Detail: Affects: Chrome users. Work needed: Decide if wanted; docs/decisions/2026-09-27-founder-decisions.md:385 lists S27.15 for Chrome as not built by design.
- Evidence: apps/extension/src/background.ts:7453-7460

## GAP-F027-08-05

**Stale brief code references for Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Detail: Affects: Docs. Work needed: Update the brief.
- Evidence: apps/extension/src/side_panel.ts:14710 is attachment-menu code

## GAP-F027-08-NOTBUILT

**Selection actions: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md)
- Requirement items: S27.15, S27.16, S27.17, S27.18, S27.19, S27.20, S27.21
- Detail: Mobile: S27.15, S27.16, S27.17, S27.18, S27.19, S27.20, S27.21; VS Code: S27.17, S27.18, S27.19, S27.20, S27.21; Chrome: S27.16, S27.17, S27.18, S27.19, S27.20

## GAP-F027-09-01

**No assistant suggestions that the person accepts or rejects before they apply.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Detail: Affects: Web and all other apps. Work needed: Decide scope; a proposal flow would need a pending-version state.
- Evidence: No suggestion code in apps/web/features/chat/components/artifacts; Review changes works after the fact (change-review.ts)

## GAP-F027-09-02

**No tracked changes; Show changes is a one-time comparison.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Detail: Affects: All apps. Work needed: Decide scope.
- Evidence: ArtifactPreview.tsx:3210-3217

## GAP-F027-09-03

**No presence.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Detail: Affects: All apps. Work needed: Needs a live channel and shared documents; not designed.
- Evidence: No presence or cursor code found in artifacts directories

## GAP-F027-09-04

**Comments are private to one account, not shared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Detail: Affects: Teams. Work needed: Add sharing rules if collaboration is wanted.
- Evidence: 0369 policy artifact_comments_user_isolation

## GAP-F027-09-05

**Brief marks web comments missing but they exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Detail: Affects: Docs. Work needed: Update the brief.
- Evidence: ArtifactPreview.tsx:2828-2840

## GAP-F027-09-06

**Comments absent on mobile, CLI, VS Code, Chrome and Tauri desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: No comment code found by search

## GAP-F027-09-NOTBUILT

**Suggestions, tracked changes, comments and presence: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md)
- Requirement items: S27.22, S27.23, S27.24, S27.25, S27.26
- Detail: Mobile: S27.22, S27.23, S27.24, S27.25, S27.26; CLI: S27.25; VS Code: S27.25; Chrome: S27.22, S27.23, S27.24, S27.25, S27.26

## GAP-F027-10-01

**No page-layout view and no print action for documents.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: Affects: All apps. Work needed: Decide scope; then add print stylesheet or export-first path.
- Evidence: No code found; print exists only for study sets, conversations and recipes

## GAP-F027-10-02

**No citation or bibliography tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: Affects: All apps. Work needed: None unless the decision changes.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:119-122

## GAP-F027-10-03

**Brand fonts and colours do not apply to documents; only voice does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: Affects: Web users. Work needed: Apply brand to document export or preview if wanted.
- Evidence: library/brand-request.ts

## GAP-F027-10-04

**Brief says 'start from template' is missing; it is built on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: Affects: Docs. Work needed: Update the brief.
- Evidence: NewArtifactMenu.tsx:14

## GAP-F027-10-05

**No templates on mobile, CLI, VS Code; Chrome unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: No code found

## GAP-F027-10-NOTBUILT

**Page layout, print, templates, brand and citations: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Requirement items: S27.30, S27.31, S27.32, S27.33
- Detail: Mobile: S27.30, S27.31, S27.32, S27.33; Chrome: S27.30, S27.31, S27.32, S27.33

## GAP-F027-10-PARTLY

**Page layout, print, templates, brand and citations: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md)
- Requirement items: S27.34

## GAP-F027-11-01

**CLI and VS Code cannot produce Word or PDF.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: Affects: CLI and VS Code. Work needed: Decide scope; VS Code export is not expected by decision (founder-decisions:116-118).
- Evidence: apps/cli/src/lib.rs:3961; artifactActions.ts

## GAP-F027-11-02

**Cloud saves are built but unavailable until connectors are released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: Affects: Web users. Work needed: Release step and live validation; not for the agent to do.
- Evidence: connector-release.ts:14

## GAP-F027-11-03

**Tauri desktop panel has only source download; Word and PDF not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: Affects: Tauri desktop. Work needed: Confirm whether the Tauri build is meant to match web.
- Evidence: packages/ui/unified-chat/src/components/ArtifactPanel.tsx:513-516

## GAP-F027-11-04

**Decision text for VS Code is behind the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: Affects: Docs. Work needed: Update the decision or the code.
- Evidence: founder-decisions:116-118 vs package.json:704-714

## GAP-F027-11-05

**Chrome export unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Detail: Affects: Chrome. Work needed: Search and record.
- Evidence: No document export found in apps/extension/src

## GAP-F027-11-NOTBUILT

**Export and save out: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Requirement items: S27.35, S27.36, S27.38
- Detail: Web: S27.38; Desktop: S27.38; Mobile: S27.38; CLI: S27.35, S27.36, S27.38; VS Code: S27.35, S27.36, S27.38; Chrome: S27.38

## GAP-F027-11-PARTLY

**Export and save out: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md)
- Requirement items: S27.35, S27.36, S27.37

## GAP-F027-12-01

**No attachment field and nothing sends the email.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Detail: Affects: All apps. Work needed: Not planned; dedicated email-send editor excluded by founder decision.
- Evidence: richBlocks.ts:37-45; EmailBlock.tsx actions list

## GAP-F027-12-02

**The send tool is not in this repository, so the CLI review step covers only whichever MCP or connector tool a user installs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Detail: Affects: CLI. Work needed: Verify with a real connector when connectors are released.
- Evidence: No send-email tool found in apps/cli/src

## GAP-F027-12-03

**VS Code and Chrome cards are read-only, brief says missing or unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Detail: Affects: VS Code, Chrome. Work needed: Update the brief; decide if editing is wanted.
- Evidence: assistantFence.ts:520-521

## GAP-F027-12-04

**Mobile card exists but the brief says rendering not verified, and a decision text suggests mobile has no email widget.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Detail: Affects: Mobile, docs. Work needed: Reconcile the decision with the code.
- Evidence: DraftSurfaces.tsx:340; docs/decisions/2026-09-27-founder-decisions.md:280-282

## GAP-F027-12-05

**No CLI test for recipient and subject lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Detail: Affects: CLI. Work needed: Add tests for key_details and truncation.
- Evidence: approval_details.rs tests at 231-268 cover commit_line only

## GAP-F027-12-06

**Tauri desktop main chat not confirmed to render the card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Detail: Affects: Tauri desktop. Work needed: Trace the main chat.
- Evidence: Only floating chat was found using the shared markdown

## GAP-F027-12-NOTBUILT

**Email drafts: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Requirement items: S27.39, S27.40
- Detail: CLI: S27.39, S27.40; VS Code: S27.39, S27.40

## GAP-F027-12-PARTLY

**Email drafts: partly built on VS Code, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F027-12](../../20-features/027-document-and-writing-editor/F027-12-email-drafts.md)
- Requirement items: S27.39, S27.40, S27.41
