//! Ledger of chat turns that are running, so a turn the app never finished
//! (a crash, a forced quit, a power loss) can be offered again on the next
//! launch instead of leaving a question with no reply. The ledger lives in the
//! encrypted database and holds ids only; the question is read back from its
//! message row.

use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

use super::state::AppDatabase;

const LEGACY_LEDGER_FILE_NAME: &str = "chat_turns_in_flight.json";
const MAX_PREVIEW_CHARS: usize = 2_000;

static LAUNCH_ID: Lazy<String> = Lazy::new(|| uuid::Uuid::new_v4().to_string());

fn launch_id() -> &'static str {
    LAUNCH_ID.as_str()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InFlightTurn {
    pub conversation_id: i64,
    pub user_message_id: i64,
    pub content: String,
    pub started_at: DateTime<Utc>,
}

/// Records a turn of this launch and returns its ledger row. A conversation
/// keeps one row, so a new turn replaces whatever an earlier one left.
pub(crate) fn record_started_in(
    conn: &Connection,
    launch_id: &str,
    conversation_id: i64,
    user_message_id: i64,
) -> rusqlite::Result<i64> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM chat_turns_in_flight WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    tx.execute(
        "INSERT INTO chat_turns_in_flight (conversation_id, user_message_id, launch_id, started_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            conversation_id,
            user_message_id,
            launch_id,
            Utc::now().to_rfc3339()
        ],
    )?;
    let row_id = tx.last_insert_rowid();
    tx.commit()?;
    Ok(row_id)
}

pub(crate) fn record_finished_in(conn: &Connection, row_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM chat_turns_in_flight WHERE id = ?1",
        params![row_id],
    )?;
    Ok(())
}

/// Turns a previous launch started and never finished, with the question read
/// from its message row.
pub(crate) fn interrupted_in(
    conn: &Connection,
    launch_id: &str,
) -> rusqlite::Result<Vec<InFlightTurn>> {
    let mut stmt = conn.prepare(
        "SELECT t.conversation_id, t.user_message_id, m.content, t.started_at
         FROM chat_turns_in_flight t
         JOIN messages m ON m.id = t.user_message_id AND m.conversation_id = t.conversation_id
         WHERE t.launch_id != ?1
         ORDER BY t.started_at ASC, t.id ASC",
    )?;
    let rows = stmt.query_map(params![launch_id], |row| {
        let content: String = row.get(2)?;
        let started_at: String = row.get(3)?;
        Ok(InFlightTurn {
            conversation_id: row.get(0)?,
            user_message_id: row.get(1)?,
            content: content.chars().take(MAX_PREVIEW_CHARS).collect(),
            started_at: DateTime::parse_from_rfc3339(&started_at)
                .map(|at| at.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        })
    })?;
    rows.collect()
}

pub(crate) fn dismiss_in(
    conn: &Connection,
    launch_id: &str,
    conversation_id: i64,
) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM chat_turns_in_flight WHERE conversation_id = ?1 AND launch_id != ?2",
        params![conversation_id, launch_id],
    )?;
    Ok(())
}

/// Launch housekeeping: deletes the plaintext ledger file earlier builds
/// wrote outside the encrypted database, and settles messages an edit or a
/// regenerate set aside when the previous run ended before the new turn did.
pub(crate) fn recover_at_launch(conn: &Connection) {
    if let Ok(dir) = crate::sys::utils::app_data_dir() {
        let legacy = dir.join(LEGACY_LEDGER_FILE_NAME);
        if legacy.exists() {
            match std::fs::remove_file(&legacy) {
                Ok(()) => info!("[Chat] Removed the plaintext in-flight turn ledger"),
                Err(error) => {
                    warn!("[Chat] Could not remove the plaintext in-flight turn ledger: {error}")
                }
            }
        }
    }
    if let Err(error) = super::superseded::recover_superseded(conn, launch_id()) {
        warn!("[Chat] Could not settle replaced messages left by the previous run: {error}");
    }
}

