---
id: "F037-04"
type: "feature"
title: "Source list, search and source rail"
aliases: ["Sources tab", "Sources panel", "Source rail", "Project sources panel", "Knowledge files", "Source search", "Notebook screen (mobile)", "Source rail (S37.04)", "Source checkboxes (S37.05)", "Source search (S37.13)"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.04", "S37.05", "S37.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:GET /api/projects/{id}/knowledge-files", "api:POST /api/projects/{id}/knowledge-files/{fileId}/reindex", "table:project_knowledge_files", "store:project-store", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "F037-05", "F037-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-04 Source list, search and source rail

Inside a project the person can see its sources (files and notes), filter by type, sort, and search by name or summary. On web a side panel shows the sources next to the chat. Mobile has a Sources tab and a Notebook screen with search. Per-source checkboxes for choosing what grounds an answer do not exist.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.04](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3704), [S37.05](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3705), [S37.13](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3713).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists the project's source files with an index status, offers filter, sort and search, previews a file, removes a file, and keeps the list open beside the conversation on web (apps/web/features/projects/components/SourcesPanel.tsx:306-336, 582-643).

**Why it exists.** The person needs to see what material the answers are grounded in and to find a file again. [inferred]

**Who uses it.** Anyone using a project with sources; read-only members of shared projects.

**Problems it solves**

- Not knowing which files the assistant can read.
- Finding one file among up to 40.
- Seeing whether a file has been read yet or failed.

**Use cases**

- Open the side panel while chatting to check the file list.
- Type 'budget' in 'Search sources by name or summary' to find a spreadsheet.
- On mobile search 'Search sources' in the Notebook screen.
- See that a file shows 'Keyword search only' because semantic indexing failed.

## 2. User experience

**Where to find it**

- Web: project page tab 'Sources' (tabs Chats, Artifacts, Work, Sources, Scheduled) (apps/web/app/chat/projects/[id]/page.tsx:55-61, 1319-1340).
- Web chat: toggle button labelled 'Open project sources' / 'Close project sources' opens a right panel titled '<project> sources' (ProjectSourcesPanel.tsx:105-115; WebChatPage.tsx:7896-7905). On narrow screens the panel becomes a full-width sheet (ProjectSourcesPanel.tsx:28-52).
- Desktop: same hosted web page (doc: AGENTS.md section 5).
- Mobile: project detail tab 'Sources' (projects/[id].tsx:222), the chat screen button 'Open project sources' (ProjectSourcesButton.tsx:35; chat/[id].tsx:2424), and in Cloud mode the 'Project notebook' button opening the Notebook screen with a 'Search sources' box (projects/[id].tsx:432-437; ProjectNotebookScreen.tsx:219-221).
- CLI: 'agi projects show' prints 'Knowledge files (n):' and each file name (lib.rs:3719-3733).
- VS Code: project detail quick pick section 'Knowledge files' with file names (projectActions.ts:100-111).
- Chrome: not found.

**Before you start**

- A project; sources are read through GET /api/projects/[id]/knowledge-files, which needs read access (owner or shared member) (knowledge-files/route.ts:23-66).
- Mobile Notebook screen needs Cloud mode and sign-in; otherwise it shows a gate 'Notebooks run in AGI Cloud; switching won't upload your local chats.' (ProjectNotebookScreen.tsx:150-160).

**Screens and controls**

- Web: '+ Add sources' button, 'Filter sources by type' select (All, Images, PDFs, Text, Data (JSON/XML)), 'Sort sources' select (Newest, Oldest), search input 'Search sources by name or summary' (SourcesPanel.tsx:572-643).
- Web rows: preview, remove, 'Refresh from Google Drive' (only for Drive sources), index status text 'Indexing for search', 'Keyword search only', 'Not indexed' with 'Retry indexing' (SourcesPanel.tsx:746-775; KnowledgeIndexStatus.tsx:29-33).
- Mobile Sources tab: rows with 'Open <name>', 'Retry indexing <name>', 'Remove <name>', status 'Indexing' or 'Couldn't read' (ProjectSourcesTab.tsx:70-71, 152, 191, 203).
- Mobile Notebook: search box, rows with status text Ready, Reading, Out of date or the error, and 'Read again' button (service.ts:44-55; ProjectNotebookScreen.tsx:273).

**Journey**

1. Open the project and select the Sources tab, or open the side panel from the chat.
2. Wait for the list to load (15 second limit on web).
3. Optionally pick a type, a sort order, or type in the search box.
4. Select a row to preview it; remove it or retry indexing if needed.
5. Return to the chat; replies use the project's sources (see F037-05).

**What the person sees and gets**

