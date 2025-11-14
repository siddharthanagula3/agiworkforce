use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

/// Task priority levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Priority {
    Low = 0,
    Normal = 1,
    High = 2,
}

impl fmt::Display for Priority {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Priority::Low => write!(f, "Low"),
            Priority::Normal => write!(f, "Normal"),
            Priority::High => write!(f, "High"),
        }
    }
}

impl From<i32> for Priority {
    fn from(value: i32) -> Self {
        match value {
            0 => Priority::Low,
            1 => Priority::Normal,
            2 => Priority::High,
            _ => Priority::Normal,
        }
    }
}

impl From<Priority> for i32 {
    fn from(priority: Priority) -> Self {
        priority as i32
    }
}

/// Task execution status
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TaskStatus::Queued => write!(f, "Queued"),
            TaskStatus::Running => write!(f, "Running"),
            TaskStatus::Paused => write!(f, "Paused"),
            TaskStatus::Completed => write!(f, "Completed"),
            TaskStatus::Failed => write!(f, "Failed"),
            TaskStatus::Cancelled => write!(f, "Cancelled"),
        }
    }
}

impl From<String> for TaskStatus {
    fn from(s: String) -> Self {
        match s.as_str() {
            "Queued" => TaskStatus::Queued,
            "Running" => TaskStatus::Running,
            "Paused" => TaskStatus::Paused,
            "Completed" => TaskStatus::Completed,
            "Failed" => TaskStatus::Failed,
            "Cancelled" => TaskStatus::Cancelled,
            _ => TaskStatus::Queued,
        }
    }
}

/// Task result after completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
}

impl TaskResult {
    pub fn success(output: String) -> Self {
        Self {
            success: true,
            output: Some(output),
            error: None,
        }
    }

    pub fn failure(error: String) -> Self {
        Self {
            success: false,
            output: None,
            error: Some(error),
        }
    }
}

/// Task metadata and state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub priority: Priority,
    pub status: TaskStatus,
    pub progress: u8, // 0-100
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<TaskResult>,
    pub payload: Option<String>, // JSON payload for task data
}

impl Task {
    pub fn new(name: String, description: Option<String>, priority: Priority) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            priority,
            status: TaskStatus::Queued,
            progress: 0,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            result: None,
            payload: None,
        }
    }

    pub fn with_payload(mut self, payload: String) -> Self {
        self.payload = Some(payload);
        self
    }

    pub fn start(&mut self) {
        self.status = TaskStatus::Running;
        self.started_at = Some(Utc::now());
    }

    pub fn update_progress(&mut self, progress: u8) {
        self.progress = progress.min(100);
    }

    pub fn pause(&mut self) {
        if self.status == TaskStatus::Running {
            self.status = TaskStatus::Paused;
        }
    }

    pub fn resume(&mut self) {
        if self.status == TaskStatus::Paused {
            self.status = TaskStatus::Running;
        }
    }

    pub fn complete(&mut self, result: TaskResult) {
        self.status = TaskStatus::Completed;
        self.progress = 100;
        self.completed_at = Some(Utc::now());
        self.result = Some(result);
    }

    pub fn fail(&mut self, error: String) {
        self.status = TaskStatus::Failed;
        self.completed_at = Some(Utc::now());
        self.result = Some(TaskResult::failure(error));
    }

    pub fn cancel(&mut self) {
        self.status = TaskStatus::Cancelled;
        self.completed_at = Some(Utc::now());
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled
        )
    }

    pub fn is_running(&self) -> bool {
        self.status == TaskStatus::Running
    }

    pub fn is_paused(&self) -> bool {
        self.status == TaskStatus::Paused
    }
}

/// Filter for listing tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFilter {
    pub status: Option<TaskStatus>,
    pub priority: Option<Priority>,
    pub limit: Option<usize>,
}

impl Default for TaskFilter {
    fn default() -> Self {
        Self {
            status: None,
            priority: None,
            limit: Some(100),
        }
    }
}

/// Progress update context for task executors
pub struct ProgressContext {
    task_id: String,
    tx: tokio::sync::mpsc::UnboundedSender<ProgressUpdate>,
}

impl ProgressContext {
    pub fn new(task_id: String, tx: tokio::sync::mpsc::UnboundedSender<ProgressUpdate>) -> Self {
        Self { task_id, tx }
    }

    pub async fn update_progress(&self, progress: u8) -> anyhow::Result<()> {
        self.tx
            .send(ProgressUpdate {
                task_id: self.task_id.clone(),
                progress,
            })
            .map_err(|e| anyhow::anyhow!("Failed to send progress update: {}", e))?;
        Ok(())
    }
}

/// Progress update message
#[derive(Debug, Clone)]
pub struct ProgressUpdate {
    pub task_id: String,
    pub progress: u8,
}

/// Task execution context with cancellation support
pub struct TaskContext {
    pub task_id: String,
    pub payload: Option<String>,
    pub progress_tx: tokio::sync::mpsc::UnboundedSender<ProgressUpdate>,
    pub cancel_token: tokio_util::sync::CancellationToken,
}

impl TaskContext {
    pub fn new(
        task_id: String,
        payload: Option<String>,
        progress_tx: tokio::sync::mpsc::UnboundedSender<ProgressUpdate>,
        cancel_token: tokio_util::sync::CancellationToken,
    ) -> Self {
        Self {
            task_id,
            payload,
            progress_tx,
            cancel_token,
        }
    }

    pub async fn update_progress(&self, progress: u8) -> anyhow::Result<()> {
        self.progress_tx
            .send(ProgressUpdate {
                task_id: self.task_id.clone(),
                progress,
            })
            .map_err(|e| anyhow::anyhow!("Failed to send progress update: {}", e))?;
        Ok(())
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel_token.is_cancelled()
    }

    pub async fn check_cancellation(&self) -> anyhow::Result<()> {
        if self.is_cancelled() {
            return Err(anyhow::anyhow!("Task cancelled"));
        }
        Ok(())
    }
}