/// One chat turn of this launch. It counts as running from [`ChatTurn::begin`]
/// until it is dropped, which the streaming paths do only after their task
/// has emitted the turn's final event; a mid-turn error event does not end it.
/// When the conversation's last running turn ends, its unsent steers go.
pub(crate) struct ChatTurn {
    conversation_id: i64,
    ledger: Option<(AppDatabase, i64)>,
}

impl ChatTurn {
    pub(crate) fn begin(conversation_id: i64) -> Self {
        super::state::mark_turn_running(conversation_id);
        Self {
            conversation_id,
            ledger: None,
        }
    }

    pub(crate) fn conversation_id(&self) -> i64 {
        self.conversation_id
    }

    /// Writes the turn to the ledger once its question has a message row.
    pub(crate) fn record_persisted(&mut self, db: &AppDatabase, user_message_id: i64) {
        let recorded = db.connection().and_then(|conn| {
            record_started_in(&conn, launch_id(), self.conversation_id, user_message_id)
                .map_err(|error| error.to_string())
        });
        match recorded {
            Ok(row_id) => self.ledger = Some((db.clone(), row_id)),
            Err(error) => warn!("[Chat] Failed to record the in-flight turn: {error}"),
        }
    }
}

impl Drop for ChatTurn {
    fn drop(&mut self) {
        if super::state::mark_turn_finished(self.conversation_id) {
            super::pending::discard_pending_messages_for_conversation(self.conversation_id);
        }
        if let Some((db, row_id)) = self.ledger.take() {
            let finished = db.connection().and_then(|conn| {
                record_finished_in(&conn, row_id).map_err(|error| error.to_string())
            });
            if let Err(error) = finished {
                warn!("[Chat] Failed to clear the in-flight turn: {error}");
            }
        }
    }
}

#[tauri::command]
pub async fn chat_list_interrupted_turns(
    db: State<'_, AppDatabase>,
) -> Result<Vec<InFlightTurn>, String> {
    let conn = db.connection()?;
    interrupted_in(&conn, launch_id())
        .map_err(|error| format!("Could not read interrupted turns: {error}"))
}

