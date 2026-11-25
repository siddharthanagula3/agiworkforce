---
id: "AREA-027"
type: "area"
title: "Document and writing editor"
features: ["F027-01", "F027-02", "F027-03", "F027-04", "F027-05", "F027-06", "F027-07", "F027-08", "F027-09", "F027-10", "F027-11", "F027-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 27. Document and writing editor

A document is a written artifact the assistant makes in a chat, such as a memo, report or article. The person can read it, edit it as text or in a visual editor, keep earlier versions, select text to ask the assistant for a change, and export it as Markdown, Word, PDF or plain text. This matters because a finished draft is only useful if it can be fixed, checked against earlier versions and taken out of the app. Much of the brief's list is not built yet: no page layout, no find, no word count, no suggestion or tracked-change mode, and no live presence.

**Who uses it.** Every person who has a document artifact in a chat, on web and mobile, as far as the code shows. I found no plan gate in the files I read. Editing on web is only offered in the side panel view (variant 'panel'), on the latest version, and never for PDF, Word or image artifacts. Saving a document to Google Docs, Google Drive or OneDrive is hidden because the connector release state is 'coming_soon' (see switches). Workspace admins are not part of this area in the code I read, apart from the share-with-workspace control in the web viewer.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F027-01](F027-01-document-title.md) | Document title | built | built | built | built | built | partly |
| [F027-02](F027-02-outline-of-headings.md) | Outline of headings | built | built | partly | n/a | n/a | no |
| [F027-03](F027-03-rich-text-editing-find-and-word-count.md) | Rich text editing, find and word count | partly | partly | no | n/a | n/a | no |
| [F027-04](F027-04-text-and-block-formatting.md) | Text and block formatting | partly | partly | no | n/a | n/a | no |
| [F027-05](F027-05-tables-and-images.md) | Tables and images | built | built | no | n/a | n/a | partly |
| [F027-06](F027-06-markdown-source-saving-and-undo.md) | Markdown source, saving and undo | built | built | partly | no | no | no |
| [F027-07](F027-07-version-history.md) | Version history | built | built | built | no | no | partly |
| [F027-08](F027-08-selection-actions.md) | Selection actions | built | built | no | n/a | partly | partly |
| [F027-09](F027-09-suggestions-tracked-changes-comments-and-presence.md) | Suggestions, tracked changes, comments and presence | partly | partly | no | no | no | no |
| [F027-10](F027-10-page-layout-print-templates-brand-and-citations.md) | Page layout, print, templates, brand and citations | partly | partly | no | n/a | n/a | partly |
| [F027-11](F027-11-export-and-save-out.md) | Export and save out | partly | partly | partly | partly | partly | partly |
| [F027-12](F027-12-email-drafts.md) | Email drafts | n/a | n/a | n/a | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/027-document-and-writing-editor.md](../../10-requirements/capabilities/027-document-and-writing-editor.md).

## How this area works in the code

