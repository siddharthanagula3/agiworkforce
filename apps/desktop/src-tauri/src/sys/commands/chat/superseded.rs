//! Messages an edit or a regenerate replaces. The chat loop rebuilds the
//! model's history from SQLite, so the replaced rows have to leave the history
//! before the new turn is sent. They stay in the table marked with
//! `superseded_key`, which every history load skips, until the new turn
//! produces output and they are deleted, or it fails first and the mark is
//! cleared. A row the cloud already holds is tombstoned instead, keeping its
//! mark so the history still skips it, so the next sync deletes the server copy. A launch finds rows a crash left marked and settles them.

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use tracing::info;

use super::state::AppDatabase;

/// Marks the named messages of `conversation_id` as replaced under `key` and
/// returns how many rows it marked. Only the owner's conversation is touched.
pub(crate) fn supersede_messages(
    conn: &Connection,
    conversation_id: i64,
    user_id: &str,
    ids: &[i64],
    client_ids: &[String],
    key: &str,
) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let owned: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM conversations WHERE id = ?1 AND user_id = ?2)",
        params![conversation_id, user_id],
        |row| row.get(0),
    )?;
    if !owned {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }

    let mut message_ids: Vec<i64> = ids.to_vec();
    for client_id in client_ids {
        let found: Option<i64> = tx
            .query_row(
                "SELECT id FROM messages WHERE client_id = ?1 AND conversation_id = ?2",
                params![client_id, conversation_id],
                |row| row.get(0),
            )
            .optional()?;
        message_ids.extend(found);
    }
    for id in &message_ids {
        let in_conversation: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE id = ?1 AND conversation_id = ?2)",
            params![id, conversation_id],
            |row| row.get(0),
        )?;
        if in_conversation && crate::data::db::repository::message_compaction(&tx, *id)?.is_some() {
            return Err(crate::data::db::repository::compaction_refusal(
                "edited or retried",
            ));
        }
    }

    let mut marked = 0;
    for id in message_ids {
        marked += tx.execute(
            "UPDATE messages SET superseded_key = ?1
             WHERE id = ?2 AND conversation_id = ?3 AND superseded_key IS NULL",
            params![key, id, conversation_id],
        )?;
    }
    tx.commit()?;
    Ok(marked)
}

/// Returns the rows marked under `key` to the history.
pub(crate) fn restore_superseded(conn: &Connection, key: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE messages SET superseded_key = NULL
         WHERE superseded_key = ?1 AND deleted_at_utc IS NULL",
        params![key],
    )
}

/// Deletes the rows marked under `key`, with everything that cascades from them.
/// A row that has a `cloud_id` is tombstoned for the next push instead, so the
/// server copy is deleted too; its mark stays so the history keeps skipping it.
pub(crate) fn release_superseded(conn: &Connection, key: &str) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let tombstoned = tx.execute(
        "UPDATE messages SET deleted_at_utc = CURRENT_TIMESTAMP, needs_push = 1
         WHERE superseded_key = ?1 AND cloud_id IS NOT NULL AND deleted_at_utc IS NULL",
        params![key],
    )?;
    let deleted = tx.execute(
        "DELETE FROM messages WHERE superseded_key = ?1 AND cloud_id IS NULL",
        params![key],
    )?;
    tx.commit()?;
    Ok(tombstoned + deleted)
}

/// What a launch did with rows a previous run left marked.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct SupersededRecovery {
    pub restored: usize,
    pub released: usize,
}

