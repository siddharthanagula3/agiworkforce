# AGI Mobile — Volume 14 — Memory

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounds in `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and verified repo paths: `apps/mobile/storage/memory.ts`, `apps/mobile/src/features/memory/store.ts`, `apps/mobile/src/features/memory/services/*`, `apps/mobile/stores/memory/cloudMemoryStore.ts`, `apps/mobile/app/(app)/settings/memory.tsx`, `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/services/dsarExport.ts`. Model IDs are not asserted here; the on-device embedder is cited only as referenced in code, not as a `models.json` entry.

## Overview & stance

Memory on AGI Mobile is the durable "what the assistant knows about you" layer: short, user-readable facts that get retrieved and injected into a turn so the assistant feels continuous. The defining constraint is the trust boundary. Mobile exposes **two** trust modes — Local (small on-device LLM, free) and Managed Cloud — and **no BYOK** (canon). Memory is therefore split into two physically separate stores that must never co-mingle:

- **Local memory** lives in on-device SQLite (`apps/mobile/storage/memory.ts`, table `memory_facts`, with a sqlite-vec `memory_vectors` index). It never leaves the device unless the user runs an explicit, reviewed transfer.
- **Cloud memory** lives in a dedicated MMKV namespace (`apps/mobile/stores/memory/cloudMemoryStore.ts`) and is the only memory that participates in Neon delta-sync across Web ↔ Mobile ↔ Desktop.

`useMemoryStore` (`src/features/memory/store.ts`) reads `useChatAppModeStore().appMode` and routes every read/write to exactly one side. `retrieveMemoryContext()` enforces the boundary at injection time: in cloud mode it reads only the synced cloud store; in local mode only SQLite — so a local-only fact can never leak into a cloud turn. There is no "Provider Configuration / API key" surface here; on mobile that phrase means on-device model management, never keys. ✅ Built (`src/features/memory/store.ts`, `stores/memory/cloudMemoryStore.ts`).

## Automatic memory — AI-created

After each user turn, the app scans the user's own words for durable self-disclosure and persists the salient ones as third-person facts ("User is a …", "User prefers …", "User's name is …"). Extraction is a conservative keyword-heuristic engine — precision over recall, first-person only, skips questions, caps clause length — in `src/features/memory/services/factExtractor.ts`. Persistence runs through `consolidation.ts`, which dedupes candidates against existing facts (normalized key) and records the `source_conversation_id`, so the same disclosure is not re-stored every turn. Consolidation never throws (memory must never break a turn) and honors an `enabled` flag so temporary/incognito chats skip it entirely. ✅ Built (`src/features/memory/services/factExtractor.ts`, `consolidation.ts`; tests `__tests__/fact-extractor.test.ts`, `__tests__/memory-consolidation.test.ts`).

Auto-created facts are stored at low trust: visible in the Memory screen, editable, and deletable. An LLM-graded extraction step is 🔭 Planned — today the engine is heuristic, not model-driven, which is the safe default for an on-device-first surface.

## Manual memory — user-created

Users add their own facts via the Memory screen FAB and the `AddMemorySheet` bottom sheet (`app/(app)/settings/memory.tsx`, `src/features/settings/components`). `addMemory()` writes to SQLite in local mode or to the cloud store (UUIDv7 id, queued via `markMemoryForSync`) in cloud mode, with an optimistic list update either way. Bulk creation arrives through on-device import: `memoryImport.ts` parses ChatGPT, Claude, Gemini, and plain-text exports entirely on device (no upload), and `bulkInsert()` stores them with length/dup guards. The import screen is `app/(app)/settings/memory-import.tsx`. ✅ Built (`src/features/memory/services/memoryImport.ts`, `app/(app)/settings/memory-import.tsx`, `src/features/memory/store.ts`).

## Categories

Today the only first-class organizing axis is **pinned vs. unpinned**: the Memory screen exposes `All` and `Pinned` filter chips, and pinned facts sort to the top and are the relevance-gate fallback when nothing else matches. ✅ Built (`app/(app)/settings/memory.tsx`, `storage/memory.ts` `togglePinMemoryFact`). A richer **category taxonomy** (e.g. "work", "preferences", "personal") is only partially scaffolded: `CloudMemoryEntry` carries a `category` field on the wire, but it is written as `null` and not surfaced as a filter in the UI. 🟡 Partial (`stores/memory/cloudMemoryStore.ts` — field exists, set null; `store.ts addMemory` ignores `_category`). A user-facing, syncable category system is 🔭 Planned.

## Editing

Facts are editable in place. `updateMemory(id, fact)` applies an optimistic update, then persists: local mode writes `UPDATE memory_facts` (`storage/memory.ts updateMemoryFact`); cloud mode validates the entry exists in the cloud store **before** the optimistic update, bumps `updatedAt`, and re-queues for last-writer-wins sync. Pin/unpin is a first-class edit (`togglePin`), and re-embedding on edit is handled by `updateEmbedding` when sqlite-vec is present (degrading gracefully when it is not). ✅ Built (`src/features/memory/store.ts`, `storage/memory.ts`).

## Deletion

`deleteMemory(id)` removes from the list optimistically, then: local mode hard-deletes the fact and its vector row (`deleteMemoryFact`); cloud mode writes a **tombstone** (`isDeleted:true`) that stays until the server acks, so a delete is never silently lost mid-sync. Deleting a conversation nulls the `source_conversation_id` on any facts it produced rather than orphaning them (test `__tests__/conversation-delete-memory-facts.test.ts`). A full account/data wipe drops the entire memory store: DSAR `DELETE FROM memory_facts` (and `memory_vectors`) in `services/dsarExport.ts`. ✅ Built (`src/features/memory/store.ts`, `services/dsarExport.ts`, `storage/conversations.ts`).

## Privacy — memory controls

Memory is governed by explicit, testable controls:

- **Master toggle / temporary chat.** A personalization `memory` boolean and `isTemporaryChat` flag disable learning for new turns; consolidation short-circuits when `enabled` is false. ✅ Built (`stores/settingsStore.ts`, `consolidation.ts`).
- **Trust separation.** Local and cloud memory are physically separate stores; `retrieveMemoryContext` reads only the active mode's store, so Local facts never enter a Cloud turn. ✅ Built (`src/features/memory/store.ts`, `cloudMemoryStore.ts`).
- **Relevance gate.** Unpinned, non-matching facts are not injected — only keyword/vector matches, with pinned facts as the only no-match fallback. ✅ Built (test `__tests__/memory-relevance-gate.test.ts`, `personalContext.ts`).
- **Export & erase.** DSAR export emits memory facts; account wipe deletes them. ✅ Built (`services/dsarExport.ts`).
- **Cloud sync gating.** Cloud memory sync only runs for authenticated Managed-Cloud sessions; `remoteChatGate` fails closed when Cloud is disabled, and local memory is never auto-promoted to cloud. ✅ Built (`services/cloudSyncEngine.ts`, `services/remoteChatGate.ts`).

Per-fact visibility controls and a "why was this remembered?" provenance view are 🔭 Planned.

## Repository map

- `apps/mobile/storage/memory.ts` — SQLite `memory_facts` + sqlite-vec `memory_vectors` CRUD/search.
- `apps/mobile/src/features/memory/store.ts` — `useMemoryStore`, `retrieveMemoryContext`, mode routing.
- `apps/mobile/src/features/memory/services/` — `factExtractor.ts`, `consolidation.ts`, `personalContext.ts`, `personalization.ts`, `memoryImport.ts`, `contextBudgeter.ts`, `memoryCompactor.ts`, `ragChunker.ts`, `ragIndex.ts`.
- `apps/mobile/stores/memory/` — `cloudMemoryStore.ts`, `memorySyncStateStore.ts`.
- `apps/mobile/app/(app)/settings/` — `memory.tsx`, `memory-import.tsx`, `personalization.tsx`.
- `apps/mobile/services/` — `cloudSyncEngine.ts`, `dsarExport.ts`, `remoteChatGate.ts`.
- Shared/cloud: Neon memory delta-sync endpoint `apps/web/app/api/memory/sync` (frozen wire contract consumed by the engine).

## Competitor notes

ChatGPT and Claude mobile both offer cloud-only "memory" tied to a single account: facts are server-side, opaque, and there is no on-device store and no provider choice. AGI's deliberate divergence: memory is **per-trust-mode**. Local memory is genuinely on-device (SQLite + on-device embeddings), works offline, and never touches a server; Cloud memory is the only synced layer and is explicitly account-gated. AGI also ships **on-device import** of competitors' exports (ChatGPT/Claude/Gemini) so users can migrate without uploading. Because mobile has **no BYOK**, there is no key-scoped memory confusion that BYOK surfaces (Desktop/CLI/VS Code) must handle.

## Acceptance / Definition of Done

Production-ready when memory respects the trust boundary in every path, never blocks a turn, and gives the user full read/edit/delete/export control.

- [ ] **Build:** typecheck + `__tests__` for extraction, consolidation, relevance gate, cloud-memory-sync, and conversation-delete cleanup pass.
- [ ] **Trust:** local facts never appear in a cloud turn (and vice-versa); cloud delete uses tombstone-until-ack; temporary chat suppresses learning.
- [ ] **Security/privacy:** DSAR export + wipe cover `memory_facts` and `memory_vectors`; no memory writes outside the active mode's store; sync runs only for authenticated Cloud sessions.

## Anti-patterns

- Adding a BYOK / API-key affordance anywhere in memory — mobile has none.
- Auto-promoting Local memory into Cloud, or reading SQLite during a Cloud turn.
- Hardcoding or inventing a model ID for embeddings/extraction (read `packages/contracts/types/src/models.json`; cite code for the on-device embedder).
- Claiming a category taxonomy ships — it does not; only `All`/`Pinned` are real today.
- Hard-deleting a cloud fact before the server acks, or letting consolidation throw and break a chat turn.
- Referencing Supabase — the stack is Clerk + Neon + Stripe.
- Inventing INR prices or surfacing removed tiers (Plus, pro_plus, Hobby).
