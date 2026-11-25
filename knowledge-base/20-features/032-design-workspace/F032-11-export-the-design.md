---
id: "F032-11"
type: "feature"
title: "Export the design"
aliases: ["Export the design", "Download as HTML", "Download all", "Export to HTML, PDF, image or archive (S32.31 to S32.33)", "Download artifact", "artifacts show --out"]
area: "32 Design workspace"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S32.31", "S32.32", "S32.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F032-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-11 Export the design

Saves an artifact out of the app. For an HTML design: Web gives Download as HTML (a sanitised preview page), source and Markdown, plus a zip of all artifacts in a chat; Mobile shares a source file; CLI, VS Code and Chrome write the source. PDF exists only for decks and documents. No screenshot image of a design.

Area: [32. Design workspace](README.md). Requirement items: [S32.31](../../10-requirements/capabilities/032-design-workspace.md#s3231), [S32.32](../../10-requirements/capabilities/032-design-workspace.md#s3232), [S32.33](../../10-requirements/capabilities/032-design-workspace.md#s3233).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gets an artifact into a file outside the app: single file download, zip of all artifacts of a conversation (Web), Word or PDF for documents, PDF or HTML for decks, share sheet on Mobile, file write on CLI and VS Code. (ArtifactPreview.tsx:2362-2425; downloadArtifacts.ts:104-164)

**Why it exists.** The product requires download or export in the artifact UI and slide deck and design export where the format supports it. (docs/product/requirements.md:1464-1470,1488)

**Who uses it.** Anyone who wants to keep or reuse a generated design, deck or document outside the chat.

**Problems it solves**

- Keeping work that lives only in a chat.
- Moving a design to a browser, project or colleague.
- Saving several artifacts at once.

**Use cases**

- Download a generated landing page as an .html file.
- Press Download all to get artifacts.zip for the whole chat.
- Export a document as Word.
- Run agi artifacts show <id> --out page.html in a terminal.

## 2. User experience

**Where to find it**

- Web: download button in the artifact panel header (aria-label Download artifact, ArtifactPreview.tsx:2789,2803) with items Download as HTML, Download source (.<language>), Download as Markdown; Download as PDF for decks; Download as Word (.docx) and Download as PDF for documents (2388-2411).
- Web: Download all button, title 'Download all artifacts as zip', shown when a conversation has more than one artifact (ArtifactsPanel.tsx:730-749).
- Mobile: Download button in the full-screen viewer (accessibility label Download artifact, ArtifactFullScreen.tsx:1337); export sheet for documents (ArtifactExportSheet.tsx).
- CLI: agi artifacts show <id> --out <path> [--open] (lib.rs:1374-1392).
- VS Code: command Save artifact to workspace (artifactActions.ts:18,163).
- Chrome: Download button in the side panel artifact view (artifactPanel.ts:501).
- Desktop: the public Electron window shows the web app [inferred]; the retained Tauri desktop uses the shared panel whose Download writes a text file (ArtifactPanel.tsx:253-313; ArtifactRenderer.tsx:367-380).

**Before you start**

- An artifact in the panel or index. CLI and VS Code need a signed-in cloud account (lib.rs:3856-3859; artifactActions.ts:57-70).

**Screens and controls**

- Web download menu items listed above; Download image for image artifacts; Download as CSV and SVG for tables and diagrams (ArtifactPreview.tsx:2383-2385).
- Mobile ArtifactExportSheet lists format, detail line and file type; HTML and other code show one source option (artifactExport.ts:100-119).
- CLI flags --out, --open, --copy, --json.

**Journey**

1. Open the artifact.
2. Press Download and choose a format (Web), or press Download (Mobile) and pick from the sheet when there are several options.
3. The browser saves the file, or the share sheet opens on Mobile.
4. For several artifacts press Download all to get artifacts.zip.

**What the person sees and gets**

- Toast 'Preparing artifact download…', then 'Artifact download ready' or 'Could not download artifacts' (ArtifactsPanel.tsx:737-741).
- Toast 'The HTML could not be made' for deck HTML failure (ArtifactPreview.tsx:1376).
- Mobile alert 'Download failed' with the format name (ArtifactExportSheet.tsx:58).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Download as HTML writes getPreviewHTML, the sanitised and policy-wrapped page, not the raw source (ArtifactPreview.tsx:1195-1198,1393-1395).
- Web Download source writes the raw body with the model's language as extension and formula-safe handling for csv (1405-1411).
- Zip: library loaded on demand, unique names with (2), (3) suffixes, formula-safe text entries, generated files fetched with a 60 second timeout (downloadArtifacts.ts:16,42-60,104-131).
- Mobile: sources exported byte for byte; documents offer Markdown, PDF, Word, Plain text; decks PDF one slide per page (artifactExport.ts:54-120).
- CLI: show writes the block to a path; extension comes from the type or language; a directory gets <id>.<ext> (cloud/artifacts.rs:236-296).
- VS Code: save dialog then write file (artifactActions.ts:163-208).
- Chrome: file name from title and type, formula-safe export (artifactPanel.ts:366-386).

**Incomplete**

- Mobile has no archive and no image export; HTML export is the single source option that goes straight to the share sheet (ArtifactFullScreen.tsx:697-724).
- The zip writes raw artifact.content for text artifacts (downloadArtifacts.ts:117), so an HTML design in a zip differs from Download as HTML on Web [inferred].
- Tauri shared panel Download writes only the content as a file named by type (artifact-download.ts:26-47).

**Present but disconnected or switched off**

- Download all appears only when the conversation has more than one artifact (ArtifactsPanel.tsx:730).

**Not available**

- PDF of an HTML design on every app (PDF exists for decks and text documents only, ArtifactPreview.tsx:2397-2411).
- Image or screenshot of a rendered design on every app; image download exists only for image artifacts (ArtifactPreview.tsx:2371).
- Zip on Mobile, CLI, VS Code, Chrome.
- The brief cites apps/cli/src/lib.rs lines 1034 and 1942; those lines are ExportData and SessionAction, not artifact export. The real CLI path is ArtifactsSubcommand::Show.

## 4. Required behaviour

**Established requirements**

- The user can export the design as a standalone HTML file (S32.31). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.31)
- The user can export the design as a PDF (S32.32, marked not applicable anywhere). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.32)
- The user can export as an image file or downloadable archive (S32.33). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.33)
- Artifact UI includes download or export and version history; slide deck and design export where the format supports it. (source: docs/product/requirements.md:1464-1470,1488)
- Generate, preview, revise, compare, restore, download and reopen an artifact; failed edits keep the previous version. (source: docs/product/experience-contract.md:782 (W09))
- Model-chosen titles and languages are untrusted when naming files and in spreadsheet cells. (source: downloadArtifacts.ts:115-117 (code comment))

