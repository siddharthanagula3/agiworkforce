use rusqlite::{Connection, Result as SqliteResult};
use std::sync::{Arc, Mutex};
use chrono::Utc;
use serde_json;

use crate::models::advanced_features::*;

/// Draft manager for auto-saving message drafts
pub struct DraftManager {
    db: Arc<Mutex<Connection>>,
}

impl DraftManager {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Save or update a draft
    pub fn save_draft(&self, draft: &MessageDraft) -> SqliteResult<()> {
        let db = self.db.lock().unwrap();
        
        db.execute(
            "INSERT OR REPLACE INTO message_drafts (conversation_id, content, attachments, focus_mode, saved_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                &draft.conversation_id,
                &draft.content,
                serde_json::to_string(&draft.attachments).unwrap_or_default(),
                &draft.focus_mode,
                draft.saved_at.timestamp(),
            ],
        )?;

        Ok(())
    }

    /// Get draft for a conversation
    pub fn get_draft(&self, conversation_id: &str) -> SqliteResult<Option<MessageDraft>> {
        let db = self.db.lock().unwrap();
        
        let mut stmt = db.prepare(
            "SELECT conversation_id, content, attachments, focus_mode, saved_at 
             FROM message_drafts 
             WHERE conversation_id = ?1"
        )?;

        let draft = stmt.query_row([conversation_id], |row| {
            let attachments_json: String = row.get(2)?;
            let attachments = serde_json::from_str(&attachments_json).unwrap_or_default();
            
            Ok(MessageDraft {
                conversation_id: row.get(0)?,
                content: row.get(1)?,
                attachments,
                focus_mode: row.get(3)?,
                saved_at: chrono::DateTime::from_timestamp(row.get(4)?, 0)
                    .unwrap_or_else(|| Utc::now()),
            })
        }).optional()?;

        Ok(draft)
    }

    /// Delete draft for a conversation
    pub fn clear_draft(&self, conversation_id: &str) -> SqliteResult<()> {
        let db = self.db.lock().unwrap();
        
        db.execute(
            "DELETE FROM message_drafts WHERE conversation_id = ?1",
            [conversation_id],
        )?;

        Ok(())
    }

    /// Get all drafts
    pub fn get_all_drafts(&self) -> SqliteResult<Vec<MessageDraft>> {
        let db = self.db.lock().unwrap();
        
        let mut stmt = db.prepare(
            "SELECT conversation_id, content, attachments, focus_mode, saved_at 
             FROM message_drafts 
             ORDER BY saved_at DESC"
        )?;

        let drafts = stmt.query_map([], |row| {
            let attachments_json: String = row.get(2)?;
            let attachments = serde_json::from_str(&attachments_json).unwrap_or_default();
            
            Ok(MessageDraft {
                conversation_id: row.get(0)?,
                content: row.get(1)?,
                attachments,
                focus_mode: row.get(3)?,
                saved_at: chrono::DateTime::from_timestamp(row.get(4)?, 0)
                    .unwrap_or_else(|| Utc::now()),
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;

        Ok(drafts)
    }

    /// Clean up old drafts (older than 30 days)
    pub fn cleanup_old_drafts(&self, days: i64) -> SqliteResult<usize> {
        let db = self.db.lock().unwrap();
        let cutoff = Utc::now() - chrono::Duration::days(days);
        
        let count = db.execute(
            "DELETE FROM message_drafts WHERE saved_at < ?1",
            [cutoff.timestamp()],
        )?;

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::init_database;

    #[test]
    fn test_draft_save_and_retrieve() {
        let db = init_database(":memory:").unwrap();
        let manager = DraftManager::new(db);

        let draft = MessageDraft {
            conversation_id: "conv1".to_string(),
            content: "Test draft content".to_string(),
            attachments: vec!["file1".to_string()],
            focus_mode: Some("code".to_string()),
            saved_at: Utc::now(),
        };

        manager.save_draft(&draft).unwrap();
        let retrieved = manager.get_draft("conv1").unwrap();

        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().content, "Test draft content");
    }

    #[test]
    fn test_draft_clear() {
        let db = init_database(":memory:").unwrap();
        let manager = DraftManager::new(db);

        let draft = MessageDraft {
            conversation_id: "conv1".to_string(),
            content: "Test".to_string(),
            attachments: vec![],
            focus_mode: None,
            saved_at: Utc::now(),
        };

        manager.save_draft(&draft).unwrap();
        manager.clear_draft("conv1").unwrap();
        
        let retrieved = manager.get_draft("conv1").unwrap();
        assert!(retrieved.is_none());
    }
}
