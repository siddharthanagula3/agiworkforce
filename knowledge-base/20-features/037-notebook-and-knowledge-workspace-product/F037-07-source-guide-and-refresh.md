---
id: "F037-07"
type: "feature"
title: "Source guide and refresh"
aliases: ["Source guide", "Source summary", "Source refresh", "Refresh from Google Drive", "Retry indexing", "S37.12", "S37.36"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.12", "S37.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "table:project_knowledge_files", "table:external_resource_references", "api:POST /api/projects/{id}/knowledge-files/{fileId}/refresh", "api:GET /api/projects/{id}/knowledge-files/origins"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-07 Source guide and refresh

A notebook (project) source row shows a one-line note under its name, and a Google Drive source has a refresh button that re-fetches it. A failed source offers Retry indexing. No automatic guide is generated: the note is only filled when a file cannot be read. Web and Desktop (hosted web) only; Mobile has only reindex.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.12](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3712), [S37.36](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3736).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows a short note under each source in a notebook's Sources list, lets the person re-fetch a source that came from Google Drive, and lets them restart reading (indexing) of a source that failed or went stale. [inferred] The note is not an automatic guide of the content.

**Why it exists.** The area brief wants each source to get an automatic guide and each live source to be refreshable (S37.12, S37.36) as NotebookLM-style notebooks do. What exists today covers the refresh need for Drive and the failed-index need; the guide need is not met.

**Who uses it.** A signed-in person who keeps files and Drive documents as sources in a notebook on Web, or on Desktop, which shows the hosted web app (AGENTS.md section 5).

**Problems it solves**

- A Drive document changed after it was added, and the notebook still answers from the old text.
- A source failed to read and the person needs to retry without re-uploading.
- A file with no readable text is flagged so the person knows only its name reaches the model.

**Use cases**

- Edit a Google Doc, open the notebook Sources list, click the refresh icon on that source, and ask a new question.
- See 'Not readable' under a scanned image file and replace it with a text version.
- Click Retry indexing on a source whose reading failed.

## 2. User experience

**Where to find it**

- Web and Desktop: a notebook (project) page, Sources tab, the sources list (apps/web/features/projects/components/SourcesPanel.tsx:735-778).
- Web and Desktop: Retry indexing also appears in the project settings dialog file list (apps/web/features/projects/components/KnowledgeFilesPanel.tsx:107-139; KnowledgeFilesPanel is mounted at ProjectSettingsDialog.tsx:414).
- Mobile: Project notebook screen, opened from the 'Project notebook' icon in Cloud mode (apps/mobile/app/(app)/projects/[id].tsx:427-440); it shows the note, status text and a reindex action for failed or stale sources (apps/mobile/src/features/notebook/service.ts:44-55).
- CLI, VS Code, Chrome: not available; VS Code lists knowledge file names only (apps/extension-vscode/src/features/projects/projectActions.ts:100-110).

**Before you start**

- Signed in with an account; the project must be reachable by the account.
- Refresh needs the source to have been added from Google Drive, the connectors release switch open and a connected Drive account (apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:41,60-64).
- Edit rights: the refresh and retry controls are hidden for a read-only shared project (SourcesPanel.tsx:753, canRetry={!readOnly}).

**Screens and controls**

- Source row: file icon, file name, optional note line (data-testid sources-file-note), index status, size in KB, refresh icon button labelled 'Refresh <name> from Google Drive', remove button (SourcesPanel.tsx:700-790).
- Search box 'Search sources by name or summary' filters on the note too (SourcesPanel.tsx:314,643).
- Retry indexing button on a failed row (KnowledgeIndexStatus.tsx:69).

**Journey**

1. Open the notebook and choose the Sources tab.
2. The list loads; sources still being read are polled every few seconds up to a cap (SourcesPanel.tsx:128-150, KnowledgeIndexStatus.tsx:7-8).
3. A Drive-added source shows a refresh icon once the origins list returns (SourcesPanel.tsx:115-117).
4. Click the refresh icon. The app calls POST on the refresh route.
5. If nothing changed a message says the file is already up to date; otherwise a success message says it was updated from Google Drive and the list reloads (SourcesPanel.tsx:173-187).
6. For a failed source click Retry indexing; the status updates and polling resumes.

**What the person sees and gets**

