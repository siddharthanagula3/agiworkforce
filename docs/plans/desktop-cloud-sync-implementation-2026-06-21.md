# Desktop cloud sync — implementation spec (P2 Phase 2)

Status: Approved-design (operationalizes `cross-device-cloud-sync-design-2026-06-20.md`)
Owner: this session
Last updated: 2026-06-21

Grounded by the `understand-desktop-sync` workflow synthesis. This spec is the
contract for bringing the desktop (Tauri/SQLite) client into the cloud sync loop
**without destroying the INTEGER autoincrement local primary keys**.

## 0. Anchors (do not redesign — implement)

- Wire protocol = the live web endpoint `apps/web/app/api/chat/sync/route.ts`:
  - `GET /api/chat/sync?since=<server_version cursor>` → `{ conversations[], messages[], cursor, hasMore }` (deltas with `server_version > cursor`, incl. `deleted_at` tombstones).
  - `POST /api/chat/sync` `{ conversations[], messages[] }` → idempotent UPSERT by `id (= cloud_id)`; **`user_id` is set server-side from the verified bearer session — NEVER send `user_id` in the body**; RLS `WITH CHECK` is the DB backstop.
- Reference implementation = mobile `apps/mobile/services/cloudSyncEngine.ts` (push-then-pull, cursor as bigint-string, append-only messages, tombstones, ack-based dirty clear) + sidecar `cloudSyncStateStore.ts`.
- Product decisions (locked, design doc): UUIDv7 ids, **new conversations only (lazy backfill)**, append-only messages, LWW metadata, no E2EE, managed-only.

## 1. Confirmed desktop reality

- `conversations`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `user_id TEXT`, `app_mode TEXT NOT NULL DEFAULT 'local'` (v66). NO sync columns.
- `messages`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `conversation_id INTEGER → conversations(id) ON DELETE CASCADE`, `user_id`. NO sync columns.
- Migrations: inline Rust `apply_migration_vN(conn)` in `data/db/migrations.rs`, dispatched by `if current_version < N { run_migration_in_transaction(conn, N, apply_migration_vN)? }`. **CURRENT_VERSION = 66 → add v67 and bump to 67.** `ensure_column()` is the idempotent ADD COLUMN helper (validates against `ALLOWED_TABLES`, rejects `;`/`-` in defs, requires def to start with the column name).
- Today: cloud chats persist **local-only**, tagged `app_mode='cloud'`; LLM streaming hits `{base}/api/llm/v1/chat/completions` with bearer auth (`sys::account::{get_access_token, get_api_base_url}`). Cloud persistence is a **no-op** (`data/cloud_sync.rs` stubs `spawn_sync_conversation`/`spawn_sync_message`, `CloudSyncClient::bulk_sync` returns failed).
- DEAD: `integrations/sync/` (custom `api.agiworkforce.com/api/sync` REST + device registration) — no production call site; remove/cannibalize. `offline_operations_queue` table exists, unused.

## 2. Schema — migration v67 (additive, INTEGER PK untouched)

`ALLOWED_TABLES` already contains `conversations`, `messages`. SQLite **cannot** `ADD COLUMN ... UNIQUE`, so add the column plain and enforce uniqueness with a **partial unique index**.

```rust
fn apply_migration_v67(conn: &Connection) -> Result<()> {
    // Cloud sync identity + bookkeeping. Additive only — local INTEGER PKs and the
    // INTEGER conversation_id FK are untouched; only the WIRE uses cloud_id.
    for table in ["conversations", "messages"] {
        ensure_column(conn, table, "cloud_id", "cloud_id TEXT")?;          // UUIDv7, NULL until synced
        ensure_column(conn, table, "server_version", "server_version TEXT")?; // bigint-as-string cursor value
        ensure_column(conn, table, "created_at_utc", "created_at_utc TEXT")?; // UTC ISO-8601 normalized
        ensure_column(conn, table, "deleted_at_utc", "deleted_at_utc TEXT")?; // tombstone
        ensure_column(conn, table, "needs_push", "needs_push INTEGER NOT NULL DEFAULT 0")?;
    }
    // messages also needs the cloud parent id so a pulled message can be FK-mapped
    // even before its parent conversation's local row is known.
    ensure_column(conn, "messages", "conversation_cloud_id", "conversation_cloud_id TEXT")?;

    // Partial UNIQUE indexes: uniqueness only on non-null cloud_ids (most local rows are NULL).
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_cloud_id \
         ON conversations(cloud_id) WHERE cloud_id IS NOT NULL", [])?;
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_cloud_id \
         ON messages(cloud_id) WHERE cloud_id IS NOT NULL", [])?;
    // Push scan + FK-map lookup indexes.
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_needs_push \
         ON conversations(needs_push) WHERE needs_push = 1", [])?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_needs_push \
         ON messages(needs_push) WHERE needs_push = 1", [])?;

    // Per-user sync cursor (server_version high-water mark). Own table so it survives
    // cold start independent of settings churn.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_sync_state ( \
            user_id TEXT PRIMARY KEY, \
            cursor TEXT NOT NULL DEFAULT '0', \
            last_sync_at TEXT \
        )", [])?;
    Ok(())
}
```

