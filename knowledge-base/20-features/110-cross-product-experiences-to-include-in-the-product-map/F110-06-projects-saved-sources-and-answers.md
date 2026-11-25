---
id: "F110-06"
type: "feature"
title: "Projects: saved sources and answers"
aliases: ["Projects", "Notebook (mobile screen title and brief wording)", "Project knowledge files", "Save to project", "Project or folder picker", "Project Studio outputs", "S110.09", "S110.24", "S110.25"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S110.09", "S110.24", "S110.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "plan:free", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "table:user_projects", "table:project_knowledge_files"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-06 Projects: saved sources and answers

A Project holds instructions and source files. A chat can be attached to a Project and then answers are grounded on its sources. On web, a single answer can be saved into the Project as a Markdown source file. Saving a browser page to a Project from any app is not built.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.09](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11009), [S110.24](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11024), [S110.25](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11025).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Attach a chat to a Project; the server loads the Project's instructions, knowledge files and sibling chat excerpts into each turn (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3853-3892; apps/web/lib/services/project-context-service.ts:188-366). 'Save to project' uploads one answer as a file called 'Answer from <chat title>.md' (apps/web/features/projects/components/project-answer-save.ts:21-28; WebChatPage.tsx:6156-6172).

**Why it exists.** Competing assistants have Projects (or notebooks) so work builds on saved sources. The requirements document lists Projects among the leader features (doc: docs/product/requirements.md:182).

**Who uses it.** People who keep long running work: research, study, client files.

**Problems it solves**

- Context must be re-pasted each chat
- Good answers get lost in old chats
- Instructions should apply to all chats of a topic

**Use cases**

- Create a Project with instructions and upload 3 PDFs, then ask questions grounded on them
- Save the best answer from a chat into the Project so later chats see it
- On the phone open the Project 'Notebook' and make a 'Briefing doc' or 'Slide deck' from its sources
- Link a terminal folder to an account Project with agi projects link

## 2. User experience

**Where to find it**

- Web: composer chip 'Project or folder' (or 'Project' when AGI Work is not allowed) opens the picker (ChatComposerNew.tsx:2765-2766, 7161); message menu item 'Save to project' (MessageBubble.tsx:4026-4034); Project pages under Projects with knowledge files panel (apps/web/features/projects/components/KnowledgeFilesPanel*)
- Desktop: hosted web app [inferred from AGENTS.md section 5]
- Mobile: Project notebook screen titled 'Notebook' with sections 'Create from your sources' and 'Sources' with 'Search sources' and 'Read again' (apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx:154-273); new chat in a Project
- VS Code: command 'Code: Use Project in This Chat' (apps/extension-vscode/package.json:679-680)
- CLI: 'agi projects link' links a folder to an account Project (apps/cli/src/lib.rs:4297-4300 message text)
- Chrome: side panel has an active Project selection (apps/extension/src/side_panel.ts:912, 1823)

**Before you start**

- Signed in; Projects are on every cloud chat plan (billing-catalog.ts:314, 352)
- Project not archived and not deleted, owned by the person in the active workspace (conversations/route.ts:229-242)
- 'Save to project' only when the open chat is in a Project and the person can write (WebChatPage.tsx:6156-6160)

**Screens and controls**

- Project picker in composer
- 'Save to project' / 'Saving to project…' menu item and toasts 'Saved to <project>' or 'That answer could not be saved to the project' (MessageBubble.tsx:1146-1158)
- Knowledge files panel with upload, indexing state, reindex, remove
- Mobile: Studio output buttons Briefing doc, Study guide, FAQ, Timeline, Mind map, Data table, Slide deck, Infographic, Quiz, Flashcards, Learning overview (project-studio.ts)

**Journey**

1. 1. Create or open a Project; add instructions and upload sources.
2. 2. Start a chat inside the Project or pick it in the composer. The server checks ownership and archive state.
3. 3. Ask; the answer is grounded on the Project text with citations of files (project-context-service.ts:360-380).
4. 4. To keep an answer, open its menu and choose 'Save to project'; it becomes a Markdown source file.
5. 5. New chats in the Project see the saved file as a source.
6. 6. Browser page to Project: not available. On the phone, sharing a page link opens a preview that stages text or sends 'Summarize this page.' (apps/mobile/src/features/share-preview/index.tsx:49, 231-238).

**What the person sees and gets**

- Toast 'Saved to <project name>'
- Source citations with file name and snippet (ProjectFileCitation)
- Indexing state per file on the panel
- Error 'Project not found' when attaching a missing project; message about archived project before retry (request-processor.ts:3868-3870)

**Settings**

