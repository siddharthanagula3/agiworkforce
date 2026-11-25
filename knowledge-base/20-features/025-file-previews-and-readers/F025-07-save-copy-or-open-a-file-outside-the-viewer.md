---
id: "F025-07"
type: "feature"
title: "Save, copy or open a file outside the viewer"
aliases: ["Download", "Download original", "Download as text", "Download the text of <file>", "Download to view", "Copy artifact content", "Share (mobile open in another app)", "agi library download", "S25.26", "S25.27", "S25.28", "S25.29"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S25.26", "S25.27", "S25.28", "S25.29"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "api:GET /api/files/{id}", "api:GET /api/files/{id}/text", "api:GET /api/library", "F025-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-07 Save, copy or open a file outside the viewer

Gets a file or its text out of AGI Workforce. Web and the public Desktop (which shows the web app) can download the original and a text copy from the Library viewer. The CLI saves the original. Mobile opens the phone share sheet. VS Code copies or saves an artifact. No app has a copy button or opens the file in its native app on web, Desktop or Chrome.

Area: [25. File previews and readers](README.md). Requirement items: [S25.26](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2526), [S25.27](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2527), [S25.28](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2528), [S25.29](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2529).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 3) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person take a stored file out of the product: save the original bytes, save a plain-text copy of what the reader extracted, copy artifact content, or hand the file to another app. It covers the Library viewer and project preview modal on web, the Library on mobile, the library commands in the CLI and the artifact commands in VS Code.

**Why it exists.** A preview is not the file. People need the real file to edit it in the right program, send it on, or keep it. The experience contract says downloaded bytes must open in the expected application and match the stored artifact (doc: docs/product/experience-contract.md:784).

**Who uses it.** Anyone with files in their Library or project sources: office workers with documents and spreadsheets, developers with generated code artifacts, mobile users who want to send a file elsewhere.

**Problems it solves**

- A file the viewer cannot show can still be saved and opened elsewhere.
- A long document can be kept as plain text without the original format.
- A phone user can send a generated file into any app that accepts it.
- A developer can put a generated artifact into the workspace or the clipboard.

**Use cases**

- Open a PDF in the web Library and click the download icon to save it.
- Open a Word file, wait for its text, click 'Download as text' to save a .txt copy.
- On the phone, long-press a Library file and choose Share to send it to another app.
- In a terminal, run agi library download <id> to save a generated file into the current folder.

## 2. User experience

**Where to find it**

- Web and public Desktop (hosted web app): Library page, open a file, the viewer header has an icon button labelled 'Download <file name>' and, for converted text, a button titled 'Download as text' with label 'Download the text of <file name>' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1254-1275). The Library row menu also downloads (LibraryView.tsx:559).
- Web project sources: the project file preview modal has a 'Download' button (apps/web/features/projects/components/FilePreviewModal.tsx:353-365).
- Mobile: Library row action menu entry 'Share' (apps/mobile/src/features/library/index.tsx:644) and the 'Share <file name>' button in the file viewer header (apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx:163-176).
- CLI: agi library download <id> [--out <dir>] (apps/cli/src/lib.rs:1252-1259).
- VS Code: commands 'Code: Copy Artifact Content', 'Code: Save Artifact into Workspace', 'Code: Open Artifact', 'Code: Open Published Artifact' (apps/extension-vscode/package.json:704-720).
- Tauri desktop build (retained internal code): the shared Library with row-menu download only; the viewer has no text copy (apps/desktop/src/features/library/DesktopLibrary.tsx:157-207).
- Chrome extension: not available (no file download feature found; brief lists missing).

**Before you start**

- A signed-in account on every app that lists files: web shows 'Sign in to see your library' when signed out (apps/web/features/library/components/LibraryView.tsx:93-110); the CLI needs Cloud mode (apps/cli/src/cloud/client.rs:362-370); mobile gates on a cloud account scope (apps/mobile/src/features/library/index.tsx:446).
- The file must be listed in the Library; the viewer opens only files the server marks previewable (LibraryView.tsx:810).

**Screens and controls**

- Viewer header: Zoom group (images only), 'Download as text' icon (non-text files after the text preview loaded), 'Download <file>' icon, 'Close file viewer' (LibraryView.tsx:1197-1300).
- Fallback card button 'Download to view' (LibraryView.tsx:1322).
- Row-level download error text under the row (LibraryView.tsx:589).
- Meter line '<used> of <limit> file downloads used this month' (LibraryView.tsx:955-960).
- Mobile file viewer: 'Share' icon and a 'Share' button on the unsupported card (FileViewerScreen.tsx:163-211).
- CLI output line 'Saved <path>' (apps/cli/src/lib.rs:7336-7344).

