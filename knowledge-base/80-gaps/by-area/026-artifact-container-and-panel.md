---
id: "GAPS-AREA-026"
type: "gap-list"
title: "Gaps: Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 26. Artifact container and panel

118 open gaps that touch this area. Area page: [20-features/026-artifact-container-and-panel](../../20-features/026-artifact-container-and-panel/README.md).

## CMP-C609

**Comments on shared artifacts answered by the agent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Ours CLI has /artifacts but does not watch artifact comments or reply to them.
- Evidence: searched: artifact comment, watch in apps/cli/src

## CMP-C82

**Artifact pages that read live data through connectors**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: Published pages are static content; no live connector data.
- Evidence: apps/cli/src/cloud/artifacts.rs; searched: connector in cloud/artifacts.rs

## CMP-C83

**Artifact permission prompt, auto-open and off switches**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: The CLI does not ask before publish beyond the command itself and has no artifact on/off or auto-open setting.
- Evidence: apps/cli/src/lib.rs:1399; searched: enableArtifact, ARTIFACT_AUTO_OPEN in apps/cli/src

## CMP-C84

**Create living documents (/docs, Docs templates, Docs connector)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: No /docs command; the CLI only reads attached documents.
- Evidence: apps/cli/src/documents.rs:1-25; searched: "/docs" in apps/cli/src

## CMP-C85

**Design canvas and design system commands (/design, /design-sync)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: No /design or /design-sync command in the terminal.
- Evidence: apps/cli/src/searched: /design, design-sync in apps/cli/src

## CMP-C86

**Reopen the latest artifact with a key and a session pill**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: No shortcut or on-screen pill reopens the latest artifact.
- Evidence: apps/cli/src/searched: Ctrl+], artifact pill in tui

## CMP-CP48

**Publish the agent's own work as a private interactive page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The agent cannot publish a file from the session agi artifacts publish shares an artifact already in the account; the agent cannot publish a file from the session.
- Evidence: apps/cli/src/lib.rs:1399-1408; cloud/artifacts.rs:451-497

## CMP-CP49

**Read an artifact shared with you**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: Shared pages from others are not opened agi artifacts show prints an account artifact's content; shared pages from others are not opened.
- Evidence: apps/cli/src/cloud/artifacts.rs:400-450

## CMP-MP102

**Artifacts start private and sharing is set later**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Default-private rules are not stated Artifacts are saved to the user's library and shared links are managed in settings, but default-private rules are not stated.
- Evidence: app/(app)/settings/shared-links.tsx; src/features/artifacts/store.ts

## CMP-MP38

**Artifacts tab for everything the assistant built**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md), [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: No Artifacts entry in the side menu No Artifacts entry in the side menu; artifacts open from the Library Artifacts filter, Settings Capabilities, search and notifications into a gallery.
- Evidence: apps/mobile/src/features/artifacts/index.tsx:96; apps/mobile/src/features/settings/capabilities/index.tsx:164; apps/mobile/src/features/library/index.tsx:516

## CMP-MP40

**Filter artifacts by scope**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: No separate scope filter Library filters by kind (Code, Charts, Research, Documents) and shows only the current mode account; no separate scope filter.
- Evidence: apps/mobile/src/features/library/index.tsx:93; :323

## CMP-V27

**Agent publishes a page or file to the cloud as an artifact**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The editor lists, opens and saves published artifacts but the agent cannot publish one from a session.
- Evidence: apps/extension-vscode/src/features/artifacts/artifactsClient.ts:33 (list only); searched: publish artifact tool in apps/cli/src/

## CMP-W119

**Certified queries reused across dashboards**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Detail: No reusable approved queries for dashboards.
- Evidence: searched: certified query in apps/web, packages/ui/unified-chat

## CMP-W122

**Fix button on a broken artifact that sends the error to the assistant**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md), [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: A failed artifact shows the error text only; no control sends the error to the assistant.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3222-3234,3617-3627; searched: Fix with, Try fixing, Send error in apps/web/features/chat/components/artifacts

## CMP-W355

**Site co-editing and editor role**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: Sites are owner-only; invited people are view-only.
- Evidence: apps/web/features/sites/components/SiteViewersEditor.tsx; searched: co-edit, editor in features/sites

## CMP-W356

**Sites: transfer ownership of a site to another person**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: A site stays with its publisher; ownership transfer exists only for workspaces.
- Evidence: searched: transferOwner, transfer ownership in apps/web/features/sites, apps/web/app/api/artifacts (only apps/web/lib/services/organization-seat-service.ts:100 for workspaces)

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

## CMP-WP105

**Designs: edit an HTML design with AI on the selected part, brief dialog, replace images**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-08](../../20-features/027-document-and-writing-editor/F027-08-selection-actions.md), [F030-07](../../20-features/030-presentation-workspace/F030-07-ai-edits-to-slides.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md), [F096-10](../../20-features/096-artifact-and-generated-application-components/F096-10-templates-and-design-system-assets.md)
- Detail: There is no Design destination or free on-canvas drag editing HTML designs get a Design brief dialog, Edit with AI on a selection and image replacement; there is no Design destination or free on-canvas drag editing.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:23; apps/web/features/chat/components/artifacts/design/design-brief.ts:2

