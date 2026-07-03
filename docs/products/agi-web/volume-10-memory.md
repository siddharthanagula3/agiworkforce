# AGI Web — Volume 10 — Memory

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `apps/web/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo paths: `apps/web/app/api/memory/route.ts`, `apps/web/app/api/memory/[id]/route.ts`, `apps/web/app/api/memory/search/route.ts`, `apps/web/app/api/memory/sync/route.ts`, `apps/web/db/neon/0010_memory.sql`, `apps/web/db/neon/0040_memory_cloud_sync.sql`, `apps/web/features/settings/sections/MemorySection.tsx`, `apps/web/app/settings/memory/page.tsx`, `apps/web/lib/runtime/memory-context.ts`, `packages/unified-chat/src/components/MemoryEditor.tsx`, `packages/unified-chat/src/stores/memoryStore.ts`.

## Overview & stance

Memory is the durable set of facts the assistant carries across conversations ("User prefers Python", "Ships on Fridays"). On AGI Web there is exactly one trust boundary: **Managed Cloud**. Web is cloud-only — **no Local mode, no BYOK** — so every memory a signed-in user owns is a user-scoped Neon row, protected by RLS and Clerk auth, and eligible for cross-device delta-sync. There is no on-device-only memory posture to honor here (that belongs to Mobile/Desktop Local). Web's job is to be the canonical **view and management console** for the account's cloud memory and to feed relevant facts into chat prompts.

A material split exists today and is called out per section: the **server memory stack** (Neon table, CRUD routes, search, delta-sync with tombstones) is largely built, while the **Web memory UI** (`MemorySection` → `MemoryEditor` from `@agiworkforce/unified-chat`) still reads/writes a device-local zustand store (`agi-memory-store-v1`, localStorage) rather than the Neon-backed routes. Wiring the UI to the account API is the primary 🟡 to close.

## Automatic Memories

Facts inferred from conversation history rather than typed by hand. The data model reserves this: `POST /api/memory` accepts `source` and validates it against `['mobile','desktop','web','auto']` — `'auto'` is the automatic-memory slot (`apps/web/app/api/memory/route.ts:85`), and the shared `MemoryFact` carries `sourceConversationId` (`packages/unified-chat/src/stores/memoryStore.ts:23`). Saved facts already influence answers: `buildMemorySystemContent` injects up to 50 facts / 4,000 chars as a leading system message (`apps/web/lib/runtime/memory-context.ts`). **🟡 Partial** — the storage slot and injection path exist, but there is **no extraction pipeline** that reads chat history and proposes/writes `source='auto'` memories; that generator is 🔭. Requirement: auto-memories must be reviewable before persistence (propose → user confirm), never silently written, and always labeled by source in the UI.

## Manual Memories

User-authored facts. `POST /api/memory` inserts a trimmed `content` (required, ≤10,000 chars), optional `category`, `source` defaulting to `'web'`, under CSRF + rate-limit + Clerk auth (`apps/web/app/api/memory/route.ts`). The shared editor's `add()` trims, dedupes case-insensitively, and prepends newest-first (`packages/unified-chat/src/stores/memoryStore.ts:57`). **🟡 Partial** — the API is ✅ built and tested (`apps/web/__tests__/api/memory.test.ts`), but the rendered `MemoryEditor` writes to the local store, not `POST /api/memory`; a signed-in user's manual add does not yet become a synced Neon row. Requirement: the Web editor must call the account API so manual memories persist server-side and sync.

## Categories

Optional grouping label per memory. `category` is a real column (`apps/web/db/neon/0010_memory.sql`) round-tripped by list/create/search/sync routes. **🟡 Partial** — the field exists and is stored, but it is **free-text with no defined taxonomy/enum** and the shared `MemoryFact` type has no `category` field, so the Web editor neither sets nor filters by it. Requirement: define a small fixed category set (or explicitly ship free-text), surface category chips/filter in `MemoryEditor`, and thread `category` through create + edit. Do not hardcode a taxonomy in a volume — land it in code first.

## Editing

Change an existing memory. `PUT /api/memory/[id]` updates `content` (≤10,000 chars), re-stamps `updated_at`, and is user-scoped + CSRF-guarded (`apps/web/app/api/memory/[id]/route.ts:53`). The editor's `update()` re-stamps `updatedAt` locally (`packages/unified-chat/src/stores/memoryStore.ts:73`). **🟡 Partial** — content edit is ✅ built server-side; the gap is that `PUT` edits **content only, not `category`**, and the Web UI edits the local store rather than the route. Requirement: edits must go through `PUT /api/memory/[id]`, cover category, and (via the sync trigger) advance `server_version` so the change propagates.

## Deletion

Remove a memory. `DELETE /api/memory/[id]` is a **soft delete** (`is_deleted = true`, `updated_at = now()`), user-scoped and CSRF-guarded (`apps/web/app/api/memory/[id]/route.ts:104`). This is deliberate: the delta-sync pull returns tombstones (`is_deleted = true`) so deletes propagate to other devices instead of resurrecting (`apps/web/app/api/memory/sync/route.ts`, index note in `apps/web/db/neon/0040_memory_cloud_sync.sql`). `clear()` backs a "forget everything" affordance (`packages/unified-chat/src/stores/memoryStore.ts:86`). **✅ Built** (server soft-delete + tombstone sync). 🟡 gap: hard/purge delete for a true "erase from cloud" is not implemented; document retention/erase behavior before GA.

## Privacy — view/manage, reference-chat search, generated memory, import (locked IA)

The locked Privacy information architecture, in order:

- **View / manage.** List and inspect memories with source shown. `GET /api/memory` returns id/content/category/source/timestamps, clamped to limit 1–100 / offset ≤10,000 (`apps/web/app/api/memory/route.ts:18`); rendered via `MemorySection` → `MemoryEditor`. **🟡 Partial** — API ✅ built; the UI still reads the local store (`MemorySection.tsx` copy even says "Stored on this device"), so it does not yet show the account's Neon memories. Wire the list to `GET /api/memory`.
- **Reference-chat search.** Find a memory and trace it to its origin conversation. `GET /api/memory/search?q=` does escaped-`ILIKE` content search, capped at 20 results, ≤500-char query (`apps/web/app/api/memory/search/route.ts`). **🟡 Partial** — content search ✅ built; jumping from a memory to its `sourceConversationId` chat is 🔭. Upgrade path (per the route comment) is vector similarity later.
- **Generated memory from history.** Batch-derive memories from past chats. **🔭 Planned** — no generation/extraction code exists; the `source='auto'` slot and `sourceConversationId` are the reserved landing spots. Must be review-gated, never auto-persisted.
- **Import from other AI providers.** Bring in exported memory from ChatGPT/Claude/etc. **🔭 Planned** — no import path exists in the repo. Requirement when built: explicit upload + preview + per-item confirm, stamped with a distinct source, entering the same RLS-scoped Neon rows; never bulk-write unreviewed third-party data.

## Repository map

- `apps/web/app/api/memory/route.ts` — list + create.
- `apps/web/app/api/memory/[id]/route.ts` — get / edit (content) / soft-delete.
- `apps/web/app/api/memory/search/route.ts` — ILIKE content search.
- `apps/web/app/api/memory/sync/route.ts` — RLS-scoped delta sync (cursor + tombstones + idempotent upsert), Managed-Cloud only.
- `apps/web/db/neon/0010_memory.sql`, `0040_memory_cloud_sync.sql` — `user_memories` table + `server_version` sync column/trigger/index.
- `apps/web/app/settings/memory/page.tsx`, `apps/web/features/settings/sections/MemorySection.tsx` — settings entry.
- `apps/web/lib/runtime/memory-context.ts` — prompt injection of saved facts.
- `packages/unified-chat/src/components/MemoryEditor.tsx`, `packages/unified-chat/src/stores/memoryStore.ts` — shared editor + store.

## Competitor notes

ChatGPT offers automatic "saved memories" plus "reference chat history," with view/manage and export. Claude keeps project/account memory with explicit user control. Codex is workspace/session-scoped, not consumer memory. **AGI's divergence:** memory is per-surface trust-bound. On Web (cloud-only) it is RLS-scoped Neon with delta-sync across Web ↔ Mobile ↔ Desktop for Managed-Cloud chats only; Local/BYOK memories on other surfaces have no cloud id and never sync here. AGI is multi-provider and model-agnostic — memory is a plain-text fact layer injected as a system message, portable across whichever chat model the account uses. AGI's deliberate stance vs. incumbents: **no silent auto-write** — generated and imported memories are review-gated, and every memory shows its source.

## Acceptance / Definition of Done

Production-ready when the Web memory UI is backed by the account API (not localStorage), CRUD + search + delta-sync are exercised end-to-end for a signed-in user, tombstones round-trip, and every capability shows its Built/Planned truth with a real path.

- [ ] Build: `MemoryEditor`/`MemorySection` read/write `GET|POST /api/memory`, `PUT|DELETE /api/memory/[id]`, `GET /api/memory/search`; `pnpm --filter @agiworkforce/web test` and `typecheck` green.
- [ ] Trust: all memory rows user-scoped via Clerk + RLS; sync path is Managed-Cloud only; no Local/BYOK rows reachable on Web; no cross-user leakage.
- [ ] Security: CSRF + rate-limit on all mutations; content ≤10,000 chars enforced; ILIKE wildcards escaped; deletes are tombstoned and propagate.

## Anti-patterns

- Do not claim automatic memory generation or provider import ships — both are 🔭; no repo code produces them.
- Do not present the localStorage `MemoryEditor` as the account's cloud memory; that is the open 🟡, not the finished state.
- Do not add BYOK or Local memory affordances to Web — cloud-only surface.
- Do not hard-delete when the sync contract expects tombstones; a non-tombstoned delete resurrects on the next pull.
- Do not silently write generated/imported memories — review-gate and label by source.
- Do not invent a category taxonomy, model IDs, routes, env vars, or INR prices in this spec; model IDs come only from `packages/types/src/models.json`.
- Never reference Supabase; the stack is Clerk + Neon + Stripe. Never reintroduce removed tiers (Plus/`pro_plus`/Hobby) — note the stale compiled billing artifacts as the tracked reconciliation 🟡, do not treat them as current.
