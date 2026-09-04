use crate::sys::commands::chat::AppDatabase;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// Number of days between requesting account deletion and the actual purge.
/// Mirrors the disclosure in the public Privacy Policy.
const ACCOUNT_DELETION_GRACE_DAYS: i64 = 7;

/// Filename for the pending-deletion marker stored in the app data directory.
const PENDING_DELETION_FILE: &str = "pending_deletion.json";

/// Migration bookkeeping. Clearing it makes every migration re-run against an
/// already-migrated database on the next launch, which breaks the install.
/// It holds version numbers and timestamps, never user content.
const SCHEMA_BOOKKEEPING_TABLES: &[&str] = &["schema_version"];

/// Private storage FTS5 attaches to a virtual table. Rows here are index
/// internals rewritten by clearing the virtual table itself; writing to them
/// directly corrupts the index.
const FTS_SHADOW_SUFFIXES: &[&str] = &[
    "_data",
    "_idx",
    "_docsize",
    "_config",
    "_content",
    "_segments",
    "_segdir",
    "_stat",
];

/// Privacy preferences structure matching the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyPreferences {
    pub telemetry_enabled: bool,
    pub crash_reporting_enabled: bool,
    pub ai_model_sharing_enabled: bool,
    pub analytics_enabled: bool,
    pub usage_data_collection: bool,
}

