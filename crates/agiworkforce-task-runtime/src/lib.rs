use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use uuid::Uuid;

pub type TaskId = Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskKind {
    LocalShell,
    LocalAgent,
    RemoteAgent,
    InProcessTeammate,
    LocalWorkflow,
    MonitorMcp,
    Dream,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: TaskId,
    pub kind: TaskKind,
    pub status: TaskStatus,
    pub command: Option<String>,
    pub output_path: PathBuf,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

#[derive(thiserror::Error, Debug)]
pub enum TaskError {
    #[error("task {0} not found")]
    NotFound(TaskId),
    #[error("invalid status transition from {from:?} to {to:?}")]
    InvalidTransition { from: TaskStatus, to: TaskStatus },
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

fn valid_transition(from: TaskStatus, to: TaskStatus) -> bool {
    matches!(
        (from, to),
        (TaskStatus::Pending, TaskStatus::Running)
            | (TaskStatus::Pending, TaskStatus::Stopped)
            | (TaskStatus::Pending, TaskStatus::Failed)
            | (TaskStatus::Running, TaskStatus::Completed)
            | (TaskStatus::Running, TaskStatus::Failed)
            | (TaskStatus::Running, TaskStatus::Stopped)
    )
}

#[derive(Clone)]
pub struct TaskRegistry {
    inner: Arc<RwLock<HashMap<TaskId, Task>>>,
    base_dir: PathBuf,
}

impl TaskRegistry {
    pub fn new() -> Self {
        let base_dir = dirs_home().join(".agiworkforce").join("tasks");
        Self::new_with_base_dir(base_dir)
    }

    pub fn new_with_base_dir(base_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&base_dir);
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
            base_dir,
        }
    }

    pub async fn create(&self, kind: TaskKind, command: Option<String>) -> Result<TaskId> {
        let id = Uuid::new_v4();
        let output_path = self.base_dir.join(format!("{}.out", id));
        // Pre-create the output file
        std::fs::File::create(&output_path)?;
        let task = Task {
            id,
            kind,
            status: TaskStatus::Pending,
            command,
            output_path,
            started_at: None,
            ended_at: None,
            exit_code: None,
            error: None,
        };
        self.inner.write().await.insert(id, task);
        Ok(id)
    }

    pub async fn get(&self, id: &TaskId) -> Option<Task> {
        self.inner.read().await.get(id).cloned()
    }

    pub async fn list(&self) -> Vec<Task> {
        self.inner.read().await.values().cloned().collect()
    }

    pub async fn update_status(
        &self,
        id: &TaskId,
        status: TaskStatus,
        exit_code: Option<i32>,
        error: Option<String>,
    ) -> Result<(), TaskError> {
        let mut guard = self.inner.write().await;
        let task = guard.get_mut(id).ok_or(TaskError::NotFound(*id))?;
        if !valid_transition(task.status, status) {
            return Err(TaskError::InvalidTransition {
                from: task.status,
                to: status,
            });
        }
        if task.started_at.is_none() && status == TaskStatus::Running {
            task.started_at = Some(Utc::now());
        }
        if matches!(
            status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped
        ) {
            task.ended_at = Some(Utc::now());
        }
        task.status = status;
        task.exit_code = exit_code;
        task.error = error;
        Ok(())
    }

    pub async fn append_output(&self, id: &TaskId, chunk: &str) -> Result<(), TaskError> {
        let guard = self.inner.read().await;
        let task = guard.get(id).ok_or(TaskError::NotFound(*id))?;
        let path = task.output_path.clone();
        drop(guard);
        let mut file = std::fs::OpenOptions::new().append(true).open(&path)?;
        file.write_all(chunk.as_bytes())?;
        Ok(())
    }

    pub async fn read_output(&self, id: &TaskId, max_bytes: usize) -> Result<String, TaskError> {
        let guard = self.inner.read().await;
        let task = guard.get(id).ok_or(TaskError::NotFound(*id))?;
        let path = task.output_path.clone();
        drop(guard);

        let mut file = std::fs::File::open(&path)?;
        let meta = file.metadata()?;
        let file_len = meta.len() as usize;
        let skip = file_len.saturating_sub(max_bytes);
        if skip > 0 {
            use std::io::Seek;
            file.seek(std::io::SeekFrom::Start(skip as u64))?;
        }
        let mut buf = String::new();
        file.read_to_string(&mut buf)?;
        Ok(buf)
    }

    pub async fn stop(&self, id: &TaskId) -> Result<(), TaskError> {
        let mut guard = self.inner.write().await;
        let task = guard.get_mut(id).ok_or(TaskError::NotFound(*id))?;
        if matches!(task.status, TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped) {
            return Err(TaskError::InvalidTransition {
                from: task.status,
                to: TaskStatus::Stopped,
            });
        }
        task.status = TaskStatus::Stopped;
        task.ended_at = Some(Utc::now());
        Ok(())
    }

    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
    }
}

