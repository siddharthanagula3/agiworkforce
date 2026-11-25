---
id: "AREA-028"
type: "area"
title: "Code Canvas and application preview"
features: ["F028-01", "F028-02", "F028-03", "F028-04", "F028-05", "F028-06", "F028-07", "F028-08", "F028-09", "F028-10", "F028-11", "F028-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 28. Code Canvas and application preview

When the assistant writes an HTML page, a React component, a diagram or a multi-file project, the person can look at it running, read or edit its source, and keep, download, publish or continue it. This area is the panel that shows those generated artifacts. It matters because a generated app is only useful if the person can see it work, change it, and share it safely.

**Who uses it.** Every signed-in person who has a generated artifact (web, desktop and mobile show it in chat; VS Code and the CLI open artifacts from the account index). Publishing needs a signed-in person. A viewer of a published app can run it, but its AI and saved data need a signed-in viewer (infrastructure/sandbox/index.html:242-243). Workspace-level sharing is an option on publish (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1317-1350). The brief names no plan gate for this area. The only plan value read in the AI path is the account's plan entitlement (apps/web/app/api/artifacts/runtime/artifact-completion.ts:252). Whether that gates paid plans only was not established.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F028-01](F028-01-edit-the-generated-source.md) | Edit the generated source | partly | partly | partly | n/a | no | no |
| [F028-02](F028-02-project-files-tree-create-delete-rename-search.md) | Project files: tree, create, delete, rename, search | no | no | no | no | no | no |
| [F028-03](F028-03-preview-view-options.md) | Preview view options | partly | partly | partly | n/a | n/a | partly |
| [F028-04](F028-04-element-picking-for-edit-requests.md) | Element picking for edit requests | partly | partly | no | n/a | n/a | no |
| [F028-05](F028-05-preview-errors-and-reload.md) | Preview errors and reload | partly | partly | partly | n/a | n/a | partly |
| [F028-06](F028-06-app-dependencies-network-and-secrets.md) | App dependencies, network and secrets | no | no | no | n/a | n/a | no |
| [F028-07](F028-07-ai-and-saved-data-inside-a-published-app.md) | AI and saved data inside a published app | built | no | no | n/a | n/a | no |
| [F028-08](F028-08-download-and-export.md) | Download and export | built | built | partly | partly | partly | partly |
| [F028-09](F028-09-open-in-a-coding-workspace.md) | Open in a coding workspace | no | no | no | built | built | no |
| [F028-10](F028-10-publish-a-preview-link.md) | Publish a preview link | built | built | built | built | no | no |
| [F028-11](F028-11-version-history-compare-and-roll-back.md) | Version history: compare and roll back | partly | partly | partly | no | no | no |
| [F028-12](F028-12-shared-apps-fork-and-viewer-sign-in.md) | Shared apps: fork and viewer sign-in | partly | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/028-code-canvas-and-application-preview.md](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md).

## How this area works in the code

