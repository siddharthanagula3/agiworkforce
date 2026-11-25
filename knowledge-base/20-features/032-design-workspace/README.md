---
id: "AREA-032"
type: "area"
title: "Design workspace"
features: ["F032-01", "F032-02", "F032-03", "F032-04", "F032-05", "F032-06", "F032-07", "F032-08", "F032-09", "F032-10", "F032-11", "F032-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 32. Design workspace

A person can turn a short brief (what the design is for, its format and style) into a visual design, then select parts of it and ask the model to change them, replace images, compare versions, and export the result. The code that exists today is mostly the general artifact panel and preview (web and mobile), with a brief dialog, a selection-based change request, image replacement and a version-changes view. Most of the brief's design-tool items (canvas, layers, alignment, tokens, Figma, breakpoints, prototypes) have no code found. This matters because the brief is the contract for a design tool that is not yet built.

**Who uses it.** Every signed-in user who opens the artifacts panel in the web app, and the same panel in the mobile app. The brief dialog is reached from the new-artifact menu, so no plan gate was seen in the files opened. Developers maintain the code. No workspace-admin or paid-plan gate was seen in the files opened for this area. Not verified for the desktop, CLI, VS Code or Chrome apps (see not_sure).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F032-01](F032-01-start-a-design-from-a-brief.md) | Start a design from a brief | built | built | no | n/a | n/a | no |
| [F032-02](F032-02-generate-alternatives.md) | Generate alternatives | no | no | no | n/a | n/a | no |
| [F032-03](F032-03-canvas-and-page-or-frame-list.md) | Canvas and page or frame list | no | no | no | n/a | n/a | no |
| [F032-04](F032-04-select-and-change-an-element.md) | Select and change an element | partly | partly | no | n/a | n/a | no |
| [F032-05](F032-05-position-layout-and-style-controls.md) | Position, layout and style controls | no | no | no | n/a | n/a | no |
| [F032-06](F032-06-alternatives-and-live-sliders.md) | Alternatives and live sliders | no | no | no | n/a | n/a | no |
| [F032-07](F032-07-comments-on-the-design.md) | Comments on the design | partly | partly | no | n/a | n/a | no |
| [F032-08](F032-08-design-system-and-brand-library.md) | Design system and brand library | partly | partly | no | n/a | n/a | no |
| [F032-09](F032-09-prototype-and-interactive-states.md) | Prototype and interactive states | n/a | n/a | n/a | n/a | n/a | no |
| [F032-10](F032-10-handoff-and-sync-with-code-and-figma.md) | Handoff and sync with code and Figma | partly | no | no | partly | n/a | no |
| [F032-11](F032-11-export-the-design.md) | Export the design | built | built | partly | built | built | partly |
| [F032-12](F032-12-version-comparison-and-restore.md) | Version comparison and restore | built | built | built | n/a | n/a | no |

Requirement items for this area: [10-requirements/capabilities/032-design-workspace.md](../../10-requirements/capabilities/032-design-workspace.md).

## How this area works in the code

