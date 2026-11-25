---
id: "AREA-026"
type: "area"
title: "Artifact container and panel"
features: ["F026-01", "F026-02", "F026-03", "F026-04", "F026-05", "F026-06", "F026-07", "F026-08", "F026-09", "F026-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 26. Artifact container and panel

An artifact is a finished piece of work the assistant makes in a chat, such as a web page, document, diagram or code file. This area is the card that shows it in the chat, and the viewer that opens it beside the conversation, full screen or in its own window. It lets a person read, copy, export, version, share and reuse that work without losing it. Without it the assistant's output would be plain text that is hard to keep, change or reuse.

**Who uses it.** Every person who uses chat on a surface that renders artifacts (web, desktop, mobile in the code I read). The code I opened shows no plan gate for opening or viewing the artifact. Cloud save and comments are gated by code (see switches). Workspace or admin use is not established. Developers use the same viewer through the shared package.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F026-01](F026-01-artifact-cards-in-chat-opening-closing-reopening.md) | Artifact cards in chat, opening, closing, reopening | built | built | built | partly | partly | partly |
| [F026-02](F026-02-lifecycle-state-live-updates-error-and-recovery-pa.md) | Lifecycle state, live updates, error and recovery panels | built | built | partly | no | no | partly |
| [F026-03](F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md) | Viewer layout: docked panel, resize, full screen, detached window, tabs, switching | built | built | partly | built | built | partly |
| [F026-04](F026-04-preview-source-view-and-read-only-mode.md) | Preview, source view and read-only mode | built | built | partly | partly | partly | partly |
| [F026-05](F026-05-versions-pick-step-compare-restore.md) | Versions: pick, step, compare, restore | partly | partly | partly | no | no | no |
| [F026-06](F026-06-copy-and-export.md) | Copy and export | built | built | built | built | built | partly |
| [F026-07](F026-07-sharing-and-visibility.md) | Sharing and visibility | built | built | built | built | built | no |
| [F026-08](F026-08-library-projects-copies-and-handoff-to-another-cha.md) | Library, projects, copies, and handoff to another chat | partly | partly | partly | partly | no | partly |
| [F026-09](F026-09-edit-requests-selection-comments-collected-request.md) | Edit requests: selection, comments, collected requests (not built per brief) | partly | partly | partly | no | no | no |
| [F026-10](F026-10-connected-data-status-refresh-and-artifact-usage-n.md) | Connected-data status, refresh, and artifact usage (not built per brief) | partly | partly | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/026-artifact-container-and-panel.md](../../10-requirements/capabilities/026-artifact-container-and-panel.md).

## How this area works in the code

