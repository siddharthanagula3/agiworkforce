---
id: "GAPS-AREA-096"
type: "gap-list"
title: "Gaps: Artifact and generated-application components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 96. Artifact and generated-application components

94 open gaps that touch this area. Area page: [20-features/096-artifact-and-generated-application-components](../../20-features/096-artifact-and-generated-application-components/README.md).

## CMP-C82

**Artifact pages that read live data through connectors**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Published pages are static content; no live connector data.
- Evidence: apps/cli/src/cloud/artifacts.rs; searched: connector in cloud/artifacts.rs

## CMP-CP48

**Publish the agent's own work as a private interactive page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The agent cannot publish a file from the session agi artifacts publish shares an artifact already in the account; the agent cannot publish a file from the session.
- Evidence: apps/cli/src/lib.rs:1399-1408; cloud/artifacts.rs:451-497

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

## CMP-V27

**Agent publishes a page or file to the cloud as an artifact**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The editor lists, opens and saves published artifacts but the agent cannot publish one from a session.
- Evidence: apps/extension-vscode/src/features/artifacts/artifactsClient.ts:33 (list only); searched: publish artifact tool in apps/cli/src/

## CMP-W116

**Admin enables each artifact template (Slides, Design, Data, Docs)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Artifact types cannot be switched on or off per workspace.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:38-52 (only artifact_connectors)

## CMP-W117

**Apps made in chat can call the AI themselves (AI-powered artifacts)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Switched off: AGI_ARTIFACT_AI_ENABLED defaults to 0 until a security review passes, so in-app AI calls answer "not available yet".
- Evidence: apps/web/lib/validate-env.ts:1716; apps/web/lib/artifact-ai.ts:3

## CMP-W119

**Certified queries reused across dashboards**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: No reusable approved queries for dashboards.
- Evidence: searched: certified query in apps/web, packages/ui/unified-chat

## CMP-W121

**Design offers 2 or 3 variations, and Claude can save a direction to try another**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: A design has one result per request; no variation set or saved directions.
- Evidence: apps/web/features/chat/components/artifacts/design/ (brief dialog, image edits only); searched: variations

## CMP-W128

**Several design systems per organization and an admin lock to one**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Brand kits are personal libraries; an admin cannot publish or lock one for a workspace.
- Evidence: apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx; searched: design system lock in features/workspace-console

## CMP-WP101

**Comment @Claude in a document to get an edit**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: The comment itself is not a mention that triggers an edit Comments on a passage can be sent to the assistant with Ask AI to apply; the comment itself is not a mention that triggers an edit.
- Evidence: apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx:204-211,277-283; comment-request.ts:20

## CMP-WP102

**Data dashboards from a data warehouse with each chart's query shown**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Charts do not show their query or last refresh Warehouse apps connect and live artifacts refresh from them, but charts do not show their query or last refresh.
- Evidence: apps/web/lib/connectors/catalog.ts:235-237; apps/web/app/chat/live-artifacts/; searched: query provenance

## CMP-WP103

**Design colour picker warns when text contrast is poor**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Designs have no colour picker The brand kit dialog shows the contrast ratio and adjusts faint text or accent colours, but designs have no colour picker.
- Evidence: apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx:134,223-228

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

## CMP-WP107

**Import a design system or brand kit for designs and decks**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: There is no import of an existing design system Brand kits and templates are saved in the studio library and applied from "Apply brand voice"; there is no import of an existing design system.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2471; apps/web/features/chat/components/artifacts/library/studio-library-client.ts:25

## CMP-WP108

**Pages with comments**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Only the owner can comment, not viewers Artifacts have anchored, resolvable comment threads where the assistant replies; only the owner can comment, not viewers.
- Evidence: apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx:19; apps/web/lib/services/artifact-comment-service.ts:42

## CMP-WP83

