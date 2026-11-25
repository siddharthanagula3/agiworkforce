---
id: "F009-07"
type: "feature"
title: "Library: file browser, folders, grid, gallery and image comparison"
aliases: ["Library", "File browser", "Folder tree", "Data table / spreadsheet table", "Resource grid", "Media gallery", "Image comparison slider (not built)", "Files and assets page", "S9.13-S9.18"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S9.13", "S9.14", "S9.15", "S9.16", "S9.17", "S9.18"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "api:GET /api/library", "api:POST /api/library", "api:GET /api/files/{id}", "api:GET /api/projects", "table:media_assets", "store:agi-library-view-mode", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "file:packages/ui/unified-chat/src/components/library/LibraryView.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-07 Library: file browser, folders, grid, gallery and image comparison

The Library lists a person's uploaded and generated files as a grid or list with tabs, search, sort, a preview viewer and a Recently deleted view. Spreadsheet content opens as a sortable table capped at 500 rows. A skill's files show as a collapsible folder tree. The before/after image slider does not exist anywhere.

Area: [9. Compound interface components](README.md). Requirement items: [S9.13](../../10-requirements/capabilities/009-compound-interface-components.md#s913), [S9.14](../../10-requirements/capabilities/009-compound-interface-components.md#s914), [S9.15](../../10-requirements/capabilities/009-compound-interface-components.md#s915), [S9.16](../../10-requirements/capabilities/009-compound-interface-components.md#s916), [S9.17](../../10-requirements/capabilities/009-compound-interface-components.md#s917), [S9.18](../../10-requirements/capabilities/009-compound-interface-components.md#s918).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** On Web (and the desktop window, which shows the web app) the Library page shows every stored file and generated image or video as tiles or rows. The person filters by tab, searches, sorts, previews, downloads, restores deleted items or deletes them for good (packages/ui/unified-chat/src/components/library/LibraryView.tsx:92-100, 1035-1060). Spreadsheet artifacts render as sortable tables (packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx:236-243). A skill's file list is a folder tree (packages/ui/ui/src/directory/SkillFileViewer.tsx:103-133).

**Why it exists.** People need one place to find what they uploaded and what the assistant made, the same way the leading assistants offer a files or library page. [inferred] The brief states the requirement: browse stored files in a list or grid, open one, filter or search (doc: knowledge-base/data/area-briefs/009-compound-interface-components.md S9.13).

**Who uses it.** Signed-in people on Web, the desktop window and Mobile; CLI users through a text listing; skill readers in the skill directory.

**Problems it solves**

- Finding an old upload or generated image without scrolling chats (LibraryView.tsx:92-100).
- Seeing how much file storage and how many download bytes are used (LibraryView.tsx:945-960).
- Recovering a file deleted by mistake within the recovery window (apps/web/app/api/library/route.ts:60-64, LibraryView.tsx:351-353).
- Reading tabular data in order without leaving the app (SpreadsheetArtifact.tsx:90-93).

**Use cases**

- Open Library, choose the Images tab, click a picture to see it large and zoom.
- Search 'invoice', sort by Size, download the largest PDF.
- Turn on Recently deleted and restore a file marked 'Kept until <date>'.
- Open a CSV artifact, click a column header to sort, read the note that only the first 500 rows show.

## 2. User experience

**Where to find it**

- Web: sidebar item 'Library' (apps/web/shared/components/layout/app-nav-items.ts:115), page /chat/library (apps/web/app/chat/library/page.tsx:7-17).
- Desktop (Tauri build): panel 'library', opened from the shell; in Local mode it only shows the toast 'Library lists cloud files. Device files are under Artifacts.' (apps/desktop/src/features/v3/DesktopShellV3.tsx:601-604). The public Electron desktop shows the hosted web app (doc: AGENTS.md section 5).
- Mobile: Library screen (apps/mobile/app/(app)/library/index.tsx, feature in apps/mobile/src/features/library/index.tsx).
- CLI: the library command lists, previews text and downloads (apps/cli/src/lib.rs:7295-7345).
- Folder tree: the file list on a skill detail page (packages/ui/ui/src/directory/SkillDetailView.tsx:256).
- Table: a spreadsheet artifact in the artifacts panel (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1042 per brief).

**Before you start**

- A signed-in account; the Library list is only requested when signed in (LibraryView.tsx:~517-531).
- Cloud mode on the desktop; Local mode shows the toast above (DesktopShellV3.tsx:601-604).

**Screens and controls**

- Search box, placeholder 'Search files and projects', label 'Search the library by name' (LibraryView.tsx:1002-1003).
- Tab strip 'Filter the library': All, Images, Videos, Documents, Artifacts, Uploads, Generated files (LibraryView.tsx:92-100, 1011).
- Sort menu: Modified, Name, Size, Type (LibraryView.tsx:124-129, 1033).
- Toggle 'Recently deleted' (LibraryView.tsx:1035-1038).
- Layout toggle group 'Library layout' with grid and list buttons (LibraryView.tsx:1043-1058).
- Per-item menu 'Actions for <file>' with Restore (deleted view), download, add to chat, add to project and more (LibraryView.tsx:1758-1863).
- Viewer dialog '<file> viewer' with Zoom in, Zoom out, Download, 'Close file viewer' and an 'Ask about this file' box (LibraryView.tsx:1200-1375).
- Spreadsheet table: clickable column headers with aria-sort (SpreadsheetArtifact.tsx:236-258).
- Skill file tree: folder buttons with aria-expanded inside a nav 'skill files' (SkillFileViewer.tsx:112-133).

**Journey**

1. Open Library; the page requests the first page of items with the current tab, sort and search (LibraryView.tsx:449-471).
2. Pick a tab or type in the search box; typing waits for the debounce, then the list is requested again (LibraryView.tsx:445).
3. Choose grid or list; the choice is written to the browser (LibraryView.tsx:426-430, 131-150).
4. Click a tile; images, videos, PDFs and text open in the viewer, artifacts open inline (LibraryView.tsx:1286-1330, 800-830).
5. Download, or open the item menu for more actions.
6. Open Recently deleted to restore or permanently delete; permanent delete asks first (LibraryView.tsx:744-753).

**What the person sees and gets**

- Skeleton or spinner while loading, error text with retry, 'Your library is empty', 'Recently deleted is empty', 'Nothing here matches that name. Try a shorter search.' (LibraryView.tsx:2227-2232).
- Storage line '<used> of <limit> file storage used' and downloads line '<used> of <limit> file downloads used this month' (LibraryView.tsx:945-960).
- Row error 'This file is larger than the file downloads left this month.' (LibraryView.tsx:312, 565).
- 'Kept until <date>' on deleted items (LibraryView.tsx:351-353).
- 'This file is too large to preview here. Download it instead.' for artifacts over 512 KB (LibraryView.tsx:216, 773-776).
- 'Preview isn't available for this file inline.' with 'Download to view' (LibraryView.tsx:1325-1330).
- 'Showing first 500 of N rows. Download the CSV...' under a cut table (SpreadsheetArtifact.tsx:325-331).

**Settings**

- The grid or list choice is remembered under the browser key 'agi-library-view-mode' (LibraryView.tsx:131-150).
- No other Library setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web page mounts the shared LibraryView through a web wrapper that supplies the transport (apps/web/app/chat/library/page.tsx:17, apps/web/features/library/components/LibraryView.tsx:154-155).
- List endpoint filters by kind, surface, origin and search text, sorts, and pages with limit plus one to compute has_more and next_offset (apps/web/app/api/library/route.ts:148-191).
- First page (offset 0, not deleted) also returns storage used and limit, a document and image byte breakdown and the download meter (route.ts:192-210).
- Deleted items carry erase_after, computed from the recovery window (route.ts:60-64, 87).
- Search is debounced by the shared constant SEARCH_INPUT_DEBOUNCE_MS (LibraryView.tsx:445, packages/platform/utils/src/interactionTimings.ts:10).
- Grid and list views, view mode saved and loaded in try/catch (LibraryView.tsx:134-150, 1109-1110).
- Library 'folders' on the All tab are the person's projects, loaded from the projects endpoint (apps/web/features/library/components/LibraryView.tsx:38, 88-175; LibraryView.tsx:850-856).
- Spreadsheet table: sort by header, aria-sort, 500-row cap and truncation note (SpreadsheetArtifact.tsx:78-93, 242-243, 325-331; packages/ui/unified-chat/src/lib/tabular.ts:78).
- Skill folder tree with expand and collapse (SkillFileViewer.tsx:99-133; buildFileTree at packages/ui/ui/src/directory/filtering.ts:122).
- Mobile Library: search debounced at 350 ms, sort menu, recently deleted, select mode, grid columns by layout (apps/mobile/src/features/library/index.tsx:83, 183-285, 942-947).
- CLI lists items with kind, search, limit and offset, previews text and downloads (apps/cli/src/cloud/library.rs:28-52, apps/cli/src/lib.rs:7295-7345).

**Incomplete**

- Image comparison slider S9.18 does not exist; no code was found by searching apps and packages for comparison-slider names (grep over apps and packages, no hit; brief S9.18 says missing on web, desktop, mobile, chrome).
- The web Library shows storage used and limit only; the document and image byte breakdown returned by the endpoint is not read by the shared view (LibraryView.tsx:489-492 reads only used and limit); mobile shows the breakdown in a settings card, not on the Library screen (apps/mobile/src/features/settings/StorageBreakdownCard.tsx:29).
- Mobile has no grid or list toggle; it uses a responsive column count (apps/mobile/src/features/library/index.tsx:177-179).
- Text-file tables inside the Library viewer are capped at 500 rows but are not sortable (packages/ui/unified-chat/src/components/library/FileTextPreview.tsx:14, 45-70).
- CLI tables are parsed from markdown with no sort found (apps/cli/src/markdown.rs:470-486; grep for sort returned nothing).

**Present but disconnected or switched off**

- Desktop Local mode does not open the Library (DesktopShellV3.tsx:601-604).

**Not available**

- CLI file browser: brief says missing, yet the CLI has a library command (apps/cli/src/lib.rs:7295); the brief row is out of date for the CLI [inferred].
- Chrome extension: data table and gallery (doc: area brief S9.15, S9.17).
- VS Code: not applicable (area brief status n/a).
- Mobile folder tree and Chrome folder tree (doc: area brief S9.14).

## 4. Required behaviour

**Established requirements**

- The user can browse stored files (uploads and generated outputs) in a list or grid, open one, and filter or search. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.13)
- Files show in a nested folder tree the user can expand and collapse. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.14)
- Tabular data shows in a table with sortable column headers and scrolling. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.15)
- Resources show as a grid of cards the user can scan and open. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.16)
- Images and videos can be browsed as a gallery and opened in a larger viewer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.17)
- After an image edit the user can drag a slider over one frame to compare original and edited images. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.18)
- A file that is removed goes to recovery first; permanent removal only follows an explicit action that names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Open Library signed in on Web: tiles appear, and after reload the same grid or list choice is kept.
2. Type a query: no request fires on each key press, one request fires after the pause, and results are filtered by the server.
3. Choose each tab: only items of that kind, surface or origin appear.
4. Turn on Recently deleted: each item reads 'Kept until <date>' and has Restore.
5. Open a spreadsheet artifact with more than 500 rows: 500 rows show and the note names the total.
6. Click a column header twice: rows sort ascending then descending and aria-sort changes.
7. Open an artifact larger than 512 KB from Library: the 'too large to preview' message and download appear.
8. Expand and collapse a folder in a skill file list: children show and hide and aria-expanded changes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The image comparison slider should live inside the image result viewer and the Library viewer [inferred from S9.18 wording].
- Storage breakdown (documents, images) should be shown beside the total on every app that shows storage [inferred from the endpoint returning it].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build the comparison slider as one shared component in packages/ui/unified-chat and mount it from the image edit result and the Library viewer.
- [proposed] Show the document and image byte breakdown in the web Library storage line.
- [proposed] Make the Library viewer table sortable by reusing the artifact table sort.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Tabs, search, sort, grid and list, viewer, deleted view, storage lines (lines 92-1110). |
| component | LibraryView (web wrapper) | `apps/web/features/library/components/LibraryView.tsx` | Supplies the transport: list, projects as folders, media jobs, downloads, handoff to chat. |
| screen | Library page | `apps/web/app/chat/library/page.tsx` | Route /chat/library inside WebAppShell. |
| component | DesktopLibrary | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri desktop host for the shared view using the cloud API base URL and managed request context. |
| endpoint | GET and POST /api/library | `apps/web/app/api/library/route.ts` | Paged list with filters and meters; POST saves an artifact into the Library. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Database query for library rows (imported at route.ts:16). |
| schema | LibraryListQuerySchema, LibraryListResponseSchema | `packages/contracts/cloud-contracts/src/library.ts` | Shared request and response contract including storage fields. |
| table | media_assets | `apps/web/app/api/library/route.ts` | Rows read for the breakdown query (route.ts:118-134). |
| component | FileTextPreview | `packages/ui/unified-chat/src/components/library/FileTextPreview.tsx` | Text and table preview in the viewer with a 500-row cap. |
| component | SpreadsheetArtifact | `packages/ui/unified-chat/src/components/artifact-components/SpreadsheetArtifact.tsx` | Sortable table with row cap and truncation note. |
| service | tabular helpers | `packages/ui/unified-chat/src/lib/tabular.ts` | SPREADSHEET_ROW_CAP (500) and sortTabularRows. |
| component | SkillFileTree | `packages/ui/ui/src/directory/SkillFileViewer.tsx` | Folder tree with expand and collapse. |
| service | buildFileTree | `packages/ui/ui/src/directory/filtering.ts` | Turns a flat file list into tree nodes. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Search, filters, sort, grid, select mode, deleted view. |
| service | Mobile library client | `apps/mobile/src/features/library/libraryClient.ts` | Builds the list path, parses the response and maps items. |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | Loads pages with initial, refresh and silent modes. |
| store | libraryCacheStore | `apps/mobile/src/features/library/libraryCacheStore.ts` | Device cache of the Library list. |
| component | Mobile table renderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Renders and sorts message tables (imports sortTabularRows at line 105-106). |
| service | CLI library client | `apps/cli/src/cloud/library.rs` | list, text preview, download and text rendering of pages. |
| command | CLI Library command | `apps/cli/src/lib.rs` | Handles the library command (lines 7295-7345). |
| config | view mode key | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Browser storage key agi-library-view-mode (line 131). |
| config | debounce constant | `packages/platform/utils/src/interactionTimings.ts` | SEARCH_INPUT_DEBOUNCE_MS used by the shared view. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens Library or changes a tab, sort, query or the deleted toggle; the view builds query parameters limit, sort, surface, kind, origin, q and deleted. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:449-466 |
| The web wrapper sends GET /api/library with the session cookie. | device | apps/web/features/library/components/LibraryView.tsx:154-155 |
| The server rate-limits, opens a user-scoped database connection, validates the query, reads rows plus one, and maps them to items. | our servers | apps/web/app/api/library/route.ts:148-191 |
| On the first non-deleted page the server also reads the storage meter, the download meter (based on the entitled plan) and the byte breakdown; failures of the meters are logged and skipped. | our servers | apps/web/app/api/library/route.ts:91-146, 192-210 |
| The client validates the response against the shared schema and shows the items; a stale response is dropped by a sequence counter. | device | LibraryView.tsx:468-505 |
| A click opens the viewer; image, video and PDF load from /api/files/<id>; text and tables load a preview; an artifact is fetched and shown if 512 KB or less. | device and our servers | route.ts:75; LibraryView.tsx:760-780, 1286-1330 |
| Mobile and CLI call the same endpoint with their own client and render their own list. | device and our servers | apps/mobile/src/features/library/libraryClient.ts:53-120; apps/cli/src/cloud/library.rs:8-40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Library rows (name, type, size, origin, prompt, provider, model, conversation id, timestamps, erase date) | database table media_assets, bytes behind /api/files/<id> | Read on demand by each app; mobile also keeps a device cache (apps/mobile/src/features/library/libraryCacheStore.ts) | Deleted rows stay restorable for the recovery window then erase (route.ts:60-64; confirm text at LibraryView.tsx:736) |
| Grid or list choice | browser local storage key agi-library-view-mode | No, per browser | Stays until the browser data is cleared; read and write are wrapped in try/catch (LibraryView.tsx:134-150) |
| Saved artifact | POST /api/library writes bytes through persistGeneratedFileBytes | Yes, through the account | Up to 1,000,000 characters (route.ts:214-273) |

