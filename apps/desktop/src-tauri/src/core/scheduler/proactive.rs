//! Proactive Scheduler implementation using tokio-cron-scheduler.
//!
//! This module provides a scheduler that can execute jobs based on cron expressions
//! or fixed intervals, supporting pause/resume, job management, and execution tracking.

use super::error::{SchedulerError, SchedulerResult};
use super::types::{
    ExecutionStatus, JobAction, JobExecution, JobExecutionRecord, JobSchedule, JobState,
    JobSummary, ScheduledJob,
};
use crate::data::db::Database;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Internal representation of a job managed by the scheduler.
struct ManagedJob {
    /// The scheduled job configuration.
    config: ScheduledJob,
    /// The UUID assigned by tokio-cron-scheduler.
    scheduler_uuid: Option<uuid::Uuid>,
    /// Current execution state.
    state: JobState,
}

/// A proactive scheduler that executes jobs based on schedules.
///
/// The scheduler supports:
/// - Cron-based scheduling with standard cron expressions
/// - Interval-based scheduling (seconds, minutes, hours, days)
/// - One-shot scheduling for single executions
/// - Pause/resume individual jobs
/// - Job execution tracking and history
///
/// # Example
///
/// ```ignore
/// use scheduler::{ProactiveScheduler, ScheduledJob, JobSchedule, JobAction, JobInterval};
///
/// let scheduler = ProactiveScheduler::new().await?;
///
/// // Add a job that runs every 5 minutes
/// let job = ScheduledJob::builder("cleanup", "Cleanup temporary files")
///     .interval(JobInterval::minutes(5))
///     .action(JobAction::RunCommand {
///         command: "rm".into(),
///         args: vec!["-rf".into(), "/tmp/app-cache/*".into()],
///         working_dir: None,
///     })
///     .build();
///
/// scheduler.add_job(job).await?;
/// scheduler.start().await?;
/// ```
pub struct ProactiveScheduler {
    /// The underlying tokio-cron-scheduler instance.
    inner: Arc<RwLock<Option<JobScheduler>>>,
    /// Map of job IDs to their managed state.
    jobs: Arc<RwLock<HashMap<String, ManagedJob>>>,
    /// Whether the scheduler is currently running.
    running: Arc<RwLock<bool>>,
    /// Execution history (limited to recent executions).
    history: Arc<RwLock<Vec<JobExecution>>>,
    /// Maximum number of history entries to keep.
    max_history_entries: usize,
    /// Callback for handling job actions.
    action_handler: Arc<RwLock<Option<ActionHandler>>>,
    /// Optional database connection for persistent execution logging.
    database: Option<Arc<Database>>,
}

/// Type alias for the action handler callback.
pub type ActionHandler = Box<dyn Fn(String, JobAction) + Send + Sync + 'static>;

impl ProactiveScheduler {
    /// Creates a new ProactiveScheduler instance.
    ///
    /// This initializes the underlying scheduler but does not start it.
    /// Call `start()` to begin processing scheduled jobs.
    pub async fn new() -> SchedulerResult<Self> {
        let scheduler = JobScheduler::new().await.map_err(|e| {
            SchedulerError::InternalError(format!("Failed to create scheduler: {}", e))
        })?;

        Ok(Self {
            inner: Arc::new(RwLock::new(Some(scheduler))),
            jobs: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(RwLock::new(false)),
            history: Arc::new(RwLock::new(Vec::new())),
            max_history_entries: 1000,
            action_handler: Arc::new(RwLock::new(None)),
            database: None,
        })
    }

    /// Creates a new ProactiveScheduler with a database connection for persistent logging.
    ///
    /// This enables execution logging to be persisted to the database.
    pub async fn with_database(database: Arc<Database>) -> SchedulerResult<Self> {
        let scheduler = JobScheduler::new().await.map_err(|e| {
            SchedulerError::InternalError(format!("Failed to create scheduler: {}", e))
        })?;

        Ok(Self {
            inner: Arc::new(RwLock::new(Some(scheduler))),
            jobs: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(RwLock::new(false)),
            history: Arc::new(RwLock::new(Vec::new())),
            max_history_entries: 1000,
            action_handler: Arc::new(RwLock::new(None)),
            database: Some(database),
        })
    }

    /// Sets the database connection for persistent execution logging.
    pub fn set_database(&mut self, database: Arc<Database>) {
        self.database = Some(database);
    }

    /// Sets a custom action handler for processing job actions.
    ///
    /// The handler receives the job ID and the action to execute.
    pub async fn set_action_handler<F>(&self, handler: F)
    where
        F: Fn(String, JobAction) + Send + Sync + 'static,
    {
        let mut action_handler = self.action_handler.write().await;
        *action_handler = Some(Box::new(handler));
    }

