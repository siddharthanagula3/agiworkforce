---
id: "GAPS-AREA-030"
type: "gap-list"
title: "Gaps: Presentation workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 30. Presentation workspace

74 open gaps that touch this area. Area page: [20-features/030-presentation-workspace](../../20-features/030-presentation-workspace/README.md).

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

## CMP-W116

**Admin enables each artifact template (Slides, Design, Data, Docs)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Artifact types cannot be switched on or off per workspace.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:38-52 (only artifact_connectors)

## CMP-W134

**Slides co-editing by several people**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md), [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md), [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md), [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Detail: Decks are edited by their owner; there is no shared live editing.
- Evidence: searched: co-edit, collaborat in features/chat/components/artifacts; apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:524

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

## GAP-AREA030-LW03

**Delete toast promises a restore, but no restore control was found, and delete has no confirmation step**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-030
- Detail: Area 30. Presentation workspace
- Evidence: apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:409-413

## GAP-AREA030-LW04

**Deck format has no notes field, so speaker notes cannot be stored**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-030
- Detail: Area 30. Presentation workspace
- Evidence: packages/ui/unified-chat/src/lib/deck-model.ts:8-11

## GAP-CAP-artifacts-and-documents-04

**Selection-based edit requests and edit-in-place: Reach on Desktop, Mobile, VS Code and Chrome unknown. Spreadsheet range questions and per-slide edits not found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Requirement items: S26.17, S26.19, S27.15, S27.16, S30.20, S96.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-07

**Export documents and decks to Word, PDF, Markdown, PowerPoint: Export fidelity: seen duplicated title and a page footer without a number in a Word file; export to Google formats gated while connectors are unreleased. Two near-identical download entries.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Requirement items: S27.35, S27.36, S27.37, S29.34, S29.35, S29.36, S30.28, S30.29, S96.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-10

**Slide decks: build, edit, present, export: No co-editing; presenter mode, reorder, per-slide regenerate, PDF/selected-slide export not confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md), [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md), [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md), [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Requirement items: S30.02, S30.07, S30.08, S30.10, S30.12, S30.22, S30.26, S30.27, S30.28, S30.29
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-22

**Templates, saved brand style and design systems for documents and decks: No admin per-template switch; Mobile has no template gallery.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Requirement items: S27.32, S27.33, S30.32, S96.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F030-01-01

**Mobile has no thumbnail previews**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md)
- Detail: Affects: Mobile users. Work needed: Add thumbnail strip or titles
- Evidence: PresentationDeckView.tsx:468-500 uses dots

## GAP-F030-01-02

**No rail on Chrome, VS Code, CLI; no deck viewer found on Tauri desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md)
- Detail: Affects: those apps. Work needed: Decide whether those apps show decks; reuse unified-chat viewer
- Evidence: grep of app sources

## GAP-F030-01-03

**Compact web card has no thumbnail rail**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md)
- Detail: Affects: Web chat cards. Work needed: Optional
- Evidence: ArtifactPreview.tsx:1976

## GAP-F030-01-NOTBUILT

**Slide rail and navigation: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F030-01](../../20-features/030-presentation-workspace/F030-01-slide-rail-and-navigation.md)
- Requirement items: S30.02
- Detail: VS Code: S30.02; Chrome: S30.02

## GAP-F030-02-01

**Web delete does not ask first**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-02](../../20-features/030-presentation-workspace/F030-02-add-duplicate-move-and-delete-slides.md)
- Detail: Affects: Web users. Work needed: Use useConfirmAction per AGENTS.md section 9 or add undo
- Evidence: PresentationWorkspace.tsx:405-413

## GAP-F030-02-02

**Delete toast says to restore but offers no control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-02](../../20-features/030-presentation-workspace/F030-02-add-duplicate-move-and-delete-slides.md)
- Detail: Affects: Web users. Work needed: Add an action to the toast
- Evidence: PresentationWorkspace.tsx:412; restore lives in ArtifactPreview.tsx:2340

## GAP-F030-02-03

**No slide editing on Chrome, VS Code, CLI, Tauri desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-02](../../20-features/030-presentation-workspace/F030-02-add-duplicate-move-and-delete-slides.md)
- Detail: Affects: those apps. Work needed: Product decision
- Evidence: no code found

## GAP-F030-02-04

**Mobile Delete message mentions restore; mobile restore path not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-02](../../20-features/030-presentation-workspace/F030-02-add-duplicate-move-and-delete-slides.md)
- Detail: Affects: Mobile. Work needed: Verify a mobile restore control exists
- Evidence: PresentationDeckView.tsx:241

## GAP-F030-02-NOTBUILT

