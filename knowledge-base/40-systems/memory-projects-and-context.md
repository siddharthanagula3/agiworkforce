---
id: "SYS-memory-projects-and-context"
type: "system"
title: "Memory, projects and context"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Memory, projects and context

The assistant's per-turn context comes from five stores: account custom instructions, saved Memory, past-chat recall, project instructions and files, and the chat's own instruction. A shared engine checks each source against the user's switches, the workspace policy and the temporary-chat rule. Everything is ordered by one six-layer hierarchy, and the model treats Memory and project files as reference only. Web and Cloud mode do this on the server. Local mode on mobile and CLI uses on-device copies.

## What it is and why it exists

This page covers how the assistant remembers things and how the text the model reads for one turn is built.

**Five kinds of personal context** [code]:

| Kind | What it is | Who writes it |
|---|---|---|
| Custom instructions | The account's standing instructions and response style, plus name, work and an "about you" text | The user |
| Saved memory | Short facts in table:user_memories | The user, or the assistant (automatic learning, the `save_memory` tool, a typed "remember ...") |
| Past-chat recall | Excerpts of the user's earlier chats | Read from table:web_conversations and table:web_messages |
| Project context | Project instructions, knowledge files, and excerpts of sibling chats in the same project | The user, who uploads the files |
| Chat instruction | An instruction attached to one conversation (`conversation_instruction`) | The user |

**Temporary chat** is a conversation with `is_temporary = true`. It skips memory, past-chat recall, learning and the stored context manifest. A temporary chat cannot be inside a project (`lib/temporary-chat-policy.ts`).

**Why it exists** [requirement]: `docs/product/requirements.md` section 18 requires memory that can be viewed, edited, switched off, bounded to a project and excluded from temporary chats. The product competes with ChatGPT and Claude, which ship Memory and Projects.

**One contract for all surfaces** [code]: the taxonomy of context kinds and the instruction hierarchy live in `packages/contracts/context`. The engine that applies the checks lives in `packages/platform/context-engine`. The web app uses both through `apps/web/lib/services/turn-context-service.ts`.

**Trust rule** [code]: only layers that are instructions (system, developer, project, personalized) can instruct the model. Memory and past chats are reference. Project knowledge files, uploads, connector and web results are untrusted data. The code derives each layer from the source's trust level and a test helper reports any mismatch (`instructionLayerTrustMismatches`, packages/contracts/context/src/instruction-precedence.ts:219).

## How it works today

### 1. The request arrives

The chat route is `api:POST /api/llm/v1/chat/completions` (`request-processor.ts`). Three request fields matter [code]:
- `memory_enabled` (request-processor.ts:712) is the per-chat Memory switch.
- `personalization` (request-processor.ts:713) is the per-chat custom-instructions switch.
- `conversation_id` ties the turn to a stored conversation.

If `personalization === false`, the server also sets `memory_enabled = false` (request-processor.ts:3523). The clients send `personalization: false` only for a temporary chat whose "personalized" toggle is off. The toggle defaults to on (web-chat-store.ts:1030; apps/mobile/stores/settingsStore.ts:138).

### 2. The conversation row is read

The ownership step loads the conversation. It gets `is_temporary`, `project_id`, the chat instruction and the agent config (request-processor.ts:3760-3980). If the conversation has a project, `loadProjectContext` runs. A missing, archived or deleted project returns HTTP 409 `project_context_unavailable`. A load error returns a project-load failure and no model call is made.

### 3. The Memory policy is read

- For a temporary chat the policy is the disabled constant and nothing is read (request-processor.ts:4126-4131).
- Otherwise two layers are read. The workspace layer is `organization_admin_policies.allow_memory`. The personal layer is `user_settings.settings.capabilities` (`readUserMemoryCapabilities`, managed-memory-context-service.ts:258).
- Memory is on only if `capabilities.memory === true`. The default is off (use-capabilities-preferences.ts:62).

### 4. `resolveInteractiveTurnContext` decides what to load

At turn-context-service.ts:105-242:
- **Memory** is included if the policy is enabled, the chat is not temporary, and `accountMemoryRequested` is true. On the web surface that is `memory_enabled !== false`. On the `api` surface memory is opt-in (`=== true`) (lines 70-75, 124-127).
- **Past chats** are included if the policy has `searchPastChats`, the surface is not `api`, `memory_enabled !== false`, the chat is not temporary, and the query is not empty (lines 128-131).
- The loaders are the project loaders, the past-chat loader and the memory loader. All go to `resolveContext`.

### 5. The engine applies its checks

In `packages/platform/context-engine/src/engine.ts`, for each loader, in budget-priority order [code]:
1. **Class admission** (`classAdmission`, line 114-133): a switched-off toggle gives `source_disabled`. A temporary chat gives `temporary_chat` for classes marked `excludedFromTemporaryChat`. A shared project gives `personal_scope` for personal-sensitivity classes.
2. **Per-candidate checks:** `permissionCheck` (owner, workspace, project must match, and an external source can never be an instruction) and `policyCheck` (the workspace flags allowMemory, allowPastChats, allowConnectorResults, allowWebResults).
3. **Stale, duplicate and budget limits.** Stale items are dropped only if the loader sets `dropStale`. Duplicates are found by a normalized text key. Each loader has a character cap.
4. **Output:** items sorted by authority order (`CONTEXT_SOURCE_PRECEDENCE`) and a manifest of counts and ids, with no text.

