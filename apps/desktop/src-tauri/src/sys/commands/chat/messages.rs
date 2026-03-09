//! Message CRUD command handlers and persistence helpers.

use crate::data::db::models::{Message, MessageRole};
use crate::data::db::repository;
use crate::data::supabase_sync;
use chrono::Utc;
use tauri::State;

use super::state::AppDatabase;
use super::types::{ConversationStats, CreateMessageRequest};

// ============================================================================
// Helper functions (used internally by send_message and streaming)
// ============================================================================

/// Compute conversation statistics (message count, total tokens, total cost)
/// from the database for the given conversation.
pub(crate) fn compute_conversation_stats(
    db: &AppDatabase,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    let conn = db.connection()?;
    let messages = repository::list_messages(&conn, conversation_id)
        .map_err(|e| format!("Failed to compute stats: {e}"))?;
    Ok(ConversationStats {
        message_count: messages.len(),
        total_tokens: messages.iter().filter_map(|m| m.tokens).sum(),
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost: messages.iter().filter_map(|m| m.cost).sum(),
    })
}

/// Save an assistant message to the database and return the saved Message.
pub(crate) fn save_assistant_message(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    content: &str,
    tokens: Option<i32>,
    cost: Option<f64>,
    provider: Option<&str>,
    model: &str,
) -> Result<Message, String> {
    let conn = db.connection()?;
    let msg = Message {
        id: 0,
        conversation_id,
        user_id: user_id.to_string(),
        role: MessageRole::Assistant,
        content: content.to_string(),
        tokens,
        cost,
        provider: provider.map(|p| p.to_string()),
        model: Some(model.to_string()),
        created_at: Utc::now(),
        parent_message_id: None,
        branch_id: Some("main".to_string()),
    };
    let id = repository::create_message(&conn, &msg)
        .map_err(|e| format!("Failed to save assistant message: {e}"))?;
    let saved = repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?;

    // Best-effort dual-write to Supabase (fire-and-forget)
    supabase_sync::spawn_sync_message(saved.clone());

    Ok(saved)
}

/// In incognito mode, create an in-memory Message without persisting to SQLite.
/// Otherwise, delegate to `save_assistant_message`.
pub(crate) fn save_or_skip_assistant_message(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    content: &str,
    tokens: Option<i32>,
    cost: Option<f64>,
    provider: Option<&str>,
    model: &str,
    incognito: bool,
) -> Result<Message, String> {
    if incognito {
        Ok(Message {
            id: -1,
            conversation_id,
            user_id: user_id.to_string(),
            role: MessageRole::Assistant,
            content: content.to_string(),
            tokens,
            cost,
            provider: provider.map(|p| p.to_string()),
            model: Some(model.to_string()),
            created_at: Utc::now(),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        })
    } else {
        save_assistant_message(
            db,
            conversation_id,
            user_id,
            content,
            tokens,
            cost,
            provider,
            model,
        )
    }
}

/// In incognito mode, return zeroed-out stats.
/// Otherwise, compute real stats from the database.
pub(crate) fn compute_or_skip_stats(
    db: &AppDatabase,
    conversation_id: i64,
    incognito: bool,
) -> Result<ConversationStats, String> {
    if incognito {
        Ok(ConversationStats {
            message_count: 0,
            total_tokens: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost: 0.0,
        })
    } else {
        compute_conversation_stats(db, conversation_id)
    }
}

// ============================================================================
// Tauri command handlers
// ============================================================================

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
    let created = repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve message {}: {e}", id))?;

    // Best-effort dual-write to Supabase (fire-and-forget)
    supabase_sync::spawn_sync_message(created.clone());

    Ok(created)
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

    // Verify conversation ownership first
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
    let total_tokens = messages.iter().filter_map(|m| m.tokens).sum();
    let total_cost = messages.iter().filter_map(|m| m.cost).sum();

    Ok(ConversationStats {
        message_count,
        total_tokens,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost,
    })
}
