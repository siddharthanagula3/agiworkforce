---
id: "F095-05"
type: "feature"
title: "Library catalog and storage use"
aliases: ["Library", "Files library", "Library catalog", "Recently deleted", "Storage meter", "media_assets", "file storage quota"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.03", "S95.04", "S95.16", "S95.23"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "F095-01", "F095-06", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-05 Library catalog and storage use

A list of a person's files and generated items with type, size, origin and conversation, with search, tabs, sort, Recently deleted and a meter of storage used against the plan. Web, desktop and mobile have a screen; the CLI can list. Storage counts Library files and project sources together.

Area: [95. File and Library components](README.md). Requirement items: [S95.03](../../10-requirements/capabilities/095-file-and-library-components.md#s9503), [S95.04](../../10-requirements/capabilities/095-file-and-library-components.md#s9504), [S95.16](../../10-requirements/capabilities/095-file-and-library-components.md#s9516), [S95.23](../../10-requirements/capabilities/095-file-and-library-components.md#s9523).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** GET /api/library lists the caller's media_assets rows, filtered and sorted, and on the first page adds storage and download meters (apps/web/app/api/library/route.ts:148-275). A shared view draws it (packages/ui/unified-chat/src/components/library/LibraryView.tsx:382).

**Why it exists.** Gives people one place for uploads and generated files and a clear view of how much storage the plan allows. Matches the leaders' Library [doc: docs/product/requirements.md:182].

**Who uses it.** Signed-in people on web, desktop, mobile and CLI.

**Problems it solves**

- Find a file from a past chat.
- Delete or restore files.
- See storage and download use.

**Use cases**

- Search for a PDF by name.
- Open Recently deleted to restore a file.
- See '1.2 GB of 4 GB file storage used'.
- List library items from the CLI.

## 2. User experience

**Where to find it**

- Web: page /chat/library (apps/web/app/chat/library/page.tsx:17).
- Desktop: Library panel in the desktop shell (apps/desktop/src/features/v3/DesktopShellV3.tsx:33,428); shows a sign-in state without a Cloud session (apps/desktop/src/features/library/DesktopLibrary.tsx:311-323).
- Mobile: Library screen, title 'Library' (apps/mobile/app/(app)/library/index.tsx; apps/mobile/src/features/library/index.tsx:837).
- CLI: library list, text and download (apps/cli/src/cloud/library.rs:87-110).
- VS Code and Chrome: none found; the docs matrix also says absent (doc: docs/product/surface-feature-matrix.md:197-199).

**Before you start**

- Cloud sign-in. The shared view does not fetch when signed out (test: packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx).

**Screens and controls**

- Search box 'Search files and projects' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002).
- Tabs: All, Images, Videos, Documents, Artifacts, Uploads, Generated files (:92-98).
- Sort menu, 'Recently deleted' toggle (:1035), 'Grid view' and 'List view'.
- New menu 'Add to the library' (:2010).
- Storage text '... of ... file storage used' (:951).
- Empty states 'Your library is empty' and 'Recently deleted is empty' (:2227-2230).
- Mobile: 'Search library', 'Retry', 'Library could not be loaded' (apps/mobile/src/features/library/index.tsx:1109,1244,1255).

**Journey**

1. 1. Open Library.
2. 2. The list loads the first page.
3. 3. Search, change tab or sort; the list reloads with those query values.
4. 4. Open a file to view, ask about it, download, delete (moves to Recently deleted) or restore.
5. 5. Check the storage line.

**What the person sees and gets**

- Items with thumbnails, size, source, conversation link.
- Delete confirmation: 'It moves to Recently deleted, where it stays restorable for 30 days before it is removed for good.' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:736).
- Over-limit upload message names the plan and limit (apps/web/lib/services/free-plan-entitlements.ts:37-46).

**Settings**

- View mode grid or list; remembered locally (changeViewMode; storage not read).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- List with kind, sort, surface, origin, search q, limit up to 200, offset (apps/web/app/api/library/route.ts:148-175; apps/web/lib/server/media-assets.ts:396-433).
- Trash view for files deleted within 30 days (apps/web/lib/server/media-assets.ts:432).
- Temporary chat files are excluded (apps/web/lib/server/media-assets.ts:432).
- Storage meter: media_assets plus active project sources (apps/web/lib/server/file-storage.ts:30-53); breakdown into documents and images (apps/web/app/api/library/route.ts:112); downloads meter (:100).
- Quota check on upload; null limit means no limit (apps/web/lib/server/file-storage.ts:64-76).
- Save an artifact into the Library with POST /api/library (apps/web/app/api/library/route.ts:229-275).
- Web view passes listFolders from the project list (apps/web/features/library/components/LibraryView.tsx:160).

