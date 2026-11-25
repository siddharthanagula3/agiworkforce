---
id: "F095-09"
type: "feature"
title: "Download and export"
aliases: ["Download and export", "File download (S95.20)", "Export packaging (S95.21)", "File conversion (S95.22)", "Export data", "Account data export", "GET /api/files/[id]"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.20", "S95.21", "S95.22"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:media_assets", "table:project_knowledge_files", "table:background_jobs", "api:GET /api/files/[id]", "api:POST /api/user/export", "F095-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-09 Download and export

Download serves a Library file only to its owner in the active workspace, with safe headers and a monthly download allowance. Export data (web) builds a zip of account JSON plus library and project files for a 24-hour link; desktop and mobile export JSON only. Conversion has no endpoint; it is a LibreOffice command the model runs in a sandbox.

Area: [95. File and Library components](README.md). Requirement items: [S95.20](../../10-requirements/capabilities/095-file-and-library-components.md#s9520), [S95.21](../../10-requirements/capabilities/095-file-and-library-components.md#s9521), [S95.22](../../10-requirements/capabilities/095-file-and-library-components.md#s9522).

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

**What it does.** Streams or redirects file bytes after an access check (apps/web/app/api/files/[id]/route.ts:194-347); builds a downloadable archive of the account's data and files in background jobs (apps/web/lib/server/data-export-archive.ts:508-720); lets the assistant convert office files in a code sandbox using an installed LibreOffice (apps/web/lib/e2b/execution-tools.ts:31-33).

**Why it exists.** People must be able to take their files and data out (data portability), and users of generated documents want other formats such as PDF. Access checks stop other accounts reaching private bytes.

**Who uses it.** Any signed-in user downloading a Library file; account owners requesting a data export; users asking the assistant for a PDF or other converted file.

**Problems it solves**

- Bytes are never served without a per-request access check and a 404 for another workspace.
- Browser-executable types (html, svg, xml) are forced to download so they cannot run on the app origin (apps/web/lib/security/served-bytes.ts:41-55).
- Large exports do not run in one request; they are split into volumes of about 1 GiB and processed in jobs (data-export-archive.ts:48, :597-720).
- Unreadable files are listed in unavailable-files.json instead of failing the whole export (data-export-archive.ts:55).

**Use cases**

- User clicks Download on a PDF in the Library.
- User presses 'Export data' in settings and later opens the zip link or emailed link.
- User asks the assistant to turn a Word file into a PDF; the model runs soffice in its sandbox.
- User on Desktop exports Cloud account data as a JSON file.

## 2. User experience

**Where to find it**

- surface:web: Library row action 'Download' (shared LibraryView handleDownload, packages/ui/unified-chat/src/components/library/LibraryView.tsx:559-600); Settings privacy section, row 'Export data' with button 'Export data' / 'Preparing…' (apps/web/features/settings/components/DataExportRow.tsx:275, :301; used by apps/web/features/settings/sections/PrivacySection.tsx:24).
- surface:desktop: Settings privacy, 'Export Cloud account data' with button 'Export Cloud data'; saves a JSON file (apps/desktop/src/features/settings/Privacy/CloudDataSection.tsx:85, :104; apps/desktop/src/api/cloudAccountData.ts:4-6). Library download uses the shared view.
- surface:mobile: cloud account screen button 'Export Cloud Data' (apps/mobile/src/features/settings/cloud-account/index.tsx:916); the client reads JSON from /api/user/export and shares it (apps/mobile/services/cloudDataExport.ts:49).
- surface:cli, surface:vscode, surface:chrome: not found.
- Conversion: no screen; it happens inside a chat turn.

**Before you start**

- Signed in (download returns 401 when not).
- For the archive: object storage with multipart support configured, otherwise 'Exporting your files is not available on this deployment.' (data-export-archive.ts:515-517).
- For conversion: code sandbox available and an office template pinned in AGI_E2B_CHAT_TEMPLATE (apps/web/lib/e2b/chat-template.ts:1).

**Screens and controls**

- Library: Download menu item; a row error 'This file is larger than the file downloads left this month.' for large uploads over the allowance (LibraryView.tsx:312, :562-566).
- Export data row: description 'Download a copy of your account data and files.' status text, 'Check again' link, download links per volume (DataExportRow.tsx:277, :309, :329).
- Desktop and mobile: a single export button with 'Exporting…' state.

**Journey**

1. Download: click Download on a file; the app fetches /api/files/{id} and saves the blob, or for large chat uploads navigates the browser to it (LibraryView.tsx:559-590).
2. Export on web: press 'Export data'; the app sends POST /api/user/export.
3. Server stages the JSON and starts a background build; the page shows 'We're preparing your export...' and polls.
4. When ready, the page shows download links (valid 24 hours) and, if email is verified, an email is sent.
5. Click a link; the server checks ownership and redirects to a 5-minute signed storage URL.
6. Conversion: ask the assistant to convert a file; it runs the command in the sandbox and the result is saved as a generated file.

**What the person sees and gets**

- Download: file saved, or row errors such as 'That file could not be downloaded.' (LibraryView.tsx:592).
- 413 'File exceeds the inline serving limit' for files over the serve cap (route.ts:121-125).
- Plan limit message: '<Plan> includes <size> of file downloads a month, and this month's is used up...' (tier-unit-quota-service.ts:485-510).
- Export: preparing, ready, failed and expired states; zip names agi-export-<date>[-part-N].zip (data-export-archive.ts:487-490).
- Desktop and mobile: JSON file; mobile warns 'Your export is incomplete' when the server marks it partial (index.tsx:454-480).

**Settings**

- Verified account email decides email or in-app delivery (data-export-archive.ts:498-507).
- AGI_E2B_CHAT_TEMPLATE (name only) enables the office conversion note for the model.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/files/[id]: rate limit files-serve, UUID check, owner-in-active-workspace lookup, 404 for deleted or other-workspace files (route.ts:194-210).
- Serves with Content-Type, Content-Disposition, Cache-Control 'private, no-store' and X-Content-Type-Options nosniff (route.ts:47, :300-309, :338-346).
- Caps: 30 MiB inline, 256 MiB for video with range support; large chat uploads redirect to a short-lived signed URL for navigations or capable clients (route.ts:45-46, :161-192, :262-300).
- Download allowance checked and egress recorded; generated images and videos by the owner with provenance do not spend it (tier-unit-quota-service.ts:472-483; route.ts:328-336).
- Export JSON via GET /api/user/export and archive via POST returning 202 (apps/web/app/api/user/export/route.ts:37, :3412-3447).
- Archive build: stored-method zip writer, library files then project files per workspace, volumes, unavailable list, expiry job, ready email job (data-export-archive.ts:597-720; stored-zip-writer.ts:53).
- Download of an archive part verifies ownership and redirects to a 300-second signed URL (archives/[exportId]/route.ts:36-72).
- Link lifetime is 24 hours (packages/contracts/cloud-contracts/src/data-export.ts:7).

**Incomplete**

- Conversion has no dedicated endpoint or screen. The brief's code pointers (chat-attachment-hydration.ts:437, tool-loop.ts:3985) are attachment reading and tool-schema loading, not conversion. The only conversion mechanism found is a prompt note telling the model that soffice --headless --convert-to pdf exists (execution-tools.ts:31-33) plus the template build script (apps/web/scripts/build-e2b-office-template.mjs:5-14).
- Derivation 'conversion' is an allowed lineage value (packages/contracts/types/src/file-model.ts:32), but no caller records it (no production caller passes provenance).
- Account archive covers the user's live library files (not temporary-chat or trashed) and current project files only (data-export-archive.ts:279-318).

**Present but disconnected or switched off**

- Office conversion note appears only when AGI_E2B_CHAT_TEMPLATE is set (request-processor.ts:5930).

**Not available**

- surface:desktop and surface:mobile: no file archive, JSON only.
- surface:cli, surface:vscode, surface:chrome: not found.
- Download of a file by another workspace member: not available, the lookup requires user_id equal to the caller (media-assets.ts:495-520).

## 4. Required behaviour

**Established requirements**

- Downloads are authorised per request against owner/workspace and served with safe headers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.20)
- Exports are packaged (archive of files and metadata). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.21)
- Files can be converted between formats server-side. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.22)
- Execution boundaries must be stated from code; sandboxing and code execution depend on an AGI harness, not on the model. (source: AGENTS.md section 4 (project instructions))

