---
id: "GAPS-AREA-037"
type: "gap-list"
title: "Gaps: Notebook and knowledge-workspace product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 37. Notebook and knowledge-workspace product

77 open gaps that touch this area. Area page: [20-features/037-notebook-and-knowledge-workspace-product](../../20-features/037-notebook-and-knowledge-workspace-product/README.md).

## GAP-AREA037-LW09

**Project context is loaded only when the project belongs to the calling user; the query filters by user_id, so a shared project may not ground chats for a shared editor or viewer. Not confirmed, because the turn code may use another path.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-037
- Detail: Area 37. Notebook and knowledge-workspace product
- Evidence: apps/web/lib/services/project-context-service.ts:199-201

## GAP-AREA037-LW10

**Studio asks for quiz, flashcard and infographic blocks, but the code I read does not show that the chat renders them as interactive pieces.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-037
- Detail: Area 37. Notebook and knowledge-workspace product
- Evidence: apps/web/features/projects/components/ProjectStudio.tsx:81-115

## GAP-F037-01-01

**Chrome has no project list or create screen; the brief status 'unverified' is not settled and live checks are queued.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-01](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)
- Detail: Affects: Chrome users. Work needed: Decide the Chrome scope (picker only, per D-2026-09-28-23) and record it in the surface matrix, or build a read-only list; run the queued live-web check.
- Evidence: apps/extension/src/side_panel.ts:12323, 14479; audit/live-check/037-notebook-and-knowledge-workspace-product.md

## GAP-F037-01-02

**CLI list does not include projects shared with the user.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-01](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)
- Detail: Affects: CLI users in team workspaces. Work needed: Either list shared projects through GET /api/projects or state the limit in the command help.
- Evidence: apps/web/app/api/projects/sync/route.ts:44-56

## GAP-F037-01-03

**Projects created in mobile Local mode are not in the account, so the claim 'every app sees the same notebook' holds only for Cloud mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-01](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)
- Detail: Affects: Mobile Local-mode users. Work needed: Keep it as the Local boundary but label it in the UI; consider an explicit 'move to account' action.
- Evidence: apps/mobile/src/features/projects/store.ts:421-436

## GAP-F037-01-04

**Term mismatch: the product says Project, the brief says Notebook.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-01](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)
- Detail: Affects: Testers and docs. Work needed: Pick one term in the knowledge base and the product copy.
- Evidence: apps/web/app/chat/projects/page.tsx:247

## GAP-F037-01-05

**Failure state for the create dialog on web was not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-01](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)
- Detail: Affects: Web users. Work needed: Read and test the failure message.
- Evidence: CreateProjectDialog.tsx:70-100 (submit state exists; message text not opened)

## GAP-F037-01-PARTLY

**Notebook list and creation: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F037-01](../../20-features/037-notebook-and-knowledge-workspace-product/F037-01-notebook-list-and-creation.md)
- Requirement items: S37.01, S37.02

## GAP-F037-02-01

**A shared member's chat may fail or lack the owner's instructions because loadProjectContext only matches the project owner.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-02](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)
- Detail: Affects: Members of shared projects on web and every app that chats through the server. Work needed: Run a shared-member chat to see the result; if broken, authorize the project through the shared scope and add a test.
- Evidence: apps/web/lib/services/project-context-service.ts:205-210; request-processor.ts:3855-3880

## GAP-F037-02-02

**Chrome has no way to edit a project.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-02](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)
- Detail: Affects: Chrome users. Work needed: Record as out of scope (D-2026-09-28-23) or build.
- Evidence: No code found in apps/extension/src/features/cloud-bridge/projectsClient.ts (list only)

## GAP-F037-02-03

**CLI chat use of instructions (brief cites apps/cli/src/cloud/mod.rs:589 and agent/mod.rs:605) was not opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-02](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)
- Detail: Affects: CLI users. Work needed: Open and confirm, then add test coverage.
- Evidence: Brief S37.15 code list

## GAP-F037-02-04

**No visible length counter for the 200/2000/10000 limits was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-02](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)
- Detail: Affects: All edit surfaces. Work needed: Add counters or inline errors.
- Evidence: ProjectSettingsDialog.tsx:275-325 shows placeholders only

## GAP-F037-02-NOTBUILT

