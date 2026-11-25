---
id: "F031-05"
type: "feature"
title: "Preview a file before it is exported"
aliases: ["Export fidelity preview", "Office file preview", "Slide preview", "Workbook preview", "S31.24", "pptxToSlidesMarkdown", "loadWorkbookSheets"]
area: "31 PDF and document-transformation products"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.24"]
depends_on: ["surface:web", "surface:desktop", "file:apps/web/features/chat/lib/office-file-preview.ts", "F031-04", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-05 Preview a file before it is exported

Shows a preview of a generated PowerPoint or Excel file in Web chat and artifact views. Slides become text, workbooks become sheet tables, both with size limits. It reads the already-built file, so it is not a preview before export and it does not show page layout. Mobile has none.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.24](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3124).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads a generated .pptx into slide text with pictures, and a generated .xlsx into sheets, so the person can look at the result in the chat (apps/web/features/chat/lib/office-file-preview.ts:173, 233).

**Why it exists.** Brief S31.24: before export the person sees a preview that matches the exported file (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md).

**Who uses it.** Web (and Electron Desktop, which shows the hosted web app) users who ask the assistant for slides or spreadsheets.

**Problems it solves**

- Checking a generated file without opening an office program

**Use cases**

- Ask for a deck and read its slides in the message
- Open a generated workbook in the artifact panel and switch sheets
- Open a project file and see slides in the file preview

## 2. User experience

**Where to find it**

- Web chat message: generated file card with inline preview (apps/web/features/chat/components/messages/MessageBubble.tsx:1590-1610)
- Web artifact panel: workbook sheets (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1836-1860)
- Web project file preview modal: slide preview (apps/web/features/projects/components/FilePreviewModal.tsx:420)
- Desktop Electron: hosted web app (doc: AGENTS.md section 5)
- Mobile, CLI, VS Code, Chrome: missing (brief)

**Before you start**

- A generated .pptx or .xlsx file in the reply
- File under the inline preview size limit (MAX_INLINE_GENERATED_TEXT_BYTES, referenced at MessageBubble.tsx:1585-1590; value not read)

**Screens and controls**

- Inline text preview in the message; sheet content in the artifact panel
- Message when too large: 'Presentation preview is too large to display. Download the original PPTX file to view all slides.' (office-file-preview.ts:34-35) and 'Workbook preview is too large to display. Download the original XLSX file to view all sheets.' (office-file-preview.ts:228-229)

**Journey**

1. Ask for a deck or workbook
2. The file is generated
3. Preview fetches the file and shows slide text or the first sheet in the message
4. Open the artifact for all sheets
5. Download the real file if the preview says it is too large

**What the person sees and gets**

- Slide text and pictures per slide
- Sheet CSV; formula cells with no stored value are flagged not calculated (apps/web/features/chat/lib/office-file-preview.test.ts:41)
- Limit messages above

**Settings**

- Text budget MAX_FILE_TEXT_CHARS (office-file-preview.ts:1, 43-47)
- Slide image cap MAX_SLIDE_IMAGE_BYTES 450,000 (office-file-preview.ts:15)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Slides parsed from the pptx archive; text budget enforced; a deck over budget raises the too-large message (office-file-preview.ts:34-47, 173)
- Workbook sheets read with a limit and decompression-ratio checks (office-file-preview.ts:228-233; tests at office-file-preview.test.ts:132, 140)
- Message bubble previews pptx as slide text and xlsx as the first sheet CSV (MessageBubble.tsx:1596-1602)
- Artifact panel lists all workbook sheets and shows the too-large state (ArtifactPreview.tsx:1836-1860)
- Project file preview uses PptxFilePreview (PptxFilePreview.tsx:56; FilePreviewModal.tsx:420)

**Incomplete**

- It previews text and tables from the file, not how pages look; fidelity to the export is not asserted by any test found
- The Word and PDF output previews were not located in the files read: unknown

**Present but disconnected or switched off**

- nothing found

**Not available**

- Preview before the file exists: the preview reads the finished file
- Mobile preview: brief says missing (an attachment viewer exists on Mobile, apps/mobile/__tests__/AttachmentPreviewViewer.test.tsx; its scope for office files not read)
- CLI, VS Code, Chrome

## 4. Required behaviour

**Established requirements**

- Before a file is exported, the user sees a preview that matches the exported file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.24)

**Acceptance criteria**

1. A generated deck shows one block of text per slide in the message
2. A deck over the text budget shows the too-large message and offers the download
3. A workbook with several sheets shows all sheets in the artifact panel
4. A formula cell with no stored value is marked not calculated, not shown as zero
5. A preview is available before the person downloads or exports
6. The preview agrees with the file opened in an office program (not tested)

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- 'Matches' needs a comparison test between the preview and the exported bytes; none was found

**Proposed improvements** (suggestions, not requirements)

