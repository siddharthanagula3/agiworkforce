//! Chat memory integration handler
//!
//! Loads account and project memories into the LLM context for a chat turn.

use crate::core::agi::memory_manager::MemoryManager;
use crate::core::agi::project_memory::ProjectMemoryManager;
use crate::core::llm::memory_integration::{
    MemoryInjectionConfig, MemoryInjectionResult, MemoryInjector,
};
use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Response from memory loading
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadProjectMemoriesResponse {
    pub injection_result: MemoryInjectionResult,
    pub system_prompt_enhancement: String,
    pub message: String,
}

/// Handler for chat memory operations
pub struct ChatMemoryHandler {
    memory_manager: Option<std::sync::Arc<MemoryManager>>,
    project_memory_manager: Option<std::sync::Arc<tokio::sync::RwLock<ProjectMemoryManager>>>,
    injector: MemoryInjector,
}

impl ChatMemoryHandler {
    /// Create a handler backed by both global and exact-folder project memory.
    pub fn with_project_config(
        memory_manager: Option<std::sync::Arc<MemoryManager>>,
        project_memory_manager: Option<std::sync::Arc<tokio::sync::RwLock<ProjectMemoryManager>>>,
        config: MemoryInjectionConfig,
    ) -> Result<Self> {
        let injector = MemoryInjector::new(config)?;

        Ok(Self {
            memory_manager,
            project_memory_manager,
            injector,
        })
    }

    /// Load project memories and prepare context
    pub async fn load_project_memories(
        &self,
        project_path: Option<&str>,
    ) -> Result<LoadProjectMemoriesResponse> {
        let manager = self
            .memory_manager
            .as_ref()
            .ok_or_else(|| Error::Other("Memory manager not initialized".to_string()))?;

        let project_manager = match self.project_memory_manager.as_ref() {
            Some(project_manager) => Some(project_manager.read().await),
            None => None,
        };
        let injection = match self.injector.load_project_memories(
            manager,
            project_manager.as_deref(),
            project_path,
        ) {
            Ok(injection) => injection,
            Err(error) if project_manager.is_some() => {
                // A degraded/corrupt project store must not suppress healthy
                // global preferences. Retry without project data, but never
                // fall back to the old basename search or a global project write.
                warn!(
                    "[ChatMemory] Exact project memory unavailable; loading global memories only: {}",
                    error
                );
                self.injector
                    .load_project_memories(manager, None, project_path)?
            }
            Err(error) => return Err(error),
        };

        let system_prompt = self.injector.build_system_prompt_enhancement(&injection);

        let message = if injection.has_relevant_memories {
            format!(
                "Loaded {} memories for project context (Decisions: {}, Preferences: {}, Facts: {})",
                injection.memories_loaded,
                injection.summary.decisions,
                injection.summary.preferences,
                injection.summary.facts
            )
        } else {
            "No project memories found. Starting fresh context.".to_string()
        };

        info!("[ChatMemory] {}", message);

        Ok(LoadProjectMemoriesResponse {
            injection_result: injection,
            system_prompt_enhancement: system_prompt,
            message,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_memory_managers(
        with_project_table: bool,
        global_memory: Option<&str>,
    ) -> (
        tempfile::TempDir,
        std::sync::Arc<MemoryManager>,
        std::sync::Arc<tokio::sync::RwLock<ProjectMemoryManager>>,
    ) {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("scoped-memory.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE user_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                topic TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL,
                source TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT
            );",
        )
        .unwrap();
        if with_project_table {
            conn.execute_batch(
                "CREATE TABLE project_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_folder TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                content TEXT NOT NULL,
                importance INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_accessed TEXT
            );",
            )
            .unwrap();
        }
        if let Some(content) = global_memory {
            conn.execute(
                "INSERT INTO user_memory
                 (category, topic, content, importance, source)
                 VALUES ('preference', 'global-style', ?1, 9, NULL)",
                [content],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO user_memory
                 (category, topic, content, importance, source)
                 VALUES ('decision', 'legacy-project-decision',
                         'legacy-decision-must-not-enter-project-prompt', 9, NULL)",
                [],
            )
            .unwrap();
        }
        drop(conn);

        let global = std::sync::Arc::new(MemoryManager::from_connection(
            rusqlite::Connection::open(&db_path).unwrap(),
        ));
        let project = std::sync::Arc::new(tokio::sync::RwLock::new(
            ProjectMemoryManager::from_connection(rusqlite::Connection::open(&db_path).unwrap()),
        ));
        (temp_dir, global, project)
    }

    #[tokio::test]
    async fn project_recall_uses_the_exact_folder_store() {
        let (_temp_dir, global, project) = setup_memory_managers(true, None);
        {
            let project = project.read().await;
            project
                .save_architectural_decision(
                    "/workspace/shared",
                    "workspace-only-marker",
                    "Rust and Tauri",
                    None,
                    Some(9),
                )
                .unwrap();
            project
                .save_architectural_decision(
                    "/other/shared",
                    "other-only-marker",
                    "TypeScript and Next.js",
                    None,
                    Some(9),
                )
                .unwrap();
        }

        let handler = ChatMemoryHandler::with_project_config(
            Some(global.clone()),
            Some(project.clone()),
            MemoryInjectionConfig::default(),
        )
        .unwrap();

        let recalled = handler
            .load_project_memories(Some("/workspace/shared"))
            .await
            .unwrap();
        assert!(recalled
            .system_prompt_enhancement
            .contains("workspace-only-marker"));
        assert!(!recalled
            .system_prompt_enhancement
            .contains("other-only-marker"));
        assert!(!recalled
            .system_prompt_enhancement
            .contains("/workspace/shared"));
        assert!(!recalled.system_prompt_enhancement.contains("/other/shared"));
    }

    #[tokio::test]
    async fn unavailable_project_store_preserves_global_memory_without_name_search() {
        let (_temp_dir, global, project) = setup_memory_managers(false, Some("global-only-marker"));
        let handler = ChatMemoryHandler::with_project_config(
            Some(global),
            Some(project),
            MemoryInjectionConfig::default(),
        )
        .unwrap();

        let recalled = handler
            .load_project_memories(Some("/workspace/global-only-marker"))
            .await
            .unwrap();
        assert!(recalled
            .system_prompt_enhancement
            .contains("global-only-marker"));
        assert!(!recalled
            .system_prompt_enhancement
            .contains("legacy-decision-must-not-enter-project-prompt"));
    }
}
