---
id: "F030-10"
type: "feature"
title: "Export"
aliases: ["Export", "Download as HTML", "Download as PDF", "Download as PowerPoint", "PPTX export", "S30.28", "S30.29", "S30.30"]
area: "30 Presentation workspace"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S30.28", "S30.29", "S30.30"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-10 Export

A person downloads a deck. On web the Download menu gives 'Download as HTML' and 'Download as PDF', both built in the browser from the deck text. PowerPoint (.pptx) is created on our servers when the assistant is asked for a file, from a slide outline. Mobile exports a deck PDF on the device. Exporting chosen slides does not exist.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.28](../../10-requirements/capabilities/030-presentation-workspace.md#s3028), [S30.29](../../10-requirements/capabilities/030-presentation-workspace.md#s3029), [S30.30](../../10-requirements/capabilities/030-presentation-workspace.md#s3030).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns a deck into a file: a self-contained HTML page, a PDF with one landscape page per slide, or a real .pptx made by the assistant's file tool. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1367-1386,1643-1653; apps/web/lib/services/managed-office-file-service.ts:661-760)

**Why it exists.** So people can take a deck out of the product to share or print. The brief wants PPTX, PDF with one page per slide, and export of selected slides (S30.28-S30.30).

**Who uses it.** Web and mobile users with a deck; users who ask the assistant for a PowerPoint file.

**Problems it solves**

- Sharing a deck with someone who has no account
- Printing a deck
- Getting an editable PowerPoint

**Use cases**

- Download as PDF to email a deck.
- Ask 'make this a PowerPoint' and download the .pptx card.
- On mobile, export the deck as a PDF and share it.

## 2. User experience

**Where to find it**

- Web: artifact download menu items 'Download as HTML', 'Download as PDF', 'Download source (.ext)', 'Download as Markdown' (ArtifactPreview.tsx:2394-2402).
- Web: output format choice labelled 'Presentation' next to 'Document' and 'Spreadsheet' (packages/contracts/cloud-contracts/src/skills.ts:22-26); where the chooser is shown was not read.
- Web: a generated .pptx shows as a file card and previews as slides through PptxFilePreview (apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.tsx).
- Mobile: export options for a deck list 'PDF' (apps/mobile/src/features/chat/utils/artifactExport.ts:70-87).
- Mobile and Chrome extension: generated files from the assistant (including .pptx) are listed as downloadable files (apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts:22-31; apps/extension/src/features/side-panel/generatedFiles.ts).
- Desktop Electron: hosted web app (doc: AGENTS.md section 5). CLI, VS Code: none found.

**Before you start**

- Deck open as a stored artifact in the web panel for HTML and PDF.
- PPTX needs a chat turn with the assistant's file tool available, which is added when the request sets office_creation (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1258-1267).

**Screens and controls**

- Download menu items listed above; progress toast 'Preparing the PDF…', success 'PDF downloaded' (ArtifactPreview.tsx:1645,1649).
- Error toasts 'The HTML could not be made' and 'The PDF could not be made' (1376,1651).
- Mobile export sheet with label 'PDF' for a deck.

**Journey**

1. Open the deck.
2. Open the download menu and pick HTML or PDF; the file downloads with the deck title as its name.
3. For PowerPoint: ask the assistant for a .pptx or choose the Presentation output; the server builds the file and attaches it; click the file card to download.

**What the person sees and gets**

- PDF: landscape, one page per slide, themed background and numbered footer, charts, KPI tiles, insights drawn (deck-pdf.ts; deck-export.test.ts:51-105).
- HTML: one section per slide, self-contained (deck-export.test.ts:38).
- PPTX: wide layout, one slide per outline entry with title, up to 12 bullets and optional speaker notes (managed-office-file-service.ts:73-77,661-751).

**Settings**

- Output format choice (docx, pptx, xlsx) is a chat setting named in cloud-contracts skills.ts; its UI was not read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web HTML export built in the browser from the deck (ArtifactPreview.tsx:1367-1379; deck-html.ts).
- Web PDF export built in the browser with jsPDF (deck-pdf.ts:491-494).
- Server PPTX creation with a strict schema of 1-40 slides, 1-12 bullets each, notes up to 5,000 characters (managed-office-file-service.ts:73-77,142-147).
- Package check after creation and optional render check in an execution environment (managed-office-file-service.ts:976-993).
- Web previews a received .pptx as slides (PptxFilePreview.tsx).
- Mobile deck PDF with a landscape page per slide (apps/mobile/src/features/chat/components/artifact-viewers/presentation/deckPrint.ts:10-53; artifactExport.ts:122-139).
- Mobile and extension accept 'pptx' as a generated file kind and offer download/share (generatedFileArtifacts.ts:22-31; mobile services/fileCreation.ts:280,306).

**Incomplete**

- PPTX is built from a slide outline the model writes, not converted from the stored deck markdown. Charts, shapes, images and theme from the in-app deck are not carried [inferred from SlideSchema containing only title, bullets and notes, managed-office-file-service.ts:73-77].
- The brief says PDF is missing on all apps, but web and mobile PDF code exists.

**Present but disconnected or switched off**

- Brief cites mobile files generatedFileArtifacts.ts:79, ArtifactFullScreen.tsx:234, fileCreation.ts:232, extension bubbles.ts:572 as PPTX code; the lines I opened there hold unrelated code (exportToText, regenerate button). The line numbers in the brief are stale.

**Not available**

- Export of selected slides: none found in any app.
- CLI and VS Code: no deck export found.
- Desktop Tauri: no deck export found; a document-creation type with format 'pptx' exists in apps/desktop/src/types/document.ts:7 but its use was not traced.

## 4. Required behaviour

**Established requirements**

- The user can download the deck as a .pptx file (S30.28). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.28)
- The user can download a deck as a PDF with one page per slide (S30.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.29)
- The user can export only chosen slides (S30.30). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.30)
- Slide deck and design export where the generated format supports it. (source: doc: docs/product/requirements.md:1488)

