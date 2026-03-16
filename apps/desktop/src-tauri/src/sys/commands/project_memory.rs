//! Tauri commands for project-scoped long-term memory system
//!
//! Commands for managing project context, coding styles, and architectural decisions
//! with persistent storage across sessions and semantic search support.

use crate::core::agi::project_memory::{
    ArchitecturalDecision, CodingStyle, ProjectContext, ProjectMemory, ProjectMemoryManager,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

/// Request to save project context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProjectContextRequest {
    pub project_folder: String,
    pub tech_stack: Vec<String>,
    pub main_language: Option<String>,
    pub conventions: Option<String>,
    pub frameworks: Vec<String>,
    pub importance: Option<i32>,
}

/// Request to save coding style
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveCodingStyleRequest {
    pub project_folder: String,
    pub style_key: String,
    pub style_value: String,
    pub category: String, // "naming", "pattern", "formatting", "convention"
    pub importance: Option<i32>,
}

/// Request to save architectural decision
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveArchitecturalDecisionRequest {
    pub project_folder: String,
    pub decision: String,
    pub rationale: String,
    pub status: Option<String>, // "proposed", "accepted", "deprecated"
    pub importance: Option<i32>,
}

/// Request to search memories
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMemoriesRequest {
    pub project_folder: String,
    pub query: String,
    pub limit: Option<usize>,
}

// =============================================================================
// STATE
// =============================================================================

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

// =============================================================================
// TAURI COMMANDS
// =============================================================================

/// Save or update project context
#[tauri::command]
pub async fn save_project_context(
    request: SaveProjectContextRequest,
    state: State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let manager = state.manager.read().await;

    manager
        .save_project_context(
            &request.project_folder,
            request.tech_stack,
            request.main_language.as_deref(),
            request.conventions.as_deref(),
            request.frameworks,
            request.importance,
        )
        .map_err(|e| format!("Failed to save project context: {}", e))
}

/// Get project context
#[tauri::command]
pub async fn get_project_context(
    project_folder: String,
    state: State<'_, ProjectMemoryState>,
) -> Result<Option<ProjectContext>, String> {
    let manager = state.manager.read().await;

    manager
        .get_project_context(&project_folder)
        .map_err(|e| format!("Failed to get project context: {}", e))
}

/// Save or update coding style
#[tauri::command]
pub async fn save_coding_style(
    request: SaveCodingStyleRequest,
    state: State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let manager = state.manager.read().await;

    manager
        .save_coding_style(
            &request.project_folder,
            &request.style_key,
            &request.style_value,
            &request.category,
            request.importance,
        )
        .map_err(|e| format!("Failed to save coding style: {}", e))
}

/// Get all coding styles for a project
#[tauri::command]
pub async fn get_coding_styles(
    project_folder: String,
    state: State<'_, ProjectMemoryState>,
) -> Result<Vec<CodingStyle>, String> {
    let manager = state.manager.read().await;

    manager
        .get_coding_styles(&project_folder)
        .map_err(|e| format!("Failed to get coding styles: {}", e))
}

/// Save architectural decision
#[tauri::command]
pub async fn save_architectural_decision(
    request: SaveArchitecturalDecisionRequest,
    state: State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let manager = state.manager.read().await;

    manager
        .save_architectural_decision(
            &request.project_folder,
            &request.decision,
            &request.rationale,
            request.status.as_deref(),
            request.importance,
        )
        .map_err(|e| format!("Failed to save architectural decision: {}", e))
}

