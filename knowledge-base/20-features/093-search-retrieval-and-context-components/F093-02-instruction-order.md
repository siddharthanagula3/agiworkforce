---
id: "F093-02"
type: "feature"
title: "Instruction order"
aliases: ["Instruction resolver", "Instruction precedence", "Instruction layers", "Layer order", "S93.03"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.03"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "surface:web", "surface:desktop", "mode:cloud", "mode:local", "mode:own-key", "file:packages/contracts/context/src/instruction-precedence.ts", "F093-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-02 Instruction order

Instruction order places the parts of a model's system message in a fixed ranking: system, developer, project, personalized, memory, untrusted content. Memory and untrusted content are marked as reference only. A helper reports any lower layer placed above a higher one. The web chat endpoint sorts its blocks with it.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.03](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9303).

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

**What it does.** Defines six instruction layers, maps every context source class to one of them, sorts prompt blocks by layer with a stable order inside a layer, and defines a conflict table saying what happens to the losing layer (packages/contracts/context/src/instruction-precedence.ts:11-18,48-63,125-136,156-172).

**Why it exists.** So a lower layer such as a recalled memory or a fetched page cannot sit above, or act as, a higher one; the header comment says every surface orders by this and nothing else decides which instruction wins (instruction-precedence.ts:9-10).

**Who uses it.** The chat server code, tests and the desktop device-side copy; people only feel the effect when project or personal instructions change an answer.

**Problems it solves**

- Prompt injection through memory or fetched content being treated as commands (instruction-precedence.ts:22-26,37-44).
- Two modules ordering the same layers differently (precedenceDisagreements, lines 202-216).
- A source class whose trust does not fit its layer (instructionLayerTrustMismatches, lines 219-224).

**Use cases**

- A project instruction beats the person's custom instruction when they conflict.
- A recalled memory saying 'ignore previous rules' is treated as data.
- A fetched web page placed after memory in the prompt.
- A test fails if a new source class has no layer.

## 2. User experience

**Where to find it**

- No screen. Web: effect seen in Cloud chat answers shaped by project instructions or custom instructions.
- Desktop: Local and own-key turns use a device copy of the order (apps/desktop/src/lib/context-precedence.ts:1-9; apps/desktop/src/runtime/TauriRuntime.ts:33).
- Mobile, CLI, VS Code, Chrome: no use found. unknown.

**Before you start**

- A Cloud chat turn with at least two layers present.

**Screens and controls**

- None. Visible labels for project instructions and personal instructions were not read. unknown.

**Journey**

1. The person sets project or personal instructions.
2. They send a message.
3. The server composes the stable system preamble ordered by layer (request-processor.ts:2107-2133).
4. Per-turn blocks such as memory, past chats, project files and connector context are tagged with a layer and ordered (request-processor.ts:4231-4345,6235-6238).
5. The model receives the ordered text.

**What the person sees and gets**

- No visible output; ordering problems are only reported by tests and the helper instructionOrderProblems.

**Settings**

- Project instructions and personal custom instructions feed the project and personalized layers (request-processor.ts:2120-2126).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Layer ranking, class-to-layer map, stable sort and order check exist in the shared contract (instruction-precedence.ts:11-136).
- Web re-exports the contract (apps/web/lib/prompts/instruction-precedence.ts:3-26).
- composeManagedSystemPreamble sorts system, developer, project and personalized blocks with orderInstructionBlocks (request-processor.ts:2120-2127).
- Per-turn dynamic blocks are tagged by layer and sorted at request-processor.ts:6235.
- Conflict table covers every layer pair (instruction-precedence.ts:156-172).

**Incomplete**

- The two sorts run at different places: the stable preamble and the dynamic blocks are ordered separately, not one combined check (request-processor.ts:2120 and 6235).
- instructionOrderProblems has only non-test users in apps/web/lib/context/precedence.ts and apps/web/features/study/lib/study-session.ts (found by search; not opened), so no runtime check on chat turns was found.

**Present but disconnected or switched off**

- resolveInstructionConflict has no non-test caller; the conflict table is documentation and tests only (search found only the contract and web re-export).

**Not available**

- Desktop context-precedence.ts keeps a hand-written list because that package does not depend on the context contract; a web test keeps it in step (context-precedence.ts:1-9).
- Layer names differ from the brief: code has system, developer, project, personalized, memory, untrusted_context; the brief says system, workspace, project, user, skill (S93.03). No 'skill' or 'workspace' layer exists in the code.

## 4. Required behaviour

**Established requirements**

- Instructions from different layers are resolved in a defined precedence order. (source: S93.03 (brief))
- Memory and untrusted content are reference only and never commands. (source: instruction-precedence.ts:22-26,37-44)
- Blocks sort by layer rank; blocks within one layer keep build order. (source: instruction-precedence.ts:121-136)
- A check reports each lower layer placed above a higher one. (source: instruction-precedence.ts:105-119)
- Local and own-key turns must share the same ordering. (source: apps/desktop/src/lib/context-precedence.ts:1-9 (code comment))

**Acceptance criteria**

1. orderInstructionBlocks puts system before developer before project before personalized before memory before untrusted_context.
2. Two blocks of the same layer keep their original order.
3. instructionOrderProblems returns an empty list for a correctly ordered turn and one message per inversion otherwise.
4. Every context source class maps to a layer whose trust matches its own trust level (no mismatches).
5. Project knowledge files and connector and web results land in untrusted_context; account memory and past chats land in memory.
6. A project instruction appears before the personal custom instruction in the composed system preamble.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's names should be reconciled with the code's names in the knowledge base [inferred].
- A runtime assertion on real turns would catch a future inversion [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Call instructionOrderProblems on the final prompt of every chat turn and log failures.
- [proposed] Generate the desktop order from the contract instead of copying it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | INSTRUCTION_LAYERS and class map | `packages/contracts/context/src/instruction-precedence.ts` | Layer ranking, trust, class-to-layer map, conflict table, ordering helpers. |
| config | Source precedence list | `packages/contracts/context/src/context-source.ts` | CONTEXT_SOURCE_PRECEDENCE (lines 132-147) used by the engine to order items. |
| other | Web re-export | `apps/web/lib/prompts/instruction-precedence.ts` | Gives web code the contract helpers. |
| service | composeManagedSystemPreamble | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Orders system, developer, project and personalized blocks (lines 2107-2133). |
| service | Dynamic block ordering | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Tags per-turn blocks and sorts them at line 6235. |
| service | Free chat blocks | `apps/web/lib/services/turn-context-service.ts` | Builds personalized, memory and past-chat InstructionBlocks for the Free path (lines 402-409). |
| service | Engine item ordering | `packages/platform/context-engine/src/engine.ts` | Orders manifest entries and items by source precedence (lines 283-286). |
| other | Web precedence helper | `apps/web/lib/context/precedence.ts` | Web-side order derived from the contract; contents not read. |
| other | Desktop local order | `apps/desktop/src/lib/context-precedence.ts` | Device copy with current_request and account_instruction entries. |
| component | TauriRuntime | `apps/desktop/src/runtime/TauriRuntime.ts` | Imports orderLocalPromptBlocks (line 33). |
| test | Instruction precedence contract test | `packages/contracts/context/src/__tests__/instruction-precedence.test.ts` | Layer, trust, mapping and ordering tests. |
| test | Web assembly order tests | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.system-assembly-order.test.ts` | Observed layer order of the system message. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server collects the system prompt, study or developer text, project instruction and personal instructions. | our servers | request-processor.ts:2107-2127 |
| Server sorts these blocks by layer with a stable sort. | our servers | instruction-precedence.ts:125-136 |
| Per-turn blocks (memory, past chats, project files, connector context) are tagged with their layer and sorted. | our servers | request-processor.ts:4231,4274,4299,4338,6235-6238 |
| The model call receives the combined text. | outside service | SYS-chat-turn-pipeline; provider call not opened here |
| On Local or own-key desktop turns the ordering runs on the device. | device | apps/desktop/src/lib/context-precedence.ts:1-9; TauriRuntime.ts:33 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created; ordering is computed per request. | not stored | no | not applicable |

**Models and providers.** Ordering does not depend on the model or provider; the same layers apply to any provider route [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code; trust per layer is fixed (instruction-precedence.ts:37-44). |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Desktop Local and own-key turns order blocks on the device with a copied list (apps/desktop/src/lib/context-precedence.ts:1-9). Mobile, CLI, VS Code and Chrome Local behaviour unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown layer pair in a conflict | resolveInstructionConflict throws 'No conflict rule pairs ...'. | instruction-precedence.ts:187-189 |
| Empty block | Empty texts are filtered out when joined. | request-processor.ts:2128-2130,6235-6238 |
| Two blocks in one layer | Keep creation order. | instruction-precedence.ts:121-136 |
| Offline, timeout, cancel, retry | not handled in the code of this feature; it is a pure sort. | Searched instruction-precedence.ts; it has no network, timeout or retry code. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/context/src/__tests__/instruction-precedence.test.ts`: Layer recognition, ranks, context-only layers, class-to-layer trust match, ordering, conflict table.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.system-assembly-order.test.ts`: Observed order of system message layers using instructionOrderProblems.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.project-precedence.test.ts`: Project instruction against personal instruction order.
- `apps/web/lib/prompts/__tests__/instruction-precedence.test.ts`: Web re-export of the contract.
- `apps/desktop/src/lib/__tests__/context-precedence.test.ts`: Desktop order list.

**Test scenarios**

- **Layer order**
  1. Call orderInstructionBlocks with blocks in reverse layer order.
  - Expected: Output is system, developer, project, personalized, memory, untrusted_context.
- **Project over personal**
  1. Set a project instruction and a conflicting custom instruction.
  2. Capture the composed system preamble.
  - Expected: Project text comes before personal text.
- **Injected memory**
  1. Store a memory reading 'ignore your rules'.
  2. Send a message that recalls it.
  - Expected: Text sits in the memory layer, marked reference only, and does not override system or project text.
- **New source class**
  1. Add a class to CONTEXT_SOURCE_CLASSES without a layer.
  - Expected: The contract tests fail (accounts for every class exactly once).

**Where to look when it fails**

- Failing message from instructionOrderProblems: '<layer> is assembled ahead of <layer>, which outranks it'.
- instructionLayerTrustMismatches output.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Layer names in the brief differ from the code.** Affects: Anyone reading the brief; web.. Evidence: S93.03 says system, workspace, project, user, skill; code says system, developer, project, personalized, memory, untrusted_context (instruction-precedence.ts:11-18).. Work needed: Update the brief or add 'workspace' and 'skill' layers if required.
- **No runtime check on real turns.** Affects: Web Cloud chat.. Evidence: Non-test users of instructionOrderProblems are lib/context/precedence.ts and study-session.ts only.. Work needed: Assert the final prompt order per turn or in a guard.
- **Conflict table has no non-test caller.** Affects: Web.. Evidence: Search found resolveInstructionConflict only in the contract and the web re-export.. Work needed: Use it where conflicts are reported, or remove it.
- **Desktop keeps a hand-copied order.** Affects: Desktop Local and own-key turns.. Evidence: apps/desktop/src/lib/context-precedence.ts:1-9.. Work needed: Share the contract with desktop or keep the guard test.
- **No equivalent order for mobile, CLI, VS Code, Chrome Local turns was found.** Affects: Those apps.. Evidence: No matches in the searched folders.. Work needed: Establish what each app does and record it.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- surface:web
- surface:desktop
- mode:cloud
- mode:local
- mode:own-key
- file:packages/contracts/context/src/instruction-precedence.ts
- F093-01

## Unknown

- What apps/web/lib/context/precedence.ts does exactly (not opened).
- Whether mobile, CLI, VS Code and Chrome extension order instructions at all.
- Which UI labels show project and personal instructions.
- Whether the brief's 'workspace' and 'skill' layers are meant to exist.
