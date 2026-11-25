---
id: "F024-11"
type: "feature"
title: "Storage use and file status"
aliases: ["Storage used", "File storage meter", "Downloads used this month", "Unavailable file", "Processing status", "S24.33", "S24.35", "S24.36"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.33", "S24.35", "S24.36"]
depends_on: ["F024-09", "F024-08", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "table:media_assets", "table:project_knowledge_files", "api:GET /api/library", "surface:web", "surface:mobile", "surface:desktop"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-11 Storage use and file status

The Library shows how much file storage is used against the plan allowance and how many file downloads are used this month. A file whose bytes return 404 or 410 is marked unavailable. There is no processing status (uploading, processing, ready, failed) in the Library.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.33](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2433), [S24.35](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2435), [S24.36](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2436).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows storage used against the plan limit (with a documents and images split in the response), the monthly download meter, an 'unavailable' mark on missing files and the erase date in the trash.

**Why it exists.** People need to know when they are near their allowance and which files cannot be opened. (S24.33, S24.35, S24.36 in the area brief)

**Who uses it.** Signed-in Library users on web, mobile and the internal Tauri desktop.

**Problems it solves**

- Surprise when an upload is refused for lack of space.
- Not knowing why a file will not open.
- Not knowing the monthly download allowance.

**Use cases**

- Read '1.2 GB of 5 GB file storage used' above the list.
- See the download meter before saving a large upload.
- See 'This file is unavailable right now. Try again later, or remove this entry.' on a row.
- Check 'Kept until <date>' in trash.

## 2. User experience

**Where to find it**

- Web and hosted Desktop page: under the 'Library' heading (packages/ui/unified-chat/src/components/library/LibraryView.tsx:945-962).
- Mobile: above the grid (apps/mobile/src/features/library/index.tsx:978-1000).
- Internal Tauri desktop: same shared heading, because it renders the shared LibraryView.

**Before you start**

- Signed in. The meters come only with the first page, outside Recently deleted (apps/web/app/api/library/route.ts:192-196).

**Screens and controls**

- Text '<used> of <limit> file storage used', or '<used> of file storage used' when no limit (LibraryView.tsx:950-953; index.tsx:987-990).
- Text '<used> of <limit> file downloads used this month' (LibraryView.tsx:962-965; index.tsx:999).
- Row note 'This file is unavailable right now. Try again later, or remove this entry.' (LibraryView.tsx:1513-1515, 1644-1646).
- Trash rows show 'Kept until <date>' (LibraryView.tsx:352).

**Journey**

1. Open the Library.
2. The first page loads and the meters appear.
3. Download or open a file; if the server says 404 or 410 the row is marked unavailable.
4. Delete the entry to remove it.
5. If a large uploaded file is bigger than the remaining download allowance, the row says 'This file is larger than the file downloads left this month.' (LibraryView.tsx:312,562-568).

**What the person sees and gets**

- Two small text lines; row-level unavailable message; row error for download limit.
- If the meter read fails, the line is left out (route.ts:192-196, 98-104).

**Settings**

- The limits come from the plan (see access_and_usage). No user setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server sums bytes of the active workspace's non-temporary, non-deleted Library files plus active project knowledge files (apps/web/lib/server/file-storage.ts:34-60) and reads the allowance from the plan (file-storage.ts:63-91).
- Documents and images sums are returned as storage_documents_bytes and storage_images_bytes (route.ts:107-146,201-206).
- Download meter from the entitled plan and download usage (route.ts:91-105).
- Meters sent only on the first page outside the trash (route.ts:192-196); failures are logged and the field omitted (route.ts:102,143; file-storage.ts:80-90).
- Web, mobile and the shared view display the meters (LibraryView.tsx:945-965; index.tsx:978-1000).
- Web marks a row unavailable on 404 or 410 from download, thumbnail probe or artifact load (LibraryView.tsx:575-583, 609-615, 796-812).

**Incomplete**

- The documents and images split is returned but no UI line showing it was found in the code read [inferred; mobile client keeps it at libraryClient.ts:36-37].
- 'Unavailable' is learned only after a failed fetch, not sent by the server; there is no expired state (route.ts:66-89).
- Mobile has no unavailable marking (brief S24.35 mobile missing).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Processing status (uploading, processing, ready, failed) in the Library on every app: the list item has no status field (route.ts:66-89; brief S24.36).
- Any of this on CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- The product shows how much storage the user's files consume against their allowance. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.33)
- Expired or no-longer-available files are clearly marked in the Library. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.35)
- The Library shows a file's processing status (uploading, processing, ready, failed). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.36)

