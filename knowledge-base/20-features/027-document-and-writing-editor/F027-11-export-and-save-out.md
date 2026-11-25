---
id: "F027-11"
type: "feature"
title: "Export and save out"
aliases: ["Export", "Download as", "Download artifact", "Save as file", "Save to Google Docs / Drive / OneDrive", "agi artifacts show --out", "Save Artifact into Workspace", "S27.35 to S27.38"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S27.35", "S27.36", "S27.37", "S27.38"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:local", "mode:cloud", "api:POST /api/artifacts/export/google-docs", "api:POST /api/artifacts/save-to-drive", "api:POST /api/artifacts/save-to-onedrive", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "file:packages/contracts/types/src/connector-release.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-11 Export and save out

Lets a person take an artifact out of the app as a file. Web offers Markdown, HTML, PDF and Word; mobile offers Markdown, PDF, Word and plain text; the CLI and VS Code write the text as it is. Saves to Google Docs, Drive and OneDrive are built but hidden and refused by the server until connectors are released.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.35](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2735), [S27.36](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2736), [S27.37](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2737), [S27.38](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2738).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Converts or copies an artifact into a file on the person's device (or, when released, into a connected document service). Word and PDF are produced on the device from the document's markdown.

**Why it exists.** Documents made in chat are used elsewhere: sent to colleagues, printed, submitted. The requirements list copy, download and export actions for every artifact (doc: docs/product/requirements.md:749).

**Who uses it.** Anyone who finishes a document and needs a file.

**Problems it solves**

- Getting a Word or PDF version without retyping
- Saving a text artifact into a code project
- Keeping a Markdown copy

**Use cases**

- Web: Download then 'Download as Word (.docx)' for a report.
- Mobile: Download as PDF then send through the share sheet.
- CLI: 'agi artifacts show <id> --out report' writes report.md.
- VS Code: 'Code: Save Artifact into Workspace' writes a file into the open folder.

## 2. User experience

**Where to find it**

- Web and the Electron window (hosted web app): header button 'Download artifact' (title 'Download', test id artifact-download); with more than one choice it opens a menu (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2782-2830). For text documents the entries are 'Download as HTML', 'Download source (.<language>)', 'Download as Markdown', 'Download as Word (.docx)', 'Download as PDF'; decks have 'Download as PDF'; tables 'Download as CSV'; diagrams 'Download as SVG'; PDF, Word and images 'Download file' / 'Download image' (ArtifactPreview.tsx:2366-2425). The brief and first draft said the More menu; the code puts downloads in the Download button. A second dropdown with the same names exists at ArtifactPreview.tsx:3486-3508; which variant uses it: unknown.
- Web More menu, group 'Keep' (only when connectors are released): 'Save to Google Docs', 'Save to Google Drive', 'Save to OneDrive' (ArtifactPreview.tsx:2448-2470).
- Mobile: Download action in the full-screen artifact; with several formats a sheet titled 'Download as' lists them (apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx; ArtifactFullScreen.tsx:685-725).
- CLI: 'agi artifacts show <id> --out <path>' (apps/cli/src/lib.rs:1372-1388).
- VS Code: command 'Code: Save Artifact into Workspace' in the Artifacts view (apps/extension-vscode/package.json:713-714, 1198).
- Tauri desktop shared panel: 'Download' saves the source file (packages/ui/unified-chat/src/components/ArtifactPanel.tsx:253-313, 513-516) and in local mode the host action 'Save a copy to the artifacts folder' (apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts:95-110). Chrome: unknown.

**Before you start**

- Web: a document, deck, table, diagram or file artifact; Word and PDF only for text documents (isTextDocument) (ArtifactPreview.tsx:2404-2412).
- CLI: a signed-in account; the command connects to the managed cloud client first (lib.rs:3856-3858).
- VS Code: a signed-in account and an open folder; otherwise 'open a folder first, a copy needs somewhere to land.' (artifactActions.ts saveArtifactToWorkspace).
- Cloud saves: connectors released (not yet), a connected Google or Microsoft account with write permission.

**Screens and controls**

