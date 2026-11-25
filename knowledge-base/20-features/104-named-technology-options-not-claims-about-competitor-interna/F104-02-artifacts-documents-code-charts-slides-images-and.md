---
id: "F104-02"
type: "feature"
title: "Artifacts: documents, code, charts, slides, images, and two items not built"
aliases: ["Artifacts panel", "ArtifactPreview", "artifact viewer", "document editor", "code editor", "chart artifact", "presentation artifact", "deck", "spreadsheet grid", "image edit", "Select the area to change"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.01", "S104.04", "S104.05", "S104.06", "S104.07", "S104.08"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "F104-03", "F104-01", "surface:web", "surface:mobile", "surface:chrome", "surface:vscode", "surface:desktop", "mode:cloud", "file:apps/web/features/chat/components/artifacts/ArtifactPreview.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-02 Artifacts: documents, code, charts, slides, images, and two items not built

The web side panel where a person opens, edits, versions and exports what the assistant made: rich documents (Tiptap), code (CodeMirror), charts (recharts), slide decks, read-only spreadsheet grids, PDFs, and images with a paint-to-change mask. Real .pptx files come from a separate server tool. Video editing and cell editing are not built.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.01](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10401), [S104.04](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10404), [S104.05](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10405), [S104.06](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10406), [S104.07](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10407), [S104.08](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10408).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows each artifact type in its own viewer or editor, keeps versions, and lets the person export or ask the assistant for changes. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1935-1985, 3291-3340)

**Why it exists.** Long outputs are easier to read and revise beside the chat than inside it; the product requirements list preview, source view, versions, export and share for every artifact. (doc: docs/product/requirements.md section 9.5)

**Who uses it.** People who ask for documents, code, charts, decks, tables or images.

**Problems it solves**

- Copying output out of chat to edit it.
- Losing earlier versions after a change.
- Documents that cannot be edited without breaking formatting (falls back to Markdown source: ArtifactDocumentEditor.tsx:29-30,62-80).

**Use cases**

- Edit a generated report in the rich editor and download it as Word.
- Step through a slide deck and download it as PDF.
- Fix a function in the code editor.
- Paint over part of a generated image and describe the change.

## 2. User experience

**Where to find it**

- Web chat: artifacts panel opened from an inline artifact card (ArtifactsPanel.tsx; InlineArtifactCards.tsx).
- Desktop (Electron): same hosted web panel (AGENTS.md section 5).
- Mobile: separate viewers for PDF, presentation, workbook, document, text, image (apps/mobile/src/features/chat/components/artifact-viewers/).
- Chrome side panel: artifact panel (apps/extension/src/features/side-panel/artifactPanel.ts).
- VS Code: artifacts view (apps/extension-vscode/src/features/artifacts/artifactPresentation.ts).

**Before you start**

- An artifact produced in a chat. Editing needs a stored, latest-version artifact in the panel (ArtifactPreview.tsx:1041-1042 canEditSource).

**Screens and controls**

- Document editor: textbox labelled 'Document' with a formatting toolbar (ArtifactDocumentEditor.tsx:35-40).
- Source editor labelled 'Artifact source' with spellcheck off (ArtifactDocumentEditor.tsx:73; ArtifactCodeEditor.tsx:142).
- Notice 'This document uses formatting the document editor cannot keep, such as math, footnotes or raw HTML, so it opens as Markdown.' (ArtifactDocumentEditor.tsx:21-22).
- Download menu items: 'Download as Markdown', 'Download as PDF', 'Download as Word (.docx)' (ArtifactPreview.tsx:2390-2411).
- Slides: arrow, Home and End keys move between slides (PresentationArtifact.tsx:30-55).
- Image mask dialog: title 'Select the area to change', buttons 'Cancel' and 'Use this area' (ImageMaskDialog.tsx:~105-130).
- Image edit card text: 'Describing a change edits the image above. Select an area to focus the change on part of it, or pick a new shape to extend it.' (ImageGenerationCard.tsx:~729).

**Journey**

1. Ask for a document, code, chart, deck or table.
2. The artifact card appears; open it in the panel.
3. Pick Preview or edit. Edits make versions (ArtifactPreview.tsx:1050-1085 undo and redo).
4. For a document, the rich editor opens only if the Markdown survives a round trip; otherwise source mode opens (document-editor-markdown.ts:77-91).
5. Export from the download menu or ask the assistant to change it.

**What the person sees and gets**

