---
id: "F024-09"
type: "feature"
title: "Recently deleted and restore"
aliases: ["Recently deleted", "Trash", "Restore", "Delete permanently", "Recoverable deletion", "S24.34"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.34"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "table:media_assets", "api:DELETE /api/media", "api:POST /api/media", "api:GET /api/library", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-09 Recently deleted and restore

Deleting a Library file hides it and keeps it for 30 days in Recently deleted. During that time it can be restored. A person can also erase it for good, unless a legal hold blocks it. A daily job removes files older than 30 days. Built on web and mobile, and in the internal Tauri desktop.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.34](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2434).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives soft delete, a trash view, restore within 30 days, permanent delete on request and automatic purge after 30 days.

**Why it exists.** Accidental deletion must be recoverable, and agents or people must not destroy data in one step. (AGENTS.md section 9; S24.34 in the area brief)

**Who uses it.** Any signed-in person managing Library files.

**Problems it solves**

- Accidental deletes.
- Needing to free space on purpose.
- Keeping evidence under legal hold.

**Use cases**

- Restore a deleted report the next day.
- Permanently erase a sensitive upload.
- Check what will be erased soon ('Kept until <date>').
- Erase fails because the file is on legal hold.

## 2. User experience

**Where to find it**

- Web and public Desktop (hosted page): Library toolbar, trash button labelled 'Recently deleted' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1034-1040).
- Internal Tauri desktop: same shared view with delete, restore and permanent-delete transports (apps/desktop/src/features/library/DesktopLibrary.tsx:163-181).
- Mobile: Library header options menu, item 'Recently deleted', then 'Back to Library' to leave (apps/mobile/src/features/library/index.tsx:275-293).

**Before you start**

- Signed in. Library rows only (temporary-chat files are never listed).

**Screens and controls**

- Web row menu: 'Delete' (normal view); 'Restore' and 'Delete permanently' (trash view) (LibraryView.tsx:1781-1879).
- Web confirm for Delete: title 'Delete <name>?', text 'It moves to Recently deleted, where it stays restorable for 30 days before it is removed for good.' (LibraryView.tsx:731-742).
- Web confirm for permanent: 'Permanently delete <name>?' 'The stored bytes are erased now. Nothing restores this file, and anything linking to it stops resolving.' (744-755).
- Mobile: alert 'Delete from Library?' with text 'moves to deleted items'; header 'Recently deleted. Erased after 30 days. Long press to restore.'; action menu Restore and Delete permanently; alert 'Delete permanently?' '...erased now instead of after 30 days. This cannot be undone.' (index.tsx:556-605, 879).

**Journey**

1. Open the file menu and choose Delete.
2. Confirm; the row leaves the list.
3. Open Recently deleted to see it with 'Kept until <date>' (web).
4. Choose Restore: the file returns to the Library.
5. Or choose Delete permanently and confirm: the bytes and records are erased.
6. After 30 days a daily job erases it.

**What the person sees and gets**

- Web: row disappears; failures show on the row such as 'Restore failed. Try again.' (LibraryView.tsx:707-720).
- Mobile: Alerts 'Delete failed', 'Restore failed', 'The file could not be restored. Try again.' (index.tsx:580-604).
- Empty states: web 'Recently deleted is empty', mobile 'Nothing deleted in the last 30 days' (LibraryView.tsx:2226-2234; index.tsx:1266).

**Settings**

- The 30-day window is a constant (apps/web/lib/resources/deletion-policies.ts:8), repeated in the restore SQL and cron (apps/web/lib/server/media-assets.ts:711-727; apps/web/app/api/cron/purge-deleted-media/route.ts:35).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Soft delete sets deleted_at (apps/web/lib/server/media-assets.ts:693-709).
- Restore clears deleted_at only if deleted less than 30 days ago (media-assets.ts:711-730).
- Trash list shows only items deleted within 30 days, with an erase_after date (media-assets.ts:431-433; apps/web/app/api/library/route.ts:60-64,87).
- Permanent delete runs in a transaction, refuses when a legal hold applies and records an audit event, deletes the stored object and the row, then purges derived records (media-assets.ts:756-805; apps/web/lib/services/legal-hold-gate.ts:569-596).
- A daily cron purges assets older than 30 days in batches (apps/web/app/api/cron/purge-deleted-media/route.ts:35,130-131; vercel.json:82-83).
- Soft-deleted files are excluded from the storage sum and from file serving (file-storage.ts:34-60; apps/web/app/api/files/[id]/route.ts:206).
- Web and mobile both confirm before delete and permanent delete (LibraryView.tsx:731-755; index.tsx:556-605).