- Mobile options by type: plain text artifacts get Plain text and PDF; documents, research and markdown get Markdown ('A .md file that keeps the formatting'), PDF ('A styled document'), Word ('A .docx document you can edit'), Plain text; decks get PDF (one slide per page), Markdown, Plain text; code gets its source file (apps/mobile/src/features/chat/utils/artifactExport.ts:57-126). Rows are named 'Download as <label>'; close is 'Close download options' (ArtifactExportSheet.tsx).
- CLI flags: --out, --open, --copy, --json (lib.rs:1372-1388). A directory takes the artifact's name; a path with no extension gains one (artifacts.rs:283).
- VS Code: save dialog titled 'Save "<title>" into the workspace', default name a slug of the title (up to 60 characters) with the artifact's extension (artifactPresentation.ts:99-106).

**Journey**

1. Web: open the artifact, press Download, pick a format; the browser saves the file.
2. Mobile: press Download; if several formats exist the 'Download as' sheet opens; pick one; the file is built on the phone and the system share sheet opens.
3. CLI: find the id with 'agi artifacts list', run 'agi artifacts show <id> --out <path>'; the path is printed.
4. VS Code: right-click an artifact, choose the save command, confirm the file name.

**What the person sees and gets**

- Web errors: toast 'This document could not be exported as Word' or '... as PDF'; deck PDF shows 'Preparing the PDF…' then 'PDF downloaded' (ArtifactPreview.tsx:1646-1665).
- Mobile errors: alert 'Download failed' with a reason; sheet stays open (ArtifactExportSheet.tsx:55-60).
- CLI prints the written path (or JSON with id, path, opened).
- VS Code shows an information or error message naming the artifact.

**Settings**

- None found. Connector release state is a code constant, not a setting (packages/contracts/types/src/connector-release.ts:14).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Markdown (written as is for markdown documents, otherwise wrapped in a fenced block), HTML, source, CSV, SVG, deck PDF, document Word and PDF (ArtifactPreview.tsx:1381-1410, 1646-1665; apps/web/features/chat/services/document-export-service.ts:68-92). Word uses the 'docx' library and PDF uses jsPDF in the browser (export-docx.ts, export-pdf.ts).
- Mobile: markdown, PDF (print service), Word, plain text, source files; files are saved through the system share sheet (apps/mobile/src/features/chat/utils/artifactExport.ts:129-160; apps/mobile/services/fileCreation.ts:174-181; apps/mobile/services/docxExport.ts:164).
- CLI: writes the artifact content with a type-based extension (md for markdown, txt for text, html, svg, mmd, jsx, or the language) (apps/cli/src/cloud/artifacts.rs:236-246; lib.rs:3951-3965).
- VS Code: saves text content as UTF-8 through a save dialog (artifactActions.ts saveArtifactToWorkspace).
- Tauri desktop shared panel: saves the source with an extension by type (md for document) (packages/ui/unified-chat/src/lib/artifact-download.ts:5-20).

**Incomplete**

- CLI and VS Code export plain text only; no Word or PDF (CLI writes block.content, lib.rs:3961).
- Brief says desktop 'done'; for Tauri I found only source download and a local copy action, no Word or PDF; for Electron the web menu applies.
- The decision document says VS Code only lists artifacts and opens the published link (doc: docs/decisions/2026-09-27-founder-decisions.md:116-118), but code also copies and saves; the document is behind the code.

**Present but disconnected or switched off**

- Save to Google Docs, Drive and OneDrive are hidden unless connectorsReleased() is true (ArtifactPreview.tsx:2448-2470) and the connector release state is 'coming_soon' (packages/contracts/types/src/connector-release.ts:14). The three routes also refuse with assertConnectorsReleased() (apps/web/app/api/artifacts/export/google-docs/route.ts:44; save-to-drive/route.ts:43; save-to-onedrive/route.ts:44). Test: ArtifactPreview.connectorsUnreleased.test.tsx:23.

**Not available**

- Chrome export: no document export found; unknown.
- CLI and VS Code Word and PDF.
- Save to Notion or other services: none found (not searched beyond the three above).

## 4. Required behaviour

**Established requirements**

