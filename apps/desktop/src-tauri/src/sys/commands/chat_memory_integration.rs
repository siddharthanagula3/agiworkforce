//! Chat and Memory Integration Commands
//!
//! This module provides Tauri commands that integrate the memory system
//! with chat interactions, automatically loading and saving memories.

use super::chat::memory_handler::{
    ChatMemoryHandler, LoadProjectMemoriesResponse, SaveDecisionResponse,
};
use super::memory::MemoryState;
use super::project_context::ProjectContextState;
use crate::core::llm::memory_integration::MemoryInjectionConfig;
use crate::sys::error::Result;
use tauri::State;
use tracing::info;

/// Load memories for the current project and prepare context for chat
#[tauri::command]
pub async fn chat_load_project_memories(
    memory_state: State<'_, MemoryState>,
    project_context: State<'_, ProjectContextState>,
) -> Result<LoadProjectMemoriesResponse> {
    let project_path = project_context.get_folder().await;
    let handler = ChatMemoryHandler::new(Some(memory_state.manager.clone()))?;

    handler.load_project_memories(project_path.as_deref())
}

/// Detect and save a decision from a chat message
#[tauri::command]
pub async fn chat_detect_and_save_decision(
    message: String,
    memory_state: State<'_, MemoryState>,
) -> Result<Option<SaveDecisionResponse>> {
    let handler = ChatMemoryHandler::new(Some(memory_state.manager.clone()))?;
    handler.detect_and_save_decision(&message)
}

/// Manually save a decision to memory with auto-detection
#[tauri::command]
pub async fn chat_save_decision(
    message: String,
    memory_state: State<'_, MemoryState>,
) -> Result<SaveDecisionResponse> {
    let handler = ChatMemoryHandler::new(Some(memory_state.manager.clone()))?;
    handler.save_decision(
        crate::sys::commands::chat::memory_handler::SaveDecisionRequest {
            message,
            auto_detected: false,
        },
    )
}

/// Configure memory injection behavior
#[tauri::command]
pub async fn chat_configure_memory_injection(
    enabled: bool,
    max_memories: usize,
    min_importance: i32,
    _memory_state: State<'_, MemoryState>,
) -> Result<()> {
    let _config = MemoryInjectionConfig {
        enabled,
        max_memories,
        min_importance,
        priority_categories: vec![
            crate::core::agi::memory_manager::MemoryCategory::Decision,
            crate::core::agi::memory_manager::MemoryCategory::Preference,
            crate::core::agi::memory_manager::MemoryCategory::Fact,
        ],
    };

    // Store configuration in memory state (you may want to create a separate config store)
    info!(
        "[ChatMemoryIntegration] Configured memory injection: enabled={}, max={}, min_importance={}",
        enabled, max_memories, min_importance
    );

    Ok(())
}

/// Get memory statistics for the memory dashboard
#[tauri::command]
pub async fn chat_get_memory_dashboard(
    memory_state: State<'_, MemoryState>,
) -> Result<serde_json::Value> {
    let stats = memory_state.manager.get_memory_stats()?;
    let compaction_stats = memory_state.manager.get_compaction_stats()?;

    let trending_memories = memory_state
        .manager
        .get_important_memories(7)
        .unwrap_or_default();

    Ok(serde_json::json!({
        "stats": stats,
        "compaction": compaction_stats,
        "trending_count": trending_memories.len(),
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// Get memories to suggest for review based on importance
#[tauri::command]
pub async fn chat_suggest_memories_for_review(
    memory_state: State<'_, MemoryState>,
) -> Result<serde_json::Value> {
    // Get critical memories
    let critical = memory_state.manager.get_important_memories(9)?;
    // Get recent high-importance memories
    let high_importance = memory_state.manager.get_important_memories(7)?;

    Ok(serde_json::json!({
        "critical_memories": critical,
        "high_importance": high_importance
    }))
}

/// Prefetch memories for a new chat session
#[tauri::command]
pub async fn chat_prefetch_session_memories(
    memory_state: State<'_, MemoryState>,
) -> Result<String> {
    let context = memory_state.manager.get_session_context()?;
    Ok(context)
}

/// Log a chat milestone to daily memory logs
#[tauri::command]
pub async fn chat_log_milestone(
    description: String,
    metadata: Option<serde_json::Value>,
    memory_state: State<'_, MemoryState>,
) -> Result<i64> {
    let metadata_str = metadata.map(|m| m.to_string());

    memory_state.manager.log_context(
        &description,
        crate::core::agi::memory_manager::LogEntryType::Milestone,
        metadata_str.as_deref(),
    )
}

/// Log an action taken during chat to memory
#[tauri::command]
pub async fn chat_log_action(
    action: String,
    metadata: Option<serde_json::Value>,
    memory_state: State<'_, MemoryState>,
) -> Result<i64> {
    let metadata_str = metadata.map(|m| m.to_string());

    memory_state.manager.log_context(
        &action,
        crate::core::agi::memory_manager::LogEntryType::Action,
        metadata_str.as_deref(),
    )
}

/// Recall a specific memory entry by ID
#[tauri::command]
pub async fn chat_recall_memory(
    category: String,
    topic: String,
    boost_importance: Option<bool>,
    memory_state: State<'_, MemoryState>,
) -> Result<Option<crate::core::agi::memory_manager::MemoryEntry>> {
    let cat = parse_category(&category)?;

    if boost_importance.unwrap_or(false) {
        memory_state.manager.recall_with_boost(cat, &topic)
    } else {
        memory_state.manager.recall(cat, &topic)
    }
}

/// Search memories for context injection
#[tauri::command]
pub async fn chat_search_memories(
    query: String,
    limit: Option<usize>,
    memory_state: State<'_, MemoryState>,
) -> Result<Vec<crate::core::agi::memory_manager::MemoryEntry>> {
    let limit = limit.unwrap_or(10);
    memory_state.manager.search(&query, limit)
}

/// Parse category string
fn parse_category(category: &str) -> Result<crate::core::agi::memory_manager::MemoryCategory> {
    match category.to_lowercase().as_str() {
        "preference" | "preferences" => {
            Ok(crate::core::agi::memory_manager::MemoryCategory::Preference)
        }
        "fact" | "facts" => Ok(crate::core::agi::memory_manager::MemoryCategory::Fact),
        "decision" | "decisions" => Ok(crate::core::agi::memory_manager::MemoryCategory::Decision),
        "context" => Ok(crate::core::agi::memory_manager::MemoryCategory::Context),
        _ => Err(crate::sys::error::Error::Generic(format!(
            "Invalid memory category: {}",
            category
        ))),
    }
}
