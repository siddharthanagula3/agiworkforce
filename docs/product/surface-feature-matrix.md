# Surface feature matrix

Status: Current
Owner: Cross-surface parity
Last updated: 2026-09-20

Generated from `docs/product/surface-feature-matrix.json` by `scripts/check-surface-feature-matrix.mjs --write`.
Edit the data file, not this one.

## What this matrix does not say

Presence in the tree is not availability to a user: a `Present` cell means the code is in this
repository and something reaches it, nothing more.
Whether a surface has been released, to whom, and at what version is not derivable from this
repository at all; the release process records that, and this document never claims it.
A `Present` cell has been located, not exercised: no cell here was produced by running the
feature on that surface.

Seven surfaces ship one product, and until this file existed nobody could answer 'is Projects in the CLI' without reading the CLI. A cell says where that feature's code is on that surface and names the two files that show it is reached: the entry point and whatever imports, declares or routes to it. It says nothing about whether a user can get it. A generous cell is worse than an empty one, so a cell the tree does not settle is unverified and says what would settle it.

## Surfaces

- **web**: The Next.js application. Its API routes are a separate surface below. Release: a release workflow for this surface exists at `.github/workflows/deploy-production.yml`. Whether it has ever run is not in this tree.
- **desktop**: The Electron and Tauri shell with its own renderer under apps/desktop/src. Release: a release workflow for this surface exists at `.github/workflows/release-desktop.yml`. Whether it has ever run is not in this tree.
- **mobile**: The React Native application under apps/mobile. Release: a release workflow for this surface exists at `.github/workflows/release-mobile.yml`. Whether it has ever run is not in this tree.
- **cli**: The Rust binary under apps/cli. Release: a release workflow for this surface exists at `.github/workflows/release-cli.yml`. Whether it has ever run is not in this tree.
- **vscode**: The editor extension under apps/extension-vscode. Release: a release workflow for this surface exists at `.github/workflows/release-vscode-extension.yml`. Whether it has ever run is not in this tree.
- **chrome**: The browser extension under apps/extension. Release: a release workflow for this surface exists at `.github/workflows/release-chrome-extension.yml`. Whether it has ever run is not in this tree.
- **api**: The HTTP surface under apps/web/app/api that the other six and third parties call. Release: a release workflow for this surface exists at `.github/workflows/deploy-production.yml`. Whether it has ever run is not in this tree.

## States

`Present` means an entry point exists and a named file imports, declares or routes to it.
`Partial` means the same, with a named part of the feature missing on that surface.
`Absent` means the surface does not have it, and says why.
`Unverified` means the tree does not settle it, and says what would.

`Declared maturity` is the feature registry's answer for the whole feature, not for one surface.
Most rows read "not in the feature registry": the registry holds 30 features
and this matrix holds more, so there is no declared maturity to show for the rest.

## Core consumer

| Feature | Declared maturity | web | desktop | mobile | cli | vscode | chrome | api |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chat | general_availability | Unverified | Present | Present | Present | Present | Present | Present |
| History | general_availability | Present | Present | Present | Present | Present | Present | Present |
| Projects | general_availability | Present | Present | Present | Present | Present | Present | Present |
| Files and artifacts | general_availability | Present | Present | Present | Present | Present | Present | Present |
| Library | general_availability | Unverified | Present | Present | Absent | Absent | Absent | Present |
| Memory | not in the feature registry | Present | Present | Present | Present | Present | Present | Present |
| Search | general_availability | Unverified | Unverified | Unverified | Present | Unverified | Unverified | Present |
| Work | general_availability | Present | Present | Present | Present | Present | Present | Present |
| Settings | not in the feature registry | Present | Present | Present | Present | Unverified | Unverified | Present |
| Plan status | not in the feature registry | Present | Unverified | Present | Present | Present | Unverified | Present |
| Help | not in the feature registry | Present | Unverified | Unverified | Present | Unverified | Absent | Present |

## Advanced AI

| Feature | Declared maturity | web | desktop | mobile | cli | vscode | chrome | api |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Deep Research | general_availability | Present | Present | Present | Absent | Absent | Absent | Present |
| Study | general_availability | Present | Absent | Absent | Absent | Absent | Absent | Present |
| Analyze | not in the feature registry | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified | Unverified |
| Image generation | general_availability | Present | Present | Unverified | Present | Absent | Absent | Present |
| Video generation | general_availability | Present | Absent | Absent | Absent | Absent | Absent | Present |
| Voice | general_availability | Present | Present | Present | Present | Absent | Present | Present |
| Camera | not in the feature registry | Unverified | Unverified | Present | Absent | Absent | Absent | Absent |
| Screen sharing | not in the feature registry | Absent | Present | Absent | Absent | Absent | Unverified | Absent |

## Integrations

| Feature | Declared maturity | web | desktop | mobile | cli | vscode | chrome | api |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Connectors | general_availability | Present | Present | Present | Absent | Present | Absent | Present |
| Skills | general_availability | Present | Present | Present | Present | Absent | Absent | Present |
| Plugins | beta | Present | Present | Absent | Present | Absent | Absent | Present |
| MCP | beta | Present | Unverified | Absent | Unverified | Unverified | Partial | Present |
| Tool approvals | general_availability | Present | Present | Present | Unverified | Present | Present | Present |

## Developer

