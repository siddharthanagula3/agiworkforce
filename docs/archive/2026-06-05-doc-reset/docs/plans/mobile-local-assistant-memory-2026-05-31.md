# AGI Mobile — Local Personal Assistant with Learning Memory (No Fine-Tuning)

Status: DESIGN COMPLETE (2026-05-31). Plan/spec — no code yet. Slots into Phase C (TestFlight), with a small
Owner: founder + platform
Last updated: 2026-05-31

Phase-1 slice that can ride the Phase-A hardening pass.
Source: design workflow `wh15npeay` — 8 agents (3 explore: hermes-agent + our memory code + prompt-injection
point; 2 web: on-device memory techniques + consumer "remembers you" UX; 3 design + synthesis). Reuse claims are
grounded in real `file:line` from `apps/mobile`.
Related: `docs/plans/mobile-ondevice-llm-research-2026-05-31.md` (why keyword-over-embeddings in v1),
`docs/plans/mobile-release-strategy-2026-05-31.md` (phasing), `~/Desktop/reference/hermes-agent/` (reference).

## 1. Can a Local Sub-4B Model "Improve Day by Day"?

**Yes — via a memory + personalization layer, NOT weight fine-tuning.**

Weight fine-tuning on-device is infeasible: one gradient step on a 3B model burns 8–15GB RAM and 30–60s on a
high-end phone; on a typical 4–6GB device the OS/app crash, and ~10% battery per step means ~10 steps kills the
phone. So the **model stays frozen** and the **context around it evolves**:

1. Remembers what the user said across sessions (episodic memory).
2. Extracts + consolidates durable preferences (semantic memory / user profile).
3. Injects those facts as system context before every inference.
4. Adapts response style (warmth, emoji, technical depth) via learned personalization.
5. Decays / re-weights outdated facts over time.

Day 1 the user describes themselves; by day 30 the assistant has dozens of pinned facts + a learned profile
(timezone, expertise, goals, comm style). The _model_ doesn't learn — the _context it sees_ gets steadily more
personalized. This is exactly how ChatGPT memory, Claude memory, Gemini Personal Intelligence, and Apple
Intelligence work (memory-as-context-injection, not fine-tuning). **And because it's all on-device, it's the
privacy USP made concrete: the thing that knows you most never leaves your phone.**

## 2. How Hermes-Agent Does It + What We Adapt

Reference: `~/Desktop/reference/hermes-agent/`.

- **Two-layer context injection** (honcho/README.md:25–100): pinned facts (always) + semantic-relevant facts
  (retrieved); cold-start vs warm-session prompt branching ("who is this?" vs "what's relevant now?").
- **Multi-pass reasoning loop** (conversation_loop.py:354–358, 388–405): per-turn nudge counter; on session-end,
  audit turns → synthesize durable facts → reconcile with existing memory. Counter persists across turns.
- **Trust scoring & dialectic depth** (honcho/README.md:54–62, 141–200): facts tagged confidence/percentile;
  injection depth varies by reasoning level; async writes every N turns + session-end flush.
- **MemoryProvider ABC** (memory_provider.py): lifecycle hooks (system_prompt_block / prefetch / sync_turn /
  on_session_end / on_pre_compress) so providers swap (local SQLite vs cloud) without rewiring the chat loop.

**We reuse:** pinned+relevant gating, session-end consolidation, turn-counting nudge, trust scoring, async+flush
writes. **We simplify for mobile:** v1 fact extraction by keyword heuristics (no LLM call); fixed low injection
depth; single local-SQLite provider; **no embeddings unless one is bundled** (keyword/FTS fallback).

## 3. Current State — Reuse Map (what we already have)

We are NOT building from scratch — `apps/mobile/src/features/memory/` + storage + settings already provide most
of the engine.

