//! Branching a Local conversation into a new chat at a chosen message.

use crate::data::db::models::{Conversation, ConversationBranchGroup};
use crate::data::db::repository::{self, MessageRef};
use crate::sys::commands::chat::AppDatabase;
use tauri::State;

fn message_ref<'a>(id: Option<i64>, client_id: Option<&'a str>) -> Result<MessageRef<'a>, String> {
    match (id, client_id.map(str::trim)) {
        (Some(id), _) if id > 0 => Ok(MessageRef::Id(id)),
        (None, Some(client_id)) if !client_id.is_empty() => Ok(MessageRef::ClientId(client_id)),
        _ => Err("Name the message by a positive id or a client id".to_string()),
    }
}

/// Copy the conversation up to and including one message into a new chat and
/// return it. The original is left untouched.
#[tauri::command]
pub fn chat_branch_conversation(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    message_id: Option<i64>,
    client_id: Option<String>,
) -> Result<Conversation, String> {
    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }
    let through = message_ref(message_id, client_id.as_deref())?;

    let conn = db.connection()?;
    let branch_id = repository::branch_conversation(&conn, conversation_id, &user_id, through)
        .map_err(|e| format!("Failed to branch conversation {conversation_id}: {e}"))?;
    repository::get_conversation(&conn, branch_id, &user_id)
        .map_err(|e| format!("Failed to read the new branch {branch_id}: {e}"))
}

/// The messages of a conversation that other chats share, with the sibling
/// conversations to page between at each.
#[tauri::command]
pub fn chat_list_conversation_branches(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
) -> Result<Vec<ConversationBranchGroup>, String> {
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
    repository::list_branch_groups(&conn, conversation_id, &user_id)
        .map_err(|e| format!("Failed to list branches of conversation {conversation_id}: {e}"))
}

#[cfg(test)]
mod tests {
    use crate::data::db::models::{Message, MessageRole};
    use crate::data::db::repository::{self, MessageRef};
    use rusqlite::Connection;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::data::db::migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn add(conn: &Connection, conversation_id: i64, role: MessageRole, content: &str) -> i64 {
        repository::create_message(
            conn,
            &Message::new(
                conversation_id,
                "user".to_string(),
                role,
                content.to_string(),
            ),
        )
        .unwrap()
    }

    #[test]
    fn a_branch_never_starts_at_a_summarized_message_and_keeps_the_summary_after_it() {
        let conn = db();
        let source =
            repository::create_conversation_with_mode(&conn, "Plan".into(), "user".into(), "local")
                .unwrap();
        let summarized = add(&conn, source, MessageRole::User, "old question");
        let summary = add(
            &conn,
            source,
            MessageRole::Assistant,
            "summary of the old turns",
        );
        let recent = add(&conn, source, MessageRole::User, "recent question");
        conn.execute(
            "UPDATE messages SET compacted_into = ?1 WHERE id = ?2",
            rusqlite::params![summary, summarized],
        )
        .unwrap();
        let conversations = |conn: &Connection| -> i64 {
            conn.query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))
                .unwrap()
        };
        let before = conversations(&conn);

        let error =
            repository::branch_conversation(&conn, source, "user", MessageRef::Id(summarized))
                .expect_err("a summarized message is not in the model's history");
        assert!(error.to_string().contains("summarized"), "{error}");
        assert_eq!(
            conversations(&conn),
            before,
            "a refused branch leaves no chat"
        );

        let branch =
            repository::branch_conversation(&conn, source, "user", MessageRef::Id(recent)).unwrap();
        let copied: Vec<String> = repository::list_messages(&conn, branch)
            .unwrap()
            .into_iter()
            .map(|message| message.content)
            .collect();
        assert_eq!(copied, vec!["summary of the old turns", "recent question"]);
        let branch_point: i64 = conn
            .query_row(
                "SELECT branch_point_message_id FROM conversations WHERE id = ?1",
                [branch],
                |row| row.get(0),
            )
            .unwrap();
        let newest: i64 = conn
            .query_row(
                "SELECT MAX(id) FROM messages WHERE conversation_id = ?1",
                [branch],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(branch_point, newest);
    }

    #[test]
    fn branching_copies_history_through_the_message_and_pages_between_siblings() {
        let conn = db();
        let source =
            repository::create_conversation_with_mode(&conn, "Plan".into(), "user".into(), "local")
                .unwrap();
        add(&conn, source, MessageRole::User, "first question");
        let fork_at = add(&conn, source, MessageRole::Assistant, "first answer");
        add(
            &conn,
            source,
            MessageRole::User,
            "follow-up only in the original",
        );

        let first = repository::branch_conversation(&conn, source, "user", MessageRef::Id(fork_at))
            .unwrap();
        let second =
            repository::branch_conversation(&conn, source, "user", MessageRef::Id(fork_at))
                .unwrap();
        assert!(repository::branch_conversation(
            &conn,
            source,
            "intruder",
            MessageRef::Id(fork_at)
        )
        .is_err());

        let copied: Vec<String> = repository::list_messages(&conn, first)
            .unwrap()
            .into_iter()
            .map(|message| message.content)
            .collect();
        assert_eq!(copied, vec!["first question", "first answer"]);
        assert_eq!(
            repository::list_messages(&conn, source).unwrap().len(),
            3,
            "the original keeps every message"
        );

        let at_source = repository::list_branch_groups(&conn, source, "user").unwrap();
        assert_eq!(at_source.len(), 1);
        assert_eq!(at_source[0].message_id, fork_at);
        assert_eq!(at_source[0].conversation_ids, vec![source, first, second]);
        assert_eq!(at_source[0].active_index, 0);

        let at_second = repository::list_branch_groups(&conn, second, "user").unwrap();
        assert_eq!(at_second.len(), 1);
        assert_eq!(at_second[0].conversation_ids, vec![source, first, second]);
        assert_eq!(at_second[0].active_index, 2);
        let second_copy_of_fork = repository::list_messages(&conn, second).unwrap()[1].id;
        assert_eq!(at_second[0].message_id, second_copy_of_fork);

        assert!(repository::list_branch_groups(&conn, source, "intruder")
            .unwrap()
            .is_empty());
    }
}