## CMP-WP108

**Pages with comments**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md), [F027-09](../../20-features/027-document-and-writing-editor/F027-09-suggestions-tracked-changes-comments-and-presence.md), [F096-03](../../20-features/096-artifact-and-generated-application-components/F096-03-collaboration-comments-and-edit-suggestions.md)
- Detail: Only the owner can comment, not viewers Artifacts have anchored, resolvable comment threads where the assistant replies; only the owner can comment, not viewers.
- Evidence: apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx:19; apps/web/lib/services/artifact-comment-service.ts:42

## CMP-WP266

**Artifact roles: view, comment and edit**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Detail: No commenter or editor role was found Invited viewers of a published page are view-only; no commenter or editor role was found.
- Evidence: apps/web/app/api/artifacts/publish/[token]/viewers/route.ts:43; features/sites/components/SiteViewersEditor.tsx

## CMP-WP267

**Comments on shared artifacts, with Send to Claude**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Viewer comments with an assistant thread were not found Artifacts have a comments route and select-an-element change requests for the author; viewer comments with an assistant thread were not found.
- Evidence: apps/web/app/api/artifacts/[artifactId]/comments/route.ts; features/chat/components/artifacts/ArtifactEditRequestLayer.tsx:13

## CMP-WP270

**Slides: shared editing, comments and request edits**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: No shared live editing or mentions Slide artifacts allow select-an-element change requests, but no shared live editing or mentions.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1945; ArtifactEditRequestLayer.tsx:13

## CMP-WP84

**Largest single file in chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Paid plans take 500 MiB; Free and Basic take 25 MiB Paid plans take 500 MiB; Free and Basic take 25 MiB.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2,66-67; types/src/billing-catalog.ts:548-577,617

## CMP-WP91

**Artifacts as their own destination in the sidebar**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Detail: No Artifacts item in the sidebar: /chat/artifacts redirects to the Artifacts tab of Library No Artifacts item in the sidebar: /chat/artifacts redirects to the Artifacts tab of Library.
- Evidence: apps/web/app/chat/artifacts/page.tsx:8; apps/web/shared/components/layout/app-nav-items.ts:114

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

## GAP-AREA026-LW04

**Saving can be turned off when browser storage is full. Then artifacts are kept only in memory, so reopening after a reload (S26.07) can fail, and the user is not told.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-026
- Detail: Area 26. Artifact container and panel
- Evidence: apps/web/features/chat/stores/artifacts-store.ts:528-590

## GAP-AREA026-LW05

**Odd code: a variable is read only to silence a lint warning in the deep-link effect.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-026
- Detail: Area 26. Artifact container and panel
- Evidence: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:637-640

## GAP-CAP-artifacts-and-documents-01

