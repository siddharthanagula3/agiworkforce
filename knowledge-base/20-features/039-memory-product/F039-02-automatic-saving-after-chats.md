---
id: "F039-02"
type: "feature"
title: "Automatic saving after chats"
aliases: ["Auto memory", "Automatic Memory update (S39.12)", "Save memories from chats", "Generate memory from chat history", "generateFromHistory", "Learned memories (source auto)", "Model memory extraction"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S39.12"]
depends_on: ["SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-security-and-privacy", "F039-01", "F039-03", "table:user_memories", "mode:cloud", "mode:local", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-02 Automatic saving after chats

After a completed chat turn, the server finds durable facts in what the person said and saves up to five as memories marked as learned. It runs only when Memory and Save memories from chats are on, never in temporary chats, and a failure never breaks the chat.

Area: [39. Memory product](README.md). Requirement items: [S39.12](../../10-requirements/capabilities/039-memory-product.md#s3912).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Learns lasting facts and preferences from ordinary chats without being asked, and stores them in the account memory (apps/web/lib/services/managed-auto-memory-service.ts:145-215; managed-memory-context-service.ts:1343-1439).

**Why it exists.** Founders decided automatic extraction must be on because both leaders extract automatically (doc: docs/decisions/2026-09-15-founder-decisions.md:53-62). The brief requires facts saved after ordinary conversations when allowed (S39.12).

**Who uses it.** Anyone with Memory on, on Web, Desktop, Chrome, CLI and VS Code Cloud turns, and on Mobile in Cloud (server) or Local (on device).

**Problems it solves**

- People do not have to repeat preferences in every chat.
- Facts are saved without asking, yet can be stopped with a switch.
- Sensitive or credential-like facts are filtered out.

**Use cases**

- User says: I prefer Python for data work. Later chats use it.
- User mentions where they live; the fact appears in the Saved Memory list as learned.
- Mobile Local user chats on the phone; a fact is saved only on the phone.
- User works inside a project; the learned fact stays in that project.

## 2. User experience

**Where to find it**

- Nothing to open: it happens after chat turns. Learned facts appear in the Saved Memory list on each app (see F039-04).
- Switch: Save memories from chats (web, MemorySection.tsx:398), Generate memory from chat history (mobile, MemoryControlsCard.tsx:86), Enable memories (Tauri desktop, Memory.tsx:185).

**Before you start**

- Memory on and Save memories from chats on (defaults to on once Memory is on, managed-memory-context-service.ts:275-277).
- A non-temporary chat on a surface other than api (request-processor.ts:2392-2406).
- Web: workspace allows memory.

**Screens and controls**

- Save memories from chats switch (web) and Generate memory from chat history (mobile).
- Allow memory generation from tool-assisted chats switch (web, MemorySection.tsx:435; Tauri, Memory.tsx:201-208).
- Include sensitive topics in memory switch (web 422, mobile 96).
- Never remember list (see F039-03).

**Journey**

1. Turn Memory on.
2. Chat normally and state a fact about yourself.
3. The turn finishes.
4. Open Memory later; the fact is listed with a learned origin.

**What the person sees and gets**

- No in-chat notice of an automatic save was found in the code opened.
- The fact appears in the list; the list item shows its origin and the chat title when known (MemoryEditor.tsx FactOrigin; apps/web/app/api/memory/route.ts:58-70).
- Server log line Managed auto-memory turn recorded (managed-auto-memory-service.ts:128-137).

**Settings**

- generateFromHistory, allowToolAssistedGeneration, includeSensitiveTopics in capabilities (managed-memory-context-service.ts:258-281).
- Environment AGI_MODEL_MEMORY_EXTRACTION: model-based extraction is on unless set to 0, false, off or no (apps/web/lib/services/model-memory-extraction.ts:79-82).
- Never-remember terms and suppressed sources in settings.memory (managed-memory-context-service.ts:1353-1374).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Gate for learning: policy enabled, generateFromHistory, not temporary, memory_enabled not false, surface not api (request-processor.ts:2392-2406).
- Pattern extractor yields at most five candidate facts (request-processor.ts:2408-2418; MAX_AUTO_MEMORIES_PER_TURN 5 at managed-memory-context-service.ts:72).
- Explicit remember or forget sentences are removed from passive learning so they are not saved twice (packages/ai/agent-core/src/memory.ts:214-226; apps/web/lib/services/memory-commands.ts:51-58).
- Only a completed turn saves; failed or cancelled returns early (managed-auto-memory-service.ts:149).
- A tool-assisted turn is skipped unless allowToolAssistedGeneration is on; research and AGI Work turns are treated as tool-assisted (request-processor.ts:2420-2423, 6451-6455; managed-auto-memory-service.ts:150-155).
- A turn that carried Google user data saves nothing (managed-auto-memory-service.ts:101-110).
- The project of the conversation scopes the new fact (managed-auto-memory-service.ts:111-130).
- Failures are logged and the chat still succeeds (managed-auto-memory-service.ts:138-142).
- Model extraction runs after the response through the framework's after hook, on a managed utility route with a metered usage reservation, and falls back to pattern facts on any refusal or failure (managed-auto-memory-service.ts:55-68, 163-215; apps/web/lib/services/model-memory-extraction.ts:117-170).
- Each learned fact passes the eligibility gate, never-remember list, credential refusal and duplicate or conflict merging (managed-memory-context-service.ts:1381-1437, 742-870).
- Mobile Local consolidates facts on the device after a completed local turn (apps/mobile/src/features/memory/services/consolidation.ts:66-80, 176-215; chatExecutionStore.ts:2830-2846).
- CLI also builds local memory files from session summaries, separate from account memory (apps/cli/src/memory_pipeline.rs:1-20).

**Incomplete**

- VS Code and CLI auto-save to the account runs through the shared server path for managed turns; I did not open the CLI or VS Code runtime to confirm [inferred from surface list in apps/web/lib/free-chat-surface-policy.ts:10-12 and request-processor.ts:2392-2406].
- Chrome auto-save is likewise inferred from the server path, not from Chrome code.

**Present but disconnected or switched off**

- Model extraction is skipped when the turn text was withheld, zero-data-retention is on, or the extraction prompt cannot be built (managed-auto-memory-service.ts:41-52).
- The shadow worth-extracting probe records data only and changes no gate (managed-auto-memory-service.ts:195-213).

**Not available**

- API surface: never learns (request-processor.ts:2402-2404).
- Own-key and Local turns never save to server memory: the eligibility gate refuses non-managed trust modes (managed-memory-context-service.ts:646-660). Whether own-key turns reach this path at all is unknown.

## 4. Required behaviour

**Established requirements**

- After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.12)
- Model-assisted extraction is on, runs on the cheapest reliable utility model, is metered, fails safe, and excludes temporary chats, Memory-off sessions, API and zero-data-retention traffic. (source: doc: docs/decisions/2026-09-15-founder-decisions.md:53-62)
- Temporary chats must not update or reference memory. (source: doc: docs/product/requirements.md section 9.6)
- Do not save secrets, tentative guesses or transient tool output. (source: doc: docs/product/competitive-guidance.md:319)
- Mobile Local and Cloud memory stay separate; one is never copied into the other. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:159-162)

**Acceptance criteria**

1. With Memory and Save memories from chats on, a completed turn stating a personal preference adds a learned memory within a short time.
2. With Save memories from chats off, no learned memory is added but a Remember request still works.
3. A cancelled or failed turn adds nothing.
4. A temporary chat adds nothing.
5. One turn adds at most five facts.
6. A fact in a project chat is listed as project-only.
7. A turn that used tools adds nothing unless the tool-assisted switch is on.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The learned fact ranks below user-written facts, so it cannot override them [inferred from memoryWriteRank, managed-memory-context-service.ts:687-690].
- Automatic saving gives the person no immediate in-chat confirmation [inferred from no notice found].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a small, dismissible note when a chat saved a learned fact, with an undo, as the leaders do.
- [proposed] Record in the list which chat turn produced each fact (the source turn id is already stored).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | recordManagedAutoMemoryTurn | `apps/web/lib/services/managed-auto-memory-service.ts` | Post-turn recorder: outcome check, tool-free rule, Google data skip, project scope, model extraction. |
| service | persistManagedAutoMemoryFacts | `apps/web/lib/services/managed-memory-context-service.ts` | Dedupe, never-remember filter, 5-fact cap, idempotent ids, write each fact. |
| service | writeConsolidatedMemory | `apps/web/lib/services/managed-memory-context-service.ts` | Single write path: eligibility gate, merge duplicates, supersede rivals. |
| service | managedAutoMemoryLearningAllowed / prepareManagedAutoMemoryFacts | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Decides whether the turn may teach memory and extracts pattern candidates. |
| service | extractAutoMemoryFactsWithModel | `apps/web/lib/services/model-memory-extraction.ts` | Metered model-based extraction on a utility route with pattern fallback. |
| service | extractCandidateMemoryFacts / passiveMemoryText | `packages/ai/agent-core/src/memory.ts` | Pattern extractor and removal of explicit commands. |
| service | memoryLearningText | `apps/web/lib/services/memory-commands.ts` | Chooses the text the passive extractor reads per surface. |
| job | expire-memories cron | `apps/web/app/api/cron/expire-memories` | Soft-deletes expired memories so devices learn of it (directory exists; route file not opened). |
| table | user_memories | `apps/web/db/neon/0203_user_memories_lifecycle.sql` | Row store with expires_at and superseded_by columns. |
| table | user_memories provenance | `apps/web/db/neon/0285_user_memories_provenance.sql` | source_conversation_id and provenance columns. |
| service | consolidateFactsFromTurn | `apps/mobile/src/features/memory/services/consolidation.ts` | Mobile Local per-turn learning with 5-fact cap. |
| service | writeLocalMemoryFact | `apps/mobile/src/features/memory/services/localMemoryWriter.ts` | Mobile on-device write with credential refusal, duplicate and conflict handling. |
| hook | captureCompletedLocalMemory | `apps/mobile/stores/chat/chatExecutionStore.ts` | Calls local consolidation after a completed local turn. |
| service | memory_pipeline | `apps/cli/src/memory_pipeline.rs` | CLI session summaries merged per trust boundary into local files. |
| config | AGI_MODEL_MEMORY_EXTRACTION | `apps/web/lib/services/model-memory-extraction.ts` | Environment switch for model-based extraction (name only). |
| test | managed-auto-memory-service test | `apps/web/lib/services/__tests__/managed-auto-memory-service.test.ts` | Test file for the recorder. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat turn arrives. The server reads the memory policy, and builds pattern facts from the person's message only if learning is allowed. | our servers | request-processor.ts:4126-4160, 4471-4486 |
| Tool-assisted turns clear the facts unless the tool-assisted switch is on. | our servers | request-processor.ts:6451-6455 |
| After the answer is complete the recorder runs; non-completed outcomes stop here. | our servers | managed-auto-memory-service.ts:145-155 |
| Without model extraction: persist pattern facts at once. With it: after the response, call a managed utility route under a usage reservation; on refusal use pattern facts. | our servers | managed-auto-memory-service.ts:156-190; model-memory-extraction.ts:136-170 |
| Model call goes to an outside provider chosen by the managed routing layer, not the person's model. | outside service | model-memory-extraction.ts:136-145 (admitManagedCloudRoute kind utility) |
| Google-data check, project lookup, then persist: exclusions, dedupe, up to five writes, each through the eligibility gate. | our servers | managed-auto-memory-service.ts:101-130; managed-memory-context-service.ts:1343-1437 |
| Mobile Local: the same idea on the phone using local rules and SQLite. | device | consolidation.ts:176-215; apps/mobile/storage/memory.ts:39 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Learned memory row (source auto, rank lowest) | table:user_memories with source_conversation_id and provenance | Yes, to every Cloud surface through /api/memory and /api/memory/sync | Until deleted (soft delete blanks the text, managed-memory-context-service.ts:391-392) or expired |
| Extraction usage record | Background usage reservation under feature memory_extraction (model-memory-extraction.ts:50,150-170) | Server side only | unknown |
| Mobile Local fact | store:memory_facts (SQLite on the device) | No | Until the person deletes it or resets memory |

**Models and providers.** The extraction model is picked by managed routing, on the cheapest managed utility route, independent of the chat model (doc: docs/decisions/2026-09-15-founder-decisions.md:55-56; model-memory-extraction.ts:136). See SYS-model-catalog-and-routing and SYS-inference-providers. Pattern extraction needs no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Mobile Local needs none. |
| Permissions | Workspace policy allowMemory; per-user switches (managed-memory-context-service.ts:609-626). |
| Subscription | none found in the code opened for who may turn Memory on; extraction is charged to the account's managed usage through a reservation with plan tier passed in (managed-auto-memory-service.ts:174; model-memory-extraction.ts:150-170). |
| Limits and metering | 5 facts per turn; each fact capped by the contract at 20,000 characters (packages/contracts/types/src/memory-wire.ts:1); pattern clauses at most 120 characters (packages/ai/agent-core/src/memory.ts:11). Extraction is metered; if the reservation is refused the pattern facts are used (model-memory-extraction.ts:171-182). |
| Feature flags | AGI_MODEL_MEMORY_EXTRACTION (on by default); capabilities switches. |
| Model compatibility | Learning is independent of the answering model. The model extractor uses a managed utility route. |
| Provider restrictions | Zero-data-retention turns are never sent to the extraction route (managed-auto-memory-service.ts:41-52). Health space and Google-data turns force the no-training option (managed-auto-memory-service.ts:173-176). |
| Local mode | Mobile Local learns on the device only and requires Memory and Generate memory from chat history on (consolidation.ts:66-80). Server auto-save never stores Local or own-key content (managed-memory-context-service.ts:646-660). CLI Local sessions write local files, not account memory (memory_pipeline.rs:1-20). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Turn failed or cancelled | Nothing saved. | managed-auto-memory-service.ts:149 |
| Save error | Logged, chat still succeeds. | managed-auto-memory-service.ts:138-142 |
| Duplicate fact | Merged, not inserted twice; concurrent identical facts use a deterministic id. | managed-memory-context-service.ts:1326-1334, 770-790 |
| Fact on never-remember list | Counted as excluded and not saved. | managed-memory-context-service.ts:1387-1391 |
| Sensitive topic without opt-in | Refused by the gate. | managed-memory-context-service.ts:628-637 |
| Usage reservation refused or provider error | Falls back to pattern facts. | model-memory-extraction.ts:171-182 |
| Request scope missing (durable workflow step) | The after hook throws; the task is left to settle on its own. | managed-auto-memory-service.ts:62-68 |
| Offline / timeout | Extraction has a timeout and falls back (EXTRACTION_TIMEOUT_MS used at model-memory-extraction.ts:190). | model-memory-extraction.ts:188-192 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/managed-auto-memory-service.test.ts`: Recorder (name only; contents not opened)
- `apps/web/lib/services/__tests__/managed-auto-memory-model-extraction.test.ts`: Model extraction path of the recorder (name only)
- `apps/web/lib/services/__tests__/model-memory-extraction.test.ts`: Extraction service (name only)
- `apps/web/lib/services/__tests__/model-memory-extraction-metering.test.ts`: Extraction metering (name only)
- `apps/web/lib/services/__tests__/memory-eligibility-gate.test.ts`: Eligibility gate (name only)
- `packages/ai/agent-core/src/__tests__/memory.test.ts`: Pattern extractor and command parsing (name only)
- `packages/ai/agent-core/src/__tests__/memory-model-extraction.test.ts`: Model extraction parsing (name only)
- `apps/mobile/__tests__/memory-consolidation.test.ts`: Mobile consolidation (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Processor memory behaviour (name only)

**Test scenarios**

- **Learn a fact**
  1. Turn Memory on.
  2. Send: I prefer dark mode in every editor.
  3. Wait, open the Memory list.
  - Expected: A learned fact appears.
- **Switch off generation**
  1. Turn Save memories from chats off.
  2. Repeat the message.
  - Expected: No new fact; asking Remember that I like tea still saves.
- **Temporary chat**
  1. Open a temporary chat and state a fact.
  - Expected: Nothing in the list.
- **Cap per turn**
  1. Send a message with seven separate statements of personal fact.
  - Expected: At most five new memories.
- **Cancelled turn**
  1. Send a fact and stop the reply immediately.
  - Expected: No memory saved.
- **Mobile Local**
  1. In Local mode turn Memory and Generate memory on.
  2. State a fact, wait for the reply to finish.
  3. Open Memory.
  - Expected: The fact is listed and is not in the Cloud list.

**Where to look when it fails**

- Log lines: Managed auto-memory turn recorded; Managed auto-memory persistence failed; chat completion remains successful; [memory-extraction] fell back to the pattern candidates (managed-auto-memory-service.ts:128,140; model-memory-extraction.ts).
- Refusal reasons in managed-memory-context-service.ts:533-541.
- Rows in table:user_memories where source = 'auto'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)
- Chrome: [70-qa/test-plans/chrome/039-memory-product.md](../../70-qa/test-plans/chrome/039-memory-product.md)

## 10. Gaps and dependencies

- **No visible confirmation or undo when a chat saved a learned fact.** Affects: All apps. Evidence: No notice found in the code opened. Work needed: Design a lightweight notice if wanted.
- **Auto-save on CLI, VS Code and Chrome is inferred, not confirmed in those apps' code.** Affects: CLI, VS Code, Chrome. Evidence: Brief marks done; server gate only excludes api. Work needed: Verify with a live turn per surface.
- **Contradiction handling covers only five topics.** Affects: All apps. Evidence: packages/ai/agent-core/src/memory.ts:612-619. Work needed: Extend topics or use model judgement.

**Depends on**

- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-security-and-privacy
- F039-01
- F039-03
- table:user_memories
- mode:cloud
- mode:local
- surface:web
- surface:mobile

## Unknown

- Whether CLI, VS Code and Chrome turns actually trigger the server recorder in production.
- How long extraction usage records are kept.
- Whether the cron expire-memories is scheduled in production (route file not opened).
- Which provider serves the utility route at any time (managed routing).
