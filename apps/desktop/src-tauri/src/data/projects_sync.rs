//! Desktop cloud projects sync engine (managed-cloud only).
//!
//! Delta-syncs the SQLite `projects` table with the managed-cloud
//! `/api/projects/sync` endpoint, mirroring the memory engine in `memory_sync.rs`.
//!
//! MANAGED-ONLY: every entry point is gated on a valid bearer token. The mint
//! hook (`mark_project_for_push`) guards on `app_mode = 'cloud'` so local/BYOK
//! projects can never acquire a cloud_id or have needs_push=1. The trust boundary
//! is the same as chat: `derive_cloud_sync_enabled` in `send_message_setup.rs`.
//!
//! Wire protocol (frozen — do NOT change the server):
//!   POST /api/projects/sync  { projects: [{ id, name, description?, instructions?,
//!                               color?, isArchived?, metadata?, createdAt?,
//!                               updatedAt, deletedAt? }] }
//!                          → { applied: [{ id, server_version }], cursor }
//!   GET  /api/projects/sync?since=<cursor>
//!                          → { projects: [{ id, name, description, instructions,
//!                               color, is_archived, metadata, created_at,
//!                               updated_at, deleted_at, server_version }],
//!                               cursor, hasMore }
//!
//! INTEGER PKs are never sent over the wire; the projects table uses TEXT PKs
//! (UUIDv7) so `cloud_id` == `id` for origin-device rows. Pull-inserted rows
//! use `cloud_id` as their local `id` (no surrogate needed, unlike memory).
//!
//! Column mapping (local ↔ wire):
//!   custom_instructions ↔ instructions   (name differs)
//!   metadata            ↔ metadata       (stored as JSON TEXT in local DB)
//!   is_archived INTEGER ↔ isArchived bool (converted both directions)
//!
//! Local-only columns NOT synced (per the frozen contract):
//!   files, conversation_ids, icon, icon_emoji, accent_color,
//!   default_privacy_mode, knowledge_base_files
//!
//! PUSH: `#[serde(skip_serializing_if = "Option::is_none")]` on ALL optional
//! fields. The server Zod schema uses `.optional()` (not `.nullable()`) for
//! description, instructions, color, isArchived, metadata, createdAt, deletedAt —
//! meaning `undefined` (key absent) is accepted but `null` (key present) fails
//! validation. Same camelCase + skip_serializing_if discipline as memory_sync.
//! Exception: `deletedAt` is `.nullable().optional()` on the server, so null is
//! technically accepted — but we still skip_if_none to stay consistent.

use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::Client;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{debug, warn};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Wire shapes — field names must match the server schema exactly.
// Push uses camelCase (PushProjectSchema in route.ts); pull returns snake_case.
// ---------------------------------------------------------------------------

/// Pushed project (camelCase, matching PushProjectSchema on server).
///
/// All optional fields carry `skip_serializing_if = "Option::is_none"` so serde
/// omits the key entirely rather than emitting `"field": null`. The server Zod
/// schema uses `.optional()` which rejects JSON `null` but accepts an absent key.
///
/// `updatedAt` is required (non-Option) per the Zod schema.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PushProject {
    id: String,              // cloud_id (UUIDv7, same as projects.id for origin rows)
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    instructions: Option<String>,  // maps to local custom_instructions
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_archived: Option<bool>,     // bool on wire, INTEGER 0/1 in local DB
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
    updated_at: String,            // required
    #[serde(skip_serializing_if = "Option::is_none")]
    deleted_at: Option<String>,    // tombstone timestamp (not a bool, unlike memory)
}

/// POST body.
#[derive(Debug, Serialize)]
struct ProjectPushBody {
    projects: Vec<PushProject>,
}

/// Ack for a single pushed project.
#[derive(Debug, Deserialize)]
struct AckedProject {
    id: String,
    server_version: String,
}

/// POST response.
#[derive(Debug, Deserialize)]
struct ProjectPushResponse {
    applied: Vec<AckedProject>,
    #[allow(dead_code)]
    cursor: Option<String>,
}