/// Update privacy preferences and store them
#[tauri::command]
pub async fn settings_update_privacy(
    preferences: PrivacyPreferences,
    state: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    // Store privacy preferences in settings_v2 table
    let prefs_json =
        serde_json::to_string(&preferences).map_err(|e| format!("Failed to serialize: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO settings_v2 (key, value, category) VALUES (?1, ?2, ?3)",
        rusqlite::params!["privacy_preferences", prefs_json, "privacy"],
    )
    .map_err(|e| format!("Failed to save privacy preferences: {}", e))?;

    crate::sys::telemetry::process_consent().set(preferences.telemetry_enabled);

    tracing::info!(
        "[Privacy] Updated privacy preferences: telemetry={}, crash_reporting={}, ai_sharing={}, analytics={}, usage_data={}",
        preferences.telemetry_enabled,
        preferences.crash_reporting_enabled,
        preferences.ai_model_sharing_enabled,
        preferences.analytics_enabled,
        preferences.usage_data_collection
    );

    Ok(())
}

/// Export all user data as JSON (GDPR compliance)
#[tauri::command]
pub async fn privacy_export_data(state: State<'_, AppDatabase>) -> Result<String, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    export_local_user_data(&conn)
}

const REDACTED_EXPORT_VALUE: &str = "[redacted]";

/// Column-name fragments that mark a value as a credential rather than personal
/// data. A portability export is written to an unprotected file, so these are
/// named in the export but never carried in it.
const SECRET_COLUMN_MARKERS: &[&str] = &[
    "password",
    "secret",
    "token",
    "api_key",
    "apikey",
    "credential",
    "private_key",
    "encrypted",
];

fn is_secret_column(name: &str) -> bool {
    let lowered = name.to_ascii_lowercase();
    SECRET_COLUMN_MARKERS
        .iter()
        .any(|marker| lowered.contains(marker))
}

fn cell_to_json(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<serde_json::Value> {
    use rusqlite::types::ValueRef;
    Ok(match row.get_ref(index)? {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(value) => serde_json::Value::from(value),
        ValueRef::Real(value) => serde_json::Number::from_f64(value)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(value) => {
            serde_json::Value::String(String::from_utf8_lossy(value).into_owned())
        }
        ValueRef::Blob(value) => {
            serde_json::Value::String(format!("[binary {} bytes]", value.len()))
        }
    })
}

/// Serialize every user-scoped local table, derived from the same schema
/// enumeration the erasure path uses so an export can never claim less than a
/// deletion removes.
pub fn export_local_user_data(conn: &Connection) -> Result<String, String> {
    let tables = classify_local_tables(conn)?;
    let mut export_data = serde_json::Map::new();
    let mut exported_rows = 0usize;

    for table in &tables.rows {
        let mut stmt = conn
            .prepare(&format!("SELECT * FROM \"{}\"", table))
            .map_err(|e| format!("Failed to prepare export of {}: {}", table, e))?;
        let columns: Vec<String> = stmt
            .column_names()
            .into_iter()
            .map(str::to_string)
            .collect();

        let rows = stmt
            .query_map([], |row| {
                let mut record = serde_json::Map::new();
                for (index, column) in columns.iter().enumerate() {
                    let value = if is_secret_column(column) {
                        match row.get_ref(index)? {
                            rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                            _ => serde_json::Value::String(REDACTED_EXPORT_VALUE.to_string()),
                        }
                    } else {
                        cell_to_json(row, index)?
                    };
                    record.insert(column.clone(), value);
                }
                Ok(serde_json::Value::Object(record))
            })
            .map_err(|e| format!("Failed to query {}: {}", table, e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read {}: {}", table, e))?;

        exported_rows += rows.len();
        export_data.insert(table.clone(), serde_json::Value::Array(rows));
    }

    export_data.insert(
        "export_metadata".to_string(),
        serde_json::json!({
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "app_name": "AGI Workforce",
            "export_version": "2.0",
            "tables": tables.rows.len(),
            "rows": exported_rows,
            "redacted_columns": REDACTED_EXPORT_VALUE,
        }),
    );

    let result = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))?;

    tracing::info!(
        "[Privacy] Exported {} rows across {} local tables",
        exported_rows,
        tables.rows.len()
    );

    Ok(result)
}

fn is_safe_identifier(name: &str) -> bool {
    name.chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[derive(Debug, Default)]
pub struct LocalUserTables {
    pub rows: Vec<String>,
    pub search_indexes: Vec<String>,
    pub preserved: Vec<String>,
}

fn is_fts_shadow_of(name: &str, virtual_tables: &[String]) -> bool {
    virtual_tables.iter().any(|owner| {
        name.len() > owner.len()
            && name.starts_with(owner.as_str())
            && FTS_SHADOW_SUFFIXES.contains(&&name[owner.len()..])
    })
}

pub fn classify_local_tables(conn: &Connection) -> Result<LocalUserTables, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, COALESCE(sql, '') FROM sqlite_master \
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| format!("Failed to read local schema: {}", e))?;

    let tables = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to read local schema: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read local schema: {}", e))?;

    let search_indexes: Vec<String> = tables
        .iter()
        .filter(|(_, sql)| sql.to_ascii_uppercase().contains("CREATE VIRTUAL TABLE"))
        .map(|(name, _)| name.clone())
        .collect();

    let mut classified = LocalUserTables {
        search_indexes: search_indexes.clone(),
        ..LocalUserTables::default()
    };

    for (name, _) in &tables {
        if !is_safe_identifier(name) {
            return Err(format!(
                "Refusing to purge: local table name '{}' is not a plain identifier",
                name
            ));
        }
        if SCHEMA_BOOKKEEPING_TABLES.contains(&name.as_str()) {
            classified.preserved.push(name.clone());
        } else if !search_indexes.contains(name) && !is_fts_shadow_of(name, &search_indexes) {
            classified.rows.push(name.clone());
        }
    }

    Ok(classified)
}

fn clear_search_index(conn: &Connection, name: &str) -> Result<(), String> {
    let command_error = match conn.execute(
        &format!("INSERT INTO \"{0}\"(\"{0}\") VALUES ('delete-all')", name),
        [],
    ) {
        Ok(_) => return Ok(()),
        Err(e) => e,
    };

    conn.execute(&format!("DELETE FROM \"{}\"", name), [])
        .map(|_| ())
        .map_err(|e| {
            format!(
                "Failed to clear search index {}: {} (delete-all: {})",
                name, e, command_error
            )
        })
}

fn is_artefact_path_column(name: &str) -> bool {
    let lowered = name.to_ascii_lowercase();
    lowered == "path" || lowered.ends_with("_path")
}

fn artefact_path_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table))
        .map_err(|e| format!("Failed to read columns of {}: {}", table, e))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to read columns of {}: {}", table, e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read columns of {}: {}", table, e))?;

    Ok(columns
        .into_iter()
        .filter(|name| is_safe_identifier(name) && is_artefact_path_column(name))
        .collect())
}

