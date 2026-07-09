//! Desktop cloud sync engine (P2 Phase 2).
//!
//! Delta-syncs the SQLite chat store (`conversations` + `messages` + `artifacts`
//! where `app_mode='cloud'`) with the managed-cloud `/api/chat/sync` endpoint:
//! push locally-changed rows (needs_push=1), then pull everything with a
//! `server_version` greater than our per-user cursor.
//!
//! MANAGED-ONLY: every entry point is gated on the caller supplying a valid
//! bearer token (i.e. managed-cloud mode is active). The mint hooks
//! (`mark_conversation_for_push` / `mark_message_for_push` /
//! `mark_artifact_for_push`) are only called inside the `if cloud_sync_enabled`
//! branch in send_message_setup.rs / persistence.rs, and that flag is forced to
//! `false` in Local mode.
//!
//! Wire protocol is the live `/api/chat/sync` (Next.js route):
//!   POST { conversations, messages, artifacts }
//!        → { applied: { conversations, messages, artifacts }, cursor }
//!   GET  ?since=<cursor>
//!        → { conversations, messages, artifacts, cursor, hasMore }
//!
//! Artifacts share the chat cursor (one shared server_version sequence for all
//! three entity types on `/api/chat/sync`).
//!
//! INTEGER PKs are never sent over the wire; only `cloud_id` (UUIDv7) is.
//! `user_id` is NEVER sent in a push body — the server derives it from the
//! verified session and RLS WITH CHECK is the DB-level backstop.
//!
//! Known gap: a pulled artifact whose parent conversation has not yet landed
//! locally is silently skipped (not buffered). Cross-page artifact orphans can
//! be recovered on the next pull cycle once the conversation appears.

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
    pub artifacts_pushed: usize,
    pub conversations_pulled: usize,
    pub messages_pulled: usize,
    pub artifacts_pulled: usize,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deleted_at: Option<String>,
}

/// Pushed artifact (camelCase, matching PushArtifactSchema on server).
///
/// Server Zod schema uses `.optional()` for all nullable fields, so absent keys
/// (undefined) are accepted but JSON `null` is NOT — hence `skip_serializing_if`.
/// `conversationId`, `artifactType`, `content`, `updatedAt`, and `id` are required.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PushArtifact {
    id: String,               // cloud_id (UUIDv7)
    conversation_id: String,  // parent conversation cloud_id
    artifact_type: String,
    content: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_version: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deleted_at: Option<String>,
}

/// POST body — no user_id (server derives from session).
#[derive(Debug, Serialize)]
struct PushBody {
    conversations: Vec<PushConversation>,
    messages: Vec<PushMessage>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    artifacts: Vec<PushArtifact>,
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
    #[serde(default)]
    artifacts: Vec<AckedRow>,
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

/// Pulled artifact delta (snake_case, matching server SELECT columns).
#[derive(Debug, Deserialize)]
struct ArtifactDelta {
    id: String,               // cloud_id (UUIDv7)
    conversation_id: String,  // parent conversation cloud_id
    message_id: Option<String>,
    title: Option<String>,
    artifact_type: String,
    language: Option<String>,
    content: String,
    current_version: Option<i64>,
    pinned: Option<bool>,
    /// Server returns a JSONB array; deserialized as Vec<String>.
    #[serde(default)]
    tags: Vec<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
    server_version: String,
}

/// GET response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullResponse {
    conversations: Vec<ConversationDelta>,
    messages: Vec<MessageDelta>,
    #[serde(default)]
    artifacts: Vec<ArtifactDelta>,
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
        // NOTE: SQLite does NOT allow a table alias on an UPDATE target
        // (`UPDATE messages m` is a syntax error), so reference the target row's
        // columns via the table name `messages` in the correlated subqueries.
        "UPDATE messages \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             conversation_cloud_id = ( \
                 SELECT c.cloud_id FROM conversations c WHERE c.id = messages.conversation_id \
             ), \
             created_at_utc = COALESCE(created_at_utc, ?2), \
             needs_push = 1 \
         WHERE id = ?3 \
           AND EXISTS ( \
               SELECT 1 FROM conversations c \
               WHERE c.id = messages.conversation_id AND c.app_mode = 'cloud' \
           )",
        params![cloud_id, now, msg_id],
    )?;
    Ok(())
}

