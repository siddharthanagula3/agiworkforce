use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChangeType {
    FileCreated,
    FileModified,
    FileDeleted,
    FileRenamed {
        old_path: String,
    },
    CommandExecuted {
        command: String,
        working_dir: String,
    },
    GitCommit {
        hash: String,
        message: String,
    },
    GitCheckout {
        branch: String,
    },
    /// Tracks a git push operation for potential rollback.
    ///
    /// Stores the commit SHA before push so we can revert or force-push back.
    GitPush {
        /// The remote name (e.g., "origin")
        remote: String,
        /// The branch that was pushed
        branch: String,
        /// The local commit SHA before push (what the remote was pointing to)
        before_sha: Option<String>,
        /// The local commit SHA after push (what was pushed)
        after_sha: String,
        /// Whether this is a protected branch (main/master)
        is_protected_branch: bool,
    },
    DirectoryCreated,
    DirectoryDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Change {
    pub id: String,
    pub change_type: ChangeType,
    pub path: Option<PathBuf>,
    pub timestamp: DateTime<Utc>,
    pub task_id: String,
    pub before_content: Option<String>,
    pub after_content: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub can_revert: bool,
    pub reverted: bool,
}

impl Change {
    pub fn new(
        change_type: ChangeType,
        path: Option<PathBuf>,
        task_id: String,
        before_content: Option<String>,
        after_content: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            change_type,
            path,
            timestamp: Utc::now(),
            task_id,
            before_content,
            after_content,
            metadata: HashMap::new(),
            can_revert: true,
            reverted: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSnapshot {
    pub task_id: String,
    pub timestamp: DateTime<Utc>,
    pub commit_hash: Option<String>,
    pub branch: String,
    pub working_dir: PathBuf,
    pub changed_files: Vec<PathBuf>,
}

/// A named file checkpoint that stores snapshots of file contents at a point in time.
///
/// Used for "rewind to checkpoint" functionality, allowing users to restore files
/// to a known-good state. Each checkpoint captures the contents of one or more files
/// and can be rewound to later.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedFileCheckpoint {
    pub id: String,
    pub name: String,
    pub timestamp: DateTime<Utc>,
    pub file_snapshots: HashMap<PathBuf, String>,
    pub change_index: usize,
}

struct ChangeTrackerState {
    changes: Vec<Change>,
    snapshots: HashMap<String, GitSnapshot>,
    named_checkpoints: Vec<NamedFileCheckpoint>,
}

pub struct ChangeTracker {
    state: RwLock<ChangeTrackerState>,
}

impl ChangeTracker {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(ChangeTrackerState {
                changes: Vec::new(),
                snapshots: HashMap::new(),
                named_checkpoints: Vec::new(),
            }),
        }
    }

    pub async fn record_file_created(
        &self,
        path: PathBuf,
        content: String,
        task_id: String,
    ) -> String {
        let change = Change::new(
            ChangeType::FileCreated,
            Some(path.clone()),
            task_id,
            None,
            Some(content),
        );
        let id = change.id.clone();

        let mut state = self.state.write().await;
        state.changes.push(change);

        id
    }

    pub async fn record_file_modified(
        &self,
        path: PathBuf,
        before_content: String,
        after_content: String,
        task_id: String,
    ) -> String {
        let change = Change::new(
            ChangeType::FileModified,
            Some(path.clone()),
            task_id,
            Some(before_content),
            Some(after_content),
        );
        let id = change.id.clone();

        let mut state = self.state.write().await;
        state.changes.push(change);

        id
    }

    pub async fn record_file_deleted(
        &self,
        path: PathBuf,
        content: String,
        task_id: String,
    ) -> String {
        let change = Change::new(
            ChangeType::FileDeleted,
            Some(path.clone()),
            task_id,
            Some(content),
            None,
        );
        let id = change.id.clone();

        let mut state = self.state.write().await;
        state.changes.push(change);

        id
    }

    pub async fn record_command(
        &self,
        command: String,
        working_dir: PathBuf,
        task_id: String,
        output: Option<String>,
    ) -> String {
        let mut change = Change::new(
            ChangeType::CommandExecuted {
                command: command.clone(),
                working_dir: working_dir.to_string_lossy().to_string(),
            },
            Some(working_dir),
            task_id,
            None,
            output,
        );
        change
            .metadata
            .insert("command".to_string(), serde_json::json!(command));
        let id = change.id.clone();

        let mut state = self.state.write().await;
        state.changes.push(change);

        id
    }

    pub async fn record_git_commit(
        &self,
        repo_path: PathBuf,
        commit_hash: String,
        message: String,
        task_id: String,
    ) -> String {
        let mut change = Change::new(
            ChangeType::GitCommit {
                hash: commit_hash.clone(),
                message: message.clone(),
            },
            Some(repo_path),
            task_id,
            None,
            None,
        );
        // Git commits can be reverted with git revert, but not auto-undone
        change.can_revert = false;

        let id = change.id.clone();
        let mut state = self.state.write().await;
        state.changes.push(change);
        id
    }

    pub async fn record_command_executed(
        &self,
        command: String,
        working_dir: PathBuf,
        task_id: String,
    ) -> String {
        let mut change = Change::new(
            ChangeType::CommandExecuted {
                command: command.clone(),
                working_dir: working_dir.to_string_lossy().to_string(),
            },
            Some(working_dir),
            task_id,
            None,
            None,
        );
        // Commands cannot be automatically undone
        change.can_revert = false;

        let id = change.id.clone();
        let mut state = self.state.write().await;
        state.changes.push(change);
        id
    }

    pub async fn record_git_checkout(
        &self,
        repo_path: PathBuf,
        branch: String,
        task_id: String,
    ) -> String {
        let mut change = Change::new(
            ChangeType::GitCheckout {
                branch: branch.clone(),
            },
            Some(repo_path),
            task_id,
            None,
            None,
        );
        change.can_revert = false;

        let id = change.id.clone();
        let mut state = self.state.write().await;
        state.changes.push(change);
        id
    }

    /// Record a git push operation for potential rollback.
    ///
    /// Git pushes can be rolled back in two ways:
    /// 1. Creating a revert commit and pushing it (safe for shared branches)
    /// 2. Force pushing the previous SHA (only for single-user branches)
    ///
    /// Protected branches (main/master) are marked as non-revertible by default
    /// unless explicitly confirmed by the user.
    ///
    /// # Arguments
    ///
    /// * `repo_path` - Path to the git repository
    /// * `remote` - Name of the remote (e.g., "origin")
    /// * `branch` - Name of the branch that was pushed
    /// * `before_sha` - The commit SHA the remote was pointing to before push (None for new branches)
    /// * `after_sha` - The commit SHA that was pushed
    /// * `task_id` - ID of the task that performed this operation
    pub async fn record_git_push(
        &self,
        repo_path: PathBuf,
        remote: String,
        branch: String,
        before_sha: Option<String>,
        after_sha: String,
        task_id: String,
    ) -> String {
        // Check if this is a protected branch
        let is_protected_branch = Self::is_protected_branch(&branch);

        let mut change = Change::new(
            ChangeType::GitPush {
                remote: remote.clone(),
                branch: branch.clone(),
                before_sha: before_sha.clone(),
                after_sha: after_sha.clone(),
                is_protected_branch,
            },
            Some(repo_path),
            task_id,
            None,
            None,
        );

        // Git pushes to protected branches cannot be auto-reverted
        // Other pushes can be reverted with appropriate warnings
        change.can_revert = !is_protected_branch;

        // Store metadata for undo operations
        change
            .metadata
            .insert("remote".to_string(), serde_json::json!(remote));
        change
            .metadata
            .insert("branch".to_string(), serde_json::json!(branch));
        if let Some(ref sha) = before_sha {
            change
                .metadata
                .insert("before_sha".to_string(), serde_json::json!(sha));
        }
        change
            .metadata
            .insert("after_sha".to_string(), serde_json::json!(after_sha));
        change.metadata.insert(
            "is_protected_branch".to_string(),
            serde_json::json!(is_protected_branch),
        );

        let id = change.id.clone();
        let mut state = self.state.write().await;
        state.changes.push(change);

        tracing::info!(
            "[ChangeTracker] Recorded git push: remote={}, branch={}, before={:?}, after={}, protected={}",
            remote,
            branch,
            before_sha,
            &after_sha[..8.min(after_sha.len())],
            is_protected_branch
        );

        id
    }

    /// Check if a branch name is considered protected (main/master).
    ///
    /// Protected branches require explicit user confirmation for force push operations.
    pub fn is_protected_branch(branch: &str) -> bool {
        let protected_names = ["main", "master", "develop", "release", "production", "prod"];
        let branch_lower = branch.to_lowercase();
        protected_names
            .iter()
            .any(|&name| branch_lower == name || branch_lower.starts_with(&format!("{}/", name)))
    }

    pub async fn create_snapshot(
        &self,
        task_id: String,
        working_dir: PathBuf,
    ) -> Result<GitSnapshot, String> {
        let branch = self
            .get_git_branch(&working_dir)
            .await
            .unwrap_or_else(|| "unknown".to_string());
        let commit_hash = self.get_git_head(&working_dir).await.ok();
        let changed_files = self
            .get_git_changed_files(&working_dir)
            .await
            .unwrap_or_default();

        let snapshot = GitSnapshot {
            task_id: task_id.clone(),
            timestamp: Utc::now(),
            commit_hash,
            branch,
            working_dir: working_dir.clone(),
            changed_files,
        };

        let mut state = self.state.write().await;
        state.snapshots.insert(task_id, snapshot.clone());

        Ok(snapshot)
    }

    pub async fn get_task_changes(&self, task_id: &str) -> Vec<Change> {
        let state = self.state.read().await;
        state
            .changes
            .iter()
            .filter(|c| c.task_id == task_id && !c.reverted)
            .cloned()
            .collect()
    }

    pub async fn get_all_changes(&self) -> Vec<Change> {
        let state = self.state.read().await;
        state.changes.clone()
    }

    pub async fn get_revertible_changes(&self, task_id: Option<&str>) -> Vec<Change> {
        let state = self.state.read().await;
        state
            .changes
            .iter()
            .filter(|c| c.can_revert && !c.reverted && task_id.is_none_or(|tid| c.task_id == tid))
            .cloned()
            .collect()
    }

    pub async fn mark_reverted(&self, change_id: &str) -> Result<(), String> {
        let mut state = self.state.write().await;
        let change = state
            .changes
            .iter_mut()
            .find(|c| c.id == change_id)
            .ok_or_else(|| format!("Change not found: {}", change_id))?;

        change.reverted = true;
        Ok(())
    }

    async fn get_git_branch(&self, working_dir: &std::path::Path) -> Option<String> {
        let working_dir = working_dir.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&working_dir).ok()?;
            let head = repo.head().ok()?;
            head.shorthand().map(|s| s.to_string())
        })
        .await
        .ok()
        .flatten()
    }

    async fn get_git_head(&self, working_dir: &std::path::Path) -> Result<String, String> {
        let working_dir = working_dir.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&working_dir).map_err(|e| e.message().to_string())?;
            let head = repo.head().map_err(|e| e.message().to_string())?;
            let commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;
            Ok(commit.id().to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    async fn get_git_changed_files(
        &self,
        working_dir: &std::path::Path,
    ) -> Result<Vec<PathBuf>, String> {
        let working_dir = working_dir.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&working_dir).map_err(|e| e.message().to_string())?;
            let mut opts = git2::StatusOptions::new();
            opts.include_untracked(true);

            let statuses = repo
                .statuses(Some(&mut opts))
                .map_err(|e| e.message().to_string())?;

            let mut files = Vec::new();
            for entry in statuses.iter() {
                if let Some(path) = entry.path() {
                    files.push(working_dir.join(path));
                }
            }
            Ok(files)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    pub async fn get_snapshot(&self, task_id: &str) -> Option<GitSnapshot> {
        let state = self.state.read().await;
        state.snapshots.get(task_id).cloned()
    }

    /// Record a tool execution for undo tracking.
    ///
    /// This is a generic method to track tool executions that may or may not be reversible.
    /// For file operations, use the specific record_file_* methods instead.
    ///
    /// # Arguments
    ///
    /// * `tool_name` - Name of the tool that was executed
    /// * `input` - Input parameters passed to the tool
    /// * `output` - Output from the tool execution
    /// * `task_id` - ID of the task that performed this operation
    /// * `reversible` - Whether this operation can be undone
    /// * `undo_description` - Optional description of how to undo
    /// * `path` - Optional file path if this affects a file
    #[allow(clippy::too_many_arguments)]
    pub async fn record_tool_executed(
        &self,
        tool_name: String,
        input: serde_json::Value,
        output: serde_json::Value,
        task_id: String,
        reversible: Option<bool>,
        undo_description: Option<String>,
        path: Option<PathBuf>,
    ) -> String {
        let mut change = Change::new(
            ChangeType::CommandExecuted {
                command: tool_name.clone(),
                working_dir: path
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| ".".to_string()),
            },
            path,
            task_id,
            Some(serde_json::to_string(&input).unwrap_or_default()),
            Some(serde_json::to_string(&output).unwrap_or_default()),
        );

        change.can_revert = reversible.unwrap_or(false);
        if let Some(desc) = undo_description {
            change
                .metadata
                .insert("undo_description".to_string(), serde_json::json!(desc));
        }
        change
            .metadata
            .insert("tool_name".to_string(), serde_json::json!(tool_name));

        let id = change.id.clone();
        let mut state = self.state.write().await;
        state.changes.push(change);
        id
    }

    /// Record a tool execution that affects a specific file path.
    ///
    /// This variant is used when a tool modifies a file and we want to track
    /// the before/after state for potential undo.
    #[allow(clippy::too_many_arguments)]
    pub async fn record_tool_executed_with_path(
        &self,
        tool_name: String,
        path: PathBuf,
        before_content: Option<String>,
        after_content: Option<String>,
        task_id: String,
        reversible: bool,
        undo_description: Option<String>,
    ) -> String {
        let mut change = Change::new(
            ChangeType::FileModified,
            Some(path.clone()),
            task_id,
            before_content,
            after_content,
        );

        change.can_revert = reversible;
        if let Some(desc) = undo_description {
            change
                .metadata
                .insert("undo_description".to_string(), serde_json::json!(desc));
        }
        change
            .metadata
            .insert("tool_name".to_string(), serde_json::json!(tool_name));

        let id = change.id.clone();
        let mut state = self.state.write().await;
        state.changes.push(change);
        id
    }

    // ── Named File Checkpoints ──────────────────────────────────────────

    /// Maximum number of named checkpoints to retain.
    const MAX_NAMED_CHECKPOINTS: usize = 50;

    /// Create a named checkpoint by reading the current on-disk contents of the
    /// given paths. Returns the checkpoint ID on success.
    ///
    /// If the checkpoint list exceeds [`Self::MAX_NAMED_CHECKPOINTS`], the
    /// oldest checkpoint is evicted.
    pub async fn create_named_checkpoint(
        &self,
        name: String,
        paths: Vec<PathBuf>,
    ) -> Result<String, String> {
        if paths.is_empty() {
            return Err("No paths provided for checkpoint".to_string());
        }

        let mut file_snapshots: HashMap<PathBuf, String> = HashMap::new();
        for path in &paths {
            let content = tokio::fs::read_to_string(path)
                .await
                .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
            file_snapshots.insert(path.clone(), content);
        }

        let mut state = self.state.write().await;
        let change_index = state.changes.len();
        let checkpoint_id = Uuid::new_v4().to_string();

        let checkpoint = NamedFileCheckpoint {
            id: checkpoint_id.clone(),
            name,
            timestamp: Utc::now(),
            file_snapshots,
            change_index,
        };

        state.named_checkpoints.push(checkpoint);

        // Evict oldest checkpoints if over limit
        while state.named_checkpoints.len() > Self::MAX_NAMED_CHECKPOINTS {
            state.named_checkpoints.remove(0);
        }

        Ok(checkpoint_id)
    }

    /// List all named checkpoints in chronological order.
    pub async fn list_named_checkpoints(&self) -> Vec<NamedFileCheckpoint> {
        let state = self.state.read().await;
        state.named_checkpoints.clone()
    }

    /// Rewind files to a named checkpoint by restoring their snapshotted contents.
    ///
    /// Writes each file back to its checkpoint state, removes all checkpoints
    /// that were created after the target checkpoint, and returns the list of
    /// restored file paths.
    pub async fn rewind_to_checkpoint(&self, id: &str) -> Result<Vec<PathBuf>, String> {
        let mut state = self.state.write().await;

        let checkpoint_idx = state
            .named_checkpoints
            .iter()
            .position(|cp| cp.id == id)
            .ok_or_else(|| format!("Checkpoint not found: {}", id))?;

        let checkpoint = state.named_checkpoints[checkpoint_idx].clone();

        // Restore each file from the snapshot
        let mut restored_paths: Vec<PathBuf> = Vec::new();
        for (path, content) in &checkpoint.file_snapshots {
            tokio::fs::write(path, content)
                .await
                .map_err(|e| format!("Failed to restore '{}': {}", path.display(), e))?;
            restored_paths.push(path.clone());
        }

        // Remove all checkpoints created after the target (keep the rewound checkpoint)
        state.named_checkpoints.truncate(checkpoint_idx + 1);

        Ok(restored_paths)
    }
}

impl Default for ChangeTracker {
    fn default() -> Self {
        Self::new()
    }
}