The budget is spent in a different order from the reading order. `CONTEXT_BUDGET_PRIORITY` keeps instructions first, then user uploads, then account memory, then project files, sibling chats, past chats, library files, connector results and web results last (context-source.ts:154-169).

### 6. Project blocks are trimmed

`admittedProjectContext` (turn-context-service.ts:87-103) drops any class the engine withdrew. It drops sibling chats when past chats are not allowed. It then fits the rest into `MAX_PROJECT_CONTEXT_CHARS`, giving up the lowest-authority blocks first (`fitProjectContextBlocks`, project-context-service.ts:554).

### 7. The system message is assembled

The stable, cacheable part is built by `composeManagedSystemPreamble` (request-processor.ts:2107-2137). It orders blocks with `orderInstructionBlocks`:

| Rank | Layer | Content |
|---|---|---|
| 1 | system | The capability preamble |
| 2 | developer | Study instruction |
| 3 | project | Project name, description and instructions |
| 4 | personalized | Account custom instructions, then the chat instruction |

The dynamic part comes after `SYSTEM_PROMPT_CACHE_BOUNDARY`. It is built from the system messages added during the turn (request-processor.ts:4270-4345, 6218-6240):
- project knowledge files (layer untrusted_context)
- project sibling chats, past-chat excerpts and account memories (layer memory)
- connector context (layer untrusted_context)

Those blocks are ordered by layer rank with a stable sort. Within one layer they keep message-array order, and later-added blocks sit earlier in the array [inferred].

### 8. Conflict outcomes

`INSTRUCTION_CONFLICTS` (instruction-precedence.ts:156-172) defines what a losing layer becomes:
- A losing instruction layer is **narrowed**: kept, but applied only where it does not contradict the winner.
- A losing memory layer is **ignored** for the contested subject.
- A losing untrusted layer is **quoted**: reported as data and never followed.

The pairwise ranking is system > developer > project > personalized > memory > untrusted. This table is executable. How well a model obeys it is [unknown] (no run in the repo evidence I read).

### 9. After the answer

- Automatic learning (`prepareManagedAutoMemoryFacts`, request-processor.ts:~2410) takes up to 5 pattern-matched facts from the user's message. It runs only if all of these hold: policy enabled, `generateFromHistory`, not temporary, `memory_enabled !== false`, not the `api` surface, and (unless `allowToolAssistedGeneration`) a tool-free turn.
- Optionally a model re-reads the message (`AGI_MODEL_MEMORY_EXTRACTION`, on unless set to 0, false, off or no). It runs after the response, on a cheap utility route, metered as feature `memory_extraction`. It is skipped for zero-data-retention turns. Any failure falls back to the pattern facts.
- Each fact passes `writeConsolidatedMemory`, which runs the eligibility gate (see Rules).
- The context manifest is written to table:context_manifests in the background, unless the chat is temporary.

### Other paths

- **Memory tools:** `save_memory`, `search_memory` and `forget_memory` are offered only on stream turns, only if the message asks about memory, and never in a temporary chat (applyMemoryToolCapability, request-processor.ts:1123-1152).
- **Project file search tool:** `applyFileSearchToolCapability` (line 1154) offers a file-search tool when the project has knowledge files, except in temporary chats.
- **Typed commands:** "remember ..." and "forget ..." go through `api:POST /api/memory/commands` or `memory_command` on the chat request. Both use the same eligibility gate and the never-remember list (memory-commands.ts).
- **Free offering path:** `resolveFreeOfferingPersonalContext` (turn-context-service.ts:338) builds the same blocks for the free quota route. It refuses the turn if a project cannot be loaded.

## Implementation map