**Acceptance criteria**

1. A signed-out request to /api/files/{id} returns 401; another account's id returns the same 404 as an unknown id.
2. A trashed file returns 404.
3. An html or svg file is served as attachment with application/octet-stream.
4. Responses carry Cache-Control private, no-store and X-Content-Type-Options nosniff.
5. When the monthly download allowance is used up the file is refused with the plan message.
6. POST /api/user/export returns 202 with a preparing archive; a second request while preparing returns the same archive.
7. The archive contains export.json, files/library and files/projects entries, and unavailable-files.json when a file cannot be read.
8. An archive link works for 24 hours and then answers that it has expired.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Server-side conversion is intended to be done by the sandbox, not a separate service [inferred from the code found].
- Desktop and mobile JSON export is intended to be partial compared with the web archive [inferred]; the brief says archive of files and metadata.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a dedicated, metered convert action or at least record derivation 'conversion' lineage for sandbox outputs.
- [proposed] Offer the file archive on Desktop and Mobile, or link to the web export.
- [proposed] Correct the brief's code pointers for S95.22.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Authorised file serving, ranges, redirect for large files, PDF preview. |
| service | getActiveWorkspaceMediaAssetById | `apps/web/lib/server/media-assets.ts` | Owner and workspace lookup excluding deleted rows. |
| service | servedByteHeaders | `apps/web/lib/security/served-bytes.ts` | Forces attachment for browser-executable types. |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | downloadSpendsAllowance, assertDownloadAllowance, PlanDownloadLimitError. |
| service | infrastructure-cost recordEgressBytes | `apps/web/lib/services/infrastructure-cost.ts` | Records egress for each download. |
| endpoint | api:GET /api/user/export | `apps/web/app/api/user/export/route.ts` | Full JSON of account data (download=true gives a file). |
| endpoint | api:POST /api/user/export | `apps/web/app/api/user/export/route.ts` | Requests the zip archive (202). |
| endpoint | api:GET /api/user/export/archives | `apps/web/app/api/user/export/archives/route.ts` | Reads the latest archive status. |
| endpoint | api:GET /api/user/export/archives/[exportId] | `apps/web/app/api/user/export/archives/[exportId]/route.ts` | Owner-checked redirect to a signed URL for a volume. |
| service | data-export-archive | `apps/web/lib/server/data-export-archive.ts` | Request, build volume job, expiry job, erase, ready email job. |
| service | StoredZipWriter | `apps/web/lib/server/stored-zip-writer.ts` | Streams a zip without compression. |
| job | data-export.build-archive, data-export.expire-archive, email.data-export-ready | `apps/web/lib/server/data-export-archive.ts` | Background jobs for the archive. |
| config | data-export contracts | `packages/contracts/cloud-contracts/src/data-export.ts` | Paths, statuses, 24-hour lifetime, schemas. |
| component | DataExportRow | `apps/web/features/settings/components/DataExportRow.tsx` | Web export UI with polling. |
| component | CloudDataSection | `apps/desktop/src/features/settings/Privacy/CloudDataSection.tsx` | Desktop JSON export button. |
| service | desktop cloudAccountData | `apps/desktop/src/api/cloudAccountData.ts` | Fetches /api/user/export?download=true. |
| service | mobile cloudDataExport | `apps/mobile/services/cloudDataExport.ts` | Fetches export JSON and shares it. |
| component | LibraryView handleDownload | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Client download and allowance warning. |
| config | e2b chat-template and execution-tools | `apps/web/lib/e2b/execution-tools.ts` | Office rendering note that tells the model how to convert. |
| command | build-e2b-office-template | `apps/web/scripts/build-e2b-office-template.mjs` | Builds the sandbox template with LibreOffice and poppler. |
| service | managed-office-preservation | `apps/web/lib/services/managed-office-preservation.ts` | Checks office packages and render verification for generated office files. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client requests the file; server rate limits, checks sign-in and looks up the file for this user and workspace. | our servers | apps/web/app/api/files/[id]/route.ts:194-210 |
| Server checks the download allowance, streams bytes from private object storage and records egress. | our servers | route.ts:318-336; storage read via streamStoredMedia (route.ts:23) |
| Object storage holds the bytes; large chat uploads are sent by a signed URL straight from storage. | outside service | route.ts:161-192 |
| Browser saves the blob. | device | LibraryView.tsx:575-583 |
| Export request: server collects account data, stages export.json in private storage, enqueues the build job. | our servers | data-export-archive.ts:508-560 |
| Build job streams library and project files into zip volumes through a multipart upload to private storage, then schedules expiry and the ready email. | our servers | data-export-archive.ts:597-720 |
| Email is sent through the notification email service when configured and verified. | outside service | data-export-archive.ts:498-507, :777 |
| Conversion: the model calls a code tool; the command soffice runs in a remote E2B sandbox, and output files are persisted as generated files. | outside service | apps/web/lib/e2b/execution-tools.ts:31-33; apps/web/lib/server/generated-file-persist.ts:217 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Staged export.json and zip volumes | Private object storage under an export prefix | Not synced. | Deleted by the expiry job after 24 hours and on account erasure (data-export-archive.ts:724-775). |
| Export job state | table:background_jobs | Server only. | Payload read by status route; erased with the account. |
| Download egress records | infrastructure cost and download allowance records (tier-unit-quota-service.ts:440-460) | Server only. | Not read in detail (unknown). |
| Converted output file | Private object storage plus table:media_assets row | Server only. | Follows F095-08. |