- Project instructions and description (limits PROJECT_INSTRUCTIONS_MAX_LENGTH, PROJECT_DESCRIPTION_MAX_LENGTH)
- Per-project memory scope (migration 0135_project_scoped_memory.sql)
- Org shared projects: write access needed to save (WebChatPage.tsx:6157-6159)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: attach a Project when creating a chat with ownership and archive check; temporary chat cannot join a Project (conversations/route.ts:229-242)
- Web: server loads project context each turn and fails closed with project_context_load_failed or project_context_unavailable (request-processor.ts:1785-1795, 3853-3892)
- Web: file search tool offered when the Project has knowledge files (request-processor.ts:1154-1182)
- Web: 'Save to project' saves an answer as a Markdown file via the knowledge upload client (WebChatPage.tsx:6162-6168; project-knowledge-upload.ts:50-61)
- Web: artifacts have a save to project action (ArtifactPreview.tsx:1468-1481)
- Mobile: conversations carry projectId into sends (chatExecutionStore.ts:2757, 2892, 2968); notebook screen lists sources, search, reindex and Studio outputs (ProjectNotebookScreen.tsx; service.ts)
- VS Code and Chrome have a Project selection; CLI links folders to a Project and reads it on cloud turns (cloud_turns.rs:777-795)

**Incomplete**

- Mobile cannot save an answer to a Project (no code found); the notebook screen can only read and reindex sources and start outputs
- Saving the whole chat as a source: not found; only a single answer
- The brief cites request-processor.ts:2548 for grounding; that line is a search budget helper; real grounding is at 3853-3892
- CLI, VS Code, Chrome: save-to-Project missing; details of their attach flows not read

**Present but disconnected or switched off**

- Temporary chats are refused a Project (TEMPORARY_CHAT_PROJECT_REFUSAL, conversations/route.ts:230-232)
- Org shared project without write access: Save to project is hidden (WebChatPage.tsx:6157-6159)

**Not available**

- Browser page to Project source on every app (S110.09): no code; the mobile share preview does not save to a Project (share-preview/index.tsx:49, 203-238)
- Chrome: no page-to-Project save found in extension code read

## 4. Required behaviour

**Established requirements**

- From a web page the user is viewing, one action saves that page (URL or captured content) as a source in a chosen Project, and later project chats are grounded on it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.09)
- From the main chat the user brings an existing notebook (project) so its instructions and sources ground the answers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.24)
- From the main conversation the user saves answers or the chat into a project as persistent sources that later chats can cite. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.25)
- A temporary chat cannot be attached to a Project. (source: apps/web/app/api/chat/conversations/route.ts:230-232)
- Project context failure stops the turn rather than answering unscoped. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1785-1795)

**Acceptance criteria**

