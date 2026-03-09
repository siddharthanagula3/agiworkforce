//! Conversation CRUD command handlers.

use crate::data::db::models::Conversation;
use crate::data::db::repository;
use crate::data::supabase_sync;
use tauri::State;

use super::state::{AppDatabase, DEFAULT_CONVERSATION_LIST_LIMIT};
use super::types::{CreateConversationRequest, UpdateConversationRequest, Validate};

#[tauri::command]
pub fn chat_create_conversation(
    db: State<'_, AppDatabase>,
    request: CreateConversationRequest,
) -> Result<Conversation, String> {
    request.validate().map_err(|e| e.to_string())?;
    let trimmed_title = request.title.trim();

    let conn = db.connection()?;
    let id =
        repository::create_conversation(&conn, trimmed_title.to_string(), request.user_id.clone())
            .map_err(|e| format!("Failed to create conversation: {e}"))?;
    let created = repository::get_conversation(&conn, id, &request.user_id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {e}", id))?;

    // Best-effort dual-write to Supabase (fire-and-forget)
    supabase_sync::spawn_sync_conversation(created.clone());

    Ok(created)
}

#[tauri::command]
pub fn chat_get_conversations(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<Vec<Conversation>, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let conn = db.connection()?;
    repository::list_conversations(&conn, DEFAULT_CONVERSATION_LIST_LIMIT, 0, &user_id)
        .map_err(|e| format!("Failed to list conversations: {e}"))
}

#[tauri::command]
pub fn chat_get_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    user_id: String,
) -> Result<Conversation, String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    repository::get_conversation(&conn, id, &user_id)
        .map_err(|e| format!("Failed to get conversation {}: {e}", id))
}

#[tauri::command]
pub fn chat_update_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    request: UpdateConversationRequest,
) -> Result<(), String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }

    request.validate().map_err(|e| e.to_string())?;
    let trimmed_title = request.title.trim();

    let conn = db.connection()?;
    repository::update_conversation_title(&conn, id, &request.user_id, trimmed_title.to_string())
        .map_err(|e| format!("Failed to update conversation {}: {e}", id))?;

    // Best-effort sync updated conversation to Supabase
    if let Ok(updated) = repository::get_conversation(&conn, id, &request.user_id) {
        supabase_sync::spawn_sync_conversation(updated);
    }

    Ok(())
}

#[tauri::command]
pub fn chat_delete_conversation(
    db: State<'_, AppDatabase>,
    id: i64,
    user_id: String,
) -> Result<(), String> {
    if id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    repository::delete_conversation(&conn, id, &user_id)
        .map(|_| ())
        .map_err(|e| format!("Failed to delete conversation {}: {e}", id))
}

/// Manually trigger a bulk sync of all conversations and messages to Supabase.
/// Returns a summary of how many items succeeded/failed.
#[tauri::command]
pub async fn sync_conversations_to_cloud(
    db: State<'_, AppDatabase>,
    user_id: String,
) -> Result<supabase_sync::BulkSyncResult, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
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
