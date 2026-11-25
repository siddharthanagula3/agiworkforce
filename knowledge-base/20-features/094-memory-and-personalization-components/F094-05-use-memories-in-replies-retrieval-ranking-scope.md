---
id: "F094-05"
type: "feature"
title: "Use memories in replies (retrieval, ranking, scope)"
aliases: ["Memory retrieval (S94.05)", "Memory relevance ranking (S94.06)", "Personal versus Project scope resolver (S94.13)", "memory injection", "account_memory context source", "uses_global_memory", "Memory used chip", "local-context"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.05", "S94.06", "S94.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "table:user_memories", "table:user_projects", "table:user_settings", "api:GET /api/memory/local-context", "file:apps/web/lib/services/managed-memory-context-service.ts", "file:apps/web/lib/services/turn-context-service.ts", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-execution-boundaries", "SYS-local-inference", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "F094-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-05 Use memories in replies (retrieval, ranking, scope)

For each Cloud chat turn the server loads the account's saved memories, keeps those that fit the chat (not deleted, expired, superseded, hidden by source, or from another workspace or project), ranks them by word overlap with the request with pinned ones first, and adds up to 30 to the model's system context.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.05](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9405), [S94.06](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9406), [S94.13](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9413).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Makes replies use what the person saved. It selects, ranks, trims and fences memory text and adds it as a system message, and returns citations so apps can show which memories were used (apps/web/lib/services/managed-memory-context-service.ts:1128-1213,1281-1302,1315-1317; apps/web/lib/services/turn-context-service.ts:216-239).

**Why it exists.** Saved memory is only useful if the right facts reach the model, within a size budget, without leaking across projects or workspaces (doc: docs/product/definition.md:200-203; doc: docs/product/experience-contract.md:547-558).

**Who uses it.** Every Cloud chat user with memory on; also local-model turns on Web through the local-context route.

**Problems it solves**

- Replies stay personal without the person repeating facts.
- Project-only facts do not appear in unrelated chats.
- Memory off at account or workspace level really stops reading, not only writing.

**Use cases**

- Ask 'plan my week' and the assistant already knows the person works night shifts.
- Inside a project set to its own memory only, account facts are not used.
- A local-model chat on Web gets the person's memory text through /api/memory/local-context.

## 2. User experience

**Where to find it**

- Automatic in every Cloud chat on Web, Desktop (hosted web app), Mobile Cloud, CLI Managed, VS Code and Chrome extension when they use Managed Cloud.
- Project setting on Web: a switch in the project settings dialog for using account memory (apps/web/features/projects/components/ProjectSettingsDialog.tsx:78,387; label text not read).
- Mobile chat shows a 'memory used' chip (apps/mobile/src/features/chat/components/MemoryUsedChip.tsx).
- Settings > Memory scope table: 'Account', 'Workspace', 'Project' with meanings (apps/web/features/settings/sections/MemorySection.tsx:43-55).

**Before you start**

- Persistent memory on; workspace memory not off; not a temporary chat; per-chat memory override not false; personalization not false (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523,4126-4131).
- For Managed sessions on the CLI the account memory cache must belong to the signed-in owner and memory must not be off (apps/cli/src/cloud/mod.rs:908-925).

**Screens and controls**

- Settings > Memory switches; project 'uses global memory' switch; per-chat memory toggle in the composer (the request field memory_enabled; control not located).
- Memory sources suppression in Settings (apps/web/features/settings/components/MemoryExclusions.tsx:312 cited by brief S94.17).

**Journey**

1. The person sends a message in a Cloud chat.
2. The server reads the policy and the active memories for the account, workspace and project.
3. It ranks them against the message, trims to limits and adds one fenced system message.
4. The model answers using them.
5. The response header and message metadata list memory citations so the app can show which were used (packages/contracts/types/src/memory-wire.ts:9-10).

**What the person sees and gets**

- Citations: id and an excerpt of up to 240 chars per memory (packages/contracts/types/src/memory-wire.ts:10,160-175).
- Mobile 'memory used' chip; Web display of citations not located.

**Settings**