| Feature | Declared maturity | web | desktop | mobile | cli | vscode | chrome | api |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Code sessions | general_availability | Present | Present | Present | Present | Present | Absent | Present |
| Repository context | not in the feature registry | Unverified | Unverified | Absent | Unverified | Unverified | Absent | Unverified |
| Terminal | general_availability | Absent | Present | Absent | Present | Present | Absent | Absent |
| Git | general_availability | Absent | Present | Absent | Present | Unverified | Absent | Absent |
| Diffs | general_availability | Present | Present | Unverified | Present | Present | Absent | Present |
| Browser verification | beta | Present | Unverified | Absent | Present | Absent | Unverified | Unverified |
| Cloud tasks | general_availability | Present | Present | Present | Unverified | Present | Absent | Present |

## Native

| Feature | Declared maturity | web | desktop | mobile | cli | vscode | chrome | api |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local runtime | not in the feature registry | Absent | Present | Absent | Present | Present | Unverified | Absent |
| BYOK | not in the feature registry | Present | Unverified | Unverified | Present | Present | Absent | Present |
| Global voice | general_availability | Absent | Present | Unverified | Present | Absent | Absent | Absent |
| Computer use | experimental | Absent | Present | Absent | Absent | Absent | Present | Absent |
| Filesystem | general_availability | Absent | Present | Absent | Unverified | Unverified | Absent | Absent |
| Updater | not in the feature registry | Absent | Present | Unverified | Present | Absent | Absent | Present |
| Scheduled tasks | general_availability | Present | Present | Present | Present | Present | Present | Present |
| Hooks | beta | Absent | Present | Absent | Present | Unverified | Absent | Absent |
| Remote control | experimental | Present | Present | Present | Absent | Absent | Absent | Present |
| Event triggers | beta | Present | Present | Absent | Unverified | Absent | Absent | Present |

## Enterprise

| Feature | Declared maturity | web | desktop | mobile | cli | vscode | chrome | api |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SSO | not in the feature registry | Present | Present | Unverified | Present | Unverified | Unverified | Present |
| Policy effects | not in the feature registry | Present | Present | Unverified | Present | Unverified | Unverified | Present |
| Model restrictions | not in the feature registry | Present | Unverified | Unverified | Present | Present | Unverified | Present |
| Connector restrictions | not in the feature registry | Present | Present | Unverified | Absent | Present | Absent | Present |
| Sharing restrictions | not in the feature registry | Present | Unverified | Present | Absent | Absent | Absent | Present |
| Audit visibility | not in the feature registry | Present | Present | Absent | Present | Absent | Absent | Present |
| Managed-compute restrictions | not in the feature registry | Present | Present | Present | Unverified | Unverified | Unverified | Present |
| Administration | not in the feature registry | Present | Absent | Absent | Absent | Absent | Absent | Present |

## Features with no declared maturity

19 of 49 rows name no feature in
`packages/contracts/types/src/feature-registry.json`, so nothing in the tree declares how finished they are, who owns
them, or what would take them out of an unfinished state. That is a gap in the registry, not in
this document.

- Memory
- Settings
- Plan status
- Help
- Analyze
- Camera
- Screen sharing
- Repository context
- Local runtime
- BYOK
- Updater
- SSO
- Policy effects
- Model restrictions
- Connector restrictions
- Sharing restrictions
- Audit visibility
- Managed-compute restrictions
- Administration

## Evidence

### Chat

- **web**: unverified. Settled by: apps/web/features/chat/pages/WebChatPage.tsx exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **desktop**: present. `apps/desktop/src/features/v3/DesktopShellV3.tsx`, reached by `apps/desktop/src/features/v3/index.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/chat/[id].tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/tui/tui_app.rs`, reached by `apps/cli/src/tui/mod.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts`, reached by `apps/extension-vscode/src/providers/chatEditorPanel.ts` (import).
- **chrome**: present. `apps/extension/src/features/side-panel/chat-state.ts`, reached by `apps/extension/src/side_panel.ts` (import).
- **api**: present. `apps/web/app/api/llm/v1/chat/completions/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### History

- **web**: present. `apps/web/features/settings/sections/ArchivedChatsSection.tsx`, reached by `apps/web/features/settings/components/WebSettingsModal.tsx` (import).
- **desktop**: present. `apps/desktop/src/features/v3/ConversationRow.tsx`, reached by `apps/desktop/src/features/v3/Sidebar.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/chats/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/conversations.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/trees/conversationTreeProvider.ts`, reached by `apps/extension-vscode/src/features/trees/index.ts` (import).
- **chrome**: present. `apps/extension/src/features/background/conversation-history.ts`, reached by `apps/extension/src/side_panel.ts` (import).
- **api**: present. `apps/web/app/api/chat/conversations/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Projects

- **web**: present. `apps/web/app/chat/projects/page.tsx`, reached by `apps/web/app/chat/projects/layout.tsx` (route).
- **desktop**: present. `apps/desktop/src/features/v3/AgiWorkProjects.tsx`, reached by `apps/desktop/src/features/v3/index.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/(tabs)/projects.tsx`, reached by `apps/mobile/app/(app)/(tabs)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/cloud/projects.rs`, reached by `apps/cli/src/cloud/mod.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/projects/projectsTree.ts`, reached by `apps/extension-vscode/src/features/projects/index.ts` (import).
- **chrome**: present. `apps/extension/src/features/side-panel/projectsDrawer.ts`, reached by `apps/extension/src/side_panel.ts` (import).
- **api**: present. `apps/web/app/api/projects/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Files and artifacts

- **web**: present. `apps/web/features/chat/stores/artifacts-store.ts`, reached by `apps/web/app/gallery/GalleryClient.tsx` (import).
- **desktop**: present. `apps/desktop/src/features/v3/AgiWorkArtifacts.tsx`, reached by `apps/desktop/src/features/v3/index.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/artifacts/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/cloud/artifacts.rs`, reached by `apps/cli/src/cloud/mod.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/artifacts/artifactsTree.ts`, reached by `apps/extension-vscode/src/features/artifacts/index.ts` (import).
- **chrome**: present. `apps/extension/src/features/side-panel/artifactsDrawer.ts`, reached by `apps/extension/src/side_panel.ts` (import).
- **api**: present. `apps/web/app/api/artifacts/index/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Library

