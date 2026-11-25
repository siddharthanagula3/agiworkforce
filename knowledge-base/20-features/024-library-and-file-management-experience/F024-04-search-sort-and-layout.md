---
id: "F024-04"
type: "feature"
title: "Search, sort and layout"
aliases: ["Library search", "Sort", "Grid/list toggle", "Library layout", "Search files and projects", "S24.12", "S24.13", "S24.19"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.12", "S24.13", "S24.19"]
depends_on: ["F024-01", "F024-03", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-data-model-and-migrations", "table:media_assets", "api:GET /api/library", "surface:web", "surface:mobile", "surface:desktop"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-04 Search, sort and layout

Find a file by name or by the prompt that made it, order the list, and switch between a thumbnail grid and a row list. Web and Electron desktop have all three. Mobile has debounced search and sort, grid only. CLI, VS Code and Chrome have none.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.12](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2412), [S24.13](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2413), [S24.19](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2419).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Searches the server list by file name and generation prompt, sorts on the server, and lets the web person choose grid or list. (apps/web/lib/server/media-assets.ts:366-376,415-436; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002-1058)

**Why it exists.** A large Library cannot be browsed by scrolling. The brief asks for search, grid/list and sorting (S24.12, S24.13, S24.19).

**Who uses it.** Signed-in people on web, Electron desktop and mobile.

**Problems it solves**

- Finding a generated image by remembering the prompt.
- Finding the largest files.
- Reading many names at once in list view.

**Use cases**

- Type 'invoice' in the search box.
- Sort by Size to clean up storage.
- Switch to List view to see name, modified and size columns (apps/web/features/library/components/__tests__/LibraryView.test.tsx).
- On mobile, open Library options, then 'Sort saved files', and choose 'Oldest first'.

## 2. User experience

**Where to find it**

- Web and Electron desktop: search input with placeholder 'Search files and projects' (aria-label 'Search the library by name'); sort menu 'Sort the library'; group 'Library layout' with 'Grid view' and 'List view' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002-1058,2072).
- Mobile: bottom bar 'Search library' (testID library-search); header button 'Library options' opens 'Library' sheet with 'Select saved files', 'Sort saved files', 'Recently deleted' (apps/mobile/src/features/library/index.tsx:266-290,1107-1115,842-860).
- CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in.

**Screens and controls**

- Web sort options: Modified, Name, Size, Type (LibraryView.tsx:122-127).
- Mobile sort options: Recently added, Oldest first, Type, Name, Size, with note 'Artifacts keep their own order.' (index.tsx:80-86,242-256).
- Mobile search is replaced by selection buttons while selecting (index.tsx:1060-1110).

**Journey**

1. Open Library.
2. Type in search; after a short pause the list reloads (web: SEARCH_INPUT_DEBOUNCE_MS from @agiworkforce/utils; mobile: 350 ms).
3. Open the sort menu and pick an order; the list reloads from the first page.
4. On web, click the grid or list icon; the choice is saved in this browser.

**What the person sees and gets**

- No match on web: 'No matches' and 'Nothing here matches that name. Try a shorter search.' (LibraryView.tsx:2226-2240).
- Mobile no match: 'Nothing in <filter> matches “<query>”' (index.tsx:1262-1287).
- Mobile search failure: 'Search could not be completed' (index.tsx:1245-1250).

**Settings**

- localStorage key 'agi-library-view-mode' with values grid or list; default grid; errors reading it fall back to grid (LibraryView.tsx:131-147).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server search: case-insensitive contains on metadata filename and on prompt, with % _ and backslash escaped; query max 200 characters (apps/web/lib/server/media-assets.ts:374-376,422-426; packages/contracts/cloud-contracts/src/library.ts:107).
- Server sort: modified (updated_at desc), oldest (created_at asc), name, size (desc, nulls last), type (mime then name), each with id desc as tie-break (media-assets.ts:366-372,433-436).
- Recently deleted view ignores the chosen sort and uses deleted_at desc (media-assets.ts:364,433-436).
- Web: debounced search sends q; sort change re-requests; request counter drops stale answers (LibraryView.tsx:445-507).
- Web grid and list with persisted choice (LibraryView.tsx:131-147,1043-1058; LibraryGrid and LibraryList components).
- Mobile: 350 ms debounce and server search and sort; artifacts are searched locally on title, content, kind, language (index.tsx:216,328-362).
- Web search also filters folders (see F024-03).

