use chrono::Utc;

use crate::data::cloud_sync;
use crate::data::db::models::{Message, MessageRole};
use crate::data::db::repository;

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
        // Mint cloud_id and mark assistant message for push.
        // Reuse the already-held connection guard — acquiring a second lock on the same
        // non-reentrant std::sync::Mutex would deadlock.
        if let Err(e) = cloud_sync::mark_message_for_push(&conn, id) {
            // Non-fatal: a chat save must never fail because cloud-marking failed.
            // But log it — silently swallowing this previously hid a broken UPDATE.
            tracing::warn!(error = %e, message_id = id, "failed to mark message for cloud push");
        }
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
    use std::sync::Arc;

    fn make_test_db() -> (Database, AppDatabase) {
        let db_inner = Database::in_memory().expect("in-memory db must open");
        let app_db = AppDatabase {
            conn: Arc::clone(&db_inner.get_connection()),
        };
        (db_inner, app_db)
    }

    /// (needs_push, cloud_id) of the most recent message in a conversation — the
    /// real sync state a save leaves behind (replaces the old dead spawn counter).
    fn latest_message_sync_state(db: &AppDatabase, conv_id: i64) -> (i64, Option<String>) {
        let conn = db.connection().expect("connection");
        conn.query_row(
            "SELECT needs_push, cloud_id FROM messages WHERE conversation_id = ?1 \
             ORDER BY id DESC LIMIT 1",
            rusqlite::params![conv_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("message row")
    }

    /// TRUST-BOUNDARY: with cloud_sync_enabled=false the saved message must NOT be
    /// marked for push (needs_push stays 0, no cloud_id) — fail-closed local boundary.
    #[test]
    fn message_not_marked_for_push_when_cloud_sync_disabled() {
        let (_db_inner, db) = make_test_db();
        let conn = db.connection().expect("connection");
        let conv_id =
            repository::create_conversation(&conn, "c".to_string(), "u1".to_string())
                .expect("create conversation");
        drop(conn);

        save_assistant_message(
            &db, conv_id, "u1", "hello", Some(10), Some(0.001), Some("openai"), "gpt-4",
            false, // cloud_sync_enabled = false
        )
        .expect("save should succeed");

        let (needs_push, cloud_id) = latest_message_sync_state(&db, conv_id);
        assert_eq!(needs_push, 0, "needs_push must stay 0 when cloud sync is disabled");
        assert!(cloud_id.is_none(), "no cloud_id when cloud sync is disabled");
    }

    /// Even with cloud_sync_enabled=true, a message on a LOCAL conversation is never
    /// marked for push — the mint guard requires app_mode='cloud'. This is the
    /// fail-closed boundary that keeps Local chats off the cloud.
    #[test]
    fn local_conversation_message_not_marked_even_when_cloud_sync_enabled() {
        let (_db_inner, db) = make_test_db();
        let conn = db.connection().expect("connection");
        let conv_id =
            repository::create_conversation(&conn, "local".to_string(), "u2".to_string())
                .expect("create conversation"); // app_mode defaults to 'local'
        drop(conn);

        save_assistant_message(
            &db, conv_id, "u2", "cloud test", None, None, None, "gpt-4",
            true, // cloud_sync_enabled = true
        )
        .expect("save should succeed");

        let (needs_push, cloud_id) = latest_message_sync_state(&db, conv_id);
        assert_eq!(needs_push, 0, "local-conversation message must not be marked for push");
        assert!(cloud_id.is_none(), "local-conversation message must not get a cloud_id");
    }

    /// Happy path: a CLOUD conversation + cloud_sync_enabled=true → the message IS
    /// minted (cloud_id set, needs_push=1) so the sync engine will push it.
    #[test]
    fn cloud_conversation_message_marked_for_push_when_enabled() {
        let (_db_inner, db) = make_test_db();
        let conn = db.connection().expect("connection");
        let conv_id = repository::create_conversation_with_mode(
            &conn, "cloud".to_string(), "u3".to_string(), "cloud",
        )
        .expect("create cloud conversation");
        drop(conn);

        save_assistant_message(
            &db, conv_id, "u3", "synced", None, None, None, "gpt-4",
            true, // cloud_sync_enabled = true
        )
        .expect("save should succeed");

        let (needs_push, cloud_id) = latest_message_sync_state(&db, conv_id);
        assert_eq!(needs_push, 1, "cloud-conversation message must be marked for push");
        assert!(cloud_id.is_some(), "cloud-conversation message must get a cloud_id");
    }
}
