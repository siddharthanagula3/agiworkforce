use rusqlite::{Connection, Result};
use std::sync::{Arc, Mutex};

pub mod encryption;
pub mod migrations;
pub mod models;
pub mod repository;

pub use models::{
    AutomationHistory, Conversation, ConversationBranch, Message, MessageRole, OverlayEvent,
    OverlayEventType, PaginatedOverlayEvents, Setting, TaskType,
};

pub use repository::{
    archive_conversation, create_automation_history, create_branch, create_conversation,
    create_message, create_overlay_event, delete_branch, delete_conversation, delete_message,
    delete_overlay_events_before, delete_setting, get_automation_history, get_automation_stats,
    get_conversation, get_message, get_overlay_event, get_setting, list_automation_history,
    list_branches, list_conversations, list_messages, list_messages_by_branch, list_overlay_events,
    list_settings, set_setting, update_conversation_title, update_message_content,
};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA cache_size = -64000;
            PRAGMA temp_store = MEMORY;
        ",
        )?;
        migrations::run_migrations(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        migrations::run_migrations(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn with_connection<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let conn = self.conn.lock().map_err(|_e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY),
                Some("Database mutex poisoned".to_string()),
            )
        })?;
        f(&conn)
    }

    pub fn get_connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    pub fn create_conversation(&self, title: String, user_id: String) -> Result<i64> {
        self.with_connection(|conn| repository::create_conversation(conn, title, user_id))
    }

    pub fn get_conversation(&self, id: i64, user_id: &str) -> Result<Conversation> {
        self.with_connection(|conn| repository::get_conversation(conn, id, user_id))
    }

    pub fn list_conversations(
        &self,
        limit: i64,
        offset: i64,
        user_id: &str,
    ) -> Result<Vec<Conversation>> {
        self.with_connection(|conn| repository::list_conversations(conn, limit, offset, user_id))
    }

    pub fn update_conversation_title(&self, id: i64, user_id: &str, title: String) -> Result<()> {
        self.with_connection(|conn| repository::update_conversation_title(conn, id, user_id, title))
    }

    pub fn delete_conversation(&self, id: i64, user_id: &str) -> Result<()> {
        self.with_connection(|conn| repository::delete_conversation(conn, id, user_id).map(|_| ()))
    }

    pub fn create_message(&self, message: &Message) -> Result<i64> {
        self.with_connection(|conn| repository::create_message(conn, message))
    }

    pub fn get_message(&self, id: i64) -> Result<Message> {
        self.with_connection(|conn| repository::get_message(conn, id))
    }

    pub fn list_messages(&self, conversation_id: i64) -> Result<Vec<Message>> {
        self.with_connection(|conn| repository::list_messages(conn, conversation_id))
    }

    pub fn delete_message(&self, id: i64) -> Result<()> {
        self.with_connection(|conn| repository::delete_message(conn, id))
    }

    pub fn update_message_content(&self, id: i64, content: String) -> Result<Message> {
        self.with_connection(|conn| repository::update_message_content(conn, id, content))
    }

    pub fn set_setting(&self, key: String, value: String, encrypted: bool) -> Result<()> {
        self.with_connection(|conn| repository::set_setting(conn, key, value, encrypted))
    }

    pub fn get_setting(&self, key: &str) -> Result<Setting> {
        self.with_connection(|conn| repository::get_setting(conn, key))
    }

    pub fn list_settings(&self) -> Result<Vec<Setting>> {
        self.with_connection(repository::list_settings)
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.with_connection(|conn| repository::delete_setting(conn, key))
    }

    pub fn create_automation_history(&self, history: &AutomationHistory) -> Result<i64> {
        self.with_connection(|conn| repository::create_automation_history(conn, history))
    }

    pub fn get_automation_history(&self, id: i64) -> Result<AutomationHistory> {
        self.with_connection(|conn| repository::get_automation_history(conn, id))
    }

    pub fn list_automation_history(
        &self,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AutomationHistory>> {
        self.with_connection(|conn| repository::list_automation_history(conn, limit, offset))
    }

    pub fn get_automation_stats(&self) -> Result<(i64, i64, f64, f64)> {
        self.with_connection(repository::get_automation_stats)
    }

    pub fn create_overlay_event(&self, event: &OverlayEvent) -> Result<i64> {
        self.with_connection(|conn| repository::create_overlay_event(conn, event))
    }

    pub fn get_overlay_event(&self, id: i64) -> Result<OverlayEvent> {
        self.with_connection(|conn| repository::get_overlay_event(conn, id))
    }

    /// AUDIT-004-001 fix: List overlay events with required pagination.
    ///
    /// # Arguments
    /// * `start_time` - Optional start time filter (inclusive)
    /// * `end_time` - Optional end time filter (inclusive)
    /// * `limit` - Required limit, clamped to MAX_OVERLAY_EVENTS_LIMIT (1000)
    /// * `offset` - Optional offset for pagination (defaults to 0)
    pub fn list_overlay_events(
        &self,
        start_time: Option<chrono::DateTime<chrono::Utc>>,
        end_time: Option<chrono::DateTime<chrono::Utc>>,
        limit: i64,
        offset: Option<i64>,
    ) -> Result<PaginatedOverlayEvents> {
        self.with_connection(|conn| {
            repository::list_overlay_events(conn, start_time, end_time, limit, offset)
        })
    }

    pub fn delete_overlay_events_before(
        &self,
        before: chrono::DateTime<chrono::Utc>,
    ) -> Result<usize> {
        self.with_connection(|conn| repository::delete_overlay_events_before(conn, before))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_creation() {
        let db = Database::in_memory().unwrap();

        let conv_id = db
            .create_conversation("Test".to_string(), "test_user".to_string())
            .unwrap();
        assert!(conv_id > 0);

        let conv = db.get_conversation(conv_id, "test_user").unwrap();
        assert_eq!(conv.title, "Test");
    }

    #[test]
    fn test_full_workflow() {
        let db = Database::in_memory().unwrap();

        let conv_id = db
            .create_conversation("Test Chat".to_string(), "test_user".to_string())
            .unwrap();

        let msg1 = Message::new(
            conv_id,
            "test_user".to_string(),
            MessageRole::User,
            "Hello".to_string(),
        );
        let msg1_id = db.create_message(&msg1).unwrap();

        let msg2 = Message::new(
            conv_id,
            "test_user".to_string(),
            MessageRole::Assistant,
            "Hi there!".to_string(),
        )
        .with_metrics(10, 0.001);
        let msg2_id = db.create_message(&msg2).unwrap();

        let mut messages = db.list_messages(conv_id).unwrap();
        messages.sort_by_key(|m| m.id);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].id, msg1_id);
        assert_eq!(messages[1].id, msg2_id);

        db.update_conversation_title(conv_id, "test_user", "Updated Chat".to_string())
            .unwrap();
        let conv = db.get_conversation(conv_id, "test_user").unwrap();
        assert_eq!(conv.title, "Updated Chat");

        let history = AutomationHistory::new(TaskType::WindowsAutomation, true, 150);
        let history_id = db.create_automation_history(&history).unwrap();
        assert!(history_id > 0);

        let (total, successful, _avg_duration, _total_cost) = db.get_automation_stats().unwrap();
        assert!(total >= 1);
        assert!(successful >= 1);
    }
}
