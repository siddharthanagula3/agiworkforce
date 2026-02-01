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
        .save_architectural_decision(&project_folder, &decision, &rationale, Some("accepted"), Some(8))
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
        .save_architectural_decision(project_folder, decision, rationale, Some("accepted"), Some(8))
        .map_err(|e| format!("Failed to record AGI decision: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_save_and_get_project_context() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let state = ProjectMemoryState::new(db_path.to_str().unwrap())
            .expect("Failed to create state");

        let request = SaveProjectContextRequest {
            project_folder: "/test/project".to_string(),
            tech_stack: vec!["Rust".to_string(), "TypeScript".to_string()],
            main_language: Some("Rust".to_string()),
            conventions: Some("Rust 2021 conventions".to_string()),
            frameworks: vec!["Tokio".to_string()],
            importance: Some(8),
        };

        // Test the manager directly without State wrapper
        let manager = state.manager.read().await;
        let id = manager
            .save_project_context(
                &request.project_folder,
                request.tech_stack,
                request.main_language.as_deref(),
                request.conventions.as_deref(),
                request.frameworks,
                request.importance,
            )
            .expect("Failed to save");
        assert!(id > 0);
    }

    #[tokio::test]
    async fn test_save_architectural_decision() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let state = ProjectMemoryState::new(db_path.to_str().unwrap())
            .expect("Failed to create state");

        let request = SaveArchitecturalDecisionRequest {
            project_folder: "/test/project".to_string(),
            decision: "Use event-driven architecture".to_string(),
            rationale: "For better scalability".to_string(),
            status: Some("accepted".to_string()),
            importance: Some(9),
        };

        // Test the manager directly without State wrapper
        let manager = state.manager.read().await;
        let id = manager
            .save_architectural_decision(
                &request.project_folder,
                &request.decision,
                &request.rationale,
                request.status.as_deref(),
                request.importance,
            )
            .expect("Failed to save");
        assert!(id > 0);
    }
}
