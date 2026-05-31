# Memory Phase-1 Service-Layer Architecture (Code-Structure Applied)

## Overview

This design applies the code-structure SERVICE-LAYER skill to the memory feature by:

1. **Extracting reusable service mechanics** from existing stores and action code
2. **Centralizing domain rules** in orchestration (never in services)
3. **Phasing in one caller at a time** with verification
4. **Reusing existing primitives** (storage, budgeter, compactor, import)
5. **NO rebuilding working code** — extending only

The result is 3 new service functions + 1 schema migration, wired into Phase-A chat flow with **zero disruption** to existing features.

---

## 1. Current Architecture (Verified Against Code)

### Storage Layer (read-only contract)

- **`storage/memory.ts`** (138 lines): Fact CRUD (insert/list/get/update/delete/togglePin/searchByText/searchByEmbedding) + graceful degradation when sqlite-vec missing
- **`storage/types.ts`** MemoryFact: `{id, fact, source_conversation_id, pinned, created_at}`
  - **Gap:** No trust_score, source_origin, source_type, usage_count, last_used_at, fact_type, marked_for_deletion (needed for Phase 1)

### Store/Retrieval Layer

- **`src/features/memory/store.ts:216-241`** `retrieveMemoryContext(query, k, embedding?)` — ranked retrieval with fallback
  - Returns top-K facts from embedding OR text search OR pinned-only (relevance gate)
  - **Gap:** Ranking is (pinned? embedding-match : text-match-recency). Phase-1 needs (pinned > trust > recency)
- **`src/features/memory/services/contextBudgeter.ts`** — token estimation + budget tracking
  - `estimateTokens(text)` — 4 chars/token approximation
  - `computeContextBudget(modelId, messages, systemPromptTokens)` — returns hardCap/warn/used/status
  - `needsCompaction(modelId, messages, systemPromptTokens)` — true when ≥80% full
  - **Status:** Ready to use; extend only on budget calculation

- **`src/features/memory/services/memoryCompactor.ts:45-97`** — rolling summary
  - `compact(modelId, messages, systemPromptTokens) → CompactionResult`
  - Drops oldest 50%, summarizes into single message, keeps newest 50% verbatim
  - **Status:** Ready to use; can extend pattern to fact consolidation (Phase 2)

### Settings/Personalization Layer

- **`stores/settingsStore.ts:10-19, 109-118`** Personalization interface
  - Fields: `fullName, nickname, occupation, instructions, warmth, enthusiasm, headersLists, emoji` (numeric 0-100)
  - MMKV-backed, rehydrated on app startup
  - **Gap:** Personalization is read by ChatEmptyState.tsx for greeting only. NEVER reaches the model in local inference.

### Injection Point (Action Layer)

- **`stores/chat/chatExecutionStore.ts:397-409`** `sendMessage` method
  - Line 397-409: Retrieves top-5 memory facts via `retrieveMemoryContext(content, 5)`
  - Line 401-405: Hand-rolls single memory block as `role:'system'` message
  - Line 405: unshifts block into historyMessages
  - **Gap:** No budgeting, no personalization block, single unstructured block

### Import + Export

- **`src/features/memory/services/memoryImport.ts:71–300`** parsers for ChatGPT/Claude/Gemini/text
- **Referenced in plan:** dsarExport.ts already exports memory_facts; only needs new columns when added

---

## 2. Service-Layer Design (New + Extended)

### A. New Service: `renderPersonalizationBlock`

**File:** `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/memory/services/personalizationRenderer.ts` (NEW)

**Purpose:** Pure function. Converts personalization sliders + instructions → text block for system context.

**Signature:**

```ts
export interface PersonalizationContext {
  fullName: string;
  nickname: string;
  occupation: string;
  instructions: string;
  warmth: number; // 0-100
  enthusiasm: number; // 0-100
  headersLists: number; // 0-100
  emoji: number; // 0-100
}

export function renderPersonalizationBlock(personalization: PersonalizationContext): string | null {
  // Return null if all fields empty/default — no persona to inject
  // Otherwise, encode sliders + instructions into prose block
}
```

**Returns:**

- `null` if personalization is empty (all defaults, fullName/instructions blank)
- Prose block (200–300 tokens) encoding tone modifiers + custom instructions

**Reuse:** None required (pure input → output transformation)

**Test:** 4 cases — all defaults → null; fullName + instructions → prose; sliders only → tone block; maximal → full block