**Title, description and instructions: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F037-02](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)
- Requirement items: S37.03, S37.15
- Detail: Chrome: S37.03, S37.15

## GAP-F037-02-PARTLY

**Title, description and instructions: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F037-02](../../20-features/037-notebook-and-knowledge-workspace-product/F037-02-title-description-and-instructions.md)
- Requirement items: S37.03, S37.15

## GAP-F037-03-01

**Which part of sharing is the 'ui' gap the brief lists for web and desktop is not identified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Detail: Affects: Web and Desktop. Work needed: Ask the audit owner or run the live check, then name the gap.
- Evidence: Brief S37.34 Unfinished; ProjectShareDialog.tsx reads complete for its states

## GAP-F037-03-02

**Brief says mobile sync is 'flag-off'; the code shows the flag true.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Detail: Affects: Mobile. Work needed: Update the brief or find the intended flag.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:4

## GAP-F037-03-03

**Sync pull omits shared projects.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Detail: Affects: CLI, mobile sync. Work needed: Confirm mobile gets shared projects from the sharing overview only (SharedWithYouSection) and document it.
- Evidence: apps/web/app/api/projects/sync/route.ts:44-56

## GAP-F037-03-04

**No sharing on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Detail: Affects: Those apps. Work needed: None required by decision; list in the matrix.
- Evidence: No code found; decisions D-2026-09-28-23, -25

## GAP-F037-03-05

**Shared member chat grounding may be blocked (owner-only project query).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Detail: Affects: Shared members. Work needed: Run and fix if broken.
- Evidence: project-context-service.ts:205-210

## GAP-F037-03-06

**Web editor sees a 'Retry indexing' button that the server refuses for non-owners.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Detail: Affects: Editors on shared projects. Work needed: Hide the retry for editors or allow it server-side.
- Evidence: SourcesPanel.tsx:746 (canRetry={!readOnly}) vs reindex/route.ts:36 (p.user_id = $3)

## GAP-F037-03-NOTBUILT

**Sharing and cross-app sync: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F037-03](../../20-features/037-notebook-and-knowledge-workspace-product/F037-03-sharing-and-cross-app-sync.md)
- Requirement items: S37.34
- Detail: Mobile: S37.34; CLI: S37.34; VS Code: S37.34; Chrome: S37.34

## GAP-F037-04-01

**No per-source checkbox to choose which sources ground an answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Detail: Affects: All apps. Work needed: Design selection, pass selected file ids to the chat request and the retrieval loader, and show it in citations.
- Evidence: No checkbox in SourcesPanel.tsx, ProjectSourcesPanel.tsx or ProjectSourcesTab.tsx; brief S37.05

## GAP-F037-04-02

**Search covers name and summary only; the summary is mostly empty or a notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Detail: Affects: Web and mobile. Work needed: Add content search through the retrieval index or generated summaries.
- Evidence: SourcesPanel.tsx:309-317; project-knowledge-files.ts:164-169

## GAP-F037-04-03

**CLI show prints names but has no search; VS Code has no search; Chrome has no list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Only if owners want them (VS Code and Chrome are scoped out by decisions).
- Evidence: lib.rs:3719-3733; projectActions.ts:100-111

## GAP-F037-04-04

**Mobile Sources tab has no search box; the search sits on a separate Notebook screen that needs Cloud mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Detail: Affects: Mobile. Work needed: Add search to the Sources tab or document the path.
- Evidence: ProjectNotebookScreen.tsx:150-160, 219

## GAP-F037-04-05

**'Retry indexing' shows for editors but the server accepts the owner only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Detail: Affects: Editors on web. Work needed: Align UI and server.
- Evidence: SourcesPanel.tsx:746; reindex/route.ts:36

## GAP-F037-04-06

**Brief marks search missing, which disagrees with the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Detail: Affects: Audit accuracy. Work needed: Update the brief status.
- Evidence: Brief S37.13 vs SourcesPanel.tsx:638-643

## GAP-F037-04-NOTBUILT

**Source list, search and source rail: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F037-04](../../20-features/037-notebook-and-knowledge-workspace-product/F037-04-source-list-search-and-source-rail.md)
- Requirement items: S37.04, S37.05, S37.13
- Detail: Web: S37.05, S37.13; Desktop: S37.05, S37.13; Mobile: S37.05, S37.13; Chrome: S37.04, S37.05, S37.13