- PDF without a source: 'Inline preview unavailable' or "This PDF couldn't be displayed." with Retry (ArtifactPreview.tsx:2022-2033).
- Large workbook: WORKBOOK_PREVIEW_TOO_LARGE status text (ArtifactPreview.tsx:1940-1943).
- Edit request not sent: toast 'The change request was not sent. Try again.' (ArtifactPreview.tsx:2198).
- Image prepare failure shows an alert in the dialog (ImageMaskDialog.tsx:~112).

**Settings**

- Wrap settings for the code editor (wraps prop, ArtifactCodeEditor.tsx).
- Image model must support editing, otherwise a new image is generated from the new description (ImageGenerationCard.tsx:420,~724).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Rich document editor on web with a Markdown round-trip check; falls back to source (ArtifactDocumentEditor.tsx:26-80; document-editor-markdown.ts:77-91).
- Code editor is CodeMirror (not named in the brief) with aria label and spellcheck off (ArtifactCodeEditor.tsx:4-23,142).
- Charts drawn with recharts (ChartCanvas.tsx:1-18), mounted by ArtifactPreview.tsx:1977-1979.
- Presentation workspace with navigable and editable slides and PDF export (PresentationWorkspace.tsx; ArtifactPreview.tsx:1953,2398-2403).
- Spreadsheet grid: read-only, sortable, keyboard-selectable, copy, 500-row cap (SpreadsheetArtifact.tsx:19-27,73-140; lib/tabular.ts:78).
- PDF artifacts shown in the browser's own viewer through an iframe, with blob-type check (ArtifactPreview.tsx:808-870,2011-2018).
- Real .pptx, .docx, .xlsx, .pdf and .csv files are written on the server by a create-file tool using pptxgenjs and sibling libraries (apps/web/lib/services/managed-office-file-service.ts:15-30,661-700,253).
- Image mask: paint a region, then describe the change (ImageMaskDialog.tsx:105-130; ChatComposerNew.tsx:6431).
- Mobile has its own viewers for pdf, presentation, workbook, tabular, document, image (artifact-viewers/ directory).

**Incomplete**

- Image editor does mask and prompt edits and reframing only; no crop or annotate tool was found (grep for crop and annotate in ImageMaskDialog.tsx found none).
- Presentation artifact exports to PDF, Markdown and source; .pptx is not offered from the deck menu (ArtifactPreview.tsx:2398-2411 lists no pptx item); .pptx comes only from the server file tool.
- Spreadsheet grid is read-only; the prop readOnly is deprecated (SpreadsheetArtifact.tsx:25-26); no formulas are evaluated in the grid. CSV source can be edited as text [inferred].

**Present but disconnected or switched off**

- PptxFilePreview exists for project file previews only (apps/web/features/projects/components/FilePreviewModal.tsx:9-11).

**Not available**

- Video trim, cut and combine editor: none found in the code (only <video> playback in ImageGenerationCard.tsx:317, MessageBubble.tsx:3438).
- Formula-aware, editable spreadsheet: none found.
- Co-editing: see F104-04.

## 4. Required behaviour

**Established requirements**

- S104.01: users edit code through a code editor engine. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.01)
- S104.04: chart artifacts are drawn by a charting engine in the mounted viewer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.04)
- S104.05: tabular data opens in an interactive grid that supports editing and formulas. The brief says 'not applicable anywhere'. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.05)
- S104.06: presentations are navigable slides in-product and generated as real .pptx files. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.06)
- S104.07: users edit images in a canvas (mask, crop, annotate) and by prompt. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.07)
- S104.08: videos play and can be edited (trim, cut, combine). Marked not applicable anywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.08)
- T03: rich documents are edited in an embedded rich-text engine. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.01, S104.04, S104.05, S104.06, S104.07, S104.08)
- Artifacts must have id, title, type, source, preview renderer, source view, version history, export, share state, error-fix loop, retention. (source: (doc: docs/product/requirements.md section 9.5))

**Acceptance criteria**