1. **Show the artifact in the panel.** The web panel decides whether to show the preview or the source. For HTML, React, SVG and Mermaid it renders the preview. For text it shows the source. A preview payload is built and passed to the sandboxed frame component. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3250-3270`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3333-3345`)
2. **Pick the frame: separate sandbox origin or local fallback.** If NEXT_PUBLIC_SANDBOX_ORIGIN is set to an allowed https or localhost origin, the artifact loads from that origin in a frame with allow-scripts and allow-same-origin. If not set, or if the sandbox does not connect in time, the artifact is written into a local frame with allow-scripts and allow-modals only. (`apps/web/lib/artifact-sandbox.ts:158-176`, `apps/web/features/chat/components/SandboxedIframe.tsx:392-405`, `apps/web/features/chat/components/SandboxedIframe.tsx:422-427`, `apps/web/features/chat/components/SandboxedIframe.tsx:37-38`)
3. **Send the artifact to the renderer.** The parent posts a render message to the renderer. The renderer accepts messages only from its own parent and only from allowed origins, then picks a renderer by kind (html, react, svg, mermaid, text, code). (`infrastructure/sandbox/index.html:942-956`, `infrastructure/sandbox/index.html:881-916`, `infrastructure/sandbox/index.html:149-157`)
4. **Render HTML as a real document.** HTML is put in a nested frame with srcdoc, so the artifact's own load events and viewport work. The nested frame has no sandbox attribute, so it inherits the renderer's content policy. A blocked frame falls back to plain markup. (`infrastructure/sandbox/index.html:636-692`, `infrastructure/sandbox/index.html:54-57`)
5. **Run artifact code and report errors.** Errors and rejected promises in the artifact are sent back to the parent as render errors and shown in an error block. Runtime requests from the artifact (AI and storage) are sent to the parent with an id and the parent sends the answer back. (`infrastructure/sandbox/index.html:926-934`, `infrastructure/sandbox/index.html:353-370`, `infrastructure/sandbox/index.html:961-972`)
6. **Server handles app AI and storage.** The renderer's storage calls go to the storage route, which checks the token, the value size and the connector rule, then writes to the published-app storage table. AI calls go to the completion route, which checks the AI switch and the connector release gate. (`apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:84-109`, `apps/web/lib/services/artifact-runtime-service.ts:200-210`, `apps/web/app/api/artifacts/runtime/artifact-completion.ts:116-122`, `packages/contracts/cloud-contracts/src/artifact-runtime.ts:10-11`)
7. **Save source edits as versions.** A source edit is written to the artifact store as a new version. Drafts are also kept in browser storage until saved or restored. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124-1136`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:395-425`)
8. **Publish to a shareable link.** The client checks that the artifact kind can be published, then posts to the publish route. The route checks the CSRF token and a rate limit, then prepares and stores the publication. (`apps/web/features/chat/components/artifacts/publishArtifactClient.ts:78-100`, `apps/web/app/api/artifacts/publish/route.ts:42-71`)

## Files to know

