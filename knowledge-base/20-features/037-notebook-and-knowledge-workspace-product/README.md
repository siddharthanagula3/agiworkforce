---
id: "AREA-037"
type: "area"
title: "Notebook and knowledge-workspace product"
features: ["F037-01", "F037-02", "F037-03", "F037-04", "F037-05", "F037-06", "F037-07", "F037-08", "F037-09", "F037-10", "F037-11", "F037-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 37. Notebook and knowledge-workspace product

A notebook is a named workspace that holds the user's own sources (uploaded files, typed notes) and its own instructions. Chats inside it answer from those sources, and the user can click a citation to see the cited place. Studio buttons turn the sources into a briefing, study guide, FAQ, timeline, mind map, table or slide deck in one click. It matters because the answers stay tied to the user's own material, with a visible trail back to where each point came from.

**Who uses it.** Any signed-in account user, as the code shows: the project routes are scoped to the user, to the user's organization, and to projects shared with them (apps/web/lib/server/project-knowledge-files.ts:221-245). Adding sources needs an owner or an editor role (project-knowledge-files.ts:221-245; ProjectSharingControls.tsx:43-70). Viewers see sources and notes read-only (apps/web/app/chat/projects/[id]/page.tsx:1330). Paid plans affect file size and storage limits (project-knowledge-files.ts:255-263, plan tier from resolveFileStorageAllowance). Workspace admins are not singled out in the code I read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F037-01](F037-01-notebook-list-and-creation.md) | Notebook list and creation | built | built | built | built | built | partly |
| [F037-02](F037-02-title-description-and-instructions.md) | Title, description and instructions | built | built | built | built | built | no |
| [F037-03](F037-03-sharing-and-cross-app-sync.md) | Sharing and cross-app sync | built | built | partly | partly | no | no |
| [F037-04](F037-04-source-list-search-and-source-rail.md) | Source list, search and source rail | partly | partly | partly | partly | partly | no |
| [F037-05](F037-05-add-files-and-text-sources.md) | Add files and text sources | built | built | partly | built | n/a | no |
| [F037-06](F037-06-website-video-audio-and-connected-documents.md) | Website, video, audio and connected documents | partly | partly | no | no | no | no |
| [F037-07](F037-07-source-guide-and-refresh.md) | Source guide and refresh | partly | partly | partly | no | no | no |
| [F037-08](F037-08-source-grounded-chat-and-citation-links.md) | Source-grounded chat and citation links | built | built | partly | partly | partly | partly |
| [F037-09](F037-09-notebook-notes.md) | Notebook notes | partly | partly | no | no | no | no |
| [F037-10](F037-10-studio-one-click-outputs.md) | Studio one-click outputs | partly | partly | partly | no | no | no |
| [F037-11](F037-11-audio-video-quiz-flashcards-and-learning-overview.md) | Audio, video, quiz, flashcards and learning overview | partly | partly | partly | no | no | no |
| [F037-12](F037-12-notebook-allowance-storage-and-export.md) | Notebook allowance, storage and export | partly | partly | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md).

## How this area works in the code

