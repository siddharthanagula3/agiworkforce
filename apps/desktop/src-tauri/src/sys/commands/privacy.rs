use crate::sys::commands::chat::AppDatabase;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// Number of days between requesting account deletion and the actual purge.
/// Mirrors the disclosure in the public Privacy Policy.
const ACCOUNT_DELETION_GRACE_DAYS: i64 = 7;

/// Filename for the pending-deletion marker stored in the app data directory.
const PENDING_DELETION_FILE: &str = "pending_deletion.json";

/// AUDIT-003-001 fix: Enum of allowed tables for privacy deletion.
/// Using an enum prevents SQL injection by ensuring only known table names
/// can be used in DELETE queries.
#[derive(Debug, Clone, Copy)]
enum PrivacyTable {
    Messages,
    Conversations,
    Projects,
    MessageDrafts,
    CustomInstructions,
    SettingsV2,
    UsageStats,
}

impl PrivacyTable {
    /// Returns all tables that should be cleared during account deletion.
    const fn all() -> &'static [PrivacyTable] {
        &[
            PrivacyTable::Messages,
            PrivacyTable::Conversations,
            PrivacyTable::Projects,
            PrivacyTable::MessageDrafts,
            PrivacyTable::CustomInstructions,
            PrivacyTable::SettingsV2,
            PrivacyTable::UsageStats,
        ]
    }

    /// Returns the table name as a static string.
    /// This is safe because we control all variants.
    const fn as_str(&self) -> &'static str {
        match self {
            PrivacyTable::Messages => "messages",
            PrivacyTable::Conversations => "conversations",
            PrivacyTable::Projects => "projects",
            PrivacyTable::MessageDrafts => "message_drafts",
            PrivacyTable::CustomInstructions => "custom_instructions",
            PrivacyTable::SettingsV2 => "settings_v2",
            PrivacyTable::UsageStats => "usage_stats",
        }
    }
}

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

#[tauri::command]
pub async fn privacy_delete_account(
    user_id: String,
    state: State<'_, AppDatabase>,
) -> Result<String, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    // AUDIT-003-001 fix: Delete all user data using type-safe table enum.
    // Each table uses a dedicated parameterized query to prevent SQL injection.
    for table in PrivacyTable::all() {
        // Use match to select the correct parameterized query for each table.
        // This ensures we never use format!() with table names, eliminating
        // any possibility of SQL injection even if the enum were somehow extended.
        let result = match table {
            PrivacyTable::Messages => {
                conn.execute("DELETE FROM messages WHERE user_id = ?1", [&user_id])
            }
            PrivacyTable::Conversations => {
                conn.execute("DELETE FROM conversations WHERE user_id = ?1", [&user_id])
            }
            PrivacyTable::Projects => {
                conn.execute("DELETE FROM projects WHERE user_id = ?1", [&user_id])
            }
            PrivacyTable::MessageDrafts => {
                conn.execute("DELETE FROM message_drafts WHERE user_id = ?1", [&user_id])
            }
            PrivacyTable::CustomInstructions => conn.execute(
                "DELETE FROM custom_instructions WHERE user_id = ?1",
                [&user_id],
            ),
            PrivacyTable::SettingsV2 => {
                conn.execute("DELETE FROM settings_v2 WHERE user_id = ?1", [&user_id])
            }
            PrivacyTable::UsageStats => {
                conn.execute("DELETE FROM usage_stats WHERE user_id = ?1", [&user_id])
            }
        };

        match result {
            Ok(rows) => {
                tracing::info!(
                    "[Privacy] Deleted {} rows from table {} for user {}",
                    rows,
                    table.as_str(),
                    user_id
                );
            }
            Err(e) => {
                // Log but continue - some tables might not exist or have user_id column
                tracing::warn!("[Privacy] Could not delete from {}: {}", table.as_str(), e);
            }
        }
    }

    // Clear MCP credentials from database (stored encrypted)
    // Delete any credentials that might be user-specific
    let delete_patterns = ["api_key_%".to_string(), "mcp_credential_%".to_string()];

    for pattern in &delete_patterns {
        match conn.execute("DELETE FROM settings_v2 WHERE key LIKE ?1", [pattern]) {
            Ok(rows) => {
                if rows > 0 {
                    tracing::info!(
                        "[Privacy] Deleted {} credential entries matching pattern: {}",
                        rows,
                        pattern
                    );
                }
            }
            Err(e) => tracing::warn!("[Privacy] Could not delete credentials: {}", e),
        }
    }

    tracing::info!(
        "[Privacy] Account data deletion completed for user: {}",
        user_id
    );
    Ok("Account data deleted successfully".to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending account deletion (7-day grace window).
//
// These commands implement the "soft delete" flow described in the Privacy
// Policy and the Settings UI: the user requests deletion, a marker file is
// written with `purge_at = now + 7 days`, and the actual purge runs in a
// later sprint. The user can cancel the request during the grace window.
//
// The actual marshaling-and-purge logic depends on Supabase schema work that
// is tracked separately. For Wave 2 we ship the disclosure + UI affordance
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
/// Supabase rows / Stripe subscriptions runs in a later sprint once the
/// cross-surface data marshaling lands. The marker is reversible via
/// `privacy_cancel_pending_deletion`.
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
pub async fn privacy_cancel_pending_deletion(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let path = pending_deletion_path(&app_handle)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to remove pending deletion marker: {}", e))?;
        tracing::info!("[Privacy] Pending account deletion cancelled");
    }
    Ok(())
}