- **web**: unverified. Settled by: apps/web/features/library/components/LibraryView.tsx exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **desktop**: present. `apps/desktop/src/features/library/DesktopLibrary.tsx`, reached by `apps/desktop/src/features/v3/DesktopShellV3.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/library/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: absent. The CLI has no library browser; a terminal session reaches generated files through the filesystem it already runs in.
- **vscode**: absent. The editor shows artifacts in its own tree; nothing in apps/extension-vscode/src reads the library collection.
- **chrome**: absent. The side panel shows artifacts for the open conversation; nothing under apps/extension/src reads the library collection.
- **api**: present. `apps/web/app/api/library/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Memory

- **web**: present. `apps/web/lib/services/memory-write-service.ts`, reached by `apps/web/app/api/memory/route.ts` (import).
- **desktop**: present. `apps/desktop/src/api/cloudMemory.ts`, reached by `apps/desktop/src/features/settings/tabs/Memory.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/settings/memory.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/cloud/memory.rs`, reached by `apps/cli/src/cloud/mod.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/memory/accountMemoryStore.ts`, reached by `apps/extension-vscode/src/core/chatSetup.ts` (import).
- **chrome**: present. `apps/extension/src/features/cloud-bridge/memoryClient.ts`, reached by `apps/extension/src/side_panel.ts` (import).
- **api**: present. `apps/web/app/api/memory/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Search

- **web**: unverified. Settled by: packages/ui/unified-chat/src/lib/slashCommands.ts exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **desktop**: unverified. Settled by: A desktop entry point that selects the search interaction mode. packages/ui/unified-chat/src/lib/slashCommands.ts is shared, but nothing under apps/desktop/src was found importing it; a desktop composer test that sends work_mode search would settle it.
- **mobile**: unverified. Settled by: A mobile composer path that sends the search work mode. Nothing under apps/mobile was found naming the mode.
- **cli**: present. `apps/cli/src/tool_search.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: unverified. Settled by: An editor path that selects the search interaction mode. apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts carries a browse-the-web affordance, which is the page tool rather than the mode.
- **chrome**: unverified. Settled by: A side-panel path that selects the search mode rather than the page tools. apps/extension/src/features/browser-tools reads the open page, which is a different capability.
- **api**: present. `apps/web/app/api/search/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Work

- **web**: present. `apps/web/app/agi-work/page.tsx`, reached by `apps/web/app/layout.tsx` (route).
- **desktop**: present. `apps/desktop/src/features/tasks/DesktopTasks.tsx`, reached by `apps/desktop/src/features/v3/DesktopShellV3.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/tasks.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/agents.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts`, reached by `apps/extension-vscode/src/features/cloud-tasks/index.ts` (import).
- **chrome**: present. `apps/extension/src/features/background/scheduled-task-runs.ts`, reached by `apps/extension/src/background.ts` (import).
- **api**: present. `apps/web/app/api/llm/v1/chat/completions/runs/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Settings

- **web**: present. `apps/web/app/settings/page.tsx`, reached by `apps/web/app/settings/layout.tsx` (route).
- **desktop**: present. `apps/desktop/src/features/settings/SkillsPluginsSettings.tsx`, reached by `apps/desktop/src/features/settings/tabs/Plugins/index.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/settings/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/config.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/settings is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: unverified. Settled by: apps/extension/src/options.ts exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **api**: present. `apps/web/app/api/settings/preferences/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Plan status

- **web**: present. `apps/web/app/billing/page.tsx`, reached by `apps/web/app/billing/layout.tsx` (route).
- **desktop**: unverified. Settled by: apps/desktop/src/features/subscription is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **mobile**: present. `apps/mobile/app/(app)/settings/cloud-billing.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/usage_summary.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/integrations/tierResolver.ts`, reached by `apps/extension-vscode/src/extension.ts` (import).
- **chrome**: unverified. Settled by: A side-panel element that shows the plan or the remaining quota. apps/extension/src/features/cloud-bridge reaches the account, but nothing was found rendering its plan.
- **api**: present. `apps/web/app/api/usage/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Help

- **web**: present. `apps/web/lib/support/help-articles.ts`, reached by `apps/web/app/help/collections.ts` (import).
- **desktop**: unverified. Settled by: A desktop entry point that opens help. apps/desktop/src-tauri/src/sys/support_bundle.rs collects diagnostics, which is not the help centre.
- **mobile**: unverified. Settled by: A mobile screen that opens help. apps/mobile/app/(app)/feedback.tsx sends feedback, which is a different affordance.
- **cli**: present. `apps/cli/src/doctor.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/onboarding is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: absent. Nothing under apps/extension/src opens help; the side panel links out to the web application for it.
- **api**: present. `apps/web/app/api/support/ask/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Deep Research

- **web**: present. `apps/web/features/chat/stores/research-panel-store.ts`, reached by `apps/web/features/chat/utils/research-sources.ts` (import).
- **desktop**: present. `apps/desktop/src/features/research/ResearchReport.tsx`, reached by `apps/desktop/src/features/research/index.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/reports/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: absent. Nothing under apps/cli/src runs or reads a research report; the CLI is a coding surface.
- **vscode**: absent. Nothing under apps/extension-vscode/src runs or reads a research report.
- **chrome**: absent. Nothing under apps/extension/src runs or reads a research report.
- **api**: present. `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`, reached by `apps/web/app/api/llm/v1/chat/completions/route.ts` (import).

