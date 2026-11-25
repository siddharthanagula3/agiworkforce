---
id: "F095-08"
type: "feature"
title: "Delete, trash and restore"
aliases: ["Delete, trash and restore", "Recently deleted", "Trash", "Delete permanently", "Retention cleanup (S95.25)", "Derivative-resource cleanup (S95.26)", "Source-deletion propagation (S95.28)", "purge-deleted-media cron"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.24", "S95.25", "S95.26", "S95.28"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:media_assets", "table:file_lineage", "table:project_knowledge_files", "api:DELETE /api/media", "api:POST /api/media", "F095-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-08 Delete, trash and restore

Deleting a Library file hides it and keeps it for 30 days under 'Recently deleted', where it can be restored or deleted permanently. A daily job then erases stored bytes and rows, plus indexes and lineage built from them. A legal hold stops erasure. Web, Desktop and Mobile call the same server routes.

Area: [95. File and Library components](README.md). Requirement items: [S95.24](../../10-requirements/capabilities/095-file-and-library-components.md#s9524), [S95.25](../../10-requirements/capabilities/095-file-and-library-components.md#s9525), [S95.26](../../10-requirements/capabilities/095-file-and-library-components.md#s9526), [S95.28](../../10-requirements/capabilities/095-file-and-library-components.md#s9528).

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

**What it does.** Soft delete sets deleted_at on a media asset (apps/web/lib/server/media-assets.ts:693); restore clears it only inside 30 days (:711-724); permanent delete erases bytes and row, but only for a file already in the trash (:756-803); a daily cron purges files older than 30 days with their bytes and derived records (apps/web/app/api/cron/purge-deleted-media/route.ts:165-224).

**Why it exists.** Users need to undo mistakes, and the company must eventually remove bytes and everything derived from them. The deletion policy file states the 30-day window once for every caller (apps/web/lib/resources/deletion-policies.ts:8, :222-262). AGENTS.md section 9 requires that removed files go to a recoverable state first.

**Who uses it.** Any signed-in user of the Library on web, Desktop or Mobile; operators who run the cron; legal-hold administrators.

**Problems it solves**

- Accidental deletion is recoverable for 30 days.
- Stored bytes do not stay forever after deletion.
- Search index rows, lineage edges and generation jobs do not outlive their file.
- A preserved record under legal hold is not destroyed (route.ts:249-266).

**Use cases**

- User deletes a file, opens Recently deleted and restores it.
- User permanently deletes a file from Recently deleted after a confirmation naming the loss.
- Cron purges a file deleted 31 days ago and its index and lineage rows.
- User removes a project source file and the source stops appearing in answers.

## 2. User experience

**Where to find it**

- surface:web: Library page, toolbar toggle 'Recently deleted', row menu items 'Delete', 'Restore', 'Delete permanently' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1035, :1784, :1878; mounted at apps/web/app/chat/library/page.tsx).
- surface:desktop: the same shared LibraryView in DesktopLibrary, calling the cloud API (apps/desktop/src/features/library/DesktopLibrary.tsx:137-160).
- surface:mobile: Library screen with 'Recently deleted', 'Restore' and an alert 'Delete permanently?' (apps/mobile/src/features/library/index.tsx:284, :592, :615).
- surface:cli, surface:vscode, surface:chrome: no call to /api/media found in apps/cli; the other two folders were not found, unknown.
- Project source files: DELETE on the project knowledge file route; where the button sits was not located.

**Before you start**

- Signed in with Cloud access; DesktopLibrary sets isSignedIn true and uses the cloud base URL (DesktopLibrary.tsx:137-141).
- The file belongs to the user in the active workspace (media-assets.ts:693-707).

**Screens and controls**

- Row action menu 'Actions for <file name>' with Delete (or, in the trash view, Restore and Delete permanently) (LibraryView.tsx:1768-1880).
- Confirmation for Delete: title 'Delete <name>?', text 'It moves to Recently deleted, where it stays restorable for 30 days before it is removed for good.' (LibraryView.tsx:731-742).
- Confirmation for permanent delete: 'Permanently delete <name>?', text 'The stored bytes are erased now. Nothing restores this file, and anything linking to it stops resolving.' button 'Delete permanently' (LibraryView.tsx:744-756).
- Empty trash text 'Recently deleted is empty' with 'Deleted files wait here for 30 days before they are removed for good.' (LibraryView.tsx:2227-2234).

**Journey**

1. Open the Library and open a file's menu.
2. Choose Delete and confirm.
3. The row leaves the list; the file is now in Recently deleted.
4. Turn on 'Recently deleted' to see deleted files (each carries an erase_after date from the server).
5. Choose Restore to bring it back, or Delete permanently and confirm.
6. If nothing is done, the daily job erases it after 30 days.

**What the person sees and gets**

- The row is removed from the page on success (LibraryView.tsx:630-641).
- On failure a row error such as 'Delete failed. Try again.' or the server message appears (LibraryView.tsx:637).
- Mobile throws 'The file could not be deleted. Try again.' or '...restored...' when the server returns success false (apps/mobile/src/features/library/libraryClient.ts:152-175).
- Trash rows expose erase_after = deleted_at + 30 days (apps/web/app/api/library/route.ts:60-62, :87).

**Settings**

- The 30-day window is fixed code (RESOURCE_RECOVERY_WINDOW_DAYS, deletion-policies.ts:8); a workspace retention setting exists elsewhere (apps/web/app/api/settings/organization/retention) but whether it changes the file window was not read (unknown).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- DELETE /api/media soft deletes by default; permanent=true is the only other accepted value (apps/web/app/api/media/route.ts:20-24, :45-66).
- POST /api/media restores (route.ts:68-88; media-assets.ts:711-730).
- Trash list: /api/library?deleted=true returns files deleted within 30 days (library/route.ts:168; media-assets.ts:432).
- Permanent delete runs in a transaction, locks the row, refuses a legally held file, deletes stored object then row, then purges derived records (media-assets.ts:756-803).
- Daily cron at 04:00 (vercel.json:82-83) purges up to 500 expired assets per run in batches of 50 per workspace, deleting objects first and keeping rows whose object delete failed (route.ts:37, :165-224).
- A second cron purges other soft-deleted resource tables by policy (vercel.json:86-87; apps/web/lib/resources/purge-soft-deleted.ts:98).
- Retrieval index rows are forgotten by trigger when deleted_at is set (apps/web/db/neon/0202_retrieval_index.sql:399; project files :360).
- Project source delete soft deletes the file and refuses held content (apps/web/lib/server/project-deletion.ts:43-70).
- Project delete via sync releases the project's files (apps/web/app/api/projects/sync/route.ts:240; project-deletion.ts:93).

**Incomplete**

- Permanent delete only works on a file already in the trash: the SQL scope requires deleted_at is not null (media-assets.ts:768). A request with permanent=true on a live file returns success false with HTTP 200 instead of deleting it at once. The first draft said it removes the file at once; that is not what the code does.
- Restore of a project source file: no route found; only DELETE and GET on the file route (knowledge-files/[fileId]/route.ts:96-97).
- DELETE and POST return HTTP 200 with success false when nothing matched (route.ts:66, :86), so callers must read the body; the shared web client path uses requireSuccessfulMutation, whose body check was not read (unknown).

**Present but disconnected or switched off**

- none found.

**Not available**

- surface:cli: no trash or restore call found.
- surface:vscode and surface:chrome: unknown (no app folders at those paths).
- Local-device trash in mode:local: not searched; the Library views read the cloud API only.

## 4. Required behaviour

**Established requirements**

- Deleted files move to trash and can be restored within a window. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.24)
- Expired trash and retention windows are purged, including stored objects. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.25)
- Derived resources (indexes, jobs, lineage, thumbnails) are cleaned up with their source. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.26)
- Deleting a source file withdraws everything derived from it (index chunks, context). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.28)
- An irreversible action asks first and names the consequence; an agent never destroys user data on its own; removal goes to a recoverable state first. (source: AGENTS.md section 9 (project instructions))

