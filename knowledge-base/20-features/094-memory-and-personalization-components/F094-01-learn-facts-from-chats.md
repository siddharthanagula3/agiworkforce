---
id: "F094-01"
type: "feature"
title: "Learn facts from chats"
aliases: ["Save memories from chats", "Learn facts from chats", "auto memory", "automatic memory extraction", "Memory candidate extraction (S94.01)", "Memory provenance (S94.04)", "Duplicate-Memory merger (S94.07)", "Contradiction/correction handling (S94.08)", "generateFromHistory", "managed auto-memory", "source 'auto'"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.01", "S94.04", "S94.07", "S94.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "table:user_memories", "table:user_settings", "file:apps/web/lib/services/managed-memory-context-service.ts", "file:packages/ai/agent-core/src/memory.ts", "api:POST /api/memory/sync", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "F094-05", "F094-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-01 Learn facts from chats

After a normal chat turn in Cloud mode, AGI Workforce's server reads what the person wrote, picks out short personal facts (name, job, home, preferences), and saves them as memories. Duplicates are merged and a newer fact about the same single-valued topic replaces the old one. Each memory records its source chat and turn.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.01](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9401), [S94.04](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9404), [S94.07](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9407), [S94.08](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9408).

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

**What it does.** Turns ordinary chat statements such as 'I live in Berlin' into saved account memories without the person asking. The facts are later read back into replies (see F094-05). Mobile Local mode and the CLI have their own on-device versions of the same idea (apps/mobile/src/features/memory/services/consolidation.ts:176; apps/cli/src/memory_pipeline.rs:1-30).

**Why it exists.** The project requires memory that is inspectable, editable and shared across Cloud chat contexts, with provenance on every entry (doc: docs/product/definition.md:200; doc: docs/product/experience-contract.md:28-31). Learning from chats is how the assistant stops asking the same questions again.

**Who uses it.** Any signed-in person who has persistent memory turned on and chats in Cloud mode (Web, the Desktop window that shows the hosted web app, Mobile Cloud, CLI Managed sessions, Chrome extension and VS Code when they use Managed Cloud).

**Problems it solves**

- The person does not have to repeat their name, job, location or preferences in every chat.
- The same fact is not stored twice, and a corrected fact (new city, new employer) replaces the old one instead of piling up.
- The person can see where a learned fact came from and delete it.

**Use cases**

- A person writes 'My name is Priya and I work at a bank.' The server saves two short facts after the reply.
- A person who lived in Pune writes 'I live in Oslo'. The new residence fact replaces the old one; the old one is kept as history and can be restored.
- A person turns off 'Save memories from chats'. Nothing is learned unless they say 'remember ...'.

## 2. User experience

**Where to find it**

- Web: Settings > Memory. Toggles 'Persistent memory', 'Save memories from chats', 'Include sensitive topics in memory', 'Allow memory generation from tool-assisted chats' (apps/web/features/settings/sections/MemorySection.tsx:316,395,419,432).
- Web and Desktop (Electron shows the hosted web app, doc: AGENTS.md section 5): learned facts appear in the memory list with the note 'Learned from "<chat title>"' or 'Learned from a chat' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:574-588).
- Mobile: Settings > Memory ('Cloud Memory' in Cloud mode, 'Memory' in Local mode) (apps/mobile/app/(app)/settings/memory.tsx:709).
- CLI: account memory is cached from /api/memory/sync and shown in a TUI memories widget (apps/cli/src/cloud/memory.rs:1-8; apps/cli/src/tui/widgets/memories_settings.rs). Depth not read.
- VS Code and Chrome extension: account memory clients list the saved memories (apps/extension-vscode/src/memory/accountMemoryClient.ts:1-40; apps/extension/src/background/memory-bridge.ts).

**Before you start**

