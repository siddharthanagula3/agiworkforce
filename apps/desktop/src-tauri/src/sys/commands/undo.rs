//! Undo Commands for AGI Workforce
//!
//! Tauri commands for managing undo operations.
//! These commands allow users to reverse AGI actions through natural language
//! or direct API calls from the frontend.

use crate::core::agent::change_tracker::ChangeTracker;
use crate::core::agent::undo_manager::{UndoManager, UndoResult, UndoSummary, UndoableChange};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// Global undo manager state
pub struct UndoState {
    pub manager: RwLock<Option<Arc<UndoManager>>>,
    pub change_tracker: Arc<ChangeTracker>,
}

impl UndoState {
    pub fn new() -> Self {
        let change_tracker = Arc::new(ChangeTracker::new());
        let manager = Arc::new(UndoManager::new(change_tracker.clone()));
        Self {
            manager: RwLock::new(Some(manager)),
            change_tracker,
        }
    }

    pub async fn get_manager(&self) -> Arc<UndoManager> {
        let guard = self.manager.read().await;
        guard
            .as_ref()
            .cloned()
            .unwrap_or_else(|| Arc::new(UndoManager::new(self.change_tracker.clone())))
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
}