    /// Adds a new scheduled job to the scheduler.
    ///
    /// If the scheduler is already running, the job will be scheduled immediately.
    /// If not, it will be scheduled when `start()` is called.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - A job with the same ID already exists
    /// - The cron expression is invalid
    /// - The scheduler has been shut down
    pub async fn add_job(&self, job: ScheduledJob) -> SchedulerResult<()> {
        let mut jobs = self.jobs.write().await;

        if jobs.contains_key(&job.id) {
            return Err(SchedulerError::AddJobFailed(format!(
                "Job with ID '{}' already exists",
                job.id
            )));
        }

        let job_id = job.id.clone();
        let mut managed_job = ManagedJob {
            config: job,
            scheduler_uuid: None,
            state: JobState::Scheduled,
        };

        // If the scheduler is running, add the job immediately
        let is_running = *self.running.read().await;
        if is_running && managed_job.config.enabled {
            let uuid = self.schedule_job_internal(&managed_job.config).await?;
            managed_job.scheduler_uuid = Some(uuid);
        }

        jobs.insert(job_id.clone(), managed_job);
        info!("Added job: {}", job_id);
        Ok(())
    }

    /// Removes a job from the scheduler.
    ///
    /// # Errors
    ///
    /// Returns an error if the job is not found.
    pub async fn remove_job(&self, job_id: &str) -> SchedulerResult<()> {
        let mut jobs = self.jobs.write().await;

        let managed_job = jobs
            .remove(job_id)
            .ok_or_else(|| SchedulerError::JobNotFound(job_id.to_string()))?;

        // Remove from the underlying scheduler if it was scheduled
        if let Some(uuid) = managed_job.scheduler_uuid {
            if let Some(scheduler) = self.inner.write().await.as_ref() {
                scheduler.remove(&uuid).await.map_err(|e| {
                    SchedulerError::RemoveJobFailed(format!(
                        "Failed to remove from scheduler: {}",
                        e
                    ))
                })?;
            }
        }

        info!("Removed job: {}", job_id);
        Ok(())
    }

    /// Pauses a job, preventing it from executing until resumed.
    ///
    /// The job remains in the scheduler but will not trigger.
    ///
    /// # Errors
    ///
    /// Returns an error if the job is not found.
    pub async fn pause_job(&self, job_id: &str) -> SchedulerResult<()> {
        let mut jobs = self.jobs.write().await;

        let managed_job = jobs
            .get_mut(job_id)
            .ok_or_else(|| SchedulerError::JobNotFound(job_id.to_string()))?;

        if managed_job.state == JobState::Paused {
            debug!("Job {} is already paused", job_id);
            return Ok(());
        }

        // Remove from the underlying scheduler
        if let Some(uuid) = managed_job.scheduler_uuid.take() {
            if let Some(scheduler) = self.inner.write().await.as_ref() {
                // Ignore errors here since the job might not exist in the scheduler
                let _ = scheduler.remove(&uuid).await;
            }
        }

        managed_job.config.enabled = false;
        managed_job.state = JobState::Paused;
        managed_job.config.updated_at = Utc::now();

        info!("Paused job: {}", job_id);
        Ok(())
    }

    /// Resumes a paused job.
    ///
    /// The job will be rescheduled and will execute at its next scheduled time.
    ///
    /// # Errors
    ///
    /// Returns an error if the job is not found or scheduling fails.
    pub async fn resume_job(&self, job_id: &str) -> SchedulerResult<()> {
        let mut jobs = self.jobs.write().await;

        let managed_job = jobs
            .get_mut(job_id)
            .ok_or_else(|| SchedulerError::JobNotFound(job_id.to_string()))?;

        if managed_job.state != JobState::Paused && managed_job.config.enabled {
            debug!("Job {} is not paused", job_id);
            return Ok(());
        }

        managed_job.config.enabled = true;
        managed_job.config.updated_at = Utc::now();

        // Re-schedule the job if the scheduler is running
        let is_running = *self.running.read().await;
        if is_running {
            let uuid = self.schedule_job_internal(&managed_job.config).await?;
            managed_job.scheduler_uuid = Some(uuid);
            managed_job.state = JobState::Scheduled;
        }

        info!("Resumed job: {}", job_id);
        Ok(())
    }

    /// Returns a list of all jobs in the scheduler.
    pub async fn list_jobs(&self) -> Vec<JobSummary> {
        let jobs = self.jobs.read().await;
        jobs.values()
            .map(|managed_job| {
                let mut summary = JobSummary::from(&managed_job.config);
                summary.state = managed_job.state;
                summary
            })
            .collect()
    }

