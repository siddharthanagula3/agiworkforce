//! Undo Commands for AGI Workforce
//!
//! Tauri commands for managing undo operations.
//! These commands allow users to reverse AGI actions through natural language
//! or direct API calls from the frontend.
//!
//! This module provides two types of undo capabilities:
//! 1. File/system change undo (via UndoManager)
//! 2. Form submission undo (via FormUndoManager)

use crate::core::agent::change_tracker::{ChangeTracker, NamedFileCheckpoint};
use crate::core::agent::form_undo::{FormSubmission, FormUndoManager, FormUndoResult};
use crate::core::agent::undo_manager::{UndoManager, UndoResult, UndoSummary, UndoableChange};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Global undo manager state
pub struct UndoState {
    pub manager: RwLock<Option<Arc<UndoManager>>>,
    pub change_tracker: Arc<ChangeTracker>,
    pub form_undo_manager: Arc<FormUndoManager>,
}

impl UndoState {
    pub fn new() -> Self {
        let change_tracker = Arc::new(ChangeTracker::new());
        let manager = Arc::new(UndoManager::new(change_tracker.clone()));
        let form_undo_manager = Arc::new(FormUndoManager::new(100));
        Self {
            manager: RwLock::new(Some(manager)),
            change_tracker,
            form_undo_manager,
        }
    }

    pub async fn get_manager(&self) -> Arc<UndoManager> {
        let guard = self.manager.read().await;
        guard
            .as_ref()
            .cloned()
            .unwrap_or_else(|| Arc::new(UndoManager::new(self.change_tracker.clone())))
    }

    pub fn get_form_undo_manager(&self) -> Arc<FormUndoManager> {
        self.form_undo_manager.clone()
    }
}

impl Default for UndoState {
    fn default() -> Self {
        Self::new()
    }
}

/// Get summary of undo-able changes
#[tauri::command]
pub async fn undo_get_summary(
    undo_state: State<'_, UndoState>,
    task_id: Option<String>,
) -> Result<UndoSummary, String> {
    let manager = undo_state.get_manager().await;
    let summary = manager.get_undo_summary(task_id.as_deref()).await;
    Ok(summary)
}

/// Get list of recent undo-able changes
#[tauri::command]
pub async fn undo_get_changes(
    undo_state: State<'_, UndoState>,
    task_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<UndoableChange>, String> {
    let manager = undo_state.get_manager().await;
    let summary = manager.get_undo_summary(task_id.as_deref()).await;

    let changes: Vec<UndoableChange> = summary
        .recent_changes
        .into_iter()
        .take(limit.unwrap_or(20))
        .collect();

    Ok(changes)
}

/// Undo a specific change by ID
#[tauri::command]
pub async fn undo_change(
    undo_state: State<'_, UndoState>,
    change_id: String,
) -> Result<UndoResult, String> {
    let manager = undo_state.get_manager().await;
    manager.undo_change(&change_id).await
}

/// Undo the most recent change
#[tauri::command]
pub async fn undo_last(
    undo_state: State<'_, UndoState>,
    task_id: Option<String>,
) -> Result<UndoResult, String> {
    let manager = undo_state.get_manager().await;
    manager.undo_last(task_id.as_deref()).await
}

/// Undo all changes for a specific task
#[tauri::command]
pub async fn undo_task(
    undo_state: State<'_, UndoState>,
    task_id: String,
) -> Result<Vec<UndoResult>, String> {
    let manager = undo_state.get_manager().await;
    manager.undo_task(&task_id).await
}

/// Check if there are any changes that can be undone
#[tauri::command]
pub async fn undo_can_undo(
    undo_state: State<'_, UndoState>,
    task_id: Option<String>,
) -> Result<bool, String> {
    let manager = undo_state.get_manager().await;
    let summary = manager.get_undo_summary(task_id.as_deref()).await;
    Ok(summary.revertible_changes > 0)
}

/// Get the change tracker for recording new changes
/// (Used by other modules to record file operations)
pub fn get_change_tracker(undo_state: &UndoState) -> Arc<ChangeTracker> {
    undo_state.change_tracker.clone()
}

// ============================================================================
// Named File Checkpoint Commands
// ============================================================================

/// Create a named checkpoint by snapshotting the current contents of the given files.
///
/// Returns the checkpoint ID that can later be used with `coding_checkpoint_rewind`.
/// A maximum of 50 checkpoints are retained; the oldest is evicted when exceeded.
#[tauri::command]
pub async fn coding_checkpoint_create(
    name: String,
    paths: Vec<String>,
    undo_state: State<'_, UndoState>,
) -> Result<String, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Checkpoint name cannot be empty".to_string());
    }
    if paths.is_empty() {
        return Err("At least one path must be provided".to_string());
    }
    let pathbufs: Vec<PathBuf> = paths
        .iter()
        .filter(|p| !p.trim().is_empty())
        .map(PathBuf::from)
        .collect();
    if pathbufs.is_empty() {
        return Err("No valid paths provided".to_string());
    }
    let tracker = &undo_state.change_tracker;
    tracker.create_named_checkpoint(name, pathbufs).await
}

/// List all named file checkpoints in chronological order.
#[tauri::command]
pub async fn coding_checkpoint_list(
    undo_state: State<'_, UndoState>,
) -> Result<Vec<NamedFileCheckpoint>, String> {
    let tracker = &undo_state.change_tracker;
    Ok(tracker.list_named_checkpoints().await)
}