- [proposed] Render real page images in the sandbox (the render check already makes 60 dpi page pictures) and show them
- [proposed] Add a preview for Mobile

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | pptxToSlidesMarkdown | `apps/web/features/chat/lib/office-file-preview.ts` | Slide text and pictures from a pptx (173) |
| service | loadWorkbookSheets | `apps/web/features/chat/lib/office-file-preview.ts` | Sheets from an xlsx (233) |
| service | office-archive | `apps/web/features/chat/lib/office-archive.ts` | Opens the archive (imported by the preview code) |
| component | MessageBubble preview effect | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Fetches the file and sets the inline preview (1590-1610) |
| component | ArtifactPreview workbook view | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Sheet list and too-large state (1836-1860) |
| component | PptxFilePreview | `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.tsx` | Slide preview component (27, 56) |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Project file preview using it (420) |
| service | readWorkbookSheets | `packages/ui/unified-chat` | Shared workbook reader and preview limit error imported as @agiworkforce/unified-chat/tabular |
| service | renderManagedOfficeFile | `apps/web/lib/services/managed-office-preservation.ts` | Server render receipt, a related but separate check (970) |
| test | office-file-preview test | `apps/web/features/chat/lib/office-file-preview.test.ts` | Preview unit tests |
| test | PptxFilePreview test | `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.test.tsx` | Component tests |
| test | ArtifactPreview workbook test | `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx` | Workbook view tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page fetches the generated file with the person's session | device and our servers | MessageBubble.tsx:1596-1600 |
| The browser parses the archive and builds slide text or sheets | device | office-file-preview.ts:173-233 |
| The result is stored in component state and drawn | device | MessageBubble.tsx:1606-1610 |
| A limit error shows the too-large message | device | office-file-preview.ts:34-42; ArtifactPreview.tsx:1856-1860 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Preview text and sheets | React state in the browser only | No | Dropped when the view closes |

**Models and providers.** No model is used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The session cookie is sent when fetching (credentials same-origin, MessageBubble.tsx:1597) |
| Permissions | none found in the code |
| Subscription | none found in the code for the preview |
| Limits and metering | Text budget and slide image cap (office-file-preview.ts:15, 43-47); no metering |
| Feature flags | none found in the code |
| Model compatibility | Not applicable |
| Provider restrictions | Not applicable |
| Local mode | The preview runs in the browser on the device after the file is fetched. Web has no Local mode; Mobile has no preview. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Too large | Dedicated message and download advice | office-file-preview.ts:34-35, 228-229 |
| Fetch fails | The HTTP status becomes an error that is stored as the preview state | MessageBubble.tsx:1596-1610 |
| Zip bomb | Rejected by decompression ratio | office-file-preview.test.ts:132-140 |
| Formula without cached value | Marked not calculated | office-file-preview.test.ts:41 |
| Loading | not handled in the code read for the message bubble beyond leaving the preview empty until it resolves [inferred] | MessageBubble.tsx:1590-1610 (previews are set when the fetch resolves) |
| Offline, retry, cancel | A cancelled flag prevents stale updates after the view changes; retry is not handled in the code read | MessageBubble.tsx:1606-1610 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/office-file-preview.test.ts`: Slide titles, fallback, pictures, tables, decompression-ratio rejection, formula caching
- `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.test.tsx`: Slide preview component
- `apps/web/features/chat/components/artifacts/ArtifactPreview.workbook.test.tsx`: Workbook view
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Message bubble including previews (cases not individually read)

**Test scenarios**

- **Deck preview**
  1. Ask for a 5-slide deck
  2. Read the message preview
  - Expected: Five slide blocks
- **Large deck**
  1. Open a very large deck
  - Expected: Too-large message with download advice
- **Workbook sheets**
  1. Ask for a 3-sheet workbook
  2. Open in the artifact panel
  - Expected: Three sheets listed
- **Fidelity**
  1. Download the file
  2. Open in an office program
  3. Compare with the preview
  - Expected: Text and numbers agree; layout may differ
- **Mobile**
  1. Ask for a deck on Mobile
  - Expected: No preview (expected missing)

**Where to look when it fails**

- Error classes PresentationPreviewLimitError and WorkbookPreviewLimitError
- Browser console fetch error 'HTTP <status>'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/web/031-pdf-and-document-transformation-products.md)
- Desktop: [70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md)

## 10. Gaps and dependencies

- **No preview before export and no layout preview** Affects: Web and Desktop users. Evidence: The preview reads the finished file's text (office-file-preview.ts:173). Work needed: Render pages (the sandbox can) and show them
- **No test compares preview and exported file** Affects: The S31.24 claim. Evidence: Tests found check parsing only. Work needed: Add a comparison test
- **Mobile has no preview** Affects: Mobile. Evidence: Brief S31.24 mobile missing. Work needed: Design a mobile preview
- **Message bubble shows only the first sheet** Affects: Web users with multi-sheet workbooks in chat. Evidence: MessageBubble.tsx:1602 uses sheets[0]. Work needed: Point to the artifact panel or show tabs
- **Brief code cites differ in line numbers from the code** Affects: Documentation. Evidence: Brief lists MessageBubble.tsx:1368 and ArtifactPreview.tsx:417, while the preview code is at 1590-1610 and 1836-1860. Work needed: Update the brief
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- file:apps/web/features/chat/lib/office-file-preview.ts
- F031-04
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design

## Unknown

- Whether Word and PDF generated files have a preview
- The exact inline preview size limit value
- Whether Electron Desktop was driven with a preview
- How closely previews match files in office programs
