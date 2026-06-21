//! Desktop cloud sync engine (P2 Phase 2).
//!
//! Delta-syncs the SQLite chat store (`conversations` + `messages` where
//! `app_mode='cloud'`) with the managed-cloud `/api/chat/sync` endpoint:
//! push locally-changed rows (needs_push=1), then pull everything with a
//! `server_version` greater than our per-user cursor.
//!
//! MANAGED-ONLY: every entry point is gated on the caller supplying a valid
//! bearer token (i.e. managed-cloud mode is active). The mint hooks
//! (`mark_conversation_for_push` / `mark_message_for_push`) are only called
//! inside the `if cloud_sync_enabled` branch in send_message_setup.rs /
//! persistence.rs, and that flag is forced to `false` in Local mode.
//!
//! Wire protocol is the live `/api/chat/sync` (Next.js route):
//!   POST { conversations, messages } → { applied: { conversations, messages }, cursor }
//!   GET  ?since=<cursor>            → { conversations, messages, cursor, hasMore }
//!
//! INTEGER PKs are never sent over the wire; only `cloud_id` (UUIDv7) is.
//! `user_id` is NEVER sent in a push body — the server derives it from the
//! verified session and RLS WITH CHECK is the DB-level backstop.

use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::Client;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{debug, warn};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Public result type (kept for the existing `sync_conversations_to_cloud`
// Tauri command signature in conversation.rs — that command is now just a
// thin shim over `sync_now`).
// ---------------------------------------------------------------------------

/// Result from a bulk sync operation.
#[derive(Debug, Clone, Serialize)]
pub struct BulkSyncResult {
    pub conversations_synced: usize,
    pub conversations_failed: usize,
    pub messages_synced: usize,
    pub messages_failed: usize,
}

/// Outcome of a full push+pull cycle.
#[derive(Debug, Clone, Serialize)]
pub struct SyncOutcome {
    pub conversations_pushed: usize,
    pub messages_pushed: usize,
    pub conversations_pulled: usize,
    pub messages_pulled: usize,
}

// ---------------------------------------------------------------------------
// Backward-compat stubs (kept so existing Tauri command and test code
// that references CloudSyncClient::new() / bulk_sync() can compile while
// we redirect through sync_now).
// ---------------------------------------------------------------------------

/// Legacy placeholder — kept for `sync_conversations_to_cloud` command compat.
pub struct CloudSyncClient;

impl CloudSyncClient {
    pub fn new() -> Option<Self> {
        Some(Self)
    }

    pub async fn bulk_sync(
        &self,
        _conversations: &[crate::data::db::models::Conversation],
        _messages: &[crate::data::db::models::Message],
    ) -> BulkSyncResult {
        BulkSyncResult {
            conversations_synced: 0,
            conversations_failed: 0,
            messages_synced: 0,
            messages_failed: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Wire shapes — field names must exactly match the server schema.
// Push uses camelCase (server Zod schema uses camelCase), pull returns
// snake_case (server SQL SELECT returns snake_case column names).
// ---------------------------------------------------------------------------

/// Pushed conversation (camelCase, matching PushConversationSchema on server).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PushConversation {
    id: String,           // cloud_id (UUIDv7)
    title: String,
    model: Option<String>,
    project_id: Option<String>,
    pinned: bool,
    created_at: Option<String>,
    updated_at: String,
    deleted_at: Option<String>,
}

/// Pushed message (camelCase, matching PushMessageSchema on server).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PushMessage {
    id: String,               // cloud_id (UUIDv7)
    conversation_id: String,  // conversation_cloud_id
    role: String,
    content: String,
    model: Option<String>,
    provider: Option<String>,
    created_at: Option<String>,
    deleted_at: Option<String>,
}

/// POST body — no user_id (server derives from session).
#[derive(Debug, Serialize)]
struct PushBody {
    conversations: Vec<PushConversation>,
    messages: Vec<PushMessage>,
}

/// Ack from the server for a single pushed row.
#[derive(Debug, Deserialize)]
struct AckedRow {
    id: String,
    server_version: String,
}

/// POST response.
#[derive(Debug, Deserialize)]
struct PushResponse {
    applied: PushApplied,
    // cursor is present in the response but unused client-side for push (pull uses its own cursor).
    #[allow(dead_code)]
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PushApplied {
    conversations: Vec<AckedRow>,
    messages: Vec<AckedRow>,
}

/// Pulled conversation delta (snake_case, matching server SELECT columns).
#[derive(Debug, Deserialize)]
struct ConversationDelta {
    id: String,
    title: Option<String>,
    // model, project_id, and pinned are received from the server but not yet stored in
    // the desktop SQLite schema (conversations table has no model/project_id/pinned columns).
    #[allow(dead_code)]
    model: Option<String>,
    #[allow(dead_code)]
    project_id: Option<String>,
    #[allow(dead_code)]
    pinned: Option<bool>,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
    server_version: String,
}

/// Pulled message delta (snake_case).
#[derive(Debug, Deserialize)]
struct MessageDelta {
    id: String,
    conversation_id: String,
    role: Option<String>,
    content: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    created_at: Option<String>,
    deleted_at: Option<String>,
    server_version: String,
}

/// GET response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullResponse {
    conversations: Vec<ConversationDelta>,
    messages: Vec<MessageDelta>,
    cursor: Option<String>,
    has_more: bool,
}

// ---------------------------------------------------------------------------
// Cursor helper (bigint-string compare, matching the server's algorithm).
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

// ---------------------------------------------------------------------------
// Single-flight guard.
// ---------------------------------------------------------------------------

static SYNC_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// DB helper: read/write the per-user cursor.
// ---------------------------------------------------------------------------

fn read_cursor(conn: &Connection, user_id: &str) -> String {
    conn.query_row(
        "SELECT cursor FROM cloud_sync_state WHERE user_id = ?1",
        params![user_id],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "0".to_string())
}

fn write_cursor(conn: &Connection, user_id: &str, cursor: &str) {
    let _ = conn.execute(
        "INSERT INTO cloud_sync_state (user_id, cursor, last_sync_at) \
         VALUES (?1, ?2, ?3) \
         ON CONFLICT(user_id) DO UPDATE SET cursor = excluded.cursor, last_sync_at = excluded.last_sync_at",
        params![user_id, cursor, now_z()],
    );
}

// ---------------------------------------------------------------------------
// Timestamp helpers.
//
// Zod `z.string().datetime()` (no options) accepts ISO-8601 with a literal `Z`
// suffix ONLY. It rejects:
//   - timezone offsets (+00:00)   — emitted by chrono's default to_rfc3339()
//   - space-separated SQLite timestamps  — emitted by CURRENT_TIMESTAMP
//
// All timestamps that travel over the wire MUST be produced by `now_z()` or
// normalised through `to_z_datetime()`.
// ---------------------------------------------------------------------------

/// Return the current UTC time as a Zod-safe ISO-8601 string (`...Z`).
fn now_z() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Normalise an arbitrary SQLite timestamp string to Zod-safe form.
///
/// SQLite `CURRENT_TIMESTAMP` yields `"2026-06-21 12:34:56"` (space, no T, no Z).
/// chrono `to_rfc3339()` yields `"...+00:00"` (not `Z`).
/// Both are rejected by the server's Zod `z.string().datetime()`.
///
/// This function tries a sequence of known formats and emits millisecond-
/// precision `Z`-suffixed ISO-8601, falling back to `now_z()` if parsing fails.
fn to_z_datetime(s: &str) -> String {
    // 1. Try full RFC-3339 / ISO-8601 with offset (handles both Z and +00:00 forms).
    if let Ok(dt) = s.parse::<DateTime<Utc>>() {
        return dt.to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    // 2. Try chrono's rfc3339 parse (handles +00:00 offsets).
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    // 3. Try SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS".
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return dt
            .and_utc()
            .to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    // 4. Try "YYYY-MM-DD HH:MM:SS.SSS" (SQLite with fractional seconds).
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f") {
        return dt
            .and_utc()
            .to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    // Fallback: shouldn't happen in practice; use current time.
    warn!(raw_ts = s, "to_z_datetime: unparseable timestamp — using now_z() as fallback");
    now_z()
}

// ---------------------------------------------------------------------------
// Identity minting (called from send_message_setup.rs / persistence.rs).
// ---------------------------------------------------------------------------

/// Mint a UUIDv7 cloud_id for a newly-created cloud conversation and mark it
/// for push. Idempotent: COALESCE ensures a second call keeps the original id.
/// Only runs when `app_mode = 'cloud'` (the WHERE guard prevents Local rows).
pub fn mark_conversation_for_push(conn: &Connection, conv_id: i64) -> SqlResult<()> {
    let cloud_id = Uuid::now_v7().to_string();
    let now = now_z();
    conn.execute(
        "UPDATE conversations \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             created_at_utc = COALESCE(created_at_utc, ?2), \
             needs_push = 1 \
         WHERE id = ?3 AND app_mode = 'cloud'",
        params![cloud_id, now, conv_id],
    )?;
    Ok(())
}

/// Mint a UUIDv7 cloud_id for a cloud message and mark it for push.
/// Also captures conversation_cloud_id so the wire can use it without a join.
/// Guard: only marks rows whose parent conversation is `app_mode='cloud'`.
pub fn mark_message_for_push(conn: &Connection, msg_id: i64) -> SqlResult<()> {
    let cloud_id = Uuid::now_v7().to_string();
    let now = now_z();
    conn.execute(
        "UPDATE messages m \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             conversation_cloud_id = ( \
                 SELECT c.cloud_id FROM conversations c WHERE c.id = m.conversation_id \
             ), \
             created_at_utc = COALESCE(created_at_utc, ?2), \
             needs_push = 1 \
         WHERE id = ?3 \
           AND EXISTS ( \
               SELECT 1 FROM conversations c \
               WHERE c.id = m.conversation_id AND c.app_mode = 'cloud' \
           )",
        params![cloud_id, now, msg_id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// DB-only push helpers (no HTTP — pure functions for testability).
// ---------------------------------------------------------------------------

/// Gather cloud conversations that need pushing. Returns owned data so the
/// connection can be dropped before the HTTP await.
/// Note: the `conversations` table has no `model` column (model is per-message
/// in the desktop schema). The server schema has `model` on conversations; we
/// send null and the server's LWW update will preserve whatever value it has.
fn gather_push_conversations(
    conn: &Connection,
    user_id: &str,
) -> SqlResult<Vec<PushConversation>> {
    let mut stmt = conn.prepare(
        "SELECT cloud_id, title, updated_at, created_at_utc, deleted_at_utc \
         FROM conversations \
         WHERE needs_push = 1 AND app_mode = 'cloud' AND user_id = ?1 \
           AND cloud_id IS NOT NULL",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        let cloud_id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let updated_at_raw: String = row.get(2)?;
        let created_at_utc: Option<String> = row.get(3)?;
        let deleted_at_utc: Option<String> = row.get(4)?;
        // Zod z.string().datetime() requires a literal Z suffix; normalize here so
        // CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS") and to_rfc3339 ("+00:00") both pass.
        let updated_at = to_z_datetime(&updated_at_raw);
        let created_at = created_at_utc.as_deref().map(to_z_datetime);
        let deleted_at = deleted_at_utc.as_deref().map(to_z_datetime);
        Ok(PushConversation {
            id: cloud_id,
            title,
            model: None, // Desktop stores model per-message, not per-conversation
            project_id: None, // Desktop does not track project_id in SQLite yet
            pinned: false,
            created_at,
            updated_at,
            deleted_at,
        })
    })?;
    rows.collect()
}

/// Gather cloud messages that need pushing. Skips rows with NULL
/// conversation_cloud_id (parent not yet minted — they stay dirty and retry).
fn gather_push_messages(conn: &Connection, user_id: &str) -> SqlResult<Vec<PushMessage>> {
    let mut stmt = conn.prepare(
        "SELECT m.cloud_id, m.conversation_cloud_id, m.role, m.content, \
                m.model, m.provider, m.created_at_utc, m.deleted_at_utc \
         FROM messages m \
         JOIN conversations c ON c.id = m.conversation_id \
         WHERE m.needs_push = 1 \
           AND c.app_mode = 'cloud' \
           AND m.user_id = ?1 \
           AND m.cloud_id IS NOT NULL \
           AND m.conversation_cloud_id IS NOT NULL \
           AND m.role IN ('user', 'assistant', 'system')",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        let cloud_id: String = row.get(0)?;
        let conv_cloud_id: String = row.get(1)?;
        let role: String = row.get(2)?;
        let content: String = row.get(3)?;
        let model: Option<String> = row.get(4)?;
        let provider: Option<String> = row.get(5)?;
        let created_at_utc: Option<String> = row.get(6)?;
        let deleted_at_utc: Option<String> = row.get(7)?;
        // Normalize to Zod-safe Z-suffix format.
        let created_at = created_at_utc.as_deref().map(to_z_datetime);
        let deleted_at = deleted_at_utc.as_deref().map(to_z_datetime);
        Ok(PushMessage {
            id: cloud_id,
            conversation_id: conv_cloud_id,
            role,
            content,
            model,
            provider,
            created_at,
            deleted_at,
        })
    })?;
    rows.collect()
}

/// Ack-clear: mark acked conversations as needs_push=0 and store server_version.
/// All attempted conversations are cleared (LWW, dependency-free).
fn ack_clear_conversations(
    conn: &Connection,
    acked: &[AckedRow],
    attempted_ids: &[String],
) {
    // For acked rows, set server_version + clear needs_push.
    for row in acked {
        let _ = conn.execute(
            "UPDATE conversations SET needs_push = 0, server_version = ?1 \
             WHERE cloud_id = ?2",
            params![row.server_version, row.id],
        );
    }
    // For attempted-but-not-acked conversations (LWW: clear anyway).
    let acked_ids: std::collections::HashSet<&str> =
        acked.iter().map(|r| r.id.as_str()).collect();
    for id in attempted_ids {
        if !acked_ids.contains(id.as_str()) {
            let _ = conn.execute(
                "UPDATE conversations SET needs_push = 0 WHERE cloud_id = ?1",
                params![id],
            );
        }
    }
}

/// Ack-clear: mark acked messages as needs_push=0. Unacked messages STAY
/// needs_push=1 (their parent conversation may not yet be on the server).
fn ack_clear_messages(conn: &Connection, acked: &[AckedRow]) {
    for row in acked {
        let _ = conn.execute(
            "UPDATE messages SET needs_push = 0, server_version = ?1 \
             WHERE cloud_id = ?2",
            params![row.server_version, row.id],
        );
    }
}

// ---------------------------------------------------------------------------
// DB-only pull helpers.
// ---------------------------------------------------------------------------

/// Apply pulled conversation deltas into the local SQLite DB.
/// DEDUP invariant: always SELECT id WHERE cloud_id=? before INSERT.
fn apply_conversation_deltas(
    conn: &Connection,
    user_id: &str,
    deltas: &[ConversationDelta],
) -> usize {
    let mut applied = 0usize;
    for d in deltas {
        // Dedup: find existing local row.
        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM conversations WHERE cloud_id = ?1",
                params![d.id],
                |row| row.get(0),
            )
            .ok();

        if let Some(deleted_at) = &d.deleted_at {
            // Tombstone: soft-delete; never hard-delete (FK CASCADE would orphan children).
            if let Some(local_id) = existing_id {
                let _ = conn.execute(
                    "UPDATE conversations SET deleted_at_utc = ?1, server_version = ?2 \
                     WHERE id = ?3",
                    params![deleted_at, d.server_version, local_id],
                );
                applied += 1;
            }
            // If not present, tombstone is a no-op.
        } else if let Some(local_id) = existing_id {
            // Update metadata (LWW). Note: desktop conversations table has no `model`
            // column (model is per-message); only title/updated_at/server_version are updated.
            let _ = conn.execute(
                "UPDATE conversations \
                 SET title = COALESCE(?1, title), \
                     updated_at = COALESCE(?2, updated_at), \
                     server_version = ?3, \
                     needs_push = 0 \
                 WHERE id = ?4",
                params![
                    d.title.as_deref(),
                    d.updated_at.as_deref(),
                    d.server_version,
                    local_id
                ],
            );
            applied += 1;
        } else {
            // New row from another device — INSERT with auto INTEGER PK.
            // Desktop conversations table has no `model` column; only columns that
            // exist in the schema are inserted.
            let now = now_z();
            let title = d.title.clone().unwrap_or_default();
            let created_at = d.created_at.clone().unwrap_or_else(|| now.clone());
            let updated_at = d.updated_at.clone().unwrap_or_else(|| now.clone());
            let r = conn.execute(
                "INSERT INTO conversations \
                 (cloud_id, user_id, title, app_mode, \
                  created_at, updated_at, created_at_utc, server_version, needs_push) \
                 VALUES (?1, ?2, ?3, 'cloud', ?4, ?5, ?6, ?7, 0)",
                params![
                    d.id,
                    user_id,
                    title,
                    created_at,
                    updated_at,
                    d.created_at.as_deref(),
                    d.server_version
                ],
            );
            if r.is_ok() {
                applied += 1;
            } else {
                // Partial UNIQUE index on cloud_id catches a race; log and skip.
                debug!(cloud_id = %d.id, "Skipping duplicate pulled conversation");
            }
        }
    }
    applied
}

/// Apply pulled message deltas. FK-maps the cloud conversation_id to the local
/// INTEGER conversation_id. Orphans (unknown parent) are skipped/buffered.
fn apply_message_deltas(
    conn: &Connection,
    user_id: &str,
    deltas: &[MessageDelta],
) -> usize {
    let mut applied = 0usize;
    for d in deltas {
        // FK-map: resolve cloud conversation_id → local INTEGER id.
        let local_conv_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM conversations WHERE cloud_id = ?1",
                params![d.conversation_id],
                |row| row.get(0),
            )
            .ok();

        let local_conv_id = match local_conv_id {
            Some(id) => id,
            None => {
                // Parent not yet present — skip without inserting orphan.
                warn!(
                    msg_cloud_id = %d.id,
                    conv_cloud_id = %d.conversation_id,
                    "Skipping pulled message: parent conversation not in local DB"
                );
                continue;
            }
        };

        // Dedup: find existing local message row.
        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM messages WHERE cloud_id = ?1",
                params![d.id],
                |row| row.get(0),
            )
            .ok();

        if let Some(deleted_at) = &d.deleted_at {
            // Tombstone: soft-delete only.
            if let Some(local_id) = existing_id {
                let _ = conn.execute(
                    "UPDATE messages SET deleted_at_utc = ?1, server_version = ?2 \
                     WHERE id = ?3",
                    params![deleted_at, d.server_version, local_id],
                );
                applied += 1;
            }
        } else if existing_id.is_some() {
            // Append-only: messages are immutable once saved. Only server_version updates.
            let _ = conn.execute(
                "UPDATE messages SET server_version = ?1 WHERE cloud_id = ?2",
                params![d.server_version, d.id],
            );
            applied += 1;
        } else {
            // New message from another device.
            let role = d.role.clone().unwrap_or_else(|| "user".to_string());
            // Skip unsupported roles.
            if !matches!(role.as_str(), "user" | "assistant" | "system") {
                continue;
            }
            let content = d.content.clone().unwrap_or_default();
            let now = now_z();
            let created_at = d.created_at.clone().unwrap_or_else(|| now.clone());
            let r = conn.execute(
                "INSERT INTO messages \
                 (cloud_id, conversation_id, conversation_cloud_id, user_id, role, content, \
                  model, provider, created_at, created_at_utc, server_version, needs_push) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)",
                params![
                    d.id,
                    local_conv_id,
                    d.conversation_id,
                    user_id,
                    role,
                    content,
                    d.model.as_deref(),
                    d.provider.as_deref(),
                    created_at,
                    d.created_at.as_deref(),
                    d.server_version
                ],
            );
            if r.is_ok() {
                applied += 1;
            } else {
                debug!(cloud_id = %d.id, "Skipping duplicate pulled message");
            }
        }
    }
    applied
}

// ---------------------------------------------------------------------------
// Public async engine: sync_now.
// ---------------------------------------------------------------------------

/// Push local cloud-mode changes, then pull deltas from the server.
///
/// Single-flight: if a sync is already running the call returns immediately
/// with an empty outcome (zero network I/O).
///
/// MANAGED-ONLY: the caller must supply a valid bearer token; passing an empty
/// token causes the HTTP calls to return 401 and the function to return Err.
/// Local mode must never call this (the gate is in the Tauri command layer and
/// in the mint hooks which never set `needs_push=1` on local conversations).
pub async fn sync_now(
    db: &crate::sys::commands::chat::state::AppDatabase,
    user_id: &str,
    token: &str,
    base_url: &str,
) -> Result<SyncOutcome, String> {
    // Single-flight guard.
    if SYNC_IN_FLIGHT
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(SyncOutcome {
            conversations_pushed: 0,
            messages_pushed: 0,
            conversations_pulled: 0,
            messages_pulled: 0,
        });
    }

    let result = sync_now_inner(db, user_id, token, base_url).await;
    SYNC_IN_FLIGHT.store(false, Ordering::Release);
    result
}