## GAP-F037-05-01

**Web ignores all but the first dropped or chosen file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Detail: Affects: Web and Desktop. Work needed: Accept a list and upload in sequence with per-file results.
- Evidence: AddSourcesModal.tsx:97-107

## GAP-F037-05-02

**Images are accepted but never read for text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Detail: Affects: All apps. Work needed: Either read images with a vision step or say so before upload.
- Evidence: project-knowledge-files.ts:164-169

## GAP-F037-05-03

**Brief says CLI add-file and mobile written notes are missing; code has both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Detail: Affects: Audit accuracy. Work needed: Update the brief and test both.
- Evidence: lib.rs:3800-3820; ProjectSourcesTab.tsx:607-650

## GAP-F037-05-04

**No VS Code or Chrome add control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Detail: Affects: VS Code and Chrome. Work needed: None required by decisions D-2026-09-28-23 and -25.
- Evidence: No code found

## GAP-F037-05-05

**The text note is a .txt upload, so the title is stripped of punctuation and a title with only symbols becomes 'text-note'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Detail: Affects: Web. Work needed: Keep the typed title as the display name.
- Evidence: SourcesPanel.tsx:298-300

## GAP-F037-05-06

**Mobile Local-mode sources have no size or count limit seen in the code, only a prompt character budget.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Detail: Affects: Mobile Local mode. Work needed: Confirm and test limits for Local mode.
- Evidence: store.ts:546-571; attachmentContext.ts:68-90

## GAP-F037-05-NOTBUILT

**Add files and text sources: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F037-05](../../20-features/037-notebook-and-knowledge-workspace-product/F037-05-add-files-and-text-sources.md)
- Requirement items: S37.06, S37.11
- Detail: Mobile: S37.11; Chrome: S37.06, S37.11

## GAP-F037-06-01

**Google Drive is switched off by a code constant on the UI and three routes; the two picker env values are only needed after that.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: Web and Desktop. Work needed: Owner decision to release; set the two env values; live-check the Picker including inside Electron (brief).
- Evidence: connector-release.ts:14; google-drive/route.ts:39; picker/route.ts:22-29

## GAP-F037-06-02

**Website URL source does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: All apps. Work needed: Specify fetch, safety and size rules, build, add a route and a UI entry.
- Evidence: No code found in web projects, mobile projects, API project routes

## GAP-F037-06-03

**Video transcript source does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: All apps. Work needed: Specify transcript retrieval and provider route; add UI and route.
- Evidence: No code found

## GAP-F037-06-04

**Audio source does not exist; audio is not an allowed upload type.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: All apps. Work needed: Add audio types to policy, a transcription route (device or server), metering and UI.
- Evidence: attachment-policy.json:3-9

## GAP-F037-06-05

**Connected documents on mobile, CLI, VS Code and Chrome do not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: Those apps. Work needed: Decide per app; extensions are scoped out by decisions D-2026-09-28-23 and -25.
- Evidence: No code found

## GAP-F037-06-06

**Refresh works only for Drive sources, and not at all while connectors are off; brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: Web and Desktop. Work needed: Update the brief; test refresh when released.
- Evidence: refresh/route.ts:41, 60-62; SourcesPanel.tsx:757

## GAP-F037-06-07

**A short-lived Drive access token is sent to the browser for the Picker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Detail: Affects: Security review. Work needed: Confirm the token scope and lifetime in review before release.
- Evidence: picker/route.ts:45-52

## GAP-F037-06-NOTBUILT

**Website, video, audio and connected documents: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Requirement items: S37.07, S37.08, S37.09, S37.10
- Detail: Web: S37.07, S37.08, S37.09; Desktop: S37.07, S37.08, S37.09; Mobile: S37.07, S37.08, S37.09, S37.10; CLI: S37.07, S37.08, S37.09, S37.10; VS Code: S37.07, S37.08, S37.09; Chrome: S37.07, S37.08, S37.09, S37.10

## GAP-F037-06-PARTLY

**Website, video, audio and connected documents: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F037-06](../../20-features/037-notebook-and-knowledge-workspace-product/F037-06-website-video-audio-and-connected-documents.md)
- Requirement items: S37.10
- Detail: Web S37.10: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron | Desktop S37.10: owner: set GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (same GCP project as the Drive client; apps/web/app/api/connectors/google-drive/picker/route.ts:17); then live-check the Picker, including inside Electron

