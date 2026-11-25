---
id: "F025-10"
type: "feature"
title: "Show a clear message when a file cannot be previewed or only partly loaded"
aliases: ["Unsupported-preview fallback", "Partial-extraction warning", "Download to view", "Preview isn't available", "Showing the start of this file", "S25.30", "S25.31"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.30", "S25.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "api:GET /api/files/{id}/text", "api:GET /api/library", "F025-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-10 Show a clear message when a file cannot be previewed or only partly loaded

When a file cannot be shown, the viewer says so and offers a download. When only the start of a text or table is shown, a note says to download the file for the rest. Web and Desktop do both in the Library viewer. Mobile has a fallback and a row-cap note. The CLI prints a stop note. VS Code and Chrome have none.

Area: [25. File previews and readers](README.md). Requirement items: [S25.30](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2530), [S25.31](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2531).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives the person an honest message when a file has no inline preview, failed to load, or was cut short, and points to the way out: download, share, or the CLI download command.

**Why it exists.** A blank panel or a half-shown file misleads people. The product rule is no silent failures and no fake responses (doc: AGENTS.md section 9).

**Who uses it.** Anyone opening a file type the product cannot render, or a large document, spreadsheet or text.

**Problems it solves**

- Not knowing why a file shows nothing.
- Believing a cut file is the whole file.

**Use cases**

- Open a .zip in the web Library and read 'Preview isn't available for this file inline' with a 'Download to view' button.
- Open a very long text and read 'Showing the start of this file.'
- Run agi library show <id> on a long file and read that the preview stops.

## 2. User experience

**Where to find it**

- Web and public Desktop: Library viewer centre card with a file icon, text 'Preview isn't available for this file inline.' and button 'Download to view' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1308-1324).
- Web and Desktop: note 'Showing the start of this file. Download it to see all of it.' under the preview (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:90-95).
- Web project modal: 'Preview is not available for this file type.' with the type below; 'Failed to load file contents.' when the load fails (apps/web/features/projects/components/FilePreviewModal.tsx:113-117, 437-447).
- Mobile: file viewer card 'Preview isn't available for this file type.' with a 'Share' button (apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx:176-211); table note 'Showing first N of M rows. Share as CSV for the full data.' (TabularGridView.tsx:379-392).
- CLI: after agi library show, '(The preview stops here; agi library download <id> saves the whole file.)' (apps/cli/src/lib.rs:7329-7334).
- Tauri desktop build: a separate dialog titled 'Library file preview' with 'Preview unavailable' and '[Preview truncated. Download the file to view the rest.]' exists but is not called by the shared Library (DesktopLibrary.tsx:21, 77-80, 232-246).
- VS Code and Chrome: none.

**Before you start**

- A signed-in account and a file in the Library or project sources.

**Screens and controls**

- Fallback card with icon, one sentence and a button.
- Spinner while the text preview loads (LibraryView.tsx:1301-1302).
- Truncation note under the text or table.
- Library row message when a file is gone (404 or 410) (LibraryView.tsx:577-580).

**Journey**

1. Open a file from the Library.
2. The viewer picks image, video, PDF or text; if none applies it shows the fallback card.
3. For a text-like file the viewer asks the text route; while waiting it shows a spinner.
4. If the text arrives cut, read the note and click Download for the whole file.
5. If the text request fails for any reason, the viewer shows the same fallback card.

**What the person sees and gets**

- Fallback sentence and button, truncation sentence.
- Web viewer does not show the server's specific reason; every failure becomes the generic fallback (FileTextPreview.tsx:16-39, 36).
- Server reasons exist in the API response: 'This file has no text preview', 'This file is too large to preview', 'This document could not be read' (apps/web/app/api/files/[id]/text/route.ts:37-39; apps/web/lib/server/file-text-preview.ts:58).
- PDF over the inline limit: 'This PDF is too large to preview. Download it to open it.' returned by the file route with HTTP 413 (apps/web/app/api/files/[id]/route.ts:51, 118-122).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared viewer fallback with a download button (LibraryView.tsx:1308-1324).
- Server decides if a type has a text preview: tables (csv, tsv), office documents, text/* and a few data types (apps/web/lib/server/file-text-preview.ts:26-37) and marks the item previewable (apps/web/app/api/library/route.ts:51-58).
- Text is cut at a character limit and flagged truncated; tables are also cut at 500 rows on screen (file-text-preview.ts:66-71; FileTextPreview.tsx:14, 50-52).
- Spreadsheets: only the first non-empty sheet is read; more than one filled sheet, omitted rows, or exceeding the character limit set complete to false, which becomes truncated (apps/web/lib/server/office-document-text.ts:715-744; file-text-preview.ts:53).
- Mobile viewer shows its own fallback and a row-cap note (FileViewerScreen.tsx:176-211; TabularGridView.tsx:379-392).
- CLI prints a stop note when truncated (apps/cli/src/lib.rs:7329-7334).
- Project modal fallback and failure messages (FilePreviewModal.tsx:113-117, 437-447).

**Incomplete**

- The shared viewer cannot tell 'no preview for this type', 'too large', 'could not be read' and 'network failed' apart; all show the same card (FileTextPreview.tsx:36).
- Partial reads inside a single sheet or document (a page or a sheet that failed) are not detected; the length cut and the extra-sheet case are the only signals [inferred from file-text-preview.ts and office-document-text.ts:715-744; the document extractor path was not opened].
- The note for a multi-sheet workbook says 'start of this file', which does not say only the first sheet is shown [inferred from FileTextPreview.tsx:91-95].

**Present but disconnected or switched off**

- Tauri DesktopLibrary preview dialog: transport.openPreview is declared in the shared view (LibraryView.tsx:267) but no call to it exists in packages/ui/unified-chat/src or apps/web; the dialog's 'Preview unavailable' and truncation text are therefore not reached from the shared Library (grep of openPreview). Tauri is retained internal code (doc: AGENTS.md section 5).
- Tauri Library transport has no textPreviewUri or inlinePreviewUri, so there its viewer shows the fallback for text and images (DesktopLibrary.tsx:157-207; LibraryView.tsx:1166-1176).

**Not available**

- VS Code: no unsupported-file or partial note (artifacts open as read-only text, artifactActions.ts:104-136).
- Chrome: nothing.
- Partial note on mobile for a long text file: none found in TextFileView.tsx (grep for truncat, MAX, cut returned nothing).

## 4. Required behaviour

**Established requirements**

- When a file cannot be previewed the product says so and offers download or open (S25.30). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.30)
- When only part of a file could be extracted the product warns the user (S25.31). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.31)
- No silent failures or placeholder behaviour. (source: doc: AGENTS.md section 9)
- Failed generated content produces a repairable error, not a blank result. (source: doc: docs/product/experience-contract.md:782)

**Acceptance criteria**

1. Opening a file with no inline preview shows the fallback sentence and a working download button.
2. A text longer than the limit shows 'Showing the start of this file. Download it to see all of it.'
3. A CSV of more than 500 rows shows 500 rows and the note.
4. A workbook with two filled sheets shows the first sheet and the note.
5. A file the server says has no text preview, and a text request that fails, both leave the person a way to download.
6. CLI 'agi library show' on a cut file ends with the stop note naming the download command.
7. The fallback card is readable by a screen reader (text, button with a name).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The fallback should say why (type, size, unreadable) [inferred from the three server messages that never reach the shared viewer].
- A partial note should name what was left out (other sheets, later pages) [inferred from S25.31].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass the server's reason through useFileTextPreview and show it in the card.
- [proposed] Detect pages or sheets that failed to extract and list them.
- [proposed] Add a cut note to the mobile text viewer and an unsupported card to the VS Code artifact view.
- [proposed] Remove or reconnect the Tauri preview dialog.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay fallback | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Fallback card and Download to view (lines 1308-1324); decides the preview type (1166-1176). |
| hook | useFileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Loads and validates the text preview; any failure becomes 'failed' (lines 16-39). |
| component | FileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Renders text or table and the cut note (lines 44-97). |
| schema | FileTextPreviewSchema | `packages/contracts/cloud-contracts/src/library.ts` | kind, text, truncated, fileName (lines 133-139). |
| endpoint | GET /api/files/[id]/text | `apps/web/app/api/files/[id]/text/route.ts` | Text preview, errors, 30 MB source cap (lines 17, 36-52). |
| service | file-text-preview | `apps/web/lib/server/file-text-preview.ts` | Which types have a preview, the character cut, the unreadable error (lines 26-71). |
| service | office-document-text | `apps/web/lib/server/office-document-text.ts` | Reads documents and the first spreadsheet sheet; complete flag (lines 715-744). |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Sets previewable per item (lines 51-58, 78). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | PDF too-large preview message (lines 51, 118-122). |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Project fallbacks and failure text (lines 113-117, 191-205, 437-447). |
| config | MAX_FILE_TEXT_CHARS | `packages/contracts/types/src/file-reference.ts` | Character limit taken from the attachment policy (line 32). |
| config | SPREADSHEET_ROW_CAP | `packages/ui/unified-chat/src/lib/tabular.ts` | 500-row cap shared with mobile (line 78). |
| component | FileViewerScreen | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Mobile unsupported card (lines 176-211). |
| component | TabularGridView | `apps/mobile/src/features/chat/components/artifact-viewers/TabularGridView.tsx` | Row-cap note (lines 379-392). |
| service | artifactViewerKind | `apps/mobile/src/features/chat/components/artifact-viewers/viewerKind.ts` | Decides which mobile viewer, or none (lines 40-60). |
| hook | useLocalFileCopy | `apps/mobile/src/features/chat/components/artifact-viewers/useLocalFileCopy.ts` | 'This file could not be opened. Check your connection.' and 413 too-large handling (lines 12-19). |
| command | agi library show | `apps/cli/src/lib.rs` | Prints text and the stop note (lines 7318-7335). |
| service | CLI library text | `apps/cli/src/cloud/library.rs` | TextPreview with truncated flag (lines 33-37, 99-101). |
| screen | DesktopLibrary preview dialog (Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Separate preview, 500,000 character cut and 'Preview unavailable' (lines 21, 59-80, 232-246); not called by the shared Library. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Library list marks each item previewable if it is an image, video, PDF, has a text-preview kind or metadata says so. | our servers | apps/web/app/api/library/route.ts:51-58 |
| Viewer opens only previewable items; for non-image, non-video, non-PDF items it requests {uri}/text. | device and our servers | LibraryView.tsx:810, 1174-1176; apps/web/features/library/components/LibraryView.tsx:159 |
| Server loads the asset, picks the kind, refuses unknown types (404) and oversize (validation), reads the stored bytes, extracts text, cuts at the character limit and returns truncated. | our servers | apps/web/app/api/files/[id]/text/route.ts:36-62; apps/web/lib/server/file-text-preview.ts:42-71 |
| Viewer validates the response with the shared schema; a bad shape or any HTTP error becomes 'failed' and the fallback card shows. | device | FileTextPreview.tsx:25-37 |
| Viewer renders text or the first 500 rows of a table and the note if truncated or rows were dropped. | device | FileTextPreview.tsx:48-52, 91-95 |
| CLI fetches the same text route and prints it, then the stop note if truncated. | device and our servers | apps/cli/src/cloud/library.rs:99-101; apps/cli/src/lib.rs:7318-7335 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Text preview response | Not stored; returned with Cache-Control private, no-store | No | Held only in page state while the viewer is open (apps/web/app/api/files/[id]/text/route.ts:62-65) |
| Stored file bytes | Private object storage via readStoredMedia | Server side | Per the file's own lifecycle |

**Models and providers.** No model or provider: extraction is server code, not an AI call. The text is read with document parsers, not a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the route resolves the user's scoped database and workspace (apps/web/app/api/files/[id]/text/route.ts:27-33). |
| Permissions | Only the owner or an admitted workspace member sees the file; others get 404 (route.ts:34-35). |
| Subscription | none found in the code for the preview; the text route does not call the download allowance (whole file read). |
| Limits and metering | Rate limit files-serve 120 per minute (apps/web/lib/rate-limit.ts:349). Source cap 30 MB (route.ts:17). Character cut from the attachment policy (packages/contracts/types/src/file-reference.ts:32). Row display cap 500 (tabular.ts:78). |
| Feature flags | none found in the code. |
| Model compatibility | none; no model is used. |
| Provider restrictions | none found in the code. |
| Local mode | The Library preview needs the cloud account (CLI refuses outside managed mode, apps/cli/src/cloud/client.rs:362-370; public Desktop is cloud-only, doc: docs/architecture/byok-provider-strategy.md:16). Mobile opens on-device files in place without fetching (FileViewerScreen.test.tsx:191) and applies the same viewers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Spinner in the viewer. | LibraryView.tsx:1301-1302 |
| unsupported type | Fallback card with Download to view. | LibraryView.tsx:1308-1324 |
| file gone (404 or 410) on download | Row is marked unavailable. | LibraryView.tsx:577-580 |
| text too large (over 30 MB) | Server 'This file is too large to preview'; viewer shows the generic fallback. | route.ts:38-40; FileTextPreview.tsx:36 |
| document unreadable | Server 'This document could not be read'; viewer shows the generic fallback. | file-text-preview.ts:57-59 |
| project modal text fetch fails | 'Failed to load file contents.' | FilePreviewModal.tsx:113-117, 195-200 |
| mobile file too large for the device (413) | Not retried; the same answer is expected. | useLocalFileCopy.ts:16-19 |
| retry | Viewer has no retry button for a failed text preview; closing and reopening reloads. The Tauri dialog has Retry but is not reached. | FileTextPreview.tsx:16-39; DesktopLibrary.tsx:285-296 |
| offline / timeout | Treated as failed; no distinct message. | FileTextPreview.tsx:36 |
| accessibility | Viewer is a modal dialog with a label naming the file and closes on Escape; fallback text is plain text. | LibraryView.tsx:1183-1195, 1179-1186 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/files/[id]/text/__tests__/route.test.ts`: Not found for unknown type (178), too large (187), unknown length overflow (222), renders text (256), renders csv as table (281).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Opens a non-artifact row in the in-app viewer (1177); no test naming the fallback card or the cut note was found.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx`: Row cap and its note (around lines 203-213).
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/FileViewerScreen.test.tsx`: Text file, small file size unit, XLSX tabs, CSV grid, share, close (lines 95-209); a test of the unsupported card was not found by name.
- `apps/web/lib/server/office-document-text.test.ts`: Office text extraction (file exists; case names not read).
- `apps/web/features/projects/components/__tests__/FilePreviewModal.pptx.test.tsx`: A pptx source previews as slides (line 35).
- `apps/cli/src/cloud/library.rs`: Unit tests for list query and page render only (lines 168-210); none for the show stop note.

**Test scenarios**

- **Unsupported type**
  1. Upload a .zip.
  2. Open it in the web Library.
  - Expected: Is the item previewable? If opened, the card reads 'Preview isn't available for this file inline.' with 'Download to view' that saves the file.
- **Long text**
  1. Upload a text file larger than the character limit.
  2. Open it.
  - Expected: Start of the text and 'Showing the start of this file. Download it to see all of it.'
- **Big CSV**
  1. Upload a CSV of 600 rows.
  2. Open it.
  - Expected: 500 rows and the note.
- **Two-sheet workbook**
  1. Upload an xlsx with two filled sheets.
  2. Open it.
  - Expected: First sheet as a table and the note.
- **Server refusal**
  1. Block the text route (DevTools) or use a corrupt docx.
  - Expected: Generic fallback card in the shared viewer; 'Failed to load file contents.' in the project modal.
- **CLI cut**
  1. Run agi library show <id> on a long file.
  - Expected: Text then the stop note naming agi library download <id>.

**Where to look when it fails**

- Server messages in the text route response body: 'This file has no text preview', 'This file is too large to preview', 'This document could not be read'.
- Network tab: GET /api/files/{id}/text status and body.
- useFileTextPreview swallows the error text (FileTextPreview.tsx:36), so only the network tab shows the reason.
- Mobile: FILE_UNAVAILABLE_MESSAGE in useLocalFileCopy.ts:12.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)
- CLI: [70-qa/test-plans/cli/025-file-previews-and-readers.md](../../70-qa/test-plans/cli/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **Shared viewer hides why a preview failed** Affects: Web, Desktop. Evidence: FileTextPreview.tsx:36 maps every error to 'failed'. Work needed: Carry the reason into the card.
- **No detection of partly read pages or sheets beyond the length cut and extra sheets** Affects: Web, Desktop, CLI. Evidence: file-text-preview.ts:53-71; office-document-text.ts:715-744; brief S25.31 all missing. Work needed: Report per-sheet and per-page extraction results and warn.
- **Multi-sheet note does not say only the first sheet is shown** Affects: Web, Desktop. Evidence: FileTextPreview.tsx:91-95; office-document-text.ts:728. Work needed: Reword for spreadsheets.
- **No cut note on mobile text, no note or fallback on VS Code, none on Chrome** Affects: Mobile text, VS Code, Chrome. Evidence: TextFileView.tsx has no cap or note; brief S25.30 and S25.31. Work needed: Add or declare out of scope.
- **Brief is out of date: it lists web and desktop partial-warning as missing, but the shared viewer and CLI have one; mobile spreadsheet exists** Affects: Documentation. Evidence: FileTextPreview.tsx:91-95; apps/cli/src/lib.rs:7329-7334; FileViewerScreen.test.tsx:116. Work needed: Update the brief and surface matrix.
- **Dead Tauri preview dialog** Affects: Tauri build. Evidence: openPreview never called. Work needed: Reconnect or delete (AGENTS.md section 9).
- **No retry on a failed shared-viewer preview** Affects: Web, Desktop. Evidence: FileTextPreview.tsx:16-39. Work needed: Add a Retry button.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- api:GET /api/files/{id}/text
- api:GET /api/library
- F025-07

## Unknown

- Which file types the library marks previewable but the viewer cannot show (for example a zip with metadata previewable).
- Whether the document extractor (docx and pdf) reports pages that failed; only the spreadsheet path was read.
- The value of the character limit (attachment policy was not opened).
- Whether the Electron Desktop shows exactly the web viewer (stated by doc: AGENTS.md section 5, not run).
- Case names inside office-document-text.test.ts.
- Whether mobile TextFileView limits very long text.