**Add, duplicate, move and delete slides: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F030-02](../../20-features/030-presentation-workspace/F030-02-add-duplicate-move-and-delete-slides.md)
- Requirement items: S30.03, S30.04, S30.05, S30.06
- Detail: Desktop: S30.04, S30.05, S30.06; CLI: S30.03, S30.04, S30.05, S30.06; VS Code: S30.03, S30.04, S30.05, S30.06; Chrome: S30.04, S30.05, S30.06

## GAP-F030-03-01

**Mobile ignores deck theme**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md)
- Detail: Affects: Mobile. Work needed: Share theme resolution through unified-chat
- Evidence: PresentationDeckView.tsx has no resolveDeckTheme

## GAP-F030-03-02

**Theme and brand control missing on every app except web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md)
- Detail: Affects: Mobile, Chrome, VS Code, desktop Tauri. Work needed: Product decision
- Evidence: grep

## GAP-F030-03-03

**Brand is copied, not linked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md)
- Detail: Affects: Web. Work needed: Decide whether linking is wanted
- Evidence: PresentationWorkspace.tsx:314

## GAP-F030-03-04

**Deck title not editable inside the workspace**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md)
- Detail: Affects: Web. Work needed: Optional title field
- Evidence: title prop only (line 122)

## GAP-F030-03-NOTBUILT

**Deck theme and brand: not built on Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F030-03](../../20-features/030-presentation-workspace/F030-03-deck-theme-and-brand.md)
- Requirement items: S30.01, S30.08, S30.09
- Detail: Desktop: S30.08, S30.09; Mobile: S30.08, S30.09; CLI: S30.01, S30.08, S30.09; VS Code: S30.01, S30.08, S30.09; Chrome: S30.08, S30.09

## GAP-F030-04-01

**No layout selection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md)
- Detail: Affects: All apps. Work needed: Define layouts and a picker
- Evidence: no layout field found

## GAP-F030-04-02

**Mobile cannot insert images, tables, charts, shapes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md)
- Detail: Affects: Mobile. Work needed: Add or decide to leave
- Evidence: PresentationDeckView.tsx action list

## GAP-F030-04-03

**Inserts always append at end of slide**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md)
- Detail: Affects: Web. Work needed: Position choice
- Evidence: appendToSlide

## GAP-F030-04-04

**No editing on Chrome, VS Code, CLI, Tauri desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md)
- Detail: Affects: those apps. Work needed: Product decision
- Evidence: grep

## GAP-F030-04-NOTBUILT

**Slide content editing and layout: not built on Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code, Chrome
- Features: [F030-04](../../20-features/030-presentation-workspace/F030-04-slide-content-editing-and-layout.md)
- Requirement items: S30.07, S30.10, S30.11, S30.12, S30.13, S30.14
- Detail: Desktop: S30.07, S30.10, S30.11, S30.12, S30.13, S30.14; CLI: S30.07, S30.10, S30.11, S30.12, S30.13, S30.14; VS Code: S30.07, S30.10, S30.11, S30.12, S30.13, S30.14; Chrome: S30.07, S30.10, S30.11, S30.12, S30.13, S30.14

## GAP-F030-05-01

**No alignment**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-05](../../20-features/030-presentation-workspace/F030-05-arranging-shapes-on-a-slide.md)
- Detail: Affects: Web. Work needed: Multi-select and align commands
- Evidence: no code

## GAP-F030-05-02

**No grouping**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-05](../../20-features/030-presentation-workspace/F030-05-arranging-shapes-on-a-slide.md)
- Detail: Affects: Web. Work needed: Group model in shapes JSON
- Evidence: no code

## GAP-F030-05-03

**No layer order control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-05](../../20-features/030-presentation-workspace/F030-05-arranging-shapes-on-a-slide.md)
- Detail: Affects: Web. Work needed: Reorder commands
- Evidence: order = array order only

## GAP-F030-05-04

**No resize**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-05](../../20-features/030-presentation-workspace/F030-05-arranging-shapes-on-a-slide.md)
- Detail: Affects: Web. Work needed: Handles
- Evidence: SlideShapes.tsx has no resize

## GAP-F030-05-05

**All other apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-05](../../20-features/030-presentation-workspace/F030-05-arranging-shapes-on-a-slide.md)
- Detail: Affects: Mobile etc.. Work needed: Decision
- Evidence: no code

## GAP-F030-05-NOTBUILT

**Arranging shapes on a slide: not built on Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, VS Code, Chrome
- Features: [F030-05](../../20-features/030-presentation-workspace/F030-05-arranging-shapes-on-a-slide.md)
- Requirement items: S30.15, S30.16, S30.17
- Detail: Desktop: S30.15, S30.16, S30.17; Mobile: S30.15, S30.16, S30.17; VS Code: S30.15, S30.16, S30.17; Chrome: S30.15, S30.16, S30.17

## GAP-F030-06-01

**No slide notes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md)
- Detail: Affects: All apps. Work needed: Format, editor, storage
- Evidence: deck-model.ts has no notes concept