- Toast '<name> is already up to date' or '<name> was updated from Google Drive'.
- Toast error '<name> could not be refreshed' or the server message.
- Note line under the file name, for example a 'Not readable: ...' notice written at upload (apps/web/lib/server/project-knowledge-files.ts:164-169).

**Settings**

- Server settings GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID are needed for adding Drive documents (brief S37.10, apps/web/app/api/connectors/google-drive/picker/route.ts:17).
- No per-user setting for refresh or guide found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: the note under a source renders when the stored summary is non-empty (SourcesPanel.tsx:735-741).
- Web/Desktop: Drive source refresh button, service and server route; unchanged files are skipped by version (project-source-origins.ts:26-47; refresh/route.ts:68-74).
- Web/Desktop: Retry indexing for failed sources (KnowledgeIndexStatus.tsx:69; SourcesPanel.tsx:188+).
- Web/Desktop: search over file name and summary (SourcesPanel.tsx:314).
- Mobile: reindex action and note display for failed or stale sources, and search over name and summary (apps/mobile/src/features/notebook/service.ts:32-55; ProjectNotebookScreen.tsx:252-261).

**Incomplete**

- Only Google Drive is refreshable: the origins route sets refreshable only for provider google_drive (origins/route.ts:39) and the refresh route rejects any other provider with a conflict (refresh/route.ts:60-62).
- The Drive picker needs two server settings that the brief says the owner must set and live-check, also inside Electron (brief S37.10).

**Present but disconnected or switched off**

- Refresh is switched off when connectors are not released: assertConnectorsReleased throws a coming-soon error (refresh/route.ts:41; apps/web/lib/connectors/connector-capability.ts:27-29).

**Not available**

- No automatic guide or summary generation: the only writers of the summary column found write an unreadable or scan-withheld notice, otherwise null (project-knowledge-files.ts:411-414). Drive import was not seen setting a summary (grep of project-drive-import.ts found none).
- Refresh for website, video, audio sources: those source types do not exist (brief S37.07-S37.09 missing).
- Mobile refresh from Drive: not found; Mobile CLI, VS Code and Chrome: no source guide or refresh.
- The brief marks web and desktop refresh as missing; the code contradicts it (Notebook.test.tsx:82-104). The brief is out of date. Code wins (AGENTS.md section 2).

## 4. Required behaviour

**Established requirements**

- Each source gets an automatic guide or summary the user can read. (source: brief S37.12)
- A source added from a live location can be refreshed to pick up changes. (source: brief S37.36)
- Only Retry indexing exists in the brief's account; sources are uploaded copies. This is superseded by the Drive refresh found in code. (source: brief S37.36 Unfinished note; code apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts:60-62)
- Claude and ChatGPT projects are the reference; the founder list rules out some project extras. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:96-100)

**Acceptance criteria**

