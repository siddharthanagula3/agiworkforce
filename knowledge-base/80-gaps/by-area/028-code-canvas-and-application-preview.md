---
id: "GAPS-AREA-028"
type: "gap-list"
title: "Gaps: Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 28. Code Canvas and application preview

96 open gaps that touch this area. Area page: [20-features/028-code-canvas-and-application-preview](../../20-features/028-code-canvas-and-application-preview/README.md).

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

## CMP-V27

**Agent publishes a page or file to the cloud as an artifact**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The editor lists, opens and saves published artifacts but the agent cannot publish one from a session.
- Evidence: apps/extension-vscode/src/features/artifacts/artifactsClient.ts:33 (list only); searched: publish artifact tool in apps/cli/src/

## CMP-W117

**Apps made in chat can call the AI themselves (AI-powered artifacts)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Switched off: AGI_ARTIFACT_AI_ENABLED defaults to 0 until a security review passes, so in-app AI calls answer "not available yet".
- Evidence: apps/web/lib/validate-env.ts:1716; apps/web/lib/artifact-ai.ts:3

## CMP-W122

**Fix button on a broken artifact that sends the error to the assistant**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md), [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: A failed artifact shows the error text only; no control sends the error to the assistant.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3222-3234,3617-3627; searched: Fix with, Try fixing, Send error in apps/web/features/chat/components/artifacts

## CMP-W126

**Run Python in a canvas document or code file**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Code in an artifact is shown and edited, and HTML or React previews run, but Python cannot be run in place.
- Evidence: packages/ui/unified-chat/src/components/ArtifactPanel.tsx (no run for Python); apps/web/lib/code-execution/ is chat tool only

## CMP-WP109

**Run Python from a code block**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-07](../../20-features/021-code-blocks-and-executable-code-presentation/F021-07-run-code-from-the-chat.md), [F021-08](../../20-features/021-code-blocks-and-executable-code-presentation/F021-08-execution-output-panel.md), [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F021-10](../../20-features/021-code-blocks-and-executable-code-presentation/F021-10-retry-stop-and-reset-a-run.md), [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Ordinary code blocks have no Run button The assistant runs code in a cloud sandbox and the reply offers Run again; ordinary code blocks have no Run button.
- Evidence: apps/web/lib/tool-copy.ts:51; searched: Run Python, runCode in features/chat, unified-chat

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

## GAP-AREA028-LW09

**Mobile WebView allows any origin and runs script for HTML and React, while allowing only the default file access setting off. This was seen but not checked against the mobile trust rules.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-028
- Detail: Area 28. Code Canvas and application preview
- Evidence: apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:279-296

## GAP-AREA028-LW10

**VS Code and CLI rows: VS Code's S28.01 is marked done but the file opens read-only; editing happens only after Save into Workspace.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-028
- Detail: Area 28. Code Canvas and application preview
- Evidence: apps/extension-vscode/src/features/artifacts/artifactActions.ts:104-107, :163-208

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

## GAP-CAP-artifacts-and-documents-19

**Fix-with-assistant button on broken artifacts: Fix button not confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-02](../../20-features/026-artifact-container-and-panel/F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md), [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Requirement items: S26.35, S26.36, S28.16
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-24

**Coding tools that publish artifacts and documents: CLI: no reopen key, no permission prompts, no live connector pages, no docs or design commands. VS Code: no publish.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Requirement items: S26.02, S26.05, S28.24, S28.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-25

**Canvas for writing and code in chat: No Python run in a canvas; language-aware editing missing on web and desktop.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Requirement items: S28.01, S28.05, S28.06
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-F028-01-01

**Syntax diagnostics and completion are absent in every editor**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add lint and completion extensions per language and an equivalent on mobile; decide scope for the Tauri textarea.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx imports no lint or autocomplete; brief S28.06 and S28.07

## GAP-F028-01-02

**Brief says mobile editing (S28.01) and web language-aware editing (S28.05) are missing; the code has both**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Affects: Documentation, planning. Work needed: Correct the brief and the audit ledger rows.
- Evidence: ArtifactFullScreen.tsx:880-1221, 2016; ArtifactCodeEditor.tsx:1-30

## GAP-F028-01-03

**Mobile and Tauri desktop editors are plain text with no highlighting or indentation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Affects: Mobile, Desktop Tauri. Work needed: Reuse a language-aware editor or build a mobile one.
- Evidence: ArtifactFullScreen.tsx:2016; ArtifactPanel.tsx:859

## GAP-F028-01-04

**Chrome and VS Code cannot edit an artifact in place**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Affects: Chrome, VS Code. Work needed: Decide whether to add in-place editing or accept hand-off to web or workspace.
- Evidence: artifactPanel.ts:745-749; artifactActions.ts:104-135

## GAP-F028-01-05

**Whether an edited version syncs to the cloud copy is not shown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Detail: Affects: Web, Mobile. Work needed: Trace the sync path and document it.
- Evidence: audit/registers/known-flaws.md:45, 102

## GAP-F028-01-NOTBUILT

**Edit the generated source: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Requirement items: S28.01, S28.05, S28.06, S28.07
- Detail: Web: S28.05, S28.06, S28.07; Desktop: S28.05, S28.06, S28.07; VS Code: S28.01, S28.05, S28.06, S28.07; Chrome: S28.01, S28.05, S28.06, S28.07

## GAP-F028-01-PARTLY

**Edit the generated source: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F028-01](../../20-features/028-code-canvas-and-application-preview/F028-01-edit-the-generated-source.md)
- Requirement items: S28.01