- Signed in, Cloud mode (managed storage). A Local or BYOK turn is refused by the eligibility gate (apps/web/lib/services/managed-memory-context-service.ts:654-662).
- 'Persistent memory' on. The server reads it as off unless the saved capability is exactly true (apps/web/lib/services/managed-memory-context-service.ts:277-280).
- 'Save memories from chats' on (default on once memory is on) (apps/web/lib/services/managed-memory-context-service.ts:278-279).
- The workspace has not turned memory off (apps/web/lib/services/managed-memory-context-service.ts:611-616).

**Screens and controls**

- Switch 'Persistent memory' (master).
- Switch 'Save memories from chats' (disabled while master is off; hint 'Turn on persistent memory to change this.') (apps/web/features/settings/sections/MemorySection.tsx:59,395-403).
- Switch 'Include sensitive topics in memory' and 'Allow memory generation from tool-assisted chats'.
- Per-chat memory override: the request field memory_enabled=false skips reading and learning for that chat (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:712).
- Memory list with 'Learned from' origin line, pin and delete buttons (packages/ui/unified-chat/src/components/MemoryEditor.tsx:346,375).

**Journey**

1. Turn on 'Persistent memory' in Settings > Memory.
2. Chat normally and state a fact in a sentence that is not a question, for example 'I live in Lisbon.'
3. The assistant replies as usual.
4. After the turn completes, the server extracts up to 5 facts and writes them as source 'auto' memories linked to the chat and turn.
5. Open Settings > Memory to see the new entry labelled 'Learned from <chat title>'. Pin, edit or delete it there.
6. If a replaced fact was wrong, open the replaced-memories list and restore it (apps/web/app/api/memory/[id]/restore/route.ts:20).

**What the person sees and gets**

- No toast or banner appears for learning. The only visible result is the new row in Settings > Memory [inferred: no client code reads the learning result].
- The row shows 'Learned from <chat>' with a link to the chat when the chat still exists (packages/ui/unified-chat/src/components/MemoryEditor.tsx:574-588).
- Server logs 'Managed auto-memory turn recorded' with extracted and inserted counts (apps/web/lib/services/managed-auto-memory-service.ts:128-137).

**Settings**