1. Attaching an archived or someone else's Project to a new chat is refused with 'Project not found'.
2. A temporary chat cannot be moved into a Project.
3. With a Project attached, an answer to a question about an uploaded file cites that file.
4. If project context cannot load, the turn fails with project_context_load_failed and no unscoped answer.
5. 'Save to project' appears only in a Project chat and adds 'Answer from <title>.md' to the knowledge list.
6. A later chat in that Project can answer from the saved answer.
7. On the phone, the notebook lists the Project's sources and each shows an index status.
8. No 'save page' control is shown anywhere until built.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Saved sources should be indexed before use [inferred from the indexing panel]
- Whole-chat save should keep the transcript [inferred from S110.25 'or the chat']

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Save to project' action on the phone and in the Chrome extension for the current page
- [proposed] Add 'Save chat to project'

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | conversations route | `apps/web/app/api/chat/conversations/route.ts` | Creates a chat with projectId; checks ownership, archive, temporary |
| service | request-processor project grounding | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads project context per turn (3853-3892), file search tool (1154-1182) |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Loads instructions, knowledge files, sibling chats; limits |
| component | ChatComposerNew project picker | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | 'Project or folder' chip and picker |
| component | MessageBubble save to project | `apps/web/features/chat/components/messages/MessageBubble.tsx` | 'Save to project' menu item |
| service | project-answer-save | `apps/web/features/projects/components/project-answer-save.ts` | Context and file name 'Answer from <title>.md' |
| component | WebChatPage project answer save | `apps/web/features/chat/pages/WebChatPage.tsx` | Builds the save function; org share write rule (6156-6172) |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | List, upload, reindex, remove knowledge files |
| endpoint | knowledge-files routes | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Register and list files (plus [fileId], reindex, text, refresh, origins, google-drive) |
| service | cloud contract project-knowledge | `packages/contracts/cloud-contracts/src/project-knowledge.ts` | Paths and schemas for knowledge files |
| table | user_projects | `apps/web/db/neon/0006_projects.sql` | Projects table (queried in conversations/route.ts:233) |
| table | project_knowledge_files | `apps/web/db/neon/0035_project_knowledge_file_lifecycle.sql` | Knowledge files (read in project-context-service.ts:222) |
| component | ProjectNotebookScreen (mobile) | `apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx` | Notebook screen: sources, search, reindex, outputs |
| service | notebook service (mobile) | `apps/mobile/src/features/notebook/service.ts` | List sources, reindex, start Studio output |
| service | project-studio | `packages/contracts/cloud-contracts/src/project-studio.ts` | Eleven output prompts with grounding rule |
| store | chatExecutionStore (mobile) | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends projectId with a turn (2757, 2892) |
| component | share-preview (mobile) | `apps/mobile/src/features/share-preview/index.tsx` | Shared page link staged or summarized; not saved to a Project |
| command | useProjectInChat | `apps/extension-vscode/src/features/projects/projectActions.ts` | VS Code command to use a Project in chat (line 35) |
| service | CLI cloud turns project read | `apps/cli/src/app_server/cloud_turns.rs` | Reads the Project for a project conversation (777-795) |
| component | Chrome side panel active project | `apps/extension/src/side_panel.ts` | Active Project selection bound to the chat (912, 1823) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a Project in the composer; the client sends projectId when creating the chat. | device | ChatComposerNew.tsx:2780-2810, 3046 |
| Server validates the Project is owned, in the same workspace, not archived, not deleted; refuses if the chat is temporary. | our servers | apps/web/app/api/chat/conversations/route.ts:229-242 |
| On each turn the server loads instructions, up to a fixed number of knowledge files and sibling chat excerpts within character budgets, and fits them into the prompt. | our servers | project-context-service.ts:79-99, 188-366; request-processor.ts:3853-3892 |
| If the Project has knowledge files the file search tool is offered to a tool-capable model on streaming web chat. | our servers | request-processor.ts:1154-1182 |
| The model answers with source citations. | outside service | projectSources citations carried on the turn (request-processor.ts:1566-1570, 3881); which model provider is chosen by routing |
| Person chooses 'Save to project'; the client wraps the answer text in a Markdown file and uploads it through the knowledge client. | device and our servers | WebChatPage.tsx:6162-6168; project-knowledge-upload.ts:50-61; route knowledge-files/route.ts |
| The server registers the file, extracts text and indexes it. | our servers | 0064_project_knowledge_extraction.sql; knowledge-files/[fileId]/reindex route; indexing state at route.ts:54-62 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project instructions, description | Table user_projects | Yes; also mobile project sync routes (app/api/projects/sync) | Archive and soft delete flags (is_archived, deleted_at) used in queries |
| Knowledge files and extracted text, index state | Table project_knowledge_files and file storage | Server data; mobile reads through the knowledge list path | Remove route; versions in 0098_project_knowledge_versions.sql; retention period unknown |
| Saved answer file | Same as a knowledge file; name 'Answer from <title>.md', type text/markdown | Server data | Removable from the knowledge panel |
| Chat to Project link | web_conversations.project_id (read at request-processor.ts:3811) | Yes | With the chat |