| Component                                            | File:Line                                                                          | Reuse                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Memory CRUD (insert/list/search/update/pin/delete)   | `storage/memory.ts:19–66,108–116`                                                  | ✅ extend: trust_score, source, soft-delete     |
| Retrieval (top-K, graceful fallback)                 | `src/features/memory/store.ts:216–241`                                             | ✅ extend ranking pinned>trust>recency          |
| **Prompt-injection point**                           | `stores/chat/chatExecutionStore.ts:397–409` (in sendMessage, before localGenerate) | ✅ extend to 5-block prompt                     |
| Personalization store (sliders + instructions, MMKV) | `stores/settingsStore.ts:10–19,109–146`                                            | ✅ add `renderPersonalizationPromptBlock()`     |
| Memory screen (search/filter/add/import/pin/delete)  | `app/(app)/settings/memory.tsx:1–321`                                              | ✅ add metadata, source link, soft-delete trash |
| Memory item (swipe-delete, pin, edit)                | `src/features/settings/components/MemoryItem.tsx:1–146`                            | ✅ add trust/source badges                      |
| Context budgeter (70% warn / 80% cap)                | `src/features/memory/services/contextBudgeter.ts:58–79`                            | ✅ budget injection, dynamic K                  |
| Compactor (rolling summary of history)               | `src/features/memory/services/memoryCompactor.ts:23–97`                            | ✅ reuse; extend pattern to fact consolidation  |
| Import (ChatGPT/Claude/Gemini/text)                  | `src/features/memory/services/memoryImport.ts:71–300`                              | ✅ add guardrail filter + dedup review          |
| Encryption (MMKV + SecureStore)                      | `storage/db.ts`, `settingsStore.ts:149–157`                                        | ✅ as-is                                        |
| DSAR export                                          | `services/dsarExport.ts` (ref settingsStore.ts:75–78)                              | ✅ add learned_profile + facts + source links   |

**Missing (priority):** (1) personalization→prompt encoder; (2) trust_score column; (3) after-chat auto
fact-extraction; (4) fact-store consolidation (dedup/merge/decay); (5) structured learned_profile; (6) source
attribution; (7) soft-delete + purge timeline.

## 4. Architecture — 4 layers + user profile + consolidation loop

```
LOCAL INFERENCE PROMPT  (assembled at chatExecutionStore.ts:397, before localGenerate)
  [1] SYSTEM PERSONA      ← personalization sliders/instructions → text block
  [2] USER PROFILE        ← semantic memory: durable facts + learned_profile (the "knows me" layer)
  [3] RELEVANT MEMORIES   ← episodic recall: top-K facts matched to THIS turn
  [4] ROLLING SUMMARY     ← working memory: compacted older history (memoryCompactor)
  [5] RECENT TURNS        ← raw last-N messages

CONSOLIDATION (session-end + every N turns via nudge counter):
  extract facts (keyword v1 / LLM v2) → dedup/merge → bump trust on repeats → decay stale → supersede contradictions
```

- **[1] Working memory** — reuse `memoryCompactor.ts:23–97` as-is.
- **[2] Episodic** — `memory_facts` + `retrieveMemoryContext()`; retrieval = pinned ∪ top-K text-matched.
- **[3] Semantic / user profile** — durable facts + NEW `learned_profile` JSON (timezone, expertise[], goals[],
  comm_style) + trust_score on facts. This is the "deepens over time" layer.
- **[4] Consolidation loop** — extend the compactor pattern to the fact store.

**Token budget (small model):** call `computeContextBudget()` first; assume ~4K–8K window. Allocate persona ≤150,
profile ≤200, relevant ≤K×40 (K drops to fit), summary ≤300, rest = recent turns; hard cap 80% to leave room for
the answer.

**Embeddings vs keyword — v1 = keyword/FTS5, NO embeddings.** An embedder is a second model to bundle/load/run
(RAM+battery+thermal — see the on-device research doc). At tens–hundreds of facts, keyword + recency + trust is
sufficient and near-free. **Phase 3 (optional):** bundle a small embedder (EmbeddingGemma/all-MiniLM via
ExecuTorch) and add cosine rerank with keyword fallback — swappable behind `retrieveMemoryContext` without
touching the chat loop.

## 5. UX + Privacy Controls (the USP)

- **Memory screen** (extend `settings/memory.tsx`): per-fact metadata (when/which conversation/trust/pinned);
  soft-delete trash + undo; "clear all memory".