### Study

- **web**: present. `apps/web/features/study/components/StudyPage.tsx`, reached by `apps/web/features/study/index.ts` (import).
- **desktop**: absent. Nothing under apps/desktop/src implements the study mode.
- **mobile**: absent. Nothing under apps/mobile implements the study mode.
- **cli**: absent. Nothing under apps/cli/src implements the study mode.
- **vscode**: absent. Nothing under apps/extension-vscode/src implements the study mode.
- **chrome**: absent. Nothing under apps/extension/src implements the study mode.
- **api**: present. `apps/web/features/study/server/study-session-store.ts`, reached by `apps/web/app/api/study/sessions/route.ts` (import).

### Analyze

- **web**: unverified. Settled by: An entry point that names an analyze mode. The checklist names it as a feature; the interaction-mode registry has no analyze member, so either the registry is missing one or the row names a capability that was folded into chat.
- **desktop**: unverified. Settled by: The same registry answer as web. apps/desktop/src/features/analytics is product analytics, which is a different thing.
- **mobile**: unverified. Settled by: The same registry answer as web.
- **cli**: unverified. Settled by: The same registry answer as web.
- **vscode**: unverified. Settled by: The same registry answer as web.
- **chrome**: unverified. Settled by: The same registry answer as web.
- **api**: unverified. Settled by: The same registry answer as web.

### Image generation

- **web**: present. `apps/web/features/chat/lib/imageGenerationOptions.ts`, reached by `apps/web/features/chat/pages/WebChatPage.tsx` (import).
- **desktop**: present. `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`, reached by `apps/desktop/src-tauri/src/integrations/api_integrations/mod.rs` (module).
- **mobile**: unverified. Settled by: A mobile composer path that requests an image. Nothing under apps/mobile was found naming the image work mode.
- **cli**: present. `apps/cli/src/cloud/image.rs`, reached by `apps/cli/src/cloud/mod.rs` (module).
- **vscode**: absent. Nothing under apps/extension-vscode/src requests an image.
- **chrome**: absent. Nothing under apps/extension/src requests an image.
- **api**: present. `apps/web/app/api/media/image/generate/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Video generation

- **web**: present. `apps/web/lib/server/video-generation-jobs.ts`, reached by `apps/web/app/api/media/video/cancel/route.ts` (import).
- **desktop**: absent. Nothing under apps/desktop requests a video; the desktop composer does not carry the mode.
- **mobile**: absent. Nothing under apps/mobile requests a video.
- **cli**: absent. Nothing under apps/cli/src requests a video.
- **vscode**: absent. Nothing under apps/extension-vscode/src requests a video.
- **chrome**: absent. Nothing under apps/extension/src requests a video.
- **api**: present. `apps/web/app/api/media/video/generate/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Voice

- **web**: present. `apps/web/features/chat/components/Composer/VoiceEntryButton.tsx`, reached by `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (import).
- **desktop**: present. `apps/desktop/electron/voiceDictation.ts`, reached by `apps/desktop/electron/main.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/voice.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/voice.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: absent. A VS Code webview has no microphone, so the editor cannot record audio at all.
- **chrome**: present. `apps/extension/src/features/side-panel/voice.ts`, reached by `apps/extension/src/side_panel.ts` (import).
- **api**: present. `apps/web/app/api/voice/live/sessions/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Camera

- **web**: unverified. Settled by: packages/ui/unified-chat/src/components/AttachmentMenu.tsx exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **desktop**: unverified. Settled by: A desktop entry point that opens a camera. The shared attachment menu carries the control and the capability table says desktop has a camera, but nothing under apps/desktop/src was found opening one.
- **mobile**: present. `apps/mobile/app/(app)/camera.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: absent. A terminal has no camera.
- **vscode**: absent. A VS Code webview cannot open a camera.
- **chrome**: absent. Nothing under apps/extension/src opens a camera.
- **api**: absent. A camera is a device capability; the HTTP surface receives the image as an upload rather than opening one.

### Screen sharing

- **web**: absent. Nothing under apps/web captures the screen; the capability table records canTakeScreenshot false for web.
- **desktop**: present. `apps/desktop/src/features/screen-capture/ScreenCaptureButton.tsx`, reached by `apps/desktop/src/features/quick-query/index.tsx` (import).
- **mobile**: absent. The capability table records canTakeScreenshot false for mobile and nothing under apps/mobile captures the screen.
- **cli**: absent. Nothing under apps/cli/src captures the screen.
- **vscode**: absent. Nothing under apps/extension-vscode/src captures the screen.
- **chrome**: unverified. Settled by: A file under apps/extension/src that captures the screen or a tab. apps/extension/src/features/computer-use/browserControlConsent.ts is consent for driving the page, which is a different capability from sharing a screen.
- **api**: absent. Capturing a screen is a device capability; the HTTP surface receives the capture as an upload.

### Connectors

- **web**: present. `apps/web/app/connectors/page.tsx`, reached by `apps/web/app/connectors/layout.tsx` (route).
- **desktop**: present. `apps/desktop/src/features/connectors/ConnectorGallery.tsx`, reached by `apps/desktop/src/features/settings/tabs/Connectors/index.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/connectors/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: absent. Nothing under apps/cli/src lists or authorizes a connector; the CLI reaches third parties through MCP instead.
- **vscode**: present. `apps/extension-vscode/src/features/connectors/connectorsTree.ts`, reached by `apps/extension-vscode/src/features/connectors/index.ts` (import).
- **chrome**: absent. Nothing under apps/extension/src lists or authorizes a connector.
- **api**: present. `apps/web/app/api/connectors/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Skills

