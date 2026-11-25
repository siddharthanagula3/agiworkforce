---
id: "F026-06"
type: "feature"
title: "Copy and export"
aliases: ["Copy artifact", "Copy content", "Export menu", "Download artifact", "Download as ...", "Download as Word (.docx)", "Download as PDF", "Download all (zip)", "Download as ... sheet (mobile)", "agi artifacts show --copy / --out"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S26.29", "S26.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-observability-and-operations", "file:apps/web/features/chat/utils/downloadArtifacts.ts", "file:apps/mobile/src/features/chat/utils/artifactExport.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-06 Copy and export

Copies an artifact's own text to the clipboard with a confirmation, or saves it as a file. Web offers a download menu with HTML, source, Markdown, CSV, SVG, Word and PDF depending on the kind. Mobile offers a 'Download as' sheet. CLI writes with --out or copies with --copy. VS Code copies or saves into the workspace. Chrome copies and downloads.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.29](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2629), [S26.30](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2630).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Puts the shown version's content on the clipboard and confirms, and writes it to a file in a format the person chooses (ArtifactPreview.tsx:1212-1219,2380-2425).

**Why it exists.** Generated content must leave the chat: pasted into other tools or kept as a file.

**Who uses it.** Anyone using generated code, documents and pages elsewhere.

**Problems it solves**

- Paste a snippet into an editor
- Save a report as Word or PDF
- Save a spreadsheet as CSV without spreadsheet formula injection

**Use cases**

- Press Copy on a code artifact
- Download an HTML page as a file
- Export a document as Word
- Run 'agi artifacts show <id> --out ./page.html'

## 2. User experience

**Where to find it**

- Web and Desktop: header button 'Copy artifact' that becomes 'Copied' (ArtifactPreview.tsx:2894-2918); download button 'Download artifact' with a menu (ArtifactPreview.tsx:2789-2807,3478-3514); more menu items 'Download as HTML', 'Download source (.ext)', 'Download as Markdown', 'Download as CSV', 'Download as SVG', 'Download as Word (.docx)', 'Download as PDF', 'Download generated file' (ArtifactPreview.tsx:2380-2425)
- Mobile: copy icon labelled 'Copy content' and a download action that opens the sheet 'Download as' with options named by format (ArtifactFullScreen.tsx:1357-1376,641-644; ArtifactExportSheet.tsx:95-117)
- Chrome: copy and download icon buttons in the panel (artifactPanel.ts:500-501,724-727)
- CLI: 'agi artifacts show <id> --copy' and '--out <path>' (lib.rs:3910-3965)
- VS Code: 'Code: Copy Artifact Content' and 'Code: Save Artifact into Workspace' (package.json:708-714)

**Before you start**

- An artifact with text content for copy; web hides copy for PDF, DOCX and image (ArtifactPreview.tsx:2894)
- CLI and VS Code need a signed-in Cloud account

**Screens and controls**

- Copy button with check mark when done
- Download menu or sheet of formats offered for this kind
- Save dialog in VS Code (artifactActions.ts:192)
- Share sheet on mobile for the chosen file (ArtifactFullScreen.tsx:721)

**Journey**

1. Open an artifact
2. Press Copy: the button reads 'Copied' for two seconds
3. Or open the download menu and pick a format
4. The file saves, or on mobile the share sheet opens
5. On failure a message appears

**What the person sees and gets**

- Web 'Copied' state for 2 seconds (ArtifactPreview.tsx:1217-1218)
- Web toast 'Could not copy to clipboard' (ArtifactPreview.tsx:1214)
- Mobile alert 'Download failed' with a reason (ArtifactFullScreen.tsx:708,725)
- VS Code message 'copied "<title>"' (artifactActions.ts:157-160)
- Chrome status 'Copied.' or 'The artifact could not be copied. Try again.' (_locales/en/messages.json:3291-3297)
- CLI prints 'Copied "<title>" to the clipboard.' (lib.rs:3928-3931)

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web copy of the shown version (ArtifactPreview.tsx:1212-1219)
- Web spreadsheet-safe CSV and source export (ArtifactPreview.tsx:1408,1551)
- Web Word and PDF export for documents (ArtifactPreview.tsx:1655-1667)
- Web zip of many (downloadArtifacts.ts:107-130)
- Mobile copy and format sheet (ArtifactFullScreen.tsx:641-644,690-725; artifactExport.ts:54-153)
- CLI --copy and --out (lib.rs:3922-3965)
- VS Code copy and save (artifactActions.ts:138-196)
- Chrome copy and download (artifactPanel.ts:695-699,1049-1058)

**Incomplete**

- Brief marks Chrome copy and export unverified; code shows both (artifactPanel.ts:695,1049)
- Whether PDF export of a document runs in the browser or on a server: unknown (document-export-service.ts lines read cover docx only)

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI and VS Code have no format menu: they write the source text only (lib.rs:3954-3962; artifactActions.ts:200)
- Web has no copy for PDF, DOCX or image (ArtifactPreview.tsx:2894)

## 4. Required behaviour

**Established requirements**

- The export menu offers formats and each choice saves a file in that format (S26.29) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.29)
- A copy control puts the artifact's own content on the clipboard and confirms it (S26.30) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.30)
- Download works with the version intended and reopening keeps it (source: doc: docs/product/experience-contract.md:782)