**Artifact side panel for standalone outputs: Mobile has no docked panel or tabs (by design on a phone). Sidebar destination is only partial on web. At 390 px wide the web panel header overlaps (version box over Download and Comments).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Requirement items: S26.01, S26.05, S26.08, S26.09, S26.10, S26.12, S26.13, S26.40
- Detail: Claude yes, ChatGPT partly; AGI partly built

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

## GAP-CAP-artifacts-and-documents-18

**Live data from connected apps: Viewer-bound authentication bridge missing; connectors gated.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md), [F096-08](../../20-features/096-artifact-and-generated-application-components/F096-08-connected-data-for-apps-services-and-viewer-sign-i.md)
- Requirement items: S26.33, S26.34, S28.32, S96.19
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-19

**Fix-with-assistant button on broken artifacts: Fix button not confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md), [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Requirement items: S26.35, S26.36, S28.16
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-23

**Artifact library, gallery and deletion safety: Observed: the 'Where your artifacts are saved' card pushes the preview below the fold and files show an UNKNOWN badge.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Requirement items: S26.26, S26.38
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-artifacts-and-documents-24

**Coding tools that publish artifacts and documents: CLI: no reopen key, no permission prompts, no live connector pages, no docs or design commands. VS Code: no publish.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Requirement items: S26.02, S26.05, S28.24, S28.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-26

**Plan limits and usage cost of generated files: Free account in W-15 got a plain chat with no message that Work is unavailable.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S26.37, S33.19, S96.24
- Detail: Claude yes, ChatGPT yes; AGI unknown

## GAP-CAP-sharing-and-collaboration-11

**Artifact sharing: private by default, audiences by plan: Audit web-D P2: a suspended owner's content stays readable through invited and workspace links (apps/web/lib/services/published-site-viewer-service.ts:148).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Requirement items: S26.16, S26.31, S26.32
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-sharing-and-collaboration-12

**Artifact roles: view, comment, edit: No commenter or editor role.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Requirement items: S26.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-13

**Invite people to an artifact by email: None known for view role.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Requirement items: S26.31
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-sharing-and-collaboration-14

**Comments on shared artifacts and agent replies: Viewer comments with an assistant thread not found; inline comments missing on all apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Requirement items: S26.18, S26.19
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-24

**Hosted sites: audience, outside viewers, editors: No site editor role, no owner transfer. Public gallery missing on mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Requirement items: S107.05, S26.31
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-F026-01-01

**Brief says CLI and VS Code have no card; confirmed. They have list and open commands only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide whether a terminal or editor needs an in-session notice that a turn made artifacts
- Evidence: cloud/artifacts.rs:660-690; artifactsTree.ts:32-59

## GAP-F026-01-02

**Mobile has no '+N more' or 'Download all'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Detail: Affects: Mobile. Work needed: Add a bulk save control if parity is wanted
- Evidence: MessageBubble.tsx:2804-2812 maps every card with no cap or bulk action

## GAP-F026-01-03

**The web brief says reload keeps artifacts in browser storage only; the code also syncs to the account, so the brief wording is incomplete**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Detail: Affects: Web, Desktop. Work needed: Correct the brief; no code change
- Evidence: use-artifact-cloud-sync.ts:19-60; artifacts-store.ts:1054-1068

## GAP-F026-01-04

**Panel open state is not kept across reload [inferred]**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Detail: Affects: Web. Work needed: Confirm in a browser whether closed or open state survives a reload
- Evidence: artifacts-store.ts:608-625 persists artifacts, versions and selection

## GAP-F026-01-05

**Brief code line numbers are stale (InlineArtifactCards.tsx has 88 lines, brief cites :364)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief
- Evidence: InlineArtifactCards.tsx length 88

## GAP-F026-01-NOTBUILT

**Artifact cards in chat, opening, closing, reopening: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Requirement items: S26.01
- Detail: CLI: S26.01; VS Code: S26.01

## GAP-F026-01-PARTLY

**Artifact cards in chat, opening, closing, reopening: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md)
- Requirement items: S26.02, S26.03, S26.05, S26.06, S26.07