impl Default for TaskRegistry {
    fn default() -> Self {
        Self::new()
    }
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Watches a task's output file for growth. If no new bytes appear within
/// `timeout`, marks the task as Failed with error "stall timeout".
///
/// Returns a JoinHandle; drop it or abort it to cancel the watchdog.
pub struct StallWatchdog {
    handle: JoinHandle<()>,
}

impl StallWatchdog {
    pub fn spawn(registry: TaskRegistry, task_id: TaskId, timeout: Duration) -> Self {
        let poll_interval = Duration::from_millis(500).min(timeout / 4).max(Duration::from_millis(100));
        let handle = tokio::spawn(async move {
            let output_path = {
                match registry.get(&task_id).await {
                    Some(t) => t.output_path,
                    None => return,
                }
            };
            let mut last_size = std::fs::metadata(&output_path)
                .map(|m| m.len())
                .unwrap_or(0);
            let mut idle_since = tokio::time::Instant::now();

            loop {
                tokio::time::sleep(poll_interval).await;

                // Bail if task is terminal
                match registry.get(&task_id).await {
                    Some(t) if matches!(t.status, TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Stopped) => return,
                    None => return,
                    _ => {}
                }

                let current_size = std::fs::metadata(&output_path)
                    .map(|m| m.len())
                    .unwrap_or(last_size);

                if current_size > last_size {
                    last_size = current_size;
                    idle_since = tokio::time::Instant::now();
                } else if idle_since.elapsed() >= timeout {
                    let _ = registry
                        .update_status(
                            &task_id,
                            TaskStatus::Failed,
                            None,
                            Some("stall timeout".to_string()),
                        )
                        .await;
                    return;
                }
            }
        });
        Self { handle }
    }

