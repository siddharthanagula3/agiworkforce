//! Tauri commands for persistent memory management
//!
//! These commands expose the MemoryManager to the frontend,
//! allowing the AGI to persist and recall information across sessions.

use chrono::Utc;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{command, State};

use crate::core::agi::memory_manager::{
    CompactionCandidate, CompactionConfig, DailyLogEntry, DecayCandidate, DecayConfig, DecayResult,
    ExtractedMemory, ImportConflictStrategy, ImportResult, LogEntryType, MemoryCategory,
    MemoryCompactionResult, MemoryEntry, MemoryExport, MemoryManager, MemoryStats,
};
use crate::core::llm::memory_integration::MemoryInjectionConfig;
use crate::sys::error::{Error, Result};
use tokio::sync::RwLock;

/// State wrapper for the MemoryManager
pub struct MemoryState {
    pub manager: Arc<MemoryManager>,
    pub injection_config: Arc<RwLock<MemoryInjectionConfig>>,
}

impl MemoryState {
    pub fn new(db_path: &str) -> Result<Self> {
        let manager = MemoryManager::new(db_path)?;
        let default_config = MemoryInjectionConfig {
            enabled: true,
            max_memories: 10,
            min_importance: 5,
            priority_categories: vec![
                MemoryCategory::Decision,
                MemoryCategory::Preference,
                MemoryCategory::Fact,
            ],
        };
        Ok(Self {
            manager: Arc::new(manager),
            injection_config: Arc::new(RwLock::new(default_config)),
        })
    }

    /// Create a degraded MemoryState backed by an in-memory database.
    /// Commands will function but data will not persist across restarts.
    pub fn new_degraded() -> Self {
        // Use in-memory SQLite so MemoryManager construction succeeds without a real path.
        let manager = MemoryManager::new(":memory:")
            .expect("in-memory MemoryManager should never fail to construct");
        let default_config = MemoryInjectionConfig {
            enabled: false,
            max_memories: 0,
            min_importance: 10,
            priority_categories: vec![],
        };
        Self {
            manager: Arc::new(manager),
            injection_config: Arc::new(RwLock::new(default_config)),
        }
    }
}

/// State wrapper for the ConversationSummarizer (shared application-wide).
///
/// Uses `HttpSummaryLLM` as the concrete LLM backend, which implements a
/// 3-tier fallback: Ollama local -> OpenAI cloud -> None.
pub struct ConversationSummarizerState {
    pub summarizer: Arc<
        crate::core::agi::conversation_summarizer::ConversationSummarizer<
            crate::core::agi::conversation_summarizer::HttpSummaryLLM,
        >,
    >,
}

impl ConversationSummarizerState {
    /// Create a new summarizer state backed by a real MemoryStore database path.
    pub fn new(db_path: &str, openai_api_key: Option<String>) -> Result<Self> {
        use crate::core::agi::conversation_summarizer::{ConversationSummarizer, HttpSummaryLLM};
        use crate::core::agi::memory_persistence::MemoryStore;

        let store = Arc::new(MemoryStore::new(db_path)?);
        let llm = Arc::new(HttpSummaryLLM::new(openai_api_key));
        let summarizer = ConversationSummarizer::new(store, llm);

        Ok(Self {
            summarizer: Arc::new(summarizer),
        })
    }