- capabilities.memory, per-chat memory_enabled, personalization, project uses_global_memory, workspace allowMemory, memory.suppressedSources, memory.excludedTerms (those apply to writes).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Policy gate: if the policy is not enabled, nothing is read ('memory_disabled') (apps/web/lib/services/managed-memory-context-service.ts:1143-1146).
- Query: user's rows that are active (not deleted, not superseded, not expired), source not in the suppressed list, project scope predicate, workspace predicate, and free of Google user data; ordered pinned then updated; limit 500 candidates (apps/web/lib/services/managed-memory-context-service.ts:1148-1186).
- Scope: loose chat reads global rows only; project reads its own plus global unless the project opted out (apps/web/lib/services/managed-memory-context-service.ts:1085-1089,1264-1279). An unreadable project falls back to global only.
- Ranking: words of 3+ chars, weight log((N+1)/(df+0.5)); sort pinned first, then score, then original order; without query words the query order stays (apps/web/lib/services/managed-memory-context-service.ts:1091-1126). Top 30 are kept (line 67).
- Formatting: each memory cut to 1,000 chars, total 8,000 chars, category kept, output JSON inside a fenced untrusted-content block (apps/web/lib/services/managed-memory-context-service.ts:1281-1302). The block is added as the first system message (apps/web/lib/services/managed-memory-context-service.ts:1315-1317; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4343-4346).
- Memory is one source of the context resolution engine with a budget of 8,000 chars (apps/web/lib/services/managed-memory-context-service.ts:1228-1262).
- Failures: a policy read failure logs 'Managed memory load failed; continuing without account memory'; a context failure continues without memory, unless a project context was required, in which case the turn is not sent (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4152-4160,4254-4268).
- Web local-model turns fetch /api/memory/local-context (instructions, memory text, citations) and add it to the local prompt when personalization is on and the chat is not temporary (apps/web/app/api/memory/local-context/route.ts:12-28; packages/contracts/types/src/memory-wire.ts:182-205).
- Mobile Cloud: the server assembles context (apps/mobile/stores/chat/chatExecutionStore.ts:2800-2803). Mobile Local: top 5 on-device facts, up to 50 facts, 1,000 chars each, 8,000 total, fenced (apps/mobile/stores/chat/chatExecutionStore.ts:2805; apps/mobile/src/features/memory/services/personalContext.ts:16-33).
- CLI: a Managed session's prompt carries the cached account memory for the linked project; Local and BYOK sessions do not (apps/cli/src/cloud/mod.rs:908-925).
- VS Code adds up to 50 account facts per turn to the chat input (apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:367-370; apps/extension-vscode/src/memory/memoryStore.ts:30).

**Incomplete**

- Ranking is word overlap only; a shadow relevance experiment runs but changes nothing (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4907-4912).
- Memory sources from 'cli', 'vscode', 'chrome' cannot be suppressed by source (apps/web/lib/services/managed-memory-context-service.ts:317).
- Mobile Cloud's own relevance function in the persisted store is used for the offline path (apps/mobile/src/features/memory/store.ts:589-619).

**Present but disconnected or switched off**

- Own-key (BYOK) turns: whether the server injects account memory for own-key provider routes was not established; the CLI explicitly gives none to BYOK sessions (apps/cli/src/cloud/mod.rs:913-915).
- The brief's code line numbers for request-processor (1278, 2904) no longer match the file; current lines are cited here.

**Not available**

- Semantic (embedding) retrieval: none found in the retrieval path.
- Per-agent memory (S94.14) missing in the brief.

## 4. Required behaviour

**Established requirements**