- **web**: present. `apps/web/lib/services/skill-catalog-service.ts`, reached by `apps/web/app/api/skills/route.ts` (import).
- **desktop**: present. `apps/desktop/src/api/cloudSkills.ts`, reached by `apps/desktop/src/features/v3/DesktopShellV3.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/skills/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/skills.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: absent. Nothing under apps/extension-vscode/src installs or runs a skill.
- **chrome**: absent. Nothing under apps/extension/src installs or runs a skill.
- **api**: present. `apps/web/app/api/skills/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Plugins

- **web**: present. `apps/web/lib/services/plugin-lifecycle.ts`, reached by `apps/web/app/plugins/[id]/page.tsx` (import).
- **desktop**: present. `apps/desktop/src/features/settings/cloud/CloudPluginsSection.tsx`, reached by `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` (import).
- **mobile**: absent. The capability table records canUsePlugins false for mobile and nothing under apps/mobile installs a plugin.
- **cli**: present. `apps/cli/src/features/plugins/plugins.rs`, reached by `apps/cli/src/features/plugins/mod.rs` (module).
- **vscode**: absent. Nothing under apps/extension-vscode/src installs a plugin.
- **chrome**: absent. Nothing under apps/extension/src installs a plugin.
- **api**: present. `apps/web/app/api/plugins/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### MCP

- **web**: present. `apps/web/lib/mcp-tool-executor.ts`, reached by `apps/web/lib/user-connector-tools.ts` (import).
- **desktop**: unverified. Settled by: apps/desktop/src/services/mcp.ts exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **mobile**: absent. The capability table records canUseLocalMcp false for mobile and nothing under apps/mobile dials an MCP server.
- **cli**: unverified. Settled by: apps/cli/src/mcp/mod.rs exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **vscode**: unverified. Settled by: An editor path that dials an MCP server of its own. apps/extension-vscode/src/integrations/localRuntimeClient.ts reaches the CLI runtime, which owns the MCP connection; whether the editor is a client in its own right is not decidable from the tree.
- **chrome**: partial. `apps/extension/src/webmcp.ts`, reached by `apps/extension/src/content.ts` (import). Missing: the server connection lifecycle. apps/extension/src/webmcp.ts exposes the open page to a model as tools; nothing under apps/extension/src dials, authorizes or lists an MCP server, which is what the other surfaces mean by MCP.
- **api**: present. `apps/web/app/api/settings/organization/mcp/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Tool approvals

- **web**: present. `apps/web/features/chat/components/approvals/ApprovalInbox.tsx`, reached by `apps/web/features/chat/pages/WebChatPage.tsx` (import).
- **desktop**: present. `apps/desktop/src/services/approvalResolution.ts`, reached by `apps/desktop/src/services/coworkDispatch.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/settings/auto-approve.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: unverified. Settled by: apps/cli/src/safety/approval.rs exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **vscode**: present. `apps/extension-vscode/src/features/permissions/approvalScope.ts`, reached by `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` (import).
- **chrome**: present. `apps/extension/src/features/computer-use/approvalPolicy.ts`, reached by `apps/extension/src/background.ts` (import).
- **api**: present. `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts`, reached by `apps/web/app/api/settings/preferences/route.ts` (import).

### Code sessions

- **web**: present. `apps/web/lib/services/cloud-code-session-service.ts`, reached by `apps/web/app/api/code/sessions/route.ts` (import).
- **desktop**: present. `apps/desktop/electron/runtime/developerSessionService.ts`, reached by `apps/desktop/electron/main.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/companion/code/[threadId].tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/sessions.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/integrations/developerSessionHandoff.ts`, reached by `apps/extension-vscode/src/core/commandSetup.ts` (import).
- **chrome**: absent. Nothing under apps/extension/src opens a code session; the extension hands context off instead.
- **api**: present. `apps/web/app/api/code/sessions/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Repository context

- **web**: unverified. Settled by: A web path that reads a repository tree. apps/web/lib/github-app.ts reaches GitHub for pull requests, which is not the same as carrying repository context into a turn.
- **desktop**: unverified. Settled by: apps/desktop/src/features/context-handoff is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **mobile**: absent. Nothing under apps/mobile reads a repository; the capability table records canUseWorkingDirectory false for mobile.
- **cli**: unverified. Settled by: apps/cli/src/repo is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/context-handoff is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: absent. A browser extension has no working directory.
- **api**: unverified. Settled by: Whether a request may carry repository context to the HTTP surface at all, which the chat request schema would answer.

### Terminal

- **web**: absent. The capability table records canUseTerminal false for web.
- **desktop**: present. `apps/desktop/src/features/terminal/Terminal.tsx`, reached by `apps/desktop/src/features/terminal/TerminalWorkspace.tsx` (import).
- **mobile**: absent. The capability table records canUseTerminal false for mobile.
- **cli**: present. `apps/cli/src/tui/tui_app.rs`, reached by `apps/cli/src/tui/mod.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/providers/terminalProvider.ts`, reached by `apps/extension-vscode/src/core/providerSetup.ts` (import).
- **chrome**: absent. A browser extension has no terminal.
- **api**: absent. A terminal is a device capability; the HTTP surface runs commands in a sandbox instead.

### Git

- **web**: absent. Nothing under apps/web runs git; the web surface reads pull requests through the GitHub application instead.
- **desktop**: present. `apps/desktop/electron/runtime/gitService.ts`, reached by `apps/desktop/electron/runtime/dispatcher.ts` (import).
- **mobile**: absent. Nothing under apps/mobile runs git.
- **cli**: present. `apps/cli/src/platform/runtime/git.rs`, reached by `apps/cli/src/platform/runtime/mod.rs` (module).
- **vscode**: unverified. Settled by: An editor path that runs git itself. The editor shows diffs through its own decoration provider and delegates the repository to the local runtime, so whether it is a git client is not decidable from the tree.
- **chrome**: absent. A browser extension has no repository.
- **api**: absent. Git runs where the checkout is; the HTTP surface never has one.