**Effort:** S (simple string building, no I/O)

---

### B. New Service: `buildLocalSystemContext`

**File:** `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/memory/services/systemContextBuilder.ts` (NEW)

**Purpose:** The composable 5-block assembler. Called once per chat turn, returns budgeted system message(s).

**Input Interface:**

```ts
export interface LocalSystemContextInput {
  personalization: PersonalizationContext | null;
  userProfile: string | null; // [2] semantic
  relevantMemories: MemoryFact[]; // [3] episodic: top-K retrieved
  rollingCompactedSummary: string | null; // [4] working memory
  modelId: string; // for budget calculation
}

export interface LocalSystemContextOutput {
  messages: ChatMessage[]; // assembled system message(s)
  allocation: {
    personaTokens: number;
    profileTokens: number;
    memoriesTokens: number;
    summaryTokens: number;
    reserved: number;
  };
}

export async function buildLocalSystemContext(
  input: LocalSystemContextInput,
): Promise<LocalSystemContextOutput>;
```

**Algorithm:**

1. Reserved budget: 80% of model context window (via `computeContextBudget`)
2. Allocate in order: persona (≤150) → profile (≤200) → memories (≤K×40, K dynamic) → summary (≤300)
3. Assemble 5 blocks: persona | profile | memories | summary | [reserved for user/assistant]
4. Return: messages[] + allocation breakdown

**Reuse:**

- `estimateTokens`, `computeContextBudget` from `contextBudgeter.ts` (import)
- `renderPersonalizationBlock` from `personalizationRenderer.ts`

**Test:** 5 cases — persona only; persona + profile + memories; budget exhaustion → trim; null inputs → empty; summary overflow → drop

**Effort:** M (logic, budgeting, multi-block assembly)

---

### C. Extended Service: `retrieveMemoryContext` (enhanced ranking)

**File:** `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/memory/store.ts:216` (MODIFY)

**Change:** Extend signature + ranking to use (pinned DESC, trust_score DESC, created_at DESC).

**New parameter:**

```ts
rankBy: 'pinned>trust>recency' | 'relevance' = 'pinned>trust>recency'
```

**Implementation:**

- Retrieve candidate facts (embedding OR text OR pinned, as today)
- Sort by pinned > trust_score > created_at
- Return top k
- Fallback: if trust_score column missing, treat as 50 (default)

**Reuse:** All existing fallback logic, only add sort-order

**Effort:** S (add sort, one parameter)

---

### D. Optional Service: `extractCandidateFacts` (Phase 2, design only)

**File:** `/Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/memory/services/factExtractor.ts` (STUB, Phase 2 implementation)

**Purpose:** Parse recent turns for fact-like statements using keyword patterns ("I'm a", "I prefer", "my name is", "remember that", etc.).

**Phase-1 design only (not implemented).**

---

## 3. Schema Migration (v3)

**Current columns:** `id, fact, source_conversation_id, pinned, created_at`

**Add (Phase 1 minimum):**

```sql
ALTER TABLE memory_facts ADD COLUMN trust_score INTEGER DEFAULT 50;
ALTER TABLE memory_facts ADD COLUMN source_origin TEXT DEFAULT 'user';
ALTER TABLE memory_facts ADD COLUMN usage_count INTEGER DEFAULT 0;
ALTER TABLE memory_facts ADD COLUMN last_used_at INTEGER DEFAULT NULL;
ALTER TABLE memory_facts ADD COLUMN marked_for_deletion INTEGER DEFAULT 0;
```

**Later (Phase 2):**

```sql
ALTER TABLE memory_facts ADD COLUMN fact_type TEXT DEFAULT 'preference';
```

**Storage layer changes:**

- Update `storage/types.ts` MemoryFact interface
- Update `storage/memory.ts` row2fact() to read new columns (defaults provided)
- No changes to CRUD logic — just read/write

**Effort:** S (schema, type definitions, row mapper)

---

## 4. Orchestration Layer (Action)

### A. Chat Execution (`chatExecutionStore.ts:sendMessage`, lines 387–410)

**Current:** Hand-rolls single memory block; no budgeting; no personalization.

**New (Phase-1 deliverable):**

**Step 1: Prepare inputs**