## GAP-F026-02-01

**Mobile loading state is partial (indicator only when showsLoading is set); brief says missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Detail: Affects: Mobile. Work needed: Confirm every viewer call passes showsLoading, or make it the default
- Evidence: SafeArtifactPreview.tsx:83,191,304

## GAP-F026-02-02

**CLI and VS Code have no lifecycle state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide whether a notice is needed
- Evidence: cloud/artifacts.rs:400-450 reads finished artifacts only

## GAP-F026-02-03

**Chrome shows no stopped-artifact banner in the code opened**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Detail: Affects: Chrome. Work needed: Check a stopped reply in the side panel
- Evidence: artifactPanel.ts:298-306 only has a streaming flag

## GAP-F026-02-04

**Mobile 'Failed' depends on a message stream-error flag only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Detail: Affects: Mobile. Work needed: Verify failed versus stopped on a real provider error
- Evidence: StreamingArtifactCard.tsx:65

## GAP-F026-02-NOTBUILT

**Lifecycle state, live updates, error and recovery panels: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Requirement items: S26.04, S26.35, S26.36, S26.39
- Detail: Mobile: S26.36; CLI: S26.04; VS Code: S26.04, S26.35, S26.36, S26.39

## GAP-F026-02-PARTLY

**Lifecycle state, live updates, error and recovery panels: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md)
- Requirement items: S26.35, S26.36, S26.39

## GAP-F026-03-01

**The first draft said keyboard resize was not found; it exists (arrows, Home, End)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Detail: Affects: Web, Desktop. Work needed: None; correct the draft
- Evidence: SidePanelResizeHandle.tsx:39-52

## GAP-F026-03-02

**Mobile has no docked, tabbed or detached view (brief: missing for S26.08, S26.11, S26.13)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Detail: Affects: Mobile. Work needed: Likely by design on a phone; confirm
- Evidence: ArtifactFullScreen.tsx:1278

## GAP-F026-03-03

**Chrome has no tab strip**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Detail: Affects: Chrome. Work needed: Decide if needed
- Evidence: artifactPanel.ts:703-760 shows one selected artifact

## GAP-F026-03-04

**No pop-up blocked message on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Detail: Affects: Web, Desktop. Work needed: Check the return value and tell the user
- Evidence: ArtifactPreview.tsx:1749

## GAP-F026-03-05

**The brief marks CLI and VS Code layout items 'built' but cites unrelated code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Detail: Affects: CLI, VS Code. Work needed: Correct the brief statuses to not applicable
- Evidence: artifactActions.ts:104-135 is a read-only open; CLI has no layout

## GAP-F026-03-NOTBUILT

**Viewer layout: docked panel, resize, full screen, detached window, tabs, switching: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Requirement items: S26.08, S26.11, S26.13
- Detail: Mobile: S26.08, S26.11, S26.13

## GAP-F026-03-PARTLY

**Viewer layout: docked panel, resize, full screen, detached window, tabs, switching: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md)
- Requirement items: S26.08, S26.09, S26.10, S26.11, S26.12, S26.13, S26.40

## GAP-F026-04-01

**Brief says mobile direct edit missing; code has it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Detail: Affects: Mobile. Work needed: Correct the brief
- Evidence: ArtifactFullScreen.tsx:897,1221,1937-2000

## GAP-F026-04-02

**No visible 'Read-only' state or reason on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Detail: Affects: Web, Desktop. Work needed: Add a label if required
- Evidence: No such wording found in the artifacts folder

## GAP-F026-04-03

**Shared-copy read-only state unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Detail: Affects: Web. Work needed: Open apps/web/app/shared-artifact and check controls
- Evidence: Shared viewer not opened

## GAP-F026-04-04

**Chrome, CLI, VS Code have no edit by design or omission**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Decide whether to add
- Evidence: artifactPanel.ts:759-760; artifactActions.ts:89

## GAP-F026-04-NOTBUILT