**Incomplete**

- Mobile restore has no confirmation and no success message, only failure alerts (index.tsx:580-585) [fine for a reversible action].
- Web shows 'Kept until <date>' in the trash; mobile does not show the date in the code read (index.tsx:879 shows only the general 30-day text).

**Present but disconnected or switched off**

- Restore returns {success:false} for an expired item and the client then shows an error through requireSuccessfulMutation ('The file is no longer available') (LibraryView.tsx:303-307).

**Not available**

- CLI, VS Code and Chrome (brief S24.34).
- Multi-select restore or batch delete on web (brief S24.20, S24.23 missing). Mobile has a 'Select saved files' multi-delete (index.tsx:263-266,725) which is outside this page.

## 4. Required behaviour

**Established requirements**

- Deleted files go to a trash from which they can be restored. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.34)
- Delete/restore is reflected in listing and download authorization. (source: docs/product/experience-contract.md:784)
- A file an agent removes goes to Trash first; permanent removal happens only from an explicit user action naming what is lost; an action a user cannot undo asks first naming the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Delete asks first, names Recently deleted and 30 days, and removes the row from the normal list.
2. The deleted file appears in Recently deleted with its erase date on web.
3. Restore returns the file to the normal list and to storage totals; it fails with a message after 30 days.
4. Permanent delete asks first, says nothing can restore the file, and then the file cannot be served (404).
5. A permanent delete on a file under legal hold is refused with a message and does not remove bytes.
6. A file deleted more than 30 days ago is gone after the daily cron.
7. Opening a deleted file by its URL returns 404.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Storage used drops at soft delete, because deleted rows are excluded from the sum [inferred from file-storage.ts:34-60].
- Restore is allowed even if it would push storage above the plan allowance; no check is in the restore SQL [inferred from media-assets.ts:711-727].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the erase date on mobile.
- [proposed] Add a storage check on restore.
- [proposed] Offer Empty trash with a consequence-naming confirm.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | DELETE /api/media (soft or permanent) | `apps/web/app/api/media/route.ts` | Soft delete, or permanent when permanent=true (lines 45-66). |
| endpoint | POST /api/media (restore) | `apps/web/app/api/media/route.ts` | Restore by id (lines 68-87). |
| endpoint | GET /api/library?deleted=true | `apps/web/app/api/library/route.ts` | Lists the trash; no meters in this view (lines 168,192-196). |
| service | softDeleteMediaAsset, restoreMediaAsset, permanentlyDeleteMediaAsset | `apps/web/lib/server/media-assets.ts` | Delete, restore and erase logic (693-805). |
| service | legal hold gate | `apps/web/lib/services/legal-hold-gate.ts` | refuseHeldDeletion records an audit event and throws forbidden (569-596). |
| job | purge-deleted-media cron | `apps/web/app/api/cron/purge-deleted-media/route.ts` | Daily erase of assets deleted over 30 days ago; schedule 0 4 * * * in vercel.json:82-83. |
| config | RESOURCE_RECOVERY_WINDOW_DAYS | `apps/web/lib/resources/deletion-policies.ts` | 30-day constant (line 8). |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Toggle, confirm dialogs, row menu, empty state, 'Kept until' (352,726-755,1034,2215). |
| component | Web host transport | `apps/web/features/library/components/LibraryView.tsx` | deleteItem, permanentlyDeleteItem, restoreItem with CSRF token (182-206). |
| component | DesktopLibrary (internal Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Same three calls through the account-pinned cloud transport (163-181). |
| service | Mobile libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | deleteLibraryAsset, restoreLibraryAsset, permanentlyDeleteLibraryAsset (124-155). |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | removeAsset, restoreAsset, permanentlyDeleteAsset (lines 31-33,261-310). |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | Menu, alerts, deleted heading, empty copy. |
| store | libraryCacheStore (mobile) | `apps/mobile/src/features/library/libraryCacheStore.ts` | Cached first page with removeLibraryAsset on delete. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | deleted_at, storage_pathname, temporary_chat columns. |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Returns 404 for deleted assets (206-208). |
| schema | LibraryMediaDeleteResponseSchema | `packages/contracts/cloud-contracts/src/library.ts` | Shape {success} checked by mobile (libraryClient.ts:124-131). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person confirms Delete; the app sends DELETE /api/media?id=<uuid> with a CSRF token (web) or the authenticated API client (mobile). | device and our servers | apps/web/features/library/components/LibraryView.tsx:182-189; apps/mobile/src/features/library/libraryClient.ts:124-131 |
| The server validates the id, sets deleted_at now() for the user and active workspace, returns {success}. | our servers | apps/web/app/api/media/route.ts:45-66; apps/web/lib/server/media-assets.ts:693-709 |
| Opening Recently deleted calls /api/library?deleted=true, which lists rows deleted in the last 30 days, newest deletion first, with erase_after. | our servers | apps/web/lib/server/media-assets.ts:431-436; apps/web/app/api/library/route.ts:87 |
| Restore sends POST /api/media?id=; SQL clears deleted_at only when deleted_at is newer than 30 days. | our servers | apps/web/lib/server/media-assets.ts:711-727 |
| Delete permanently sends DELETE with permanent=true; in a transaction the server locks the row, checks the legal hold (refuses and audits if held), deletes the stored object, deletes the row, then purges derived records. | our servers | apps/web/lib/server/media-assets.ts:756-805 |
| A daily cron selects assets deleted over 30 days ago, up to 500 per run, and erases bytes and rows while respecting holds. | our servers | apps/web/app/api/cron/purge-deleted-media/route.ts:35-37,130-131,205 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| deleted_at timestamp and the file bytes | table media_assets and object storage | Cloud; every signed-in app reads the same state | 30 days recoverable, then erased by cron or by permanent delete (route.ts:35) |
| Audit event deletion_blocked_by_legal_hold | audit log | Server only | Kept as a record (legal-hold-gate.ts:572-585) |
| Mobile cached first page | store libraryCacheStore (device) | No | Cleared on sign-out (libraryCacheStore.ts:36) |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; all calls are scoped to user and active workspace. |
| Permissions | Owner of the row only (user_id and organization match in each query, media-assets.ts:693-805). CSRF token required on web mutations (apps/web/app/api/media/route.ts:46-47). |
| Subscription | none found in the code for delete or restore. |
| Limits and metering | Rate limit class 'chat-conversation' on the routes (media/route.ts:49). Cron batch size 500 per run (purge route:37). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Not available as a Local feature. The trash is a cloud service. Mobile Local mode: whether the Library screen shows deletion controls is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Library shows loading until the page resolves. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:410-411,955 |
| Empty trash | Web 'Recently deleted is empty / Deleted files wait here for 30 days before they are removed for good.' Mobile 'Nothing deleted in the last 30 days'. | LibraryView.tsx:2226-2234; index.tsx:1266 |
| Expired item restore | Restore updates no row; server returns success false; client shows an error. | media-assets.ts:711-727; LibraryView.tsx:303-307 |
| Legal hold | Permanent delete throws forbidden with a held-deletion message and audits; bytes stay. | media-assets.ts:777-785; legal-hold-gate.ts:569-596 |
| Race with a hold or concurrent change | The delete statement carries the hold predicate and throws if the row changed. | media-assets.ts:786-800 |
| Error, retry | Row error text 'Delete failed. Try again.' (web); Alerts on mobile; retry means repeating the action. No automatic retry. | LibraryView.tsx:707-720; index.tsx:571,583,601 |
| Pagination after removal | Next offset is reduced by one so no row is skipped; refused deletes leave the offset alone. | LibraryView.tsx:640-650; test LibraryView.test.tsx:215,232 |
| Offline | Mobile can show the last cached page with 'Showing the last synced page'; mutations fail with alerts. | index.tsx:974-980 |
| Account switch (mobile) | Selection and open file state are cleared when the account changes. | index.tsx:225-239 |
| Accessibility | Trash toggle is labelled 'Recently deleted'; menus are role=menu; mobile alerts are native. | LibraryView.tsx:1034-1040 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/media/route.test.ts`: Soft delete by default, permanent only on explicit request, rejects an invalid permanent mode.
- `apps/web/app/api/library/__tests__/route.test.ts`: Lists the 30-day deleted bin (145) and its own ordering (237); meters not repeated for the deleted bin (403).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Delete behind a confirm that names the consequence (595); failed delete copy (758); permanent erasure named unrecoverable (785); Restore replaces Download in trash (802); offset handling (215, 232).
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Restore posts the encoded id (132); soft delete (142); permanent delete (152).
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Confirm before delete naming where the file goes (291); Select, Sort, Recently deleted, then Restore and Delete permanently (316).
- `apps/web/app/api/cron/purge-deleted-media/__tests__/route.test.ts`: The purge cron route.
- apps/web/lib/server/media-assets.permanent-delete.test.ts (not found) (not found): Listed in the directory search; contents not opened. The path was not confirmed to exist.

**Test scenarios**

- **Delete and restore on web**
  1. Delete a file and confirm.
  2. Open Recently deleted.
  3. Choose Restore.
  - Expected: Row shows 'Kept until <date>', then returns to the Library and appears in the normal list.
- **Permanent delete**
  1. In trash choose Delete permanently and confirm.
  2. Open the old file URL.
  - Expected: Row disappears; URL returns 404; storage used drops if it had not already.
- **Restore after 30 days**
  1. Set a row's deleted_at to 31 days ago in a test database.
  2. Try Restore.
  - Expected: Error shown; file stays in trash until the cron removes it.
- **Legal hold**
  1. Place a hold on a file.
  2. Delete it, then choose Delete permanently.
  - Expected: Refusal message; audit event deletion_blocked_by_legal_hold exists; bytes remain.
- **Mobile trash**
  1. Open the options menu, choose Recently deleted.
  2. Open a file's actions, choose Restore.
  - Expected: File returns after Back to Library; failure shows 'The file could not be restored. Try again.'
- **Cron**
  1. Call the purge route with cron credentials against a database with an old deleted row.
  - Expected: Row and object removed; counts logged.

**Where to look when it fails**

- Table media_assets: deleted_at, storage_pathname.
- Audit log event deletion_blocked_by_legal_hold.
- Cron route log lines in apps/web/app/api/cron/purge-deleted-media/route.ts (for example 'Deleted project file purge failed').
- Error 'The media asset changed while permanent deletion was in progress.' (media-assets.ts:798).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **Mobile does not show the erase date; web does** Affects: Mobile users. Evidence: index.tsx:879 vs LibraryView.tsx:352. Work needed: Show 'Kept until <date>' using eraseAfter, already mapped (libraryClient.ts:92).
- **Restore has no storage allowance check** Affects: Users near the plan limit. Evidence: media-assets.ts:711-727 [inferred]. Work needed: Decide policy and add a check.
- **The 30-day value is repeated as literals in SQL and in the cron** Affects: Maintainers. Evidence: media-assets.ts:432,719; purge route:35 vs deletion-policies.ts:8 (AGENTS.md section 4 forbids hardcoding modelled values). Work needed: Read the one constant everywhere, or confirm a guard checks agreement.
- **No trash on CLI, VS Code, Chrome** Affects: Users of those apps. Evidence: Brief S24.34. Work needed: Decide scope.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- table:media_assets
- api:DELETE /api/media
- api:POST /api/media
- api:GET /api/library
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud

## Unknown

- Whether media-assets.permanent-delete.test.ts and media-assets.restore.test.ts exist as files (a directory listing showed them but a later search could not find them).
- Whether the public Electron Desktop is exactly the web page.
- What mobile Local mode shows in the Library.
- Whether a guard checks that the 30-day literals agree.