**Journey**

1. Open the Library (web: /chat/library).
2. Click a file card to open the viewer, or use the row menu Download.
3. In the viewer, click the download icon. The file is saved through the browser (large uploads go through the browser's own download; others are fetched then saved as a blob) (LibraryView.tsx:559-592).
4. Optionally, when the text preview has loaded for a non-text file, click 'Download as text'; a name.txt file is saved (LibraryView.tsx:1130-1140).
5. If the download fails or the monthly allowance is short, read the message under the row.

**What the person sees and gets**

- A browser download of the original file name (LibraryView.tsx:584).
- A .txt file named from the file name without extension (LibraryView.tsx:1131-1135).
- Row error 'That file could not be downloaded.' or the server message (LibraryView.tsx:589).
- 'This file is larger than the file downloads left this month.' when a large upload exceeds the meter (LibraryView.tsx:312).
- Project modal: toast "Couldn't download this file. Try again." (FilePreviewModal.tsx:271-273).
- Mobile: alert 'Could not open this file' (library/index.tsx:454-457).
- VS Code: information message 'copied "<title>"' (artifactActions.ts:138-160).

**Settings**

- No user setting found for downloads. The monthly download allowance comes from the plan (apps/web/lib/services/tier-unit-quota-service.ts:485-513).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web shared viewer downloads the original through transport.downloadInBrowser or fetchAsset and a blob (LibraryView.tsx:559-592; apps/web/features/library/components/LibraryView.tsx:157).
- Web shared viewer 'Download as text' builds a text/plain Blob and saves name.txt (LibraryView.tsx:1130-1140, 1254-1264).
- Web project modal downloads the original by fetching the storage URI to a blob (FilePreviewModal.tsx:259-276, 353-365).
- CLI downloads the original with a file-name from Content-Disposition, refusing to overwrite an existing file and removing a partial file on failure (apps/cli/src/cloud/client.rs:999-1015, 1058-1084; apps/cli/src/cloud/library.rs:103-109).
- Mobile downloads a Library file to the device and opens the system share sheet (apps/mobile/src/features/library/index.tsx:445-458; apps/mobile/services/fileCreation.ts:348-374, 500-502).
- VS Code copies an artifact to the clipboard, saves it into the workspace and opens it read-only (apps/extension-vscode/src/features/artifacts/artifactActions.ts:104-208).

**Incomplete**

- Copy on web and Desktop relies on normal browser text selection; the text preview is a plain block (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:75-79) and no copy button exists. Not verified in a browser.
- 'Download as text' saves the preview text, which is cut at the server length limit, with no warning in the saved file [inferred from LibraryView.tsx:1259 and FileTextPreview.tsx:50-52].
- Mobile has no converted-text download; the brief lists it missing and no code was found.
- VS Code copy takes the whole artifact, not a selection (artifactActions.ts:138-160).

**Present but disconnected or switched off**

- mobile exportSourceFile and exportToText exist in apps/mobile/services/fileCreation.ts:229-267 but are not referenced from the Library screen (grep of apps/mobile/src/features/library/index.tsx found only downloadGeneratedFile and shareFile).
- Tauri DesktopLibrary passes no textPreviewUri, so its viewer never loads text and never shows 'Download as text' (DesktopLibrary.tsx:157-207; LibraryView.tsx:667-670). Tauri is retained internal code, not the public Desktop (doc: AGENTS.md section 5).

**Not available**

- Open in the native application: web, Desktop and Chrome have no such control (none found). The brief cites apps/cli/src/lib.rs:2349 for the CLI, but that line is marketplace subcommand code (apps/cli/src/lib.rs:2340-2355), so CLI open-in-app is not established.
- Chrome extension: no download or copy of Library files found.

## 4. Required behaviour

**Established requirements**

- Users can download the original file (S25.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.26)
- Users can download a converted representation such as PDF or text (S25.27). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.27)
- Users can copy selected content from a preview (S25.28). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.28)
- Users can open a file in its native application (S25.29). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.29)
- Downloaded bytes open in the expected application and match the stored artifact; delete and restore are reflected in download authorization. (source: doc: docs/product/experience-contract.md:784)
- Tenant and ownership checks apply on every download. (source: doc: docs/product/experience-contract.md:527)

**Acceptance criteria**

