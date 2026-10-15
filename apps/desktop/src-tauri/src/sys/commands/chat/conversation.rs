//! Conversation and message command handlers.

use crate::data::db::models::{Conversation, ConversationListItem, MessageWithDetail};
use crate::data::db::repository;
use tauri::State;

use super::{
    state::{AppDatabase, DEFAULT_CONVERSATION_PAGE_SIZE, MAX_CONVERSATION_PAGE_SIZE},
    CreateConversationRequest, Validate,
};

/// Largest serialized turn detail one message may store. Tool output past
/// this belongs in the artifact or file it produced, not in the history row.
const MAX_MESSAGE_DETAIL_BYTES: usize = 2 * 1024 * 1024;

#[tauri::command]
pub fn chat_create_conversation(
    db: State<'_, AppDatabase>,
    request: CreateConversationRequest,
) -> Result<Conversation, String> {
    request.validate().map_err(|e| e.to_string())?;
    let trimmed_title = request.title.trim();

    let conn = db.connection()?;
    let execution_mode = request
        .execution_mode
        .unwrap_or(super::ChatExecutionMode::LocalOnly);
    let app_mode = if execution_mode.uses_local_storage() {
        "local"
    } else {
        "cloud"
    };
    let id = repository::create_conversation_with_execution_mode(
        &conn,
        trimmed_title.to_string(),
        request.user_id.clone(),
        app_mode,
        execution_mode.as_str(),
        request.project_id.as_deref(),
    )
    .map_err(|e| format!("Failed to create conversation: {e}"))?;
    repository::get_conversation(&conn, id, &request.user_id)
        .map_err(|e| format!("Failed to retrieve conversation {}: {e}", id))
}

/// One page of a user's conversations, newest first.
/// `app_mode`: optional mode filter, "local" or "cloud".
/// When provided, only conversations created in that mode are returned.
/// When absent, all conversations for the user are returned (legacy behaviour).
/// `limit` defaults to one page and is capped; `offset` walks older pages.
#[tauri::command]
pub fn chat_get_conversations(
    db: State<'_, AppDatabase>,
    user_id: String,
    app_mode: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ConversationListItem>, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let limit = limit
        .unwrap_or(DEFAULT_CONVERSATION_PAGE_SIZE)
        .clamp(1, MAX_CONVERSATION_PAGE_SIZE);
    let offset = offset.unwrap_or(0).max(0);
    let conn = db.connection()?;
    repository::list_conversations_by_mode(&conn, limit, offset, &user_id, app_mode.as_deref())
        .map_err(|e| format!("Failed to list conversations: {e}"))
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
        .map_err(|e| format!("Failed to delete conversation {}: {e}", id))?;
    crate::ui::hooks::lifecycle::session_ended(id, "deleted");
    Ok(())
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

    let archived = archived.unwrap_or(true);
    let conn = db.connection()?;
    repository::archive_conversation(&conn, conversation_id, &user_id, archived)
        .map_err(|e| format!("Failed to archive conversation {}: {e}", conversation_id))?;
    if archived {
        crate::ui::hooks::lifecycle::session_ended(conversation_id, "archived");
    }
    Ok(())
}

/// Pin or unpin a conversation in the history list.
#[tauri::command]
pub fn chat_pin_conversation(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    pinned: bool,
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
    repository::set_conversation_pinned(&conn, conversation_id, &user_id, pinned)
        .map_err(|e| format!("Failed to pin conversation {}: {e}", conversation_id))
}

/// Move a conversation into a project, or out of its project with `null`.
#[tauri::command]
pub fn chat_set_conversation_project(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    project_id: Option<String>,
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
    repository::set_conversation_project(&conn, conversation_id, &user_id, project_id.as_deref())
        .map_err(|e| {
            format!(
                "Failed to move conversation {} to a project: {e}",
                conversation_id
            )
        })
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
pub fn chat_get_messages(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
) -> Result<Vec<MessageWithDetail>, String> {
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

    repository::list_messages_with_detail(&conn, conversation_id).map_err(|e| {
        format!(
            "Failed to list messages for conversation {}: {e}",
            conversation_id
        )
    })
}

/// Delete one message of a conversation the user owns, named by its stored
/// `id` or by the `client_id` the renderer gave it. Deleting a message that is
/// already gone succeeds, so a retried edit or regenerate is safe.
#[tauri::command]
pub fn chat_delete_message(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    id: Option<i64>,
    client_id: Option<String>,
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
    let message = match (id, client_id.as_deref().map(str::trim)) {
        (Some(id), _) if id > 0 => repository::MessageRef::Id(id),
        (None, Some(client_id)) if !client_id.is_empty() => {
            repository::MessageRef::ClientId(client_id)
        }
        _ => return Err("Name the message by a positive id or a client id".to_string()),
    };

    let conn = db.connection()?;
    repository::get_conversation(&conn, conversation_id, &user_id)
        .map_err(|e| format!("Access denied or conversation not found: {e}"))?;
    repository::delete_message_for_user(&conn, conversation_id, message, &user_id)
        .map(|_| ())
        .map_err(|e| format!("Failed to delete a message of conversation {conversation_id}: {e}"))
}

/// Record thumbs feedback on a reply, or clear it with `null`.
#[tauri::command]
pub fn chat_set_message_feedback(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    id: Option<i64>,
    client_id: Option<String>,
    feedback: Option<String>,
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
    let message = match (id, client_id.as_deref().map(str::trim)) {
        (Some(id), _) if id > 0 => repository::MessageRef::Id(id),
        (None, Some(client_id)) if !client_id.is_empty() => {
            repository::MessageRef::ClientId(client_id)
        }
        _ => return Err("Name the message by a positive id or a client id".to_string()),
    };

    let conn = db.connection()?;
    repository::set_message_feedback(
        &conn,
        conversation_id,
        message,
        &user_id,
        feedback.as_deref(),
    )
    .map_err(|e| format!("Failed to save feedback in conversation {conversation_id}: {e}"))
}

/// Store what a turn rendered beyond its text, so reloading the chat shows the
/// same tool timeline, reasoning and attachment list.
#[tauri::command]
pub fn chat_save_message_detail(
    db: State<'_, AppDatabase>,
    message_id: i64,
    user_id: String,
    client_id: Option<String>,
    tool_calls: Option<serde_json::Value>,
    thinking: Option<String>,
    attachments: Option<serde_json::Value>,
    sources: Option<serde_json::Value>,
) -> Result<(), String> {
    if message_id <= 0 {
        return Err(format!(
            "Invalid message ID: {}. ID must be positive",
            message_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let tool_calls = tool_calls
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|e| format!("Invalid tool call detail: {e}"))?;
    let attachments = attachments
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|e| format!("Invalid attachment detail: {e}"))?;
    let sources = sources
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|e| format!("Invalid source detail: {e}"))?;
    let detail_bytes = tool_calls.as_ref().map_or(0, String::len)
        + thinking.as_ref().map_or(0, String::len)
        + attachments.as_ref().map_or(0, String::len)
        + sources.as_ref().map_or(0, String::len);
    if detail_bytes > MAX_MESSAGE_DETAIL_BYTES {
        return Err(format!(
            "Turn detail is {detail_bytes} bytes; the limit is {MAX_MESSAGE_DETAIL_BYTES}"
        ));
    }

    let conn = db.connection()?;
    repository::update_message_detail(
        &conn,
        message_id,
        &user_id,
        client_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty()),
        tool_calls.as_deref(),
        thinking.as_deref(),
        attachments.as_deref(),
        sources.as_deref(),
    )
    .map_err(|e| format!("Failed to save detail for message {}: {e}", message_id))
}
