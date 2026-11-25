---
id: "F024-01"
type: "feature"
title: "Browse by source: All files, Uploads, Generated files, Artifacts"
aliases: ["Library source tabs", "All / Uploads / Generated files / Artifacts", "S24.01", "S24.02", "S24.03", "S24.04", "Artifact gallery", "Filter the library"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (2 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S24.01", "S24.02", "S24.03", "S24.04"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "table:media_assets", "api:GET /api/library", "F024-02", "F024-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-01 Browse by source: All files, Uploads, Generated files, Artifacts

The Library lists a signed-in person's saved files in one place and splits them into All, Uploads, Generated files and Artifacts. Web and Electron desktop use the shared tab row. Mobile uses filter chips. The CLI and VS Code only list artifacts, from a different index. Chrome is unverified.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.01](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2401), [S24.02](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2402), [S24.03](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2403), [S24.04](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2404).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (2 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person see every saved file the account owns in one list, then narrow it to files they uploaded, files the assistant generated, or saved artifacts that open in a viewer. The list comes from the server table of stored media (media_assets) through GET /api/library. (apps/web/app/api/library/route.ts:148-212; apps/web/lib/server/media-assets.ts:402-440)

**Why it exists.** Uploads, generated files and artifacts all end up as stored files, and people need one place to find them again instead of hunting through chats. The brief asks for All-files, Uploaded, Generated and Artifact views (doc: knowledge-base/data/area-briefs/024-library-and-file-management-experience.md S24.01-S24.04). The public support page describes the same tabs (doc: apps/web/content/support/library.md).

**Who uses it.** Any signed-in person on web, Electron desktop or mobile. Developers on the CLI and VS Code use only the artifact list.

**Problems it solves**

- Finding a file made or uploaded in an old chat.
- Telling apart what I uploaded from what the assistant made.
- Reopening a saved artifact (page, diagram, document) without going back to the chat.

**Use cases**

- On web, open /chat/library?surface=artifact to land on the Artifacts tab (apps/web/features/library/components/LibraryView.tsx:76-78,137-139).
- On mobile, tap the Uploads chip to see only what I attached (apps/mobile/src/features/library/index.tsx:136-142).
- In a terminal, run 'agi artifacts list' to print the account's artifacts (apps/cli/src/lib.rs:1359-1368).
- In VS Code, browse the artifacts tree and open one (apps/extension-vscode/src/features/artifacts/artifactsTree.ts:32-60).

## 2. User experience

**Where to find it**

- Web: page /chat/library, heading 'Library' (apps/web/app/chat/library/page.tsx; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002-1011).
- Desktop (Electron, the public desktop): shows the hosted web app, so the same /chat/library page (doc: AGENTS.md section 5; apps/desktop/electron/__tests__/windowRegistry.test.ts:33-41 lists /chat/library and /chat/library?surface=artifact as chat routes).
- Desktop (Tauri, retained internal build): DesktopLibrary inside DesktopShellV3 (apps/desktop/src/features/v3/DesktopShellV3.tsx:784; apps/desktop/src/features/library/DesktopLibrary.tsx).
- Mobile: route apps/mobile/app/(app)/library/index.tsx; screen title 'Library' (apps/mobile/src/features/library/index.tsx:842-860 area).
- CLI: command group 'agi artifacts' with subcommand list (apps/cli/src/lib.rs:1359-1368).
- VS Code: an artifacts tree view (apps/extension-vscode/src/features/artifacts/artifactsTree.ts).
- Chrome: the side panel shows artifacts for the open conversation (doc: docs/product/surface-feature-matrix.md:199); I did not open Chrome code.

**Before you start**

- A signed-in account. Web shows 'Sign in to see your library' when signed out (apps/web/features/library/components/LibraryView.tsx:115-129). Desktop shows 'Sign in to see your Library' (apps/desktop/src/features/library/DesktopLibrary.tsx, DesktopLibrary function). Mobile shows 'Signed out' with 'Sign in to see the images, videos, and files saved to your account.' (apps/mobile/src/features/library/index.tsx:1262-1270 area).
- Files only appear if they were saved to the account. Files attached to a temporary chat are never listed (apps/web/lib/server/media-assets.ts:428-431 comment and clause).

**Screens and controls**

- Web/desktop: search box 'Search files and projects', tab row labelled 'Filter the library' with tabs All, Images, Videos, Documents, Artifacts, Uploads, Generated files; 'Show more' button; sort menu; 'Recently deleted' toggle; 'Grid view'/'List view' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:91-99,1002-1058,1100-1115).
- Mobile: horizontal chip row All, Images, Videos, Documents, Uploads, Generated files, Artifacts, Code, Charts, Research; each chip has accessibility label '<name> filter' (apps/mobile/src/features/library/index.tsx:897-938,1204).
- CLI: 'agi artifacts list [--project <id>] [--limit N] [--json]' (apps/cli/src/lib.rs:1359-1368).

**Journey**

1. Open the Library (web: /chat/library; mobile: Library from the drawer).
2. The list loads the first page of 24 items, newest-modified first.
3. Click or tap a tab or chip: All, Uploads, Generated files or Artifacts.
4. Web asks the server again with the tab's filter and shows 'Loading your library' while waiting (LibraryView.tsx:1085-1092 area).
5. Pick an item to open it. An artifact opens in an in-page artifact view; an image or file opens in the viewer.
6. Use 'Show more' to load the next 24.

**What the person sees and gets**

- Loading: 'Loading your library' with a spinner on web; spinner on mobile until first load finishes (apps/mobile/__tests__/LibraryFreshness.test.tsx).
- Empty: web 'Your library is empty' with 'Upload a file' button (LibraryView.tsx:2226-2255). Mobile: 'Nothing here yet' plus one line per chip, such as 'Files you upload will appear here' and 'Files AGI creates for you will appear here' (index.tsx:1262-1287).
- Error: web red box with the message and a 'Retry' button; default text 'Something went wrong.' (LibraryView.tsx:504,1068-1082). Mobile 'Library could not be loaded' with 'Check your connection and try again.' and Retry (index.tsx:1233-1260).
- Storage line 'X of Y file storage used' and downloads line under the heading (LibraryView.tsx:1114-1134 area).

**Settings**

- Web layout choice is remembered in browser localStorage key 'agi-library-view-mode' (LibraryView.tsx:131-147) - see F024-04.
- No other setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Electron desktop: the seven-tab row maps to server filters; Uploads sends origin=uploaded, Generated files sends kind=file and origin=generated, Artifacts sends surface=artifact (packages/ui/unified-chat/src/components/library/LibraryView.tsx:91-116; apps/web/lib/server/media-assets.ts:415-421).
- Server: GET /api/library parses kind, sort, surface, origin, q, limit, offset, requires a user-scoped database, returns 24 items by default and a has_more flag (apps/web/app/api/library/route.ts:148-212; packages/contracts/cloud-contracts/src/library.ts:84,101-115).
- Deep links: ?surface=artifact opens Artifacts; ?tab=<id> opens that tab, ?item= opens an item, ?q= prefills search (apps/web/features/library/components/LibraryView.tsx:76-78,137-141).
- Mobile: Uploads and Generated files chips ask the server with origin (and kind=file for Generated) (index.tsx:136-142). Artifacts chip shows artifacts merged from the device store and the cloud list, filtered to the current app mode, with no image artifacts (index.tsx:320-326).
- Mobile keeps an offline copy of the default first page in a persisted store 'library-store-cloud' (apps/mobile/src/features/library/libraryCacheStore.ts) and shows it with safe retry guidance when a load fails (apps/mobile/__tests__/LibraryAssetsError.test.tsx).
- Saving an artifact to the Library: POST /api/library stores the text as a media_assets row with origin 'saved_artifact' (route.ts:214-273).
- CLI: 'agi artifacts list' reads the hosted artifact index /api/artifacts/index (apps/cli/src/cloud/artifacts.rs:23-24). VS Code lists the same index in a tree (apps/extension-vscode/src/features/artifacts/artifactActions.ts imports ManagedCloudArtifactIndexEntry).

**Incomplete**

- Generated files tab on web and mobile is limited to kind 'file', so a generated image or video is not in it; it is in Images or Videos (LibraryView.tsx:115 area; apps/mobile/src/features/library/index.tsx:136-142). [inferred from the mapping]
- Tauri DesktopLibrary passes only a read, delete, restore, preview and media-job transport; it has no upload, folder, add-to-chat or download actions (apps/desktop/src/features/library/DesktopLibrary.tsx, transport memo).
- Chrome artifact view: not verified (brief S24.04 says unverified).

**Present but disconnected or switched off**

- Contract field resource_type and function libraryResourceTypeFor exist, but GET /api/library does not read resource_type and no UI uses it (packages/contracts/cloud-contracts/src/library.ts:47-60,96-99; apps/web/app/api/library/route.ts:155-163; search of apps and packages found only library.ts and its test).

**Not available**

- CLI, VS Code and Chrome have no Uploads or Generated files views (doc: docs/product/surface-feature-matrix.md:197-199).
- Artifacts are not in the CLI/VS Code Library list; they list a different index built from chat messages (apps/cli/src/cloud/artifacts.rs:1-12).

## 4. Required behaviour

**Established requirements**

- One Library view lists every file the user owns across chats, generation, uploads and projects. (source: S24.01 (brief))
- A view shows only uploaded files. (source: S24.02 (brief))
- A view shows only files the assistant generated. (source: S24.03 (brief))
- A view lists the user's artifacts and opens each one. (source: S24.04 (brief))
- Each tab asks the server for a fresh first page of 24 items. (source: packages/contracts/cloud-contracts/src/library.ts:84)
- Uploaded and generated files appear once with accurate type, size, origin and pagination; delete/restore shows in listing. (source: doc: docs/product/experience-contract.md:784 (W11))

**Acceptance criteria**

1. On web, each of All, Uploads, Generated files and Artifacts triggers a GET /api/library with the matching origin/kind/surface params and limit=24.
2. An uploaded file appears under Uploads and All, and not under Generated files.
3. A generated PDF or office file appears under Generated files; a generated image does not.
4. A saved artifact appears under Artifacts on web and under the Artifacts chip on mobile, and opens.
5. Signed out: no library request is made and a sign-in message shows, not an empty-library message.
6. A failed load shows an error with a Retry button, not an empty list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Tauri DesktopLibrary should reach the same tab behaviour as web, since both render the shared LibraryView. [inferred]
- CLI and VS Code should state that they list artifacts only. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an Artifacts tab-equivalent to Chrome and confirm it against the hosted index.
- [proposed] Show the same tab names on mobile and web (mobile adds Code, Charts, Research chips).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Web Library page | `apps/web/app/chat/library/page.tsx` | Route /chat/library that mounts the web LibraryView. |
| component | Web LibraryView wrapper | `apps/web/features/library/components/LibraryView.tsx` | Builds the transport (fetch, delete, restore, upload, open) and reads ?surface, ?tab, ?item, ?q. |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Tabs, grid, list, viewer, paging, empty and error states for web and desktop. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists a page of the user's stored media with filters, storage and download meters. |
| endpoint | POST /api/library | `apps/web/app/api/library/route.ts` | Saves artifact text as a Library file (max 1,000,000 characters). |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Builds the SQL over public.media_assets with kind, surface, origin, search, deleted, sort. |
| schema | LibraryItemSchema / LibraryListQuerySchema | `packages/contracts/cloud-contracts/src/library.ts` | Shared item, query and response shapes; page size 24, max 100. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Stored media rows (kind, mime_type, byte_size, metadata, deleted_at, conversation_id). |
| service | persistGeneratedFileBytes / classifyGeneratedFile | `apps/web/lib/server/generated-file-persist.ts` | Stores generated and saved files and classifies them as artifact or file. |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | Chips, grid, search bar, sort, selection and viewers on mobile. |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | Loads pages, paging, cache fallback, delete and restore for mobile. |
| service | libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Builds /api/library paths and parses the response. |
| store | useLibraryCacheStore | `apps/mobile/src/features/library/libraryCacheStore.ts` | Persisted first-page cache (store library-store-cloud) per account. |
| store | Mobile artifact store | `apps/mobile/src/features/artifacts/store.ts` | Device artifacts and cloud artifacts merged for the gallery. |
| component | DesktopLibrary (Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri wrapper with a managed-cloud transport and sign-in gate. |
| command | agi artifacts list | `apps/cli/src/lib.rs` | CLI subcommand that lists account artifacts. |
| service | CLI hosted artifacts | `apps/cli/src/cloud/artifacts.rs` | Reads /api/artifacts/index and derives artifact ids. |
| component | VS Code artifacts tree | `apps/extension-vscode/src/features/artifacts/artifactsTree.ts` | Tree of account artifacts in the editor. |
| config | Electron route list test | `apps/desktop/electron/__tests__/windowRegistry.test.ts` | Treats /chat/library routes as non-conversation chat routes. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the Library or clicks a tab; the shared view builds query params (limit 24, sort, kind/surface/origin, q, deleted) and calls the host transport. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:448-462 |
| Web transport sends GET /api/library with the session cookie. | device and our servers | apps/web/features/library/components/LibraryView.tsx:154-155 |
| Server applies the chat-conversation rate limit, resolves the user-scoped database, validates the query and runs the SQL over media_assets for that user and active organization, excluding temporary-chat files and deleted rows. | our servers | apps/web/app/api/library/route.ts:148-183; apps/web/lib/server/media-assets.ts:428-440 |
| Server returns the page plus has_more, next_offset and (first page only, not Recently deleted) storage and download meters. | our servers | apps/web/app/api/library/route.ts:184-211 |
| Client validates the response with LibraryListResponseSchema; a bad shape becomes an error with Retry. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:477-482 |
| On mobile, Artifacts chip rows come from the device artifact store and cloud artifacts, filtered by app mode, without any /api/library call for them. | device | apps/mobile/src/features/library/index.tsx:320-326,328-362 |
| CLI and VS Code call the hosted artifact index, not /api/library. | device and our servers | apps/cli/src/cloud/artifacts.rs:23-24 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Library rows (file metadata, origin, surface, prompt, provider, model, conversation id) | table media_assets; bytes in generated-media storage via storeMedia (apps/web/lib/server/generated-file-persist.ts) | Server-held; every app reads the same rows through the API. | Soft delete sets deleted_at; recoverable 30 days; permanent delete removes row and stored bytes (apps/web/lib/server/media-assets.ts:693-770). |
| Mobile first-page cache | store:library-store-cloud (MMKV) | Not synced; per device and per account owner. | Cleared when signed out or account changes (apps/mobile/src/features/library/useLibraryAssets.ts loadFirstPage; libraryCacheStore.ts). |
| Device artifacts on mobile | mobile artifact store | Merged with cloud artifacts for display. | unknown |

**Models and providers.** Listing and filtering use no model. Each row only records which provider and model made a generated file (provider, model columns); mobile shows the model's short name as the source label (apps/mobile/src/features/library/libraryClient.ts:65-73). No provider is called to list files.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for the server list on web, desktop and mobile (apps/web/features/library/components/LibraryView.tsx:278; apps/desktop/src/features/library/DesktopLibrary.tsx; apps/mobile/src/features/library/useLibraryAssets.ts loadFirstPage returns empty when no owner). CLI and VS Code need a signed-in account for the hosted artifact index (apps/cli/src/cloud/artifacts.rs). |
| Permissions | Rows are scoped to the user and the active organization (apps/web/lib/server/media-assets.ts:402-440). Reads go through a user-scoped database (apps/web/app/api/library/route.ts:152). |
| Subscription | No tab is gated by plan (none found in the code). Plan only sets the storage allowance and monthly download allowance shown in the header (apps/web/lib/server/file-storage.ts:77-91; apps/web/lib/services/tier-unit-quota-service.ts:446-463). |
| Limits and metering | Page size 24 default, 100 max (library.ts:84-85). Rate limit group 'chat-conversation' (route.ts:149). Storage and download meters are returned only on the first page of the non-deleted view. |
| Feature flags | none found in the code for the tabs. Mobile hides image edit when the imageGen flag is off, which is unrelated to listing (index.tsx:1122). |
| Model compatibility | Not affected. Any model's output is listed once stored. |
| Provider restrictions | none found in the code; provider is only a label on the row. |
| Local mode | The server Library lists only files stored in AGI Cloud. The Tauri desktop screen states that local-only sessions keep files on the device and are not cataloged there (apps/desktop/src/features/library/DesktopLibrary.tsx, signed-out text). On mobile, artifacts are filtered to the current app mode, so local artifacts show in local mode (index.tsx:320-326); whether the server list is requested in local mode is not gated in the code I read (index.tsx uses clerkUserId only), so this is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows 'Loading your library'; stale responses are dropped by a request counter. Mobile shows a spinner, never the empty state, until first load ends. | LibraryView.tsx:466-507,1085-1092; apps/mobile/__tests__/LibraryFreshness.test.tsx |
| Empty | Web 'Your library is empty' with Upload a file; mobile per-chip message. | LibraryView.tsx:2226-2255; index.tsx:1262-1287 |
| Error and retry | Web shows message and Retry. Mobile shows 'Library could not be loaded' or keeps the cached page. | LibraryView.tsx:1068-1082; apps/mobile/__tests__/LibraryAssetsError.test.tsx |
| Signed out | No request; sign-in message. | apps/web/features/library/components/__tests__/LibraryView.test.tsx 'never fetches while signed out' |
| Offline | Web: not handled in the code beyond the error and Retry. Mobile: shows the cached default page. | apps/mobile/src/features/library/useLibraryAssets.ts catch branch |
| Account switch (mobile) | Old account's page is hidden and late responses are ignored. | apps/mobile/__tests__/LibraryAssetsError.test.tsx |
| Unknown future origin or surface | Folded to safe defaults, item kept. | packages/contracts/cloud-contracts/src/library.ts:70-72 |
| Accessibility | Tab row has role tablist with aria-label 'Filter the library' and aria-selected; mobile chips have '<label> filter' labels. | LibraryView.tsx:1011-1019; index.tsx:1204 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: 401 when unauthenticated, user and organization scoping, kind and surface filters, origin from metadata, deleted bin, sort, search escaping.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Renders host items, storage and downloads lines, signed-out no fetch, load failure with retry, page size, appending pages, cursor rebasing after delete.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Signed-out sign-in message, tab kinds and sort sent to the server, search q, folders, upload.
- `packages/contracts/cloud-contracts/src/__tests__/library.test.ts`: Item, query and response schemas, resource type classifier.
- `apps/mobile/__tests__/LibraryFilterChips.test.tsx`: Chip row layout, route filter applied and reset.
- `apps/mobile/__tests__/LibraryFilterParam.test.tsx`: Route filter parameter handed to the screen.
- `apps/mobile/__tests__/LibraryAssetsError.test.tsx`: Recovery copy, cached page, cursor, account change.
- `apps/mobile/__tests__/LibraryFreshness.test.tsx`: Spinner not empty state, refetch on focus, pull to refresh, meters.
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Tauri transport sign-in gate, cloud origin, bearer handling, delete and restore.
- `apps/mobile/__tests__/LibraryArtifactOpen.test.tsx`: Opening an artifact from the Library (name only; contents not read).

**Test scenarios**

- **Tabs ask the server**
  1. Sign in on web and open /chat/library.
  2. Open the browser network panel.
  3. Click Uploads, then Generated files, then Artifacts.
  - Expected: GET /api/library calls carry origin=uploaded; kind=file&origin=generated; surface=artifact, each with limit=24.
- **Deep link to artifacts**
  1. Open /chat/library?surface=artifact.
  - Expected: The Artifacts tab is selected on load.
- **Signed out**
  1. Open /chat/library signed out.
  - Expected: 'Sign in to see your library' shows and no /api/library request is sent.
- **Mobile Uploads chip**
  1. Upload a file in chat.
  2. Open Library, tap Uploads.
  - Expected: The file is listed; Generated files does not list it.
- **CLI artifact list**
  1. Run 'agi artifacts list --json' signed in.
  - Expected: A JSON list of the account's artifacts.

**Where to look when it fails**

- Server log warn 'Library storage breakdown could not be read' and 'Library download meter could not be read' (route.ts).
- Client error text 'Unexpected response shape' means the response failed LibraryListResponseSchema.
- Table media_assets: check deleted_at, temporary_chat and metadata->>'origin'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)
- CLI: [70-qa/test-plans/cli/024-library-and-file-management-experience.md](../../70-qa/test-plans/cli/024-library-and-file-management-experience.md)
- VS Code: [70-qa/test-plans/vscode/024-library-and-file-management-experience.md](../../70-qa/test-plans/vscode/024-library-and-file-management-experience.md)
- Chrome: [70-qa/test-plans/chrome/024-library-and-file-management-experience.md](../../70-qa/test-plans/chrome/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **Brief marks Chrome artifact view unverified; no Chrome code was opened.** Affects: surface:chrome. Evidence: S24.04 status; docs/product/surface-feature-matrix.md:199. Work needed: Open apps/extension/src, confirm the artifact view, add a test.
- **CLI and VS Code list a different artifact index than web Artifacts tab (message-derived vs stored files), so the two lists can differ.** Affects: surface:cli, surface:vscode, surface:web. Evidence: apps/cli/src/cloud/artifacts.rs:1-12 vs apps/web/app/api/library/route.ts:77. Work needed: Decide one definition of 'artifact' for the Library, or label the difference.
- **Tauri DesktopLibrary has fewer actions than web (no upload, folders, add to chat).** Affects: surface:desktop (Tauri build only). Evidence: apps/desktop/src/features/library/DesktopLibrary.tsx transport memo. Work needed: Supply the missing transport methods or retire the Tauri screen.
- **Mobile tab filters Images, Videos, Documents are applied on the loaded page, not on the server.** Affects: surface:mobile. Evidence: apps/mobile/src/features/library/index.tsx:136-142,328-345. Work needed: Pass kind to the server so a filter does not depend on what the first pages contain.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- table:media_assets
- api:GET /api/library
- F024-02
- F024-04

## Unknown

- Whether Chrome shows a Library-like artifact view in code (not opened).
- Whether mobile requests the server file list in Local mode (code does not gate on app mode in the part read).
- What the mobile device artifact store keeps and for how long.
- The exact current page that handles ?tab on desktop Electron beyond the shared web page.