## GAP-F030-06-02

**No presenter notes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md)
- Detail: Affects: Web, mobile. Work needed: Presenter UI
- Evidence: present dialogs show only slide

## GAP-F030-06-03

**No speaker view with next slide and timer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md)
- Detail: Affects: Web. Work needed: Second window or split layout
- Evidence: no code

## GAP-F030-06-04

**No presenting on Chrome, VS Code, desktop Tauri, CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md)
- Detail: Affects: those apps. Work needed: Brief marks Chrome and VS Code missing for S30.26
- Evidence: grep

## GAP-F030-06-NOTBUILT

**Speaker notes and speaker view: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F030-06](../../20-features/030-presentation-workspace/F030-06-speaker-notes-and-speaker-view.md)
- Requirement items: S30.18, S30.19, S30.27
- Detail: Web: S30.27; Desktop: S30.27; Mobile: S30.27; CLI: S30.18, S30.19; VS Code: S30.18, S30.19, S30.27; Chrome: S30.27

## GAP-F030-07-01

**No check that only the named slide changed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md)
- Detail: Affects: Web and mobile users of Ask about slide and Rewrite slide. Work needed: Diff old and new decks after the reply and warn or reject.
- Evidence: deck-request.ts:23 is the only enforcement (prompt text)

## GAP-F030-07-02

**No whole-deck restructuring control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md)
- Detail: Affects: All apps (S30.23). Work needed: Add a request builder and entry point, or document typing in chat as the way.
- Evidence: No restructure builder found in packages/ui/unified-chat/src/lib

## GAP-F030-07-03

**No deck AI edit on desktop Tauri, Chrome, VS Code, CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md)
- Detail: Affects: Those apps. Work needed: Decide scope; add or mark not applicable.
- Evidence: No deck component found in their source

## GAP-F030-07-04

**Brief marks S30.20-S30.22 as missing on all apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md)
- Detail: Affects: Planning and tests. Work needed: Correct the brief statuses after a human run.
- Evidence: Brief vs PresentationWorkspace.tsx:240 and test files

## GAP-F030-07-05

**No regenerate-one-slide action distinct from rewrite**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md)
- Detail: Affects: S30.22 on all apps. Work needed: Add a regenerate action or merge S30.22 into rewrite.
- Evidence: Only REWRITE_SLIDE_INSTRUCTION exists (deck-request.ts:7)

## GAP-F030-07-NOTBUILT

**AI edits to slides: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md)
- Requirement items: S30.20, S30.21, S30.22, S30.23
- Detail: CLI: S30.20, S30.21, S30.22, S30.23; VS Code: S30.20, S30.21, S30.22, S30.23; Chrome: S30.20, S30.21, S30.22, S30.23

## GAP-F030-08-01

**Comments exist only on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-08](../../20-features/030-presentation-workspace/F030-08-slide-comments.md)
- Detail: Affects: Mobile, Chrome, VS Code, CLI users. Work needed: Decide scope; build mobile comments over the same API.
- Evidence: No comment UI in those apps' sources

## GAP-F030-08-02

**Brief marks S30.24 missing everywhere**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-08](../../20-features/030-presentation-workspace/F030-08-slide-comments.md)
- Detail: Affects: Planning. Work needed: Correct the brief after a human run.
- Evidence: Brief vs ArtifactPreview.tsx:1967

## GAP-F030-08-03

**No comment control in presenting mode or in shared viewer pages**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-08](../../20-features/030-presentation-workspace/F030-08-slide-comments.md)
- Detail: Affects: Reviewers who are not editing. Work needed: Decide whether review on the published page is required.
- Evidence: PresentationWorkspace.tsx:771-806

## GAP-F030-08-04

**Comments are per account, not shared with workspace members**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-08](../../20-features/030-presentation-workspace/F030-08-slide-comments.md)
- Detail: Affects: Teams. Work needed: Product decision and migration if sharing is wanted.
- Evidence: 0369_artifact_comments.sql header says rows belong to the writing account

## GAP-F030-08-NOTBUILT

**Slide comments: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F030-08](../../20-features/030-presentation-workspace/F030-08-slide-comments.md)
- Requirement items: S30.24
- Detail: Mobile: S30.24; CLI: S30.24; VS Code: S30.24; Chrome: S30.24

## GAP-F030-09-01

**Web presenting has no Home/End keys while the shared viewer does**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md)
- Detail: Affects: Web users. Work needed: Share one key map.
- Evidence: PresentationWorkspace.tsx:779-786 vs PresentationArtifact.tsx:41-48

## GAP-F030-09-02

**No presenting view in Chrome extension, VS Code extension**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md)
- Detail: Affects: Those apps. Work needed: Decide scope or mark not applicable.
- Evidence: Brief marks them missing; no code found