**Acceptance criteria**

1. Delete moves the file to Recently deleted and it disappears from the main list and from /api/files/{id} (404).
2. Restore inside 30 days brings it back; after 30 days restore returns success false.
3. Permanent delete on a live file does not remove it; on a trashed file it erases object and row.
4. The cron removes objects and rows older than 30 days and reports counts; a file under legal hold is counted as heldFromPurge and kept.
5. If object deletion fails, the row is kept for the next run.
6. After purge, file_lineage edges naming the file on either side are gone.
7. Cron without valid secret returns 401 and touches nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A user-facing confirmation exists for both delete types on the shared Library view [inferred from useConfirmAction use at LibraryView.tsx:731-756].
- The window shown in confirm text should come from the same constant as the server window [inferred]; the text hardcodes 30 days.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make permanent=true on a live file either soft delete first or return a clear error rather than success false.
- [proposed] Give project source files a restore route and a Recently deleted view.
- [proposed] Read the window in client text from a shared contract constant.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:DELETE /api/media | `apps/web/app/api/media/route.ts` | Soft delete or permanent delete (permanent=true). |
| endpoint | api:POST /api/media | `apps/web/app/api/media/route.ts` | Restore from trash. |
| endpoint | api:GET /api/library | `apps/web/app/api/library/route.ts` | Lists live files or the trash (deleted=true) with erase_after. |
| service | softDeleteMediaAsset, restoreMediaAsset, permanentlyDeleteMediaAsset | `apps/web/lib/server/media-assets.ts` | The three file lifecycle writes. |
| endpoint | api:GET /api/cron/purge-deleted-media | `apps/web/app/api/cron/purge-deleted-media/route.ts` | Daily purge of expired media, orphan uploads, relay segments, feedback screenshots and deleted project files. |
| job | purge-deleted-media schedule 0 4 * * * | `vercel.json` | Triggers the cron daily. |
| job | purge-soft-deleted-resources schedule 10 4 * * * | `vercel.json` | Triggers policy-driven purge of other tables. |
| service | deletion-policies | `apps/web/lib/resources/deletion-policies.ts` | Single table of windows, children, derived indexes, derived records and external objects. |
| service | purge-soft-deleted | `apps/web/lib/resources/purge-soft-deleted.ts` | Policy-driven purge and purgeDerivedRecords. |
| service | deleted-project-files retention | `apps/web/lib/server/retention/deleted-project-files.ts` | Purges deleted project knowledge files and their objects, keeping shared or held objects. |
| service | project-deletion | `apps/web/lib/server/project-deletion.ts` | retireProjectKnowledgeFile, releaseDeletedProjectContents, legal-hold checks. |
| endpoint | api:DELETE /api/projects/[id]/knowledge-files/[fileId] | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts` | Soft deletes a project source file. |
| endpoint | api:POST /api/projects/sync | `apps/web/app/api/projects/sync/route.ts` | Applies project tombstones and releases their files. |
| schema | 0202_retrieval_index trigger functions | `apps/web/db/neon/0202_retrieval_index.sql` | Forget index documents when a file is deleted or superseded. |
| service | legal hold gate | `apps/web/lib/services/legal-hold-gate.ts` | Exclusion predicate that keeps held files from purge. |
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Menu, trash toggle, confirmations. |
| component | web Library transport | `apps/web/features/library/components/LibraryView.tsx` | Maps delete, restore, permanent delete to /api/media with CSRF. |
| component | DesktopLibrary | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Same calls against the cloud base URL. |
| screen | Mobile library screen and client | `apps/mobile/src/features/library/index.tsx` | Mobile trash UI; client at libraryClient.ts:152-175. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Holds deleted_at, storage_pathname, temporary_chat. |
| table | file_lineage | `apps/web/lib/resources/deletion-policies.ts` | Derived record removed with the file (:246-251). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User confirms Delete; the client sends DELETE /api/media?id=<uuid> with a CSRF token. | device | apps/web/features/library/components/LibraryView.tsx:183-189 |
| Server validates the id, rate limits, and sets deleted_at on the user's row in the active workspace. | our servers | apps/web/app/api/media/route.ts:45-66; apps/web/lib/server/media-assets.ts:693-707 |
| A database trigger drops the file's search index document. | our servers | apps/web/db/neon/0202_retrieval_index.sql:399 |
| Restore clears deleted_at when it is still inside 30 days. | our servers | media-assets.ts:711-730 |
| Permanent delete: in one transaction lock the trashed row, refuse if held, delete the stored object, delete the row, then delete derived records. | our servers | media-assets.ts:756-803 |
| Daily cron selects assets deleted over 30 days ago that are not held, deletes objects from object storage, deletes rows whose objects went, then removes lineage edges and cascades. | our servers | apps/web/app/api/cron/purge-deleted-media/route.ts:165-224, :258-270 |
| Object bytes live in the private bucket of the object-storage provider; deletion is a call to that outside service. | outside service | apps/web/lib/server/media-storage.ts (deleteStoredMediaObjects imported at route.ts:16); exact provider not read (unknown). |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Deleted flag and timestamp | table:media_assets.deleted_at | Server only; clients refetch. | Kept 30 days then row deleted. |
| File bytes | Private object storage at storage_pathname | Not synced. | Deleted at permanent delete or purge; kept if a hold applies or deletion fails. |
| Derived index rows, lineage, generation job rows | retrieval documents, table:file_lineage, video_generation_jobs, image_generation_job_assets | Server only. | Removed with the source (deletion-policies.ts:222-262); provider_cost_events retained after purge. |

**Models and providers.** No model or inference provider takes part. The object-storage provider (package platform/object-storage) holds the bytes; the model catalog is not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; rows are matched by user_id and active organization (media-assets.ts:693-707). |
| Permissions | Only the file's owner in the active workspace can delete or restore. Legal hold overrides purge (route.ts:240-266). The cron needs the cron secret check (route.ts:228). |
| Subscription | none found in the code for delete, trash or restore. |
| Limits and metering | Rate limit key 'chat-conversation' on the media route (route.ts:36, :52); cron limits 500 assets per run (route.ts:37). Storage meter is read for the Library view (library/route.ts:193) but deletion does not meter. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | These routes are Cloud. DesktopLibrary and Mobile call the cloud API; whether mode:local keeps its own trash on the device was not searched (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading and empty | Empty trash and empty library have their own titles and copy. | LibraryView.tsx:2227-2234 |
| Delete or restore fails | Row error text; the row stays. | LibraryView.tsx:630-641 |
| Nothing matched (wrong id, already deleted, past 30 days) | HTTP 200 with success false; mobile shows an error. | apps/web/app/api/media/route.ts:66, :86; apps/mobile/src/features/library/libraryClient.ts:152-175 |
| Invalid id or permanent value | 400 validation error 'A valid id query parameter (uuid) is required'. | route.ts:56-58; apps/web/app/api/media/route.test.ts |
| Legal hold | Permanent delete refused via refuseHeldDeletion; cron keeps and counts the file. | media-assets.ts:779; route.ts:249 |
| Object delete fails in cron | Row kept, counted as objectsFailed, retried next day. | route.ts:189-200 |
| Row changes during permanent delete | Throws and rolls back. | media-assets.ts:795-797 |
| Temporary chat files | Never listed in the Library or trash. | media-assets.ts:430-433 |
| Offline, timeout, cancel | not handled in the code beyond generic row errors; the cron has maxDuration 300 seconds (route.ts:31). | route.ts:31 |
| Accessibility | Menu has role menu and per-file aria-label; mobile uses an alert. | LibraryView.tsx:1768-1772 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/media/route.test.ts`: Soft delete by default, permanent only when explicit, invalid mode rejected.
- apps/web/lib/server/media-assets.test.ts (not found) (not found): Media asset queries (file exists; case list not read).
- `apps/web/app/api/cron/purge-deleted-media/__tests__/route.test.ts`: Unauthorized refusal, orphan multipart sweep, relay segments, feedback screenshots, purge continues when sweeps fail.
- `apps/web/lib/resources/__tests__/deletion-semantics.test.ts`: Every soft-deletable table has a policy and index, derived index removed with source.
- `apps/web/lib/resources/__tests__/purge-soft-deleted.test.ts`: Purge order, bounds, window, counts, failure continuation.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library view behaviour.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web Library wrapper.
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Desktop Library wrapper.
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Mobile row menus.
- `apps/web/app/api/library/__tests__/library-item-open.test.ts`: Library item opening.