**Acceptance criteria**

1. Download as HTML on an HTML design saves a file that opens in a browser and shows the design.
2. Two artifacts titled the same become two zip entries with unique names.
3. A csv artifact starting with a formula character is neutralised in file and zip.
4. A failed generated-file fetch shows an error, not an empty file.
5. Mobile document exports offer Markdown, PDF, Word and Plain text.
6. Exporting a design as an image is available [proposed; not met].
7. CLI show --out writes the file with the right extension.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The PDF not applicable status in the brief is wrong for decks and documents, which have PDF on Web and Mobile; for designs it is a product decision. [inferred]

**Proposed improvements** (suggestions, not requirements)

- Add an image export of the rendered design.
- Make the zip use the same HTML as Download as HTML.
- Add archive export on Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview download items | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Menu items and handlers: handleDownload (1381), deck HTML (1367), deck PDF (1643), document export (1655), image (1682), binary doc (1765). |
| component | ArtifactsPanel Download all | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Zip button with toast.promise (730-749). |
| service | downloadArtifacts | `apps/web/features/chat/utils/downloadArtifacts.ts` | File names, unique names, zip, generated-file download with timeout. |
| component | InlineArtifactCards | `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx` | Also calls downloadAllArtifacts (import line 9). |
| component | deck-html and deck-pdf | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Deck to HTML; deck-pdf.ts makes the PDF. |
| service | artifactExport (Mobile) | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Export options by type and language; exportArtifact. |
| component | ArtifactExportSheet | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | Mobile list of formats and error alert. |
| component | ArtifactFullScreen handleDownload | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Download flow and share (686-725). |
| command | agi artifacts show | `apps/cli/src/lib.rs` | Command definition (1374) and handler (3910-3968). |
| service | cloud artifacts client | `apps/cli/src/cloud/artifacts.rs` | content (400), file_extension (236), output_path (283). |
| command | saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Save to workspace (163-208). |
| component | Chrome artifactPanel download | `apps/extension/src/features/side-panel/artifactPanel.ts` | artifactFileName (366) and artifactDownload (381). |
| service | artifact-download (shared) | `packages/ui/unified-chat/src/lib/artifact-download.ts` | Shared file naming and download used by the shared panel. |
| component | Shared ArtifactPanel and ArtifactRenderer | `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | Download menu item in the shared chat UI (253-313). |
| component | Desktop host actions | `apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts` | Tauri desktop: Save a copy to the artifacts folder (92-117). |
| service | codeFileName | `packages/ui/unified-chat/src/components/markdown/codeFileName.ts` | Language to file name and extension, html maps to html (18). |
| test | downloadArtifacts tests | `apps/web/features/chat/utils/downloadArtifacts.test.ts` | Zip and download behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web builds the file from the artifact's content in the browser and saves it as a blob; no server call for text artifacts. | device | ArtifactPreview.tsx:1381-1415 |
| For a generated file the browser fetches its address with a 60 second limit and saves the bytes. | device and our servers | downloadArtifacts.ts:71-91,133-141 |
| Zip is created in the browser after loading the zip library. | device | downloadArtifacts.ts:104-131 |
| Mobile writes the file on the device and opens the share sheet. | device | artifactExport.ts:128-153; ArtifactExportSheet.tsx:53-54 (on-device file creation inferred from imports of services/fileCreation) |
| CLI fetches the conversation page that holds the message from our servers and writes the fenced block. | device and our servers | cloud/artifacts.rs:400-450; lib.rs:3950-3955 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file or zip | user's downloads folder or share target | no | kept by the user; the app keeps no copy. Blob URLs are revoked after 60 seconds (downloadArtifacts.ts:101). |
| Source artifact | device store (web localStorage-backed store; mobile MMKV) and cloud sync for edited artifacts in cloud mode | edited artifacts sync in cloud mode; temporary and locally answered chats are skipped (artifacts-store.ts:1059-1072) | see F032-12 |

**Models and providers.** No model takes part. Titles and languages that the model chose are treated as untrusted when naming files (downloadArtifacts.ts:115-117).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Mobile and Chrome export of an artifact already on the device needs no extra account step in the code read. CLI and VS Code need sign-in (lib.rs:3856-3859; artifactActions.ts:57-70). |
| Permissions | Generated-file fetch sends cookies only to the same origin (downloadArtifacts.ts:62-69). |
| Subscription | none found in the code for export. A monthly download allowance exists for stored files served by the server (docs: knowledge-base/40-systems/files-artifacts-and-storage.md, Downloads and exports); whether it applies to artifact exports was not checked. |
| Limits and metering | 60 second limit for generated-file fetch; file name cut to 180 characters (downloadArtifacts.ts:16,23). |
| Feature flags | none found in the code. |
| Model compatibility | independent of model. |
| Provider restrictions | none found in the code. |
| Local mode | Exporting text, HTML and documents from an artifact already on the device works without our servers on Web and Mobile [inferred from the code paths above]. CLI and VS Code need our servers. Nothing in the export code checks a mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Zip shows 'Preparing artifact download…'; Mobile disables repeat taps while downloading. | ArtifactsPanel.tsx:738; ArtifactFullScreen.tsx:687 |
| error | Web toast with the cause; HTTP failure text 'Could not download <file> (HTTP n)'; timeout 'request timed out'. | downloadArtifacts.ts:79-86 |
| retry | Mobile sheet stays open so another format can be chosen; Web user presses again. | artifactExport tests: ArtifactExportSheet.test.tsx 'names the format that failed and stays open' |
| duplicate titles | Second becomes 'Title (2).ext'. | downloadArtifacts.ts:42-60 |
| a single artifact | Download all is hidden. | ArtifactsPanel.tsx:730 |
| title ending in an extension | Not doubled. | downloadArtifacts.ts:32 |
| CLI path is a directory or has no extension | Directory gets <id>.<ext>; missing extension is added. | cloud/artifacts.rs:283-296 |
| offline | not handled in the code beyond the generic fetch error; device-built files need no network. | downloadArtifacts.ts:79-90 |
| accessibility | Buttons have aria-labels and titles. | ArtifactsPanel.tsx:744-745; ArtifactPreview.tsx:2789 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/utils/downloadArtifacts.test.ts`: Zip with generated-file bytes, duplicate names, extension handling, honest failure, authenticated relative download.
- `apps/web/features/chat/utils/downloadArtifacts.csvInjection.test.ts`: Formula neutralisation in downloads and zip.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx`: Markdown export (name only).
- `apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx`: Single-file CSV download safety (name only).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactExportSheet.test.tsx`: Formats for reports, deck PDF, document PDF, code as source only, failure naming, close.
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Byte-exact Markdown and text, CSV guard, source naming, safe title handling.
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome file naming and saving source.
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Index and re-derivation used by Save to workspace.
- `apps/cli/src/cloud/artifacts.rs`: Inline unit tests for extension and output path rules (e.g. lines 856-880).

