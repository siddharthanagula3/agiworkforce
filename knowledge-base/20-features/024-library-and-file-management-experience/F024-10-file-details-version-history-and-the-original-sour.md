---
id: "F024-10"
type: "feature"
title: "File details, version history and the original source"
aliases: ["File details panel", "Version history", "Open external original", "Properties", "S24.30", "S24.31", "S24.32"]
area: "24 Library and file-management experience"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.30", "S24.31", "S24.32"]
depends_on: ["F024-12", "F024-08", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "table:media_assets", "table:project_knowledge_files", "api:GET /api/library", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-10 File details, version history and the original source

A file details panel, a version list and an open-original link do not exist in the Library on any app. The viewer shows a file name, zoom, download and an Ask box. Project knowledge files have a version number on the server, but the Library does not show it.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.30](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2430), [S24.31](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2431), [S24.32](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2432).

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

**What it does.** Would show a file's size, type, dates, source and where it is used, list earlier versions with restore, and open the file's original outside the product.

**Why it exists.** The brief requires these (S24.30 Open external original, S24.31 File-details panel, S24.32 Version history) so people can inspect and recover files.

**Who uses it.** People checking where a file came from or wanting an earlier copy. Nobody can use it yet.

**Problems it solves**

- Planned: telling two similar files apart.
- Planned: getting back an earlier version.
- Planned: finding the source document in Drive or a website.

**Use cases**

- See that a PDF is 4 MB, uploaded last week, used in two projects.
- Restore yesterday's version of an edited file.
- Open the Drive original of an imported file.

## 2. User experience

**Where to find it**

- Not available on any app. The web viewer has a breadcrumb, Zoom, 'Download <name>', 'Close file viewer' and 'Ask about this file' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1201-1370).
- Mobile viewer opens a file with an optional open-chat control (apps/mobile/src/features/library/index.tsx:1150-1160).

**Before you start**

- None; no control exists.

**Screens and controls**

- Web viewer 'viewer' dialog with breadcrumb, zoom in/out, download, close and ask box (LibraryView.tsx:1201-1370).
- Rows show date and size meta (LibraryView.tsx:352-355) but no details panel.

**Journey**

1. Open a file in the Library viewer.
2. Look for Details, Versions or Open original: none exists.
3. Closest data: row meta shows the modified date, or 'Kept until <date>' in trash.

**What the person sees and gets**

- No details output. The list API already carries size, mime type, dates, provider, model, prompt and conversation id per item (apps/web/app/api/library/route.ts:66-89) but the UI shows only part of it.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The list item carries byte_count, mime_type, created_at, updated_at, provider, model, prompt, source_surface and conversation_id (apps/web/app/api/library/route.ts:66-89).
- Project knowledge rows are versioned with version and supersedes_id on the server (apps/web/lib/server/project-knowledge-files.ts:394-402).

**Incomplete**

- Library rows have no version column in the item schema (packages/contracts/cloud-contracts/src/library.ts:60-100); versions exist only for project knowledge files and are not shown in the Library.

**Present but disconnected or switched off**

- Project knowledge version data exists but no Library UI reads it [inferred].

**Not available**

- Details panel on all six apps (brief S24.31).
- Version history on all six apps (brief S24.32).
- Open external original on all six apps (brief S24.30). Drive and OneDrive connectors exist elsewhere (apps/web/app/api/connectors/google-drive/picker/route.ts; apps/web/app/api/artifacts/save-to-drive/route.ts) but nothing links a Library row to an external original.

## 4. Required behaviour

**Established requirements**

- A details panel shows a file's metadata (size, type, dates, source, where used). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.31)
- Users can see and restore earlier versions of a file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.32)
- Users can open the external original of a file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.30)

**Acceptance criteria**

