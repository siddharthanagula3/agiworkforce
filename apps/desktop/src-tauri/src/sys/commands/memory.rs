//! Tauri commands for persistent memory management
//!
//! These commands expose the MemoryManager to the frontend,
//! allowing the AGI to persist and recall information across sessions.
//!
//! CLOUD SYNC HOOK (Requirement 4):
//! Write commands (remember/store/forget/delete/forget_topic) accept an optional
//! `active_mode` param. When the active mode is managed-cloud, they call
//! `mark_memory_for_push` on the AppDatabase so the next memory sync cycle will
//! push the change. The gate uses the same `derive_cloud_sync_enabled` function
//! that chat sync uses, the identical trust-boundary function, not a reimplementation.
//! `user_memory.app_mode = 'cloud'` is set on rows created in cloud mode; the WHERE
//! guard in `mark_memory_for_push` makes it impossible to mark a local row.

use chrono::Utc;
use std::sync::Arc;
use tauri::State;

use crate::core::agi::memory_manager::{
    DailyLogEntry, DecayCandidate, DecayConfig, DecayResult, ImportConflictStrategy, ImportResult,
    LogEntryType, MemoryCategory, MemoryEntry, MemoryExport, MemoryManager, MemoryStats,
};
use crate::core::llm::memory_integration::MemoryInjectionConfig;
use crate::data::memory_sync;
use crate::sys::commands::chat::send_message_setup::derive_cloud_sync_enabled;
use crate::sys::commands::chat::state::AppDatabase;
use crate::sys::commands::settings::SettingsState;
use crate::sys::error::{Error, Result};
use tokio::sync::RwLock;

// ---------------------------------------------------------------------------
// Internal helper: derive whether we're in managed-cloud mode for memory writes.
// Reuses the EXACT same function as send_message.rs (not a reimplementation).
// ---------------------------------------------------------------------------

/// Set `app_mode='cloud'` on a user_memory row. Called for rows created while
/// cloud sync is enabled so they are marked correctly for push.
fn set_memory_cloud_mode(db: &AppDatabase, memory_id: i64) {
    if let Ok(conn) = db.connection() {
        let _ = conn.execute(
            "UPDATE user_memory SET app_mode = 'cloud' WHERE id = ?1 AND app_mode = 'local'",
            rusqlite::params![memory_id],
        );
    }
}

/// Mark an existing cloud memory for push. Non-fatal, a failed mark is logged
/// but must never cause the write command to fail.
fn try_mark_memory_for_push(db: &AppDatabase, memory_id: i64) {
    if let Ok(conn) = db.connection() {
        if let Err(e) = memory_sync::mark_memory_for_push(&conn, memory_id) {
            tracing::warn!(error = %e, memory_id, "memory: failed to mark memory for cloud push");
        }
    }
}

/// State wrapper for the MemoryManager
pub struct MemoryState {
    pub manager: Arc<MemoryManager>,
    pub injection_config: Arc<RwLock<MemoryInjectionConfig>>,
}