**Test scenarios**

- **HTML design download**
  1. Make an HTML design.
  2. Download as HTML.
  3. Open the file in a browser.
  - Expected: The design renders; compare with the raw source to see it is the sanitised preview page.
- **Zip of two artifacts with the same title**
  1. Create two artifacts titled Page.
  2. Press Download all.
  - Expected: artifacts.zip contains Page.html and Page (2).html.
- **No image or PDF for a design**
  1. Open the download menu on an HTML design.
  - Expected: HTML, source and Markdown only.
- **Mobile HTML export**
  1. Open an HTML artifact on Mobile and press Download.
  - Expected: Single source option goes to the share sheet as an .html file.
- **CLI write**
  1. agi artifacts show <id> --out ./out
  - Expected: File named <id>.html in out when out is a directory.
- **Generated file timeout**
  1. Download a persisted generated file with the network blocked.
  - Expected: Error toast naming the file.

**Where to look when it fails**

- Toast texts above; HTTP status in the message.
- CLI prints the resolve and message errors.
- VS Code warning when no folder is open.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- Desktop: [70-qa/test-plans/desktop/032-design-workspace.md](../../70-qa/test-plans/desktop/032-design-workspace.md)
- Mobile: [70-qa/test-plans/mobile/032-design-workspace.md](../../70-qa/test-plans/mobile/032-design-workspace.md)
- CLI: [70-qa/test-plans/cli/032-design-workspace.md](../../70-qa/test-plans/cli/032-design-workspace.md)
- VS Code: [70-qa/test-plans/vscode/032-design-workspace.md](../../70-qa/test-plans/vscode/032-design-workspace.md)
- Chrome: [70-qa/test-plans/chrome/032-design-workspace.md](../../70-qa/test-plans/chrome/032-design-workspace.md)

