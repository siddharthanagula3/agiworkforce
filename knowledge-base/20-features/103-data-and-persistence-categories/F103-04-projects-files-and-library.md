---
id: "F103-04"
type: "feature"
title: "Projects, files and Library"
aliases: ["Projects and notes (S103.11)", "Files and versions (S103.12)", "Folders and Library entries (S103.13)", "External resource references (S103.14)", "Extracted source content (S103.15)", "Search and vector indexes (S103.16)", "user_projects", "project_knowledge_files", "media_assets", "Library", "retrieval_documents"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.11", "S103.12", "S103.13", "S103.14", "S103.15", "S103.16"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-model-catalog-and-routing", "SYS-inference-providers", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "table:user_projects", "table:project_knowledge_files", "table:media_assets", "table:retrieval_documents", "table:external_resource_references"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-04 Projects, files and Library

Server records for projects (instructions and knowledge files), uploaded and generated files in a Library, references to outside resources such as Drive files, repositories and connectors, and the search index built from text extracted from those sources. Library folders as such were not found in code. Bytes sit in object storage, rows in the database.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.11](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10311), [S103.12](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10312), [S103.13](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10313), [S103.14](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10314), [S103.15](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10315), [S103.16](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10316).

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

**What it does.** Stores projects and their knowledge files with extracted text (apps/web/db/neon/0006_projects.sql:1), a catalog of uploaded and generated files (media_assets, apps/web/db/neon/0036_media_assets.sql:9), a canonical reference row per outside resource (apps/web/db/neon/0322_external_resource_references.sql:28), and a full-text and vector search index over the extracted text (apps/web/db/neon/0202_retrieval_index.sql:48,116).

**Why it exists.** So a person can give the assistant lasting instructions and sources, find earlier files in one place on every app, and have answers and search draw on their own material. Brief items S103.11 to S103.16 (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md).

**Who uses it.** People who organise work into projects, and anyone who uploads or generates files.

**Problems it solves**

- One duplicate of a project with its sources (apps/web/app/api/projects/[id]/duplicate/route.ts:114)
- One list of files across apps (apps/web/app/api/library/route.ts)
- Each outside resource having one identity instead of private copies (apps/web/db/neon/0322_external_resource_references.sql:1)
- Keyword and meaning search over own material (apps/web/db/neon/0202_retrieval_index.sql:1)

**Use cases**

- Create a project, add a PDF as knowledge, chat with it.
- Duplicate a project to try different instructions.
- Open Library to find an image generated last week.
- Link a Google Drive file to a project as a reference.

## 2. User experience

**Where to find it**

- Web: /chat/projects and /chat/library, tab title 'Library' (apps/web/app/chat/library/layout.tsx:5; apps/web/app/chat/projects).
- Desktop: DesktopLibrary (apps/desktop/src/features/library/DesktopLibrary.tsx).
- Mobile: library client (apps/mobile/src/features/library/libraryClient.ts).
- CLI: cloud library client (apps/cli/src/cloud/library.rs).
- VS Code and Chrome: not found in this pass.

**Before you start**

- Signed-in Cloud account for server storage; plan with file storage and project allowance.

**Screens and controls**

- Project list and project page with instructions and knowledge files.
- Library view with preview, open, delete and restore (apps/web/features/library/components/LibraryView.tsx).
- Project duplicate action.

**Journey**

1. 1. Create a project with instructions.
2. 2. Upload a file; the server stores it, extracts text and creates an index entry.
3. 3. A new upload with the same file name supersedes the earlier version.
4. 4. Chat in the project; retrieval searches the indexed chunks.
5. 5. Duplicate copies the live files into a new project.

**What the person sees and gets**

- Project limit: 'Your <plan> plan includes N project folders. Upgrade your plan to add more, or delete an existing folder to make room.' (apps/web/lib/services/free-plan-entitlements.ts:54).
- Storage limit: '<plan> accounts include X of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.' (apps/web/lib/services/free-plan-entitlements.ts:40-46).
- Indexing failure shows: 'The embedding provider did not respond; keyword search still works and indexing retries automatically.' (apps/web/lib/services/retrieval-index-service.ts:118).
- Library items show file name, kind, size, preview flag, origin uploaded or generated and a recovery date for deleted items (apps/web/app/api/library/route.ts).

