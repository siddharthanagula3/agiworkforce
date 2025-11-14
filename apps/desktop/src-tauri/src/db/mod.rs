use rusqlite::{Connection, Result};
use std::sync::{Arc, Mutex};

pub mod migrations;
pub mod models;
pub mod repository;

// Re-export commonly used types
pub use models::{
    AutomationHistory, Conversation, Message, MessageRole, OverlayEvent, OverlayEventType, Setting,
    TaskType,
};

pub use repository::{
    create_automation_history, create_conversation, create_message, create_overlay_event,
    delete_conversation, delete_message, delete_overlay_events_before, delete_setting,
    get_automation_history, get_automation_stats, get_conversation, get_message, get_overlay_event,
    get_setting, list_automation_history, list_conversations, list_messages, list_overlay_events,
    list_settings, set_setting, update_conversation_title, update_message_content,
};

/// Thread-safe database connection wrapper
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Create a new database connection at the specified path
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        migrations::run_migrations(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Create an in-memory database (for testing)
    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        migrations::run_migrations(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Execute a function with the database connection
    pub fn with_connection<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let conn = self
            .conn
            .lock()
            .map_err(|_e| rusqlite::Error::InvalidQuery)?;
        f(&conn)
    }

    /// Get a clone of the Arc<Mutex<Connection>> for external use
    /// This is useful when you need to pass the connection to other components
    pub fn get_connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    // Conversation methods
    pub fn create_conversation(&self, title: String) -> Result<i64> {
        self.with_connection(|conn| repository::create_conversation(conn, title))
    }

    pub fn get_conversation(&self, id: i64) -> Result<Conversation> {
        self.with_connection(|conn| repository::get_conversation(conn, id))
    }

    pub fn list_conversations(&self, limit: i64, offset: i64) -> Result<Vec<Conversation>> {
        self.with_connection(|conn| repository::list_conversations(conn, limit, offset))
    }

    pub fn update_conversation_title(&self, id: i64, title: String) -> Result<()> {
        self.with_connection(|conn| repository::update_conversation_title(conn, id, title))
    }

    pub fn delete_conversation(&self, id: i64) -> Result<()> {
        self.with_connection(|conn| repository::delete_conversation(conn, id))
    }

    // Message methods
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

    // Settings methods
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

    // Automation history methods
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

    // Overlay events methods
    pub fn create_overlay_event(&self, event: &OverlayEvent) -> Result<i64> {
        self.with_connection(|conn| repository::create_overlay_event(conn, event))
    }

    pub fn get_overlay_event(&self, id: i64) -> Result<OverlayEvent> {
        self.with_connection(|conn| repository::get_overlay_event(conn, id))
    }

    pub fn list_overlay_events(
        &self,
        start_time: Option<chrono::DateTime<chrono::Utc>>,
        end_time: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Result<Vec<OverlayEvent>> {
        self.with_connection(|conn| repository::list_overlay_events(conn, start_time, end_time))
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

        // Test conversation creation
        let conv_id = db.create_conversation("Test".to_string()).unwrap();
        assert!(conv_id > 0);

        // Test conversation retrieval
        let conv = db.get_conversation(conv_id).unwrap();
        assert_eq!(conv.title, "Test");
    }

    #[test]
    fn test_full_workflow() {
        let db = Database::in_memory().unwrap();

        // Create conversation
        let conv_id = db.create_conversation("Test Chat".to_string()).unwrap();

        // Add messages
        let msg1 = Message::new(conv_id, MessageRole::User, "Hello".to_string());
        let msg1_id = db.create_message(&msg1).unwrap();

        let msg2 = Message::new(conv_id, MessageRole::Assistant, "Hi there!".to_string())
            .with_metrics(10, 0.001);
        let msg2_id = db.create_message(&msg2).unwrap();

        // List messages
        let messages = db.list_messages(conv_id).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].id, msg1_id);
        assert_eq!(messages[1].id, msg2_id);

        // Update conversation title
        db.update_conversation_title(conv_id, "Updated Chat".to_string())
            .unwrap();
        let conv = db.get_conversation(conv_id).unwrap();
        assert_eq!(conv.title, "Updated Chat");

        // Create automation history
        let history = AutomationHistory::new(TaskType::WindowsAutomation, true, 150);
        let history_id = db.create_automation_history(&history).unwrap();
        assert!(history_id > 0);

        // Get stats
        let (total, successful, avg_duration, _total_cost) = db.get_automation_stats().unwrap();
        assert_eq!(total, 1);
        assert_eq!(successful, 1);
        assert_eq!(avg_duration, 150.0);
    }
}