- **Learned-profile card** (NEW): top-of-screen "here's what I've learned about you" (occupation, timezone,
  expertise, goals, style) — each field editable/deletable. The visible "it knows me" surface.
- **Transparency** (NEW, subtle): "🧠 used N memories" under a reply → tap → which facts were injected + link to
  source conversation ("why do you know this?"). Mirrors ChatGPT/Claude.
- **Write indicator** (NEW): "Saved to memory: …" toast with one-tap undo / "don't remember this".
- **Per-conversation incognito** (NEW): "Temporary chat — don't save to memory" toggle (mirrors ChatGPT
  temporary chat); skips fact-extraction + history persistence.
- **Export** (extend `dsarExport.ts`): learned_profile + facts + source links; "Export my memory" button.
- **Consent flash on local→cloud** (carry existing rule): state that injected memories/profile would be sent;
  default OFF; remoteChatGate stays fail-closed.
- **Sensitive-data safety** (emotional-support use case): keyword-flag health/relationship/finance facts →
  "sensitive" tag → never shown in plaintext on a locked screen, excluded from cloud transfer by default;
  onboarding line "Your memory stays on this device."

## 6. Edge Cases

| Case                            | Handling                                                                                         | Reuse ref                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| Hallucinated/wrong fact         | transparency chip → "this is wrong" → soft-delete + lower trust; user always wins                | memory.tsx delete          |
| Contradictory facts over time   | match entity_tag; keep newest, mark older superseded; if both pinned, ask                        | consolidation loop         |
| Memory bloat vs small window    | budgeter caps K; consolidation dedups/merges; decay drops unused                                 | contextBudgeter.ts:58      |
| Sensitive data                  | keyword-flag → sensitive tag → cloud-excluded + locked-screen redacted                           | NEW guardrail              |
| Battery/thermal of extraction   | v1 keyword = no model call; run on session-end/idle; LLM extraction (v2) charger+wifi only       | research doc               |
| First-run cold start            | no facts → light onboarding Qs; show "I'll learn as we talk", not an empty card                  | personalization defaults   |
| Memory across model switches    | facts are plain text, model-agnostic; re-injected regardless of active model                     | injection point            |
| Delete-account / forget-me      | "clear all memory" wipes facts+profile+summaries; DSAR delete                                    | dsarExport + CRUD          |
| Import poisoning                | imported facts = low trust (30) + "imported" badge + dedup review before commit; not auto-pinned | memoryImport.ts:71         |
| Duplicate facts                 | dedup on extraction (normalized match); bump trust/usage instead of insert                       | consolidation loop         |
| Stale facts ("planning a trip") | decay: unused M days lose trust; ephemeral fact_type expires; durable persists                   | trust_score + last_used_at |

## 7. Phased Rollout

**Phase 1 — minimum "remembers you + improves" slice (can ride Phase-A; zero new models):**

1. Schema migration v3 — add trust_score, source_origin, source_conversation_id, usage_count, last_used_at,
   fact_type, marked_for_deletion. (S)
2. `renderPersonalizationPromptBlock()` — encode sliders+instructions → persona block. (S) ← biggest felt win,
   near-zero cost.
3. Auto fact-extraction (keyword heuristics: "I'm a / I prefer / my name is / remember that…"), trust 30. (M)
4. Retrieval ranking (pinned>trust>recency) + 5-block injection. (M)
5. Memory screen polish — badges, source link, soft-delete trash + undo, clear-all. (M)
6. Per-conversation incognito + onboarding "stays on device" line. (S)
7. Transparency affordance + write toast w/ undo. (S)
8. Export — add facts+profile to DSAR. (S)

**Phase 2 — TestFlight wave:** consolidation loop (dedup/merge/decay + nudge counter + supersede); learned-profile
card; sensitive-data guardrails; optional LLM extraction (charger+wifi).

**Phase 3 — later:** on-device embeddings (small embedder via ExecuTorch, keyword fallback); proactive recall
("last time you mentioned…").

## 7b. Verification pass (2026-05-31) — reuse map checked against real code

I read the actual files before trusting the subagent's reuse map (same discipline we used on the parity spec).
Result: **mostly accurate, with 3 corrections that change the plan.**

**Verified TRUE (safe to build on):**

