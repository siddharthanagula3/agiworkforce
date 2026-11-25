---
id: "F023-03"
type: "feature"
title: "Project chats, files, sources, notes and artifacts content"
aliases: ["Project chats", "Project files", "Knowledge files", "Sources tab", "Add sources", "Project artifacts", "Notes.md notes"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S23.06", "S23.07", "S23.08", "S23.10", "S23.12", "S23.26", "S23.27"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "mode:local", "table:project_knowledge_files", "table:web_conversations", "api:GET /api/projects/{id}/knowledge-files", "api:POST /api/projects/{id}/knowledge-files", "api:GET /api/connectors/google-drive/picker", "F023-01", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-connectors-plugins-and-skills"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-03 Project chats, files, sources, notes and artifacts content

A project lists the chats filed under it, starts new chats in it, holds files and text sources that its chats read, and shows artifacts made in its chats. Web is richest. Mobile has chats, sources and artifacts for Cloud projects. Google Drive sources wait for picker keys. Move, copy and add-answer are not built.

Area: [23. Project workspace](README.md). Requirement items: [S23.06](../../10-requirements/capabilities/023-project-workspace.md#s2306), [S23.07](../../10-requirements/capabilities/023-project-workspace.md#s2307), [S23.08](../../10-requirements/capabilities/023-project-workspace.md#s2308), [S23.10](../../10-requirements/capabilities/023-project-workspace.md#s2310), [S23.12](../../10-requirements/capabilities/023-project-workspace.md#s2312), [S23.26](../../10-requirements/capabilities/023-project-workspace.md#s2326), [S23.27](../../10-requirements/capabilities/023-project-workspace.md#s2327).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 4) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built (this page lists unfinished parts) | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a project its content: filed chats, uploaded knowledge files and pasted text, and an artifact list. Chats in the project get the files as context (apps/web/lib/services/project-context-service.ts:188, 585).

**Why it exists.** Brief items S23.06, S23.07, S23.08, S23.12 say a project lists chats, holds files and sources, and shows artifacts (doc: knowledge-base/data/area-briefs/023-project-workspace.md).

**Who uses it.** Signed-in users on Web, Desktop (hosted), Mobile, CLI (chats, files, artifacts) and VS Code (chats and files view).

**Problems it solves**

- Chats that need reference documents
- Finding past chats of one topic
- Finding documents the assistant produced

**Use cases**

- Upload a contract to a project and ask questions in a new project chat.
- Paste meeting notes as a text source on the phone.
- List a project's artifacts on the web.
- Run agi projects add-file to add a document from a terminal.

## 2. User experience

**Where to find it**

- Web: project page tabs Chats, Artifacts, Sources (apps/web/app/chat/projects/[id]/page.tsx:50-58); Settings dialog 'Files'.
- Mobile: project page tabs Chats, Sources, Artifacts (apps/mobile/app/(app)/projects/[id].tsx:219-228).
- CLI: agi projects add-file, agi projects show, agi history --project, agi artifacts list --project (apps/cli/src/lib.rs:1300-1340, 3800, 7192, 1364).
- VS Code: project detail quick pick lists knowledge files and recent conversations (projectActions.ts:100-130).
- Desktop: web flow in Electron (doc: AGENTS.md section 5).

**Before you start**

- Cloud project and sign-in.
- Files: file storage allowance (apps/web/app/api/projects/[id]/knowledge-files/route.ts:61).
- Drive: Google Drive connector connected and picker keys configured on the server.

**Screens and controls**

- Web chats tab: list, 'Load more chats', 'Retry', empty 'No chats yet' (page.tsx:1176-1400).
- Web composer 'New chat in <project>' (page.tsx:1088).
- Web sources tab: ProjectStudio, ProjectNotes, SourcesPanel (page.tsx:1332-1352).
- Web 'Add sources' modal with Upload, 'Text input', 'Google Drive' (apps/web/features/projects/components/AddSourcesModal.tsx:151-310).
- Mobile 'Add sources' button and a second text-add button, upload progress rows (ProjectSourcesTab.tsx:704-740, 106-107).
- Web artifacts tab and 'No artifacts yet' (ProjectArtifactsPanel.tsx:28, 57).

**Journey**

1. Open the project.
2. Chats: pick a chat or type in the composer to start a new one filed under the project.
3. Sources: choose Add sources, then Upload, Text input or Google Drive.
4. Wait for the file to be added and indexed.
5. Ask a question in a project chat; the answer can cite project files.
6. Artifacts: open an artifact from the list.

**What the person sees and gets**

- Indexing status label 'Indexing' or 'Couldn't read' on mobile (ProjectSourcesTab.tsx:70-71).
- Web file indexing status component (KnowledgeIndexStatus.tsx) and storage meter (knowledge-files/route.ts:61).
- CLI receipt 'Added <file> to <project>' (apps/cli/src/cloud/knowledge.rs:61-78).
- Drive picker not configured returns status not-configured (apps/web/app/api/connectors/google-drive/picker/route.ts:20-26).

**Settings**

- Settings dialog can switch Notes, files via Files section (ProjectSettingsDialog.tsx:404-410).
- Drive connector under connections settings (AddSourcesModal.tsx:335).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web project chats are fetched by projectId with paging and retry (apps/web/lib/hooks/useConversations.ts:1031-1066).
- A new chat from the project page saves a handoff and opens the chat with the project id (page.tsx:234-262).
- Knowledge files list and register through GET and POST /api/projects/{id}/knowledge-files with storage meter and index state (knowledge-files/route.ts:23-100).
- Web artifacts list reads /api/artifacts/index?projectId (apps/web/features/chat/hooks/use-artifact-index.ts:77-78).
- Chat turns load project context (instructions and files) and fail with 409 project_context_unavailable when the project is archived or gone (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855-3875).
- Web has a Notes.md note in the Sources tab saved as a knowledge file (apps/web/features/projects/components/ProjectNotes.tsx:14, 37).
- Mobile Cloud uploads by presign, upload, register (apps/mobile/src/features/projects/store.ts:256-340); mobile Local keeps sources on device and builds source context for local turns (apps/mobile/stores/chat/chatExecutionStore.ts:2757-2770).
- CLI add-file uploads to the project (apps/cli/src/lib.rs:3800-3820) and CLI lists conversations by project (lib.rs:2876-2904) and artifacts by project (lib.rs:1364).

**Incomplete**

- Google Drive: route returns not-configured until GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID are set (picker/route.ts:18-26); brief says live check pending.
- Mobile has no Drive entry in the sources tab (no Drive text found in ProjectSourcesTab.tsx).
- Project files in VS Code are listed but the VS Code turn does not upload them (apps/extension-vscode/src/features/projects/activeProject.ts:46-49).

**Present but disconnected or switched off**

- Drive picker returns not-configured when keys are absent (picker/route.ts:20-26).

**Not available**

- Move or copy a conversation into a project (S23.26) and add answer to knowledge (S23.27): brief says not applicable; no code looked for beyond brief.
- Mobile and VS Code artifacts list tied to a project: mobile has a tab, VS Code none found by project (mobile [id].tsx:225).
- Chrome files, sources, chats list: none found.

## 4. Required behaviour

**Established requirements**

- A project lists its conversations, opens them and starts new chats filed under it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.06)
- Users upload files, list, preview or download, remove them, and project chats can use them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.07)
- The Sources tab adds files, text or connected-service content. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.08)
- A project shows artifacts produced in its chats and opens each. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.12)
- Project chats are conversations whose project id matches, owned by the user, not deleted and not temporary. (source: apps/web/app/api/projects/route.ts:104-110)
- Notes, move or copy, and add-answer-to-knowledge are not applicable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.10, S23.26, S23.27)

