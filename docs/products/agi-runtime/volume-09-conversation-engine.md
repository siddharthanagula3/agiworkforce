# AGI Runtime — Volume 09 — Conversation Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/mobile/AGENTS.md` (active surface). Grounded in `crates/agiworkforce-protocol/src/{thread_id.rs,message_history.rs,items.rs,protocol.rs}`, `packages/runtime/src/events.ts`, `apps/web/app/api/chat/sync/route.ts`, `apps/web/app/api/chat/conversations/route.ts`, `apps/web/app/api/chat/conversations/[id]/messages/route.ts`, `apps/web/app/api/chat/branch/route.ts`, `apps/web/app/api/search/route.ts`, `apps/web/app/api/user/export/route.ts`, `services/api-gateway/src/routes/{providerStream,cloudChat}.ts`, and `packages/types/src/models.json`.

## Overview & stance

The Conversation Engine is the internal, shared data-and-event model for a chat: its identity, its ordered turns, how tokens stream in, and how it is branched, compressed, searched, and exported. It is not a surface and not a daemon. Its runtime core is the protocol crate — `ThreadId` (a UUID v7 conversation identity, ✅ `crates/agiworkforce-protocol/src/thread_id.rs`) and the `TurnItem` enum that types every message-shaped event — which all six surfaces compile in. The Managed-Cloud store and delta-sync (`apps/web/app/api/chat/*`) are the durable half.

Trust modes govern where a conversation may live. **Local** and **BYOK** (Desktop/CLI/VS Code only) conversations stay on the host with no `cloud_id`; only **Managed-Cloud** conversations get `web_conversations`/`web_messages` rows and sync (Web ↔ Mobile ↔ Desktop). The sync route is explicit: "Local/BYOK conversations have no cloud_id and are never pushed/pulled" (✅ `apps/web/app/api/chat/sync/route.ts`). Remote control never changes this — a phone window reads a conversation that keeps living locally. Every model label reads only from `packages/types/src/models.json`.

## Conversations — manage conversations

A conversation is identified by `ThreadId` at the runtime layer and by a UUID `cloud_id` in the store. The Managed-Cloud CRUD surface (create/list/update/soft-delete, title, model, `project_id`, `pinned`) is ✅ Built (`apps/web/app/api/chat/conversations/route.ts`; `ConversationDelta` in `apps/web/app/api/chat/sync/route.ts`). `HistoryEntry { conversation_id, ts, text }` is the local recents index (✅ `crates/agiworkforce-protocol/src/message_history.rs`). Requirement: conversation metadata is last-writer-wins by `updated_at`; delete is a `deleted_at` tombstone, never a hard delete, so sync propagates the removal. A runtime-level conversation manager unifying Local, BYOK, and Cloud stores behind one interface is 🔭 Planned — today each surface owns its persistence and only Cloud rows sync.

## Messages — message lifecycle

A turn is a typed `TurnItem`: `UserMessage`, `HookPrompt`, `AgentMessage` (with an optional `phase`), `Plan`, `Reasoning`, `WebSearch`, `ImageGeneration`, `ContextCompaction` (✅ `crates/agiworkforce-protocol/src/items.rs`). In the Cloud store, messages are **append-only**: the sync push inserts new rows and, on conflict, "only a deleted_at tombstone may change an existing message" — content, role, model, provider, and token counts are immutable (✅ `apps/web/app/api/chat/sync/route.ts`; `apps/web/app/api/chat/conversations/[id]/messages/route.ts`). Requirement: a message carries `role ∈ {user, assistant, system}`, `model`/`provider` labels, token/cost accounting, and `metadata`; the lifecycle is create → (stream, if assistant) → finalize → optional tombstone, and finalized messages never mutate in place. A unified cross-trust message log spanning Local/BYOK/Cloud is 🔭.

## Streaming — stream responses incrementally

Incremental output is modeled as delta events on the protocol `EventMsg` bus: `AgentMessageDeltaEvent` / `AgentMessageContentDeltaEvent`, `ReasoningContentDeltaEvent`, `ExecCommandOutputDeltaEvent`, `PlanDeltaEvent`, and `RealtimeTranscriptDelta`, with `HasLegacyEvent` bridging newer content deltas to legacy (✅ `crates/agiworkforce-protocol/src/protocol.rs`). The cross-runtime delivery layer is `packages/runtime/src/events.ts` — Tauri events on Desktop, an in-memory `EventTarget` on Web/test (✅). Managed-Cloud token streams ride the gateway SSE path (✅ `services/api-gateway/src/routes/providerStream.ts`, `cloudChat.ts`). Requirement: streaming is provider-neutral — the same delta events represent any provider's output, and the resolved model comes only from `packages/types/src/models.json`; a dropped stream surfaces a stream-error/disconnect event, never a silently truncated "complete" message. A unified streaming pipeline normalizing every surface and provider behind one interface is 🔭.

## Branching — alternate conversation paths

Branching from a chosen message into a new child conversation is ✅ Built on Web/Cloud: `POST /api/chat/branch` takes `{ sessionId, branchPointMessageId, branchName }`, copies history up to the branch point into a new session, and records the edge in a `conversation_branches` table (`parent_session_id`, `child_session_id`, `branch_point_message_id`) (✅ `apps/web/app/api/chat/branch/route.ts`). Requirement: a branch is a new `ThreadId`/conversation, not an in-place rewrite — the parent's append-only history is preserved, and a branch inherits the parent's trust mode (a Local conversation branches to a Local child; never into Cloud implicitly). A runtime-layer branching primitive on `ThreadId` (so CLI/Desktop can branch Local/BYOK chats, not only Cloud), branch-aware sync, and a visible branch tree are 🔭.

