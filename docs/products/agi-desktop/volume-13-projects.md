# AGI Desktop — Volume 13 — Projects

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real Desktop paths cited in the Repository map below — the V3 Projects panel, the project store, the chat-feature Projects UI, the Rust project/knowledge/RAG feature crate, and the Neon delta-sync route `apps/web/app/api/projects/sync/route.ts` with its desktop engine `apps/desktop/src-tauri/src/data/projects_sync.rs`.

## Overview & stance

A Project on AGI Desktop is a durable container grouping conversations, files, custom instructions, knowledge, and per-project settings for shared context across sessions. Desktop is the suite's **full-trust** surface — Local + BYOK + Managed Cloud, all selectable with correct visible labels — so Projects must be trust-aware end to end. A project's **content bytes stay on-device by default** (SQLite + local store); cross-device sync is **Managed-Cloud only** (`projects_sync.rs` gates the push mint on `app_mode = 'cloud'`), so Local and BYOK projects never acquire a `cloud_id` and are never pushed or pulled. Per-project trust defaults (`default_privacy_mode`, provider mode, allowed surfaces) are intentionally **excluded from sync**, and knowledge-file bytes stay out of the delta path. This volume specifies create, rename, delete, archive, instructions, files, knowledge, search, and workspace organization as built in the V3 shell and Rust host, flagging every gap as 🟡 or 🔭.

## Create

Creating a project mints a UUID, stamps `createdAt`/`updatedAt`, and persists to the Rust-backed SQLite store under Tauri (falling back to local persisted state in web/dev mode). ✅ Built — `apps/desktop/src/stores/projectStore.ts` (`createProject`) invokes the Tauri command `project_create` in `apps/desktop/src-tauri/src/sys/commands/projects.rs`. The mounted V3 panel offers a one-click "New Project" creating an untitled project inline. ✅ Built — `apps/desktop/src/features/v3/AgiWorkProjects.tsx`. New projects default to `isArchived: false`, empty file/conversation/knowledge lists, and no instructions. Creation must respect the active trust mode: a project carries no cross-mode defaults and is never auto-synced.

## Rename

Rename edits the project `name` (and, in the richer editor, description/instructions/color/emoji) and persists via `project_update`. ✅ Built (store + Rust) — `updateProject` in `projectStore.ts`; the full edit dialog is `apps/desktop/src/features/chat/ProjectEditDetailsDialog.tsx`. 🟡 Partial — the mounted V3 panel exposes create + list only; inline rename/edit lives in the chat-feature `ProjectsView.tsx` path, not the V3 surface. Converging rename into the V3 panel is the tracked gap. Rename must never change a project's trust posture or `cloud_id`.

## Delete

Delete removes the project, clears it as active if selected, and (for Managed-Cloud projects) propagates as a **tombstone** so the deletion reaches other devices. ✅ Built — `deleteProject` in `projectStore.ts` invokes `project_delete`; cloud tombstones are carried by `deleted_at` in `apps/web/app/api/projects/sync/route.ts` (pull includes rows with `deleted_at IS NOT NULL`). Requirements: deletion must be confirm-gated; Local/BYOK projects delete on-device with no network call; the conversation link (`conversationIds`) is dropped but chats are not force-deleted. 🟡 The V3 panel lacks a delete affordance today; delete UI lives in `ProjectsView.tsx`.

## Archive

Archive flips `isArchived` without deleting, moving the project out of the active list while preserving content; unarchive reverses it. ✅ Built — `archiveProject`/`unarchiveProject` in `projectStore.ts`; filter UI with `active | archived | all` tabs and `selectArchivedProjects`/`selectActiveProjects` selectors in `apps/desktop/src/features/chat/ProjectsView.tsx`. `is_archived` is carried by cloud delta-sync for Managed-Cloud projects. 🟡 The mounted V3 panel filters archived projects out of the grid but exposes no archive/unarchive control — that action requires the chat-feature view.

## Instructions

Each project carries free-text **custom instructions** injected as context for that project's chats, plus discovery of **on-folder instruction files** (AGENTS.md / CLAUDE.md-style) scoped to the current working folder. ✅ Built — `customInstructions` on the `Project` type (`projectStore.ts`); folder-scoped discovery via Rust commands `project_load_instructions` / `project_has_instructions` returning `ProjectInstructionFile { path, filename, content, scope }` in `apps/desktop/src-tauri/src/sys/commands/project_context.rs`. Instructions are carried by the Managed-Cloud delta (`custom_instructions ↔ instructions` mapping in `projects_sync.rs`). Requirements: plain text, size-bounded (server enforces ≤10,000 chars), and shown to the user before they take effect — never a hidden system prompt.

## Files

A project can attach files/directories (references) via the current-folder scope and a per-project file list. ✅ Built — `ProjectFile[]` with `addFileToProject`/`removeFileFromProject` (`projectStore.ts`); folder listing via `project_context_list_files` and validation via `project_context_validate_path` (`project_context.rs`). **Local files stay local**: bytes are never included in the cloud delta (`projects_sync.rs` excludes `files`), and moving a file's context into a BYOK or Cloud chat is an explicit, consented Local→BYOK fork — never automatic. 🔭 Planned — drag-and-drop and per-file inclusion toggles in the V3 panel.

## Knowledge