**Settings**

- Project instructions and color.
- Temporary chat attachments are kept out of the Library (apps/web/lib/server/media-assets.ts:326).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Project duplicate copies the project row and live, non-superseded knowledge files in one transaction with a plan quota guard (apps/web/app/api/projects/[id]/duplicate/route.ts:114,158).
- Knowledge upload replaces the same file name by marking the earlier row superseded and bumping the version (apps/web/lib/server/project-knowledge-files.ts:416).
- Library list excludes files from temporary chats (not temporary_chat) and deleted files, and a deleted view lists items inside a 30-day window (apps/web/lib/server/media-assets.ts:326,432-433).
- The temporary flag is derived from the conversation, not trusted from the caller (apps/web/lib/server/media-assets.ts:78).
- Content hash is stored so the same content is stored and billed once (apps/web/lib/server/media-assets.ts InsertMediaAssetParams contentSha256).
- External references: canonical identity key per account and workspace; Drive, custom connector, Code session, project knowledge and assistant-turn persistence call into it (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md S103.14 code list; apps/web/lib/server/external-resource-references.ts:76).
- Retrieval index: one document per source, chunks with weighted text search and a vector column, states pending, indexing, indexed, stale, failed, drained by a cron (apps/web/db/neon/0202_retrieval_index.sql:1-30; apps/web/app/api/cron/index-retrieval-documents).
- If embedding fails, chunks are stored for keyword search only (apps/web/lib/services/retrieval-index-service.ts:511).

**Incomplete**

- Files and versions: versions exist for knowledge files (superseded_at, version used by code) while the generic version and parent-version columns for media assets come from migration 0257, headed not applied (apps/web/db/neon/0257_file_versions_and_lineage.sql:4).

**Present but disconnected or switched off**

- Migrations 0202, 0257 headed 'NOT YET APPLIED : draft only' (apps/web/db/neon/0202_retrieval_index.sql:4; apps/web/db/neon/0257_file_versions_and_lineage.sql:4). Applied state: unknown.

**Not available**

- Library folders: no folder store or folder parameter was found in the Library route or the media_assets schema (apps/web/app/api/library/route.ts; apps/web/db/neon/0036_media_assets.sql). Chat folders (chat_folders, apps/web/db/neon/0022_chat_features.sql) and the word 'folder' for projects in plan messages exist, but they are not Library folders.
- Library on VS Code and Chrome: not found.

## 4. Required behaviour

**Established requirements**

- Projects with their instructions and knowledge are durably stored and classified. (source: S103.11)
- Files, their versions and derivation lineage are durably stored and classified. (source: S103.12)
- Library entries and folders are durably stored and classified. (source: S103.13)
- References to external resources are stored as canonical, classified references. (source: S103.14)
- Text extracted from sources is durably stored for reuse and classified. (source: S103.15)
- Search and vector indexes are stored and classified with the content they index. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.16)
- Files uploaded into temporary chats are kept out of the Library and purged with the chat. (source: apps/web/lib/server/media-assets.ts:326)

**Acceptance criteria**