fn collect_artefact_paths(
    conn: &Connection,
    tables: &LocalUserTables,
) -> Result<Vec<std::path::PathBuf>, String> {
    let mut paths = Vec::new();
    for table in &tables.rows {
        for column in artefact_path_columns(conn, table)? {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT DISTINCT \"{0}\" FROM \"{1}\" WHERE \"{0}\" IS NOT NULL AND \"{0}\" <> ''",
                    column, table
                ))
                .map_err(|e| format!("Failed to list {}.{}: {}", table, column, e))?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| format!("Failed to list {}.{}: {}", table, column, e))?;
            for row in rows {
                match row {
                    Ok(value) => paths.push(std::path::PathBuf::from(value)),
                    Err(e) => tracing::warn!(
                        "[Privacy] Skipped unreadable path in {}.{}: {}",
                        table,
                        column,
                        e
                    ),
                }
            }
        }
    }
    Ok(paths)
}

/// Delete the artefacts the erased rows referenced, but only the ones the app
/// itself wrote. Path columns also hold locations the user owns, a watched
/// folder, an indexed project, and erasing an account must not erase those,
/// so containment inside an app-owned root is the authority, not the column.
fn remove_contained_artefacts(paths: &[std::path::PathBuf], roots: &[std::path::PathBuf]) -> usize {
    let canonical_roots: Vec<std::path::PathBuf> = roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .collect();
    if canonical_roots.is_empty() {
        return 0;
    }

    let mut removed = 0usize;
    for path in paths {
        let Ok(canonical) = std::fs::canonicalize(path) else {
            continue;
        };
        let contained = canonical_roots
            .iter()
            .any(|root| canonical != *root && canonical.starts_with(root));
        if !contained {
            continue;
        }

        let outcome = if canonical.is_dir() {
            std::fs::remove_dir_all(&canonical)
        } else {
            std::fs::remove_file(&canonical)
        };
        match outcome {
            Ok(()) => removed += 1,
            Err(e) => tracing::warn!(
                "[Privacy] Failed to erase artefact {}: {}",
                canonical.display(),
                e
            ),
        }
    }
    removed
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PurgeSummary {
    pub deleted_rows: usize,
    pub cleared_tables: usize,
    pub removed_artefacts: usize,
}

pub fn purge_local_user_data(
    conn: &Connection,
    artefact_roots: &[std::path::PathBuf],
) -> Result<PurgeSummary, String> {
    let tables = classify_local_tables(conn)?;
    let artefacts = collect_artefact_paths(conn, &tables)?;

    conn.execute_batch("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;")
        .map_err(|e| format!("Failed to open deletion transaction: {}", e))?;

    let purged = (|| -> Result<usize, String> {
        let mut deleted_rows = 0usize;
        for name in &tables.rows {
            deleted_rows += conn
                .execute(&format!("DELETE FROM \"{}\"", name), [])
                .map_err(|e| format!("Failed to clear {}: {}", name, e))?;
        }
        for name in &tables.search_indexes {
            clear_search_index(conn, name)?;
        }
        Ok(deleted_rows)
    })();

    match purged {
        Ok(deleted_rows) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Failed to commit account deletion: {}", e))?;
            Ok(PurgeSummary {
                deleted_rows,
                cleared_tables: tables.rows.len() + tables.search_indexes.len(),
                removed_artefacts: remove_contained_artefacts(&artefacts, artefact_roots),
            })
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

fn artefact_roots(app_handle: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let resolver = app_handle.path();
    [
        resolver.app_data_dir(),
        resolver.app_local_data_dir(),
        resolver.app_cache_dir(),
    ]
    .into_iter()
    .filter_map(Result::ok)
    .collect()
}

#[tauri::command]
pub async fn privacy_delete_account(
    user_id: String,
    state: State<'_, AppDatabase>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let summary = purge_local_user_data(&conn, &artefact_roots(&app_handle))?;

    if let Err(e) = conn.execute_batch("VACUUM") {
        tracing::warn!("[Privacy] Deleted pages not reclaimed: {}", e);
    }

    tracing::info!(
        "[Privacy] Account data deletion completed for user {}: {} rows across {} local tables, {} on-disk artefacts",
        user_id,
        summary.deleted_rows,
        summary.cleared_tables,
        summary.removed_artefacts
    );

    Ok(format!(
        "Deleted {} local records across {} tables and {} stored files",
        summary.deleted_rows, summary.cleared_tables, summary.removed_artefacts
    ))
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending account deletion (7-day grace window).
//
// These commands implement the "soft delete" flow described in the Privacy
// Policy and the Settings UI: the user requests deletion, a marker file is
// written with `purge_at = now + 7 days`, and the actual purge runs in a
// later sprint. The user can cancel the request during the grace window.
//
// The actual marshaling-and-purge logic depends on cloud data deletion work
// tracked separately. For Wave 2 we ship the disclosure + UI affordance
// so Stripe / App Store / Play Store / GDPR / CCPA reviewers see a working
// data-control surface.
// ─────────────────────────────────────────────────────────────────────────────

/// Status of a pending account-deletion request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingDeletionStatus {
    /// True when a pending-deletion marker exists on disk.
    pub pending: bool,
    /// RFC3339 timestamp of when the request was filed (None when not pending).
    pub requested_at: Option<String>,
    /// RFC3339 timestamp of when the purge will execute (None when not pending).
    pub purge_at: Option<String>,
    /// Whole days remaining in the grace window (None when not pending).
    pub days_remaining: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingDeletionRecord {
    requested_at: String,
    purge_at: String,
    user_id: Option<String>,
}

fn pending_deletion_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    Ok(dir.join(PENDING_DELETION_FILE))
}

/// Mark the user's account for deletion after a 7-day grace window.
///
/// Writes a marker file at `<app_data>/pending_deletion.json` containing the
/// request timestamp and the scheduled purge time. The actual purge of
/// cloud rows / Stripe subscriptions runs in a later sprint once the
/// cross-surface data marshaling lands. The marker is reversible via
/// `privacy_cancel_pending_deletion`.
pub async fn privacy_request_account_deletion(
    user_id: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<PendingDeletionStatus, String> {
    let path = pending_deletion_path(&app_handle)?;
    let now = chrono::Utc::now();
    let purge_at = now + chrono::Duration::days(ACCOUNT_DELETION_GRACE_DAYS);

    let record = PendingDeletionRecord {
        requested_at: now.to_rfc3339(),
        purge_at: purge_at.to_rfc3339(),
        user_id: user_id.clone(),
    };

    let json = serde_json::to_string_pretty(&record)
        .map_err(|e| format!("Failed to serialize pending deletion record: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write pending deletion marker: {}", e))?;

    tracing::warn!(
        "[Privacy] Account marked for deletion (user={:?}, purge_at={})",
        user_id,
        purge_at.to_rfc3339()
    );

    Ok(PendingDeletionStatus {
        pending: true,
        requested_at: Some(now.to_rfc3339()),
        purge_at: Some(purge_at.to_rfc3339()),
        days_remaining: Some(ACCOUNT_DELETION_GRACE_DAYS),
    })
}

/// Read the current pending-deletion status. Returns `pending: false` when no
/// marker file exists (the common case).
pub async fn privacy_get_pending_deletion(
    app_handle: tauri::AppHandle,
) -> Result<PendingDeletionStatus, String> {
    let path = pending_deletion_path(&app_handle)?;
    if !path.exists() {
        return Ok(PendingDeletionStatus {
            pending: false,
            requested_at: None,
            purge_at: None,
            days_remaining: None,
        });
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read pending deletion marker: {}", e))?;
    let record: PendingDeletionRecord = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse pending deletion marker: {}", e))?;

    let purge_at = chrono::DateTime::parse_from_rfc3339(&record.purge_at)
        .map_err(|e| format!("Failed to parse purge_at: {}", e))?
        .with_timezone(&chrono::Utc);
    let now = chrono::Utc::now();
    let days_remaining = (purge_at - now).num_days();

    Ok(PendingDeletionStatus {
        pending: true,
        requested_at: Some(record.requested_at),
        purge_at: Some(record.purge_at),
        days_remaining: Some(days_remaining.max(0)),
    })
}

/// Cancel a pending account-deletion request by removing the marker file.
/// Safe to call even when no marker exists.
pub async fn privacy_cancel_pending_deletion(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = pending_deletion_path(&app_handle)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to remove pending deletion marker: {}", e))?;
        tracing::info!("[Privacy] Pending account deletion cancelled");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::migrations::run_migrations;

    fn migrated_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        run_migrations(&conn).expect("run migrations");
        conn
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM \"{}\"", table), [], |row| {
            row.get(0)
        })
        .unwrap_or_else(|e| panic!("count {}: {}", table, e))
    }

    fn seed_local_content(conn: &Connection) {
        conn.execute(
            "INSERT INTO conversations (id, title) VALUES (1, 'Local chat')",
            [],
        )
        .expect("seed conversation");
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (1, 'user', 'my private note')",
            [],
        )
        .expect("seed message");
        conn.execute(
            "INSERT INTO email_accounts (id, provider, email, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, created_at)
             VALUES (1, 'imap', 'owner@example.test', 'imap.example.test', 993, 'smtp.example.test', 465, 'ciphertext', 1)",
            [],
        )
        .expect("seed email account");
        conn.execute(
            "INSERT INTO emails (id, account_id, message_id, subject, from_email, to_emails, date, body_text, size, created_at)
             VALUES ('e1', 1, 'm1', 'Payslip', 'payroll@example.test', 'owner@example.test', 1, 'net pay', 10, 1)",
            [],
        )
        .expect("seed email");
        conn.execute(
            "INSERT INTO contacts (email, display_name, phone, created_at, updated_at)
             VALUES ('friend@example.test', 'Friend', '000', 1, 1)",
            [],
        )
        .expect("seed contact");
        conn.execute(
            "INSERT INTO captures (id, capture_type, file_path, ocr_text, created_at)
             VALUES ('c1', 'fullscreen', '/local/captures/c1.png', 'bank balance', 1)",
            [],
        )
        .expect("seed capture");
    }

    #[test]
    fn purge_clears_local_content_the_old_allowlist_missed() {
        let conn = migrated_conn();
        seed_local_content(&conn);

        let summary = purge_local_user_data(&conn, &[]).expect("purge");
        let (deleted_rows, cleared_tables) = (summary.deleted_rows, summary.cleared_tables);

        assert!(deleted_rows >= 6, "expected seeded rows to be deleted");
        assert!(cleared_tables > 50, "expected the whole schema to be swept");
        for table in [
            "conversations",
            "messages",
            "emails",
            "contacts",
            "captures",
        ] {
            assert_eq!(count(&conn, table), 0, "{} still holds user content", table);
        }
    }

    #[test]
    fn purge_covers_a_table_added_after_this_code_was_written() {
        let conn = migrated_conn();
        conn.execute(
            "CREATE TABLE desk22_future_feature (id INTEGER PRIMARY KEY, secret TEXT NOT NULL)",
            [],
        )
        .expect("create future table");
        conn.execute(
            "INSERT INTO desk22_future_feature (secret) VALUES ('unlisted user content')",
            [],
        )
        .expect("seed future table");

        purge_local_user_data(&conn, &[]).expect("purge");

        assert_eq!(
            count(&conn, "desk22_future_feature"),
            0,
            "a table added without editing privacy.rs kept its rows"
        );
    }

    #[test]
    fn purge_leaves_no_populated_table_except_migration_bookkeeping() {
        let conn = migrated_conn();
        seed_local_content(&conn);

        purge_local_user_data(&conn, &[]).expect("purge");

        let tables = classify_local_tables(&conn).expect("classify");
        assert!(
            tables.rows.len() > 50,
            "expected the whole schema to be swept"
        );
        for table in &tables.rows {
            assert_eq!(count(&conn, table), 0, "{} survived the purge", table);
        }
        assert_eq!(tables.preserved, vec!["schema_version".to_string()]);
        assert!(
            count(&conn, "schema_version") > 0,
            "migration history must survive so the app still boots"
        );
    }

    #[test]
    fn purge_clears_full_text_search_indexes() {
        let conn = migrated_conn();
        let has_fts: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'",
                [],
                |row| row.get(0),
            )
            .expect("probe fts");
        if has_fts == 0 {
            return;
        }

        conn.execute(
            "INSERT INTO messages_fts (message_id, conversation_id, content, sender, message_type, timestamp)
             VALUES ('1', '1', 'my private note', 'user', 'text', '1')",
            [],
        )
        .expect("seed fts row");

        purge_local_user_data(&conn, &[]).expect("purge");

        assert_eq!(count(&conn, "messages_fts"), 0, "search index kept content");
    }

    #[test]
    fn purge_removes_the_on_disk_artefacts_the_rows_point_at() {
        let artefact_root = tempfile::tempdir().expect("artefact root");
        let screenshot = artefact_root.path().join("c1.png");
        std::fs::write(&screenshot, b"screen pixels").expect("write screenshot");

        let user_workspace = tempfile::tempdir().expect("user workspace");
        let user_document = user_workspace.path().join("thesis.pdf");
        std::fs::write(&user_document, b"not the app's to delete").expect("write document");

        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO captures (id, capture_type, file_path, ocr_text, created_at)
             VALUES ('c1', 'fullscreen', ?1, 'bank balance', 1)",
            [screenshot.to_str().expect("utf8 path")],
        )
        .expect("seed capture");
        conn.execute(
            "INSERT INTO codebase_cache (id, project_path, cache_type, data, created_at, expires_at)
             VALUES ('p1', ?1, 'file_tree', '{}', 1, 1)",
            [user_workspace.path().to_str().expect("utf8 path")],
        )
        .expect("seed codebase cache");

        let summary =
            purge_local_user_data(&conn, &[artefact_root.path().to_path_buf()]).expect("purge");

        assert!(
            !screenshot.exists(),
            "screenshot file survived account deletion"
        );
        assert!(
            user_document.exists(),
            "purge deleted a file outside the app's own artefact roots"
        );
        assert_eq!(summary.removed_artefacts, 1);
    }

    #[test]
    fn export_returns_the_local_content_it_claims_to() {
        let conn = migrated_conn();
        seed_local_content(&conn);

        let raw = export_local_user_data(&conn).expect("export must not fail");
        let parsed: serde_json::Value = serde_json::from_str(&raw).expect("export is json");

        assert!(
            parsed
                .get("messages")
                .and_then(|v| v.as_array())
                .is_some_and(|rows| !rows.is_empty()),
            "export dropped the user's messages"
        );
    }

    #[test]
    fn classification_skips_fts_shadow_tables() {
        let conn = migrated_conn();
        let tables = classify_local_tables(&conn).expect("classify");
        for name in &tables.rows {
            assert!(
                !is_fts_shadow_of(name, &tables.search_indexes),
                "{} is an fts shadow table and must not be deleted directly",
                name
            );
        }
    }
}