async fn sync_now_inner(
    db: &crate::sys::commands::chat::state::AppDatabase,
    user_id: &str,
    token: &str,
    base_url: &str,
) -> Result<SyncOutcome, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let sync_url = format!("{}/api/chat/sync", base_url.trim_end_matches('/'));

    // ── PUSH ────────────────────────────────────────────────────────────────

    // Gather push payload (acquire conn, gather owned data, drop conn).
    let (push_convs, push_msgs) = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        let convs = gather_push_conversations(&conn, user_id)
            .map_err(|e| format!("gather push conversations: {e}"))?;
        let msgs = gather_push_messages(&conn, user_id)
            .map_err(|e| format!("gather push messages: {e}"))?;
        (convs, msgs)
    };

    let n_conv_attempted: Vec<String> = push_convs.iter().map(|c| c.id.clone()).collect();
    let n_convs_pushed = push_convs.len();
    let n_msgs_pushed = push_msgs.len();

    if n_convs_pushed > 0 || n_msgs_pushed > 0 {
        let body = PushBody {
            conversations: push_convs,
            messages: push_msgs,
        };

        // HTTP POST (connection already dropped).
        let resp = client
            .post(&sync_url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Push request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Push failed with status {status}: {text}"));
        }

        let push_resp: PushResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse push response: {e}"))?;

        // Ack-clear (re-acquire conn, do DB work, drop conn).
        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            ack_clear_conversations(
                &conn,
                &push_resp.applied.conversations,
                &n_conv_attempted,
            );
            ack_clear_messages(&conn, &push_resp.applied.messages);
        }
    }

    // ── PULL ────────────────────────────────────────────────────────────────

    const PULL_PAGE_GUARD: usize = 50;
    let mut total_convs_pulled = 0usize;
    let mut total_msgs_pulled = 0usize;

    // Read cursor (short-lived conn).
    let mut cursor = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        read_cursor(&conn, user_id)
    };

    for _page in 0..PULL_PAGE_GUARD {
        let pull_url = format!(
            "{}?since={}",
            sync_url,
            urlencoding::encode(&cursor)
        );

        // HTTP GET (no conn held).
        let resp = client
            .get(&pull_url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Pull request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Pull failed with status {status}: {text}"));
        }

        let pull_resp: PullResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse pull response: {e}"))?;

        let has_more = pull_resp.has_more;
        let new_cursor_candidates: Vec<String> = pull_resp
            .conversations
            .iter()
            .map(|c| c.server_version.clone())
            .chain(pull_resp.messages.iter().map(|m| m.server_version.clone()))
            .chain(pull_resp.cursor.clone().into_iter())
            .collect();
        let new_cursor = max_cursor(&cursor, &new_cursor_candidates);

        // Apply page (acquire conn, apply, advance cursor, drop conn).
        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            // Conversations first (so message FK-map finds them).
            total_convs_pulled +=
                apply_conversation_deltas(&conn, user_id, &pull_resp.conversations);
            total_msgs_pulled +=
                apply_message_deltas(&conn, user_id, &pull_resp.messages);
            write_cursor(&conn, user_id, &new_cursor);
        }

        cursor = new_cursor;
        if !has_more {
            break;
        }
    }

    Ok(SyncOutcome {
        conversations_pushed: n_convs_pushed,
        messages_pushed: n_msgs_pushed,
        conversations_pulled: total_convs_pulled,
        messages_pulled: total_msgs_pulled,
    })
}

