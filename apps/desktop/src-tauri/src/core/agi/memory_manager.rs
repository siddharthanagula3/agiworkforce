//! Persistent Memory Manager for AGI Workforce
//!
//! Based on Clawdbot's two-layer memory architecture:
//! 1. Long-term memory: Curated facts, preferences, decisions (user_memory table)
//! 2. Daily logs: Append-only context logs (daily_logs table)
//!
//! This provides cross-session memory persistence for the AGI.

use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

use crate::sys::error::{Error, Result};

/// Categories for organizing memories
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryCategory {
    Preference,
    Fact,
    Decision,
    Context,
}

impl MemoryCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryCategory::Preference => "Preference",
            MemoryCategory::Fact => "Fact",
            MemoryCategory::Decision => "Decision",
            MemoryCategory::Context => "Context",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "Preference" => Some(MemoryCategory::Preference),
            "Fact" => Some(MemoryCategory::Fact),
            "Decision" => Some(MemoryCategory::Decision),
            "Context" => Some(MemoryCategory::Context),
            _ => None,
        }
    }
}

/// A single memory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub category: MemoryCategory,
    pub topic: String,
    pub content: String,
    pub importance: i32,
    pub source: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// A daily log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyLogEntry {
    pub id: i64,
    pub log_date: String,
    pub timestamp: String,
    pub entry_type: String,
    pub content: String,
    pub metadata: Option<String>,
}

/// Types of daily log entries
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogEntryType {
    Context,
    Action,
    Note,
    Milestone,
}

impl LogEntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogEntryType::Context => "context",
            LogEntryType::Action => "action",
            LogEntryType::Note => "note",
            LogEntryType::Milestone => "milestone",
        }
    }
}

/// Manages persistent memory across sessions
pub struct MemoryManager {
    conn: Mutex<Connection>,
}

impl MemoryManager {
    /// Create a new MemoryManager with a connection to the database
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create a MemoryManager from an existing connection path
    pub fn from_path(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Store or update a memory entry
    /// If a memory with the same category+topic exists, it will be updated
    pub fn remember(
        &self,
        category: MemoryCategory,
        topic: &str,
        content: &str,
        importance: Option<i32>,
        source: Option<&str>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let importance = importance.unwrap_or(5).clamp(1, 10);
        let category_str = category.as_str();

        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, source, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(category, topic) DO UPDATE SET
                content = excluded.content,
                importance = excluded.importance,
                source = excluded.source,
                updated_at = datetime('now')",
            params![category_str, topic, content, importance, source],
        )
        .map_err(|e| Error::Database(format!("Failed to store memory: {}", e)))?;

        let id: i64 = conn
            .query_row(
                "SELECT id FROM user_memory WHERE category = ?1 AND topic = ?2",
                params![category_str, topic],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Failed to get memory id: {}", e)))?;

        Ok(id)
    }

    /// Recall a specific memory by category and topic
    pub fn recall(&self, category: MemoryCategory, topic: &str) -> Result<Option<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let category_str = category.as_str();

        let result = conn.query_row(
            "SELECT id, category, topic, content, importance, source, created_at, updated_at
             FROM user_memory
             WHERE category = ?1 AND topic = ?2",
            params![category_str, topic],
            |row| map_memory_row(row),
        );

        match result {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(Error::Database(format!("Failed to recall memory: {}", e))),
        }
    }

    /// Search memories by query (searches topic and content)
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let search_pattern = format!("%{}%", query);
        let limit = limit as i32;

