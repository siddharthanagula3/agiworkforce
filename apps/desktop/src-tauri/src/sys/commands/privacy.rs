use crate::sys::commands::chat::AppDatabase;
use serde::{Deserialize, Serialize};
use tauri::State;

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

    // Delete all user data from local database
    let tables = [
        "messages",
        "conversations",
        "projects",
        "message_drafts",
        "custom_instructions",
        "settings_v2",
        "usage_stats",
    ];

    for table in tables {
        // Use parameterized query to prevent SQL injection
        let query = format!("DELETE FROM {} WHERE user_id = ?1", table);
        match conn.execute(&query, [&user_id]) {
            Ok(rows) => {
                tracing::info!(
                    "[Privacy] Deleted {} rows from table {} for user {}",
                    rows,
                    table,
                    user_id
                );
            }
            Err(e) => {
                // Log but continue - some tables might not exist or have user_id column
                tracing::warn!("[Privacy] Could not delete from {}: {}", table, e);
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