    /// Returns a specific job by ID.
    ///
    /// # Errors
    ///
    /// Returns an error if the job is not found.
    pub async fn get_job(&self, job_id: &str) -> SchedulerResult<ScheduledJob> {
        let jobs = self.jobs.read().await;
        jobs.get(job_id)
            .map(|m| m.config.clone())
            .ok_or_else(|| SchedulerError::JobNotFound(job_id.to_string()))
    }

    /// Updates an existing job's configuration.
    ///
    /// This will reschedule the job if it's currently active.
    ///
    /// # Errors
    ///
    /// Returns an error if the job is not found or rescheduling fails.
    pub async fn update_job(&self, job: ScheduledJob) -> SchedulerResult<()> {
        let mut jobs = self.jobs.write().await;

        let managed_job = jobs
            .get_mut(&job.id)
            .ok_or_else(|| SchedulerError::JobNotFound(job.id.clone()))?;

        // Remove the old schedule if it exists
        if let Some(uuid) = managed_job.scheduler_uuid.take() {
            if let Some(scheduler) = self.inner.write().await.as_ref() {
                let _ = scheduler.remove(&uuid).await;
            }
        }

        let was_enabled = managed_job.config.enabled;
        managed_job.config = job;
        managed_job.config.updated_at = Utc::now();

        // Re-schedule if the scheduler is running and the job is enabled
        let is_running = *self.running.read().await;
        if is_running && managed_job.config.enabled {
            let uuid = self.schedule_job_internal(&managed_job.config).await?;
            managed_job.scheduler_uuid = Some(uuid);
            managed_job.state = JobState::Scheduled;
        } else if !managed_job.config.enabled {
            managed_job.state = JobState::Paused;
        }

        let job_id = managed_job.config.id.clone();
        drop(jobs); // Release lock before logging
        info!(
            "Updated job: {} (was_enabled: {}, now_enabled: {})",
            job_id, was_enabled, is_running
        );
        Ok(())
    }

    /// Starts the scheduler, beginning job execution.
    ///
    /// Jobs that are enabled will be scheduled and will execute at their
    /// configured times.
    ///
    /// # Errors
    ///
    /// Returns an error if the scheduler is already running or has been shut down.
    pub async fn start(&self) -> SchedulerResult<()> {
        {
            let mut running = self.running.write().await;
            if *running {
                return Err(SchedulerError::AlreadyRunning);
            }
            *running = true;
        }

        // Schedule all enabled jobs
        let mut jobs = self.jobs.write().await;
        for managed_job in jobs.values_mut() {
            if managed_job.config.enabled && managed_job.scheduler_uuid.is_none() {
                match self.schedule_job_internal(&managed_job.config).await {
                    Ok(uuid) => {
                        managed_job.scheduler_uuid = Some(uuid);
                        managed_job.state = JobState::Scheduled;
                    }
                    Err(e) => {
                        error!("Failed to schedule job '{}': {}", managed_job.config.id, e);
                        managed_job.state = JobState::Failed;
                    }
                }
            }
        }
        drop(jobs);

        // Start the underlying scheduler
        if let Some(scheduler) = self.inner.write().await.as_ref() {
            scheduler.start().await.map_err(|e| {
                SchedulerError::InternalError(format!("Failed to start scheduler: {}", e))
            })?;
        } else {
            return Err(SchedulerError::ShutDown);
        }

        info!("ProactiveScheduler started");
        Ok(())
    }

    /// Stops the scheduler, halting all job execution.
    ///
    /// Jobs remain in the scheduler and can be resumed with `start()`.
    ///
    /// # Errors
    ///
    /// Returns an error if the scheduler is not running.
    pub async fn stop(&self) -> SchedulerResult<()> {
        {
            let mut running = self.running.write().await;
            if !*running {
                return Err(SchedulerError::NotRunning);
            }
            *running = false;
        }

        // Shutdown the underlying scheduler
        if let Some(mut scheduler) = self.inner.write().await.take() {
            scheduler.shutdown().await.map_err(|e| {
                SchedulerError::InternalError(format!("Failed to shutdown scheduler: {}", e))
            })?;
        }

        // Clear scheduler UUIDs from jobs (they're invalid now)
        let mut jobs = self.jobs.write().await;
        for managed_job in jobs.values_mut() {
            managed_job.scheduler_uuid = None;
            if managed_job.state == JobState::Scheduled {
                managed_job.state = JobState::Paused;
            }
        }

        // Create a new scheduler for potential restart
        let new_scheduler = JobScheduler::new().await.map_err(|e| {
            SchedulerError::InternalError(format!("Failed to recreate scheduler: {}", e))
        })?;
        *self.inner.write().await = Some(new_scheduler);

        info!("ProactiveScheduler stopped");
        Ok(())
    }

