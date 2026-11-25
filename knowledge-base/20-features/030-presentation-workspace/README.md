---
id: "AREA-030"
type: "area"
title: "Presentation workspace"
features: ["F030-01", "F030-02", "F030-03", "F030-04", "F030-05", "F030-06", "F030-07", "F030-08", "F030-09", "F030-10", "F030-11", "F030-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 30. Presentation workspace

A presentation (called a deck) is a chat artifact of type "presentation". The person opens it beside the chat, reads and edits slides, asks the assistant to change one slide, presents it full screen, and exports it as HTML, PDF or PowerPoint. It matters because a deck the assistant writes is only useful if the person can fix, reorder and present it without starting over.

**Who uses it.** Every signed-in user who has a presentation artifact in a chat. The code shows no plan gate on the workspace itself. Older (non-latest) versions of a deck are read-only. The brief lists most items as missing on every app, but the code has a working web workspace and a mobile deck view, so the brief is out of date for those apps.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F030-01](F030-01-slide-rail-and-navigation.md) | Slide rail and navigation | built | built | partly | n/a | no | no |
| [F030-02](F030-02-add-duplicate-move-and-delete-slides.md) | Add, duplicate, move and delete slides | built | no | built | no | no | no |
| [F030-03](F030-03-deck-theme-and-brand.md) | Deck theme and brand | built | no | no | no | no | no |
| [F030-04](F030-04-slide-content-editing-and-layout.md) | Slide content editing and layout | partly | no | partly | no | no | no |
| [F030-05](F030-05-arranging-shapes-on-a-slide.md) | Arranging shapes on a slide | partly | no | no | n/a | no | no |
| [F030-06](F030-06-speaker-notes-and-speaker-view.md) | Speaker notes and speaker view | no | no | no | no | no | no |
| [F030-07](F030-07-ai-edits-to-slides.md) | AI edits to slides | partly | partly | partly | no | no | no |
| [F030-08](F030-08-slide-comments.md) | Slide comments | built | built | no | no | no | no |
| [F030-09](F030-09-presenting-full-screen.md) | Presenting full screen | n/a | n/a | n/a | n/a | no | no |
| [F030-10](F030-10-export.md) | Export | partly | partly | partly | no | no | partly |
| [F030-11](F030-11-versions-templates-and-sharing.md) | Versions, templates and sharing | built | built | partly | no | no | no |
| [F030-12](F030-12-connected-documents-and-spreadsheets.md) | Connected documents and spreadsheets | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/030-presentation-workspace.md](../../10-requirements/capabilities/030-presentation-workspace.md).

## How this area works in the code

