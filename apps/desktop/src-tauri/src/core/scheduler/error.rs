//! Error types for the proactive scheduler module.

use thiserror::Error;

/// Errors that can occur during scheduler operations.
#[derive(Error, Debug)]
pub enum SchedulerError {
    /// The specified job was not found in the scheduler.
    #[error("Job not found: {0}")]
    JobNotFound(String),

    /// Invalid cron expression provided.
    #[error("Invalid cron expression: {0}")]
    InvalidCronExpression(String),

    /// The scheduler is not currently running.
    #[error("Scheduler is not running")]
    NotRunning,

    /// The scheduler is already running.
    #[error("Scheduler is already running")]
    AlreadyRunning,

    /// Failed to add a job to the scheduler.
    #[error("Failed to add job: {0}")]
    AddJobFailed(String),

    /// Failed to remove a job from the scheduler.
    #[error("Failed to remove job: {0}")]
    RemoveJobFailed(String),

    /// Job action execution failed.
    #[error("Job execution failed: {0}")]
    ExecutionFailed(String),

    /// Internal scheduler error from tokio-cron-scheduler.
    #[error("Internal scheduler error: {0}")]
    InternalError(String),

    /// Scheduler has been shut down.
    #[error("Scheduler has been shut down")]
    ShutDown,

    /// Lock acquisition failed.
    #[error("Failed to acquire lock: {0}")]
    LockError(String),
}

/// Result type alias for scheduler operations.
pub type SchedulerResult<T> = Result<T, SchedulerError>;

impl From<tokio_cron_scheduler::JobSchedulerError> for SchedulerError {
    fn from(err: tokio_cron_scheduler::JobSchedulerError) -> Self {
        SchedulerError::InternalError(err.to_string())
    }
}