**Models and providers.** The list does not call a model. Each row carries the provider and model that made a generated file (route.ts:81-82); mobile turns the model into a short picker name or catalogue name for the source label (apps/mobile/src/features/library/libraryClient.ts:66-77).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the shared view only loads when signed in and auth is ready (LibraryView.tsx:~517-531). The endpoint uses the user-scoped database and the rate limit bucket chat-conversation (route.ts:149-152). |
| Permissions | Rows are read through a user and organization scoped connection (route.ts:152, 118-135). Permanent delete and restore ask first (LibraryView.tsx:744-753). |
| Subscription | The download meter limit depends on the entitled plan tier (route.ts:96-100). Whether a plan removes the Library is not established; none found in the code reviewed. |
| Limits and metering | File storage meter and monthly download meter, shown as text (LibraryView.tsx:945-960); a file larger than the downloads left is refused with a row error (LibraryView.tsx:562-566). Page size LIBRARY_DEFAULT_PAGE_SIZE from the shared contract (LibraryView.tsx:451). |
| Feature flags | none found in the code for the web Library; mobile has a feature promo sheet (apps/mobile/src/features/library/LibraryFeaturePromoSheet.tsx) whose flag was not read. |
| Model compatibility | Not affected; any model's output can be stored. |
| Provider restrictions | none found in the code. |
| Local mode | Desktop Local mode shows a toast and opens no Library (DesktopShellV3.tsx:601-604). Mobile and CLI Local mode behaviour was not established; the CLI connects with the account privacy mode (apps/cli/src/lib.rs:7302). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner or skeleton until the first page resolves; hasResolvedPage tracks it. | LibraryView.tsx:405-406, 468-505 |
| Empty | Separate texts for empty library, empty deleted view and no search match. | LibraryView.tsx:2227-2232 |
| Error | List error is shown with a way to retry; a bad response shape throws 'Unexpected response shape'. Row actions keep per-row errors. | LibraryView.tsx:408-409, 468-505 |
| Racing requests | Older responses are discarded by sequence number; appended pages are dropped if a removal happened. | LibraryView.tsx:468-492 |
| Signed out | The list is cleared and no request is made. | LibraryView.tsx:~517-531 |
| Missing or gone file (404 or 410) | The item is marked unavailable and cannot be opened. | LibraryView.tsx:757-764 |
| Too large | Artifact over 512 KB shows the too-large message with download; table over 500 rows is cut with a note. | LibraryView.tsx:216, 773-776; SpreadsheetArtifact.tsx:325-331 |
| Accessibility | Tabs use role tablist and aria-selected; viewer is a modal dialog; table headers have aria-sort; folder buttons have aria-expanded; mobile uses accessibility labels. | LibraryView.tsx:1011-1019, 1200-1201; SpreadsheetArtifact.tsx:242; SkillFileViewer.tsx:124; apps/mobile/src/features/library/index.tsx:1106-1110 |
| Offline or timeout | not handled in the code beyond the generic list error; mobile keeps a device cache and a silent refresh mode. | apps/mobile/src/features/library/useLibraryAssets.ts:97-116 |
| Browser storage blocked | Falls back to grid without error. | LibraryView.tsx:134-150 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library view behaviour.
- packages/ui/unified-chat/src/components/library/__tests__/library-item-open.test.ts (not found) (not found): Opening items.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web wrapper.
- `apps/web/app/api/library/__tests__/route.test.ts`: List endpoint, including storage breakdown fields.
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Desktop host.
- `packages/ui/ui/src/directory/__tests__/SkillFileViewer.test.tsx`: Skill file tree and viewer.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.keyboard.test.tsx`: Table keyboard use.
- `packages/ui/unified-chat/src/components/artifact-components/__tests__/SpreadsheetArtifact.sheets.test.tsx`: Table sheets.
- `packages/ui/unified-chat/src/lib/tabularSort.test.ts`: Table sorting.
- `apps/mobile/__tests__/LibraryFilterChips.test.tsx`: Mobile Library filters; sibling files LibraryBottomSearch, LibraryLargeText, LibraryFreshness, LibraryActionMenus, library-hosted-client cover other mobile parts.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/TabularGridView.test.tsx`: Mobile table grid.
- `apps/cli/src/cloud/library.rs`: Unit tests in the file for list query offset and next-page text (lines ~96-150).