1. A Drive-added source in a notebook shows a refresh control; an uploaded file does not.
2. Refreshing a changed Drive file replaces its text and the next notebook answer uses the new text.
3. Refreshing an unchanged file reports it is up to date and creates no new version.
4. A viewer with read-only share access sees no refresh, retry or remove control.
5. A failed source can be retried without re-uploading and its status returns to ready or failed again.
6. [proposed] Each indexed source shows a generated guide of at least a few sentences.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The guide is a product gap, not a bug: the summary column exists and is read by search, the prompt manifest and the UI, so a generator could fill it.
- [inferred] A guide generation step must respect the same model, plan and usage rules as chat turns.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Generate a guide after indexing finishes using the notebook's chosen model, and store it in the summary column with a marker that separates it from a not-readable notice.
- [proposed] Add Refresh for Mobile using the same origins and refresh routes.
- [proposed] Extend origins beyond Drive as new source types are added.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Sources list, note line, search, refresh button, retry, cited-file preview |
| service | project-source-origins | `apps/web/features/projects/services/project-source-origins.ts` | Client calls to list refreshable sources and refresh one |
| component | KnowledgeIndexStatus | `apps/web/features/projects/components/KnowledgeIndexStatus.tsx` | Index status text, Retry indexing button, poll constants |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | File list inside project settings with Retry indexing |
| endpoint | GET origins | `apps/web/app/api/projects/[id]/knowledge-files/origins/route.ts` | Lists file origins and marks Drive ones refreshable |
| endpoint | POST refresh | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.ts` | Re-imports a Drive file if its version changed |
| endpoint | POST reindex | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/reindex/route.ts` | Restarts indexing of one file |
| service | project-drive-import | `apps/web/lib/server/project-drive-import.ts` | Imports a Drive file into a project; provides the skip-if-version rule |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Registers a file, writes the unreadable notice into the summary column |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Source rows with summary, version, superseded and deleted markers |
| table | external_resource_references | `apps/web/db/neon/0322_external_resource_references.sql` | Records where a source came from (provider, external id, version) |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Puts the summary into the prompt manifest and uses it for relevance (lines 170-190, 616-619) |
| screen | ProjectNotebookScreen | `apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx` | Mobile source list with note, status and reindex |
| service | mobile notebook service | `apps/mobile/src/features/notebook/service.ts` | List, reindex, search and status wording for Mobile |
| config | cloud-contracts knowledge paths | `packages/contracts/cloud-contracts` | Shared path builders and response schemas for knowledge, origins and refresh |
| test | Notebook.test.tsx | `apps/web/features/projects/components/__tests__/Notebook.test.tsx` | Covers search by summary and Drive refresh |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the Sources tab; the browser lists files from the knowledge-files route. | device and our servers | SourcesPanel.tsx:104-122; apps/web/app/api/projects/[id]/knowledge-files/route.ts:23-66 |
| The browser then asks the origins route which files came from where; Drive ones are marked refreshable. | device and our servers | project-source-origins.ts:10-24; origins/route.ts:19-47 |
| Click refresh: browser sends POST with a CSRF header; the server checks the project, finds the source's Drive id and version, resolves the person's Drive access and imports the file again if the version changed. | device and our servers | refresh/route.ts:31-84 |
| The server fetches the file from Google Drive using the person's connector grant. | outside service | refresh/route.ts:64-66 (resolveDriveAccess, importDriveFileIntoProject) |
| The new text is extracted and stored as a new version; the old row is marked superseded; reading (indexing) runs again. | our servers | project-knowledge-files.ts:394-420 (version, supersedes_id); wire-or-cut doc: docs/decisions/wire-or-cut.md:385 |
| The list reloads from the server. | device and our servers | SourcesPanel.tsx:179-181 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source row with summary text and version | table project_knowledge_files (Neon Postgres) plus object storage for file bytes | Server-side, so every signed-in app that reads the project sees it; Mobile reads it through the knowledge list route (apps/mobile/src/features/notebook/service.ts:14-21) | A new version supersedes the old row (superseded_at); user delete sets deleted_at (SourcesPanel.tsx confirm text: cannot be undone) |
| Source origin (provider, uri, version, last seen) | table external_resource_references | Server-side only | unknown |

**Models and providers.** Refresh and Retry indexing call no model in the code read. Indexing may call an embedding model; that was not traced, so unknown. A generated guide would need a model call; none exists today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; routes use the user-scoped database (origins/route.ts:23, refresh/route.ts:43). |
| Permissions | Owner or editor of the project; refresh, retry and remove are hidden when the project is shared read-only (SourcesPanel.tsx:753; page.tsx:160). Refresh also needs the connected Drive grant. |
| Subscription | No plan check found in the refresh route. Connectors may be gated by a release switch and a kill switch (connector-capability.ts:27-45). Storage cap applies to re-imports [inferred]: driveImportLimits is used (refresh/route.ts:70). |
| Limits and metering | Rate limit bucket 'chat-conversation' on both routes (origins/route.ts:20, refresh/route.ts:39). Per-project file cap 40 (packages/contracts/types/src/suite-contracts.ts:502). |
| Feature flags | Connectors release switch (assertConnectorsReleased); canUseConnectors kill switch gate (connector-capability.ts:31-35). |
| Model compatibility | Not model dependent today. |
| Provider restrictions | Refresh works only for Google Drive sources (origins/route.ts:39). |
| Local mode | Not available. Notebook sources live on our servers; Mobile shows a gate that says notebooks run in AGI Cloud (ProjectNotebookScreen.tsx, CloudFeatureGate; useCloudFeatureAccess.ts:32). Own key mode: not found in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading sources | Spinner or loading state with a timeout; error state with retry token | SourcesPanel.tsx:104-122 (withTimeout, loadState) |
| Empty list | Handled by empty state in the panel; Mobile shows 'Add a source to this project first.' for the Studio | ProjectNotebookScreen.tsx:~170 |
| Origins call fails | Returns an empty set so no refresh button is shown, silently | project-source-origins.ts:12-23 |
| Refresh unchanged | Message 'already up to date', no reload | SourcesPanel.tsx:176-178 |
| Refresh fails | Error toast with server message or 'could not be refreshed'; button re-enabled | SourcesPanel.tsx:182-186 |
| Another refresh in flight | All refresh buttons are disabled while one runs | SourcesPanel.tsx:759 |
| Non-Drive source refreshed by direct call | 409 conflict 'Only sources added from Google Drive can be refreshed.' | refresh/route.ts:60-62 |
| Offline or timeout on refresh | Falls into the generic error toast; no dedicated offline handling found | SourcesPanel.tsx:182-186 |
| Indexing still running | Polled until the poll cap; after the cap it stops polling | SourcesPanel.tsx:128-150 |
| Accessibility | Refresh button has an aria-label with the file name; search has a screen-reader label | SourcesPanel.tsx:757,638 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Search by name or summary; refresh button shown only for Drive sources and posts to the refresh route
- `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/refresh/route.test.ts`: Refresh route behaviour
- `apps/web/app/api/projects/[id]/knowledge-files/origins/route.test.ts`: Origins route behaviour
- `apps/web/features/projects/components/KnowledgeFilesPanel.indexing.test.tsx`: Indexing status and retry in the file panel
- `apps/web/features/projects/components/__tests__/SourcesPanel.processing.test.tsx`: Sources panel while files are processing
- `apps/mobile/src/features/notebook/__tests__/ProjectNotebook.test.tsx`: Mobile source search and reading a failed source again