**Acceptance criteria**

1. Web: Copy on a code artifact puts exactly its text on the clipboard and the button shows 'Copied'
2. Web: when the clipboard is denied a toast says 'Could not copy to clipboard'
3. Web: each listed Download item saves a file with a matching extension
4. Web: a CSV cell starting with = is not left as a live formula in the download
5. Mobile: Download as Markdown writes the text byte for byte
6. CLI: --out writes the file and prints its path; --copy puts text on the clipboard
7. VS Code: Save into Workspace asks for a location and opens the saved file
8. A failed download shows a user message, not a raw error

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Copy of an older version copies that version [inferred from handleCopy using activeContent, ArtifactPreview.tsx:1212]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the same format list in CLI and VS Code for documents
- [proposed] Tell the person when the server builds a PDF

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview copy and download | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | handleCopy, download menu, format handlers |
| service | downloadArtifacts | `apps/web/features/chat/utils/downloadArtifacts.ts` | downloadArtifactFile and downloadAllArtifacts (zip) |
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | Word and PDF export |
| other | spreadsheetSafeExport | packages/ui/unified-chat/src/tabular.ts (not found) (not found) | Guards formulas in CSV exports [inferred from import path '@agiworkforce/unified-chat/tabular'; exact file not opened] |
| component | ArtifactCard download button | `apps/web/features/chat/components/artifacts/ArtifactCard.tsx` | Download from the card (lines 41-61,151-159) |
| component | ArtifactFullScreen copy and export | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile copy (641) and export (690-725) |
| component | ArtifactExportSheet | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | Mobile 'Download as' sheet |
| service | artifactExport | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Format options and file writing |
| hook | useCopyAction | `apps/mobile/src/shared/hooks/useCopyAction.ts` | Copy status for mobile [inferred from import; file not opened] |
| command | agi artifacts show | `apps/cli/src/lib.rs` | --copy and --out (lines 3910-3965) |
| service | CLI file naming | `apps/cli/src/cloud/artifacts.rs` | file_extension and output_path (lines 236-297) |
| command | copyArtifactContent / saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | VS Code copy (138) and save (163) |
| component | artifactPanel copy and download | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome copy (1049) and artifactDownload (381) |
| test | artifact-export-fidelity.test | `apps/mobile/__tests__/artifact-export-fidelity.test.ts` | Mobile export tests |
| test | ArtifactPreview.markdownExport.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx` | Web markdown export tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Copy writes the shown content to the clipboard; failure shows a toast | device | ArtifactPreview.tsx:1212-1219 |
| Web download builds a Blob from the content and saves it; CSV and source pass through the spreadsheet-safe export | device | ArtifactPreview.tsx:1381-1410,1873-1884 |
| Word export builds the document in the browser with the docx library | device | document-export-service.ts:1,45,83-84 |
| PDF export path: unknown, the lines read cover docx only | device | document-export-service.ts lines read cover docx only |
| Generated files are fetched from their stored address, with a 60 second limit | our servers | downloadArtifacts.ts:18; ArtifactPreview.tsx:1669 |
| CLI fetches the source message from the hosted API and writes the text locally | device and our servers | cloud/artifacts.rs:400-450; lib.rs:3917-3962 |
| Mobile writes the chosen format then opens the share sheet | device | ArtifactFullScreen.tsx:703-722; artifactExport.ts:128-153 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file or clipboard text | User's device downloads folder, share target, clipboard, or the CLI output path | No | Owned by the user; the app keeps no copy beyond the artifact |

**Models and providers.** Not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile copy and export need no extra sign-in beyond having the artifact; generated-file downloads use the account's file route. CLI and VS Code need a signed-in Cloud account. |
| Permissions | Clipboard permission by the browser; VS Code asks for a save location (artifactActions.ts:192). |
| Subscription | none found in the code in the copy and export files opened |
| Limits and metering | Download fetch limit 60 seconds (downloadArtifacts.ts:18); zip entry names sanitised (downloadArtifacts.ts:115). No metering found. |
| Feature flags | none found |
| Model compatibility | Not applicable |
| Provider restrictions | none found |
| Local mode | Copy and local export work in Local mode on web and mobile. CLI refuses non-managed mode (client.rs:368-372). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Clipboard refused | Web toast; mobile useCopyAction 'failed' icon; Chrome status text; VS Code none for failure beyond exceptions | ArtifactPreview.tsx:1214; ArtifactFullScreen.tsx:1369-1374; _locales/en/messages.json:3295 |
| Download failure | Web card toast 'Could not download this artifact' with a user message; mobile alert 'Download failed' | ArtifactCard.tsx:57-59; ArtifactFullScreen.tsx:725 |
| Binary content | No copy; real bytes downloaded for PDF and DOCX | ArtifactPreview.tsx:1760-1783,2894 |
| Source message gone | VS Code warns 'indexed but its message no longer produces it' | artifactActions.ts:147-153 |
| No workspace folder | VS Code asks to open a folder first | artifactActions.ts:163-170 |
| Streaming | Chrome disables copy and download while the artifact is being written | artifactPanel.ts:722-723 |
| Formula-like CSV text | Guarded in web and mobile exports | ArtifactPreview.tsx:1408; apps/mobile/__tests__/artifact-export-fidelity.test.ts (test name) |
| Accessibility | Copy button aria-label toggles 'Copy artifact' and 'Copied'; mobile label via copyControlLabel | ArtifactPreview.tsx:2905; ArtifactFullScreen.tsx:1366 |
| Offline | Local copy and export work; generated-file download and CLI need the network [inferred] | downloadArtifacts.ts:18; cloud/artifacts.rs:330-341 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx`: Markdown export
- `apps/web/features/chat/components/artifacts/ArtifactPreview.csvInjection.test.tsx`: CSV formula guard
- `apps/web/features/chat/components/artifacts/ArtifactPreview.test.tsx`: Preview behaviour including controls [inferred from name]
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Markdown and text byte for byte, CSV guard, source files, Dockerfile name, empty extension
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome download names and source saved, copy and download of the open artifact
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Content re-derivation used by copy and save
- `apps/cli/src/cloud/artifacts.rs`: Unit tests inside the file for file extensions and output paths (tests near lines 856-890)