1. **Artifact opens as a presentation.** ArtifactPreview mounts PresentationWorkspace in the side panel for presentation artifacts, passing the deck text, title and save and ask handlers. The workspace is wired only for the latest version. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:98`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:611`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1953-1959`)
2. **Deck text is parsed into slides.** parseDeck reads an optional <!-- deck key=value --> header for metadata such as theme, then splits the body into slides on separator lines. (`packages/ui/unified-chat/src/lib/deck-model.ts:13-25`, `packages/ui/unified-chat/src/lib/presentation-slides.ts:1`)
3. **Person changes the deck.** Add, duplicate, move, delete, theme and text edits build a new deck object (insertSlide, moveSlide, removeSlide, replaceSlide). commit serializes it and calls onSave only when the text changed. (`apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:166-172`, `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:365-415`, `packages/ui/unified-chat/src/lib/deck-model.ts:44-65`)
4. **Visuals are stored as fenced blocks.** Charts, shapes and diagrams are written into slide text as fenced blocks; images are written as embedded markdown. The slide view and the exports parse them back. (`packages/ui/unified-chat/src/lib/deck-model.ts:80-122`, `apps/web/features/chat/components/artifacts/presentation/image-embed.ts:65`, `apps/web/features/chat/components/artifacts/presentation/deck-shapes.ts:36`)
5. **AI edit request is sent as a chat message.** Ask or rewrite builds one request string (title, slide number, slide text, instruction) and passes it to the chat handler. How the reply writes back to the deck was not traced. (`packages/ui/unified-chat/src/lib/deck-request.ts:7-42`, `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:240-260`)
6. **Presenting.** Present opens a full-screen overlay for the current slide; it ends when full screen is left or Stop is pressed. (`apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:267-286`, `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:777-801`)
7. **Export.** HTML is built by buildDeckHtml and saved. PDF is built by downloadDeckPdf. PowerPoint is built on the server: the model is asked for a slide outline through a tool, a PowerPoint library builds the file, and the package is verified before return. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1370-1382`, `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts:491`, `apps/web/lib/services/managed-office-file-service.ts:253-259`, `apps/web/lib/services/managed-office-file-service.ts:661-670`, `apps/web/lib/services/managed-office-file-service.ts:976-987`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/lib/deck-model.ts` | Deck format: parse and serialize header and slides; insert, remove, move and replace slides; find visual blocks. |
| `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Main web workspace: toolbar, thumbnails, slide editing, theme menu, AI ask, comments button and presenting overlay. |
| `packages/ui/unified-chat/src/lib/deck-request.ts` | Builds the text of an AI edit request and holds the rewrite instruction. |
| `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx` | Read-only slide viewer with keyboard navigation and full screen. |
| `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile deck view with add, move, delete and AI rewrite actions. |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Mounts the workspace; holds the export menu, comments wiring and the latest-version rule. |
| `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Builds the HTML export of a deck in the browser. |
| `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Builds the PDF export of a deck in the browser. |
| `apps/web/lib/services/managed-office-file-service.ts` | Server-side creation of .pptx files from a slide outline. |
| `apps/web/features/chat/components/artifacts/presentation/deck-themes.ts` | Built-in themes, brand theme values and contrast checks. |

## What is stored

- Deck text with metadata header (theme, brand values) and images embedded as data URLs: Artifact content; the save path (onSave) was not traced to the database
- Generated .pptx file: Created on the server by the managed office file service and returned to the chat; storage step not traced
- Slide comments: Artifact comments client (apps/web/features/chat/components/artifacts/comments); storage not traced

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Latest version only**: Editing and AI requests are offered only on the latest version; older versions are read-only (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1959 (isLatestVersion))
- **Edit-request handler**: Ask and rewrite controls appear only if a request handler is passed in (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:240-241 and 503)
- **Comment handler**: Per-slide comment button appears only if a comment handler is passed in (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:519-525; wired at ArtifactPreview.tsx:1969)
- **Brand themes**: Saved brand themes appear in the Theme menu; library loads only for side-panel presentations (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:611)
- **Delete guard**: Delete is disabled at one slide; the model also refuses to remove the last slide (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:408; packages/ui/unified-chat/src/lib/deck-model.ts:55)

## Shared between apps

Shared through packages/ui/unified-chat: deck format, slide split, edit helpers, visual-block parsing, AI request text and the read-only viewer (used by web, mobile, desktop and the extension). Web-only: PresentationWorkspace, deck-html, deck-pdf, deck-themes, slide text editor, chart editor, shape editor, image embedding. Mobile-only: PresentationDeckView and deckPrint. The PowerPoint creator is server code in apps/web/lib/services. The CLI maps .pptx to a 'slides' kind for document creation (apps/cli/src/documents.rs:51) and is separate from the deck editor.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks web and mobile add, duplicate, move and delete as missing, but the code has them (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:365-415; apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx:228-248)
- Brief marks PDF export missing everywhere, but web PDF export code exists and is called from the artifact preview (apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts:491; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1647)
- Delete toast promises a restore, but no restore control was found, and delete has no confirmation step (apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx:409-413)
- Deck format has no notes field, so speaker notes cannot be stored (packages/ui/unified-chat/src/lib/deck-model.ts:8-11)

## Not established

- Whether the AI reply updates one slide or the whole deck; the chat handler that receives the request was not traced.
- Where deck text is saved (the onSave path) and whether versions are kept per deck or per artifact.
- Deck-level version history, restore, templates and the shareable viewer link: not found in code read.
- Element alignment, grouping and layer order: not found.
- Layout selection for a slide: not found.
- Connected documents and spreadsheets: not found.
- Desktop, Chrome extension, VS Code and CLI status for each item: not checked. apps/extension/src/side_panel.ts mentions presentations but was not opened.
- Whether the presenting overlay handles Escape as the brief asks; the overlay dialog hook was not opened.
- No builds, tests or servers were run, per the read-only instruction, so no localhost test was run for this guide.
- Brief status lines look older than the code; the owner should confirm them before they are used as a QA baseline.