**Models and providers.** Grounding is done by putting Project text into the prompt for whichever chat model routing selects; retrieval for large files uses a file search tool. Embedding or index provider: unknown (not read).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in cloud account for every app; the CLI needs an account link for a Project (lib.rs:4297-4300 message). |
| Permissions | Owner of the Project and same workspace (conversations/route.ts:233-238); org shared Project needs write access to save (WebChatPage.tsx:6157-6159); shared Project knowledge read-only rule in migration 0090. |
| Subscription | Capability 'projects' is on every cloud chat plan from free upward (billing-catalog.ts:314, 352). Number of knowledge files per Project limited by MAX_PROJECT_KNOWLEDGE_FILES (project-context-service.ts:79). Free usage screens show only Upgrade (memory note; not rechecked in code). |
| Limits and metering | Context caps: file content 16,000 characters each, 48,000 total, sibling chats 15 with 1,600 characters, total budget MAX_PROJECT_CONTEXT_CHARS (project-context-service.ts:79-99). Storage meter read when registering files (knowledge-files/route.ts:8). Rate limit applied (route.ts:3). |
| Feature flags | none found in the code for web Projects. |
| Model compatibility | File search tool needs a tool-capable model and streaming (request-processor.ts:1154-1170); projects without tool support still get the loaded context text [inferred]. |
| Provider restrictions | none found in the code. Google Drive source route exists (knowledge-files/google-drive). |
| Local mode | Mobile Local mode: cloud Projects are an account feature; whether Local chats can use a Project: not established. Web has no Local mode. The product rule says nothing may silently move a Local chat to cloud (AGENTS.md section 6); saving or attaching must therefore be explicit [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Project missing or archived at attach | 404 'Project not found' | conversations/route.ts:229-242 |
| Project archived during later turns | Turn refused: 'This project is archived, deleted, or unavailable. Remove the conversation from the project or restore the project before retrying.' code project_context_unavailable | request-processor.ts:3864-3874 |
| Context load error | 'Project context could not be loaded. No unscoped response was generated; retry...' code project_context_load_failed | request-processor.ts:1785-1795 |
| Save to project in progress | Item disabled and text 'Saving to project…' | MessageBubble.tsx:4026-4034 |
| Save fails | Toast 'That answer could not be saved to the project' | MessageBubble.tsx:1153-1155 |
| Source still reading | Status text per file; 'Read again' action | ProjectNotebookScreen.tsx:262-273; service.ts:44-53 |
| No sources on phone | 'Add a source to this project first.' | ProjectNotebookScreen.tsx:179 |
| Offline, retry, cancel | not established for Save to project | not read |
| Phone shared text too long | Truncated to 100 KB with notice | share-preview/index.tsx:46-52 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/services/project-knowledge-upload.test.ts`: Knowledge upload client (by file name) [inferred]
- `apps/web/features/projects/components/KnowledgeFilesPanel.indexing.test.tsx`: Indexing state in the panel (by file name) [inferred]
- `apps/web/features/projects/components/AddSourcesModal.test.tsx`: Add sources dialog (by file name) [inferred]
- `apps/web/features/chat/components/artifacts/ArtifactPreview.forkAndProjectSave.test.tsx`: Fork and project save from an artifact (by file name) [inferred]
- `apps/mobile/src/features/notebook/__tests__/ProjectNotebook.test.tsx`: Mobile notebook screen (by file name) [inferred]
- `apps/mobile/__tests__/NewChatProjectRoundTrip.test.tsx`: New chat in a Project round trip (by file name) [inferred]
- `apps/mobile/__tests__/missing-cloud-project.test.ts`: Missing cloud project handling (by file name) [inferred]

**Test scenarios**

- **Grounded answer**
  1. Create a Project, upload a PDF with a distinct fact
  2. Start a chat in it and ask about the fact
  - Expected: Answer states the fact and cites the file.
- **Save an answer**
  1. In a Project chat open an answer menu
  2. Choose 'Save to project'
  3. Open the Project's knowledge list
  4. Start a new chat in the Project and ask about the saved answer
  - Expected: File 'Answer from <title>.md' listed; new chat uses it.
- **Refusals**
  1. Try a temporary chat with a Project
  2. Archive the Project then continue an old chat
  - Expected: Temporary refused; archived Project blocks the turn with the stated message.
- **Read-only share**
  1. Open a Project shared read-only
  - Expected: No 'Save to project' item.
- **Phone notebook**
  1. Open a Project notebook on the phone
  2. Tap 'Briefing doc'
  - Expected: A new chat in the Project starts and answers from its sources only.
- **Page save absent**
  1. Look for a save-page control in Chrome, phone share sheet, CLI
  - Expected: None exists; phone share offers summarize or stage only.

**Where to look when it fails**

- Log 'Failed to validate conversation project' and 'Project context load failed'
- Error codes project_context_unavailable, project_context_load_failed
- Tables user_projects, project_knowledge_files, web_conversations.project_id

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)
- VS Code: [70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md)
- Chrome: [70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Browser page to Project source is not built** Affects: All six apps. Evidence: No code; brief S110.09 missing; share-preview/index.tsx:49 only summarizes. Work needed: Design capture, add per-app control, store as knowledge file
- **Save to Project missing on mobile, CLI, VS Code, Chrome** Affects: Those apps. Evidence: Only web save found (WebChatPage.tsx:6156-6172). Work needed: Add the action per app; brief says desktop done through web
- **Whole chat save not found** Affects: Web. Evidence: Only answer save found. Work needed: Decide and build
- **Brief grounding cite is wrong** Affects: Docs. Evidence: request-processor.ts:2548 is not grounding. Work needed: Point to 3853-3892
- **Attach status on CLI, VS Code, Chrome taken from the brief only** Affects: CLI, VS Code, Chrome. Evidence: Brief cites chat.rs:777 and chatExecutionStore.ts:2219 which are unrelated; real code found elsewhere. Work needed: Read and test each app attach flow
- **Empty, waiting and failure states and offline behaviour not established** Affects: All. Evidence: Not found. Work needed: Define and test

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- plan:free
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- table:user_projects
- table:project_knowledge_files

## Unknown

- How CLI, VS Code and Chrome attach a Project and whether they ground answers the same way
- Whether Local-mode chats on mobile or desktop can use Projects
- Retention of saved answers and indexed text
- Which embedding or index service the knowledge indexing uses
- Whether desktop shows the same Save to project as web
- Plan limits on number and size of knowledge files beyond the constant name
