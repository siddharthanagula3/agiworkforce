use crate::sys::commands::chat::AppDatabase;
use tauri::State;

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

    // Clear credentials from keyring
    if let Ok(entry) = keyring::Entry::new("agiworkforce", &user_id) {
        match entry.delete_password() {
            Ok(_) => tracing::info!(
                "[Privacy] Deleted keyring credentials for user: {}",
                user_id
            ),
            Err(e) => tracing::warn!("[Privacy] Could not delete keyring credentials: {}", e),
        }
    }

    // Also clear any MCP-related credentials
    let mcp_service = format!("agiworkforce-mcp-{}", user_id);
    if let Ok(entry) = keyring::Entry::new(&mcp_service, "default") {
        let _ = entry.delete_password();
    }

    tracing::info!(
        "[Privacy] Account data deletion completed for user: {}",
        user_id
    );
    Ok("Account data deleted successfully".to_string())
}