**Acceptance criteria**

1. A chat started from the project page appears in that project's Chats tab.
2. An uploaded file appears in the list and reaches the Indexed state.
3. A question in a project chat uses the file content.
4. Removing a file removes it from the list.
5. With keys unset, choosing Google Drive shows the connector or not-configured outcome, not a crash.
6. Archived project: a new turn gets the clear project_context_unavailable message.
7. Artifacts made in a project chat appear in the Artifacts tab and open.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web has a Notes.md feature although the brief says notes are not applicable; the brief row is outdated [inferred from ProjectNotes.tsx:14 and page.tsx:1336].
- The CLI has add-file so the brief's CLI files missing is outdated [inferred from lib.rs:3800].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief rows S23.07, S23.10, S23.12 to match code.
- [proposed] Add agi projects files list and remove.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Web project page tabs | `apps/web/app/chat/projects/[id]/page.tsx` | Chats, artifacts, work, sources, scheduled. |
| hook | useProjectConversations | `apps/web/lib/hooks/useConversations.ts` | Fetches chats of a project. |
| endpoint | GET/POST /api/projects/{id}/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | List and register files. |
| table | project_knowledge_files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Rows of project files (query at lines 41-49). |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Register file, index states. |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Sources list on web. |
| component | AddSourcesModal | `apps/web/features/projects/components/AddSourcesModal.tsx` | Upload, text, Drive choices. |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Files in settings with preview and delete. |
| component | ProjectNotes | `apps/web/features/projects/components/ProjectNotes.tsx` | Notes.md editor stored as a knowledge file. |
| endpoint | GET /api/connectors/google-drive/picker | `apps/web/app/api/connectors/google-drive/picker/route.ts` | Returns picker token or not-configured. |
| component | ProjectArtifactsPanel | `apps/web/features/projects/components/ProjectArtifactsPanel.tsx` | Artifact list for a project. |
| hook | useArtifactIndex | `apps/web/features/chat/hooks/use-artifact-index.ts` | GET /api/artifacts/index with projectId. |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Loads project files and chats into the prompt. |
| component | ProjectChatsTab | `apps/mobile/src/features/projects/components/ProjectChatsTab.tsx` | Mobile chats tab. |
| component | ProjectSourcesTab | `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx` | Mobile sources with upload progress. |
| component | ProjectArtifactsTab | `apps/mobile/src/features/projects/components/ProjectArtifactsTab.tsx` | Mobile artifacts tab. |
| service | cloudProjectSources | `apps/mobile/src/features/projects/store.ts` | Mobile presign, upload and register. |
| service | cloud::knowledge::add_file | `apps/cli/src/cloud/knowledge.rs` | CLI upload to project. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chats tab asks the server for conversations with the project id. | our servers | apps/web/lib/hooks/useConversations.ts:1066 |
| A file is uploaded to storage by presigned upload, then registered as a knowledge file; indexing follows. | device and our servers | apps/mobile/src/features/projects/store.ts:256-340; apps/web/app/api/projects/[id]/knowledge-files/route.ts:57-100 |
| On each chat turn the server loads the project context (instructions, file text or passages, sibling chats) and renders it into the prompt within a budget. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855-3880; project-context-service.ts:585-640 |
| The model provider receives the rendered project context as part of the chat request. | outside service | [inferred] from request-processor.ts:3880-3890 passing projectBlocks to the turn |
| Mobile Local turns build source context on the device and send it to the local model. | device | apps/mobile/stores/chat/chatExecutionStore.ts:2757-2770 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Knowledge file bytes and metadata | Object storage plus table project_knowledge_files | Account wide | Deleted with the project or by remove; file contents deleted (apps/web/features/projects/components/ProjectSettingsDialog.tsx:228-233) |
| Chat to project link | web_conversations.project_id | Account wide | On project delete chats are moved to All Chats (ProjectSettingsDialog.tsx:230) |
| Mobile Local source files | device (sources array in store:project-store) | No | Removed with the project |

