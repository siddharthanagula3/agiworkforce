//! Conversation sync command handlers.
//!
//! CRUD operations (create/get/list/update/delete) for conversations live in
//! `chat/mod.rs` and are exported via `pub use chat::*` in sys/commands/mod.rs.
//! This file contains only the Supabase cloud-sync command.

use crate::data::db::repository;
use crate::data::supabase_sync;
use tauri::State;

use super::state::{AppDatabase, DEFAULT_CONVERSATION_LIST_LIMIT};

/// Manually trigger a bulk sync of all conversations and messages to Supabase.
/// Returns an error if the user's chat_storage_mode is not "cloud".
#[tauri::command]
pub async fn sync_conversations_to_cloud(
    db: State<'_, AppDatabase>,
    settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
    user_id: String,
) -> Result<supabase_sync::BulkSyncResult, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    // Respect the user's chat storage preference
    {
        let s = settings_state.settings.lock().await;
        let mode = s
            .chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str())
            .unwrap_or("local");
        if mode != "cloud" {
            return Err(
                "Cloud sync is disabled. Enable cloud storage in Settings > Chat to use this feature.".to_string()
            );
        }
    }

    let client = supabase_sync::SupabaseSyncClient::new()
        .ok_or_else(|| "Supabase is not configured (missing URL or anon key)".to_string())?;

    // Scope the MutexGuard so it is dropped before any .await
    let (conversations, all_messages) = {
        let conn = db.connection()?;
        let convs =
            repository::list_conversations(&conn, DEFAULT_CONVERSATION_LIST_LIMIT, 0, &user_id)
                .map_err(|e| format!("Failed to list conversations: {e}"))?;

        let mut msgs = Vec::new();
        for conv in &convs {
            if let Ok(m) = repository::list_messages(&conn, conv.id) {
                msgs.extend(m);
            }
        }
        (convs, msgs)
    };

    Ok(client.bulk_sync(&conversations, &all_messages).await)
}