/// Settles rows a previous run left marked. The replacing turn finished when
/// the conversation has a reply newer than every replaced row, other than a
/// summary compaction wrote, and no turn of
/// a previous run is still recorded as running in it; its replaced rows are
/// deleted. Otherwise the turn never finished and the rows go back.
pub(crate) fn recover_superseded(
    conn: &Connection,
    current_launch_id: &str,
) -> rusqlite::Result<SupersededRecovery> {
    let marked: Vec<(String, i64, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT superseded_key, conversation_id, MAX(id) FROM messages
             WHERE superseded_key IS NOT NULL AND deleted_at_utc IS NULL
             GROUP BY superseded_key, conversation_id",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
        rows.collect::<rusqlite::Result<_>>()?
    };

    let mut recovery = SupersededRecovery::default();
    for (key, conversation_id, newest_replaced_id) in marked {
        let replied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM messages reply
                 WHERE reply.conversation_id = ?1 AND reply.id > ?2
                   AND reply.role = 'assistant' AND reply.superseded_key IS NULL
                   AND NOT EXISTS(SELECT 1 FROM messages summarized
                                  WHERE summarized.compacted_into = reply.id))",
            params![conversation_id, newest_replaced_id],
            |row| row.get(0),
        )?;
        let interrupted: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM chat_turns_in_flight
                 WHERE conversation_id = ?1 AND launch_id != ?2)",
            params![conversation_id, current_launch_id],
            |row| row.get(0),
        )?;
        if replied && !interrupted {
            recovery.released += release_superseded(conn, &key)?;
        } else {
            recovery.restored += restore_superseded(conn, &key)?;
        }
    }
    if recovery != SupersededRecovery::default() {
        info!(
            "[Chat] Settled replaced messages left by the previous run: {} restored, {} deleted",
            recovery.restored, recovery.released
        );
    }
    Ok(recovery)
}

/// Takes the replaced messages out of the conversation's history before a new
/// turn is sent, and returns a key to put them back with.
#[tauri::command]
pub fn chat_supersede_messages(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
    ids: Vec<i64>,
    client_ids: Vec<String>,
) -> Result<String, String> {
    let conn = db.connection()?;
    let key = uuid::Uuid::new_v4().to_string();
    supersede_messages(&conn, conversation_id, &user_id, &ids, &client_ids, &key)
        .map_err(|e| format!("Could not set the replaced messages aside: {e}"))?;
    Ok(key)
}

/// Puts superseded messages back after the turn that replaced them failed.
#[tauri::command]
pub fn chat_restore_superseded_messages(
    db: State<'_, AppDatabase>,
    key: String,
) -> Result<(), String> {
    let conn = db.connection()?;
    restore_superseded(&conn, &key)
        .map(|_| ())
        .map_err(|e| format!("Could not restore the replaced messages: {e}"))
}