1. **Show the title on a card and in the viewer.** The card reads the title through artifactTitle, which falls back to 'Untitled'. The store trims and length-limits titles on rename. Mobile uses a kind-based fallback instead. (`apps/web/features/chat/components/artifacts/ArtifactLabels.tsx:16`, `apps/web/features/chat/components/artifacts/ArtifactLabels.tsx:50`, `apps/web/features/chat/components/artifacts/ArtifactCard.tsx:105`, `apps/web/features/chat/stores/artifacts-store.ts:955`, `apps/mobile/src/features/artifacts/artifactTitle.ts:74`)
2. **Open a Markdown document in the viewer.** The viewer renders Markdown with the shared renderer, and shows an outline when there are at least 3 headings. Math, tables and checkboxes are handled by plugins in the shared renderer. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:279`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:281`, `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:71`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:822`)
3. **Start editing (web).** Edit document (or the Source tab) is shown only in the side panel view, on the latest stored version, for text documents. It copies the current text into a draft. If the Markdown reads back the same after a round trip, the visual editor opens; otherwise the code-style source editor opens with a notice. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2160`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3291`, `apps/web/features/chat/components/artifacts/document-editor-markdown.ts:81`, `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:60`)
4. **Keep the draft on the device while typing.** Each change updates the draft in browser storage under a per-artifact key. The status line says 'Draft kept on this device' or 'Draft not kept'. Nothing is written as a version yet. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:395`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:406`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1162`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2728`)
5. **Save a new version.** Save writes the draft into the store as a new version and clears the draft. Checklist ticks do the same after a 4-second pause. The store keeps versions and persists them to browser storage; a cloud push follows separately. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1182`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2719`, `apps/web/features/chat/stores/artifacts-store.ts:590`, `apps/web/features/chat/stores/artifacts-store.ts:1079`)
6. **Ask the assistant to change a selection.** Selecting text shows the selection toolbar. The chosen action builds a request with the selected text, the surrounding text and the title, and sends it through the chat's edit-request callback. The assistant's answer comes back as a new version. (`apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:213`, `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:303`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2177`, `packages/ui/unified-chat/src/lib/artifact-selection-request.ts:40`)
7. **Restore or step through versions.** Choosing Restore asks for confirmation, then the store adds the chosen version as the newest one. Undo and Redo step through versions in an edit trail. (`apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:76`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1015`, `apps/web/features/chat/stores/artifacts-store.ts:976`)
8. **Export a file.** Web Download as Markdown, PDF or Word calls the document export service, which builds the file in the browser. Google Docs and cloud save are hidden unless connectors are released; the server refuses them too. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1655`, `apps/web/features/chat/services/document-export-service.ts:68`, `packages/contracts/types/src/connector-release.ts:14`, `apps/web/app/api/artifacts/export/google-docs/route.ts:44`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web document viewer: reader, Source and visual editing, Save, version controls, selection actions, export menu, Google Docs and cloud save (hidden), template and brand actions. |
| `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Chooses the visual (Tiptap) editor for round-trip-safe Markdown, or the source editor with a notice. |
| `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx` | Toolbar for the visual editor: text style dropdown, bold, italic, lists, checklist, quote, code, link, table, undo, redo. |
| `apps/web/features/chat/components/artifacts/document-editor-markdown.ts` | Editor extensions (starter kit, tables, task lists) and the round-trip check that decides whether a document opens in the visual editor. |
| `apps/web/features/chat/stores/artifacts-store.ts` | Web artifact store: versions, rename, restore, duplicate, persistence to browser storage, push to cloud. |
| `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Shared Markdown reader used by web, desktop and mobile: code, math, tables, task checkboxes, image trust, email blocks. |
| `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | Markdown parser plugins; makes tables with extra cells read-only source. |
| `packages/ui/unified-chat/src/lib/artifact-selection-request.ts` | The list of selection actions (rewrite, shorten, lengthen, tone, audience, translate) and the request builder. |
| `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile full-screen document view: edit source, save as a new version, undo and redo, outline, export sheet, version stepper. |
| `apps/mobile/src/features/chat/utils/artifactExport.ts` | Mobile export options (Markdown, PDF, Word, plain text) and the export runner. |
| `packages/contracts/types/src/connector-release.ts` | Switch that hides connected-service saves (currently set to 'coming_soon'). |
| `apps/cli/src/cloud/artifacts.rs` | CLI artifact index: title fallback and output file naming by type. |
| `apps/cli/src/approval_details.rs` | CLI approval screen: lists recipients and subject from any tool's arguments before approval. |

## What is stored

- Web artifacts with their versions (up to 200 artifacts): Browser local storage under the key agi-artifacts-store (apps/web/features/chat/stores/artifacts-store.ts:590-593, 30)
- Unsaved web document drafts, one per artifact: Browser local storage, keys starting with agi.artifact-draft: (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:395-422)
- Mobile artifacts with up to 20 versions each (up to 200 artifacts): Device storage (MMKV) under artifact-store (apps/mobile/src/features/artifacts/store.ts:36, 45, 577-578)
- Mobile unsaved edit drafts: Device storage (MMKV), via keepArtifactDraft (apps/mobile/src/features/artifacts/artifactDrafts.ts:1, 49-69)
- Artifact comments with anchors and reply parent ids: Server, through the /api/artifacts/[artifactId]/comments routes; schema in packages/contracts/cloud-contracts/src/artifact-comments.ts:35
- Exported files: Created on the device and handed to the person; not stored by the app as far as the code shows (apps/web/features/chat/services/document-export-service.ts:68-86)
- CLI: artifacts are read from the hosted service; a file is written only when --out is given: apps/cli/src/lib.rs:1371-1386; apps/cli/src/cloud/artifacts.rs:283

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **CONNECTOR_RELEASE_STATE and connectorsReleased()**: When not 'released', the web menu hides Save to Google Docs and the Drive and OneDrive saves, and the server refuses those requests. Current value is 'coming_soon'. (packages/contracts/types/src/connector-release.ts:14 and :46-50; read in apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2448 and :2459; server check in apps/web/app/api/artifacts/export/google-docs/route.ts:44 and apps/web/app/api/artifacts/save-to-drive/route.ts:43)
- **SELECTIVELY_RELEASED_CONNECTOR_IDS**: Lists connector ids released on their own, outside the global switch. (packages/contracts/types/src/connector-release.ts:16)
- **variant 'panel' versus 'card'**: Only the side panel view offers editing, selection actions, comments and save as template. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:263 and :1041-1042, :2165-2168, :2213)
- **Latest version only**: Editing and selection actions are offered only on the newest version. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041-1042 and :2165-2175)
- **OUTLINE_MIN_HEADINGS**: The outline shows only with at least 3 headings. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:279; apps/mobile/src/features/chat/components/ArtifactDocumentOutline.tsx:10)
- **CHECKLIST_COMMIT_IDLE_MS**: Checklist ticks save after 4 seconds without change. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:396)
- **MAX_RETAINED_ARTIFACTS and MAX_VERSIONS_PER_ARTIFACT**: Caps how many artifacts (200) and how many versions per artifact (20 on mobile) are kept. (apps/web/features/chat/stores/artifacts-store.ts:30; apps/mobile/src/features/artifacts/store.ts:36, 45)
- **MAX_ARTIFACT_COMMENT_CHARS**: Limits a comment to 4,000 characters. (packages/contracts/cloud-contracts/src/artifact-comments.ts:3)
- **MARKDOWN_SHORTCUTS**: Defines the Cmd or Ctrl plus B, I and K wrappers in the source editor. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:387-391)
- **Plan gates**: No plan gate for document editing, export or selection actions was found in the files read. (not found in the files read)