**Test scenarios**

- **Delete and restore**
  1. Upload a file in the Library.
  2. Delete it and confirm.
  3. Toggle 'Recently deleted'.
  4. Press Restore.
  - Expected: File leaves the list, appears in trash, then returns to the main list.
- **Permanent delete needs trash**
  1. Call DELETE /api/media?id=<live id>&permanent=true.
  2. Soft delete it, then repeat the call.
  - Expected: First call returns success false and the file stays; second erases bytes and row.
- **Expiry**
  1. Set deleted_at of a test asset to 31 days ago.
  2. Call the cron route with the cron secret.
  - Expected: Object removed, row deleted, lineage edges removed, response purged count 1.
- **Legal hold**
  1. Place a hold on a file.
  2. Soft delete and age it 31 days.
  3. Run the cron.
  - Expected: File kept; heldFromPurge is 1.
- **Restore after window**
  1. Age a trashed file past 30 days.
  2. POST /api/media?id=<id> before the cron runs.
  - Expected: success false; file not restored.
- **Index withdrawal**
  1. Attach a file to a project, wait for indexing, delete the file.
  2. Ask a question that matched it.
  - Expected: The answer no longer cites the deleted file.

**Where to look when it fails**

- Log 'Purged expired soft-deleted media assets' with counts, and 'Deleted media purge cron job failed' (route.ts:271-284).
- Log 'A deleted project file object could not be removed; its row is kept for the next run' (deleted-project-files.ts).
- Cron response fields heldFromPurge, objectsFailed, derivedRecordsPurged.
- Tables media_assets (deleted_at), file_lineage, retrieval_documents.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **permanent=true on a live file returns success false instead of deleting or explaining.** Affects: API callers and any client that offers permanent delete outside the trash view.. Evidence: apps/web/lib/server/media-assets.ts:768 requires deleted_at is not null; apps/web/app/api/media/route.ts:63-66.. Work needed: Return a typed error or support delete-now with the same hold checks; update tests.
- **Window text is hardcoded in the shared Library view.** Affects: All Library apps.. Evidence: LibraryView.tsx:736, :2232 versus deletion-policies.ts:8.. Work needed: Read the window from a shared constant.
- **No restore for project source files.** Affects: All apps with projects.. Evidence: knowledge-files/[fileId]/route.ts exports DELETE and GET only.. Work needed: Add restore and a trash view or document the intended behaviour.
- **CLI, VS Code and Chrome have no trash controls found.** Affects: surface:cli, surface:vscode, surface:chrome.. Evidence: No /api/media use in apps/cli.. Work needed: Decide scope per app.
- **The first draft cited a confirmation for permanent delete as unverified; it exists on the shared Library view.** Affects: Documentation only.. Evidence: LibraryView.tsx:744-756.. Work needed: None beyond this page.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:media_assets
- table:file_lineage
- table:project_knowledge_files
- api:DELETE /api/media
- api:POST /api/media
- F095-07

## Unknown

- Whether the workspace retention setting changes the file trash window.
- Exact object-storage provider and its own lifecycle rules.
- Whether the shared web client treats HTTP 200 success false as an error (requireSuccessfulMutation not read).
- Where the project source file delete button is in the UI.
- Whether mode:local on desktop has a separate device trash.
- Whether apps/vscode or the Chrome extension delete library files (their app folders were not found).