/// Pulled project delta (snake_case, matching server SELECT columns).
#[derive(Debug, Deserialize)]
struct ProjectDelta {
    id: String,
    name: String,
    description: Option<String>,
    instructions: Option<String>,
    color: Option<String>,
    is_archived: bool,
    metadata: Option<serde_json::Value>,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    server_version: String,
}

/// GET response.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPullResponse {
    projects: Vec<ProjectDelta>,
    cursor: Option<String>,
    has_more: bool,
}

// ---------------------------------------------------------------------------
// Outcome types.
// ---------------------------------------------------------------------------

/// Outcome of a full project push+pull cycle.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectSyncOutcome {
    pub projects_pushed: usize,
    pub projects_pulled: usize,
}

// ---------------------------------------------------------------------------
// Helpers — same bigint cursor logic as memory_sync and cloud_sync.
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
        return dt.with_timezone(&Utc).to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return dt.and_utc().to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%.f") {
        return dt.and_utc().to_rfc3339_opts(SecondsFormat::Millis, true);
    }
    warn!(raw_ts = s, "projects_sync: to_z_datetime: unparseable timestamp — using now_z()");
    now_z()
}

// ---------------------------------------------------------------------------
// Single-flight guard (separate from memory and chat guards).
// ---------------------------------------------------------------------------

static PROJECT_SYNC_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// DB cursor helpers — per-user project cursor in cloud_sync_state.project_cursor.
// ---------------------------------------------------------------------------

fn read_project_cursor(conn: &Connection, user_id: &str) -> String {
    conn.query_row(
        "SELECT COALESCE(project_cursor, '0') FROM cloud_sync_state WHERE user_id = ?1",
        params![user_id],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "0".to_string())
}

fn write_project_cursor(conn: &Connection, user_id: &str, cursor: &str) {
    let _ = conn.execute(
        "INSERT INTO cloud_sync_state (user_id, cursor, project_cursor, last_sync_at) \
         VALUES (?1, '0', ?2, ?3) \
         ON CONFLICT(user_id) DO UPDATE SET \
            project_cursor = excluded.project_cursor, \
            last_sync_at = excluded.last_sync_at",
        params![user_id, cursor, now_z()],
    );
}

// ---------------------------------------------------------------------------
// Identity minting.
// ---------------------------------------------------------------------------

/// Mint a UUIDv7 cloud_id for a newly-created cloud project and mark it for push.
/// Idempotent: COALESCE ensures a second call keeps the original cloud_id.
/// Guard: only runs when `app_mode = 'cloud'` — local/BYOK rows are never touched.
///
/// Note: for projects, `id` is a TEXT PK (UUIDv7). The cloud_id is stored separately
/// as the wire identity (which equals the local id for origin-device rows).
pub fn mark_project_for_push(conn: &Connection, project_id: &str) -> SqlResult<()> {
    let cloud_id = Uuid::now_v7().to_string();
    let now = now_z();
    conn.execute(
        "UPDATE projects \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             created_at_utc = COALESCE(created_at_utc, ?2), \
             needs_push = 1 \
         WHERE id = ?3 AND app_mode = 'cloud'",
        params![cloud_id, now, project_id],
    )?;
    Ok(())
}

/// Soft-delete a cloud project (sets deleted_at_utc + needs_push) instead of
/// hard-deleting, so the tombstone propagates to other devices.
/// Returns true if the row was soft-deleted (was a cloud row), false otherwise
/// (caller should fall through to hard-delete for local rows).
pub fn soft_delete_project_for_push(conn: &Connection, project_id: &str) -> SqlResult<bool> {
    let now = now_z();
    let cloud_id = Uuid::now_v7().to_string();
    let rows = conn.execute(
        "UPDATE projects \
         SET cloud_id = COALESCE(cloud_id, ?1), \
             deleted_at_utc = ?2, \
             needs_push = 1 \
         WHERE id = ?3 AND app_mode = 'cloud' AND deleted_at_utc IS NULL",
        params![cloud_id, now, project_id],
    )?;
    Ok(rows > 0)
}

// ---------------------------------------------------------------------------
// DB-only push helpers.
// ---------------------------------------------------------------------------

