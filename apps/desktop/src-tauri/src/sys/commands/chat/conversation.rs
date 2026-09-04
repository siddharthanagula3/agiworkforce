//! Conversation and message command handlers.

use crate::data::cloud_sync;
use crate::data::db::models::{Conversation, Message, MessageRole};
use crate::data::db::repository;
use crate::data::{memory_sync, projects_sync};
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

#[tauri::command]
pub fn chat_get_conversations(
    db: State<'_, AppDatabase>,
    user_id: String,
    app_mode: Option<String>,
) -> Result<Vec<Conversation>, String> {
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let conn = db.connection()?;
    if let Some(ref mode) = app_mode {
        repository::list_conversations_by_mode(
            &conn,
            DEFAULT_CONVERSATION_LIST_LIMIT,
            0,
            &user_id,
            mode,
        )
        .map_err(|e| format!("Failed to list conversations: {e}"))
    } else {
        repository::list_conversations(&conn, DEFAULT_CONVERSATION_LIST_LIMIT, 0, &user_id)
            .map_err(|e| format!("Failed to list conversations: {e}"))
    }
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
    let total_cost = super::persistence::total_request_cost(&messages);

    Ok(ConversationStats {
        message_count,
        total_tokens,
        total_input_tokens,
        total_output_tokens,
        total_cost,
    })
}

/// Resolve which account the sync engines may read and write locally.
///
/// The webview argument is a hint only: the effective account is the subject
/// proven by the access token that authenticates the push, so a caller cannot
/// scope local rows to an account whose bearer it does not hold.
fn authorized_sync_account(
    requested_user_id: Option<&str>,
    session_subject: Option<String>,
) -> Result<String, String> {
    let session_subject = session_subject.ok_or_else(|| {
        "Cloud sync requires a signed-in AGI Cloud account. Please sign in.".to_string()
    })?;
    match requested_user_id.map(str::trim) {
        Some("") => Err("User ID cannot be empty".to_string()),
        Some(requested) if requested != session_subject => Err(
            "Cloud sync was requested for an account that is not signed in on this device."
                .to_string(),
        ),
        _ => Ok(session_subject),
    }
}

/// Manually trigger a delta sync (push + pull) of cloud conversations and
/// messages. Returns an error if cloud sync is disabled or authentication
/// is not available. Repoints the old bulk_sync stub at the new sync_now engine.
#[tauri::command]
pub async fn sync_conversations_to_cloud(
    db: State<'_, AppDatabase>,
    settings_state: State<'_, crate::sys::commands::settings::SettingsState>,
    user_id: Option<String>,
) -> Result<cloud_sync::BulkSyncResult, String> {
    // Egress gate: check chat storage preference (managed-only).
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

    // Auth: get bearer token and base URL (managed-cloud path).
    let token = crate::sys::account::get_access_token()?;
    let base_url = crate::sys::account::get_api_base_url();
    let user_id = authorized_sync_account(
        user_id.as_deref(),
        crate::sys::account::current_account_subject(),
    )?;

    let outcome = cloud_sync::sync_now(&db, &user_id, &token, &base_url).await?;

    match memory_sync::sync_memories_now(&db, &user_id, &token, &base_url).await {
        Ok(m) => {
            tracing::debug!(
                pushed = m.memories_pushed,
                pulled = m.memories_pulled,
                "cloud memory sync ok"
            )
        }
        Err(e) => tracing::warn!(error = %e, "cloud memory sync failed (chat sync unaffected)"),
    }
    match projects_sync::sync_projects_now(&db, &user_id, &token, &base_url).await {
        Ok(p) => {
            tracing::debug!(
                pushed = p.projects_pushed,
                pulled = p.projects_pulled,
                "cloud projects sync ok"
            )
        }
        Err(e) => tracing::warn!(error = %e, "cloud projects sync failed (chat sync unaffected)"),
    }
    Ok(cloud_sync::BulkSyncResult {
        conversations_synced: outcome.conversations_pushed + outcome.conversations_pulled,
        conversations_failed: 0,
        messages_synced: outcome.messages_pushed + outcome.messages_pulled,
        messages_failed: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::authorized_sync_account;

    #[test]
    fn cloud_sync_rejects_a_user_id_the_signed_in_session_does_not_own() {
        let error = authorized_sync_account(Some("account-a"), Some("account-b".to_string()))
            .expect_err("a webview-supplied account must not override the token subject");

        assert!(
            error.contains("not signed in"),
            "unexpected cross-account error: {error}"
        );
    }

    #[test]
    fn cloud_sync_requires_a_signed_in_account_subject() {
        let error = authorized_sync_account(Some("account-a"), None)
            .expect_err("sync must fail closed without a proven account subject");

        assert!(
            error.contains("signed-in"),
            "unexpected signed-out error: {error}"
        );
    }

    #[test]
    fn cloud_sync_scopes_to_the_token_subject_when_the_caller_omits_one() {
        assert_eq!(
            authorized_sync_account(None, Some("account-b".to_string())),
            Ok("account-b".to_string())
        );
        assert_eq!(
            authorized_sync_account(Some("  account-b  "), Some("account-b".to_string())),
            Ok("account-b".to_string())
        );
    }

    #[test]
    fn cloud_sync_still_rejects_an_empty_user_id() {
        assert_eq!(
            authorized_sync_account(Some("   "), Some("account-b".to_string())),
            Err("User ID cannot be empty".to_string())
        );
    }
}
