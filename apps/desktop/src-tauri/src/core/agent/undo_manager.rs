//! Undo Manager for AGI Workforce
//!
//! Extends ChangeTracker with actual undo execution capabilities.
//! Provides user-friendly undo operations for reversing AGI actions.

use super::change_tracker::{Change, ChangeTracker, ChangeType};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;

/// Result of an undo operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoResult {
    pub success: bool,
    pub change_id: String,
    pub change_type: String,
    pub path: Option<String>,
    pub message: String,
}

/// Summary of undo-able changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoSummary {
    pub total_changes: usize,
    pub revertible_changes: usize,
    pub changes_by_type: std::collections::HashMap<String, usize>,
    pub recent_changes: Vec<UndoableChange>,
}

/// A change that can be undone
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoableChange {
    pub id: String,
    pub change_type: String,
    pub path: Option<String>,
    pub timestamp: String,
    pub task_id: String,
    pub description: String,
}

impl From<&Change> for UndoableChange {
    fn from(change: &Change) -> Self {
        let description = match &change.change_type {
            ChangeType::FileCreated => {
                format!(
                    "Created file: {}",
                    change
                        .path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                )
            }
            ChangeType::FileModified => {
                format!(
                    "Modified file: {}",
                    change
                        .path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                )
            }
            ChangeType::FileDeleted => {
                format!(
                    "Deleted file: {}",
                    change
                        .path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                )
            }
            ChangeType::FileRenamed { old_path } => {
                format!(
                    "Renamed {} to {}",
                    old_path,
                    change
                        .path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                )
            }
            ChangeType::CommandExecuted { command, .. } => {
                format!("Executed command: {}", truncate_string(command, 50))
            }
            ChangeType::GitCommit { message, .. } => {
                format!("Git commit: {}", truncate_string(message, 50))
            }
            ChangeType::GitCheckout { branch } => {
                format!("Git checkout: {}", branch)
            }
            ChangeType::DirectoryCreated => {
                format!(
                    "Created directory: {}",
                    change
                        .path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                )
            }
            ChangeType::DirectoryDeleted => {
                format!(
                    "Deleted directory: {}",
                    change
                        .path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                )
            }
        };

        Self {
            id: change.id.clone(),
            change_type: format!("{:?}", change.change_type),
            path: change.path.as_ref().map(|p| p.display().to_string()),
            timestamp: change.timestamp.to_rfc3339(),
            task_id: change.task_id.clone(),
            description,
        }
    }
}

fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

/// Undo Manager wraps ChangeTracker and adds undo execution
pub struct UndoManager {
    change_tracker: Arc<ChangeTracker>,
}

impl UndoManager {
    pub fn new(change_tracker: Arc<ChangeTracker>) -> Self {
        Self { change_tracker }
    }

    /// Get summary of undo-able changes
    pub async fn get_undo_summary(&self, task_id: Option<&str>) -> UndoSummary {
        let all_changes = self.change_tracker.get_all_changes().await;
        let revertible = self.change_tracker.get_revertible_changes(task_id).await;

        let mut changes_by_type = std::collections::HashMap::new();
        for change in &revertible {
            let type_name = format!("{:?}", change.change_type);
            *changes_by_type.entry(type_name).or_insert(0) += 1;
        }

        let recent_changes: Vec<UndoableChange> = revertible
            .iter()
            .take(10)
            .map(UndoableChange::from)
            .collect();

        UndoSummary {
            total_changes: all_changes.len(),
            revertible_changes: revertible.len(),
            changes_by_type,
            recent_changes,
        }
    }

    /// Undo a specific change by ID
    pub async fn undo_change(&self, change_id: &str) -> Result<UndoResult, String> {
        let changes = self.change_tracker.get_all_changes().await;
        let change = changes
            .iter()
            .find(|c| c.id == change_id)
            .ok_or_else(|| format!("Change not found: {}", change_id))?;

        if change.reverted {
            return Err(format!("Change {} has already been reverted", change_id));
        }

        if !change.can_revert {
            return Err(format!("Change {} cannot be reverted", change_id));
        }

        self.execute_undo(change).await
    }

    /// Undo the most recent change
    pub async fn undo_last(&self, task_id: Option<&str>) -> Result<UndoResult, String> {
        let revertible = self.change_tracker.get_revertible_changes(task_id).await;

        let change = revertible
            .last()
            .ok_or_else(|| "No changes to undo".to_string())?;

        self.execute_undo(change).await
    }

    /// Undo all changes for a task
    pub async fn undo_task(&self, task_id: &str) -> Result<Vec<UndoResult>, String> {
        let changes = self
            .change_tracker
            .get_revertible_changes(Some(task_id))
            .await;

        if changes.is_empty() {
            return Err(format!("No revertible changes found for task {}", task_id));
        }

        let mut results = Vec::new();

        // Undo in reverse order (newest first)
        for change in changes.iter().rev() {
            match self.execute_undo(change).await {
                Ok(result) => results.push(result),
                Err(e) => {
                    // Continue with other undos but record the error
                    results.push(UndoResult {
                        success: false,
                        change_id: change.id.clone(),
                        change_type: format!("{:?}", change.change_type),
                        path: change.path.as_ref().map(|p| p.display().to_string()),
                        message: format!("Failed to undo: {}", e),
                    });
                }
            }
        }

        Ok(results)
    }

