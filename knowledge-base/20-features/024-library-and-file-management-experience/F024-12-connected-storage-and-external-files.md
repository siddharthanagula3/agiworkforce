---
id: "F024-12"
type: "feature"
title: "Connected storage and external files"
aliases: ["Connected storage", "Cloud drives in Library", "External files", "Drive, OneDrive and Dropbox in Library", "S24.37", "S24.38", "S24.39", "S24.40"]
area: "24 Library and file-management experience"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.37", "S24.38", "S24.39", "S24.40"]
depends_on: ["F024-10", "F024-08", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-security-and-privacy", "table:media_assets", "surface:web", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "5 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-12 Connected storage and external files

The Library cannot browse Drive, OneDrive or Dropbox, refresh external file metadata, save external content as a copy, or mark a row as an external reference. Every Library row is an owned stored file. Drive and OneDrive features exist elsewhere in the web app, in connectors and project knowledge, not in the Library.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.37](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2437), [S24.38](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2438), [S24.39](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2439), [S24.40](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2440).

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

**What it does.** Would let people browse connected cloud drives from the Library, refresh the details of linked files, save an external file as an owned copy and tell references from owned files.

**Why it exists.** The brief requires connected-file browsing and clear separation of owned and external files (S24.37 to S24.40), as leader products do. (doc: docs/product/competitive-guidance.md:178 notes connected storage expanding in a leader's Library)

**Who uses it.** People whose documents live in Drive, OneDrive or Dropbox. Nobody can use it in the Library yet.

**Problems it solves**

- Planned: using cloud documents without manual download.
- Planned: keeping linked file details current.
- Planned: knowing which files are only linked.

**Use cases**

- Browse a Drive folder and add a doc to a chat.
- Save a Drive file as an owned copy.
- Refresh the title of a linked file.
- See an 'external' badge on a linked file.

## 2. User experience

**Where to find it**

- Not available in the Library on web, desktop, mobile, CLI, VS Code or Chrome.
- Nearby but separate: a Google Drive picker endpoint and save-to-Drive and save-to-OneDrive endpoints for artifacts exist in the web app (apps/web/app/api/connectors/google-drive/picker/route.ts; apps/web/app/api/artifacts/save-to-drive/route.ts; apps/web/app/api/artifacts/save-to-onedrive/route.ts); where they appear in the UI: unknown.

**Before you start**

- None for the Library; the feature does not exist there.

**Screens and controls**

- Library filters are the tab and surface filters over owned files only; origin is 'uploaded' or 'generated' (packages/contracts/cloud-contracts/src/library.ts:5).
- No connected-storage control in the Library header or New menu (the shared packages/ui/unified-chat/src/components/library/LibraryView.tsx:975-985 is a hidden file input, not the menu; in the web host, Create folder navigates to Projects, apps/web/features/library/components/LibraryView.tsx:148, and upload is wired through uploadChatAttachments at :179-180).
- In the web host, Add to project copies the library file into project knowledge via readLibraryItemFile (apps/web/features/library/components/LibraryView.tsx:234-237); this is a copy of an owned file, not a connected-storage action.

**Journey**

1. Open the Library.
2. Look for a connected drive source: none appears.
3. Workaround: import a Drive file into a project through Projects (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts shows a Drive refresh exists there).

**What the person sees and gets**

- No output in the Library.

**Settings**

- Connector availability is controlled elsewhere (assertConnectorsReleased is called by the Drive picker route: apps/web/app/api/connectors/google-drive/picker/route.ts:19).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Every Library row is an owned media_assets row; origin is only 'uploaded' or 'generated' (apps/web/app/api/library/route.ts:66-89; library.ts:5).
- Drive picker configuration route (returns 'not-configured' without the picker key and app id) (picker/route.ts:20-30). When configured it returns status 'ready' with the Drive access token, developer key and app id to the caller, so file selection runs in the browser against Google (picker/route.ts:44-52).
- Drive import and refresh for project knowledge exist in project knowledge code (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:1-20; importDriveFileIntoProject in apps/web/lib/server/project-drive-import.ts:121).
- Save artifact to Drive or OneDrive endpoints exist (apps/web/app/api/artifacts/save-to-drive/route.ts, save-to-onedrive/route.ts).
- Dropbox is available as an OAuth MCP connector in the connector catalog, with MCP endpoint https://mcp.dropbox.com/mcp (apps/web/lib/connectors/catalog.ts:254; apps/web/lib/connectors/mcp-endpoints.ts:133-135); it is not part of the Library.

**Incomplete**

- Connected-storage features live in Projects and Artifacts, not in the Library [inferred from the Library code reading no connector module].

**Present but disconnected or switched off**

- Connector routes call assertConnectorsReleased, which throws connectorsComingSoonError (403, 'Connectors are coming soon.') unless connectorsReleased() is true (apps/web/lib/connectors/connector-capability.ts:23-33). CONNECTOR_RELEASE_STATE in packages/contracts/types/src/connector-release.ts:14 is 'coming_soon', and Drive and Dropbox are not in SELECTIVELY_RELEASED_CONNECTOR_IDS, so as the code stands the picker route is blocked [read from the constant; deployed behaviour not run].

**Not available**

- Browsing Drive, OneDrive and Dropbox in the Library on all six apps (S24.37).
- Refresh external metadata (S24.38).
- Save external content as an owned copy from the Library (S24.39).
- Marker for external references (S24.40).
- Any Dropbox route or Library integration: no Dropbox route under apps/web/app/api; Dropbox exists only as an OAuth MCP connector (catalog.ts:254; mcp-endpoints.ts:133-135).

## 4. Required behaviour

**Established requirements**

- Users can browse files in connected storage (Drive, OneDrive, Dropbox) from the product. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.37)
- Users can refresh metadata of externally linked files. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.38)
- Users can save external content as an owned copy in the Library. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.39)
- The Library visibly distinguishes external references from owned files. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.40)
- Connected storage expands in a leader's Library (September 10). (source: docs/product/competitive-guidance.md:178)