    /// Returns whether the scheduler is currently running.
    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    /// Returns recent job execution history.
    pub async fn get_history(&self, limit: Option<usize>) -> Vec<JobExecution> {
        let history = self.history.read().await;
        let limit = limit.unwrap_or(100).min(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }

    /// Returns execution history for a specific job.
    pub async fn get_job_history(&self, job_id: &str, limit: Option<usize>) -> Vec<JobExecution> {
        let history = self.history.read().await;
        let limit = limit.unwrap_or(100);
        history
            .iter()
            .filter(|exec| exec.job_id == job_id)
            .rev()
            .take(limit)
            .cloned()
            .collect()
    }

    /// Triggers a job immediately, regardless of its schedule.
    ///
    /// This does not affect the job's normal schedule.
    ///
    /// # Errors
    ///
    /// Returns an error if the job is not found.
    pub async fn trigger_now(&self, job_id: &str) -> SchedulerResult<String> {
        let jobs = self.jobs.read().await;
        let managed_job = jobs
            .get(job_id)
            .ok_or_else(|| SchedulerError::JobNotFound(job_id.to_string()))?;

        let job_config = managed_job.config.clone();
        drop(jobs);

        let execution_id = Uuid::new_v4().to_string();
        self.execute_job_action(
            job_id.to_string(),
            execution_id.clone(),
            job_config.action.clone(),
        )
        .await;

        Ok(execution_id)
    }

    /// Internal method to schedule a job with tokio-cron-scheduler.
    async fn schedule_job_internal(
        &self,
        job_config: &ScheduledJob,
    ) -> SchedulerResult<uuid::Uuid> {
        let job_id = job_config.id.clone();
        let action = job_config.action.clone();
        let history = Arc::clone(&self.history);
        let jobs = Arc::clone(&self.jobs);
        let action_handler = Arc::clone(&self.action_handler);
        let max_history = self.max_history_entries;

        let cron_job = match &job_config.schedule {
            JobSchedule::Cron(cron_expr) => {
                let job_id_clone = job_id.clone();
                let action_clone = action.clone();

                Job::new_async(cron_expr.as_str(), move |_uuid, _lock| {
                    let job_id = job_id_clone.clone();
                    let action = action_clone.clone();
                    let history = Arc::clone(&history);
                    let jobs = Arc::clone(&jobs);
                    let action_handler = Arc::clone(&action_handler);

                    Box::pin(async move {
                        Self::execute_job_action_static(
                            job_id,
                            action,
                            history,
                            jobs,
                            action_handler,
                            max_history,
                        )
                        .await;
                    })
                })
                .map_err(|e| {
                    SchedulerError::InvalidCronExpression(format!("Invalid cron expression: {}", e))
                })?
            }
            JobSchedule::Interval(interval) => {
                let job_id_clone = job_id.clone();
                let action_clone = action.clone();
                let seconds = interval.seconds;

                Job::new_repeated_async(
                    std::time::Duration::from_secs(seconds),
                    move |_uuid, _lock| {
                        let job_id = job_id_clone.clone();
                        let action = action_clone.clone();
                        let history = Arc::clone(&history);
                        let jobs = Arc::clone(&jobs);
                        let action_handler = Arc::clone(&action_handler);

                        Box::pin(async move {
                            Self::execute_job_action_static(
                                job_id,
                                action,
                                history,
                                jobs,
                                action_handler,
                                max_history,
                            )
                            .await;
                        })
                    },
                )
                .map_err(|e| {
                    SchedulerError::AddJobFailed(format!("Failed to create interval job: {}", e))
                })?
            }
            JobSchedule::OneShot(datetime) => {
                let job_id_clone = job_id.clone();
                let action_clone = action.clone();
                let timestamp = datetime.timestamp() as u64;

                Job::new_one_shot_at_instant_async(
                    std::time::Instant::now()
                        + std::time::Duration::from_secs(
                            timestamp.saturating_sub(Utc::now().timestamp() as u64),
                        ),
                    move |_uuid, _lock| {
                        let job_id = job_id_clone.clone();
                        let action = action_clone.clone();
                        let history = Arc::clone(&history);
                        let jobs = Arc::clone(&jobs);
                        let action_handler = Arc::clone(&action_handler);

                        Box::pin(async move {
                            Self::execute_job_action_static(
                                job_id,
                                action,
                                history,
                                jobs,
                                action_handler,
                                max_history,
                            )
                            .await;
                        })
                    },
                )
                .map_err(|e| {
                    SchedulerError::AddJobFailed(format!("Failed to create one-shot job: {}", e))
                })?
            }
        };

        let uuid = cron_job.guid();

        if let Some(scheduler) = self.inner.write().await.as_ref() {
            scheduler.add(cron_job).await.map_err(|e| {
                SchedulerError::AddJobFailed(format!("Failed to add job to scheduler: {}", e))
            })?;
        } else {
            return Err(SchedulerError::ShutDown);
        }

        debug!("Scheduled job '{}' with UUID {}", job_id, uuid);
        Ok(uuid)
    }

    /// Static version of execute_job_action for use in closures.
    async fn execute_job_action_static(
        job_id: String,
        action: JobAction,
        history: Arc<RwLock<Vec<JobExecution>>>,
        jobs: Arc<RwLock<HashMap<String, ManagedJob>>>,
        action_handler: Arc<RwLock<Option<ActionHandler>>>,
        max_history: usize,
    ) {
        let execution_id = Uuid::new_v4().to_string();
        let started_at = Utc::now();

        info!("Executing job '{}' (execution: {})", job_id, execution_id);

        // Update job state
        {
            let mut jobs_guard = jobs.write().await;
            if let Some(managed_job) = jobs_guard.get_mut(&job_id) {
                managed_job.state = JobState::Running;
            }
        }

        // Execute the action
        let (state, error) = match &action {
            JobAction::Callback(callback_action) => {
                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    (callback_action.callback)();
                })) {
                    Ok(()) => (JobState::Completed, None),
                    Err(e) => (
                        JobState::Failed,
                        Some(format!("Callback panicked: {:?}", e)),
                    ),
                }
            }
            _ => {
                // Use the action handler if available
                if let Some(handler) = action_handler.read().await.as_ref() {
                    handler(job_id.clone(), action.clone());
                    (JobState::Completed, None)
                } else {
                    warn!(
                        "No action handler set for job '{}', action not executed",
                        job_id
                    );
                    (JobState::Completed, None)
                }
            }
        };

        let completed_at = Utc::now();
        let duration_ms = (completed_at - started_at).num_milliseconds() as u64;

        // Update job state and last_run
        {
            let mut jobs_guard = jobs.write().await;
            if let Some(managed_job) = jobs_guard.get_mut(&job_id) {
                managed_job.config.last_run = Some(completed_at);
                managed_job.config.updated_at = completed_at;
                managed_job.state = if state == JobState::Failed {
                    managed_job.config.retry_count += 1;
                    if managed_job.config.retry_count >= managed_job.config.max_retries {
                        JobState::Failed
                    } else {
                        JobState::Scheduled
                    }
                } else {
                    managed_job.config.retry_count = 0;
                    JobState::Scheduled
                };
            }
        }

        // Record execution in history
        let execution = JobExecution {
            execution_id: execution_id.clone(),
            job_id: job_id.clone(),
            started_at,
            completed_at: Some(completed_at),
            state,
            error: error.clone(),
            duration_ms: Some(duration_ms),
        };

        {
            let mut history_guard = history.write().await;
            history_guard.push(execution);
            // Trim history if needed
            if history_guard.len() > max_history {
                let drain_count = history_guard.len() - max_history;
                history_guard.drain(0..drain_count);
            }
        }

        if let Some(err) = error {
            error!(
                "Job '{}' (execution: {}) failed: {}",
                job_id, execution_id, err
            );
        } else {
            info!(
                "Job '{}' (execution: {}) completed in {}ms",
                job_id, execution_id, duration_ms
            );
        }
    }

    /// Execute a job action immediately (for trigger_now).
    async fn execute_job_action(&self, job_id: String, _execution_id: String, action: JobAction) {
        let history = Arc::clone(&self.history);
        let jobs = Arc::clone(&self.jobs);
        let action_handler = Arc::clone(&self.action_handler);
        let max_history = self.max_history_entries;

        tokio::spawn(async move {
            Self::execute_job_action_static(
                job_id,
                action,
                history,
                jobs,
                action_handler,
                max_history,
            )
            .await;
        });
    }

    /// Calculates the next run time for a job based on its schedule.
    pub fn calculate_next_run(schedule: &JobSchedule) -> Option<DateTime<Utc>> {
        match schedule {
            JobSchedule::Cron(cron_expr) => {
                use cron::Schedule;
                use std::str::FromStr;

                Schedule::from_str(cron_expr)
                    .ok()
                    .and_then(|s| s.upcoming(Utc).next())
            }
            JobSchedule::Interval(interval) => {
                Some(Utc::now() + chrono::Duration::seconds(interval.seconds as i64))
            }
            JobSchedule::OneShot(datetime) => {
                if *datetime > Utc::now() {
                    Some(*datetime)
                } else {
                    None
                }
            }
        }
    }

    // =========================================================================
    // Execution Logging Methods
    // =========================================================================

    /// Logs the start of a job execution to the database.
    ///
    /// Returns the execution record ID that should be used to log the end of execution.
    ///
    /// # Errors
    ///
    /// Returns an error if no database is configured or if the database operation fails.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let execution_id = scheduler.log_execution_start("my-job").await?;
    /// // ... execute the job ...
    /// scheduler.log_execution_end(execution_id, ExecutionStatus::Completed, None).await?;
    /// ```
    pub async fn log_execution_start(&self, job_id: &str) -> SchedulerResult<i64> {
        let db = self.database.as_ref().ok_or_else(|| {
            SchedulerError::InternalError(
                "No database configured for execution logging".to_string(),
            )
        })?;

        let started_at = Utc::now().to_rfc3339();
        let job_id_owned = job_id.to_string();

        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO job_executions (job_id, started_at, status) VALUES (?1, ?2, ?3)",
                rusqlite::params![job_id_owned, started_at, "running"],
            )?;
            Ok(conn.last_insert_rowid())
        })
        .map_err(|e| SchedulerError::InternalError(format!("Failed to log execution start: {}", e)))
    }

    /// Logs the end of a job execution to the database.
    ///
    /// Updates the execution record with the completion status, error (if any), and duration.
    ///
    /// # Errors
    ///
    /// Returns an error if no database is configured or if the database operation fails.
    pub async fn log_execution_end(
        &self,
        execution_id: i64,
        status: ExecutionStatus,
        error: Option<String>,
    ) -> SchedulerResult<()> {
        let db = self.database.as_ref().ok_or_else(|| {
            SchedulerError::InternalError(
                "No database configured for execution logging".to_string(),
            )
        })?;

        let completed_at = Utc::now().to_rfc3339();
        let status_str = match status {
            ExecutionStatus::Running => "running",
            ExecutionStatus::Completed => "completed",
            ExecutionStatus::Failed => "failed",
            ExecutionStatus::Cancelled => "cancelled",
        };

        db.with_connection(|conn| {
            // Calculate duration from started_at
            let started_at: String = conn.query_row(
                "SELECT started_at FROM job_executions WHERE id = ?1",
                [execution_id],
                |row| row.get(0),
            )?;

            let duration_ms = if let (Ok(start), Ok(end)) = (
                DateTime::parse_from_rfc3339(&started_at),
                DateTime::parse_from_rfc3339(&completed_at),
            ) {
                Some((end - start).num_milliseconds())
            } else {
                None
            };

            conn.execute(
                "UPDATE job_executions SET completed_at = ?1, status = ?2, error = ?3, duration_ms = ?4 WHERE id = ?5",
                rusqlite::params![completed_at, status_str, error, duration_ms, execution_id],
            )?;
            Ok(())
        })
        .map_err(|e| SchedulerError::InternalError(format!("Failed to log execution end: {}", e)))
    }

    /// Retrieves execution history from the database.
    ///
    /// # Arguments
    ///
    /// * `job_id` - Optional job ID to filter by. If None, returns all executions.
    /// * `limit` - Maximum number of records to return.
    ///
    /// # Errors
    ///
    /// Returns an error if no database is configured or if the database operation fails.
    pub async fn get_execution_history(
        &self,
        job_id: Option<&str>,
        limit: usize,
    ) -> SchedulerResult<Vec<JobExecutionRecord>> {
        let db = self.database.as_ref().ok_or_else(|| {
            SchedulerError::InternalError(
                "No database configured for execution logging".to_string(),
            )
        })?;

        let job_id_owned = job_id.map(|s| s.to_string());
        let limit_i64 = limit as i64;

        db.with_connection(|conn| {
            let mut records = Vec::new();

            if let Some(ref jid) = job_id_owned {
                let mut stmt = conn.prepare(
                    "SELECT id, job_id, started_at, completed_at, status, error, duration_ms
                     FROM job_executions
                     WHERE job_id = ?1
                     ORDER BY started_at DESC
                     LIMIT ?2",
                )?;

                let rows = stmt.query_map(rusqlite::params![jid, limit_i64], |row| {
                    Ok(JobExecutionRecord {
                        id: row.get(0)?,
                        job_id: row.get(1)?,
                        started_at: row.get(2)?,
                        completed_at: row.get(3)?,
                        status: parse_execution_status(row.get::<_, String>(4)?.as_str()),
                        error: row.get(5)?,
                        duration_ms: row.get(6)?,
                    })
                })?;

                for row in rows {
                    records.push(row?);
                }
            } else {
                let mut stmt = conn.prepare(
                    "SELECT id, job_id, started_at, completed_at, status, error, duration_ms
                     FROM job_executions
                     ORDER BY started_at DESC
                     LIMIT ?1",
                )?;

                let rows = stmt.query_map([limit_i64], |row| {
                    Ok(JobExecutionRecord {
                        id: row.get(0)?,
                        job_id: row.get(1)?,
                        started_at: row.get(2)?,
                        completed_at: row.get(3)?,
                        status: parse_execution_status(row.get::<_, String>(4)?.as_str()),
                        error: row.get(5)?,
                        duration_ms: row.get(6)?,
                    })
                })?;

                for row in rows {
                    records.push(row?);
                }
            }

            Ok(records)
        })
        .map_err(|e| {
            SchedulerError::InternalError(format!("Failed to get execution history: {}", e))
        })
    }
}

