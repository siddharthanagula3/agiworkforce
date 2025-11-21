use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncAction {
    Create,
    Update,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncEntity {
    Conversation,
    Message,
    Project,
    Memory,
    Settings,
    Artifact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub id: String,
    pub entity_type: SyncEntity,
    pub entity_id: String,
    pub action: SyncAction,
    pub data: Option<String>, // JSON serialized entity data
    pub timestamp: String,
    pub retry_count: u32,
    pub synced: bool,
    pub error: Option<String>,
}

pub struct SyncQueue {
    db_path: PathBuf,
}

impl SyncQueue {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let queue = Self { db_path };
        queue.init_database()?;
        Ok(queue)
    }

    fn init_database(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS sync_queue (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                data TEXT,
                timestamp TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                synced BOOLEAN DEFAULT 0,
                error TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced, timestamp)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id)",
            [],
        )?;

        Ok(())
    }

    pub fn enqueue(&self, item: SyncQueueItem) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO sync_queue (id, entity_type, entity_id, action, data, timestamp, retry_count, synced, error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                action = excluded.action,
                data = excluded.data,
                timestamp = excluded.timestamp,
                retry_count = excluded.retry_count,
                updated_at = CURRENT_TIMESTAMP",
            params![
                &item.id,
                format!("{:?}", item.entity_type),
                &item.entity_id,
                format!("{:?}", item.action),
                &item.data,
                &item.timestamp,
                item.retry_count,
                item.synced,
                &item.error,
            ],
        )?;

        Ok(())
    }

    pub fn get_pending(&self, limit: usize) -> Result<Vec<SyncQueueItem>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, entity_type, entity_id, action, data, timestamp, retry_count, synced, error
             FROM sync_queue
             WHERE synced = 0 AND retry_count < 5
             ORDER BY timestamp ASC
             LIMIT ?1",
        )?;

        let items = stmt.query_map([limit], |row| {
            Ok(SyncQueueItem {
                id: row.get(0)?,
                entity_type: match row.get::<_, String>(1)?.as_str() {
                    "Conversation" => SyncEntity::Conversation,
                    "Message" => SyncEntity::Message,
                    "Project" => SyncEntity::Project,
                    "Memory" => SyncEntity::Memory,
                    "Settings" => SyncEntity::Settings,
                    "Artifact" => SyncEntity::Artifact,
                    _ => SyncEntity::Message,
                },
                entity_id: row.get(2)?,
                action: match row.get::<_, String>(3)?.as_str() {
                    "Create" => SyncAction::Create,
                    "Update" => SyncAction::Update,
                    "Delete" => SyncAction::Delete,
                    _ => SyncAction::Update,
                },
                data: row.get(4)?,
                timestamp: row.get(5)?,
                retry_count: row.get(6)?,
                synced: row.get(7)?,
                error: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }

        Ok(result)
    }

    pub fn mark_synced(&self, id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "UPDATE sync_queue SET synced = 1, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [id],
        )?;

        Ok(())
    }

    pub fn mark_failed(&self, id: &str, error: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "UPDATE sync_queue SET retry_count = retry_count + 1, error = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![error, id],
        )?;

        Ok(())
    }

    pub fn get_count(&self) -> Result<usize> {
        let conn = Connection::open(&self.db_path)?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE synced = 0",
            [],
            |row| row.get(0),
        )?;

        Ok(count as usize)
    }

    pub fn clear_synced(&self, older_than_days: u32) -> Result<usize> {
        let conn = Connection::open(&self.db_path)?;

        let deleted = conn.execute(
            "DELETE FROM sync_queue WHERE synced = 1 AND created_at < datetime('now', '-' || ?1 || ' days')",
            [older_than_days],
        )?;

        Ok(deleted)
    }

    pub fn get_by_entity(
        &self,
        entity_type: SyncEntity,
        entity_id: &str,
    ) -> Result<Vec<SyncQueueItem>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, entity_type, entity_id, action, data, timestamp, retry_count, synced, error
             FROM sync_queue
             WHERE entity_type = ?1 AND entity_id = ?2
             ORDER BY timestamp DESC",
        )?;

        let items = stmt.query_map(params![format!("{:?}", entity_type), entity_id], |row| {
            Ok(SyncQueueItem {
                id: row.get(0)?,
                entity_type: match row.get::<_, String>(1)?.as_str() {
                    "Conversation" => SyncEntity::Conversation,
                    "Message" => SyncEntity::Message,
                    "Project" => SyncEntity::Project,
                    "Memory" => SyncEntity::Memory,
                    "Settings" => SyncEntity::Settings,
                    "Artifact" => SyncEntity::Artifact,
                    _ => SyncEntity::Message,
                },
                entity_id: row.get(2)?,
                action: match row.get::<_, String>(3)?.as_str() {
                    "Create" => SyncAction::Create,
                    "Update" => SyncAction::Update,
                    "Delete" => SyncAction::Delete,
                    _ => SyncAction::Update,
                },
                data: row.get(4)?,
                timestamp: row.get(5)?,
                retry_count: row.get(6)?,
                synced: row.get(7)?,
                error: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_sync_queue_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("sync_queue.db");
        let queue = SyncQueue::new(db_path);
        assert!(queue.is_ok());
    }

    #[test]
    fn test_enqueue_and_get_pending() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("sync_queue.db");
        let queue = SyncQueue::new(db_path).unwrap();

        let item = SyncQueueItem {
            id: uuid::Uuid::new_v4().to_string(),
            entity_type: SyncEntity::Message,
            entity_id: "test-message".to_string(),
            action: SyncAction::Create,
            data: Some("{\"content\": \"test\"}".to_string()),
            timestamp: chrono::Utc::now().to_rfc3339(),
            retry_count: 0,
            synced: false,
            error: None,
        };

        queue.enqueue(item.clone()).unwrap();

        let pending = queue.get_pending(10).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].entity_id, "test-message");
    }
}