- 'Loading...' then the list, or an error with a 'Retry' button (SourcesPanel.tsx:412, 445).
- 'No sources match “<text>”.' or 'No sources match the current filter.' (SourcesPanel.tsx:668-669).
- Empty project: 'Add files, text or Google Drive files to give AGI context.' / 'Add files or text to give AGI context.' / the read-only owner text (SourcesPanel.tsx:500-505).
- Mobile empty 'No sources added yet'; Notebook 'No sources yet.' and 'No sources match “<text>”.' (ProjectSourcesTab.tsx:868; ProjectNotebookScreen.tsx:236).

**Settings**

- Web sort order (Newest or Oldest) and type filter are in-page state only [inferred from useState at SourcesPanel.tsx:86-87].
- Web side panel width is resizable (SidePanelResizeHandle label 'Resize project sources panel').

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Sources tab and side panel: list, type filter, sort and text search over file name and summary, preview, delete with rollback, indexing poll every 5 seconds up to 60 times (SourcesPanel.tsx:95-150, 306-336; KnowledgeIndexStatus.tsx:7-8).
- Web chat side panel with read-only flag for shared members (WebChatPage.tsx:7896-7905).
- Mobile Sources tab with cloud and local sources, retry indexing and remove (ProjectSourcesTab.tsx).
- Mobile Notebook screen (Cloud mode): search over name and summary, status text, 'Read again' (apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx; service.ts:32-55).
- CLI 'show' lists file names; VS Code detail lists files with detail text (lib.rs:3719-3733; projectActions.ts:100-111).

**Incomplete**

- Search matches only file name and summary, not file contents (SourcesPanel.tsx:309-317; service.ts:38-41).
- Mobile Sources tab: no search box was found in ProjectSourcesTab.tsx; search is only on the Notebook screen (grep for search terms in the tab file) [inferred].
- The brief lists search as missing on every app; the code shows web and mobile (Notebook screen) search exist.

**Present but disconnected or switched off**

- Mobile Notebook screen is reachable only for Cloud projects in Cloud mode (projects/[id].tsx:431-433).

**Not available**

- Per-source checkboxes that choose which sources ground the next answer: no checkbox code in SourcesPanel.tsx, ProjectSourcesPanel.tsx or ProjectSourcesTab.tsx (grep returned nothing); brief S37.05 says missing on every app.
- CLI search and VS Code search of sources: none found.
- Chrome source list: not found.
- Source guide or summary generated per source (S37.12): none found; the summary field holds only a 'Not readable' note or a withheld-scan notice (project-knowledge-files.ts:164-169, 412-414).

## 4. Required behaviour

**Established requirements**

- Inside a notebook, a source list sits beside the conversation so the user can see what grounds the answers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.04)
- Each source has a checkbox so the user chooses which sources ground the next answer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.05)
- The user can search across or for sources inside the notebook. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.13)
- A read-only member sees the list and preview but not upload or delete. (source: apps/web/features/projects/components/SourcesPanel.tsx:63-67)
- For Chrome, choosing project sources is outside scope by owner decision. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-23))

**Acceptance criteria**