- `storage/memory.ts` (138 lines) — local SQLite fact store. Schema is exactly
  `memory_facts(id, fact, source_conversation_id, pinned, created_at)` + a `memory_vectors(fact_id, embedding)`
  table that **already degrades gracefully when sqlite-vec is absent** (try/catch at :36-45, :82-87, :103-105).
  Confirms the v3 migration need (trust_score, source_type, deleted_at, etc.).
- `retrieveMemoryContext()` is at `src/features/memory/store.ts:216` (the file DOES exist; the dir-listing earlier
  only showed `services/` because store.ts sits one level up). It already does **embedding → text → pinned**
  fallback AND a **relevance gate** (:237-240: only pinned facts injected when no match) — better than the report implied.
- `contextBudgeter.ts` — `estimateTokens:33`, `computeContextBudget:40`, `needsCompaction:49`. Real.
- `memoryCompactor.ts` — `compact:45`, `estimateSummaryTokens:104` (report said :23; minor drift). Real.
- `memoryImport.ts` — `parseChatGPTExport:71 / parseClaude:126 / parseGemini:193 / parsePlainText:228 /
parseImportFile:276`. Real, clean exports (no dupes).
- `dsarExport.ts` — **export AND delete already cover memory and ship today.** `exportAllUserData:344` already
  calls `collectMemoryFacts():288` and writes `memory_facts` into the GDPR/DPDP payload (:355,:388).
  `wipeAllLocalData:433` already `DELETE`s `memory_facts` + `memory_vectors` + MMKV + downloaded models (:441-461)
  — the complete "forget-me/delete-account" primitive. The report's "extend dsarExport to include facts" is
  **WRONG — it's done.** Only the NEW columns (trust*score, learned_profile) need adding to the export \_once they
  exist*; current schema is fully covered. (Report also guessed a function name `exportMemoriesAsJSON` that does
  not exist; real names are `exportAllUserData` / `wipeAllLocalData`.)
- Personalization store — `settingsStore.ts:10-19` interface (fullName/nickname/occupation/instructions +
  warmth/enthusiasm/headersLists/emoji), defaults :109-118, setter :145. `isTemporaryChat:62` + `setTemporaryChat:144`. Exactly as reported.

**CORRECTIONS (the report was wrong or incomplete):**

1. **Memory injection ALREADY EXISTS and ships today** — `chatExecutionStore.ts:397-409` already retrieves top-5
   facts and `unshift`s them as a `role:'system'` block before `localGenerate`. The report framed this as "extend
   to inject"; in reality **injection works** and the task is to _upgrade_ the single block into the structured
   5-block prompt + apply budgeting. Lower effort than the report implied.
2. **Personalization is NOT injected anywhere** — grep confirms `personalization` is only read by
   `ChatEmptyState.tsx:44-45` for the greeting nickname. So `renderPersonalizationBlock()` is a genuine gap and
   the single highest-value/lowest-cost item (sliders are collected but never reach the model). Confirmed.
3. **Two different `memory.ts` files — do NOT conflate.** `storage/memory.ts` = local SQLite (use for local mode).
   `src/features/memory/services/memory.ts` = a **cloud `/api/memory` REST client** for cross-device sync — must
   NOT be wired into local mode (would violate the local/cloud boundary + remoteChatGate). The report's reuse map
   said "Memory CRUD | storage/memory.ts" which is right, but the second file's existence is a trap to flag.
4. **`ragIndex.ts` is a SEPARATE system** — it's conversation-scoped RAG over _attached documents_
   (`indexDocument`/`retrieve(conversationId,…)`/`deleteDocument`), not the durable cross-session fact store. Keep
   them distinct: `ragIndex` = docs-in-this-chat; `memory_facts` = who-the-user-is across chats.
5. **No auto fact-extraction / consolidation exists** — grep for extract/consolidate = zero hits. Confirmed gap
   (this is the actual "learning" engine to add, Phase 2).

Net: the spec stands; Phase-1 effort is _slightly lower_ (injection plumbing exists) and the must-flag is the
local/cloud memory.ts split.

## 7c. Service-Layer Architecture (applying the code-structure skill)