1. Opening a Markdown document that round-trips shows a textbox named 'Document' with a toolbar; typing changes the saved Markdown.
2. Opening a document with math shows the source-mode notice and the 'Artifact source' editor.
3. A chart artifact draws bar, line, pie or scatter output and has a readable label.
4. A deck can be stepped with arrow keys and exported as PDF.
5. A table artifact shows a sortable grid capped at 500 rows with a notice when cut.
6. The mask dialog's 'Use this area' stays disabled until a region is painted.
7. Each edit adds a version and undo or redo restores it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The panel's editors work in any mode because they run in the browser; saving to the cloud and the .pptx tool need Cloud [inferred from managed-office-file-service.ts being server-side].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record per-app status; correct S104.05 (read-only grid exists) and S104.07 (no crop or annotate).
- [proposed] Offer .pptx download from the deck menu using the same generator as the file tool.
- [proposed] Decide whether spreadsheet editing and formulas are in scope for the Free and paid plans.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Hosts every viewer, versions, export menu (3748 lines). |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Side panel container. |
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Tiptap editor with source fallback. |
| service | document-editor-markdown | `apps/web/features/chat/components/artifacts/document-editor-markdown.ts` | Markdown manager and roundTripsAsDocument check. |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | CodeMirror editor. |
| component | ChartArtifact / ChartCanvas | `packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx` | recharts drawing. |
| component | PresentationArtifact | `packages/ui/unified-chat/src/components/artifact-components/PresentationArtifact.tsx` | Shared slide viewer with keyboard navigation. |
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Editable deck workspace on web. |
| service | deck-pdf | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | Deck to PDF export. |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Read-only sortable grid. |
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Server tool writing pptx, docx, xlsx, pdf, csv files. |
| component | ImageMaskDialog | `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx` | Paint a region to redraw. |
| component | RegionSelector | `apps/web/features/chat/components/RegionSelector.tsx` | Canvas used for painting the mask (imported at ImageMaskDialog.tsx:15). |
| component | ImageGenerationCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Image result with edit panel and reframing. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Opens the mask dialog (line 6431). |
| component | InlineArtifactCards | `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx` | Cards in chat that open the panel. |
| component | ArtifactVersionHistory | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | Version list and restore. |
| component | mobile artifact viewers | `apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx` | Mobile viewer router. |
| component | mobile PdfFileView | `apps/mobile/src/features/chat/components/artifact-viewers/PdfFileView.tsx` | On-device PDF viewer in a no-network WebView. |
| component | mobile ChartArtifactView | `apps/mobile/src/features/chat/components/ChartArtifactView.tsx` | Mobile chart view. |
| component | extension artifactPanel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome artifact panel. |
| service | vscode artifactPresentation | `apps/extension-vscode/src/features/artifacts/artifactPresentation.ts` | VS Code artifact view mapping. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Model output with an artifact marker is turned into an artifact in client state and stored with versions. | device and our servers | ArtifactPreview.tsx:1050-1085 (restoreArtifactVersion); ArtifactPreview.cloudSave.test.tsx exists |
| The editor or viewer is loaded lazily and shows the content. | device | ArtifactPreview.tsx:377-385 |
| Typing in the document editor emits Markdown to the draft. | device | ArtifactDocumentEditor.tsx:45 |
| Export to PDF or Word runs in the browser. | device | ArtifactPreview.tsx:1647-1660 (downloadDeckPdf, handleExportDocument) |
| A chat request for a file runs the create-file tool on the server, which builds the file and checks the package. | our servers | managed-office-file-service.ts:253,661,976-990 |
| Image edit sends the mask and source to an image model route. | outside service | ChatComposerNew.tsx:6431; ImageGenerationCard.tsx:420 (admissionFor model supports_edit) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact content and versions | Client state; saved to the account in Cloud (cloud-save test exists) | Yes for stored artifacts; exact table unknown | unknown |
| Generated office file | Object storage (see F104-03) | Via download link | MAX_GENERATED_FILE_BYTES cap (managed-office-file-service.ts:26) |