**Preview, source view and read-only mode: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Requirement items: S26.15
- Detail: Mobile: S26.15; CLI: S26.15; VS Code: S26.15

## GAP-F026-04-PARTLY

**Preview, source view and read-only mode: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md)
- Requirement items: S26.14, S26.15, S26.16

## GAP-F026-05-01

**Compare picks only the previous version, not any two versions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Detail: Affects: Web, Desktop, mobile. Work needed: Add a base-version choice
- Evidence: ArtifactPreview.tsx:993-997

## GAP-F026-05-02

**Brief marks compare missing though a changes view exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Detail: Affects: Documentation. Work needed: Update the brief to partial
- Evidence: ArtifactChangesView.tsx; ArtifactPreview.tsx:2336-2341

## GAP-F026-05-03

**Mobile history is capped at 20 versions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Detail: Affects: Mobile. Work needed: Explain or raise
- Evidence: store.ts:45,177

## GAP-F026-05-04

**CLI, VS Code and Chrome have no versions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide scope
- Evidence: artifactActions.ts; cloud/artifacts.rs; artifactPanel.ts

## GAP-F026-05-05

**Whether each older version reaches the account is unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Detail: Affects: All synced surfaces. Work needed: Read collectArtifactPushBatch and the sync route
- Evidence: artifacts-store.ts sync items not fully read

## GAP-F026-05-NOTBUILT

**Versions: pick, step, compare, restore: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Requirement items: S26.20, S26.21, S26.22, S26.23
- Detail: Web: S26.22; Desktop: S26.22; Mobile: S26.22; CLI: S26.20, S26.21, S26.22, S26.23; VS Code: S26.20, S26.21, S26.22, S26.23; Chrome: S26.20, S26.21, S26.22, S26.23

## GAP-F026-05-PARTLY

**Versions: pick, step, compare, restore: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-05](../../20-features/026-artifact-container-and-panel/F026-05-versions-pick-step-compare-restore.md)
- Requirement items: S26.20, S26.21, S26.23

## GAP-F026-06-01

**Chrome copy and export are present though the brief says unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-06](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)
- Detail: Affects: Chrome. Work needed: Update the brief
- Evidence: artifactPanel.ts:695-699,1049-1058

## GAP-F026-06-02

**PDF export boundary unknown (device or server)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-06](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)
- Detail: Affects: Web, Desktop. Work needed: Read the PDF path and state where it runs
- Evidence: document-export-service.ts read only for docx

## GAP-F026-06-03

**CLI and VS Code export source text only, no formats**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-06](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide whether formats are needed
- Evidence: lib.rs:3954-3962; artifactActions.ts:200

## GAP-F026-06-04

**VS Code copy has no failure message if the clipboard write throws**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-06](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)
- Detail: Affects: VS Code. Work needed: Wrap in a handler
- Evidence: artifactActions.ts:157-160

## GAP-F026-06-PARTLY

**Copy and export: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-06](../../20-features/026-artifact-container-and-panel/F026-06-copy-and-export.md)
- Requirement items: S26.29, S26.30

## GAP-F026-07-01

**Visibility is not shown on web cards, transcript cards or the gallery, only in the viewer and Settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: Web and Electron desktop users; brief S26.32 says 'wherever an artifact is shown'.. Work needed: Add a visibility chip to web cards using the publication lookup, as mobile does.
- Evidence: No private or audience label in InlineArtifactCards.tsx, ArtifactCard.tsx, GalleryClient.tsx; viewer-only at ArtifactPreview.tsx:3010-3060.

## GAP-F026-07-02

**No unpublish control in the web viewer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: Web and Electron desktop.. Work needed: Add Unpublish to the link bar with the existing confirm text.
- Evidence: Unpublish exists only in apps/web/features/settings/sections/PublishedArtifactsSection.tsx:634-644.

## GAP-F026-07-03

**Renaming does not update the published title.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: Any user who renames after publishing.. Work needed: Call PATCH with title after a rename of a published artifact.
- Evidence: Server supports title PATCH ([token]/route.ts:195); client sends only visibility (publishArtifactClient.ts:186).

