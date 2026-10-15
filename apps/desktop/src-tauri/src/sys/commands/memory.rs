//! Tauri commands for persistent memory management
//!
//! These commands expose the MemoryManager to the frontend,
//! allowing the AGI to persist and recall information across sessions.

use std::sync::Arc;
use tauri::State;

use crate::core::agi::memory_manager::{
    ImportConflictStrategy, ImportResult, MemoryCategory, MemoryEntry, MemoryExport, MemoryManager,
};
use crate::core::llm::memory_integration::MemoryInjectionConfig;
use crate::sys::error::{Error, Result};
use crate::sys::native_confirm::{ConfirmGate, NativeConfirm};
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

/// Shared scheduled memory extractor; see `core::agi::conversation_summarizer`.
pub struct ConversationSummarizerState {
    pub summarizer: Arc<crate::core::agi::conversation_summarizer::ConversationSummarizer>,
}

impl Default for ConversationSummarizerState {
    fn default() -> Self {
        Self::new()
    }
}

impl ConversationSummarizerState {
    pub fn new() -> Self {
        Self {
            summarizer: Arc::new(
                crate::core::agi::conversation_summarizer::ConversationSummarizer::new(),
            ),
        }
    }
}

/// Delete a memory by category and topic
#[tauri::command]
pub async fn memory_forget_topic(
    category: String,
    topic: String,
    state: State<'_, MemoryState>,
) -> Result<bool> {
    let category = parse_category(&category)?;
    state.manager.forget_topic(category, &topic)
}

/// List all memories.
#[tauri::command]
pub async fn memory_list_all(state: State<'_, MemoryState>) -> Result<Vec<MemoryEntry>> {
    state.manager.export_all()
}

/// Store or update a memory
///
/// If a memory with the same category+topic already exists, it will be updated.
#[tauri::command]
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

/// Delete a memory by ID.
#[tauri::command]
pub async fn memory_delete(memory_id: i64, state: State<'_, MemoryState>) -> Result<bool> {
    state.manager.forget(memory_id)
}

/// One delete-all question at a time, and a wait after a no that grows
/// while the noes keep coming, so a loop cannot stack them or wear the user
/// down.
static FORGET_ALL_DECISIONS: ConfirmGate = ConfirmGate::new();
const FORGET_ALL_REQUEST: &str = "delete every memory on this device";
const FORGET_ALL_LABEL: &str = "Delete All Memories";

/// The question asked before every memory is deleted, in the words the
/// Memory settings use.
fn forget_all_question(count: usize) -> NativeConfirm {
    let noun = if count == 1 { "memory" } else { "memories" };
    NativeConfirm {
        title: format!("Delete all {count} {noun}?"),
        body: "This permanently deletes every memory saved on this device. Chats stop using \
               them, and they cannot be recovered unless you exported them first."
            .to_string(),
        confirm_label: FORGET_ALL_LABEL.to_string(),
    }
}

/// Deletes the memories that were there when the question was asked, and
/// only on a yes. `None` is a decline: nothing was touched. The window can
/// call the command but cannot answer the question, so a script running in
/// it cannot erase what the assistant remembers.
async fn forget_all_confirmed<Confirm, Answer>(
    manager: &MemoryManager,
    confirm: Confirm,
) -> Result<Option<usize>>
where
    Confirm: FnOnce(NativeConfirm) -> Answer,
    Answer: std::future::Future<Output = Result<bool>>,
{
    let memory_ids: Vec<i64> = manager
        .export_all()?
        .into_iter()
        .map(|memory| memory.id)
        .collect();
    if memory_ids.is_empty() {
        return Ok(Some(0));
    }
    if !confirm(forget_all_question(memory_ids.len())).await? {
        tracing::info!("[Memory] Deleting every memory was declined in the native dialog");
        return Ok(None);
    }
    manager.forget_many(&memory_ids).map(Some)
}

/// Deletes every saved memory once the user has said yes in a dialog the
/// operating system draws, and returns how many were deleted; `None` means
/// the user declined and nothing changed.
#[tauri::command]
pub async fn memory_delete_all(
    app: tauri::AppHandle,
    state: State<'_, MemoryState>,
) -> Result<Option<usize>> {
    let app = &app;
    forget_all_confirmed(&state.manager, |question| async move {
        FORGET_ALL_DECISIONS
            .confirm(app, FORGET_ALL_REQUEST, question)
            .await
            .map_err(|held| Error::Generic(held.message()))
    })
    .await
}

// =============================================================================
// Memory Importance Decay Commands
// =============================================================================

// =============================================================================
// Memory Export Commands
// =============================================================================

/// Export all memories and logs as the JSON backup `memory_import_json_string` reads.
#[tauri::command]
pub async fn memory_export_json(state: State<'_, MemoryState>) -> Result<serde_json::Value> {
    let json_string = state.manager.export_to_json()?;
    let export: MemoryExport = serde_json::from_str(&json_string)
        .map_err(|e| Error::Generic(format!("Failed to parse export: {}", e)))?;

    serde_json::to_value(export)
        .map_err(|e| Error::Generic(format!("Failed to serialize export: {}", e)))
}

/// Export all memories as Markdown grouped by category.
#[tauri::command]
pub async fn memory_export_markdown(state: State<'_, MemoryState>) -> Result<String> {
    state.manager.export_to_markdown()
}

// =============================================================================
// Memory Import Commands
// =============================================================================

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

    fn manager_with(memories: usize) -> MemoryManager {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory database");
        crate::data::db::migrations::run_migrations(&conn).expect("run migrations");
        let manager = MemoryManager::from_connection(conn);
        for index in 0..memories {
            manager
                .remember(
                    MemoryCategory::Fact,
                    &format!("topic_{index}"),
                    "Uses VS Code",
                    Some(7),
                    Some("test"),
                )
                .expect("remember");
        }
        manager
    }

    #[tokio::test]
    async fn no_memory_is_deleted_unless_the_native_dialog_says_so() {
        let manager = manager_with(2);
        let asked = std::cell::RefCell::new(None);

        let outcome = forget_all_confirmed(&manager, |question| {
            *asked.borrow_mut() = Some(question);
            async { Ok(false) }
        })
        .await;

        assert!(matches!(outcome, Ok(None)));
        assert_eq!(manager.export_all().expect("list").len(), 2);
        let question = asked.into_inner().expect("the user was asked");
        assert_eq!(question.title, "Delete all 2 memories?");
        assert_eq!(question.confirm_label, "Delete All Memories");
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
        assert!(question.body.contains("cannot be recovered"));

        let outcome = forget_all_confirmed(&manager, |_| async { Ok(true) }).await;

        assert!(matches!(outcome, Ok(Some(2))));
        assert!(manager.export_all().expect("list").is_empty());
    }

    #[tokio::test]
    async fn a_question_that_was_not_asked_deletes_nothing() {
        let manager = manager_with(1);

        let outcome = forget_all_confirmed(&manager, |_| async {
            Err(Error::Generic("Try again in 30 seconds.".to_string()))
        })
        .await;

        assert!(outcome.is_err());
        assert_eq!(manager.export_all().expect("list").len(), 1);
    }

    #[tokio::test]
    async fn nothing_is_asked_when_there_is_nothing_to_delete() {
        let manager = manager_with(0);
        let asked = std::cell::Cell::new(false);

        let outcome = forget_all_confirmed(&manager, |_| {
            asked.set(true);
            async { Ok(true) }
        })
        .await;

        assert!(matches!(outcome, Ok(Some(0))));
        assert!(!asked.get());
        assert_eq!(forget_all_question(1).title, "Delete all 1 memory?");
    }

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
