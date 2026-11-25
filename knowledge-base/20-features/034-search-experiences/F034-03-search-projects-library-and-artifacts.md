---
id: "F034-03"
type: "feature"
title: "Search Projects, Library and artifacts"
aliases: ["Library search", "Search files and projects", "Search library", "Search projects", "Artifact search", "S34.04", "S34.05", "Library"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S34.04", "S34.05"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "api:GET /api/library", "table:media_assets", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-03 Search Projects, Library and artifacts

Find a saved file, image, document, artifact or project by name or prompt. Web and Desktop have one box in the Library ('Search files and projects') that asks the server. Mobile has 'Search library' (server for files, on-device for artifacts) and 'Search projects'. CLI and Chrome have none; VS Code is unverified.

Area: [34. Search experiences](README.md). Requirement items: [S34.04](../../10-requirements/capabilities/034-search-experiences.md#s3404), [S34.05](../../10-requirements/capabilities/034-search-experiences.md#s3405).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not stated on this page | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Filters the Library list down to items whose file name or generation prompt contains the typed text, within the chosen tab. On Web and Desktop it also filters project folders by name. On Mobile it also filters artifacts by title and content.

**Why it exists.** The Library collects uploads, generated files and artifacts and grows large; leaders offer a library or files search (doc: docs/product/competitive-guidance.md).

**Who uses it.** People who create many images, documents and artifacts.

**Problems it solves**

- Scrolling the whole Library for one generated image
- Finding an artifact again by what it was asked to make
- Finding a project folder quickly

**Use cases**

- Type 'logo' to find generated logos
- Open the Artifacts tab and search a prompt keyword
- Mobile user searches projects by description

## 2. User experience

**Where to find it**

- Web and Desktop: Library page; box placeholder 'Search files and projects' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002). /chat/artifacts redirects to /chat/library?surface=artifact (apps/web/app/chat/artifacts/page.tsx:8).
- Mobile: Library screen bottom bar 'Search library' (apps/mobile/src/features/library/index.tsx:1108) and the Projects tab 'Search projects' (apps/mobile/app/(app)/(tabs)/projects.tsx:451).
- CLI and Chrome: none. VS Code: not verified.

**Before you start**

- Signed in (library API needs a user).
- Mobile Library files come from the server, so they need a signed-in account; mobile artifacts and projects filter on the device.

**Screens and controls**

- Tabs: All, Images, Videos, Documents, Artifacts, Uploads, Generated files (LibraryView.tsx:92-99).
- Sort menu: Modified, Name, Size, Type (LibraryView.tsx:124-128).
- 'Recently deleted' view uses the same box (LibraryView.tsx:1035).
- Mobile filters: all, images, videos, documents, uploads, generated, artifacts, code, charts, research (index.tsx:93-116).

**Journey**

1. Open the Library and pick a tab.
2. Type in the search box; after a short pause the list reloads with items whose name or prompt contains the text.
3. Scroll for more (pages with a 'has more' flag).
4. Click or tap an item to open it. Clear the box to see everything again.

**What the person sees and gets**

- Filtered grid or list.
- No matches: 'No matches' and 'Nothing here matches that name. Try a shorter search.' (LibraryView.tsx:2227-2233).
- In Recently deleted: 'Recently deleted is empty' when nothing matches.
- Library could not load: 'The Library could not be reached. Pull to try again.' on Mobile (useLibraryAssets.ts:44).

**Settings**

- Library view mode (grid or list) is remembered per viewer (LibraryView.tsx:loadViewMode).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: debounced query sent as q to GET /api/library; server matches file name or prompt with escaped wildcards and returns pages with has_more and next_offset (packages/ui/unified-chat/src/components/library/LibraryView.tsx:445, :455; apps/web/app/api/library/route.ts:130-190; apps/web/lib/server/media-assets.ts:422-426).
- Query limited to 1-200 characters after trimming (packages/contracts/cloud-contracts/src/library.ts:107).
- Deleted items are listed only with deleted=true and within 30 days (media-assets.ts:429-431).
- Folders in the All tab are filtered by name on the device (LibraryView.tsx:850-856).
- Artifacts tab is the surface=artifact filter (LibraryView.tsx:455 via QUERY_BY_TAB; page.tsx:8).
- Mobile: Library files searched by the server with the same q parameter (apps/mobile/src/features/library/libraryClient.ts:90-105); debounce 350 ms (index.tsx:83, :216); artifacts filtered on the device by title, content, kind and language (index.tsx:353-360); Projects tab filters name and description on the device (projects.tsx:164-170).

**Incomplete**

- Web/Desktop artifact search matches file name and prompt only; the artifact text is not searched (media-assets.ts:422-426), while the brief's requirement says title or content.
- Mobile Library file results depend on the server, not only the device, contrary to the draft description (libraryClient.ts:90-105).

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI: no Library search (doc: area brief S34.04).
- Chrome: no Library search (doc: area brief S34.04).
- VS Code: brief marks artifacts as done; no Library search was found in the files read; not verified.

## 4. Required behaviour

**Established requirements**

- The Library has a search box that filters its items by name or prompt. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.04)
- The user can search artifacts by title or content and open a match. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.05)
- Search escapes special characters, returns pages with a has-more flag, and deleted items show only in the recently deleted view. (source: apps/web/lib/server/media-assets.ts:422-431; apps/web/app/api/library/route.ts:130-190)

