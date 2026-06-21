# Cross-Device Cloud Chat Sync — Architecture Design (P2)

Status: APPROVED 2026-06-20 — Phase 0 authorized (build schema + sync API)
Owner: Founder + platform lead
Date: 2026-06-20
Spec: `docs/current/trust-mode-surface-matrix.md`
Supersedes: `docs/decisions/2026-05-22-cross-surface-sync-v1-stance.md` (which intentionally deferred this)

## Locked decisions (founder, 2026-06-20)

1. Canonical cloud ID = **UUIDv7** (client-generated, time-ordered).
2. Desktop backfill = **new conversations only** — existing local desktop history is NOT retroactively synced.
3. Messages are **append-only** (edits/regenerations create new messages).
4. Conflict policy = **last-writer-wins** on conversation metadata.
5. **No E2EE** on the managed-cloud tier (parity with Claude; server-readable). Local/BYOK stay private.
6. **Evolve `web_conversations`/`web_messages` in place** — no new tables.

> CROSS-AGENT COORDINATION: another terminal owns `0037_rls_user_isolation.sql` and the RLS `WITH CHECK` policies. This workstream MUST NOT edit `0037` or the RLS policies. All sync schema changes go in a NEW migration (`0038_cloud_sync_versioning.sql`).

**Goal.** One shared Managed-Cloud conversation store that syncs across **Web + Desktop + Mobile** under a single account — the Claude-like experience, going beyond Claude (which syncs web+mobile but **not** desktop). CLI / VS Code coding sessions stay local (per matrix). Chrome stays isolated.

**Hard constraints (founder, 2026-06-20):**

1. Resolve the **Data Tier Divergence first** (Desktop SQLite INTEGER autoincrement vs Web Neon UUID) — define a unified PK/ID + timestamp strategy.
2. The sync transport must assume **Neon RLS with strict `WITH CHECK` policies fully active**.
3. **Sync is a Managed-Cloud-only feature.** Local and BYOK are local-only and NEVER sync (ties to P1). BYOK is not a cloud/subscription mode.

---

## 0. Current state (grounded in code)

| Tier                 | Conversations PK                       | Messages PK                       | Timestamps                                             | Notes                                                                                              |
| -------------------- | -------------------------------------- | --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Web** (Neon PG)    | `id uuid` (`gen_random_uuid`)          | `id uuid`, `conversation_id uuid` | `timestamptz` (`created_at`/`updated_at`/`deleted_at`) | RLS via `app.user_id` + `current_app_user_id()`; `web_conversations`/`web_messages`.               |
| **Mobile** (SQLite)  | `id TEXT`                              | `id TEXT`, `conversation_id TEXT` | TEXT                                                   | Already UUID/TEXT — **aligned with web**. Already calls `/api/chat/conversations` in managed mode. |
| **Desktop** (SQLite) | `id INTEGER PRIMARY KEY AUTOINCREMENT` | INTEGER                           | `TEXT CURRENT_TIMESTAMP` (no tz)                       | **The lone outlier.** Legacy `supabase_sync.rs`/`CloudSyncClient` exists but is dead/gated.        |

So the divergence is **Desktop only**. Web + Mobile already share the UUID/TEXT identity model; the prior decision deferred unifying desktop.

---

## 1. Data Tier Divergence resolution (FIRST)

### 1.1 Canonical identity: client-generated UUIDv7

- **Cloud canonical ID = UUID string**, generated **client-side** at row creation (offline-first surfaces must create rows with no server round-trip). Use **UUIDv7** (time-ordered) not v4:
  - globally unique + offline-generatable (no autoincrement collisions across devices),
  - time-sortable → good Postgres B-tree index locality and a natural creation order even before timestamps are reconciled.
- **Web + Mobile**: their existing UUID/TEXT PK _is_ the cloud ID — switch generation to UUIDv7 going forward (existing v4 IDs remain valid; uniqueness is preserved).
- **Desktop (the migration)**: do **not** change the existing `INTEGER` PK (it backs local FKs and is referenced throughout). Instead add:
  - `cloud_id TEXT UNIQUE` (UUIDv7) on `conversations` and `messages` — the sync identity,
  - backfill `cloud_id` for existing local rows lazily (on first managed-mode sync or on access),
  - keep INTEGER `id` as the internal SQLite rowid; FKs stay INTEGER locally, but the **wire/cloud** representation always uses `cloud_id`.
