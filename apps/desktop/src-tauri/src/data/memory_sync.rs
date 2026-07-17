//! Desktop cloud memory sync engine (managed-cloud only).
//!
//! Delta-syncs the SQLite `user_memory` table with the managed-cloud
//! `/api/memory/sync` endpoint, mirroring the chat engine in `cloud_sync.rs`.
//!
//! MANAGED-ONLY: every entry point is gated on a valid bearer token. The mint
//! hook (`mark_memory_for_push`) guards on `app_mode = 'cloud'` so local/BYOK
//! memories can never acquire a cloud_id or have needs_push=1. The trust boundary
//! is the same as chat: `derive_cloud_sync_enabled` in `send_message_setup.rs`.
//!
//! Wire protocol v2 (server-version compare-and-swap):
//!   POST /api/memory/sync  { protocolVersion: 2,
//!                            memories: [{ id, content, category?, source?,
//!                              pinned?, baseVersion, isDeleted? }] }
//!                        → { protocolVersion: 2, applied, conflicts, cursor }
//!   GET  /api/memory/sync?since=<cursor>
//!                        → { memories: [{ id, content, category, source,
//!                             is_deleted, created_at, updated_at,
//!                             server_version }], cursor, hasMore }
//!
//! INTEGER PKs are never sent over the wire; only `cloud_id` (UUIDv7).
//! `user_id` is never sent in a push body — the server derives it from session.
//!
//! Known local-schema gaps:
//!   - `topic` is NOT in the wire protocol. Pull-insert synthesizes it from
//!     `cloud_id` to satisfy the `NOT NULL` + `UNIQUE(category,topic)` constraint.
//!     Semantic loss: the topic is meaningless for pulled rows; local topic is
//!     preserved for push (content carries the real payload).
//!   - `importance` is NOT in the wire. Pulled rows default to 5 (DB default).
//!   - `category` from the server may be NULL or any string; it is clamped to
//!     the allowed set {'Preference','Fact','Decision','Context'} on insert.
//!     Unknown categories fall to 'Context'. Per-row errors skip, not abort.
//!   - Tombstone + UNIQUE(category,topic) race: if a user deletes then recreates
//!     the same category+topic in cloud mode, the lingering cloud_id and
//!     deleted_at_utc might collide. Tracked as a known gap — not fixed here.

use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::Client;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{debug, warn};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Wire shapes — field names must match the server schema exactly.
// Push uses camelCase (PushMemorySchema in route.ts); pull returns snake_case.
// ---------------------------------------------------------------------------

/// Pushed memory (camelCase, matching PushMemorySchema on server).
///
/// IMPORTANT: The server Zod schema uses `.optional()` (not `.nullable()`) for
/// `isDeleted` and `createdAt`. That means `undefined` (key absent) is accepted
/// but `null` (key present, JSON null) fails validation. All `Option<T>` fields
/// on this struct MUST carry `skip_serializing_if = "Option::is_none"` so serde
/// omits the key entirely rather than emitting `"isDeleted": null`.
///
/// `category` and `source` are `.nullable().optional()` on the server, so null
/// is technically OK there — but omitting them is equally safe and simpler.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushMemory {
    id: String, // cloud_id (UUIDv7)
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    /// Desktop does not store cloud `pinned`; omission preserves the server value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pinned: Option<bool>,
    base_version: String,
    /// Only emitted when `true` (tombstone). Non-deleted rows omit the key.
    #[serde(skip_serializing_if = "Option::is_none")]
    is_deleted: Option<bool>,
}

/// POST body.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoryPushBody {
    protocol_version: u8,
    memories: Vec<PushMemory>,
}

/// Ack for a single pushed row.
#[derive(Debug, Deserialize)]
struct AckedMemory {
    id: String,
    server_version: String,
}

/// POST response.
#[derive(Debug, Deserialize)]
struct MemoryPushResponse {
    #[serde(rename = "protocolVersion")]
    protocol_version: u8,
    applied: Vec<AckedMemory>,
    conflicts: Vec<MemoryConflict>,
    // cursor present but unused for push — pull has its own cursor.
    #[allow(dead_code)]
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MemoryConflict {
    id: String,
    current: Option<MemoryDelta>,
}

/// Pulled memory delta (snake_case, matching server SELECT columns).
#[derive(Debug, Deserialize)]
struct MemoryDelta {
    id: String,
    content: String,
    category: Option<String>,
    source: Option<String>,
    #[allow(dead_code)]
    #[serde(default)]
    pinned: bool,
    is_deleted: bool,
    created_at: String,
    updated_at: String,
    server_version: String,
}

/// GET response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemoryPullResponse {
    memories: Vec<MemoryDelta>,
    cursor: Option<String>,
    has_more: bool,
}