/// Gather cloud projects that need pushing (needs_push=1, app_mode='cloud').
/// Tombstoned rows (deleted_at_utc IS NOT NULL) are included so deletes propagate.
fn gather_push_projects(conn: &Connection) -> SqlResult<Vec<PushProject>> {
    let mut stmt = conn.prepare(
        "SELECT cloud_id, name, description, custom_instructions, color, is_archived, \
                metadata, created_at_utc, updated_at, deleted_at_utc \
         FROM projects \
         WHERE needs_push = 1 AND app_mode = 'cloud' AND cloud_id IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        let cloud_id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let description: Option<String> = row.get(2)?;
        let custom_instructions: Option<String> = row.get(3)?;
        let color: Option<String> = row.get(4)?;
        let is_archived_int: i64 = row.get(5)?;
        let metadata_json: Option<String> = row.get(6)?;
        let created_at_utc: Option<String> = row.get(7)?;
        let updated_at_raw: String = row.get(8)?;
        let deleted_at_utc: Option<String> = row.get(9)?;

        let updated_at = to_z_datetime(&updated_at_raw);
        let created_at = created_at_utc.as_deref().map(to_z_datetime);
        // is_archived: convert INTEGER 0/1 → bool; only emit when true (skip false via None trick)
        // The server accepts isArchived as optional; we emit it always as a bool.
        let is_archived = Some(is_archived_int != 0);
        // metadata: parse the JSON string back to a Value for the wire.
        let metadata: Option<serde_json::Value> = metadata_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());
        // deleted_at: emit the timestamp string when present (tombstone).
        let deleted_at = deleted_at_utc.as_deref().map(to_z_datetime);

        Ok(PushProject {
            id: cloud_id,
            name,
            description,
            instructions: custom_instructions,
            color,
            is_archived,
            metadata,
            created_at,
            updated_at,
            deleted_at,
        })
    })?;
    rows.collect()
}

/// Ack-clear: mark acked projects as needs_push=0 and store server_version.
fn ack_clear_projects(conn: &Connection, acked: &[AckedProject]) {
    for row in acked {
        let _ = conn.execute(
            "UPDATE projects SET needs_push = 0, server_version = ?1 \
             WHERE cloud_id = ?2",
            params![row.server_version, row.id],
        );
    }
}

// ---------------------------------------------------------------------------
// DB-only pull helpers.
// ---------------------------------------------------------------------------