/// Mint a UUIDv7 cloud_id for a cloud artifact and mark it for push.
///
/// Also captures the parent conversation's cloud_id into `conversation_cloud_id`
/// so gather can filter without an extra join. The `artifacts.conversation_id`
/// column stores the INTEGER conversation id AS TEXT (e.g. "42"), so the join
/// uses `CAST(artifacts.conversation_id AS INTEGER) = conversations.id`.
///
/// Guard: only marks rows where `artifacts.app_mode = 'cloud'`. Local artifacts
/// (default `app_mode = 'local'`) are never touched.
pub fn mark_artifact_for_push(conn: &Connection, artifact_id: &str) -> SqlResult<()> {
    let cloud_id = Uuid::now_v7().to_string();
    conn.execute(
        "UPDATE artifacts \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             conversation_cloud_id = ( \
                 SELECT c.cloud_id FROM conversations c \
                 WHERE c.id = CAST(artifacts.conversation_id AS INTEGER) \
             ), \
             needs_push = 1 \
         WHERE id = ?2 AND app_mode = 'cloud'",
        params![cloud_id, artifact_id],
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

/// Gather cloud artifacts that need pushing.
///
/// Skips rows whose `conversation_cloud_id` is NULL (parent conversation not yet
/// minted — they stay dirty and retry on the next cycle, matching message behavior).
/// The `tags` TEXT column holds a JSON array; it is deserialized and re-serialized
/// to produce a Vec<String> for the wire.
fn gather_push_artifacts(conn: &Connection, user_id: &str) -> SqlResult<Vec<PushArtifact>> {
    let mut stmt = conn.prepare(
        "SELECT a.cloud_id, a.conversation_cloud_id, a.artifact_type, a.content, \
                a.title, a.language, a.version, a.is_pinned, a.tags, \
                a.created_at, a.updated_at, a.deleted_at_utc \
         FROM artifacts a \
         JOIN conversations c ON c.id = CAST(a.conversation_id AS INTEGER) \
         WHERE a.needs_push = 1 AND a.app_mode = 'cloud' AND c.user_id = ?1 \
           AND a.cloud_id IS NOT NULL \
           AND a.conversation_cloud_id IS NOT NULL",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        let cloud_id: String = row.get(0)?;
        let conv_cloud_id: String = row.get(1)?;
        let artifact_type: String = row.get(2)?;
        let content: String = row.get(3)?;
        let title: Option<String> = row.get(4)?;
        let language: Option<String> = row.get(5)?;
        let current_version: Option<i64> = row.get(6)?;
        let is_pinned: Option<i64> = row.get(7)?;
        let tags_json: Option<String> = row.get(8)?;
        let created_at_raw: Option<String> = row.get(9)?;
        let updated_at_raw: String = row.get(10)?;
        let deleted_at_utc: Option<String> = row.get(11)?;

        let created_at = created_at_raw.as_deref().map(to_z_datetime);
        let updated_at = to_z_datetime(&updated_at_raw);
        let deleted_at = deleted_at_utc.as_deref().map(to_z_datetime);
        let pinned = is_pinned.map(|v| v != 0);
        // Deserialize tags JSON array; fall back to empty vec on parse error.
        let tags: Vec<String> = tags_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let tags_opt = if tags.is_empty() { None } else { Some(tags) };

        Ok(PushArtifact {
            id: cloud_id,
            conversation_id: conv_cloud_id,
            artifact_type,
            content,
            updated_at,
            title,
            language,
            current_version,
            pinned,
            tags: tags_opt,
            created_at,
            deleted_at,
        })
    })?;
    rows.collect()
}

/// Ack-clear: mark acked artifacts as needs_push=0 and store server_version.
/// Unacked artifacts STAY needs_push=1 (parent conversation may not be on server yet).
fn ack_clear_artifacts(conn: &Connection, acked: &[AckedRow]) {
    for row in acked {
        let _ = conn.execute(
            "UPDATE artifacts SET needs_push = 0, server_version = ?1 \
             WHERE cloud_id = ?2",
            params![row.server_version, row.id],
        );
    }
}

// ---------------------------------------------------------------------------
// DB-only pull helpers.
// ---------------------------------------------------------------------------

/// Apply pulled artifact deltas into the local SQLite DB.
///
/// Dedup invariant: always SELECT id WHERE cloud_id=? before INSERT.
/// FK-mapping: resolves cloud conversation_id → local INTEGER conversations.id.
/// If the parent conversation is not present locally, the artifact is skipped
/// (not buffered — see module-level known-gap note). The caller (apply_pull_page)
/// applies conversations first, so within-page orphans are usually resolved; only
/// cross-page orphans are lost until the next sync cycle.
fn apply_artifact_deltas(
    conn: &Connection,
    user_id: &str,
    deltas: &[ArtifactDelta],
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
                // Parent conversation not present locally — skip (documented gap).
                debug!(
                    cloud_id = %d.id,
                    conv_cloud_id = %d.conversation_id,
                    "artifact_sync: parent conversation not found — skipping artifact (cross-page orphan)"
                );
                continue;
            }
        };

        // Dedup: find existing local row by cloud_id.
        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id FROM artifacts WHERE cloud_id = ?1",
                params![d.id],
                |row| row.get(0),
            )
            .ok();

        if let Some(deleted_at) = &d.deleted_at {
            // Tombstone: soft-delete only.
            if let Some(ref local_id) = existing_id {
                let _ = conn.execute(
                    "UPDATE artifacts SET deleted_at_utc = ?1, server_version = ?2 \
                     WHERE id = ?3",
                    params![deleted_at, d.server_version, local_id],
                );
                applied += 1;
            }
            // If not present locally, delete already propagated — no-op.
        } else if let Some(ref local_id) = existing_id {
            // LWW update: update mutable metadata fields (content, title, etc.).
            let tags_json = serde_json::to_string(&d.tags).unwrap_or_else(|_| "[]".to_string());
            let _ = conn.execute(
                "UPDATE artifacts \
                 SET artifact_type = ?1, \
                     content = COALESCE(?2, content), \
                     title = COALESCE(?3, title), \
                     language = COALESCE(?4, language), \
                     version = COALESCE(?5, version), \
                     is_pinned = COALESCE(?6, is_pinned), \
                     tags = ?7, \
                     server_version = ?8, \
                     needs_push = 0 \
                 WHERE id = ?9",
                params![
                    d.artifact_type,
                    d.content.as_str(),
                    d.title.as_deref(),
                    d.language.as_deref(),
                    d.current_version,
                    d.pinned.map(|p| if p { 1i64 } else { 0i64 }),
                    tags_json,
                    d.server_version,
                    local_id,
                ],
            );
            applied += 1;
        } else {
            // New artifact from another device — INSERT.
            // The local `artifacts` table uses a TEXT primary key; we use the cloud_id
            // as the local id for pulled artifacts (dedup on it is already guaranteed).
            let now = now_z();
            let created_at = d
                .created_at
                .as_deref()
                .map(to_z_datetime)
                .unwrap_or_else(|| now.clone());
            let updated_at = d
                .updated_at
                .as_deref()
                .map(to_z_datetime)
                .unwrap_or_else(|| now.clone());
            let is_pinned: i64 = d.pinned.map_or(0, |p| if p { 1 } else { 0 });
            let tags_json = serde_json::to_string(&d.tags).unwrap_or_else(|_| "[]".to_string());
            let conv_id_str = local_conv_id.to_string();

            let r = conn.execute(
                "INSERT INTO artifacts \
                 (id, cloud_id, conversation_id, artifact_type, title, content, language, \
                  version, is_pinned, tags, status, created_at, updated_at, \
                  conversation_cloud_id, server_version, needs_push, app_mode) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'complete', \
                         ?11, ?12, ?13, ?14, 0, 'cloud')",
                params![
                    // id = cloud_id (TEXT PK for pulled rows)
                    d.id,
                    d.id,
                    conv_id_str,
                    d.artifact_type,
                    d.title.as_deref().unwrap_or("Untitled"),
                    d.content,
                    d.language.as_deref(),
                    d.current_version.unwrap_or(1),
                    is_pinned,
                    tags_json,
                    created_at,
                    updated_at,
                    d.conversation_id,
                    d.server_version,
                ],
            );
            match r {
                Ok(_) => {
                    applied += 1;
                    // Pulled artifact: if it has a message_id, note the gap.
                    if d.message_id.is_some() {
                        debug!(cloud_id = %d.id, "artifact_sync: pulled artifact has message_id (desktop has no message_id column — field ignored)");
                    }
                }
                Err(e) => {
                    debug!(cloud_id = %d.id, error = %e, "artifact_sync: skipping duplicate pulled artifact");
                }
            }
            // Synthesize user_id annotation (no user_id column on artifacts table;
            // ownership is via conversations → user_id).
            let _ = user_id;
        }
    }
    applied
}

/// Apply pulled artifact deltas into the local SQLite DB.
fn apply_artifact_deltas_in_page(
    conn: &Connection,
    user_id: &str,
    page: &PullResponse,
) -> usize {
    apply_artifact_deltas(conn, user_id, &page.artifacts)
}

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
            // The parent is gone — drop any orphan messages buffered under it so they
            // can't strand the buffer forever (a conversation deleted on another device
            // would otherwise leak a pending row that never drains). Runs whether or not
            // the conversation exists locally.
            let _ = conn.execute(
                "DELETE FROM cloud_sync_pending_messages \
                 WHERE conversation_cloud_id = ?1 AND user_id = ?2",
                params![d.id, user_id],
            );
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
                // Parent not present yet — BUFFER for replay once it lands, never drop.
                // The parent conversation is re-versioned on every update, so it can
                // sit above this message and arrive in a later pull page. Dropping it
                // here (with the cursor advancing past it) would lose it permanently.
                buffer_pending_message(conn, user_id, d);
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
// Orphan buffer: pulled messages whose parent conversation has not landed yet.
// ---------------------------------------------------------------------------

/// Persist a pulled message whose parent conversation is not yet present locally,
/// so it can be replayed once the parent lands (instead of being lost). Idempotent
/// on cloud_id.
fn buffer_pending_message(conn: &Connection, user_id: &str, d: &MessageDelta) {
    let _ = conn.execute(
        "INSERT INTO cloud_sync_pending_messages \
         (cloud_id, conversation_cloud_id, user_id, role, content, model, provider, \
          created_at, deleted_at, server_version) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
         ON CONFLICT(cloud_id) DO UPDATE SET \
            conversation_cloud_id = excluded.conversation_cloud_id, \
            role = excluded.role, content = excluded.content, model = excluded.model, \
            provider = excluded.provider, created_at = excluded.created_at, \
            deleted_at = excluded.deleted_at, server_version = excluded.server_version",
        params![
            d.id,
            d.conversation_id,
            user_id,
            d.role.as_deref(),
            d.content.as_deref(),
            d.model.as_deref(),
            d.provider.as_deref(),
            d.created_at.as_deref(),
            d.deleted_at.as_deref(),
            d.server_version,
        ],
    );
}

struct PendingMsg {
    cloud_id: String,
    conversation_cloud_id: String,
    role: Option<String>,
    content: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    created_at: Option<String>,
    deleted_at: Option<String>,
    server_version: String,
}

/// Replay buffered messages whose parent conversation now exists locally: insert the
/// message (FK-mapped, deduped by cloud_id) and remove it from the buffer. A buffered
/// tombstone for a never-seen message is simply dropped. Returns the count inserted.
fn drain_pending_messages(conn: &Connection, user_id: &str) -> usize {
    // Collect resolvable rows first (parent conversation present), then mutate.
    let mut resolved: Vec<(i64, PendingMsg)> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT p.cloud_id, p.conversation_cloud_id, p.role, p.content, p.model, \
                p.provider, p.created_at, p.deleted_at, p.server_version, c.id \
         FROM cloud_sync_pending_messages p \
         JOIN conversations c ON c.cloud_id = p.conversation_cloud_id \
         WHERE p.user_id = ?1",
    ) {
        if let Ok(iter) = stmt.query_map(params![user_id], |row| {
            Ok((
                row.get::<_, i64>(9)?,
                PendingMsg {
                    cloud_id: row.get(0)?,
                    conversation_cloud_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    model: row.get(4)?,
                    provider: row.get(5)?,
                    created_at: row.get(6)?,
                    deleted_at: row.get(7)?,
                    server_version: row.get(8)?,
                },
            ))
        }) {
            for r in iter.flatten() {
                resolved.push(r);
            }
        }
    }

    let mut applied = 0usize;
    for (local_conv_id, p) in resolved {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM messages WHERE cloud_id = ?1",
                params![p.cloud_id],
                |row| row.get(0),
            )
            .ok();

        if exists.is_none() && p.deleted_at.is_none() {
            let role = p.role.clone().unwrap_or_else(|| "user".to_string());
            if matches!(role.as_str(), "user" | "assistant" | "system") {
                let now = now_z();
                let created_at = p.created_at.clone().unwrap_or(now);
                let r = conn.execute(
                    "INSERT INTO messages \
                     (cloud_id, conversation_id, conversation_cloud_id, user_id, role, content, \
                      model, provider, created_at, created_at_utc, server_version, needs_push) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)",
                    params![
                        p.cloud_id,
                        local_conv_id,
                        p.conversation_cloud_id,
                        user_id,
                        role,
                        p.content.clone().unwrap_or_default(),
                        p.model.as_deref(),
                        p.provider.as_deref(),
                        created_at,
                        p.created_at.as_deref(),
                        p.server_version,
                    ],
                );
                if r.is_ok() {
                    applied += 1;
                }
            }
        }
        // Remove from the buffer whether we inserted, deduped, or dropped a tombstone.
        let _ = conn.execute(
            "DELETE FROM cloud_sync_pending_messages WHERE cloud_id = ?1",
            params![p.cloud_id],
        );
    }
    applied
}