    /// Execute the actual undo operation
    async fn execute_undo(&self, change: &Change) -> Result<UndoResult, String> {
        let result = match &change.change_type {
            ChangeType::FileCreated => self.undo_file_created(change).await,
            ChangeType::FileModified => self.undo_file_modified(change).await,
            ChangeType::FileDeleted => self.undo_file_deleted(change).await,
            ChangeType::FileRenamed { old_path } => self.undo_file_renamed(change, old_path).await,
            ChangeType::DirectoryCreated => self.undo_directory_created(change).await,
            ChangeType::DirectoryDeleted => {
                // Can't undo directory deletion unless we stored contents
                Err("Cannot undo directory deletion (contents not preserved)".to_string())
            }
            ChangeType::CommandExecuted { .. } => {
                // Commands generally can't be undone automatically
                Err("Command execution cannot be automatically undone".to_string())
            }
            ChangeType::GitCommit { .. } => {
                // Git commits would need git revert
                Err("Use 'git revert' to undo git commits".to_string())
            }
            ChangeType::GitCheckout { .. } => {
                // Git checkout could theoretically be reversed
                Err("Git checkout cannot be automatically undone".to_string())
            }
        };

        // Mark as reverted if successful
        if result.is_ok() {
            let _ = self.change_tracker.mark_reverted(&change.id).await;
        }

        result
    }

    async fn undo_file_created(&self, change: &Change) -> Result<UndoResult, String> {
        let path = change
            .path
            .as_ref()
            .ok_or_else(|| "No path for file creation".to_string())?;

        // Check if file still exists
        if !path.exists() {
            return Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "FileCreated".to_string(),
                path: Some(path.display().to_string()),
                message: "File already deleted".to_string(),
            });
        }

        // Delete the created file
        fs::remove_file(path)
            .await
            .map_err(|e| format!("Failed to delete file: {}", e))?;

        Ok(UndoResult {
            success: true,
            change_id: change.id.clone(),
            change_type: "FileCreated".to_string(),
            path: Some(path.display().to_string()),
            message: format!("Deleted created file: {}", path.display()),
        })
    }

    async fn undo_file_modified(&self, change: &Change) -> Result<UndoResult, String> {
        let path = change
            .path
            .as_ref()
            .ok_or_else(|| "No path for file modification".to_string())?;

        let before_content = change
            .before_content
            .as_ref()
            .ok_or_else(|| "No before content stored for this change".to_string())?;

        // Restore previous content
        fs::write(path, before_content)
            .await
            .map_err(|e| format!("Failed to restore file: {}", e))?;

        Ok(UndoResult {
            success: true,
            change_id: change.id.clone(),
            change_type: "FileModified".to_string(),
            path: Some(path.display().to_string()),
            message: format!("Restored previous version of: {}", path.display()),
        })
    }

    async fn undo_file_deleted(&self, change: &Change) -> Result<UndoResult, String> {
        let path = change
            .path
            .as_ref()
            .ok_or_else(|| "No path for file deletion".to_string())?;

        let content = change
            .before_content
            .as_ref()
            .ok_or_else(|| "No content stored for deleted file".to_string())?;

        // Check if file already exists
        if path.exists() {
            return Err(format!(
                "Cannot restore deleted file - path already exists: {}",
                path.display()
            ));
        }

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        // Restore the file
        fs::write(path, content)
            .await
            .map_err(|e| format!("Failed to restore file: {}", e))?;

        Ok(UndoResult {
            success: true,
            change_id: change.id.clone(),
            change_type: "FileDeleted".to_string(),
            path: Some(path.display().to_string()),
            message: format!("Restored deleted file: {}", path.display()),
        })
    }

    async fn undo_file_renamed(
        &self,
        change: &Change,
        old_path: &str,
    ) -> Result<UndoResult, String> {
        let new_path = change
            .path
            .as_ref()
            .ok_or_else(|| "No new path for file rename".to_string())?;

        let old_path = PathBuf::from(old_path);

        // Check if we can rename back
        if old_path.exists() {
            return Err(format!(
                "Cannot undo rename - original path already exists: {}",
                old_path.display()
            ));
        }

        if !new_path.exists() {
            return Err(format!(
                "Cannot undo rename - new file doesn't exist: {}",
                new_path.display()
            ));
        }

        // Rename back
        fs::rename(new_path, &old_path)
            .await
            .map_err(|e| format!("Failed to rename file: {}", e))?;

        Ok(UndoResult {
            success: true,
            change_id: change.id.clone(),
            change_type: "FileRenamed".to_string(),
            path: Some(old_path.display().to_string()),
            message: format!(
                "Renamed {} back to {}",
                new_path.display(),
                old_path.display()
            ),
        })
    }

    async fn undo_directory_created(&self, change: &Change) -> Result<UndoResult, String> {
        let path = change
            .path
            .as_ref()
            .ok_or_else(|| "No path for directory creation".to_string())?;

        if !path.exists() {
            return Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "DirectoryCreated".to_string(),
                path: Some(path.display().to_string()),
                message: "Directory already removed".to_string(),
            });
        }

        // Only remove if empty
        let is_empty = fs::read_dir(path)
            .await
            .map_err(|e| format!("Failed to read directory: {}", e))?
            .next_entry()
            .await
            .map_err(|e| format!("Failed to check directory: {}", e))?
            .is_none();

        if !is_empty {
            return Err(format!(
                "Cannot remove directory - not empty: {}",
                path.display()
            ));
        }

        fs::remove_dir(path)
            .await
            .map_err(|e| format!("Failed to remove directory: {}", e))?;

        Ok(UndoResult {
            success: true,
            change_id: change.id.clone(),
            change_type: "DirectoryCreated".to_string(),
            path: Some(path.display().to_string()),
            message: format!("Removed created directory: {}", path.display()),
        })
    }
}