- Saved memories are retrieved into the model context for a turn, scoped and filtered. (source: S94.05)
- Retrieved memories are ranked by relevance to the current request. (source: S94.06)
- A resolver decides whether personal, workspace or project memory applies to a turn. (source: S94.13)
- Project-only facts stay in their project; temporary chats neither read nor write memory. (source: doc: docs/product/experience-contract.md:779)
- Memory scopes: Cloud global, Cloud project, Work-project, Mobile local, developer workspace; each entry needs scope and provenance. (source: doc: docs/product/experience-contract.md:547-558)
- Nothing may silently route a Local chat to BYOK or managed cloud; a Local-to-BYOK move is an explicit fork with consent. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With memory on, a Cloud reply uses a saved fact relevant to the question.
2. With memory off (account, workspace, or per-chat), the request contains no memory block.
3. A project-only memory never appears in a loose chat; with the project set to its own memory, global memories do not appear in that project.
4. A pinned memory outranks an unpinned one with higher word overlap.
5. A deleted, expired or superseded memory is never injected.
6. No more than 30 memories and 8,000 characters are added, each at most 1,000 characters.
7. If the memory read fails, the chat still answers.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- On Web, sending account memory to a local model happens only on the person's own device after sign-in; this should be disclosed as the account memory leaving the Cloud for the device [inferred from apps/web/app/api/memory/local-context/route.ts].
- Own-key turns should follow an explicit rule for account memory; not established.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add embedding-assisted ranking behind the existing shadow experiment once it shows gain.
- [proposed] Show memory citations on Web replies as Mobile does.
- [proposed] Add the CLI, VS Code and Chrome sources to the suppressible sources.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | loadManagedMemoryContext | `apps/web/lib/services/managed-memory-context-service.ts` | Query, ranking, citation sources |
| service | rankMemoriesByRelevance | `apps/web/lib/services/managed-memory-context-service.ts` | Word-overlap ranking with pinned first |
| service | memoryScopePredicate and loadProjectMemoryScope | `apps/web/lib/services/managed-memory-context-service.ts` | Personal versus project scope |
| service | formatManagedMemorySystemPrompt | `apps/web/lib/services/managed-memory-context-service.ts` | Limits and fenced JSON block |
| service | managedMemoryContextLoader | `apps/web/lib/services/managed-memory-context-service.ts` | Source for the context resolution engine |
| service | turn-context-service | `apps/web/lib/services/turn-context-service.ts` | resolveInteractiveTurnContext, citations, local personal context |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Policy read, enrichment phase, apply memory prompt, tool capability |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Memory text for local-model turns |
| hook | local-personal-context | `apps/web/features/chat/lib/local-personal-context.ts` | Caches the local context for 60 s per workspace owner |
| schema | memory-wire local context | `packages/contracts/types/src/memory-wire.ts` | ManagedMemoryLocalContextResponse and turn settings |
| table | user_projects | `apps/web/db/neon/0135_project_scoped_memory.sql` | uses_global_memory flag; project_id on memories |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | Source rows |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | usesGlobalMemory switch |
| service | memory tools | `apps/web/lib/server/tools/memory-tools.ts` | search_memory tool over the same loader |
| service | mobile personalContext | `apps/mobile/src/features/memory/services/personalContext.ts` | On-device memory block |
| store | mobile retrieveMemoryContext | `apps/mobile/src/features/memory/store.ts` | Cloud and local retrieval on the phone |
| service | CLI account memory context | `apps/cli/src/cloud/mod.rs` | account_memory_context_for, Managed sessions only |
| service | VS Code chat participant | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` | Adds account memory turn facts |
| test | managed-memory-context-service tests | `apps/web/lib/services/__tests__/managed-memory-context-service.test.ts` | Retrieval tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The chat request arrives; personalization=false forces memory_enabled=false. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523 |
| The memory policy (workspace and user) is read in parallel with attachments; a temporary chat gets a disabled policy; a failure becomes 'unreadable' and the turn continues without memory. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4126-4192 |
| resolveInteractiveTurnContext loads memory with the last user message as the query, the project scope, suppressed sources and workspace. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4236-4252 |
| Rows are read (500 candidates), ranked, cut to 30, formatted to at most 8,000 chars, fenced as untrusted data. | our servers | apps/web/lib/services/managed-memory-context-service.ts:1148-1204,1281-1302 |
| The block is inserted as a system message and citations are attached to the response. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4343-4346,6888-6890 |
| The provider model receives the request and answers. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts (provider call; SYS-chat-turn-pipeline) |
| Local-model turn on Web: the browser or desktop app fetches /api/memory/local-context and builds the local prompt on the device. | device and our servers | apps/web/features/chat/lib/local-personal-context.ts:1-60; apps/web/app/api/memory/local-context/route.ts:12-28 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory text injected into the prompt and citations (id, 240-char excerpt) | Not stored as memory; the turn manifest may record the sources (apps/web/lib/services/turn-context-service.ts:196-205); citations travel with the message | With the chat | With the chat |
| Cached local context on Web | In-memory module cache, 60 s stale time | No | Dropped on workspace change (apps/web/features/chat/lib/local-personal-context.ts:19-60) |

**Models and providers.** Memory is added as plain system text, so any chat model that accepts a system message can use it. Whether a provider sees the memory depends on the route: Cloud routes receive it; Local models receive it only through local-context on the device. Memory tools (search_memory) need a tool-capable model (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123-1130). No model identifiers are written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for cloud memory; rows keyed by user id. |
| Permissions | Workspace policy allowMemory; project ownership checked in loadProjectMemoryScope (apps/web/lib/services/managed-memory-context-service.ts:1264-1279). |
| Subscription | none found in the code for retrieval. |
| Limits and metering | 500 candidates, 30 injected, 1,000 chars each, 8,000 chars total, relevance terms of 3+ chars (apps/web/lib/services/managed-memory-context-service.ts:67-72). Citation excerpt 240 chars. |
| Feature flags | Per-request memory_enabled and personalization; none server-side flags found. |
| Model compatibility | Any model; tool-based memory search needs tool support. |
| Provider restrictions | Memory containing Google user data is excluded from reads and from learning (apps/web/lib/services/managed-memory-context-service.ts:1179-1182). Zero-data-retention rules for memory reading: not found. |
| Local mode | Web: local-model turns use /api/memory/local-context when signed in (needs account and network); with no account no account memory. Mobile Local uses only on-device facts and never account memory (apps/mobile/stores/chat/chatExecutionStore.ts:2796-2805). CLI Local gets Local-boundary files only (apps/cli/src/memory_pipeline.rs:1-12). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | No memories gives a null prompt and nothing is injected. | apps/web/lib/services/managed-memory-context-service.ts:1297 |
| Off | Disabled policy returns an empty list with skip reason memory_disabled; a workspace that closed memory shows the closed state. | apps/web/lib/services/managed-memory-context-service.ts:1143-1146; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4144 |
| Error | Continue without memory and log; a project context failure stops the request before the model call. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4254-4268 |
| Memory state telling the model | States 'on', 'off_for_chat' or 'unavailable' are given to the prompt so the model does not claim memory it lacks. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2242-2265 |
| Account switch | Local-context cache is retired when the workspace owner changes. | apps/web/features/chat/lib/local-personal-context.ts:46-60 |
| Timeout | Enrichment time is measured as a phase; a specific memory timeout: not found. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4236 |
| Offline | Mobile Cloud retrieval uses the persisted cloud copy; Web local turn without network gets no account memory [inferred]. | apps/mobile/src/features/memory/store.ts:589-596 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/managed-memory-context-service.test.ts`: Retrieval service (by file name; contents not read)
- `apps/web/lib/services/__tests__/project-scoped-memory.test.ts`: Project scope (by file name)
- `apps/web/app/api/memory/__tests__/withdrawn-project-scope.test.ts`: Withdrawn project scope (by file name)
- `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`: Exclusion enforcement (by file name)
- `apps/web/lib/services/__tests__/memory-lifecycle.test.ts`: SQL excludes deleted, superseded, expired; workspace and personal separation
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Chat memory behaviour (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory-state.test.ts`: Memory state wording (by file name)
- `apps/web/lib/runtime/__tests__/memory-capability.test.ts`: Memory capability (by file name)
- `packages/contracts/types/src/__tests__/memory-wire.test.ts`: Wire parsers and local turn context (by file name)

**Test scenarios**

- **Relevant recall**
  1. Save 'I take the 7am train' and 'I like jazz'.
  2. Ask 'what time should I leave for the station?'
  - Expected: The reply uses the train fact; the injected block lists it first among unpinned.
- **Scope**
  1. Create a memory inside a project.
  2. Ask about it in a loose chat and in the project.
  3. Switch the project to its own memory only and ask for an account fact.
  - Expected: Loose chat does not see it; project does; account fact absent in project-only mode.
- **Switches off**
  1. Turn off 'Persistent memory'; ask a question that needs a saved fact.
  2. Repeat with the workspace policy off and with the per-chat override off.
  - Expected: No memory used in each case; nothing is deleted.
- **Limits**
  1. Save 40 memories, one very long.
  2. Inspect the request block via a test harness.
  - Expected: At most 30 memories, 1,000 chars each, 8,000 total.
- **Read failure**
  1. Force the memory policy read to throw in a test.
  - Expected: The reply still arrives; the log shows 'Managed memory load failed; continuing without account memory'.

**Where to look when it fails**

- Log 'Managed memory load failed; continuing without account memory' and 'Turn context could not be assembled; continuing without account memory or past chats'.
- Log 'Managed memory owner mismatch; continuing without account memory'.
- Trace span memory.context.load with attributes retrieval.result_count, candidate_count, ranked_by, scope (apps/web/lib/services/managed-memory-context-service.ts:1133-1198).
- Table user_memories and user_projects.uses_global_memory.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Ranking is lexical only.** Affects: All Cloud users; paraphrases miss.. Evidence: apps/web/lib/services/managed-memory-context-service.ts:1091-1126. Work needed: Evaluate embedding ranking using the shadow hook.
- **Own-key (BYOK) account-memory rule not established; Local-to-BYOK consent rule applies.** Affects: Web, Desktop own-key users.. Evidence: doc: AGENTS.md section 6. Work needed: Trace how an own-key turn reaches the chat route and whether memory is added.
- **Web local-model turns receive account memory through a network fetch; no offline fallback.** Affects: Web and Desktop users on local models.. Evidence: apps/web/app/api/memory/local-context/route.ts:12-28. Work needed: Decide on offline cache or a device store.
- **Brief code references for request-processor are stale.** Affects: Documentation.. Evidence: knowledge-base/data/area-briefs/094-memory-and-personalization-components.md S94.05 cites request-processor.ts:2904. Work needed: Update the brief.
- **Web display of memory citations not located.** Affects: Web.. Evidence: packages/contracts/types/src/memory-wire.ts:9-10. Work needed: Check where the header is read.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- mode:own-key
- table:user_memories
- table:user_projects
- table:user_settings
- api:GET /api/memory/local-context
- file:apps/web/lib/services/managed-memory-context-service.ts
- file:apps/web/lib/services/turn-context-service.ts
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-execution-boundaries
- SYS-local-inference
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- F094-03

## Unknown

- Whether own-key turns on Web receive injected account memory.
- Where Web displays memory citations.
- How the Web composer toggles the per-chat memory override (control not located).
- Project settings label text for the global-memory switch.
- Whether the Chrome extension chat path injects memory.
