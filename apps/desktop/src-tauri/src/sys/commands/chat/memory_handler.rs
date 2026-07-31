//! Chat memory integration handler
//!
//! This module handles automatic memory loading and saving in chat interactions.
//! It integrates memories into LLM context and detects/saves architectural decisions.

use crate::core::agi::memory_manager::{MemoryCategory, MemoryManager};
use crate::core::agi::project_memory::ProjectMemoryManager;
use crate::core::llm::memory_integration::{
    MemoryInjectionConfig, MemoryInjectionResult, MemoryInjector,
};
use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

/// Request to load project memories for chat context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadProjectMemoriesRequest {
    pub project_path: Option<String>,
}

/// Response from memory loading
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadProjectMemoriesResponse {
    pub injection_result: MemoryInjectionResult,
    pub system_prompt_enhancement: String,
    pub message: String,
}

/// Request to save a decision to memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveDecisionRequest {
    pub message: String,
    pub auto_detected: bool,
}

/// Response from decision saving
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveDecisionResponse {
    pub memory_id: i64,
    pub topic: String,
    pub importance: i32,
    pub message: String,
}

/// Handler for chat memory operations
pub struct ChatMemoryHandler {
    memory_manager: Option<std::sync::Arc<MemoryManager>>,
    project_memory_manager: Option<std::sync::Arc<tokio::sync::RwLock<ProjectMemoryManager>>>,
    injector: MemoryInjector,
}

impl ChatMemoryHandler {
    /// Create a new chat memory handler
    pub fn new(memory_manager: Option<std::sync::Arc<MemoryManager>>) -> Result<Self> {
        Self::with_config(memory_manager, MemoryInjectionConfig::default())
    }

    /// Create a handler using the process policy selected by Settings.
    pub fn with_config(
        memory_manager: Option<std::sync::Arc<MemoryManager>>,
        config: MemoryInjectionConfig,
    ) -> Result<Self> {
        Self::with_project_config(memory_manager, None, config)
    }

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

    /// Detect and save a decision from chat message
    pub async fn detect_and_save_decision(
        &self,
        message: &str,
        project_path: Option<&str>,
    ) -> Result<Option<SaveDecisionResponse>> {
        let detection = self.injector.detect_decision(message);

        if !detection.is_decision {
            return Ok(None);
        }

        let topic = detection.topic.unwrap_or_else(|| {
            message
                .chars()
                .take(30)
                .collect::<String>()
                .replace(" ", "_")
        });

        // A turn attached to a project writes to that exact folder's dedicated
        // store. Unscoped turns retain the global user-memory behavior.
        let memory_id = match (
            self.project_memory_manager.as_ref(),
            project_path.map(str::trim).filter(|path| !path.is_empty()),
        ) {
            (Some(project_manager), Some(path)) => {
                let project_manager = project_manager.read().await;
                project_manager.save_architectural_decision(
                    path,
                    message,
                    "Auto-detected from a completed chat turn.",
                    Some("accepted"),
                    Some(detection.importance),
                )?
            }
            (None, Some(_)) => {
                return Err(Error::Other(
                    "Project memory manager not initialized for scoped decision".to_string(),
                ));
            }
            (_, None) => {
                let manager = self
                    .memory_manager
                    .as_ref()
                    .ok_or_else(|| Error::Other("Memory manager not initialized".to_string()))?;
                manager.remember(
                    MemoryCategory::Decision,
                    &topic,
                    message,
                    Some(detection.importance),
                    Some("auto-detected from chat"),
                )?
            }
        };

        info!(
            "[ChatMemory] Saved decision '{}' (importance: {}, id: {})",
            topic, detection.importance, memory_id
        );

        Ok(Some(SaveDecisionResponse {
            memory_id,
            topic,
            importance: detection.importance,
            message: format!("Decision saved: {}", message),
        }))
    }