impl MemoryState {
    pub fn new(db_path: &str) -> Result<Self> {
        let manager = MemoryManager::new(db_path)?;
        let default_config = MemoryInjectionConfig {
            // Privacy-critical policy is restored explicitly from persisted
            // settings by the frontend and checked again per chat turn.
            enabled: false,
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

    /// Create a MemoryState over an already-keyed main-database connection
    /// (see `MemoryManager::from_connection` for why the encrypted main DB
    /// cannot be reopened with a plain `Connection::open`).
    pub fn from_connection(conn: rusqlite::Connection) -> Self {
        let default_config = MemoryInjectionConfig {
            enabled: false,
            max_memories: 10,
            min_importance: 5,
            priority_categories: vec![
                MemoryCategory::Decision,
                MemoryCategory::Preference,
                MemoryCategory::Fact,
            ],
        };
        Self {
            manager: Arc::new(MemoryManager::from_connection(conn)),
            injection_config: Arc::new(RwLock::new(default_config)),
        }
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

    /// Create a summarizer state over an already-keyed main-database
    /// connection. `MemoryStore` lives in the encrypted main database, so a
    /// plain `Connection::open(db_path)` (what `MemoryStore::new` used) opened
    /// it without the SQLCipher key and every summarization run failed with
    /// "file is not a database". Callers targeting the main database must hand
    /// in a `MainDatabaseAccess` connection.
    pub fn from_connection(conn: rusqlite::Connection, openai_api_key: Option<String>) -> Self {
        use crate::core::agi::conversation_summarizer::{ConversationSummarizer, HttpSummaryLLM};
        use crate::core::agi::memory_persistence::MemoryStore;

        let store = Arc::new(MemoryStore::from_connection(conn));
        let llm = Arc::new(HttpSummaryLLM::new(openai_api_key));
        Self {
            summarizer: Arc::new(ConversationSummarizer::new(store, llm)),
        }
    }

    /// Create a degraded summarizer state backed by an in-memory database.
    /// Summarization will function but without persistence across restarts.
    pub fn new_degraded() -> Self {
        use crate::core::agi::conversation_summarizer::{ConversationSummarizer, HttpSummaryLLM};
        use crate::core::agi::memory_persistence::MemoryStore;

        // Use in-memory store, will not persist but won't panic either.
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
///
/// `active_mode`: optional frontend mode string (`"local"` | `"cloud"`).
/// When in cloud mode, marks the memory for push to the managed cloud.
#[tauri::command]
pub async fn memory_remember(
    category: String,
    topic: String,
    content: String,
    importance: Option<i32>,
    source: Option<String>,
    active_mode: Option<String>,
    state: State<'_, MemoryState>,
    db: State<'_, AppDatabase>,
    settings_state: State<'_, SettingsState>,
) -> Result<i64> {
    let category = parse_category(&category)?;
    let memory_id =
        state
            .manager
            .remember(category, &topic, &content, importance, source.as_deref())?;

    // CLOUD SYNC HOOK: derive_cloud_sync_enabled is the single source of truth
    // for the managed-cloud trust boundary (send_message_setup.rs:64).
    let storage_mode_is_cloud = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
    };
    if derive_cloud_sync_enabled(active_mode.as_deref(), storage_mode_is_cloud) {
        set_memory_cloud_mode(&db, memory_id);
        try_mark_memory_for_push(&db, memory_id);
    }

    Ok(memory_id)
}

/// Recall a specific memory by category and topic
#[tauri::command]
pub async fn memory_recall(
    category: String,
    topic: String,
    state: State<'_, MemoryState>,
) -> Result<Option<MemoryEntry>> {
    let category = parse_category(&category)?;
    state.manager.recall(category, &topic)
}

/// Search memories by query text
#[tauri::command]
pub async fn memory_search(
    query: String,
    limit: Option<usize>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let limit = limit.unwrap_or(20);
    state.manager.search(&query, limit)
}

/// Get all memories in a category
#[tauri::command]
pub async fn memory_get_by_category(
    category: String,
    limit: Option<usize>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let category = parse_category(&category)?;
    state.manager.get_by_category(category, limit)
}

/// Get high-importance memories (for session initialization)
#[tauri::command]
pub async fn memory_get_important(
    min_importance: Option<i32>,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryEntry>> {
    let min_importance = min_importance.unwrap_or(7);
    state.manager.get_important_memories(min_importance)
}

/// Delete a memory by ID
///
/// In cloud mode: soft-deletes the row (sets deleted_at_utc + needs_push=1)
/// so the tombstone propagates to other devices. Falls through to hard-delete
/// for local rows.
#[tauri::command]
pub async fn memory_forget(
    memory_id: i64,
    active_mode: Option<String>,
    state: State<'_, MemoryState>,
    db: State<'_, AppDatabase>,
    settings_state: State<'_, SettingsState>,
) -> Result<bool> {
    let storage_mode_is_cloud = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
    };

    if derive_cloud_sync_enabled(active_mode.as_deref(), storage_mode_is_cloud) {
        // Attempt soft-delete for cloud rows. If the row is a cloud row, return true
        // (soft-deleted, tombstone will propagate). If not a cloud row, fall through.
        if let Ok(conn) = db.connection() {
            match memory_sync::soft_delete_memory_for_push(&conn, memory_id) {
                Ok(true) => return Ok(true), // cloud row soft-deleted
                Ok(false) => {}              // not a cloud row, hard-delete below
                Err(e) => {
                    tracing::warn!(error = %e, memory_id, "memory_forget: soft-delete failed, falling through to hard delete");
                }
            }
        }
    }

    state.manager.forget(memory_id)
}

/// Delete a memory by category and topic
///
/// In cloud mode: soft-deletes the row so the tombstone propagates.
#[tauri::command]
pub async fn memory_forget_topic(
    category: String,
    topic: String,
    active_mode: Option<String>,
    state: State<'_, MemoryState>,
    db: State<'_, AppDatabase>,
    settings_state: State<'_, SettingsState>,
) -> Result<bool> {
    let category = parse_category(&category)?;

    let storage_mode_is_cloud = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
    };

    if derive_cloud_sync_enabled(active_mode.as_deref(), storage_mode_is_cloud) {
        if let Ok(conn) = db.connection() {
            match memory_sync::soft_delete_memory_by_topic_for_push(
                &conn,
                category.as_str(),
                &topic,
            ) {
                Ok(true) => return Ok(true),
                Ok(false) => {}
                Err(e) => {
                    tracing::warn!(error = %e, topic = %topic, "memory_forget_topic: soft-delete failed, falling through to hard delete");
                }
            }
        }
    }

    state.manager.forget_topic(category, &topic)
}

/// Log an entry to today's daily log
#[tauri::command]
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
#[tauri::command]
pub async fn memory_get_daily_logs(
    date: String,
    state: State<'_, MemoryState>,
) -> Result<Vec<DailyLogEntry>> {
    state.manager.get_daily_logs(&date)
}

/// Get session context (recent logs + important memories) for AGI initialization
#[tauri::command]
pub async fn memory_get_session_context(state: State<'_, MemoryState>) -> Result<String> {
    state.manager.get_session_context()
}

/// List all memory categories
#[tauri::command]
pub async fn memory_list_categories() -> Result<Vec<String>> {
    Ok(memory_category_names())
}

/// Export all memories for backup
#[tauri::command]
pub async fn memory_export_all(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    state.manager.export_all()
}

/// List all memories (alias for memory_export_all for frontend compatibility)
#[tauri::command]
pub async fn memory_list_all(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    state.manager.export_all()
}

/// Store or update a memory (alias for memory_remember for frontend compatibility)
#[tauri::command]
pub async fn memory_store(
    category: String,
    topic: String,
    content: String,
    importance: Option<i32>,
    source: Option<String>,
    active_mode: Option<String>,
    state: State<'_, MemoryState>,
    db: State<'_, AppDatabase>,
    settings_state: State<'_, SettingsState>,
) -> Result<i64> {
    let category = parse_category(&category)?;
    let memory_id =
        state
            .manager
            .remember(category, &topic, &content, importance, source.as_deref())?;

    let storage_mode_is_cloud = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
    };
    if derive_cloud_sync_enabled(active_mode.as_deref(), storage_mode_is_cloud) {
        set_memory_cloud_mode(&db, memory_id);
        try_mark_memory_for_push(&db, memory_id);
    }

    Ok(memory_id)
}

/// Delete a memory by ID (alias for memory_forget for frontend compatibility)
///
/// In cloud mode: soft-deletes the row so the tombstone propagates.
#[tauri::command]
pub async fn memory_delete(
    memory_id: i64,
    active_mode: Option<String>,
    state: State<'_, MemoryState>,
    db: State<'_, AppDatabase>,
    settings_state: State<'_, SettingsState>,
) -> Result<bool> {
    let storage_mode_is_cloud = {
        let settings = settings_state.settings.lock().await;
        settings
            .chat_preferences
            .as_ref()
            .map(|p| p.chat_storage_mode.as_str() == "cloud")
            .unwrap_or(false)
    };

    if derive_cloud_sync_enabled(active_mode.as_deref(), storage_mode_is_cloud) {
        if let Ok(conn) = db.connection() {
            match memory_sync::soft_delete_memory_for_push(&conn, memory_id) {
                Ok(true) => return Ok(true),
                Ok(false) => {}
                Err(e) => {
                    tracing::warn!(error = %e, memory_id, "memory_delete: soft-delete failed, falling through to hard delete");
                }
            }
        }
    }

    state.manager.forget(memory_id)
}

/// Cleanup old daily logs (keep last N days)
#[tauri::command]
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
#[tauri::command]
pub async fn memory_run_decay(state: State<'_, MemoryState>) -> Result<DecayResult> {
    state.manager.decay_memories()
}

/// Get the current decay configuration
#[tauri::command]
pub async fn memory_get_decay_config(state: State<'_, MemoryState>) -> Result<DecayConfig> {
    state.manager.get_decay_config()
}

/// Set the decay configuration
#[tauri::command]
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
#[tauri::command]
pub async fn memory_get_decay_candidates(
    state: State<'_, MemoryState>,
) -> Result<Vec<DecayCandidate>> {
    state.manager.get_decay_candidates()
}

/// Boost the importance of a memory by ID
#[tauri::command]
pub async fn memory_boost_on_access(memory_id: i64, state: State<'_, MemoryState>) -> Result<i32> {
    state.manager.boost_on_access(memory_id)
}

/// Recall a memory with importance boost
#[tauri::command]
pub async fn memory_recall_with_boost(
    category: String,
    topic: String,
    state: State<'_, MemoryState>,
) -> Result<Option<MemoryEntry>> {
    let category = parse_category(&category)?;
    state.manager.recall_with_boost(category, &topic)
}

/// Manually decay a specific memory by a given amount
#[tauri::command]
pub async fn memory_decay_single(
    memory_id: i64,
    decay_amount: i32,
    state: State<'_, MemoryState>,
) -> Result<i32> {
    state.manager.decay_memory(memory_id, decay_amount)
}

/// Get statistics about memory importance distribution
#[tauri::command]
pub async fn memory_get_stats(state: State<'_, MemoryState>) -> Result<MemoryStats> {
    state.manager.get_memory_stats()
}

// =============================================================================
// Memory Export Commands
// =============================================================================

/// Export all memories and logs to JSON format
///
/// If a path is provided, exports to that file and returns metadata about the export.
/// If no path is provided, returns the full JSON export data.
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
pub async fn memory_get_dashboard_stats(
    state: State<'_, MemoryState>,
) -> Result<serde_json::Value> {
    let stats = state.manager.get_memory_stats()?;

    Ok(serde_json::json!({
        "memory_stats": stats,
    }))
}

/// Get project-specific memories for injection into LLM context
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
pub async fn memory_suggest_important(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    // Get critical memories (importance >= 9)
    state.manager.get_important_memories(9)
}

const ALL_MEMORY_CATEGORIES: [MemoryCategory; 6] = [
    MemoryCategory::Preference,
    MemoryCategory::Fact,
    MemoryCategory::Decision,
    MemoryCategory::Context,
    MemoryCategory::Summary,
    MemoryCategory::Skill,
];

fn memory_category_names() -> Vec<String> {
    ALL_MEMORY_CATEGORIES
        .iter()
        .map(|category| category.as_str().to_string())
        .collect()
}

/// Parse a category string to MemoryCategory enum
fn parse_category(category: &str) -> Result<MemoryCategory> {
    let normalized = category.trim().to_lowercase();
    let singular = match normalized.as_str() {
        "preferences" => "preference",
        "facts" => "fact",
        "decisions" => "decision",
        "summaries" => "summary",
        "skills" => "skill",
        other => other,
    };
    MemoryCategory::parse(singular).ok_or_else(|| {
        Error::Generic(format!(
            "Invalid memory category: {}. Valid options: {}",
            category,
            memory_category_names().join(", ")
        ))
    })
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
        assert!(matches!(
            parse_category("summary"),
            Ok(MemoryCategory::Summary)
        ));
        assert!(matches!(
            parse_category("skills"),
            Ok(MemoryCategory::Skill)
        ));
        assert!(parse_category("invalid").is_err());
    }

    #[test]
    fn every_category_round_trips_through_parse() {
        for category in ALL_MEMORY_CATEGORIES {
            assert_eq!(parse_category(category.as_str()).unwrap(), category);
        }
    }
}