## GAP-F026-07-04

**CLI cannot choose or manage the 'invited' audience and has no viewer commands.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: CLI users.. Work needed: Either document it as intentional or add commands.
- Evidence: apps/cli/src/cloud/artifacts.rs:560-566.

## GAP-F026-07-05

**Brief and founder decision disagree with the mobile code about mobile sharing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: Mobile users and planners.. Work needed: Owner decision: keep mobile controls and update the decision, or remove them.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:284-292 vs ArtifactFullScreen.tsx:731-805.

## GAP-F026-07-06

**Chrome extension has no state display or publish; the brief marks it unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: Chrome users.. Work needed: Decide whether Chrome needs it; if not, record 'n/a'.
- Evidence: No publish code under apps/extension/src.

## GAP-F026-07-07

**No unpublish audit event found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: Security review.. Work needed: Confirm and add an audit event if intended.
- Evidence: [token]/route.ts:55-79 has no recordAuditEvent while publish does (publish/route.ts:100).

## GAP-F026-07-08

**No live run of any sharing flow is recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Detail: Affects: All apps.. Work needed: Run the scenarios against the running product.
- Evidence: audit/live-check/026-artifact-container-and-panel.md lists chrome cells only; no run results for web sharing found.

## GAP-F026-07-NOTBUILT

**Sharing and visibility: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Requirement items: S26.31, S26.32
- Detail: Chrome: S26.31, S26.32

## GAP-F026-07-PARTLY

**Sharing and visibility: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md)
- Requirement items: S26.31, S26.32

## GAP-F026-08-01

**No control named 'Associate with project' or 'Continue in a new chat'; behaviour differs from the brief (copy to project knowledge; Work seeds the current chat).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: Web and Electron desktop.. Work needed: Decide the intended behaviour and either add the controls or update the brief.
- Evidence: ArtifactPreview.tsx:2520-2559; launch.ts:66-73.

## GAP-F026-08-02

**Library items saved from an artifact lose their conversation link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: Web users using Library Open chat.. Work needed: Send conversationId.
- Evidence: ArtifactPreview.tsx:1449-1451 vs library/route.ts:219-221.

## GAP-F026-08-03

**Mobile has no Duplicate, Rename or project save in the viewer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: Mobile.. Work needed: Build or record as not planned.
- Evidence: Brief S26.24-S26.27 mobile missing; no code found.

## GAP-F026-08-04

**VS Code has none of these; Chrome only has open-on-web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: VS Code, Chrome.. Work needed: Record as not applicable or build.
- Evidence: No code found.

## GAP-F026-08-05

**Brief says rename is missing on every app; the web code and tests exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: Documentation.. Work needed: Update the ledger row.
- Evidence: ArtifactPreview.rename.test.tsx; ArtifactTitleField.tsx.

## GAP-F026-08-06

**Local-origin artifacts can be sent to the Library from web without a privacy check in the menu code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: Local and own-key users on web.. Work needed: Verify against AGENTS.md section 6 and add a check or confirmation.
- Evidence: ArtifactPreview.tsx:2537-2548 has no mode condition.

## GAP-F026-08-07

**Chrome brief citation artifactsClient.ts:145 does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Detail: Affects: Brief accuracy.. Work needed: Fix the citation.
- Evidence: apps/extension/src/features/cloud-bridge/artifactsClient.ts has 5 lines.

## GAP-F026-08-NOTBUILT

**Library, projects, copies, and handoff to another chat: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Requirement items: S26.24, S26.25, S26.26, S26.27, S26.28, S26.38
- Detail: Web: S26.25; Desktop: S26.25; CLI: S26.24, S26.25, S26.26, S26.28; VS Code: S26.24, S26.25, S26.26, S26.27, S26.28, S26.38; Chrome: S26.25

## GAP-F026-08-PARTLY

**Library, projects, copies, and handoff to another chat: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F026-08](../../20-features/026-artifact-container-and-panel/F026-08-library-projects-copies-and-handoff-to-another-cha.md)
- Requirement items: S26.24, S26.26, S26.27, S26.28

