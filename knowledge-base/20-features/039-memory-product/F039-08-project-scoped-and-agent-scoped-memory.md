---
id: "F039-08"
type: "feature"
title: "Project-scoped and agent-scoped memory"
aliases: ["Project memory", "Folder memory (desktop Tauri)", "PROJECT MEMORIES (mobile)", "Use memories from outside this project", "uses_global_memory", "S39.24", "S39.25", "Agent-specific memory"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S39.24", "S39.25"]
depends_on: ["SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "table:user_memories", "table:user_projects", "api:GET /api/memory", "api:POST /api/memory", "file:apps/web/lib/services/managed-memory-context-service.ts", "F039-09", "F039-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-08 Project-scoped and agent-scoped memory

A memory can be tied to one project so only that project's chats use it, and a project can refuse account memories. Done on web, mobile and CLI (with limits); the desktop Tauri build keeps separate device folder notes. Memory kept by a custom agent apart from personal memory does not exist in any app.

Area: [39. Memory product](README.md). Requirement items: [S39.24](../../10-requirements/capabilities/039-memory-product.md#s3924), [S39.25](../../10-requirements/capabilities/039-memory-product.md#s3925).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person save facts that apply only inside one project, and choose whether that project also draws on account-wide memory. Memories show an Only in <project> label in the list so they are not mistaken for global facts.

**Why it exists.** Project work has its own facts (a market, a stack, a client). Mixing them into every chat is wrong, and mixing personal facts into a client project is a privacy risk. Brief S39.24 and docs/product/requirements.md:760 require a project memory boundary.

**Who uses it.** People who use Projects on web or mobile, and CLI users who link a folder to an account project.

**Problems it solves**

- Facts for one client leaking into unrelated chats.
- A project that must stay clean of the person's other memories.
- Not knowing whether a listed fact is global or project-only.

**Use cases**

- Open Project settings on web, add 'This project targets the EU market' under project memory, and see it used only in that project's chats.
- Turn off 'Use memories from outside this project' so a client project uses only its own memories.
- On mobile, open a project's settings and add a memory under PROJECT MEMORIES.
- In the CLI, run agi memory add --project after linking the folder, so only that project's chats draw on it.

## 2. User experience

**Where to find it**

- Web: open a project, Project settings dialog, Memory group with checkbox 'Use memories from outside this project', followed by the project memory panel (apps/web/features/projects/components/ProjectSettingsDialog.tsx:393,404; panel input labelled 'Add a memory only this project uses' at ProjectMemoryPanel.tsx:239).
- Web: in Settings, Memory, project facts carry a badge 'Only in <project name>' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:315).
- Mobile: project settings screen, MEMORY switch 'Use memories from outside' and list PROJECT MEMORIES with input 'Add a memory only this project uses' (apps/mobile/src/features/projects/components/ProjectSettingsScreen.tsx:220,234).
- Mobile: Cloud memory list reads 'only in project <name>' in each project fact's accessibility label (apps/mobile/src/features/settings/components/MemoryItem.tsx:66).
- CLI: agi memory add --project, agi memory list (marks '', this project' or ', another project') (apps/cli/src/lib.rs:1435,4144).
- CLI /memory add [global|project|local] edits CLAUDE.md instruction files, not account project memory (apps/cli/src/repl/registry.rs:1938).
- Desktop Tauri: project dialog section 'Folder memory' with field 'Remember for this folder' (apps/desktop/src/features/chat/ProjectMemorySection.tsx:124,145). The Electron desktop shows the hosted web app (doc: AGENTS.md section 5) [inferred].
- VS Code and Chrome: no project memory control found.

**Before you start**

- Signed in with Cloud memory available for web, mobile and CLI project memory.
- A project (web or mobile) or a folder linked with agi projects link (CLI).
- Memory switched on for project memories to be read in chats (apps/web/lib/services/turn-context-service.ts:124).

**Screens and controls**

- Checkbox 'Use memories from outside this project' (web) and switch 'Use memories from outside' (mobile).
- Text box and Add button for project memories; per-row edit and delete (web; mobile delete asks to confirm).
- Delete button labelled 'Delete project memory: <text>' (ProjectMemoryPanel.tsx; ProjectSettingsScreen.tsx).
- Desktop Tauri: text boxes 'Remember for this folder' and a reason, list with 'Delete this folder memory?' confirm (ProjectMemorySection.tsx).

**Journey**

1. 1. Open the project's settings.
2. 2. Decide whether the project may use memories from outside it (web checkbox, mobile switch).
3. 3. Type a project fact and press Add.
4. 4. The fact is saved with the project's id and appears in the project list and in Settings, Memory with an Only in badge.
5. 5. In a chat of that project the assistant uses account facts (if allowed) plus the project's facts; in other chats the project's facts are never used.

**What the person sees and gets**

- Project list updates after Add; save failure text 'Could not save this memory. Try again.' and delete failure 'Could not delete this memory. Try again.' (ProjectMemoryPanel.tsx:14-15).
- If a new fact is outranked by an existing one the web panel throws 'Kept an existing memory instead, because it outranks the new fact.' (cloud-memory-controller.ts:447).
- Helper copy: web 'Chats here draw on what has been remembered account-wide, and anything learned here stays in this project.' or 'Chats here use only this project's memories.' (ProjectSettingsDialog.tsx:393-400); mobile uses the same idea (ProjectSettingsScreen.tsx:30).
- CLI prints 'Remembered in this project's memory; its conversations on every client draw on it.' (lib.rs add branch).

**Settings**

- Per project: uses_global_memory (web checkbox, mobile switch).
- Account: Memory on/off and the other Memory switches.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server stores project_id on each memory and uses_global_memory on each project (apps/web/db/neon/0135_project_scoped_memory.sql:13,30).
- Retrieval: outside a project only rows with no project are read; inside a project its own rows are read, plus global rows unless the project opted out (apps/web/lib/services/managed-memory-context-service.ts:1085).
- Unreadable or missing project falls back to global-only, never to the project's rows (managed-memory-context-service.ts:1264).
- POST /api/memory validates that the project belongs to the caller and workspace before saving (apps/web/app/api/memory/route.ts:141).
- The list API returns projectId and projectName so clients can label project facts (route.ts:94).
- Web project panel adds, edits and deletes project memories (ProjectMemoryPanel.tsx:61,75).
- Mobile project settings add, list and delete project memories and toggle the global switch (ProjectSettingsScreen.tsx:220-300).
- CLI: agi memory add --project saves with the linked project id; the CLI prompt includes account-wide memories and only the linked project's (apps/cli/src/lib.rs:4287; apps/cli/src/cloud/memory.rs:199).
- The same scope applies to memory tools, scheduled agents and live voice (turn-context-service.ts:148; apps/web/lib/server/tools/memory-tools.ts:190; apps/web/lib/services/scheduled-agent-executor.ts:429).

**Incomplete**

- CLI prompt building ignores the project's uses_global_memory setting, so a project that opted out still gets account-wide memories in the CLI (cloud/memory.rs:199 filters only by project id; no uses_global reference in apps/cli/src).
- Mobile has no memory list filter by project and no Memory screen label beyond the accessibility text; the visible badge is not shown (MemoryItem.tsx:66 is an accessibility label).
- Desktop Tauri 'Folder memory' is a device-only store keyed by folder, not the account project memory (apps/desktop/src/stores/projectMemoryStore.ts:54; apps/desktop/src-tauri/src/core/agi/project_memory.rs:122).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Agent-specific memory (S39.25): searched memory code in apps/web/lib/services, apps/cli/src/agents.rs and the web agents folders; no memory scoped to an agent id was found, and user_memories has no agent column in the migrations read (0135, 0203, 0285 mention agent only inside a provenance record).
- Project memory in VS Code and Chrome: no control found.

## 4. Required behaviour

**Established requirements**

- Memories can be confined to one project, are used only in that project, and the user can tell which are project-only. (source: brief S39.24 Should)
- A custom agent or assistant can keep its own memory separate from personal memory, and the user can review it. (source: brief S39.25 Should)
- Memory must distinguish saved user memory, chat-history reference, project memory, temporary chat exclusion, imported memory and surface-specific local memory. (source: docs/product/requirements.md:754-763)
- Project memory boundary is a required memory feature. (source: docs/product/requirements.md:1511)

**Acceptance criteria**

1. A memory saved with a project id appears in chats of that project and not in loose chats or other projects.
2. With 'Use memories from outside this project' off, a project chat gets only its own memories.
3. With it on, a project chat gets project plus account-wide memories.
4. The memory list labels project facts 'Only in <project>' on web and in the accessibility label on mobile.
5. Saving to a project that is not the caller's returns Project not found.
6. In the CLI, agi memory add --project fails with a clear message when the folder is not linked.
7. Deleting the project removes its memories (foreign key on delete cascade, 0135).
8. No UI claims an agent has its own memory.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should honour uses_global_memory like the server does [inferred from the server rule at managed-memory-context-service.ts:1085].
- Project memory on mobile local mode does not exist because projects are a Cloud feature there [inferred from apps/mobile/src/features/projects/service.ts using managedCloudProjects].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Read uses_global_memory in the CLI account-memory cache and filter global rows when it is false.
- [proposed] Show a visible 'Only in <project>' badge on the mobile memory list.
- [proposed] Decide whether custom agents get a memory scope before building S39.25.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | project_id and uses_global_memory columns | `apps/web/db/neon/0135_project_scoped_memory.sql` | Adds the two columns |
| service | memoryScopePredicate and loadProjectMemoryScope | `apps/web/lib/services/managed-memory-context-service.ts` | Builds the project filter for reads |
| service | resolveInteractiveTurnContext | `apps/web/lib/services/turn-context-service.ts` | Loads project scope and memory for each turn |
| endpoint | /api/memory (GET, POST, DELETE) | `apps/web/app/api/memory/route.ts` | List with project labels, create with project id, delete all |
| component | ProjectMemoryPanel | `apps/web/features/projects/components/ProjectMemoryPanel.tsx` | Web add, edit, delete of project memories |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Web checkbox for outside memories; hosts the panel |
| store | cloud-memory-controller addProject | `apps/web/features/memory/cloud-memory-controller.ts` | Posts project memory with source web |
| component | MemoryEditor Only in badge | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Labels project facts in lists |
| screen | ProjectSettingsScreen (mobile) | `apps/mobile/src/features/projects/components/ProjectSettingsScreen.tsx` | Mobile switch and project memory list |
| service | mobile project service | `apps/mobile/src/features/projects/service.ts` | Saves usesGlobalMemory and handles refused scope changes |
| component | MemoryItem | `apps/mobile/src/features/settings/components/MemoryItem.tsx` | Accessibility label with project name |
| command | agi memory add --project | `apps/cli/src/lib.rs` | CLI project memory write |
| service | add_project_memory | `apps/cli/src/cloud/mod.rs` | POST /api/memory with project id |
| service | context_prompt_for | `apps/cli/src/cloud/memory.rs` | Filters cached account memory by linked project |
| command | /memory tiers (CLAUDE.md files) | `apps/cli/src/repl/registry.rs` | Instruction file memory, separate from account memory |
| component | ProjectMemorySection (desktop Tauri) | `apps/desktop/src/features/chat/ProjectMemorySection.tsx` | Device-only folder memory UI |
| store | projectMemoryStore | `apps/desktop/src/stores/projectMemoryStore.ts` | Calls Tauri commands for folder memory |
| table | user_memories | `apps/web/app/api/memory/route.ts` | Rows with project_id |
| table | user_projects | `apps/web/lib/services/managed-memory-context-service.ts` | Holds uses_global_memory |
| service | memory tools project scope | `apps/web/lib/server/tools/memory-tools.ts` | Applies project scope to model memory tools |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person adds a project memory; client posts content with projectId. | device | apps/web/features/memory/cloud-memory-controller.ts:438 |
| Server checks the project belongs to the user and the workspace, runs never-remember and policy checks, then writes the row with project_id. | our servers | apps/web/app/api/memory/route.ts:141,148 |
| On a chat turn the server loads the project's uses_global_memory flag and builds the read filter. | our servers | apps/web/lib/services/turn-context-service.ts:148; managed-memory-context-service.ts:1264 |
| Matching memories are put in the model prompt and the person's reply may show them as used. | our servers | managed-memory-context-service.ts:1128 |
| CLI: add posts with the linked project id; prompts use the cached list filtered by project id. | device and our servers | apps/cli/src/cloud/mod.rs:927; apps/cli/src/cloud/memory.rs:199 |
| Desktop Tauri folder memory is saved and read through local commands only. | device | apps/desktop/src/stores/projectMemoryStore.ts:54 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project memory rows | table user_memories (project_id column) | Yes, to every signed-in client via /api/memory and /api/memory/sync | Deleting a project cascades to its memories (0135_project_scoped_memory.sql:13); deleting a memory keeps a text-less tombstone so other devices learn of it (managed-memory-context-service.ts:391) |
| Project opt-out flag | table user_projects column uses_global_memory | Yes with the project | With the project |
| CLI cached memories | cloud/memory.json in the CLI config folder | Pulled from /api/memory/sync | Replaced on refresh (apps/cli/src/cloud/memory.rs:15) |
| Desktop Tauri folder memory | Device database via Tauri commands | No (text says saved on this device for this folder only) | Until deleted by the person (ProjectMemorySection.tsx:124) |

**Models and providers.** Project scope is applied before the prompt is built, so it is the same for every model and provider (managed-memory-context-service.ts:1128 takes no model input). No model takes part in saving a typed project memory.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for web, mobile and CLI project memory; none for desktop Tauri folder memory. |
| Permissions | Project must be owned by the caller in the active workspace (route.ts:141). Workspace admins can switch memory off for the workspace (managed-memory-context-service.ts:115). |
| Subscription | none found in the code for project memory itself. |
| Limits and metering | List page size capped at 100 (route.ts:41 via MANAGED_MEMORY_MAX_PAGE_SIZE); at most 30 memories and 8,000 characters reach a prompt (managed-memory-context-service.ts:67,71). |
| Feature flags | none found in the code. |
| Model compatibility | Applies to every model; no capability check. |
| Provider restrictions | none found in the code. Local-model turns on web or desktop receive account memory through the prefetch route /api/memory/local-context with the project id (apps/web/app/api/memory/local-context/route.ts:7). |
| Local mode | Account project memory does not exist in Local mode; the desktop Tauri build offers device-only folder memory that needs no account or payment (ProjectMemorySection.tsx:124). CLI Local sessions do not receive account memory because only Managed sessions carry it (apps/cli/src/cloud/memory.rs header comment). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cloud memory not ready | Panel says Cloud memory is unavailable until your account and workspace are ready | ProjectMemoryPanel.tsx:30 |
| Save or delete failure | Inline error messages; draft kept | ProjectMemoryPanel.tsx:14-15,75 |
| Edit of a fact no longer in the loaded list | Unsaved edit kept with a notice | ProjectMemoryPanel.tsx (Unsaved project memory edit) |
| Mobile switch refused by server | Toggle is undone and the person is told | apps/mobile/src/features/projects/__tests__/ProjectSettings.test.tsx:141 (test title) |
| Project cannot be read on the server | Falls back to global-only | managed-memory-context-service.ts:1264 |
| Offline | not handled in the code for the web panel beyond the load error; CLI uses the last cached memory file | apps/cli/src/agent/mod.rs:700-714 warns and continues with device copy |
| Accessibility | Delete controls have descriptive labels including the fact text | ProjectMemoryPanel.tsx; ProjectSettingsScreen.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/project-scoped-memory.test.ts`: Loose chat sees only global, global scope, project with both pools, opted-out project only its own, source suppression with scope
- `apps/web/app/api/memory/__tests__/withdrawn-project-scope.test.ts`: Withdrawn project scope handling
- `apps/web/features/projects/components/__tests__/ProjectMemoryPanel.edit.test.tsx`: Editing project memories in the web panel
- `apps/web/features/settings/sections/__tests__/MemoryProjectAttribution.test.tsx`: Project attribution in the memory list
- `apps/mobile/src/features/projects/__tests__/ProjectSettings.test.tsx`: Toggle global memory, refused toggle, listing and adding project memories, delete confirmation
- `apps/mobile/src/features/projects/__tests__/ProjectMemoryLimit.test.tsx`: Project memory limit on mobile (file exists; contents not read)
- `apps/desktop/src/features/chat/__tests__/ProjectMemorySection.test.tsx`: Desktop Tauri folder memory section
- `apps/cli/src/cloud/memory.rs`: Inline Rust test a_turn_draws_only_on_account_wide_and_its_own_project_memories (line 473)

**Test scenarios**

- **Project fact stays in the project**
  1. On web add a project memory in project A.
  2. Start a chat in project A and ask about it.
  3. Start a loose chat and project B chat and ask the same.
  - Expected: Only the project A chat uses the fact.
- **Project opts out of outside memory**
  1. Untick 'Use memories from outside this project' in project A.
  2. Ask in project A about a personal account fact.
  - Expected: The assistant does not know the account fact.
- **Label in list**
  1. Open Settings, Memory after adding a project fact.
  - Expected: The fact shows 'Only in <project name>'.
- **CLI project write**
  1. Run agi projects link in a folder.
  2. Run agi memory add --project 'uses pnpm'.
  3. Run agi memory list.
  - Expected: Entry shows ', this project'.
- **CLI opt-out check (expected failure today)**
  1. Opt a project out of outside memory on web.
  2. Run a CLI session in the linked folder with a global memory saved.
  - Expected: Should not include the global memory; the code does not filter it, so expect it to appear
- **Mobile project memory**
  1. Open a project's settings on mobile Cloud mode.
  2. Add a memory under PROJECT MEMORIES.
  - Expected: The fact lists there and is used only in that project.

**Where to look when it fails**

- Span attribute retrieval.scope with values global, project+global, project-only in memory.context.load (managed-memory-context-service.ts:1195).
- Error 'Project not found' on create.
- Table user_memories project_id; table user_projects uses_global_memory.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)

## 10. Gaps and dependencies

- **CLI ignores a project's opt-out from global memory** Affects: CLI users in projects set to project-only. Evidence: apps/cli/src/cloud/memory.rs:199; no uses_global reference in apps/cli/src. Work needed: Carry uses_global_memory in the CLI project cache and filter
- **No agent-specific memory in any app** Affects: All apps; users of custom agents. Evidence: No code found (S39.25 brief status missing in all six apps). Work needed: Product decision and data model (scope column or table) before building
- **Project memory missing in VS Code and Chrome** Affects: VS Code and Chrome users. Evidence: No code found in apps/extension-vscode/src/memory or apps/extension/src/features/side-panel/memorySheet.ts. Work needed: Add project id to the memory clients or document as not planned
- **Mobile list lacks a visible project badge** Affects: Mobile users. Evidence: MemoryItem.tsx:66 is an accessibility string only. Work needed: Add a visible label
- **Brief says mobile project memory is missing but code exists** Affects: Brief readers. Evidence: ProjectSettingsScreen.tsx:234. Work needed: Correct the brief
- **Desktop Tauri folder memory is a different concept from account project memory** Affects: Desktop Tauri users. Evidence: ProjectMemorySection.tsx:124-130. Work needed: Name the two clearly or unify
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- table:user_memories
- table:user_projects
- api:GET /api/memory
- api:POST /api/memory
- file:apps/web/lib/services/managed-memory-context-service.ts
- F039-09
- F039-12

## Unknown

- Whether the Electron desktop shows the project memory panel (inferred from AGENTS.md only).
- Contents of ProjectMemoryLimit.test.tsx and what limit it checks.
- Whether any custom-agent feature elsewhere stores per-agent notes outside the memory code searched.
- Whether the CLI cache is cleared when the project opt-out changes.
- No tests were run.