## GAP-F030-09-03

**No speaker view, notes or timer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md)
- Detail: Affects: Presenters on all apps. Work needed: Build S30.27 and S30.19 features.
- Evidence: Overlay has only the slide and Stop (PresentationWorkspace.tsx:791-804)

## GAP-F030-09-04

**No browser-level test of presenting on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md)
- Detail: Affects: Verification. Work needed: Add a component or Playwright test for fullscreen and Escape.
- Evidence: Presenting is not among the cases listed in PresentationWorkspace.test.tsx

## GAP-F030-09-NOTBUILT

**Presenting full screen: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F030-09](../../20-features/030-presentation-workspace/F030-09-presenting-full-screen.md)
- Requirement items: S30.26
- Detail: VS Code: S30.26; Chrome: S30.26

## GAP-F030-10-01

**PPTX does not come from the stored deck**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Detail: Affects: Web users expecting the same look in PowerPoint. Work needed: Build a deck-to-PPTX converter or accept the outline model and say so in the interface.
- Evidence: SlideSchema has title, bullets, speaker_notes only (managed-office-file-service.ts:73-77)

## GAP-F030-10-02

**No Download as PowerPoint item in the deck menu**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Detail: Affects: Web. Work needed: Add a menu item that calls the converter.
- Evidence: Menu items at ArtifactPreview.tsx:2394-2402 do not include pptx for decks

## GAP-F030-10-03

**No export of selected slides**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Detail: Affects: All apps (S30.30). Work needed: Add slide selection to export.
- Evidence: No code found

## GAP-F030-10-04

**Brief says PDF missing but it exists on web and mobile; brief code references for PPTX are off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Detail: Affects: Planning. Work needed: Fix the brief.
- Evidence: deck-pdf.ts:491; artifactExport.ts:122

## GAP-F030-10-05

**No deck export in CLI, VS Code, Chrome (other than generated files)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: No code found

## GAP-F030-10-NOTBUILT

**Export: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md)
- Requirement items: S30.28, S30.29, S30.30
- Detail: Web: S30.29, S30.30; Desktop: S30.29, S30.30; Mobile: S30.29, S30.30; CLI: S30.28, S30.29, S30.30; VS Code: S30.28, S30.29, S30.30; Chrome: S30.29, S30.30

## GAP-F030-11-01

**Brief says versions, templates and viewer link are missing; code exists on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md)
- Detail: Affects: Planning and tests. Work needed: Correct the brief after a human run.
- Evidence: ArtifactPreview.tsx:2305,2438; artifact-templates.ts:206

## GAP-F030-11-02

**Templates and publish are not on mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md)
- Detail: Affects: Mobile users. Work needed: Decide scope and build or mark out of scope.
- Evidence: No template or publish code in apps/mobile deck viewer

## GAP-F030-11-03

**No deck-specific version view (per-slide diff)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md)
- Detail: Affects: Web and mobile. Work needed: Optional diff view.
- Evidence: Versions are whole-content lists

## GAP-F030-11-04

**Whether the published link is a snapshot or follows edits is not stated in the interface**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md)
- Detail: Affects: Publishers. Work needed: Say so near the link.
- Evidence: ArtifactsPanel.tsx:119-127 builds HTML at publish time

## GAP-F030-11-05

**Chrome, VS Code, CLI have no versions, templates or sharing for decks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: No code found

## GAP-F030-11-NOTBUILT

**Versions, templates and sharing: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md)
- Requirement items: S30.25, S30.32, S30.33
- Detail: CLI: S30.25, S30.32, S30.33; VS Code: S30.25, S30.32, S30.33; Chrome: S30.25, S30.32, S30.33

## GAP-F030-12-01

**Linked documents and spreadsheets are not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-12](../../20-features/030-presentation-workspace/F030-12-connected-documents-and-spreadsheets.md)
- Detail: Affects: All six apps (S30.31). Work needed: Write a spec; add a source field to the deck model; build refresh over the connector layer; add trust-boundary checks.
- Evidence: No code in apps/web presentation folder, deck-model.ts or the mobile deck viewer

## GAP-F030-12-02

**No spec found for this feature**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F030-12](../../20-features/030-presentation-workspace/F030-12-connected-documents-and-spreadsheets.md)
- Detail: Affects: Planning. Work needed: Create a spec under docs/specs after owner decision.
- Evidence: docs/product/requirements.md mentions deck export but no linking; no deck spec folder was read

## GAP-F030-12-NOTBUILT

**Connected documents and spreadsheets: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F030-12](../../20-features/030-presentation-workspace/F030-12-connected-documents-and-spreadsheets.md)
- Requirement items: S30.31
- Detail: Web: S30.31; Desktop: S30.31; Mobile: S30.31; CLI: S30.31; VS Code: S30.31; Chrome: S30.31