**Create Word, PowerPoint, Excel and PDF files**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F024-01](../../20-features/024-library-and-file-management-experience/F024-01-browse-by-source-all-files-uploads-generated-files.md), [F025-07](../../20-features/025-file-previews-and-readers/F025-07-save-copy-or-open-a-file-outside-the-viewer.md), [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: There is no PDF output An Output row creates Word, PowerPoint or Excel files; there is no PDF output.
- Evidence: apps/web/lib/chat-output-format.ts:11-15; Composer/ComposerPlusMenu.tsx:960-1010

## CMP-WP84

**Largest single file in chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Paid plans take 500 MiB; Free and Basic take 25 MiB Paid plans take 500 MiB; Free and Basic take 25 MiB.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2,66-67; types/src/billing-catalog.ts:548-577,617

## CMP-WP96

**Artifact storage that apps keep between visits**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Published apps get personal and shared key-value storage capped at 20 MB per scope and 4 MB per value Published apps get personal and shared key-value storage capped at 20 MB per scope and 4 MB per value.
- Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:11; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:31

## CMP-WP97

**Artifacts that refresh from connected apps (live data)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: A Live artifacts page refreshes artifacts on open or on demand; it needs connectors, which are mostly coming soon A Live artifacts page refreshes artifacts on open or on demand; it needs connectors, which are mostly coming soon.
- Evidence: apps/web/shared/components/layout/app-nav-items.ts:162; apps/web/app/chat/live-artifacts/LiveArtifactControls.tsx:94

## CMP-XP5

**Artifacts and published pages from the panel**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Artifact cards show source with a preview and copy or download; running one fully happens on the web Artifact cards show source with a preview and copy or download; running one fully happens on the web.
- Evidence: apps/extension/src/features/side-panel/artifactPanel.ts:671; locale spArtifactSourceNoteWeb

## GAP-AREA096-LW08

**Storage limit mismatch: migration comment says 20 MB per app per scope; the row check allows 5 MB per value; the total limit is a contract constant that was not read.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-096
- Detail: Area 96. Artifact and generated-application components
- Evidence: apps/web/db/neon/0325_published_artifact_storage.sql (check and comment lines)

## GAP-CAP-artifacts-and-documents-02

**Live preview with source toggle (HTML, React, SVG, Mermaid, Markdown): Responsive preview sizes, console panel, theme choice and dependency panel are missing. SVG preview crops a square and the preview stays light in dark mode (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md), [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md), [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md), [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Requirement items: S26.14, S28.10, S28.11, S28.16, S28.18, S28.19, S96.12, S96.15
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-03

**Artifact versions, restore and compare: Compare view not in the briefs as built (ArtifactChangesView exists; its reach is not verified). A follow-up edit created a duplicate artifact with the same name and a stale v1 panel (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md), [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md), [F096-02](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Requirement items: S26.20, S26.21, S26.22, S26.23, S28.29, S28.30, S96.02
- Detail: Claude partly, ChatGPT partly; AGI partly built

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

## GAP-CAP-artifacts-and-documents-07

**Export documents and decks to Word, PDF, Markdown, PowerPoint: Export fidelity: seen duplicated title and a page footer without a number in a Word file; export to Google formats gated while connectors are unreleased. Two near-identical download entries.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-11](../../20-features/027-document-and-writing-editor/F027-11-export-and-save-out.md), [F029-06](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-06-charts.md), [F029-12](../../20-features/029-spreadsheet-and-data-analysis-workspace/F029-12-export-and-reports-workbook-csv-chart-report-and-s.md), [F030-10](../../20-features/030-presentation-workspace/F030-10-export.md), [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Requirement items: S27.35, S27.36, S27.37, S29.34, S29.35, S29.36, S30.28, S30.29, S96.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-08

**Create real Word, PowerPoint, Excel and PDF files from chat: Excel creation fails (workbook recalculation error); a retry gets a false 'tool isn't available'; success only with typed values, not a SUM formula. PDF creation was not tested by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Requirement items: S96.07, S96.08, S96.09, S96.10
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-11

**Design canvas, design systems and brand import: Missing: variations, several design systems with admin lock, design-system registry on the platform side. Area 32 brief was not read.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Requirement items: S96.28
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-artifacts-and-documents-13

**Data dashboards with query provenance, refresh and certified queries: No connected-data status or refresh control; connectors are gated as unreleased in artifact save paths.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Requirement items: S26.33, S26.34, S96.18
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-15

**Publish an artifact to a link and choose who can open it: VS Code cannot publish; named-viewer access, custom domains, analytics missing; no human check of the publish flow.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S26.31, S26.32, S28.27, S33.10, S33.12, S33.24, S96.20, S96.23, S96.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-17

**Artifact storage and AI-powered artifacts: Briefs and comparison disagree with each other; app-level metering missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S28.22, S28.23, S33.20, S96.17, S96.24
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-18

**Live data from connected apps: Viewer-bound authentication bridge missing; connectors gated.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Requirement items: S26.33, S26.34, S28.32, S96.19
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-22

**Templates, saved brand style and design systems for documents and decks: No admin per-template switch; Mobile has no template gallery.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F027-10](../../20-features/027-document-and-writing-editor/F027-10-page-layout-print-templates-brand-and-citations.md), [F030-11](../../20-features/030-presentation-workspace/F030-11-versions-templates-and-sharing.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Requirement items: S27.32, S27.33, S30.32, S96.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-26

**Plan limits and usage cost of generated files: Free account in W-15 got a plain chat with no message that Work is unavailable.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S26.37, S33.19, S96.24
- Detail: Claude yes, ChatGPT yes; AGI unknown

## GAP-F096-01-01

**No paging beyond 500 rows**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-01](../../20-features/096-artifact-and-generated-application-components/F096-01-account-wide-artifact-index.md)
- Detail: Affects: Accounts with many artifacts on web, phone, CLI, VS Code. Work needed: Add a cursor to the route and contract and use it in each client
- Evidence: apps/web/app/api/artifacts/index/route.ts:39,68

## GAP-F096-01-02

**No rebuild or backfill found, although the design says the index can be rebuilt**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-01](../../20-features/096-artifact-and-generated-application-components/F096-01-account-wide-artifact-index.md)
- Detail: Affects: Everyone with chats saved before the table existed. Work needed: Write and run a rebuild job over messages [proposed]
- Evidence: Search of scripts and db folders found only the migration and a guard script; apps/web/db/neon/0121_artifact_index.sql

## GAP-F096-01-03

**Phone main Artifacts screen and desktop Tauri screen do not read the index**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-01](../../20-features/096-artifact-and-generated-application-components/F096-01-account-wide-artifact-index.md)
- Detail: Affects: Mobile, desktop. Work needed: Decide per surface whether to merge index rows
- Evidence: apps/mobile/app/(app)/artifacts/index.tsx:1-6; no caller in apps/desktop/src