**Incomplete**

- Web offers Modified, Name, Size, Type but not 'oldest', which the server supports (LibraryView.tsx:122-127 vs library.ts:87).
- Mobile sort does not reorder artifacts ('Artifacts keep their own order.') (index.tsx:242-256).
- Mobile has no list layout; grid columns follow screen width and text size (index.tsx:170-176).

**Present but disconnected or switched off**

- Mobile sort 'Type' and others reach the server through libraryListPath, which sends sort (libraryClient.ts:84-96).

**Not available**

- Grid/list toggle on mobile.
- Search, sort and layout on CLI, VS Code, Chrome (the CLI artifact list has --limit and --project only, apps/cli/src/lib.rs:1359-1368).

## 4. Required behaviour

**Established requirements**

- Users can switch the Library between grid and list layouts. (source: S24.12 (brief))
- Users can search the Library by name. (source: S24.13 (brief))
- Users can sort the Library by name, date, size or type. (source: S24.19 (brief))
- Search characters % _ and backslash are escaped. (source: apps/web/lib/server/media-assets.ts:374-376)

**Acceptance criteria**

1. Typing a name part returns only rows whose filename or prompt contains it, case-insensitively.
2. Searching '50%' does not match every row.
3. Each sort option returns the documented order, with ties stable by id.
4. Grid or list choice survives a page reload in the same browser.
5. Search longer than 200 characters is rejected by validation.
6. On mobile, changing sort refetches from the first page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile list layout is required by S24.12, which marks mobile missing. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer 'Oldest first' on web.
- [proposed] Search file contents (not only names).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Shared LibraryView search and toolbar | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Search input, tab row, SortMenu, layout toggle. |
| component | SortMenu | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Role=menu sort panel using useMenuKeyboard. |
| component | LibraryGrid / LibraryList | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | The two layouts. |
| store | agi-library-view-mode | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Browser localStorage key for layout. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Search ILIKE and ORDER BY. |
| schema | LibraryListQuerySchema, LIBRARY_SORTS | `packages/contracts/cloud-contracts/src/library.ts` | q max 200, sort enum. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Carries q and sort. |
| config | SEARCH_INPUT_DEBOUNCE_MS | packages/utils (not found) (not found) | Web search delay constant (value not opened). |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | Search debounce, sort sheet, local artifact search. |
| component | BottomSearchBar | `apps/mobile/src/shared/components/BottomSearchBar.tsx` | Mobile search field. |
| service | libraryListPath | `apps/mobile/src/features/library/libraryClient.ts` | Builds q, sort, origin, kind, deleted, limit, offset. |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | Refetches on search and sort change. |
| test | LibraryBottomSearch test | `apps/mobile/__tests__/LibraryBottomSearch.test.tsx` | Mobile search and sort. |
| test | Web route test | `apps/web/app/api/library/__tests__/route.test.ts` | Search and sort SQL. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types; the input value waits for the debounce, then becomes the query. | device | LibraryView.tsx:445; index.tsx:216 |
| Client adds q and sort to the page request and resets to offset 0. | device | LibraryView.tsx:448-462 |
| Server runs ILIKE on filename and prompt and orders per ORDER_CLAUSE_BY_SORT. | our servers | apps/web/lib/server/media-assets.ts:422-440 |
| Layout choice saved to localStorage; no server call. | device | LibraryView.tsx:131-147 |
| Mobile filters artifact rows locally on the device. | device | index.tsx:328-362 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search text and sort choice | Component state only; not saved | No | Lost on leaving the screen; mobile resets filter to All when leaving (index.tsx:226-231). |
| Layout mode | localStorage agi-library-view-mode | No, per browser | Kept until browser data is cleared |