// ---------------------------------------------------------------------------
// Pull-page composition (pure DB; the orchestrator's HTTP is the only async part).
// ---------------------------------------------------------------------------

/// Select the next cursor from a pull response. We TRUST the server's cursor (a
/// safe min-frontier bound across the two independently-paginated tables) and only
/// guard against moving backwards — we must NOT recompute it from the max of per-row
/// server_versions, which would overshoot the lagging table's frontier and skip its
/// in-gap rows. Pure + unit-tested so this safety-critical choice can't silently
/// regress inside the (HTTP-bound, hard-to-test) orchestrator.
fn select_next_cursor(current: &str, resp_cursor: &Option<String>) -> String {
    match resp_cursor {
        Some(c) => max_cursor(current, std::slice::from_ref(c)),
        None => current.to_string(),
    }
}

/// Apply one pulled page in the load-bearing order:
/// 1. Conversations FIRST (so message/artifact FK-mapping can resolve parents).
/// 2. Drain buffered messages whose parent just landed.
/// 3. Messages for this page (orphans buffered, never dropped).
/// 4. Artifacts for this page (conversations applied first resolves within-page
///    orphans; cross-page artifact orphans are skipped — documented gap).
///
/// Returns (conversations_applied, messages_applied, artifacts_applied).
/// Extracted so the ordering invariant is testable without HTTP.
fn apply_pull_page(conn: &Connection, user_id: &str, page: &PullResponse) -> (usize, usize, usize) {
    let convs = apply_conversation_deltas(conn, user_id, &page.conversations);
    let drained = drain_pending_messages(conn, user_id);
    let msgs = apply_message_deltas(conn, user_id, &page.messages);
    let arts = apply_artifact_deltas_in_page(conn, user_id, page);
    (convs, drained + msgs, arts)
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
            artifacts_pushed: 0,
            conversations_pulled: 0,
            messages_pulled: 0,
            artifacts_pulled: 0,
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
    // Fail-closed backstop: never touch the network without a bearer token. The caller
    // gates on managed-cloud mode and supplies the token; this is the engine's own
    // independent re-check so a mis-call can't egress in a Local/unauthenticated state.
    if token.trim().is_empty() {
        return Ok(SyncOutcome {
            conversations_pushed: 0,
            messages_pushed: 0,
            artifacts_pushed: 0,
            conversations_pulled: 0,
            messages_pulled: 0,
            artifacts_pulled: 0,
        });
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let sync_url = format!("{}/api/chat/sync", base_url.trim_end_matches('/'));

    // ── PUSH ────────────────────────────────────────────────────────────────

    // Gather push payload (acquire conn, gather owned data, drop conn).
    let (push_convs, push_msgs, push_arts) = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        let convs = gather_push_conversations(&conn, user_id)
            .map_err(|e| format!("gather push conversations: {e}"))?;
        let msgs = gather_push_messages(&conn, user_id)
            .map_err(|e| format!("gather push messages: {e}"))?;
        let arts = gather_push_artifacts(&conn, user_id)
            .map_err(|e| format!("gather push artifacts: {e}"))?;
        (convs, msgs, arts)
    };

    let n_conv_attempted: Vec<String> = push_convs.iter().map(|c| c.id.clone()).collect();
    let n_convs_pushed = push_convs.len();
    let n_msgs_pushed = push_msgs.len();
    let n_arts_pushed = push_arts.len();

    if n_convs_pushed > 0 || n_msgs_pushed > 0 || n_arts_pushed > 0 {
        let body = PushBody {
            conversations: push_convs,
            messages: push_msgs,
            artifacts: push_arts,
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
            ack_clear_artifacts(&conn, &push_resp.applied.artifacts);
        }
    }

    // ── PULL ────────────────────────────────────────────────────────────────

    const PULL_PAGE_GUARD: usize = 50;
    let mut total_convs_pulled = 0usize;
    let mut total_msgs_pulled = 0usize;
    let mut total_arts_pulled = 0usize;

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
        let new_cursor = select_next_cursor(&cursor, &pull_resp.cursor);

        // Apply page (acquire conn, apply, advance cursor, drop conn).
        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            let (convs, msgs, arts) = apply_pull_page(&conn, user_id, &pull_resp);
            total_convs_pulled += convs;
            total_msgs_pulled += msgs;
            total_arts_pulled += arts;
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
        artifacts_pushed: n_arts_pushed,
        conversations_pulled: total_convs_pulled,
        messages_pulled: total_msgs_pulled,
        artifacts_pulled: total_arts_pulled,
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
    fn push_gather_includes_only_supported_transcript_roles() {
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

        // All three transcript roles are part of the synced set. (The messages table's
        // CHECK(role IN ('user','assistant','system')) makes a 'tool' row impossible to
        // insert, so the gather role filter is a structural backstop, not exercisable
        // here — this test asserts the supported roles are gathered, not a false claim
        // that an un-insertable role is skipped.)
        for (i, role) in ["user", "assistant", "system"].iter().enumerate() {
            conn.execute(
                "INSERT INTO messages (conversation_id, user_id, role, content, created_at) \
                 VALUES (?1, 'u1', ?2, 'c', CURRENT_TIMESTAMP)",
                params![conv_id, role],
            )
            .unwrap();
            let mid = conn.last_insert_rowid();
            conn.execute(
                "UPDATE messages SET cloud_id = ?1, conversation_cloud_id = ?2, \
                 needs_push = 1, created_at_utc = CURRENT_TIMESTAMP WHERE id = ?3",
                params![format!("uuid-{i}"), conv_cloud_id, mid],
            )
            .unwrap();
        }

        let mut roles: Vec<String> = gather_push_messages(&conn, "u1")
            .unwrap()
            .into_iter()
            .map(|m| m.role)
            .collect();
        roles.sort();
        assert_eq!(roles, vec!["assistant", "system", "user"]);
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
    // (The active_mode→cloud_sync_enabled trust-boundary rule is tested directly
    // against the real `derive_cloud_sync_enabled` fn in send_message_setup.rs. The
    // tautological closure duplicate that lived here was removed. The mint-level
    // gating — a local conversation never gets a cloud_id — is proven below.)

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

    // ── Pull deltas built from the snake_case wire shape ─────────────────────

    fn conv_delta(id: &str, sv: &str, deleted_at: Option<&str>) -> ConversationDelta {
        serde_json::from_value(serde_json::json!({
            "id": id, "title": "T", "model": null, "project_id": null, "pinned": false,
            "created_at": "2026-06-20T00:00:00Z", "updated_at": "2026-06-20T00:00:00Z",
            "deleted_at": deleted_at, "server_version": sv,
        }))
        .unwrap()
    }

    fn msg_delta(id: &str, conv_cloud_id: &str, sv: &str, deleted_at: Option<&str>) -> MessageDelta {
        serde_json::from_value(serde_json::json!({
            "id": id, "conversation_id": conv_cloud_id, "role": "user", "content": "hello",
            "model": null, "provider": null, "created_at": "2026-06-20T00:00:00Z",
            "deleted_at": deleted_at, "server_version": sv,
        }))
        .unwrap()
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    /// A pulled message whose parent conversation has not landed is BUFFERED (not
    /// dropped), then inserted with the correct INTEGER FK once the parent arrives.
    /// This is the orphan-loss fix: server_version is reassigned on every update, so
    /// a conversation routinely sits above its own messages and arrives in a later page.
    #[test]
    fn pull_orphan_message_is_buffered_then_drained_when_parent_lands() {
        let conn = fresh_db();

        // Message arrives before its parent conversation exists locally.
        let applied = apply_message_deltas(&conn, "u1", &[msg_delta("m1", "conv-c1", "10", None)]);
        assert_eq!(applied, 0, "orphan is not inserted into messages");
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM cloud_sync_pending_messages WHERE cloud_id='m1'"),
            1,
            "orphan must be buffered, never dropped"
        );
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM messages WHERE cloud_id='m1'"), 0);

        // Parent conversation lands; draining resolves the buffered orphan.
        apply_conversation_deltas(&conn, "u1", &[conv_delta("conv-c1", "20", None)]);
        let drained = drain_pending_messages(&conn, "u1");
        assert_eq!(drained, 1, "buffered orphan is inserted once its parent exists");

        let parent_local: i64 = conn
            .query_row("SELECT id FROM conversations WHERE cloud_id='conv-c1'", [], |r| r.get(0))
            .unwrap();
        let msg_fk: i64 = conn
            .query_row("SELECT conversation_id FROM messages WHERE cloud_id='m1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(msg_fk, parent_local, "message FK maps to the parent's local INTEGER id");
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM cloud_sync_pending_messages"),
            0,
            "buffer is emptied after draining"
        );
    }

    /// DEDUP INVARIANT: re-pulling the same cloud_id UPDATEs in place, never inserts a
    /// second local row (the partial UNIQUE index is the backstop).
    #[test]
    fn pull_conversation_repull_is_idempotent_no_duplicate_row() {
        let conn = fresh_db();
        let delta = conv_delta("cc1", "5", None);
        apply_conversation_deltas(&conn, "u1", std::slice::from_ref(&delta));
        apply_conversation_deltas(&conn, "u1", std::slice::from_ref(&delta));
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM conversations WHERE cloud_id='cc1'"),
            1,
            "re-pulling the same cloud_id must not create a duplicate row"
        );
    }

    /// A pulled message tombstone SOFT-deletes (sets deleted_at_utc); it must never
    /// hard-delete, which would FK-CASCADE-orphan siblings.
    #[test]
    fn pull_message_tombstone_soft_deletes() {
        let conn = fresh_db();
        apply_conversation_deltas(&conn, "u1", &[conv_delta("cc1", "5", None)]);
        apply_message_deltas(&conn, "u1", &[msg_delta("m1", "cc1", "6", None)]);
        apply_message_deltas(&conn, "u1", &[msg_delta("m1", "cc1", "7", Some("2026-06-20T01:00:00Z"))]);

        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM messages WHERE cloud_id='m1'"),
            1,
            "tombstoned message row must NOT be hard-deleted"
        );
        let deleted: Option<String> = conn
            .query_row("SELECT deleted_at_utc FROM messages WHERE cloud_id='m1'", [], |r| r.get(0))
            .unwrap();
        assert!(deleted.is_some(), "deleted_at_utc must be set on a tombstoned message");
    }

    /// The engine must advance the cursor from the SERVER's safe cursor, never the
    /// max of per-row server_versions (which overshoots and drops in-gap rows). This
    /// pins the consumption choice that lives in the otherwise-untested orchestrator.
    #[test]
    fn select_next_cursor_trusts_server_cursor_not_row_max() {
        // Server returns a safe cursor (10) below a row at sv 99 in the page.
        assert_eq!(select_next_cursor("0", &Some("10".to_string())), "10");
        // Never moves backwards if the server (somehow) returns a lower value.
        assert_eq!(select_next_cursor("50", &Some("10".to_string())), "50");
        // Missing cursor → hold position.
        assert_eq!(select_next_cursor("7", &None), "7");
    }

    /// apply_pull_page must run conversations → drain → messages, so an orphan buffered
    /// on a prior page is resolved when its parent lands on this page.
    #[test]
    fn apply_pull_page_drains_orphan_when_parent_lands_this_page() {
        let conn = fresh_db();
        // Page 1: a message arrives before its parent → buffered.
        let page1: PullResponse = serde_json::from_value(serde_json::json!({
            "conversations": [],
            "messages": [{
                "id": "m1", "conversation_id": "cc1", "role": "user", "content": "hi",
                "model": null, "provider": null, "created_at": "2026-06-20T00:00:00Z",
                "deleted_at": null, "server_version": "6"
            }],
            "cursor": "6", "hasMore": true,
        }))
        .unwrap();
        let (_c1, m1, _a1) = apply_pull_page(&conn, "u1", &page1);
        assert_eq!(m1, 0, "orphan not applied yet");
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM cloud_sync_pending_messages"), 1);

        // Page 2: the parent conversation lands → drain resolves the buffered orphan.
        let page2: PullResponse = serde_json::from_value(serde_json::json!({
            "conversations": [{
                "id": "cc1", "title": "T", "model": null, "project_id": null, "pinned": false,
                "created_at": "2026-06-20T00:00:00Z", "updated_at": "2026-06-20T00:00:00Z",
                "deleted_at": null, "server_version": "20"
            }],
            "messages": [], "artifacts": [], "cursor": "20", "hasMore": false,
        }))
        .unwrap();
        let (c2, m2, _a2) = apply_pull_page(&conn, "u1", &page2);
        assert_eq!(c2, 1, "parent conversation applied");
        assert_eq!(m2, 1, "buffered orphan drained on the page its parent landed");
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM messages WHERE cloud_id='m1'"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM cloud_sync_pending_messages"), 0);
    }

    /// Re-pulling the same non-tombstone message must not insert a duplicate row.
    #[test]
    fn pull_message_repull_is_idempotent_no_duplicate() {
        let conn = fresh_db();
        apply_conversation_deltas(&conn, "u1", &[conv_delta("cc1", "5", None)]);
        apply_message_deltas(&conn, "u1", &[msg_delta("m1", "cc1", "6", None)]);
        apply_message_deltas(&conn, "u1", &[msg_delta("m1", "cc1", "6", None)]);
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM messages WHERE cloud_id='m1'"),
            1,
            "re-pulling the same message cloud_id must not create a duplicate"
        );
    }

    /// A conversation tombstone drops any orphan messages buffered under it, so a
    /// conversation deleted on another device can't strand the buffer forever.
    #[test]
    fn conversation_tombstone_drops_buffered_orphans() {
        let conn = fresh_db();
        // Buffer an orphan (parent never seen).
        apply_message_deltas(&conn, "u1", &[msg_delta("m1", "cc-gone", "6", None)]);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM cloud_sync_pending_messages"), 1);
        // Parent arrives only as a tombstone (deleted on another device).
        apply_conversation_deltas(&conn, "u1", &[conv_delta("cc-gone", "9", Some("2026-06-20T01:00:00Z"))]);
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM cloud_sync_pending_messages"),
            0,
            "tombstoned parent must drop its buffered orphan messages"
        );
    }

    /// The alias-fixed mint UPDATE must actually populate conversation_cloud_id from
    /// the parent (the half of the SQL fix that 'it no longer errors' doesn't prove).
    #[test]
    fn mark_message_populates_conversation_cloud_id_from_parent() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();
        let conv_cloud_id: String = conn
            .query_row("SELECT cloud_id FROM conversations WHERE id=?1", params![conv_id], |r| r.get(0))
            .unwrap();

        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content, created_at) \
             VALUES (?1, 'u1', 'assistant', 'hi', CURRENT_TIMESTAMP)",
            params![conv_id],
        )
        .unwrap();
        let msg_id = conn.last_insert_rowid();
        mark_message_for_push(&conn, msg_id).unwrap();

        let (needs_push, msg_conv_cloud): (i64, Option<String>) = conn
            .query_row(
                "SELECT needs_push, conversation_cloud_id FROM messages WHERE id=?1",
                params![msg_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(needs_push, 1, "cloud-conversation message must be marked");
        assert_eq!(
            msg_conv_cloud.as_deref(),
            Some(conv_cloud_id.as_str()),
            "conversation_cloud_id must be populated from the parent's cloud_id"
        );
    }

    /// WIRE FORMAT: the push body must serialize to the server's camelCase zod schema
    /// (PushConversationSchema/PushMessageSchema). A missing rename here would emit
    /// snake_case keys, the server would see required camelCase fields missing, and
    /// EVERY push would 400 — silently degrading desktop to pull-only. Also asserts
    /// user_id never leaves in the body (server derives it; RLS enforces it).
    #[test]
    fn push_body_serializes_to_server_camelcase_schema() {
        let body = PushBody {
            conversations: vec![PushConversation {
                id: "c1".into(),
                title: "T".into(),
                model: None,
                project_id: Some("p1".into()),
                pinned: false,
                created_at: Some("2026-06-20T00:00:00Z".into()),
                updated_at: "2026-06-20T00:00:01Z".into(),
                deleted_at: None,
            }],
            messages: vec![PushMessage {
                id: "m1".into(),
                conversation_id: "c1".into(),
                role: "user".into(),
                content: "hi".into(),
                model: None,
                provider: None,
                created_at: Some("2026-06-20T00:00:00Z".into()),
                deleted_at: None,
            }],
            artifacts: vec![],
        };
        let v = serde_json::to_value(&body).unwrap();

        let conv = &v["conversations"][0];
        assert_eq!(conv["projectId"], "p1", "project_id must serialize as projectId");
        assert!(conv.get("createdAt").is_some(), "created_at → createdAt");
        assert!(conv.get("updatedAt").is_some(), "updated_at → updatedAt");
        assert!(conv.get("project_id").is_none(), "must not emit snake_case project_id");
        assert!(conv.get("deletedAt").is_some(), "deleted_at key present (null) → deletedAt");

        let msg = &v["messages"][0];
        assert_eq!(msg["conversationId"], "c1", "conversation_id must serialize as conversationId");
        assert!(msg.get("createdAt").is_some(), "created_at → createdAt");
        assert!(msg.get("conversation_id").is_none(), "must not emit snake_case conversation_id");

        // Trust boundary: no user_id anywhere in the push body.
        for obj in [conv, msg] {
            assert!(obj.get("userId").is_none() && obj.get("user_id").is_none());
        }

        // Empty artifacts array is omitted (skip_serializing_if = Vec::is_empty).
        assert!(v.get("artifacts").is_none(), "empty artifacts must be omitted from body");
    }

    /// The push ACK response is snake_case (`server_version` from the SQL RETURNING).
    /// A camelCase rename on AckedRow would silently break ack-clear → infinite re-push.
    #[test]
    fn push_response_deserializes_snake_case_server_version() {
        let resp: PushResponse = serde_json::from_value(serde_json::json!({
            "applied": {
                "conversations": [{ "id": "c1", "server_version": "42" }],
                "messages": [{ "id": "m1", "server_version": "43" }],
                "artifacts": [{ "id": "a1", "server_version": "44" }]
            },
            "cursor": "44"
        }))
        .unwrap();
        assert_eq!(resp.applied.conversations[0].id, "c1");
        assert_eq!(resp.applied.conversations[0].server_version, "42");
        assert_eq!(resp.applied.messages[0].server_version, "43");
        assert_eq!(resp.applied.artifacts[0].id, "a1");
        assert_eq!(resp.applied.artifacts[0].server_version, "44");
    }

    /// TRUST BOUNDARY (CLAUDE.md locked rule): the engine must perform ZERO network
    /// I/O without a bearer token. An empty token returns an empty outcome and leaves
    /// dirty rows untouched — no push, no clear. (An unreachable base_url also proves
    /// no HTTP was attempted: if the guard were removed, the connect would error.)
    #[tokio::test]
    async fn sync_now_inner_no_egress_without_token() {
        use crate::sys::commands::chat::state::AppDatabase;
        let db_inner = crate::data::db::Database::in_memory().unwrap();
        let db = AppDatabase {
            conn: std::sync::Arc::clone(&db_inner.get_connection()),
        };
        {
            let conn = db.connection().unwrap();
            conn.execute(
                "INSERT INTO conversations (title, user_id, app_mode) VALUES ('C','u1','cloud')",
                [],
            )
            .unwrap();
            let cid = conn.last_insert_rowid();
            mark_conversation_for_push(&conn, cid).unwrap();
        }

        let outcome = sync_now_inner(&db, "u1", "  ", "http://127.0.0.1:1/")
            .await
            .expect("empty-token sync must return Ok(empty), not attempt the network");
        assert_eq!(outcome.conversations_pushed, 0);
        assert_eq!(outcome.messages_pushed, 0);
        assert_eq!(outcome.artifacts_pushed, 0);
        assert_eq!(outcome.conversations_pulled, 0);
        assert_eq!(outcome.messages_pulled, 0);
        assert_eq!(outcome.artifacts_pulled, 0);

        let conn = db.connection().unwrap();
        let needs_push: i64 = conn
            .query_row("SELECT needs_push FROM conversations WHERE user_id='u1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(needs_push, 1, "no push happened, so the dirty flag is untouched");
    }

    // ── Artifact sync tests ──────────────────────────────────────────────────

    /// Migration v71 adds cloud sync columns + indexes to artifacts.
    #[test]
    fn migration_v71_adds_artifact_sync_columns() {
        let conn = fresh_db();

        for col in ["cloud_id", "server_version", "needs_push", "app_mode",
                    "conversation_cloud_id", "deleted_at_utc"] {
            let exists: bool = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) > 0 FROM pragma_table_info('artifacts') WHERE name = '{}'",
                        col
                    ),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            assert!(exists, "artifacts.{} should exist after v71", col);
        }

        // app_mode default must be 'local' (safe default — existing rows are local-only).
        conn.execute(
            "INSERT INTO artifacts (id, artifact_type, title, content, created_at, updated_at) \
             VALUES ('test-art-id', 'code', 'T', 'content', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let app_mode: String = conn
            .query_row(
                "SELECT app_mode FROM artifacts WHERE id = 'test-art-id'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(app_mode, "local", "artifacts.app_mode must default to 'local'");
    }

    /// mint_local_artifact: mark_artifact_for_push is a no-op for local artifacts.
    #[test]
    fn mint_local_artifact_does_not_set_cloud_id() {
        let conn = fresh_db();

        // Insert a local conversation and artifact (default app_mode='local').
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('LocalConv', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO artifacts (id, artifact_type, title, content, conversation_id, created_at, updated_at) \
             VALUES ('local-art-1', 'code', 'T', 'content', ?1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            params![conv_id.to_string()],
        )
        .unwrap();

        mark_artifact_for_push(&conn, "local-art-1").unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM artifacts WHERE id = 'local-art-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_none(), "local artifact must NOT get a cloud_id");
        assert_eq!(needs_push, 0, "local artifact must NOT get needs_push=1");
    }

    /// mint_cloud_artifact: mark_artifact_for_push sets cloud_id + conversation_cloud_id.
    #[test]
    fn mint_cloud_artifact_sets_cloud_id_and_conversation_cloud_id() {
        let conn = fresh_db();

        // Create a cloud conversation with a cloud_id.
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('CloudConv', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();
        let conv_cloud_id: String = conn
            .query_row(
                "SELECT cloud_id FROM conversations WHERE id = ?1",
                params![conv_id],
                |r| r.get(0),
            )
            .unwrap();

        // Create a cloud artifact for this conversation.
        conn.execute(
            "INSERT INTO artifacts (id, artifact_type, title, content, conversation_id, \
             created_at, updated_at, app_mode) \
             VALUES ('cloud-art-1', 'code', 'T', 'content', ?1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'cloud')",
            params![conv_id.to_string()],
        )
        .unwrap();

        mark_artifact_for_push(&conn, "cloud-art-1").unwrap();

        let (cloud_id, conv_cloud_id_col, needs_push): (Option<String>, Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, conversation_cloud_id, needs_push FROM artifacts WHERE id = 'cloud-art-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();

        assert!(cloud_id.is_some(), "cloud artifact must get a cloud_id after mint");
        assert_eq!(needs_push, 1, "cloud artifact must get needs_push=1 after mint");
        assert_eq!(
            conv_cloud_id_col.as_deref(),
            Some(conv_cloud_id.as_str()),
            "conversation_cloud_id must be populated from the parent's cloud_id"
        );
    }

    /// push_gather_excludes_local_artifacts: gather only pulls cloud artifacts.
    #[test]
    fn push_gather_excludes_local_artifacts() {
        let conn = fresh_db();

        // Cloud conversation.
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('CloudConv', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        mark_conversation_for_push(&conn, conv_id).unwrap();
        let conv_cloud_id: String = conn
            .query_row(
                "SELECT cloud_id FROM conversations WHERE id=?1",
                params![conv_id],
                |r| r.get(0),
            )
            .unwrap();

        // Cloud artifact.
        conn.execute(
            "INSERT INTO artifacts (id, artifact_type, title, content, conversation_id, \
             created_at, updated_at, app_mode, cloud_id, conversation_cloud_id, needs_push) \
             VALUES ('cloud-art-2', 'code', 'T', 'hello', ?1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, \
                     'cloud', 'uuid-cloud-art-2', ?2, 1)",
            params![conv_id.to_string(), conv_cloud_id],
        )
        .unwrap();

        // Local artifact (default app_mode).
        conn.execute(
            "INSERT INTO artifacts (id, artifact_type, title, content, conversation_id, \
             created_at, updated_at) \
             VALUES ('local-art-2', 'code', 'T', 'local', ?1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            params![conv_id.to_string()],
        )
        .unwrap();

        let arts = gather_push_artifacts(&conn, "u1").unwrap();
        assert_eq!(arts.len(), 1, "only cloud artifact should be gathered");
        assert_eq!(arts[0].id, "uuid-cloud-art-2");
        assert_eq!(arts[0].artifact_type, "code", "artifact_type must be gathered");
        assert_eq!(arts[0].content, "hello", "content must be gathered");
    }

    /// artifact push wire shape: camelCase with skip_serializing_if for None.
    #[test]
    fn artifact_push_body_serializes_to_camelcase_schema() {
        let body = PushBody {
            conversations: vec![],
            messages: vec![],
            artifacts: vec![PushArtifact {
                id: "art-uuid-1".into(),
                conversation_id: "conv-uuid-1".into(),
                artifact_type: "code".into(),
                content: "fn main() {}".into(),
                updated_at: "2026-06-22T00:00:00.000Z".into(),
                title: Some("My Artifact".into()),
                language: Some("rust".into()),
                current_version: Some(2),
                pinned: Some(true),
                tags: Some(vec!["tag1".into()]),
                created_at: Some("2026-06-20T00:00:00.000Z".into()),
                deleted_at: None,
            }],
        };
        let v = serde_json::to_value(&body).unwrap();

        // artifacts must be present (non-empty).
        let arts = &v["artifacts"];
        assert!(arts.is_array(), "artifacts must be an array");
        let art = &arts[0];

        // Required camelCase fields.
        assert_eq!(art["id"], "art-uuid-1");
        assert_eq!(art["conversationId"], "conv-uuid-1", "conversationId must be camelCase");
        assert_eq!(art["artifactType"], "code", "artifactType must be camelCase");
        assert_eq!(art["content"], "fn main() {}");
        assert!(art.get("updatedAt").is_some(), "updatedAt must be present");

        // Optional camelCase fields.
        assert_eq!(art["title"], "My Artifact");
        assert_eq!(art["language"], "rust");
        assert_eq!(art["currentVersion"], 2, "currentVersion must be camelCase");
        assert_eq!(art["pinned"], true);
        assert_eq!(art["createdAt"], "2026-06-20T00:00:00.000Z");

        // deletedAt absent when None (Zod optional rejects null).
        assert!(
            art.get("deletedAt").is_none(),
            "deletedAt must be absent when None — Zod .optional() rejects null"
        );

        // snake_case keys must never appear.
        assert!(art.get("artifact_type").is_none(), "must not emit snake_case artifact_type");
        assert!(art.get("conversation_id").is_none(), "must not emit snake_case conversation_id");
        assert!(art.get("current_version").is_none(), "must not emit snake_case current_version");

        // user_id must never appear.
        assert!(art.get("userId").is_none() && art.get("user_id").is_none());
    }

    /// artifact push wire shape: None optionals must be absent (not null).
    #[test]
    fn artifact_push_none_optionals_are_absent_not_null() {
        let body = PushBody {
            conversations: vec![],
            messages: vec![],
            artifacts: vec![PushArtifact {
                id: "art-uuid-2".into(),
                conversation_id: "conv-uuid-2".into(),
                artifact_type: "document".into(),
                content: "some text".into(),
                updated_at: "2026-06-22T00:00:00.000Z".into(),
                title: None,
                language: None,
                current_version: None,
                pinned: None,
                tags: None,
                created_at: None,
                deleted_at: None,
            }],
        };
        let v = serde_json::to_value(&body).unwrap();
        let art = &v["artifacts"][0];

        // All None optional fields must be completely absent (key must not exist).
        for key in ["title", "language", "currentVersion", "pinned", "tags",
                    "createdAt", "deletedAt"] {
            assert!(
                art.get(key).is_none(),
                "Optional field '{}' must be absent when None — Zod .optional() rejects null",
                key
            );
        }
    }

    /// pull_artifact_dedup: re-pulling the same cloud_id updates in place, never inserts a duplicate.
    #[test]
    fn pull_artifact_dedup_updates_not_inserts_on_existing_cloud_id() {
        let conn = fresh_db();

        // Create a cloud conversation and give it a cloud_id.
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Conv', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        let conv_cloud_id = "conv-cloud-uuid-art-dedup";
        conn.execute(
            "UPDATE conversations SET cloud_id = ?1 WHERE id = ?2",
            params![conv_cloud_id, conv_id],
        )
        .unwrap();

        // First pull → INSERT.
        let delta = ArtifactDelta {
            id: "art-cloud-uuid-1".to_string(),
            conversation_id: conv_cloud_id.to_string(),
            message_id: None,
            title: Some("Original".to_string()),
            artifact_type: "code".to_string(),
            language: Some("rust".to_string()),
            content: "fn hello() {}".to_string(),
            current_version: Some(1),
            pinned: Some(false),
            tags: vec![],
            created_at: Some("2026-06-20T00:00:00Z".to_string()),
            updated_at: Some("2026-06-20T00:00:00Z".to_string()),
            deleted_at: None,
            server_version: "10".to_string(),
        };
        apply_artifact_deltas(&conn, "u1", &[delta]);

        // Second pull (re-pull same cloud_id) → UPDATE, no duplicate.
        let delta2 = ArtifactDelta {
            id: "art-cloud-uuid-1".to_string(),
            conversation_id: conv_cloud_id.to_string(),
            message_id: None,
            title: Some("Updated Title".to_string()),
            artifact_type: "code".to_string(),
            language: Some("rust".to_string()),
            content: "fn hello_world() {}".to_string(),
            current_version: Some(2),
            pinned: Some(true),
            tags: vec!["tag1".to_string()],
            created_at: Some("2026-06-20T00:00:00Z".to_string()),
            updated_at: Some("2026-06-21T00:00:00Z".to_string()),
            deleted_at: None,
            server_version: "20".to_string(),
        };
        apply_artifact_deltas(&conn, "u1", &[delta2]);

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM artifacts WHERE cloud_id = 'art-cloud-uuid-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "re-pulling the same artifact cloud_id must not create a duplicate row");
    }

    /// pull_artifact_tombstone: a deleted_at in the delta soft-deletes the local row.
    #[test]
    fn pull_artifact_tombstone_soft_deletes() {
        let conn = fresh_db();

        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Conv', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        let conv_cloud_id = "conv-cloud-tombstone-art";
        conn.execute(
            "UPDATE conversations SET cloud_id = ?1 WHERE id = ?2",
            params![conv_cloud_id, conv_id],
        )
        .unwrap();

        // Insert a local cloud artifact (simulating a previously-pulled artifact).
        conn.execute(
            "INSERT INTO artifacts (id, cloud_id, artifact_type, title, content, conversation_id, \
             created_at, updated_at, app_mode, conversation_cloud_id) \
             VALUES ('art-local-id-1', 'art-cloud-tomb-1', 'code', 'T', 'c', ?1, \
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'cloud', ?2)",
            params![conv_id.to_string(), conv_cloud_id],
        )
        .unwrap();

        // Pull a tombstone delta.
        let delta = ArtifactDelta {
            id: "art-cloud-tomb-1".to_string(),
            conversation_id: conv_cloud_id.to_string(),
            message_id: None,
            title: Some("T".to_string()),
            artifact_type: "code".to_string(),
            language: None,
            content: "c".to_string(),
            current_version: Some(1),
            pinned: Some(false),
            tags: vec![],
            created_at: None,
            updated_at: None,
            deleted_at: Some("2026-06-22T00:00:00.000Z".to_string()),
            server_version: "50".to_string(),
        };
        apply_artifact_deltas(&conn, "u1", &[delta]);

        // Row must still exist (soft delete).
        let (still_exists, deleted_at_utc): (i64, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), deleted_at_utc FROM artifacts WHERE id = 'art-local-id-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(still_exists, 1, "tombstoned artifact must NOT be hard-deleted");
        assert!(deleted_at_utc.is_some(), "tombstoned artifact must have deleted_at_utc set");
    }

    /// pull_artifact_orphan: artifact whose parent conversation is absent is skipped.
    #[test]
    fn pull_artifact_orphan_skipped_when_parent_absent() {
        let conn = fresh_db();

        // No conversation with this cloud_id exists locally.
        let delta = ArtifactDelta {
            id: "orphan-art-uuid".to_string(),
            conversation_id: "nonexistent-conv-cloud-id".to_string(),
            message_id: None,
            title: None,
            artifact_type: "code".to_string(),
            language: None,
            content: "orphan".to_string(),
            current_version: None,
            pinned: None,
            tags: vec![],
            created_at: None,
            updated_at: None,
            deleted_at: None,
            server_version: "1".to_string(),
        };

        let applied = apply_artifact_deltas(&conn, "u1", &[delta]);
        assert_eq!(applied, 0, "orphan artifact must not be applied");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM artifacts WHERE cloud_id = 'orphan-art-uuid'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "orphan artifact must NOT be inserted into artifacts table");
    }

    /// apply_pull_page resolves within-page artifact orphan when conversation lands first.
    #[test]
    fn pull_artifact_resolved_when_conversation_lands_same_page() {
        let conn = fresh_db();

        // One page: conversation + artifact for that conversation.
        let page: PullResponse = serde_json::from_value(serde_json::json!({
            "conversations": [{
                "id": "conv-art-page-1", "title": "T", "model": null, "project_id": null,
                "pinned": false, "created_at": "2026-06-20T00:00:00Z",
                "updated_at": "2026-06-20T00:00:00Z", "deleted_at": null, "server_version": "5"
            }],
            "messages": [],
            "artifacts": [{
                "id": "art-page-1", "conversation_id": "conv-art-page-1", "message_id": null,
                "title": "Code", "artifact_type": "code", "language": "rust",
                "content": "fn main() {}", "current_version": 1, "pinned": false,
                "tags": [], "created_at": "2026-06-20T00:00:00Z",
                "updated_at": "2026-06-20T00:00:00Z", "deleted_at": null, "server_version": "6"
            }],
            "cursor": "6", "hasMore": false
        }))
        .unwrap();

        let (convs, _msgs, arts) = apply_pull_page(&conn, "u1", &page);
        assert_eq!(convs, 1, "conversation must be applied");
        assert_eq!(arts, 1, "artifact must be applied (conversation landed first on same page)");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM artifacts WHERE cloud_id = 'art-page-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "artifact must be in DB after apply_pull_page");
    }
}

// ---------------------------------------------------------------------------
// Fixture replay (Wave 4 — shared sync-apply extraction).
//
// The golden fixtures under packages/services/src/sync-apply/__fixtures__/
// are the cross-language contract: TS's replay lives in
// packages/services/src/sync-apply/__tests__/fixtures.test.ts. This module
// replays the SAME JSON against these native Rust apply fns (Rust cannot
// import the TS module — it re-implements the rules natively) to prove the
// two independently-written implementations agree on observable outcome.
// NO existing function in this file was changed to add this module.
//
// Fixture access — DIRECT include_str! across the workspace (not a copy):
// `include_str!` resolves at COMPILE TIME relative to THIS source file, not
// the `cargo test` invocation's working directory, so the relative path
// below is stable across build environments (unlike a runtime path would
// be). This also means these tests can never silently drift from a stale
// copy — if the canonical fixture changes, this file picks it up on the
// next build. The tradeoff is a compile-time dependency from this crate on
// a sibling pnpm package's file layout: if
// packages/services/src/sync-apply/__fixtures__ is ever moved, this path
// must move with it — a loud compile error, not a silent skip.
//
// DIVERGENCE LEDGER (cases intentionally not replayed here, or replayed
// with different intermediate assertions than the TS side — full rationale
// in each fixture case's own `divergenceNote` field):
//   - "dirty_title_preserved_against_stale_delta" (pull-apply.json, tagged
//     ["ts"] only): apply_conversation_deltas has no dirtyConversationIds
//     parameter — it always applies the server title via COALESCE. Desktop
//     has no client-side rename-durability guard today; not a bug to fix
//     as part of this test-only extraction.
//   - "message_count_preserved_from_existing_on_update" (tagged ["ts"]
//     only): the `conversations` table has no message_count column
//     (desktop counts messages by SQL query, not a stored counter) — not a
//     checkable field on this side.
//   - "orphan_message_then_parent_conversation_arrives": SAME end state on
//     both engines, reached differently. This module adds an INTERMEDIATE
//     assertion after step 1 alone (message buffered, not yet a live row)
//     that the TS side does not have — TS's port has no FK constraint, so
//     the message is already visible after step 1 there. See
//     packages/services/src/sync-apply/messages.ts's module docstring for
//     the full rationale (SQLite FK constraint vs. a plain Zustand map).
//   - Rust's wire structs (ConversationDelta/MessageDelta/ArtifactDelta) use
//     lenient `Option<...>` fields where the TS wire schema requires
//     non-null strings (e.g. title, role). Every fixture delta is written
//     to satisfy the STRICT TS schema (so it also parses as suite (a)
//     there), which is always a valid input to Rust's lenient fields too —
//     so this leniency never surfaces as an observable fixture difference;
//     it is a real asymmetry worth knowing about, not a testable one.
//   - Rust silently skips a pulled row with an unsupported role or a
//     duplicate cloud_id (via `debug!` + continue) rather than raising. No
//     fixture case exercises this: the TS wire schema's role enum already
//     makes an unsupported role unconstructable from a fixture that must
//     also satisfy suite (a) parsing on the TS side.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod fixture_tests {
    use super::*;
    use crate::data::db::migrations::run_migrations;
    use rusqlite::Connection;
    use serde::Deserialize;
    use std::collections::HashMap;

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");
        conn
    }

    const USER_ID: &str = "fixture-user";

    // ── Fixture schema (mirrors packages/services/src/sync-apply/__fixtures__) ──
    //
    // These structs are test-only projections, distinct from the production
    // ConversationDelta/MessageDelta/ArtifactDelta wire structs (which are
    // reused directly below for the `steps[].conversations/messages/artifacts`
    // arrays — those ARE the wire shape, snake_case, no rename needed).

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FxConversation {
        id: String,
        title: String,
        created_at: String,
        updated_at: String,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FxMessage {
        id: String,
        role: String,
        content: String,
        #[serde(default)]
        created_at: Option<String>,
    }

    #[derive(Debug, Deserialize, Default)]
    struct FxStep {
        #[serde(default)]
        conversations: Vec<ConversationDelta>,
        #[serde(default)]
        messages: Vec<MessageDelta>,
        #[serde(default)]
        artifacts: Vec<ArtifactDelta>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FxCase {
        name: String,
        applies: Vec<String>,
        #[serde(default)]
        initial_conversations: Vec<FxConversation>,
        #[serde(default)]
        initial_messages: HashMap<String, Vec<FxMessage>>,
        steps: Vec<FxStep>,
        #[serde(default)]
        expected_live_conversations: Vec<FxConversation>,
        #[serde(default)]
        expected_tombstoned_conversation_ids: Vec<String>,
        #[serde(default)]
        expected_live_messages: HashMap<String, Vec<FxMessage>>,
        #[serde(default)]
        expected_live_artifact_ids: Vec<String>,
        #[serde(default)]
        expected_tombstoned_artifact_ids: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    struct FxFile {
        cases: Vec<FxCase>,
    }

    fn load_pull_apply_fixtures() -> FxFile {
        // Canonical source: packages/services/src/sync-apply/__fixtures__/pull-apply.json
        let raw = include_str!(
            "../../../../../packages/services/src/sync-apply/__fixtures__/pull-apply.json"
        );
        serde_json::from_str(raw).expect("pull-apply.json must parse into FxFile")
    }

    // ── Seeding (direct SQL, NOT the apply fns — so "initial" state is
    //    independent of the logic under test) ───────────────────────────────

    fn seed_conversation(conn: &Connection, rec: &FxConversation) {
        conn.execute(
            "INSERT INTO conversations \
             (cloud_id, user_id, title, app_mode, created_at, updated_at, created_at_utc, server_version, needs_push) \
             VALUES (?1, ?2, ?3, 'cloud', ?4, ?5, ?4, '0', 0)",
            params![rec.id, USER_ID, rec.title, rec.created_at, rec.updated_at],
        )
        .unwrap_or_else(|e| panic!("seed_conversation({}) failed: {e}", rec.id));
    }

    fn seed_message(conn: &Connection, conversation_cloud_id: &str, rec: &FxMessage) {
        let local_conv_id: i64 = conn
            .query_row(
                "SELECT id FROM conversations WHERE cloud_id = ?1",
                params![conversation_cloud_id],
                |r| r.get(0),
            )
            .unwrap_or_else(|e| {
                panic!("seed_message: parent conversation {conversation_cloud_id} not seeded: {e}")
            });
        let created_at = rec.created_at.clone().unwrap_or_else(now_z);
        conn.execute(
            "INSERT INTO messages \
             (cloud_id, conversation_id, conversation_cloud_id, user_id, role, content, created_at, created_at_utc, server_version, needs_push) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, '0', 0)",
            params![rec.id, local_conv_id, conversation_cloud_id, USER_ID, rec.role, rec.content, created_at],
        )
        .unwrap_or_else(|e| panic!("seed_message({}) failed: {e}", rec.id));
    }

    // ── Assertions (observable outcome: fresh queries against the live
    //    table state, never the apply fns' return counts) ──────────────────

    fn assert_live_conversation(conn: &Connection, case: &str, expected: &FxConversation) {
        let result: rusqlite::Result<(String, String, String, Option<String>)> = conn.query_row(
            "SELECT title, created_at, updated_at, deleted_at_utc FROM conversations WHERE cloud_id = ?1",
            params![expected.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        );
        let (title, created_at, updated_at, deleted_at_utc) = result
            .unwrap_or_else(|e| panic!("[{case}] expected live conversation {} is missing: {e}", expected.id));
        assert_eq!(title, expected.title, "[{case}] conversation {} title", expected.id);
        assert_eq!(created_at, expected.created_at, "[{case}] conversation {} createdAt", expected.id);
        assert_eq!(updated_at, expected.updated_at, "[{case}] conversation {} updatedAt", expected.id);
        assert!(deleted_at_utc.is_none(), "[{case}] conversation {} must be live", expected.id);
    }

    fn assert_tombstoned_conversation(conn: &Connection, case: &str, id: &str) {
        let deleted_at_utc: Option<String> = conn
            .query_row(
                "SELECT deleted_at_utc FROM conversations WHERE cloud_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or_else(|e| panic!("[{case}] expected tombstoned conversation {id} is missing: {e}"));
        assert!(deleted_at_utc.is_some(), "[{case}] conversation {id} must be tombstoned (deleted_at_utc set)");
    }

    /// Ordered by created_at (always non-null on this path — see apply_message_deltas'
    /// insert branch), then cloud_id — the same tie-break TS's port applies.
    fn assert_live_messages(conn: &Connection, case: &str, conversation_cloud_id: &str, expected: &[FxMessage]) {
        let mut stmt = conn
            .prepare(
                "SELECT m.cloud_id, m.role, m.content FROM messages m \
                 JOIN conversations c ON c.id = m.conversation_id \
                 WHERE c.cloud_id = ?1 AND m.deleted_at_utc IS NULL \
                 ORDER BY m.created_at, m.cloud_id",
            )
            .unwrap();
        let actual: Vec<(String, String, String)> = stmt
            .query_map(params![conversation_cloud_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        let expected_tuples: Vec<(String, String, String)> =
            expected.iter().map(|m| (m.id.clone(), m.role.clone(), m.content.clone())).collect();
        assert_eq!(
            actual, expected_tuples,
            "[{case}] live messages for conversation {conversation_cloud_id} (id, role, content), ordered by created_at then id"
        );
    }

    fn assert_live_artifact(conn: &Connection, case: &str, id: &str) {
        let deleted_at_utc: Option<String> = conn
            .query_row("SELECT deleted_at_utc FROM artifacts WHERE cloud_id = ?1", params![id], |r| r.get(0))
            .unwrap_or_else(|e| panic!("[{case}] expected live artifact {id} is missing: {e}"));
        assert!(deleted_at_utc.is_none(), "[{case}] artifact {id} must be live");
    }

    fn assert_tombstoned_artifact(conn: &Connection, case: &str, id: &str) {
        let deleted_at_utc: Option<String> = conn
            .query_row("SELECT deleted_at_utc FROM artifacts WHERE cloud_id = ?1", params![id], |r| r.get(0))
            .unwrap_or_else(|e| panic!("[{case}] expected tombstoned artifact {id} is missing: {e}"));
        assert!(deleted_at_utc.is_some(), "[{case}] artifact {id} must be tombstoned");
    }

    fn take_page(step: &mut FxStep) -> PullResponse {
        PullResponse {
            conversations: std::mem::take(&mut step.conversations),
            messages: std::mem::take(&mut step.messages),
            artifacts: std::mem::take(&mut step.artifacts),
            cursor: None,
            has_more: false,
        }
    }

    // ── Suite (b): pull-apply.json replay ───────────────────────────────────
    //
    // Rust-tagged cases only (`applies` contains "rust"); TS-only cases are
    // listed in the divergence ledger in this module's header comment.

    #[test]
    fn replay_pull_apply_fixtures() {
        let mut fixtures = load_pull_apply_fixtures();
        let mut ran_any = false;

        for case in fixtures.cases.iter_mut() {
            if !case.applies.iter().any(|a| a == "rust") {
                continue;
            }
            ran_any = true;

            let conn = fresh_db();
            for conv in &case.initial_conversations {
                seed_conversation(&conn, conv);
            }
            for (conv_id, msgs) in &case.initial_messages {
                for msg in msgs {
                    seed_message(&conn, conv_id, msg);
                }
            }

            if case.name == "orphan_message_then_parent_conversation_arrives" {
                // Exercise the Rust-side half of the documented orphan-buffering
                // divergence: after step 1 alone (message only, no parent yet),
                // the message must NOT be a live row — it must be buffered.
                // Replayed via apply_pull_page (not apply_message_deltas
                // directly) so the real conv→drain→msg ordering is exercised.
                assert_eq!(case.steps.len(), 2, "[{}] expected exactly 2 steps", case.name);
                let page1 = take_page(&mut case.steps[0]);
                let (_c, m, _a) = apply_pull_page(&conn, USER_ID, &page1);
                assert_eq!(m, 0, "[{}] orphan message must not be visible before its parent lands", case.name);
                let pending: i64 = conn
                    .query_row("SELECT COUNT(*) FROM cloud_sync_pending_messages", [], |r| r.get(0))
                    .unwrap();
                assert_eq!(pending, 1, "[{}] orphan message must be buffered, not dropped", case.name);

                let page2 = take_page(&mut case.steps[1]);
                apply_pull_page(&conn, USER_ID, &page2);
            } else {
                for step in case.steps.iter_mut() {
                    let page = take_page(step);
                    apply_pull_page(&conn, USER_ID, &page);
                }
            }

            for expected in &case.expected_live_conversations {
                assert_live_conversation(&conn, &case.name, expected);
            }
            for id in &case.expected_tombstoned_conversation_ids {
                assert_tombstoned_conversation(&conn, &case.name, id);
            }
            for (conv_id, expected) in &case.expected_live_messages {
                assert_live_messages(&conn, &case.name, conv_id, expected);
            }
            for id in &case.expected_live_artifact_ids {
                assert_live_artifact(&conn, &case.name, id);
            }
            for id in &case.expected_tombstoned_artifact_ids {
                assert_tombstoned_artifact(&conn, &case.name, id);
            }
        }

        assert!(ran_any, "sanity: at least one rust-tagged fixture case must have run");
    }

    // ── Suite (d): bigint cursor compare (cursor-compare.json) ─────────────

    #[derive(Debug, Deserialize)]
    struct FxBigintGreaterCase {
        name: String,
        a: String,
        b: String,
        expected: bool,
    }

    #[derive(Debug, Deserialize)]
    struct FxMaxCursorCase {
        name: String,
        base: String,
        versions: Vec<String>,
        expected: String,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FxSelectNextCursorCase {
        name: String,
        current: String,
        response_cursor: Option<String>,
        expected: String,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FxCursorFile {
        bigint_greater_cases: Vec<FxBigintGreaterCase>,
        max_cursor_cases: Vec<FxMaxCursorCase>,
        select_next_cursor_cases: Vec<FxSelectNextCursorCase>,
    }

    #[test]
    fn replay_cursor_compare_fixtures() {
        // Canonical source: packages/services/src/sync-apply/__fixtures__/cursor-compare.json
        let raw = include_str!(
            "../../../../../packages/services/src/sync-apply/__fixtures__/cursor-compare.json"
        );
        let fixtures: FxCursorFile = serde_json::from_str(raw).expect("cursor-compare.json must parse");

        for c in &fixtures.bigint_greater_cases {
            assert_eq!(bigint_greater(&c.a, &c.b), c.expected, "bigintGreater — {}", c.name);
        }
        for c in &fixtures.max_cursor_cases {
            assert_eq!(max_cursor(&c.base, &c.versions), c.expected, "maxCursor — {}", c.name);
        }
        for c in &fixtures.select_next_cursor_cases {
            assert_eq!(
                select_next_cursor(&c.current, &c.response_cursor),
                c.expected,
                "selectNextCursor — {}",
                c.name
            );
        }
    }
}