## GAP-F096-01-04

**Library artifact surface does not use the index; relation unclear**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-01](../../20-features/096-artifact-and-generated-application-components/F096-01-account-wide-artifact-index.md)
- Detail: Affects: Web. Work needed: Trace the Library data source and align or document
- Evidence: apps/web/features/library/components/LibraryView.tsx:77

## GAP-F096-01-05

**Stale comment in migration and gallery cite migration 0120 for RLS and index**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-01](../../20-features/096-artifact-and-generated-application-components/F096-01-account-wide-artifact-index.md)
- Detail: Affects: Engineers. Work needed: Fix comments
- Evidence: apps/web/app/gallery/GalleryClient.tsx comment above line 1213; apps/web/app/api/artifacts/index/route.ts header

## GAP-F096-02-01

**No endpoint reads back or restores a server version**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-02](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Detail: Affects: All apps; the requirement in brief S96.02. Work needed: Add list and get endpoints and a restore that appends a new version
- Evidence: Only the insert (route.ts:366), export (export/route.ts:2976) and deletion list reference web_artifact_versions

## GAP-F096-02-02

**Brief and migration say desktop is the editing surface and web does not edit; code shows web and phone push**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-02](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Detail: Affects: Documentation, engineers. Work needed: Correct the migration comment and brief
- Evidence: use-artifact-cloud-sync.ts; cloudSyncEngine.ts:452; no desktop caller

## GAP-F096-02-03

**Version rows depend on the client's version number**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-02](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Detail: Affects: History completeness on web. Work needed: Verify that web increments version per edit or make the server assign it
- Evidence: route.ts:366-374 (do nothing on conflict); artifacts-store.ts:265

## GAP-F096-02-04

**Tauri desktop does not use this sync**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-02](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Decide if needed; public Desktop is the web app
- Evidence: No caller in apps/desktop/src

## GAP-F096-02-05

**No plan or quota rule for artifact storage**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-02](../../20-features/096-artifact-and-generated-application-components/F096-02-artifact-version-store.md)
- Detail: Affects: Cost control. Work needed: Define a limit if required
- Evidence: route.ts:576-583 counts only conversations and messages