/// Rewind files to a named checkpoint, restoring their snapshotted contents.
///
/// All checkpoints created after the target checkpoint are removed.
/// Returns the list of restored file paths.
#[tauri::command]
pub async fn coding_checkpoint_rewind(
    id: String,
    undo_state: State<'_, UndoState>,
) -> Result<Vec<String>, String> {
    if id.trim().is_empty() {
        return Err("Checkpoint ID cannot be empty".to_string());
    }
    let tracker = &undo_state.change_tracker;
    let paths = tracker.rewind_to_checkpoint(&id).await?;
    Ok(paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

// ============================================================================
// Form Undo Commands
// ============================================================================

/// Record a form submission for potential undo
///
/// This should be called before submitting a form to capture its state.
/// The system will automatically detect if the form contains sensitive data
/// (like payment information) and mark it as non-undoable.
#[tauri::command]
pub async fn form_undo_record(
    undo_state: State<'_, UndoState>,
    url: String,
    form_selector: String,
    field_values: HashMap<String, String>,
    can_undo: Option<bool>,
    task_id: Option<String>,
    method: Option<String>,
    action_url: Option<String>,
) -> Result<FormSubmission, String> {
    let form_manager = undo_state.get_form_undo_manager();

    let submission = form_manager
        .record_submission_with_metadata(
            url,
            form_selector,
            field_values,
            can_undo.unwrap_or(true),
            task_id,
            method,
            action_url,
        )
        .await;

    Ok(submission)
}

/// Attempt to undo a form submission
///
/// Returns instructions for undoing the submission, including:
/// - The URL to navigate to
/// - The fields to refill with their original values
///
/// Note: This does not actually perform the browser automation.
/// The caller must execute the navigation and form filling.
#[tauri::command]
pub async fn form_undo_attempt(
    undo_state: State<'_, UndoState>,
    submission_id: String,
) -> Result<FormUndoResult, String> {
    let form_manager = undo_state.get_form_undo_manager();
    form_manager.undo_submission(&submission_id).await
}

/// Check if a specific form submission can be undone
#[tauri::command]
pub async fn form_undo_can_undo(
    undo_state: State<'_, UndoState>,
    submission_id: String,
) -> Result<bool, String> {
    let form_manager = undo_state.get_form_undo_manager();
    Ok(form_manager.can_undo(&submission_id).await)
}

/// List recent form submissions
///
/// Returns form submissions in reverse chronological order (most recent first).
/// Optionally filter by task ID and limit the number of results.
#[tauri::command]
pub async fn form_undo_list(
    undo_state: State<'_, UndoState>,
    limit: Option<usize>,
    task_id: Option<String>,
) -> Result<Vec<FormSubmission>, String> {
    let form_manager = undo_state.get_form_undo_manager();
    let submissions = form_manager
        .get_recent_submissions(limit, task_id.as_deref())
        .await;
    Ok(submissions)
}

/// Get only the submissions that can be undone
#[tauri::command]
pub async fn form_undo_list_undoable(
    undo_state: State<'_, UndoState>,
) -> Result<Vec<FormSubmission>, String> {
    let form_manager = undo_state.get_form_undo_manager();
    let submissions = form_manager.get_undoable_submissions().await;
    Ok(submissions)
}

/// Get a specific form submission by ID
#[tauri::command]
pub async fn form_undo_get(
    undo_state: State<'_, UndoState>,
    submission_id: String,
) -> Result<Option<FormSubmission>, String> {
    let form_manager = undo_state.get_form_undo_manager();
    Ok(form_manager.get_submission(&submission_id).await)
}

/// Clear all form submission history
#[tauri::command]
pub async fn form_undo_clear(undo_state: State<'_, UndoState>) -> Result<(), String> {
    let form_manager = undo_state.get_form_undo_manager();
    form_manager.clear_history().await;
    Ok(())
}

/// Clear old form submissions (older than specified hours)
#[tauri::command]
pub async fn form_undo_clear_old(
    undo_state: State<'_, UndoState>,
    max_age_hours: u64,
) -> Result<(), String> {
    let form_manager = undo_state.get_form_undo_manager();
    form_manager.clear_old_submissions(max_age_hours).await;
    Ok(())
}

/// Get form undo statistics
#[tauri::command]
pub async fn form_undo_stats(undo_state: State<'_, UndoState>) -> Result<FormUndoStats, String> {
    let form_manager = undo_state.get_form_undo_manager();

    Ok(FormUndoStats {
        total_submissions: form_manager.submission_count().await,
        undoable_submissions: form_manager.undoable_count().await,
    })
}

/// Statistics about form undo history
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormUndoStats {
    pub total_submissions: usize,
    pub undoable_submissions: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_undo_state_creation() {
        let state = UndoState::new();
        let manager = state.get_manager().await;
        let summary = manager.get_undo_summary(None).await;

        assert_eq!(summary.total_changes, 0);
        assert_eq!(summary.revertible_changes, 0);
    }

    #[tokio::test]
    async fn test_form_undo_manager_in_state() {
        let state = UndoState::new();
        let form_manager = state.get_form_undo_manager();

        // Should start empty
        assert_eq!(form_manager.submission_count().await, 0);
        assert_eq!(form_manager.undoable_count().await, 0);
    }
}
