---
id: "F024-03"
type: "feature"
title: "Recent, favourite, shared and folder views"
aliases: ["Recent files", "Favourites", "Shared with me", "Folders", "Project folders", "S24.08", "S24.09", "S24.10", "S24.11"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.08", "S24.09", "S24.10", "S24.11"]
depends_on: ["F024-01", "F024-04", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "api:GET /api/projects", "surface:web", "surface:desktop"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-03 Recent, favourite, shared and folder views

There is no Recent, Favourites or Shared-with-me view. Recency is only the default sort 'Modified'. On web and Electron desktop, the All tab also shows the account's projects as folder tiles that open the project page. Mobile, CLI, VS Code and Chrome have none of these.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.08](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2408), [S24.09](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2409), [S24.10](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2410), [S24.11](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2411).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Aims to help a person return to recent files, starred files, files others shared, and files grouped in folders. Today the code gives only a newest-modified-first order and project tiles on web. (packages/contracts/cloud-contracts/src/library.ts:89; packages/ui/unified-chat/src/components/library/LibraryView.tsx:849-856)

**Why it exists.** The brief lists Recent-files, Favorites, Shared-with-me and Folder hierarchy as required views (S24.08-S24.11).

**Who uses it.** Signed-in web and desktop users who keep files in projects.

**Problems it solves**

- Getting back to the latest file.
- Jumping from the Library to the project that holds related work.

**Use cases**

- Open Library and see newest changed files first.
- Click a project tile on the All tab to open that project (apps/web/features/library/components/LibraryView.tsx:143-146).
- Use 'New' menu to create a project: goes to the projects page (apps/web/features/library/components/LibraryView.tsx:148).

## 2. User experience

**Where to find it**

- Web and Electron desktop: All tab, project tiles or rows above the files; 'New' menu in the header with 'Upload file' and a create-folder entry (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1100-1115,2010-2030).
- Recent: the sort menu, default 'Modified' (LibraryView.tsx:122-127).
- Mobile, CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in. Projects must exist and not be archived (apps/web/features/library/components/LibraryView.tsx:88-104).

**Screens and controls**

- Folder tile or row with name and item count (conversation count) (apps/web/features/library/components/LibraryView.tsx:88-104).
- Sort menu 'Sort by <label>' with Modified, Name, Size, Type (packages/ui/unified-chat/src/components/library/LibraryView.tsx:2065-2072).

**Journey**

1. Open Library on All tab.
2. Project tiles appear above files (if any projects exist and no search or deleted view).
3. Click a project; the browser goes to /chat/projects/<id>.
4. To see recent files, leave sort on Modified.

**What the person sees and gets**

- Folders are hidden on tabs other than All, in Recently deleted, and when the host gives no folder list (LibraryView.tsx:849-856).
- Search also filters folder names (case-insensitive contains) (LibraryView.tsx:849-856).

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web folder list: transport.listFolders pages through /api/projects with limit 100 and a cursor, drops archived or unnamed projects (apps/web/features/library/components/LibraryView.tsx:88-104,160-176).
- Opening a folder routes to /chat/projects/<id>; create goes to /chat/projects (same file:143-148).
- Folders are sorted by updatedAt desc for Modified and by name otherwise (packages/ui/unified-chat/src/components/library/LibraryView.tsx:360-368).
- Default sort is 'modified' = updated_at desc (apps/web/lib/server/media-assets.ts:367; library.ts:89).

**Incomplete**

- 'Recent' is by last update, not last use; opening a file does not change order. [inferred]
- A folder is a project, with no folder inside a folder and no files placed in it from the Library except via 'Add to project' (see S24.27, not in this feature).

**Present but disconnected or switched off**

- If a host does not pass listFolders, no folders show (LibraryView.tsx:527-540 effect guards on listFolders). Tauri DesktopLibrary passes none (DesktopLibrary.tsx transport memo).

**Not available**

- Favourites: no code found on any app.
- Shared-with-me: no code found; brief lists mobile, cli, vscode, chrome as missing.
- Folder hierarchy on mobile, CLI, VS Code, Chrome.
- A Recent view as a separate list.

## 4. Required behaviour

**Established requirements**

- A recent-files view surfaces files used or added most recently. (source: S24.08 (brief))
- Users can favourite files and view favourites. (source: S24.09 (brief))
- A Shared-with-me view lists items others shared with the user. (source: S24.10 (brief))
- Files can be organised in a folder hierarchy browsable in the Library. (source: S24.11 (brief))
- The Library also lists projects as folders; opening one goes to the project. (source: doc: apps/web/content/support/library.md)

**Acceptance criteria**

1. With default sort the most recently updated file is first.
2. On web All tab, each non-archived project shows as a folder tile that opens its project page.
3. Folders do not show on Images, Videos, Documents, Artifacts, Uploads, Generated files, or in Recently deleted.
4. Typing in search hides folders whose name does not match.
5. A favourite control and view: expected by the brief, expected absent today.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Recency by use would need a last-opened timestamp; none exists in the list contract (LibraryItemSchema has created_at and updated_at only). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Recent section ordered by last opened.
- [proposed] Add favourite flag column and a Favourites tab.
- [proposed] Decide whether projects are the folder model or add real folders.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Shared LibraryView folder logic | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | visibleFolders, sortFolders, folder tiles and rows. |
| component | Web LibraryView transport | `apps/web/features/library/components/LibraryView.tsx` | listFolders, openFolder, createFolder. |
| endpoint | GET /api/projects | `apps/web/app/api/projects` | Source of folder list (handler not opened). |
| screen | Project page | `apps/web/app/chat/projects` | Target of openFolder (/chat/projects/<id>). |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Default sort modified. |
| schema | LIBRARY_DEFAULT_SORT | `packages/contracts/cloud-contracts/src/library.ts` | Default sort constant. |
| component | NewMenu | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Header menu with Upload file and create folder. |
| test | Web LibraryView test | `apps/web/features/library/components/__tests__/LibraryView.test.tsx` | Lists account projects as folders and opens the project page. |
| component | DesktopLibrary | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri host with no folders. |
| other | Library support page | `apps/web/content/support/library.md` | Public description of projects as folders. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Shared view calls transport.listFolders once signed in and auth is ready. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:527-540 |
| Web fetches GET /api/projects?limit=100 repeatedly using the cursor. | device and our servers | apps/web/features/library/components/LibraryView.tsx:160-176 |
| Shared view filters by tab, deleted view and search, and sorts the folders on the device. | device | LibraryView.tsx:849-856,360-368 |
| Click navigates the browser to /chat/projects/<id>. | device | apps/web/features/library/components/LibraryView.tsx:143-146 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project list (id, name, updatedAt, conversationCount, isArchived) | Projects data on server (table not opened) | Server held | unknown |

**Models and providers.** None. Folders and recency do not call any model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | The projects API decides which projects are listed (not opened). |
| Subscription | none found in the code for these views. |
| Limits and metering | Folder fetch pages of 100. No other limit found. |
| Feature flags | none found in the code. |
| Model compatibility | Not affected. |
| Provider restrictions | none found in the code. |
| Local mode | Not available. Folders come from the server project list; the Tauri DesktopLibrary passes no folder list. Local project behaviour on desktop is out of this feature: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Folder fetch fails | Folders silently become an empty list; the file list is unaffected. | LibraryView.tsx:527-540 (catch sets folders to []) |
| Only folders, no files | Not treated as empty: empty state requires no folders too. | LibraryView.tsx isEmpty includes visibleFolders.length === 0 |
| Search active | Folders filtered by name; hidden if none match. | LibraryView.tsx:849-856 |
| Archived project | Skipped. | apps/web/features/library/components/LibraryView.tsx:94 |
| Mobile, CLI, VS Code, Chrome | No folder or recent view: not handled in the code. | docs/product/surface-feature-matrix.md:197-199; index.tsx has no folder code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Account projects listed as folders; opens the project page.
- `apps/web/app/api/library/__tests__/route.test.ts`: Default sort is most recently modified.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared list behaviour (folder-specific cases not confirmed).

**Test scenarios**

- **Recent order**
  1. Upload file A, then file B.
  2. Open Library with default sort.
  - Expected: B is above A.
- **Folder tile**
  1. Create a project.
  2. Open Library All tab.
  - Expected: A tile with the project name; click opens /chat/projects/<id>.
- **Folders hidden**
  1. Click Images, then Recently deleted.
  - Expected: No folder tiles.
- **Archived project**
  1. Archive a project.
  - Expected: Tile disappears.
- **Favourites**
  1. Look for any favourite control.
  - Expected: None exists today.

**Where to look when it fails**

- Network panel: /api/projects responses with cursor.
- No log lines found for folder loading.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **No Favourites view or control.** Affects: all apps. Evidence: S24.09 missing on all; no code found. Work needed: Data model, endpoint, UI.
- **No Shared-with-me view.** Affects: all apps. Evidence: S24.10; no code found. Work needed: Sharing model for files, then a view.
- **Recent means modified, not used.** Affects: web, desktop, mobile. Evidence: media-assets.ts:367. Work needed: Track last opened or add a Recent section.
- **No real folder hierarchy; only projects are shown as folders, only on web/Electron.** Affects: mobile, cli, vscode, chrome (none), web (flat). Evidence: LibraryView.tsx:849-856. Work needed: Decide folder model, add API.
- **Tauri desktop has no folder tiles.** Affects: desktop (Tauri). Evidence: DesktopLibrary.tsx transport memo. Work needed: Pass listFolders and openFolder.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-01
- F024-04
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- api:GET /api/projects
- surface:web
- surface:desktop

## Unknown

- Which table and rules the projects API uses.
- Whether the Electron desktop adds anything to the web Library page.
- Whether any favourite or sharing work is planned in docs/specs (not searched).