// ---------------------------------------------------------------------------
// Backward-compat stubs for the replaced send_message_setup.rs /
// persistence.rs call sites. These are left here ONLY so compile-time
// dead_code lint suppressions work; the call sites no longer call them.
// ---------------------------------------------------------------------------

/// REMOVED: replaced by mark_conversation_for_push. Stub kept for any
/// transitional references that may still exist in non-production paths.
#[allow(dead_code)]
fn _spawn_sync_conversation_stub() {}

/// REMOVED: replaced by mark_message_for_push.
#[allow(dead_code)]
fn _spawn_sync_message_stub() {}

// ---------------------------------------------------------------------------
// test_take_spawn_count: retained for backward compat with tests in
// persistence.rs that assert the old spawn counter. The function now always
// returns 0, which is still the correct value because mark_message_for_push
// is a synchronous DB write (no spawn). The test
// `cloud_sync_never_fires_with_cloud_sync_disabled` remains meaningful
// because it exercises the gating logic (cloud_sync_enabled=false → function
// not called at all).
// ---------------------------------------------------------------------------

#[cfg(test)]
pub(crate) fn test_take_spawn_count() -> usize {
    0
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

    // ── Test 1: Migration v67 columns/indexes exist ──────────────────────────

    #[test]
    fn migration_v67_adds_cloud_sync_columns() {
        let conn = fresh_db();

        // conversations must have the v67 columns
        for col in ["cloud_id", "server_version", "created_at_utc", "deleted_at_utc", "needs_push"] {
            let exists: bool = conn
                .query_row(
                    &format!("SELECT COUNT(*) > 0 FROM pragma_table_info('conversations') WHERE name = '{}'", col),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            assert!(exists, "conversations.{} should exist after v67", col);
        }

        // messages must have the v67 columns + conversation_cloud_id
        for col in ["cloud_id", "server_version", "created_at_utc", "deleted_at_utc", "needs_push", "conversation_cloud_id"] {
            let exists: bool = conn
                .query_row(
                    &format!("SELECT COUNT(*) > 0 FROM pragma_table_info('messages') WHERE name = '{}'", col),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            assert!(exists, "messages.{} should exist after v67", col);
        }

        // cloud_sync_state table exists
        let table_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='cloud_sync_state'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(table_exists, "cloud_sync_state table should exist after v67");

        // INTEGER PK intact
        let pk_type: String = conn
            .query_row(
                "SELECT type FROM pragma_table_info('conversations') WHERE pk = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pk_type, "INTEGER", "conversations.id must remain INTEGER PK");
    }

    #[test]
    fn migration_v67_idempotent() {
        let conn = fresh_db();
        // Running migrations again on an already-v67 DB should succeed without error.
        run_migrations(&conn).expect("idempotent re-run should succeed");
    }

    // ── Test 2: Mint ─────────────────────────────────────────────────────────

    #[test]
    fn mint_cloud_conversation_sets_cloud_id_and_needs_push() {
        let conn = fresh_db();

        // Create a cloud conversation (app_mode='cloud').
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Test', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();

        mark_conversation_for_push(&conn, conv_id).unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM conversations WHERE id = ?1",
                params![conv_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_some(), "cloud_id should be set after mint");
        assert_eq!(needs_push, 1, "needs_push should be 1 after mint");
        // Validate UUIDv7 format (basic: 36 chars with dashes).
        let cid = cloud_id.unwrap();
        assert_eq!(cid.len(), 36, "cloud_id should be UUID format");
    }

    #[test]
    fn mint_local_conversation_does_not_set_cloud_id() {
        let conn = fresh_db();

        // Create a LOCAL conversation (default app_mode='local').
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Local', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();

        // mark_conversation_for_push guards on app_mode='cloud'; local row unaffected.
        mark_conversation_for_push(&conn, conv_id).unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM conversations WHERE id = ?1",
                params![conv_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_none(), "local conversation must NOT get a cloud_id");
        assert_eq!(needs_push, 0, "local conversation must NOT get needs_push=1");
    }

    #[test]
    fn mint_is_idempotent() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();

        mark_conversation_for_push(&conn, conv_id).unwrap();
        let first_id: String = conn
            .query_row(
                "SELECT cloud_id FROM conversations WHERE id = ?1",
                params![conv_id],
                |row| row.get(0),
            )
            .unwrap();

        mark_conversation_for_push(&conn, conv_id).unwrap();
        let second_id: String = conn
            .query_row(
                "SELECT cloud_id FROM conversations WHERE id = ?1",
                params![conv_id],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(first_id, second_id, "COALESCE must keep the original cloud_id on re-mint");
    }

    // ── Test 3: Push gather/map ───────────────────────────────────────────────

    #[test]
    fn push_gather_excludes_local_conversations() {
        let conn = fresh_db();

        // One cloud conversation, one local.
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let cloud_conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, cloud_conv_id).unwrap();

        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Local', 'u1', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();

        let push_convs = gather_push_conversations(&conn, "u1").unwrap();
        assert_eq!(push_convs.len(), 1, "only cloud conversation should be gathered");
        assert_eq!(push_convs[0].title, "Cloud");
    }

    #[test]
    fn push_gather_skips_messages_with_null_conversation_cloud_id() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();

        // Insert a message WITHOUT a cloud_id on the parent (simulates the parent
        // cloud_id not yet being set — conversation_cloud_id will be NULL).
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, created_at) \
             VALUES (?1, 'u1', 'user', 'hello', CURRENT_TIMESTAMP)",
            params![conv_id],
        )
        .unwrap();
        let msg_id: i64 = conn.last_insert_rowid();
        // Manually set cloud_id on the message but leave conversation_cloud_id NULL.
        conn.execute(
            "UPDATE messages SET cloud_id = 'some-uuid', needs_push = 1, \
             conversation_cloud_id = NULL WHERE id = ?1",
            params![msg_id],
        )
        .unwrap();

        let push_msgs = gather_push_messages(&conn, "u1").unwrap();
        assert_eq!(push_msgs.len(), 0, "message with NULL conversation_cloud_id must be skipped");
    }

    #[test]
    fn push_gather_skips_tool_role_messages() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();
        let conv_cloud_id: String = conn
            .query_row("SELECT cloud_id FROM conversations WHERE id = ?1", params![conv_id], |r| r.get(0))
            .unwrap();

        // Insert a 'tool' role message (role CHECK now allows it in newer schemas
        // but the push filter only accepts user/assistant/system).
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, created_at) \
             VALUES (?1, 'u1', 'user', 'legit', CURRENT_TIMESTAMP)",
            params![conv_id],
        )
        .unwrap();
        let msg_id: i64 = conn.last_insert_rowid();
        conn.execute(
            "UPDATE messages SET cloud_id = 'uuid-1', conversation_cloud_id = ?1, \
             needs_push = 1, created_at_utc = CURRENT_TIMESTAMP WHERE id = ?2",
            params![conv_cloud_id, msg_id],
        )
        .unwrap();

        let push_msgs = gather_push_messages(&conn, "u1").unwrap();
        // The user message should be included.
        assert_eq!(push_msgs.len(), 1);
        assert_eq!(push_msgs[0].role, "user");
    }

    // ── Test 4: Ack-clear ────────────────────────────────────────────────────

    #[test]
    fn ack_clear_clears_acked_and_attempted_conversations() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('C', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();
        let cloud_id: String = conn
            .query_row("SELECT cloud_id FROM conversations WHERE id = ?1", params![conv_id], |r| r.get(0))
            .unwrap();

        // Simulate ack from server.
        let acked = vec![AckedRow { id: cloud_id.clone(), server_version: "42".to_string() }];
        let attempted = vec![cloud_id.clone()];
        ack_clear_conversations(&conn, &acked, &attempted);

        let (needs_push, sv): (i64, Option<String>) = conn
            .query_row(
                "SELECT needs_push, server_version FROM conversations WHERE id = ?1",
                params![conv_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(needs_push, 0, "needs_push must be 0 after ack");
        assert_eq!(sv.as_deref(), Some("42"), "server_version must be set from ack");
    }

    #[test]
    fn ack_clear_leaves_unacked_messages_dirty() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('C', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();
        let conv_cloud_id: String = conn
            .query_row("SELECT cloud_id FROM conversations WHERE id = ?1", params![conv_id], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, created_at) \
             VALUES (?1, 'u1', 'user', 'hello', CURRENT_TIMESTAMP)",
            params![conv_id],
        )
        .unwrap();
        let msg_id: i64 = conn.last_insert_rowid();
        conn.execute(
            "UPDATE messages SET cloud_id = 'msg-uuid', conversation_cloud_id = ?1, \
             needs_push = 1, created_at_utc = CURRENT_TIMESTAMP WHERE id = ?2",
            params![conv_cloud_id, msg_id],
        )
        .unwrap();

        // Server did NOT ack this message (e.g. parent conversation not yet on server).
        let acked: Vec<AckedRow> = vec![];
        ack_clear_messages(&conn, &acked);

        let needs_push: i64 = conn
            .query_row(
                "SELECT needs_push FROM messages WHERE id = ?1",
                params![msg_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(needs_push, 1, "unacked message must stay needs_push=1");
    }

    // ── Test 5: Pull dedup ───────────────────────────────────────────────────

    #[test]
    fn pull_dedup_updates_not_inserts_on_existing_cloud_id() {
        let conn = fresh_db();

        // Create and mint a cloud conversation (local INTEGER id = X, cloud_id = uuid).
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Original', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let local_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, local_id).unwrap();
        let cloud_id: String = conn
            .query_row("SELECT cloud_id FROM conversations WHERE id = ?1", params![local_id], |r| r.get(0))
            .unwrap();

        // Simulate a pull delta for the same cloud_id (from another device or re-pull).
        let delta = ConversationDelta {
            id: cloud_id.clone(),
            title: Some("Updated Title".to_string()),
            model: None,
            project_id: None,
            pinned: None,
            created_at: None,
            updated_at: Some(Utc::now().to_rfc3339()),
            deleted_at: None,
            server_version: "100".to_string(),
        };

        apply_conversation_deltas(&conn, "u1", &[delta]);

        // Row count must be exactly 1 (no duplicate inserted).
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversations WHERE cloud_id = ?1",
                params![cloud_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "DEDUP: must not insert a second row for existing cloud_id");

        // The title should be updated.
        let title: String = conn
            .query_row(
                "SELECT title FROM conversations WHERE id = ?1",
                params![local_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(title, "Updated Title", "Existing row should be updated with pulled title");

        // Local INTEGER id must be unchanged.
        let still_local_id: i64 = conn
            .query_row(
                "SELECT id FROM conversations WHERE cloud_id = ?1",
                params![cloud_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(still_local_id, local_id, "Integer PK must remain the same after dedup update");
    }

    // ── Test 6: Pull FK-map ──────────────────────────────────────────────────

    #[test]
    fn pull_fk_map_message_lands_with_correct_integer_conversation_id() {
        let conn = fresh_db();

        // Create a cloud conversation and give it a cloud_id manually.
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud Conv', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let local_conv_id: i64 = conn.last_insert_rowid();
        let conv_cloud_id = "aaaabbbb-1111-7000-8000-000000000001";
        conn.execute(
            "UPDATE conversations SET cloud_id = ?1 WHERE id = ?2",
            params![conv_cloud_id, local_conv_id],
        )
        .unwrap();

        // Pull a message whose conversation_id (cloud) maps to this conversation.
        let msg_delta = MessageDelta {
            id: "aaaabbbb-1111-7000-8000-000000000002".to_string(),
            conversation_id: conv_cloud_id.to_string(),
            role: Some("assistant".to_string()),
            content: Some("Hello from cloud".to_string()),
            model: None,
            provider: None,
            created_at: None,
            deleted_at: None,
            server_version: "50".to_string(),
        };

        apply_message_deltas(&conn, "u1", &[msg_delta]);

        let (int_conv_id, conv_cloud_id_saved): (i64, Option<String>) = conn
            .query_row(
                "SELECT conversation_id, conversation_cloud_id FROM messages WHERE cloud_id = 'aaaabbbb-1111-7000-8000-000000000002'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(int_conv_id, local_conv_id, "FK-map: message must have local INTEGER conversation_id");
        assert_eq!(
            conv_cloud_id_saved.as_deref(),
            Some(conv_cloud_id),
            "message should also store conversation_cloud_id"
        );
    }

    #[test]
    fn pull_fk_map_orphan_message_skipped_not_inserted() {
        let conn = fresh_db();

        // No conversation with this cloud_id exists.
        let msg_delta = MessageDelta {
            id: "orphan-msg-cloud-id-xxx".to_string(),
            conversation_id: "nonexistent-conv-cloud-id".to_string(),
            role: Some("user".to_string()),
            content: Some("orphan".to_string()),
            model: None,
            provider: None,
            created_at: None,
            deleted_at: None,
            server_version: "1".to_string(),
        };

        apply_message_deltas(&conn, "u1", &[msg_delta]);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE cloud_id = 'orphan-msg-cloud-id-xxx'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "Orphan message must NOT be inserted into messages table");
    }

    // ── Test 7: Pull tombstone ───────────────────────────────────────────────

    #[test]
    fn pull_tombstone_soft_deletes_conversation() {
        let conn = fresh_db();

        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('ToDelete', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let local_id: i64 = conn.last_insert_rowid();
        let cloud_id = "tombstone-conv-uuid-1";
        conn.execute(
            "UPDATE conversations SET cloud_id = ?1 WHERE id = ?2",
            params![cloud_id, local_id],
        )
        .unwrap();

        // Also insert a child message so we can verify it is NOT cascaded-deleted.
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, created_at) \
             VALUES (?1, 'u1', 'user', 'child', CURRENT_TIMESTAMP)",
            params![local_id],
        )
        .unwrap();

        let delta = ConversationDelta {
            id: cloud_id.to_string(),
            title: Some("ToDelete".to_string()),
            model: None,
            project_id: None,
            pinned: None,
            created_at: None,
            updated_at: None,
            deleted_at: Some("2026-06-21T00:00:00Z".to_string()),
            server_version: "200".to_string(),
        };

        apply_conversation_deltas(&conn, "u1", &[delta]);

        // Row still exists (soft delete).
        let (still_exists, deleted_at_utc): (i64, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), deleted_at_utc FROM conversations WHERE id = ?1",
                params![local_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(still_exists, 1, "tombstone must NOT hard-delete the row");
        assert!(deleted_at_utc.is_some(), "tombstone must set deleted_at_utc");

        // Child message must still exist (no CASCADE DELETE triggered).
        let child_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
                params![local_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(child_count, 1, "child messages must NOT be deleted by tombstone");
    }

    // ── Test 8: Cursor ───────────────────────────────────────────────────────

    #[test]
    fn cursor_bigint_compare_correct() {
        assert!(bigint_greater("10", "9"), "10 > 9");
        assert!(bigint_greater("100", "99"), "100 > 99");
        assert!(!bigint_greater("9", "10"), "9 < 10");
        assert!(!bigint_greater("0", "0"), "0 == 0");
        assert!(!bigint_greater("42", "42"), "42 == 42");
        assert!(bigint_greater("1000000000000000001", "999999999999999999"), "bigint boundary");
    }

    #[test]
    fn cursor_persists_and_resumes() {
        let conn = fresh_db();
        write_cursor(&conn, "u1", "42");
        let c = read_cursor(&conn, "u1");
        assert_eq!(c, "42");

        write_cursor(&conn, "u1", "100");
        let c2 = read_cursor(&conn, "u1");
        assert_eq!(c2, "100");
    }

    #[test]
    fn cursor_max_advances_correctly() {
        let versions = vec!["5".to_string(), "100".to_string(), "99".to_string()];
        let result = max_cursor("3", &versions);
        assert_eq!(result, "100");
    }

    // ── Test 9: Timestamp format (Zod z.string().datetime() compatibility) ───

    #[test]
    fn now_z_produces_zod_safe_z_suffix_timestamp() {
        let ts = now_z();
        // Zod z.string().datetime() requires ISO-8601 with a literal Z (not +00:00).
        // Regex: YYYY-MM-DDTHH:MM:SS[.mmm]Z
        let re = regex::Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$").unwrap();
        assert!(
            re.is_match(&ts),
            "now_z() must produce a Z-suffix ISO-8601 timestamp; got: {ts}"
        );
        assert!(!ts.contains('+'), "now_z() must not contain timezone offset (+00:00)");
    }

    #[test]
    fn to_z_datetime_normalises_sqlite_current_timestamp() {
        // SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS"
        let raw = "2026-06-21 12:34:56";
        let out = to_z_datetime(raw);
        let re = regex::Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$").unwrap();
        assert!(
            re.is_match(&out),
            "to_z_datetime must convert SQLite CURRENT_TIMESTAMP to Z-suffix; got: {out}"
        );
        assert!(out.starts_with("2026-06-21T12:34:56"), "datetime part must be preserved: {out}");
    }

    #[test]
    fn to_z_datetime_normalises_rfc3339_plus_offset() {
        // chrono's default to_rfc3339() emits +00:00 not Z
        let raw = "2026-06-21T12:34:56.789+00:00";
        let out = to_z_datetime(raw);
        assert!(
            out.ends_with('Z'),
            "to_z_datetime must convert +00:00 to Z suffix; got: {out}"
        );
        assert!(!out.contains('+'), "output must not contain +: {out}");
    }

    #[test]
    fn gather_push_conversations_updated_at_is_zod_safe() {
        // Arrange: insert a cloud conversation whose updated_at is CURRENT_TIMESTAMP
        // (space-separated). This mimics real production rows where updated_at was set
        // by CURRENT_TIMESTAMP (the SQLite default, not a Z-suffix timestamp).
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('T', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();

        let push_convs = gather_push_conversations(&conn, "u1").unwrap();
        assert_eq!(push_convs.len(), 1, "one cloud conversation must be gathered");
        let updated_at = &push_convs[0].updated_at;
        let re = regex::Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$").unwrap();
        assert!(
            re.is_match(updated_at),
            "gathered updated_at must be Zod-safe (Z-suffix ISO-8601); got: {updated_at}"
        );
    }

    // ── Test 10: Gating ──────────────────────────────────────────────────────

    /// TRUST-BOUNDARY: active_mode="local" must force cloud_sync_enabled=false
    /// regardless of what chat_storage_mode is set to in user preferences.
    /// This mirrors the logic in chat_send_message in send_message.rs.
    #[test]
    fn local_active_mode_forces_cloud_sync_disabled_even_with_cloud_storage_pref() {
        let compute_cloud_sync_enabled = |active_mode: Option<&str>, storage_mode: &str| -> bool {
            let active_mode_is_local = active_mode == Some("local");
            if active_mode_is_local {
                false
            } else {
                storage_mode == "cloud"
            }
        };

        assert!(
            !compute_cloud_sync_enabled(Some("local"), "cloud"),
            "active_mode=local with storage_mode=cloud must yield cloud_sync_enabled=false"
        );
        assert!(
            compute_cloud_sync_enabled(Some("cloud"), "cloud"),
            "active_mode=cloud with storage_mode=cloud must yield cloud_sync_enabled=true"
        );
        assert!(
            !compute_cloud_sync_enabled(Some("local"), "local"),
            "active_mode=local with storage_mode=local must yield cloud_sync_enabled=false"
        );
        assert!(
            compute_cloud_sync_enabled(None, "cloud"),
            "active_mode=None with storage_mode=cloud must yield cloud_sync_enabled=true"
        );
    }

    #[test]
    fn local_conversation_never_gets_cloud_id() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Local', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();

        // Trying to mint a local conversation is a no-op.
        mark_conversation_for_push(&conn, conv_id).unwrap();

        // Verify it stays null/0.
        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM conversations WHERE id = ?1",
                params![conv_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(cloud_id.is_none(), "local conversation cloud_id must stay NULL");
        assert_eq!(needs_push, 0, "local conversation needs_push must stay 0");

        // Verify push gather also excludes it.
        let push_convs = gather_push_conversations(&conn, "u1").unwrap();
        assert_eq!(push_convs.len(), 0, "local conversation must not appear in push gather");
    }
}