**Acceptance criteria**

1. 'Download as PDF' on web saves a file named from the deck title with one landscape page per slide.
2. 'Download as HTML' saves a page that opens offline with every slide.
3. Asking the assistant for a PowerPoint produces a .pptx file card that downloads and opens in a PowerPoint reader with one slide per outline entry.
4. Speaker notes given to the file tool appear in the .pptx notes.
5. A failed PDF shows 'The PDF could not be made' and no partial file.
6. Mobile deck export lists PDF and produces one page per slide.
7. More than 40 slides in the tool call is refused by the schema.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A person expects the downloaded PPTX to match the deck they see; today it is a new outline [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Convert the stored deck to PPTX in code so layout, theme and charts carry over.
- [proposed] Add a slide picker to the download menu for S30.30.
- [proposed] Add PPTX to the web Download menu for decks so it does not depend on a chat request.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview download handlers | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | handleDownloadDeckHtml (1367), handleExportDeckPdf (1643), menu items (2394-2402). |
| service | deck-html | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Builds the self-contained HTML viewer (also used for publishing). |
| service | deck-pdf | `apps/web/features/chat/components/artifacts/presentation/deck-pdf.ts` | buildDeckPdf and downloadDeckPdf (491-494). |
| service | export-pdf renderPdfSlides | `apps/web/features/chat/services/export-pdf.ts` | PDF page rendering helper imported by deck-pdf.ts:4-9 (path from import alias @features/chat/services/export-pdf). |
| service | managed-office-file-service | `apps/web/lib/services/managed-office-file-service.ts` | Server tool: schema, generatePptx (661), verification (976). |
| service | request-processor applyManagedOfficeFileCreation | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the file tool to the turn when office_creation is set (1258-1267). |
| service | tool-loop office file handling | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool call (2562) and classes it as 'artifact' (1001). |
| config | chat-output-format | `apps/web/lib/chat-output-format.ts` | Instruction telling the model to create the file with the tool for format pptx. |
| schema | CHAT_OUTPUT_FORMAT_LABEL | `packages/contracts/cloud-contracts/src/skills.ts` | Labels Document, Presentation, Spreadsheet (22-26). |
| component | PptxFilePreview | `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.tsx` | Shows a .pptx as read-only slides; 40 MB cap. |
| service | deckPrint | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/deckPrint.ts` | HTML for one landscape page per slide (mobile PDF). |
| service | artifactExport | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Export options and exportDeckToPDF (70-87,122-139). |
| service | generatedFileArtifacts | `apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts` | Turns wire generated files, including pptx, into artifacts. |
| service | fileCreation | `apps/mobile/services/fileCreation.ts` | Share type and mime tables including pptx (280,306). |
| service | extension generatedFiles | `apps/extension/src/features/side-panel/generatedFiles.ts` | Lists generated answer files with Download in the side panel. |
| test | deck-export.test.ts | `apps/web/features/chat/components/artifacts/presentation/deck-export.test.ts` | HTML and PDF export tests. |
| test | managed-office-file-service.test.ts | `apps/web/lib/services/managed-office-file-service.test.ts` | Server file tool tests (cases not read). |
| test | tool-loop.office-file.test.ts | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts` | Tool loop with the office file tool. |
| test | deckPrint.test.ts | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/deckPrint.test.ts` | Mobile PDF page HTML. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| HTML or PDF: the browser builds the file from the deck text and saves it. | device | ArtifactPreview.tsx:1367-1379,1643-1650; deck-pdf.ts:491-494 |
| PPTX: the chat request carries office_creation so the server adds the file tool; the model calls it with a slide outline. | our servers | request-processor.ts:1258-1267; chat-output-format.ts:21-28 |
| The server builds the .pptx with a document library, checks the package, and may render-check in an execution environment. | our servers | managed-office-file-service.ts:661,976-993 |
| The file is attached to the reply and the app lists it as a generated file to download or share. | device and our servers | generatedFileArtifacts.ts:22-31; extension generatedFiles.ts:1-30 |
| Mobile deck PDF: HTML is made on the device and printed to a PDF file. | device | artifactExport.ts:122-139; deckPrint.ts:10-14 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Downloaded HTML or PDF | The person's downloads folder or share target | No | Owned by the person |
| Generated .pptx | Server-side generated file store, size limited by MAX_GENERATED_FILE_BYTES (managed-office-file-service.ts:27) | Listed to apps through generated-file metadata | unknown |

**Models and providers.** The model writes the slide outline for PPTX; which model depends on the chat route. A model name is not coded. HTML and PDF use no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | HTML and PDF export need the deck open in the app; PPTX needs a chat turn on our servers (signed in). |
| Permissions | none found in the code for HTML and PDF. The file tool is gated by the request flag and by availableTools (tool-loop.ts:2563). |
| Subscription | none found in the code for HTML and PDF. PPTX file creation may count against free-quota; packages/contracts/cloud-contracts/src/free-quota.ts mentions office_creation but the rule was not read (unknown). |
| Limits and metering | Outline: 40 slides, 12 bullets per slide, title 200 and bullet 500 characters (managed-office-file-service.ts:73-75,146). Generated file byte cap MAX_GENERATED_FILE_BYTES. |
| Feature flags | request flag office_creation and office_format (request-processor.ts:1258). |
| Model compatibility | A model must support tool calls to call the file tool; forced tool choice is used when set (request-processor.ts:6654-6655). |
| Provider restrictions | none found in the code |
| Local mode | HTML and PDF export work on the device without servers. PPTX creation runs on our servers, so it is not available to a Local model chat in the code read [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| PDF in progress | Loading toast 'Preparing the PDF…' | ArtifactPreview.tsx:1645 |
| PDF or HTML failure | Error toast with user message | ArtifactPreview.tsx:1376,1651 |
| Remote image in a deck | HTML export drops it with a note 'An image from another site is not included in this page.' | deck-html.ts:30-38 |
| Empty deck on mobile | deckPrintHtml returns null; nothing to print | deckPrint.ts:10-12; deckPrint.test.ts:49 |
| Render check without execution environment | Error 'Rendering verification requires an available Office execution environment.' | managed-office-file-service.ts:967-970 |
| Slides over 40 or empty bullets | Tool call refused by the schema | managed-office-file-service.ts:73-77,146 |
| Cancel / offline | not handled in export code; signal is passed to server file build (options.signal) | managed-office-file-service.ts:960 area |
| Accessibility | Menu items are text labels; not further read | ArtifactPreview.tsx:2394-2402 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/deck-export.test.ts`: Self-contained viewer with one section per slide; landscape PDF one page per slide; themed background and footer; pie legend; KPI tiles and insights.
- `apps/web/lib/services/managed-office-file-service.test.ts`: Server office file tool (cases not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.office-file.test.ts`: Office file tool inside the tool loop.
- `apps/web/features/chat/components/artifacts/presentation/PptxFilePreview.test.tsx`: Preview of a .pptx as slides.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/deckPrint.test.ts`: One landscape page per slide, order, no script written into the page, empty deck.

**Test scenarios**

- **Web PDF**
  1. Open a 6-slide deck with a chart
  2. Download as PDF
  3. Open the file
  - Expected: 6 landscape pages, chart drawn, page footer numbers.
- **Web HTML offline**
  1. Download as HTML
  2. Open it with the network off
  - Expected: All slides visible; remote images replaced by the note.
- **PPTX from chat**
  1. Ask 'make a 5 slide deck on X as a PowerPoint'
  2. Open the file card
  3. Download and open in a PowerPoint reader
  - Expected: 5 slides with title and bullets; notes present if given.
- **Selected slides**
  1. Look for a way to export only slides 2-3
  - Expected: None exists; record as a gap.
- **Mobile PDF**
  1. Open a deck in mobile full screen
  2. Choose export, PDF
  - Expected: A PDF with a landscape page per slide in the share sheet.
- **Over limit**
  1. Ask for a 60 slide PowerPoint
  - Expected: Tool call refused or reduced to at most 40 slides.

**Where to look when it fails**

- Toast texts 'The PDF could not be made' and 'The HTML could not be made'.
- Server error class ManagedOfficeProcessingError.
- Tool name constant MANAGED_OFFICE_FILE_TOOL_NAME in tool-loop logs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Desktop: [70-qa/test-plans/desktop/030-presentation-workspace.md](../../70-qa/test-plans/desktop/030-presentation-workspace.md)
- Mobile: [70-qa/test-plans/mobile/030-presentation-workspace.md](../../70-qa/test-plans/mobile/030-presentation-workspace.md)
- Chrome: [70-qa/test-plans/chrome/030-presentation-workspace.md](../../70-qa/test-plans/chrome/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **PPTX does not come from the stored deck** Affects: Web users expecting the same look in PowerPoint. Evidence: SlideSchema has title, bullets, speaker_notes only (managed-office-file-service.ts:73-77). Work needed: Build a deck-to-PPTX converter or accept the outline model and say so in the interface.
- **No Download as PowerPoint item in the deck menu** Affects: Web. Evidence: Menu items at ArtifactPreview.tsx:2394-2402 do not include pptx for decks. Work needed: Add a menu item that calls the converter.
- **No export of selected slides** Affects: All apps (S30.30). Evidence: No code found. Work needed: Add slide selection to export.
- **Brief says PDF missing but it exists on web and mobile; brief code references for PPTX are off** Affects: Planning. Evidence: deck-pdf.ts:491; artifactExport.ts:122. Work needed: Fix the brief.
- **No deck export in CLI, VS Code, Chrome (other than generated files)** Affects: Those apps. Evidence: No code found. Work needed: Decide scope.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-agents-tools-and-automation

## Unknown

- Where the web interface shows the Document/Presentation/Spreadsheet output chooser.
- Quota or plan rules for creating a .pptx (free-quota.ts not read in full).
- How long generated files are kept.
- Whether desktop Tauri creates .pptx through the document-creation type in apps/desktop/src/types/document.ts.
- Whether the Chrome extension offers a deck export beyond generated files.