## GAP-F037-07-01

**No automatic source guide or summary**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-07](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)
- Detail: Affects: All six apps. Work needed: Add a generation step after indexing, a place to mark generated text, a display and usage accounting.
- Evidence: project-knowledge-files.ts:411-414 writes only a notice or null; no generator found

## GAP-F037-07-02

**Refresh only for Google Drive**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-07](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)
- Detail: Affects: Web, Desktop; Mobile has none. Work needed: Add providers as source types are added; add Mobile control.
- Evidence: origins/route.ts:39

## GAP-F037-07-03

**Brief status words are out of date for refresh**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-07](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)
- Detail: Affects: Documentation of Web and Desktop. Work needed: Update the brief and status registers.
- Evidence: Notebook.test.tsx:82-104 versus brief S37.36

## GAP-F037-07-04

**Picker settings not confirmed live**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-07](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)
- Detail: Affects: Web, Desktop (Electron). Work needed: Owner sets the two picker settings and live-checks.
- Evidence: brief S37.10 Unfinished

## GAP-F037-07-NOTBUILT

**Source guide and refresh: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F037-07](../../20-features/037-notebook-and-knowledge-workspace-product/F037-07-source-guide-and-refresh.md)
- Requirement items: S37.12, S37.36
- Detail: CLI: S37.12, S37.36; VS Code: S37.12, S37.36; Chrome: S37.12, S37.36

## GAP-F037-08-01

**No source selection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-08](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)
- Detail: Affects: All apps. Work needed: Selection state, API field and prompt filter.
- Evidence: brief S37.05 missing

## GAP-F037-08-02

**Citation links missing outside Web, Desktop, Mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-08](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Render chips or text locations and a way to open the source.
- Evidence: brief S37.19; no chip code in those apps found

## GAP-F037-08-03

**Chrome and VS Code grounding not confirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-08](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)
- Detail: Affects: Chrome, VS Code. Work needed: Trace and test the full path.
- Evidence: side_panel.ts:9012-9022 carries id only; projectActions.ts lists names only

## GAP-F037-08-04

**Draft claimed failures run without the project**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-08](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: request-processor.ts:1785-1799

## GAP-F037-08-NOTBUILT

**Source-grounded chat and citation links: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F037-08](../../20-features/037-notebook-and-knowledge-workspace-product/F037-08-source-grounded-chat-and-citation-links.md)
- Requirement items: S37.14, S37.19
- Detail: Mobile: S37.19; CLI: S37.14, S37.19; VS Code: S37.14, S37.19; Chrome: S37.19

## GAP-F037-09-01

**Single notes file, no list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-09](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)
- Detail: Affects: Web, Desktop. Work needed: Multiple notes model if wanted.
- Evidence: ProjectNotes.tsx:14

## GAP-F037-09-02

**No notes or save-answer on Mobile, CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-09](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)
- Detail: Affects: those apps. Work needed: Decide scope, then build.
- Evidence: no code found

## GAP-F037-09-03

**Founder list says leaders have no notes editor, code ships one**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-09](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)
- Detail: Affects: Product decision record. Work needed: Owner confirms keep or cut.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:96-98

## GAP-F037-09-04

**Brief out of date (notes marked not applicable or missing)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-09](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)
- Detail: Affects: Docs. Work needed: Update the brief.
- Evidence: ProjectNotes.tsx exists

## GAP-F037-09-NOTBUILT

**Notebook notes: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F037-09](../../20-features/037-notebook-and-knowledge-workspace-product/F037-09-notebook-notes.md)
- Requirement items: S37.18
- Detail: Mobile: S37.18; CLI: S37.18; VS Code: S37.18; Chrome: S37.18

## GAP-F037-10-01

**No outputs list or panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-10](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)
- Detail: Affects: All apps. Work needed: List chats or artifacts created by Studio per notebook.
- Evidence: ProjectStudio.tsx has only buttons

## GAP-F037-10-02

**Two prompt copies (Web and shared contract)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-10](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)
- Detail: Affects: Web, Mobile. Work needed: Web imports the shared list.
- Evidence: ProjectStudio.tsx:37-115 vs project-studio.ts:30-108

