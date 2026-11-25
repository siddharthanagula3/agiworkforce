---
id: "F024-07"
type: "feature"
title: "Rename, duplicate and move a file"
aliases: ["Rename a file", "Duplicate a file", "Move to folder", "S24.24", "S24.25", "S24.26"]
area: "24 Library and file-management experience"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.24", "S24.25", "S24.26"]
depends_on: ["F024-08", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "table:media_assets", "api:GET /api/library", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-07 Rename, duplicate and move a file

Rename, duplicate and move-to-folder for Library files are not built on any app. A file's name comes from stored metadata or from its kind and type, and the Library has no folders of its own. The only folder-like items are projects, and 'Add to project' copies a file there.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.24](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2424), [S24.25](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2425), [S24.26](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2426).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person change a Library file's name, make a copy of it, or put it in a folder. Today none of the three exists, on any app.

**Why it exists.** The brief lists them as required Library actions (S24.24 Rename, S24.25 Duplicate, S24.26 Move to folder) so people can keep their files tidy, like in the leader products. (doc: knowledge-base/data/area-briefs/024-library-and-file-management-experience.md)

**Who uses it.** People with many uploaded and generated files who want to organise them. Nobody can use it yet.

**Problems it solves**

- Planned: files with a generic or repeated name could be given a clear name.
- Planned: a file could be reused without touching the original.
- Planned: files could be grouped. Today the only grouping is a project, reached by copying.

**Use cases**

- Rename a generated report called 'document.pdf' to 'Q3 report.pdf'.
- Duplicate a spreadsheet before editing it.
- Move several uploads into a 'Taxes' folder.
- Today instead: copy a file into a project with 'Add to project'.

## 2. User experience

**Where to find it**

- Not available on web, desktop, mobile, CLI, VS Code or Chrome. The row menu on web lists Download, Add to chat, Add to Work, Open chat, Remix, Add to project, Share link and Delete only (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1775-1879).
- Mobile action menu lists Add to chat, Remix, Open chat, Share, Report and Delete (apps/mobile/src/features/library/index.tsx:623-655).

**Before you start**

- None, because the action does not exist.

**Screens and controls**

- Web row menu 'Actions for <file name>' has no Rename, Duplicate or Move item (LibraryView.tsx:1775-1879).
- Web 'New' menu offers Upload and Create folder, where Create folder only navigates to the Projects page (apps/web/features/library/components/LibraryView.tsx:101,147).
- Mobile menu has no rename or move entry (index.tsx:623-655).

**Journey**

1. Open Library.
2. Open a file's action menu.
3. Look for Rename, Duplicate or Move: none appears.
4. Workaround: choose 'Add to project' on web, which uploads a copy into a project (F024-08).

**What the person sees and gets**

- No feedback: no control exists.
- The name shown is read-only: metadata filename, else kind plus extension from the mime type, else kind (apps/web/app/api/library/route.ts:44-49).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Display-name derivation from metadata filename or kind plus extension (apps/web/app/api/library/route.ts:44-49).
- Projects are listed as 'folders' in the Library and opening one navigates to the project page (apps/web/features/library/components/LibraryView.tsx:99-101,160-178).
- 'Add to project' copies a file into a project (apps/web/features/library/components/LibraryView.tsx:234-240).

**Incomplete**

- Library 'folders' are projects, not user-made folders, and a file is never moved: the original stays in the Library [inferred from addToProject uploading a copy].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Rename on web, desktop, mobile, CLI, VS Code, Chrome (brief S24.24: all missing).
- Duplicate on all six apps (brief S24.25).
- Move to folder on all six apps (brief S24.26).
- No write endpoint exists: apps/web/app/api/media/route.ts exports GET, DELETE, POST (restore) only (apps/web/app/api/media/route.ts:90-92); apps/web/app/api/library/route.ts exports GET and POST (save artifact) only (route.ts:276-277).

## 4. Required behaviour

**Established requirements**

- Users can rename a Library file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.24)
- Users can duplicate a Library file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.25)
- Users can move a file into a folder. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.26)
- Files can be organised in a folder hierarchy browsable in the Library (needed for move). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.11)

**Acceptance criteria**