### Diffs

- **web**: present. `apps/web/features/code/code-diff.ts`, reached by `apps/web/features/code/components/CodeChangesPanel.tsx` (import).
- **desktop**: present. `apps/desktop/src/features/code/DiffViewer.tsx`, reached by `apps/desktop/src/features/code/CodeWorkspace.tsx` (import).
- **mobile**: unverified. Settled by: A mobile screen that renders a diff. apps/mobile/app/(app)/companion/code/[threadId].tsx shows a code thread; whether it renders the patch is not decidable from the file list.
- **cli**: present. `apps/cli/src/tui/widgets/diff_review.rs`, reached by `apps/cli/src/tui/widgets/mod.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/providers/diffDecorationProvider.ts`, reached by `apps/extension-vscode/src/core/chatSetup.ts` (import).
- **chrome**: absent. Nothing under apps/extension/src renders a diff.
- **api**: present. `apps/web/lib/code-review/diff.ts`, reached by `apps/web/lib/code-review/pipeline.ts` (import).

### Browser verification

- **web**: present. `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx`, reached by `apps/web/features/desktop-host/index.ts` (import).
- **desktop**: unverified. Settled by: apps/desktop/src/lib/browserAutomation.ts exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **mobile**: absent. The capability table records canUseBrowserAutomation false for mobile.
- **cli**: present. `apps/cli/src/browser_bridge.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: absent. Nothing under apps/extension-vscode/src drives a browser.
- **chrome**: unverified. Settled by: apps/extension/src/features/browser-tools is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **api**: unverified. Settled by: Whether the HTTP surface exposes browser tools to a third party, which the tool registry would answer.

### Cloud tasks

- **web**: present. `apps/web/features/tasks/services/cloud-tasks-client.ts`, reached by `apps/web/features/tasks/index.ts` (import).
- **desktop**: present. `apps/desktop/src/features/v3/useCloudTaskBadge.ts`, reached by `apps/desktop/src/features/v3/Sidebar.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/companion/agent/[id].tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: unverified. Settled by: apps/cli/src/cloud is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **vscode**: present. `apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts`, reached by `apps/extension-vscode/src/features/cloud-tasks/index.ts` (import).
- **chrome**: absent. Nothing under apps/extension/src opens a cloud task.
- **api**: present. `apps/web/lib/services/cloud-agent-run-service.ts`, reached by `apps/web/app/api/mobile/agent-status/route.ts` (import).

### Local runtime

- **web**: absent. A browser cannot start a local process; the capability table records canRunLocalCode false for web.
- **desktop**: present. `apps/desktop/src/features/settings/tabs/ModelsKeys/LocalRuntimeSettings.tsx`, reached by `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx` (import).
- **mobile**: absent. The capability table records canRunLocalCode false for mobile.
- **cli**: present. `apps/cli/src/app_server.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/integrations/localRuntimePool.ts`, reached by `apps/extension-vscode/src/extension.ts` (import).
- **chrome**: unverified. Settled by: apps/extension/src/features/native-bridge is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **api**: absent. The HTTP surface is the cloud side of the boundary; a local runtime is by definition not on it.

### BYOK

- **web**: present. `apps/web/lib/byok-providers.ts`, reached by `apps/web/app/byok/page.tsx` (import).
- **desktop**: unverified. Settled by: apps/desktop/src/lib/byok-vault.ts exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **mobile**: unverified. Settled by: A mobile screen that stores a provider key. apps/mobile/app/(app)/settings/cloud-privacy.tsx names the trust boundary; whether it accepts a key is not decidable from the file list.
- **cli**: present. `apps/cli/src/auth.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/integrations/providerSwitchGuard.ts`, reached by `apps/extension-vscode/src/core/commandSetup.ts` (import).
- **chrome**: absent. Nothing under apps/extension/src stores a provider key; the extension uses the managed account.
- **api**: present. `apps/web/app/api/settings/api-keys/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Global voice

- **web**: absent. A global hotkey needs a host process; a browser tab has none.
- **desktop**: present. `apps/desktop/src/hooks/useVoiceHotkey.ts`, reached by `apps/desktop/src/App.tsx` (import).
- **mobile**: unverified. Settled by: Whether apps/mobile/app/(app)/widget-setup.tsx reaches voice from outside the application, which the widget target would answer.
- **cli**: present. `apps/cli/src/voice.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: absent. A VS Code webview has no microphone.
- **chrome**: absent. Nothing under apps/extension/src binds a global voice hotkey.
- **api**: absent. A global hotkey is a device capability; the HTTP surface has no keyboard.

### Computer use

- **web**: absent. The capability table records canUseDesktopAutomation false for web.
- **desktop**: present. `apps/desktop/electron/runtime/computerUseService.ts`, reached by `apps/desktop/electron/main.ts` (import).
- **mobile**: absent. The capability table records canUseDesktopAutomation false for mobile.
- **cli**: absent. Nothing under apps/cli/src drives the desktop; the CLI runs commands instead.
- **vscode**: absent. Nothing under apps/extension-vscode/src drives the desktop.
- **chrome**: present. `apps/extension/src/features/computer-use/approvalPolicy.ts`, reached by `apps/extension/src/background.ts` (import).
- **api**: absent. Driving a computer happens on the device; the HTTP surface carries the instruction, not the action.

### Filesystem