## GAP-F028-02-01

**No project data shape or file tree exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-02](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)
- Detail: Affects: All apps. Work needed: Define a multi-file artifact model, then build tree, create, delete, rename, search.
- Evidence: No tree component found; brief S28.02

## GAP-F028-02-02

**Brief marks VS Code done, but the cited lines are unrelated**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-02](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)
- Detail: Affects: Planning. Work needed: Correct the brief; record VS Code as 'host editor only'.
- Evidence: apps/extension-vscode/package.json:74 (settings list); src/extension.ts:50 (an import); diffDecorationProvider.ts:335-346 (diff proposal text)

## GAP-F028-02-03

**Delete and rename would need confirm and undo**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-02](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)
- Detail: Affects: Any future build. Work needed: Use useConfirmAction and version restore.
- Evidence: AGENTS.md section 9

## GAP-F028-02-NOTBUILT

**Project files: tree, create, delete, rename, search: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F028-02](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)
- Requirement items: S28.02, S28.03, S28.04, S28.08
- Detail: Web: S28.03, S28.04, S28.08; Desktop: S28.03, S28.04, S28.08; Mobile: S28.03, S28.04, S28.08; CLI: S28.02, S28.04; VS Code: S28.02, S28.03, S28.04, S28.08; Chrome: S28.02, S28.03, S28.04, S28.08

## GAP-F028-02-PARTLY

**Project files: tree, create, delete, rename, search: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F028-02](../../20-features/028-code-canvas-and-application-preview/F028-02-project-files-tree-create-delete-rename-search.md)
- Requirement items: S28.02

## GAP-F028-03-01

**Web and Desktop run scripts only when the sandbox address is set; production state is documented as unset**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Detail: Affects: Web, Electron Desktop. Work needed: Redeploy renderer, set the build setting, rebuild, live-check.
- Evidence: audit/prior-audits/chat-security-audit-2026-10-26.md:62; brief S28.10 Unfinished

## GAP-F028-03-02

**A high-severity navigation exfiltration risk is recorded as latent until the sandbox address is set**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Detail: Affects: Web, Chrome. Work needed: Close before switching on, as the register says.
- Evidence: audit/registers/known-flaws.md:57 (WEB-ARTIFACT-NAVIGATION-EXFIL-01)

## GAP-F028-03-03

