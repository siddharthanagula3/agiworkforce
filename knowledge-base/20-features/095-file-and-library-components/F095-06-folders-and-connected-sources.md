---
id: "F095-06"
type: "feature"
title: "Folders and connected sources"
aliases: ["Folders", "Connected sources", "External resource references", "Google Drive sources", "Refresh source", "Cloud storage panel (desktop, separate)"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.17", "S95.18", "S95.19"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-authorization-and-workspaces", "F095-01", "F095-03", "F095-05", "mode:cloud", "surface:web"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-06 Folders and connected sources

There is no folder hierarchy for files. The web Library shows projects as folders. Project sources can be copied from Google Drive and refreshed by hand, and the link to the origin is stored as an external reference. There is no scheduled sync and no live link to outside files.

Area: [95. File and Library components](README.md). Requirement items: [S95.17](../../10-requirements/capabilities/095-file-and-library-components.md#s9517), [S95.18](../../10-requirements/capabilities/095-file-and-library-components.md#s9518), [S95.19](../../10-requirements/capabilities/095-file-and-library-components.md#s9519).

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

**What it does.** Lets the Library show project containers as folders (apps/web/features/library/components/LibraryView.tsx:88-170), stores one record per outside resource a source came from (apps/web/db/neon/0322_external_resource_references.sql:28), imports Drive files into a project (apps/web/lib/server/project-drive-import.ts:121) and re-reads them on request (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:31).

**Why it exists.** People keep files in Drive and in projects. The reference keeps identity, version and access apart from the copied bytes (migration 0322 header).

**Who uses it.** Web users adding Drive sources to projects.

**Problems it solves**

- Know where a source came from.
- Update a source when the Drive file changes.

**Use cases**

- Add a Drive document to a project.
- Refresh it after edits in Drive.
- Open a project from the Library folder row.

## 2. User experience

**Where to find it**

- Web Library: project rows shown as folders, 'create folder' goes to the Projects page (apps/web/features/library/components/LibraryView.tsx:143-148).
- Web project sources: Add sources modal with a Drive picker and a refresh button (apps/web/features/projects/components/AddSourcesModal.tsx; apps/web/features/projects/lib/google-drive-picker.ts; apps/web/features/projects/components/SourcesPanel.tsx:26,90-116).
- Desktop, mobile, CLI, VS Code, Chrome: no folder or Drive-import screen found. Desktop has an unrelated Cloud storage panel (apps/desktop/src/features/cloud/CloudStoragePanel.tsx:61), not checked.

**Before you start**

- Cloud sign-in; Google Drive connected; connectors released (apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:39); an owned, non-archived project.

**Screens and controls**

- Library folder rows and picker for 'Add to project' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1474,1888-1917).
- Project Sources panel refresh button with a refresh icon (apps/web/features/projects/components/SourcesPanel.tsx:9).

**Journey**

1. 1. Connect Drive.
2. 2. Add sources, pick up to 10 Drive files.
3. 3. The server downloads each, runs the normal upload checks and creates a source linked to a reference.
4. 4. Later press refresh; the server compares versions and adds a new version only if changed.

**What the person sees and gets**

- Per-file result added or failed (apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:25-27).
- 'unchanged' when the version matches (apps/web/lib/server/project-drive-import.ts:121-135).

**Settings**

- Drive connection in connectors settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Library lists projects as folders from /api/projects and opens a project (apps/web/features/library/components/LibraryView.tsx:160-175).
- external_resource_references table with kinds repository, web_page, mcp_server, connector_item; project_knowledge_files.external_reference_id links to it (apps/web/db/neon/0322_external_resource_references.sql:28; apps/web/lib/server/external-resource-references.ts:76).
- Drive import copies bytes into private storage then registers them with the reference (apps/web/lib/server/project-drive-import.ts:121-190).
- Origins list marks only Google Drive sources refreshable (apps/web/app/api/projects/[id]/knowledge-files/origins/route.ts:39).
- Manual refresh skips when the version is unchanged (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:73).

**Incomplete**

- Refresh is manual only. No cron refreshes sources: the registered crons include directory refreshes for connectors and plugins, not files (vercel.json:12-200 list; [inferred] from names).
- Folders are projects, not a file hierarchy.

**Present but disconnected or switched off**

- Drive import and refresh are refused until connectors are released (apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:39; apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:41).
- Desktop and other hosts pass no listFolders, so no folder row appears there (packages/ui/unified-chat/src/components/library/LibraryView.tsx:276,530; apps/desktop/src/features/library/DesktopLibrary.tsx:157-210).

**Not available**

- Real folder hierarchy for media_assets: no folder column in the insert (apps/web/lib/server/media-assets.ts:69).
- Automatic sync with connected storage: none found.
- Other providers than Drive for sources: not refreshable (origins route :39).

## 4. Required behaviour

**Established requirements**

- Files can be organised in a folder hierarchy. (source: S95.17 (brief: platform missing))
- External resources (Drive/URL files) are stored as references distinct from owned bytes. (source: S95.18 (brief: platform missing; code partly exists))
- Connected-storage files stay in sync with their source. (source: S95.19 (brief: platform missing))
- One canonical record per external resource, with identity, version and access. (source: apps/web/db/neon/0322_external_resource_references.sql:1-25)

**Acceptance criteria**

1. The web Library shows projects as folder rows and opens one.
2. A Drive source shows as refreshable in origins.
3. Refreshing an unchanged Drive file reports no change and adds no version.
4. Refreshing a changed file creates a new version that supersedes the old one.
5. A non-Drive source cannot be refreshed.
6. With connectors not released, import returns the coming-soon refusal.
7. A project owned by someone else without editor access gives 404.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Connected sync would need a scheduled job and a disconnect rule; none exists.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether 'folders' means projects or a real hierarchy; update S95.17.
- [proposed] Move S95.18 to partial and S95.19 to manual-only in the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | external_resource_references | `apps/web/db/neon/0322_external_resource_references.sql` | Reference rows. |
| service | external-resource-references | `apps/web/lib/server/external-resource-references.ts` | Record references. |
| service | project-drive-import | `apps/web/lib/server/project-drive-import.ts` | Download, register, link. |
| endpoint | POST .../knowledge-files/google-drive | `apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts` | Import up to 10 files. |
| endpoint | POST .../knowledge-files/[fileId]/refresh | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts` | Manual refresh. |
| endpoint | GET .../knowledge-files/origins | `apps/web/app/api/projects/[id]/knowledge-files/origins/route.ts` | Origins and refreshable flag. |
| service | project-source-origins | `apps/web/features/projects/services/project-source-origins.ts` | Web client for origins and refresh. |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Refresh control. |
| component | AddSourcesModal | `apps/web/features/projects/components/AddSourcesModal.tsx` | Add sources including Drive. |
| service | google-drive-picker | `apps/web/features/projects/lib/google-drive-picker.ts` | Drive picker. |
| config | project-knowledge contract | `packages/contracts/cloud-contracts/src/project-knowledge.ts` | Paths and the 10-file import limit. |
| component | LibraryTransport folder hooks | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | listFolders, openFolder, createFolder. |
| component | Web library folder wiring | `apps/web/features/library/components/LibraryView.tsx` | Projects as folders. |
| service | connector capability gate | `apps/web/lib/connectors/connector-capability.ts` | assertConnectorsReleased. |
| service | registerProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-files.ts` | Applies upload checks and quota to imports. |
| test | refresh route test | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.test.ts` | Refresh behaviour. |
| test | external reference test | `packages/contracts/types/src/__tests__/external-resource-reference.test.ts` | Reference normalisation. |
| screen | CloudStoragePanel | `apps/desktop/src/features/cloud/CloudStoragePanel.tsx` | Separate desktop remote storage; not part of this feature. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks Drive files in the web picker. | device | apps/web/features/projects/lib/google-drive-picker.ts |
| Server resolves Drive access and downloads each file. | outside service | apps/web/lib/server/project-drive-import.ts:121-135 |
| Bytes stored privately, then the usual registration checks, scan and extraction run, with a reference recorded. | our servers | apps/web/lib/server/project-drive-import.ts:136-190 |
| Refresh compares Drive's version with the stored one. | our servers | apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:55-75 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Reference (provider, uri, external id, version, access, account key) | table:external_resource_references | Via server | Cascades with the user (migration 0322). |
| Copied file bytes and text | private storage and table:project_knowledge_files | Via server | Per project source rules. |

**Models and providers.** No model for import. Scanned pages from Drive may use only providers that keep inputs out of training (apps/web/lib/server/project-knowledge-files.ts:319-330).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud sign-in and a connected Drive account. |
| Permissions | Owner or editor of a non-archived, non-shared project (apps/web/lib/server/project-drive-import.ts:51; refresh route :43). |
| Subscription | Connectors are plan-gated (apps/web/lib/connectors/connector-capability.ts:23); upload admission and storage quota apply to imports (apps/web/lib/server/project-drive-import.ts:135-141). |
| Limits and metering | 10 Drive files per request (packages/contracts/cloud-contracts/src/project-knowledge.ts:61); size limit from driveImportLimits. |
| Feature flags | Connectors released switch and kill switch canUseConnectors. |
| Model compatibility | Not applicable. |
| Provider restrictions | Google Limited Use rule for scans. |
| Local mode | Not available: Drive import runs on our servers; Local mode has no folder or connected-source code in the files read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors not released | Forbidden with the coming-soon message. | apps/web/lib/connectors/connector-capability.ts:23-29 |
| Drive not connected | Prompt to connect (test title). | apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.test.ts |
| Drive unreachable | Ask to try again, not reconnect (test title). | apps/web/app/api/projects/[id]/knowledge-files/google-drive/__tests__/route.test.ts |
| Unchanged | Reports nothing newer. | apps/web/lib/server/project-drive-import.ts:121-135 |
| Import fails after storing | The stored copy is deleted. | apps/web/lib/server/project-drive-import.ts:178-187 |
| Folder list fails | The folder section is empty. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:530-545 |
| Offline | not handled in the code read | apps/web/features/projects/services/project-source-origins.ts and the Drive routes: no offline branch found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.test.ts`: Changed, unchanged, non-Drive, not connected, bad id.
- `apps/web/app/api/projects/[id]/knowledge-files/google-drive/__tests__/route.test.ts`: Auth, CSRF, shared project, storage, unreachable.
- `packages/contracts/types/src/__tests__/external-resource-reference.test.ts`: Reference rules.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web library host (folder cases not confirmed).

**Test scenarios**

- **Projects as folders**
  1. Create two projects on web.
  2. Open Library.
  - Expected: Two folder rows; clicking opens the project.
- **Drive import**
  1. Connect Drive.
  2. Add a Doc to a project.
  - Expected: Source appears with an origin; refreshable true.
- **Refresh unchanged**
  1. Press refresh without editing.
  - Expected: No new version.
- **Refresh changed**
  1. Edit the Doc.
  2. Refresh.
  - Expected: New version supersedes the old.
- **Desktop library**
  1. Open the desktop Library.
  - Expected: No folder rows.

**Where to look when it fails**

- Table external_resource_references; project_knowledge_files.external_reference_id.
- Log '[knowledge-files] could not remove a Google Drive file that was not added'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No folder hierarchy; 'folders' are projects on web only.** Affects: Desktop, mobile. Evidence: apps/web/features/library/components/LibraryView.tsx:160. Work needed: Decide design.
- **No scheduled or live sync.** Affects: All. Evidence: vercel.json cron list. Work needed: Design and build, or drop S95.19.
- **Brief says reference store missing; it exists.** Affects: Planning. Evidence: apps/web/db/neon/0322_external_resource_references.sql:28. Work needed: Update brief.
- **Only Drive supported for refresh.** Affects: Connector users. Evidence: origins route :39. Work needed: Extend per provider.
- **Drive import UI not found outside web.** Affects: Desktop, mobile. Evidence: search of projects folders. Work needed: Confirm and decide.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-authorization-and-workspaces
- F095-01
- F095-03
- F095-05
- mode:cloud
- surface:web

## Unknown

- Whether Drive import UI exists on desktop or mobile.
- What the desktop Cloud storage panel syncs.
- Whether mobile Library shows folders.
- Whether connectors are released in production.
- Any cascade when a reference's source is deleted in Drive.
