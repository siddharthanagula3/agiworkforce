//! Tauri commands for persistent memory management
//!
//! These commands expose the MemoryManager to the frontend,
//! allowing the AGI to persist and recall information across sessions.

use std::sync::Arc;
use tauri::{command, State};

use crate::core::agi::memory_manager::{
    DailyLogEntry, LogEntryType, MemoryCategory, MemoryEntry, MemoryManager,
};
use crate::sys::error::{Error, Result};

/// State wrapper for the MemoryManager
pub struct MemoryState {
    pub manager: Arc<MemoryManager>,
}

impl MemoryState {
    pub fn new(db_path: &str) -> Result<Self> {
        let manager = MemoryManager::new(db_path)?;
        Ok(Self {
            manager: Arc::new(manager),
        })
    }
}

/// Store or update a memory
///
/// If a memory with the same category+topic already exists, it will be updated.
#[command]
pub async fn memory_remember(
    category: String,
    topic: String,
    content: String,
    importance: Option<i32>,
    source: Option<String>,
    state: State<'_, MemoryState>,
) -> Result<i64> {
    let category = parse_category(&category)?;
    state
        .manager
        .remember(category, &topic, &content, importance, source.as_deref())
}

/// Recall a specific memory by category and topic
#[command]
pub async fn memory_recall(
    category: String,
    topic: String,
    state: State<'_, MemoryState>,
) -> Result<Option<MemoryEntry>> {
    let category = parse_category(&category)?;
    state.manager.recall(category, &topic)
}

/// Search memories by query text
#[command]
pub async fn memory_search(
    query: String,
    limit: Option<usize>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let limit = limit.unwrap_or(20);
    state.manager.search(&query, limit)
}

/// Get all memories in a category
#[command]
pub async fn memory_get_by_category(
    category: String,
    limit: Option<usize>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let category = parse_category(&category)?;
    state.manager.get_by_category(category, limit)
}

/// Get high-importance memories (for session initialization)
#[command]
pub async fn memory_get_important(
    min_importance: Option<i32>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let min_importance = min_importance.unwrap_or(7);
    state.manager.get_important_memories(min_importance)
}

/// Delete a memory by ID
#[command]
pub async fn memory_forget(memory_id: i64, state: State<'_, MemoryState>) -> Result<bool> {
    state.manager.forget(memory_id)
}

/// Delete a memory by category and topic
#[command]
pub async fn memory_forget_topic(
    category: String,
    topic: String,
    state: State<'_, MemoryState>,
) -> Result<bool> {
    let category = parse_category(&category)?;
    state.manager.forget_topic(category, &topic)
}

/// Log an entry to today's daily log
#[command]
pub async fn memory_log_context(
    content: String,
    entry_type: Option<String>,
    metadata: Option<String>,
    state: State<'_, MemoryState>,
) -> Result<i64> {
    let entry_type = match entry_type.as_deref() {
        Some("action") => LogEntryType::Action,
        Some("note") => LogEntryType::Note,
        Some("milestone") => LogEntryType::Milestone,
        _ => LogEntryType::Context,
    };
    state
        .manager
        .log_context(&content, entry_type, metadata.as_deref())
}

/// Get daily logs for a specific date (YYYY-MM-DD format)
#[command]
pub async fn memory_get_daily_logs(
    date: String,
    state: State<'_, MemoryState>,
) -> Result<Vec<DailyLogEntry>> {
    state.manager.get_daily_logs(&date)
}

/// Get session context (recent logs + important memories) for AGI initialization
#[command]
pub async fn memory_get_session_context(state: State<'_, MemoryState>) -> Result<String> {
    state.manager.get_session_context()
}

/// Export all memories for backup
#[command]
pub async fn memory_export_all(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    state.manager.export_all()
}

/// Cleanup old daily logs (keep last N days)
#[command]
pub async fn memory_cleanup_logs(
    keep_days: Option<i32>,
    state: State<'_, MemoryState>,
) -> Result<usize> {
    let keep_days = keep_days.unwrap_or(30);
    state.manager.cleanup_old_logs(keep_days)
}

/// Parse a category string to MemoryCategory enum
fn parse_category(category: &str) -> Result<MemoryCategory> {
    match category.to_lowercase().as_str() {
        "preference" | "preferences" => Ok(MemoryCategory::Preference),
        "fact" | "facts" => Ok(MemoryCategory::Fact),
        "decision" | "decisions" => Ok(MemoryCategory::Decision),
        "context" => Ok(MemoryCategory::Context),
        _ => Err(Error::Generic(format!(
            "Invalid memory category: {}. Valid options: preference, fact, decision, context",
            category
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_category() {
        assert!(matches!(
            parse_category("preference"),
            Ok(MemoryCategory::Preference)
        ));
        assert!(matches!(parse_category("FACT"), Ok(MemoryCategory::Fact)));
        assert!(matches!(
            parse_category("Decision"),
            Ok(MemoryCategory::Decision)
        ));
        assert!(parse_category("invalid").is_err());
    }
}