**Acceptance criteria**

1. Typing 'logo' lists only items whose file name or prompt contains 'logo' (any case).
2. A query with % or _ matches those characters literally.
3. Items in Recently deleted do not appear in the normal view and do appear in the deleted view when they match.
4. Empty box shows all items for the tab.
5. With more than one page of matches, scrolling loads the next page and has_more stops at the end.
6. The Artifacts tab narrows to artifacts and the box still filters inside it.
7. Mobile: typing in 'Search library' filters images and artifacts; typing in 'Search projects' filters by name or description.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Artifact text should be searchable on Web as on Mobile [inferred from S34.05 'title/content'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add content search for artifacts on Web and Desktop through the indexed document search, which already has an artifact kind.
- [proposed] Update the brief: Mobile files are server searched.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Search box, debounce, tabs, sort, folder filter, empty states. |
| component | LibraryView (web wrapper) | `apps/web/features/library/components/LibraryView.tsx` | Wires the shared view to web endpoints and actions. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists items with q, kind, sort, surface, origin, deleted, limit, offset. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | SQL with escaped ilike on file name and prompt; lifecycle rules. |
| schema | LibraryListQuerySchema | `packages/contracts/cloud-contracts/src/library.ts` | Validates q (1-200), limit, offset, sort, kind. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Library rows (file name in metadata, prompt, deleted_at). |
| screen | Artifacts route redirect | `apps/web/app/chat/artifacts/page.tsx` | Redirects to the Library artifact filter. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Search bar, filters, on-device artifact filter. |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | Loads library pages with search, sort and scope. |
| service | libraryListPath / fetchLibraryPage | `apps/mobile/src/features/library/libraryClient.ts` | Builds /api/library?q= and validates the response. |
| store | libraryCacheStore | `apps/mobile/src/features/library/libraryCacheStore.ts` | Caches the default library page on the device. |
| screen | Mobile Projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | 'Search projects' filter by name and description. |
| service | buildMobileGlobalSearchGroups | `apps/mobile/src/features/search/mobileGlobalSearch.ts` | Library image and artifact matches in the chats-list search. |
| test | Web library route tests | `apps/web/app/api/library/__tests__/route.test.ts` | Route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: typing updates the input; after the debounce the query state changes and a new page is requested with q and tab filters. | device | LibraryView.tsx:445-460 |
| GET /api/library validates the query, scopes by user and workspace, runs the escaped ilike search and returns a page plus storage meters on the first page. | our servers | apps/web/app/api/library/route.ts:130-190 |
| The list shows items; folders are filtered by name locally. | device | LibraryView.tsx:850-856 |
| Mobile: files fetched from the same endpoint; artifacts filtered from stored and Cloud artifacts on the device. | device and our servers | libraryClient.ts:90-105; index.tsx:330-363 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Library items | table:media_assets and file storage | Server-side | Deleted items stay restorable 30 days (media-assets.ts:429-431) |
| Mobile library page cache | store:libraryCacheStore on the device | No | Cleared when the account changes [inferred from clearLibraryCache use] |

**Models and providers.** No model or provider takes part; the search is a database text match.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Rows limited to the signed-in user and workspace; rate limit group chat-conversation. |
| Subscription | none found in the code for searching the Library. Library storage and download meters are returned alongside but do not gate search. |
| Limits and metering | q length 1-200; page size from LIBRARY_DEFAULT_PAGE_SIZE; deleted window 30 days. |
| Feature flags | none found for the Web search box. Mobile uses FEATURES flags for some library actions (index.tsx imports FEATURES). |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode: artifacts are filtered by their mode (provenance scope) on the device; whether Library files are fetched in Local mode is unknown because useLibraryAssets.ts has no mode check. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Loading state while pages load; first-load flag hasResolvedPage. | LibraryView.tsx:402-405 |
| Empty with query | 'No matches' text. | LibraryView.tsx:2227-2233 |
| Empty library | 'Your library is empty'. | LibraryView.tsx:2229 |
| Error | Error state in the view; Mobile 'The Library could not be reached. Pull to try again.' | LibraryView.tsx:407; useLibraryAssets.ts:44 |
| Stale response | A request sequence number drops old responses. | LibraryView.tsx:424-440 |
| Invalid query | 400 validation error for q over 200 characters or blank. | route.ts:150-155; library.ts:107 |
| Offline | Mobile shows the cached default page only when there is no search or special sort; search itself needs the network. | useLibraryAssets.ts:141-147 |
| Timeout | not handled in the code beyond the generic error. | apps/mobile/src/features/library/useLibraryAssets.ts:44 (generic load error only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: Library list route (contents not read).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library view (contents not read).
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web Library wrapper (contents not read).
- `apps/mobile/__tests__/mobile-global-search.test.ts`: Library image and artifact matches in grouped mobile search.
- `apps/mobile/__tests__/library-hosted-client.test.ts`: Mobile Library client (contents not read).

**Test scenarios**

- **Name and prompt match**
  1. Generate an image with the prompt 'red logo'.
  2. Open the Library and type 'logo'.
  - Expected: The image appears; typing 'zzz' shows 'No matches'.
- **Wildcard characters**
  1. Search for '%'.
  - Expected: Only items containing a percent sign, not everything.
- **Recently deleted**
  1. Delete an item named 'old plan', search 'plan', then open Recently deleted.
  - Expected: Not in the normal list; present in Recently deleted.
- **Artifacts redirect**
  1. Open /chat/artifacts.
  - Expected: Library opens on the artifact filter.
- **Mobile artifact content**
  1. Create an artifact containing a unique word; open Library; type the word.
  - Expected: The artifact is listed even if the title lacks the word.
- **Web artifact content gap**
  1. Same on Web.
  - Expected: Expected per the brief to match; the code matches only name and prompt, so it is likely not listed (verify).

**Where to look when it fails**

- Server error from route 'Invalid query parameters'.
- Table media_assets; check deleted_at and temporary_chat flags.
- Mobile: 'The Library returned an unreadable response.' (libraryClient.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- VS Code: [70-qa/test-plans/vscode/034-search-experiences.md](../../70-qa/test-plans/vscode/034-search-experiences.md)

## 10. Gaps and dependencies

- **Artifact content is not searched on Web and Desktop.** Affects: Web and Desktop users. Evidence: apps/web/lib/server/media-assets.ts:422-426. Work needed: Search stored artifact text or reuse the indexed artifact kind.
- **No Library search in CLI and Chrome; VS Code unverified.** Affects: CLI, Chrome, VS Code. Evidence: doc: area brief S34.04, S34.05. Work needed: Decide whether those apps need a Library; verify VS Code.
- **Brief says mobile search is on-device but files are searched by the server.** Affects: Documentation; offline mobile users. Evidence: libraryClient.ts:90-105. Work needed: Correct the brief; decide offline behaviour.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- api:GET /api/library
- table:media_assets
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-authorization-and-workspaces

## Unknown

- Whether Mobile Library files load in Local mode.
- Whether VS Code has any Library or artifact search.
- Contents of the Library tests (names only).
- Workspace scoping inside listLibraryAssets (it receives a user-scoped db; not read).
- The path of the Desktop Tauri Library, if any.