1. Upload a file with the same name twice: one live row, the older one superseded.
2. Duplicate a project: new project has the same live files and not the superseded ones.
3. Duplicate over the plan project limit: refused with the plan message.
4. A file uploaded in a temporary chat does not appear in Library.
5. After a source's text changes, its index state becomes stale then indexed again.
6. With the embedding service down, a search by keyword still finds the file.
7. Link the same Drive file twice: one reference row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Folder behaviour for the Library is not yet specified in code, so the brief status 'done' for S103.13 cannot be confirmed [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether Library folders are a product requirement and, if so, add a folder table and API.
- [proposed] Show index state per file in every app, as the knowledge panel does on web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | user_projects | `apps/web/db/neon/0006_projects.sql` | Project row: name, instructions, color, archive flag. |
| table | project_knowledge_files | `apps/web/db/neon/0006_projects.sql` | Knowledge file rows with storage uri, extracted text and version. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Catalog of uploaded and generated files. |
| schema | file versions and lineage | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | version, parent version for assets, knowledge files, published pages. |
| table | external_resource_references | `apps/web/db/neon/0322_external_resource_references.sql` | Canonical outside resource per account and workspace. |
| table | retrieval_documents / retrieval_chunks | `apps/web/db/neon/0202_retrieval_index.sql` | Index state and searchable chunks. |
| endpoint | /api/projects/[id]/duplicate | `apps/web/app/api/projects/[id]/duplicate/route.ts` | Duplicate a project with files. |
| endpoint | /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Upload and list knowledge files. |
| endpoint | /api/projects/[id]/knowledge-files/google-drive | `apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts` | Import a Drive file as a source with a reference. |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Upload, extraction, supersede, reference link. |
| service | media-assets | `apps/web/lib/server/media-assets.ts` | Insert, list, restore and delete media assets. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Library list for every app. |
| service | external-resource-references | `apps/web/lib/server/external-resource-references.ts` | Create or reuse a reference. |
| other | external-resource-reference contract | `packages/contracts/types/src/external-resource-reference.ts` | Identity key computation shared by apps. |
| service | retrieval-index-service | `apps/web/lib/services/retrieval-index-service.ts` | Chunking, embedding, indexing and reindex requests. |
| job | index-retrieval-documents | `apps/web/app/api/cron/index-retrieval-documents` | Drains pending and stale index documents. |
| service | free-plan-entitlements | `apps/web/lib/services/free-plan-entitlements.ts` | Project and storage limit wording and values. |
| component | LibraryView | `apps/web/features/library/components/LibraryView.tsx` | Web Library screen. |
| component | DesktopLibrary | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Desktop Library screen. |
| service | mobile libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Mobile Library client. |
| service | CLI library | `apps/cli/src/cloud/library.rs` | CLI Library client. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies project, file, reference and index tables. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App uploads a file to the project or Library endpoint. | device and our servers | apps/web/app/api/projects/[id]/knowledge-files/route.ts |
| Server scans, extracts text, seals the bytes and writes the row; earlier version superseded. | our servers | apps/web/lib/server/project-knowledge-files.ts:416 |
| Bytes are kept in object storage; the row keeps the durable pointer. | outside service | apps/web/db/neon/0036_media_assets.sql:1-8 (comment names an S3-compatible object store) |
| A trigger enqueues an index document; the cron chunks the text and asks an embedding provider for vectors. | our servers | apps/web/db/neon/0202_retrieval_index.sql:26-30; apps/web/lib/services/retrieval-index-service.ts:479 |
| The embedding call goes to a model provider and is metered. | outside service | apps/web/lib/services/retrieval-index-service.ts:494 (embedTextsMetered) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project and knowledge file rows, extracted text | user_projects, project_knowledge_files (database) | Mobile syncs projects (cloudSyncEngine.ts imports project stores); other apps read through the API. | Deleting a project purges its knowledge files (test apps/web/app/api/projects/[id]/__tests__/delete-purges-knowledge-files.test.ts). |
| File bytes | Object storage | Fetched by uri /api/files/<id>. | Deleted media recoverable for a 30-day window then purged (apps/web/lib/server/media-assets.ts:432; cron purge-deleted-media). |
| Index chunks and vectors | retrieval_chunks | Server only. | Deleted with the source; classified as derived content (apps/web/lib/services/deletion-manifest.ts:108-115). |

**Models and providers.** An embedding model from a provider route builds vectors; the specific model: unknown, not named. Failure falls back to keyword search.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. |
| Permissions | Projects belong to the user and workspace; shared projects are readable by members (apps/web/db/neon/0202_retrieval_index.sql:32-34 ACL comment). Library queries filter by user and workspace (apps/web/lib/server/media-assets.ts:326). |
| Subscription | Project count and file storage depend on plan (apps/web/lib/services/free-plan-entitlements.ts:40-75); a plan without Managed Cloud Projects gets 'Your current subscription does not allow Managed Cloud Projects.' Embedding is metered (apps/web/lib/services/retrieval-index-service.ts:494). |
| Limits and metering | Plan project limit, plan storage cap shared by Library and project sources, retrieval chunk caps for chat files (apps/web/lib/services/retrieval-index-service.ts:96). Numeric values: unknown. |
| Feature flags | Connector release check assertConnectorsReleased on Drive import (apps/web/app/api/projects/[id]/knowledge-files/google-drive/route.ts:15). |
| Model compatibility | Not applicable except embeddings. |
| Provider restrictions | Embedding depends on an available provider; keyword fallback exists (apps/web/lib/services/retrieval-index-service.ts:118). |
| Local mode | Server Library and projects need Cloud. Whether desktop or mobile keep a local-only project or file list in Local mode: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Index failed or pending | State and last error stored; the knowledge panel shows them; indexing retries. | apps/web/db/neon/0202_retrieval_index.sql:12-18 |
| Embedding unavailable | Keyword-only chunks, retry later. | apps/web/lib/services/retrieval-index-service.ts:118,511 |
| Project limit hit | Transaction rolled back with plan message. | apps/web/app/api/projects/[id]/duplicate/route.ts:158 |
| Deleted Library item | Shown with an erase-after date inside recovery window. | apps/web/app/api/library/route.ts |
| Scanned text withheld | Summary shows a scan-withheld notice. | apps/web/lib/server/project-knowledge-files.ts:416 |
| Empty Library, loading, offline | not established in this pass. | apps/web/features/library/components/LibraryView.tsx not opened |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/[id]/duplicate/route.test.ts`: Duplicate.
- `apps/web/app/api/projects/[id]/__tests__/delete-purges-knowledge-files.test.ts`: Delete purges files.
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/storage-meter-matches-cap.test.ts`: Storage meter.
- `apps/web/app/api/library/__tests__/route.test.ts`: Library route.
- `apps/web/lib/server/__tests__/media-assets.test.ts`: Media assets.
- `apps/web/lib/server/__tests__/media-assets.restore.test.ts`: Restore.
- `apps/web/lib/server/__tests__/media-assets.permanent-delete.test.ts`: Permanent delete.
- apps/web/lib/services/retrieval-index-service.test.ts (not found) (not found): Indexing.
- `packages/contracts/types/src/__tests__/external-resource-reference.test.ts`: Reference identity.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Library UI.
- `apps/web/app/api/uploads/__tests__/chat-attachment-temporary-chat.test.ts`: Temporary chat attachments.

**Test scenarios**

- **Supersede on re-upload**
  1. Upload a.pdf to a project.
  2. Upload a changed a.pdf.
  - Expected: One live row, previous superseded, version higher.
- **Temporary chat file**
  1. In a temporary chat attach a file.
  2. Open Library.
  - Expected: File absent; removed with the chat.
- **Plan project cap**
  1. On a plan with a small limit fill projects.
  2. Duplicate one.
  - Expected: Plan message, no partial copy.
- **Keyword fallback**
  1. Block the embedding provider.
  2. Upload a file.
  3. Search a phrase from it.
  - Expected: Found by keyword; state shows retry.
- **Library on every app**
  1. Generate an image on web.
  2. Open Library on desktop, phone and CLI.
  - Expected: Same item listed.

**Where to look when it fails**

- retrieval_documents state and error columns.
- Log '[retrieval] embedding failed; chunks are stored for keyword search only'.
- Tables project_knowledge_files (superseded_at), media_assets (temporary_chat, deleted_at).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No Library folder store found although brief S103.13 says folders are stored.** Affects: All apps. Evidence: apps/web/app/api/library/route.ts has no folder handling; no folder table in apps/web/db/neon/0036_media_assets.sql. Work needed: Clarify requirement; add folders or correct the brief.
- **Draft migrations 0202 and 0257 not marked applied.** Affects: All apps. Evidence: header line 4 of each file. Work needed: Confirm ledger.
- **Library not found in VS Code and Chrome.** Affects: VS Code, Chrome. Evidence: search for api/library clients found only desktop, mobile, CLI. Work needed: Decide whether parity is required.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-model-catalog-and-routing
- SYS-inference-providers
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- table:user_projects
- table:project_knowledge_files
- table:media_assets
- table:retrieval_documents
- table:external_resource_references

## Unknown

- Whether migrations 0202 and 0257 are applied in production.
- Numeric project and storage limits per plan.
- Which embedding model and provider are used.
- Whether Library folders are required.
- Local-only project and file lists in desktop and mobile Local mode.
- Empty, loading and offline wording for Library and projects.
