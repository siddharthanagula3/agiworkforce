use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub conversation_id: Option<String>,
    pub content: String,
    pub snippet: String,
    pub rank: f64,
    pub timestamp: String,
    pub message_type: String,
    pub sender: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilter {
    pub conversation_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub sender: Option<String>,
    pub message_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub limit: usize,
    pub offset: usize,
    pub highlight: bool,
    pub snippet_length: usize,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            limit: 50,
            offset: 0,
            highlight: true,
            snippet_length: 200,
        }
    }
}

pub struct FullTextSearch {
    db_path: PathBuf,
}

impl FullTextSearch {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let search = Self { db_path };
        search.init_fts()?;
        Ok(search)
    }

    fn init_fts(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Create FTS5 virtual table for messages
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                message_id UNINDEXED,
                conversation_id UNINDEXED,
                content,
                sender UNINDEXED,
                message_type UNINDEXED,
                timestamp UNINDEXED,
                tokenize = 'porter unicode61 remove_diacritics 2'
            )",
            [],
        )?;

        // Create FTS5 table for conversations
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
                conversation_id UNINDEXED,
                title,
                description,
                project_id UNINDEXED,
                timestamp UNINDEXED,
                tokenize = 'porter unicode61 remove_diacritics 2'
            )",
            [],
        )?;

        // Create FTS5 table for project knowledge
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
                chunk_id UNINDEXED,
                project_id UNINDEXED,
                content,
                source_file UNINDEXED,
                chunk_index UNINDEXED,
                timestamp UNINDEXED,
                tokenize = 'porter unicode61 remove_diacritics 2'
            )",
            [],
        )?;

        Ok(())
    }

    pub fn index_message(
        &self,
        message_id: &str,
        conversation_id: &str,
        content: &str,
        sender: &str,
        message_type: &str,
        timestamp: &str,
    ) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO messages_fts (message_id, conversation_id, content, sender, message_type, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(message_id) DO UPDATE SET
                content = excluded.content,
                sender = excluded.sender,
                message_type = excluded.message_type,
                timestamp = excluded.timestamp",
            params![message_id, conversation_id, content, sender, message_type, timestamp],
        )?;

        Ok(())
    }

    pub fn index_conversation(
        &self,
        conversation_id: &str,
        title: &str,
        description: Option<&str>,
        project_id: Option<&str>,
        timestamp: &str,
    ) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO conversations_fts (conversation_id, title, description, project_id, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(conversation_id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                project_id = excluded.project_id,
                timestamp = excluded.timestamp",
            params![conversation_id, title, description, project_id, timestamp],
        )?;

        Ok(())
    }

    pub fn index_knowledge_chunk(
        &self,
        chunk_id: &str,
        project_id: &str,
        content: &str,
        source_file: &str,
        chunk_index: u32,
        timestamp: &str,
    ) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO knowledge_fts (chunk_id, project_id, content, source_file, chunk_index, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(chunk_id) DO UPDATE SET
                content = excluded.content,
                source_file = excluded.source_file,
                chunk_index = excluded.chunk_index,
                timestamp = excluded.timestamp",
            params![chunk_id, project_id, content, source_file, chunk_index, timestamp],
        )?;

        Ok(())
    }

    pub fn search_messages(
        &self,
        query: &str,
        filter: Option<SearchFilter>,
        options: SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        let conn = Connection::open(&self.db_path)?;

        let mut sql = String::from(
            "SELECT message_id, conversation_id, content, sender, message_type, timestamp,
                    snippet(messages_fts, 2, '<mark>', '</mark>', '...', ?1) as snippet,
                    rank
             FROM messages_fts
             WHERE messages_fts MATCH ?2",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(options.snippet_length as i64),
            Box::new(query.to_string()),
        ];

        // Apply filters
        if let Some(f) = filter {
            if let Some(conv_id) = f.conversation_id {
                sql.push_str(" AND conversation_id = ?");
                params.push(Box::new(conv_id));
            }

            if let Some(start_date) = f.start_date {
                sql.push_str(" AND timestamp >= ?");
                params.push(Box::new(start_date));
            }

            if let Some(end_date) = f.end_date {
                sql.push_str(" AND timestamp <= ?");
                params.push(Box::new(end_date));
            }

            if let Some(sender) = f.sender {
                sql.push_str(" AND sender = ?");
                params.push(Box::new(sender));
            }

            if let Some(msg_type) = f.message_type {
                sql.push_str(" AND message_type = ?");
                params.push(Box::new(msg_type));
            }
        }

        sql.push_str(" ORDER BY rank LIMIT ? OFFSET ?");
        params.push(Box::new(options.limit as i64));
        params.push(Box::new(options.offset as i64));

        let mut stmt = conn.prepare(&sql)?;

        let results = stmt.query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            |row| {
                Ok(SearchResult {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    content: row.get(2)?,
                    snippet: row.get(6)?,
                    rank: row.get(7)?,
                    timestamp: row.get(5)?,
                    message_type: row.get(4)?,
                    sender: row.get(3)?,
                })
            },
        )?;

        let mut search_results = Vec::new();
        for result in results {
            search_results.push(result?);
        }

        Ok(search_results)
    }

    pub fn search_conversations(
        &self,
        query: &str,
        project_id: Option<String>,
        options: SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        let conn = Connection::open(&self.db_path)?;

        let mut sql = String::from(
            "SELECT conversation_id, title, description, project_id, timestamp,
                    snippet(conversations_fts, 1, '<mark>', '</mark>', '...', ?1) as snippet,
                    rank
             FROM conversations_fts
             WHERE conversations_fts MATCH ?2",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(options.snippet_length as i64),
            Box::new(query.to_string()),
        ];

        if let Some(proj_id) = project_id {
            sql.push_str(" AND project_id = ?");
            params.push(Box::new(proj_id));
        }

        sql.push_str(" ORDER BY rank LIMIT ? OFFSET ?");
        params.push(Box::new(options.limit as i64));
        params.push(Box::new(options.offset as i64));

        let mut stmt = conn.prepare(&sql)?;

        let results = stmt.query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            |row| {
                Ok(SearchResult {
                    id: row.get(0)?,
                    conversation_id: None,
                    content: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    snippet: row.get(5)?,
                    rank: row.get(6)?,
                    timestamp: row.get(4)?,
                    message_type: "conversation".to_string(),
                    sender: "system".to_string(),
                })
            },
        )?;

        let mut search_results = Vec::new();
        for result in results {
            search_results.push(result?);
        }

        Ok(search_results)
    }

    pub fn search_knowledge(
        &self,
        query: &str,
        project_id: &str,
        options: SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        let conn = Connection::open(&self.db_path)?;

        let sql = "SELECT chunk_id, project_id, content, source_file, chunk_index, timestamp,
                          snippet(knowledge_fts, 2, '<mark>', '</mark>', '...', ?1) as snippet,
                          rank
                   FROM knowledge_fts
                   WHERE knowledge_fts MATCH ?2 AND project_id = ?3
                   ORDER BY rank
                   LIMIT ?4 OFFSET ?5";

        let mut stmt = conn.prepare(sql)?;

        let results = stmt.query_map(
            params![
                options.snippet_length as i64,
                query,
                project_id,
                options.limit as i64,
                options.offset as i64
            ],
            |row| {
                Ok(SearchResult {
                    id: row.get(0)?,
                    conversation_id: None,
                    content: row.get(2)?,
                    snippet: row.get(6)?,
                    rank: row.get(7)?,
                    timestamp: row.get(5)?,
                    message_type: "knowledge".to_string(),
                    sender: row.get(3)?, // source_file
                })
            },
        )?;

        let mut search_results = Vec::new();
        for result in results {
            search_results.push(result?);
        }

        Ok(search_results)
    }

    pub fn delete_message(&self, message_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "DELETE FROM messages_fts WHERE message_id = ?1",
            [message_id],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, conversation_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Delete conversation
        conn.execute(
            "DELETE FROM conversations_fts WHERE conversation_id = ?1",
            [conversation_id],
        )?;

        // Delete all messages in conversation
        conn.execute(
            "DELETE FROM messages_fts WHERE conversation_id = ?1",
            [conversation_id],
        )?;

        Ok(())
    }

    pub fn delete_project_knowledge(&self, project_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "DELETE FROM knowledge_fts WHERE project_id = ?1",
            [project_id],
        )?;
        Ok(())
    }

    pub fn optimize(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO messages_fts(messages_fts) VALUES('optimize')",
            [],
        )?;
        conn.execute(
            "INSERT INTO conversations_fts(conversations_fts) VALUES('optimize')",
            [],
        )?;
        conn.execute(
            "INSERT INTO knowledge_fts(knowledge_fts) VALUES('optimize')",
            [],
        )?;

        Ok(())
    }

    pub fn rebuild_index(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO messages_fts(messages_fts) VALUES('rebuild')",
            [],
        )?;
        conn.execute(
            "INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild')",
            [],
        )?;
        conn.execute(
            "INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')",
            [],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_fts_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("fts.db");
        let fts = FullTextSearch::new(db_path);
        assert!(fts.is_ok());
    }

    #[test]
    fn test_index_and_search_message() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("fts.db");
        let fts = FullTextSearch::new(db_path).unwrap();

        let message_id = "msg1";
        let conversation_id = "conv1";
        let content = "Hello world, this is a test message";

        fts.index_message(
            message_id,
            conversation_id,
            content,
            "user",
            "text",
            "2025-01-01T00:00:00Z",
        )
        .unwrap();

        let results = fts
            .search_messages("test message", None, SearchOptions::default())
            .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, message_id);
        assert!(results[0].snippet.contains("test message"));
    }
}