```ts
const projectState = useProjectStore.getState();
const settingsState = useSettingsStore.getState();
const personalization = settingsState.personalization;
const memFacts = await retrieveMemoryContext(content, 5);

const userProfile =
  [
    personalization.fullName ? `User: ${personalization.fullName}` : null,
    personalization.occupation ? `Occupation: ${personalization.occupation}` : null,
  ]
    .filter(Boolean)
    .join('\n') || null;
```

**Step 2: Build system context**

```ts
const systemContextResult = await buildLocalSystemContext({
  personalization: settingsState.personalization,
  userProfile,
  relevantMemories: memFacts,
  rollingCompactedSummary: null, // Phase 2
  modelId: model,
});

historyMessages.unshift(...systemContextResult.messages);
```

**Step 3: Project instructions** (unchanged, but after 5-block context)

```ts
if (projectState.activeProjectId) {
  /* inject */
}
```

**Domain rules (stay in action, never move to service):**

- **Incognito rule:** `if (settingsState.isTemporaryChat) { skip memory injection }`
- **Local/cloud consent rule:** Memory NEVER sent to cloud without user consent (remoteChatGate, already enforced)
- **Never block the turn:** `try/catch` around memory retrieval (already correct, lines 407–409)

**Effort:** M (regroup calls, add personalization source)

---

### B. Session-End Orchestrator (Future, Phase 2)

**Concept (not Phase-1):** On-idle or `/new` action

1. Call `extractCandidateFacts(recentTurns)`
2. Call `consolidateFacts(existingFacts, candidates)`
3. Batch insert/update
4. Update last_used_at + usage_count for injected facts

**Stays in Phase 2 because:**

- No auto-extraction in Phase 1
- Manual fact addition via memory screen still works (existing)

---

## 5. Migration Order (Skill's One Caller At A Time)

### Phase-1a: Personalization Rendering (Lowest Risk, Highest Felt Win)

1. Add file: `personalizationRenderer.ts` with `renderPersonalizationBlock`
2. Wire in action: Import, call once in sendMessage
3. Test: Verify persona reaches model (manual: warmth slider 20 → cold; 80 → warm)
4. Commit: Single-purpose PR, revert-safe

**Effort:** S | **Risk:** None (pure function, no state changes)

---

### Phase-1b: System Context Builder (Core Refactor)

1. Add file: `systemContextBuilder.ts` with `buildLocalSystemContext`
2. Add migration: Schema v3
3. Update types: `storage/types.ts` MemoryFact
4. Update storage: `storage/memory.ts` row2fact()
5. Update retrieval: Extend `retrieveMemoryContext` ranking
6. Wire in action: Replace memory-injection code with one `buildLocalSystemContext` call
7. Test: Verify 5-block injection; verify budgeting at 80% threshold
8. Commit: Single integrated PR

**Effort:** M | **Risk:** Low (schema additive, defaults provided)

---

### Phase-1c: Polish + Integration

1. Add test coverage (unit + integration)
2. Verify memory screen UI displays new metadata
3. Wire incognito rule check (phase out memory when `isTemporaryChat`)
4. Manual testing in Phase-A QA

**Effort:** M (testing, UI polish)

---

## 6. Files to Add/Modify (Complete List)

### NEW FILES

- `apps/mobile/src/features/memory/services/personalizationRenderer.ts` (80 lines)
- `apps/mobile/src/features/memory/services/systemContextBuilder.ts` (120 lines)
- `apps/mobile/src/features/memory/services/personalizationRenderer.test.ts` (40 lines)
- `apps/mobile/src/features/memory/services/systemContextBuilder.test.ts` (50 lines)

### MODIFIED FILES

- `apps/mobile/storage/types.ts` — add MemoryFact fields
- `apps/mobile/storage/memory.ts` — update row2fact(), insertMemoryFact signature
- `apps/mobile/src/features/memory/store.ts:216-241` — extend `retrieveMemoryContext` ranking
- `apps/mobile/stores/chat/chatExecutionStore.ts:387-410` — replace ad-hoc block with `buildLocalSystemContext` call

### MIGRATION (Database)

- Embed in `storage/db.ts` or `migrations/001_add_memory_v3_columns.sql` — ALTER TABLE memory_facts ADD COLUMN (...)

---

## 7. Why This Split (Service vs. Action)

Per the code-structure SERVICE-LAYER skill:

**SERVICES (how):**