**Acceptance criteria**

1. Storage line shows used and limit that match the plan and the sum of non-deleted files plus project files.
2. Deleting a file lowers the used value on the next load.
3. The meters are absent in Recently deleted and on pages after the first.
4. A file that returns 404 or 410 shows the unavailable note on web.
5. When a meter read fails the Library still loads and the line is hidden.
6. A file larger than the remaining download allowance cannot be saved and says why.
7. A processing state is visible for a file still being processed (not met today).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Storage from a Free plan shows no limit line when the plan limit is null [inferred from route.ts:199 and file-storage.ts:36].
- Per project memory the owner wants Free usage screens to show only Upgrade, never meters; whether the Library meter conflicts with that is unknown (doc: memory note free-usage-upgrade-only, not opened).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send an explicit status field from the server, so an expired file is marked before a failed fetch.
- [proposed] Show the documents and images split in the storage line.
- [proposed] Add unavailable marking on mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/library meters | `apps/web/app/api/library/route.ts` | Adds storage and download fields (148-212). |
| service | readFileStorageMeter, sumFileStorageBytes, resolveFileStorageAllowance | `apps/web/lib/server/file-storage.ts` | Used bytes and plan limit (34-91). |
| service | readLibraryStorageBreakdown | `apps/web/app/api/library/route.ts` | Documents and images byte sums (112-146). |
| service | readLibraryDownloadMeter | `apps/web/app/api/library/route.ts` | Download usage via entitlement and tier-unit quota (91-105). |
| service | free-plan-entitlements getFileStorageLimitBytes | `apps/web/lib/services/free-plan-entitlements.ts` | Plan knowledge storage limit (18-22). |
| service | tier-unit-quota-service readDownloadUsage | `apps/web/lib/services/tier-unit-quota-service.ts` | Monthly download usage (imported at route.ts:21). |
| schema | LibraryListResponseSchema | `packages/contracts/cloud-contracts/src/library.ts` | Meter fields (118-129). |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Meters 945-965; unavailableIds 410, 575-583; unavailable note 1513, 1644. |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | Meters 978-1000. |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | Holds storage and download values per owner (NO_STORAGE, 39-45). |
| service | fetchLibraryPage | `apps/mobile/src/features/library/libraryClient.ts` | Parses meters into the page (108-150). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Returns 404 for missing or deleted files, which marks unavailable. |
| table | media_assets | `apps/web/lib/server/file-storage.ts` | byte_size and temporary_chat columns summed. |
| table | project_knowledge_files | `apps/web/lib/server/file-storage.ts` | byte_count summed into the same total (49-57). |
| component | DesktopLibrary (internal Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Renders the shared view and so the meters. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Library requests the first page; the route resolves the user and workspace. | device and our servers | apps/web/app/api/library/route.ts:148-153 |
| The server sums non-deleted file bytes and project file bytes and reads the plan limit; a failed read is logged and left out. | our servers | apps/web/lib/server/file-storage.ts:34-91 |
| The server reads the monthly download usage for the entitled plan. | our servers | apps/web/app/api/library/route.ts:91-105 |
| The client validates the response against the schema and shows the text lines. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:480-505,945-965 |
| When a file fetch returns 404 or 410 the client adds the id to an unavailable set and shows the note. | device | LibraryView.tsx:575-583 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Storage and download meter values | Computed per request from media_assets, project_knowledge_files and the download usage store; not stored on the device except mobile page cache | Recomputed on each first-page load | Not retained |
| Unavailable ids | React state in the page | No | Lost on reload |

**Models and providers.** No model takes part. The plan decides the storage and download limits.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Meters are for the user's active workspace (file-storage.ts:34-60). |
| Subscription | Storage limit is the plan's knowledge storage limit (free-plan-entitlements.ts:18-22); download limit from the entitled plan tier (route.ts:96-100). A null limit hides the limit part (route.ts:98-100, 199). Plan names and values: not opened. |
| Limits and metering | Uploads and project adds are refused when used plus incoming exceeds the limit (file-storage.ts:63-75). The download allowance blocks large uploaded files above the chat attachment size (LibraryView.tsx:312-319,562-568). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Not applicable: these meters come from our servers. Local inference is described elsewhere as free of subscription; no Library meter exists for on-device files in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Meters appear after the first page resolves; before that nothing is shown. | LibraryView.tsx:399-402,945 |
| Meter read failure | Logged and omitted; the list still loads. | route.ts:101-104,142-145; file-storage.ts:80-90 |
| Unlimited plan | Shows used bytes without a limit. | LibraryView.tsx:950-953 |
| Trash or later pages | No meters sent; the last values stay on screen on web [inferred from state only set when present, LibraryView.tsx:489-501]; mobile hides the lines in trash (index.tsx:975). | route.ts:192-196 |
| Unavailable | Row note; cannot open the file; remove the entry with Delete. | LibraryView.tsx:796-812,1513-1515 |
| Offline (mobile) | Last cached page shown with a 'Showing the last synced page' note. | index.tsx:974-980 |
| Processing | not handled in the code | No status field in route.ts:66-89 |
| Accessibility | Mobile meters limit large-text growth and wrap to two lines. | index.tsx:980-996 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Storage and monthly download lines against plan caps (93); download larger than remaining allowance requests nothing (710); file at limit uses host fetch (663).
- `apps/web/app/api/library/__tests__/route.test.ts`: Documents and images bytes beside the meter (329); meters not repeated for later pages or trash (403).
- `apps/mobile/__tests__/LibraryByteSizes.test.tsx`: Byte size display on mobile; contents not opened.
- `apps/mobile/__tests__/LibraryFreshness.test.tsx`: Not opened; name suggests refresh and cache behaviour.

**Test scenarios**

- **Meter matches data**
  1. Note storage used on the Library.
  2. Upload a 10 MB file.
  3. Reload.
  - Expected: Used rises by about 10 MB.
- **Delete lowers use**
  1. Delete a large file.
  2. Reload.
  - Expected: Used falls; Recently deleted shows no meter.
- **Meter failure**
  1. Make the plan read fail in a test.
  2. Open Library.
  - Expected: List loads; line missing; warning log.
- **Unavailable file**
  1. Delete the stored object but keep the row in a test environment.
  2. Download the file.
  - Expected: Row shows the unavailable note.
- **Large download over allowance**
  1. Use a user with little allowance left.
  2. Download an uploaded file above the attachment size.
  - Expected: Row error 'This file is larger than the file downloads left this month.' and no request.
- **No processing status**
  1. Upload a file and watch the row.
  - Expected: No uploading or processing state appears in the Library.

**Where to look when it fails**

- Log lines 'Library download meter could not be read', 'Library storage breakdown could not be read', 'File storage meter: plan read failed', 'File storage meter: usage read failed'.
- Tables media_assets, project_knowledge_files.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **No processing status** Affects: All users, all apps. Evidence: Item shape lacks status (route.ts:66-89); brief S24.36. Work needed: Add a status field from the upload and generation pipeline and show it.
- **Unavailable is client-inferred and absent on mobile; no expired state** Affects: Mobile users; web users until a fetch fails. Evidence: LibraryView.tsx:575-583; brief S24.35. Work needed: Server sends availability; mobile shows the marker.
- **Documents and images split is returned but not shown in the code read** Affects: Web and mobile users. Evidence: route.ts:201-206; libraryClient.ts:36-37. Work needed: Display the split or drop the query.
- **Storage counts the Library copy and the project copy of an added file** Affects: Users who use Add to project. Evidence: file-storage.ts:34-60. Work needed: Decide whether to deduplicate.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-09
- F024-08
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- table:media_assets
- table:project_knowledge_files
- api:GET /api/library
- surface:web
- surface:mobile
- surface:desktop

## Unknown

- The numeric limits per plan (read from configuration, not opened).
- Whether the owner's 'Free usage shows only Upgrade' rule affects the Library meter on the Free plan.
- Whether the documents and images split is shown anywhere.
- What the apps show while a file is still uploading.