**Models and providers.** Download and export use no model. Conversion is chosen by the model during a chat turn, so a model that cannot call the code tool cannot convert; the tool depends on the AGI sandbox harness and an E2B template, not on the model itself (apps/web/lib/e2b/execution-tools.ts:63-76).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required (route test returns 401; archives route redirects browsers to sign in: archives/[exportId]/route.ts:36-50). |
| Permissions | File: owner in the active workspace only. Export: the account owner. Archive volume: owner via getUserScopedDb. |
| Subscription | Monthly download allowance per plan through getBillingPlanProductLimits monthlyDownloadBytes, plus a daily allowance on Free (tier-unit-quota-service.ts:440-510). Export and conversion: no plan rule found in the files read. |
| Limits and metering | Inline cap 30 MiB, video 256 MiB, 5-minute signed redirect for large files, 5-minute signed export URL, 24-hour export life, about 1 GiB per volume, 100 files per page, rate limits files-serve and user-data-export. |
| Feature flags | none found in the code besides environment configuration (AGI_E2B_CHAT_TEMPLATE for conversion note; object storage credentials for archive). |
| Model compatibility | Download and export: none found. Conversion needs a model that can use the code execution tool (not verified per model). |
| Provider restrictions | Object storage must support multipart for the archive; sandbox provider E2B for conversion. |
| Local mode | Download, archive and conversion routes are Cloud. Local files on the device are not covered by these routes. Desktop's Cloud export button is labelled 'Export Cloud data'. Whether a Local-mode export exists: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | 401 for API; browser navigation to an archive link redirects to sign-in and back. | archives/[exportId]/route.ts:36-50 |
| Other workspace or deleted file | Same 404 'File not found'; no bytes. | route.ts:205-208; apps/web/app/api/files/[id]/__tests__/route.test.ts |
| File too large to serve inline | 413 PAYLOAD_TOO_LARGE or redirect for sealed large chat uploads. | route.ts:121-125, :228-238 |
| Bad range | 416 with Content-Range */size. | route.ts:263-275 |
| Allowance used up or count unreadable | PlanDownloadLimitError, or 'Downloads are temporarily unavailable. Try again shortly.' | tier-unit-quota-service.ts:496-509 |
| Export preparing | A second request returns the existing archive without a new one; archive link answers 409 'still being prepared'. | data-export-archive.ts:521-523, :474-476 |
| Export expired | 404 'This download link has expired. Request a new export from Settings.' | data-export-archive.ts:477-481 |
| File unreadable during export | Listed in unavailable-files.json; export continues. | data-export-archive.ts:55, :655-668 |
| Build job final failure | Staged data discarded. | data-export-archive.ts:683-686 |
| Poll stalls or status read fails | Page says it is taking longer and offers 'Check again'. | DataExportRow.tsx:322-345 |
| Export incomplete (desktop and mobile JSON) | Mobile alerts 'Your export is incomplete' and can save what is included. | apps/mobile/src/features/settings/cloud-account/index.tsx:454-490 |
| Offline | not handled in the code beyond a failed request message. | searched the download handlers; none found |
| Accessibility | Status message uses role status in the web export row. | DataExportRow.tsx:320 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/files/[id]/__tests__/route.test.ts`: 401, workspace 404, non-UUID 404, deleted 404, missing bytes 404, exact bytes and headers, generated image allowance rule.
- `apps/web/app/api/files/[id]/__tests__/generated-file-pipeline.integration.test.ts`: Generated file persist then serve.
- `apps/web/lib/services/__tests__/download-allowance.test.ts`: Download allowance rules.
- `apps/web/lib/server/data-export-archive.test.ts`: Delivery choice, admission, staging, concurrent requests.
- `apps/web/app/api/user/export/__tests__/route.archive-request.test.ts`: Archive request validation.
- `apps/web/app/api/user/export/__tests__/route.completeness.test.ts`: Completeness status of JSON export.
- `apps/web/app/api/user/export/__tests__/export-covers-personal-data.test.ts`: Export covers personal data tables.
- `apps/web/app/api/user/export/__tests__/export-media-download-links.test.ts`: Media links in the export.
- `apps/web/app/api/user/export/archives/[exportId]/__tests__/route.test.ts`: 401, sign-in redirect, volume validation, owner redirect to signed URL, default volume.
- `apps/web/app/api/user/export/archives/__tests__/route.test.ts`: Archive status route.
- `apps/web/lib/services/managed-office-render.integration.test.ts`: Office render in a cloud sandbox when a template is pinned.

**Test scenarios**

- **Cross-workspace download**
  1. Create a file in workspace A.
  2. Switch to workspace B and request /api/files/{id}.
  - Expected: 404 with no bytes and no storage read.
- **Executable type**
  1. Generate an html file and open its /api/files URL.
  - Expected: Content-Type application/octet-stream, Content-Disposition attachment, nosniff, private no-store.
- **Allowance used up**
  1. Use a plan near its monthly download limit.
  2. Download a file larger than what remains.
  - Expected: Refused with the plan download message; nothing streamed.
- **Archive end to end**
  1. Press Export data on web with several library and project files.
  2. Wait for ready.
  3. Open the link.
  - Expected: Zip with export.json and file entries; link redirects to a signed URL and expires after 24 hours.
- **Unreadable file**
  1. Remove one stored object, then request an export.
  - Expected: Archive completes and unavailable-files.json lists that file.
- **Convert to PDF**
  1. Attach a docx and ask the assistant for a PDF in a deployment with the office template pinned.
  - Expected: A PDF generated file appears; verify bytes are a parsable PDF.

**Where to look when it fails**

- Log 'Failed to ...' and '[data-export] a file was unreadable' (data-export-archive.ts:655).
- Error 'Exporting your files is not available on this deployment.'
- Audit event data_exported with source gdpr_portability_archive.
- Header X-Export-Status on JSON export.
- Tables background_jobs (kinds data-export.build-archive and data-export.expire-archive), media_assets.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No real server-side conversion feature; only a model prompt note and a sandbox template.** Affects: All apps; users expecting a Convert action.. Evidence: apps/web/lib/e2b/execution-tools.ts:31-33; brief pointers at chat-attachment-hydration.ts:437 and tool-loop.ts:3985 do not convert.. Work needed: Define the feature (endpoint or tool), meter it, record lineage with derivation conversion.
- **Desktop and mobile export JSON only and not the file archive.** Affects: surface:desktop, surface:mobile.. Evidence: apps/desktop/src/api/cloudAccountData.ts:6; apps/mobile/services/cloudDataExport.ts:49.. Work needed: Use POST /api/user/export and the archives routes or deep-link to web.
- **Archive excludes trashed and temporary-chat files and superseded project versions.** Affects: Users expecting everything.. Evidence: data-export-archive.ts:279-318.. Work needed: Decide and document the scope; add to the export note.
- **Workspace members cannot download a file another member shared via a shared project through this route.** Affects: Shared project members.. Evidence: media-assets.ts:495-520 filters user_id = caller.. Work needed: Confirm whether project files are served by a different route; add access if intended.
- **Download and conversion not covered for CLI, VS Code, Chrome.** Affects: Those apps.. Evidence: No calls found in apps/cli.. Work needed: Decide scope.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:media_assets
- table:project_knowledge_files
- table:background_jobs
- api:GET /api/files/[id]
- api:POST /api/user/export
- F095-08

## Unknown

- How much of the account JSON export is files versus metadata on desktop and mobile (only the route was read).
- Per-plan monthlyDownloadBytes values.
- Whether any production path records derivation 'conversion'.
- Whether project knowledge files are downloadable by shared project members through another route.
- Which E2B template is pinned in each environment.
- Whether mode:local has any export of device files.
- Whether apps/vscode or the Chrome extension download files (their folders were not found).