## 10. Gaps and dependencies

- **No PNG or other image export of a rendered design on any app.** Affects: All apps.. Evidence: ArtifactPreview.tsx:2371 (image only for image artifacts). Work needed: Render the sandboxed page to an image.
- **No PDF of an HTML design.** Affects: All apps.. Evidence: ArtifactPreview.tsx:2397-2411. Work needed: Product decision, then print path.
- **Mobile has no archive export.** Affects: Mobile.. Evidence: artifactExport.ts:19. Work needed: Add zip.
- **Zip HTML differs from single-file HTML.** Affects: Web.. Evidence: downloadArtifacts.ts:117 versus ArtifactPreview.tsx:1393. Work needed: Use one builder.
- **Brief's code citations for CLI are wrong and statuses (PDF not applicable) are stale.** Affects: Brief readers.. Evidence: lib.rs:1034 and 1942 are other commands. Work needed: Correct the brief.
- **Chrome download and VS Code save status not tested in the brief; code exists.** Affects: Brief readers.. Evidence: artifactPanel.ts:381; artifactActions.ts:163. Work needed: Update statuses.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F032-12

## Unknown

- Whether the server download allowance applies to artifact export.
- Mobile local export wiring in services/fileCreation (not opened).
- Whether Tauri desktop's shared Download is reachable in current builds.
- Content of ArtifactPreview.markdownExport and csvInjection tests (names only).