1. A Details item on a file shows size, type, created and modified dates and source (upload or generated).
2. Details shows the projects and chats that use the file.
3. A file with earlier versions lists them with dates, and Restore makes one current.
4. A file imported from an external source shows an Open original link that opens the source.
5. A file with no external source shows no Open original link.
6. Each works on web and mobile.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- 'Where used' needs a link between media_assets and project knowledge rows; none was found [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with a read-only panel from fields already in the list response.
- [proposed] Decide whether Library versions reuse the project knowledge version scheme.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Source of the metadata a details panel would show (66-89). |
| schema | LibraryItemSchema | `packages/contracts/cloud-contracts/src/library.ts` | Item fields; no version or external URL field. |
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | The viewer with no details tab (1157-1380). |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Transport without details or versions. |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | File viewer and open-chat control (1150-1160). |
| service | mapLibraryItem (mobile) | `apps/mobile/src/features/library/libraryClient.ts` | Maps byte_count, prompt, model, conversation id; drops other fields (76-95). |
| service | registerProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-files.ts` | Writes version and supersedes_id for project files (394-402). |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Has version, supersedes_id, superseded_at columns. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Library file rows; no version column seen in the select (440-441). |
| endpoint | POST /api/projects/[id]/knowledge-files/[fileId]/refresh | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts` | Refreshes a Drive-imported project file; an external-source concept, in Projects not Library. |
| endpoint | GET /api/connectors/google-drive/picker | `apps/web/app/api/connectors/google-drive/picker/route.ts` | Drive picker config; not used by the Library. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The viewer opens a file using its uri and shows the preview. | device and our servers | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1157-1300; apps/web/app/api/files/[id]/route.ts:196-208 |
| Opening a file records the product analytics event library_item_opened with its kind. | our servers | apps/web/app/api/files/[id]/route.ts:210-217 |
| No step reads or shows details or versions. | device | No such code found in LibraryView.tsx or index.tsx |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Item metadata already returned by the list | media_assets row | Cloud | Follows the file, 30-day recovery (F024-09) |

**Models and providers.** Items carry the provider and model that generated them (route.ts:81-82), which a panel could show. No model takes part in details.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for the Library; no feature-specific rule. |
| Permissions | none found in the code for this feature. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Not available. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, retry, offline) | not handled in the code | No details, versions or original-link code found |
| Deleted or missing file in the viewer | The file fetch returns 404 and the row is marked unavailable. | apps/web/app/api/files/[id]/route.ts:206-208; LibraryView.tsx:796-812 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: The viewer and download paths in general; nothing on details or versions.
- `apps/web/app/api/library/__tests__/library-item-open.test.ts`: Opening a library item; contents not opened.

**Test scenarios**

- **No details control**
  1. Open any file in the web viewer.
  2. Look for Details or Versions.
  - Expected: None present (current behaviour).
- **No open-original**
  1. Import a Drive file into a project.
  2. Look in the Library for an original link.
  - Expected: No link.
- **List data available**
  1. Call GET /api/library as a signed-in user.
  - Expected: Each item has byte_count, created_at, updated_at, provider, model, conversation_id.

**Where to look when it fails**

- Compare the item JSON against the UI to see which fields are unused.
- Check project_knowledge_files.version for versioned project files.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No details panel** Affects: All users, all apps. Evidence: Brief S24.31. Work needed: Add a panel using existing list fields, plus a used-in lookup.
- **No version history** Affects: All users, all apps. Evidence: Brief S24.32; versions only for project knowledge (project-knowledge-files.ts:394-402). Work needed: Design Library versions and a restore action.
- **No open external original and no external-source field on Library items** Affects: All users. Evidence: Brief S24.30; library.ts:60-100. Work needed: Add a source URL field and link.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-12
- F024-08
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- table:media_assets
- table:project_knowledge_files
- api:GET /api/library
- surface:web
- surface:mobile

## Unknown

- Whether any other screen shows file details for a Library file.
- How project knowledge versions are shown in the Projects UI (not opened).
- Whether the brief's note that web and desktop are not listed for S24.32 means anything beyond missing.