/// Deletes superseded messages once the turn that replaced them produced output.
#[tauri::command]
pub fn chat_release_superseded_messages(
    db: State<'_, AppDatabase>,
    key: String,
) -> Result<(), String> {
    let conn = db.connection()?;
    release_superseded(&conn, &key)
        .map(|_| ())
        .map_err(|e| format!("Could not delete the replaced messages: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::models::{Message, MessageRole};
    use crate::data::db::{repository, Database};

    const KEY: &str = "edit-1";

    fn add_message(conn: &Connection, conversation_id: i64, role: MessageRole, text: &str) -> i64 {
        repository::create_message(
            conn,
            &Message::new(
                conversation_id,
                "user-1".to_string(),
                role,
                text.to_string(),
            ),
        )
        .expect("message row")
    }

    fn conversation_with_turn() -> (Database, i64, i64, i64) {
        let db = Database::in_memory().expect("in-memory db");
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        let conversation_id =
            repository::create_conversation(&conn, "Edit".to_string(), "user-1".to_string())
                .expect("conversation");
        let user_id = add_message(&conn, conversation_id, MessageRole::User, "old question");
        let assistant_id =
            add_message(&conn, conversation_id, MessageRole::Assistant, "old answer");
        drop(conn);
        (db, conversation_id, user_id, assistant_id)
    }

    fn row_count(conn: &Connection, conversation_id: i64) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .expect("count")
    }

    #[test]
    fn a_summarized_message_and_its_summary_cannot_be_replaced() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        let recent = add_message(&conn, conversation_id, MessageRole::User, "recent question");
        conn.execute(
            "UPDATE messages SET compacted_into = ?1 WHERE id = ?2",
            params![assistant_id, user_id],
        )
        .expect("mark summarized");

        for target in [user_id, assistant_id] {
            let error = supersede_messages(&conn, conversation_id, "user-1", &[target], &[], KEY)
                .expect_err("a summarized message or its summary stays");
            assert!(error.to_string().contains("summarized"), "{error}");
        }
        assert_eq!(
            supersede_messages(&conn, conversation_id, "user-1", &[recent], &[], KEY)
                .expect("a later message is replaced"),
            1
        );
        assert_eq!(
            repository::list_messages_with_detail(&conn, conversation_id)
                .expect("transcript")
                .into_iter()
                .map(|row| row.compaction)
                .collect::<Vec<_>>(),
            vec![Some("summarized".to_string()), Some("summary".to_string())]
        );
    }

    #[test]
    fn deleting_a_summary_returns_its_messages_to_the_history() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        let summary = add_message(&conn, conversation_id, MessageRole::Assistant, "summary");
        conn.execute(
            "UPDATE messages SET compacted_into = ?1 WHERE id IN (?2, ?3)",
            params![summary, user_id, assistant_id],
        )
        .expect("mark summarized");
        assert_eq!(
            repository::list_messages(&conn, conversation_id)
                .expect("list")
                .len(),
            1
        );

        let deleted = repository::delete_message_for_user(
            &conn,
            conversation_id,
            repository::MessageRef::Id(summary),
            "user-1",
        )
        .expect("delete the summary");
        assert_eq!(deleted, 1);

        let history: Vec<i64> = repository::list_messages(&conn, conversation_id)
            .expect("list")
            .into_iter()
            .map(|message| message.id)
            .collect();
        assert_eq!(history, vec![user_id, assistant_id]);
        assert!(
            repository::list_messages_with_detail(&conn, conversation_id)
                .expect("transcript")
                .iter()
                .all(|row| row.compaction.is_none())
        );
    }

    #[test]
    fn superseded_rows_leave_the_history_but_stay_stored() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");

        let marked = supersede_messages(
            &conn,
            conversation_id,
            "user-1",
            &[user_id, assistant_id],
            &[],
            KEY,
        )
        .expect("marked");

        assert_eq!(marked, 2);
        assert!(repository::list_messages(&conn, conversation_id)
            .expect("list")
            .is_empty());
        assert!(
            repository::list_messages_with_detail(&conn, conversation_id)
                .expect("list")
                .is_empty()
        );
        assert_eq!(row_count(&conn, conversation_id), 2);
    }

    #[test]
    fn a_failed_turn_gets_the_exact_rows_back() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        let before = repository::list_messages(&conn, conversation_id).expect("list");

        supersede_messages(
            &conn,
            conversation_id,
            "user-1",
            &[user_id, assistant_id],
            &[],
            KEY,
        )
        .expect("marked");
        assert_eq!(restore_superseded(&conn, KEY).expect("restored"), 2);

        let after = repository::list_messages(&conn, conversation_id).expect("list");
        assert_eq!(after.len(), 2);
        assert_eq!(after[0].id, before[0].id);
        assert_eq!(after[0].content, "old question");
        assert_eq!(after[1].id, before[1].id);
        assert_eq!(after[1].created_at, before[1].created_at);
    }

    #[test]
    fn releasing_deletes_only_the_marked_rows() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");

        supersede_messages(
            &conn,
            conversation_id,
            "user-1",
            &[user_id, assistant_id],
            &[],
            KEY,
        )
        .expect("marked");
        add_message(&conn, conversation_id, MessageRole::User, "new question");

        assert_eq!(release_superseded(&conn, KEY).expect("released"), 2);
        assert_eq!(row_count(&conn, conversation_id), 1);
        assert_eq!(restore_superseded(&conn, KEY).expect("nothing left"), 0);
    }

    #[test]
    fn releasing_tombstones_rows_the_cloud_holds_and_deletes_the_rest() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        conn.execute(
            "UPDATE messages SET cloud_id = 'cloud-1', needs_push = 0 WHERE id = ?1",
            params![assistant_id],
        )
        .expect("synced row");

        supersede_messages(
            &conn,
            conversation_id,
            "user-1",
            &[user_id, assistant_id],
            &[],
            KEY,
        )
        .expect("marked");
        assert_eq!(release_superseded(&conn, KEY).expect("released"), 2);

        let (deleted_at, needs_push, key): (Option<String>, i64, Option<String>) = conn
            .query_row(
                "SELECT deleted_at_utc, needs_push, superseded_key FROM messages WHERE id = ?1",
                params![assistant_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("tombstoned row");
        assert!(deleted_at.is_some());
        assert_eq!(needs_push, 1);
        assert_eq!(key.as_deref(), Some(KEY));
        assert_eq!(row_count(&conn, conversation_id), 1);
        assert_eq!(
            restore_superseded(&conn, KEY).expect("nothing to restore"),
            0
        );
        assert!(repository::list_messages(&conn, conversation_id)
            .expect("list")
            .is_empty());
    }

    #[test]
    fn another_users_conversation_is_left_alone() {
        let (db, conversation_id, user_id, _) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");

        assert!(
            supersede_messages(&conn, conversation_id, "someone-else", &[user_id], &[], KEY)
                .is_err()
        );
        assert_eq!(
            repository::list_messages(&conn, conversation_id)
                .expect("list")
                .len(),
            2
        );
    }

    #[test]
    fn a_launch_restores_rows_whose_replacing_turn_never_finished() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        supersede_messages(
            &conn,
            conversation_id,
            "user-1",
            &[user_id, assistant_id],
            &[],
            KEY,
        )
        .expect("marked");
        let new_question = add_message(&conn, conversation_id, MessageRole::User, "new question");
        conn.execute(
            "INSERT INTO chat_turns_in_flight (conversation_id, user_message_id, launch_id, started_at)
             VALUES (?1, ?2, 'previous-launch', '2026-10-10T00:00:00Z')",
            params![conversation_id, new_question],
        )
        .expect("in-flight row");

        let recovery = recover_superseded(&conn, "this-launch").expect("recovered");

        assert_eq!(
            recovery,
            SupersededRecovery {
                restored: 2,
                released: 0
            }
        );
        assert_eq!(
            repository::list_messages(&conn, conversation_id)
                .expect("list")
                .len(),
            3
        );
    }

    #[test]
    fn a_summary_written_during_a_failed_edit_turn_is_not_taken_for_its_reply() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        let earlier = add_message(&conn, conversation_id, MessageRole::User, "earlier turn");
        let edited = add_message(
            &conn,
            conversation_id,
            MessageRole::User,
            "question to edit",
        );
        supersede_messages(&conn, conversation_id, "user-1", &[edited], &[], KEY).expect("marked");
        add_message(&conn, conversation_id, MessageRole::User, "edited question");
        let summary = add_message(&conn, conversation_id, MessageRole::Assistant, "summary");
        conn.execute(
            "UPDATE messages SET compacted_into = ?1 WHERE id IN (?2, ?3, ?4)",
            params![summary, user_id, assistant_id, earlier],
        )
        .expect("auto-compaction summarized the older turns");

        let recovery = recover_superseded(&conn, "this-launch").expect("recovered");

        assert_eq!(
            recovery,
            SupersededRecovery {
                restored: 1,
                released: 0
            }
        );
        assert!(repository::list_messages(&conn, conversation_id)
            .expect("list")
            .iter()
            .any(|message| message.id == edited));
    }

    #[test]
    fn a_launch_deletes_rows_whose_replacing_turn_answered() {
        let (db, conversation_id, user_id, assistant_id) = conversation_with_turn();
        let conn = db.get_connection();
        let conn = conn.lock().expect("db lock");
        supersede_messages(
            &conn,
            conversation_id,
            "user-1",
            &[user_id, assistant_id],
            &[],
            KEY,
        )
        .expect("marked");
        add_message(&conn, conversation_id, MessageRole::User, "new question");
        add_message(&conn, conversation_id, MessageRole::Assistant, "new answer");

        let recovery = recover_superseded(&conn, "this-launch").expect("recovered");

        assert_eq!(
            recovery,
            SupersededRecovery {
                restored: 0,
                released: 2
            }
        );
        assert_eq!(row_count(&conn, conversation_id), 2);
    }
}