| File | Role |
|---|---|
| `infrastructure/sandbox/index.html` | The one renderer used by web (separate origin) and desktop (built into the app). Runs HTML, React, SVG, Mermaid and text, the error reporting, the element picker and the runtime bridge. |
| `apps/web/lib/artifact-sandbox.ts` | Reads the sandbox origin from NEXT_PUBLIC_SANDBOX_ORIGIN, checks the message source, and parses the render, picker and runtime messages. |
| `apps/web/features/chat/components/SandboxedIframe.tsx` | Parent-side frame component. Chooses the separate-origin frame or the local fallback, and handles timeouts and render errors. |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | The web side panel: preview and code tabs, source editing, reload, version restore, download, Library and cloud save, publish and audience controls. |
| `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | Server route for an app's saved values (get, set, delete, list), with size and connector checks. |
| `apps/web/lib/services/artifact-runtime-service.ts` | Server logic for an app's storage and AI calls, including the AI switch and the token-based access. |
| `apps/web/app/api/artifacts/publish/route.ts` | Server route that publishes an artifact to a shareable link. |
| `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Mobile preview in a WebView. Runs script only for HTML and React, and shows the error panel with Retry and View source. |
| `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | VS Code commands: open an artifact read-only, copy its content, save it into the workspace, open the published page. |
| `apps/cli/src/cloud/artifacts.rs` | CLI client for the account's artifact index, publish, audience and unpublish. |
| `apps/web/features/chat/utils/downloadArtifacts.ts` | Single-file download and zip export of artifacts in the browser. |
| `packages/contracts/cloud-contracts/src/artifact-runtime.ts` | Shared limits: prompt size, connectors, storage key and value sizes. |

## What is stored

- Unsaved source edit (draft) for one artifact, keyed agi.artifact-draft:<artifact id>: Browser localStorage on the web app (ArtifactPreview.tsx:395-425)
- Artifact content and versions: Client artifact store (apps/web/features/chat/stores/artifacts-store.ts). Persistence was not read, so where it is saved beyond the browser is unknown.
- App saved values (key, value, shared flag, owner scope): Database table public.published_artifact_storage (apps/web/db/neon/0325_published_artifact_storage.sql:3-9)
- Published artifact records: Database table public.published_artifacts, referenced by the storage table (migration 0325)
- Artifact saved to the person's Library: Sent to POST /api/library (ArtifactPreview.tsx:1447); stored server-side, not read
- Downloaded files and zips: Created in the browser and handed to the operating system save flow; not stored by the app (downloadArtifacts.ts:100-103)
- Sandbox renderer state: None kept. The renderer keeps only in-memory state for one render (index.html:245-247)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **NEXT_PUBLIC_SANDBOX_ORIGIN**: When set to an allowed https or localhost origin, artifacts run on a separate origin. When unset, they run in the local fallback frame. It is read at build time, so changing it needs a rebuild. Audit notes say it is unset in production (apps/web/lib/artifact-sandbox.ts:159; audit/prior-audits/chat-security-audit-2026-10-26.md:62). (apps/web/lib/artifact-sandbox.ts:159)
- **AGI_ARTIFACT_AI_ENABLED**: Turns on the AI call for apps. When off, AI calls are refused with artifact_ai_off. (apps/web/lib/server/artifact-ai-switch.ts:5-7; read at apps/web/app/api/artifacts/runtime/artifact-completion.ts:116 and apps/web/lib/services/artifact-runtime-service.ts:641)
- **CONNECTOR_RELEASE_STATE (released or coming_soon)**: While not released, any AI request that asks for connectors is refused with connectors_coming_soon. (packages/contracts/types/src/connector-release.ts:10 and :46-49; checked at apps/web/app/api/artifacts/runtime/artifact-completion.ts:121)
- **Account plan entitlement**: Passed into the AI and connector plan. Which plans get what was not established. (apps/web/app/api/artifacts/runtime/artifact-completion.ts:252 and :273)
- **Publish rate limit (share-create)**: Limits how often an artifact can be published. (apps/web/app/api/artifacts/publish/route.ts:46-47)
- **Artifact storage limits**: Maximum 4 MiB per saved value, 20 MiB per scope, prompt 100,000 characters, at most 10 connectors. (packages/contracts/cloud-contracts/src/artifact-runtime.ts:3-11)
- **Cloud save size limit**: Maximum 3,000,000 bytes for a cloud save. (packages/contracts/cloud-contracts/src/artifact-cloud-save.ts:7)
- **Parent origin allowlist in the renderer**: Only the listed parent origins can drive the renderer. Developer origins (localhost) are added only when the renderer itself is served from localhost. (infrastructure/sandbox/index.html:149-182)
- **Mobile script switch**: Only HTML and React artifacts run script on mobile. Diagrams get script for drawing. (apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:99-100 and :280)

## Shared between apps

Shared: the renderer in infrastructure/sandbox/index.html is the same file for web (served from a separate origin) and desktop (built into the desktop app and served from a special address, per the comment at index.html:11-13; the desktop Rust file was not opened). Shared limits and message rules live in packages/contracts/cloud-contracts and packages/contracts/types (the content policy string is generated from packages/contracts/types/src/artifact-csp.ts per index.html:48-53). Web-only: ArtifactPreview.tsx, SandboxedIframe.tsx, artifact-sandbox.ts, and the web API routes. Separate per app: mobile uses its own WebView preview (SafeArtifactPreview.tsx, sandboxedArtifactHtml.ts). VS Code and CLI have their own code that reads the account artifact index and never runs an artifact (VS Code opens artifacts read-only).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief marks VS Code file tree, create, delete, rename, search, diagnostics as done, but the cited lines are not that code: package.json:74 is the setting agiWorkforce.archiveInactiveSessionsDays, extension.ts:50 is a startup import, and diffDecorationProvider.ts:346 is blank. Package.json:282 is a command title (Copy Remote Control Pairing Link), not an editor feature. (apps/extension-vscode/package.json:74, :282; apps/extension-vscode/src/extension.ts:50; apps/extension-vscode/src/providers/diffDecorationProvider.ts:346)
- The brief cites CLI lines for download, open-in-workspace and publish, but lib.rs:1034 is the session export command, lib.rs:1944 is the session transcript, and lib.rs:1053 is a doc comment on the init command. The artifact commands are at lib.rs:1082 and lib.rs:1399-1422. (apps/cli/src/lib.rs:1034, :1053, :1944)
- The brief marks element picking (S28.14) missing on every app, but the shared renderer contains a full element picker and request-edits mode is wired in the web panel. (infrastructure/sandbox/index.html:383-580; apps/web/features/chat/components/SandboxedIframe.tsx:143, :155; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:921, :2245, :3264)
- The brief marks version comparison (S28.29) missing, but the web panel has a Changes view that compares a version with the one before it. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:987-988)
- Restart runtime (S28.19) has no separate code. The only control is the reload handler, which bumps the same refresh counter. The brief cites lines 1580 and 902, which are the cloud-save builder and an activeContent memo. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1753-1758 (handleRefresh); cited lines 902 and 1580 are unrelated)
- The brief cites ArtifactPreview.tsx:1342 for source editing (S28.01), but that line is in the publish audience confirmation. Source save is at saveSourceEdit (line 1124) and the editor is at line 3333. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342, :1124, :3333)
- The renderer's inner preview frame has no sandbox attribute, so it inherits the renderer's policy and keeps the same origin. Known flaw WEB-ARTIFACT-NAVIGATION-EXFIL-01 (audit/registers/known-flaws.md:57) says an artifact can navigate its frame to an outside form that carries conversation data once the separate sandbox origin is set. The brief's switch-on step for HTML and React sets that origin, so the flaw becomes live when it is turned on. (infrastructure/sandbox/index.html:650-655 (no sandbox attribute), :690 (srcdoc); audit/registers/known-flaws.md:57)
- The brief's switch-on for HTML and React preview says to set NEXT_PUBLIC_SANDBOX_ORIGIN. The code says the same, but the known flaw above must be closed before that switch. The brief does not mention it. (apps/web/lib/artifact-sandbox.ts:159; audit/prior-audits/chat-security-audit-2026-10-26.md:62)
- Mobile WebView allows any origin and runs script for HTML and React, while allowing only the default file access setting off. This was seen but not checked against the mobile trust rules. (apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:279-296)
- VS Code and CLI rows: VS Code's S28.01 is marked done but the file opens read-only; editing happens only after Save into Workspace. (apps/extension-vscode/src/features/artifacts/artifactActions.ts:104-107, :163-208)

## Not established

- Whether NEXT_PUBLIC_SANDBOX_ORIGIN is set in production today. The audit notes say unset (2026-10-26), but the env value was not read and no live check was run.
- Whether a React artifact works in the local fallback frame (no separate origin). The code path for React in the fallback was not traced.
- Whether the source editor (ArtifactCodeEditor) gives syntax highlighting, indentation and bracket help. The component's internals were not opened, so S28.05 is unknown in the code.
- How the element picker's request-edits UI sends a request to the chat after a pick. The picker is wired (ArtifactPreview.tsx:3264), but the code that turns a pick into a request was not read.
- Where artifact versions are saved (the artifact store's persistence) beyond the browser. Only the store interface was read.
- Which plans can use app AI and connectors. The code reads the entitlement plan value but the plan rules were not opened.
- The desktop-side Rust sandbox (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs) was not opened, so the desktop serving path is taken from the renderer's comment only.
- The VS Code and CLI commands that open the published page and the CLI browse path (artifactActions.ts:210, cloud/artifacts.rs browse_url) were not read in full.
- Mobile publish flow (artifactPublishing.ts and ArtifactFullScreen.tsx publication state) was only partly read.
- Chrome status is unverified in the brief and was not checked in code.
- Reading only: no tests, builds, servers or live checks were run, as the task was read-only. The relayed request asked that testing be done on localhost with one surface at a time, but this task had no testing step.