The memory feature has exactly the shape the skill targets: reusable mechanics (CRUD, retrieval, budgeting,
extraction, block-rendering) that **multiple callers** need (the chat turn, the session-end consolidation, the
memory screen, the export flow). So split it Actions-vs-Service — and reuse the services that already exist rather
than rebuild.

**Service layer — reusable mechanics ("how"), explicit params, structured returns, no domain decisions:**
| Service fn | Status | Home |
|---|---|---|
| fact CRUD (`insert/list/get/delete/update/togglePin/searchByText/searchByEmbedding`) | ✅ exists | `storage/memory.ts` |
| `retrieveMemoryContext(query,k,embedding?)` (ranked, fallback, relevance-gate) | ✅ exists, extend ranking (pinned>trust>recency) | `src/features/memory/store.ts:216` |
| `computeContextBudget` / `estimateTokens` / `needsCompaction` | ✅ exists | `contextBudgeter.ts` |
| `compact(messages)` rolling summary | ✅ exists | `memoryCompactor.ts` |
| import parsers | ✅ exists | `memoryImport.ts` |
| `exportAllUserData` / `wipeAllLocalData` | ✅ exists | `dsarExport.ts` |
| `renderPersonalizationBlock(personalization) → string` | ❌ NEW (pure fn) | `src/features/memory/services/` |
| `extractCandidateFacts(turns) → ImportedFact[]` (keyword v1) | ❌ NEW | `src/features/memory/services/` |
| `consolidateFacts(existing, candidates) → {merged, superseded}` (dedup/trust/decay) | ❌ NEW (Phase 2) | `src/features/memory/services/` |
| `buildLocalSystemContext({persona, profile, relevant, summary, recent}, budget) → ChatMessage[]` | ❌ NEW — the key composable | `src/features/memory/services/` |

**Orchestration layer — domain rules ("why/when"), calls services, owns failure handling:**

- `chatExecutionStore.sendMessage` (≈:397) owns: **when** to inject (every local turn), the **incognito rule**
  (skip writes when `isTemporaryChat`), the **local/cloud consent rule** (never send memory to cloud without the
  flash), and **failure classification** (memory failure must never block a turn — the existing try/catch at
  :407-409 is exactly right and stays). It should _call_ `buildLocalSystemContext(...)` instead of hand-rolling
  the single `memBlock` unshift it does today.
- NEW **session-end orchestrator** owns: **when** to extract/consolidate (on `/new` or idle), background
  scheduling (charger+wifi for the optional LLM path), and the nudge cadence. It calls `extractCandidateFacts` →
  `consolidateFacts` → fact CRUD.

Why this split (per the skill): `buildLocalSystemContext` is one composable capability block with explicit inputs
and a structured return (the assembled, budget-trimmed `ChatMessage[]`) — NOT a god method. The chat action and
any future caller choose what to pass. Domain policy (incognito, consent, "never block the turn") stays in the
action, never in the service. We extract **only** what ≥2 callers share (block-rendering: chat now + preview UI
later; extraction: session-end + manual "add to memory"); single-use logic stays inline (anti-over-abstraction).

**Migration order (skill's "one caller at a time, verify, then migrate"):**

1. Add `renderPersonalizationBlock` (pure, testable in isolation) → call it in `sendMessage` → verify the persona
   reaches the model. (One caller, lowest risk, biggest felt win.)
2. Add `buildLocalSystemContext` → replace the current ad-hoc `memBlock` unshift (:401-405) with one call →
   verify identical-or-better injection. (Refactor one caller.)
3. Then layer extraction/consolidation behind the session-end orchestrator. (New caller, services already in place.)

## 8. Recommended Stack

SQLite (facts/profile/summaries) + MMKV (sliders) + SecureStore (keys) — all wired. Keyword/FTS5 + recency +
trust ranking (no embeddings v1). Keyword extraction v1 → optional local-LLM v2 (charger+wifi). Consolidation =
extend memoryCompactor to facts. Injection = 5-block prompt at chatExecutionStore.ts:397, budgeted. Privacy =
on-device only, soft-delete + purge, DSAR export, incognito, consent-flash for cloud, sensitive redaction.