- A document can be exported to Word (S27.35), PDF (S27.36) and Markdown (S27.37), and saved into a connected document service (S27.38). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.35, S27.36, S27.37, S27.38)
- Artifacts have copy, download and export actions. (source: doc: docs/product/requirements.md:749)
- Connectors are 'coming soon'; the server refuses connector saves while not released. (source: packages/contracts/types/src/connector-release.ts:14, 40-44; apps/web/app/api/artifacts/export/google-docs/route.ts:44)
- A Markdown document is downloaded as Markdown, not as one code fence. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx:19)
- VS Code does not preview, export or publish artifacts by decision; it lists them and opens a published link. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:116-118)

**Acceptance criteria**

1. On web a text document offers Markdown, Word and PDF and each downloads a file named from the title.
2. On mobile a document offers Markdown, PDF, Word and Plain text and a chosen format opens the share sheet with that file.
3. A Markdown export is byte for byte the document, with no added title or date (mobile test artifact-export-fidelity.test.ts:104).
4. 'agi artifacts show <id> --out report' writes report.md for a markdown artifact and prints the path.
5. No Save to Google Docs, Drive or OneDrive item is visible while connectors are not released.
6. POST /api/artifacts/export/google-docs while not released returns a refusal and creates nothing.
7. In VS Code with no folder open, the save command warns and writes nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- CLI and VS Code Word and PDF are not planned: the CLI help describes only printing or writing content (lib.rs:1372-1375) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the decision text for VS Code to match the copy and save commands.
- [proposed] Add a 'Download as PDF/Word' path to the Tauri desktop panel if that build is kept.
- [proposed] Make the CLI warn when --out has a different extension from the artifact type.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview download menu | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Builds download items (2366), handleDownload (1381), handleExportDocument (1655), Download button (2782). |
| service | document-export-service | `apps/web/features/chat/services/document-export-service.ts` | exportDocument: markdown, pdf, docx on the device (68). |
| service | export-docx / export-pdf | `apps/web/features/chat/services/export-docx.ts` | Builds Word (docx library) and PDF (jsPDF; export-pdf.ts) from document blocks. |
| service | markdownToDocumentBlocks | packages/ui/unified-chat/src/lib/markdown-document.ts (not found) (not found) | Shared markdown to blocks used by web and the Google Docs route (module imported as '@agiworkforce/unified-chat/markdown-document'; file path assumed, not opened). |
| endpoint | POST /api/artifacts/export/google-docs | `apps/web/app/api/artifacts/export/google-docs/route.ts` | Builds a docx and creates a Google Doc; refused unless connectors released. |
| endpoint | POST /api/artifacts/save-to-drive | `apps/web/app/api/artifacts/save-to-drive/route.ts` | Saves to Google Drive; same release guard. |
| endpoint | POST /api/artifacts/save-to-onedrive | `apps/web/app/api/artifacts/save-to-onedrive/route.ts` | Saves to OneDrive; same release guard. |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | 'coming_soon' hides and refuses connector saves. |
| service | artifactExport (mobile) | `apps/mobile/src/features/chat/utils/artifactExport.ts` | Options per type and exportArtifact. |
| component | ArtifactExportSheet (mobile) | `apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx` | 'Download as' sheet. |
| service | fileCreation / docxExport (mobile) | `apps/mobile/services/fileCreation.ts` | PDF through the print service (174), Word through docxExport.ts:164, share through the system share sheet. |
| command | agi artifacts show | `apps/cli/src/lib.rs` | Show with --out, --open, --copy, --json (1372, 3910). |
| service | CLI artifacts client | `apps/cli/src/cloud/artifacts.rs` | content (400), file_extension (236), output_path (283). |
| command | agi-workforce.saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Save dialog and file write; name from artifactPresentation.ts:99. |
| service | artifact-download (shared) | `packages/ui/unified-chat/src/lib/artifact-download.ts` | Tauri panel download file name and spreadsheet-safe body. |
| hook | useDesktopArtifactActions | `apps/desktop/src/features/artifacts/useDesktopArtifactActions.ts` | 'Save a copy to the artifacts folder' (local mode). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a format; web builds the file in the browser (Word through the docx library, PDF through jsPDF) and saves it. | device | apps/web/features/chat/services/document-export-service.ts:25-55 |
| Mobile builds the file on the phone (print service for PDF, docx builder for Word) and opens the share sheet. | device | apps/mobile/services/fileCreation.ts:14, 174-181; ArtifactFullScreen.tsx:721 |
| CLI signs in to the managed cloud, reads the source message pages to re-derive the artifact text, and writes it to disk. | device and our servers | apps/cli/src/lib.rs:3856-3858; apps/cli/src/cloud/artifacts.rs:400-430 |
| VS Code reads the artifact the same way through the account API and writes it with the workspace file system. | device and our servers | apps/extension-vscode/src/features/artifacts/artifactsClient.ts:1-50; artifactActions.ts |
| A cloud save (when released) sends the content to our server, which builds a Word file and uploads it to the person's Google Drive, then returns the link. | outside service | apps/web/app/api/artifacts/export/google-docs/route.ts:44-92 (our server builds the file; Google Drive is the outside service) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Exported file | The person's downloads folder, share target, workspace folder or path given to --out | No sync; a copy. | Controlled by the person; the app does not track it. |
| Content sent for Google Docs save (when released) | Passed to the server in the request and uploaded to the person's Google Drive | Not applicable | Server retention of the request body: unknown. |