**Test scenarios**

- **View mode persists**
  1. Open /chat/library signed in.
  2. Click the list layout button.
  3. Reload the page.
  - Expected: The list layout is shown again; the key agi-library-view-mode holds 'list'.
- **Search is debounced and server filtered**
  1. Open the network panel.
  2. Type 'report' quickly in the search box.
  - Expected: One request with q=report after the pause, not one per key.
- **Deleted view**
  1. Delete a file.
  2. Turn on Recently deleted.
  - Expected: The file shows 'Kept until <date>' and a Restore action; restoring returns it to All.
- **Table cap**
  1. Open a CSV artifact with 600 rows.
  2. Click a header.
  - Expected: 500 rows show sorted; note says 'Showing first 500 of 600 rows'.
- **Skill tree**
  1. Open a skill with nested folders.
  2. Expand and collapse a folder with keyboard.
  - Expected: Children toggle and aria-expanded follows.
- **Comparison slider absent**
  1. Edit an image in chat.
  2. Look for a before and after slider in chat and Library.
  - Expected: No slider is present on any app (confirms the gap).

**Where to look when it fails**

- Server log line 'Library download meter could not be read' and 'Library storage breakdown could not be read' (route.ts:102, 143).
- Client error text 'Unexpected response shape' or 'HTTP <status>' (LibraryView.tsx:~478).
- Table media_assets, columns deleted_at, temporary_chat (route.ts:130-134).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Image comparison slider does not exist.** Affects: All apps with image editing.. Evidence: Brief S9.18 says missing; no code found.. Work needed: Build a shared slider component and mount it where an edited image appears.
- **Storage breakdown not shown on the web Library.** Affects: Web and desktop window.. Evidence: route.ts:195-206 returns it; LibraryView.tsx:489-492 ignores it.. Work needed: Read storage_documents_bytes and storage_images_bytes and show them.
- **Brief marks CLI file browser as missing but a library command exists.** Affects: Brief accuracy for CLI.. Evidence: apps/cli/src/lib.rs:7295-7345.. Work needed: Update the capability ledger row.
- **CLI tables are not sortable and Chrome has no table or gallery.** Affects: CLI, Chrome.. Evidence: apps/cli/src/markdown.rs:470-486; brief S9.15, S9.17.. Work needed: Decide whether the terminal and the extension need sorting; add if so.
- **No grid or list toggle on mobile.** Affects: Mobile.. Evidence: apps/mobile/src/features/library/index.tsx:177-179.. Work needed: Decide if the toggle is wanted; the brief only requires a grid.
- **Local mode has no Library on desktop.** Affects: Desktop Tauri build Local mode.. Evidence: DesktopShellV3.tsx:601-604.. Work needed: Decide if local files should appear in a Library view.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- api:GET /api/library
- api:POST /api/library
- api:GET /api/files/{id}
- api:GET /api/projects
- table:media_assets
- store:agi-library-view-mode
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- file:packages/ui/unified-chat/src/components/library/LibraryView.tsx

## Unknown

- Whether mobile and CLI Local modes show anything for the Library.
- What the mobile Library feature promo sheet flag is and when it shows (LibraryFeaturePromoSheet.tsx not read).
- Whether any plan removes access to the Library; no plan check was found.
- How large text and table previews are chosen as 'too large' on the server (file-text-preview not read).
- Exact web wrapper behaviour for download of large files (apps/web/features/library/components/LibraryView.tsx lines 176-290 not read in full).
- The gallery on CLI: brief lists cloud/library.rs:40 as the code, which is the list function; no image viewing was verified.