    /// Manually save a decision to memory
    pub fn save_decision(&self, request: SaveDecisionRequest) -> Result<SaveDecisionResponse> {
        let manager = self
            .memory_manager
            .as_ref()
            .ok_or_else(|| Error::Other("Memory manager not initialized".to_string()))?;

        let detection = self.injector.detect_decision(&request.message);

        let topic = detection.topic.unwrap_or_else(|| {
            request
                .message
                .chars()
                .take(30)
                .collect::<String>()
                .replace(" ", "_")
        });

        let memory_id = manager.remember(
            MemoryCategory::Decision,
            &topic,
            &request.message,
            Some(detection.importance),
            Some(if request.auto_detected {
                "auto-detected from chat"
            } else {
                "manually saved from chat"
            }),
        )?;

        info!(
            "[ChatMemory] Saved decision '{}' (importance: {}, auto: {})",
            topic, detection.importance, request.auto_detected
        );

        Ok(SaveDecisionResponse {
            memory_id,
            topic,
            importance: detection.importance,
            message: format!("Decision saved: {}", request.message),
        })
    }

    /// Set memory injection configuration
    pub fn set_injection_config(&mut self, config: MemoryInjectionConfig) {
        self.injector.set_config(config);
        debug!("[ChatMemory] Updated injection configuration");
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

        let global = std::sync::Arc::new(MemoryManager::new(db_path.to_str().unwrap()).unwrap());
        let project = std::sync::Arc::new(tokio::sync::RwLock::new(
            ProjectMemoryManager::new(db_path.to_str().unwrap()).unwrap(),
        ));
        (temp_dir, global, project)
    }

    #[test]
    fn test_chat_memory_handler_creation() {
        let handler = ChatMemoryHandler::new(None).unwrap();
        assert!(handler.memory_manager.is_none());
        assert!(handler.project_memory_manager.is_none());
    }

    #[test]
    fn test_decision_detection_in_handler() {
        let handler = ChatMemoryHandler::new(None).unwrap();
        let detection = handler.injector.detect_decision("We decided to use Rust");
        assert!(detection.is_decision);
    }

    #[tokio::test]
    async fn project_recall_and_capture_use_the_exact_folder_store() {
        let (_temp_dir, global, project) = setup_memory_managers(true, None);
        {
            let project = project.read().await;
            project
                .save_project_context(
                    "/workspace/shared",
                    vec!["Rust".to_string()],
                    Some("Rust"),
                    Some("workspace-only-marker"),
                    vec!["Tauri".to_string()],
                    Some(9),
                )
                .unwrap();
            project
                .save_project_context(
                    "/other/shared",
                    vec!["TypeScript".to_string()],
                    Some("TypeScript"),
                    Some("other-only-marker"),
                    vec!["Next.js".to_string()],
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

        handler
            .detect_and_save_decision(
                "We decided to keep exact project memory isolation.",
                Some("/workspace/shared"),
            )
            .await
            .unwrap();

        let project = project.read().await;
        let workspace_memories = project.get_project_memories("/workspace/shared").unwrap();
        let other_memories = project.get_project_memories("/other/shared").unwrap();
        assert_eq!(workspace_memories.len(), 2);
        assert_eq!(other_memories.len(), 1);
        assert!(workspace_memories
            .iter()
            .any(|memory| memory.content.contains("exact project memory isolation")));
        assert!(global.get_important_memories(1).unwrap().is_empty());
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

    #[tokio::test]
    async fn scoped_capture_without_project_store_fails_closed() {
        let (_temp_dir, global, _project) = setup_memory_managers(false, None);
        let handler =
            ChatMemoryHandler::with_config(Some(global.clone()), MemoryInjectionConfig::default())
                .unwrap();

        let error = handler
            .detect_and_save_decision(
                "We decided this must remain inside the selected repository.",
                Some("/workspace/scoped"),
            )
            .await
            .unwrap_err();

        assert!(error.to_string().contains("Project memory manager"));
        assert!(global.get_important_memories(1).unwrap().is_empty());
    }
}