- **web**: absent. The capability table records canUseFileSystem false for web.
- **desktop**: present. `apps/desktop/electron/runtime/filesystemService.ts`, reached by `apps/desktop/electron/runtime/dispatcher.ts` (import).
- **mobile**: absent. The capability table records canUseFileSystem false for mobile.
- **cli**: unverified. Settled by: apps/cli/src/safety/filesystem_effect.rs exists, and nothing under this surface's roots was found importing it or declaring it as a module. The file that mounts it, or a spec that reaches it through the shell, would settle this.
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/editor-utilities is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: absent. A browser extension has no filesystem.
- **api**: absent. The HTTP surface writes to storage, not to a user's filesystem.

### Updater

- **web**: absent. A web deployment updates itself; there is nothing for a user to update.
- **desktop**: present. `apps/desktop/src/features/updates/useUpdater.ts`, reached by `apps/desktop/src/features/updates/UpdatePill.tsx` (import).
- **mobile**: unverified. Settled by: Whether the store build takes an over-the-air update, which apps/mobile/eas.json would answer.
- **cli**: present. `apps/cli/src/update_check.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: absent. The marketplace updates the extension; nothing under apps/extension-vscode/src does.
- **chrome**: absent. The Chrome Web Store updates the extension; nothing under apps/extension/src does.
- **api**: present. `apps/web/app/api/releases/[target]/[version]/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Scheduled tasks

- **web**: present. `apps/web/app/chat/schedules/page.tsx`, reached by `apps/web/app/chat/layout.tsx` (route).
- **desktop**: present. `apps/desktop/src/features/v3/AgiWorkScheduled.tsx`, reached by `apps/desktop/src/features/v3/index.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/schedules/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: present. `apps/cli/src/schedules.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/schedules/schedulesTree.ts`, reached by `apps/extension-vscode/src/features/schedules/index.ts` (import).
- **chrome**: present. `apps/extension/src/features/side-panel/schedulesSection.ts`, reached by `apps/extension/src/features/side-panel/cloudRunsPanel.ts` (import).
- **api**: present. `apps/web/lib/services/schedule-service.ts`, reached by `apps/web/app/api/schedules/route.ts` (import).

### Hooks

- **web**: absent. A hook runs a local program; the capability table records canRunLocalCode false for web.
- **desktop**: present. `apps/desktop/src-tauri/src/sys/commands/hooks.rs`, reached by `apps/desktop/src-tauri/src/sys/commands/mod.rs` (module).
- **mobile**: absent. The capability table records canRunLocalCode false for mobile.
- **cli**: present. `apps/cli/src/features/hooks/hooks.rs`, reached by `apps/cli/src/features/hooks/mod.rs` (module).
- **vscode**: unverified. Settled by: Whether the editor runs hooks itself or inherits them from the local runtime it starts, which apps/extension-vscode/src/integrations/localRuntimePool.ts would answer.
- **chrome**: absent. A browser extension cannot run a local program.
- **api**: absent. A hook is a local program; the HTTP surface never runs one.

### Remote control

- **web**: present. `apps/web/features/desktop-host/components/RemoteControlSection.tsx`, reached by `apps/web/features/desktop-host/index.ts` (import).
- **desktop**: present. `apps/desktop/electron/remote/remoteControlHost.ts`, reached by `apps/desktop/electron/runtime/dispatcher.ts` (import).
- **mobile**: present. `apps/mobile/app/(app)/companion/index.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: absent. Nothing under apps/cli/src is a remote-control host or client.
- **vscode**: absent. Nothing under apps/extension-vscode/src is a remote-control host or client.
- **chrome**: absent. Nothing under apps/extension/src is a remote-control host or client.
- **api**: present. `apps/web/app/api/devices/heartbeat/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Event triggers

- **web**: present. `apps/web/lib/triggers/trigger-fire.ts`, reached by `apps/web/lib/jobs/job-handlers.ts` (import).
- **desktop**: present. `apps/desktop/src/stores/triggerStore.ts`, reached by `apps/desktop/src/features/workflows/AutomationBuilder.tsx` (import).
- **mobile**: absent. Nothing under apps/mobile declares or fires a trigger.
- **cli**: unverified. Settled by: Whether apps/cli/src/agent_events.rs is a trigger source or only a transcript of a run, which its consumers would answer.
- **vscode**: absent. Nothing under apps/extension-vscode/src declares or fires a trigger.
- **chrome**: absent. Nothing under apps/extension/src declares or fires a trigger.
- **api**: present. `apps/web/app/api/github/webhook/webhook-router.ts`, reached by `apps/web/app/api/github/webhook/route.ts` (import).

### SSO

- **web**: present. `apps/web/lib/server/sso/sso-access.ts`, reached by `apps/web/lib/server/sso/sso-route-guard.ts` (import).
- **desktop**: present. `apps/desktop/src/services/desktopSocialSignIn.ts`, reached by `apps/desktop/src/features/auth/NativeSignInCard.tsx` (import).
- **mobile**: unverified. Settled by: Whether the mobile sign-in screen offers an organization's identity provider, which apps/mobile/app/(auth)/login.tsx would answer.
- **cli**: present. `apps/cli/src/oauth.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/account-auth is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: unverified. Settled by: apps/extension/src/features/auth is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **api**: present. `apps/web/lib/server/sso/sso-route-guard.ts`, reached by `apps/web/app/api/admin/sso/route.ts` (import).

### Policy effects

