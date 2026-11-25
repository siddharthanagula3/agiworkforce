---
id: "F085-09"
type: "feature"
title: "Data export and history import"
aliases: ["Export data", "Export all my data", "Export Cloud Data", "agi export-data", "Data export archive", "GDPR / DPDP Act portable export", "History import (not built)", "S85.20", "S85.21"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S85.20", "S85.21"]
depends_on: ["SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-authentication-and-identity", "api:POST /api/user/export", "api:GET /api/user/export", "api:GET /api/user/export/archives", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "store:mobile-sqlite"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-09 Data export and history import

A person can download a copy of their account data. On Web the server prepares a zip archive and the person downloads it; Mobile can fetch a JSON export of Cloud data and also export its own on-device data; the CLI requests and downloads the archive. Importing chat history from another assistant does not exist on any app.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.20](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8520), [S85.21](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8521).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Produces a portable copy of the person's data: on Web a zip made by a background job (one or more volumes), on Mobile a JSON file shared through the phone's share sheet, on CLI zip files saved to a folder.

**Why it exists.** Data rights (GDPR and India DPDP are named in the Mobile row text) and the product definition both require a data export path (apps/mobile/app/(app)/settings/storage.tsx:488; doc: docs/product/requirements.md:935).

**Who uses it.** Any signed-in person; Mobile local export also works without an account.

**Problems it solves**

- Leaving the product with a copy of one's data.
- Answering a data-access request.
- Having a backup of Local chats from the phone.

**Use cases**

- Web: press Export data, leave the page, return to download.
- Mobile: Settings > Cloud account > Export Cloud Data, share the JSON to Files.
- Mobile: Settings > Storage > Export all my data for on-device chats, memory and settings.
- CLI: run `agi export-data` twice, once to request and later to download.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Privacy, row 'Export data' with text 'Download a copy of your account data and files.' (apps/web/features/settings/components/DataExportRow.tsx:264-277; PrivacySection.tsx:817).
- Mobile Cloud: Cloud account screen, button 'Export Cloud Data' (label 'Exporting…' while running) (apps/mobile/src/features/settings/cloud-account/index.tsx:916-919); the data-controls screen has a row 'Export Cloud data' that opens that screen (apps/mobile/src/features/settings/data-controls/index.tsx:601-606).
- Mobile on-device: Settings > Storage > Privacy card > 'Export all my data' with note 'GDPR / DPDP Act portable export' (apps/mobile/app/(app)/settings/storage.tsx:468-492).
- CLI: `agi export-data [--out <dir>]` (apps/cli/src/lib.rs:1033-1038, :7410-7448).
- Chrome and VS Code: none (brief).

**Before you start**

- Cloud exports need sign-in. Mobile on-device export needs none.
- Web email delivery needs a verified primary email (apps/web/lib/server/data-export-archive.ts:501-505).

**Screens and controls**

- Web: 'Export data' button, a preparing message, 'Download your export' or 'Download part N of M' links and an expiry line (DataExportRow.tsx:319-375).
- Mobile: alerts 'Your export is incomplete', 'Export not saved', 'Export failed' (cloud-account/index.tsx:465-503).
- Storage screen progress text such as 'Exporting conversations…' (storage.tsx:161-179).

**Journey**

1. Web: press Export data. The browser posts to /api/user/export.
2. See 'We're preparing your export...' (email or in-app wording).
3. The page polls the archive status; return later if needed.
4. When ready, press Download your export. The link works until the shown date.
5. Mobile: press Export Cloud Data, wait up to 120 seconds, then pick where to save in the share sheet.
6. CLI: first run requests, later run downloads to agi-export-<date>.zip.

**What the person sees and gets**

- Web statuses: preparing, ready, failed ('We couldn't prepare your export. Try again.'), expired ('The download link ... has expired. Request a new export...') (DataExportRow.tsx:377-390).
- Mobile partial export dialog lists unavailable sections, truncated sections and skipped rows, then offers to save the partial file named agi_cloud_data_export_partial.json (apps/mobile/services/cloudDataExport.ts:73-131).
- CLI prints 'Saved <path>' or tells the person to run again later (apps/cli/src/lib.rs:7421-7446).

**Settings**

- Email delivery versus in-app delivery is decided by the server from whether the account email is verified (data-export-archive.ts:501-505).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/user/export queues an archive job and returns its status; GET /api/user/export/archives reads the latest one (apps/web/app/api/user/export/route.ts:3426-3458; apps/web/app/api/user/export/archives/route.ts:22).
- Web row polls and shows preparing, ready with per-volume download links, failed, expired (DataExportRow.tsx:40-44, :319-393).
- GET /api/user/export returns the whole export as JSON with a completeness record that lists unavailable, truncated (row limit 1000 in some sections) and skipped parts (route.ts:759-807).
- Mobile cloud export parses the response, refuses invalid or partial-without-metadata data, and only shares a partial file after the person reads what is missing (apps/mobile/services/cloudDataExport.ts:47-131).
- Mobile on-device export writes agi_data_export.json containing conversations, memory, instructions, settings, installed model manifest, compliance ledger (apps/mobile/services/dsarExport.ts:395-427).
- CLI request, status and download of archives (apps/cli/src/cloud/data_export.rs:1-75).

**Incomplete**

- Some export sections are capped at 1000 rows, so very large histories are partial (route.ts:762, :1674-1684).
- The CLI treats any status other than ready or preparing as a cue to request a new export, including failed and expired (apps/cli/src/lib.rs:7433-7440).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Import of chat history from another assistant: no code found on any app (grep for conversations.json and import chatgpt matched only the memory importer). Memory import is a different feature (apps/web/features/settings/components/ImportMemoryDialog.tsx).
- Chrome and VS Code export: not offered (brief).

## 4. Required behaviour

**Established requirements**

- The user can download a copy of their account data (chats, memory, files, settings) from the surface. (source: S85.20 (brief))
- The user can import chat history from another assistant (for example a ChatGPT or Claude export) into the conversation list. All six apps are missing. (source: S85.21 (brief))
- Data export, delete and account paths must be present or clearly scoped; completion must be honest about incomplete exports. (source: docs/product/requirements.md:935; docs/product/competitive-guidance.md:338-342 (honest completion))
- An export is an archive with volumes and a download path; the CLI reads its status and downloads it. (source: apps/cli/src/cloud/data_export.rs:1-75)

**Acceptance criteria**

1. Pressing Export data on Web starts one archive job; pressing again while it is preparing does not start a second one.
2. A ready archive shows one link per volume and the expiry time.
3. An expired or failed archive says so and allows a new request.
4. A partial Cloud export on Mobile is never saved without showing what is missing first, and the file name says partial.
5. Mobile on-device export contains every local conversation and runs with no sign-in.
6. CLI `agi export-data` saves files named agi-export-<date>[-part-N].zip in the chosen folder.
7. A signed-out person cannot export Cloud data on any app.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Import of history would need a parser per source format and a way to create conversations without a model call [inferred; nothing exists].
- Desktop uses the hosted web row [inferred from AGENTS.md section 5].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build history import for ChatGPT and Claude export files on Web first, then share with Mobile.
- [proposed] Make the CLI say 'failed' or 'expired' explicitly instead of silently requesting a new export.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET and POST /api/user/export | `apps/web/app/api/user/export/route.ts` | GET returns inline JSON with completeness; POST requests an archive (lines 3456-3458). |
| endpoint | GET /api/user/export/archives | `apps/web/app/api/user/export/archives/route.ts` | Reads the latest archive status. |
| endpoint | GET /api/user/export/archives/[exportId] | `apps/web/app/api/user/export/archives/[exportId]/route.ts` | Streams one volume. |
| service | data-export-archive | `apps/web/lib/server/data-export-archive.ts` | Builds volumes, decides delivery, maps job state to preparing/ready/expired. |
| component | DataExportRow | `apps/web/features/settings/components/DataExportRow.tsx` | Web request, polling and download UI. |
| schema | data export contracts | `packages/contracts/cloud-contracts/src/index.ts` | DataExportResponseSchema, DataExportArchiveResponseSchema, DataExportCompletenessSchema (imported by Web and Mobile). |
| service | cloudDataExport | `apps/mobile/services/cloudDataExport.ts` | Mobile cloud export and share sheet. |
| service | dsarExport | `apps/mobile/services/dsarExport.ts` | Mobile on-device export (exportAllUserData) and local wipe. |
| screen | Mobile Cloud account | `apps/mobile/src/features/settings/cloud-account/index.tsx` | Export Cloud Data button and partial-export dialogs. |
| screen | Mobile Storage | `apps/mobile/app/(app)/settings/storage.tsx` | Export all my data row. |
| service | CLI data_export | `apps/cli/src/cloud/data_export.rs` | current, request, download. |
| command | agi export-data | `apps/cli/src/lib.rs` | Command (lines 1033-1038, 7410-7448). |
| job | data-export.expire-archive | `apps/web/lib/server/data-export-archive.ts` | Background job name used to expire archives (line 46). |
| table | background jobs table | `apps/web/lib/server/data-export-archive.ts` | Archive status is read from the job row (lines 405-430); table name not read. |
| test | export tests | `apps/web/app/api/user/export/__tests__/route.archive-request.test.ts` | Archive request route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Export data; browser posts POST /api/user/export with CSRF. | device and our servers | DataExportRow.tsx:195-216 |
| Server requests an archive; if one is already preparing it returns that one. | our servers | apps/web/lib/server/data-export-archive.ts:520-524 |
| A background job gathers the user's data into zip volumes in object storage and decides email or in-app delivery. | our servers | data-export-archive.ts:46, :122-123, :501-524 |
| Browser polls archive status until ready, then links to download paths. | device and our servers | DataExportRow.tsx:100-135, :357-366 |
| Mobile calls GET /api/user/export (120 s timeout), validates the document and writes a temporary JSON file. | device and our servers | apps/mobile/services/cloudDataExport.ts:47-102 |
| Phone share sheet hands the file to the person's chosen app; the temp file is cleaned up. | device | cloudDataExport.ts:81-101 |
| Mobile on-device export reads local SQLite stores and writes the JSON file; no network. | device | apps/mobile/services/dsarExport.ts:395-427 |
| CLI polls the archive status and downloads each volume to disk. | device and our servers | apps/cli/src/cloud/data_export.rs:34-75 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Export archive volumes (zip) | server object storage under a per-user, per-export prefix | Not synced; downloaded by the person | Until the archive expiry time (expiresAt) then status 'expired' (data-export-archive.ts:416-424); exact lifetime value not read |
| Mobile export JSON | temporary file in app cache, then the person's chosen destination | No | Temp file removed after sharing (dsarTemporaryFile) |
| Export request record | background job row | Server only | Unknown |

**Models and providers.** No model or provider is used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud export needs a signed-in account (getClerkAuthUser at apps/web/app/api/user/export/route.ts:44). Mobile on-device export needs no account. |
| Permissions | Only the account's own data is read (scoped DB; test route.scoped-db.test.ts). |
| Subscription | none found in the code. Export is not plan-gated. |
| Limits and metering | Rate limit bucket 'user-data-export' on the GET route (route.ts:38). Row limit 1000 on some sections (route.ts:762). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode: on-device export works with no sign-in and no payment. Local chats are not part of the Cloud export. CLI Local and own-key modes still need a Cloud account to export Cloud data. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Preparing | Message explains wait and delivery; the person may leave and return. | DataExportRow.tsx:40-44 |
| Request error | 'Export could not be started. Please try again.'; if sent but unconfirmed, a warning that an earlier export may exist. | DataExportRow.tsx:225-240, :307 |
| Ready with no files | 'Your export finished without any files to download. Request a new export.' | DataExportRow.tsx:347-352 |
| Failed | 'We couldn't prepare your export. Try again.' | DataExportRow.tsx:377-382 |
| Expired | Asks for a new export. | DataExportRow.tsx:383-388; data-export-archive.ts:481-484 |
| Stalled polling | A 'stalled' flag exists; status refresh failure shows 'We couldn't refresh the current export status.' | DataExportRow.tsx:217, :391-393 |
| Partial Cloud export (Mobile) | Shown with a list of what is missing; person chooses to save the partial file. | cloudDataExport.ts:59-63, :112-131 |
| No share target (Mobile) | 'Export not saved' dialog; nothing shared. | cloud-account/index.tsx:494-498 |
| Account switch during export | Epoch checks abort the write. | cloudDataExport.ts:48, :53, :79-92 |
| Offline | Mobile shows 'Export failed ... Check your connection'; Web shows a generic error. | cloud-account/index.tsx:500-504 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/components/__tests__/DataExportRow.test.tsx`: Web export row states.
- `apps/web/app/api/user/export/__tests__/route.archive-request.test.ts`: Archive request.
- `apps/web/app/api/user/export/__tests__/route.completeness.test.ts`: Completeness metadata.
- `apps/web/app/api/user/export/__tests__/export-covers-personal-data.test.ts`: Export includes personal data tables.
- `apps/web/app/api/user/export/__tests__/export-matches-erasure-inventory.test.ts`: Export and erasure inventories match.
- `apps/web/app/api/user/export/__tests__/export-media-download-links.test.ts`: Media links.
- `apps/web/app/api/user/export/archives/__tests__/route.test.ts`: Archive status route.
- `apps/mobile/__tests__/cloud-data-export.test.ts`: Mobile cloud export.
- `apps/mobile/__tests__/dsar-export-local-stores.test.ts`: On-device export stores.
- `apps/mobile/__tests__/LocalDataExportLifecycle.test.tsx`: On-device export lifecycle.
- `apps/mobile/__tests__/dsar-temporary-file.test.ts`: Temp file cleanup.

**Test scenarios**

- **Web archive round trip**
  1. Settings > Privacy > Export data.
  2. Wait for ready.
  3. Download.
  - Expected: One or more zip volumes; link expires at the shown time.
- **Double request**
  1. Press Export data twice quickly.
  - Expected: Only one archive preparing.
- **Partial Mobile export**
  1. Use an account whose export is partial (test double).
  2. Press Export Cloud Data.
  - Expected: 'Your export is incomplete' dialog lists gaps; saved file name ends _partial.
- **Local export offline**
  1. Airplane mode, no sign-in.
  2. Storage > Export all my data.
  - Expected: JSON file offered in share sheet.
- **CLI two-step**
  1. `agi export-data` (request).
  2. Wait, run again with --out ./x.
  - Expected: Saved ./x/agi-export-<date>.zip.
- **History import**
  1. Look for an import control for chat history on each app.
  - Expected: None exists (current state).

**Where to look when it fails**

- Check archive status through GET /api/user/export/archives.
- Mobile error classes PartialCloudDataExportError and CloudExportSharingUnavailableError (cloudDataExport.ts:17-32).
- Server job name data-export.expire-archive.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **Chat history import from other assistants does not exist anywhere.** Affects: People moving from ChatGPT or Claude, all six apps.. Evidence: Brief S85.21 missing on all apps; code search found only memory import.. Work needed: Design and build parsers, a create-conversation path and UI.
- **Chrome and VS Code cannot start or download an export.** Affects: Chrome and VS Code users.. Evidence: Brief S85.20.. Work needed: Decide to link to web Settings or add a command.
- **Large histories are truncated at 1000 rows in some sections.** Affects: Heavy users.. Evidence: apps/web/app/api/user/export/route.ts:762. Work needed: Page or stream those sections in the archive.
- **CLI does not distinguish failed or expired archives from none.** Affects: CLI users.. Evidence: apps/cli/src/lib.rs:7433-7440. Work needed: Print the status and reason.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-authentication-and-identity
- api:POST /api/user/export
- api:GET /api/user/export
- api:GET /api/user/export/archives
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- store:mobile-sqlite

## Unknown

- Exact lifetime of an archive before it expires.
- Which database table stores the export job (only the status mapping was read).
- Whether the POST archive request has its own rate limit.
- Whether Desktop shows the identical row; only the hosted-web rule was used.
- Whether the Mobile Storage export is intended to be the recommended path in Local mode.