#[tauri::command]
pub async fn chat_dismiss_interrupted_turn(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
) -> Result<(), String> {
    let conn = db.connection()?;
    dismiss_in(&conn, launch_id(), conversation_id)
        .map_err(|error| format!("Could not dismiss the interrupted turn: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::models::{Message, MessageRole};
    use crate::data::db::{repository, Database};

    const PREVIOUS: &str = "previous-launch";
    const CURRENT: &str = "current-launch";

    fn conversation_with_question(conn: &Connection, question: &str) -> (i64, i64) {
        let conversation_id =
            repository::create_conversation(conn, "Turns".to_string(), "user-1".to_string())
                .expect("conversation");
        let message_id = repository::create_message(
            conn,
            &Message::new(
                conversation_id,
                "user-1".to_string(),
                MessageRole::User,
                question.to_string(),
            ),
        )
        .expect("message");
        (conversation_id, message_id)
    }

    #[test]
    fn a_turn_left_by_a_previous_launch_is_interrupted_with_its_question() {
        let db = Database::in_memory().expect("db");
        let conn = db.get_connection();
        let conn = conn.lock().expect("lock");
        let (conversation_id, message_id) =
            conversation_with_question(&conn, "summarise the report");
        record_started_in(&conn, PREVIOUS, conversation_id, message_id).expect("recorded");

        let interrupted = interrupted_in(&conn, CURRENT).expect("listed");

        assert_eq!(interrupted.len(), 1);
        assert_eq!(interrupted[0].conversation_id, conversation_id);
        assert_eq!(interrupted[0].user_message_id, message_id);
        assert_eq!(interrupted[0].content, "summarise the report");
    }

    #[test]
    fn the_ledger_stores_ids_and_no_message_text() {
        let db = Database::in_memory().expect("db");
        let conn = db.get_connection();
        let conn = conn.lock().expect("lock");
        let (conversation_id, message_id) = conversation_with_question(&conn, "private question");
        record_started_in(&conn, CURRENT, conversation_id, message_id).expect("recorded");

        let mut stmt = conn
            .prepare("SELECT * FROM chat_turns_in_flight")
            .expect("prepare");
        let columns: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|name| name.to_string())
            .collect();
        assert!(!columns.iter().any(|column| column == "content"));
        let stored: Vec<String> = stmt
            .query_map([], |row| {
                (0..columns.len())
                    .map(|index| row.get::<_, rusqlite::types::Value>(index))
                    .collect::<rusqlite::Result<Vec<_>>>()
                    .map(|values| format!("{values:?}"))
            })
            .expect("query")
            .collect::<rusqlite::Result<_>>()
            .expect("rows");
        assert!(stored.iter().all(|row| !row.contains("private question")));
    }

    #[test]
    fn a_turn_running_now_is_not_interrupted_and_clears_when_it_finishes() {
        let db = Database::in_memory().expect("db");
        let conn = db.get_connection();
        let conn = conn.lock().expect("lock");
        let (conversation_id, message_id) = conversation_with_question(&conn, "hello");

        let row_id =
            record_started_in(&conn, CURRENT, conversation_id, message_id).expect("recorded");

        assert!(interrupted_in(&conn, CURRENT).expect("listed").is_empty());
        record_finished_in(&conn, row_id).expect("finished");
        assert!(interrupted_in(&conn, PREVIOUS).expect("listed").is_empty());
    }

    #[test]
    fn finishing_a_new_turn_keeps_the_interrupted_one_until_dismissed() {
        let db = Database::in_memory().expect("db");
        let conn = db.get_connection();
        let conn = conn.lock().expect("lock");
        let (old_conversation, old_message) = conversation_with_question(&conn, "old");
        let (new_conversation, new_message) = conversation_with_question(&conn, "new");
        record_started_in(&conn, PREVIOUS, old_conversation, old_message).expect("recorded");

        let row_id =
            record_started_in(&conn, CURRENT, new_conversation, new_message).expect("recorded");
        record_finished_in(&conn, row_id).expect("finished");
        assert_eq!(interrupted_in(&conn, CURRENT).expect("listed").len(), 1);

        dismiss_in(&conn, CURRENT, old_conversation).expect("dismissed");
        assert!(interrupted_in(&conn, CURRENT).expect("listed").is_empty());
    }

    #[test]
    fn the_last_turn_ending_drops_its_unsent_steers() {
        use crate::sys::commands::chat::pending::PendingUserMessage;
        use crate::sys::commands::chat::state::PENDING_MESSAGES;
        let steer = |id: &str| PendingUserMessage {
            id: id.to_string(),
            content: "steer".to_string(),
            timestamp: Utc::now(),
            conversation_id: Some(8_931),
        };

        let first = ChatTurn::begin(8_931);
        let second = ChatTurn::begin(8_931);
        PENDING_MESSAGES
            .lock()
            .expect("queue")
            .push(steer("late-steer"));

        drop(first);
        assert!(crate::sys::commands::chat::has_pending_messages_for_conversation(8_931));
        drop(second);
        assert!(!crate::sys::commands::chat::has_pending_messages_for_conversation(8_931));
    }

    #[test]
    fn restarting_a_conversation_replaces_its_interrupted_turn() {
        let db = Database::in_memory().expect("db");
        let conn = db.get_connection();
        let conn = conn.lock().expect("lock");
        let (conversation_id, message_id) = conversation_with_question(&conn, "first try");
        record_started_in(&conn, PREVIOUS, conversation_id, message_id).expect("recorded");

        record_started_in(&conn, CURRENT, conversation_id, message_id).expect("recorded");

        assert!(interrupted_in(&conn, CURRENT).expect("listed").is_empty());
    }
}