Add `"cloud_sync_state"` to `ALLOWED_TABLES`. Dispatch: `if current_version < 67 { run_migration_in_transaction(conn, 67, apply_migration_v67)? }` and set `CURRENT_VERSION = 67`.

Add the `v7` feature to the `uuid` crate in `Cargo.toml`: `features = ["v4", "v5", "v7", "serde"]`. Generate via `uuid::Uuid::now_v7().to_string()` (RFC 9562, time-sortable, server `z.string().uuid()` accepts it).

## 3. Identity minting (replace the no-op seams)

The mint points are the existing `cloud_sync_enabled`-gated calls — do NOT add new call sites.

- **On cloud conversation create** (`send_message_setup.rs:469` region, after `create_conversation_with_mode`, inside `if cloud_sync_enabled`): replace `cloud_sync::spawn_sync_conversation(...)` with `cloud_sync::mark_conversation_for_push(&conn, conv_id)` which:
  ```sql
  UPDATE conversations
     SET cloud_id = COALESCE(cloud_id, ?1),      -- mint once, idempotent
         created_at_utc = COALESCE(created_at_utc, ?2),
         needs_push = 1
   WHERE id = ?3 AND app_mode = 'cloud'
  ```
  (`?1` = `Uuid::now_v7()`, `?2` = `Utc::now().to_rfc3339()`.)
- **On cloud assistant/user message save** (`persistence.rs` `save_assistant_message`, the `if cloud_sync { cloud_sync::spawn_sync_message(...) }` at ~line 68; do the same for the user-message save path): replace with `cloud_sync::mark_message_for_push(&conn, msg_id)`:
  ```sql
  UPDATE messages m
     SET cloud_id = COALESCE(cloud_id, ?1),
         conversation_cloud_id = (SELECT c.cloud_id FROM conversations c WHERE c.id = m.conversation_id),
         created_at_utc = COALESCE(created_at_utc, ?2),
         needs_push = 1
   WHERE id = ?3
  ```
  Guard: only mark when the parent conversation is `app_mode='cloud'` (join check). The user message must be marked too (mirror the mobile fix: an aborted turn still syncs the user msg).
- After marking, trigger a **debounced background push** (see §6).

## 4. The engine (`data/cloud_sync.rs`) — Rust port of the mobile engine

Replace the stub module. Public surface:
- `pub async fn sync_now(db, user_id, token, base_url) -> Result<SyncOutcome>` — managed-gated push-then-pull, single-flight (a `tokio::sync::Mutex`/atomic flag).
- `mark_conversation_for_push` / `mark_message_for_push` (above).
- `start_sync_loop` / trigger plumbing (§6).

