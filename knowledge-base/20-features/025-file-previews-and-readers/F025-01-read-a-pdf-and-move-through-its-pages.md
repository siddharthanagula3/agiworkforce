---
id: "F025-01"
type: "feature"
title: "Read a PDF and move through its pages"
aliases: ["PDF reader", "PDF preview", "library-pdf-reader", "S25.01 PDF reader", "S25.12 Page thumbnails", "S25.13 Page navigation", "S25.15 Fit-to-width", "S25.16 Fit-to-page", "S25.17 Rotate view", "Document view (mobile)"]
area: "25 File previews and readers"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S25.01", "S25.12", "S25.13", "S25.15", "S25.16", "S25.17"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/files/[id]", "table:media_assets"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F025-01 Read a PDF and move through its pages

Opens a PDF inside AGI Workforce so a person can read it without leaving the app. Web (and the public Electron Desktop, which shows the web app) frame the PDF in the browser. Mobile draws it with the system viewer on iOS and a bundled viewer on Android. Page thumbnails, page jump, fit and rotate are not built.

Area: [25. File previews and readers](README.md). Requirement items: [S25.01](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2501), [S25.12](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2512), [S25.13](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2513), [S25.15](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2515), [S25.16](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2516), [S25.17](../../10-requirements/capabilities/025-file-previews-and-readers.md#s2517).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows a stored PDF in an in-product reader. On web it is an iframe pointing at the file route with a PDF-only flag (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1171, 1306). In a project, the knowledge-file preview modal frames the file and can open at a given page (apps/web/features/projects/components/FilePreviewModal.tsx:410-416). On mobile the file is copied to the device and drawn by a viewer (apps/mobile/src/features/chat/components/artifact-viewers/DocumentFileView.tsx:173-206).

**Why it exists.** A person who generated or uploaded a PDF should read it where they work, and a citation should be able to open the PDF at the cited page. The brief asks for an in-product PDF reader (S25.01) with thumbnails, page navigation, fit and rotate (S25.12, S25.13, S25.15-S25.17) (doc: knowledge-base/data/area-briefs/025-file-previews-and-readers.md).

**Who uses it.** Signed-in people on web, Electron Desktop and mobile who keep PDFs in the Library or in a project's knowledge list.

**Problems it solves**

- Reading a PDF without downloading it and opening another app.
- Jumping to the page a citation points at (web project modal and mobile pass a page number; apps/web/features/projects/components/FilePreviewModal.tsx:412, apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx:104).
- Refusing to frame anything that is not a PDF, so a hostile file cannot be framed as a document (apps/web/app/api/files/[id]/route.ts:219-221).

**Use cases**

- Open a generated report PDF from the Library on web.
- Open a PDF source from a project's knowledge list and land on the cited page.
- Read a PDF on a phone from the Library or a project's Sources tab.
- See 'This PDF is too large to preview. Download it to open it.' for a very large chat upload.

## 2. User experience

**Where to find it**

- Web and Electron Desktop: the Library page (apps/web/app/chat/library/page.tsx:1-20) opens the file viewer when a tile is clicked, tile label 'Open <file name>' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1496-1498). Viewer dialog label '<file name> viewer'.
- Web project: a knowledge file row in the Sources/knowledge list opens a modal labelled 'Preview: <file name>' (apps/web/features/projects/components/FilePreviewModal.tsx:282, KnowledgeFilesPanel.tsx:447).
- Mobile: Library file card (apps/mobile/src/features/library/index.tsx:786-800) and the project Sources tab (apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:890) open a sheet via FileViewerScreen.
- Tauri desktop tree (retained, not the public Desktop): DesktopLibrary (apps/desktop/src/features/library/DesktopLibrary.tsx:181) has its own 'Library file preview' dialog, but the shared Library never calls it (see gaps).

**Before you start**

- Signed in to a Cloud account on web, Desktop and mobile (apps/web/app/api/files/[id]/route.ts:198; apps/mobile/src/features/library/index.tsx:461-463).
- The item must be marked previewable: a PDF always is (apps/web/app/api/library/route.ts:51-56).

**Screens and controls**

- Web Library viewer: header breadcrumb 'Library > <name>', buttons 'Download <name>' and 'Close file viewer', and an 'Ask about this file' box (LibraryView.tsx:1210-1275, 1349). No zoom group for a PDF (zoom shows only for an image, line 1221).
- Web project modal: header with file name, type and size, 'Download' and 'Close' buttons; the PDF fills a 70vh frame (FilePreviewModal.tsx:351-415).
- Mobile sheet: title, size and 'Page n' detail, 'Open chat' (when the file has a chat), 'Share <file>', Close; on Android a caption 'Page n of N' under the PDF (PdfFileView.tsx:197-233).