**Test scenarios**

- **Refresh a changed Drive document**
  1. Connect Google Drive and add a document to a notebook.
  2. Edit the document in Drive.
  3. Click its refresh icon in the Sources tab.
  4. Ask the notebook chat about the new text.
  - Expected: Success message; the answer uses the new text; one active version remains.
- **Refresh unchanged**
  1. Click refresh again at once.
  - Expected: Message says the file is already up to date.
- **Uploaded file has no refresh**
  1. Upload a text file.
  2. Look at its row.
  - Expected: No refresh icon; the remove icon is present.
- **Read-only share**
  1. Open a notebook shared with view access.
  - Expected: No refresh, retry or remove controls.
- **Unreadable file note**
  1. Upload an image or a PDF without text.
  - Expected: A 'Not readable' note shows under the name.
- **Guide check**
  1. Upload a readable text file of several pages.
  2. Look for a generated summary.
  - Expected: Today none appears; this confirms the gap.

**Where to look when it fails**

- Log line '[knowledge-files] Google Drive refresh failed' (refresh/route.ts:88).
- Error codes 409 conflict for non-Drive source; coming-soon error when connectors are not released.
- Tables project_knowledge_files and external_resource_references; check superseded_at and version.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **No automatic source guide or summary** Affects: All six apps. Evidence: project-knowledge-files.ts:411-414 writes only a notice or null; no generator found. Work needed: Add a generation step after indexing, a place to mark generated text, a display and usage accounting.
- **Refresh only for Google Drive** Affects: Web, Desktop; Mobile has none. Evidence: origins/route.ts:39. Work needed: Add providers as source types are added; add Mobile control.
- **Brief status words are out of date for refresh** Affects: Documentation of Web and Desktop. Evidence: Notebook.test.tsx:82-104 versus brief S37.36. Work needed: Update the brief and status registers.
- **Picker settings not confirmed live** Affects: Web, Desktop (Electron). Evidence: brief S37.10 Unfinished. Work needed: Owner sets the two picker settings and live-checks.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- table:project_knowledge_files
- table:external_resource_references
- api:POST /api/projects/{id}/knowledge-files/{fileId}/refresh
- api:GET /api/projects/{id}/knowledge-files/origins

## Unknown

- Whether the Drive import path writes a summary (not seen).
- Whether Retry indexing or reindex calls a model for embeddings and under which plan.
- Retention of external_resource_references rows after a source is deleted.
- Whether the e2e spec apps/web/e2e/project-knowledge-retrieval.spec.ts covers refresh (not opened).
- Whether Chrome extension or CLI could read summaries (CLI KnowledgeFile has a summary field, apps/cli/src/cloud/knowledge.rs:50, but no display seen).