- **web**: present. `apps/web/lib/feature-flags/capability-gate.ts`, reached by `apps/web/app/api/me/route.ts` (import).
- **desktop**: present. `apps/desktop/src/features/v3/useWorkspacePolicy.ts`, reached by `apps/desktop/src/features/v3/Sidebar.tsx` (import).
- **mobile**: unverified. Settled by: A mobile path that reads the workspace policy and withholds a control. apps/mobile/app/(app)/settings/workspace.tsx names the workspace; whether it enforces its policy is not decidable from the file list.
- **cli**: present. `apps/cli/src/permissions.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/config is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: unverified. Settled by: apps/extension/src/features/site-policy is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **api**: present. `apps/web/lib/services/connector-policy-gate.ts`, reached by `apps/web/app/api/plugins/uploads/route.ts` (import).

### Model restrictions

- **web**: present. `apps/web/lib/services/model-policy-gate.ts`, reached by `apps/web/lib/managed-compute-gate.ts` (import).
- **desktop**: unverified. Settled by: A desktop path that withholds a model the workspace disallows. apps/desktop/src/features/v3/useWorkspacePolicy.ts reads the policy; whether the model picker consumes it is not decidable from the file list.
- **mobile**: unverified. Settled by: Whether apps/mobile/app/(app)/models.tsx filters by the workspace's allowed models.
- **cli**: present. `apps/cli/src/model_reachability.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: present. `apps/extension-vscode/src/features/model-picker/reachability.ts`, reached by `apps/extension-vscode/src/core/commandSetup.ts` (import).
- **chrome**: unverified. Settled by: Whether the side panel offers a model choice at all, and if so whether it filters it.
- **api**: present. `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, reached by `apps/web/lib/voice/live-voice-tools.ts` (import).

### Connector restrictions

- **web**: present. `apps/web/lib/services/connector-policy-gate.ts`, reached by `apps/web/app/api/plugins/uploads/route.ts` (import).
- **desktop**: present. `apps/desktop/src/services/desktopCloudConnectorInstall.ts`, reached by `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` (import).
- **mobile**: unverified. Settled by: Whether apps/mobile/services/connectors.ts refuses a connector the workspace disallows rather than only listing what the server returns.
- **cli**: absent. The CLI has no connectors, so it has nothing to restrict.
- **vscode**: present. `apps/extension-vscode/src/features/connectors/connectorsClient.ts`, reached by `apps/extension-vscode/src/features/connectors/index.ts` (import).
- **chrome**: absent. The extension has no connectors, so it has nothing to restrict.
- **api**: present. `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts`, reached by `apps/web/app/api/llm/v1/chat/completions/route.ts` (import).

### Sharing restrictions

- **web**: present. `apps/web/app/api/share/route.ts`, reached by `apps/web/app/layout.tsx` (route).
- **desktop**: unverified. Settled by: A desktop path that creates or refuses a share link. Nothing under apps/desktop/src was found doing either.
- **mobile**: present. `apps/mobile/app/(app)/settings/shared-links.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: absent. Nothing under apps/cli/src creates a share link.
- **vscode**: absent. Nothing under apps/extension-vscode/src creates a share link.
- **chrome**: absent. Nothing under apps/extension/src creates a share link.
- **api**: present. `apps/web/app/api/share/[token]/route.ts`, reached by `apps/web/app/layout.tsx` (route).

### Audit visibility

- **web**: present. `apps/web/lib/workspace-audit.ts`, reached by `apps/web/app/api/skills/route.ts` (import).
- **desktop**: present. `apps/desktop/src/features/governance/AuditLog.tsx`, reached by `apps/desktop/src/features/governance/GovernanceDashboard.tsx` (import).
- **mobile**: absent. Nothing under apps/mobile reads the audit log; administration happens on the web surface.
- **cli**: present. `apps/cli/src/approval_audit.rs`, reached by `apps/cli/src/lib.rs` (module).
- **vscode**: absent. Nothing under apps/extension-vscode/src reads the audit log.
- **chrome**: absent. Nothing under apps/extension/src reads the audit log.
- **api**: present. `apps/web/lib/services/audit-streaming-proxy.ts`, reached by `apps/web/lib/services/audit-streaming-service.ts` (import).

### Managed-compute restrictions

- **web**: present. `apps/web/lib/runtime/memory-capability.ts`, reached by `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` (import).
- **desktop**: present. `apps/desktop/src/features/v3/LocalCloudToggle.tsx`, reached by `apps/desktop/src/features/v3/Sidebar.tsx` (import).
- **mobile**: present. `apps/mobile/app/(app)/settings/cloud-privacy.tsx`, reached by `apps/mobile/app/(app)/_layout.tsx` (route).
- **cli**: unverified. Settled by: apps/cli/src/trust is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **vscode**: unverified. Settled by: apps/extension-vscode/src/features/config is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **chrome**: unverified. Settled by: apps/extension/src/features/privacy is a directory, not an entry point. A file in it that the surface's shell imports or routes to would settle this, naming both.
- **api**: present. `apps/web/lib/feature-flags/capability-gate.ts`, reached by `apps/web/app/api/me/route.ts` (import).

### Administration

- **web**: present. `apps/web/app/admin/page.tsx`, reached by `apps/web/app/admin/layout.tsx` (route).
- **desktop**: absent. Administration is a web surface; nothing under apps/desktop/src reaches an administrative route.
- **mobile**: absent. Administration is a web surface; nothing under apps/mobile reaches an administrative route.
- **cli**: absent. Administration is a web surface; nothing under apps/cli/src reaches an administrative route.
- **vscode**: absent. Administration is a web surface; nothing under apps/extension-vscode/src reaches an administrative route.
- **chrome**: absent. Administration is a web surface; nothing under apps/extension/src reaches an administrative route.
- **api**: present. `apps/web/app/api/admin/observability/route.ts`, reached by `apps/web/app/layout.tsx` (route).
