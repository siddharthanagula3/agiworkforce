---
id: "F093-01"
type: "feature"
title: "Per-turn context assembly"
aliases: ["Context engine", "resolveContext", "Turn context", "Context manifest builder", "Context selection", "Context-source registry", "S93.01", "S93.02", "S93.04"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.01", "S93.02", "S93.04"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "surface:web", "mode:cloud", "table:context_manifests", "file:packages/platform/context-engine/src/engine.ts", "F093-02", "F093-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-01 Per-turn context assembly

Per-turn context assembly is the server step that decides which memory, past-chat, project-instruction and project-file items go into one chat turn. It checks the user's switches, workspace policy and ownership, applies per-source size caps, and stores a manifest of what was included or left out. It runs for the web chat endpoint and the Free chat path.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.01](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9301), [S93.02](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9302), [S93.04](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9304).

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

**What it does.** For each chat turn the server builds a list of context sources (account memory, past chats, project instructions, project knowledge files, other chats in the project), refuses classes the user or workspace has switched off, drops duplicates and stale items, applies per-source character caps, and records a manifest of what was included and excluded and why (packages/platform/context-engine/src/engine.ts:162-321; apps/web/lib/services/turn-context-service.ts:105-243).

**Why it exists.** Without one gate, each loader would do its own permission and policy checks, and nobody could explain afterwards why the assistant knew something; the engine comment says the checks are the engine's, not each loader's (engine.ts:157-161; apps/web/db/neon/0252_context_manifests_and_source_policy.sql:6-11).

**Who uses it.** Every person who chats through the managed Cloud chat endpoint gets it without choosing anything; engineers and support use the manifest to explain a turn [inferred from the stored table].

**Problems it solves**

- A switched-off setting or a temporary chat cannot leak personal context into a turn (engine.ts:115-132).
- A failing source cannot break the whole turn (engine.ts:134-144).
- The same fact stated by memory and by a past chat is sent once (engine.ts:215-220).
- A turn can be explained after the fact from stored counts and ids, without keeping the text (types.ts:116-120).

**Use cases**

- A user with Memory on asks a question and relevant saved memories are added.
- A user in a project asks about an uploaded file and the project instructions, matching file passages and sibling chats are added.
- A user starts a temporary chat and no memory or past chats are added.
- A scheduled agent run assembles memory and recent chats through the same engine (apps/web/lib/services/scheduled-agent-executor.ts:446-472).

## 2. User experience

**Where to find it**

- Web: no screen of its own; the effect appears in every Cloud chat. The switches that feed it are in Settings, Memory: 'Search past chats' and the memory switch (apps/web/features/settings/sections/MemorySection.tsx:409-416).
- Desktop (Electron) shows the hosted web app, so it gets the same server assembly [inferred from AGENTS.md section 5, doc: AGENTS.md].
- Mobile: when the execution mode is cloud the server assembles context (apps/mobile/stores/chat/chatExecutionStore.ts:2800).
- CLI, VS Code extension, Chrome extension: not established; no call to this engine was found in those folders. unknown.

**Before you start**

- A signed-in account on the Cloud chat route.
- For memory: the memory switch on and workspace policy allowing it (turn-context-service.ts:124-127).
- For past chats: 'Search past chats' on, not a temporary chat, surface not 'api', and a non-empty question (turn-context-service.ts:128-131).

**Screens and controls**

- Settings, Memory: 'Search past chats' switch; description says 'Never used in temporary chats.' (MemorySection.tsx:409-416).
- Temporary chat toggle (label not read). unknown.
- No manifest viewer was found in the web app. unknown.

**Journey**

1. The person sends a message in a Cloud chat.
2. The chat endpoint calls resolveInteractiveTurnContext with the user, workspace, project, conversation, temporary flag, surface, memory switch and the last user message (request-processor.ts:4237-4252).
3. The service decides which sources apply and builds one loader per source class (turn-context-service.ts:124-174).
4. The engine loads, checks, dedups and caps each class and builds the manifest (engine.ts:173-321).
5. The service stores the manifest in the background unless the chat is temporary (turn-context-service.ts:198-207).
6. The kept memory, past-chat and project text is placed in the system prompt by layer (see F093-02) and the model answers.

**What the person sees and gets**

- Memory and past-chat citations returned with the turn (turn-context-service.ts:216-240).
- When past-chat reading failed, the model is told its recall is degraded (turn-context-service.ts:233-236).
- No visible 'what was included' panel found. unknown.

**Settings**

- capabilities.memory and capabilities.searchPastChats user settings (context-source.ts:182,205).
- Workspace policy flags allowMemory, allowPastChats, allowConnectorResults, allowWebResults (context-source.ts:46-51).
- Per-turn memory_enabled request field (request-processor.ts:712).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Engine admits or refuses a class before checking its items: user switch, temporary chat, shared-project personal sources (engine.ts:115-132, 187-192).
- Ownership, workspace, project and external-instruction checks run for every candidate (permissions.ts:40-56).
- Workspace policy check per class (permissions.ts:63-70).
- Duplicate-fact and stale drop, per-source character cap (engine.ts:208-226).
- Budget order is separate from reading order: CONTEXT_BUDGET_PRIORITY vs CONTEXT_SOURCE_PRECEDENCE (context-source.ts:132-169; engine.ts:82-86, 283-286).
- A loader that throws is skipped and logged; the manifest marks it failed (engine.ts:134-144, 279; turn-context-service.ts:190-195).
- Manifest stored in context_manifests, one row per turn, upsert guarded by user (manifest-store.ts:54-99).
- Project context failure refuses the turn before any model call (request-processor.ts:4254-4262).
- Scheduled runs and Slack answers also use the engine and pass the store to it (scheduled-agent-executor.ts:446-472; apps/web/lib/slack/slack-assistant-turn.ts:195-206).

**Incomplete**

- The chat caller passes no token budget or versions to resolveContext, so token ceiling, truncation and overBudget are unused for chat turns and the manifest records no token budget (turn-context-service.ts:179-196; engine.ts:229-250).
- No caller sets actor.sharedProject, so the 'personal_scope' refusal never fires in production (engine.ts:130; callers at turn-context-service.ts:181-185, slack-assistant-turn.ts:197, scheduled-agent-executor.ts:448-452).
- The manifest write for chat turns is fire-and-forget and skipped for temporary chats and recordManifest=false (turn-context-service.ts:198-207).

**Present but disconnected or switched off**

- The token-budget path in the engine is exercised by tests only (packages/platform/context-engine/src/__tests__/budget-and-boundaries.test.ts:206-290).
- Migrations 0252 and 0284 headers say 'NOT YET APPLIED : draft only' (0252:4, 0284:4); whether they are applied in any environment is unknown, and the manifest write is wrapped so a missing table only logs a warning.

**Not available**

- CLI, VS Code and Chrome extension: no use of the engine found. unknown whether they assemble context on their own.
- Desktop and mobile Local and own-key turns do not use the server engine; they build prompts on the device (apps/desktop/src/lib/context-precedence.ts:1-9; chatExecutionStore.ts:2800-2813).

## 4. Required behaviour

**Established requirements**

- A registry defines the kinds of context sources with trust and precedence, and assembly uses it. (source: S93.01 (brief); packages/contracts/context/src/context-source.ts:1-16,132-169)
- Before each turn the platform selects which context fits the budget and includes only that. (source: S93.02 (brief))
- Each turn produces a stored manifest of included and excluded sources and why. (source: S93.04 (brief); manifest-store.ts:54-99)
- Workspace policy, not the plan name, decides memory and past-chat availability. (source: turn-context-service.ts:124-131, 176-189)
- Nothing may silently route Local content to BYOK or managed cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With the memory switch off, no account memory is in the turn and the manifest shows source_disabled or no memory entry.
2. In a temporary chat, memory and past chats are excluded and no manifest row is stored.
3. When one source loader throws, the answer still arrives and a warning 'A context source failed to load; the turn continues without it' is logged.
4. When project context cannot be loaded, no model request is sent and the person gets a project-load error.
5. A normal turn writes one context_manifests row keyed by turn id with counts and a digest but no message text.
6. Two sources stating the same fact produce one included item and one duplicate_fact exclusion.
7. A workspace with allowMemory off yields policy_denied for memory even if the user switch is on.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The manifest should record a token budget for chat turns once the token path is connected [inferred from the unused fields].
- A shared project should refuse personal sources; the engine implements it but nothing turns it on [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass the model's input budget and prompt/memory/policy versions into resolveContext so the manifest explains token use.
- [proposed] Set sharedProject from the project's sharing state at every engine call.
- [proposed] Show 'why did it know that' from the stored manifest.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveContext | `packages/platform/context-engine/src/engine.ts` | Admits classes, checks each candidate, dedups, caps and builds the manifest. |
| service | permissionCheck / policyCheck | `packages/platform/context-engine/src/permissions.ts` | One ownership check and one workspace-policy check for every class. |
| schema | Context engine types | `packages/platform/context-engine/src/types.ts` | Exclusion reasons, manifest shape, assembler version, loader contract. |
| store | createPostgresContextManifestStore | `packages/platform/context-engine/src/manifest-store.ts` | Writes and reads context_manifests rows. |
| config | Context source taxonomy | `packages/contracts/context/src/context-source.ts` | Fourteen source classes with trust, switch, policy flag, temporary-chat rule, precedence and budget order. |
| service | resolveInteractiveTurnContext | `apps/web/lib/services/turn-context-service.ts` | Builds loaders for memory, past chats and project, runs the engine, stores the manifest, returns prompts and citations. |
| service | resolveFreeOfferingPersonalContext | `apps/web/lib/services/turn-context-service.ts` | Same assembly for the Free chat path, with semantic project retrieval off (lines 338-417). |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Gives a Local-model turn its instructions and memory from the server. |
| service | Chat request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Calls the assembly at line 4237 and places project blocks by layer at 4270-4276. |
| service | projectContextLoaders | `apps/web/lib/services/project-context-service.ts` | Turns project instruction, files and sibling chats into engine loaders (lines 516-552). |
| service | disabledPastChatToggles / organization policy | `apps/web/lib/services/managed-memory-context-service.ts` | Maps the past-chat switch and workspace policy to disabled toggles (lines 221-230). |
| table | context_manifests | `apps/web/db/neon/0252_context_manifests_and_source_policy.sql` | One row per turn with identities, counts, budgets and digest; row-level security by user. |
| schema | Manifest accounting columns | `apps/web/db/neon/0284_context_manifest_accounting.sql` | Adds manifest id, assembler version, token fields, temporary flag and versions. |
| job | Scheduled agent executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Second engine caller for scheduled runs (line 446). |
| integration | Slack assistant turn | `apps/web/lib/slack/slack-assistant-turn.ts` | Third engine caller; memory only (line 195). |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Settings switches that feed the engine. |
| other | Desktop local prompt ordering | `apps/desktop/src/lib/context-precedence.ts` | Device-side copy of the order for Local and own-key turns. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends a message; the client calls the Cloud chat endpoint. | device and our servers | request-processor.ts:3694 (surface resolved from request); apps/mobile/stores/chat/chatExecutionStore.ts:2800 |
| Server decides includeMemory, includePastChats and project presence; returns an empty result if none apply. | our servers | turn-context-service.ts:124-143 |
| Server reads suppressed memory sources and the project memory scope, then builds loaders. | our servers | turn-context-service.ts:145-174 |
| Engine runs each loader (database reads), then refuses, dedups, caps and orders items. | our servers | engine.ts:173-286 |
| Manifest is written in the background to Postgres unless the chat is temporary. | our servers | turn-context-service.ts:198-207; manifest-store.ts:54-99 |
| Kept items become prompt blocks and citations and go into the model request. | our servers | turn-context-service.ts:209-241; request-processor.ts:4270-4276,6235 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Context manifest (ids, counts, budgets, digest, entries; no text) | table context_manifests in the cloud database | Server only; read back by turn id and user (manifest-store.ts:101-140). | Retention period unknown; account and organization erasure and user export code reference the table (apps/web/lib/server/account-erasure.ts, organization-erasure.ts, apps/web/app/api/user/export/route.ts, found by name search, not opened). |

**Models and providers.** The assembly step calls no model and no provider; it only reads the database. The model that answers is chosen elsewhere (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on the Cloud chat route; user and workspace come from the scoped database handle (request-processor.ts:4237-4242). |
| Permissions | Every source must belong to the actor, workspace and project; external sources cannot act as instructions (permissions.ts:40-56). Workspace policy can close memory, past chats, connector and web classes (permissions.ts:63-70). |
| Subscription | No plan name is read; availability comes from the user's switches and workspace policy (turn-context-service.ts:124-131). The Free path uses the same assembly (apps/web/lib/server/free-quota-turn.ts:1062). |
| Limits and metering | Per-source character caps only for chat turns (engine.ts:221-226; project-context-service.ts:79-93). No usage is metered by this step itself. |
| Feature flags | recordManifest request option can turn off the manifest write (turn-context-service.ts:121,198). |
| Model compatibility | None found in the code; assembly does not depend on the chosen model for chat turns because no token budget is passed. |
| Provider restrictions | none found in the code |
| Local mode | Local-model turns on web fetch instructions and memory from GET /api/memory/local-context, which uses our servers (route.ts:10-30; turn-context-service.ts:419-438); past chats and project files are not in that response. Desktop and mobile Local turns assemble their own prompt on the device (apps/desktop/src/lib/context-precedence.ts:1-9; chatExecutionStore.ts:2800-2813). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nothing applies | Returns empty prompts and no manifest. | turn-context-service.ts:132-143 |
| Temporary chat | Memory and past chats excluded; no manifest stored. | turn-context-service.ts:124-130,198; engine.ts:129 |
| Source loader fails | Skipped, warning logged, manifest entry marked failed. | engine.ts:134-144,279 |
| Manifest write fails | Warning 'The turn context manifest could not be stored'; turn continues. | turn-context-service.ts:198-206 |
| Project context fails to load or be admitted | Turn refused before any model request. | request-processor.ts:4254-4262; turn-context-service.ts:320-325 |
| Non-project assembly error | Continue without memory or past chats; error logged. | request-processor.ts:4263-4268 |
| Workspace has no policy row or the read fails | Test says every class is closed; the loader code was not opened. unknown beyond the test. | apps/web/lib/services/__tests__/context-resolution-engine.test.ts:43 |
| Surface 'api' | Memory only when memory_enabled is true; past chats never. | turn-context-service.ts:70-75,128-129 |
| Offline, timeout, cancel, reconnect | not handled in the code of this step; it is a server read inside the chat request. | Searched engine.ts and turn-context-service.ts; no timeout, cancel or retry logic found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/platform/context-engine/src/__tests__/engine.test.ts`: Manifest counts, duplicate-fact drop, stale drop, loader failure recorded, refetch without content, same inputs same manifest.
- `packages/platform/context-engine/src/__tests__/budget-and-boundaries.test.ts`: Assembly order, temporary-chat exclusion, shared-project refusal, switch handling, token budget invariants.
- `packages/platform/context-engine/src/__tests__/permissions.test.ts`: Ownership, policy flags, external-instruction refusal, exclusions in manifest.
- `apps/web/lib/services/__tests__/context-resolution-engine.test.ts`: Workspace policy loading and web loaders through the engine.
- `apps/web/lib/services/__tests__/project-context-manifest-fidelity.test.ts`: Manifest matches what the prompt renders for project files.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: resolveInteractiveTurnContext for memory, project chats and past chats.
- `apps/web/lib/services/__tests__/scheduled-agent-context.test.ts`: Scheduled-run context assembly.

**Test scenarios**

- **Memory switch off**
  1. Turn memory off in Settings, Memory.
  2. Send a message in a new Cloud chat that would match a saved memory.
  3. Inspect the context_manifests row for the turn.
  - Expected: No memory item in the prompt; manifest has no included memory.
- **Temporary chat**
  1. Start a temporary chat with memory and Search past chats on.
  2. Ask about something from an earlier chat.
  3. Query context_manifests for that turn id.
  - Expected: No past-chat or memory text used; no manifest row.
- **Broken source**
  1. Make the past-chat read fail in a test database.
  2. Send a message.
  - Expected: Answer arrives; log line 'A context source failed to load; the turn continues without it'; the model is told recall is degraded.
- **Workspace policy closed**
  1. Set allowMemory off for the workspace.
  2. Turn the user memory switch on.
  3. Send a message.
  - Expected: Memory excluded with reason policy_denied.
- **Shared project (expected to fail today)**
  1. Open a project shared with other members.
  2. Send a message with memory on.
  - Expected: Per the engine rule, personal sources are refused; today nothing sets sharedProject, so check what actually happens.

**Where to look when it fails**

- Log 'A context source failed to load; the turn continues without it'.
- Log 'The turn context manifest could not be stored'.
- Log 'Turn context could not be assembled; continuing without account memory or past chats'.
- Table context_manifests (entries jsonb, content_digest).
- Tracing span memory.past_chats.load (past-chat-context-service.ts:409).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Shared-project personal-source rule is never switched on.** Affects: Members of shared projects on web.. Evidence: engine.ts:130 reads actor.sharedProject; no caller sets it (turn-context-service.ts:181-185).. Work needed: Derive sharedProject from project sharing and pass it at each engine call; add a test through resolveInteractiveTurnContext.
- **Token budget, versions and overBudget are not used for chat turns.** Affects: Web Cloud chat; manifests carry no token accounting.. Evidence: turn-context-service.ts:179-196 passes neither budget nor versions; engine.ts:229-250.. Work needed: Pass the selected model's input budget and the version keys, or remove the unused fields.
- **Manifest is not shown to the user and may be lost silently.** Affects: All Cloud chat users and support.. Evidence: Write is void and only warns (turn-context-service.ts:199-206); no viewer found in the web code searched.. Work needed: Decide whether a manifest is required evidence; add a read endpoint or screen and await or queue the write.
- **Items of a refused class are still read from the database before being refused.** Affects: Efficiency and privacy review on web.. Evidence: engine.ts:174 loads, then engine.ts:176 admits.. Work needed: Check admission first and skip load for a refused class.
- **Local, own-key, CLI, VS Code and Chrome turns have no equivalent manifest or shared engine.** Affects: Desktop, mobile, CLI, VS Code, Chrome in Local and own-key mode.. Evidence: apps/desktop/src/lib/context-precedence.ts:1-9; chatExecutionStore.ts:2800-2813.. Work needed: Decide if a device-side manifest is required; document the boundary.
- **Whether migrations 0252 and 0284 are applied is not established.** Affects: All manifest reads and writes.. Evidence: Headers say NOT YET APPLIED (0252:4, 0284:4).. Work needed: Check migration tracking for each environment.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- surface:web
- mode:cloud
- table:context_manifests
- file:packages/platform/context-engine/src/engine.ts
- F093-02
- F093-04

## Unknown

- Whether migrations 0252 and 0284 are applied in any environment.
- How long context_manifests rows are kept.
- Whether CLI, VS Code and Chrome extension assemble context on their own; no call was found.
- How loadOrganizationContextPolicy behaves when the policy row is missing (only the test title was read).
- Whether a user-facing view of the manifest exists in any app.
