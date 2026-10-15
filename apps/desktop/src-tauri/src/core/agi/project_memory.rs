//! Project-scoped long-term memory system for AGI Workforce
//!
//! Memories kept for one project folder and recalled by chats that work in
//! it. The writer stores decisions; rows of the older `context` and
//! `coding_style` types are still read.

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::sys::error::{Error, Result};

// =============================================================================
// PROJECT MEMORY TYPES
// =============================================================================

/// Project-level context memory
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectMemoryType {
    Context,
    CodingStyle,
    ArchitecturalDecision,
}

impl ProjectMemoryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProjectMemoryType::Context => "context",
            ProjectMemoryType::CodingStyle => "coding_style",
            ProjectMemoryType::ArchitecturalDecision => "architectural_decision",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "context" => Some(ProjectMemoryType::Context),
            "coding_style" => Some(ProjectMemoryType::CodingStyle),
            "architectural_decision" => Some(ProjectMemoryType::ArchitecturalDecision),
            _ => None,
        }
    }
}

/// Architectural decision memory (decision, rationale, timestamp)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchitecturalDecision {
    pub id: i64,
    pub project_folder: String,
    pub decision: String,
    pub rationale: String,
    pub status: String, // "proposed", "accepted", "deprecated"
    pub importance: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Unified project memory entry for queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMemory {
    pub id: i64,
    pub project_folder: String,
    pub memory_type: ProjectMemoryType,
    pub content: String, // Serialized JSON of specific memory type
    pub importance: i32,
    pub created_at: String,
    pub updated_at: String,
    pub last_accessed: Option<String>,
}

/// Search result from project memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMemorySearchResult {
    pub memory: ProjectMemory,
    pub relevance_score: f32,
    pub matched_fields: Vec<String>,
}

// =============================================================================
// PROJECT MEMORY MANAGER
// =============================================================================

/// Manages project-scoped long-term memories
pub struct ProjectMemoryManager {
    conn: Mutex<Connection>,
}