**Incomplete**

- Search matches file name and prompt only (apps/web/lib/server/media-assets.ts:423-427); the placeholder says 'files and projects' because the view filters project names on the client (packages/ui/unified-chat/src/components/library/LibraryView.tsx:850-856).
- The decisions doc lists old plan storage numbers (free 100 MB); the catalog says 500 MiB for free (doc: docs/decisions/wire-or-cut.md:379; packages/contracts/types/src/billing-catalog.ts:619). Code wins.

**Present but disconnected or switched off**

- Desktop Library has no upload or folder entry (apps/desktop/src/features/library/DesktopLibrary.tsx:157-210).

**Not available**

- VS Code and Chrome library: none found. CLI is present in code (apps/cli/src/cloud/library.rs:7) though the docs matrix says absent: code wins.

## 4. Required behaviour

**Established requirements**

- File metadata (owner, type, size, source, conversation, lifecycle) is stored per file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.03)
- A Library catalog lists a user's files with filters, sort and search. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.16)
- Storage use is accounted against the plan allowance. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.23)
- Deleted files move to trash and can be restored within a window (30 days). (source: S95.24; apps/web/lib/resources/deletion-policies.ts:8)

**Acceptance criteria**

1. A new upload appears in All and Uploads within one reload.
2. A file attached in a temporary chat never appears.
3. Deleting a file moves it to Recently deleted; restore brings it back.
4. A file deleted over 30 days ago is not listed in Recently deleted.
5. On a plan with a limit, an upload that would exceed it is refused with the plan message and the meter is unchanged.
6. Free users see the storage line as the Library shows it (see the owner's Free usage decision in memory; not a repo source).
7. Search 'report' returns files whose name or prompt contains it, case-insensitive.
8. Signed-out hosts show a sign-in state, not an empty library.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Meter and enforcement should use the same sum (they do: sumFileStorageBytes).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the docs matrix agree with the code for web and CLI.
- [proposed] Show per-app status lines in the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/library | `apps/web/app/api/library/route.ts` | List, meters, save artifact. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | SQL listing and trash window. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | One row per file. |
| service | file-storage | `apps/web/lib/server/file-storage.ts` | Used bytes, allowance, assert, meter. |
| service | free-plan-entitlements | `apps/web/lib/services/free-plan-entitlements.ts` | Per-plan limit and message. |
| config | billing catalog limits | `packages/contracts/types/src/billing-catalog.ts` | knowledgeStorageBytes per plan. |
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | The screen and LibraryTransport contract. |
| component | Web LibraryView | `apps/web/features/library/components/LibraryView.tsx` | Web transport and folders from projects. |
| screen | Library page | `apps/web/app/chat/library/page.tsx` | Web route. |
| screen | DesktopLibrary | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Desktop transport and sign-in gate. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Mobile screen. |
| service | libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Mobile API client. |
| command | CLI library | `apps/cli/src/cloud/library.rs` | List, text, download. |
| endpoint | DELETE/POST /api/media | `apps/web/app/api/media/route.ts` | Soft delete, permanent delete, restore. |
| job | purge-deleted-media cron | `apps/web/app/api/cron/purge-deleted-media/route.ts` | Purges expired trash (registered at vercel.json:82). |
| config | deletion policies | `apps/web/lib/resources/deletion-policies.ts` | 30 day recovery window. |
| test | LibraryView tests | `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx` | Shared view. |
| test | media-assets tests | `apps/web/lib/server/__tests__/media-assets.test.ts` | Insert statements. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The view calls the host transport listPage with filters. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:254-258 |
| Server lists rows for the user and workspace, adds the meters. | our servers | apps/web/app/api/library/route.ts:148-200 |
| Delete sets deleted_at; the cron purges after the window. | our servers | apps/web/app/api/media/route.ts:87-88; vercel.json:82 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| File metadata row | table:media_assets | Via server to every app | Soft delete then purge after 30 days. |
| Mobile library cache | store:library-cache (apps/mobile/src/features/library/libraryCacheStore.ts) | Cache of server data | Rules not read. |

**Models and providers.** None; listing is a database read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud sign-in required. |
| Permissions | Rows are scoped to the user and the active workspace (apps/web/lib/server/media-assets.ts:396-433). |
| Subscription | Storage limit by plan; null means unlimited (apps/web/lib/server/file-storage.ts:70). Two catalog entries have unlimited storage (packages/contracts/types/src/billing-catalog.ts:585,602); decision doc says local-only and BYOK (doc: docs/decisions/wire-or-cut.md:379). |
| Limits and metering | Used bytes from media_assets and project_knowledge_files; download bytes metered separately (apps/web/app/api/library/route.ts:100). |
| Feature flags | None found. |
| Model compatibility | Not applicable. |
| Provider restrictions | None. |
| Local mode | The Library is a cloud list; Local-mode files on the device are not in it by anything read. Unknown whether a local file view exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading while auth resolves | Shows loading, not an empty account. | test title in packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx |
| Empty | Titles and copy for empty, no match and empty trash. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:2227-2236 |
| Error | Mobile shows 'Library could not be loaded' with Retry. | apps/mobile/src/features/library/index.tsx:1244-1255 |
| Signed out | Does not fetch; desktop shows its own gate. | apps/desktop/src/features/library/DesktopLibrary.tsx:323 |
| Meter read fails | Meter returns null parts and the list still works. | apps/web/lib/server/file-storage.ts:77-91 |
| Offline | not handled in the code read (mobile has a cache store). | apps/mobile/src/features/library/libraryCacheStore.ts exists; its rules were not read |
| Accessibility | Tab list, menu and toggles carry aria labels. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1003-1043 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Items from transport, storage and download caps, signed-out, loading, naming.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web host view.
- `apps/web/app/api/library/__tests__/library-item-open.test.ts`: Opening an item.
- `apps/web/lib/server/__tests__/media-assets.test.ts`: Insert statements.
- `apps/web/lib/server/__tests__/media-assets.restore.test.ts`: Restore.
- `apps/web/lib/server/__tests__/media-assets.permanent-delete.test.ts`: Permanent delete.
- `apps/web/lib/server/media-assets.workspace-scope.test.ts`: Workspace scoping.
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Desktop library.
- `apps/mobile/__tests__/library-hosted-client.test.ts`: Mobile client.
- `packages/contracts/cloud-contracts/src/__tests__/library.test.ts`: Library contract.

**Test scenarios**

- **Upload then list**
  1. Upload a PDF in chat.
  2. Open Library, tab Uploads.
  - Expected: The PDF is listed with size and conversation.
- **Trash and restore**
  1. Delete it.
  2. Open Recently deleted.
  3. Restore.
  - Expected: Back in All.
- **Temporary chat**
  1. Attach a file in a temporary chat.
  - Expected: Not in Library.
- **Quota**
  1. On a small-limit account fill storage.
  2. Upload one more.
  - Expected: Plan-specific refusal.
- **CLI list**
  1. Run the CLI library list.
  - Expected: A page with next offset.

**Where to look when it fails**

- Log 'Library storage breakdown could not be read' and 'File storage meter: usage read failed'.
- media_assets deleted_at and temporary_chat columns.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief gives no per-app status; docs matrix wrong for web and CLI.** Affects: Planning. Evidence: docs/product/surface-feature-matrix.md:50,194,197 versus apps/web/app/chat/library/page.tsx and apps/cli/src/cloud/library.rs. Work needed: Regenerate the matrix.
- **Desktop Library lacks upload.** Affects: surface:desktop. Evidence: apps/desktop/src/features/library/DesktopLibrary.tsx:157-210. Work needed: Decide whether to pass uploadFiles.
- **Search ignores file content.** Affects: All. Evidence: apps/web/lib/server/media-assets.ts:423-427. Work needed: Product decision.
- **Decisions doc storage numbers are stale.** Affects: Readers. Evidence: docs/decisions/wire-or-cut.md:379 vs billing-catalog.ts:619. Work needed: Correct the doc.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- F095-01
- F095-06
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli

## Unknown

- Per-app visible labels beyond those listed.
- Whether desktop and mobile show the storage meter.
- Where view mode is remembered.
- Mobile cache rules.
- Plan names mapped to each storage number.