        let mut stmt = conn
            .prepare(
                "SELECT id, category, topic, content, importance, source, created_at, updated_at
                 FROM user_memory
                 WHERE content LIKE ?1 OR topic LIKE ?1
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![search_pattern, limit], |row| map_memory_row(row))
            .map_err(|e| Error::Database(format!("Failed to search memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Get all memories in a category
    pub fn get_by_category(
        &self,
        category: MemoryCategory,
        limit: Option<usize>,
    ) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let category_str = category.as_str();
        let limit = limit.unwrap_or(100) as i32;

        let mut stmt = conn
            .prepare(
                "SELECT id, category, topic, content, importance, source, created_at, updated_at
                 FROM user_memory
                 WHERE category = ?1
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![category_str, limit], |row| map_memory_row(row))
            .map_err(|e| Error::Database(format!("Failed to get memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Get high-importance memories for session initialization
    pub fn get_important_memories(&self, min_importance: i32) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, category, topic, content, importance, source, created_at, updated_at
                 FROM user_memory
                 WHERE importance >= ?1
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT 50",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![min_importance], |row| map_memory_row(row))
            .map_err(|e| Error::Database(format!("Failed to get memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Delete a memory by ID
    pub fn forget(&self, memory_id: i64) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let rows = conn
            .execute("DELETE FROM user_memory WHERE id = ?1", params![memory_id])
            .map_err(|e| Error::Database(format!("Failed to delete memory: {}", e)))?;

        Ok(rows > 0)
    }

    /// Delete a memory by category and topic
    pub fn forget_topic(&self, category: MemoryCategory, topic: &str) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let category_str = category.as_str();

        let rows = conn
            .execute(
                "DELETE FROM user_memory WHERE category = ?1 AND topic = ?2",
                params![category_str, topic],
            )
            .map_err(|e| Error::Database(format!("Failed to delete memory: {}", e)))?;

        Ok(rows > 0)
    }

    /// Append to today's daily log
    pub fn log_context(
        &self,
        content: &str,
        entry_type: LogEntryType,
        metadata: Option<&str>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let entry_type_str = entry_type.as_str();

        conn.execute(
            "INSERT INTO daily_logs (log_date, entry_type, content, metadata)
             VALUES (?1, ?2, ?3, ?4)",
            params![today, entry_type_str, content, metadata],
        )
        .map_err(|e| Error::Database(format!("Failed to log context: {}", e)))?;

        let id = conn.last_insert_rowid();
        Ok(id)
    }

    /// Get daily logs for a specific date
    pub fn get_daily_logs(&self, date: &str) -> Result<Vec<DailyLogEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, log_date, timestamp, entry_type, content, metadata
                 FROM daily_logs
                 WHERE log_date = ?1
                 ORDER BY timestamp ASC",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map(params![date], |row| {
                Ok(DailyLogEntry {
                    id: row.get(0)?,
                    log_date: row.get(1)?,
                    timestamp: row.get(2)?,
                    entry_type: row.get(3)?,
                    content: row.get(4)?,
                    metadata: row.get(5)?,
                })
            })
            .map_err(|e| Error::Database(format!("Failed to get daily logs: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect logs: {}", e)))?;

        Ok(entries)
    }

    /// Get recent context for session initialization (today + yesterday logs + important memories)
    pub fn get_session_context(&self) -> Result<String> {
        let today = Utc::now().date_naive();
        let yesterday = today.pred_opt().unwrap_or(today);

        let mut context = String::new();

        // Load today's and yesterday's logs
        for date in [yesterday, today] {
            let date_str = date.format("%Y-%m-%d").to_string();
            let logs = self.get_daily_logs(&date_str)?;
            if !logs.is_empty() {
                context.push_str(&format!("\n## {} Log\n", date_str));
                for log in logs {
                    context.push_str(&format!("[{}] {}\n", log.timestamp, log.content));
                }
            }
        }

        // Load important memories (importance >= 7)
        let important = self.get_important_memories(7)?;
        if !important.is_empty() {
            context.push_str("\n## Important Memories\n");
            for memory in important {
                context.push_str(&format!(
                    "- **{} ({})**: {}\n",
                    memory.topic,
                    memory.category.as_str(),
                    memory.content
                ));
            }
        }

        Ok(context)
    }

    /// Get all memories for export
    pub fn export_all(&self) -> Result<Vec<MemoryEntry>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, category, topic, content, importance, source, created_at, updated_at
                 FROM user_memory
                 ORDER BY category, topic",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let entries = stmt
            .query_map([], |row| map_memory_row(row))
            .map_err(|e| Error::Database(format!("Failed to export memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(entries)
    }

    /// Clear old daily logs (keep last N days)
    pub fn cleanup_old_logs(&self, keep_days: i32) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let rows = conn
            .execute(
                "DELETE FROM daily_logs
                 WHERE log_date < date('now', '-' || ?1 || ' days')",
                params![keep_days],
            )
            .map_err(|e| Error::Database(format!("Failed to cleanup logs: {}", e)))?;

        Ok(rows)
    }
}

fn map_memory_row(row: &Row<'_>) -> rusqlite::Result<MemoryEntry> {
    let category_str: String = row.get(1)?;
    let category = MemoryCategory::from_str(&category_str).unwrap_or(MemoryCategory::Context);

    Ok(MemoryEntry {
        id: row.get(0)?,
        category,
        topic: row.get(2)?,
        content: row.get(3)?,
        importance: row.get(4)?,
        source: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_db() -> (TempDir, MemoryManager) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Create the table manually for tests
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE user_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                topic TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 5,
                source TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, topic)
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE daily_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                entry_type TEXT NOT NULL DEFAULT 'context',
                content TEXT NOT NULL,
                metadata TEXT
            )",
            [],
        )
        .unwrap();
        drop(conn);

        let manager = MemoryManager::from_path(&db_path).unwrap();
        (temp_dir, manager)
    }

    #[test]
    fn test_remember_and_recall() {
        let (_temp_dir, manager) = setup_test_db();

        // Store a memory
        let id = manager
            .remember(
                MemoryCategory::Preference,
                "favorite_color",
                "blue",
                Some(8),
                None,
            )
            .unwrap();
        assert!(id > 0);

        // Recall it
        let memory = manager
            .recall(MemoryCategory::Preference, "favorite_color")
            .unwrap()
            .unwrap();
        assert_eq!(memory.content, "blue");
        assert_eq!(memory.importance, 8);
    }

    #[test]
    fn test_remember_updates_existing() {
        let (_temp_dir, manager) = setup_test_db();

        // Store initial memory
        manager
            .remember(MemoryCategory::Fact, "user_name", "Alice", Some(5), None)
            .unwrap();

        // Update it
        manager
            .remember(MemoryCategory::Fact, "user_name", "Bob", Some(7), None)
            .unwrap();

        // Should have the updated value
        let memory = manager
            .recall(MemoryCategory::Fact, "user_name")
            .unwrap()
            .unwrap();
        assert_eq!(memory.content, "Bob");
        assert_eq!(memory.importance, 7);
    }

    #[test]
    fn test_search() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .remember(
                MemoryCategory::Preference,
                "editor",
                "VSCode is preferred",
                Some(6),
                None,
            )
            .unwrap();
        manager
            .remember(MemoryCategory::Fact, "os", "Uses macOS", Some(5), None)
            .unwrap();

        let results = manager.search("preferred", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].topic, "editor");
    }

    #[test]
    fn test_log_context() {
        let (_temp_dir, manager) = setup_test_db();

        let id = manager
            .log_context("Started new session", LogEntryType::Context, None)
            .unwrap();
        assert!(id > 0);

        let today = Utc::now().format("%Y-%m-%d").to_string();
        let logs = manager.get_daily_logs(&today).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].content, "Started new session");
    }

    #[test]
    fn test_forget() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .remember(
                MemoryCategory::Decision,
                "test_decision",
                "decided to test",
                None,
                None,
            )
            .unwrap();

        let deleted = manager
            .forget_topic(MemoryCategory::Decision, "test_decision")
            .unwrap();
        assert!(deleted);

        let memory = manager
            .recall(MemoryCategory::Decision, "test_decision")
            .unwrap();
        assert!(memory.is_none());
    }
}