- capabilities.memory (master), capabilities.generateFromHistory, capabilities.allowToolAssistedGeneration, capabilities.includeSensitiveTopics stored in user_settings (apps/web/lib/services/managed-memory-context-service.ts:258-282).
- settings.memory.excludedTerms (never-remember list, max 50 terms, min 3 chars) and settings.memory.suppressedSources (apps/web/lib/services/managed-memory-context-service.ts:283-300,1343-1367).
- Workspace policy allowMemory (Workspace > Policy) (apps/web/features/settings/sections/MemorySection.tsx:39).
- Server env AGI_MODEL_MEMORY_EXTRACTION: model-assisted extraction is on unless set to 0, false, off or no (apps/web/lib/services/model-memory-extraction.ts:79-82).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Pattern extraction: 21 English phrase patterns ('my name is', 'I live in', 'I prefer', 'remember that', ...). A clause must be 2 to 120 characters; questions and task-only reminders about tab/window ids are skipped (packages/ai/agent-core/src/memory.ts:19-45,69-87,89-120).
- Model-assisted extraction, on by default, re-reads the turn after the response on a cheap utility route, keeps the pattern result as fallback, is capped at 5 facts, and is skipped for zero-data-retention turns (apps/web/lib/services/managed-auto-memory-service.ts:41-57,145-186; apps/web/lib/services/model-memory-extraction.ts:48-82).
- Learning gate: memory master on, generate-from-history on, not temporary, per-chat override not false, surface not 'api' (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392-2406). Personalization=false forces memory_enabled=false (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523).
- A tool-assisted turn learns nothing unless 'Allow memory generation from tool-assisted chats' is on (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6451-6455; apps/web/lib/services/managed-auto-memory-service.ts:148-153). A turn holding Google user data is skipped (apps/web/lib/services/managed-auto-memory-service.ts:97-109).
- Never-remember terms and the 'auto' suppressed source stop a candidate (apps/web/lib/services/managed-memory-context-service.ts:1355-1377).
- Write gate: prohibited content (credentials, payment cards, other prohibited categories) is always refused; temporary chat refused; sensitive topics refused unless the person asked or opted in; workspace memory off refused; non-managed trust refused (apps/web/lib/services/managed-memory-context-service.ts:570-668).
- Merge and supersede in one SQL statement: a normalised key (lower-case, punctuation stripped, 'user's X' read as 'my X', 'user is' as 'I am') finds a duplicate; the merge keeps pin and the longer-lived expiry (apps/web/lib/services/managed-memory-context-service.ts:399-403,742-858).
- Supersession applies to five single-valued topics only: name, residence, employer, role, origin (packages/ai/agent-core/src/memory.ts:612-619). Rank is pinned 2, person-written 1, auto 0; a rival of higher rank makes the new fact land already superseded (apps/web/lib/services/managed-memory-context-service.ts:405-407,805-814).
- Provenance: source_conversation_id, source_turn_id and a provenance JSON (creator account, agent id, trust mode, conversation, turn) are written with the row (apps/web/lib/services/managed-memory-context-service.ts:476-505,825-856).
- Mobile Local mode learns on the device into SQLite with the same patterns, 5 per turn, dedupe and topic supersede (apps/mobile/src/features/memory/services/consolidation.ts:64,176-215; apps/mobile/src/features/memory/services/localMemoryWriter.ts:25-75).
- CLI: a session summary is extracted on session end and merged per trust boundary (Local, BYOK, Managed) into files under memories/ (apps/cli/src/memory_pipeline.rs:1-30).

**Incomplete**

- Contradiction handling covers only five topics; any other changed fact (for example a changed favourite food) is stored beside the old one until the person deletes it (packages/ai/agent-core/src/memory.ts:612-619).
- Provenance JSON stores creator, conversation, turn, agent and trust mode only; the migration comment also lists model, provider route, prompt version and tool invocations, which this writer does not fill (apps/web/lib/services/managed-memory-context-service.ts:494-505; apps/web/db/neon/0285_user_memories_provenance.sql:40).
- Memory source labels 'chrome', 'vscode' and 'cli' can be written by commands but are not in MEMORY_SOURCES, so they cannot be hidden with the suppressed-sources setting (apps/web/lib/services/memory-commands.ts:40-49; apps/web/lib/services/managed-memory-context-service.ts:317).

**Present but disconnected or switched off**

- Web, Desktop and Mobile Local or own-key turns never write to the account memory table: the eligibility gate refuses any non-managed trust mode (apps/web/lib/services/managed-memory-context-service.ts:654-662).
- The API surface never learns (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2404).

**Not available**

- Languages other than English for pattern extraction: patterns are English phrases (packages/ai/agent-core/src/memory.ts:19-45). The model path may cover more; its language behaviour is unknown.
- Agent-specific memory (S94.14) is missing in the brief and was not looked for here (doc: knowledge-base/data/area-briefs/094-memory-and-personalization-components.md S94.14).

## 4. Required behaviour

**Established requirements**

- A component extracts candidate facts from ordinary turns for memory. (source: S94.01)
- Each memory records where it came from (conversation, turn, writer). (source: S94.04)
- Duplicate memories are merged instead of stored twice. (source: S94.07)
- A newer contradicting fact supersedes the older memory. (source: S94.08)
- Temporary chats neither read nor write memory. (source: doc: docs/product/definition.md:172-173)
- Every memory entry exposes provenance, last update, edit, exclusion, export and deletion; sensitive categories require explicit controls. (source: doc: docs/product/experience-contract.md:28-31)
- Saved memory and referenced chat history are separate controls. (source: doc: docs/product/definition.md:171-172)

**Acceptance criteria**

1. With memory and 'Save memories from chats' on, a Cloud chat turn 'I live in Lisbon.' creates one memory 'User lives in Lisbon' with source auto and a source chat link.
2. The question 'Do I live in Lisbon?' creates no memory.
3. In a temporary chat, with 'Save memories from chats' off, with the per-chat memory override off, or on the API surface, no memory is created.
4. Saying 'my favorite color is teal' and later 'the user's favorite color is teal' leaves one memory.
5. Saying 'I live in Pune' then 'I live in Oslo' leaves Oslo active and Pune superseded and restorable; if Pune was pinned, Oslo lands already superseded.
6. A card number or password in the text is never stored, even when the person says 'remember'.
7. A failure in learning does not fail the chat turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Learning should not be visible to the person at the moment it happens; the list is the only place it shows [inferred from absence of any client feedback code].
- Local and own-key turns on Web should have an on-device equivalent of learning, as Mobile Local has [inferred from the three-mode rule].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a small non-blocking note under the reply when a new memory was saved, with an undo link, as the leading assistants do.
- [proposed] Extend contradiction topics beyond five or let the model flag a conflict, with a test per topic.
- [proposed] Fill model, provider route and prompt version into the provenance JSON the migration already allows.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Policy reads, eligibility gate, consolidated write (merge, supersede, provenance), persistManagedAutoMemoryFacts |
| service | managed-auto-memory-service | `apps/web/lib/services/managed-auto-memory-service.ts` | Post-turn recorder; picks pattern or model candidates and persists them |
| service | model-memory-extraction | `apps/web/lib/services/model-memory-extraction.ts` | Model-assisted extraction on a utility route, metered, env flag AGI_MODEL_MEMORY_EXTRACTION |
| service | agent-core memory | `packages/ai/agent-core/src/memory.ts` | Extraction patterns, task-reminder filter, consolidation key, conflict topics, category classifier |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | managedAutoMemoryLearningAllowed, prepareManagedAutoMemoryFacts, memory policy read, tool-assisted drop |
| service | memory-commands (learning text) | `apps/web/lib/services/memory-commands.ts` | memoryLearningText removes explicit commands from passive text |
| service | memory-write-service | `apps/web/lib/services/memory-write-service.ts` | Never-remember list check for writes |
| schema | memory content policy | `packages/contracts/context/src/memory-content-policy.ts` | Prohibited and sensitive content rules |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | Base memory table; later columns in 0203 (expires_at, superseded_by), 0285 (source_conversation_id, source_turn_id, provenance) |
| table | user_settings | `apps/web/lib/services/managed-memory-context-service.ts` | Holds capabilities.* switches and settings.memory.* lists, read at lines 258 and 1349 |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Settings > Memory switches and list |
| component | MemoryEditor | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Shared list UI with 'Learned from' origin line |
| service | mobile consolidation | `apps/mobile/src/features/memory/services/consolidation.ts` | On-device learning in Local mode |
| service | mobile localMemoryWriter | `apps/mobile/src/features/memory/services/localMemoryWriter.ts` | On-device write with duplicate and topic supersede |
| store | mobile memory_facts | `apps/mobile/storage/memory.ts` | SQLite store for local memory facts |
| service | CLI memory_pipeline | `apps/cli/src/memory_pipeline.rs` | Session-summary extraction and per-boundary consolidation |
| endpoint | POST /api/memory/sync | `apps/web/app/api/memory/sync/route.ts` | Delta push/pull used by Mobile, CLI and VS Code to share account memory |
| test | managed-auto-memory-service tests | `apps/web/lib/services/__tests__/managed-auto-memory-service.test.ts` | Persist rules |
| config | AGI_MODEL_MEMORY_EXTRACTION | `apps/web/lib/services/model-memory-extraction.ts` | Env flag name; on unless off-value |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person sends a chat message from an app in Cloud mode; the request carries optional memory_enabled and personalization flags. | device | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:712 |
| The server reads the workspace and user memory policy; a temporary chat gets a disabled policy; a read failure continues the turn without memory. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4126-4160 |
| The server strips inlined files, code fences and explicit remember/forget commands from the user text, checks the learning gate, and extracts up to 5 pattern candidates. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4471-4486; packages/ai/agent-core/src/memory.ts:214-227 |
| The model replies. If the turn used tools and tool-assisted learning is off, candidates are dropped. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6451-6455 |
| On a completed turn the recorder either persists pattern candidates, or (flag on and source text present) re-reads the turn with a utility model after the response and persists those, falling back to patterns on any failure. | our servers | apps/web/lib/services/managed-auto-memory-service.ts:145-186 |
| The utility-model call is a provider call on a managed route, reserved as background usage under quota feature memory_extraction. | outside service | apps/web/lib/services/model-memory-extraction.ts:30-35,50 |
| Each candidate is checked against never-remember terms, the project of the conversation is looked up, then written through writeConsolidatedMemory (eligibility gate, merge, supersede, provenance). | our servers | apps/web/lib/services/managed-auto-memory-service.ts:111-127; apps/web/lib/services/managed-memory-context-service.ts:1379-1425 |
| Mobile and other clients later pull the new row through /api/memory/sync. | device and our servers | apps/web/app/api/memory/sync/route.ts:41 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory row: content, category, source 'auto', pinned, expiry, superseded_by, project_id, organization_id, source_conversation_id, source_turn_id, provenance JSON | table user_memories in the Cloud database | Yes, through /api/memory/sync deltas to Mobile, CLI and VS Code | Kept until deleted or expired; delete blanks the text and keeps a tombstone (apps/web/lib/services/managed-memory-context-service.ts:391) |
| Local memory fact on Mobile Local | SQLite table memory_facts on the phone | No; Local memory is separate from Cloud account memory (apps/mobile/app/(app)/settings/memory.tsx:73) | Until the person deletes or resets it |
| CLI session summaries and merged memory files | files under the CLI config directory memories/ per trust boundary | No | Summaries older than 30 days are pruned (apps/cli/src/memory_pipeline.rs:55-56) |

**Models and providers.** Pattern extraction uses no model. Model-assisted extraction calls a cheap managed utility route chosen by the server, never the person's chosen model, so it works the same whichever chat model is selected; it needs a managed route and is skipped otherwise (apps/web/lib/services/model-memory-extraction.ts:4-13,115-120). Own-key (BYOK) and Local turns are not written to Cloud memory. No model identifiers are written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; rows are keyed by user_id and read through a user-scoped database (apps/web/app/api/memory/route.ts:50). |
| Permissions | Workspace policy allowMemory can switch memory off for all members (apps/web/lib/services/managed-memory-context-service.ts:611-616). No role check for the person's own memories was found. |
| Subscription | No plan check found in the learning path. The model extraction call receives the plan tier and is metered as background usage under quota feature memory_extraction (apps/web/lib/services/managed-auto-memory-service.ts:176; apps/web/lib/services/model-memory-extraction.ts:50). Exact limits per plan: unknown. |
| Limits and metering | At most 5 auto facts per turn (apps/web/lib/services/managed-memory-context-service.ts:72). Clause 2-120 chars (packages/ai/agent-core/src/memory.ts:11-12). Model extraction: 256 output tokens, 6 s timeout (apps/web/lib/services/model-memory-extraction.ts:66,74). Create API content max 20,000 chars (packages/contracts/types/src/memory-wire.ts:1). |
| Feature flags | AGI_MODEL_MEMORY_EXTRACTION (server env, default on). User switches: memory, generateFromHistory, allowToolAssistedGeneration, includeSensitiveTopics. |
| Model compatibility | Works with any chat model because learning runs on the user text and a separate utility model; no capability of the chat model is needed (apps/web/lib/services/model-memory-extraction.ts:12). |
| Provider restrictions | Zero-data-retention turns are not sent to the utility route (apps/web/lib/services/managed-auto-memory-service.ts:41-52). Turns with health-space projects or Google data force a no-training route (apps/web/lib/services/managed-auto-memory-service.ts:176-178). |
| Local mode | Web: a local-model turn does not write to account memory [inferred from the managed-trust gate at apps/web/lib/services/managed-memory-context-service.ts:654-662]. Mobile Local learns into an on-device store, needs the memory switches on, and does not sync (apps/mobile/src/features/memory/services/consolidation.ts:66-78). CLI Local writes Local-boundary files on the device (apps/cli/src/memory_pipeline.rs:1-12). Whether sign-in is required for Mobile Local memory: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty (no memory yet) | Nothing is injected; the editor says 'No cloud memory facts yet...'. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:515 |
| Waiting | Model extraction runs after the response using the framework's after hook; outside a request scope it is left to settle. Pattern persistence is awaited inside the success hook. | apps/web/lib/services/managed-auto-memory-service.ts:59-72,145-160 |
| Error | Persistence failure is logged as a warning and the chat completion stays successful; an ineligible write is counted as excluded. | apps/web/lib/services/managed-auto-memory-service.ts:138-143; apps/web/lib/services/managed-memory-context-service.ts:1428-1434 |
| Retry | Idempotent id per user, scope and normalised fact so two concurrent turns insert one row; no retry loop for failed writes. | apps/web/lib/services/managed-memory-context-service.ts:1326-1334 |
| Cancel / failed turn | Only a 'completed' outcome learns. | apps/web/lib/services/managed-auto-memory-service.ts:147 |
| Temporary chat | Disabled policy; nothing learned. | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4126-4131 |
| Offline / timeout | Model extraction times out at 6 s and falls back to pattern facts. Offline client behaviour on Web: not handled in the code (not searched). | apps/web/lib/services/model-memory-extraction.ts:74 |
| Accessibility / app differences | Switches carry aria-labels; the origin line is a text link. Mobile Local uses its own store and Alert dialogs. | apps/web/features/settings/sections/MemorySection.tsx:320,398 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/managed-auto-memory-service.test.ts`: Persist only for completed turns, per-chat toggle, tool-assisted rules, Google user data skip, swallowing failures
- `apps/web/lib/services/__tests__/managed-auto-memory-model-extraction.test.ts`: Model extraction path (by file name; contents not read)
- `apps/web/lib/services/__tests__/model-memory-extraction.test.ts`: Model extraction helper (by file name; contents not read)
- `apps/web/lib/services/__tests__/model-memory-extraction-metering.test.ts`: Metering of the extraction call (by file name)
- `apps/web/lib/services/__tests__/memory-lifecycle.test.ts`: Normalised-key merge, same-topic supersede, rank so learned fact never displaces a written or pinned one, collapsing duplicate candidates, merge not counted as new
- `apps/web/lib/services/__tests__/memory-eligibility-gate.test.ts`: Eligibility gate (by file name)
- `apps/web/lib/services/__tests__/memory-provenance.test.ts`: Provenance record (by file name)
- `packages/ai/agent-core/src/__tests__/memory.test.ts`: Pattern extraction, questions ignored, runtime reminders excluded, consolidation keys, conflict topics
- `packages/ai/agent-core/src/__tests__/memory-model-extraction.test.ts`: Model extraction parsing (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Chat request memory behaviour (by file name; contents not read)
- `apps/mobile/__tests__/memory-command-outcomes.test.ts`: Mobile memory command outcomes (by file name)

**Test scenarios**

- **Learn a plain fact**
  1. Cloud account, memory and 'Save memories from chats' on.
  2. Send 'I live in Lisbon.' in a new chat and wait for the reply.
  3. Open Settings > Memory.
  - Expected: One memory 'User lives in Lisbon', origin 'Learned from <chat>'.
- **Temporary chat and per-chat off**
  1. Start a temporary chat and send 'My name is Sam.'
  2. In a normal chat turn memory off for that chat and send 'I work at Acme.'
  3. Open Settings > Memory.
  - Expected: Neither fact appears.
- **Supersede and pin priority**
  1. Send 'I live in Pune.' then 'I live in Oslo.'
  2. Check the list; then pin Oslo, send 'I live in Rome.'
  - Expected: Oslo replaces Pune; Rome lands superseded because the pinned Oslo outranks it.
- **Refuse a secret**
  1. Send 'Remember that my card number is a valid test card number.'
  - Expected: Nothing is saved and the receipt says it was not saved.
- **Tool-assisted turn**
  1. Turn off 'Allow memory generation from tool-assisted chats'.
  2. Send 'I prefer dark mode' in a turn that runs web search.
  - Expected: No memory is created.

**Where to look when it fails**

- Log line 'Managed auto-memory turn recorded' (extracted, inserted).
- Log lines 'Managed auto-memory persistence failed; chat completion remains successful', 'Managed auto-memory skipped: the turn carried Google user data', '[memory-extraction] model extraction threw; using the pattern candidates'.
- Log '[managed-memory] write refused by the eligibility gate' with the reason.
- Table user_memories: columns source, superseded_by, source_conversation_id, source_turn_id, provenance.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Contradiction handling covers only name, residence, employer, role and origin.** Affects: All Cloud users; other changed facts duplicate.. Evidence: packages/ai/agent-core/src/memory.ts:612-619. Work needed: Broaden topics or add model-judged conflicts; add tests per topic.
- **Provenance omits model, provider route and prompt version that the migration comment describes.** Affects: Audit and 'why did it remember this' views on every app.. Evidence: apps/web/lib/services/managed-memory-context-service.ts:494-505; apps/web/db/neon/0285_user_memories_provenance.sql:40. Work needed: Pass those values into memoryProvenance and add a test.
- **Web Local and own-key turns have no on-device learning; only Mobile Local and the CLI do.** Affects: Web and Desktop users on local or own-key models.. Evidence: apps/web/lib/services/managed-memory-context-service.ts:654-662. Work needed: Decide the product answer for the three-mode rule and add an on-device store on Web/Desktop if wanted.
- **No visible confirmation when a memory is learned.** Affects: All apps.. Evidence: apps/web/lib/services/managed-auto-memory-service.ts:128-137 logs only. Work needed: Optional UI note with undo.
- **Brief marks S94.01 to S94.08 'platform done' but gives no per-app status; per-app depth for Desktop (Tauri), VS Code, Chrome learning is not established.** Affects: Desktop, VS Code, Chrome.. Evidence: doc: knowledge-base/data/area-briefs/094-memory-and-personalization-components.md. Work needed: Read each app's turn path and record whether learning happens server-side for its Managed turns.
- **Migration 0285 header says 'NOT YET APPLIED : draft only'; whether production has it is not recorded in files read.** Affects: Provenance writes in any environment missing the columns.. Evidence: apps/web/db/neon/0285_user_memories_provenance.sql:3. Work needed: Check the migration ledger with pnpm db:migrate -- status.

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
- table:user_settings
- file:apps/web/lib/services/managed-memory-context-service.ts
- file:packages/ai/agent-core/src/memory.ts
- api:POST /api/memory/sync
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- F094-05
- F094-03

## Unknown

- Whether the Desktop Tauri build, VS Code, Chrome extension and CLI Managed turns learn via the server path (surface values in requests not read).
- Whether Mobile Local memory requires sign-in.
- Plan-level quota numbers for the memory_extraction feature.
- Whether migration 0285 and 0203 are applied in production.
- Which utility route and provider the extraction uses in production (selected at runtime).
- Whether web local-model turns ever call a learning path.