**Models and providers.** Documents, code and decks are written by whichever chat model the turn used. Charts and decks are interpreted from text. Image edits need a model that supports editing; otherwise a fresh image is generated (ImageGenerationCard.tsx:420,~724).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing in the panel needs no extra account beyond chat. Cloud save, publish and the file tool need sign-in [inferred from server routes]. |
| Permissions | Edit allowed only for the latest stored version in the panel (ArtifactPreview.tsx:1041-1042). |
| Subscription | none found in the code for the viewers themselves. Image generation and edit follow image entitlement rules (see SYS-subscriptions-entitlements-and-usage); not read here. |
| Limits and metering | 500 spreadsheet rows shown; generated file size cap MAX_GENERATED_FILE_BYTES; workbook preview size cap. Plan limits for artifacts: unknown. |
| Feature flags | none found in the code for the viewers. |
| Model compatibility | Image edit depends on a model flagged supports_edit (ImageGenerationCard.tsx:420). |
| Provider restrictions | none found in the code. |
| Local mode | The editors are client code and do not need the network. Local-only operation of the file tool and image edit: not available; both are server or provider calls [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Document not safely editable | Opens in Markdown source mode with a notice. | ArtifactDocumentEditor.tsx:21-22,62-80 |
| PDF blob not a PDF | Shows fallback 'couldn't be displayed' with Retry and download. | ArtifactPreview.tsx:850-858,2022-2040 |
| PDF loading | 'Loading PDF…' | ArtifactPreview.tsx:2005-2008 |
| Oversized workbook | Status message and no grid. | ArtifactPreview.tsx:1940-1943 |
| Edit request send failure | Error toast. | ArtifactPreview.tsx:2198 |
| Mask dialog cancel or file change | Session counter ignores late results; object URL revoked. | ImageMaskDialog.tsx:~63-82 |
| Mask prepare error | Alert text in dialog. | ImageMaskDialog.tsx:~111-115 |
| Empty deck | 'No slides found'. | PresentationWorkspace.tsx:432 |
| Empty or failed code editor and chart | not handled in the code beyond ChartArtifact.boundary tests; not verified. | ChartArtifact.boundary.test.tsx exists |
| Interrupted generation | A test covers an interrupted artifact view. | ArtifactPreview.interrupted.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.toolbar.test.tsx`: Document editor toolbar.
- `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.externalSync.test.tsx`: Code editor sync.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.presentation.test.tsx`: Presentation in the panel.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx`: Workbook preview.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Editing.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Version restore.
- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Deck workspace.
- `apps/web/features/chat/components/Composer/__tests__/ImageMaskDialog.test.tsx`: Mask dialog.
- `apps/web/lib/services/managed-office-file-service.test.ts`: Office file generation.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx`: Chart drawing.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.keyboard.test.tsx`: Grid keyboard.
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Mobile export fidelity.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PdfFileView.test.tsx`: Mobile PDF viewer.

**Test scenarios**

- **Round-trip editing**
  1. Ask for a short report with headings and a list.
  2. Open it and type in the 'Document' editor.
  3. Download as Markdown.
  - Expected: Edited text and structure are kept.
- **Math document fallback**
  1. Ask for a document containing a $$ formula.
  2. Open it.
  - Expected: Source mode with the notice.
- **Deck**
  1. Ask for a 5-slide deck.
  2. Step with arrow keys.
  3. Download as PDF.
  - Expected: 5 slides, a PDF file.
- **Real .pptx**
  1. Ask 'make me a PowerPoint file'.
  2. Open the attached file.
  - Expected: A valid .pptx; compare with deck menu which has no .pptx item.
- **Image mask**
  1. Generate an image.
  2. Open 'Select the area to change', paint, press 'Use this area', describe a change.
  - Expected: Edited image; no crop or annotate controls exist.
- **Table**
  1. Ask for a table of 600 rows.
  - Expected: Grid shows 500 rows; sort works.

**Where to look when it fails**

- Server logs from managed-office-file-service (ManagedOfficeProcessingError).
- Client failure reports.
- Browser console for editor errors.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **S104.05 recorded as not applicable but a read-only grid ships; editing and formulas are missing.** Affects: Web, desktop (hosted web), mobile has its own TabularGridView. Evidence: SpreadsheetArtifact.tsx:25-26,73-140; mobile TabularGridView.tsx. Work needed: Correct the brief; decide on editing and formulas.
- **S104.07 says mask, crop and annotate; only mask and reframe exist.** Affects: Web. Evidence: ImageMaskDialog.tsx; ImageGenerationCard.tsx:~729. Work needed: Add crop and annotate or reword the requirement.
- **No .pptx item in the deck download menu.** Affects: Web. Evidence: ArtifactPreview.tsx:2398-2411. Work needed: Wire the pptx generator to the menu.
- **No video playback and edit engine for artifacts.** Affects: All. Evidence: no trim code found. Work needed: Decide scope.
- **Failure and empty states per editor not verified.** Affects: Web. Evidence: brief 'Not verified'. Work needed: Add tests.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- F104-03
- F104-01
- surface:web
- surface:mobile
- surface:chrome
- surface:vscode
- surface:desktop
- mode:cloud
- file:apps/web/features/chat/components/artifacts/ArtifactPreview.tsx

## Unknown

- Which plans or limits apply to artifacts and image edit.
- Where artifact versions are stored in the database.
- What mobile, Chrome and VS Code support beyond the files listed.
- Empty and failure states of the code editor and chart viewer.