// ---------------------------------------------------------------------------
// Outcome types.
// ---------------------------------------------------------------------------

/// Outcome of a full memory push+pull cycle.
#[derive(Debug, Clone, Serialize)]
pub struct MemorySyncOutcome {
    pub memories_pushed: usize,
    pub memories_pulled: usize,
}

// ---------------------------------------------------------------------------
// Helpers — re-use the bigint cursor logic from cloud_sync (same algorithm).
// ---------------------------------------------------------------------------

fn bigint_greater(a: &str, b: &str) -> bool {
    let na = a.trim_start_matches('0');
    let na = if na.is_empty() { "0" } else { na };
    let nb = b.trim_start_matches('0');
    let nb = if nb.is_empty() { "0" } else { nb };
    if na.len() != nb.len() {
        return na.len() > nb.len();
    }
    na > nb
}

fn max_cursor(base: &str, versions: &[String]) -> String {
    let mut max = base.to_string();
    for v in versions {
        if !v.is_empty() && bigint_greater(v, &max) {
            max = v.clone();
        }
    }
    max
}

fn now_z() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn to_z_datetime(s: &str) -> String {
    if let Ok(dt) = s.parse::<DateTime<Utc>>() {
        return dt.to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return dt.and_utc().to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f") {
        return dt.and_utc().to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    warn!(
        raw_ts = s,
        "memory_sync: to_z_datetime: unparseable timestamp — using now_z()"
    );
    now_z()
}

/// Clamp a server-side category string to the local CHECK constraint values.
/// The route stores whatever the client sends — we must guard on ingest.
fn normalize_category(cat: Option<&str>) -> &'static str {
    match cat {
        Some(c) if c.eq_ignore_ascii_case("Preference") || c.eq_ignore_ascii_case("preference") => {
            "Preference"
        }
        Some(c) if c.eq_ignore_ascii_case("Fact") || c.eq_ignore_ascii_case("fact") => "Fact",
        Some(c) if c.eq_ignore_ascii_case("Decision") || c.eq_ignore_ascii_case("decision") => {
            "Decision"
        }
        _ => "Context", // NULL or unknown → Context
    }
}

// ---------------------------------------------------------------------------
// Single-flight guard (separate from SYNC_IN_FLIGHT in cloud_sync.rs).
// ---------------------------------------------------------------------------

static MEMORY_SYNC_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// DB cursor helpers — per-user memory cursor in cloud_sync_state.memory_cursor.
// ---------------------------------------------------------------------------

fn read_memory_cursor(conn: &Connection, user_id: &str) -> String {
    conn.query_row(
        "SELECT COALESCE(memory_cursor, '0') FROM cloud_sync_state WHERE user_id = ?1",
        params![user_id],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "0".to_string())
}

fn write_memory_cursor(conn: &Connection, user_id: &str, cursor: &str) {
    let _ = conn.execute(
        "INSERT INTO cloud_sync_state (user_id, cursor, memory_cursor, last_sync_at) \
         VALUES (?1, '0', ?2, ?3) \
         ON CONFLICT(user_id) DO UPDATE SET \
            memory_cursor = excluded.memory_cursor, \
            last_sync_at = excluded.last_sync_at",
        params![user_id, cursor, now_z()],
    );
}

// ---------------------------------------------------------------------------
// Identity minting.
// ---------------------------------------------------------------------------

/// Mint a UUIDv7 cloud_id for a newly-created cloud memory and mark it for push.
/// Idempotent: COALESCE ensures a second call keeps the original cloud_id.
/// Guard: only runs when `app_mode = 'cloud'` — local/BYOK rows are never touched.
pub fn mark_memory_for_push(conn: &Connection, memory_id: i64) -> SqlResult<()> {
    let cloud_id = Uuid::now_v7().to_string();
    let now = now_z();
    conn.execute(
        "UPDATE user_memory \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             created_at_utc = COALESCE(created_at_utc, ?2), \
             needs_push = 1 \
         WHERE id = ?3 AND app_mode = 'cloud'",
        params![cloud_id, now, memory_id],
    )?;
    Ok(())
}

/// Soft-delete a cloud memory (sets deleted_at_utc + needs_push) instead of
/// hard-deleting, so the tombstone propagates to other devices.
/// Returns true if the row was soft-deleted (was a cloud row), false otherwise
/// (caller should fall through to hard-delete for local rows).
pub fn soft_delete_memory_for_push(conn: &Connection, memory_id: i64) -> SqlResult<bool> {
    let now = now_z();
    let cloud_id = Uuid::now_v7().to_string();
    let rows = conn.execute(
        "UPDATE user_memory \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             deleted_at_utc = ?2, \
             needs_push = 1 \
         WHERE id = ?3 AND app_mode = 'cloud' AND deleted_at_utc IS NULL",
        params![cloud_id, now, memory_id],
    )?;
    Ok(rows > 0)
}

