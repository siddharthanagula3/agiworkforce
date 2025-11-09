/// ChangeTracker - Tracks all changes made by the agent for revert capability
///
/// Similar to Cursor's change tracking, this system:
/// - Records all file modifications (with before/after diffs)
/// - Tracks terminal commands executed
/// - Stores git snapshots before major changes
/// - Provides revert functionality
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
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

/// Change tracker that maintains history of all agent actions
pub struct ChangeTracker {
    changes: Vec<Change>,
    snapshots: HashMap<String, GitSnapshot>, // task_id -> snapshot
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

impl ChangeTracker {
    pub fn new() -> Self {
        Self {
            changes: Vec::new(),
            snapshots: HashMap::new(),
        }
    }

    /// Record a file creation
    pub fn record_file_created(
        &mut self,
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
        self.changes.push(change);
        id
    }

    /// Record a file modification
    pub fn record_file_modified(
        &mut self,
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
        self.changes.push(change);
        id
    }

    /// Record a file deletion
    pub fn record_file_deleted(
        &mut self,
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
        self.changes.push(change);
        id
    }

    /// Record a command execution
    pub fn record_command(
        &mut self,
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
        self.changes.push(change);
        id
    }

    /// Create a git snapshot before major changes
    pub async fn create_snapshot(
        &mut self,
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

        self.snapshots.insert(task_id, snapshot.clone());
        Ok(snapshot)
    }

    /// Get all changes for a task
    pub fn get_task_changes(&self, task_id: &str) -> Vec<&Change> {
        self.changes
            .iter()
            .filter(|c| c.task_id == task_id && !c.reverted)
            .collect()
    }

    /// Get all changes (for history view)
    pub fn get_all_changes(&self) -> &[Change] {
        &self.changes
    }

    /// Get changes that can be reverted
    pub fn get_revertible_changes(&self, task_id: Option<&str>) -> Vec<&Change> {
        self.changes
            .iter()
            .filter(|c| c.can_revert && !c.reverted && task_id.map_or(true, |tid| c.task_id == tid))
            .collect()
    }

    /// Mark a change as reverted
    pub fn mark_reverted(&mut self, change_id: &str) -> Result<(), String> {
        let change = self
            .changes
            .iter_mut()
            .find(|c| c.id == change_id)
            .ok_or_else(|| format!("Change not found: {}", change_id))?;

        change.reverted = true;
        Ok(())
    }

    /// Get git branch name
    async fn get_git_branch(&self, working_dir: &PathBuf) -> Option<String> {
        use tokio::process::Command;

        let output = Command::new("git")
            .arg("rev-parse")
            .arg("--abbrev-ref")
            .arg("HEAD")
            .current_dir(working_dir)
            .output()
            .await
            .ok()?;

        if output.status.success() {
            String::from_utf8(output.stdout)
                .ok()
                .map(|s| s.trim().to_string())
        } else {
            None
        }
    }

    /// Get git HEAD commit hash
    async fn get_git_head(&self, working_dir: &PathBuf) -> Result<String, String> {
        use tokio::process::Command;

        let output = Command::new("git")
            .arg("rev-parse")
            .arg("HEAD")
            .current_dir(working_dir)
            .output()
            .await
            .map_err(|e| format!("Failed to execute git: {}", e))?;

        if output.status.success() {
            String::from_utf8(output.stdout)
                .map_err(|e| format!("Invalid UTF-8: {}", e))?
                .trim()
                .to_string()
                .pipe(Ok)
        } else {
            Err("Not a git repository or no commits".to_string())
        }
    }

    /// Get list of changed files in git
    async fn get_git_changed_files(&self, working_dir: &PathBuf) -> Result<Vec<PathBuf>, String> {
        use tokio::process::Command;

        let output = Command::new("git")
            .arg("diff")
            .arg("--name-only")
            .arg("HEAD")
            .current_dir(working_dir)
            .output()
            .await
            .map_err(|e| format!("Failed to execute git: {}", e))?;

        if output.status.success() {
            let files: Vec<PathBuf> = String::from_utf8(output.stdout)
                .map_err(|e| format!("Invalid UTF-8: {}", e))?
                .lines()
                .filter_map(|line| {
                    if line.is_empty() {
                        None
                    } else {
                        Some(working_dir.join(line))
                    }
                })
                .collect();
            Ok(files)
        } else {
            Ok(Vec::new()) // No changes or not a git repo
        }
    }

    /// Get snapshot for a task
    pub fn get_snapshot(&self, task_id: &str) -> Option<&GitSnapshot> {
        self.snapshots.get(task_id)
    }
}

impl Default for ChangeTracker {
    fn default() -> Self {
        Self::new()
    }
}

// Helper trait for pipe operator
trait Pipe: Sized {
    fn pipe<F, R>(self, f: F) -> R
    where
        F: FnOnce(Self) -> R,
    {
        f(self)
    }
}

impl<T> Pipe for T {}