Knowledge is a per-project retrieval store: documents are chunked, embedded, and queried (RAG) to ground answers. ✅ Built (Rust engine) — `apps/desktop/src-tauri/src/features/projects/{knowledge.rs,rag.rs,manager.rs}` (document/chunk/embedding types, `ChunkingConfig`, `RAGResult`) exposed via registered commands `project_add_knowledge_file` and `project_search_knowledge` (`apps/desktop/src-tauri/src/lib.rs`). A parallel store-level list (`KnowledgeBaseFile` with extracted `content`) exists for inline context injection. 🟡 Partial — two knowledge paths coexist (Rust RAG store vs. the store's inline `knowledgeBaseFiles`) and the mounted V3 panel surfaces neither; end-to-end V3→RAG wiring is the tracked gap. Knowledge bytes never leave the device (`knowledge_base_files` is local-only).

## Search

Projects are searchable by name and description and appear in the global ⌘K search. ✅ Built — `searchProjects` in `projectStore.ts` (case-insensitive match); in-view search + filter in `ProjectsView.tsx` (`searchQuery` + `FilterMode`); projects are an indexed entity type in the Desktop global search (`apps/desktop/src/features/v3/SearchModalCmdK.tsx`). Search stays scoped to the active trust mode's local data plus server-visible Cloud data; it must never surface BYOK secrets or route a query off-device. 🔭 Planned — full-text search across knowledge documents and instruction bodies.

## Workspace Organization

Projects organize the workspace by linking conversations, scoping a working folder, and tracking recent folders (Claude-Code-style project folder). ✅ Built — conversation linking (`linkConversation`/`unlinkConversation`, `getProjectForConversation`) and folder scope (`currentFolder`, `recentFolders`, `setCurrentFolder`) in `projectStore.ts`; new V3 chats scope to a project at creation via `setConversationProject` (`DesktopShellV3.tsx`). The V3 shell exposes Projects as one panel of the AGI Work area (`projects | artifacts | scheduled | dispatch`); the AGI Code surface (`CodeModeHome.tsx`) exists but is **not mounted** — 🟡. Per-project settings (`defaultModel`, provider, context window) persist via `project_update_settings`; any model default comes from `packages/contracts/types/src/models.json`, never an invented ID.

## Repository map

- `apps/desktop/src/stores/projectStore.ts` — data model, CRUD, files, knowledge, links, folder scope
- `apps/desktop/src/features/v3/AgiWorkProjects.tsx` — mounted V3 panel (create + list); `DesktopShellV3.tsx`, `ProjectRow.tsx` — routing + project-scoped new chat
- `apps/desktop/src/features/chat/{ProjectsView.tsx,ProjectEditDetailsDialog.tsx,ProjectSettingsDialog.tsx}` — richer CRUD/search/archive UI (not V3-mounted)
- `apps/desktop/src/stores/projectMemoryStore.ts`, `apps/desktop/src/api/projectMemory.ts` — project memory
- `apps/desktop/src-tauri/src/sys/commands/projects.rs` — `project_create/list/get/update/delete/*_settings`; `project_context.rs` — folder context, file listing, instruction discovery
- `apps/desktop/src-tauri/src/features/projects/{knowledge.rs,rag.rs,manager.rs}` — knowledge + RAG engine
- `apps/desktop/src-tauri/src/data/projects_sync.rs` + `apps/web/app/api/projects/sync/route.ts` — Managed-Cloud delta-sync

## Competitor notes

Claude Projects and ChatGPT Projects bundle instructions + files + chats into a cloud-hosted workspace tied to a single provider's models; OpenAI Codex scopes work to a repo/task rather than a durable "project" object. AGI's divergence: (1) **local-first** — content lives on-device and only Managed-Cloud projects sync, via cursor + tombstone delta; (2) **per-surface trust** — trust defaults are deliberately _not_ synced; (3) **multi-provider + BYOK where allowed** — per-project default model/provider draw from the catalog, and moving context to BYOK is an explicit consented fork, not a silent upgrade; (4) knowledge/RAG runs in the local Rust host, not a mandatory cloud index.

## Acceptance / Definition of Done

Production-ready when the V3-mounted Projects panel reaches parity with the store/Rust capabilities (create, rename, delete, archive, instructions, files, knowledge, search) with correct trust labels, and no Local/BYOK project appears in a cloud payload.

- [ ] Build: V3 panel surfaces rename/delete/archive/instructions/knowledge (converge `ProjectsView.tsx` into `AgiWorkProjects.tsx`); delete is confirm-gated; a single knowledge path is wired end-to-end.
- [ ] Trust: Local/BYOK projects have no `cloud_id` and never appear in `projects_sync.rs` push; trust defaults stay device-local; moving files/knowledge into BYOK/Cloud is an explicit fork (context selection, secret scan, payload preview, provider label, consent).
- [ ] Security: cloud sync runs RLS-scoped (`getUserScopedDb`) with CSRF + rate limit + size bounds; tombstones propagate; no knowledge/file bytes cross the delta.

## Anti-patterns

- Do not silently push a Local or BYOK project to Managed Cloud, or let a project's trust default cross devices via sync.
- Do not claim knowledge/RAG or full CRUD works from the V3 panel without a mounted, wired path — cite the real surface or mark 🟡/🔭.
- Do not inject custom instructions as a hidden prompt; the user must see them. Do not move a file's bytes off-device implicitly.
- Do not hardcode or invent a per-project default model ID — read from `packages/contracts/types/src/models.json`.
- Do not reference "Plus", `pro_plus`, "Hobby", credit top-ups, or Supabase; use Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise and the Clerk + Neon + Stripe stack.
