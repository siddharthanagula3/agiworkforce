//! Chat memory integration handler
//!
//! This module handles automatic memory loading and saving in chat interactions.
//! It integrates memories into LLM context and detects/saves architectural decisions.

use crate::core::agi::memory_manager::{MemoryCategory, MemoryManager};
use crate::core::llm::memory_integration::{
    MemoryInjectionConfig, MemoryInjectionResult, MemoryInjector,
};
use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

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
    injector: MemoryInjector,
}

impl ChatMemoryHandler {
    /// Create a new chat memory handler
    pub fn new(memory_manager: Option<std::sync::Arc<MemoryManager>>) -> Result<Self> {
        let config = MemoryInjectionConfig::default();
        let injector = MemoryInjector::new(config)?;

        Ok(Self {
            memory_manager,
            injector,
        })
    }

    /// Load project memories and prepare context
    pub fn load_project_memories(
        &self,
        project_path: Option<&str>,
    ) -> Result<LoadProjectMemoriesResponse> {
        let manager = self
            .memory_manager
            .as_ref()
            .ok_or_else(|| Error::Other("Memory manager not initialized".to_string()))?;

        let injection = self.injector.load_project_memories(manager, project_path)?;

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
    pub fn detect_and_save_decision(&self, message: &str) -> Result<Option<SaveDecisionResponse>> {
        let detection = self.injector.detect_decision(message);

        if !detection.is_decision {
            return Ok(None);
        }

        let manager = self
            .memory_manager
            .as_ref()
            .ok_or_else(|| Error::Other("Memory manager not initialized".to_string()))?;

        let topic = detection.topic.unwrap_or_else(|| {
            message
                .chars()
                .take(30)
                .collect::<String>()
                .replace(" ", "_")
        });

        // Save as a high-importance decision memory
        let memory_id = manager.remember(
            MemoryCategory::Decision,
            &topic,
            message,
            Some(detection.importance),
            Some("auto-detected from chat"),
        )?;

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

    #[test]
    fn test_chat_memory_handler_creation() {
        let handler = ChatMemoryHandler::new(None).unwrap();
        assert!(handler.memory_manager.is_none());
    }

    #[test]
    fn test_decision_detection_in_handler() {
        let handler = ChatMemoryHandler::new(None).unwrap();
        let detection = handler.injector.detect_decision("We decided to use Rust");
        assert!(detection.is_decision);
    }
}
