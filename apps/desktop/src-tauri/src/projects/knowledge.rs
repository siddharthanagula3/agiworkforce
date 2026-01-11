use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeDocument {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub file_name: String,
    pub file_type: String,
    pub size: usize,
    pub content: String,
    pub metadata: Option<String>, // JSON metadata
    pub indexed_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeChunk {
    pub id: String,
    pub document_id: String,
    pub project_id: String,
    pub content: String,
    pub chunk_index: u32,
    pub embedding: Option<Vec<f32>>,
    pub metadata: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMemory {
    pub id: String,
    pub project_id: String,
    pub content: String,
    pub memory_type: String, // "fact", "preference", "context"
    pub source: String,      // "conversation", "document", "manual"
    pub salience: f32,
    pub embedding: Option<Vec<f32>>,
    pub created_at: String,
    pub last_accessed: String,
    pub access_count: u32,
}

pub struct KnowledgeBase {
    db_path: PathBuf,
}

impl KnowledgeBase {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let kb = Self { db_path };
        kb.init_database()?;
        Ok(kb)
    }

    fn init_database(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Knowledge documents table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS knowledge_documents (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                indexed_at TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Knowledge chunks table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                embedding BLOB,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Project memory table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS project_memory (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                content TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                source TEXT NOT NULL,
                salience REAL DEFAULT 0.5,
                embedding BLOB,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT,
                access_count INTEGER DEFAULT 0,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_knowledge_documents_project
             ON knowledge_documents(project_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document
             ON knowledge_chunks(document_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project
             ON knowledge_chunks(project_id)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_project_memory_project
             ON project_memory(project_id, salience DESC)",
            [],
        )?;

        Ok(())
    }

    pub fn add_document(&self, document: KnowledgeDocument) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO knowledge_documents
             (id, project_id, file_path, file_name, file_type, size, content, metadata, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &document.id,
                &document.project_id,
                &document.file_path,
                &document.file_name,
                &document.file_type,
                document.size as i64,
                &document.content,
                &document.metadata,
                &document.indexed_at,
            ],
        )?;

        Ok(())
    }

    pub fn add_chunk(&self, chunk: KnowledgeChunk) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        let embedding_bytes = chunk
            .embedding
            .as_ref()
            .map(bincode::serialize)
            .transpose()?;

        conn.execute(
            "INSERT INTO knowledge_chunks
             (id, document_id, project_id, content, chunk_index, embedding, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &chunk.id,
                &chunk.document_id,
                &chunk.project_id,
                &chunk.content,
                chunk.chunk_index,
                embedding_bytes,
                &chunk.metadata,
            ],
        )?;

        Ok(())
    }

    pub fn get_document(&self, document_id: &str) -> Result<Option<KnowledgeDocument>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, project_id, file_path, file_name, file_type, size, content, metadata, indexed_at, created_at
             FROM knowledge_documents WHERE id = ?1",
        )?;

        let result = stmt.query_row([document_id], |row| {
            Ok(KnowledgeDocument {
                id: row.get(0)?,
                project_id: row.get(1)?,
                file_path: row.get(2)?,
                file_name: row.get(3)?,
                file_type: row.get(4)?,
                size: row.get::<_, i64>(5)? as usize,
                content: row.get(6)?,
                metadata: row.get(7)?,
                indexed_at: row.get(8)?,
                created_at: row.get(9)?,
            })
        });

        match result {
            Ok(doc) => Ok(Some(doc)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_project_documents(&self, project_id: &str) -> Result<Vec<KnowledgeDocument>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, project_id, file_path, file_name, file_type, size, content, metadata, indexed_at, created_at
             FROM knowledge_documents WHERE project_id = ?1 ORDER BY created_at DESC",
        )?;

        let docs = stmt.query_map([project_id], |row| {
            Ok(KnowledgeDocument {
                id: row.get(0)?,
                project_id: row.get(1)?,
                file_path: row.get(2)?,
                file_name: row.get(3)?,
                file_type: row.get(4)?,
                size: row.get::<_, i64>(5)? as usize,
                content: row.get(6)?,
                metadata: row.get(7)?,
                indexed_at: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;

        let mut result = Vec::new();
        for doc in docs {
            result.push(doc?);
        }

        Ok(result)
    }

    pub fn get_document_chunks(&self, document_id: &str) -> Result<Vec<KnowledgeChunk>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, document_id, project_id, content, chunk_index, embedding, metadata, created_at
             FROM knowledge_chunks WHERE document_id = ?1 ORDER BY chunk_index ASC",
        )?;

        let chunks = stmt.query_map([document_id], |row| {
            let embedding_bytes: Option<Vec<u8>> = row.get(5)?;
            let embedding = embedding_bytes
                .map(|bytes| bincode::deserialize(&bytes))
                .transpose()
                .ok()
                .flatten();

            Ok(KnowledgeChunk {
                id: row.get(0)?,
                document_id: row.get(1)?,
                project_id: row.get(2)?,
                content: row.get(3)?,
                chunk_index: row.get(4)?,
                embedding,
                metadata: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for chunk in chunks {
            result.push(chunk?);
        }

        Ok(result)
    }

    pub fn add_memory(&self, memory: ProjectMemory) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        let embedding_bytes = memory
            .embedding
            .as_ref()
            .map(bincode::serialize)
            .transpose()?;

        conn.execute(
            "INSERT INTO project_memory
             (id, project_id, content, memory_type, source, salience, embedding, last_accessed, access_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &memory.id,
                &memory.project_id,
                &memory.content,
                &memory.memory_type,
                &memory.source,
                memory.salience,
                embedding_bytes,
                &memory.last_accessed,
                memory.access_count,
            ],
        )?;

        Ok(())
    }

    pub fn get_project_memories(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<ProjectMemory>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, project_id, content, memory_type, source, salience, embedding, created_at, last_accessed, access_count
             FROM project_memory
             WHERE project_id = ?1
             ORDER BY salience DESC, last_accessed DESC
             LIMIT ?2",
        )?;

        let memories = stmt.query_map(params![project_id, limit as i64], |row| {
            let embedding_bytes: Option<Vec<u8>> = row.get(6)?;
            let embedding = embedding_bytes
                .map(|bytes| bincode::deserialize(&bytes))
                .transpose()
                .ok()
                .flatten();

            Ok(ProjectMemory {
                id: row.get(0)?,
                project_id: row.get(1)?,
                content: row.get(2)?,
                memory_type: row.get(3)?,
                source: row.get(4)?,
                salience: row.get(5)?,
                embedding,
                created_at: row.get(7)?,
                last_accessed: row.get(8)?,
                access_count: row.get(9)?,
            })
        })?;

        let mut result = Vec::new();
        for memory in memories {
            result.push(memory?);
        }

        Ok(result)
    }

    pub fn update_memory_access(&self, memory_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "UPDATE project_memory
             SET access_count = access_count + 1,
                 last_accessed = ?1,
                 salience = MIN(1.0, salience + 0.01)
             WHERE id = ?2",
            params![chrono::Utc::now().to_rfc3339(), memory_id],
        )?;

        Ok(())
    }

    pub fn delete_document(&self, document_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Chunks will be deleted automatically due to CASCADE
        conn.execute(
            "DELETE FROM knowledge_documents WHERE id = ?1",
            [document_id],
        )?;

        Ok(())
    }

    pub fn delete_memory(&self, memory_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("DELETE FROM project_memory WHERE id = ?1", [memory_id])?;
        Ok(())
    }

    pub fn clear_project_knowledge(&self, project_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "DELETE FROM knowledge_documents WHERE project_id = ?1",
            [project_id],
        )?;
        conn.execute(
            "DELETE FROM project_memory WHERE project_id = ?1",
            [project_id],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_knowledge_base_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("knowledge.db");
        let kb = KnowledgeBase::new(db_path);
        assert!(kb.is_ok());
    }
}