### 4.1 PUSH (local → cloud)
1. `SELECT id, cloud_id, title, model, ... , created_at_utc, updated_at, deleted_at_utc FROM conversations WHERE needs_push = 1 AND app_mode='cloud' AND user_id = ?` → map to wire `{ id: cloud_id, title, model, projectId, pinned, createdAt: created_at_utc, updatedAt, deletedAt: deleted_at_utc }`. **No user_id in body.**
2. `SELECT id, cloud_id, conversation_cloud_id, role, content, ... FROM messages WHERE needs_push = 1 AND <parent is cloud> AND user_id = ?` → wire `{ id: cloud_id, conversationId: conversation_cloud_id, role, content, createdAt, deletedAt }`. **Skip rows whose `conversation_cloud_id IS NULL`** (parent not yet minted) — they stay `needs_push=1` and retry next round (mirrors mobile's "unacked stays dirty"). Skip `role NOT IN ('user','assistant','system')`.
3. Conversations sent first (server upserts them before messages → message EXISTS check passes in one round trip).
4. `POST {base}/api/chat/sync` with `.bearer_auth(token)`. Parse `{ applied: { conversations:[{id,server_version}], messages:[{id,server_version}] }, cursor }`.
5. **Ack-clear**: for each acked `id` (= cloud_id), `UPDATE ... SET needs_push = 0, server_version = ? WHERE cloud_id = ?`. Conversations: clear all attempted (LWW, dependency-free). Messages: clear only acked (an unacked message — parent missing server-side — stays `needs_push=1`). NEVER blanket-clear on attempt.

### 4.2 PULL (cloud → local) — the dedup + FK-map crux
Loop while `hasMore`, starting from the stored cursor:
1. `GET {base}/api/chat/sync?since=<cursor>` with bearer.
2. **Apply conversations first** (so messages can FK-map). For each `ConversationDelta`:
   ```
   existing_local_id = SELECT id FROM conversations WHERE cloud_id = ? AND user_id = ?
   if delta.deleted_at:
       if existing: UPDATE conversations SET deleted_at_utc = ?, server_version = ? WHERE id = existing  (SOFT delete; never hard-delete — FK CASCADE would orphan)
   else if existing:
       UPDATE conversations SET title=?, model=?, ..., updated_at=?, server_version=?, needs_push=0 WHERE id = existing
   else:
       INSERT INTO conversations (cloud_id, user_id, title, model, app_mode, created_at, created_at_utc, updated_at, server_version, needs_push)
       VALUES (?, ?, ?, ?, 'cloud', ?, ?, ?, ?, 0)   -- new local INTEGER id auto-assigned
   ```
   **Dedup invariant: always `SELECT id WHERE cloud_id=?` before INSERT.** The partial UNIQUE index on `cloud_id` is the hard backstop.
3. **Apply messages.** For each `MessageDelta`, map parent: `local_conv_id = SELECT id FROM conversations WHERE cloud_id = delta.conversation_id`. If NULL (parent not present even after step 2) → **buffer/skip** (do not insert an orphan; it will arrive in a later page or the parent is filtered — log and continue). Then UPSERT by `cloud_id` exactly like conversations (append-only: on existing, only apply `deleted_at_utc`; insert new with the mapped INTEGER `conversation_id` + `conversation_cloud_id = delta.conversation_id`).
4. **Advance cursor** = max(server_version seen, response.cursor) using bigint-string compare; persist to `cloud_sync_state` after each fully-applied page. Stop on `!hasMore`.

## 5. Gating (managed-only, fail-closed, two independent gates)

- **Trust gate**: sync runs only when the active privacy/app mode is **managed cloud**. The existing hard gate `active_mode=='local' → cloud_sync_enabled=false` (`send_message.rs:32-44`) must keep forcing the mint hooks off in Local mode. The engine re-checks managed mode before any network call. Existing test `local_active_mode_forces_cloud_sync_disabled_even_with_cloud_storage_pref` (send_message_setup.rs:961) must stay green.
- **Egress gate**: all sync HTTP goes through the same outbound path as `managed_cloud_provider` (which is already managed-gated); never call the sync endpoint from a Local/BYOK context. A Local-mode conversation must never have a `cloud_id` or `needs_push=1` (the mint hooks are `app_mode='cloud'`-guarded).
- **Auth**: bearer token from `sys::account::get_access_token()`; base from `get_api_base_url()`. No `user_id` ever leaves in a body — server derives it and RLS enforces it.

## 6. Wiring / triggers

- Replace `data/cloud_sync.rs` stubs; keep the `sync_conversations_to_cloud` command entry point (`conversation.rs:334`, registered `lib.rs:2664`) but repoint it at `sync_now`.
- Trigger `sync_now`: (a) debounced after a mint (post-turn), (b) on app focus / cloud-mode entry, (c) a light interval while in managed mode. Single-flight so overlapping triggers coalesce.
- Remove/neutralize the dead `integrations/sync/` tree (or leave unwired and documented as dead) — do not let it compile-warn into the build path.

## 7. Test matrix (in-memory SQLite + mocked HTTP where needed)

1. **Migration v67**: run_migrations on a fresh + a v66 DB → columns/indexes/`cloud_sync_state` exist; INTEGER PK + FK intact; idempotent re-run.
2. **Mint**: create cloud conversation → `cloud_id` set (valid UUIDv7), `needs_push=1`, `created_at_utc` set; LOCAL conversation → `cloud_id` NULL, `needs_push=0`.
3. **Push gather/map**: rows → correct wire shape, `user_id` absent; message with NULL `conversation_cloud_id` skipped; tool-role skipped.
4. **Ack-clear**: acked rows `needs_push=0` + `server_version` set; an unacked message stays `needs_push=1`.
5. **Pull dedup**: applying a delta whose `cloud_id` already maps to local INTEGER 42 → UPDATEs row 42, does NOT insert a second row (count stays 1). The dedup invariant.
6. **Pull FK-map**: a pulled message with `conversation_id = <cloud_id>` lands with the correct local INTEGER `conversation_id`; orphan (unknown parent) is buffered/skipped, not inserted.
7. **Pull tombstone**: conversation delta with `deleted_at` → soft-delete (`deleted_at_utc` set), row + children NOT hard-deleted.
8. **Cursor**: advances to max server_version, persists, resumes from stored value; bigint-string compare correct across digit-length boundaries.
9. **Gating**: Local-mode never mints/pushes; `local_active_mode_forces_cloud_sync_disabled...` stays green.

## 8. Cross-agent boundary

- **RLS is server-side; do not reimplement.** Never send `user_id` in the sync body — the route sets it from the verified session; Neon RLS `WITH CHECK` enforces it.
- **Local DB encryption** is owned elsewhere: v67 must run through the same (possibly encrypted) connection as all migrations — it does, via `run_migrations`. `cloud_id` is a non-secret routing key and MUST stay queryable/indexable (the `WHERE cloud_id=?` dedup lookup); do not let column-level encryption (if any) cover it.
- **Egress guard** is shared infra — reuse, don't fork.
```