/// Get architectural decisions for a project
#[tauri::command]
pub async fn get_architectural_decisions(
    project_folder: String,
    status: Option<String>,
    state: State<'_, ProjectMemoryState>,
) -> Result<Vec<ArchitecturalDecision>, String> {
    let manager = state.manager.read().await;

    manager
        .get_architectural_decisions(&project_folder, status.as_deref())
        .map_err(|e| format!("Failed to get architectural decisions: {}", e))
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

/// Search project memories by content
#[tauri::command]
pub async fn search_project_memories(
    request: SearchMemoriesRequest,
    state: State<'_, ProjectMemoryState>,
) -> Result<Vec<ProjectMemory>, String> {
    let manager = state.manager.read().await;

    let limit = request.limit.unwrap_or(10);
    manager
        .search_project_memories(&request.project_folder, &request.query, limit)
        .map_err(|e| format!("Failed to search memories: {}", e))
}

/// Update memory importance (for decay/boost on access)
#[tauri::command]
pub async fn update_memory_importance(
    memory_id: i64,
    importance: i32,
    state: State<'_, ProjectMemoryState>,
) -> Result<(), String> {
    let manager = state.manager.read().await;

    manager
        .update_memory_importance(memory_id, importance)
        .map_err(|e| format!("Failed to update memory importance: {}", e))
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

/// Clear all memories for a project
#[tauri::command]
pub async fn clear_project_memories(
    project_folder: String,
    state: State<'_, ProjectMemoryState>,
) -> Result<usize, String> {
    let manager = state.manager.read().await;

    manager
        .clear_project_memories(&project_folder)
        .map_err(|e| format!("Failed to clear memories: {}", e))
}

/// Get statistics about project memories
#[tauri::command]
pub async fn get_project_memory_stats(
    project_folder: String,
    state: State<'_, ProjectMemoryState>,
) -> Result<serde_json::Value, String> {
    let manager = state.manager.read().await;

    manager
        .get_project_memory_stats(&project_folder)
        .map_err(|e| format!("Failed to get memory stats: {}", e))
}

/// Auto-save a decision from AGI execution
/// This is called automatically after significant AGI decisions
#[tauri::command]
pub async fn auto_save_decision(
    project_folder: String,
    decision: String,
    rationale: String,
    state: State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let manager = state.manager.read().await;

    // Auto-saved decisions are marked with high importance and "accepted" status
    manager
        .save_architectural_decision(
            &project_folder,
            &decision,
            &rationale,
            Some("accepted"),
            Some(8),
        )
        .map_err(|e| format!("Failed to auto-save decision: {}", e))
}

// =============================================================================
// HELPER FUNCTIONS FOR AGI INTEGRATION
// =============================================================================

/// Called by AGI when starting work on a project
/// Loads project context into the AGI's session memory
pub async fn load_project_context_for_agi(
    project_folder: &str,
    state: &State<'_, ProjectMemoryState>,
) -> Result<Option<ProjectContext>, String> {
    let manager = state.manager.read().await;
    manager
        .get_project_context(project_folder)
        .map_err(|e| format!("Failed to load project context: {}", e))
}

/// Called by AGI when learning about the project
/// Saves discovered context to long-term memory
pub async fn update_project_context_from_agi(
    project_folder: &str,
    tech_stack: Vec<String>,
    main_language: Option<String>,
    conventions: Option<String>,
    frameworks: Vec<String>,
    state: &State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let manager = state.manager.read().await;
    manager
        .save_project_context(
            project_folder,
            tech_stack,
            main_language.as_deref(),
            conventions.as_deref(),
            frameworks,
            Some(7), // High importance for AGI-learned context
        )
        .map_err(|e| format!("Failed to update project context: {}", e))
}

/// Called by AGI when recording architectural decisions
pub async fn record_agi_decision(
    project_folder: &str,
    decision: &str,
    rationale: &str,
    state: &State<'_, ProjectMemoryState>,
) -> Result<i64, String> {
    let manager = state.manager.read().await;
    manager
        .save_architectural_decision(
            project_folder,
            decision,
            rationale,
            Some("accepted"),
            Some(8),
        )
        .map_err(|e| format!("Failed to record AGI decision: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::TempDir;

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

    /// Uses the post-v58 schema WITHOUT the UNIQUE constraint.
    fn init_test_db_without_unique(db_path: &std::path::Path) {
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
                last_accessed TEXT
            )",
            [],
        )
        .unwrap();
    }

    #[tokio::test]
    async fn test_save_and_get_project_context() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        init_test_db_with_unique(&db_path);

        let state =
            ProjectMemoryState::new(db_path.to_str().unwrap()).expect("Failed to create state");

        let manager = state.manager.read().await;
        let id = manager
            .save_project_context(
                "/test/project",
                vec!["Rust".to_string(), "TypeScript".to_string()],
                Some("Rust"),
                Some("Rust 2021 conventions"),
                vec!["Tokio".to_string()],
                Some(8),
            )
            .expect("Failed to save");
        assert!(id > 0);
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

    /// Bug #49 regression: duplicate context save must not crash on UNIQUE constraint.
    #[tokio::test]
    async fn test_duplicate_context_no_crash_with_unique() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        init_test_db_with_unique(&db_path);

        let state =
            ProjectMemoryState::new(db_path.to_str().unwrap()).expect("Failed to create state");

        let manager = state.manager.read().await;

        let id1 = manager
            .save_project_context(
                "/test/project",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                Some(5),
            )
            .expect("First save should succeed");

        // This was the crash in bug #49
        let id2 = manager
            .save_project_context(
                "/test/project",
                vec!["Python".to_string()],
                Some("Python"),
                None,
                vec![],
                Some(8),
            )
            .expect("Second save must not crash on UNIQUE constraint");

        assert_eq!(id1, id2, "Duplicate save should update same row");
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

    /// Bug #49 regression: duplicate coding style save must not crash on UNIQUE constraint.
    #[tokio::test]
    async fn test_duplicate_coding_style_no_crash_with_unique() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        init_test_db_with_unique(&db_path);

        let state =
            ProjectMemoryState::new(db_path.to_str().unwrap()).expect("Failed to create state");

        let manager = state.manager.read().await;

        let id1 = manager
            .save_coding_style(
                "/test/project",
                "variable_naming",
                "use snake_case",
                "naming",
                Some(5),
            )
            .expect("First save should succeed");

        // This was the crash in bug #49
        let id2 = manager
            .save_coding_style(
                "/test/project",
                "variable_naming",
                "use camelCase",
                "naming",
                Some(8),
            )
            .expect("Second save must not crash on UNIQUE constraint");

        assert_eq!(id1, id2, "Duplicate save should update same row");
    }

    /// Verify post-v58 (no UNIQUE constraint) also works correctly.
    #[tokio::test]
    async fn test_duplicate_context_no_duplicate_rows_without_unique() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        init_test_db_without_unique(&db_path);

        let state =
            ProjectMemoryState::new(db_path.to_str().unwrap()).expect("Failed to create state");

        let manager = state.manager.read().await;

        manager
            .save_project_context(
                "/test/project",
                vec!["Rust".to_string()],
                Some("Rust"),
                None,
                vec![],
                Some(5),
            )
            .expect("First save");

        manager
            .save_project_context(
                "/test/project",
                vec!["Go".to_string()],
                Some("Go"),
                None,
                vec![],
                Some(7),
            )
            .expect("Second save");

        let memories = manager
            .get_project_memories("/test/project")
            .expect("get memories");
        assert_eq!(memories.len(), 1, "Should be exactly one context row");
    }
}