## GAP-F026-09-01

**Brief marks all three items missing; web has them built, so the ledger is wrong.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: Documentation, planning.. Work needed: Update the audit ledger and brief.
- Evidence: ArtifactSelectionToolbar.tsx, ArtifactCommentsPanel.tsx, 0369_artifact_comments.sql.

## GAP-F026-09-02

**No real queue of selection edits (S26.19 asks for collected requests).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: Web and desktop users.. Work needed: Add a pending list or record that comment batching satisfies S26.19.
- Evidence: requestSelectionEdit sends immediately (ArtifactPreview.tsx:2177-2205).

## GAP-F026-09-03

**Mobile lacks selection edit and comments.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: Mobile.. Work needed: Build or record as not planned.
- Evidence: Only ASK_FOR_CHANGES_LABEL and slide ask exist.

## GAP-F026-09-04

**CLI, VS Code and Chrome have no edit requests or comments.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: Those apps.. Work needed: Record as not applicable or build.
- Evidence: No code found.

## GAP-F026-09-05

**Comments may upload text from Local-mode artifacts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: Local and own-key users on web and Electron.. Work needed: Verify live, then gate or warn.
- Evidence: No privacy check at ArtifactPreview.tsx:2213 or in the comments client.

## GAP-F026-09-06

**Comments are private to the author, so a shared or published artifact cannot show them to others.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: Teams.. Work needed: Decide whether shared comments are wanted.
- Evidence: Row-level policy by user id (0369_artifact_comments.sql:43-47).

## GAP-F026-09-07

**No recorded live run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Detail: Affects: All.. Work needed: Run scenarios.
- Evidence: No result file found.

## GAP-F026-09-NOTBUILT

**Edit requests: selection, comments, collected requests (not built per brief): not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F026-09](../../20-features/026-artifact-container-and-panel/F026-09-edit-requests-selection-comments-collected-request.md)
- Requirement items: S26.17, S26.18, S26.19
- Detail: CLI: S26.17, S26.18, S26.19; VS Code: S26.17, S26.18, S26.19; Chrome: S26.17, S26.18, S26.19

## GAP-F026-10-01

**Connected apps are switched off by the release state, so S26.33 and S26.34 cannot be used by anyone yet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Detail: Affects: All web users.. Work needed: Release decision by the owner; then live verification.
- Evidence: connector-release.ts:14; artifact-connector-gate.ts:20-25.

## GAP-F026-10-02

**No per-artifact usage display on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Detail: Affects: All apps (S26.37).. Work needed: Add a usage read endpoint and a strip line; confirm migration 0391 is applied.
- Evidence: artifact_subject has no reader in app code; only reservation and tests.

## GAP-F026-10-03

**Status is coarse (ready or needs connection), not 'healthy or unhealthy' per source.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Detail: Affects: Web.. Work needed: Add per-connector state if required.
- Evidence: live-artifact-contract.ts:20-21,50-60.

## GAP-F026-10-04

**Brief and ledger say missing for items that exist in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Detail: Affects: Documentation.. Work needed: Update ledger notes.
- Evidence: LiveArtifactControls.tsx.

## GAP-F026-10-05

**Migration 0391 header says not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Detail: Affects: Usage limits.. Work needed: Check the migration status table or run db status.
- Evidence: 0391 header line 3.

## GAP-F026-10-06

**Mobile, CLI, VS Code and Chrome have none; the matrix says they do not render published apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Detail: Affects: Those apps.. Work needed: Record as not applicable.
- Evidence: surface-feature-matrix.md:402-410.

## GAP-F026-10-NOTBUILT

**Connected-data status, refresh, and artifact usage (not built per brief): not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md)
- Requirement items: S26.33, S26.34, S26.37
- Detail: Mobile: S26.33, S26.34, S26.37; CLI: S26.37; VS Code: S26.37; Chrome: S26.33, S26.34, S26.37