## GAP-F096-03-01

**Brief marks S96.05 and S96.06 missing but code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Affects: Planning accuracy. Work needed: Update the brief status
- Evidence: comments/route.ts; ArtifactPreview.tsx:2177

## GAP-F096-03-02

**No sharing: comments are visible only to their author, so no review between people**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Affects: Web teams. Work needed: Add workspace-scoped policy if shared review is required [proposed]
- Evidence: 0369:42-46

## GAP-F096-03-03

**No suggestion (accept or reject) entity**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Affects: Web. Work needed: Define and build if required
- Evidence: No table or route besides artifact_comments

## GAP-F096-03-04

**No live multi-user editing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Affects: All apps. Work needed: Platform decision and build
- Evidence: apps/web/package.json:112-118 shows no CRDT library

## GAP-F096-03-05

**Comments and selection edit absent outside web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Decide parity per surface
- Evidence: grep found no comment client in those apps

## GAP-F096-03-06

**Assistant-authored comments have no writer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Affects: Web. Work needed: Wire or remove
- Evidence: author enum only in schema and service

## GAP-F096-04-01

**No plan or quota rule for file creation found; Free routes block it by schema**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: Affects: Free and paid users on web and phone. Work needed: Confirm with the entitlement owner and wire a documented rule
- Evidence: free-quota.ts:126; no entitlement check in tool-loop.ts:2562-2606

## GAP-F096-04-02

**Voice cannot do formulas, render checks or attached-file edits**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: Affects: Voice users on web. Work needed: Pass attachments and executor or hide those options
- Evidence: live-voice-tool-runner.ts:155

## GAP-F096-04-03

**Three distinct persist failures share one message**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: Affects: Debugging and user feedback. Work needed: Return reason to the model
- Evidence: tool-loop.ts:2592

## GAP-F096-04-04

**Brief says voice path only wired; chat loop is the main path**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: Affects: Docs. Work needed: Update brief and per-app status
- Evidence: tool-loop.ts:2562

## GAP-F096-04-05

**CLI, VS Code and Chrome cannot generate files**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: Affects: Those apps. Work needed: Decide parity [proposed]
- Evidence: No path found

## GAP-F096-04-06

**Mobile format selector not located**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-04](../../20-features/096-artifact-and-generated-application-components/F096-04-office-and-pdf-file-generation.md)
- Detail: Affects: Phone. Work needed: Locate and document
- Evidence: chatExecutionStore.ts:3436-3437

## GAP-F096-05-01

**Brief lists CSV and HTML export as missing from code; they exist in the artifact menu**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: Affects: Docs. Work needed: Update brief
- Evidence: ArtifactPreview.tsx:2383-2388

## GAP-F096-05-02

**Artifact Markdown download bypasses the shared service and its metadata header**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: Affects: Web. Work needed: Use downloadAsMarkdown
- Evidence: ArtifactPreview.tsx:1393-1401

## GAP-F096-05-03

**Word and PDF only for document-type artifacts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: Affects: Web. Work needed: Decide scope
- Evidence: ArtifactPreview.tsx:1484

## GAP-F096-05-04