**Split view, device sizes, theme switch not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Detail: Affects: All apps with preview. Work needed: Design and build toolbar controls.
- Evidence: No control found; briefs S28.09, S28.12, S28.13

## GAP-F028-03-04

**Brief says React preview missing on mobile; code has it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: sandboxedArtifactHtml.ts:194; ArtifactFullScreen.tsx:218

## GAP-F028-03-05

**Runtime scripts come from public hosts, so offline Local preview of React or Mermaid is doubtful**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Detail: Affects: Mobile, Desktop Tauri in Local mode. Work needed: Verify offline behaviour and consider bundling.
- Evidence: artifact-csp.ts:17-22; index.html:208-226

## GAP-F028-03-NOTBUILT

**Preview view options: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Requirement items: S28.11, S28.12, S28.13
- Detail: Web: S28.12, S28.13; Desktop: S28.12, S28.13; Mobile: S28.11, S28.12, S28.13; Chrome: S28.12, S28.13

## GAP-F028-03-PARTLY

**Preview view options: partly built on Web, Desktop, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F028-03](../../20-features/028-code-canvas-and-application-preview/F028-03-preview-view-options.md)
- Requirement items: S28.09, S28.10, S28.11
- Detail: Web S28.10: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact | Web S28.11: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact | Desktop S28.10: switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML a

## GAP-F028-04-01

**Control hidden whenever the sandbox address is unset, which docs say is the production state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-04](../../20-features/028-code-canvas-and-application-preview/F028-04-element-picking-for-edit-requests.md)
- Detail: Affects: Web, Electron Desktop. Work needed: Set the address after the register item is closed, then live-check picking.
- Evidence: ArtifactPreview.tsx:2099; audit/prior-audits/chat-security-audit-2026-10-26.md:62

## GAP-F028-04-02

**No element picking on mobile, Chrome or the Tauri panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-04](../../20-features/028-code-canvas-and-application-preview/F028-04-element-picking-for-edit-requests.md)
- Detail: Affects: Mobile, Chrome, Desktop Tauri. Work needed: Port the picker or accept a gap.
- Evidence: No picker code found

## GAP-F028-04-03

**Brief says missing; code on web is built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-04](../../20-features/028-code-canvas-and-application-preview/F028-04-element-picking-for-edit-requests.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: ArtifactEditRequestLayer.tsx; index.html:383-580

## GAP-F028-04-NOTBUILT

**Element picking for edit requests: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F028-04](../../20-features/028-code-canvas-and-application-preview/F028-04-element-picking-for-edit-requests.md)
- Requirement items: S28.14
- Detail: Mobile: S28.14; Chrome: S28.14

## GAP-F028-05-01

**No console panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: Affects: All apps. Work needed: Forward console output from the renderer and add a drawer.
- Evidence: Renderer has no console message type (index.html message handler); brief S28.15

## GAP-F028-05-02

**Web hides the real error text from the person**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: Affects: Web, Electron Desktop. Work needed: Show a safe excerpt or add a details toggle.
- Evidence: SandboxedIframe.tsx:268-272

## GAP-F028-05-03

**No distinct restart; reload only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: Affects: Web, Mobile, Desktop. Work needed: Decide if reload is enough and record it.
- Evidence: ArtifactPreview.tsx:1753; brief S28.19

## GAP-F028-05-04

**Chrome has no retry control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: Affects: Chrome. Work needed: Add a retry or reload.
- Evidence: artifactPanel.ts:843-860

## GAP-F028-05-05

**Brief says mobile reload is missing; code has Refresh preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: ArtifactFullScreen.tsx:1213

## GAP-F028-05-NOTBUILT

**Preview errors and reload: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Requirement items: S28.15, S28.18, S28.19
- Detail: Web: S28.15; Desktop: S28.15; Mobile: S28.15, S28.18, S28.19; Chrome: S28.15

## GAP-F028-05-PARTLY