## Summarization — compress old context

The compaction primitive exists: `ContextCompactionItem` (a turn item with an optional `saved_path` for the pre-compaction transcript) and the `ContextCompactedEvent` it emits (🟡 `crates/agiworkforce-protocol/src/items.rs`, `protocol.rs`). The gap: these are _marker_ types recording "context was compacted here" — the summarizer that selects old turns, produces the summary, and swaps it into context is not implemented. Requirement: compression is lossless-by-reference — original turns are retained (via `saved_path`) and the summary is a distinct labeled item, never a mutation of prior append-only messages; it runs under the conversation's own trust mode and picks its summarizer model only from `packages/types/src/models.json`. The compaction strategy, token-budget triggers, and per-surface policy are 🔭 Planned.

## Search — search conversations

Managed-Cloud search is ✅ Built: `GET /api/search` runs case-insensitive `ilike` matching over `web_conversations.title` and `web_messages.content`, scoped to the authenticated user, with role/date filters plus recent-search, popular-search, and suggestion queries (✅ `apps/web/app/api/search/route.ts`). Memory search has its own route (`apps/web/app/api/memory/search`). Requirement: search is strictly user-scoped (RLS/`user_id` enforced) and only spans Managed-Cloud rows; Local and BYOK conversations are searched on-device and never indexed in the cloud. Semantic/vector search, ranking, and a cross-surface unified index over Local + Cloud are 🔭 Planned — today it is substring search over the Cloud store only.

## Export — export conversations

A GDPR Article 20 data-portability endpoint is ✅ Built (`GET /api/user/export`, machine-readable JSON: profile, subscription, credits, email prefs, device authorizations, org memberships, invite redemptions). The gap: that payload does **not** currently include conversation transcripts (🟡 `apps/web/app/api/user/export/route.ts`). Requirement: export is self-serve, user-scoped, and covers the full conversation graph (conversations, append-only messages, artifacts, branch edges) in an open format. Per-conversation export (single-thread Markdown/JSON download) and conversation content in the account export are 🔭 Planned. Local/BYOK export runs on-device; Cloud export comes from Neon rows — the two must never be silently merged.

## Repository map

- `crates/agiworkforce-protocol/src/thread_id.rs` — `ThreadId` (UUID v7 conversation identity).
- `crates/agiworkforce-protocol/src/message_history.rs` — `HistoryEntry` local recents index.
- `crates/agiworkforce-protocol/src/items.rs` — `TurnItem` enum; `ContextCompactionItem`.
- `crates/agiworkforce-protocol/src/protocol.rs` — delta/stream events, `ContextCompactedEvent`, `EventMsg`.
- `packages/runtime/src/events.ts` — cross-runtime event bus (Tauri + in-memory).
- `apps/web/app/api/chat/sync/route.ts` — Managed-Cloud delta sync (cursor + tombstones + idempotent upsert).
- `apps/web/app/api/chat/conversations/route.ts`, `.../[id]/messages/route.ts` — Cloud conversation/message CRUD.
- `apps/web/app/api/chat/branch/route.ts` — branch endpoint + `conversation_branches`.
- `apps/web/app/api/search/route.ts` — conversation search.
- `apps/web/app/api/user/export/route.ts` — GDPR data-portability export.
- `services/api-gateway/src/routes/{providerStream,cloudChat}.ts` — Cloud SSE streaming.

## Competitor notes

Claude, ChatGPT, and Codex all provide threads, streaming, branching/edit-and-retry, auto-summarized long context, search, and export — but single-provider and cloud-anchored, with every conversation on their servers by default. AGI's divergence: the model is provider-neutral (IDs from `packages/types/src/models.json`); trust boundaries are first-class, so Local and BYOK conversations never touch the cloud store, search index, or sync while Managed-Cloud chats sync Web ↔ Mobile ↔ Desktop; messages are append-only with tombstone deletes; and remote control reads a locally-running conversation rather than lifting it into the cloud. Where a parity feature is not yet built (semantic search, a real summarizer, conversation export), it is labeled 🔭 rather than faked.

## Acceptance / Definition of Done

- [ ] **Build:** `TurnItem` round-trips through the protocol; Cloud conversation/message CRUD, delta sync (cursor + tombstones + idempotent upsert), branch, and search endpoints have green tests; streaming delta events render incrementally on every surface via `packages/runtime/src/events.ts`.
- [ ] **Trust:** no Local/BYOK conversation, message, or search result is written to or read from the Cloud store; only rows with a `cloud_id` sync; branches and exports inherit the parent conversation's trust mode; model labels resolve only from `packages/types/src/models.json`.
- [ ] **Security:** all conversation reads/writes are user-scoped by RLS with server-set `user_id`; messages stay append-only (only `deleted_at` may change); CSRF + rate limits hold on mutating routes; a dropped stream emits an explicit error rather than a truncated "complete" message.

## Anti-patterns

- Syncing, indexing, or exporting a Local/BYOK conversation, or writing `user_id` from the request body instead of the verified session.
- Mutating a finalized message in place (editing content, re-scoring tokens) instead of appending or tombstoning; hard-deleting rows so sync can't propagate the removal.
- Presenting `ContextCompactionItem`/`ContextCompactedEvent` as a working summarizer, or the GDPR export as full conversation export — both are marked (🟡) with their gaps.
- Branching by rewriting the parent thread, or letting a branch/export cross Local → Cloud without an explicit fork.
- Hardcoding or inventing model IDs, routes, env vars, or command names; treating remote control as a fourth trust mode.
- Referencing Supabase (use Clerk + Neon + Stripe) or removed tiers (Plus, `pro_plus`, Hobby, credit top-ups). Use only Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