**Mobile, VS Code and Chrome export formats not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: Affects: Those apps. Work needed: Audit
- Evidence: Not read

## GAP-F096-05-05

**No server adapters; brief calls them platform components**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-05](../../20-features/096-artifact-and-generated-application-components/F096-05-export-to-markdown-pdf-and-word-in-the-browser.md)
- Detail: Affects: Docs. Work needed: Clarify
- Evidence: No server export route found for artifacts

## GAP-F096-06-01

**Host header policy is narrower than the page meta policy: script hosts cdnjs and esm.sh and all CDN styles are missing from the header, so on the deployed web host only the narrower rule applies [inferred]**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Detail: Affects: Web preview of artifacts using those hosts; desktop differs because it uses the meta policy. Work needed: Test a real artifact using each host on the deployed sandbox and align or document
- Evidence: infrastructure/sandbox/vercel.json:15 vs infrastructure/sandbox/index.html:56; test in packages/contracts/types/src/__tests__/artifact-csp.test.ts allows 'no laxer'

## GAP-F096-06-02

**Production sandbox origin management is unverified: no probe, only an env warning**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Detail: Affects: Web security posture. Work needed: Add a live check; confirm the production variable
- Evidence: apps/web/lib/config/dependency-readiness.ts:172-176 (liveProbe null); validate-env.ts:439

## GAP-F096-06-03

**No dependency resolver**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Detail: Affects: React artifacts that import libraries. Work needed: Decide scope
- Evidence: infrastructure/sandbox/index.html:749-755

## GAP-F096-06-04

**Previews depend on public CDNs**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Detail: Affects: Offline and Local use, privacy. Work needed: Vendor assets or document the dependency
- Evidence: index.html:130,208-228

## GAP-F096-06-05

**No preview on mobile, VS Code, CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Detail: Affects: Those apps. Work needed: Decide parity
- Evidence: No renderer found in them

## GAP-F096-06-06

**Renderer kinds mermaid, markdown, text, code not used by the web panel preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-06](../../20-features/096-artifact-and-generated-application-components/F096-06-live-preview-in-an-isolated-sandbox.md)
- Detail: Affects: Engineers. Work needed: Remove or wire
- Evidence: artifact-render.ts:12-16

## GAP-F096-07-01

**Brief says 5 MB per value; the route enforces 4 MB while the database allows 5 MiB.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Detail: Affects: Web authors and testers. Work needed: Pick one number, set the database check and docs to match it.
- Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:10; apps/web/db/neon/0325_published_artifact_storage.sql:17

## GAP-F096-07-02

**Migration 0391 supplies the function behind the connector-app shared-write refusal and is marked not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Detail: Affects: Web viewers of connector-bound apps. Work needed: Confirm production state; apply with the approved process or the route may error.
- Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4,316; apps/web/lib/services/published-artifact-service.ts:631

## GAP-F096-07-03

**Bridge needs a separate sandbox origin; production had none when the audit row was written and the fallback frame has no found bridge.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Detail: Affects: All web viewers. Work needed: Verify live configuration and the fallback path; decide the supported mode.
- Evidence: audit/registers/known-flaws.md:57; apps/web/lib/artifact-sandbox.ts:158

## GAP-F096-07-04

**No per-app storage metering or owner view of personal usage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Detail: Affects: Publishers. Work needed: Add counters if the product wants per-app limits.
- Evidence: apps/web/lib/services/published-site-data-service.ts:8-14

## GAP-F096-07-05

**No offline queue or retry for failed saves.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Detail: Affects: Viewers on weak networks. Work needed: Decide whether the app or the platform retries.
- Evidence: apps/web/features/chat/components/artifacts/artifactRuntimeClient.ts:25

## GAP-F096-07-06

**Brief marks every app n/a; only web runs this, other apps open the browser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome. Work needed: None unless parity is required; state the browser hand-off in the app UI.
- Evidence: docs/product/surface-feature-matrix.md:405-409

## GAP-F096-08-01