- A small mapping layer on desktop translates local INTEGER FKs ↔ `cloud_id` at the sync boundary. Web/mobile need no mapping (PK == cloud_id).

### 1.2 Unified timestamp + ordering strategy

Wall-clock alone is unsafe (desktop TEXT local-clock, no tz; cross-device skew). Define on every synced row:

- `created_at_utc` — immutable, set at creation, **UTC ISO-8601** (normalize desktop's `CURRENT_TIMESTAMP` to UTC on write).
- `updated_at_utc` — UTC, bumped on metadata edits.
- `server_version BIGINT` — **server-authoritative monotonic** value assigned by Neon on every write (per-row, via a sequence/trigger). This is the **sync high-water mark** and the **primary ordering/conflict key** — not the client clock.
- `deleted_at_utc` — tombstone (soft delete; never hard-delete a synced row so deletes propagate).

Ordering: messages within a conversation order by `created_at_utc` then `cloud_id` (UUIDv7 breaks ties deterministically). Sync cursors use `server_version`.

---

## 2. Sync transport (assuming RLS `WITH CHECK` fully active)

### 2.1 One cloud schema, gateway-mediated

- A single canonical cloud schema (evolve `web_conversations`/`web_messages` into the shared `cloud_conversations`/`cloud_messages`, adding `server_version`, `created_at_utc`, `deleted_at_utc`). **All three surfaces** read/write **only via the gateway API** — never direct DB.
- New columns are additive; web continues working through the same tables during migration.

### 2.2 RLS is the backstop, the API is the gate

- Every request opens a transaction and runs `SET LOCAL app.user_id = <clerk_id>` where `<clerk_id>` comes from the **verified Clerk session**, never from the request body.
- Policies use **both** clauses:
  - `USING (user_id = current_app_user_id())` — read isolation (already present),
  - **`WITH CHECK (user_id = current_app_user_id())`** — write isolation: a client cannot INSERT/UPDATE a row owned by another user, even if it forges `user_id`. (This is the constraint the founder requires us to design against.)
- Because `WITH CHECK` is strict, the **API must set `user_id` server-side** on every upsert (derived from the session), and must never trust a client-supplied `user_id`. Batch upserts run inside one `SET LOCAL` transaction.

### 2.3 Protocol: pull + push (delta sync)

- **Pull** — `GET /api/chat/sync?since=<server_version cursor>` → rows with `server_version > cursor` (conversations + messages + tombstones), plus the new cursor. Page by `server_version`.
- **Push** — `POST /api/chat/sync` with the client's locally-changed rows (keyed by `cloud_id`). Server `UPSERT ... ON CONFLICT (cloud_id) DO UPDATE`, assigns a fresh `server_version`, enforces RLS `WITH CHECK`, returns the authoritative rows (with their server_version) so the client can advance its cursor. Idempotent (re-pushing the same `cloud_id` is safe).
- **Tombstones** — deletes are `deleted_at_utc` upserts; they sync like any other change and clients hard-delete locally after applying.
- **Conflict resolution** — **last-writer-wins** keyed by `(server_version, updated_at_utc)`. Messages are **append-only/immutable** (an "edit" creates a new message + truncates locally), so conflicts are confined to conversation _metadata_ (title, pinned, project_id) where LWW is acceptable. (No CRDT needed for v1; revisit only if collaborative editing arrives.)

### 2.4 Trust-boundary binding (ties to P1)

- Sync runs **only** when `privacyMode === 'managed'`. Local-mode and BYOK conversations have **no `cloud_id`** and are excluded from both pull and push. The P1 `local_only` router gate and the managed-only egress gate already enforce that Local never reaches the cloud — sync inherits that.
- Managed cloud is **not** end-to-end encrypted (server can read, as with Claude's managed cloud — required for cross-device read and server-side features). This is consistent with the metered managed-cloud trust tier; Local/BYOK remain private.

---

## 3. Target architecture (all 3 surfaces) + phased rollout

```
        ┌─────────────── Managed Cloud (Neon PG, RLS WITH CHECK) ───────────────┐
        │   cloud_conversations / cloud_messages   (cloud_id UUIDv7, server_version)   │
        └───────────────▲───────────────▲────────────────────▲──────────────────┘
                        │ gateway /api/chat/sync (pull+push, Clerk-auth, SET LOCAL app.user_id)
        ┌───────────────┴───┐   ┌────────┴────────┐   ┌────────┴───────────────┐
        │  WEB (Neon-native)│   │  MOBILE (SQLite)│   │  DESKTOP (SQLite + map)│
        │  PK == cloud_id   │   │  PK == cloud_id │   │  INTEGER PK + cloud_id │
        └───────────────────┘   └─────────────────┘   └────────────────────────┘
   CLI / VS Code: coding sessions, LOCAL only (not in store).   Chrome: isolated (own store).
```

- **Phase 0 — Foundation (no user-visible change).** Cloud schema additive migration (`cloud_id` semantics, `server_version` sequence/trigger, `created_at_utc`/`deleted_at_utc`); turn on RLS `WITH CHECK`; build `/api/chat/sync` (pull+push) with server-side `user_id`. UUIDv7 generation in the shared client lib.
- **Phase 1 — Web + Mobile (the easy win, closest to Claude).** Both already UUID/TEXT. Wire mobile's existing `/api/chat/conversations` usage into full delta pull+push; web reads/writes the same store. Result: a managed-cloud user sees the same chats on web and phone.
- **Phase 2 — Desktop (the hard part).** Add `cloud_id`/`server_version`/UTC columns + the INTEGER↔cloud_id mapping layer; build the offline-tolerant local↔cloud reconciliation engine (pull on connect, push local changes, tombstone deletes); replace the dead `supabase_sync.rs`/`CloudSyncClient`. Gated strictly behind managed mode.
- **Out of scope (by matrix):** CLI/VS Code coding history stays local; Chrome chats stay a separate store.

### Phase 1 status (2026-06-21) — SHIPPED, with one tracked carry-over

Mobile cloud chat is now wired to bidirectional sync (commits `f4061321d`, `1ca5ca97f`,
`76026ae83`): client-generated UUIDv7 ids for cloud conversations + messages, the REST
create endpoint accepts client ids, an additive write-through mirrors finalized cloud
turns into the cloud store + queues them, and a managed-only loop pushes/pulls deltas.
This is also the **first** server-side persistence path for mobile cloud chat (sends were
streaming-only before).

**Carry-over to Phase 2 (cross-device history continuation):** pulled messages land in
`chatCloudMessageStore` and display correctly via the merge facade, but `sendMessage`
builds LLM history from the local `msgStore.messages[conversationId]` (chatExecutionStore
line ~501). So continuing — on mobile — a conversation that was authored on web/desktop
and pulled down does NOT yet feed the pulled history to the model. Single-device authoring
is unaffected. Fix belongs with the Phase 2 reconciliation engine (unify history-building
to read the merged/cloud store for cloud conversations). Receive is also poll-based
(≤30s loop tick), not realtime — acceptable for v1.

---

## 4. Decisions to confirm before I build (Phase 0)

1. **UUIDv7** as the canonical cloud ID (recommended) vs v4.
2. **Desktop backfill**: retroactively give existing local desktop conversations a `cloud_id` and sync history on first managed sign-in, **or** sync only new conversations going forward? (Recommend lazy backfill of recent N, configurable.)
3. **Message immutability**: confirm edits/regenerations create new messages (append-only) rather than mutating — this is what keeps conflict-resolution simple.
4. **Conflict policy**: last-writer-wins on conversation metadata (recommended) — acceptable, or do you want stricter?
5. **No E2EE on managed cloud** (server-readable, like Claude) — confirm acceptable for the managed tier.
6. Naming: evolve `web_conversations`/`web_messages` in place vs introduce `cloud_*` tables (affects migration shape, not behavior).

---

**Requesting approval.** No implementation code has been written. On your ✅ (and answers to §4), I'll start with **Phase 0** (schema + RLS `WITH CHECK` + sync API design → then code), and keep each phase behind managed-mode gating so the P1 separation guarantees hold throughout.
