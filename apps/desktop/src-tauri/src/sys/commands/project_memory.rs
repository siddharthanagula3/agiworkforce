//! Tauri commands for the memories a chat recalls when it works in one project folder.

use crate::core::agi::project_memory::{ProjectMemory, ProjectMemoryManager};
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

const MAX_PROJECT_MEMORY_FIELD_CHARS: usize = 1_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveArchitecturalDecisionRequest {
    pub project_folder: String,
    pub decision: String,
    #[serde(default)]
    pub rationale: String,
}

fn bounded_memory_field(label: &str, value: &str, required: bool) -> Result<String, String> {
    let trimmed = value.trim();
    if required && trimmed.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if trimmed.chars().count() > MAX_PROJECT_MEMORY_FIELD_CHARS {
        return Err(format!(
            "{label} cannot exceed {MAX_PROJECT_MEMORY_FIELD_CHARS} characters"
        ));
    }
    Ok(trimmed.to_string())
}

#[derive(Clone)]
pub struct ProjectMemoryState {
    pub manager: Arc<RwLock<ProjectMemoryManager>>,
}

impl ProjectMemoryState {
    pub fn new(db_path: &str) -> Result<Self, String> {
        let manager = ProjectMemoryManager::new(db_path)
            .map_err(|e| format!("Failed to initialize ProjectMemoryManager: {}", e))?;

        Ok(Self {
            manager: Arc::new(RwLock::new(manager)),
        })
    }

    /// Create a ProjectMemoryState over an already keyed main-database
    /// connection (see `ProjectMemoryManager::from_connection` for why the
    /// main DB cannot go through `open_keyed_connection`).
    pub fn from_connection(conn: rusqlite::Connection) -> Self {
        Self {
            manager: Arc::new(RwLock::new(ProjectMemoryManager::from_connection(conn))),
        }
    }

    /// Create a degraded ProjectMemoryState backed by an in-memory database.
    /// Commands will function but data will not persist across restarts.
    pub fn new_degraded() -> Self {
        let manager = ProjectMemoryManager::new(":memory:")
            .expect("in-memory ProjectMemoryManager should never fail to construct");
        Self {
            manager: Arc::new(RwLock::new(manager)),
        }
    }
}

/// Save a decision the user wants chats in this folder to remember.
#[tauri::command]
pub async fn save_architectural_decision(
    request: SaveArchitecturalDecisionRequest,
    state: State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let project_folder = request.project_folder.trim();
    if project_folder.is_empty() {
        return Err("Project folder cannot be empty".to_string());
    }
    let decision = bounded_memory_field("Memory", &request.decision, true)?;
    let rationale = bounded_memory_field("Reason", &request.rationale, false)?;
    let manager = state.manager.read().await;

    manager
        .save_architectural_decision(project_folder, &decision, &rationale, None, None)
        .map_err(|e| format!("Failed to save project memory: {}", e))
}

/// Get all memories for a project
#[tauri::command]
pub async fn get_project_memories(
    project_folder: String,
    state: State<'_, ProjectMemoryState>,
) -> Result<Vec<ProjectMemory>, String> {
    let manager = state.manager.read().await;

    manager
        .get_project_memories(&project_folder)
        .map_err(|e| format!("Failed to get project memories: {}", e))
}

/// Delete a memory by ID
#[tauri::command]
pub async fn delete_project_memory(
    memory_id: i64,
    state: State<'_, ProjectMemoryState>,
) -> Result<bool, String> {
    let manager = state.manager.read().await;

    manager
        .delete_memory(memory_id)
        .map_err(|e| format!("Failed to delete memory: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::TempDir;

    #[test]
    fn a_project_memory_must_have_text_and_stay_within_the_prompt_bound() {
        assert_eq!(
            bounded_memory_field("Memory", "  Use pnpm  ", true).as_deref(),
            Ok("Use pnpm")
        );
        assert!(bounded_memory_field("Memory", "   ", true).is_err());
        assert_eq!(
            bounded_memory_field("Reason", "   ", false).as_deref(),
            Ok("")
        );
        assert!(bounded_memory_field(
            "Memory",
            &"界".repeat(MAX_PROJECT_MEMORY_FIELD_CHARS + 1),
            true
        )
        .is_err());
        assert!(
            bounded_memory_field("Memory", &"界".repeat(MAX_PROJECT_MEMORY_FIELD_CHARS), true)
                .is_ok()
        );
    }

    #[test]
    fn the_save_request_reads_the_renderers_camel_case_fields() {
        let request: SaveArchitecturalDecisionRequest = serde_json::from_value(serde_json::json!({
            "projectFolder": "/workspace/app",
            "decision": "Use pnpm"
        }))
        .expect("request");
        assert_eq!(request.project_folder, "/workspace/app");
        assert_eq!(request.decision, "Use pnpm");
        assert!(request.rationale.is_empty());
    }

    /// Uses the pre-v58 schema WITH the UNIQUE constraint to reproduce bug #49.
    fn init_test_db_with_unique(db_path: &std::path::Path) {
        let conn = Connection::open(db_path).unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS project_memories (
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
    }

    #[tokio::test]
    async fn test_save_architectural_decision() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        init_test_db_with_unique(&db_path);

        let state =
            ProjectMemoryState::new(db_path.to_str().unwrap()).expect("Failed to create state");

        let manager = state.manager.read().await;
        let id = manager
            .save_architectural_decision(
                "/test/project",
                "Use event-driven architecture",
                "For better scalability",
                Some("accepted"),
                Some(9),
            )
            .expect("Failed to save");
        assert!(id > 0);
    }

    /// Bug #49 regression: duplicate decision save must not crash on UNIQUE constraint.
    #[tokio::test]
    async fn test_duplicate_decision_no_crash_with_unique() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        init_test_db_with_unique(&db_path);

        let state =
            ProjectMemoryState::new(db_path.to_str().unwrap()).expect("Failed to create state");

        let manager = state.manager.read().await;

        let id1 = manager
            .save_architectural_decision(
                "/test/project",
                "Use event-driven architecture",
                "Scalability",
                Some("proposed"),
                Some(7),
            )
            .expect("First save should succeed");

        // This was the crash in bug #49
        let id2 = manager
            .save_architectural_decision(
                "/test/project",
                "Use event-driven architecture",
                "Updated rationale",
                Some("accepted"),
                Some(9),
            )
            .expect("Second save must not crash on UNIQUE constraint");

        assert_eq!(id1, id2, "Duplicate save should update same row");
    }
}