## GAP-F037-10-03

**No Studio on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-10](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)
- Detail: Affects: those apps. Work needed: Decide scope.
- Evidence: no code

## GAP-F037-10-04

**Brief out of date for Mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-10](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)
- Detail: Affects: Docs. Work needed: Update status.
- Evidence: mobile test file

## GAP-F037-10-05

**Web buttons do not wait for sources**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-10](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)
- Detail: Affects: Web. Work needed: Disable or message when empty.
- Evidence: ProjectStudio.tsx has no disabled state

## GAP-F037-10-NOTBUILT

**Studio one-click outputs: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F037-10](../../20-features/037-notebook-and-knowledge-workspace-product/F037-10-studio-one-click-outputs.md)
- Requirement items: S37.20, S37.23, S37.24, S37.25, S37.26, S37.27, S37.28, S37.30
- Detail: Web: S37.20; Desktop: S37.20; CLI: S37.20, S37.23, S37.24, S37.25, S37.26, S37.27, S37.28, S37.30; VS Code: S37.20, S37.23, S37.24, S37.25, S37.26, S37.27, S37.28, S37.30; Chrome: S37.20, S37.23, S37.24, S37.25, S37.26, S37.27, S37.28, S37.30

## GAP-F037-11-01

**No audio overview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-11](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)
- Detail: Affects: All apps. Work needed: Decide scope; speech output route and usage rules.
- Evidence: no code in notebook or studio files

## GAP-F037-11-02

**No video overview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-11](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)
- Detail: Affects: All apps. Work needed: Decide scope with the Library video path.
- Evidence: no code; docs/decisions/2026-09-27-founder-decisions.md:132-133

## GAP-F037-11-03

**Brief status for quiz, flashcards, learning overview, infographic out of date**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-11](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)
- Detail: Affects: Docs. Work needed: Update the brief.
- Evidence: ProjectStudio.tsx:80-107

## GAP-F037-11-04

**Malformed output handling unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-11](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Test and handle.
- Evidence: not traced

## GAP-F037-11-05

**Where quiz progress is kept is unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-11](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)
- Detail: Affects: All. Work needed: Trace and document.
- Evidence: not traced

## GAP-F037-11-NOTBUILT

**Audio, video, quiz, flashcards and learning overview: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F037-11](../../20-features/037-notebook-and-knowledge-workspace-product/F037-11-audio-video-quiz-flashcards-and-learning-overview.md)
- Requirement items: S37.21, S37.22, S37.29, S37.31, S37.32, S37.33
- Detail: CLI: S37.21, S37.22, S37.29, S37.31, S37.32, S37.33; VS Code: S37.21, S37.22, S37.29, S37.31, S37.32, S37.33; Chrome: S37.21, S37.22, S37.29, S37.31, S37.32, S37.33

## GAP-F037-12-01

**No per-notebook generation allowance**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-12](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
- Detail: Affects: All apps. Work needed: Decide if wanted; define against the one subscription system.
- Evidence: no code found; brief S37.39

## GAP-F037-12-02

**No notebook export**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-12](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
- Detail: Affects: All apps. Work needed: Only if the owner reverses the founder decision.
- Evidence: no code found; brief S37.35

## GAP-F037-12-03

**Meter hidden on the Sources tab and on other apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-12](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
- Detail: Affects: Web Sources tab, Mobile, CLI. Work needed: Add where people upload.
- Evidence: SourcesPanel.tsx has no storage text

## GAP-F037-12-04

**Meter is account-wide but sits in a notebook screen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-12](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
- Detail: Affects: Web, Desktop. Work needed: Label as account storage.
- Evidence: file-storage.ts:30-51

## GAP-F037-12-05

**Possible conflict with the Free-usage rule**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F037-12](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
- Detail: Affects: Free plan on Web. Work needed: Owner confirms.
- Evidence: owner memory note, relation unknown

## GAP-F037-12-NOTBUILT

**Notebook allowance, storage and export: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F037-12](../../20-features/037-notebook-and-knowledge-workspace-product/F037-12-notebook-allowance-storage-and-export.md)
- Requirement items: S37.39
- Detail: Mobile: S37.39; CLI: S37.39; VS Code: S37.39; Chrome: S37.39
