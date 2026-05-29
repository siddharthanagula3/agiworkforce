use chrono::Utc;

use crate::data::db::models::{Message, MessageRole};
use crate::data::db::repository;
use crate::data::cloud_sync;

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
        cloud_sync::spawn_sync_message(saved.clone());
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::{repository, Database};
    use crate::data::cloud_sync::test_take_spawn_count;
    use std::sync::Arc;

    fn make_test_db() -> (Database, AppDatabase) {
        let db_inner = Database::in_memory().expect("in-memory db must open");
        let app_db = AppDatabase {
            conn: Arc::clone(&db_inner.get_connection()),
        };
        (db_inner, app_db)
    }

    /// R25-V5: This test exists to enforce v1-LOCAL-ONLY sync gating.
    /// Default ChatPreferences must have chatStorageMode=local, meaning
    /// cloud_sync_enabled=false, meaning cloud sync functions must
    /// never be called on a normal message save.
    #[test]
    fn cloud_sync_never_fires_with_cloud_sync_disabled() {
        let (_db_inner, db) = make_test_db();
        let conn = db.connection().expect("connection");
        let conv_id =
            repository::create_conversation(&conn, "test-conv".to_string(), "user1".to_string())
                .expect("create conversation");
        drop(conn);

        let _ = test_take_spawn_count(); // reset counter

        save_assistant_message(
            &db,
            conv_id,
            "user1",
            "hello world",
            Some(10),
            Some(0.001),
            Some("openai"),
            "gpt-4",
            false, // cloud_sync_enabled = false (default ChatPreferences)
        )
        .expect("save should succeed");

        assert_eq!(
            test_take_spawn_count(),
            0,
            "cloud sync must not fire when cloud_sync_enabled=false (default ChatPreferences)"
        );
    }

    /// Desktop v1 keeps cloud sync as an explicit fail-closed boundary; even
    /// a direct call with cloud_sync=true must not enqueue a background upload.
    #[tokio::test]
    async fn cloud_sync_noops_when_cloud_sync_enabled() {
        let (_db_inner, db) = make_test_db();
        let conn = db.connection().expect("connection");
        let conv_id = repository::create_conversation(
            &conn,
            "test-conv-cloud".to_string(),
            "user2".to_string(),
        )
        .expect("create conversation");
        drop(conn);

        let _ = test_take_spawn_count();

        save_assistant_message(
            &db,
            conv_id,
            "user2",
            "cloud test",
            None,
            None,
            None,
            "gpt-4",
            true, // cloud_sync_enabled = true
        )
        .expect("save should succeed");

        assert_eq!(
            test_take_spawn_count(),
            0,
            "cloud sync must fail closed without enqueuing a background upload"
        );
    }
}