1. Row menu on each app shows Rename, Duplicate and Move to folder for an owned file.
2. Rename changes the shown name in the grid, list, viewer and search results and persists after reload.
3. Duplicate creates a second Library row with the same bytes and a distinct id, and storage used rises by the file size.
4. Move places the file in the chosen folder and the folder view lists it.
5. Each action works from the web and from the mobile app on the same account.
6. Actions are refused for a file in Recently deleted.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Rename needs a new write path on media_assets metadata, because the name is read from metadata filename today [inferred from route.ts:44-46].
- Duplicate must pass the storage allowance check, because stored bytes are summed against the plan limit (apps/web/lib/server/file-storage.ts:77-95) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a PATCH endpoint under the media route for rename that validates length and strips path characters.
- [proposed] Decide first whether Library folders and projects are one concept; the brief lists folders as a separate missing item (S24.11).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists items; derives the read-only name in fileNameForRow (lines 44-49). |
| endpoint | POST /api/library | `apps/web/app/api/library/route.ts` | Saves an artifact as a file; the only create path here, not a duplicate (lines 234-274). |
| endpoint | /api/media (GET, DELETE, POST) | `apps/web/app/api/media/route.ts` | List, soft or permanent delete, restore. No rename or move. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Reads media_assets rows for the Library (line 396). |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | One row per Library file; name lives in metadata filename (route.ts:45). |
| component | Shared LibraryView and RowMenu | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Row menu with no rename, duplicate or move items (lines 1775-1879). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Builds the transport; listFolders reads projects (line 160); createFolder routes to Projects (line 147). |
| component | DesktopLibrary (internal Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Transport has list, delete, restore, permanent delete, preview only (lines 158-195). |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | Action menu without rename or move (lines 623-655). |
| service | Mobile library client | `apps/mobile/src/features/library/libraryClient.ts` | Only list, delete, restore, permanent delete and media-job calls (lines 53-191). |
| schema | LibraryItemSchema | `packages/contracts/cloud-contracts/src/library.ts` | Wire shape of a Library item; has file_name but no folder id field (lines 60-100). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens the Library; the app fetches the list from the server. | device and our servers | apps/web/features/library/components/LibraryView.tsx:128-129; apps/web/app/api/library/route.ts:148-212 |
| The server builds each item's name from metadata filename, or kind plus extension. Nothing writes a new name. | our servers | apps/web/app/api/library/route.ts:44-49,66-89 |
| The only move-like action, 'Add to project', downloads the bytes to the browser and uploads them again to a project. | device and our servers | apps/web/features/library/components/LibraryView.tsx:234-240 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Display name | media_assets.metadata filename key; not editable | Served by the cloud list to web and mobile | Follows the file; soft-deleted for 30 days then purged (apps/web/app/api/cron/purge-deleted-media/route.ts:35) |

**Models and providers.** No model or provider takes part. Rename, duplicate and move do not exist, and the list is not model dependent.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Library list needs a signed-in account (apps/web/features/library/components/LibraryView.tsx:116-117). Feature itself: none found in the code. |
| Permissions | Not applicable; the list is scoped to user and active workspace (apps/web/lib/server/media-assets.ts:403-445). |
| Subscription | none found in the code for this feature. |
| Limits and metering | none found in the code for rename or move. A future duplicate would count against file storage (apps/web/lib/server/file-storage.ts:34-60) [inferred]. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Not available. The Library list is a cloud service; mobile Local mode hides Add to chat, which is cloud only (apps/mobile/src/features/library/index.tsx:626). Whether Local mode shows any file list: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Web shows 'Sign in to see your library'; no actions. | apps/web/features/library/components/LibraryView.tsx:106-125 |
| Name missing in metadata | Shows kind plus extension, for example image.png, or just the kind. | apps/web/app/api/library/route.ts:44-49 |
| Rename, duplicate or move failure, retry, cancel | not handled in the code | No such action found in LibraryView.tsx or index.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Display naming: a generated image is named by its prompt, and an item with no prompt keeps its stored filename (lines 139,155). Nothing on rename, duplicate or move.
- `apps/web/app/api/library/__tests__/route.test.ts`: List route behaviour; no rename route.

**Test scenarios**

- **No rename control on web**
  1. Sign in on web.
  2. Open Library.
  3. Open Actions for any file.
  - Expected: Menu has no Rename, Duplicate or Move item (current behaviour).
- **No rename control on mobile**
  1. Open Library on mobile.
  2. Open a file's action menu.
  - Expected: No Rename, Duplicate or Move entry.
- **Copy by project**
  1. On web choose Add to project on a file.
  2. Pick a project.
  - Expected: Toast 'Added to <project>'; the original remains in the Library.

**Where to look when it fails**

- Check the media_assets row metadata filename if a name looks wrong.
- A 404 on a PATCH to /api/media confirms no write path exists.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Rename is missing** Affects: All users on all six apps. Evidence: Brief S24.24; no write path in apps/web/app/api/media/route.ts:90-92. Work needed: Add an authenticated, CSRF-protected rename endpoint plus a menu item and a text input on web and mobile.
- **Duplicate is missing** Affects: All users, all apps. Evidence: Brief S24.25. Work needed: Add a server copy of the stored bytes with a storage allowance check, and a menu item.
- **Move to folder is missing, and the Library has no folders of its own** Affects: All users, all apps. Evidence: Brief S24.11 and S24.26; folders are projects (apps/web/features/library/components/LibraryView.tsx:99-101). Work needed: Decide the folder model, add a folder column or table, add the move action and a folder view.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-08
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- table:media_assets
- api:GET /api/library
- surface:web
- surface:mobile

## Unknown

- Whether mobile Local mode lists any on-device files.
- Whether the Electron Desktop opens the same web Library page; AGENTS.md section 5 says the public Desktop shows the hosted web app.
- Whether product owners want Library folders to be the same as projects.
