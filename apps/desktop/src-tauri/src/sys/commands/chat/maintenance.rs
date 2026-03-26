use super::*;

#[tauri::command]
pub fn clear_local_database(db: State<'_, AppDatabase>) -> Result<(), String> {
    clear_local_database_inner(db.inner())?;
    Ok(())
}

pub(super) fn clear_local_database_inner(db: &AppDatabase) -> Result<(), String> {
    let conn = db.connection()?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start database reset transaction: {e}"))?;

    // Each DELETE statement is a static string literal to prevent any possibility
    // of SQL injection. Never use format!() to build SQL, even with hardcoded names.
    for (table_name, sql) in [
        ("messages", "DELETE FROM messages"),
        ("conversations", "DELETE FROM conversations"),
        ("automation_history", "DELETE FROM automation_history"),
        ("command_history", "DELETE FROM command_history"),
        ("clipboard_history", "DELETE FROM clipboard_history"),
        ("overlay_events", "DELETE FROM overlay_events"),
        ("settings", "DELETE FROM settings"),
        ("settings_v2", "DELETE FROM settings_v2"),
    ] {
        tx.execute(sql, [])
            .map_err(|e| format!("Failed to clear {table_name}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit database reset: {e}"))?;

    if let Ok(mut queue) = PENDING_MESSAGES.lock() {
        queue.clear();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::clear_local_database_inner;
    use crate::data::db::{
        models::{Message, MessageRole},
        repository, Database,
    };
    use crate::sys::commands::chat::{
        pending::PendingUserMessage,
        pending_messages_count,
        state::{AppDatabase, PENDING_MESSAGES},
    };
    use chrono::Utc;

    fn test_db() -> AppDatabase {
        let db = Database::in_memory().expect("in-memory db");
        AppDatabase {
            conn: db.get_connection(),
        }
    }

    #[test]
    fn clear_local_database_inner_clears_persisted_rows_and_pending_queue() {
        let db = test_db();
        let user_id = "test-user";

        {
            let conn = db.connection().expect("db connection");
            let conversation_id = repository::create_conversation(
                &conn,
                "Reset Test".to_string(),
                user_id.to_string(),
            )
            .expect("conversation");
            repository::create_message(
                &conn,
                &Message::new(
                    conversation_id,
                    user_id.to_string(),
                    MessageRole::User,
                    "hello".to_string(),
                ),
            )
            .expect("message");
            repository::set_setting(&conn, "theme".to_string(), "dark".to_string(), false)
                .expect("setting");
            conn.execute(
                "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    "ui.theme",
                    "\"dark\"",
                    "ui",
                    0,
                    "2026-03-12 00:00:00",
                    "2026-03-12 00:00:00"
                ],
            )
            .expect("settings_v2");
        }

        if let Ok(mut queue) = PENDING_MESSAGES.lock() {
            queue.push(PendingUserMessage {
                id: "pending-1".to_string(),
                content: "queued".to_string(),
                timestamp: Utc::now(),
                conversation_id: None,
            });
        }

        clear_local_database_inner(&db).expect("clear database");

        let conn = db.connection().expect("db connection");
        let message_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
            .expect("message count");
        let conversation_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))
            .expect("conversation count");
        let settings_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .expect("settings count");
        let settings_v2_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings_v2", [], |row| row.get(0))
            .expect("settings_v2 count");

        assert_eq!(message_count, 0);
        assert_eq!(conversation_count, 0);
        assert_eq!(settings_count, 0);
        assert_eq!(settings_v2_count, 0);
        assert_eq!(pending_messages_count(), 0);
    }
}
