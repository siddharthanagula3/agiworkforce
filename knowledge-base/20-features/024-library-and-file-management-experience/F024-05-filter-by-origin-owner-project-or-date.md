---
id: "F024-05"
type: "feature"
title: "Filter by origin, owner, project or date"
aliases: ["Origin filter", "Source-provider filter", "Owner filter", "Project filter", "Date filter", "S24.15", "S24.16", "S24.17", "S24.18"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.15", "S24.16", "S24.17", "S24.18"]
depends_on: ["F024-01", "F024-02", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-api-and-contracts", "table:media_assets", "api:GET /api/library", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-05 Filter by origin, owner, project or date

The only origin filters are Uploads and Generated files: web and Electron desktop as tabs, mobile as chips. There is no connector or source-provider filter, and no owner, project or date filter on any app. CLI, VS Code and Chrome have no filters.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.15](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2415), [S24.16](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2416), [S24.17](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2417), [S24.18](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2418).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Narrows the list by where a file came from. 'Uploaded' means the stored metadata origin is upload or uploaded; everything else counts as generated. (apps/web/lib/server/media-assets.ts:415-421; apps/web/app/api/library/route.ts:79)

**Why it exists.** The brief wants filters for origin (upload, generated, connector), owner, project and created or modified date (S24.15-S24.18).

**Who uses it.** Signed-in people with many files.

**Problems it solves**

- Separating my uploads from assistant output.

**Use cases**

- Click Uploads to see only what I attached.
- Click Generated files to see what the assistant made.
- Look for files from last week: not possible today.

## 2. User experience

**Where to find it**

- Web and Electron desktop: tabs Uploads and Generated files (packages/ui/unified-chat/src/components/library/LibraryView.tsx:97-99).
- Mobile: chips Uploads and Generated files (apps/mobile/src/features/library/index.tsx:913-922).
- Owner, project, date, provider filters: not found on any app.

**Before you start**

- Signed in.

**Screens and controls**

- Tab or chip only. No dropdowns or date pickers found.

**Journey**

1. Open Library.
2. Click Uploads or Generated files.
3. List reloads with the origin filter.
4. Click All to clear.

**What the person sees and gets**

- Mobile empty copy: 'Files you upload will appear here', 'Files AGI creates for you will appear here' (index.tsx:1262-1287).
- Mobile tiles show source label: model short name, or 'Upload' or 'Generated' (apps/mobile/src/features/library/libraryClient.ts:65-73).

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Uploads tab sends origin=uploaded; Generated files tab sends kind=file and origin=generated (LibraryView.tsx:113-115).
- Server: uploaded when metadata origin is 'upload' or 'uploaded'; generated when it is anything else including missing (media-assets.ts:415-421).
- API output origin is 'uploaded' for those values and 'generated' otherwise (route.ts:79).
- Mobile Uploads scope {origin: uploaded}; Generated scope {origin: generated, kind: file} (index.tsx:136-142).

**Incomplete**

- Uploads tab includes uploaded images and videos; Generated files excludes generated images and videos because of kind=file. [inferred from the mappings]
- Saved artifacts have origin 'saved_artifact' in storage and so count as generated (route.ts:259; media-assets.ts:415-421). [inferred]

**Present but disconnected or switched off**

- Contract has provider and model fields on items, but nothing filters by them (library.ts:73-75; route.ts:155-163 does not read them).

**Not available**

- Connector or source-provider filter (Drive, OneDrive, Dropbox): none; connected-file browsing is S24.37 missing.
- Owner filter: none (rows are always the current user's, media-assets.ts:402-440).
- Project filter and created/modified date filter: none on any app.
- All filters on CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- Users can filter by where files came from (upload, generated, connector/provider). (source: S24.15 (brief))
- Users can filter by owner. (source: S24.16 (brief))
- Users can filter by project. (source: S24.17 (brief))
- Users can filter by created or modified date. (source: S24.18 (brief))

**Acceptance criteria**

1. Uploads shows only rows with metadata origin upload or uploaded.
2. Generated files shows kind-file rows whose origin is not upload.
3. An uploaded image is in Uploads and Images, and not in Generated files.
4. A request with an unknown origin value is rejected.
5. The brief's connector, owner, project and date filters are expected absent today and should be reported as such.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Owner filter matters only with shared or organization files; today rows are scoped to one user. [inferred from media-assets.ts:402-440]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a project_id column filter so 'Add to project' files can be filtered.
- [proposed] Add created_at range params to LibraryListQuerySchema.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Tab to query map | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | uploaded and generated tab filters. |
| schema | LIBRARY_ORIGINS | `packages/contracts/cloud-contracts/src/library.ts` | Allowed origins generated, uploaded. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Reads origin and maps metadata to item origin. |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Origin SQL clause. |
| service | persistGeneratedFileBytes | `apps/web/lib/server/generated-file-persist.ts` | Writes metadata origin on generated and saved files. |
| service | chat attachment upload | `apps/web/features/chat/services/chat-attachment-upload.ts` | Upload path used by the Library 'Upload file' (import in web LibraryView.tsx:22); origin write not opened. |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | scopeForFilter and chips. |
| service | libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Sends origin and kind; builds source label. |
| hook | useLibraryAssets | `apps/mobile/src/features/library/useLibraryAssets.ts` | Scope key refetch. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | metadata JSON holds origin; provider, model, source_surface columns. |
| test | Web route test | `apps/web/app/api/library/__tests__/route.test.ts` | derives the uploaded/generated origin filter from metadata.origin. |
| other | Surface matrix | `docs/product/surface-feature-matrix.md` | States CLI, VS Code, Chrome have no library collection. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click Uploads or Generated files; query gets origin. | device | LibraryView.tsx:452-458 |
| Server adds SQL on metadata->>'origin'. | our servers | media-assets.ts:415-421 |
| Server maps each row's metadata origin to the item origin. | our servers | route.ts:66-89 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Origin tag | media_assets.metadata (JSON key origin) | Server held | Lives and dies with the row. |

**Models and providers.** No model is used to filter. The row stores provider and model for generated items, shown as a label on mobile, but there is no filter by them.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Own rows only. |
| Subscription | none found in the code. |
| Limits and metering | none found beyond the paging limits. |
| Feature flags | none found in the code. |
| Model compatibility | Not affected. |
| Provider restrictions | none found in the code. |
| Local mode | Server origin filters apply to cloud-stored files only. Files only on the device are not classified here: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Legacy rows with no origin | Count as generated. | media-assets.ts:417-421 (coalesce to empty, not in upload list) |
| Unknown future origin value in a response | Folded to 'generated'. | library.ts:72 |
| Empty filter | Web generic empty state; mobile specific message. | index.tsx:1262-1287 |
| Selection mode on mobile | Filter forced back to All. | index.tsx:260 |
| Offline, timeout | not handled in the code beyond the list error. | useLibraryAssets.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: Origin filter derived from metadata.origin.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Tab kinds re-fetch.
- `packages/contracts/cloud-contracts/src/__tests__/library.test.ts`: Unknown origin folded to default; unknown filter rejected.
- `apps/mobile/__tests__/LibraryFilterChips.test.tsx`: Chips render and select.

**Test scenarios**

- **Upload appears under Uploads**
  1. Upload a PDF from the Library New menu.
  2. Click Uploads.
  - Expected: PDF listed.
- **Generated excludes uploads**
  1. Click Generated files.
  - Expected: Uploaded PDF not listed.
- **Generated image**
  1. Generate an image.
  2. Check Generated files, then Images.
  - Expected: Not in Generated files; present in Images [inferred].
- **No date filter**
  1. Look for a date control.
  - Expected: None exists today.

**Where to look when it fails**

- Check media_assets.metadata->>'origin' for the row.
- Bad origin returns a validation error from the query schema.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **No source-provider or connector filter.** Affects: all apps. Evidence: S24.15; library.ts:5; no filter code. Work needed: Store a source column and add filter.
- **No owner filter.** Affects: all. Evidence: S24.16 missing. Work needed: Needs shared files first.
- **No project filter.** Affects: all. Evidence: S24.17 missing; no project column in the list SQL (media-assets.ts:402-440). Work needed: Link files to projects in the list.
- **No date filter.** Affects: all. Evidence: S24.18 missing. Work needed: Add date range params and UI.
- **Brief marks S24.15 done on web and desktop though only two origins exist.** Affects: documentation. Evidence: brief S24.15 vs library.ts:5. Work needed: Correct the brief row.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-01
- F024-02
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-api-and-contracts
- table:media_assets
- api:GET /api/library
- surface:web
- surface:mobile

## Unknown

- Where the upload path writes metadata origin 'upload' (upload handler not opened).
- Whether any file has source_surface used for display or filtering.
- Whether the Electron desktop adds filters beyond the web page.