1. **Sources tab on the web.** The project page shows the Sources tab. It renders the Studio row, the notes panel and the sources list. Viewers get it read-only. (`apps/web/app/chat/projects/[id]/page.tsx:1318-1340`, `apps/web/features/projects/components/ProjectStudio.tsx:117`)
2. **Choose and add a source.** Add sources opens a modal. It offers Text input, a file picker limited to allowed types, and a Google Drive card. The Drive card shows Coming soon while connectors are not released. (`apps/web/features/projects/components/AddSourcesModal.tsx:295`, `apps/web/features/projects/components/AddSourcesModal.tsx:298-320`, `apps/web/features/projects/components/AddSourcesModal.tsx:34`, `packages/contracts/types/src/chat.ts:121`)
3. **Register the source on the server.** The POST route checks the body against the shared register schema, then registers the file. The route is scoped to the user and the organization. (`apps/web/app/api/projects/[id]/knowledge-files/route.ts:68-106`, `apps/web/lib/server/project-knowledge-files.ts:299`)
4. **Check limits before saving.** The capacity check refuses archived projects, adds past 40 files without a same-name replacement, duplicate checksums, files over the plan size, and no storage left. It also checks that the user may add sources. (`apps/web/lib/server/project-knowledge-files.ts:187-270`, `packages/contracts/types/src/suite-contracts.ts:502`)
5. **Index and extract text.** After save, the server extracts text and records index states. The panel polls the index state while indexing runs and offers a retry for failed files. (`apps/web/lib/server/project-knowledge-files.ts:93`, `apps/web/lib/server/project-knowledge-files.ts:361`, `apps/web/features/projects/components/KnowledgeFilesPanel.tsx:107-139`)
6. **List sources.** The GET route returns the project's live files (not deleted, not superseded), their index states and the storage meter. (`apps/web/app/api/projects/[id]/knowledge-files/route.ts:23-66`)
7. **Ground a chat turn.** When a chat belongs to a project, the turn loads the project row and up to 40 files, then renders them as capped system-context blocks with citations. (`apps/web/lib/services/turn-context-service.ts:105`, `apps/web/lib/services/turn-context-service.ts:357`, `apps/web/lib/services/project-context-service.ts:188-240`, `apps/web/lib/services/project-context-service.ts:585`)
8. **Studio one-click output.** A Studio button sends a fixed prompt into a new chat in the project. No output is stored outside the chat. (`apps/web/features/projects/components/ProjectStudio.tsx:37`, `apps/web/app/chat/projects/[id]/page.tsx:230-240`, `apps/web/app/chat/projects/[id]/page.tsx:1321-1328`)
9. **Citations and notes.** A citation URL carries a cite parameter that opens the cited page. Notes are saved as the Notes.md source file. (`apps/web/features/projects/components/SourcesPanel.tsx:154-163`, `apps/web/features/projects/components/ProjectNotes.tsx:14`, `apps/web/features/projects/components/ProjectNotes.tsx:119`)
10. **Mobile source flow.** Mobile decides whether a project is local or cloud, then picks files with the document picker and adds each one through the cloud source client. (`apps/mobile/src/features/projects/store.ts:133-140`, `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:288`, `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:523-560`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Web API: lists a project's sources (GET) and registers a new one (POST), with the user and organization scope. |
| `apps/web/lib/server/project-knowledge-files.ts` | Server rules for sources: access checks, the 40-file cap, duplicate checks, plan size, storage, registration and index states. |
| `apps/web/lib/services/project-context-service.ts` | Loads a project's instructions and source text for chat and renders it as capped context blocks with citations. |
| `apps/web/lib/services/turn-context-service.ts` | Decides the context for a chat turn and calls the project loader. |
| `apps/web/features/projects/components/AddSourcesModal.tsx` | The add-source dialog: text input, file picker, and the Drive card (Coming soon while not released). |
| `apps/web/features/projects/components/ProjectStudio.tsx` | The Studio row of one-click prompts (briefing, study guide, FAQ, timeline, mind map, table, quiz, flashcards, infographic, slide deck). |
| `apps/web/features/projects/components/SourcesPanel.tsx` | The source list with type filter, name-or-summary search, sort, and the citation URL handling. |
| `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Lists files with index status, polls while indexing, and offers Retry indexing and delete. |
| `apps/web/features/projects/components/ProjectNotes.tsx` | The single editable Notes.md source. |
| `apps/mobile/src/features/projects/store.ts` | Mobile project store: decides local versus cloud target for a project. |
| `apps/cli/src/lib.rs` | CLI project commands: list, create, show, edit, link, add-file, delete, archive. |
| `packages/contracts/types/src/connector-release.ts` | Connector release state: Google Drive and other connectors are coming_soon unless listed as released. |

## What is stored

- Projects: name, description, instructions, archive and delete flags, owner user id and organization id: Database table user_projects (apps/web/lib/services/project-context-service.ts:188-205; apps/web/lib/server/project-knowledge-files.ts:221-232)
- Sources: file name, type, size, checksum, summary, extracted text, extracted anchors, version and superseded/deleted flags: Database table project_knowledge_files (apps/web/lib/server/project-knowledge-files.ts:394-411; apps/web/app/api/projects/[id]/knowledge-files/route.ts:37-47; apps/web/lib/services/project-context-service.ts:203-215)
- Uploaded file bytes: Object storage, referenced by storage_uri; failed deletes are queued for retry (apps/web/lib/server/project-knowledge-files.ts:139)
- Source index states: Read through readIndexStates; the table name was not traced (apps/web/lib/server/project-knowledge-files.ts:93)
- Notes: A project_knowledge_files row named Notes.md (apps/web/features/projects/components/ProjectNotes.tsx:14, 119)
- Chat-to-project handoff: Browser sessionStorage (apps/web/app/chat/projects/[id]/page.tsx:235)
- Extension active project and project name cache: Browser storage keys agi_active_project and agi_project_names (apps/extension/src/side_panel.ts:544-545); which storage type was not confirmed
- Mobile local projects: Device store in apps/mobile/src/features/projects/store.ts; persistence was not traced
- CLI directory link to a project: Set by the link command (apps/cli/src/lib.rs:1322-1325); the storage file was not traced

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Connector release state**: Set to coming_soon, so the Google Drive card in the Add sources modal shows Coming soon. Only connectors listed as selectively released (none of them is Google Drive) are allowed. (packages/contracts/types/src/connector-release.ts:14 and :16; read by apps/web/features/projects/components/AddSourcesModal.tsx:34)
- **GOOGLE_PICKER_API_KEY and GOOGLE_PICKER_APP_ID**: Both are needed for the Google Drive picker to work. Missing values stop the picker. (apps/web/app/api/connectors/google-drive/picker/route.ts:23-24 (read from process.env))
- **Maximum sources per notebook**: 40 files. Adding past it gives a conflict error. (packages/contracts/types/src/suite-contracts.ts:502; used in apps/web/lib/server/project-knowledge-files.ts and apps/web/lib/services/project-context-service.ts:79)
- **Plan size and storage**: Per-plan file size limit and storage availability are checked before saving a source. (apps/web/lib/server/project-knowledge-files.ts:255-267 (resolveFileStorageAllowance, attachmentSizeRefusal, assertFileStorageAvailable))
- **Allowed file types**: Limits which files the picker accepts. (packages/contracts/types/src/chat.ts:121 (ALLOWED_ATTACHMENT_ACCEPT); used in apps/web/features/projects/components/KnowledgeFilesPanel.tsx:283 and SourcesPanel.tsx:822)
- **Context size cap**: Caps the characters of project context sent with a chat turn. (apps/web/lib/services/project-context-service.ts:93 (MAX_PROJECT_CONTEXT_CHARS))
- **Project chat-with-knowledge on a turn**: Off when the project cannot be loaded for the turn. (apps/web/lib/services/turn-context-service.ts:357)
- **Project role write access**: Decides whether a shared user can add sources (editor) or only view. (apps/web/lib/server/project-knowledge-files.ts:221-245 (resolveProjectWriteAccess))

## Shared between apps

Shared: the server source rules and routes in apps/web/lib/server and apps/web/app/api/projects (used by web and the desktop, which shows the hosted web app). Shared contracts in packages/contracts/types (suite-contracts.ts:502, chat.ts:121, connector-release.ts) and the register schema imported from @agiworkforce/cloud-contracts (knowledge-files/route.ts). The web feature components are in apps/web/features/projects/components. The brief names packages/ui/unified-chat/src/components/ProjectGallery.tsx as the shared notebook list; I did not open it. Separate per app: the mobile store and components (apps/mobile/src/features/projects), the CLI Rust commands (apps/cli/src/lib.rs), the VS Code tree and client (apps/extension-vscode/src/features/projects), and the Chrome side panel (apps/extension/src/side_panel.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says quiz, flashcards, infographic and learning overview are missing on web, but the Studio row has buttons and prompts for them. (apps/web/features/projects/components/ProjectStudio.tsx:81, :88, :102 (and the learning overview entry between them))
- Brief says notes (S37.17, S37.18) are not applicable or missing, but a notes editor saving Notes.md exists on web. (apps/web/features/projects/components/ProjectNotes.tsx:14, :47, :119; apps/web/app/chat/projects/[id]/page.tsx:1330)
- Brief says source search (S37.13) is missing on web, but a search box with name and summary matching exists. (apps/web/features/projects/components/SourcesPanel.tsx:637-643, :667-668)
- Brief says Google Drive is partial on web because of the picker, but the Drive card is hard-coded to Coming soon because the connector is not released and Google is not in the released list. (apps/web/features/projects/components/AddSourcesModal.tsx:34, :298-313, :527; packages/contracts/types/src/connector-release.ts:14)
- Brief points the grounded-chat code at request-processor.ts:2550, which is the provider web-search budget, not project grounding. Project grounding loads in the turn-context service. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2540-2565; apps/web/lib/services/turn-context-service.ts:357)
- Brief says the CLI cannot add files to a project, but the CLI has an add-file command. (apps/cli/src/lib.rs:1327-1331)
- Brief lists the saved-answer feature as not applicable, but a helper that saves a chat answer into a project exists and is used by the message bubble. (apps/web/features/projects/components/project-answer-save.ts:8-21; apps/web/features/chat/components/messages/MessageBubble.tsx)
- Studio is a row of buttons that open chats, not an output panel that lists generated outputs, so brief item S37.20 is not met in the form described. (apps/web/features/projects/components/ProjectStudio.tsx:117-124 (text says each opens a new chat))
- Project context is loaded only when the project belongs to the calling user; the query filters by user_id, so a shared project may not ground chats for a shared editor or viewer. Not confirmed, because the turn code may use another path. (apps/web/lib/services/project-context-service.ts:199-201)
- Studio asks for quiz, flashcard and infographic blocks, but the code I read does not show that the chat renders them as interactive pieces. (apps/web/features/projects/components/ProjectStudio.tsx:81-115)

## Not established

- The on-screen labels: the brief says 'Notebook'; the code and the UI strings I read say 'project'. I did not confirm what the web and mobile screens call it.
- Whether the Projects list in web, mobile, CLI, VS Code and Chrome shows an empty state and what it says.
- The exact sharing flow in mobile and the reason for the brief's 'flag-off' mark (I did not find a flag in apps/mobile/src/features/projects).
- How file bytes are uploaded and indexed end to end (apps/web/features/projects/services/project-knowledge-upload.ts was not opened).
- Whether the summary field is generated automatically and shown as a source guide.
- Whether a chat reply with a quiz, flashcard or infographic block is rendered as an interactive item.
- Chrome project support in full (I opened only the project binding and the project name cache in apps/extension/src/side_panel.ts).
- Mobile citation chips, the project selector in main chat, and the mobile chat grounding (brief paths not opened).
- Whether the CLI grounded chat uses the same project knowledge as web (apps/cli/src/agent/chat.rs:875-889 only partly read).
- Whether a shared viewer or editor is grounded in a shared project's sources (see things_that_look_wrong).
- The exact storage used by the extension for agi_active_project and agi_project_names.
- Whether any plan gate other than size, storage and file count limits Studio or notes.
- Notebook-specific allowance: not found anywhere in the code I read.
- No build, test or server was run. Everything here is from reading the files listed.