1. **Start a design from the brief.** The new-artifact menu opens the brief dialog. The dialog holds the brief fields and builds the request text the model receives. (`apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx`, `apps/web/features/chat/components/artifacts/design/DesignBriefDialog.tsx:24`, `apps/web/features/chat/components/artifacts/design/design-brief.ts:29`, `apps/web/features/chat/components/artifacts/design/design-brief.ts:84`)
2. **Show the design in the artifacts preview.** The artifacts panel and preview show the generated design. The preview is one artifact at a time; no canvas was found. (`apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:530`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:693`)
3. **Select an element and send a change request.** The preview keeps the picker selection. Submitting an instruction builds an edit request from the selection and sends it to the chat. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:693`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2120`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2124`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2131`)
4. **Replace an image.** The selected image's source is replaced with the chosen file, read as a data URL, and written into the stored HTML. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2134`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2139`, `apps/web/features/chat/components/artifacts/design/design-edits.ts:27`, `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3125`)
5. **Save to the user's Library.** The artifact file is posted to the Library API with its name and text. (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1447`)
6. **Compare versions.** The changes view computes the differences between two versions by line or by word and writes a plain summary for screen readers. (`apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:56`, `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:88`)
7. **Mobile shares the change logic.** The mobile changes view imports the same artifactChanges function from the shared artifacts package. (`apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:4`, `apps/mobile/src/features/chat/utils/artifactExport.ts:100`)
8. **Export a file or archive.** Web builds a single download or a zip archive in the browser. Mobile lists export formats for each artifact language. (`apps/web/features/chat/utils/downloadArtifacts.ts:103`, `apps/mobile/src/features/chat/utils/artifactExport.ts:100`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/artifacts/design/DesignBriefDialog.tsx` | Brief form dialog for starting a design (S32.01). |
| `apps/web/features/chat/components/artifacts/design/design-brief.ts` | Brief type, empty brief, readiness check, and the request text sent to the model. |
| `apps/web/features/chat/components/artifacts/design/design-edits.ts` | Replaces an image in stored design HTML by selector (S32.14). |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Main artifact preview: selection, change requests, image replacement, Library save and more. |
| `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Web version-changes view with plain-language summary (S32.34). |
| `apps/web/features/chat/utils/downloadArtifacts.ts` | Web single-file download and zip archive builder (S32.33). |
| `apps/mobile/src/features/chat/utils/artifactExport.ts` | Mobile export formats (PDF, Word, text, source) per artifact language (S32.31). |
| `apps/mobile/src/features/chat/components/ArtifactChangesView.tsx` | Mobile version-changes view using the shared artifactChanges function (S32.34). |
| `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Artifacts side panel that hosts the preview and the publication view. |

## What is stored

- Design brief fields (format, style, description): Not verified: readDesignBrief parses a source string (design-brief.ts:50), so the brief seems to live inside the artifact source text. Storage location not confirmed.
- Artifact source (the HTML, with edits such as replaced images): Not verified: the preview reads stored content (ArtifactPreview.tsx:2139). Storage backend not opened.
- Library copy of an artifact: Sent by POST to /api/library (ArtifactPreview.tsx:1447). The server side that stores it was not opened.
- Unsent draft text of the source: Held in React state in ArtifactPreview.tsx:648-660. Tests spy on browser storage for draft retention; the storage code was not opened.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Artifact editing and publication views**: Not verified: no feature flag or plan gate was seen in the design, export or changes files opened. (Not found in the files opened.)

## Shared between apps

Shared: packages/ui/design-tokens/src/foundation.css (design token values); the @agiworkforce/artifacts package (artifactChanges, used by both the mobile changes view and the web changes view, per the mobile import). Web-only: apps/web/features/chat/components/artifacts/design/ (brief, dialog, image replacement), the web preview and downloads. Mobile-only: apps/mobile/src/features/chat/utils/artifactExport.ts and components/ArtifactChangesView.tsx. CLI: no design-workspace code found; the matches for design_system in apps/cli are unrelated (access mode and effort settings).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says S32.01 (design brief) is missing on web, but DesignBriefDialog and design-brief.ts exist and are wired into the new-artifact menu. (apps/web/features/chat/components/artifacts/design/DesignBriefDialog.tsx:24; apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx)
- Brief says S32.18 (selection-based change requests) is missing on web, but the code sends a selection with an instruction as an edit request. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2120-2131)
- Brief says S32.14 (image replacement) is missing on web, but replaceImage calls replaceImageInHtml. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2134-2139; apps/web/features/chat/components/artifacts/design/design-edits.ts:27)
- Brief says S32.31 (HTML export) is done on CLI, but the cited lines are the account data-export command and a code-block parser, not an HTML export. (apps/cli/src/lib.rs:1034 (ExportData command); apps/cli/src/cloud/artifacts.rs:212 (code-block parser))
- S32.31 cites ArtifactPreview.tsx:745 and 1452 as export code. Line 745 is DOCX preview conversion; 1452 is the Save-to-Library request. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1447)
- S32.34 cites packages/ui/design-tokens/src/foundation.css:173 as version-comparison code. That line is a symbol shine path token, unrelated to versions. Restore code was not located. (packages/ui/design-tokens/src/foundation.css:173)
- S32.34 cites ArtifactPreview.tsx:648 and 2124 for version and restore. Line 648 is draft-session state and 2124 is the edit-request send, not a restore. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:648; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2124)

## Not established

- Whether the brief's 'done' for desktop, CLI, VS Code and Chrome matches any code: those apps' artifact code was not opened.
- Where the design brief and version history are stored (database table or file) and how restore works.
- How the preview is sandboxed and whether direct text editing or element selection works in the rendered page: the picker code was only partly read.
- Whether any plan gate, feature flag or setting turns the artifacts panel or exports on or off: no switch was confirmed in the files opened.
- Whether any hidden code exists for canvas, breakpoints, colour-scheme previews, tokens, Figma or prototypes: a search of apps/web/features/chat/components/artifacts, apps/mobile/src/features/chat and apps/cli/src found nothing, but the packages/ folder was not searched.
- Failure states (network errors, empty states, waiting states) for brief submission, export and changes view were not confirmed.
- The comments folder under artifacts (for S32.17) and the Figma, prototype and design-system items were not opened.
- Tests were not run: per the instructions, this read-only task ran no builds or tests and no localhost checks.
