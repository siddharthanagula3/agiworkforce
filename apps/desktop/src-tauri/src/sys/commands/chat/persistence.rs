use chrono::Utc;

use crate::data::db::models::{Message, MessageRole};
use crate::data::db::repository;
use crate::data::supabase_sync;

use super::{AppDatabase, ConversationStats};

/// Compute conversation statistics (message count, total tokens, total cost)
/// from the database for the given conversation.
pub(super) fn compute_conversation_stats(
    db: &AppDatabase,
    conversation_id: i64,
) -> Result<ConversationStats, String> {
    let conn = db.connection()?;
    let messages = repository::list_messages(&conn, conversation_id)
        .map_err(|e| format!("Failed to compute stats: {e}"))?;
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
    Ok(ConversationStats {
        message_count: messages.len(),
        total_tokens: messages.iter().filter_map(|message| message.tokens).sum(),
        total_input_tokens,
        total_output_tokens,
        total_cost: messages.iter().filter_map(|message| message.cost).sum(),
    })
}

/// Save an assistant message to the database and return the saved Message.
pub(super) fn save_assistant_message(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    content: &str,
    tokens: Option<i32>,
    cost: Option<f64>,
    provider: Option<&str>,
    model: &str,
    cloud_sync: bool,
) -> Result<Message, String> {
    let conn = db.connection()?;
    let message = Message {
        id: 0,
        conversation_id,
        user_id: user_id.to_string(),
        role: MessageRole::Assistant,
        content: content.to_string(),
        tokens,
        cost,
        provider: provider.map(|value| value.to_string()),
        model: Some(model.to_string()),
        created_at: Utc::now(),
        parent_message_id: None,
        branch_id: Some("main".to_string()),
    };
    let id = repository::create_message(&conn, &message)
        .map_err(|e| format!("Failed to save assistant message: {e}"))?;
    let saved = repository::get_message(&conn, id)
        .map_err(|e| format!("Failed to retrieve assistant message: {e}"))?;
    if cloud_sync {
        supabase_sync::spawn_sync_message(saved.clone());
    }
    Ok(saved)
}

/// In incognito mode, create an in-memory Message without persisting to SQLite.
/// Otherwise, delegate to `save_assistant_message`.
pub(super) fn save_or_skip_assistant_message(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    content: &str,
    tokens: Option<i32>,
    cost: Option<f64>,
    provider: Option<&str>,
    model: &str,
    incognito: bool,
    cloud_sync: bool,
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
            provider: provider.map(|value| value.to_string()),
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
            cloud_sync,
        )
    }
}

/// In incognito mode, return zeroed-out stats.
/// Otherwise, compute real stats from the database.
pub(super) fn compute_or_skip_stats(
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