/// Helper function to parse execution status from database string.
fn parse_execution_status(s: &str) -> ExecutionStatus {
    match s {
        "running" => ExecutionStatus::Running,
        "completed" => ExecutionStatus::Completed,
        "failed" => ExecutionStatus::Failed,
        "cancelled" => ExecutionStatus::Cancelled,
        _ => ExecutionStatus::Failed, // Default to failed for unknown statuses
    }
}

impl Default for ProactiveScheduler {
    fn default() -> Self {
        // Note: This creates a synchronous default which requires an async context to be useful.
        // Prefer using ProactiveScheduler::new() in async code.
        Self {
            inner: Arc::new(RwLock::new(None)),
            jobs: Arc::new(RwLock::new(HashMap::new())),
            running: Arc::new(RwLock::new(false)),
            history: Arc::new(RwLock::new(Vec::new())),
            max_history_entries: 1000,
            action_handler: Arc::new(RwLock::new(None)),
            database: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::scheduler::types::{CallbackAction, JobInterval};
    use std::sync::atomic::{AtomicU32, Ordering};
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_scheduler_creation() {
        let scheduler = ProactiveScheduler::new().await;
        assert!(scheduler.is_ok());

        let scheduler = scheduler.unwrap();
        assert!(!scheduler.is_running().await);
    }

    #[tokio::test]
    async fn test_add_and_remove_job() {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        let job = ScheduledJob::builder("test-job", "Test Job")
            .interval(JobInterval::seconds(60))
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build()
            .expect("Failed to build job");

        // Add job
        let result = scheduler.add_job(job.clone()).await;
        assert!(result.is_ok());

        // Verify job exists
        let jobs = scheduler.list_jobs().await;
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, "test-job");

        // Try to add duplicate
        let result = scheduler.add_job(job).await;
        assert!(result.is_err());

        // Remove job
        let result = scheduler.remove_job("test-job").await;
        assert!(result.is_ok());

        // Verify job removed
        let jobs = scheduler.list_jobs().await;
        assert!(jobs.is_empty());

        // Try to remove non-existent job
        let result = scheduler.remove_job("non-existent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_pause_and_resume_job() {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        let job = ScheduledJob::builder("test-job", "Test Job")
            .interval(JobInterval::seconds(60))
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build()
            .expect("Failed to build job");

        scheduler.add_job(job).await.unwrap();

        // Pause job
        let result = scheduler.pause_job("test-job").await;
        assert!(result.is_ok());

        let job = scheduler.get_job("test-job").await.unwrap();
        assert!(!job.enabled);

        // Resume job
        let result = scheduler.resume_job("test-job").await;
        assert!(result.is_ok());

        let job = scheduler.get_job("test-job").await.unwrap();
        assert!(job.enabled);
    }

    #[tokio::test]
    async fn test_scheduler_start_stop() {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        // Start scheduler
        let result = scheduler.start().await;
        assert!(result.is_ok());
        assert!(scheduler.is_running().await);

        // Try to start again
        let result = scheduler.start().await;
        assert!(result.is_err());

        // Stop scheduler
        let result = scheduler.stop().await;
        assert!(result.is_ok());
        assert!(!scheduler.is_running().await);

        // Try to stop again
        let result = scheduler.stop().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_cron_expression_validation() {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        // Valid cron expression
        let job = ScheduledJob::builder("valid-cron", "Valid Cron Job")
            .cron("0 * * * * *") // Every minute
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .build()
            .expect("Failed to build job");

        let result = scheduler.add_job(job).await;
        assert!(result.is_ok());

        scheduler.start().await.unwrap();
        scheduler.stop().await.unwrap();
    }

    #[tokio::test]
    async fn test_job_execution_with_callback() {
        let scheduler = ProactiveScheduler::new().await.unwrap();
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = Arc::clone(&counter);

        let job = ScheduledJob::builder("callback-job", "Callback Job")
            .interval(JobInterval::seconds(1))
            .action(JobAction::Callback(CallbackAction {
                callback: Arc::new(move || {
                    counter_clone.fetch_add(1, Ordering::SeqCst);
                }),
            }))
            .build()
            .expect("Failed to build job");

        scheduler.add_job(job).await.unwrap();
        scheduler.start().await.unwrap();

        // Wait for at least one execution
        sleep(Duration::from_millis(1500)).await;

        scheduler.stop().await.unwrap();

        // Verify callback was called
        assert!(counter.load(Ordering::SeqCst) >= 1);
    }

    #[tokio::test]
    async fn test_trigger_now() {
        let scheduler = ProactiveScheduler::new().await.unwrap();
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = Arc::clone(&counter);

        let job = ScheduledJob::builder("trigger-job", "Trigger Job")
            .interval(JobInterval::hours(24)) // Long interval so it won't auto-run
            .action(JobAction::Callback(CallbackAction {
                callback: Arc::new(move || {
                    counter_clone.fetch_add(1, Ordering::SeqCst);
                }),
            }))
            .build()
            .expect("Failed to build job");

        scheduler.add_job(job).await.unwrap();

        // Trigger immediately without starting scheduler
        let result = scheduler.trigger_now("trigger-job").await;
        assert!(result.is_ok());

        // Wait for execution
        sleep(Duration::from_millis(100)).await;

        // Verify callback was called
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_job_history() {
        let scheduler = ProactiveScheduler::new().await.unwrap();

        let job = ScheduledJob::builder("history-job", "History Job")
            .interval(JobInterval::seconds(1))
            .action(JobAction::Callback(CallbackAction {
                callback: Arc::new(|| {}),
            }))
            .build()
            .expect("Failed to build job");

        scheduler.add_job(job).await.unwrap();
        scheduler.start().await.unwrap();

        // Wait for some executions
        sleep(Duration::from_millis(2500)).await;

        scheduler.stop().await.unwrap();

        // Check history
        let history = scheduler.get_history(None).await;
        assert!(!history.is_empty());

        let job_history = scheduler.get_job_history("history-job", None).await;
        assert!(!job_history.is_empty());
    }

    #[tokio::test]
    async fn test_calculate_next_run() {
        // Test cron schedule
        let cron_schedule = JobSchedule::Cron("0 * * * * *".to_string());
        let next_run = ProactiveScheduler::calculate_next_run(&cron_schedule);
        assert!(next_run.is_some());

        // Test interval schedule
        let interval_schedule = JobSchedule::Interval(JobInterval::minutes(5));
        let next_run = ProactiveScheduler::calculate_next_run(&interval_schedule);
        assert!(next_run.is_some());

        // Test future one-shot
        let future_time = Utc::now() + chrono::Duration::hours(1);
        let oneshot_schedule = JobSchedule::OneShot(future_time);
        let next_run = ProactiveScheduler::calculate_next_run(&oneshot_schedule);
        assert!(next_run.is_some());

        // Test past one-shot
        let past_time = Utc::now() - chrono::Duration::hours(1);
        let past_oneshot_schedule = JobSchedule::OneShot(past_time);
        let next_run = ProactiveScheduler::calculate_next_run(&past_oneshot_schedule);
        assert!(next_run.is_none());
    }

    #[test]
    fn test_job_builder() {
        let job = ScheduledJob::builder("builder-test", "Builder Test Job")
            .cron("0 0 * * * *")
            .action(JobAction::EmitEvent {
                event_name: "test".into(),
                payload: serde_json::Value::Null,
            })
            .enabled(false)
            .max_retries(5)
            .metadata("key", serde_json::json!("value"))
            .build()
            .expect("Failed to build job");

        assert_eq!(job.id, "builder-test");
        assert_eq!(job.name, "Builder Test Job");
        assert!(!job.enabled);
        assert_eq!(job.max_retries, 5);
        assert!(job.metadata.contains_key("key"));
    }

    #[test]
    fn test_job_interval_constructors() {
        let seconds = JobInterval::seconds(30);
        assert_eq!(seconds.seconds, 30);

        let minutes = JobInterval::minutes(5);
        assert_eq!(minutes.seconds, 300);

        let hours = JobInterval::hours(2);
        assert_eq!(hours.seconds, 7200);

        let days = JobInterval::days(1);
        assert_eq!(days.seconds, 86400);
    }
}