**Preview errors and reload: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F028-05](../../20-features/028-code-canvas-and-application-preview/F028-05-preview-errors-and-reload.md)
- Requirement items: S28.16, S28.18, S28.19

## GAP-F028-06-01

**No dependency panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-06](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)
- Detail: Affects: All apps. Work needed: Parse imports and show them; decide how to install.
- Evidence: No component found; S28.17

## GAP-F028-06-02

**No user-visible or user-editable network permissions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-06](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)
- Detail: Affects: All apps. Work needed: Add per-app allow-list with consent, policy built per app, and trust-boundary tests.
- Evidence: artifact-csp.ts is a fixed constant; S28.20

## GAP-F028-06-03

**No secret or config placeholders**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-06](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)
- Detail: Affects: All apps. Work needed: Design a secret store path and masked input; keep values out of model context.
- Evidence: No code found; S28.21

## GAP-F028-06-04

**Known risks around frame navigation and WebRTC or DNS hints weaken the fixed policy**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-06](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)
- Detail: Affects: Web, Chrome. Work needed: Close both before relying on the policy as a network control.
- Evidence: audit/registers/known-flaws.md:57-58

## GAP-F028-06-NOTBUILT

**App dependencies, network and secrets: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F028-06](../../20-features/028-code-canvas-and-application-preview/F028-06-app-dependencies-network-and-secrets.md)
- Requirement items: S28.17, S28.20, S28.21
- Detail: Web: S28.17, S28.20, S28.21; Desktop: S28.17, S28.20, S28.21; Mobile: S28.17, S28.20, S28.21; Chrome: S28.17, S28.20, S28.21

## GAP-F028-07-01

**Desktop, mobile and Chrome cannot run AI or storage in a published app; they open the browser or refuse.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Detail: Affects: Desktop, Mobile, Chrome users. Work needed: Decide whether native surfaces host published apps or keep opening the web page; if they host, add a runtime host per surface.
- Evidence: doc: docs/product/surface-feature-matrix.md:402-410; apps/extension/src/features/side-panel/artifactPanel.ts:849-855

## GAP-F028-07-02

**AI inside apps is off by default and tied to a security review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Detail: Affects: All viewers of published apps. Work needed: Finish the review, then set the switch; record the decision.
- Evidence: apps/web/.env.example:1009-1012

## GAP-F028-07-03

**Per-app cap migration 0391 is marked not applied in its own header while code calls it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Detail: Affects: Billing safety for looping apps. Work needed: Verify applied state with the migration status command and fix the header.
- Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:1-5; apps/web/lib/services/managed-usage-request-service.ts:804

## GAP-F028-07-04

**No Local or own-key route for app AI; no user control for network destinations or secrets (brief S28.20, S28.21 missing).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Detail: Affects: Local and own-key users. Work needed: Product decision on whether app AI may use local models or the user's own key; add an explicit fork with consent if so.
- Evidence: apps/web/app/api/artifacts/runtime/artifact-completion.ts:59-68; doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.20-S28.21

## GAP-F028-07-05

**Draft line numbers for the frame (index.html:255-326, 353-370) are right, but the draft's 'viewer must be signed in' also depends on the page switch; the 5 MiB database check differs from the 4 MiB API limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Detail: Affects: Engineers. Work needed: Pick one limit owner.
- Evidence: apps/web/db/neon/0325_published_artifact_storage.sql:3-18; packages/contracts/cloud-contracts/src/artifact-runtime.ts:10

## GAP-F028-07-NOTBUILT

**AI and saved data inside a published app: not built on Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, Chrome
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md)
- Requirement items: S28.22, S28.23
- Detail: Desktop: S28.22, S28.23; Mobile: S28.22, S28.23; Chrome: S28.22, S28.23

## GAP-F028-08-01

**No zip or project archive on Mobile, CLI, VS Code; Chrome unverified in the brief but no zip found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome users. Work needed: Decide scope and add a per-surface archive or document the limit.
- Evidence: doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.25; apps/cli/src/lib.rs:1359-1430

