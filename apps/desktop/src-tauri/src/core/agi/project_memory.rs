//! Project-scoped long-term memory system for AGI Workforce
//!
//! Extends the base memory system with project-specific memories:
//! - ProjectContext: Folder path, tech stack, conventions
//! - CodingStyle: Naming conventions, patterns, formatting rules
//! - ArchitecturalDecision: Design decisions, rationale, timestamps
//!
//! All memories are persisted across sessions and searchable by content using
//! semantic search (TF-IDF based).

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

/// Project context memory (folder path, tech stack, conventions)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub id: i64,
    pub project_folder: String,
    pub tech_stack: Vec<String>,
    pub main_language: Option<String>,
    pub conventions: Option<String>,
    pub frameworks: Vec<String>,
    pub importance: i32,
    pub created_at: String,
    pub updated_at: String,
    pub last_accessed: Option<String>,
}

/// Coding style memory (naming conventions, patterns, formatting)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodingStyle {
    pub id: i64,
    pub project_folder: String,
    pub style_key: String,
    pub style_value: String,
    pub category: String, // "naming", "pattern", "formatting", "convention"
    pub importance: i32,
    pub created_at: String,
    pub updated_at: String,
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
        let conn = Connection::open(db_path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create a ProjectMemoryManager from an existing connection path
    pub fn from_path(path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(path)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // =========================================================================
    // PROJECT CONTEXT METHODS
    // =========================================================================

    /// Save or update project context.
    ///
    /// Uses an atomic upsert: first attempts UPDATE on an existing row for this
    /// project folder + context type, then falls back to INSERT only when no row
    /// was touched. This avoids UNIQUE-constraint crashes on pre-v58 databases
    /// and prevents duplicate rows on post-v58 databases.
    pub fn save_project_context(
        &self,
        project_folder: &str,
        tech_stack: Vec<String>,
        main_language: Option<&str>,
        conventions: Option<&str>,
        frameworks: Vec<String>,
        importance: Option<i32>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let importance = importance.unwrap_or(5).clamp(1, 10);

        let content_json = serde_json::to_string(&ProjectContext {
            id: 0,
            project_folder: project_folder.to_string(),
            tech_stack,
            main_language: main_language.map(|s| s.to_string()),
            conventions: conventions.map(|s| s.to_string()),
            frameworks,
            importance,
            created_at: String::new(),
            updated_at: String::new(),
            last_accessed: None,
        })
        .map_err(|e| Error::Generic(format!("Failed to serialize project context: {}", e)))?;

        // Atomic upsert: try UPDATE first, INSERT only if nothing was updated.
        // One context row per project folder -- UPDATE the oldest matching row.
        let updated = conn
            .execute(
                "UPDATE project_memories
                 SET content = ?1, importance = ?2, updated_at = datetime('now')
                 WHERE id = (
                     SELECT id FROM project_memories
                     WHERE project_folder = ?3 AND memory_type = ?4
                     ORDER BY created_at ASC LIMIT 1
                 )",
                params![
                    content_json,
                    importance,
                    project_folder,
                    ProjectMemoryType::Context.as_str()
                ],
            )
            .map_err(|e| {
                Error::Database(format!("Failed to update project context: {}", e))
            })?;

        if updated == 0 {
            conn.execute(
                "INSERT INTO project_memories (project_folder, memory_type, content, importance, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
                params![
                    project_folder,
                    ProjectMemoryType::Context.as_str(),
                    content_json,
                    importance
                ],
            )
            .map_err(|e| {
                Error::Database(format!(
                    "Failed to save project context for '{}': {}",
                    project_folder, e
                ))
            })?;
        }

        // Return the id of the upserted row.
        let id: i64 = conn
            .query_row(
                "SELECT id FROM project_memories
                 WHERE project_folder = ?1 AND memory_type = ?2
                 ORDER BY updated_at DESC LIMIT 1",
                params![project_folder, ProjectMemoryType::Context.as_str()],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Failed to get memory id: {}", e)))?;

        Ok(id)
    }

    /// Get project context
    pub fn get_project_context(&self, project_folder: &str) -> Result<Option<ProjectContext>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let result = conn.query_row(
            "SELECT id, project_folder, content, importance, created_at, updated_at, last_accessed
             FROM project_memories
             WHERE project_folder = ?1 AND memory_type = ?2",
            params![project_folder, ProjectMemoryType::Context.as_str()],
            |row| {
                let content: String = row.get(2)?;
                let mut ctx: ProjectContext =
                    serde_json::from_str(&content).map_err(|_| rusqlite::Error::InvalidQuery)?;
                ctx.id = row.get(0)?;
                ctx.importance = row.get(3)?;
                ctx.created_at = row.get::<_, String>(4)?;
                ctx.updated_at = row.get::<_, String>(5)?;
                ctx.last_accessed = row.get::<_, Option<String>>(6)?;
                Ok(ctx)
            },
        );

        match result {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(Error::Database(format!(
                "Failed to get project context: {}",
                e
            ))),
        }
    }

    // =========================================================================
    // CODING STYLE METHODS
    // =========================================================================

    /// Save or update a coding style entry.
    ///
    /// Deduplicates on `(project_folder, memory_type, style_key)` via a
    /// content-aware lookup: if an existing coding_style row for the same
    /// project contains a matching `style_key` inside its JSON content, we
    /// UPDATE that row. Otherwise we INSERT a new row. This allows multiple
    /// coding styles per project (different keys) while preventing duplicates
    /// for the same key, and avoids UNIQUE-constraint crashes on pre-v58
    /// databases.
    pub fn save_coding_style(
        &self,
        project_folder: &str,
        style_key: &str,
        style_value: &str,
        category: &str, // "naming", "pattern", "formatting", "convention"
        importance: Option<i32>,
    ) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let importance = importance.unwrap_or(5).clamp(1, 10);

        let style = CodingStyle {
            id: 0,
            project_folder: project_folder.to_string(),
            style_key: style_key.to_string(),
            style_value: style_value.to_string(),
            category: category.to_string(),
            importance,
            created_at: String::new(),
            updated_at: String::new(),
        };

        let content = serde_json::to_string(&style)
            .map_err(|e| Error::Generic(format!("Failed to serialize style: {}", e)))?;

        // Build a JSON key pattern to match existing rows with the same style_key.
        // Use serde_json to get the exact JSON-escaped form of the key, then escape
        // SQL LIKE wildcards. This handles backslashes correctly (JSON doubles them).
        let json_escaped_key = serde_json::to_string(style_key)
            .unwrap_or_else(|_| format!("\"{}\"", style_key));
        // Strip surrounding quotes from JSON string
        let json_inner = &json_escaped_key[1..json_escaped_key.len() - 1];
        let key_pattern = format!(
            "%\"style_key\":\"{}\"%",
            json_inner
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );

        // Atomic upsert: try UPDATE on the existing row with the same style_key.
        let updated = conn
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
                    ProjectMemoryType::CodingStyle.as_str(),
                    key_pattern
                ],
            )
            .map_err(|e| {
                Error::Database(format!("Failed to update coding style: {}", e))
            })?;

        if updated == 0 {
            conn.execute(
                "INSERT INTO project_memories (project_folder, memory_type, content, importance, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
                params![
                    project_folder,
                    ProjectMemoryType::CodingStyle.as_str(),
                    content,
                    importance
                ],
            )
            .map_err(|e| {
                Error::Database(format!(
                    "Failed to save coding style '{}' for '{}': {}",
                    style_key, project_folder, e
                ))
            })?;
        }

        // Return the id of the upserted row.
        let id: i64 = conn
            .query_row(
                "SELECT id FROM project_memories
                 WHERE project_folder = ?1 AND memory_type = ?2 AND content LIKE ?3 ESCAPE '\\'
                 ORDER BY updated_at DESC LIMIT 1",
                params![
                    project_folder,
                    ProjectMemoryType::CodingStyle.as_str(),
                    key_pattern
                ],
                |row| row.get(0),
            )
            .map_err(|e| Error::Database(format!("Failed to get memory id: {}", e)))?;

        Ok(id)
    }

    /// Get all coding styles for a project
    pub fn get_coding_styles(&self, project_folder: &str) -> Result<Vec<CodingStyle>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_folder, content, importance, created_at, updated_at, last_accessed
                 FROM project_memories
                 WHERE project_folder = ?1 AND memory_type = ?2
                 ORDER BY importance DESC, updated_at DESC",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let styles = stmt
            .query_map(
                params![project_folder, ProjectMemoryType::CodingStyle.as_str()],
                |row| {
                    let content: String = row.get(2)?;
                    let mut style: CodingStyle = serde_json::from_str(&content)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?;
                    style.id = row.get(0)?;
                    style.importance = row.get(3)?;
                    style.created_at = row.get::<_, String>(4)?;
                    style.updated_at = row.get::<_, String>(5)?;
                    Ok(style)
                },
            )
            .map_err(|e| Error::Database(format!("Failed to query styles: {}", e)))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| Error::Database(format!("Failed to collect styles: {}", e)))?;

        Ok(styles)
    }

    // =========================================================================
    // ARCHITECTURAL DECISION METHODS
    // =========================================================================

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
        let conn = self
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
        let json_escaped_decision = serde_json::to_string(decision)
            .unwrap_or_else(|_| format!("\"{}\"", decision));
        let json_inner_decision = &json_escaped_decision[1..json_escaped_decision.len() - 1];
        let decision_pattern = format!(
            "%\"decision\":\"{}\"%",
            json_inner_decision
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );

        // Atomic upsert: try UPDATE on an existing row with the same decision text.
        let updated = conn
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
                Error::Database(format!(
                    "Failed to update architectural decision: {}",
                    e
                ))
            })?;

        if updated == 0 {
            conn.execute(
                "INSERT INTO project_memories (project_folder, memory_type, content, importance, created_at, updated_at)
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

    /// Get architectural decisions for a project
    pub fn get_architectural_decisions(
        &self,
        project_folder: &str,
        status: Option<&str>,
    ) -> Result<Vec<ArchitecturalDecision>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_folder, content, importance, created_at, updated_at, last_accessed
                 FROM project_memories
                 WHERE project_folder = ?1 AND memory_type = ?2
                 ORDER BY created_at DESC",
            )
            .map_err(|e| Error::Database(format!("Failed to prepare query: {}", e)))?;

        let decisions = stmt
            .query_map(
                params![
                    project_folder,
                    ProjectMemoryType::ArchitecturalDecision.as_str()
                ],
                |row| {
                    let content: String = row.get(2)?;
                    let mut decision: ArchitecturalDecision = serde_json::from_str(&content)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?;
                    decision.id = row.get(0)?;
                    decision.importance = row.get(3)?;
                    decision.created_at = row.get::<_, String>(4)?;
                    decision.updated_at = row.get::<_, String>(5)?;

                    Ok(decision)
                },
            )
            .map_err(|e| Error::Database(format!("Failed to query decisions: {}", e)))?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();

        // Filter by status if provided
        let filtered = if let Some(status_filter) = status {
            decisions
                .into_iter()
                .filter(|d| d.status.as_str() == status_filter)
                .collect()
        } else {
            decisions
        };

        Ok(filtered)
    }

    // =========================================================================
    // GENERIC MEMORY METHODS
    // =========================================================================

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

    /// Update memory importance (for usage decay/boost)
    pub fn update_memory_importance(&self, memory_id: i64, importance: i32) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let importance = importance.clamp(1, 10);

        conn.execute(
            "UPDATE project_memories SET importance = ?1, last_accessed = datetime('now') WHERE id = ?2",
            params![importance, memory_id],
        )
        .map_err(|e| Error::Database(format!("Failed to update importance: {}", e)))?;

        Ok(())
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

    /// Clear all memories for a project
    pub fn clear_project_memories(&self, project_folder: &str) -> Result<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let rows = conn
            .execute(
                "DELETE FROM project_memories WHERE project_folder = ?1",
                params![project_folder],
            )
            .map_err(|e| Error::Database(format!("Failed to clear memories: {}", e)))?;

        Ok(rows)
    }

    /// Get statistics about project memories
    pub fn get_project_memory_stats(&self, project_folder: &str) -> Result<serde_json::Value> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let total_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM project_memories WHERE project_folder = ?1",
                params![project_folder],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let by_type_count: Vec<(String, i64)> = conn
            .prepare(
                "SELECT memory_type, COUNT(*) FROM project_memories WHERE project_folder = ?1 GROUP BY memory_type",
            )
            .ok()
            .and_then(|mut stmt| {
                stmt.query_map(params![project_folder], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
            })
            .unwrap_or_default();

        let avg_importance: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(importance), 0) FROM project_memories WHERE project_folder = ?1",
                params![project_folder],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        Ok(serde_json::json!({
            "total_memories": total_count,
            "avg_importance": avg_importance,
            "by_type": by_type_count.iter().map(|(t, c)| {
                (t.clone(), *c)
            }).collect::<std::collections::HashMap<_, _>>(),
            "last_updated": conn.query_row(
                "SELECT MAX(updated_at) FROM project_memories WHERE project_folder = ?1",
                params![project_folder],
                |row| row.get::<_, Option<String>>(0)
            ).ok().flatten()
        }))
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
    fn test_save_and_get_project_context() {
        let (_temp_dir, manager) = setup_test_db();

        let id = manager
            .save_project_context(
                "/path/to/project",
                vec!["Rust".to_string(), "TypeScript".to_string()],
                Some("Rust"),
                Some("Follows Rust 2021 conventions"),
                vec!["Tokio".to_string(), "Tauri".to_string()],
                Some(8),
            )
            .unwrap();

        assert!(id > 0);

        let context = manager
            .get_project_context("/path/to/project")
            .unwrap()
            .unwrap();
        assert_eq!(context.main_language, Some("Rust".to_string()));
        assert_eq!(context.tech_stack.len(), 2);
        assert_eq!(context.importance, 8);
    }

    #[test]
    fn test_save_coding_style() {
        let (_temp_dir, manager) = setup_test_db();

        let id = manager
            .save_coding_style(
                "/path/to/project",
                "variable_naming",
                "use snake_case for variables",
                "naming",
                Some(7),
            )
            .unwrap();

        assert!(id > 0);
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

        let decisions = manager
            .get_architectural_decisions("/path/to/project", None)
            .unwrap();
        assert_eq!(decisions.len(), 1);
        assert_eq!(decisions[0].status, "accepted");
    }

    #[test]
    fn test_search_memories() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .save_project_context(
                "/path/to/project",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                None,
            )
            .unwrap();

        let results = manager
            .search_project_memories("/path/to/project", "Rust", 10)
            .unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_update_importance() {
        let (_temp_dir, manager) = setup_test_db();

        let id = manager
            .save_project_context("/path/to/project", vec![], None, None, vec![], Some(5))
            .unwrap();

        manager.update_memory_importance(id, 9).unwrap();

        let memories = manager.get_project_memories("/path/to/project").unwrap();
        assert_eq!(memories[0].importance, 9);
    }

    #[test]
    fn test_get_stats() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .save_project_context("/path/to/project", vec![], None, None, vec![], Some(8))
            .unwrap();

        let stats = manager
            .get_project_memory_stats("/path/to/project")
            .unwrap();
        assert_eq!(stats["total_memories"], 1);
    }

    // =========================================================================
    // BUG #49 REGRESSION TESTS: duplicate insertion scenarios
    // =========================================================================

    #[test]
    fn test_duplicate_project_context_updates_instead_of_crashing() {
        let (_temp_dir, manager) = setup_test_db();

        // First save
        let id1 = manager
            .save_project_context(
                "/path/to/project",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                Some(5),
            )
            .unwrap();

        // Second save for same project should update, not crash or duplicate
        let id2 = manager
            .save_project_context(
                "/path/to/project",
                vec!["Rust".to_string(), "TypeScript".to_string()],
                Some("TypeScript"),
                Some("New conventions"),
                vec!["React".to_string()],
                Some(8),
            )
            .unwrap();

        // Should return the same row id (update, not insert)
        assert_eq!(id1, id2);

        // Should only have one context row
        let memories = manager.get_project_memories("/path/to/project").unwrap();
        assert_eq!(memories.len(), 1);

        // Verify the content was updated
        let context = manager
            .get_project_context("/path/to/project")
            .unwrap()
            .unwrap();
        assert_eq!(
            context.main_language,
            Some("TypeScript".to_string())
        );
        assert_eq!(context.tech_stack.len(), 2);
        assert_eq!(context.importance, 8);
    }

    #[test]
    fn test_duplicate_project_context_with_unique_constraint() {
        let (_temp_dir, manager) = setup_test_db_with_unique_constraint();

        // First save on pre-v58 schema (has UNIQUE constraint)
        let id1 = manager
            .save_project_context(
                "/path/to/project",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                Some(5),
            )
            .unwrap();

        // Second save must not crash with UNIQUE constraint violation
        let id2 = manager
            .save_project_context(
                "/path/to/project",
                vec!["Python".to_string()],
                Some("Python"),
                None,
                vec![],
                Some(7),
            )
            .unwrap();

        assert_eq!(id1, id2);

        let context = manager
            .get_project_context("/path/to/project")
            .unwrap()
            .unwrap();
        assert_eq!(context.main_language, Some("Python".to_string()));
    }

    #[test]
    fn test_duplicate_coding_style_same_key_updates() {
        let (_temp_dir, manager) = setup_test_db();

        // First save
        let id1 = manager
            .save_coding_style(
                "/path/to/project",
                "variable_naming",
                "use snake_case",
                "naming",
                Some(5),
            )
            .unwrap();

        // Second save with same style_key should update
        let id2 = manager
            .save_coding_style(
                "/path/to/project",
                "variable_naming",
                "use camelCase",
                "naming",
                Some(8),
            )
            .unwrap();

        assert_eq!(id1, id2);

        let styles = manager.get_coding_styles("/path/to/project").unwrap();
        assert_eq!(styles.len(), 1);
        assert_eq!(styles[0].style_value, "use camelCase");
        assert_eq!(styles[0].importance, 8);
    }

    #[test]
    fn test_coding_style_different_keys_create_separate_rows() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .save_coding_style(
                "/path/to/project",
                "variable_naming",
                "use snake_case",
                "naming",
                Some(5),
            )
            .unwrap();

        manager
            .save_coding_style(
                "/path/to/project",
                "function_naming",
                "use camelCase",
                "naming",
                Some(6),
            )
            .unwrap();

        let styles = manager.get_coding_styles("/path/to/project").unwrap();
        assert_eq!(styles.len(), 2);
    }

    #[test]
    fn test_coding_style_with_unique_constraint() {
        let (_temp_dir, manager) = setup_test_db_with_unique_constraint();

        // First save on pre-v58 schema
        let id1 = manager
            .save_coding_style(
                "/path/to/project",
                "variable_naming",
                "use snake_case",
                "naming",
                Some(5),
            )
            .unwrap();

        // Second save must not crash with UNIQUE constraint violation
        let id2 = manager
            .save_coding_style(
                "/path/to/project",
                "variable_naming",
                "use camelCase",
                "naming",
                Some(8),
            )
            .unwrap();

        assert_eq!(id1, id2);
    }

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

        let decisions = manager
            .get_architectural_decisions("/path/to/project", None)
            .unwrap();
        assert_eq!(decisions.len(), 1);
        assert_eq!(decisions[0].status, "accepted");
        assert_eq!(decisions[0].importance, 9);
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

        let decisions = manager
            .get_architectural_decisions("/path/to/project", None)
            .unwrap();
        assert_eq!(decisions.len(), 2);
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

    #[test]
    fn test_different_projects_independent_contexts() {
        let (_temp_dir, manager) = setup_test_db();

        let id1 = manager
            .save_project_context(
                "/project/alpha",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                Some(5),
            )
            .unwrap();

        let id2 = manager
            .save_project_context(
                "/project/beta",
                vec!["Python".to_string()],
                Some("Python"),
                None,
                vec![],
                Some(7),
            )
            .unwrap();

        // Different projects should have separate rows
        assert_ne!(id1, id2);

        let ctx_alpha = manager
            .get_project_context("/project/alpha")
            .unwrap()
            .unwrap();
        assert_eq!(ctx_alpha.main_language, Some("Rust".to_string()));

        let ctx_beta = manager
            .get_project_context("/project/beta")
            .unwrap()
            .unwrap();
        assert_eq!(ctx_beta.main_language, Some("Python".to_string()));
    }

    #[test]
    fn test_triple_context_save_produces_single_row() {
        let (_temp_dir, manager) = setup_test_db();

        manager
            .save_project_context(
                "/path/to/project",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                Some(5),
            )
            .unwrap();

        manager
            .save_project_context(
                "/path/to/project",
                vec!["Python".to_string()],
                Some("Python"),
                None,
                vec![],
                Some(6),
            )
            .unwrap();

        manager
            .save_project_context(
                "/path/to/project",
                vec!["Go".to_string()],
                Some("Go"),
                None,
                vec![],
                Some(9),
            )
            .unwrap();

        // Still only one row after three saves
        let memories = manager.get_project_memories("/path/to/project").unwrap();
        assert_eq!(memories.len(), 1);

        let context = manager
            .get_project_context("/path/to/project")
            .unwrap()
            .unwrap();
        assert_eq!(context.main_language, Some("Go".to_string()));
        assert_eq!(context.importance, 9);
    }
}