| Concern | File | Notes |
|---|---|---|
| Context taxonomy (14 source classes, trust, toggles, fence tags, temporary-chat flag) | packages/contracts/context/src/context-source.ts | `POLICIES` table at line 171; precedence 132; budget priority 154 |
| Layer hierarchy and conflict rules | packages/contracts/context/src/instruction-precedence.ts | Layers at line 11; class-to-layer map at 48; conflicts at 156. Re-exported by apps/web/lib/prompts/instruction-precedence.ts |
| Memory content rules (never store / sensitive topics) | packages/contracts/context/src/memory-content-policy.ts | 7 prohibited categories, 7 sensitive topics |
| Provenance records | packages/contracts/context/src/provenance.ts | Object kinds include `memory` |
| Engine (admission, permission, policy, budget, manifest) | packages/platform/context-engine/src/engine.ts, permissions.ts, types.ts, manifest-store.ts | `CONTEXT_ASSEMBLER_VERSION = '2'` |
| Turn assembly (web) | apps/web/lib/services/turn-context-service.ts | Three entry points: interactive, free offering, local-model |
| Chat route glue and system preamble | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts | Ownership step ~3760; policy ~4126; compose ~2107 |
| Memory read, policy, scope, write, consolidation | apps/web/lib/services/managed-memory-context-service.ts | Caps 30 memories, 1,000 chars each, 8,000 total; 500 candidates |
| Automatic learning | apps/web/lib/services/managed-auto-memory-service.ts, model-memory-extraction.ts | |
| Typed remember / forget | apps/web/lib/services/memory-commands.ts | |
| Never-remember list | apps/web/lib/services/memory-write-service.ts | Up to 50 terms, kept in `user_settings.settings.memory` |
| Memory summary card | apps/web/lib/services/memory-summary-service.ts | Feature `memory_summary`, cached 30 days |
| Project memory edit by chat | apps/web/lib/services/project-memory-edit-service.ts | `api:POST /api/projects/{id}/memory/edit`, feature `project_memory_edit` |
| Past-chat recall | apps/web/lib/services/past-chat-context-service.ts | 90-day freshness; semantic or keyword; a degraded notice on failure |
| Project context | apps/web/lib/services/project-context-service.ts | See caps in Data and state |
| Knowledge passage choice | project-knowledge-passages.ts, project-knowledge-retrieval.ts | Index search with fallback |
| Custom instructions | apps/web/lib/server/user-identity.ts | `buildCustomInstructionsPreamble` line 250; max 2,000 chars of instructions, 1,500 of "about you" |
| Workspace policy snapshot | apps/web/lib/services/context-policy-snapshot.ts | A paused or resumed turn must restart if policy changed |
| Cloud Code repo instruction files | apps/web/lib/services/cloud-code-project-instructions.ts | Reads AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md, at most 2 |
| Temporary-chat rules and copy | apps/web/lib/temporary-chat-policy.ts | 30-day purge cron: apps/web/app/api/cron/purge-temporary-chats/route.ts |
| Memory settings UI | apps/web/features/settings/sections/MemorySection.tsx, hooks/use-capabilities-preferences.ts | Switches: Persistent memory, Save memories from chats, Search past chats, Include sensitive topics, tool-assisted generation |
| Project UI | apps/web/features/projects/ | ProjectSettingsDialog, KnowledgeFilesPanel, ProjectMemoryPanel |
| Local-model personal context (web client) | apps/web/features/chat/lib/local-personal-context.ts; packages/contracts/types/src/memory-wire.ts (`managedMemoryLocalTurnContext`) | Fetches `api:GET /api/memory/local-context` |

**API endpoints** (methods read from the route files):
- api:GET/POST/DELETE /api/memory
- api:GET/PUT/DELETE /api/memory/{id}
- api:POST /api/memory/{id}/restore
- api:POST /api/memory/commands
- api:GET /api/memory/local-context
- api:GET/POST /api/memory/sync
- api:GET /api/memory/export
- api:POST /api/memory/import
- api:GET /api/memory/conflicts
- api:GET/POST /api/memory/summary
- api:GET /api/cron/expire-memories
- api:GET/POST /api/projects
- api:GET/PUT/DELETE /api/projects/{id}
- api:POST /api/projects/{id}/duplicate
- api:GET/POST /api/projects/sync
- api:GET/POST /api/projects/{id}/knowledge-files
- api:GET/DELETE /api/projects/{id}/knowledge-files/{fileId}
- api:GET/POST /api/projects/{id}/memory/edit