**Models and providers.** No model is called for export. Cloud saves use the Google or Microsoft connector account of the person, not an AI provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, mobile and Tauri exports of already-open artifacts need no extra account step found. CLI and VS Code need a signed-in account. Cloud saves need a connected account. |
| Permissions | Google save needs the Drive write scope; refusal codes google_drive_not_connected, google_drive_reconnect_required, google_drive_write_not_granted (google-docs/route.ts:62-72). |
| Subscription | File exports: none found in the code. Connectors: the plan capability 'connectors' is checked by planIncludesConnectors (apps/web/lib/connectors/connector-capability.ts:23-25) but the release state blocks all plans for now. |
| Limits and metering | Rate limit class 'share-create' on the Google Docs route (route.ts:38). No other limits found. |
| Feature flags | Connector release state constant; a kill-switch gate for connector tools exists (connector-capability.ts:27-45). |
| Model compatibility | Not model dependent. |
| Provider restrictions | Google Drive and OneDrive only for cloud saves. |
| Local mode | Web and mobile exports run fully on the device and work for Local artifacts. CLI and VS Code read from the account, so they are not Local-mode features. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Export fails | Web toast 'This document could not be exported as Word/PDF'; mobile alert 'Download failed' | ArtifactPreview.tsx:1657-1665; ArtifactExportSheet.tsx:55-60 |
| Empty deck | Mobile throws 'Cannot export empty content' | artifactExport.ts:122-124 |
| Formula in CSV | Spreadsheet-safe export neutralises formulas | artifactExport.ts:151-156; ArtifactPreview.csvInjection.test.tsx |
| CLI artifact missing from message | Errors out; pages are followed until the message is found | apps/cli/src/cloud/artifacts.rs:400-430 |
| VS Code no folder or user cancels dialog | Warning or silent return | artifactActions.ts saveArtifactToWorkspace |
| VS Code artifact no longer produced | Warning 'is indexed but its message no longer produces it' | artifactActions.ts |
| Connectors not released | Items hidden; server refuses | ArtifactPreview.connectorsUnreleased.test.tsx:23 |
| Offline, retry, timeout | Web and mobile exports need no network; CLI and VS Code surface errors; no retry logic found. | document-export-service.ts has no network calls; apps/cli/src/lib.rs:3910-3965 returns errors without retry |
| Accessibility | Mobile rows have labels 'Download as <label>' and a dismiss control; web button has aria-label 'Download artifact' | ArtifactExportSheet.tsx:77-117; ArtifactPreview.tsx:2796 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.markdownExport.test.tsx`: Markdown document downloads as Markdown, not one code fence.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.connectorsUnreleased.test.tsx`: No Google Docs, Drive or OneDrive items while unreleased.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.googleDocs.test.tsx`: Google Docs save flow when available; cases not read.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.cloudSave.test.tsx`: Drive and OneDrive save flow; cases not read.
- `apps/web/app/api/artifacts/export/google-docs/route.test.ts`: Google Docs route; cases not read.
- `apps/web/features/chat/services/export-math.test.ts`: Math in exports; cases not read.
- `apps/mobile/__tests__/artifact-export-fidelity.test.ts`: Markdown and text byte for byte, CSV formula guard, source file names, title characters.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactExportSheet.test.tsx`: Options per type, deck PDF, failure keeps sheet open, close.
- `apps/mobile/__tests__/docx-export-links.test.ts`: Word export links.
- `apps/mobile/__tests__/docx-export-table.test.ts`: Word export tables.
- `apps/cli/src/cloud/artifacts.rs`: Inline tests: extension by kind and language (856), out path naming (866).
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Artifact listing and content derivation, file name and language resolution (281); the save command itself not covered by name.

**Test scenarios**

- **Web Word export**
  1. Open a markdown document in the web side panel.
  2. Press Download, choose 'Download as Word (.docx)'.
  3. Open the file.
  - Expected: A .docx named after the title opens in a word processor with headings and lists kept.
- **Mobile format choice**
  1. Open a document full screen on mobile and press Download.
  2. Choose Word in the 'Download as' sheet.
  - Expected: A .docx is created on the phone and the share sheet opens.
- **CLI file extension**
  1. Run 'agi artifacts list' and copy a markdown artifact id.
  2. Run 'agi artifacts show <id> --out report'.
  - Expected: report.md is written and its path printed.
- **Connector saves hidden**
  1. Open a markdown document on web.
  2. Open the More menu.
  - Expected: No Save to Google Docs, Drive or OneDrive items.
- **Server refusal**
  1. Send POST /api/artifacts/export/google-docs with a valid body and CSRF token.
  - Expected: A 'Connectors are coming soon.' refusal and no file created.
- **VS Code save**
  1. Open a folder, sign in, right-click an artifact, choose 'Code: Save Artifact into Workspace', confirm.
  - Expected: A UTF-8 file with the slug name and artifact extension appears in the folder.

**Where to look when it fails**

- Toasts and alerts above; CLI error text from anyhow; VS Code messages prefixed with the product's code name.
- Route refusals: forbidden 'Connectors are coming soon.'; 409 refusal codes for Google Drive state.
- Mobile: downloadFailureMessage output.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Mobile: [70-qa/test-plans/mobile/027-document-and-writing-editor.md](../../70-qa/test-plans/mobile/027-document-and-writing-editor.md)
- CLI: [70-qa/test-plans/cli/027-document-and-writing-editor.md](../../70-qa/test-plans/cli/027-document-and-writing-editor.md)
- VS Code: [70-qa/test-plans/vscode/027-document-and-writing-editor.md](../../70-qa/test-plans/vscode/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **CLI and VS Code cannot produce Word or PDF.** Affects: CLI and VS Code. Evidence: apps/cli/src/lib.rs:3961; artifactActions.ts. Work needed: Decide scope; VS Code export is not expected by decision (founder-decisions:116-118).
- **Cloud saves are built but unavailable until connectors are released.** Affects: Web users. Evidence: connector-release.ts:14. Work needed: Release step and live validation; not for the agent to do.
- **Tauri desktop panel has only source download; Word and PDF not found.** Affects: Tauri desktop. Evidence: packages/ui/unified-chat/src/components/ArtifactPanel.tsx:513-516. Work needed: Confirm whether the Tauri build is meant to match web.
- **Decision text for VS Code is behind the code.** Affects: Docs. Evidence: founder-decisions:116-118 vs package.json:704-714. Work needed: Update the decision or the code.
- **Chrome export unverified.** Affects: Chrome. Evidence: No document export found in apps/extension/src. Work needed: Search and record.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:local
- mode:cloud
- api:POST /api/artifacts/export/google-docs
- api:POST /api/artifacts/save-to-drive
- api:POST /api/artifacts/save-to-onedrive
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- file:packages/contracts/types/src/connector-release.ts

## Unknown

- Whether Chrome exports anything.
- Whether the Tauri desktop has Word or PDF export outside the shared panel.
- Which web variant uses the second dropdown at ArtifactPreview.tsx:3486-3508.
- Server retention of the Google Docs request content.
- Contents of the Google Docs and cloud-save tests (not read).
- Exact visible label of the mobile Download button.
- Whether the VS Code save command has a unit test.
- The exact file path of the shared markdown-to-blocks module (only its import name was seen).
