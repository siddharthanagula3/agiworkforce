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
            ChangeType::GitPush {
                remote,
                branch,
                is_protected_branch,
                ..
            } => {
                let protection_note = if *is_protected_branch {
                    " (protected)"
                } else {
                    ""
                };
                format!("Git push: {}/{}{}", remote, branch, protection_note)
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
            ChangeType::GitPush {
                remote,
                branch,
                before_sha,
                after_sha,
                is_protected_branch,
            } => {
                self.undo_git_push(
                    change,
                    remote,
                    branch,
                    before_sha.as_deref(),
                    after_sha,
                    *is_protected_branch,
                )
                .await
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

        // Try to delete directly -- handle NotFound as success (already gone).
        // Avoids TOCTOU race between exists() and remove_file().
        match fs::remove_file(path).await {
            Ok(()) => Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "FileCreated".to_string(),
                path: Some(path.display().to_string()),
                message: format!("Deleted created file: {}", path.display()),
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "FileCreated".to_string(),
                path: Some(path.display().to_string()),
                message: "File already deleted".to_string(),
            }),
            Err(e) => Err(format!("Failed to delete file: {}", e)),
        }
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

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        // Use create_new (O_CREAT | O_EXCL) to atomically detect whether the
        // file already exists, avoiding a TOCTOU race between exists() and write().
        match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .await
        {
            Ok(_file) => {
                // File was created exclusively; now write the restored content.
                fs::write(path, content)
                    .await
                    .map_err(|e| format!("Failed to write restored file: {}", e))?;

                Ok(UndoResult {
                    success: true,
                    change_id: change.id.clone(),
                    change_type: "FileDeleted".to_string(),
                    path: Some(path.display().to_string()),
                    message: format!("Restored deleted file: {}", path.display()),
                })
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(format!(
                "Cannot restore deleted file - path already exists: {}",
                path.display()
            )),
            Err(e) => Err(format!("Failed to restore file: {}", e)),
        }
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

        // Try to remove directly -- remove_dir only succeeds on empty dirs.
        // Avoids TOCTOU race between exists()/read_dir() and remove_dir().
        match fs::remove_dir(path).await {
            Ok(()) => Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "DirectoryCreated".to_string(),
                path: Some(path.display().to_string()),
                message: format!("Removed created directory: {}", path.display()),
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "DirectoryCreated".to_string(),
                path: Some(path.display().to_string()),
                message: "Directory already removed".to_string(),
            }),
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("not empty") || err_str.contains("Directory not empty") {
                    Err(format!(
                        "Cannot remove directory - not empty: {}",
                        path.display()
                    ))
                } else {
                    Err(format!("Failed to remove directory: {}", e))
                }
            }
        }
    }

    /// Undo a git push operation.
    ///
    /// This method supports two strategies for undoing a push:
    ///
    /// 1. **Revert commit** (default, safe for shared branches):
    ///    Creates a new revert commit that undoes the changes and pushes it.
    ///    This preserves history and is safe for branches others may be using.
    ///
    /// 2. **Force push with lease** (for single-user branches only):
    ///    Resets the remote branch to the previous SHA. This rewrites history
    ///    and should only be used on branches no one else is using.
    ///
    /// For protected branches (main/master), this operation is rejected unless
    /// the user has explicitly confirmed the action.
    ///
    /// # Safety
    ///
    /// - Never force pushes to protected branches without explicit confirmation
    /// - Uses `--force-with-lease` to prevent overwriting others' work
    /// - Creates revert commits when possible to preserve history
    async fn undo_git_push(
        &self,
        change: &Change,
        remote: &str,
        branch: &str,
        before_sha: Option<&str>,
        after_sha: &str,
        is_protected_branch: bool,
    ) -> Result<UndoResult, String> {
        let repo_path = change
            .path
            .as_ref()
            .ok_or_else(|| "No repository path for git push".to_string())?;

        // Reject undo for protected branches
        if is_protected_branch {
            return Err(format!(
                "Cannot automatically undo push to protected branch '{}'. \
                 To undo this push, you must manually create a revert commit or \
                 coordinate with your team for a force push.",
                branch
            ));
        }

        // Clone values for the blocking task
        let repo_path_clone = repo_path.clone();
        let remote_clone = remote.to_string();
        let branch_clone = branch.to_string();
        let before_sha_clone = before_sha.map(|s| s.to_string());
        let after_sha_clone = after_sha.to_string();

        // Perform git operations in a blocking task (git2 types are not Send)
        let result = tauri::async_runtime::spawn_blocking(move || {
            Self::execute_git_push_undo(
                &repo_path_clone,
                &remote_clone,
                &branch_clone,
                before_sha_clone.as_deref(),
                &after_sha_clone,
            )
        })
        .await
        .map_err(|e| format!("Git operation failed: {}", e))?;

        match result {
            Ok(message) => Ok(UndoResult {
                success: true,
                change_id: change.id.clone(),
                change_type: "GitPush".to_string(),
                path: Some(repo_path.display().to_string()),
                message,
            }),
            Err(e) => Err(e),
        }
    }

    /// Execute the actual git push undo operation (synchronous, runs in blocking task).
    ///
    /// This function implements the rollback strategy:
    /// 1. First, try to create a revert commit for the pushed changes
    /// 2. If that fails (e.g., merge conflicts), fall back to force push with lease
    fn execute_git_push_undo(
        repo_path: &PathBuf,
        remote: &str,
        branch: &str,
        before_sha: Option<&str>,
        after_sha: &str,
    ) -> Result<String, String> {
        // Open the repository
        let repo = git2::Repository::open(repo_path)
            .map_err(|e| format!("Failed to open repository: {}", e))?;

        // Verify we're on the correct branch
        let head = repo
            .head()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?;
        let current_branch = head
            .shorthand()
            .ok_or_else(|| "Cannot determine current branch".to_string())?;

        if current_branch != branch {
            return Err(format!(
                "Cannot undo push: currently on branch '{}', expected '{}'",
                current_branch, branch
            ));
        }

        // Find the commit that was pushed
        let after_oid = git2::Oid::from_str(after_sha)
            .map_err(|e| format!("Invalid commit SHA '{}': {}", after_sha, e))?;
        let after_commit = repo
            .find_commit(after_oid)
            .map_err(|e| format!("Cannot find pushed commit: {}", e))?;

        // Strategy 1: Try to create a revert commit
        match Self::try_revert_commit(&repo, &after_commit) {
            Ok(revert_oid) => {
                // Push the revert commit
                Self::push_to_remote(&repo, remote, branch)?;

                let short_revert = &revert_oid.to_string()[..8];
                let short_original = &after_sha[..8.min(after_sha.len())];

                tracing::info!(
                    "[UndoManager] Created revert commit {} for pushed commit {}",
                    short_revert,
                    short_original
                );

                return Ok(format!(
                    "Created revert commit {} to undo pushed changes (original: {})",
                    short_revert, short_original
                ));
            }
            Err(revert_error) => {
                tracing::warn!(
                    "[UndoManager] Revert commit failed: {}. Trying force push...",
                    revert_error
                );
            }
        }

        // Strategy 2: Force push with lease (only if we have before_sha)
        let Some(before) = before_sha else {
            return Err(
                "Cannot undo push: no previous commit SHA recorded and revert failed. \
                 This may be a new branch - delete it manually if needed."
                    .to_string(),
            );
        };

        // Verify the before_sha exists
        let before_oid = git2::Oid::from_str(before)
            .map_err(|e| format!("Invalid previous SHA '{}': {}", before, e))?;
        let _before_commit = repo
            .find_commit(before_oid)
            .map_err(|e| format!("Cannot find previous commit: {}", e))?;

        // Perform force push with lease
        Self::force_push_with_lease(&repo, remote, branch, after_sha, before)?;

        let short_before = &before[..8.min(before.len())];
        let short_after = &after_sha[..8.min(after_sha.len())];

        tracing::info!(
            "[UndoManager] Force pushed {}/{} back to {} (from {})",
            remote,
            branch,
            short_before,
            short_after
        );

        Ok(format!(
            "Force pushed {}/{} back to commit {} (was {}). \
             Warning: This rewrote history on the remote.",
            remote, branch, short_before, short_after
        ))
    }

    /// Try to create a revert commit for the given commit.
    ///
    /// Returns the OID of the revert commit if successful.
    fn try_revert_commit(
        repo: &git2::Repository,
        commit: &git2::Commit,
    ) -> Result<git2::Oid, String> {
        // Get the parent commit (the state before the pushed changes)
        let parent = commit
            .parent(0)
            .map_err(|_| "Cannot revert: commit has no parent (initial commit?)".to_string())?;

        // Create a revert by cherry-picking the inverse
        let mut revert_index = repo
            .revert_commit(commit, &parent, 0, None)
            .map_err(|e| format!("Revert failed: {}", e))?;

        // Check for conflicts
        if revert_index.has_conflicts() {
            return Err("Revert would cause merge conflicts".to_string());
        }

        // Write the index to a tree
        let tree_oid = revert_index
            .write_tree_to(repo)
            .map_err(|e| format!("Failed to write revert tree: {}", e))?;
        let tree = repo
            .find_tree(tree_oid)
            .map_err(|e| format!("Failed to find revert tree: {}", e))?;

        // Get the current HEAD for the parent of the revert commit
        let head = repo
            .head()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?;
        let head_commit = head
            .peel_to_commit()
            .map_err(|e| format!("Failed to get HEAD commit: {}", e))?;

        // Create the revert commit
        let signature = repo
            .signature()
            .or_else(|_| git2::Signature::now("AGI Workforce", "agi@agiworkforce.com"))
            .map_err(|e| format!("Failed to create signature: {}", e))?;

        let short_sha = &commit.id().to_string()[..8];
        let revert_message = format!(
            "Revert \"{}\"\n\nThis reverts commit {}.\n\nAutomatically generated by AGI Workforce undo system.",
            commit.summary().unwrap_or("(no message)"),
            short_sha
        );

        let revert_oid = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                &revert_message,
                &tree,
                &[&head_commit],
            )
            .map_err(|e| format!("Failed to create revert commit: {}", e))?;

        Ok(revert_oid)
    }

    /// Push the current branch to a remote.
    fn push_to_remote(repo: &git2::Repository, remote: &str, branch: &str) -> Result<(), String> {
        let mut remote_obj = repo
            .find_remote(remote)
            .map_err(|e| format!("Failed to find remote '{}': {}", remote, e))?;

        // Set up callbacks for authentication
        let mut callbacks = git2::RemoteCallbacks::new();
        callbacks.credentials(|url, username_from_url, allowed_types| {
            Self::get_git_credentials(url, username_from_url, allowed_types)
        });

        let mut push_options = git2::PushOptions::new();
        push_options.remote_callbacks(callbacks);

        let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);

        remote_obj
            .push(&[&refspec], Some(&mut push_options))
            .map_err(|e| format!("Failed to push revert commit: {}", e))?;

        Ok(())
    }

    /// Force push with lease - only succeeds if the remote is at the expected SHA.
    ///
    /// This prevents accidentally overwriting changes that someone else pushed.
    fn force_push_with_lease(
        repo: &git2::Repository,
        remote: &str,
        branch: &str,
        expected_sha: &str,
        target_sha: &str,
    ) -> Result<(), String> {
        let mut remote_obj = repo
            .find_remote(remote)
            .map_err(|e| format!("Failed to find remote '{}': {}", remote, e))?;

        // Fetch to verify the remote state
        let mut fetch_callbacks = git2::RemoteCallbacks::new();
        fetch_callbacks.credentials(|url, username_from_url, allowed_types| {
            Self::get_git_credentials(url, username_from_url, allowed_types)
        });

        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.remote_callbacks(fetch_callbacks);

        remote_obj
            .fetch(&[branch], Some(&mut fetch_options), None)
            .map_err(|e| format!("Failed to fetch remote state: {}", e))?;

        // Check the remote ref
        let remote_ref_name = format!("refs/remotes/{}/{}", remote, branch);
        let remote_ref = repo.find_reference(&remote_ref_name).ok();

        if let Some(ref rref) = remote_ref {
            let remote_oid = rref
                .target()
                .ok_or_else(|| "Remote reference has no target".to_string())?;
            let remote_sha = remote_oid.to_string();

            // Verify the remote is at the expected SHA (force-with-lease behavior)
            if remote_sha != expected_sha {
                return Err(format!(
                    "Remote has changed since the push (expected {}, found {}). \
                     Someone else may have pushed. Aborting to prevent data loss.",
                    &expected_sha[..8.min(expected_sha.len())],
                    &remote_sha[..8.min(remote_sha.len())]
                ));
            }
        }

        // Reset local branch to the target SHA
        let target_oid =
            git2::Oid::from_str(target_sha).map_err(|e| format!("Invalid target SHA: {}", e))?;
        let target_commit = repo
            .find_commit(target_oid)
            .map_err(|e| format!("Cannot find target commit: {}", e))?;

        repo.reset(target_commit.as_object(), git2::ResetType::Hard, None)
            .map_err(|e| format!("Failed to reset to target commit: {}", e))?;

        // Force push
        let mut push_callbacks = git2::RemoteCallbacks::new();
        push_callbacks.credentials(|url, username_from_url, allowed_types| {
            Self::get_git_credentials(url, username_from_url, allowed_types)
        });

        let mut push_options = git2::PushOptions::new();
        push_options.remote_callbacks(push_callbacks);

        // Use + prefix for force push
        let refspec = format!("+refs/heads/{}:refs/heads/{}", branch, branch);

        remote_obj
            .push(&[&refspec], Some(&mut push_options))
            .map_err(|e| format!("Failed to force push: {}", e))?;

        Ok(())
    }

    /// Get git credentials for authentication.
    ///
    /// Tries SSH agent, SSH key files, and git credential helper.
    fn get_git_credentials(
        url: &str,
        username_from_url: Option<&str>,
        allowed_types: git2::CredentialType,
    ) -> Result<git2::Cred, git2::Error> {
        // Try SSH agent authentication first
        if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            if let Some(username) = username_from_url {
                // Try SSH agent
                if let Ok(cred) = git2::Cred::ssh_key_from_agent(username) {
                    return Ok(cred);
                }

                // Try default SSH key locations
                if let Some(home) = dirs::home_dir() {
                    let id_ed25519 = home.join(".ssh").join("id_ed25519");
                    let id_rsa = home.join(".ssh").join("id_rsa");

                    if id_ed25519.exists() {
                        if let Ok(cred) = git2::Cred::ssh_key(username, None, &id_ed25519, None) {
                            return Ok(cred);
                        }
                    }

                    if id_rsa.exists() {
                        if let Ok(cred) = git2::Cred::ssh_key(username, None, &id_rsa, None) {
                            return Ok(cred);
                        }
                    }
                }
            }
        }

        // Try default credentials
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            if let Ok(cred) = git2::Cred::default() {
                return Ok(cred);
            }
        }

        // Try credential helper
        if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            let config = git2::Config::open_default()
                .or_else(|_| git2::Config::new())
                .map_err(|e| git2::Error::from_str(&format!("Failed to open git config: {}", e)))?;
            return git2::Cred::credential_helper(&config, url, username_from_url);
        }

        Err(git2::Error::from_str("No valid credentials found"))
    }
}
