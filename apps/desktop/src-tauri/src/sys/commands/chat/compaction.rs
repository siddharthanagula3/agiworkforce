use tauri::State;
use tracing::info;

use crate::core::agent::context_compactor::{CompactionConfig, ContextCompactor};
use crate::data::db::repository;

use super::AppDatabase;

/// Response from context compaction
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContextCompactionResponse {
    /// Number of messages that were compacted
    pub messages_compacted: usize,
    /// Token count before compaction
    pub tokens_before: usize,
    /// Token count after compaction
    pub tokens_after: usize,
    /// Token savings percentage
    pub savings_percent: f32,
    /// Whether a summary was created
    pub summary_created: bool,
    /// Focus area used for compaction (if specified)
    pub focus: Option<String>,
    /// User-friendly message about the result
    pub message: String,
}

/// Compact the context of a conversation to reduce token usage
///
/// # Arguments
/// * `conversation_id` - The conversation to compact
/// * `focus` - Optional focus area to preserve (e.g., "code", "decisions", "errors")
/// * `user_id` - The user ID for authorization
///
/// # Returns
/// Compaction statistics and result message
#[tauri::command]
pub async fn chat_compact_context(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    focus: Option<String>,
    user_id: String,
) -> Result<ContextCompactionResponse, String> {
    compact_context(db.inner(), conversation_id, focus, &user_id).await
}

pub(super) async fn compact_context(
    db: &AppDatabase,
    conversation_id: i64,
    focus: Option<String>,
    user_id: &str,
) -> Result<ContextCompactionResponse, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    let messages = {
        let conn = db.connection()?;

        repository::get_conversation(&conn, conversation_id, user_id)
            .map_err(|e| format!("Access denied or conversation not found: {e}"))?;

        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to load messages: {e}"))?
    };

    if messages.is_empty() {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before: 0,
            tokens_after: 0,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: "No messages to compact in this conversation.".to_string(),
        });
    }

    let tokens_before: usize = messages
        .iter()
        .map(|message| message.tokens.unwrap_or(0) as usize)
        .sum();

    if messages.len() < 10 {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before,
            tokens_after: tokens_before,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: format!(
                "Conversation has only {} messages. Compaction not needed (minimum 10 messages).",
                messages.len()
            ),
        });
    }

    let config = CompactionConfig {
        max_tokens: 100_000,
        target_tokens: 50_000,
        keep_recent: match focus.as_deref() {
            Some("errors") | Some("debug") => 15,
            Some("decisions") | Some("todo") => 5,
            _ => 10,
        },
        min_messages: 10,
    };

    let compactor = ContextCompactor::new(config);

    if !compactor.should_compact(&messages) {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before,
            tokens_after: tokens_before,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: format!(
                "Context is within limits ({} tokens). No compaction needed.",
                tokens_before
            ),
        });
    }

    let summary = compactor
        .generate_summary(&messages)
        .await
        .map_err(|e| format!("Failed to generate summary: {e}"))?;

    let compacted = compactor.get_compacted_messages(&messages, &summary);
    persist_compacted_context(db, conversation_id, user_id, &messages, &compacted)?;
    let tokens_after: usize = compacted
        .iter()
        .map(|message| message.tokens.unwrap_or(0) as usize)
        .sum();

    let messages_compacted = messages.len() - compacted.len();
    let savings_percent = if tokens_before > 0 {
        ((tokens_before - tokens_after) as f32 / tokens_before as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Context compaction: {} messages → {} messages, {} → {} tokens ({:.1}% saved)",
        messages.len(),
        compacted.len(),
        tokens_before,
        tokens_after,
        savings_percent
    );

    Ok(ContextCompactionResponse {
        messages_compacted,
        tokens_before,
        tokens_after,
        savings_percent,
        summary_created: true,
        focus: focus.clone(),
        message: format!(
            "Compacted {} messages, saving {:.1}% of tokens ({} → {}).",
            messages_compacted, savings_percent, tokens_before, tokens_after
        ),
    })
}

