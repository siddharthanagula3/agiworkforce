---
id: "F037-08"
type: "feature"
title: "Source-grounded chat and citation links"
aliases: ["Source-grounded chat", "Notebook chat", "Project chat with knowledge", "Citation chips", "Project file citation", "Notebook-to-main-chat handoff", "S37.14", "S37.19", "S37.37"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S37.14", "S37.19", "S37.37"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-sync-and-continuity", "F037-07", "F037-09", "table:project_knowledge_files"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-08 Source-grounded chat and citation links

Chats filed under a notebook (project) get its instructions, source text and recent sibling chats added to the model's context, with caps. Answers can show citation chips naming a file and page; on Web and Mobile a chip opens that file at that page. A chat can be started inside a notebook or bound to one from the main chat.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.14](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3714), [S37.19](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3719), [S37.37](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3737).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Adds the notebook's instructions, source contents and related chats to each turn of a chat that belongs to the notebook, returns file citations with the answer, and opens the cited file when a chip is clicked.

**Why it exists.** The area brief requires chats in a notebook to answer from its sources, citations to open the source, and the main chat to be able to use a notebook (S37.14, S37.19, S37.37).

**Who uses it.** A signed-in person with a notebook, on Web, Desktop (hosted web), Mobile, CLI and the Chrome extension; the VS Code extension manages projects but its chat link was not established.

**Problems it solves**

- Answers ignore the person's own documents.
- The person cannot check where a claim came from.
- A chat started outside the notebook cannot use its files.

**Use cases**

- Ask a notebook chat to compare two uploaded reports and click the page chip to check one figure.
- Start a chat from the main composer with a notebook selected so the instructions apply.
- Run a CLI turn linked to a project and use its knowledge files.

## 2. User experience

**Where to find it**

- Web and Desktop: notebook page, Chats tab, composer; the first message is handed off through browser session storage to a new project chat (apps/web/app/chat/projects/[id]/page.tsx:235-262; apps/web/features/projects/lib/project-chat-handoff.ts:126-129).
- Web and Desktop: citation chips under an answer (apps/web/features/chat/components/messages/MessageBubble.tsx:3577; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:35-60).
- Web: main chat project binding, a project chosen for the conversation (apps/web/features/chat/pages/WebChatPage.tsx; exact control not opened, see unknowns).
- Mobile: project selector bar in chat and chip row under answers (apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx; ProjectFileCitations.tsx).
- CLI: 'agi projects link' binds the working folder to an account project (apps/cli/src/lib.rs:3840-3850), managed turns then use its instructions and knowledge files.
- Chrome: side panel conversation carries a project id (apps/extension/src/side_panel.ts:9012-9022).

**Before you start**

- Signed in; the project exists, is not archived or deleted.
- A source must be indexed or have extracted text to be quoted.
- CLI: Managed mode (Cloud) and a linked project (apps/cli/src/agent/chat.rs:875-880).
- Mobile: Cloud mode for the notebook screen.

**Screens and controls**

- Composer with project scope; citation chip as a link with label 'Project file <name>, <location>' (ProjectFileCitationChip.tsx:38-40).
- Sources tab opened by the link, with the cited file previewed at the page (SourcesPanel.tsx:153-171).

**Journey**

1. Open a notebook, or pick it for a main-chat conversation.
2. Type a question and send.
3. The server loads the project, selects the files and passages most relevant to the question and builds the context.
4. The model answers; the server returns the list of cited file passages.
5. The answer shows chips; click one.
6. Web opens the notebook page with ?knowledgeFile=<id>&page=<n>, lands on the Sources tab and opens the file preview at that page.

**What the person sees and gets**

- Answer text plus chips naming file and location.
- If project context cannot load, an error: 'Project context could not be loaded. No unscoped response was generated; retry when project sources are available.' (request-processor.ts:1785-1799).
- If the project is archived or deleted: 'This project is archived, deleted, or unavailable...' (request-processor.ts:~3865).
- CLI notice when the chat cannot be filed: 'This turn runs without your project's knowledge files...' (apps/cli/src/agent/chat.rs:889).

**Settings**

- Project instructions and description in the project settings dialog (ProjectSettingsDialog.tsx).
- Project default model and chat defaults fields exist (ProjectDefaultModelField.tsx, ProjectChatDefaultsField.tsx); their effect on grounding was not traced.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: server loads project context for a conversation with a project id and renders instructions, files and sibling chats into system blocks (request-processor.ts:3854-3882; project-context-service.ts:188,585).
- Web/Desktop: citations are produced with the blocks so chips match what the prompt carried (project-context-service.ts:575-585 comment, 585).
- Web/Desktop: chip links open the cited file and page (project-file-citations.ts:138-148; SourcesPanel.tsx:153-171).
- Web: a new chat from the notebook page is handed off with the project id (page.tsx:235-262).
- Mobile: citation chips with a route that carries the file and page (ProjectFileCitations.tsx) and a test that the project screen opens the cited file at the page (ProjectCitationDeepLink.test.tsx:125).
- CLI: a conversation is filed under the linked project so the server loads its knowledge (apps/cli/src/agent/chat.rs:875-894, 1455).

**Incomplete**

- Chrome: the side panel stores a project id per conversation and syncs it (conversationSync.ts:466,481) but the code that makes the server ground an answer was not traced.
- VS Code: projects are listed and knowledge file names shown (projectActions.ts:100-110); a grounded chat from VS Code was not found.

**Present but disconnected or switched off**

- Mobile cross-app sync is flagged off per the brief (S37.38 Unfinished: flag-off).

**Not available**

- Source checkboxes to choose which sources ground a turn: missing on all apps (brief S37.05).
- Citation links on CLI, VS Code, Chrome: not found.

## 4. Required behaviour

**Established requirements**

- Chats in the notebook answer from its sources. (source: brief S37.14)
- A citation links to the cited source passage and opens it there. (source: brief S37.19)
- From the main chat the user can bring a notebook's context into the conversation. (source: brief S37.37)
- The notebook has instructions that apply to every chat in it. (source: brief S37.15)
- Nothing may silently route a Local chat, file or session to BYOK or managed cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A question answered from an uploaded file names that file in a chip.
2. Clicking a chip opens the notebook Sources tab with that file previewed at the cited page.
3. Instructions set on the notebook change replies in a new chat in it.
4. With a project that cannot load, the turn is refused with a retryable error and no ungrounded answer is produced.
5. More than 40 files are never accepted into one notebook; context stays within the caps.
6. A read-only shared member can chat but not edit sources.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Grounded' means included in the prompt, not that the model is forced to quote; the prompt tells the model to cite and say where sources do not cover (ProjectStudio.tsx:31-32 for Studio prompts; locator notices at project-context-service.ts:~690-700).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Source checkboxes so a turn can use a chosen subset.
- [proposed] Citation chips on CLI and the Chrome side panel.
- [proposed] Update the brief: the draft claim that a failed project load runs the turn without it is wrong for Web (it refuses).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Loads project, files and sibling chats; ranks files; renders blocks and citations; caps |
| endpoint | chat completions request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads project context per turn, fits blocks, returns sources; 409 and 503 refusals |
| service | turn-context-service | `apps/web/lib/services/turn-context-service.ts` | Project, memory and past-chat context for turns; returns project_unavailable or project_load_failed |
| service | free-quota-turn | `apps/web/lib/server/free-quota-turn.ts` | Turns those statuses into policy refusals for the free offering |
| config | project-file-citations | `packages/contracts/types/src/project-file-citations.ts` | Citation type, anchors, link builder with knowledgeFile and page parameters |
| component | ProjectFileCitationChip | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | Shared chip and chip row |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Renders citation chips under an answer |
| component | SourcesPanel | `apps/web/features/projects/components/SourcesPanel.tsx` | Opens the cited file and page from the URL |
| screen | Project page | `apps/web/app/chat/projects/[id]/page.tsx` | Chats tab, project send handoff, opens Sources tab for a cited link |
| service | project-chat-handoff | `apps/web/features/projects/lib/project-chat-handoff.ts` | Stores the first message and project id in session storage and builds the new chat link |
| component | ProjectFileCitations (mobile) | `apps/mobile/src/features/chat/components/ProjectFileCitations.tsx` | Mobile chips that route to the project and file |
| component | ProjectSelectorBar | `apps/mobile/src/features/chat/components/ProjectSelectorBar.tsx` | Pick a project for a mobile chat |
| store | chatExecutionStore (mobile) | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends the active project id with each turn (lines 2757, 2892, 2968) |
| command | agi projects link / add-file | `apps/cli/src/lib.rs` | Link a folder to a project and add files (lines 1327-1335, 3800-3850) |
| service | CLI project_conversation | `apps/cli/src/agent/chat.rs` | Files the hosted conversation under the project; notice on failure (875-894) |
| service | extension conversationSync | `apps/extension/src/features/cloud-bridge/conversationSync.ts` | Syncs the project id of a side panel conversation |
| test | project-context-service tests | `apps/web/lib/services/__tests__/project-context-service.test.ts` | Context rendering |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The composer sends the message with the project id; the web page stores a handoff and opens a new chat bound to the project. | device | page.tsx:235-262; project-chat-handoff.ts:126-129 |
| The chat request reaches the completions route; the server reads the conversation, finds its project id. | our servers | request-processor.ts:3854 |
| The server loads the project (not archived or deleted), picks up to 40 files, ranks them by the question and selects passages inside a total budget, plus up to 15 related chats. | our servers | project-context-service.ts:79-86,188-230,400-420 |
| Blocks are fitted to a total cap and the citations list is kept in step. | our servers | request-processor.ts:3879-3881; project-context-service.ts:585 |
| If loading fails the turn is refused with 503, if the project is gone with 409. | our servers | request-processor.ts:3858-3875,1785-1799 |
| The model call is made through the chosen provider with the project text in the system context; the file text is marked as untrusted reference data. | outside service | project-context-service.ts:~680-690 (fence text 'untrusted reference data') |
| The answer and citations return; the client renders chips; a click navigates to the project page with the file and page parameters. | device and our servers | project-file-citations.ts:138-148; SourcesPanel.tsx:153-171 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation with project id | server conversation tables; Mobile and CLI keep local caches that sync | Yes through cloud conversation sync (apps/extension conversationSync.ts:466; CLI cloud/mod.rs) | unknown |
| Handoff of first message | browser sessionStorage | No | Acknowledged handoff ids kept in memory; cleared with the tab (project-chat-handoff.ts:118-120) |
| Context manifest of what was used | context manifest store, written for non-temporary chats | Server-side | unknown (turn-context-service.ts:~200 writes it) |

**Models and providers.** The model is whichever the person or route picks; the project text is added regardless of provider. No provider is excluded in the project loader. Provider folder names were not mapped, so no provider: relationship is given.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the conversation must be owned by the user (request-processor.ts ownedRows). |
| Permissions | Owner, or a member of an organisation share; editors can change sources, viewers cannot (page.tsx:160). |
| Subscription | Each grounded turn is an ordinary chat turn under the plan's chat rules; the notebook adds no separate fee in the code read. File storage cap is per plan (billing-catalog.ts:527; file-storage.ts:53-60). |
| Limits and metering | 40 files per project; 16,000 characters per file and 48,000 in total; 15 related chats and 16,000 characters (project-context-service.ts:79-86). Usage metering of the turn itself: not traced. |
| Feature flags | Not found for grounding. Mobile project sync: flag-off per brief S37.38. |
| Model compatibility | No model restriction in the loader; models without enough context may drop blocks (fitProjectContextBlocks, project-context-service.ts:~558). |
| Provider restrictions | none found in the code read. |
| Local mode | Project knowledge is stored on our servers, so a Local chat has no notebook grounding. CLI refuses unless Managed (chat.rs:875-877 returns None for other privacy modes). Mobile notebook gate requires Cloud mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Project cannot be loaded | Web refuses with 503 and no answer; CLI files no conversation and prints a notice, running the turn without files | request-processor.ts:1785-1799; chat.rs:886-891 |
| Project archived or deleted | 409 'archived, deleted, or unavailable' | request-processor.ts:3861-3877 |
| Files do not fit | Model is told which files were left out so it says so | project-context-service.ts:~670-680 |
| File has no extractable text | Only its name is sent, and the model is told | project-knowledge-files.ts:164-169; project-context-service.ts:~690 |
| Chip with no file id | Rendered as a non-link note | ProjectFileCitationChip.tsx:55-59 |
| Cited file no longer in list | Nothing opens; no error found | SourcesPanel.tsx:165-166 |
| Link opened twice | Preview opens once per page load | SourcesPanel.tsx:104,167 |
| Handoff storage fails | Toast 'Could not open the project chat. Your draft is still here.' | page.tsx:~258-262 |
| Offline | not handled in the code read for grounding | no offline branch found in project-context-service.ts or request-processor.ts project block |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/project-context-service.test.ts`: Project context rendering
- `apps/web/lib/services/__tests__/project-context-knowledge-relevance.test.ts`: File relevance selection
- `apps/web/lib/services/__tests__/project-context-boundary.test.ts`: Project context boundary rules
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.project-precedence.test.ts`: Project context in the chat route
- `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.test.tsx`: Chip rendering
- `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts`: Citation link building
- `apps/mobile/src/features/projects/__tests__/ProjectCitationDeepLink.test.tsx`: Mobile project screen opens the cited file at the page
- `apps/web/e2e/project-knowledge-retrieval.spec.ts`: Exists; contents not read

**Test scenarios**

- **Grounded answer with chip**
  1. Upload a PDF with a known fact on page 3 to a notebook.
  2. Ask for that fact in a new notebook chat.
  - Expected: Answer states the fact; a chip names the file and page 3.
- **Open the cited place**
  1. Click the chip.
  - Expected: Notebook page opens on Sources, preview shows the file at page 3.
- **Instructions apply**
  1. Set an instruction such as 'answer in two lines'.
  2. Start a new chat in the notebook.
  - Expected: Replies follow it.
- **Main chat binding**
  1. From the main chat pick the notebook.
  2. Ask about a source.
  - Expected: Answer uses the source; the conversation appears under the notebook.
- **Project unavailable**
  1. Archive the notebook.
  2. Send in an old chat of it.
  - Expected: Error saying the project is archived, deleted or unavailable; no answer.
- **CLI link**
  1. Run agi projects link.
  2. Ask about a file in Managed mode.
  - Expected: Answer uses the file; if filing fails a notice says the turn ran without files.

**Where to look when it fails**

- Log 'Project context load failed' (request-processor.ts:3898); 'Project context could not be loaded; no model request was sent' (turn-context-service.ts:368).
- Error codes project_context_unavailable, project_context_load_failed.
- Context manifest rows for what was injected.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)
- CLI: [70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md)
- VS Code: [70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/vscode/037-notebook-and-knowledge-workspace-product.md)
- Chrome: [70-qa/test-plans/chrome/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/chrome/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **No source selection** Affects: All apps. Evidence: brief S37.05 missing. Work needed: Selection state, API field and prompt filter.
- **Citation links missing outside Web, Desktop, Mobile** Affects: CLI, VS Code, Chrome. Evidence: brief S37.19; no chip code in those apps found. Work needed: Render chips or text locations and a way to open the source.
- **Chrome and VS Code grounding not confirmed** Affects: Chrome, VS Code. Evidence: side_panel.ts:9012-9022 carries id only; projectActions.ts lists names only. Work needed: Trace and test the full path.
- **Draft claimed failures run without the project** Affects: Documentation. Evidence: request-processor.ts:1785-1799. Work needed: Correct the brief.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-sync-and-continuity
- F037-07
- F037-09
- table:project_knowledge_files

## Unknown

- The exact control that binds a notebook in the Web main chat (WebChatPage.tsx:3867 and ChatComposerNew.tsx:2213 were cited by the brief, not opened).
- Whether the Chrome side panel's cloud turn is grounded server-side from the project id.
- VS Code chat participant use of projects (chatParticipant.ts mentions knowledge, not opened).
- How project default model and chat defaults interact with grounding.
- Retention of context manifests.