1. Typing part of a file name or summary in the web search box shows only matching rows and 'No sources match' when none match.
2. Choosing the PDFs filter shows only application/pdf files; All restores the list.
3. The chat side panel opens and closes with the toggle and shows the same rows as the Sources tab.
4. A file whose indexing failed shows 'Not indexed' or 'Keyword search only' and offers 'Retry indexing' to the owner.
5. A shared member with Can view sees no add or remove controls.
6. On mobile Cloud mode the Notebook screen search narrows the list and shows 'No sources match' text for no result.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The side panel and the tab show the same data because both render SourcesPanel [inferred from ProjectSourcesPanel.tsx:50, 103].
- Search over contents is not required today; the brief says 'search for sources' [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add per-source include toggles that are sent with the chat request, then record the selection in the conversation.
- [proposed] Add a search box to the mobile Sources tab and to the CLI show command.
- [proposed] Hide 'Retry indexing' for editors, since the reindex route is owner-only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Web list, filter, sort, search, preview, delete, refresh, upload entry points. |
| component | ProjectSourcesPanel | `apps/web/features/projects/components/ProjectSourcesPanel.tsx` | Chat side panel or mobile-width sheet and the toggle button. |
| screen | WebChatPage sources panel | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts the panel with read-only flag (7896-7905). |
| component | KnowledgeIndexStatus | `apps/web/features/projects/components/KnowledgeIndexStatus.tsx` | Index status labels and poll constants. |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Files panel inside project settings with retry indexing (lines 100-139). |
| endpoint | GET /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | List files with index states and storage meter. |
| endpoint | DELETE /api/projects/[id]/knowledge-files/[fileId] | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/route.ts` | Retire a file (soft delete, hold check). |
| endpoint | POST .../knowledge-files/[fileId]/reindex | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/reindex/route.ts` | Restart indexing for a file (owner only, not archived). |
| service | retrieval-index-service | `apps/web/lib/services/retrieval-index-service.ts` | Index state and indexing for project files. |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | Web client calls for list, remove, reindex. |
| component | ProjectSourcesTab | `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx` | Mobile Sources tab for local and cloud sources. |
| component | ProjectSourcesButton | `apps/mobile/src/features/projects/components/ProjectSourcesButton.tsx` | Chat header button 'Open project sources'. |
| screen | ProjectNotebookScreen | `apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx` | Mobile Cloud notebook screen with source search and Studio tiles. |
| service | notebook service | `apps/mobile/src/features/notebook/service.ts` | List, search, status, reindex helpers. |
| command | agi projects show | `apps/cli/src/lib.rs` | Prints knowledge file names (3687-3749). |
| command | VS Code project detail | `apps/extension-vscode/src/features/projects/projectActions.ts` | Quick pick with Knowledge files section. |
| table | project_knowledge_files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Rows listed (select at line 39). |
| test | SourcesPanel tests | `apps/web/features/projects/components/__tests__/SourcesPanel.processing.test.tsx` | Panel processing state (file name). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Panel opens and calls the list route for the project; a 15 second timeout turns a slow load into an error. | device and our servers | SourcesPanel.tsx:37, 95-120 |
| Server checks read access, selects non-deleted, non-superseded files newest first, adds index states and the storage meter. | our servers | apps/web/app/api/projects/[id]/knowledge-files/route.ts:23-66 |
| Browser filters, sorts and searches the loaded list in memory. | device | SourcesPanel.tsx:306-336 |
| While any file is pending or indexing, the panel polls the list every 5 seconds, up to 60 times. | device and our servers | SourcesPanel.tsx:122-150; KnowledgeIndexStatus.tsx:7-8 |
| Retry indexing posts to the reindex route, which marks the document and dispatches an indexing workflow. | our servers | reindex/route.ts:25-67 |
| Mobile Local mode reads sources from the on-device store; Cloud mode lists from the server. | device | ProjectSourcesTab.tsx:293, 436-471; store.ts:125 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source file records (name, type, size, checksum, summary, version) | table project_knowledge_files, file bytes in object storage | Yes for account projects | Delete retires the row; held content refuses deletion (knowledge-files/[fileId]/route.ts:70-86) |
| Index state (status, chunk count, semantic flag, attempts, error) | Retrieval index tables read by readProjectKnowledgeIndexStates | Read from the server | Rebuilt by retry or re-upload |
| Mobile Local-mode sources (name, type, size, uri) | store:project-store on the phone | No | Removed with the source or project |

**Models and providers.** Listing and search call no model. Indexing for semantic search uses an embedding route chosen from managed providers and is metered through managed compute; when no route works the file stays keyword-only (apps/web/lib/services/retrieval-embedding-service.ts:204-234; retrieval-index-service.ts:111-118).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for account projects. Mobile Local-mode sources need none. |
| Permissions | Read access for owner and shared members; delete and upload need owner or editor; reindex is owner only (knowledge-files/route.ts:30; project-knowledge-files.ts:203-233; reindex/route.ts:36). |
| Subscription | Storage and file size limits depend on plan (see F037-05). Viewing the list has no plan gate found. |
| Limits and metering | Up to 40 active files per project (suite-contracts.ts:502). Index building is metered managed compute (retrieval-embedding-service.ts:225-234). Rate limit 'chat-conversation'. |
| Feature flags | Mobile Notebook entry needs appMode cloud (projects/[id].tsx:431-433). Connector release constant affects only the Drive button (see F037-06). |
| Model compatibility | None found for listing or search. |
| Provider restrictions | Embedding route uses providers that are available and, when the account opted out of training, only no-training providers (retrieval-embedding-service.ts:215-220). |
| Local mode | Mobile Local mode shows device-held sources and no index states; web, CLI, VS Code have no Local mode. The Notebook screen is blocked in Local mode by its gate. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading...' on web; skeleton rows on mobile Notebook. | SourcesPanel.tsx:412; ProjectNotebookScreen.tsx:231 |
| Timeout | A load slower than 15 seconds becomes an error with Retry. | SourcesPanel.tsx:37-50 |
| Empty | Different text for owners, editors and read-only members. | SourcesPanel.tsx:500-505 |
| No match | 'No sources match “x”.' or 'No sources match the current filter.' | SourcesPanel.tsx:668-669 |
| Indexing | Status text and polling; stops after 60 polls. | KnowledgeIndexStatus.tsx:7-8, 30-33 |
| Delete failure | Row is restored and a toast 'Couldn't remove <file>. Try again.' appears. | SourcesPanel.tsx:207-220 |
| Account switch (mobile) | Stale loads are ignored through the account epoch check. | ProjectSourcesTab.tsx:312-330 |
| Cited-file deep link | A URL with knowledgeFile and page opens the Sources tab and previews that file once. | page.tsx:140-145; SourcesPanel.tsx:152-171 |
| Accessibility | Selects and inputs have aria-labels ('Filter sources by type', 'Sort sources', 'Search sources' sr-only label); mobile buttons have labels per file. | SourcesPanel.tsx:582, 605, 638; ProjectSourcesTab.tsx:152, 191, 203 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/SourcesPanel.processing.test.tsx`: Sources panel while files process (file name).
- `apps/web/features/projects/components/__tests__/SourcesPanel.removeRollback.test.tsx`: Rollback of a failed remove (file name).
- `apps/web/features/projects/components/__tests__/SourcesPanel.org-shared.test.tsx`: Read-only panel for shared projects (file name).
- `apps/web/features/projects/components/KnowledgeFilesPanel.indexing.test.tsx`: Indexing status and retry in the settings files panel (file name).
- `apps/web/features/projects/components/KnowledgeFilesPanel.delete.test.tsx`: Delete in the files panel (file name).
- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Notebook-related web component (file name; contents not opened).
- `apps/mobile/src/features/notebook/__tests__/ProjectNotebook.test.tsx`: Mobile Notebook screen (file name).
- `apps/mobile/src/features/projects/__tests__/ProjectSourcesViewer.test.tsx`: Mobile source viewer (file name).
- `apps/mobile/src/features/projects/__tests__/project-sources-cloud.test.ts`: Cloud sources in the mobile store (file name).
- `apps/web/e2e/project-knowledge-retrieval.spec.ts`: Browser test that an answer uses a far passage of a long file (describe title opened).

**Test scenarios**

- **Search by summary**
  1. Open Sources with three files.
  2. Type part of one file's name.
  - Expected: Only matching rows show; clearing the box restores all.
- **Type filter**
  1. Add a PDF and a text file.
  2. Pick PDFs.
  - Expected: Only the PDF shows.
- **Side panel**
  1. Open a project chat.
  2. Press 'Open project sources'.
  - Expected: A panel '<project> sources' lists the files; closing returns the full chat.
- **Read-only member**
  1. Share a project with Can view.
  2. Open Sources as the member.
  - Expected: List and preview work; no add or delete.
- **Failed indexing**
  1. Cause or simulate an indexing failure.
  2. Press 'Retry indexing' as owner.
  - Expected: Status returns to indexing then indexed or fails again.

**Where to look when it fails**

- Server log '[knowledge-files] index state read failed' (project-knowledge-files.ts:101) and 'Failed to fetch knowledge files' (knowledge-files/route.ts:48).
- Reindex toast 'Couldn't restart indexing for <file>. Try again.'
- Index error text from RETRIEVAL_FAILURE_MESSAGES (retrieval-index-service.ts:111).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)
- CLI: [70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md)
- VS Code: [70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **No per-source checkbox to choose which sources ground an answer.** Affects: All apps. Evidence: No checkbox in SourcesPanel.tsx, ProjectSourcesPanel.tsx or ProjectSourcesTab.tsx; brief S37.05. Work needed: Design selection, pass selected file ids to the chat request and the retrieval loader, and show it in citations.
- **Search covers name and summary only; the summary is mostly empty or a notice.** Affects: Web and mobile. Evidence: SourcesPanel.tsx:309-317; project-knowledge-files.ts:164-169. Work needed: Add content search through the retrieval index or generated summaries.
- **CLI show prints names but has no search; VS Code has no search; Chrome has no list.** Affects: CLI, VS Code, Chrome. Evidence: lib.rs:3719-3733; projectActions.ts:100-111. Work needed: Only if owners want them (VS Code and Chrome are scoped out by decisions).
- **Mobile Sources tab has no search box; the search sits on a separate Notebook screen that needs Cloud mode.** Affects: Mobile. Evidence: ProjectNotebookScreen.tsx:150-160, 219. Work needed: Add search to the Sources tab or document the path.
- **'Retry indexing' shows for editors but the server accepts the owner only.** Affects: Editors on web. Evidence: SourcesPanel.tsx:746; reindex/route.ts:36. Work needed: Align UI and server.
- **Brief marks search missing, which disagrees with the code.** Affects: Audit accuracy. Evidence: Brief S37.13 vs SourcesPanel.tsx:638-643. Work needed: Update the brief status.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:GET /api/projects/{id}/knowledge-files
- api:POST /api/projects/{id}/knowledge-files/{fileId}/reindex
- table:project_knowledge_files
- store:project-store
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- F037-05
- F037-03

## Unknown

- Whether the mobile Sources tab shows any search (no search code found by reading labels; file not fully read).
- How the web Sources panel looks at runtime on narrow screens.
- What the retrieval index returns when only keyword indexing exists, beyond the 'Keyword search only' label.
- Desktop-specific behaviour of the side panel.
