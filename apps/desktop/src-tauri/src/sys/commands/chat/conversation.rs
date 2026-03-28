//! Conversation and message command handlers.

use crate::data::db::models::{Conversation, Message, MessageRole};
use crate::data::db::repository;
use crate::data::supabase_sync;
use chrono::Utc;
use tauri::State;

use super::{
    state::{AppDatabase, DEFAULT_CONVERSATION_LIST_LIMIT},
    ConversationStats, CreateConversationRequest, CreateMessageRequest, Validate,
};

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
    repository::get_conversation(&conn, id, &request.user_id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {e}", id))
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

/// Archive or unarchive a conversation by setting its `archived` flag.
#[tauri::command]
pub fn chat_archive_conversation(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    archived: Option<bool>,
) -> Result<(), String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    repository::archive_conversation(&conn, conversation_id, &user_id, archived.unwrap_or(true))
        .map_err(|e| format!("Failed to archive conversation {}: {e}", conversation_id))
}

/// Update only the title of a conversation.
#[tauri::command]
pub fn chat_update_conversation_title(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: Option<String>,
    title: String,
) -> Result<(), String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    let uid = user_id.unwrap_or_default();
    if uid.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Title cannot be empty".to_string());
    }
    if trimmed_title.len() > 500 {
        return Err("Title cannot exceed 500 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_conversation_title(&conn, conversation_id, &uid, trimmed_title.to_string())
        .map_err(|e| {
            format!(
                "Failed to update conversation title {}: {e}",
                conversation_id
            )
        })
}

#[tauri::command]
pub fn chat_create_message(
    db: State<'_, AppDatabase>,
    request: CreateMessageRequest,
) -> Result<Message, String> {
    if request.conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            request.conversation_id
        ));
    }

    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    if let Some(tokens) = request.tokens {
        if tokens < 0 {
            return Err(format!(
                "Invalid tokens value: {}. Tokens must be non-negative",
                tokens
            ));
        }
    }

    if let Some(cost) = request.cost {
        if cost < 0.0 {
            return Err(format!(
                "Invalid cost value: {}. Cost must be non-negative",
                cost
            ));
        }
    }

    let conn = db.connection()?;

    let message = Message {
        id: 0,
        conversation_id: request.conversation_id,
        user_id: request.user_id.clone(),
        role: request.role,
        content: trimmed_content.to_string(),
        tokens: request.tokens,
        cost: request.cost,
        provider: None,
        model: None,
        created_at: Utc::now(),
        parent_message_id: None,
        branch_id: Some("main".to_string()),
    };

    let id = repository::create_message(&conn, &message).map_err(|e| {
        format!(
            "Failed to create message in conversation {}: {e}",
            request.conversation_id
        )
    })?;
    repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve message {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_messages(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
) -> Result<Vec<Message>, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let conn = db.connection()?;
    repository::get_conversation(&conn, conversation_id, &user_id)
        .map_err(|e| format!("Access denied or conversation not found: {e}"))?;

    repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })
}

#[tauri::command]
pub fn chat_update_message(
    db: State<'_, AppDatabase>,
    id: i64,
    content: String,
) -> Result<Message, String> {
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let trimmed_content = content.trim();
    if trimmed_content.is_empty() {
        return Err("Message content cannot be empty".to_string());
    }
    if trimmed_content.len() > 1_000_000 {
        return Err("Message content cannot exceed 1,000,000 characters".to_string());
    }

    let conn = db.connection()?;
    repository::update_message_content(&conn, id, trimmed_content.to_string())
        .map_err(|e| format!("Failed to update message {}: {e}", id))
}

#[tauri::command]
pub fn chat_delete_message(db: State<'_, AppDatabase>, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err(format!("Invalid message ID: {}. ID must be positive", id));
    }

    let conn = db.connection()?;
    repository::delete_message(&conn, id)
        .map_err(|e| format!("Failed to delete message {}: {e}", id))
}

#[tauri::command]
pub fn chat_get_conversation_stats(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }

    let conn = db.connection()?;
    let messages = repository::list_messages(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })?;

    let message_count = messages.len();
    let total_tokens = messages.iter().filter_map(|message| message.tokens).sum();
    let total_input_tokens: i32 = messages
        .iter()
        .filter(|message| matches!(message.role, MessageRole::User | MessageRole::System))
        .filter_map(|message| message.tokens)
        .sum();
    let total_output_tokens: i32 = messages
        .iter()
        .filter(|message| matches!(message.role, MessageRole::Assistant))
        .filter_map(|message| message.tokens)
        .sum();
    let total_cost = messages.iter().filter_map(|message| message.cost).sum();

    Ok(ConversationStats {
        message_count,
        total_tokens,
        total_input_tokens,
        total_output_tokens,
        total_cost,
    })
}

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