## GAP-F028-08-02

**The zip is a flat bundle of the panel's artifacts, not a project folder tree.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Detail: Affects: Web users expecting a project layout. Work needed: Add folder structure if a multi-file project concept is introduced (the brief's S28.02 multi-file tree is missing on web).
- Evidence: apps/web/features/chat/utils/downloadArtifacts.ts:104-131

## GAP-F028-08-03

**Two different object-URL lifetimes on web (immediate in ArtifactPreview, 60 seconds in the helper).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Detail: Affects: Web users with slow saves. Work needed: Use the one helper.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1357-1365; apps/web/features/chat/utils/downloadArtifacts.ts:101

## GAP-F028-08-04

**Brief says Chrome 'unverified'; code shows copy and download exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Detail: Affects: Documentation. Work needed: Update the brief status.
- Evidence: apps/extension/src/features/side-panel/artifactPanel.ts:381-386,693-699

## GAP-F028-08-NOTBUILT

**Download and export: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Requirement items: S28.25
- Detail: Mobile: S28.25; CLI: S28.25; VS Code: S28.25

## GAP-F028-08-PARTLY

**Download and export: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md)
- Requirement items: S28.24, S28.25

## GAP-F028-09-01

**No hand-off from web, desktop, mobile or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-09](../../20-features/028-code-canvas-and-application-preview/F028-09-open-in-a-coding-workspace.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome users. Work needed: Choose a design such as a deep link to the editor or a CLI command, then build it.
- Evidence: doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.26

## GAP-F028-09-02

**The CLI 'done' status rests on file writing; artifacts open opens a browser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-09](../../20-features/028-code-canvas-and-application-preview/F028-09-open-in-a-coding-workspace.md)
- Detail: Affects: CLI users. Work needed: Confirm acceptance with the owner.
- Evidence: apps/cli/src/lib.rs:3971-3994

## GAP-F028-09-03

**The brief's line citations for the CLI and VS Code point to the wrong lines (lib.rs:1034, 1944; package.json:593).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-09](../../20-features/028-code-canvas-and-application-preview/F028-09-open-in-a-coding-workspace.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief citations.
- Evidence: apps/cli/src/lib.rs:1371-1397

## GAP-F028-09-04

**What 'Start Work' on a web artifact does was not read; it may relate to coding sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-09](../../20-features/028-code-canvas-and-application-preview/F028-09-open-in-a-coding-workspace.md)
- Detail: Affects: Web users. Work needed: Read the start-work flow and record it.
- Evidence: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2518-2530

## GAP-F028-09-NOTBUILT

**Open in a coding workspace: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F028-09](../../20-features/028-code-canvas-and-application-preview/F028-09-open-in-a-coding-workspace.md)
- Requirement items: S28.26
- Detail: Web: S28.26; Desktop: S28.26; Mobile: S28.26; Chrome: S28.26

## GAP-F028-10-01

**No separate production version with its own URL or domain.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: Affects: All apps (brief S28.28). Work needed: Product decision, then a stable alias or domain feature.
- Evidence: Search of published-artifact-service.ts and the sites settings tab found no slug, domain or production concept

## GAP-F028-10-02

**VS Code cannot publish; Chrome has no publish control and is marked unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Decide scope; add or document.
- Evidence: apps/extension-vscode/src/features/surfaces/index.ts:97-114; apps/extension/src/features/side-panel/artifactPanel.ts

## GAP-F028-10-03

**Web artifact panel has no unpublish; it is only in Settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: Affects: Web users. Work needed: Add an Unpublish control with confirmation next to the link bar.
- Evidence: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:615-645

## GAP-F028-10-04

**Audience set differs: CLI offers public or workspace, web and mobile also have invited (mobile code references an 'invited' state).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: Affects: CLI users. Work needed: Add invited to the CLI.
- Evidence: apps/cli/src/lib.rs:1414; apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:195-199

## GAP-F028-10-05