**Acceptance criteria**

1. A connected drive appears as a source in the Library after the account connects it.
2. Browsing lists the drive's files without copying them.
3. An external reference carries a visible marker; owned files do not.
4. Save as copy creates an owned Library row, counted in storage, with a normal file name.
5. Refresh updates the title and modified date of a reference and reports a clear error if access is revoked.
6. Disconnecting the drive removes its references or marks them unavailable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local mode must not send a local file or chat to a connector without consent, per the trust-boundary rule [inferred from AGENTS.md section 6].
- Stored copies need the storage allowance check [inferred from file-storage.ts:63-75].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the project knowledge Drive import and refresh code for a Library 'Add from Drive' action.
- [proposed] Add a 'source' value of 'external' to the item schema, with a link field.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Owned rows only (lines 66-89, 170-183). |
| schema | LIBRARY_ORIGINS | `packages/contracts/cloud-contracts/src/library.ts` | Origins 'generated' and 'uploaded' only (line 5). |
| service | listLibraryAssets | `apps/web/lib/server/media-assets.ts` | Queries media_assets only (396-451). |
| endpoint | GET /api/connectors/google-drive/picker | `apps/web/app/api/connectors/google-drive/picker/route.ts` | Drive picker configuration; returns a live Google access token, picker key and app id to the browser (lines 44-52); not used by the Library. |
| service | google-drive-files connector | `apps/web/lib/connectors/google-drive-files.ts` | Drive access helpers (imported by the picker and refresh routes). |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | resolveConnectorAccessToken for connectors (picker/route.ts:9-12). |
| service | connector-capability | `apps/web/lib/connectors/connector-capability.ts` | assertConnectorsReleased, planIncludesConnectors (canUseBillingPlanCapability 'connectors') and the canUseConnectors kill switch (lines 23-40). |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Release state 'coming_soon' and the selective release list (line 14); read by connectorsReleased(). |
| config | Dropbox connector catalog entry and MCP endpoint | `apps/web/lib/connectors/catalog.ts` | Dropbox as an OAuth MCP connector (catalog.ts:254; apps/web/lib/connectors/mcp-endpoints.ts:133-135); no Library use. |
| endpoint | POST project knowledge file refresh | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts` | Refresh of a Drive-imported project file; the nearest thing to S24.38. |
| service | importDriveFileIntoProject | `apps/web/lib/server/project-drive-import.ts` | Imports a Drive file into a project (defined at line 121; imported by the refresh route, lines 15-20, together with resolveDriveAccess, assertDriveImportableProject and driveImportLimits). |
| endpoint | save-to-drive and save-to-onedrive | `apps/web/app/api/artifacts/save-to-drive/route.ts` | Pushes artifacts out to Drive; export, not browse. |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Transport with no connected-storage method (lines 128-264); createFolder navigates to Projects (line 148), upload at 179-180, Add to project via readLibraryItemFile (234-237). |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | LibraryTransport interface (line 254) has no external-source method. |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | No connected source. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Owned file rows. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Library requests owned files; the server queries media_assets for the user and workspace. | our servers | apps/web/lib/server/media-assets.ts:396-447 |
| No step contacts an outside drive from the Library. | device | Library transport has no such call (apps/web/features/library/components/LibraryView.tsx:128-264) |
| Outside the Library, the Drive picker route hands a Google access token, picker key and app id to the client, so file selection runs in the browser against Google; the server fetches Drive file content with the connector token when a project import or refresh runs. The outside service is Google Drive. | device and our servers | apps/web/app/api/connectors/google-drive/picker/route.ts:44-52; apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:15-20 (imports from project-drive-import) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Owned Library file rows | media_assets and object storage | Cloud | 30-day recovery, see F024-09 |
| Connector tokens | Not opened; handled by connectors code | unknown | unknown |
| Live Google Drive access token returned to the browser by the picker route | Sent in the picker response to the client (picker/route.ts:44-52); storage on the client not opened | unknown | unknown |

**Models and providers.** No model or inference provider takes part in the Library. The external providers here are storage services (Google Drive, OneDrive), not model providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; connecting a drive needs the connector's own sign-in (picker route requires a user, line 18). |
| Permissions | Connector OAuth scopes: not opened. The picker route gives the browser a live Google access token (picker/route.ts:44-52), a trust-boundary fact for Local mode. |
| Subscription | none found in the code for the Library part. Connectors are plan-gated: planIncludesConnectors uses canUseBillingPlanCapability(..., 'connectors') (apps/web/lib/connectors/connector-capability.ts:23-40); which plans include it was not opened. |
| Limits and metering | none found in the code for the Library. An owned copy would count against file storage (file-storage.ts:63-75) [inferred]. |
| Feature flags | Connector routes call assertConnectorsReleased (picker/route.ts:19), which returns a 403 until connectorsReleased() is true; CONNECTOR_RELEASE_STATE is 'coming_soon' in packages/contracts/types/src/connector-release.ts:14 and Drive is not in the selective release list. A canUseConnectors kill switch also applies (connector-capability.ts:23-40). |
| Model compatibility | Not model dependent. |
| Provider restrictions | Drive picker returns 'not-configured' when GOOGLE_PICKER_API_KEY or GOOGLE_PICKER_APP_ID is missing (names only; picker/route.ts:20-25). |
| Local mode | Not available. A connector is an outside service reached through our servers; Local mode would need an explicit consent step before any such call [inferred from AGENTS.md section 6]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any state in the Library (loading, error, offline, revoked access) | not handled in the code | No connected-storage code found in LibraryView.tsx or index.tsx |
| Drive picker not configured | Route returns status 'not-configured'. | apps/web/app/api/connectors/google-drive/picker/route.ts:20-25 |
| Connectors not released | Connector routes throw a 403 'Connectors are coming soon.' while connectorsReleased() is false. | apps/web/lib/connectors/connector-capability.ts:23-33; packages/contracts/types/src/connector-release.ts:14 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: Owned list only; nothing on external files.

**Test scenarios**

- **No external rows**
  1. Connect Google Drive in settings.
  2. Open the Library.
  - Expected: Only owned files are listed; no drive source.
- **Origin values**
  1. Call GET /api/library and read each item's origin.
  - Expected: Only 'uploaded' or 'generated'.
- **Drive project import still works**
  1. Import a Drive file into a project.
  2. Refresh it.
  - Expected: Refresh works from the Projects page, not from the Library (check the Projects UI).

**Where to look when it fails**

- Route 'not-configured' status for the picker.
- Connector errors surface through connectorUnreachableMessage (picker/route.ts:9-12).
- A 403 'Connectors are coming soon.' means connectorsReleased() is false.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No connected-storage browsing in the Library** Affects: All users, all apps. Evidence: Brief S24.37; LibraryTransport has no such method (LibraryView.tsx:254). Work needed: Define a source model and a browse API, then UI.
- **No refresh of external metadata from the Library** Affects: All users. Evidence: Brief S24.38. Work needed: Reuse the project refresh code path.
- **No save-as-copy of external content** Affects: All users. Evidence: Brief S24.39. Work needed: Server fetch into object storage with a storage allowance check.
- **No external-reference marker and no 'external' origin** Affects: All users. Evidence: library.ts:5; brief S24.40. Work needed: Extend the item schema and UI.
- **No Dropbox route or Library integration (Dropbox exists only as an OAuth MCP connector)** Affects: Users of Dropbox. Evidence: No Dropbox route under apps/web/app/api; Dropbox is a catalog connector (apps/web/lib/connectors/catalog.ts:254; apps/web/lib/connectors/mcp-endpoints.ts:133-135). Work needed: Decide scope, then build Library browsing for the Dropbox connector.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-10
- F024-08
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-security-and-privacy
- table:media_assets
- surface:web
- surface:mobile
- mode:cloud

## Unknown

- Where in the web UI the Drive picker and save-to-Drive routes are used.
- Whether the deployed build allows connectors (the repository constant CONNECTOR_RELEASE_STATE is 'coming_soon').
- Whether a Library integration for the Dropbox connector is planned anywhere in the repository.
- Which plans include the connectors capability.

## Second reader's check

A second reader checked 10 statements of this page against the code: 5 correct, 5 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3/5):** "Not available: 'Any Dropbox route: none found'; gap 'No Dropbox support found'" The code shows: No Dropbox route under apps/web/app/api, but Dropbox is a catalog connector (oauth2 MCP) with an MCP endpoint https://mcp.dropbox.com/mcp. So Dropbox support exists as a connector, just not in the Library. (apps/web/lib/connectors/catalog.ts:254; apps/web/lib/connectors/mcp-endpoints.ts:133-135). **Corrected:** Dropbox is available as an OAuth MCP connector (catalog.ts:254, mcp-endpoints.ts:133); there is no Dropbox route or Library integration.
- **Wrong (section 5):** "importDriveFileIntoProject is in apps/web/lib/server/project-knowledge-files.ts (named in the refresh route imports, lines 17-19)" The code shows: The function lives in project-drive-import.ts. The refresh route imports importDriveFileIntoProject, resolveDriveAccess, assertDriveImportableProject, driveImportLimits from '@/lib/server/project-drive-import' (route lines 15-20). Note the page's other citation of 'importDriveFileIntoProject' in the route imports is right on the name, wrong on the file. (apps/web/lib/server/project-drive-import.ts:121; apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:15-20). **Corrected:** importDriveFileIntoProject is in apps/web/lib/server/project-drive-import.ts:121.
- **Partly wrong (section 6):** "Drive files are fetched by the server with a connector token when a project import or refresh runs; cites picker/route.ts:9-12 as the source" The code shows: Import/refresh is server-side (refresh route uses project-drive-import and GoogleDriveFileError). But the picker route does not fetch files: it returns the Drive access token plus developerKey and appId to the caller (status 'ready'), so the browser talks to Google directly. Lines 9-12 are only imports. (apps/web/app/api/connectors/google-drive/picker/route.ts:9-12, 44-52). **Corrected:** The picker route hands a Google access token, picker key and app id to the client, so file selection runs in the browser against Google; the server fetches file content during project import/refresh.
- **Partly wrong (section 7):** "Feature flags: assertConnectorsReleased value is unknown; Subscription: connector entitlement unknown" The code shows: The gate is checkable: assertConnectorsReleased throws connectorsComingSoonError (403, CONNECTORS_COMING_SOON_MESSAGE) unless connectorsReleased() from @agiworkforce/types is true. The same file ties connectors to a plan capability (canUseBillingPlanCapability(..., 'connectors')) and a kill switch 'canUseConnectors'. (apps/web/lib/connectors/connector-capability.ts:23-33). **Corrected:** Connectors are blocked with a 403 until connectorsReleased() is true; plan entitlement is checked by planIncludesConnectors and a canUseConnectors kill switch. The page should read the released value from packages/types rather than say unknown.
- **Partly wrong (section 2/3):** "New menu has Upload and Create folder (LibraryView.tsx:975-985, web LibraryView.tsx:147)" The code shows: Shared LibraryView 975-985 is a hidden file input, not the menu. Web host line 148 defines createFolder as router.push(PROJECTS_PATH); uploadFiles at 179-180 goes through uploadChatAttachments. Line 147 is blank. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:975-985; apps/web/features/library/components/LibraryView.tsx:148,179-180). **Corrected:** Create folder navigates to Projects (web LibraryView.tsx:148); upload is wired at :179. Cite the shared file path explicitly and use line 148.

**Facts the page missed**

- Connectors are gated by plan and kill switch, not only a release flag: planIncludesConnectors uses canUseBillingPlanCapability(...,'connectors') and a canUseConnectors gate (apps/web/lib/connectors/connector-capability.ts:23-40). The page calls entitlement 'unknown'.
- Dropbox exists as an OAuth MCP connector (apps/web/lib/connectors/catalog.ts:254; apps/web/lib/connectors/mcp-endpoints.ts:133-135), so the page's 'no Dropbox support' is misleading.
- The Drive picker returns a live Google access token to the browser (apps/web/app/api/connectors/google-drive/picker/route.ts:44-52), a key Local-mode and trust-boundary fact the page misses; the page also never mentions that the Library's Add to project copies the file into project knowledge via readLibraryItemFile (apps/web/features/library/components/LibraryView.tsx:234-237).