- `renderPersonalizationBlock` — converts personalization → text; reusable for preview UI later
- `buildLocalSystemContext` — assembles 5-block prompt; reusable for multi-turn previews or draft-assist
- `contextBudgeter` (existing) — token estimation; already multi-caller
- `memoryCompactor` (existing) — summarization; ready for fact consolidation extension
- `retrieveMemoryContext` (existing, enhanced) — retrieval with ranking; multi-caller

All have **explicit params, structured returns, no domain decisions**.

**ACTIONS (why/when):**

- `chatExecutionStore.sendMessage` owns:
  - **When** to inject (every local turn)
  - **Incognito rule** (skip if temporary chat)
  - **Local/cloud consent** (memory never clouds without user OK)
  - **Failure handling** (never block the turn)
  - **Project instructions** priority

**Anti-over-abstraction:**

- `extractCandidateFacts` and `consolidateFacts` are single-use (session-end only); they don't become services until ≥2 callers need them.

---

## 8. Backwards Compatibility & Risk Mitigation

### Schema Migration

- All new columns have **DEFAULT** values
- Existing facts auto-populated with defaults on first read
- Old insertMemoryFact calls still work (fields optional)

### Retrieval Ranking

- `retrieveMemoryContext` gains optional `rankBy` param; defaults to new ranking
- Fallback: if trust_score column missing, treat as 50 (default)
- No breaking change to existing callers

### Action Layer

- Current try/catch on memory retrieval stays intact
- New `buildLocalSystemContext` also wrapped in try/catch
- Personalization block returns null if empty — safe to skip

### Testing

- All new services have unit tests with mocked storage
- Integration tests verify buildLocalSystemContext + budgeting
- Existing memory tests still pass (CRUD unchanged)

---

## 9. Phase-1 Acceptance Criteria

**Deliverable 1: renderPersonalizationBlock**

- [ ] Function added to personalizationRenderer.ts
- [ ] Called from chatExecutionStore.sendMessage
- [ ] Persona block appears in system context
- [ ] Manual test: Warmth slider affects tone

**Deliverable 2: buildLocalSystemContext**

- [ ] Function added to systemContextBuilder.ts
- [ ] Replaces ad-hoc memory block in chatExecutionStore
- [ ] 5 blocks assembled in order
- [ ] Budgeting works: 80% cap enforced, memories trimmed if needed
- [ ] Manual test: Long conversation → memory facts trimmed

**Deliverable 3: Schema v3 + Retrieval Ranking**

- [ ] Migration runs successfully (backwards compat tested)
- [ ] New columns read/written in storage layer
- [ ] retrieveMemoryContext ranks by pinned>trust>recency
- [ ] Unit test: ranking order verified

**Deliverable 4: Integration + Safety**

- [ ] Incognito rule: isTemporaryChat=true → memory skipped
- [ ] Failure handling: memory failure doesn't block chat turn
- [ ] Existing memory screen + CRUD still work

---

## 10. No Conflicts with Founder Working Tree

- Memory services isolated to `/src/features/memory/services/`
- Schema migration is additive (no table drops, no renames)
- chatExecutionStore changes are internal (refactoring + personalization guard)
- No edits to core founding-era files (lib/models, auth, hooks, etc.)
- Existing memory screen + CRUD unaffected by Phase-1

---

## Summary: Service-Layer Design Concrete Deliverables

| Item                              | File                          | Reuse                                       | Effort | Why (Domain Logic)                           |
| --------------------------------- | ----------------------------- | ------------------------------------------- | ------ | -------------------------------------------- |
| **renderPersonalizationBlock**    | personalizationRenderer.ts    | None                                        | S      | Pure transformation; no side effects         |
| **buildLocalSystemContext**       | systemContextBuilder.ts       | contextBudgeter, renderPersonalizationBlock | M      | Orchestrates 5 blocks; budgeting logic       |
| **retrieveMemoryContext ranking** | store.ts:216                  | contextBudgeter                             | S      | Extend sorting; fallback graceful            |
| **Schema v3 migration**           | types.ts, memory.ts           | None                                        | S      | Additive columns, defaults provided          |
| **sendMessage refactor**          | chatExecutionStore.ts:387-410 | buildLocalSystemContext, settingsStore      | M      | Wire inputs, call builder, keep domain rules |

**Phase-1 Total Effort:** ~35 lines + ~40 tests + schema migration = **Medium (4–5 days with review)**

**Deployment:** Ride Phase-A hardening pass; land before TestFlight (Phase C).