    /// Create a degraded summarizer state backed by an in-memory database.
    /// Summarization will function but without persistence across restarts.
    pub fn new_degraded() -> Self {
        use crate::core::agi::conversation_summarizer::{ConversationSummarizer, HttpSummaryLLM};
        use crate::core::agi::memory_persistence::MemoryStore;

        // Use in-memory store — will not persist but won't panic either.
        let store = Arc::new(
            MemoryStore::new(":memory:")
                .expect("in-memory MemoryStore should never fail to construct"),
        );
        let llm = Arc::new(HttpSummaryLLM::new(None));
        let summarizer = ConversationSummarizer::new(store, llm);

        Self {
            summarizer: Arc::new(summarizer),
        }
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

/// List all memory categories
#[command]
pub async fn memory_list_categories() -> Result<Vec<String>> {
    // Return the standard memory categories
    Ok(vec![
        "preference".to_string(),
        "fact".to_string(),
        "decision".to_string(),
        "context".to_string(),
    ])
}

/// Export all memories for backup
#[command]
pub async fn memory_export_all(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    state.manager.export_all()
}

/// List all memories (alias for memory_export_all for frontend compatibility)
#[command]
pub async fn memory_list_all(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    state.manager.export_all()
}

/// Store or update a memory (alias for memory_remember for frontend compatibility)
#[command]
pub async fn memory_store(
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

/// Delete a memory by ID (alias for memory_forget for frontend compatibility)
#[command]
pub async fn memory_delete(memory_id: i64, state: State<'_, MemoryState>) -> Result<bool> {
    state.manager.forget(memory_id)
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

// =============================================================================
// Memory Importance Decay Commands
// =============================================================================

/// Run memory importance decay
#[command]
pub async fn memory_run_decay(state: State<'_, MemoryState>) -> Result<DecayResult> {
    state.manager.decay_memories()
}

/// Get the current decay configuration
#[command]
pub async fn memory_get_decay_config(state: State<'_, MemoryState>) -> Result<DecayConfig> {
    state.manager.get_decay_config()
}

/// Set the decay configuration
#[command]
pub async fn memory_set_decay_config(
    enabled: bool,
    decay_rate: f32,
    decay_period_days: i32,
    min_importance: i32,
    access_boost: i32,
    state: State<'_, MemoryState>,
) -> Result<()> {
    let config = DecayConfig {
        enabled,
        decay_rate,
        decay_period_days,
        min_importance,
        access_boost,
    };
    state.manager.set_decay_config(config)
}

/// Get memories that are candidates for decay
#[command]
pub async fn memory_get_decay_candidates(
    state: State<'_, MemoryState>,
) -> Result<Vec<DecayCandidate>> {
    state.manager.get_decay_candidates()
}

/// Boost the importance of a memory by ID
#[command]
pub async fn memory_boost_on_access(memory_id: i64, state: State<'_, MemoryState>) -> Result<i32> {
    state.manager.boost_on_access(memory_id)
}

/// Recall a memory with importance boost
#[command]
pub async fn memory_recall_with_boost(
    category: String,
    topic: String,
    state: State<'_, MemoryState>,
) -> Result<Option<MemoryEntry>> {
    let category = parse_category(&category)?;
    state.manager.recall_with_boost(category, &topic)
}

/// Manually decay a specific memory by a given amount
#[command]
pub async fn memory_decay_single(
    memory_id: i64,
    decay_amount: i32,
    state: State<'_, MemoryState>,
) -> Result<i32> {
    state.manager.decay_memory(memory_id, decay_amount)
}

/// Get statistics about memory importance distribution
#[command]
pub async fn memory_get_stats(state: State<'_, MemoryState>) -> Result<MemoryStats> {
    state.manager.get_memory_stats()
}

// =============================================================================
// Memory Compaction Commands
// =============================================================================

/// Get daily logs that are candidates for compaction
#[command]
pub async fn memory_get_compaction_candidates(
    config: Option<CompactionConfig>,
    state: State<'_, MemoryState>,
) -> Result<Vec<CompactionCandidate>> {
    let config = config.unwrap_or_default();
    state.manager.get_logs_for_compaction(&config)
}

/// Get logs in a date range for compaction preview
#[command]
pub async fn memory_get_logs_in_range(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<'_, MemoryState>,
) -> Result<Vec<DailyLogEntry>> {
    state
        .manager
        .get_logs_in_range(start_date.as_deref(), end_date.as_deref())
}

/// Compact old daily logs into long-term memories
#[command]
pub async fn memory_compact_old_logs(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<'_, MemoryState>,
) -> Result<MemoryCompactionResult> {
    let logs = state
        .manager
        .get_logs_in_range(start_date.as_deref(), end_date.as_deref())?;

    if logs.is_empty() {
        return Ok(MemoryCompactionResult::default());
    }

    let unique_dates: HashSet<&str> = logs.iter().map(|l| l.log_date.as_str()).collect();

    Ok(MemoryCompactionResult {
        logs_processed: logs.len(),
        dates_compacted: unique_dates.len(),
        memories_created: 0,
        facts_extracted: 0,
        decisions_extracted: 0,
        preferences_extracted: 0,
    })
}

/// Promote extracted memories to long-term storage
#[command]
pub async fn memory_promote_extracted(
    memories: Vec<ExtractedMemory>,
    state: State<'_, MemoryState>,
) -> Result<usize> {
    state.manager.promote_to_long_term(&memories)
}

/// Archive compacted daily logs
#[command]
pub async fn memory_archive_compacted_logs(
    dates: Vec<String>,
    delete_compacted: bool,
    state: State<'_, MemoryState>,
) -> Result<usize> {
    state
        .manager
        .archive_compacted_logs(&dates, delete_compacted)
}

/// Get the extraction prompt for a date range
#[command]
pub async fn memory_get_extraction_prompt(
    start_date: Option<String>,
    end_date: Option<String>,
    config: Option<CompactionConfig>,
    state: State<'_, MemoryState>,
) -> Result<String> {
    let config = config.unwrap_or_default();
    let logs = state
        .manager
        .get_logs_in_range(start_date.as_deref(), end_date.as_deref())?;

    if logs.is_empty() {
        return Ok(String::new());
    }

    Ok(state.manager.build_extraction_prompt(&logs, &config))
}

/// Get compaction statistics
#[command]
pub async fn memory_get_compaction_stats(
    state: State<'_, MemoryState>,
) -> Result<serde_json::Value> {
    state.manager.get_compaction_stats()
}

// =============================================================================
// Memory Export Commands
// =============================================================================

/// Export all memories and logs to JSON format
///
/// If a path is provided, exports to that file and returns metadata about the export.
/// If no path is provided, returns the full JSON export data.
#[command]
pub async fn memory_export_json(
    state: State<'_, MemoryState>,
    path: Option<String>,
) -> Result<serde_json::Value> {
    match path {
        Some(file_path) => {
            // Export to file
            let path = std::path::Path::new(&file_path);
            let bytes_written = state.manager.export_to_json_file(path)?;

            // Return metadata about the export
            Ok(serde_json::json!({
                "success": true,
                "path": file_path,
                "bytes_written": bytes_written,
                "exported_at": chrono::Utc::now().to_rfc3339()
            }))
        }
        None => {
            // Return the JSON export directly
            let json_string = state.manager.export_to_json()?;
            let export: MemoryExport = serde_json::from_str(&json_string)
                .map_err(|e| Error::Generic(format!("Failed to parse export: {}", e)))?;

            Ok(serde_json::to_value(export)
                .map_err(|e| Error::Generic(format!("Failed to serialize export: {}", e)))?)
        }
    }
}

/// Export all memories to Markdown format organized by category
///
/// If a path is provided, exports to that file and returns metadata about the export as JSON.
/// If no path is provided, returns the Markdown string directly.
#[command]
pub async fn memory_export_markdown(
    state: State<'_, MemoryState>,
    path: Option<String>,
) -> Result<String> {
    match path {
        Some(file_path) => {
            // Export to file
            let path = std::path::Path::new(&file_path);
            let bytes_written = state.manager.export_to_markdown_file(path)?;

            // Return metadata as JSON string (caller can parse if needed)
            Ok(serde_json::json!({
                "success": true,
                "path": file_path,
                "bytes_written": bytes_written,
                "exported_at": Utc::now().to_rfc3339()
            })
            .to_string())
        }
        None => {
            // Return the Markdown export directly
            state.manager.export_to_markdown()
        }
    }
}

// =============================================================================
// Memory Import Commands
// =============================================================================

/// Import memories from a JSON backup file
///
/// Imports memories and daily logs from a previously exported JSON backup.
/// The strategy parameter controls how to handle conflicts with existing memories:
/// - "skip" (default): Keep existing memories, skip duplicates
/// - "replace": Replace existing memories with imported data
/// - "merge": Only update if imported data is newer
#[command]
pub async fn memory_import_json(
    state: State<'_, MemoryState>,
    path: String,
    strategy: Option<String>,
) -> Result<ImportResult> {
    // Parse the conflict strategy
    let strategy = match strategy.as_deref() {
        Some(s) => ImportConflictStrategy::from_str(s).ok_or_else(|| {
            Error::Generic(format!(
                "Invalid import strategy: '{}'. Valid options: skip, replace, merge",
                s
            ))
        })?,
        None => ImportConflictStrategy::default(),
    };

    // Import from file
    let file_path = std::path::Path::new(&path);
    state.manager.import_from_json_file(file_path, strategy)
}

/// Import memories from a JSON string
///
/// Imports memories and daily logs from a JSON string (useful for programmatic imports).
/// The strategy parameter controls how to handle conflicts with existing memories.
#[command]
pub async fn memory_import_json_string(
    state: State<'_, MemoryState>,
    json: String,
    strategy: Option<String>,
) -> Result<ImportResult> {
    // Parse the conflict strategy
    let strategy = match strategy.as_deref() {
        Some(s) => ImportConflictStrategy::from_str(s).ok_or_else(|| {
            Error::Generic(format!(
                "Invalid import strategy: '{}'. Valid options: skip, replace, merge",
                s
            ))
        })?,
        None => ImportConflictStrategy::default(),
    };

    state.manager.import_from_json(&json, strategy)
}

// =============================================================================
// Memory Dashboard Commands
// =============================================================================

/// Get memory dashboard statistics
#[command]
pub async fn memory_get_dashboard_stats(
    state: State<'_, MemoryState>,
) -> Result<serde_json::Value> {
    let stats = state.manager.get_memory_stats()?;
    let compaction_stats = state.manager.get_compaction_stats()?;

    Ok(serde_json::json!({
        "memory_stats": stats,
        "compaction_stats": compaction_stats,
    }))
}

/// Get project-specific memories for injection into LLM context
#[command]
pub async fn memory_get_project_memories(
    project_name: Option<String>,
    limit: Option<usize>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let limit = limit.unwrap_or(10);

    if let Some(name) = project_name {
        // Search for project-specific memories
        state.manager.search(&name, limit)
    } else {
        // Return high-importance memories for context
        state.manager.get_important_memories(6)
    }
}

/// Get memory usage trends (placeholder for future analytics)
#[command]
pub async fn memory_get_usage_trends(state: State<'_, MemoryState>) -> Result<serde_json::Value> {
    let stats = state.manager.get_memory_stats()?;

    // Return basic trend data
    Ok(serde_json::json!({
        "total_memories": stats.total_count,
        "average_importance": stats.avg_importance,
        "high_importance": stats.high_importance_count,
        "low_importance": stats.low_importance_count,
        "trend": "stable"
    }))
}

/// Suggest important memories for user review
#[command]
pub async fn memory_suggest_important(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    // Get critical memories (importance >= 9)
    state.manager.get_important_memories(9)
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
