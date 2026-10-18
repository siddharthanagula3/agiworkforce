//! Undo Commands for AGI Workforce
//!
//! Tauri commands for undoing the most recent file or system change and for
//! named file checkpoints.

use crate::core::agent::change_tracker::{ChangeTracker, NamedFileCheckpoint};
use crate::core::agent::undo_manager::{UndoManager, UndoResult};
use crate::sys::commands::file_ops::{require_granted_path, FileOperation};
use std::sync::Arc;
use tauri::State;

/// Global undo manager state
pub struct UndoState {
    pub manager: Arc<UndoManager>,
    pub change_tracker: Arc<ChangeTracker>,
}

impl UndoState {
    pub fn new() -> Self {
        let change_tracker = Arc::new(ChangeTracker::new());
        let manager = Arc::new(UndoManager::new(change_tracker.clone()));
        Self {
            manager,
            change_tracker,
        }
    }

    pub fn get_manager(&self) -> Arc<UndoManager> {
        self.manager.clone()
    }
}

impl Default for UndoState {
    fn default() -> Self {
        Self::new()
    }
}

/// Undo the most recent change
#[tauri::command]
pub async fn undo_last(
    undo_state: State<'_, UndoState>,
    task_id: Option<String>,
) -> Result<UndoResult, String> {
    let manager = undo_state.get_manager();
    manager.undo_last(task_id.as_deref()).await
}

/// Check if there are any changes that can be undone
#[tauri::command]
pub async fn undo_can_undo(
    undo_state: State<'_, UndoState>,
    task_id: Option<String>,
) -> Result<bool, String> {
    let manager = undo_state.get_manager();
    let summary = manager.get_undo_summary(task_id.as_deref()).await;
    Ok(summary.revertible_changes > 0)
}

// ============================================================================
// Named File Checkpoint Commands
// ============================================================================

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
///
/// Rewinding writes files, so every file in the checkpoint must still lie in
/// a folder the person grants now, whatever was granted when it was made.
#[tauri::command]
pub async fn coding_checkpoint_rewind(
    id: String,
    app: tauri::AppHandle,
    undo_state: State<'_, UndoState>,
) -> Result<Vec<String>, String> {
    if id.trim().is_empty() {
        return Err("Checkpoint ID cannot be empty".to_string());
    }
    let tracker = &undo_state.change_tracker;
    let checkpoint = tracker
        .list_named_checkpoints()
        .await
        .into_iter()
        .find(|checkpoint| checkpoint.id == id)
        .ok_or_else(|| format!("Checkpoint not found: {id}"))?;
    for path in checkpoint.file_snapshots.keys() {
        require_granted_path(&app, &path.to_string_lossy(), FileOperation::Write).await?;
    }
    let paths = tracker.rewind_to_checkpoint(&id).await?;
    Ok(paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_checkpoint_rewind_writes_only_inside_the_granted_folders() {
        let source = include_str!("undo.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        let body = production
            .split("pub async fn coding_checkpoint_rewind(")
            .nth(1)
            .expect("coding_checkpoint_rewind is missing");
        let body = body.split("\n}\n").next().unwrap_or(body);
        assert!(
            body.contains("require_granted_path(&app, ") && body.contains("FileOperation::Write"),
            "coding_checkpoint_rewind takes a path from the page without the granted-folder check"
        );
    }

    #[tokio::test]
    async fn test_undo_state_creation() {
        let state = UndoState::new();
        let manager = state.get_manager();
        let summary = manager.get_undo_summary(None).await;

        assert_eq!(summary.total_changes, 0);
        assert_eq!(summary.revertible_changes, 0);
    }
}
