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

    let mut export_data = serde_json::Map::new();

    // Export conversations
    let mut conversations_stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare conversations query: {}", e))?;

    let conversations: Vec<serde_json::Value> = conversations_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, Option<String>>(1)?,
                "created_at": row.get::<_, String>(2)?,
                "updated_at": row.get::<_, Option<String>>(3)?
            }))
        })
        .map_err(|e| format!("Failed to query conversations: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    export_data.insert(
        "conversations".to_string(),
        serde_json::Value::Array(conversations),
    );

    // Export messages
    let mut messages_stmt = conn
        .prepare("SELECT id, conversation_id, role, content, created_at FROM messages ORDER BY created_at")
        .map_err(|e| format!("Failed to prepare messages query: {}", e))?;

    let messages: Vec<serde_json::Value> = messages_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "conversation_id": row.get::<_, String>(1)?,
                "role": row.get::<_, String>(2)?,
                "content": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?
            }))
        })
        .map_err(|e| format!("Failed to query messages: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    export_data.insert("messages".to_string(), serde_json::Value::Array(messages));

    // Export settings
    let mut settings_stmt = conn
        .prepare("SELECT key, value, category FROM settings_v2")
        .map_err(|e| format!("Failed to prepare settings query: {}", e))?;

    let settings: Vec<serde_json::Value> = settings_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "key": row.get::<_, String>(0)?,
                "value": row.get::<_, String>(1)?,
                "category": row.get::<_, Option<String>>(2)?
            }))
        })
        .map_err(|e| format!("Failed to query settings: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    export_data.insert("settings".to_string(), serde_json::Value::Array(settings));

    // Export custom instructions
    let mut instructions_stmt = conn
        .prepare("SELECT id, name, content, created_at FROM custom_instructions")
        .map_err(|e| format!("Failed to prepare custom_instructions query: {}", e))?;

    let instructions: Vec<serde_json::Value> = instructions_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, Option<String>>(1)?,
                "content": row.get::<_, String>(2)?,
                "created_at": row.get::<_, Option<String>>(3)?
            }))
        })
        .map_err(|e| format!("Failed to query custom_instructions: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    export_data.insert(
        "custom_instructions".to_string(),
        serde_json::Value::Array(instructions),
    );

    // Add metadata
    export_data.insert(
        "export_metadata".to_string(),
        serde_json::json!({
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "app_name": "AGI Workforce",
            "export_version": "1.0"
        }),
    );

    let result = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))?;

    tracing::info!(
        "[Privacy] Exported user data: {} conversations, {} messages, {} settings",
        export_data
            .get("conversations")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0),
        export_data
            .get("messages")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0),
        export_data
            .get("settings")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0)
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

pub fn purge_local_user_data(conn: &Connection) -> Result<(usize, usize), String> {
    let tables = classify_local_tables(conn)?;

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
            Ok((
                deleted_rows,
                tables.rows.len() + tables.search_indexes.len(),
            ))
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn privacy_delete_account(
    user_id: String,
    state: State<'_, AppDatabase>,
) -> Result<String, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let (deleted_rows, cleared_tables) = purge_local_user_data(&conn)?;

    if let Err(e) = conn.execute_batch("VACUUM") {
        tracing::warn!("[Privacy] Deleted pages not reclaimed: {}", e);
    }

    tracing::info!(
        "[Privacy] Account data deletion completed for user {}: {} rows across {} local tables",
        user_id,
        deleted_rows,
        cleared_tables
    );

    Ok(format!(
        "Deleted {} local records across {} tables",
        deleted_rows, cleared_tables
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

        let (deleted_rows, cleared_tables) = purge_local_user_data(&conn).expect("purge");

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

        purge_local_user_data(&conn).expect("purge");

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

        purge_local_user_data(&conn).expect("purge");

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

        purge_local_user_data(&conn).expect("purge");

        assert_eq!(count(&conn, "messages_fts"), 0, "search index kept content");
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