/// Soft-delete by category+topic (for `forget_topic`). Returns true if soft-deleted.
pub fn soft_delete_memory_by_topic_for_push(
    conn: &Connection,
    category: &str,
    topic: &str,
) -> SqlResult<bool> {
    let now = now_z();
    let cloud_id = Uuid::now_v7().to_string();
    let rows = conn.execute(
        "UPDATE user_memory \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             deleted_at_utc = ?2, \
             needs_push = 1 \
         WHERE category = ?3 AND topic = ?4 AND app_mode = 'cloud' AND deleted_at_utc IS NULL",
        params![cloud_id, now, category, topic],
    )?;
    Ok(rows > 0)
}

// ---------------------------------------------------------------------------
// DB-only push helpers.
// ---------------------------------------------------------------------------

/// Gather cloud memories that need pushing (needs_push=1, app_mode='cloud').
/// Tombstoned rows (deleted_at_utc IS NOT NULL) are included so deletes propagate.
fn gather_push_memories(conn: &Connection) -> SqlResult<Vec<PushMemory>> {
    let mut stmt = conn.prepare(
        "SELECT cloud_id, content, category, source, server_version, deleted_at_utc \
         FROM user_memory \
         WHERE needs_push = 1 AND app_mode = 'cloud' AND cloud_id IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        let cloud_id: String = row.get(0)?;
        let content: String = row.get(1)?;
        let category: Option<String> = row.get(2)?;
        let source: Option<String> = row.get(3)?;
        let server_version: Option<String> = row.get(4)?;
        let deleted_at_utc: Option<String> = row.get(5)?;
        let is_deleted = deleted_at_utc.is_some().then_some(true);

        Ok(PushMemory {
            id: cloud_id,
            content,
            category,
            source,
            pinned: None,
            base_version: server_version.unwrap_or_else(|| "0".to_string()),
            is_deleted,
        })
    })?;
    rows.collect()
}

fn memory_sync_content_matches(conn: &Connection, sent: &PushMemory) -> bool {
    conn.query_row(
        "SELECT content, category, source, deleted_at_utc FROM user_memory WHERE cloud_id = ?1",
        params![sent.id],
        |row| {
            let deleted_at: Option<String> = row.get(3)?;
            Ok(row.get::<_, String>(0)? == sent.content
                && row.get::<_, Option<String>>(1)? == sent.category
                && row.get::<_, Option<String>>(2)? == sent.source
                && deleted_at.is_some() == sent.is_deleted.unwrap_or(false))
        },
    )
    .unwrap_or(false)
}

/// Store every acknowledged revision, but clear only the exact snapshot sent.
fn ack_clear_memories(conn: &Connection, acked: &[AckedMemory], sent: &[PushMemory]) {
    for row in acked {
        let unchanged = sent
            .iter()
            .find(|item| item.id == row.id)
            .is_some_and(|item| memory_sync_content_matches(conn, item));
        let _ = conn.execute(
            "UPDATE user_memory SET server_version = ?1, \
             needs_push = CASE WHEN ?2 THEN 0 ELSE needs_push END WHERE cloud_id = ?3",
            params![row.server_version, unchanged, row.id],
        );
    }
}

