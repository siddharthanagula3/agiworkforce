---
id: "F034-06"
type: "feature"
title: "Project knowledge collections"
aliases: ["Project knowledge", "Project sources", "Sources tab", "Add sources", "Knowledge files", "User-selected source collections", "S34.19", "agi projects add-file"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S34.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "table:project_knowledge_files", "table:retrieval_chunks", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-06 Project knowledge collections

Files added to a project become knowledge that every chat in that project can use. Short files are sent whole; long ones are searched and only matching passages are sent. Web, Desktop, Mobile and CLI add files; VS Code only lists them and does not attach them to turns. Chrome does not apply.

Area: [34. Search experiences](README.md). Requirement items: [S34.19](../../10-requirements/capabilities/034-search-experiences.md#s3419).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores files, notes and imported Drive files in a project, indexes them, and on each chat in the project puts the file text, or the passages that match the question, into the model's context.

**Why it exists.** Claude Projects and ChatGPT Projects let users give a project its own files (doc: docs/product/competitive-guidance.md).

**Who uses it.** People working on one topic over many chats.

**Problems it solves**

- Re-uploading the same file in every chat
- Files too large for one prompt

**Use cases**

- Add a product spec to a project and ask questions
- CLI user adds a file with agi projects add-file
- Mobile user adds a document to a project's Sources tab

## 2. User experience

**Where to find it**

- Web and Desktop: open a project, 'Sources' panel with 'Add sources' (apps/web/features/projects/components/SourcesPanel.tsx:529, :572); filter box 'Search sources by name or summary' (line 643).
- Mobile: project Sources tab (apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx).
- CLI: 'AddFile' project subcommand described as 'Add a file to a project's knowledge, where its chats can search it.' (apps/cli/src/lib.rs:1327); the full command spelling 'agi projects add-file' is inferred.
- VS Code: Projects tree lists knowledge files read-only (apps/extension-vscode/src/features/projects/projectsClient.ts:15-60).

**Before you start**

- Cloud account and a project (Cloud).
- Mobile Local mode: a local project with sources on the phone.
- CLI: a signed-in AGI account (managed).

**Screens and controls**

- Add sources: files, text note and Google Drive files (SourcesPanel.tsx:502-503).
- Filter by type, sort, search by name or summary (SourcesPanel.tsx:582-643).
- Indexing status per file with Retry (SourcesPanel.tsx:744-747); Mobile badges 'Indexing' and 'Couldn’t read' (ProjectSourcesTab.tsx:66-71).
- Remove source with confirmation 'Remove <file>?' (SourcesPanel.tsx:787).

**Journey**

1. Open a project, go to Sources, add files; each file shows indexing then ready.
2. Start a chat inside the project and ask a question.
3. The service sends the project context: instructions, files whole or matching passages, and short excerpts of other chats in the project.
4. CLI: add-file prints a receipt; managed turns in a directory linked to the project can search it.

**What the person sees and gets**

- Indexing progress, retry on failure, toast errors 'Couldn't restart indexing for <file>. Try again.' (SourcesPanel.tsx:201).
- CLI receipt 'Added <file> to '<project>'. ...' and 'Indexing failed: ...' (apps/cli/src/cloud/knowledge.rs:58-78).
- Blocked chat: 'This project is archived, deleted, or unavailable. Remove the conversation from the project or restore the project before retrying.' (request-processor.ts:3865-3875).

**Settings**

- Project instructions and description (sent with the files).
- Semantic retrieval flag per request (params.semanticRetrieval, default true) (project-context-service.ts:344).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: upload, text note, Drive import (up to 10 files), remove, retry indexing, status polling while indexing (SourcesPanel.tsx:127-216; packages/contracts/cloud-contracts/src/project-knowledge.ts:61).
- Limit 40 knowledge files per project (packages/contracts/types/src/suite-contracts.ts:502).
- Prompt build: per file up to 16,000 characters and 48,000 in total; a file that fits is sent whole; larger files use indexed passages (24 passages, up to 8 per file) or, when the index has nothing, per-request passage selection (apps/web/lib/services/project-context-service.ts:79-93, :339-352, :423-453; apps/web/lib/services/project-knowledge-retrieval.ts:7-8, :29-60).
- Project context also adds up to 15 sibling chats (project-context-service.ts:84).
- Unavailable project blocks the chat with status 409 and code project_context_unavailable (request-processor.ts:3855-3875).
- Index states: pending, indexing, indexed, stale, failed (project-knowledge.ts:98-105).
- CLI add-file uploads with a checksum and prints a receipt including a failed-index note (apps/cli/src/cloud/knowledge.rs:89-130).
- Mobile Cloud target lists and reindexes Cloud sources; Mobile Local target adds sources on the device and sends their text, up to 100,000 characters in total, in the Local turn (apps/mobile/stores/chat/chatExecutionStore.ts:2762-2768; apps/mobile/services/attachmentContext.ts:5-6, :68-90).

**Incomplete**

- Mobile Local sources are read whole up to a budget; they are not searched (attachmentContext.ts:68-90).
- Semantic search can pause on the Free plan's daily limit; keyword search keeps working (apps/web/lib/services/retrieval-index-service.ts:118-120).

**Present but disconnected or switched off**

- VS Code: knowledge files are listed but not attached to a turn; the code says so (apps/extension-vscode/src/features/projects/activeProject.ts:48-59).

**Not available**

- Chrome: not applicable (doc: area brief S34.19).
- VS Code: no add or search of knowledge files from the editor [inferred from projectsClient.ts having list only].

## 4. Required behaviour

**Established requirements**

- The user can put chosen sources into a named collection (a project's knowledge) and have chats search it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.19)
- Files that fit are sent whole; larger files are searched and only matching passages are sent; with an empty index, passages are chosen per request. (source: apps/web/lib/services/project-context-service.ts:423-453; apps/web/lib/services/project-knowledge-passages.ts:1-20)
- An archived, deleted or unavailable project blocks the chat with a clear error. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3865-3875)
- Failed indexing shows an error on the file. (source: apps/web/features/projects/components/SourcesPanel.tsx:744-747; apps/cli/src/cloud/knowledge.rs:70-78)

**Acceptance criteria**

1. A 5,000 character file added to a project appears whole in a chat's project context; a 200,000 character file contributes only passages that match the question.
2. A project with 41 files is refused at the 41st file.
3. After adding a file, status goes from indexing to ready; a failed file shows an error and a Retry that restarts indexing.
4. A chat in an archived project returns the 409 message and nothing is sent to the model.
5. Total file text in one turn never exceeds 48,000 characters.
6. CLI add-file prints a receipt; with a failing index it adds 'Indexing failed'.
7. Mobile Local project with a text source: the Local reply can quote it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- VS Code should either attach knowledge or say it does not; today it says so only inside the model prompt [inferred].
- Mobile Local sources could use the same passage logic when large [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Mark VS Code as partial in the brief.
- [proposed] Show a visible note in VS Code when an active project's files are not attached.
- [proposed] Add passage selection to Mobile Local sources for large files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Web and Desktop sources UI: add, filter, indexing status, retry, remove. |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | Upload and reindex helpers (reindexProjectKnowledgeFile). |
| endpoint | /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | List and manage knowledge files (route folder with google-drive and origins subroutes). |
| endpoint | POST /api/uploads/presign | `apps/cli/src/cloud/knowledge.rs` | Presigned upload with kind knowledge-file used by the CLI (line 11). |
| service | loadProjectContext | `apps/web/lib/services/project-context-service.ts` | Builds project context with budgets and passage selection. |
| service | project-knowledge-retrieval | `apps/web/lib/services/project-knowledge-retrieval.ts` | Indexed passage retrieval for large files. |
| service | project-knowledge-passages | `apps/web/lib/services/project-knowledge-passages.ts` | Whole-or-passages selection. |
| service | retrieval-index-service | `apps/web/lib/services/retrieval-index-service.ts` | Chunks and embeds file text; status and retry. |
| table | project_knowledge_files | `apps/web/db/neon/0006_projects.sql` | File rows with extracted text and summary. |
| table | retrieval_documents and retrieval_chunks | `apps/web/db/neon/0202_retrieval_index.sql` | The searchable index. |
| endpoint | Chat completions project block | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads context and returns 409 for unavailable projects (lines 3855-3880). |
| schema | project-knowledge contracts | `packages/contracts/cloud-contracts/src/project-knowledge.ts` | Upload, index state and file schemas. |
| screen | ProjectSourcesTab | `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx` | Mobile sources with Cloud and Local targets. |
| service | buildProjectSourceContext | `apps/mobile/services/attachmentContext.ts` | Reads Local sources into the turn up to 100,000 characters. |
| command | projects AddFile | `apps/cli/src/lib.rs` | Command definition (line 1327) and handler (line 3796). |
| service | cloud knowledge add_file | `apps/cli/src/cloud/knowledge.rs` | Upload with checksum and receipt. |
| service | VS Code projects client | `apps/extension-vscode/src/features/projects/projectsClient.ts` | Lists knowledge files only. |
| service | formatActiveProjectPrelude | `apps/extension-vscode/src/features/projects/activeProject.ts` | States that files are not attached to VS Code turns. |
| test | project-knowledge-passages tests | `apps/web/lib/services/__tests__/project-knowledge-passages.test.ts` | Passage selection tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app uploads the file (checksum bound) and registers it; the server extracts text and summary and starts indexing. | device and our servers | project-knowledge.ts:80-96; knowledge.rs:89-130 |
| The indexer splits text, optionally embeds it, and stores chunks; the file shows pending, indexing, indexed or failed. | our servers | retrieval-index-service.ts:118-120; project-knowledge.ts:98-105 |
| On each chat turn the chat service loads the project, ranks files against the question, and for files over 16,000 characters queries the index for matching passages. | our servers | project-context-service.ts:339-352; project-knowledge-retrieval.ts:29-60 |
| Whole files, passages, instructions and sibling chat excerpts are fitted into a character budget and sent to the model with citations. | our servers | request-processor.ts:3879-3881 |
| Mobile Local: sources are read from the phone and added as a system message; no server involved. | device | chatExecutionStore.ts:2762-2768 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Knowledge file bytes | File storage (storageUri on the file row) | Server-side | Removable; retentionExpiresAt and deletedAt fields exist (project-knowledge.ts:90-92) |
| Extracted text, summary, anchors | table:project_knowledge_files | Server-side | With the file |
| Index chunks and embeddings | table:retrieval_chunks, table:retrieval_documents | Server-side | unknown |
| Mobile Local sources | Project store on the phone | No | Until removed |

**Models and providers.** The file text goes to whichever model serves the chat. Semantic indexing uses an embedding service that is metered (retrieval-index-service.ts:37); the embedding provider is unknown. Passage selection by keywords needs no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud: signed-in account; CLI: managed account; Mobile Local: none. |
| Permissions | User and workspace scoped; project must be live (not archived or deleted). |
| Subscription | none found in the code for adding knowledge beyond a 40-file limit; Free semantic indexing has a daily limit (retrieval-index-service.ts:120). |
| Limits and metering | 40 files; 10 Drive files per import; 16,000 characters per file and 48,000 per turn; 15 sibling chats; embeddings metered. |
| Feature flags | none found in the code for project knowledge itself. |
| Model compatibility | Any chat model, since the text is placed in the prompt; context window limits apply through the character budget. |
| Provider restrictions | Own-key and Cloud turns send file text to the chosen provider; no restriction found. |
| Local mode | Mobile Local uses on-device sources up to 100,000 characters, with no search. Web, CLI and VS Code project knowledge needs Cloud; CLI notes managed turns only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Sources panel shows load state and polls while any file is indexing. | SourcesPanel.tsx:35, :127-151 |
| Load error | Error banner in the panel. | SourcesPanel.tsx:417 |
| Empty | Prompt to add files or text. | SourcesPanel.tsx:502-503 |
| Upload error | Banner with error colour. | SourcesPanel.tsx:366-391 |
| Indexing failed | Error on the file with Retry (Web, Mobile) or note in the CLI receipt. | SourcesPanel.tsx:744-747; knowledge.rs:70-78 |
| Index has nothing yet | Passages chosen per request. | project-knowledge-retrieval.ts:25-28 |
| File changed after indexing | Stale hits whose offsets do not match are dropped. | project-knowledge-retrieval.ts:66-78 |
| Project unavailable | 409 project_context_unavailable. | request-processor.ts:3865-3875 |
| Context load fails | A project context load failure response. | request-processor.ts:3886-3896 |
| Upload cancel | Mobile can cancel the upload. | ProjectSourcesTab.tsx:cancelUpload |
| Offline | not handled in the code read beyond errors. | apps/web/features/projects/components/SourcesPanel.tsx:236-291 (error banners only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/project-knowledge-passages.test.ts`: Passage selection (contents not read).
- `apps/web/lib/services/__tests__/project-context-manifest-fidelity.test.ts`: Project context manifest (contents not read).
- `apps/web/lib/services/__tests__/retrieval-search-service.test.ts`: Retrieval search service.
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__`: Folder of route tests (file names not listed).
- `apps/mobile/src/features/projects/__tests__/project-sources-cloud.test.ts`: Mobile Cloud sources.
- `apps/mobile/src/features/projects/__tests__/ProjectSourcesViewer.test.tsx`: Mobile source viewer.

**Test scenarios**

- **Whole versus passages**
  1. Add a 5,000 character file and a 200,000 character file with a unique sentence in each; ask about both.
  - Expected: The small file is quoted from the whole; the large file answers only for passages that match.
- **Indexing failure**
  1. Add an unreadable file.
  - Expected: Error on the file; Retry restarts indexing.
- **Archived project**
  1. Archive the project and send a chat in it.
  - Expected: The 409 text asking to remove the chat or restore the project.
- **CLI add-file**
  1. Run the project add-file command with a text file and a project name.
  - Expected: Receipt with the file name and project.
- **VS Code attach check**
  1. Set an active project in VS Code and ask about a file in its knowledge.
  - Expected: The prompt says files are not attached; answer cannot draw on them.
- **Mobile Local**
  1. In Local mode add a text source and ask about it.
  - Expected: The Local reply uses it; a very large source is cut at the budget.

**Where to look when it fails**

- Log '[project-context] indexed knowledge retrieval failed; selecting passages per request'.
- Log 'Project context load failed'.
- Tables project_knowledge_files, retrieval_documents, retrieval_chunks; index status values.
- Response header from addProjectSourcesHeader (route.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)
- VS Code: [70-qa/test-plans/vscode/034-search-experiences.md](../../70-qa/test-plans/vscode/034-search-experiences.md)

## 10. Gaps and dependencies

- **VS Code does not attach knowledge files but the brief lists it as done.** Affects: VS Code users. Evidence: apps/extension-vscode/src/features/projects/activeProject.ts:48-59. Work needed: Correct the brief or add attachment.
- **Mobile Local sources are not searched; large sources are cut.** Affects: Mobile Local users. Evidence: apps/mobile/services/attachmentContext.ts:68-90. Work needed: Passage selection on device.
- **CLI command spelling and linked-folder behaviour not verified end to end.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1327, :3844. Work needed: Run the CLI and confirm.
- **Retention of index chunks not found.** Affects: Privacy review. Evidence: retrieval tables read only for names. Work needed: Read the deletion code.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- table:project_knowledge_files
- table:retrieval_chunks
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline

## Unknown

- Embedding provider and model used for semantic indexing.
- Retention and deletion of index chunks when a file or project is deleted.
- Exact CLI parent command name for add-file.
- Whether the CLI full-screen chat uses project knowledge on linked folders in practice: only the CLI message at lib.rs:3844 states it.
- Contents of the web route tests for knowledge files.
- Whether Desktop Tauri build has separate project knowledge code.