**Tests that hold behavior:**
- apps/web/lib/services/__tests__/context-resolution-engine.test.ts
- apps/web/lib/services/__tests__/managed-memory-context-service.test.ts
- apps/web/lib/services/__tests__/memory-eligibility-gate.test.ts
- apps/web/lib/services/__tests__/memory-lifecycle.test.ts
- apps/web/lib/services/__tests__/past-chat-context-service.test.ts
- apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts
- apps/web/app/api/llm/v1/chat/completions/lib/request-processor.project-precedence.test.ts
- apps/web/app/api/llm/v1/chat/completions/lib/request-processor.system-assembly-order.test.ts
- packages/contracts/context/src/__tests__/*.test.ts
- packages/platform/context-engine/src/__tests__/*.test.ts
- apps/web/lib/server/__tests__/personalization-reaches-model.test.ts

Implementation status (code present and wired) is separate from verification status. I did not run any of these tests.

## Data and state

### Server tables (Cloud mode)

| Table | What it holds | Evidence |
|---|---|---|
| table:user_memories | Facts: content, category, source (`mobile`, `desktop`, `web`, `auto`), pinned, project_id (null = global), organization_id, expires_at, superseded_by, is_deleted. Deleted rows keep a tombstone with content cleared so other devices learn of the delete. | managed-memory-context-service.ts:375-397, 1128-1215; db/neon/0135_project_scoped_memory.sql |
| table:user_settings | JSON `settings.capabilities` (memory, generateFromHistory, searchPastChats, includeSensitiveTopics, allowToolAssistedGeneration); `settings.memory` (never-remember terms, suppressed sources); namespaces `general` and `personalization` (custom instructions, style) | managed-memory-context-service.ts:258-350; user-identity.ts:250-287 |
| table:user_projects | name, description, instructions, `uses_global_memory`, `uses_account_instructions`, `uses_account_style`, is_archived, deleted_at, organization_id. Limits are 200 / 2,000 / 10,000 chars. | project-context-service.ts:199; project-contract.json; db/neon/0310_project_account_personalization.sql |
| table:project_knowledge_files | file_name, summary, extracted_text, extracted_anchors, superseded_at, deleted_at | project-context-service.ts:214 |
| table:web_conversations | `is_temporary`, `project_id`, `instructions` | project-context-service.ts:240; request-processor.ts:3760 |
| table:web_messages | The text used for past-chat and sibling-chat recall | project-context-service.ts:253 |
| table:organization_admin_policies | allow_memory, allow_connector_context, allow_web_result_context, retention_days, retention_enforced | managed-memory-context-service.ts:123-215 |
| table:context_manifests | Per turn: ids, counts, budgets, exclusion reasons, a content digest, `temporary_chat`, versions. No text. | manifest-store.ts; db/neon/0252, 0284 |

### Device stores

| Store | Surface | What it holds |
|---|---|---|
| store:memory_facts (SQLite) | surface:mobile | On-device memory facts: `typed`, `learned` or `imported`, with `superseded_by` (apps/mobile/storage/memory.ts) |
| store:cloud_memory | surface:mobile | Cloud memory mirror (`apps/mobile/stores/memory/cloudMemoryStore.ts`; exact persistence [unknown]) |
| store:cloud/memory.json | surface:cli | Cache of account memory, in the config home (apps/cli/src/cloud/memory.rs) |
| store:CLAUDE.md files | surface:cli | Global, project and local instruction files per trust boundary: CLAUDE.md for Local, CLAUDE.byok.md for BYOK, CLAUDE.managed.md for Managed (apps/cli/src/memory.rs:44-58) |
| store:memories/*.md | surface:cli | Merged session learnings per boundary and per project (apps/cli/src/memory_pipeline.rs) |
| VS Code workspace state | surface:vscode | Custom instructions keys `agiWorkforce.customInstructions.host` and `.workspace` (max 8,000 chars); active cloud project (`agiWorkforce.activeCloudProject`) |
| In-memory cache | surface:web | `local-personal-context.ts` keeps context fetched for a local model for 60 s |

### Caps in project context

- Up to 40 knowledge files (`MAX_PROJECT_KNOWLEDGE_FILES`, suite-contracts.ts:502)
- 16,000 chars per file, 48,000 total
- Up to 15 sibling chats from 40 candidates; 1,600 chars per excerpt, 16,000 total
- File summary 300 chars; file name 200 chars
- Everything is truncated, not summarized.

### Retention

- Temporary chats are purged after 30 days (`RETENTION_DAYS`, cron route), unless a legal hold applies.
- Memory expiry is optional. The workspace retention window clamps it only when `retention_enforced` is true.
- The expiry cron is `api:GET /api/cron/expire-memories`.

## Rules: access, plans, modes

### Who can have Memory and Projects

- The `projects` and `memory_personalization` capabilities are on for the tiers free, basic, pro, max, max_15x, team, team_premium and enterprise (billing-catalog.ts:322-350). These are Cloud-chat tiers. `local-only` and `byok` are not in that list. [code]
- Project count limit: free 5; basic, pro, max_15x and team unlimited; enterprise by contract (billing-catalog.ts, free-plan-entitlements.ts:10). The limit is enforced in `api:POST /api/projects`.
- Knowledge storage is shared with the Library: free 500 MiB, basic 4 GiB, pro 20 GiB, max_15x 100 GiB (billing-catalog.ts). Over the limit the upload is refused.
- I found no plan gate on reading memory in chat beyond the user and workspace switches. Plan gates were [unknown] for `max` and `team_premium` project limits (not read).

### Switches, in order of authority

1. **Workspace admin:** `allow_memory` off closes Memory and past chats. No policy row, or an unreadable row, means closed (managed-memory-context-service.ts:123-215). `allow_connector_context` and `allow_web_result_context` govern the other two classes.
2. **User setting:** `capabilities.memory` (default off), `searchPastChats` (default off), `generateFromHistory` (default on once memory is on), `includeSensitiveTopics` (default off), `allowToolAssistedGeneration` (default off).
3. **Per project:** `uses_global_memory` false means the project reads only its own memories (memoryScopePredicate, managed-memory-context-service.ts:1085). `uses_account_instructions` and `uses_account_style` false remove the account's custom instructions and style for chats in that project (user-identity.ts:213-247).
4. **Per chat:** `memory_enabled=false`, `personalization=false`, or a temporary chat.

### Memory write eligibility (`memoryEligibilityGate`)

A fact is refused if:
- it is in a prohibited category (credential, payment instrument, government identifier, biometric, precise location, criminal history, immigration status);
- the chat is temporary;
- the workspace has memory off;
- the user's Memory switch is off;
- it touches a sensitive topic (health, race or ethnicity, religion, politics, sexual orientation, gender identity, union membership) and the user has not opted in, unless the user explicitly asked to save it;
- the source class cannot generate memory (project files, uploads, connector and web results cannot);
- the trust mode is not `managed`;
- it matches the user's never-remember list.

An explicit "remember" does not bypass the never-remember list or the prohibited categories (memory-commands.ts).

### Modes

- **mode:cloud:** the server builds all context (turn-context-service.ts). Memory is stored in table:user_memories and the turn is metered. Memory extraction and summary are metered as separate quota features.
- **mode:own-key and mode:local:** not read by the server. `docs/product` and `memory-content-policy` state that managed storage may not hold local or BYOK content (memory-eligibility reason `trust_mode_outside_managed_storage`, managed-memory-context-service.ts:650-660). On the web client with a local model, `useChatStream.ts:4460-4510` fetches account instructions and memory through `api:GET /api/memory/local-context` and injects them locally. Memory is withheld for a temporary chat or a turn with memory off. Whether this crosses the Local-to-managed boundary by the AGENTS.md section 6 standard is [unknown]; it needs a signed-in account and a network call, and the content flows from the server to the device, not the reverse.
- Local inference needs no paid plan. Reading account memory for a local model needs a sign-in because the memory is fetched from the account [inferred].

### Temporary chat promise

[code] (temporary-chat-policy.ts:1-80, plus the engine): no history, no search, no memory read, no learning, no Library files, a connector asks before each call, and no sharing. Project instructions and files are not marked temporary-excluded in the taxonomy. A temporary chat can never be inside a project, so the combination does not arise in Cloud mode.

## Differences between apps

| Surface | How context is built | Evidence |
|---|---|---|
| surface:web | Full server pipeline in Cloud mode. Settings: MemorySection, project pages. With a local model on desktop/web the client pulls `local-context`. | turn-context-service.ts; useChatStream.ts:4460 |
| surface:desktop (public) | AGENTS.md section 5 says the public Desktop shows the hosted web app, so it uses the web behavior [requirement: AGENTS.md]. The internal Tauri build has its own memory modules under apps/desktop/src-tauri/src (project_memory.rs, memory_manager.rs). I did not read them. | AGENTS.md section 5; file listing |
| surface:mobile | Cloud mode: the server assembles context, and the phone sends `personalization: false` for a temporary chat that is not personalized. Local and own-key modes: the phone injects its own `memory_facts`, personalization and past-chat context. Memory is not read in a temporary chat. | chatExecutionStore.ts:2793-2830, 3453, 5217; personalContext.ts |
| surface:cli | Three instruction tiers per trust boundary, plus account memory cache for Managed sessions only. A Local session's prompt carries all three boundaries' merged memory; BYOK and Managed carry only their own. | apps/cli/src/memory.rs; memory_pipeline.rs; cloud/memory.rs |
| surface:vscode | Two custom-instruction scopes (host, workspace), project instruction files from the workspace, an active cloud project prelude, and an account memory store. `memory.enabled` defaults to true locally. | customInstructions.ts; activeProject.ts; platform/config.ts:120 |
| surface:chrome | Account memory client and a memory sheet in the side panel. Memory bridge caches for 60 s. Page content is untrusted and must not enter global memory (requirements.md section 9). | apps/extension/src/background/memory-bridge.ts |

**Other differences found:**
- The `api` surface (public API) does not learn memory, does not recall past chats, and reads memory only if the request opts in (turn-context-service.ts:70-75). It also skips custom instructions (request-processor.ts:3993).
- The memory tools are offered only on `AMBIENT_TOOL_SURFACES` (the apps and the Chrome extension). Exact membership not read.
- Typed memory commands: web, desktop and mobile run them from the client; the other surfaces label their source (memory-commands.ts:42-56).

## Failure handling

| Failure | Behavior | Evidence |
|---|---|---|
| Memory policy read fails | Treated as disabled; the turn continues without memory | turn-context-service.ts:292-301; request-processor.ts (UNREADABLE_MEMORY_POLICY) |
| Workspace policy unreadable | All classes closed (fail closed) | managed-memory-context-service.ts:173-215 |
| Custom instructions read fails | Logs a warning; sends none | turn-context-service.ts:283-291 |
| One context loader throws | That class is dropped and the manifest marks it failed; the turn continues | engine.ts:142-150; turn-context-service.ts:190-195 |
| Whole assembly throws, no project | Logs an error; continues without memory and past chats | turn-context-service.ts:320-326 |
| Whole assembly throws, project present | The turn is refused with a project-load failure; no model call | request-processor.ts:4247-4262 |
| Project missing, archived or deleted | HTTP 409 `project_context_unavailable` | request-processor.ts:3862-3880 |
| Past-chat recall fails | A notice tells the model not to claim it checked other chats; no sources shown | turn-context-service.ts:225-236; PAST_CHAT_DEGRADED_NOTICE |
| Manifest write fails | Logged only; never blocks the turn | turn-context-service.ts:198-207 |
| Auto-memory write fails | Logged; the chat completion still succeeds | managed-auto-memory-service.ts:persistTurnCandidates |
| Model extraction fails or is refused | Falls back to the pattern facts | model-memory-extraction.ts |
| Never-remember list unreadable | The write is refused with "nothing was saved" | memory-write-service.ts:readExclusions |
| Project file without extracted text | Named in a fenced notice so the model says it could not read it | project-context-service.ts:759-763 |
| File too large for the turn | Named as omitted; the model is told to say so | project-context-service.ts:753-757 |
| Project in a failed or resumed turn | Resume checks the saved policy snapshot; if the workspace policy changed, the user must start a new turn | context-policy-snapshot.ts |
| Local-model personal context cannot be fetched | `personalContextMissing` is flagged to the local turn runner; an offline refresh keeps old data until a 401 or 403 clears it | useChatStream.ts:4502; local-personal-context.ts:90-104 |

## How it should work

The sections below mark which parts of the design are already met and which are proposals.

**Already met in code** [code]:
- One hierarchy and one set of checks for every context source, with a manifest that explains each turn.
- Memory, past chats and project files are fenced and treated as data, not commands.
- Temporary chats are excluded and cannot be in projects.
- Workspace policy overrides the user, and fails closed.

**Requirements the code should keep meeting** [requirement: docs/product/requirements.md sections 9.6 and 18]:
- Memory is viewable, editable, deletable, switchable, project-bounded and importable.
- Temporary chats do not update or reference memory.
- Browser data never enters global memory.
- Local-only sensitive data never silently enters synced memory.

**Proposals** [proposed]:
1. Pass a real token budget (`budget`) to `resolveContext` in the web turn, so the engine's token ceiling and compaction apply. Today only character caps apply.
2. Set `actor.sharedProject` when the project is shared, so personal memory cannot be drawn into a shared project. Nothing sets it today.
3. Show the manifest to the user ("why did this reach the turn?"). The taxonomy has an `explanation` sentence per class, but I found no user-facing viewer.
4. State per surface, in one place, whether a Local or BYOK turn may receive account memory, and make every surface follow it.

## Gaps

Each gap is [code] unless marked.

1. **Token budget not used on the web turn.** `resolveContext` is called without `budget` (turn-context-service.ts:179-196), so only per-loader character caps and the project character cap bound the context. The engine's token ceiling and `compactable` path are unused here.
2. **`sharedProject` is never set.** No caller sets `actor.sharedProject`, so the `personal_scope` exclusion cannot fire (engine.ts:130; grep over apps and packages). Separately, `loadProjectContext` selects only projects where `user_id` is the caller (project-context-service.ts:206-209). How chats of a non-owner member of an org-shared project get their project context is [unknown].
3. **Taxonomy classes with no producer.** `library_file`, `user_upload`, `connector_result`, `web_result`, `security_policy`, `template_instruction` and `local_repository_instruction` have `producedBy: []` in the taxonomy (context-source.ts:171-end). They are declared but not emitted as typed sources by the engine path I read. Connector context is added by a separate path (request-processor.ts:4283-4300).
4. **Project instruction and knowledge files in temporary chats.** Both classes are not marked temporary-excluded. This is safe today only because temporary chats cannot join a project. The local-model path says chats with a local model are temporary and cannot be saved in a project (`LOCAL_MODEL_PROJECT_REFUSAL`).
5. **Doc metadata understates surfaces.** `lib/support/doc-metadata.ts:219` lists the help topic `memory` for web and desktop only, while the surface feature matrix and code show memory on mobile, CLI, VS Code and Chrome.
6. **CLI Local sessions read all boundaries' memory.** The CLI comment says a Local session's prompt carries all three merged memory files (memory_pipeline.rs header). That is by design, but it should be checked against AGENTS.md section 6 (no silent cross-boundary routing). [unknown] whether this is intended.
7. **Web local-model path fetches account memory.** See "Rules" above: whether this honors the trust boundary rules is [unknown].
8. **Within-layer order is implicit.** Blocks of the same layer keep message-array order, which depends on `unshift` call order in request-processor.ts. A test locks cross-layer order (system-assembly-order.test.ts), but I did not confirm a test for same-layer order.
9. **No verification record.** I found no document recording a real run of these paths. Nothing here is [executed].

## How to verify

I did not run anything (read-only task). These are the checks to run, using the commands inventory at `docs/agent-context/commands.json` and the rules in AGENTS.md section 12.

1. **Contract tests:** run the vitest suites in `packages/contracts/context` and `packages/platform/context-engine` (instruction order, trust mismatches, engine admission, budget and boundary cases).
2. **Web service tests:** run through `apps/web` package scripts (apps/web uses its own Vitest major, so never the root binary): `lib/services/__tests__/context-resolution-engine.test.ts`, `managed-memory-context-service.test.ts`, `memory-eligibility-gate.test.ts`, `memory-lifecycle.test.ts`, `past-chat-context-service.test.ts`.
3. **Chat route tests:** `request-processor.memory.test.ts` (temporary chat, per-chat toggle, past chats, API surface), `request-processor.project-precedence.test.ts`, `request-processor.system-assembly-order.test.ts`.
4. **Custom instructions reach the model:** `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts`.
5. **Local-model path:** `apps/web/features/chat/lib/LocalPersonalContext.test.tsx` and `packages/contracts/types/src/__tests__/memory-wire.test.ts`.
6. **Guards:** `pnpm check:llm-operability` (includes `check:mock-exports`) and `pnpm check:trust-boundaries`.
7. **By hand, as a person would** (per the owner's preference for human-style verification): with a seeded account, turn Memory on, say "remember that I prefer short answers", open a new chat and ask what you prefer; repeat in a temporary chat and confirm nothing is recalled or saved; set a project to "only its own memories" and confirm global facts do not appear; add a long file to a project and ask about a late passage.
8. **Manifest check:** after a turn, read the row in table:context_manifests and confirm included, excluded and exclusion reasons match the settings used (no row for a temporary chat).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Instruction hierarchy has six layers, highest first: system, developer, project, personalized, memory, untrusted_context. Memory and untrusted_context are reference-only. | read in the code | `packages/contracts/context/src/instruction-precedence.ts:11-26` |
| Project instructions outrank the account's custom instructions; a losing instruction layer is 'narrowed', a losing memory layer is 'ignored', a losing untrusted layer is 'quoted'. | read in the code | `packages/contracts/context/src/instruction-precedence.ts:156-172` |
| Project knowledge files map to the untrusted_context layer; project instructions to project; account memory, past chats and sibling project chats to memory. | read in the code | `packages/contracts/context/src/instruction-precedence.ts:48-63` |
| The stable system preamble is ordered system, developer(study), project, personalized (custom instructions then chat instruction); recalled and untrusted blocks go after the cache boundary. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2107-2137`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6218-6240` |
| Memory is off by default for a user: capabilities.memory must be true. generateFromHistory defaults on, searchPastChats off, includeSensitiveTopics off, tool-assisted generation off. | read in the code | `apps/web/features/settings/hooks/use-capabilities-preferences.ts:60-69`; `apps/web/lib/services/managed-memory-context-service.ts:258-282` |
| A temporary chat reads no account memory, no past chats and learns nothing; no context manifest is stored for it. | read in the code | `apps/web/lib/services/turn-context-service.ts:124-131`; `apps/web/lib/services/turn-context-service.ts:198`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4126-4131`; `apps/web/lib/services/managed-memory-context-service.ts:570-591` |
| A temporary chat cannot be in a project; conversation create rejects projectId with isTemporary, and the policy file states the refusal text. | read in the code | `apps/web/app/api/chat/conversations/route.ts:230`; `apps/web/lib/temporary-chat-policy.ts:50-52` |
| Temporary chat rows are purged after 30 days by a cron, unless a legal hold applies. | read in the code | `apps/web/app/api/cron/purge-temporary-chats/route.ts:20-45` |
| Temporary chats keep custom instructions by default; a 'personalized' toggle (default on) turns them off by sending personalization=false, which also forces memory_enabled=false. | read in the code | `apps/web/shared/stores/web-chat-store.ts:1030`; `apps/web/lib/hooks/useChatStream.ts:835-840`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523`; `apps/mobile/stores/settingsStore.ts:138` |
| Memory read caps per turn: 30 memories, 1,000 chars each, 8,000 total, from up to 500 candidates ranked by pinned then relevance. | read in the code | `apps/web/lib/services/managed-memory-context-service.ts:67-72`; `apps/web/lib/services/managed-memory-context-service.ts:1099-1127` |
| Project limits: name 200, description 2,000, instructions 10,000 chars; up to 40 knowledge files; 16,000 chars per file and 48,000 total in a turn. | read in the code | `packages/contracts/cloud-contracts/src/project-contract.json`; `packages/contracts/types/src/suite-contracts.ts:502`; `apps/web/lib/services/project-context-service.ts:79-87` |
| Custom instructions text is capped at 2,000 chars; 'about you' at 1,500; preferred name 60; work description 120. | read in the code | `apps/web/lib/server/user-identity.ts:20`; `apps/web/lib/server/user-identity.ts:150-176` |
| A project can opt out of account custom instructions and style (uses_account_instructions, uses_account_style) and out of global memory (uses_global_memory); memory written in a project is project-scoped. | read in the code | `apps/web/lib/server/user-identity.ts:213-247`; `apps/web/lib/services/managed-memory-context-service.ts:1085-1089`; `apps/web/lib/services/managed-auto-memory-service.ts:persistTurnCandidates` (not found) |
| The workspace policy row governs memory, past chats, connector results and web results; a missing or unreadable row closes everything. | read in the code | `apps/web/lib/services/managed-memory-context-service.ts:173-215`; `packages/platform/context-engine/src/permissions.ts:57-66` |
| The engine spends the budget in a different order than it reads: user uploads and account memory outrank project files and past chats when space is short. | read in the code | `packages/contracts/context/src/context-source.ts:154-169`; `packages/platform/context-engine/src/engine.ts:89-93` |
| The web turn passes no token budget to the engine, so only character caps bound context. | read in the code | `apps/web/lib/services/turn-context-service.ts:179-196` |
| No caller sets actor.sharedProject, so the 'personal_scope' exclusion is never triggered in current callers. | read in the code | `packages/platform/context-engine/src/engine.ts:130`; `packages/platform/context-engine/src/types.ts:14` |
| Memory and Projects capabilities are in the Cloud chat tiers (free through enterprise); local-only and byok tiers are not in that list. Free allows 5 projects and 500 MiB of knowledge storage. | read in the code | `packages/contracts/types/src/billing-catalog.ts:322-350`; `packages/contracts/types/src/billing-catalog.ts:615-625`; `apps/web/lib/services/free-plan-entitlements.ts:10-16` |
| Memory writes are refused for prohibited categories, temporary chats, workspace or user memory off, sensitive topics without opt-in, non-generating source classes, non-managed trust modes, and never-remember terms. | read in the code | `apps/web/lib/services/managed-memory-context-service.ts:533-672`; `apps/web/lib/services/memory-write-service.ts:36-45`; `packages/contracts/context/src/memory-content-policy.ts:1-23` |
| Automatic memory learning takes at most 5 pattern-matched facts per turn; a model-based extractor is on unless AGI_MODEL_MEMORY_EXTRACTION is 0/false/off/no, runs after the response, and is metered as feature memory_extraction. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2410-2440`; `apps/web/lib/services/model-memory-extraction.ts:50-82`; `apps/web/lib/services/managed-auto-memory-service.ts:136-217` |
| The API surface is opt-in for memory, never recalls past chats, and skips custom instructions. | read in the code | `apps/web/lib/services/turn-context-service.ts:70-75`; `apps/web/lib/services/turn-context-service.ts:128-129`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993` |
| Mobile Cloud mode lets the server assemble context; mobile local and own-key modes inject on-device memory_facts and personalization and skip memory in temporary chats. | read in the code | `apps/mobile/stores/chat/chatExecutionStore.ts:2793-2830`; `apps/mobile/storage/memory.ts:1-50` |
| The CLI keeps instruction files per trust boundary (CLAUDE.md for Local, CLAUDE.byok.md, CLAUDE.managed.md) and merged memory files per boundary; BYOK and Managed sessions read only their own boundary's file, a Local session reads all three. | read in the code | `apps/cli/src/memory.rs:44-58`; `apps/cli/src/memory_pipeline.rs:1-45` |
| With a local model on the web client, account instructions and memory are fetched from api:GET /api/memory/local-context and cached for 60 s; memory is withheld when the chat is temporary or memory is off. | read in the code | `apps/web/app/api/memory/local-context/route.ts:12-31`; `apps/web/features/chat/lib/local-personal-context.ts:30,60-104`; `packages/contracts/types/src/memory-wire.ts:199-212` |
| Model-assisted auto-memory is a recorded founder decision and temporary chats, Memory-off sessions, API and ZDR traffic stay excluded. | stated requirement | `docs/decisions/2026-09-15-founder-decisions.md:53-61` |
| Project knowledge files are fenced as untrusted data with an instruction not to follow text inside them; files with no extracted text or that did not fit are named so the model says so. | read in the code | `apps/web/lib/services/project-context-service.ts:732-763` |
| No document in the project records a real run of the memory or project-context paths; nothing here is verified by execution. | unknown | `Read-only task; no run record found` (not found) |

## Open questions

- Do chats of a non-owner member of an org-shared project receive project instructions and files? loadProjectContext selects only projects owned by the caller (project-context-service.ts:206-209), yet other routes use a shared-read scope (project-read-access).
- Is it intended that the web local-model path fetches account memory and instructions from the server (api:GET /api/memory/local-context) for a Local-mode turn? AGENTS.md section 6 says Local must not silently route to managed cloud; here content flows server-to-device with a sign-in, and the product decision is not stated in code.
- Is it intended that a CLI Local session reads all three boundaries' merged memory files while BYOK and Managed read only their own?
- What exactly does the internal Tauri desktop build do for memory and projects (apps/desktop/src-tauri/src/core/agi/project_memory.rs, memory_manager.rs, sys/commands/memory.rs)? I did not read these.
- Which surfaces are in AMBIENT_TOOL_SURFACES (the set that gets memory tools and file-search)? Only inferred as the apps plus Chrome.
- Should the engine's token budget be passed on the web turn? The code leaves it unset; the product choice is undecided.
- How do plan tiers max and team_premium limit projects and knowledge storage? Only free, basic, pro, max_15x and team were read.
- What do mobile's cloud memory mirror and VS Code's account memory store persist on the device, and how long?
- Does any test lock the order of blocks inside a single layer (for example account memory versus past chats)?
- Is there a user-facing view of the context manifest ('why did this reach the turn')? I found the data and explanation strings but no viewer.

## Project documents found out of date

- `apps/web/lib/support/doc-metadata.ts (help topic 'memory' availability)`: Lists the memory help topic for surfaces web and desktop only The code says: Memory clients exist and are wired on mobile, CLI, VS Code and Chrome, and docs/product/surface-feature-matrix.md lists memory present on all six apps (apps/web/lib/support/doc-metadata.ts:219; docs/product/surface-feature-matrix.md:202-210; apps/mobile/app/(app)/settings/memory.tsx; apps/cli/src/cloud/memory.rs; apps/extension-vscode/src/memory/accountMemoryStore.ts; apps/extension/src/background/memory-bridge.ts)
- `apps/web/lib/temporary-chat-policy.ts (TEMPORARY_CHAT_RETENTION_NOTE and the comment above it)`: Says memory is skipped by 'resolveInteractiveTurnContext leaving it out of a temporary turn' and that history is refused by `persistConversationMessage`; the user text says messages are never saved The code says: Memory is withheld by resolveInteractiveTurnContext (matches), but a web_conversations row with is_temporary=true is created and purged by a 30-day cron, so the row exists until purge; the end-chat copy says 'never written to your history'. Whether message rows are written at all was not confirmed in this pass (apps/web/app/api/chat/conversations/route.ts:273; apps/web/app/api/cron/purge-temporary-chats/route.ts:20-45; apps/web/lib/temporary-chat-policy.ts:20-45)
- `apps/web/db/neon/0050_temporary_chat_retention.sql header comment`: Points to docs/products/agi-mobile/volume-23-settings.md, a path that is not in the current docs tree (docs/product has no such file) The code says: The current documentation homes are docs/product/ and docs/compliance/; I did not find the cited file (apps/web/db/neon/0050_temporary_chat_retention.sql:1-5; ls docs/product)