1. **Card in the chat.** A reply's artifacts are passed to the inline card list. The list shows at most three cards, a '+N more' button for the rest, and a Download all button when there are two or more. Pressing a card selects the artifact in the store and opens the panel. Pressing the same card again closes the panel. (`apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:14`, `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:22-35`, `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:44-68`, `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:70-85`)
2. **Shared store and browser saving.** The web artifact store keeps the artifacts, their versions and the selected id. It is saved to browser storage under one key with a quota-aware writer. If the write fails for lack of space, saving is turned off and an error is logged, and the store keeps working in memory only. (`apps/web/features/chat/stores/artifacts-store.ts:528-590`, `apps/web/features/chat/stores/artifacts-store.ts:591-593`)
3. **Panel selection and deep links.** The panel reads the store. When the chat changes conversation, it selects that conversation's first artifact. A deep link in the address selects the artifact and opens the panel when that artifact exists. (`apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:625-636`, `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:638-650`)
4. **Panel layout.** The panel renders nothing when closed. On the mobile layout with the panel open it becomes a modal overlay. On the desktop layout its width is set from panelWidth. Width bounds (280 to 900 pixels) live in a shared UI store that every surface that drags the panel uses. (`apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:678-681`, `packages/ui/unified-chat/src/stores/uiStore.ts:9-13`)
5. **Publishing from the panel.** A publish handler checks that the publication view is still open, then calls the publish service with a managed privacy mode and the origin privacy mode. A second publish on the same artifact is refused while one is pending. (`apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:440-480`)
6. **Viewer preview and tools.** The preview component gates the selection-edit, comment and changes layers. Selection-edit needs a stored artifact, the latest version, and a request handler. Comments need a stored artifact and a comment permission check. The viewer mounts the comments panel, the selection toolbar, the edit-request layer and the changes view when those are on. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2165-2169`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2213`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3144-3215`)
7. **Interrupted and error states.** An artifact flagged as interrupted shows a banner. Failed document or image rendering shows a message and a download or retry hint. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:215`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2031`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2081`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2961`)
8. **Duplicate and save to cloud.** Duplicate creates a copy and shows a success toast; failure shows an error toast. Cloud save and connector actions only appear when the connectors-released check passes. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2448-2459`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2502-2516`)
9. **Mobile store.** The mobile app has its own artifact store, persisted under its own name. It is separate from the web store; the mobile viewer is a full-screen sheet. (`apps/mobile/src/features/artifacts/store.ts:308`, `apps/mobile/src/features/artifacts/store.ts:577`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx` | Cards in the chat: open, toggle, overflow, Download all. |
| `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Docked or modal panel: list of artifacts, tabs, width, conversation switching, deep links, publish handler. |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | The viewer (about 3,700 lines): preview, source, edit, versions, export, duplicate, save, share, comments and selection layers. Only partly read. |
| `apps/web/features/chat/stores/artifacts-store.ts` | Web store for artifacts, versions and selection; browser saving with quota handling. Read by search only. |
| `packages/ui/unified-chat/src/stores/uiStore.ts` | Shared panel width bounds (280 to 900) and the active right panel state, used across surfaces. |
| `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Selection actions shown when text in an artifact is selected (found by search, not read in full). |
| `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Changes view between two versions (found by search, not read in full). |
| `apps/web/features/chat/components/artifacts/ArtifactTitleField.tsx` | Title field and rename label (found by search, not read in full). |
| `apps/mobile/src/features/artifacts/store.ts` | Mobile artifact store and its persisted storage name (found by search, not read in full). |

## What is stored

- Web artifacts, their versions, and the selected artifact id: Browser local storage under the key 'agi-artifacts-store' (apps/web/features/chat/stores/artifacts-store.ts:591-593); saving is turned off when storage quota is full (lines 528-590).
- Mobile artifact store: Persisted by the mobile store under the name at apps/mobile/src/features/artifacts/store.ts:577 (storage backend not checked).
- Panel width (shared): Shared UI store in packages/ui/unified-chat/src/stores/uiStore.ts (persistence wrapper present; storage key not read).
- Published artifacts and their visibility: Server side through apps/web/app/api/artifacts/publish/route.ts (not opened; storage not verified).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **connectorsReleased()**: Turns on the cloud-save and connector actions for Markdown and stored artifacts in the viewer. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2448 and 2459 (the function's definition was not read).)
- **canComment / canCommentOn(artifactId)**: Shows the comments control and the comments panel for stored artifacts in the panel variant. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2213 and 3144; the check is defined in apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts (body not fully read).)
- **canRequestSelectionEdits**: Shows the selection-edit toolbar only for a stored, latest version in the panel variant with a request handler. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2165-2169 (later conditions not read).)
- **layout === 'mobile'**: Turns the panel into a modal overlay that closes on dismiss. (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:678-680.)
- **Panel width bounds**: Clamps the side panel width to 280 to 900 pixels. (packages/ui/unified-chat/src/stores/uiStore.ts:3-13.)
- **Store version 3 migration**: Older saved artifact data is migrated or cleared when the stored version differs. (apps/web/features/chat/stores/artifacts-store.ts:589-606.)

## Shared between apps

Shared across apps: the side panel width bounds and right-panel state live in packages/ui/unified-chat/src/stores/uiStore.ts. The web viewer imports the selection-action helper from the shared package '@agiworkforce/unified-chat/artifact-selection-request' (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:20). Separate per app: the web artifact store and viewer are in apps/web; the mobile store and full-screen viewer are in apps/mobile; the CLI, VS Code and Chrome code was not opened (the brief lists paths there).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief says selection edit (S26.17), inline comments (S26.18) and pending edit requests (S26.19) are missing on every app, but the web viewer mounts a comments panel, a selection toolbar and an edit-request layer, gated by conditions. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3144-3215; ArtifactPreview.tsx:2165-2169; ArtifactPreview.tsx:2213)
- The brief says rename (S26.25) is missing everywhere, but the web title field has a Rename label and the viewer passes canRename. (apps/web/features/chat/components/artifacts/ArtifactTitleField.tsx:10; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2631)
- The brief says compare versions (S26.22) is missing everywhere, but a changes view component exists and is mounted when a previous version is present. (apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:65; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3211)
- Saving can be turned off when browser storage is full. Then artifacts are kept only in memory, so reopening after a reload (S26.07) can fail, and the user is not told. (apps/web/features/chat/stores/artifacts-store.ts:528-590)
- Odd code: a variable is read only to silence a lint warning in the deep-link effect. (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:637-640)

## Not established

- CLI, VS Code, desktop, Chrome and the sandbox (infrastructure/sandbox/index.html) were not opened. Their statuses come only from the brief.
- The server publish route (apps/web/app/api/artifacts/publish/route.ts), sharing rules, and who can see a link were not read.
- How versions are stored on the server, and whether restore is server-side or local, was not established.
- Full conditions of canRequestSelectionEdits, canCommentOn and connectorsReleased were not read.
- Whether the panel width comes from the shared UI store or the web store was not established (ArtifactsPanel.tsx:681 uses panelWidth; its source was not found).
- Keyboard resize (S26.09) was not found in the code I searched in ArtifactsPanel.tsx.
- Whether plans, credits, or the Local, own-key and Cloud modes change any artifact feature was not established.
- Detached window (S26.11) code in ArtifactPreview.tsx:306 and 1142 and the desktop windowPolicy.ts was not read.
- Mobile full-screen code (ArtifactFullScreen.tsx) was only found by search; its behaviour was not read.
- Connected-data and usage features (S26.33, S26.34, S26.37) were checked only against the brief; the brief says missing.
- No build, test or server was run, as instructed.
