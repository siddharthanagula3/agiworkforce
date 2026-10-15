//! Type definitions for the scheduler module.

use serde::{Deserialize, Serialize};

/// One run of a scheduled job, as the scheduler's run store persists it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobExecutionRecord {
    /// Unique database ID for this execution record.
    pub id: i64,
    /// ID of the job that was executed.
    pub job_id: String,
    /// When the execution started (ISO 8601 format).
    pub started_at: String,
    /// When the execution completed (ISO 8601 format), if finished.
    pub completed_at: Option<String>,
    /// The status of this execution.
    pub status: ExecutionStatus,
    /// Error message if the execution failed.
    pub error: Option<String>,
    /// Duration of the execution in milliseconds.
    pub duration_ms: Option<i64>,
    /// What the run produced, when it finished without an error.
    #[serde(default)]
    pub output: Option<String>,
}

/// Status of a job execution.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    /// Execution is currently running.
    Running,
    /// Execution completed successfully.
    Completed,
    /// Execution failed with an error.
    Failed,
    /// Execution was cancelled before completion.
    Cancelled,
}
