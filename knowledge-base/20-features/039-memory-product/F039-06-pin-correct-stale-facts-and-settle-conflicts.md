---
id: "F039-06"
type: "feature"
title: "Pin, correct stale facts and settle conflicts"
aliases: ["Prioritize Memory (S39.16)", "Pin memory", "Correction of stale information (S39.19)", "Conflicting-Memory resolution (S39.20)", "Replaced memories", "When memories disagree", "superseded_by", "Use the replaced one instead"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S39.16", "S39.19", "S39.20"]
depends_on: ["SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "F039-03", "F039-04", "F039-05", "api:PUT /api/memory/[id]", "api:GET /api/memory/conflicts", "api:POST /api/memory/[id]/restore", "table:user_memories", "store:memory_facts", "surface:web", "surface:mobile", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-06 Pin, correct stale facts and settle conflicts

A person can pin a memory so it ranks first and wins topic clashes. When a newer fact about the same topic (name, home, employer, role, origin) is saved, the older one is replaced but kept. A list of replaced memories lets the person restore one.

Area: [39. Memory product](README.md). Requirement items: [S39.16](../../10-requirements/capabilities/039-memory-product.md#s3916), [S39.19](../../10-requirements/capabilities/039-memory-product.md#s3919), [S39.20](../../10-requirements/capabilities/039-memory-product.md#s3920).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Pinned facts rank highest in the list, in what the assistant reads and in conflicts. A new same-topic fact replaces an older one, which stays as history, and the person can swap them back (managed-memory-context-service.ts:687-690, 760-870; apps/web/app/api/memory/conflicts/route.ts:15-60; apps/web/app/api/memory/[id]/restore/route.ts:20-70).

**Why it exists.** Explicit current instructions should override stale memory and conflicts should be recorded, not silently kept (doc: docs/product/competitive-guidance.md:316). The brief requires pin, stale correction and a visible, settleable conflict (S39.16, S39.19, S39.20).

**Who uses it.** Anyone whose situation changes, or who wants a fact kept first.

**Problems it solves**

- Old facts such as a previous city keep being used.
- Important facts get crowded out.
- A wrong automatic replacement can be undone.

**Use cases**

- Pin Reply in short sentences so it is always used.
- Move house and say I live in Berlin now; the Paris fact is replaced.
- Open Replaced memories and restore the old employer.
- See why a typed fact was not kept because a pinned one outranks it.

## 2. User experience

**Where to find it**

- Web and public Desktop: Settings, Personalization, Memory; pin icon on each fact (MemoryEditor.tsx:335-357); the replaced-memories section at the bottom of the Memory section (MemorySection.tsx:518; apps/web/features/settings/components/MemoryConflicts.tsx:105-155).
- Mobile: Memory screen, pin on a row (togglePin, store.ts:373), row Replaced memories, screen Replaced memories with section When memories disagree (memory.tsx:564; memory-conflicts.tsx:86-88).
- CLI: agi memory pin and agi memory unpin (lib.rs:1462-1471, 4201).
- VS Code: no pin or conflict command (package.json:479-510 lists none).
- Chrome: no pin or conflict view found (memorySheet.ts, memoryClient.ts).

**Before you start**

- Memory on for the replacement rules to apply to new writes (managed-memory-context-service.ts:619-625).
- Signed in for Cloud; mobile Local has its own on-device replaced list (memoryConflicts.ts:30-45).

**Screens and controls**

- Web pin button labels Pin memory and Unpin memory (MemoryEditor.tsx:346); when a source cannot pin, text says Pinning is not available for this memory source. (MemoryEditor.tsx:469-472).
- Web conflicts list: aria label Replaced memories, line Using: <kept text>, button Use the replaced one instead, wait text Switching... (MemoryConflicts.tsx:110,133,155).
- Mobile rule text: Pinned, added, then newer memories win. The replaced one is kept here. (memoryConflicts.ts:5-6); button Use the replaced one instead (memory-conflicts.tsx:173).
- CLI list marks pinned facts with * and says used first (lib.rs:4126-4132).

**Journey**

1. Pin: open the list, press the pin on a fact; it moves to the top.
2. Correct: state the newer fact in chat, type it, or edit; if the topic is one of the known topics the old fact is replaced at once.
3. Review: open Replaced memories to see the kept fact beside each replaced one.
4. Settle: press Use the replaced one instead to swap them.

**What the person sees and gets**

- Web empty text No memory has replaced another. (MemoryConflicts.tsx:105); load failure Could not load replaced memories. Try again later. (line 22).
- Typed or asked fact outranked by a pinned one: web error Kept ... instead, because it outranks the new fact.; chat receipt Not saved: a pinned memory on the same topic takes priority. (memoryStore.ts:295-303; use-explicit-memory-commands.ts:25).
- Restore returns the two ids swapped (restore route:70-80).

**Settings**

- Pin state is stored per memory (pinned).
- Ranking rule: pinned 2, user-written 1, automatic 0 (managed-memory-context-service.ts:687-690).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Pin and unpin through PUT /api/memory/[id] with pinned true or false (apps/web/app/api/memory/[id]/route.ts:78-135).
- Pinned facts sort first in the list (route.ts:76) and first when facts compete for context (managed-memory-context-service.ts:1099-1125, 1170-1180).
- Replacement happens inside the single write statement: rivals are active rows in the same project and workspace whose text starts with a known topic prefix; a higher-ranked rival keeps its place and the new fact is stored already superseded; otherwise all rivals are superseded by the new fact (managed-memory-context-service.ts:765-870).
- Known topics are only name, residence, employer, role and origin, with English prefixes (packages/ai/agent-core/src/memory.ts:612-619).
- Superseded rows are excluded from lists and from the context loaded for a turn (managed-memory-context-service.ts:375-377).
- GET /api/memory/conflicts lists up to 50 replaced memories whose keeper is still active and which are not deleted or expired (apps/web/app/api/memory/conflicts/route.ts:15-45).
- POST /api/memory/[id]/restore swaps the replaced and the kept memory in one statement, after checking the never-remember list again (restore route:20-70).
- Web UI for pin, conflicts and restore (MemoryEditor.tsx; MemoryConflicts.tsx).
- Mobile Local has its own supersede rule and restore (localMemoryWriter.ts:25-75; memoryConflicts.ts:30-45); mobile Cloud uses the server endpoints (memoryConflicts.ts:16-27).
- CLI pin and unpin push the pinned flag (lib.rs:4201-4224).

**Incomplete**

- Contradictions outside the five known topics are not detected: both facts stay and both are used (memory.ts:612-619).
- Topic detection works only on facts starting with the listed English phrases (memory.ts:626-634).
- Edit and pin do not run conflict handling [inferred from route [id]:100-135].
- VS Code cannot pin and has neither stale correction nor conflict view (brief S39.16, S39.19, S39.20).
- CLI has no stale-correction or conflict view (brief; lib.rs:1435-1486).
- Chrome: the brief marks stale correction and conflicts done, but the Chrome memory sheet and client contain no pin, supersede or conflict code (memorySheet.ts, memoryClient.ts, search for conflict, supersed, pinned returned nothing). The brief's cited lines in side_panel.ts are unrelated code. Chrome gets replacement only because the server applies it to Chrome writes [inferred].

**Present but disconnected or switched off**

- A background merge and stale sweep exists in the service (consolidateMemories, mergeDuplicateMemoryBatch, supersedeStaleMemoryBatch at managed-memory-context-service.ts:931-1085); I found no caller in apps/web/app or lib outside the service file and tests, so it appears not connected [inferred from a search for its name].

**Not available**

- Pin on VS Code and Chrome; replaced-memory view on CLI, VS Code and Chrome (verified for code present).

## 4. Required behaviour

**Established requirements**

- The user can mark a memory as important (pin) so it is kept and preferred over others. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.16)
- When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit. (source: S39.19)
- When two memories disagree, a stated rule decides which one is used, and the user can see or settle the conflict. (source: S39.20)
- Explicit current instructions override stale memories; record conflicts rather than silently preserving obsolete preferences. (source: doc: docs/product/competitive-guidance.md:316)

**Acceptance criteria**

1. Pinning a fact moves it to the top of the list and keeps it after reload.
2. With I live in Paris saved, saving I live in Berlin leaves only Berlin active.
3. The Paris fact appears under Replaced memories next to Using: I live in Berlin.
4. Pressing Use the replaced one instead makes Paris active and Berlin replaced.
5. With a pinned I live in Paris, typing I live in Berlin is not kept and the person is told why.
6. A replaced or restored memory never appears twice in the active list.
7. The conflicts list shows at most 50 entries.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The rule is: pinned beats user-written beats learned; among equals the newer wins [inferred from memoryWriteRank and rivals.rank > incoming.rank, managed-memory-context-service.ts:687-690, 813].
- Restore swaps rather than adds, so there is never an ambiguous double winner [inferred from restore route:48-68].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Broaden conflict topics beyond five, or let the model judge contradictions, then show them in the same Replaced memories list.
- [proposed] Add pin to VS Code and Chrome and a replaced-memories entry to CLI, VS Code and Chrome.
- [proposed] Connect or remove the unused consolidation sweep.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | memoryWriteRank / writeConsolidatedMemory | `apps/web/lib/services/managed-memory-context-service.ts` | Rank and supersede logic. |
| service | MEMORY_CONFLICT_TOPICS / memoryConflictTopic | `packages/ai/agent-core/src/memory.ts` | The five topics and their phrases. |
| service | rankMemoriesByRelevance | `apps/web/lib/services/managed-memory-context-service.ts` | Pinned first, then relevance ranking for context. |
| endpoint | PUT /api/memory/[id] | `apps/web/app/api/memory/[id]/route.ts` | Pin and unpin. |
| endpoint | GET /api/memory/conflicts | `apps/web/app/api/memory/conflicts/route.ts` | List replaced memories with their keepers. |
| endpoint | POST /api/memory/[id]/restore | `apps/web/app/api/memory/[id]/restore/route.ts` | Swap a replaced memory with its keeper. |
| component | MemoryConflicts | `apps/web/features/settings/components/MemoryConflicts.tsx` | Web replaced-memories list and restore button. |
| component | MemoryEditor pin button | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Pin and unpin control. |
| store | memoryStore setPinned | `packages/ui/unified-chat/src/stores/memoryStore.ts` | Pin call with rollback. |
| screen | memory-conflicts screen | `apps/mobile/app/(app)/settings/memory-conflicts.tsx` | Mobile replaced memories. |
| service | memoryConflicts (mobile) | `apps/mobile/src/features/memory/services/memoryConflicts.ts` | Local or Cloud list and restore. |
| service | writeLocalMemoryFact | `apps/mobile/src/features/memory/services/localMemoryWriter.ts` | Local rank and supersede. |
| store | mobile togglePin | `apps/mobile/src/features/memory/store.ts` | Pin for both scopes. |
| command | agi memory pin / unpin | `apps/cli/src/lib.rs` | CLI pin. |
| table | user_memories lifecycle columns | `apps/web/db/neon/0203_user_memories_lifecycle.sql` | superseded_by and superseded_at with a pair check. |
| table | user_memories pinned | `apps/web/db/neon/0047_user_memories_pinned.sql` | pinned column. |
| test | pinned-contract test | `apps/web/app/api/memory/__tests__/pinned-contract.test.ts` | Test file for pin. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Pin: client flips the flag locally, then sends PUT with pinned. | device and our servers | memoryStore.ts:343-362; route [id]:78-135 |
| New fact write: one SQL statement checks duplicates, finds same-topic rivals, chooses a keeper by rank, inserts and marks superseded rows. | our servers | managed-memory-context-service.ts:760-870 |
| Next turn: active rows only are loaded, pinned first, then by relevance to the question, at most 30 facts and 8,000 characters. | our servers | managed-memory-context-service.ts:67-71, 1128-1215, 1281-1300 |
| Review: client fetches /api/memory/conflicts. | device and our servers | MemoryConflicts.tsx:40-55; conflicts/route.ts |
| Restore: POST swaps the two rows after the exclusion check. | our servers | restore route:20-70 |
| Mobile Local does the same on SQLite. | device | localMemoryWriter.ts:41-75; memoryConflicts.ts:30-45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| pinned flag, superseded_by, superseded_at | table:user_memories | Yes through list and sync pulls | Replaced rows are kept until deleted or expired |
| Mobile Local replaced rows | store:memory_facts columns superseded_by, superseded_at | No | Until deleted |

**Models and providers.** No model decides conflicts: matching is by fixed text prefixes (memory.ts:612-634). The model only sees active facts (managed-memory-context-service.ts:1281-1300). Pinned facts are sent whichever model answers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; none for mobile Local. |
| Permissions | Rows scoped to user and workspace (conflicts/route.ts:30-40). |
| Subscription | none found in the code opened. |
| Limits and metering | Conflicts list capped at 50; context capped at 30 facts and 8,000 characters (conflicts/route.ts:15; managed-memory-context-service.ts:67,71). |
| Feature flags | none found. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found. |
| Local mode | Mobile Local pins and replaces on the device and shows its own replaced list; Local and Cloud are never merged (doc: docs/decisions/2026-09-27-founder-decisions.md:159-162; memoryConflicts.ts:30-45). CLI Local sessions use instruction files, with no pin. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Pending fact | Pin ignored until saved. | memoryStore.ts:347 |
| Pin save fails | Pin reverts and error is thrown. | memoryStore.ts:355-361 |
| Source cannot pin | Pin disabled with explanation text. | MemoryEditor.tsx:339-345,469-472 |
| No replaced memories | No memory has replaced another. | MemoryConflicts.tsx:105 |
| Restore target gone | 404 That memory is no longer waiting to be restored. | restore route:34,66-68 |
| Restore text now on never-remember list | Refused. | restore route:40 |
| Loading conflicts | Mobile LoadingIndicator Loading replaced memories; web shows retry text on failure. | memory-conflicts.tsx:109; MemoryConflicts.tsx:22 |
| Outranked write | Stored but already replaced; user told. | managed-memory-context-service.ts:803-830; memoryStore.ts:290-303 |
| Concurrent writes | Not handled beyond single-statement atomicity; no extra locking found. | managed-memory-context-service.ts:760 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/memory/__tests__/pinned-contract.test.ts`: Pin contract (name only; contents not opened)
- `packages/ui/unified-chat/src/components/__tests__/MemoryEditor.pin.test.tsx`: Pin control (name only)
- `apps/web/lib/services/__tests__/memory-lifecycle.test.ts`: Lifecycle and supersede (name only)
- `apps/web/lib/services/__tests__/managed-memory-context-service.test.ts`: Context service (name only)
- `apps/mobile/__tests__/MemoryConflictsScope.test.tsx`: Mobile conflicts scope (name only)
- `apps/web/lib/services/memory-commands.consolidation.live.test.ts`: Command consolidation (live test file; name only)
- `packages/ai/agent-core/src/__tests__/memory.test.ts`: Conflict topic helpers (name only)
- `apps/web/app/api/memory/__tests__/workspace-lifecycle.test.ts`: Workspace lifecycle (name only)

**Test scenarios**

- **Pin ordering**
  1. Add three facts, pin the second.
  2. Reload.
  - Expected: Pinned fact is first and still pinned.
- **Replacement**
  1. Add I live in Paris.
  2. Add I live in Berlin.
  3. Open Replaced memories.
  - Expected: Berlin active; Paris listed as replaced, with Using: I live in Berlin.
- **Restore**
  1. Press Use the replaced one instead.
  - Expected: Paris active, Berlin now replaced.
- **Pinned wins**
  1. Pin I live in Paris.
  2. Type I live in Berlin.
  - Expected: Berlin not kept; message names the pinned fact.
- **Unknown topic**
  1. Add I like tea.
  2. Add I like coffee.
  - Expected: Both stay active (not a known topic); the person must delete one.
- **CLI pin**
  1. agi memory pin <id>, then agi memory list.
  - Expected: Fact marked * and listed first in its group.

**Where to look when it fails**

- Log Failed to list memory conflicts (conflicts/route.ts:48).
- Row state: superseded_by not null, superseded_at set.
- Mobile status messages Kept ... instead, because it outranks the new fact.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)

## 10. Gaps and dependencies

- **Only five topics are detected as contradictions.** Affects: All apps. Evidence: packages/ai/agent-core/src/memory.ts:612-619. Work needed: Broaden or use a model judgement with the same replaced list.
- **Chrome conflict and stale-correction view not found despite the brief saying done.** Affects: Chrome. Evidence: memorySheet.ts and memoryClient.ts contain no conflict code; brief code pointers are stale. Work needed: Verify live; add a view or correct the brief.
- **No pin on VS Code and Chrome; no replaced list on CLI, VS Code.** Affects: VS Code, Chrome, CLI. Evidence: Brief S39.16, S39.19, S39.20; package.json:479-510. Work needed: Add controls.
- **Edit does not re-check conflicts.** Affects: All apps. Evidence: route [id]:100-135. Work needed: Run the write path on edit.
- **Unconnected consolidation sweep.** Affects: Server. Evidence: consolidateMemories defined at managed-memory-context-service.ts:1054, no caller found. Work needed: Decide: schedule or delete.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- F039-03
- F039-04
- F039-05
- api:PUT /api/memory/[id]
- api:GET /api/memory/conflicts
- api:POST /api/memory/[id]/restore
- table:user_memories
- store:memory_facts
- surface:web
- surface:mobile
- surface:cli

## Unknown

- Whether migrations 0203 and 0285 are applied in each environment (file headers say NOT YET APPLIED).
- Whether the Chrome extension offers any conflict view.
- Whether consolidateMemories is called anywhere outside tests.
- How mobile memoryFactRank orders origins (memoryOrigin.ts not opened).
- Whether pinned CLI memories are actually sent first in a Managed session.