## Shared between apps

[{"what":"Markdown reader: code, math, tables, task checkboxes, image trust, email card, answer citations","where":"packages/ui/unified-chat/src/components/markdown/ (MarkdownContent.tsx, remarkPlugins.ts, taskList.ts, EmailBlock.tsx, richBlocks.ts); used by web and mobile (MarkdownContent.tsx:27, 34)"},{"what":"Selection action list and request builder","where":"packages/ui/unified-chat/src/lib/artifact-selection-request.ts; web wraps it in apps/web/features/chat/components/artifacts/artifact-selection-request.ts"},{"what":"Title normalisation (trim, collapse spaces, length limit)","where":"packages/ui/unified-chat/src/lib/answer-document.ts (normalizeArtifactTitle, used by apps/web/features/chat/stores/artifacts-store.ts:24)"},{"what":"Connector release switch and comment and Google Docs request schemas","where":"packages/contracts/types/src/connector-release.ts; packages/contracts/cloud-contracts/src/artifact-comments.ts; packages/contracts/cloud-contracts/src/google-docs-export.ts"},{"what":"Separate per app: the web editor (Tiptap, CodeMirror), the mobile plain-text editor, the mobile file creation services, the CLI (Rust), the VS Code extension API, and the Chrome side panel and background context menu","where":"apps/web/features/chat/components/artifacts/; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx; apps/mobile/services/fileCreation.ts; apps/cli/src/; apps/extension-vscode/src/; apps/extension/src/"},{"what":"Desktop: the public desktop shows the hosted web app, so it inherits the web behaviour. I did not open desktop code.","where":"AGENTS.md section 5 (repository root)"}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the web visual editor is missing, but a Tiptap-based visual editor exists and opens from Edit document. (apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx:20-45; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3291)
- Brief says Markdown mode is missing on mobile, but mobile has a plain-text source editor with Save as a new version. (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:2016-2023 and :1979)
- Brief says the mobile outline and the web heading control are missing; both exist in code. (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1892; apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx:130-146)
- Brief says web selection actions (rewrite, shorten, lengthen, tone, audience, translate) are missing; the toolbar and action list exist. They send a request to the assistant rather than editing the text in place. (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:303-308; packages/ui/unified-chat/src/lib/artifact-selection-request.ts:40-80; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2177-2200)
- Brief says comments are missing; web side panel has comments with replies and API routes. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2213-2240; packages/contracts/cloud-contracts/src/artifact-comments.ts:35; apps/web/app/api/artifacts/[artifactId]/comments/route.ts)
- Brief says connected-service save is missing; it is built on web but hidden because the connector release state is 'coming_soon'. (packages/contracts/types/src/connector-release.ts:14; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2448, 2459)
- Brief says autosave is done on web; text edits need the Save button. Only checklist ticks save on their own. The 'Draft kept on this device' text is local draft state, not a saving or saved indicator. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2719 and :2728-2735; :1182-1185)
- Brief says underline is done; the editor turns underline off, and no underline control exists. (apps/web/features/chat/components/artifacts/document-editor-markdown.ts:10 (underline: false); DocumentFormattingToolbar.tsx:149-175)
- Brief says images can be inserted; the visual editor has no image button, so images can only be added by typing Markdown in source mode. (apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx:149-229 (no image control); packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:774)
- A table with more cells in a row than in its header is shown as read-only source, not as an editable table. (packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts:17-45)
- Brief says the CLI exports Markdown from the account data export; that line is the account data export, not artifact export. Artifact export is agi artifacts show --out, which writes the raw content with an extension by type. (apps/cli/src/lib.rs:1028-1040 (account export); apps/cli/src/lib.rs:1371-1386; apps/cli/src/cloud/artifacts.rs:236-246)
- Brief's CLI email review refs point to the commit-message line and an MCP error message, not to email code. The review is generic: any tool's recipient and subject keys are shown. The CLI source has no email-sending tool. (apps/cli/src/approval_details.rs:73-74 (commit_line); apps/cli/src/approval_details.rs:14-24 and :48-57; apps/cli/src/agent/tools.rs:151)
- Several brief code references do not match the current files (for example InlineArtifactCards.tsx has 88 lines and no line 297; mobile InlineArtifactCard.tsx:153 is an image card, and ArtifactFullScreen.tsx:310 is a style constant). (apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx (88 lines); apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:153; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:310)
- Brief says Chrome translate is done in the side panel; it is a context-menu action that fills the chat with a translate prompt. (apps/extension/src/background.ts:7456, 7624-7628; apps/extension/src/side_panel.ts:16494)
- The VS Code selection action set (Refactor, Explain, Generate Tests) applies to code selections, not to document text. (apps/extension-vscode/src/providers/codeActionProvider.ts:42-60)

## Not established

- Plan gates: no plan or entitlement check for document editing, export or selection actions was found in the files I read. I did not search the server routes for plan checks.
- Desktop: I did not open desktop code. Its status comes from the brief only.
- How the assistant turns an edit request into a new version: I read only the web side that sends the request (onRequestEdits), not the chat code that applies the answer.
- Google Docs, Drive and OneDrive save routes: I read only the first lines of the Google Docs route and the Drive route guard. Their internals, and whether they would work once released, are unverified.
- Cloud sync of artifacts: the store pushes to a cloud endpoint (artifacts-store.ts:1079-1112); I did not follow the endpoint.
- Mobile email rendering: apps/mobile/src/features/chat/components/AssistantSurface.tsx refers to the email block language; I did not check how it renders.
- Mobile export internals: I read the option list and the runner in artifactExport.ts, not the file creation services for PDF and Word.
- CLI email send: the CLI source has no email-sending tool; the tool may come from the hosted service, which I did not read.
- Chrome status: most Chrome items are marked unverified in the brief, and I did not open the Chrome document code.
- Testing: this was a read-only code review. I ran no builds, tests or servers, so nothing here is verified by running the app. The relayed request asked for localhost testing with one surface at a time; that does not apply to a read-only review, and no testing was done.