**Models and providers.** Project text reaches whichever model the chat uses. Which provider is a property of the chat, not of this feature. Embedding or index models for file indexing: unknown (not opened).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud: signed in. Mobile Local: none. |
| Permissions | Readable-project scope SQL limits files to owner or shared readers (knowledge-files/route.ts:45-47). Org shared read-only users see sources read-only (page.tsx readOnly flags 1340-1352). |
| Subscription | Projects capability on cloud-chat tiers (billing-catalog.ts:348). File storage allowance by plan via getFileStorageLimitBytes (free-plan-entitlements.ts:18). |
| Limits and metering | Storage meter returned with the file list (knowledge-files/route.ts:61). Max file bytes from attachment policy (apps/cli/src/cloud/project_files.rs:17-21). |
| Feature flags | Connectors release flag (assertConnectorsReleased) and picker env keys GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID (picker/route.ts:16-19). |
| Model compatibility | Not model dependent in the routes; context budget limits how much file text reaches the model (project-context-service.ts:520-545). |
| Provider restrictions | Project defaultProviderMode only ManagedGateway or ManagedNative (projects.ts:21). |
| Local mode | Mobile Local: files and text work on the device and feed local turns (chatExecutionStore.ts:2757-2770). Web: not available. CLI and VS Code: need account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Chats loading, error, empty | 'Loading chats...', error with Retry, 'No chats yet'. | page.tsx:1176, 1190-1205, 1398 |
| More chats | 'Load more chats' button. | page.tsx:1309 |
| Upload failed | Mobile message 'Uploading <file> to storage failed. Please retry.' | apps/mobile/src/features/projects/store.ts:318-325 |
| Upload cancelled | ProjectSourceCancelledError 'Adding <name> was cancelled.' | store.ts:105-110 |
| Account changes during upload | Upload aborts when the account epoch changes. | store.ts:243-250 |
| Indexing failed | CLI prints 'Indexing failed'; mobile shows 'Couldn't read'. | apps/cli/src/cloud/knowledge.rs:80-87; ProjectSourcesTab.tsx:71 |
| Archived project chat | 409 project_context_unavailable. | request-processor.ts:3860-3872 |
| Drive not connected | Picker status not-connected or reconnect-required. | picker/route.ts:34-45 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/AddSourcesModal.test.tsx`: Add sources modal.
- `apps/web/features/projects/components/KnowledgeFilesPanel.delete.test.tsx`: File delete.
- `apps/web/features/projects/components/KnowledgeFilesPanel.indexing.test.tsx`: Indexing status.
- `apps/web/features/projects/services/project-knowledge-upload.test.ts`: Upload service.
- `apps/web/features/projects/__tests__/project-knowledge-upload-boundary.test.ts`: Upload boundary (by name).
- `apps/web/features/projects/components/__tests__/SourcesPanel.org-shared.test.tsx`: Shared sources (by name).
- `apps/web/features/projects/lib/project-chat-handoff.test.ts`: Chat handoff (by name).
- `apps/mobile/src/features/projects/__tests__/project-sources-cloud.test.ts`: Mobile cloud sources.
- `apps/mobile/src/features/projects/__tests__/ProjectChatsTabOrigin.test.tsx`: Mobile chats tab (by name).
- `apps/mobile/src/features/projects/__tests__/ProjectArtifactsRoutines.test.tsx`: Mobile artifacts and routines tabs (by name).

**Test scenarios**

- **Upload and ask**
  1. Add a text file in Sources
  2. Wait for indexing
  3. Ask about its content in a project chat
  - Expected: Answer uses the file.
- **Chat filing**
  1. Type in the project composer
  2. Open Chats tab
  - Expected: New chat listed.
- **Drive without keys**
  1. Unset picker keys
  2. Choose Google Drive
  - Expected: not-configured outcome, no crash.
- **Phone Local source**
  1. Local mode
  2. Add a text source to a Local project
  3. Chat in it
  - Expected: Local model sees the source text.
- **Archived project turn**
  1. Archive the project
  2. Send in an existing project chat
  - Expected: Message to restore or remove the chat from the project.

**Where to look when it fails**

- Log 'Project context load failed' (request-processor.ts:3880-3890).
- Error code project_context_unavailable.
- Tables project_knowledge_files, web_conversations.
- Log 'Failed to fetch knowledge files' (knowledge-files/route.ts:55).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)
- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)
- VS Code: [70-qa/test-plans/vscode/023-project-workspace.md](../../70-qa/test-plans/vscode/023-project-workspace.md)

## 10. Gaps and dependencies

- **Google Drive source cannot work until picker keys are set and checked live.** Affects: Web, Desktop, Mobile. Evidence: picker/route.ts:18-26; brief S23.08. Work needed: Owner sets keys; live-check inside Electron; add mobile Drive entry.
- **Brief rows disagree with code: web notes, CLI add-file, mobile artifacts tab exist.** Affects: Documentation. Evidence: ProjectNotes.tsx:14; lib.rs:3800; mobile [id].tsx:225. Work needed: Update brief.
- **VS Code turns do not carry project files.** Affects: VS Code. Evidence: activeProject.ts:46-49. Work needed: Decide to attach or keep and say so.
- **Chrome has no chats, files or sources list.** Affects: Chrome. Evidence: projectsClient.ts exports list only. Work needed: Decide scope.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- mode:local
- table:project_knowledge_files
- table:web_conversations
- api:GET /api/projects/{id}/knowledge-files
- api:POST /api/projects/{id}/knowledge-files
- api:GET /api/connectors/google-drive/picker
- F023-01
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-connectors-plugins-and-skills

## Unknown

- Indexing and embedding provider for project files (not opened).
- Whether Electron Drive picker works (brief: unchecked live).
- Whether desktop shows the same Notes.md control (hosted web assumed).
