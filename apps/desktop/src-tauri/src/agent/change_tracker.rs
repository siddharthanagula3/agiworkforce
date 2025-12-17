/// ChangeTracker - Tracks all changes made by the agent for revert capability
///
/// Similar to Cursor's change tracking, this system:
/// - Records all file modifications (with before/after diffs)
/// - Tracks terminal commands executed
/// - Stores git snapshots before major changes
/// - Provides revert functionality
///
/// NOTE: Refactored to use tokio::sync::RwLock for async compatibility and Send safety
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Type of change made
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
    DirectoryCreated,
    DirectoryDeleted,
}

/// A single change record
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

/// Git snapshot before major changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSnapshot {
    pub task_id: String,
    pub timestamp: DateTime<Utc>,
    pub commit_hash: Option<String>,
    pub branch: String,
    pub working_dir: PathBuf,
    pub changed_files: Vec<PathBuf>,
}

/// Internal state wrapped in RwLock
struct ChangeTrackerState {
    changes: Vec<Change>,
    snapshots: HashMap<String, GitSnapshot>, // task_id -> snapshot
}

/// Change tracker that maintains history of all agent actions
/// Now using tokio::sync::RwLock for async compatibility
pub struct ChangeTracker {
    state: RwLock<ChangeTrackerState>,
}

impl ChangeTracker {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(ChangeTrackerState {
                changes: Vec::new(),
                snapshots: HashMap::new(),
            }),
        }
    }

    /// Record a file creation
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

    /// Record a file modification
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

    /// Record a file deletion
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

    /// Record a command execution
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

    /// Create a git snapshot before major changes
    pub async fn create_snapshot(
        &self,
        task_id: String,
        working_dir: PathBuf,
    ) -> Result<GitSnapshot, String> {
        // Try to get current git status
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

    /// Get all changes for a task
    pub async fn get_task_changes(&self, task_id: &str) -> Vec<Change> {
        let state = self.state.read().await;
        state
            .changes
            .iter()
            .filter(|c| c.task_id == task_id && !c.reverted)
            .cloned()
            .collect()
    }

    /// Get all changes (for history view)
    pub async fn get_all_changes(&self) -> Vec<Change> {
        let state = self.state.read().await;
        state.changes.clone()
    }

    /// Get changes that can be reverted
    pub async fn get_revertible_changes(&self, task_id: Option<&str>) -> Vec<Change> {
        let state = self.state.read().await;
        state
            .changes
            .iter()
            .filter(|c| c.can_revert && !c.reverted && task_id.is_none_or(|tid| c.task_id == tid))
            .cloned()
            .collect()
    }

    /// Mark a change as reverted
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

    /// Get git branch name
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

    /// Get git HEAD commit hash
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

    /// Get list of changed files in git
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

    /// Get snapshot for a task
    pub async fn get_snapshot(&self, task_id: &str) -> Option<GitSnapshot> {
        let state = self.state.read().await;
        state.snapshots.get(task_id).cloned()
    }
}

impl Default for ChangeTracker {
    fn default() -> Self {
        Self::new()
    }
}

// Helper trait removed (unused)