**Models and providers.** None. Search is a database text match; it is not semantic and calls no model. The prompt field searched is the generation prompt stored on the row.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Search is limited to the user's own rows and active organization. |
| Subscription | none found in the code. |
| Limits and metering | Query length 200; page size 24 default, 100 max; rate group chat-conversation. |
| Feature flags | none found in the code. |
| Model compatibility | Not affected. |
| Provider restrictions | none found in the code. |
| Local mode | Search covers cloud-stored files and, on mobile, artifacts on the device filtered to the app mode (index.tsx:320-362). Local files outside the Library are not searched. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading while typing | Older response dropped via request counter. | LibraryView.tsx:466-507 |
| No match | 'No matches' on web, per-filter message on mobile. | LibraryView.tsx:2226-2240; index.tsx:1262-1287 |
| Search failure | Mobile 'Search could not be completed' with Retry; web error box. | index.tsx:1245-1250; LibraryView.tsx:1068-1082 |
| Storage blocked | Layout read or write failure falls back to grid, no error. | LibraryView.tsx:131-147 |
| Sort during Recently deleted | Ignored; deleted_at desc. | media-assets.ts:364,433-436 |
| Accessibility | Search has aria-label; layout buttons have labels and pressed state; sort menu supports keyboard via useMenuKeyboard. | LibraryView.tsx:1003,1043-1058 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: Sort order, default sort, deleted bin ordering, ILIKE search with escaped wildcards.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Debounced q sent, sort re-fetch, list view columns.
- `apps/mobile/__tests__/LibraryBottomSearch.test.tsx`: Search below grid, filtering and clearing, sort requested from server.
- `apps/mobile/__tests__/LibrarySearchDeepLink.test.tsx`: Search deep link (title only).
- `apps/mobile/__tests__/LibraryAssetsError.test.tsx`: Refetch from first page when sort changes.
- `packages/contracts/cloud-contracts/src/__tests__/library.test.ts`: Query schema defaults and bounds.

**Test scenarios**

- **Prompt search**
  1. Generate an image with a distinctive prompt.
  2. Search a word from the prompt.
  - Expected: The image appears.
- **Wildcard**
  1. Search '%'.
  - Expected: Only rows containing a literal percent sign match.
- **Sort by size**
  1. Choose Size.
  - Expected: Largest file first; rows with no size last.
- **Layout persistence**
  1. Click List view.
  2. Reload.
  - Expected: List view persists.
- **Mobile sort**
  1. Library options, Sort saved files, Oldest first.
  - Expected: Oldest saved files first; artifacts order unchanged.

**Where to look when it fails**

- Validation error text from LibraryListQuerySchema for q over 200 characters.
- localStorage key agi-library-view-mode in browser storage.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **No grid/list switch on mobile.** Affects: mobile. Evidence: S24.12 mobile missing; no switch in index.tsx. Work needed: Add a list layout and a toggle.
- **Web lacks Oldest first.** Affects: web, desktop. Evidence: LibraryView.tsx:122-127 vs library.ts:87. Work needed: Add option.
- **Mobile sort does not apply to artifacts.** Affects: mobile. Evidence: index.tsx:242-256. Work needed: Sort merged rows or explain.
- **Search covers names and prompts only, not contents.** Affects: all. Evidence: media-assets.ts:422-426. Work needed: Index content if wanted.
- **No search or sort in CLI, VS Code, Chrome artifact lists.** Affects: cli, vscode, chrome. Evidence: apps/cli/src/lib.rs:1359-1368. Work needed: Add q and sort or accept.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-01
- F024-03
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-data-model-and-migrations
- table:media_assets
- api:GET /api/library
- surface:web
- surface:mobile
- surface:desktop

## Unknown

- Value of SEARCH_INPUT_DEBOUNCE_MS (package not opened).
- Whether the database has an index that makes ILIKE search fast at scale.
- Whether Electron desktop adds local storage for layout beyond the web page.