fn resolve_memory_conflicts(
    conn: &Connection,
    user_id: &str,
    conflicts: &[MemoryConflict],
    sent: &[PushMemory],
) {
    for conflict in conflicts {
        let sent_item = sent.iter().find(|item| item.id == conflict.id);
        match &conflict.current {
            None => {
                let _ = conn.execute(
                    "UPDATE user_memory SET deleted_at_utc = COALESCE(deleted_at_utc, ?1), \
                     needs_push = 0 WHERE cloud_id = ?2",
                    params![now_z(), conflict.id],
                );
            }
            Some(current) if current.is_deleted => {
                apply_memory_deltas(conn, user_id, std::slice::from_ref(current));
            }
            Some(current) => {
                let preserve_local = sent_item.is_some_and(|item| {
                    item.base_version == "0" || !memory_sync_content_matches(conn, item)
                });
                if preserve_local {
                    let _ = conn.execute(
                        "UPDATE user_memory SET server_version = ?1 WHERE cloud_id = ?2",
                        params![current.server_version, conflict.id],
                    );
                } else {
                    let _ = conn.execute(
                        "UPDATE user_memory SET needs_push = 0 WHERE cloud_id = ?1",
                        params![conflict.id],
                    );
                    apply_memory_deltas(conn, user_id, std::slice::from_ref(current));
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// DB-only pull helpers.
// ---------------------------------------------------------------------------

/// Apply pulled memory deltas into the local SQLite DB.
/// Per-row failures are logged and skipped so one bad row doesn't abort the page.
fn apply_memory_deltas(conn: &Connection, user_id: &str, deltas: &[MemoryDelta]) -> usize {
    let mut applied = 0usize;
    for d in deltas {
        // Dedup: find existing local row.
        let existing: Option<(i64, i64)> = conn
            .query_row(
                "SELECT id, needs_push FROM user_memory WHERE cloud_id = ?1",
                params![d.id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .ok();

        if d.is_deleted {
            // Tombstone: soft-delete locally if we have the row.
            if let Some((local_id, _)) = existing {
                let _ = conn.execute(
                    "UPDATE user_memory SET deleted_at_utc = ?1, server_version = ?2, needs_push = 0 \
                     WHERE id = ?3",
                    params![d.updated_at, d.server_version, local_id],
                );
                applied += 1;
            }
            // If we don't have the row, the delete already propagated — no-op.
        } else if let Some((local_id, needs_push)) = existing {
            if needs_push != 0 {
                let _ = conn.execute(
                    "UPDATE user_memory SET server_version = ?1 WHERE id = ?2",
                    params![d.server_version, local_id],
                );
                applied += 1;
                continue;
            }
            // Clean local row: apply the server winner.
            let _ = conn.execute(
                "UPDATE user_memory \
                 SET content = ?1, category = COALESCE(?2, category), \
                     source = COALESCE(?3, source), \
                     server_version = ?4, needs_push = 0 \
                 WHERE id = ?5",
                params![
                    d.content,
                    d.category.as_deref(),
                    d.source.as_deref(),
                    d.server_version,
                    local_id
                ],
            );
            applied += 1;
        } else {
            // New row from another device — INSERT.
            // `topic` is NOT in the wire; synthesize from cloud_id to satisfy NOT NULL +
            // UNIQUE(category,topic). The actual semantic content is in `content`.
            let category = normalize_category(d.category.as_deref());
            let topic = format!("cloud:{}", &d.id);
            let created_at = to_z_datetime(&d.created_at);
            let updated_at = to_z_datetime(&d.updated_at);
            // Ignore user_id in gather/push (no user_id on user_memory) but for INSERT
            // we need to satisfy any user_id column that may exist. The table as created
            // in v46 has no user_id; we pass it only to write_cursor.
            let _ = user_id; // user_id used only for cursor; user_memory has no user_id col
            let r = conn.execute(
                "INSERT INTO user_memory \
                 (cloud_id, category, topic, content, importance, source, \
                  created_at, updated_at, created_at_utc, server_version, \
                  needs_push, app_mode) \
                 VALUES (?1, ?2, ?3, ?4, 5, ?5, ?6, ?7, ?8, ?9, 0, 'cloud')",
                params![
                    d.id,
                    category,
                    topic,
                    d.content,
                    d.source.as_deref(),
                    created_at,
                    updated_at,
                    d.created_at,
                    d.server_version
                ],
            );
            match r {
                Ok(_) => {
                    applied += 1;
                }
                Err(e) => {
                    // Partial UNIQUE index on cloud_id catches a race; log and skip.
                    debug!(cloud_id = %d.id, error = %e, "memory_sync: skipping pulled memory — insert failed");
                }
            }
        }
    }
    applied
}

/// Select the next cursor for the memory pull. Memory is ONE table (unlike chat
/// which has two), so the server's cursor IS the safe frontier — just guard against
/// moving backwards.
fn select_next_memory_cursor(current: &str, resp_cursor: &Option<String>) -> String {
    match resp_cursor {
        Some(c) => max_cursor(current, std::slice::from_ref(c)),
        None => current.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Public async engine: sync_memories_now.
// ---------------------------------------------------------------------------

/// Push local cloud-mode memory changes, then pull deltas from the server.
///
/// Single-flight: if a sync is already running the call returns immediately.
///
/// MANAGED-ONLY: the caller must supply a valid bearer token. An empty token
/// causes an immediate empty-outcome return (zero network I/O). The URL used
/// is `{base_url}/api/memory/sync`, mirroring how chat sync uses
/// `{base_url}/api/chat/sync`.
pub async fn sync_memories_now(
    db: &crate::sys::commands::chat::state::AppDatabase,
    user_id: &str,
    token: &str,
    base_url: &str,
) -> Result<MemorySyncOutcome, String> {
    // Single-flight guard.
    if MEMORY_SYNC_IN_FLIGHT
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(MemorySyncOutcome {
            memories_pushed: 0,
            memories_pulled: 0,
        });
    }

    let result = sync_memories_now_inner(db, user_id, token, base_url).await;
    MEMORY_SYNC_IN_FLIGHT.store(false, Ordering::Release);
    result
}

async fn sync_memories_now_inner(
    db: &crate::sys::commands::chat::state::AppDatabase,
    user_id: &str,
    token: &str,
    base_url: &str,
) -> Result<MemorySyncOutcome, String> {
    // Fail-closed: never touch the network without a bearer token.
    if token.trim().is_empty() {
        return Ok(MemorySyncOutcome {
            memories_pushed: 0,
            memories_pulled: 0,
        });
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("memory_sync: failed to build HTTP client: {e}"))?;

    let sync_url = format!("{}/api/memory/sync", base_url.trim_end_matches('/'));

    // ── PUSH ────────────────────────────────────────────────────────────────

    let push_memories = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        gather_push_memories(&conn)
            .map_err(|e| format!("memory_sync: gather push memories: {e}"))?
    };

    let n_pushed = push_memories.len();

    if n_pushed > 0 {
        let body = MemoryPushBody {
            protocol_version: 2,
            memories: push_memories,
        };

        let resp = client
            .post(&sync_url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("memory_sync: push request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("memory_sync: push failed {status}: {text}"));
        }

        let push_resp: MemoryPushResponse = resp
            .json()
            .await
            .map_err(|e| format!("memory_sync: failed to parse push response: {e}"))?;
        if push_resp.protocol_version != 2 {
            return Err(format!(
                "memory_sync: unsupported protocol response {}",
                push_resp.protocol_version
            ));
        }

        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            ack_clear_memories(&conn, &push_resp.applied, &body.memories);
            resolve_memory_conflicts(&conn, user_id, &push_resp.conflicts, &body.memories);
        }
    }

    // ── PULL ────────────────────────────────────────────────────────────────

    const PULL_PAGE_GUARD: usize = 50;
    let mut total_pulled = 0usize;

    let mut cursor = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        read_memory_cursor(&conn, user_id)
    };

    for _page in 0..PULL_PAGE_GUARD {
        let pull_url = format!("{}?since={}", sync_url, urlencoding::encode(&cursor));

        let resp = client
            .get(&pull_url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("memory_sync: pull request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("memory_sync: pull failed {status}: {text}"));
        }

        let pull_resp: MemoryPullResponse = resp
            .json()
            .await
            .map_err(|e| format!("memory_sync: failed to parse pull response: {e}"))?;

        let has_more = pull_resp.has_more;
        let new_cursor = select_next_memory_cursor(&cursor, &pull_resp.cursor);

        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            let applied = apply_memory_deltas(&conn, user_id, &pull_resp.memories);
            total_pulled += applied;
            write_memory_cursor(&conn, user_id, &new_cursor);
        }

        cursor = new_cursor;
        if !has_more {
            break;
        }
    }

    Ok(MemorySyncOutcome {
        memories_pushed: n_pushed,
        memories_pulled: total_pulled,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::migrations::run_migrations;
    use rusqlite::Connection;

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");
        conn
    }

    // ── Test 1: Migration v68 columns/indexes exist ──────────────────────────

    #[test]
    fn migration_v68_adds_memory_sync_columns() {
        let conn = fresh_db();

        for col in [
            "app_mode",
            "cloud_id",
            "server_version",
            "created_at_utc",
            "deleted_at_utc",
            "needs_push",
        ] {
            let exists: bool = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) > 0 FROM pragma_table_info('user_memory') WHERE name = '{}'",
                        col
                    ),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            assert!(exists, "user_memory.{} should exist after v68", col);
        }

        // memory_cursor column must exist on cloud_sync_state.
        let mc_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('cloud_sync_state') WHERE name = 'memory_cursor'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);
        assert!(
            mc_exists,
            "cloud_sync_state.memory_cursor must exist after v68"
        );
    }

    // ── Test 2: Mint — sets cloud_id + needs_push on cloud memory ────────────

    #[test]
    fn mint_sets_cloud_id_and_needs_push_for_cloud_memory() {
        let conn = fresh_db();

        // Insert a cloud-mode memory.
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'test_topic', 'some content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id: i64 = conn.last_insert_rowid();

        mark_memory_for_push(&conn, mem_id).unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM user_memory WHERE id = ?1",
                params![mem_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_some(), "cloud_id must be set after mint");
        assert_eq!(needs_push, 1, "needs_push must be 1 after mint");
        let cid = cloud_id.unwrap();
        assert_eq!(cid.len(), 36, "cloud_id must be UUID format (36 chars)");
    }

    // ── Test 3: Local memory never gets cloud_id ──────────────────────────────

    #[test]
    fn local_memory_never_gets_cloud_id() {
        let conn = fresh_db();

        // Default app_mode is 'local'.
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, created_at, updated_at) \
             VALUES ('Fact', 'local_topic', 'local content', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id: i64 = conn.last_insert_rowid();

        // mark_memory_for_push guards on app_mode='cloud'; local row unaffected.
        mark_memory_for_push(&conn, mem_id).unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM user_memory WHERE id = ?1",
                params![mem_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_none(), "local memory MUST NOT get a cloud_id");
        assert_eq!(needs_push, 0, "local memory MUST NOT get needs_push=1");

        // Push gather also excludes it.
        let push_mems = gather_push_memories(&conn).unwrap();
        assert_eq!(
            push_mems.len(),
            0,
            "local memory must not appear in push gather"
        );
    }

    // ── Test 4: Push gather excludes local ────────────────────────────────────

    #[test]
    fn push_gather_excludes_local_memories() {
        let conn = fresh_db();

        // Cloud memory.
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'cloud_topic', 'cloud content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let cloud_id_mem: i64 = conn.last_insert_rowid();
        mark_memory_for_push(&conn, cloud_id_mem).unwrap();

        // Local memory (default).
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, created_at, updated_at) \
             VALUES ('Fact', 'local_topic2', 'local content', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();

        let push_mems = gather_push_memories(&conn).unwrap();
        assert_eq!(
            push_mems.len(),
            1,
            "only cloud memory should be gathered for push"
        );
    }

    // ── Test 5: Pull dedup updates not inserts on existing cloud_id ───────────

    #[test]
    fn pull_dedup_updates_not_inserts_on_existing_cloud_id() {
        let conn = fresh_db();

        // Create + mint a cloud memory.
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'orig_topic', 'original content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id: i64 = conn.last_insert_rowid();
        mark_memory_for_push(&conn, mem_id).unwrap();
        let cid: String = conn
            .query_row(
                "SELECT cloud_id FROM user_memory WHERE id = ?1",
                params![mem_id],
                |r| r.get(0),
            )
            .unwrap();
        conn.execute(
            "UPDATE user_memory SET needs_push = 0, server_version = '99' WHERE id = ?1",
            params![mem_id],
        )
        .unwrap();

        // Pull delta for the same cloud_id (from another device).
        let delta = MemoryDelta {
            id: cid.clone(),
            content: "updated content".to_string(),
            category: Some("Fact".to_string()),
            source: None,
            pinned: false,
            is_deleted: false,
            created_at: "2026-06-20T00:00:00.000Z".to_string(),
            updated_at: "2026-06-22T00:00:00.000Z".to_string(),
            server_version: "100".to_string(),
        };

        apply_memory_deltas(&conn, "u1", &[delta]);

        // Must have exactly one row (no duplicate).
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_memory WHERE cloud_id = ?1",
                params![cid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 1,
            "DEDUP: must not insert a second row for the same cloud_id"
        );

        // Content updated.
        let content: String = conn
            .query_row(
                "SELECT content FROM user_memory WHERE id = ?1",
                params![mem_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(content, "updated content");
    }

    // ── Test 6: Tombstone soft-deletes ────────────────────────────────────────

    #[test]
    fn pull_tombstone_soft_deletes_memory() {
        let conn = fresh_db();

        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'to_delete', 'content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id: i64 = conn.last_insert_rowid();
        let cloud_id_val = "tombstone-mem-uuid-1";
        conn.execute(
            "UPDATE user_memory SET cloud_id = ?1 WHERE id = ?2",
            params![cloud_id_val, mem_id],
        )
        .unwrap();

        let delta = MemoryDelta {
            id: cloud_id_val.to_string(),
            content: "content".to_string(),
            category: Some("Fact".to_string()),
            source: None,
            pinned: false,
            is_deleted: true,
            created_at: "2026-06-20T00:00:00.000Z".to_string(),
            updated_at: "2026-06-22T01:00:00.000Z".to_string(),
            server_version: "200".to_string(),
        };

        apply_memory_deltas(&conn, "u1", &[delta]);

        // Row still exists (soft delete).
        let (still_exists, deleted_at_utc): (i64, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), deleted_at_utc FROM user_memory WHERE id = ?1",
                params![mem_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(still_exists, 1, "tombstone must NOT hard-delete the row");
        assert!(
            deleted_at_utc.is_some(),
            "tombstone must set deleted_at_utc"
        );
    }

    // ── Test 7: Cursor advances ───────────────────────────────────────────────

    #[test]
    fn memory_cursor_persists_and_advances() {
        let conn = fresh_db();
        write_memory_cursor(&conn, "u1", "42");
        assert_eq!(read_memory_cursor(&conn, "u1"), "42");

        write_memory_cursor(&conn, "u1", "100");
        assert_eq!(read_memory_cursor(&conn, "u1"), "100");
    }

    #[test]
    fn select_next_memory_cursor_trusts_server_cursor() {
        assert_eq!(
            select_next_memory_cursor("0", &Some("10".to_string())),
            "10"
        );
        // Never moves backwards.
        assert_eq!(
            select_next_memory_cursor("50", &Some("10".to_string())),
            "50"
        );
        // No cursor → hold position.
        assert_eq!(select_next_memory_cursor("7", &None), "7");
    }

    // ── Test 8a: Push wire shape — non-deleted memory (common case) ──────────
    //
    // Zod schema: isDeleted: z.boolean().optional() → optional (not nullable)
    //
    // When these fields are None, serde MUST omit the key entirely (skip_serializing_if).
    // Emitting `"isDeleted": null` would fail Zod and 400 the push.

    #[test]
    fn push_body_serializes_to_camelcase_schema() {
        // Case A: normal (non-deleted) memory — isDeleted and client clocks are absent.
        let body_normal = MemoryPushBody {
            protocol_version: 2,
            memories: vec![PushMemory {
                id: "m1".into(),
                content: "some memory".into(),
                category: Some("Fact".into()),
                source: Some("desktop".into()),
                pinned: None,
                base_version: "7".into(),
                is_deleted: None, // must be omitted (key absent → Zod undefined OK)
            }],
        };
        let v_normal = serde_json::to_value(&body_normal).unwrap();
        let mem_normal = &v_normal["memories"][0];

        assert_eq!(v_normal["protocolVersion"], 2);
        assert_eq!(mem_normal["baseVersion"], "7");
        assert!(mem_normal.get("updatedAt").is_none());
        assert!(mem_normal.get("pinned").is_none());
        assert_eq!(mem_normal["id"], "m1");
        assert_eq!(mem_normal["content"], "some memory");

        // None → key MUST be absent (Zod .optional() rejects null; undefined = absent).
        assert!(
            mem_normal.get("isDeleted").is_none(),
            "isDeleted must be absent when None — Zod .optional() rejects null"
        );
        assert!(
            mem_normal.get("createdAt").is_none(),
            "createdAt must be absent when None — Zod .optional() rejects null"
        );

        // snake_case keys must never appear.
        assert!(
            mem_normal.get("is_deleted").is_none(),
            "must not emit is_deleted"
        );
        assert!(
            mem_normal.get("created_at").is_none(),
            "must not emit created_at"
        );

        // user_id must not be in push body.
        assert!(mem_normal.get("userId").is_none() && mem_normal.get("user_id").is_none());

        // Case B: tombstone — isDeleted must be present and true.
        let body_tombstone = MemoryPushBody {
            protocol_version: 2,
            memories: vec![PushMemory {
                id: "m2".into(),
                content: "deleted memory".into(),
                category: None,
                source: None,
                pinned: None,
                base_version: "8".into(),
                is_deleted: Some(true),
            }],
        };
        let v_tomb = serde_json::to_value(&body_tombstone).unwrap();
        let mem_tomb = &v_tomb["memories"][0];
        assert_eq!(
            mem_tomb.get("isDeleted").and_then(|v| v.as_bool()),
            Some(true),
            "tombstone must emit isDeleted: true"
        );
        assert!(mem_tomb.get("createdAt").is_none());
        // category/source absent when None (nullable optional — omitting is fine).
        assert!(mem_tomb.get("category").is_none());
        assert!(mem_tomb.get("source").is_none());
    }

    // ── Test 9: Ack-clear ─────────────────────────────────────────────────────

    #[test]
    fn ack_clear_marks_memories_clean() {
        let conn = fresh_db();

        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'ack_topic', 'content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id: i64 = conn.last_insert_rowid();
        mark_memory_for_push(&conn, mem_id).unwrap();
        let cid: String = conn
            .query_row(
                "SELECT cloud_id FROM user_memory WHERE id = ?1",
                params![mem_id],
                |r| r.get(0),
            )
            .unwrap();

        let acked = vec![AckedMemory {
            id: cid.clone(),
            server_version: "99".to_string(),
        }];
        let sent = gather_push_memories(&conn).unwrap();
        ack_clear_memories(&conn, &acked, &sent);

        let (needs_push, sv): (i64, Option<String>) = conn
            .query_row(
                "SELECT needs_push, server_version FROM user_memory WHERE id = ?1",
                params![mem_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(needs_push, 0, "needs_push must be 0 after ack");
        assert_eq!(
            sv.as_deref(),
            Some("99"),
            "server_version must be set from ack"
        );
    }

    #[test]
    fn memory_ack_preserves_an_edit_made_after_the_sent_snapshot() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'ack_race', 'sent content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id = conn.last_insert_rowid();
        mark_memory_for_push(&conn, mem_id).unwrap();
        let sent = gather_push_memories(&conn).unwrap();
        let cloud_id = sent[0].id.clone();

        conn.execute(
            "UPDATE user_memory SET content = 'later edit', needs_push = 1 WHERE id = ?1",
            params![mem_id],
        )
        .unwrap();
        ack_clear_memories(
            &conn,
            &[AckedMemory {
                id: cloud_id,
                server_version: "12".to_string(),
            }],
            &sent,
        );

        let (content, needs_push, server_version): (String, i64, Option<String>) = conn
            .query_row(
                "SELECT content, needs_push, server_version FROM user_memory WHERE id = ?1",
                params![mem_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(content, "later edit");
        assert_eq!(needs_push, 1, "the unsent edit must remain dirty");
        assert_eq!(server_version.as_deref(), Some("12"));
    }

    #[test]
    fn memory_conflict_rebases_an_in_flight_local_edit() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
             VALUES ('Fact', 'conflict_race', 'sent content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let mem_id = conn.last_insert_rowid();
        mark_memory_for_push(&conn, mem_id).unwrap();
        conn.execute(
            "UPDATE user_memory SET server_version = '5' WHERE id = ?1",
            params![mem_id],
        )
        .unwrap();
        let sent = gather_push_memories(&conn).unwrap();
        let cloud_id = sent[0].id.clone();
        conn.execute(
            "UPDATE user_memory SET content = 'later edit', needs_push = 1 WHERE id = ?1",
            params![mem_id],
        )
        .unwrap();

        resolve_memory_conflicts(
            &conn,
            "u1",
            &[MemoryConflict {
                id: cloud_id.clone(),
                current: Some(MemoryDelta {
                    id: cloud_id,
                    content: "server winner".to_string(),
                    category: Some("Fact".to_string()),
                    source: Some("web".to_string()),
                    pinned: false,
                    is_deleted: false,
                    created_at: "2026-07-14T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-15T00:00:00.000Z".to_string(),
                    server_version: "6".to_string(),
                }),
            }],
            &sent,
        );

        let (content, needs_push, version): (String, i64, Option<String>) = conn
            .query_row(
                "SELECT content, needs_push, server_version FROM user_memory WHERE id = ?1",
                params![mem_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(content, "later edit");
        assert_eq!(needs_push, 1);
        assert_eq!(version.as_deref(), Some("6"));
    }

    #[test]
    fn memory_v2_wire_matches_the_shared_cross_language_golden_fixture() {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Golden {
            memory_push: MemoryPushBody,
            memory_push_response: MemoryPushResponse,
        }

        let fixture: Golden = serde_json::from_str(include_str!(
            "../../../../../packages/contracts/cloud-contracts/src/__fixtures__/chat-memory-sync-cas.golden.json"
        ))
        .unwrap();
        assert_eq!(fixture.memory_push.protocol_version, 2);
        assert_eq!(fixture.memory_push.memories[0].base_version, "7");
        assert_eq!(fixture.memory_push_response.protocol_version, 2);
        assert_eq!(fixture.memory_push_response.conflicts.len(), 1);
    }

    // ── Test 10: Token-empty gate (no network egress) ─────────────────────────

    #[tokio::test]
    async fn sync_memories_no_egress_without_token() {
        use crate::sys::commands::chat::state::AppDatabase;
        let db_inner = crate::data::db::Database::in_memory().unwrap();
        let db = AppDatabase {
            conn: std::sync::Arc::clone(&db_inner.get_connection()),
        };
        {
            let conn = db.connection().unwrap();
            conn.execute(
                "INSERT INTO user_memory (category, topic, content, importance, app_mode, created_at, updated_at) \
                 VALUES ('Fact', 'tok_topic', 'content', 5, 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [],
            )
            .unwrap();
            let mid = conn.last_insert_rowid();
            mark_memory_for_push(&conn, mid).unwrap();
        }

        let outcome = sync_memories_now_inner(&db, "u1", "  ", "http://127.0.0.1:1/")
            .await
            .expect("empty-token sync must return Ok(empty), not attempt the network");
        assert_eq!(outcome.memories_pushed, 0);
        assert_eq!(outcome.memories_pulled, 0);

        // Dirty flag must remain (no push happened).
        let conn = db.connection().unwrap();
        let needs_push: i64 = conn
            .query_row(
                "SELECT needs_push FROM user_memory WHERE topic='tok_topic'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            needs_push, 1,
            "no push happened, dirty flag must be untouched"
        );
    }
}