**Test scenarios**

- **Copy**
  1. Open a code artifact
  2. Press Copy
  3. Paste in an editor
  - Expected: Exact text pasted; button showed Copied
- **Clipboard denied**
  1. Block clipboard permission
  2. Press Copy
  - Expected: Toast 'Could not copy to clipboard'
- **Download formats**
  1. Open a document artifact
  2. Pick Download as Word, then Download as PDF
  - Expected: A .docx and a .pdf file open correctly
- **CSV safety**
  1. Make a CSV with a cell '=1+1'
  2. Download as CSV and open in a spreadsheet
  - Expected: The cell is text, not a formula
- **CLI save**
  1. agi artifacts show <id> --out ./x --copy
  - Expected: File written with the right extension; clipboard filled

**Where to look when it fails**

- Toast texts above
- CLI errors 'Could not copy to the clipboard: ...' (lib.rs:3927)
- Mobile alert 'Download failed' with reason

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- CLI: [70-qa/test-plans/cli/026-artifact-container-and-panel.md](../../70-qa/test-plans/cli/026-artifact-container-and-panel.md)
- VS Code: [70-qa/test-plans/vscode/026-artifact-container-and-panel.md](../../70-qa/test-plans/vscode/026-artifact-container-and-panel.md)
- Chrome: [70-qa/test-plans/chrome/026-artifact-container-and-panel.md](../../70-qa/test-plans/chrome/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Chrome copy and export are present though the brief says unverified** Affects: Chrome. Evidence: artifactPanel.ts:695-699,1049-1058. Work needed: Update the brief
- **PDF export boundary unknown (device or server)** Affects: Web, Desktop. Evidence: document-export-service.ts read only for docx. Work needed: Read the PDF path and state where it runs
- **CLI and VS Code export source text only, no formats** Affects: CLI, VS Code. Evidence: lib.rs:3954-3962; artifactActions.ts:200. Work needed: Decide whether formats are needed
- **VS Code copy has no failure message if the clipboard write throws** Affects: VS Code. Evidence: artifactActions.ts:157-160. Work needed: Wrap in a handler

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-observability-and-operations
- file:apps/web/features/chat/utils/downloadArtifacts.ts
- file:apps/mobile/src/features/chat/utils/artifactExport.ts

## Unknown

- Where PDF export runs
- Whether Desktop Electron saves downloads through a native dialog
- Whether Chrome download of a rendered page versus source differs beyond the source (artifactDownload saves source)
- Failure message in VS Code when the clipboard write throws