**The brief's mobile and CLI citations (ArtifactFullScreen.tsx:405, 421; lib.rs:1053; cloud/artifacts.rs:391) do not match current lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Detail: Affects: Documentation. Work needed: Refresh citations.
- Evidence: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:731-770; apps/cli/src/lib.rs:3996-4019

## GAP-F028-10-NOTBUILT

**Publish a preview link: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Requirement items: S28.27, S28.28
- Detail: VS Code: S28.27, S28.28; Chrome: S28.27, S28.28

## GAP-F028-10-PARTLY

**Publish a preview link: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md)
- Requirement items: S28.27, S28.28

## GAP-F028-11-01

**Compare is only previous-version, not any two versions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Detail: Affects: Web and mobile users. Work needed: Add a picker if full compare is required.
- Evidence: ArtifactPreview.tsx:987-989

## GAP-F028-11-02

**The brief says comparison is missing everywhere and mobile rollback missing; code shows both on mobile and compare on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Detail: Affects: Documentation. Work needed: Update brief statuses (S28.29 partial on web and mobile; S28.30 done on mobile).
- Evidence: ArtifactFullScreen.tsx:608-617,811-817; ArtifactPreview.tsx:987-996

## GAP-F028-11-03

**No version history or restore in CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Detail: Affects: Those users. Work needed: Decide scope and build.
- Evidence: apps/cli/src/lib.rs:1359-1430; apps/extension-vscode/src/features/surfaces/index.ts:97-114

## GAP-F028-11-04

**Restore confirmation differs by app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Detail: Affects: Mobile and Tauri users. Work needed: Align or record the reason.
- Evidence: ArtifactFullScreen.tsx:811-817; ArtifactPreview.tsx:1015-1018

## GAP-F028-11-05

**Local-mode web persistence of versions not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Detail: Affects: Local users. Work needed: Read the web store persistence code.
- Evidence: unknown

## GAP-F028-11-NOTBUILT

**Version history: compare and roll back: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Requirement items: S28.29, S28.30
- Detail: Web: S28.29; Desktop: S28.29; CLI: S28.29, S28.30; VS Code: S28.29, S28.30; Chrome: S28.29, S28.30

## GAP-F028-11-PARTLY

**Version history: compare and roll back: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F028-11](../../20-features/028-code-canvas-and-application-preview/F028-11-version-history-compare-and-roll-back.md)
- Requirement items: S28.30

## GAP-F028-12-01

**The brief says fork (S28.31) is missing on every app; the web has 'Save a copy to my chats'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)
- Detail: Affects: Documentation and web users. Work needed: Update the brief; decide whether a linked fork is wanted.
- Evidence: apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:221-231

## GAP-F028-12-02

**The brief says viewer sign-in for connected apps (S28.32) is missing; web has a viewer-consent flow that uses the viewer's own connections, but connectors are not released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)
- Detail: Affects: Web viewers. Work needed: Release connectors; add an in-app connect step.
- Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:55-84

## GAP-F028-12-03

**No copy or consent flow on Desktop, Mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)
- Detail: Affects: Those users. Work needed: Decide hosting versus deep link.
- Evidence: doc: docs/product/surface-feature-matrix.md:402-410

## GAP-F028-12-04

**Copy keeps no link to the source and carries no storage or connector bindings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)
- Detail: Affects: People who copy an app that uses saved data or connectors. Work needed: Define what a fork carries and implement it.
- Evidence: apps/web/features/chat/lib/copy-shared-artifact.ts:61-112

## GAP-F028-12-NOTBUILT

**Shared apps: fork and viewer sign-in: not built on Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F028-12](../../20-features/028-code-canvas-and-application-preview/F028-12-shared-apps-fork-and-viewer-sign-in.md)
- Requirement items: S28.31, S28.32
- Detail: Desktop: S28.31, S28.32; Mobile: S28.31, S28.32; CLI: S28.31; VS Code: S28.31; Chrome: S28.31, S28.32
