---
id: "F024-06"
type: "feature"
title: "Select and act on several files"
aliases: ["Multi-select", "Select saved files", "Batch delete", "Batch download", "Batch move", "S24.20", "S24.21", "S24.22", "S24.23"]
area: "24 Library and file-management experience"
available_on: ["mobile"]
implementation: {web: "missing", desktop: "missing", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.20", "S24.21", "S24.22", "S24.23"]
depends_on: ["F024-01", "F024-04", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-authentication-and-identity", "table:media_assets", "api:DELETE /api/media", "api:POST /api/media", "store:library-store-cloud", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-06 Select and act on several files

Only the mobile app can select several Library files, and only to delete them (and to share when exactly one is picked). Web, Electron desktop, CLI, VS Code and Chrome have no multi-select. Batch download and batch move do not exist on any app. Deletes go to Recently deleted for 30 days.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.20](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2420), [S24.21](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2421), [S24.22](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2422), [S24.23](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2423).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** On mobile, enters a selection mode where tapping files selects them, then deletes the chosen files with one confirmation. Each file is deleted by its own request. (apps/mobile/src/features/library/index.tsx:266-290,653-725)

**Why it exists.** The brief asks for multi-selection, batch download, batch move and batch delete (S24.20-S24.23). Deletion is the one that was built.

**Who uses it.** Signed-in mobile users cleaning up many generated files.

**Problems it solves**

- Clearing many generated images without deleting one by one.

**Use cases**

- Select 10 unwanted images and delete them.
- Select one file and tap Share.
- Delete fails for two files; retry only those.

## 2. User experience

**Where to find it**

- Mobile: header button 'Library options' opens the sheet 'Library' with 'Select saved files' (index.tsx:266-290,842-860).
- Web, desktop, CLI, VS Code, Chrome: not available.

**Before you start**

- Signed in; not in Recently deleted view (option hidden when signed out or showing deleted) (index.tsx:266-290).

**Screens and controls**

- Header button changes to 'Done selecting files' (index.tsx:842).
- Selection bar: '<N> selected', 'Select all shown', 'Share' (enabled for exactly one), 'Delete' (index.tsx:1060-1110).
- Confirm alert 'Delete saved files?' with '<N> saved files move to deleted items.' and buttons Cancel and Delete (index.tsx:675-680).

**Journey**

1. Tap 'Library options', then 'Select saved files'.
2. Filter resets to All and search clears; artifact rows are hidden.
3. Tap tiles to select, or 'Select all shown'.
4. Tap Delete and confirm.
5. Each file is deleted in turn and leaves the selection when deleted.
6. On full success selection closes. On any failure the alert 'Some files could not be deleted' / 'Try again.' shows and the failed files stay selected.

**What the person sees and gets**

- Counter '<N> selected'.
- Alert on failure.
- Files vanish from the list and from the offline cache on success (apps/mobile/__tests__/LibraryAssetsError.test.tsx).
- Deleted files appear under Library options, 'Recently deleted' for 30 days with Restore and 'Delete permanently' (index.tsx:610-620).

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- beginSelection captures the account scope, sets selection, resets filter to All and clears search (index.tsx:255-265).
- toggleSelected, selectAllShown (assets only), shareSelected (one file), deleteSelected with confirmation (index.tsx:653-725).
- Deletion is sequential: library.removeAsset(id) per file, which calls DELETE /api/media?id=<id> (soft delete) (index.tsx:690-715; apps/mobile/src/features/library/libraryClient.ts:115-122).
- Server soft delete sets deleted_at and is restorable for 30 days (apps/web/lib/server/media-assets.ts:693-725; apps/web/app/api/media/route.ts:45-60).
- Selection ends if the signed-in account changes; the delete loop stops if the account changes (index.tsx:690-715; apps/mobile/__tests__/LibraryBottomSearch.test.tsx 'closes selection when the signed-in account changes').

**Incomplete**

- Batch delete is N separate requests, not one batch call; a mid-way stop leaves some deleted and some not. [inferred from the loop]
- Share works for exactly one file, so it is not a batch share.

**Present but disconnected or switched off**

- none found

**Not available**

- Multi-select on web, Electron desktop, Tauri desktop, CLI, VS Code, Chrome: no selection state in shared LibraryView (searched for selection and checkbox; none found).
- Batch download and batch move on every app.
- Selecting artifacts on mobile: artifact rows are hidden during selection (index.tsx:344-350).

## 4. Required behaviour

**Established requirements**

- Users can select several Library items at once. (source: S24.20 (brief))
- Users can download several selected files at once. (source: S24.21 (brief))
- Users can move several selected files at once. (source: S24.22 (brief))
- Users can delete several selected files at once. (source: S24.23 (brief))
- An action a user cannot undo asks first and names the consequence; an agent never destroys data on its own; chats and files are recoverable. (source: doc: AGENTS.md section 9)
- Delete/restore is reflected in listing and download authorization. (source: doc: docs/product/experience-contract.md:784)

**Acceptance criteria**

1. Selection mode appears only when signed in and not in Recently deleted.
2. Delete shows a confirmation naming that files move to deleted items and the count.
3. After confirming, only server-confirmed deletions leave the list.
4. If one delete fails, that file stays selected and the failure alert shows.
5. Changing account closes selection and stops any deletion in progress.
6. Deleted files can be restored from Recently deleted within 30 days.
7. On web, no selection control exists today (brief says missing).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Permanent delete is not part of batch delete; it is per item from Recently deleted. [inferred from the action sheet, index.tsx:610-620]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add multi-select with batch delete on web using useConfirmAction.
- [proposed] Add a batch endpoint so partial failure is reported once.
- [proposed] Add zip download and move-to-project once folders exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Mobile LibraryScreen selection mode | `apps/mobile/src/features/library/index.tsx` | beginSelection, endSelection, toggleSelected, selectAllShown, shareSelected, deleteSelected. |
| hook | useLibraryAssets.removeAsset | `apps/mobile/src/features/library/useLibraryAssets.ts` | Deletes one asset, updates list, cursor and offline cache. |
| service | deleteLibraryAsset | `apps/mobile/src/features/library/libraryClient.ts` | DELETE /api/media?id=<id> and response check. |
| service | restoreLibraryAsset / permanentlyDeleteLibraryAsset | `apps/mobile/src/features/library/libraryClient.ts` | POST restore and DELETE permanent. |
| store | useLibraryCacheStore.removeLibraryAsset | `apps/mobile/src/features/library/libraryCacheStore.ts` | Removes a deleted file from the offline page. |
| service | accountScopedUiState | `apps/mobile/src/features/auth/services/accountScopedUiState.ts` | Ties selection to the signed-in account. |
| endpoint | DELETE /api/media | `apps/web/app/api/media/route.ts` | Soft delete, or permanent with permanent=true; CSRF and rate limit. |
| endpoint | POST /api/media | `apps/web/app/api/media/route.ts` | Restore a deleted file. |
| service | softDeleteMediaAsset / restoreMediaAsset / permanentlyDeleteMediaAsset | `apps/web/lib/server/media-assets.ts` | Updates deleted_at; permanent delete removes bytes, respects legal hold. |
| config | RESOURCE_RECOVERY_WINDOW_DAYS | `apps/web/lib/resources/deletion-policies.ts` | 30-day recovery window. |
| component | Shared LibraryView single-item delete | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Web per-item Delete with confirmation and Recently deleted copy (line 736). |
| component | ActionMenuSheet | `apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx` | The sheet that lists Select, Sort, Recently deleted. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Rows with deleted_at. |
| test | LibraryBottomSearch test | `apps/mobile/__tests__/LibraryBottomSearch.test.tsx` | Selection and delete tests. |
| test | LibraryActionMenus test | `apps/mobile/__tests__/LibraryActionMenus.test.tsx` | Sheet options and delete confirmation. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Library options and picks Select saved files; app records the account scope. | device | index.tsx:255-290 |
| Person taps files; selection set updates on the device. | device | index.tsx:653-665 |
| Delete asks for confirmation through a native alert. | device | index.tsx:675-680 |
| For each file the app sends DELETE /api/media?id=<id>. | device and our servers | libraryClient.ts:115-122 |
| Server checks CSRF and rate limit, sets deleted_at on the user's row in the active organization. | our servers | apps/web/app/api/media/route.ts:45-60; media-assets.ts:693-709 |
| App removes the file from the list and the offline cache after a success reply. | device | useLibraryAssets.ts removeAsset; apps/mobile/__tests__/LibraryAssetsError.test.tsx |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Deletion mark (deleted_at) | table media_assets | Server held; all apps see the file leave the list. | Restorable 30 days; after that eligible for permanent purge; legal hold delays removal (doc: apps/web/content/support/library.md; media-assets.ts:711-770). |
| Selection set | Component memory | No | Dropped on Done or account change |

**Models and providers.** None. Deleting files calls no model. A deleted image that has a chat deletes only through the image preview, where the warning says deleting also deletes the chat it was made in (index.tsx:1126-1131); this applies to the preview delete, not the selection delete. [inferred; selection path calls removeAsset only]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on mobile; selection is tied to the account that started it. |
| Permissions | The server deletes only rows owned by the user in the active organization. |
| Subscription | none found in the code. |
| Limits and metering | Rate limit group chat-conversation on the delete route. Deleting does not touch the monthly download allowance (not found). No batch size cap found. |
| Feature flags | none found in the code. |
| Model compatibility | Not affected. |
| Provider restrictions | none found in the code. |
| Local mode | Selection runs against server files only; the selection screen needs a signed-in cloud account (beginSelection uses captureAccountScopedUiState('cloud')) (index.tsx:255-265). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Some deletions fail | Alert 'Some files could not be deleted' / 'Try again.'; failed files stay selected. | index.tsx:690-725; LibraryBottomSearch.test 'leaves a failed deletion selected for retry' |
| Cancel | Alert Cancel does nothing. | index.tsx:675-680 |
| Account changes mid-delete | Loop stops; selection ends. | index.tsx:690-715 |
| Nothing selected | Delete is disabled. | index.tsx:1085-1095 |
| Large selection or timeout | not handled in the code; requests are sequential with no progress count. | index.tsx:690-715 |
| Offline | Each delete fails and counts as a failure. | index.tsx:700-712 |
| Accessibility | Buttons have roles and disabled state; Done label kept on one line at large text sizes. | index.tsx:1062-1100; LibraryBottomSearch.test |
| Web | One item at a time with a confirmation that it moves to Recently deleted for 30 days. | LibraryView.tsx:736 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/LibraryBottomSearch.test.tsx`: Select loaded files and delete only after server confirmation; Done label; failed deletion stays selected; selection closes on account change.
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Asks before Delete and names where the file goes; Library options offers Select, Sort, Recently deleted, then Restore and Delete permanently.
- `apps/mobile/__tests__/LibraryAssetsError.test.tsx`: Removes a deleted file from the offline page; keeps file on failed delete.
- `apps/mobile/__tests__/LibraryStaleActions.test.tsx`: Continuations after account change.
- `apps/web/app/api/media/route.test.ts`: Media delete and restore route (title list not read).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Pagination cursor rebased after a delete; offset unchanged when delete is refused.

**Test scenarios**

- **Delete several**
  1. Mobile, signed in, Library options, Select saved files.
  2. Tap three files, Delete, confirm.
  - Expected: Three DELETE /api/media calls; files leave the list; selection closes; files appear in Recently deleted.
- **Partial failure**
  1. Turn off network after the first delete.
  2. Confirm Delete on three files.
  - Expected: Alert 'Some files could not be deleted'; failed files stay selected.
- **Account switch**
  1. Start selecting, sign out and into another account.
  - Expected: Selection closes.
- **Restore**
  1. Library options, Recently deleted, Restore on one.
  - Expected: File returns to the list.
- **Web has no multi-select**
  1. Open /chat/library; look for checkboxes or a select mode.
  - Expected: None.

**Where to look when it fails**

- Response 'The file could not be deleted. Try again.' from deleteLibraryAsset.
- Server rows: media_assets.deleted_at set.
- Server logs for the media route; rate limit responses.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **No multi-select on web or desktop.** Affects: web, desktop. Evidence: No selection state in packages/ui/unified-chat/src/components/library/LibraryView.tsx. Work needed: Selection state, checkboxes, confirm through useConfirmAction.
- **No batch download.** Affects: all apps. Evidence: S24.21 missing; downloads counted against a monthly allowance (tier-unit-quota-service.ts:446-463). Work needed: Zip endpoint with allowance check.
- **No batch move.** Affects: all apps. Evidence: S24.22 missing; no folder model (F024-03). Work needed: Folder or project move API.
- **Batch delete is sequential single requests with no progress.** Affects: mobile. Evidence: index.tsx:690-715. Work needed: Batch endpoint and progress.
- **Brief marks S24.20 and S24.23 missing on mobile though the code exists.** Affects: documentation. Evidence: brief vs index.tsx:266-290. Work needed: Update the brief rows.
- Not built on: Web, Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-01
- F024-04
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-authentication-and-identity
- table:media_assets
- api:DELETE /api/media
- api:POST /api/media
- store:library-store-cloud
- surface:mobile
- mode:cloud

## Unknown

- Whether the Electron desktop or web add selection outside the shared view (shared view searched only).
- Maximum number of files that can be selected or deleted in one go (none found).
- Whether the legal hold blocks soft delete (only permanent delete reads holds in the part opened).