impl ProjectMemoryManager {
    /// Create a new ProjectMemoryManager with a connection to the database
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = crate::data::db::encryption::open_keyed_connection(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create a ProjectMemoryManager from an existing connection path
    pub fn from_path(path: &std::path::Path) -> Result<Self> {
        let conn = crate::data::db::encryption::open_keyed_connection(path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create a ProjectMemoryManager over an already opened connection.
    ///
    /// The main database is keyed by `MainDatabaseAccess` (Keychain-stored, or
    /// the WDIO harness key), not by the machine-derived key that
    /// `open_keyed_connection` uses, opening the main DB path through the
    /// keyed helper fails with "file is not a database". Callers pointing at
    /// the main database must hand in a connection from `MainDatabaseAccess`.
    pub fn from_connection(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    /// Save or update an architectural decision.
    ///
    /// Deduplicates on `(project_folder, decision)`: if an existing
    /// architectural_decision row for the same project contains the same
    /// decision text, we UPDATE it (preserving the original id and created_at).
    /// Otherwise we INSERT a new row. This allows multiple distinct decisions
    /// per project while preventing duplicates, and avoids UNIQUE-constraint
    /// crashes on pre-v58 databases.
    pub fn save_architectural_decision(
        &self,
        project_folder: &str,
        decision: &str,
        rationale: &str,
        status: Option<&str>, // "proposed", "accepted", "deprecated"
        importance: Option<i32>,
    ) -> Result<i64> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let importance = importance.unwrap_or(7).clamp(1, 10);
        let status = status.unwrap_or("accepted");

        let arch_decision = ArchitecturalDecision {
            id: 0,
            project_folder: project_folder.to_string(),
            decision: decision.to_string(),
            rationale: rationale.to_string(),
            status: status.to_string(),
            importance,
            created_at: String::new(),
            updated_at: String::new(),
        };

        let content = serde_json::to_string(&arch_decision)
            .map_err(|e| Error::Generic(format!("Failed to serialize decision: {}", e)))?;

        // Build a pattern to match existing rows with the same decision text.
        // Use serde_json to get the exact JSON-escaped form, then escape LIKE wildcards.
        let json_escaped_decision =
            serde_json::to_string(decision).unwrap_or_else(|_| format!("\"{}\"", decision));
        let json_inner_decision = &json_escaped_decision[1..json_escaped_decision.len() - 1];
        let decision_pattern = format!(
            "%\"decision\":\"{}\"%",
            json_inner_decision
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );

        // Wrap in a transaction to prevent TOCTOU UNIQUE constraint crashes.
        let tx = conn
            .transaction()
            .map_err(|e| Error::Database(format!("Failed to begin transaction: {}", e)))?;

        let updated = tx
            .execute(
                "UPDATE project_memories
                 SET content = ?1, importance = ?2, updated_at = datetime('now')
                 WHERE id = (
                     SELECT id FROM project_memories
                     WHERE project_folder = ?3 AND memory_type = ?4 AND content LIKE ?5 ESCAPE '\\'
                     ORDER BY created_at ASC LIMIT 1
                 )",
                params![
                    content,
                    importance,
                    project_folder,
                    ProjectMemoryType::ArchitecturalDecision.as_str(),
                    decision_pattern
                ],
            )
            .map_err(|e| {
                Error::Database(format!("Failed to update architectural decision: {}", e))
            })?;

        if updated == 0 {
            tx.execute(
                "INSERT OR REPLACE INTO project_memories (project_folder, memory_type, content, importance, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
                params![
                    project_folder,
                    ProjectMemoryType::ArchitecturalDecision.as_str(),
                    content,
                    importance
                ],
            )
            .map_err(|e| {
                Error::Database(format!(
                    "Failed to save architectural decision for '{}': {}",
                    project_folder, e
                ))
            })?;
        }

        tx.commit()
            .map_err(|e| Error::Database(format!("Failed to commit transaction: {}", e)))?;

        // Return the id of the upserted row.
        let id: i64 = conn
            .query_row(
                "SELECT id FROM project_memories
                 WHERE project_folder = ?1 AND memory_type = ?2 AND content LIKE ?3 ESCAPE '\\'
                 ORDER BY updated_at DESC LIMIT 1",
                params![
                    project_folder,
                    ProjectMemoryType::ArchitecturalDecision.as_str(),
                    decision_pattern
                ],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Failed to get memory id: {}", e)))?;

        Ok(id)
    }

    /// Get all memories for a project
    pub fn get_project_memories(&self, project_folder: &str) -> Result<Vec<ProjectMemory>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_folder, memory_type, content, importance, created_at, updated_at, last_accessed
                 FROM project_memories
                 WHERE project_folder = ?1
                 ORDER BY importance DESC, updated_at DESC",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let memories = stmt
            .query_map(params![project_folder], map_project_memory_row)
            .map_err(|e| Error::Database(format!("Failed to query memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(memories)
    }

    /// Search project memories by content
    pub fn search_project_memories(
        &self,
        project_folder: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<ProjectMemory>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let search_pattern = format!("%{}%", query);
        let limit = limit as i32;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_folder, memory_type, content, importance, created_at, updated_at, last_accessed
                 FROM project_memories
                 WHERE project_folder = ?1 AND content LIKE ?2
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let memories = stmt
            .query_map(
                params![project_folder, search_pattern, limit],
                map_project_memory_row,
            )
            .map_err(|e| Error::Database(format!("Failed to search memories: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect memories: {}", e)))?;

        Ok(memories)
    }

    /// Delete a memory by ID
    pub fn delete_memory(&self, memory_id: i64) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let rows = conn
            .execute(
                "DELETE FROM project_memories WHERE id = ?1",
                params![memory_id],
            )
            .map_err(|e| Error::Database(format!("Failed to delete memory: {}", e)))?;

        Ok(rows > 0)
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

fn map_project_memory_row(row: &Row<'_>) -> rusqlite::Result<ProjectMemory> {
    let memory_type_str: String = row.get(2)?;
    let memory_type =
        ProjectMemoryType::from_str(&memory_type_str).unwrap_or(ProjectMemoryType::Context);

    Ok(ProjectMemory {
        id: row.get(0)?,
        project_folder: row.get(1)?,
        memory_type,
        content: row.get(3)?,
        importance: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        last_accessed: row.get(7)?,
    })
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Set up a test database WITHOUT a UNIQUE constraint (post-v58 schema).
    fn setup_test_db() -> (TempDir, ProjectMemoryManager) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE project_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_folder TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 5,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT
            )",
            [],
        )
        .unwrap();
        drop(conn);

        let manager = ProjectMemoryManager::from_path(&db_path).unwrap();
        (temp_dir, manager)
    }

    /// Set up a test database WITH a UNIQUE constraint (pre-v58 schema).
    /// This reproduces the original bug #49 crash scenario.
    fn setup_test_db_with_unique_constraint() -> (TempDir, ProjectMemoryManager) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE project_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_folder TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 5,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT,
                UNIQUE(project_folder, memory_type)
            )",
            [],
        )
        .unwrap();
        drop(conn);

        let manager = ProjectMemoryManager::from_path(&db_path).unwrap();
        (temp_dir, manager)
    }

    #[test]
    fn test_save_architectural_decision() {
        let (_temp_dir, manager) = setup_test_db();

        let id = manager
            .save_architectural_decision(
                "/path/to/project",
                "Use event-driven architecture",
                "Allows for better scalability and real-time updates",
                Some("accepted"),
                Some(9),
            )
            .unwrap();

        assert!(id > 0);

        let memories = manager.get_project_memories("/path/to/project").unwrap();
        assert_eq!(memories.len(), 1);
        assert_eq!(
            memories[0].memory_type,
            ProjectMemoryType::ArchitecturalDecision
        );
        assert!(memories[0].content.contains(r#""status":"accepted""#));
    }

    #[test]
    fn test_search_memories() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .save_architectural_decision(
                "/path/to/project",
                "Write the core in Rust",
                "Memory safety",
                None,
                None,
            )
            .unwrap();

        let results = manager
            .search_project_memories("/path/to/project", "Rust", 10)
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(manager
            .search_project_memories("/another/project", "Rust", 10)
            .unwrap()
            .is_empty());
    }

    // =========================================================================
    // BUG #49 REGRESSION TESTS: duplicate insertion scenarios
    // =========================================================================

    #[test]
    fn test_duplicate_architectural_decision_updates() {
        let (_temp_dir, manager) = setup_test_db();

        // First save
        let id1 = manager
            .save_architectural_decision(
                "/path/to/project",
                "Use event-driven architecture",
                "Better scalability",
                Some("proposed"),
                Some(7),
            )
            .unwrap();

        // Second save with same decision text should update
        let id2 = manager
            .save_architectural_decision(
                "/path/to/project",
                "Use event-driven architecture",
                "Better scalability and real-time updates",
                Some("accepted"),
                Some(9),
            )
            .unwrap();

        assert_eq!(id1, id2);

        let memories = manager.get_project_memories("/path/to/project").unwrap();
        assert_eq!(memories.len(), 1);
        assert!(memories[0].content.contains(r#""status":"accepted""#));
        assert_eq!(memories[0].importance, 9);
    }

    #[test]
    fn test_different_architectural_decisions_create_separate_rows() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .save_architectural_decision(
                "/path/to/project",
                "Use event-driven architecture",
                "Better scalability",
                Some("accepted"),
                Some(8),
            )
            .unwrap();

        manager
            .save_architectural_decision(
                "/path/to/project",
                "Use microservices",
                "Independent deployment",
                Some("proposed"),
                Some(6),
            )
            .unwrap();

        let memories = manager.get_project_memories("/path/to/project").unwrap();
        assert_eq!(memories.len(), 2);
    }

    #[test]
    fn test_architectural_decision_with_unique_constraint() {
        let (_temp_dir, manager) = setup_test_db_with_unique_constraint();

        // First save on pre-v58 schema
        let id1 = manager
            .save_architectural_decision(
                "/path/to/project",
                "Use event-driven architecture",
                "Better scalability",
                Some("accepted"),
                Some(8),
            )
            .unwrap();

        // Second save must not crash with UNIQUE constraint violation
        let id2 = manager
            .save_architectural_decision(
                "/path/to/project",
                "Use event-driven architecture",
                "Updated rationale",
                Some("accepted"),
                Some(9),
            )
            .unwrap();

        assert_eq!(id1, id2);
    }
}
