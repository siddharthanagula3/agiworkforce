use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::knowledge::{KnowledgeBase, KnowledgeDocument};
use super::rag::{ChunkingConfig, RAGEngine};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub custom_instructions: Option<String>,
    pub visibility: String, // "private", "organization", "public"
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub project_id: String,
    pub default_model: Option<String>,
    pub temperature: Option<f32>,
    pub enable_memory: bool,
    pub enable_rag: bool,
    pub rag_top_k: u32,
    pub custom_instructions: Option<String>,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            project_id: String::new(),
            default_model: None,
            temperature: None,
            enable_memory: true,
            enable_rag: true,
            rag_top_k: 5,
            custom_instructions: None,
        }
    }
}

pub struct ProjectManager {
    db_path: PathBuf,
    knowledge_base: KnowledgeBase,
    rag_engine: RAGEngine,
}

impl ProjectManager {
    pub fn new(db_path: PathBuf, kb_path: PathBuf) -> Result<Self> {
        let manager = Self {
            db_path: db_path.clone(),
            knowledge_base: KnowledgeBase::new(kb_path)?,
            rag_engine: RAGEngine::new(ChunkingConfig::default()),
        };

        manager.init_database()?;
        Ok(manager)
    }

    fn init_database(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Projects table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                custom_instructions TEXT,
                visibility TEXT DEFAULT 'private',
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Project settings table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS project_settings (
                project_id TEXT PRIMARY KEY,
                default_model TEXT,
                temperature REAL,
                enable_memory BOOLEAN DEFAULT 1,
                enable_rag BOOLEAN DEFAULT 1,
                rag_top_k INTEGER DEFAULT 5,
                custom_instructions TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_created_by
             ON projects(created_by, created_at DESC)",
            [],
        )?;

        Ok(())
    }

    pub fn create_project(&self, project: Project) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO projects (id, name, description, custom_instructions, visibility, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                &project.id,
                &project.name,
                &project.description,
                &project.custom_instructions,
                &project.visibility,
                &project.created_by,
            ],
        )?;

        // Create default settings
        let settings = ProjectSettings {
            project_id: project.id.clone(),
            ..Default::default()
        };

        self.update_settings(&settings)?;

        Ok(())
    }

    pub fn get_project(&self, project_id: &str) -> Result<Option<Project>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, name, description, custom_instructions, visibility, created_by, created_at, updated_at
             FROM projects WHERE id = ?1",
        )?;

        let result = stmt.query_row([project_id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                custom_instructions: row.get(3)?,
                visibility: row.get(4)?,
                created_by: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        });

        match result {
            Ok(project) => Ok(Some(project)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn get_user_projects(&self, user_id: &str) -> Result<Vec<Project>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, name, description, custom_instructions, visibility, created_by, created_at, updated_at
             FROM projects WHERE created_by = ?1 ORDER BY updated_at DESC",
        )?;

        let projects = stmt.query_map([user_id], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                custom_instructions: row.get(3)?,
                visibility: row.get(4)?,
                created_by: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for project in projects {
            result.push(project?);
        }

        Ok(result)
    }

    pub fn update_project(&self, project: &Project) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "UPDATE projects
             SET name = ?1, description = ?2, custom_instructions = ?3, visibility = ?4, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?5",
            params![
                &project.name,
                &project.description,
                &project.custom_instructions,
                &project.visibility,
                &project.id,
            ],
        )?;

        Ok(())
    }

    pub fn delete_project(&self, project_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Delete project (settings and knowledge will cascade)
        conn.execute("DELETE FROM projects WHERE id = ?1", [project_id])?;

        // Clean up knowledge base
        self.knowledge_base.clear_project_knowledge(project_id)?;

        Ok(())
    }

    pub fn get_settings(&self, project_id: &str) -> Result<Option<ProjectSettings>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT project_id, default_model, temperature, enable_memory, enable_rag, rag_top_k, custom_instructions
             FROM project_settings WHERE project_id = ?1",
        )?;

        let result = stmt.query_row([project_id], |row| {
            Ok(ProjectSettings {
                project_id: row.get(0)?,
                default_model: row.get(1)?,
                temperature: row.get(2)?,
                enable_memory: row.get(3)?,
                enable_rag: row.get(4)?,
                rag_top_k: row.get(5)?,
                custom_instructions: row.get(6)?,
            })
        });

        match result {
            Ok(settings) => Ok(Some(settings)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn update_settings(&self, settings: &ProjectSettings) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "INSERT INTO project_settings
             (project_id, default_model, temperature, enable_memory, enable_rag, rag_top_k, custom_instructions)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(project_id) DO UPDATE SET
                default_model = excluded.default_model,
                temperature = excluded.temperature,
                enable_memory = excluded.enable_memory,
                enable_rag = excluded.enable_rag,
                rag_top_k = excluded.rag_top_k,
                custom_instructions = excluded.custom_instructions",
            params![
                &settings.project_id,
                &settings.default_model,
                &settings.temperature,
                settings.enable_memory,
                settings.enable_rag,
                settings.rag_top_k,
                &settings.custom_instructions,
            ],
        )?;

        Ok(())
    }

    pub fn add_document(&self, project_id: &str, file_path: &str) -> Result<KnowledgeDocument> {
        // Extract file info
        let path = PathBuf::from(file_path);
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let file_type = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Extract text from file
        let content = self.rag_engine.extract_text_from_file(file_path, &file_type)?;
        let size = content.len();

        // Create document
        let document = KnowledgeDocument {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            file_path: file_path.to_string(),
            file_name,
            file_type,
            size,
            content,
            metadata: None,
            indexed_at: chrono::Utc::now().to_rfc3339(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        // Add to knowledge base
        self.knowledge_base.add_document(document.clone())?;

        // Chunk the document
        let chunks = self.rag_engine.chunk_document(&document)?;

        // Generate embeddings and add chunks
        for chunk in chunks {
            let mut chunk_with_embedding = chunk;
            let embedding = self.rag_engine.generate_embedding(&chunk_with_embedding.content)?;
            chunk_with_embedding.embedding = Some(embedding);
            self.knowledge_base.add_chunk(chunk_with_embedding)?;
        }

        Ok(document)
    }

    pub fn search_knowledge(&self, project_id: &str, query: &str, top_k: usize) -> Result<Vec<super::rag::RAGResult>> {
        // Generate query embedding
        let query_embedding = self.rag_engine.generate_embedding(query)?;

        // Get all chunks for the project
        let documents = self.knowledge_base.get_project_documents(project_id)?;
        let mut all_chunks = Vec::new();

        for doc in documents {
            let chunks = self.knowledge_base.get_document_chunks(&doc.id)?;
            all_chunks.extend(chunks);
        }

        // Find similar chunks
        let results = self.rag_engine.find_similar_chunks(&query_embedding, all_chunks, top_k);

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_project_manager_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("projects.db");
        let kb_path = dir.path().join("knowledge.db");

        let manager = ProjectManager::new(db_path, kb_path);
        assert!(manager.is_ok());
    }
}