**Journey**

1. Open the Library or a project's knowledge list.
2. Tap or click the PDF.
3. Wait for the spinner or 'Opening <file>' indicator.
4. Read; scroll inside the frame (the browser or system draws the pages).
5. Close with Escape or the close button (web), or the Close control or swipe down (mobile).

**What the person sees and gets**

- Spinner while loading; the web Library frame has no spinner of its own, the browser shows its PDF frame [inferred].
- A too-large chat upload answers 'This PDF is too large to preview. Download it to open it.' (route.ts:51, 118-123).
- Mobile failures: 'Could not open this file' with Retry, or 'This file could not be shown here' with Retry and Share; a password PDF says 'It is protected by a password. Share it to open it in another app.' (DocumentFileView.tsx:114-171).

**Settings**

- None found in the code for PDF preview.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Library: PDF opens in an iframe at the file URL plus preview=pdf, title = file name (LibraryView.tsx:331-337, 1171-1173, 1306-1310). Server serves only PDF bytes for that flag and adds a CSP and X-Frame-Options SAMEORIGIN (apps/web/app/api/files/[id]/route.ts:219-221, 346-352).
- Web project modal frames the stored file and adds #page=N when a citation page is given (FilePreviewModal.tsx:410-416); SourcesPanel passes the page (SourcesPanel.tsx:844-846).
- Electron Desktop loads the hosted web app, so it gets the web viewer (apps/desktop/electron/main.ts:1065-1066; doc: docs/product/definition.md:452-454).
- Mobile iOS: PDF copied into cache and drawn by the system document view in a WebView with scripts off (DocumentFileView.tsx:185-206). Mobile Android: bundled pdf.js page in an isolated WebView, bytes sent in 256 KB chunks, 'Page n of N' caption, opens at a requested page, fails after 15 s of silence (PdfFileView.tsx:29-236; pdfViewerBridge.ts:1-2; apps/mobile/assets/pdfjs/pdf-viewer.json exists).

**Incomplete**

- No thumbnails, page-jump box, fit-to-width, fit-to-page or rotate control in any app; only open-at-page from a citation exists. The browser or system PDF frame may add its own controls; not verified.
- Mobile 'page' is passed on open only; the iOS WebView receives #page=N (DocumentFileView.tsx:19-21).

**Present but disconnected or switched off**

- DesktopLibrary (Tauri tree) passes no inlinePreviewUri or textPreviewUri to the shared Library and its own preview dialog hangs off openPreview, which LibraryView never calls (grep of packages/ui/unified-chat/src finds openPreview only in the transport interface, LibraryView.tsx:267). The desktop test asserts inlinePreviewUri is undefined (apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx:162-180). So a PDF clicked there frames the relative file URL with no bearer header [inferred].

**Not available**

- VS Code: no PDF reader found in apps/extension-vscode/src/features/artifacts (reads artifact text only).
- Chrome: side panel offers Open and Download buttons for answer files and an image viewer, no PDF reader found (apps/extension/src/features/side-panel/generatedFiles.ts:281-300).
- CLI: no PDF preview; 'agi library show' reads the text route, which has no PDF kind (apps/web/lib/server/file-text-preview.ts:28-38).

## 4. Required behaviour

**Established requirements**

- A PDF opens in an in-product reader. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.01)
- A document shows page thumbnails; users can navigate pages; viewers can fit to width, fit to page, and rotate. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S25.12, S25.13, S25.15, S25.16, S25.17)
- The viewer contract needs loading, error, unsupported and expired states, and a full-screen or native route on mobile. (source: doc: docs/product/experience-contract.md:507-518)
- Generated and uploaded files open from the Library and download bytes match the stored file. (source: doc: docs/product/experience-contract.md:784)

**Acceptance criteria**