/// Apply pulled project deltas into the local SQLite DB.
/// Per-row failures are logged and skipped so one bad row doesn't abort the page.
///
/// Dedup: match on `cloud_id` (not on `id`) so the origin device finds its own
/// row by cloud_id when pulling its own echo back.
///
/// For new rows from another device: `id = d.id` (the UUIDv7 cloud id) since
/// projects use TEXT PKs — no surrogate needed unlike memory's category+topic.
fn apply_project_deltas(conn: &Connection, deltas: &[ProjectDelta]) -> usize {
    let mut applied = 0usize;
    for d in deltas {
        // Dedup: find existing local row by cloud_id.
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM projects WHERE cloud_id = ?1",
                params![d.id],
                |row| row.get::<_, String>(0),
            )
            .ok();

        if d.deleted_at.is_some() {
            // Tombstone: soft-delete locally if we have the row.
            if let Some(local_id) = existing {
                let deleted_at = d.deleted_at.as_deref().map(to_z_datetime);
                let _ = conn.execute(
                    "UPDATE projects SET deleted_at_utc = ?1, server_version = ?2 \
                     WHERE id = ?3",
                    params![deleted_at, d.server_version, local_id],
                );
                applied += 1;
            }
            // If we don't have the row, the delete already propagated — no-op.
        } else if let Some(local_id) = existing {
            // LWW update: sync-able fields may change.
            let metadata_json: Option<String> =
                d.metadata.as_ref().and_then(|v| serde_json::to_string(v).ok());
            let is_archived_int = d.is_archived as i64;
            let _ = conn.execute(
                "UPDATE projects \
                 SET name = ?1, \
                     description = COALESCE(?2, description), \
                     custom_instructions = COALESCE(?3, custom_instructions), \
                     color = COALESCE(?4, color), \
                     is_archived = ?5, \
                     metadata = COALESCE(?6, metadata), \
                     server_version = ?7, \
                     needs_push = 0 \
                 WHERE id = ?8",
                params![
                    d.name,
                    d.description.as_deref(),
                    d.instructions.as_deref(),
                    d.color.as_deref(),
                    is_archived_int,
                    metadata_json.as_deref(),
                    d.server_version,
                    local_id
                ],
            );
            applied += 1;
        } else {
            // New row from another device — INSERT.
            // Use cloud id as the local TEXT PK (projects already use UUIDv7 PKs).
            let metadata_json: Option<String> =
                d.metadata.as_ref().and_then(|v| serde_json::to_string(v).ok());
            let is_archived_int = d.is_archived as i64;
            let created_at = to_z_datetime(&d.created_at);
            let updated_at = to_z_datetime(&d.updated_at);
            let r = conn.execute(
                "INSERT INTO projects \
                 (id, name, description, custom_instructions, files, conversation_ids, \
                  color, is_archived, metadata, created_at, updated_at, \
                  created_at_utc, server_version, needs_push, app_mode, cloud_id) \
                 VALUES (?1, ?2, ?3, ?4, '[]', '[]', ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 'cloud', ?1)",
                params![
                    d.id,           // id = cloud_id (TEXT PK)
                    d.name,
                    // description is NOT NULL DEFAULT '' — server may send null (nullable optional),
                    // so we must not bind NULL into a NOT NULL column.
                    d.description.as_deref().unwrap_or(""),
                    // custom_instructions mapped from wire `instructions` (NOT NULL DEFAULT '').
                    d.instructions.as_deref().unwrap_or(""),
                    d.color.as_deref(),
                    is_archived_int,
                    metadata_json.as_deref(),
                    created_at,
                    updated_at,
                    d.created_at,   // created_at_utc (raw from server)
                    d.server_version,
                ],
            );
            match r {
                Ok(_) => { applied += 1; }
                Err(e) => {
                    debug!(cloud_id = %d.id, error = %e, "projects_sync: skipping pulled project — insert failed");
                }
            }
        }
    }
    applied
}