    pub fn abort(&self) {
        self.handle.abort();
    }
}

impl Drop for StallWatchdog {
    fn drop(&mut self) {
        self.handle.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_registry() -> (TaskRegistry, TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let reg = TaskRegistry::new_with_base_dir(dir.path().to_path_buf());
        (reg, dir)
    }

    #[tokio::test]
    async fn test_create_and_get() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, Some("echo hi".into())).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Pending);
        assert_eq!(task.kind, TaskKind::LocalShell);
        assert_eq!(task.command.as_deref(), Some("echo hi"));
    }

    #[tokio::test]
    async fn test_get_unknown_returns_none() {
        let (reg, _dir) = make_registry();
        assert!(reg.get(&Uuid::new_v4()).await.is_none());
    }

    #[tokio::test]
    async fn test_update_status_pending_to_running() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalAgent, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Running);
        assert!(task.started_at.is_some());
    }

    #[tokio::test]
    async fn test_update_status_running_to_completed() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Completed, Some(0), None).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Completed);
        assert_eq!(task.exit_code, Some(0));
        assert!(task.ended_at.is_some());
    }

    #[tokio::test]
    async fn test_update_status_running_to_failed() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::RemoteAgent, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Failed, Some(1), Some("process died".into())).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Failed);
        assert_eq!(task.error.as_deref(), Some("process died"));
    }

    #[tokio::test]
    async fn test_invalid_transition_completed_to_running() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Completed, Some(0), None).await.unwrap();
        let result = reg.update_status(&id, TaskStatus::Running, None, None).await;
        assert!(matches!(result, Err(TaskError::InvalidTransition { .. })));
    }

    #[tokio::test]
    async fn test_invalid_transition_failed_to_running() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Failed, None, None).await.unwrap();
        let result = reg.update_status(&id, TaskStatus::Running, None, None).await;
        assert!(matches!(result, Err(TaskError::InvalidTransition { .. })));
    }

    #[tokio::test]
    async fn test_append_and_read_output() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.append_output(&id, "hello ").await.unwrap();
        reg.append_output(&id, "world\n").await.unwrap();
        let out = reg.read_output(&id, 4096).await.unwrap();
        assert_eq!(out, "hello world\n");
    }

    #[tokio::test]
    async fn test_read_output_max_bytes() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.append_output(&id, "abcdefghij").await.unwrap();
        let out = reg.read_output(&id, 4).await.unwrap();
        assert_eq!(out, "ghij");
    }

    #[tokio::test]
    async fn test_append_output_unknown_task() {
        let (reg, _dir) = make_registry();
        let result = reg.append_output(&Uuid::new_v4(), "data").await;
        assert!(matches!(result, Err(TaskError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_read_output_unknown_task() {
        let (reg, _dir) = make_registry();
        let result = reg.read_output(&Uuid::new_v4(), 100).await;
        assert!(matches!(result, Err(TaskError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_stop_pending_task() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.stop(&id).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Stopped);
        assert!(task.ended_at.is_some());
    }

    #[tokio::test]
    async fn test_stop_running_task() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        reg.stop(&id).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Stopped);
    }

    #[tokio::test]
    async fn test_stop_already_stopped() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.stop(&id).await.unwrap();
        let result = reg.stop(&id).await;
        assert!(matches!(result, Err(TaskError::InvalidTransition { .. })));
    }

    #[tokio::test]
    async fn test_stop_completed_task_fails() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Running, None, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Completed, Some(0), None).await.unwrap();
        let result = reg.stop(&id).await;
        assert!(matches!(result, Err(TaskError::InvalidTransition { .. })));
    }

    #[tokio::test]
    async fn test_stop_unknown_task() {
        let (reg, _dir) = make_registry();
        let result = reg.stop(&Uuid::new_v4()).await;
        assert!(matches!(result, Err(TaskError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_list_returns_all_tasks() {
        let (reg, _dir) = make_registry();
        let id1 = reg.create(TaskKind::LocalShell, None).await.unwrap();
        let id2 = reg.create(TaskKind::LocalAgent, None).await.unwrap();
        let id3 = reg.create(TaskKind::Dream, None).await.unwrap();
        let list = reg.list().await;
        assert_eq!(list.len(), 3);
        let ids: Vec<_> = list.iter().map(|t| t.id).collect();
        assert!(ids.contains(&id1));
        assert!(ids.contains(&id2));
        assert!(ids.contains(&id3));
    }

    #[tokio::test]
    async fn test_all_task_kinds() {
        let (reg, _dir) = make_registry();
        for kind in [
            TaskKind::LocalShell,
            TaskKind::LocalAgent,
            TaskKind::RemoteAgent,
            TaskKind::InProcessTeammate,
            TaskKind::LocalWorkflow,
            TaskKind::MonitorMcp,
            TaskKind::Dream,
        ] {
            let id = reg.create(kind, None).await.unwrap();
            let task = reg.get(&id).await.unwrap();
            assert_eq!(task.kind, kind);
        }
    }

    #[tokio::test]
    async fn test_update_status_unknown_task() {
        let (reg, _dir) = make_registry();
        let result = reg
            .update_status(&Uuid::new_v4(), TaskStatus::Running, None, None)
            .await;
        assert!(matches!(result, Err(TaskError::NotFound(_))));
    }

    #[tokio::test]
    async fn test_output_file_created_on_create() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        let task = reg.get(&id).await.unwrap();
        assert!(task.output_path.exists());
    }

    #[tokio::test]
    async fn test_pending_to_failed_direct() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Failed, None, Some("startup failed".into()))
            .await
            .unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Failed);
    }

    #[tokio::test]
    async fn test_pending_to_stopped_direct() {
        let (reg, _dir) = make_registry();
        let id = reg.create(TaskKind::LocalShell, None).await.unwrap();
        reg.update_status(&id, TaskStatus::Stopped, None, None)
            .await
            .unwrap();
        let task = reg.get(&id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Stopped);
    }
}