1. Clicking a PDF in the web Library opens the viewer with a frame whose address contains preview=pdf and whose title is the file name.
2. The file route answers 404 'PDF preview not available' when preview=pdf is sent for a non-PDF.
3. A chat-uploaded PDF over the serve cap answers 413 with code preview_too_large and the message 'This PDF is too large to preview. Download it to open it.'
4. Opening a project source with a citation page opens the PDF at that page on web and mobile.
5. On mobile Android the caption reads 'Page n of N' once loaded; a password PDF shows the password message and a Share button.
6. Escape closes the web Library viewer.
7. [proposed] Thumbnails, a page box, fit and rotate exist on every app that shows PDFs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Thumbnails, page controls, fit and rotate are required by the brief but have no code today [inferred from the brief and code search].
- The PDF frame should work on desktop without exposing the account token in a URL [inferred from the egress rules in AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- Use one shared page-control strip (thumbnail rail, page box, fit width, fit page, rotate) in the shared Library viewer so web, Electron and any desktop host get it once.
- Give the web Library PDF frame a visible spinner like the project modal's and mobile's.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared viewer dialog; picks the PDF iframe branch via isPdfItem and pdfPreviewUri (lines 331-337, 1157-1176, 1300-1310). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Supplies the web transport: inlinePreviewUri and textPreviewUri, same-origin cookie fetch (lines 150-159). |
| screen | Library page | `apps/web/app/chat/library/page.tsx` | Mounts the Library inside the web shell. |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Serves bytes; preview=pdf check, size caps, previewTooLarge, CSP header, download allowance, egress record. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists items with previewable flag and uri /api/files/<id> (lines 51-78). |
| component | FilePreviewModal | `apps/web/features/projects/components/FilePreviewModal.tsx` | Project knowledge preview; PDF iframe with sandbox allow-same-origin and #page=N (lines 410-416). |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Passes the cited page into the modal (line 844-846). |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Row click opens the modal (lines 447, 553). |
| service | served-bytes headers | `apps/web/lib/security/served-bytes.ts` | Chooses inline vs download disposition so only inert types render in the browser. |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | assertDownloadAllowance and downloadSpendsAllowance (lines 472-517). |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Rows the file route reads (insert at line 75; read by getActiveWorkspaceMediaAssetById). |
| component | DesktopLibrary (Tauri tree) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Desktop transport with bearer fetch and its own preview dialog; preview path unreachable (lines 96-181, 283-296). |
| service | Electron window URL | `apps/desktop/electron/main.ts` | windowUrlFor loads the hosted web app (lines 1065-1067). |
| component | FileViewerScreen | `apps/mobile/src/features/chat/components/artifact-viewers/FileViewerScreen.tsx` | Mobile full sheet with title, Share, Open chat, Close; chooses viewer or unsupported panel (lines 77-219). |
| component | DocumentFileView | `apps/mobile/src/features/chat/components/artifact-viewers/DocumentFileView.tsx` | PDF/Office view: iOS system frame, Android PdfFileView, external fallback (lines 32-208). |
| component | PdfFileView | `apps/mobile/src/features/chat/components/artifact-viewers/PdfFileView.tsx` | Android bundled pdf.js WebView with chunked byte bridge and page caption. |
| service | pdfViewerBridge | `apps/mobile/src/features/chat/components/artifact-viewers/pdfViewerBridge.ts` | Message parsing, chunk size 256 KB, 15 s silence limit, navigation guard. |
| hook | useLocalFileCopy | `apps/mobile/src/features/chat/components/artifact-viewers/useLocalFileCopy.ts` | Downloads one cached copy per account and file, retry rules, 413 means no retry. |
| service | viewerFileCopy | `apps/mobile/services/fileCreation.ts` | Fetches bytes with the account token only for the API origin and stores them in the cache (lines 441-462, 518-558). |
| config | Bundled PDF viewer asset | `apps/mobile/assets/pdfjs/pdf-viewer.json` | HTML of the Android viewer; iOS build sets PDF_VIEWER_HTML to null (pdfViewerHtml.ts:1). |
| schema | viewerKind | `apps/mobile/src/features/chat/components/artifact-viewers/viewerKind.ts` | Maps type to viewer kind; PDF and Office go to 'document' (lines 45-53). |
| config | Document classes | `packages/contracts/types/src/file-model.ts` | Declares pdf as a class with the pdf extractor (documentClassFor, line 346). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web/Electron: person clicks the tile; the shared Library sets the viewer item when previewable is true. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:810 |
| The viewer builds the frame address (file URL plus preview=pdf) and the browser requests it with the session cookie. | device | LibraryView.tsx:1171-1173, 335-337; apps/web/features/library/components/LibraryView.tsx:156 |
| The server checks rate limit, user scope and workspace, rejects non-PDF for the flag, applies the 30 MB cap, checks the download allowance, reads the object from storage and returns bytes with a frame-restricting CSP. | our servers | apps/web/app/api/files/[id]/route.ts:194-228, 312-353 |
| Object bytes come from private media storage. | outside service | apps/web/app/api/files/[id]/route.ts:241-245, 312 (isMediaStorageConfigured, streamStoredMedia) |
| The browser's own PDF frame draws the pages. | device | LibraryView.tsx:1304-1310 (iframe, no custom renderer) |
| Mobile: the app downloads the bytes with the account token to a cache copy, then draws them (iOS system frame, Android bundled pdf.js). | device and our servers | apps/mobile/services/fileCreation.ts:441-462, 528-550; DocumentFileView.tsx:173-206 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| PDF bytes | Cloud media storage (row in table media_assets); web browser memory while framed; mobile cache directory file-views/accounts/<owner>/<id> | Cloud copy is the source; mobile copy is a device cache | Mobile copies are removed by Clear cache and sign-out (apps/mobile/services/fileCreation.ts:526-527, 555-558); web nothing is stored by the viewer. |
| Analytics event library_item_opened (kind only) | Product analytics | Sent to our servers' analytics | unknown |
| Egress bytes and monthly download usage | Usage accounting (recordEgressBytes, assertDownloadAllowance) | Server side | Resets monthly per the limit message (tier-unit-quota-service.ts:508-516) |

**Models and providers.** No model or provider takes part in showing a PDF. The 'Ask about this file' box starts a new chat seeded with the question and the file (apps/web/features/library/components/LibraryView.tsx:209-214); that chat follows the normal model routing (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. File route resolves the caller and workspace before reading (apps/web/app/api/files/[id]/route.ts:198-208). Mobile PDF open captures a Cloud account scope (apps/mobile/src/features/library/index.tsx:461-463). |
| Permissions | Workspace-scoped read of the media asset; unauthorised ids answer 404 (route.test.ts:145). Mobile fetch sends the token only to the API origin (fileCreation.ts:450-453). |
| Subscription | Each PDF byte served counts against the plan's monthly download allowance, and on Free also a daily cap, unless the file is the owner's own generated media (tier-unit-quota-service.ts:472-517; route.ts:246, 328). Limit sizes are in the plan catalog; not read here. |
| Limits and metering | 30 MB inline serve cap (route.ts:45) and rate limit 'files-serve' (route.ts:195). Egress bytes recorded (route.ts:330-336). The project modal's own knowledge-file route: whether it spends the allowance is unknown. |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | Not provider dependent. |
| Local mode | The Library lists Cloud files only. Desktop shows 'Sign in to see your Library' when there is no Cloud session (DesktopLibrary.tsx:318-330). Mobile opens a file under a Cloud scope; an on-device file:// source is read in place without fetching (useLocalFileCopy.ts:44, FileViewerScreen.test.tsx:191), but which screens pass one is unknown. The bundled Android viewer needs no network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile shows a spinner 'Opening <file>'; web project modal has no PDF spinner; web Library frame relies on the browser. | PdfFileView.tsx:203-219; DocumentFileView.tsx:102-112 |
| Not a PDF with preview=pdf | 404 'PDF preview not available'. | apps/web/app/api/files/[id]/route.ts:219-222 |
| Too large | Chat upload over cap: 413 preview_too_large; any other file over 30 MB: 413 PAYLOAD_TOO_LARGE. Mobile 413 shows too-large with no Retry. | route.ts:111-123, 226-238; useLocalFileCopy.ts:15-19; DocumentFileView.test.tsx:104 |
| Download allowance used up | Server throws a plan/daily limit error and no bytes are sent; how the PDF frame shows this is unknown. | route.ts:328; tier-unit-quota-service.ts:499-516 |
| Password PDF (mobile Android) | Message plus Share. | DocumentFileView.tsx:150-171 |
| No response from the Android viewer | Fails after 15 s and shows the render-failed panel. | pdfViewerBridge.ts:2; PdfFileView.tsx:71-74 |
| Offline | Mobile: 'This file could not be opened. Check your connection.' with Retry. Web: browser error in frame; not handled in the code. | useLocalFileCopy.ts:13, 91-99 |
| Accessibility | Web dialog has role dialog, aria-modal and a label; the iframe has a title; mobile WebView has the file name as accessibility label. | LibraryView.tsx:1198-1203, 1307; DocumentFileView.tsx:205 |
| Android build without the viewer asset, or non-PDF Office file | Hands over to another app with Share. | DocumentFileView.tsx:32-35, 138-148 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: 'reads a PDF inline in a framed reader' (preview=pdf, title), no zoom for a document, closes on Escape, opens non-artifact rows in the viewer.
- `apps/web/app/api/files/[id]/__tests__/route.test.ts`: PDF frame exception only for PDF bytes, rejected for generated HTML, inline types, 413 caps, download-limit 429 answers.
- `apps/web/features/projects/components/__tests__/FilePreviewModal.download.test.tsx`: Download failure and retry in the project modal.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PdfFileView.test.tsx`: Android viewer isolation, 'Page n of N', open at page, chunk transfer, failures, silence timeout.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/DocumentFileView.test.tsx`: Download then draw, retry, 413 no retry, external hand-off, Android PDF and password messages.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/FileViewerScreen.test.tsx`: Sheet chrome, size and cited page text, Share, Open chat, close.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/pdfViewerBridge.test.ts`: Bridge message parsing and scripts (file exists; contents not read).

**Test scenarios**

- **Web Library PDF**
  1. Sign in on web; upload a PDF in chat so it lands in the Library.
  2. Open Library, click the PDF tile.
  3. Inspect the frame.
  - Expected: Viewer opens, pages draw, frame src contains preview=pdf, Escape closes.
- **Non-PDF with the flag**
  1. Call GET /api/files/<image id>?preview=pdf with a valid session.
  - Expected: 404 'PDF preview not available'.
- **Cited page**
  1. In a project with an indexed PDF, open a citation to page 3.
  2. Repeat on mobile Sources tab.
  - Expected: Modal frame address ends #page=3; mobile detail line shows 'Page 3'.
- **Free daily cap**
  1. On Free, open PDFs until the daily download cap is used up.
  2. Open one more.
  - Expected: Server refuses the bytes with a limit error; record what the frame shows (unknown today).
- **Android password PDF**
  1. Open a password-protected PDF on Android.
  - Expected: 'This file could not be shown here' with the password message, Retry and Share.
- **Public Desktop**
  1. Open the Electron Desktop app, go to Library, open a PDF.
  - Expected: Same viewer as web.

**Where to look when it fails**

- Web: Network tab for /api/files/<id>?preview=pdf status 404, 413, 429 and error codes preview_too_large, PAYLOAD_TOO_LARGE.
- Mobile: Alert 'Could not open this file'; FileDownloadError status from fetchGeneratedFileBytes.
- Analytics event library_item_opened; table media_assets (deleted_at, mime_type, byte_size).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/025-file-previews-and-readers.md](../../70-qa/test-plans/web/025-file-previews-and-readers.md)
- Desktop: [70-qa/test-plans/desktop/025-file-previews-and-readers.md](../../70-qa/test-plans/desktop/025-file-previews-and-readers.md)
- Mobile: [70-qa/test-plans/mobile/025-file-previews-and-readers.md](../../70-qa/test-plans/mobile/025-file-previews-and-readers.md)

## 10. Gaps and dependencies

- **No page thumbnails, page jump, fit-to-width, fit-to-page or rotate in any app.** Affects: All users on web, Electron Desktop and mobile.. Evidence: No such control in LibraryView.tsx:1210-1310, FilePreviewModal.tsx:351-417 or PdfFileView.tsx; brief S25.12-S25.17.. Work needed: Design and build shared page controls; decide whether to replace the browser frame with a renderer.
- **Tauri desktop Library cannot show a PDF: no inlinePreviewUri and its dialog is unreachable.** Affects: Retained Tauri desktop tree only; public Desktop is Electron and unaffected.. Evidence: DesktopLibrary.tsx:96-181; LibraryView.tsx:267; DesktopLibrary.test.tsx:162-180.. Work needed: Wire inlinePreviewUri with authenticated blob URLs, or drop the retained screen.
- **Brief marks mobile PDF 'missing' but code has a working reader; the brief is stale.** Affects: Anyone reading the brief.. Evidence: DocumentFileView.tsx:173-206; Library index.tsx:1153.. Work needed: Correct the brief rows.
- **VS Code and Chrome have no PDF reader.** Affects: VS Code and Chrome users.. Evidence: apps/extension-vscode/src/features/artifacts/artifactActions.ts; apps/extension/src/features/side-panel/generatedFiles.ts. Work needed: Decide scope; at least an Open in app action.
- **Project modal sandbox may stop the browser PDF viewer drawing.** Affects: Web project PDF preview.. Evidence: FilePreviewModal.tsx:414 sandbox="allow-same-origin".. Work needed: Verify in real browsers; adjust if blank.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/files/[id]
- table:media_assets

## Unknown

- Whether browsers draw a PDF inside the project modal's sandboxed iframe, and what controls the browser's PDF frame offers (thumbnails, fit, rotate).
- How relative /api/files URLs behave in the retained Tauri tree.
- Whether the project knowledge-file serve route spends the download allowance.
- Exact monthly and daily download limits per plan (catalog not read).
- No test run results are recorded in files read.