/// Select the next cursor for the projects pull.
fn select_next_project_cursor(current: &str, resp_cursor: &Option<String>) -> String {
    match resp_cursor {
        Some(c) => max_cursor(current, std::slice::from_ref(c)),
        None => current.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Public async engine: sync_projects_now.
// ---------------------------------------------------------------------------

/// Push local cloud-mode project changes, then pull deltas from the server.
///
/// Single-flight: if a sync is already running the call returns immediately.
///
/// MANAGED-ONLY: the caller must supply a valid bearer token. An empty token
/// causes an immediate empty-outcome return (zero network I/O). The URL used
/// is `{base_url}/api/projects/sync`.
pub async fn sync_projects_now(
    db: &crate::sys::commands::chat::state::AppDatabase,
    user_id: &str,
    token: &str,
    base_url: &str,
) -> Result<ProjectSyncOutcome, String> {
    // Single-flight guard.
    if PROJECT_SYNC_IN_FLIGHT
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(ProjectSyncOutcome {
            projects_pushed: 0,
            projects_pulled: 0,
        });
    }

    let result = sync_projects_now_inner(db, user_id, token, base_url).await;
    PROJECT_SYNC_IN_FLIGHT.store(false, Ordering::Release);
    result
}

async fn sync_projects_now_inner(
    db: &crate::sys::commands::chat::state::AppDatabase,
    user_id: &str,
    token: &str,
    base_url: &str,
) -> Result<ProjectSyncOutcome, String> {
    // Fail-closed: never touch the network without a bearer token.
    if token.trim().is_empty() {
        return Ok(ProjectSyncOutcome {
            projects_pushed: 0,
            projects_pulled: 0,
        });
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("projects_sync: failed to build HTTP client: {e}"))?;

    let sync_url = format!("{}/api/projects/sync", base_url.trim_end_matches('/'));

    // ── PUSH ────────────────────────────────────────────────────────────────

    let push_projects = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        gather_push_projects(&conn)
            .map_err(|e| format!("projects_sync: gather push projects: {e}"))?
    };

    let n_pushed = push_projects.len();

    if n_pushed > 0 {
        let body = ProjectPushBody {
            projects: push_projects,
        };

        let resp = client
            .post(&sync_url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("projects_sync: push request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("projects_sync: push failed {status}: {text}"));
        }

        let push_resp: ProjectPushResponse = resp
            .json()
            .await
            .map_err(|e| format!("projects_sync: failed to parse push response: {e}"))?;

        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            ack_clear_projects(&conn, &push_resp.applied);
        }
    }

    // ── PULL ────────────────────────────────────────────────────────────────

    const PULL_PAGE_GUARD: usize = 50;
    let mut total_pulled = 0usize;

    let mut cursor = {
        let conn = db.connection().map_err(|e| e.to_string())?;
        read_project_cursor(&conn, user_id)
    };

    for _page in 0..PULL_PAGE_GUARD {
        let pull_url = format!(
            "{}?since={}",
            sync_url,
            urlencoding::encode(&cursor)
        );

        let resp = client
            .get(&pull_url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("projects_sync: pull request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("projects_sync: pull failed {status}: {text}"));
        }

        let pull_resp: ProjectPullResponse = resp
            .json()
            .await
            .map_err(|e| format!("projects_sync: failed to parse pull response: {e}"))?;

        let has_more = pull_resp.has_more;
        let new_cursor = select_next_project_cursor(&cursor, &pull_resp.cursor);

        {
            let conn = db.connection().map_err(|e| e.to_string())?;
            let applied = apply_project_deltas(&conn, &pull_resp.projects);
            total_pulled += applied;
            write_project_cursor(&conn, user_id, &new_cursor);
        }

        cursor = new_cursor;
        if !has_more {
            break;
        }
    }

    Ok(ProjectSyncOutcome {
        projects_pushed: n_pushed,
        projects_pulled: total_pulled,
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

    // ── Test 1: Migration v69 columns/indexes exist ──────────────────────────

    #[test]
    fn migration_v69_adds_project_sync_columns() {
        let conn = fresh_db();

        for col in [
            "app_mode",
            "cloud_id",
            "server_version",
            "created_at_utc",
            "deleted_at_utc",
            "needs_push",
            "metadata",
        ] {
            let exists: bool = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) > 0 FROM pragma_table_info('projects') WHERE name = '{}'",
                        col
                    ),
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            assert!(exists, "projects.{} should exist after v69", col);
        }

        // project_cursor column must exist on cloud_sync_state.
        let pc_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('cloud_sync_state') WHERE name = 'project_cursor'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);
        assert!(pc_exists, "cloud_sync_state.project_cursor must exist after v69");
    }

    // ── Test 2: Mint — sets cloud_id + needs_push on cloud project ────────────

    #[test]
    fn mint_sets_cloud_id_and_needs_push_for_cloud_project() {
        let conn = fresh_db();

        // Insert a cloud-mode project.
        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, app_mode, created_at, updated_at) \
             VALUES ('proj-1', 'Test Project', '', '', '[]', '[]', 0, 'cloud', \
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();

        mark_project_for_push(&conn, "proj-1").unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM projects WHERE id = 'proj-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_some(), "cloud_id must be set after mint");
        assert_eq!(needs_push, 1, "needs_push must be 1 after mint");
        let cid = cloud_id.unwrap();
        assert_eq!(cid.len(), 36, "cloud_id must be UUID format (36 chars)");
    }

    // ── Test 3: Local project never gets cloud_id ──────────────────────────────

    #[test]
    fn local_project_never_gets_cloud_id() {
        let conn = fresh_db();

        // Default app_mode is 'local'.
        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, created_at, updated_at) \
             VALUES ('proj-local', 'Local Project', '', '', '[]', '[]', 0, \
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();

        // mark_project_for_push guards on app_mode='cloud'; local row unaffected.
        mark_project_for_push(&conn, "proj-local").unwrap();

        let (cloud_id, needs_push): (Option<String>, i64) = conn
            .query_row(
                "SELECT cloud_id, needs_push FROM projects WHERE id = 'proj-local'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert!(cloud_id.is_none(), "local project MUST NOT get a cloud_id");
        assert_eq!(needs_push, 0, "local project MUST NOT get needs_push=1");

        // Push gather also excludes it.
        let push_projs = gather_push_projects(&conn).unwrap();
        assert_eq!(push_projs.len(), 0, "local project must not appear in push gather");
    }

    // ── Test 4: Push gather excludes local projects ───────────────────────────

    #[test]
    fn push_gather_excludes_local_projects() {
        let conn = fresh_db();

        // Cloud project.
        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, app_mode, created_at, updated_at) \
             VALUES ('proj-cloud', 'Cloud Project', '', '', '[]', '[]', 0, 'cloud', \
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        mark_project_for_push(&conn, "proj-cloud").unwrap();

        // Local project (default).
        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, created_at, updated_at) \
             VALUES ('proj-local2', 'Local Project 2', '', '', '[]', '[]', 0, \
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();

        let push_projs = gather_push_projects(&conn).unwrap();
        assert_eq!(push_projs.len(), 1, "only cloud project should be gathered for push");
    }

    // ── Test 5: Pull dedup updates not inserts on existing cloud_id ───────────

    #[test]
    fn pull_dedup_updates_not_inserts_on_existing_cloud_id() {
        let conn = fresh_db();

        // Create + mint a cloud project.
        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, app_mode, created_at, updated_at) \
             VALUES ('proj-dedup', 'Original Name', 'desc', 'instrs', '[]', '[]', 0, \
             'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        mark_project_for_push(&conn, "proj-dedup").unwrap();
        let cid: String = conn
            .query_row(
                "SELECT cloud_id FROM projects WHERE id = 'proj-dedup'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        // Pull delta for the same cloud_id (from another device).
        let delta = ProjectDelta {
            id: cid.clone(),
            name: "Updated Name".to_string(),
            description: Some("new desc".to_string()),
            instructions: Some("new instrs".to_string()),
            color: None,
            is_archived: false,
            metadata: None,
            created_at: "2026-06-20T00:00:00.000Z".to_string(),
            updated_at: "2026-06-22T00:00:00.000Z".to_string(),
            deleted_at: None,
            server_version: "100".to_string(),
        };

        apply_project_deltas(&conn, &[delta]);

        // Must have exactly one row (no duplicate).
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE cloud_id = ?1",
                params![cid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "DEDUP: must not insert a second row for the same cloud_id");

        // Name updated.
        let name: String = conn
            .query_row(
                "SELECT name FROM projects WHERE id = 'proj-dedup'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(name, "Updated Name");
    }

    // ── Test 6: Tombstone soft-deletes ────────────────────────────────────────

    #[test]
    fn pull_tombstone_soft_deletes_project() {
        let conn = fresh_db();

        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, app_mode, created_at, updated_at) \
             VALUES ('proj-tomb', 'To Delete', '', '', '[]', '[]', 0, 'cloud', \
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let cloud_id_val = "tombstone-proj-uuid-1";
        conn.execute(
            "UPDATE projects SET cloud_id = ?1 WHERE id = 'proj-tomb'",
            params![cloud_id_val],
        )
        .unwrap();

        let delta = ProjectDelta {
            id: cloud_id_val.to_string(),
            name: "To Delete".to_string(),
            description: None,
            instructions: None,
            color: None,
            is_archived: false,
            metadata: None,
            created_at: "2026-06-20T00:00:00.000Z".to_string(),
            updated_at: "2026-06-22T01:00:00.000Z".to_string(),
            deleted_at: Some("2026-06-22T01:00:00.000Z".to_string()),
            server_version: "200".to_string(),
        };

        apply_project_deltas(&conn, &[delta]);

        // Row still exists (soft delete).
        let (still_exists, deleted_at_utc): (i64, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), deleted_at_utc FROM projects WHERE id = 'proj-tomb'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(still_exists, 1, "tombstone must NOT hard-delete the row");
        assert!(deleted_at_utc.is_some(), "tombstone must set deleted_at_utc");
    }

    // ── Test 7: Pull INSERT new row — null description/instructions must land ──
    //
    // Core cross-device scenario: device B pulls a project it has never seen.
    // Server may send description: null (the Zod type is `string | null`).
    // The local schema is `description TEXT NOT NULL DEFAULT ''`, so binding
    // SQL NULL would violate the constraint and silently drop the row.
    // After the fix (`.unwrap_or("")`) the row must be inserted and both
    // nullable-on-wire / NOT NULL-locally fields read back as "".

    #[test]
    fn pull_insert_new_row_with_null_description_and_instructions() {
        let conn = fresh_db();

        // Verify no rows with this cloud_id exist yet.
        let count_before: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE cloud_id = 'new-cloud-uuid-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_before, 0, "precondition: row must not exist before pull");

        let delta = ProjectDelta {
            id: "new-cloud-uuid-1".to_string(),
            name: "Remote Project".to_string(),
            description: None,        // server sends null — must not 500 on NOT NULL column
            instructions: None,       // same
            color: None,
            is_archived: false,
            metadata: None,
            created_at: "2026-06-21T00:00:00.000Z".to_string(),
            updated_at: "2026-06-22T00:00:00.000Z".to_string(),
            deleted_at: None,
            server_version: "77".to_string(),
        };

        apply_project_deltas(&conn, &[delta]);

        // Row must now exist (1 row).
        let (row_count, description, instructions): (i64, String, String) = conn
            .query_row(
                "SELECT COUNT(*), description, custom_instructions \
                 FROM projects WHERE cloud_id = 'new-cloud-uuid-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .expect("row must be present after cross-device pull INSERT");
        assert_eq!(row_count, 1, "INSERT must create exactly one row");
        assert_eq!(description, "", "null description must land as empty string");
        assert_eq!(instructions, "", "null instructions must land as empty string");
    }

    // ── Test 8: Cursor advances ─────── (was 7; renumbered after INSERT test) ──

    #[test]
    fn project_cursor_persists_and_advances() {
        let conn = fresh_db();
        write_project_cursor(&conn, "u1", "42");
        assert_eq!(read_project_cursor(&conn, "u1"), "42");

        write_project_cursor(&conn, "u1", "100");
        assert_eq!(read_project_cursor(&conn, "u1"), "100");
    }

    #[test]
    fn select_next_project_cursor_trusts_server_cursor() {
        assert_eq!(select_next_project_cursor("0", &Some("10".to_string())), "10");
        // Never moves backwards.
        assert_eq!(select_next_project_cursor("50", &Some("10".to_string())), "50");
        // No cursor → hold position.
        assert_eq!(select_next_project_cursor("7", &None), "7");
    }

    // ── Test 10: Push wire shape — camelCase + omit None fields ──────────────
    //
    // Zod schema: description/instructions/color/isArchived/metadata/createdAt
    //             all `.optional()` or `.nullable().optional()`.
    //
    // When None, serde MUST omit the key entirely (skip_serializing_if).
    // Emitting `null` would fail Zod .optional() and 400 the push.

    #[test]
    fn push_body_serializes_to_camelcase_schema() {
        // Case A: normal project — most optional fields absent.
        let body_normal = ProjectPushBody {
            projects: vec![PushProject {
                id: "p1".into(),
                name: "My Project".into(),
                description: None,
                instructions: None,
                color: None,
                is_archived: Some(false),
                metadata: None,
                created_at: None,
                updated_at: "2026-06-22T00:00:00.000Z".into(),
                deleted_at: None,
            }],
        };
        let v_normal = serde_json::to_value(&body_normal).unwrap();
        let p_normal = &v_normal["projects"][0];

        // Required fields present.
        assert!(p_normal.get("updatedAt").is_some(), "updatedAt must be present");
        assert_eq!(p_normal["id"], "p1");
        assert_eq!(p_normal["name"], "My Project");

        // None fields must be ABSENT (skip_serializing_if).
        assert!(p_normal.get("description").is_none(), "description must be absent when None");
        assert!(p_normal.get("instructions").is_none(), "instructions must be absent when None");
        assert!(p_normal.get("color").is_none(), "color must be absent when None");
        assert!(p_normal.get("metadata").is_none(), "metadata must be absent when None");
        assert!(p_normal.get("createdAt").is_none(), "createdAt must be absent when None");
        assert!(p_normal.get("deletedAt").is_none(), "deletedAt must be absent when None");

        // snake_case keys must never appear.
        assert!(p_normal.get("is_archived").is_none(), "must not emit is_archived (snake)");
        assert!(p_normal.get("created_at").is_none(), "must not emit created_at (snake)");
        assert!(p_normal.get("deleted_at").is_none(), "must not emit deleted_at (snake)");

        // user_id must not be in push body.
        assert!(p_normal.get("userId").is_none() && p_normal.get("user_id").is_none());

        // Case B: tombstone — deletedAt must be present as a timestamp string.
        let body_tombstone = ProjectPushBody {
            projects: vec![PushProject {
                id: "p2".into(),
                name: "Deleted Project".into(),
                description: Some("was a project".into()),
                instructions: None,
                color: None,
                is_archived: Some(false),
                metadata: None,
                created_at: Some("2026-06-20T00:00:00.000Z".into()),
                updated_at: "2026-06-22T01:00:00.000Z".into(),
                deleted_at: Some("2026-06-22T01:00:00.000Z".into()),
            }],
        };
        let v_tomb = serde_json::to_value(&body_tombstone).unwrap();
        let p_tomb = &v_tomb["projects"][0];

        // deletedAt must be a string (not bool, not null).
        assert!(
            p_tomb.get("deletedAt").and_then(|v| v.as_str()).is_some(),
            "tombstone must emit deletedAt as a timestamp string"
        );
        assert!(
            p_tomb.get("createdAt").is_some(),
            "createdAt must be present when Some"
        );
        assert!(
            p_tomb.get("description").is_some(),
            "description must be present when Some"
        );
        // instructions absent when None.
        assert!(p_tomb.get("instructions").is_none());
    }

    // ── Test 9: Ack-clear ────────────────────────────────────────────────────

    #[test]
    fn ack_clear_marks_projects_clean() {
        let conn = fresh_db();

        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, files, \
             conversation_ids, is_archived, app_mode, created_at, updated_at) \
             VALUES ('proj-ack', 'Ack Project', '', '', '[]', '[]', 0, 'cloud', \
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        mark_project_for_push(&conn, "proj-ack").unwrap();
        let cid: String = conn
            .query_row("SELECT cloud_id FROM projects WHERE id = 'proj-ack'", [], |r| r.get(0))
            .unwrap();

        let acked = vec![AckedProject { id: cid.clone(), server_version: "99".to_string() }];
        ack_clear_projects(&conn, &acked);

        let (needs_push, sv): (i64, Option<String>) = conn
            .query_row(
                "SELECT needs_push, server_version FROM projects WHERE id = 'proj-ack'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(needs_push, 0, "needs_push must be 0 after ack");
        assert_eq!(sv.as_deref(), Some("99"), "server_version must be set from ack");
    }

    // ── Test 11: Token-empty gate (no network egress) ────────────────────────

    #[tokio::test]
    async fn sync_projects_no_egress_without_token() {
        use crate::sys::commands::chat::state::AppDatabase;
        let db_inner = crate::data::db::Database::in_memory().unwrap();
        let db = AppDatabase {
            conn: std::sync::Arc::clone(&db_inner.get_connection()),
        };
        {
            let conn = db.connection().unwrap();
            conn.execute(
                "INSERT INTO projects (id, name, description, custom_instructions, files, \
                 conversation_ids, is_archived, app_mode, created_at, updated_at) \
                 VALUES ('proj-tok', 'Token Test', '', '', '[]', '[]', 0, 'cloud', \
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [],
            )
            .unwrap();
            mark_project_for_push(&conn, "proj-tok").unwrap();
        }

        let outcome = sync_projects_now_inner(&db, "u1", "  ", "http://127.0.0.1:1/")
            .await
            .expect("empty-token sync must return Ok(empty), not attempt the network");
        assert_eq!(outcome.projects_pushed, 0);
        assert_eq!(outcome.projects_pulled, 0);

        // Dirty flag must remain (no push happened).
        let conn = db.connection().unwrap();
        let needs_push: i64 = conn
            .query_row(
                "SELECT needs_push FROM projects WHERE id='proj-tok'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(needs_push, 1, "no push happened, dirty flag must be untouched");
    }
}