fn persist_compacted_context(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    original_messages: &[crate::data::db::models::Message],
    compacted_messages: &[crate::data::db::models::Message],
) -> Result<(), String> {
    let summary_message = compacted_messages
        .first()
        .filter(|message| {
            message.id == 0 && message.role == crate::data::db::models::MessageRole::System
        })
        .ok_or_else(|| "Compaction produced no summary message to persist".to_string())?;

    let keep_recent_count = compacted_messages
        .len()
        .checked_sub(1)
        .ok_or_else(|| "Compaction output is missing recent messages".to_string())?;
    let recent_messages_start = original_messages.len().saturating_sub(keep_recent_count);
    let old_messages = &original_messages[..recent_messages_start];
    if old_messages.is_empty() {
        return Err("Compaction selected no old messages to replace".to_string());
    }

    let summary_created_at = original_messages
        .get(recent_messages_start)
        .map(|message| message.created_at - chrono::Duration::seconds(1))
        .unwrap_or_else(|| old_messages[old_messages.len() - 1].created_at);
    let summary_created_at_sql = summary_created_at.format("%Y-%m-%d %H:%M:%S").to_string();
    let summary_branch_id = old_messages
        .last()
        .and_then(|message| message.branch_id.clone())
        .unwrap_or_else(|| "main".to_string());

    let conn = db.connection()?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start compaction transaction: {e}"))?;

    tx.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![conversation_id, user_id],
    )
    .map_err(|e| format!("Failed to mark conversation as updated: {e}"))?;

    for message in old_messages {
        tx.execute(
            "DELETE FROM messages WHERE id = ?1 AND conversation_id = ?2",
            rusqlite::params![message.id, conversation_id],
        )
        .map_err(|e| format!("Failed to remove compacted message {}: {e}", message.id))?;
    }

    tx.execute(
        "INSERT INTO messages (
            conversation_id,
            user_id,
            role,
            content,
            tokens,
            cost,
            provider,
            model,
            created_at,
            parent_message_id,
            branch_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            conversation_id,
            user_id,
            summary_message.role.as_str(),
            summary_message.content,
            summary_message.tokens,
            summary_message.cost,
            summary_message.provider.as_deref(),
            summary_message.model.as_deref(),
            summary_created_at_sql,
            summary_message.parent_message_id,
            summary_branch_id,
        ],
    )
    .map_err(|e| format!("Failed to save compacted summary: {e}"))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit compacted context: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::compact_context;
    use crate::data::db::{
        models::{Message, MessageRole},
        Database,
    };
    use crate::sys::commands::chat::state::AppDatabase;

    fn test_db() -> AppDatabase {
        let db = Database::in_memory().expect("in-memory db");
        AppDatabase {
            conn: db.get_connection(),
        }
    }

    #[tokio::test]
    async fn compact_context_persists_summary_and_keeps_recent_messages() {
        let db = test_db();
        let user_id = "test-user";
        let conversation_id = {
            let conn = db.connection().expect("db connection");
            crate::data::db::repository::create_conversation(
                &conn,
                "Compaction Test".to_string(),
                user_id.to_string(),
            )
            .expect("conversation")
        };

        {
            let conn = db.connection().expect("db connection");
            for index in 0..12 {
                let message = Message::new(
                    conversation_id,
                    user_id.to_string(),
                    if index % 2 == 0 {
                        MessageRole::User
                    } else {
                        MessageRole::Assistant
                    },
                    format!("message-{index}"),
                )
                .with_metrics(10_000, 0.01);
                crate::data::db::repository::create_message(&conn, &message)
                    .expect("create message");
            }
        }

        let response = compact_context(&db, conversation_id, None, user_id)
            .await
            .expect("compact context");

        assert!(response.summary_created);
        assert!(response.messages_compacted > 0);
        assert!(response.tokens_after < response.tokens_before);

        let messages = {
            let conn = db.connection().expect("db connection");
            crate::data::db::repository::list_messages(&conn, conversation_id)
                .expect("list messages")
        };

        assert_eq!(messages.len(), 11);
        assert_eq!(messages[0].role, MessageRole::System);
        assert!(messages[0].content.starts_with("[Compacted Context]"));
        let remaining_contents: Vec<&str> = messages
            .iter()
            .skip(1)
            .map(|message| message.content.as_str())
            .collect();
        assert_eq!(
            remaining_contents,
            vec![
                "message-2",
                "message-3",
                "message-4",
                "message-5",
                "message-6",
                "message-7",
                "message-8",
                "message-9",
                "message-10",
                "message-11",
            ]
        );
    }
}