**Brief says both items are missing; code shows routes, UI and gates that are switched off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Affects: Testers and planners of web. Work needed: Correct the brief status and decide the release date for the constant.
- Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:47

## GAP-F096-08-02

**No in-page flow for a viewer to connect a missing service.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Affects: Viewers on web. Work needed: Design the sign-in bridge to link the connectors page.
- Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:63

## GAP-F096-08-03

**Per-app caps rely on migration 0391, marked not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Affects: All web viewers using AI in apps. Work needed: Confirm and apply under the approved process.
- Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4

## GAP-F096-08-04

**Not on desktop, mobile, CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Affects: Those apps. Work needed: Only a browser hand-off exists; add if parity is wanted.
- Evidence: docs/product/surface-feature-matrix.md:405-409

## GAP-F096-08-05

**No explanation of which providers are eligible for app runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Affects: Testers. Work needed: Document the route policy in the model-routing page.
- Evidence: apps/web/lib/services/artifact-runtime-service.ts:299

## GAP-F096-09-01

**No custom domains.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Publishers on web. Work needed: Decide scope, DNS flow and certificates.
- Evidence: No route or table found in apps/web/app/api/artifacts

## GAP-F096-09-02

**No view or per-app compute metering and no expiry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Publishers and operators. Work needed: Founder decision on expiry; add counters.
- Evidence: apps/web/lib/services/published-artifact-service.ts:44-47

## GAP-F096-09-03

**Brief says deployment history not applicable and only 2 audiences; code has a version list, restore and an invited audience.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Testers using the brief. Work needed: Update the brief.
- Evidence: apps/web/app/api/artifacts/publish/[token]/versions/route.ts:35; apps/web/db/neon/0372_published_site_viewers.sql:25

## GAP-F096-09-04

**Desktop, VS Code and Chrome cannot publish to a hosted link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Those apps. Work needed: Only if parity is required.
- Evidence: apps/desktop/src/features/artifacts/publishAdapter.ts:13-15; docs/decisions/2026-09-27-founder-decisions.md:116-118

## GAP-F096-09-05

**Brief line references (publish/route.ts:206 and :318) do not exist in the 173-line file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Engineers following the brief. Work needed: Refresh the brief anchors.
- Evidence: apps/web/app/api/artifacts/publish/route.ts

## GAP-F096-09-06

**Production sandbox origin and migration 0391 state are unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Script apps and AI caps. Work needed: Check live configuration.
- Evidence: audit/registers/known-flaws.md:57; apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4

## GAP-F096-09-07

**Known flaw: script artifacts could navigate the renderer frame to an outside address once a separate sandbox origin is set.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Affects: Viewers of published script apps. Work needed: Close before setting the variable, per the register row.
- Evidence: audit/registers/known-flaws.md:57

## GAP-F096-10-01

**Brief calls both registries missing; code has a per-account library and built-in list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Affects: Planners and testers. Work needed: Update brief status to partial.
- Evidence: apps/web/app/api/artifacts/library/route.ts:60; apps/web/db/neon/0373_studio_library_items.sql:19

## GAP-F096-10-02

**No workspace-shared templates or brands.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Affects: Teams on web. Work needed: Product decision and an owner for sharing rules.
- Evidence: apps/web/db/neon/0373_studio_library_items.sql:34-38

## GAP-F096-10-03

**No logos or font files; only three font families.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Affects: Brand users. Work needed: Design asset storage.
- Evidence: packages/contracts/cloud-contracts/src/studio-library.ts:17,25-32

## GAP-F096-10-04

**Generated html and react apps cannot read the brand kit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Affects: App authors. Work needed: Define how tokens reach app code.
- Evidence: No route or injection found

## GAP-F096-10-05

**Built-ins are hard-coded in the client.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Affects: Maintainers. Work needed: Decide whether a served registry is needed.
- Evidence: apps/web/features/chat/components/artifacts/templates/artifact-templates.ts:17

## GAP-F096-10-06

**No other app was found with templates or brands.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome. Work needed: Confirm and decide parity.
- Evidence: not found in the searched code