1. On web, opening a PDF in the Library viewer and clicking 'Download <file>' saves a file whose bytes equal the original.
2. For a Word file whose text loaded, 'Download as text' appears and saves a .txt; for a file whose type starts with text/ the button is absent.
3. With the monthly download meter exhausted, downloading a large upload shows the 'larger than the file downloads left' message and starts no download.
4. agi library download <id> saves into the chosen directory, prints 'Saved <path>', and refuses to overwrite an existing file.
5. On mobile, Share on a Library file opens the system share sheet with the file under its own name.
6. In VS Code, 'Copy Artifact Content' puts the artifact text on the clipboard and shows a confirmation.
7. Signed out, no app lists or downloads library files.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A saved text copy of a cut preview should say it is cut [inferred].
- Copy should work from every preview, including the table [inferred from S25.28 Should].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Copy' button to the shared viewer for text and table previews.
- [proposed] Add an 'Open in default app' action on the Electron Desktop through a host command.
- [proposed] Add a 'Download as text' path on mobile using the existing text export helper.
- [proposed] Mark a saved text copy when the source was cut.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Viewer with download, download-as-text and fallback button (lines 1157-1340). |
| hook | handleDownload | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Original download: allowance check, browser hand-off or fetch to blob (lines 559-592). |
| service | downloadText | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Saves text as name.txt (line 1130). |
| other | LibraryTransport interface | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Host contract: fetchAsset, downloadInBrowser, textPreviewUri (lines 250-300). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Supplies the web transport including downloadInBrowser and textPreviewUri (lines 150-160). |
| service | downloadInWindow | `apps/web/features/desktop-host/lib/in-window-download.ts` | Saves a served file from inside the desktop window with the window's session. |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Project file modal with its own Download button (lines 259-276, 353-365). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Serves the original bytes or a presigned redirect; checks the download allowance (lines 173, 274, 328). |
| endpoint | GET /api/files/[id]/text | `apps/web/app/api/files/[id]/text/route.ts` | Returns the text preview that 'Download as text' saves. |
| service | assertDownloadAllowance | `apps/web/lib/services/tier-unit-quota-service.ts` | Refuses downloads over the plan's monthly (and Free daily) allowance (lines 485-513). |
| config | files-serve rate limit | `apps/web/lib/rate-limit.ts` | 120 requests per minute for file serving (line 349). |
| service | CLI library module | `apps/cli/src/cloud/library.rs` | list, text and download calls (lines 95-109). |
| service | CloudClient.download_into | `apps/cli/src/cloud/client.rs` | Streams the file to disk, safe file name, removes partial file (lines 999-1084). |
| command | agi library download | `apps/cli/src/lib.rs` | Subcommand and handler (lines 1252-1259, 7336-7344). |
| screen | LibraryScreen share | `apps/mobile/src/features/library/index.tsx` | handleShareAsset downloads then shares (lines 445-458, 644). |
| service | shareFile / downloadGeneratedFile | `apps/mobile/services/fileCreation.ts` | Writes the file on the device and opens the share sheet (lines 348-374, 500-502). |
| component | FileViewerScreen | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Mobile viewer Share button and unsupported-card Share (lines 42-52, 163-211). |
| service | artifactActions | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | openArtifactReadOnly, copyArtifactContent, saveArtifactToWorkspace (lines 104-208). |
| config | VS Code artifact commands | `apps/extension-vscode/package.json` | Command titles and menus (lines 699-720, 1194-1206). |
| screen | DesktopLibrary (Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri transport: download by authenticated fetch only (lines 157-207). |
| schema | FileTextPreviewSchema | `packages/contracts/cloud-contracts/src/library.ts` | Shape of the text that is saved (lines 133-139). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks Download in the web viewer. If the file is a large upload and the host offers downloadInBrowser, the meter is checked and the browser downloads from the server directly. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:561-570 |
| Otherwise the viewer fetches the asset with the session cookie, turns it into a blob and saves it under the original name. | device and our servers | LibraryView.tsx:573-587; apps/web/features/library/components/LibraryView.tsx:156 |
| The file route checks the plan's download allowance (when the file spends it), then streams bytes or redirects to private storage, and records egress bytes. | our servers | apps/web/app/api/files/[id]/route.ts:173-186, 274, 328-342 |
| 'Download as text' reuses the already loaded text preview and saves it locally; no new request is made. | device | LibraryView.tsx:1254-1264 |
| Mobile downloads the file with the account token only when the URL is the API's own origin, writes it into the device export folder, and opens the share sheet. | device and our servers | apps/mobile/services/fileCreation.ts:441-461, 500-502, 348-374 |
| CLI calls GET /api/files/{id} with the account token and writes the response to disk. | device and our servers | apps/cli/src/cloud/library.rs:103-109; apps/cli/src/cloud/client.rs:1017-1038 |
| VS Code re-derives artifact content from the source chat message fetched from the cloud, then copies or saves it locally. | device and our servers | apps/extension-vscode/src/features/artifacts/artifactActions.ts:57-68, 138-160 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Downloaded original file | Device downloads folder (browser), mobile export folder, or the CLI target directory | No; the device copy is not synced | Kept until the person deletes it; mobile exports can be cleaned by removeStaleExports (apps/mobile/services/fileCreation.ts:43) |
| Text copy (.txt) | Browser downloads folder | No | Kept by the person |
| Download usage (bytes) | Server usage accounting, read by readDownloadUsage; table name not confirmed | Server side | Monthly window that resets (tier-unit-quota-service.ts:505-512) |

**Models and providers.** No model or provider takes part. Download and copy are file operations; Local, own-key and Cloud differ only in whether the account's cloud Library can be reached.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on web, Desktop, mobile, CLI and VS Code artifacts. Web signed out shows a sign-in card (apps/web/features/library/components/LibraryView.tsx:93-110). |
| Permissions | Server checks ownership and workspace on the file (apps/web/app/api/files/[id]/route.ts). Rate limit files-serve: 120 per minute (apps/web/lib/rate-limit.ts:349). No client permission prompt for saving found. |
| Subscription | Download allowance depends on the plan: monthly bytes for paid plans and an extra daily allowance on Free (apps/web/lib/services/tier-unit-quota-service.ts:481-513). Generated media the caller owns with an AI-provenance claim does not spend it (tier-unit-quota-service.ts:472-479). Plan names and byte limits: unknown here. |
| Limits and metering | Monthly downloaded bytes are shown as 'x of y file downloads used this month' (LibraryView.tsx:955-960) and metered on the server. Text preview does not call assertDownloadAllowance (apps/web/app/api/files/[id]/text/route.ts, whole file read). |
| Feature flags | none found in the code for downloads. |
| Model compatibility | none; no model is involved. |
| Provider restrictions | none found in the code; files come from AGI object storage, not a model provider. |
| Local mode | The Library is a Cloud feature: the CLI refuses it outside managed mode with 'nothing is sent to your AGI cloud account in this mode' (apps/cli/src/cloud/client.rs:49-54, 362-370); public Desktop chat is managed-cloud-only (doc: docs/architecture/byok-provider-strategy.md:16). Files already on the device are not handled by this feature; for mobile on-device files the viewer reads them in place (FileViewerScreen.test.tsx:191). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| download fails (network or HTTP error) | Row error shown with 'That file could not be downloaded.' or a mapped message; 404 or 410 marks the row unavailable. | LibraryView.tsx:577-590 |
| project modal download fails | Toast and the person can click again; a retry is tested. | FilePreviewModal.tsx:271-273; apps/web/features/projects/components/__tests__/FilePreviewModal.download.test.tsx:61 |
| monthly allowance used up | Large upload blocked client-side; server refuses with a plan message and reset date. | LibraryView.tsx:563-567; tier-unit-quota-service.ts:505-513 |
| download allowance service unavailable | 'Downloads are temporarily unavailable. Try again shortly.' | tier-unit-quota-service.ts:500-504 |
| CLI target file already exists | Not overwritten; write fails with a local file error. | apps/cli/src/cloud/client.rs:1074-1079 |
| CLI download stalls | Request timeout of one hour. | apps/cli/src/cloud/client.rs:18 |
| CLI session expired (401) | 'your AGI session expired, sign in again with agi login'. | client.rs:1026-1029, 45-47 |
| mobile sharing unavailable | Error 'Sharing is not available on this device'. | apps/mobile/services/fileCreation.ts:355-360 |
| VS Code artifact no longer produced by its message | Warning 'there is nothing to copy' and no clipboard change. | artifactActions.ts:149-154 |
| offline / reconnect / cancel | not handled in the code beyond the error paths above; no cancel for a web download found. | searched LibraryView.tsx handleDownload |
| accessibility | Download buttons carry aria-labels naming the file; viewer is a modal dialog closed with Escape. | LibraryView.tsx:1183-1195, 1255-1257, 1265-1267 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Row-menu download through the host fetch (line 612), failed download copy (623), browser hand-off for large files (650), host fetch fallback (679), allowance used up (710), hand-off when allowance covers (735), Restore instead of Download in Recently deleted (802), viewer breadcrumb with download and close (1324). Names only; no result claimed.
- `apps/web/features/projects/components/__tests__/FilePreviewModal.download.test.tsx`: Network failure then a successful retry of the modal download.
- `apps/web/app/api/files/[id]/text/__tests__/route.test.ts`: Text route responses: not found, too large, renders text, renders csv as table (names at lines 156-281).
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/FileViewerScreen.test.tsx`: 'shares the file under its own name' (line 172).
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Re-deriving artifact content from the source message and missing-source reports (lines 190-248).
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Tauri Library transport, bearer on preview fetch, account switch.

**Test scenarios**

- **Download original on web**
  1. Sign in on web, open /chat/library.
  2. Open a PDF, click 'Download <file>'.
  3. Compare the saved file's checksum to the original.
  - Expected: Saved file has the original name and identical bytes.
- **Download as text**
  1. Upload a .docx.
  2. Open it in the viewer and wait for the text.
  3. Click 'Download as text'.
  - Expected: A name.txt file with the extracted text; button absent for a .txt upload.
- **Allowance exhausted**
  1. Use an account whose monthly download meter is full.
  2. Download a large uploaded file.
  - Expected: Message about downloads left this month; no file saved.
- **CLI download**
  1. Run agi library to get an id.
  2. Run agi library download <id> --out <dir> twice.
  - Expected: First run prints 'Saved <path>'; second run fails without overwriting.
- **Mobile share**
  1. Open the Library, long-press a file, choose Share.
  - Expected: Share sheet opens with the file under its own name.
- **VS Code copy**
  1. Open the Artifacts view, run 'Code: Copy Artifact Content'.
  - Expected: Clipboard holds the artifact; information message appears.

**Where to look when it fails**

- Server errors: PlanDownloadLimitError and the freeDailyLimitError message from apps/web/lib/services/tier-unit-quota-service.ts.
- HTTP 413 PAYLOAD_TOO_LARGE 'File exceeds the inline serving limit' from apps/web/app/api/files/[id]/route.ts:111-115.
- CLI CloudError::Api / SessionExpired / LocalFile text.
- Mobile FileDownloadError status mapping in apps/mobile/services/fileCreation.ts:429-437.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)
- CLI: [70-qa/test-plans/cli/025-file-previews-and-readers.md](../../70-qa/test-plans/cli/025-file-previews-and-readers.md)
- VS Code: [70-qa/test-plans/vscode/025-file-previews-and-readers.md](../../70-qa/test-plans/vscode/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **No copy control and no confirmed copy behaviour in the preview** Affects: Web, public Desktop, mobile. Evidence: FileTextPreview.tsx:75-79 shows a plain block; brief S25.28 unverified. Work needed: Verify selection copy in a browser; add a Copy button for text and table previews.
- **No open in native application** Affects: Web, Desktop (brief), Chrome, CLI. Evidence: brief S25.29; apps/cli/src/lib.rs:2349 is unrelated marketplace code. Work needed: Add an open-in-default-app host action on Electron; decide for web and CLI.
- **No converted-text download on mobile** Affects: Mobile. Evidence: brief S25.27 mobile missing; exportSourceFile not used by library/index.tsx. Work needed: Wire the text export to the viewer, or decide it is not needed.
- **Saved text copy of a cut preview is silently cut** Affects: Web, Desktop. Evidence: LibraryView.tsx:1259 uses preview.text, which is cut by file-text-preview.ts:66-70. Work needed: Warn in the file or the UI before saving.
- **Project modal download reads the whole file into memory and ignores the download meter hand-off** Affects: Web project sources. Evidence: FilePreviewModal.tsx:259-276. Work needed: Reuse the Library download path.
- **Tauri Library has no text copy and no browser hand-off** Affects: Tauri build only. Evidence: DesktopLibrary.tsx:157-207. Work needed: None unless Tauri is made public.
- **Chrome extension has nothing** Affects: Chrome. Evidence: brief S25.26-S25.29 Chrome missing. Work needed: Decide scope.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- api:GET /api/files/{id}
- api:GET /api/files/{id}/text
- api:GET /api/library
- F025-10

## Unknown

- Whether copying selected text from the preview works in each browser and in Electron (not verified).
- Name of the database table behind download usage accounting.
- What the Electron Desktop does with a downloaded file after saving (shell behaviour not read).
- Whether the Tauri viewer's PDF iframe loads without the bearer token.
- Whether any client calls mobile exportSourceFile for Library files outside the library screen.
