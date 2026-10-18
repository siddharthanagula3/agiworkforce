//! Tauri commands for scheduled jobs.
//!
//! This module owns the scheduler: the job store, the background loop that
//! runs due jobs, and the commands that let the user create, edit and run
//! them. `core::scheduler` holds the schedule a job stores, schedule parsing
//! and the run record this module persists.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::RwLock;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::core::agent::tool_approval::UNATTENDED_DENIAL_PREFIX;
use crate::core::agent::unattended_turn::{
    bounded_answer, configured_task_time_limit, run_unattended_turn, UnattendedTurn,
    UnattendedTurnEnd,
};
use crate::core::scheduler::types::{ExecutionStatus, JobExecutionRecord};
use crate::core::scheduler::{cron_schedule, TaskSchedule};
use crate::sys::error::{Error, Result};

use super::scheduler_store::SchedulerStore;

/// The type of action a scheduled job should perform
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SchedulerActionType {
    /// Retired. Kept so a stored job of this kind still loads and can be
    /// shown and deleted; it is never run.
    Workflow,
    /// Run an AGI task with a prompt
    AgiTask,
    /// Retired, as `Workflow`.
    ShellCommand,
    /// Send a notification
    Notification,
    /// Retired, as `Workflow`.
    Webhook,
    /// Retired, as `Workflow`.
    Script,
    /// Run memory summarization (24h batch synthesis)
    MemorySummarization,
    /// Run memory decay (weekly importance decay)
    MemoryDecay,
}

impl std::fmt::Display for SchedulerActionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SchedulerActionType::Workflow => write!(f, "workflow"),
            SchedulerActionType::AgiTask => write!(f, "agiTask"),
            SchedulerActionType::ShellCommand => write!(f, "shellCommand"),
            SchedulerActionType::Notification => write!(f, "notification"),
            SchedulerActionType::Webhook => write!(f, "webhook"),
            SchedulerActionType::Script => write!(f, "script"),
            SchedulerActionType::MemorySummarization => write!(f, "memorySummarization"),
            SchedulerActionType::MemoryDecay => write!(f, "memoryDecay"),
        }
    }
}

/// Status of a scheduled job
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    /// Job is active and will run at scheduled times
    Active,
    /// Job is paused and will not run until resumed
    Paused,
    /// Job has been completed (for one-time jobs)
    Completed,
    /// Job failed and is in error state
    Failed,
}

/// The trust boundary a job's AI run stays inside. It is taken from the app
/// mode when the job is created and never changes afterwards, so a job made in
/// Local mode cannot start reaching AGI Cloud because the app was switched,
/// and a Cloud job never falls back to a local model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobRunMode {
    #[default]
    Local,
    Cloud,
}

impl JobRunMode {
    fn of_app_mode(cloud_app_mode: bool) -> Self {
        if cloud_app_mode {
            Self::Cloud
        } else {
            Self::Local
        }
    }
}

const CLOUD_JOB_NEEDS_CLOUD_MODE: &str = "This task was scheduled in Cloud mode, so it runs only while the app is in Cloud mode. Switch to Cloud to run it. It is not run on a local model instead.";
const CLOUD_JOB_NEEDS_SIGN_IN: &str = "This task was scheduled in Cloud mode. Sign in to AGI Cloud to run it. It is not run on a local model instead.";

fn scheduled_trust_mode(
    run_mode: JobRunMode,
    cloud_app_mode: bool,
    signed_in: bool,
) -> std::result::Result<agiworkforce_model_registry::TrustMode, String> {
    match run_mode {
        JobRunMode::Local => Ok(agiworkforce_model_registry::TrustMode::Local),
        JobRunMode::Cloud if !cloud_app_mode => Err(CLOUD_JOB_NEEDS_CLOUD_MODE.to_string()),
        JobRunMode::Cloud if !signed_in => Err(CLOUD_JOB_NEEDS_SIGN_IN.to_string()),
        JobRunMode::Cloud => Ok(agiworkforce_model_registry::TrustMode::ManagedCloud),
    }
}

/// A scheduled job definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJob {
    /// Unique identifier for the job
    pub id: String,
    /// Human-readable name for the job
    pub name: String,
    /// Cron expression defining when the job runs (e.g., "0 0 9 * * *" for 9 AM daily)
    pub schedule: String,
    /// Type of action to perform
    pub action_type: SchedulerActionType,
    /// JSON data containing action-specific parameters
    pub action_data: serde_json::Value,
    /// Current status of the job
    pub status: JobStatus,
    /// Timestamp when the job was created
    pub created_at: DateTime<Utc>,
    /// Timestamp when the job was last modified
    pub updated_at: DateTime<Utc>,
    /// Timestamp of the last successful run (if any)
    pub last_run: Option<DateTime<Utc>>,
    /// Timestamp of the next scheduled run
    pub next_run: Option<DateTime<Utc>>,
    /// Number of times the job has run
    pub run_count: u64,
    /// Number of consecutive failures
    pub failure_count: u32,
    /// Optional description of the job
    pub description: Option<String>,
    /// What the last run produced, when it finished without an error
    #[serde(default)]
    pub last_output: Option<String>,
    /// A job stored before modes were recorded has none and runs Local.
    #[serde(default)]
    pub run_mode: JobRunMode,
    /// The schedule as it was stated, in its time zone. A job stored before
    /// schedules were typed has none and runs on `schedule`, read in UTC.
    #[serde(default)]
    pub plan: Option<TaskSchedule>,
    /// Why the most recent due run did not finish, until a run succeeds.
    #[serde(default)]
    pub last_problem: Option<RunProblem>,
    /// When the most recent run had been due, if it started late because the
    /// app was closed or the computer was asleep.
    #[serde(default)]
    pub last_run_was_due: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RunProblemKind {
    Failed,
    /// The run was never started, so it is not counted as a failure.
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProblem {
    pub kind: RunProblemKind,
    pub reason: String,
}

impl RunProblem {
    fn failed(reason: String) -> Self {
        Self {
            kind: RunProblemKind::Failed,
            reason,
        }
    }

    fn skipped(reason: String) -> Self {
        Self {
            kind: RunProblemKind::Skipped,
            reason,
        }
    }
}

/// How one run of a job ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunOutcome {
    Succeeded(Option<String>),
    Failed(String),
    /// The run could not start for a reason that is not the task's fault.
    Skipped(String),
    /// The person stopped it, by its Stop, by pausing or by deleting the task.
    Stopped,
}

/// What became of a job once a run was recorded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AfterRun {
    NoSuchJob,
    Continues,
    /// A task set to run once has had its run.
    Finished,
    /// This run was the failure that turned the task off.
    StoppedAfterFailures,
}

/// Failed runs in a row before a repeating task is turned off.
pub const FAILURES_BEFORE_A_TASK_IS_STOPPED: u32 = 3;

/// What `schedule` holds for a task that runs once, which has no cron
/// expression.
const ONCE_SCHEDULE_LABEL: &str = "once";

const RUN_STOPPED: &str = "It was stopped before it finished.";

const MISSED_TOO_LONG_AGO: &str =
    "It was due more than 7 days ago, while the app was closed or the computer was asleep.";

impl ScheduledJob {
    /// A job on a cron expression read in UTC: the built-in maintenance jobs.
    pub fn new(
        name: String,
        schedule: String,
        action_type: SchedulerActionType,
        action_data: serde_json::Value,
    ) -> Result<Self> {
        let next_run = cron_schedule(&schedule)
            .map_err(Error::Generic)?
            .upcoming(Utc)
            .next();
        Ok(Self::created(
            name,
            schedule,
            None,
            next_run,
            action_type,
            action_data,
        ))
    }

    /// A job on a schedule as a person states it, or why that schedule
    /// cannot be stored.
    pub fn planned(
        name: String,
        plan: TaskSchedule,
        action_type: SchedulerActionType,
        action_data: serde_json::Value,
    ) -> Result<Self> {
        let now = Utc::now();
        let plan = plan.checked(now).map_err(Error::Generic)?;
        let next_run = plan.next_after(now);
        Ok(Self::created(
            name,
            schedule_label(&plan),
            Some(plan),
            next_run,
            action_type,
            action_data,
        ))
    }

    fn created(
        name: String,
        schedule: String,
        plan: Option<TaskSchedule>,
        next_run: Option<DateTime<Utc>>,
        action_type: SchedulerActionType,
        action_data: serde_json::Value,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            schedule,
            action_type,
            action_data,
            status: JobStatus::Active,
            created_at: now,
            updated_at: now,
            last_run: None,
            next_run,
            run_count: 0,
            failure_count: 0,
            description: None,
            last_output: None,
            run_mode: JobRunMode::of_app_mode(crate::sys::account::app_mode::is_cloud_app_mode()),
            plan,
            last_problem: None,
            last_run_was_due: None,
        }
    }

    /// The first run after now, or none for a one-time task whose time has
    /// passed.
    pub fn calculate_next_run(&self) -> Option<DateTime<Utc>> {
        let now = Utc::now();
        match &self.plan {
            Some(plan) => plan.next_after(now),
            None => cron_schedule(&self.schedule)
                .ok()
                .and_then(|schedule| schedule.after(&now).next()),
        }
    }

    fn runs_once(&self) -> bool {
        self.plan.as_ref().is_some_and(TaskSchedule::is_once)
    }

    /// A one-time task whose time passed while it was off has no next run of
    /// its own, so turning it on runs it at the next poll.
    fn next_run_when_turned_on(&self) -> Option<DateTime<Utc>> {
        self.calculate_next_run()
            .or_else(|| self.runs_once().then(Utc::now))
    }
}

fn schedule_label(plan: &TaskSchedule) -> String {
    plan.expression()
        .unwrap_or_else(|| ONCE_SCHEDULE_LABEL.to_string())
}

/// The proactive scheduler that manages scheduled jobs
pub struct ProactiveScheduler {
    pub(crate) jobs: RwLock<HashMap<String, ScheduledJob>>,
    /// Disk persistence backing this scheduler. `None` means pure in-memory
    /// operation, used by tests.
    store: Option<Arc<SchedulerStore>>,
    /// Why the schedule database could not be opened. While set, every read
    /// and write fails with this reason instead of accepting schedules that
    /// a restart would silently drop.
    unavailable: Option<String>,
}

impl ProactiveScheduler {
    /// Create a new proactive scheduler with no disk persistence.
    pub fn new() -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
            store: None,
            unavailable: None,
        }
    }

    /// Create a scheduler backed by disk persistence. Every create/update/
    /// delete mutation is written to `store` before (or as part of) making
    /// it visible in memory, so `jobs` and the on-disk table never diverge.
    pub fn with_store(store: Arc<SchedulerStore>) -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
            store: Some(store),
            unavailable: None,
        }
    }

    pub fn unavailable(reason: String) -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
            store: None,
            unavailable: Some(reason),
        }
    }

    fn ensure_available(&self) -> Result<()> {
        match &self.unavailable {
            Some(reason) => Err(Error::Generic(reason.clone())),
            None => Ok(()),
        }
    }

    /// Replace the in-memory job set with previously-persisted jobs.
    /// Intended to be called once at startup, immediately after loading
    /// from disk, it does not re-persist, since the jobs are already on
    /// disk.
    pub fn hydrate(&self, jobs: HashMap<String, ScheduledJob>) -> Result<()> {
        let mut guard = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;
        *guard = jobs;
        Ok(())
    }

    /// Persist a job, propagating any failure to the caller. Used by
    /// user-initiated mutations (create/update/pause/resume), which must
    /// not silently diverge from what the frontend is told succeeded.
    fn persist(&self, job: &ScheduledJob) -> Result<()> {
        self.ensure_available()?;
        if let Some(store) = &self.store {
            store.upsert_job(job)?;
        }
        Ok(())
    }

    /// Persist a job, logging but not propagating failure. Used only for
    /// execution bookkeeping (`mark_job_run`): rolling back that in-memory
    /// update on a persist failure would leave `next_run` unadvanced, and
    /// the background loop would re-fire an already-executed job on its
    /// very next poll. The next successful mutation for this job rewrites
    /// the full row, so a transient failure here self-heals.
    fn persist_best_effort(&self, job: &ScheduledJob) {
        if let Some(store) = &self.store {
            if let Err(e) = store.upsert_job(job) {
                tracing::warn!(
                    "[Scheduler] Failed to persist run bookkeeping for job {} \
                     (non-fatal, will retry on next mutation): {}",
                    job.id,
                    e
                );
            }
        }
    }

    /// Persist a job's deletion, propagating any failure to the caller.
    fn persist_delete(&self, job_id: &str) -> Result<()> {
        if let Some(store) = &self.store {
            store.delete_job(job_id)?;
        }
        Ok(())
    }

    /// Add a job on a cron expression read in UTC.
    pub fn add_job(
        &self,
        name: String,
        schedule: String,
        action_type: SchedulerActionType,
        action_data: serde_json::Value,
    ) -> Result<String> {
        self.insert_job(ScheduledJob::new(name, schedule, action_type, action_data)?)
    }

    pub fn insert_job(&self, job: ScheduledJob) -> Result<String> {
        let job_id = job.id.clone();

        // Persist before making the job visible in memory, so a failed
        // write never leaves an unpersisted job that a restart would drop.
        self.persist(&job)?;

        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        jobs.insert(job_id.clone(), job);
        Ok(job_id)
    }

    /// Remove a scheduled job by ID
    pub fn remove_job(&self, job_id: &str) -> Result<bool> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        if !jobs.contains_key(job_id) {
            return Ok(false);
        }

        // Persist the deletion before removing from memory, within the same
        // write-lock critical section, so a failed delete never leaves the
        // job missing in memory but still present on disk.
        self.persist_delete(job_id)?;

        Ok(jobs.remove(job_id).is_some())
    }

    /// List all scheduled jobs
    pub fn list_jobs(&self) -> Result<Vec<ScheduledJob>> {
        self.ensure_available()?;
        let jobs = self
            .jobs
            .read()
            .map_err(|e| Error::Generic(format!("Failed to acquire read lock: {}", e)))?;

        Ok(jobs.values().cloned().collect())
    }

    /// Pause a scheduled job
    pub fn pause_job(&self, job_id: &str) -> Result<bool> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        if let Some(job) = jobs.get_mut(job_id) {
            if job.status == JobStatus::Active {
                let before = job.clone();
                job.status = JobStatus::Paused;
                job.updated_at = Utc::now();
                if let Err(e) = self.persist(job) {
                    *job = before;
                    return Err(e);
                }
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Turns a job back on: one that was paused, or one stopped after
    /// repeated failures, whose count starts again from zero.
    pub fn resume_job(&self, job_id: &str) -> Result<bool> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        if let Some(job) = jobs.get_mut(job_id) {
            if matches!(job.status, JobStatus::Paused | JobStatus::Failed) {
                let before = job.clone();
                job.status = JobStatus::Active;
                job.failure_count = 0;
                job.last_problem = None;
                job.next_run = job.next_run_when_turned_on();
                job.updated_at = Utc::now();
                if let Err(e) = self.persist(job) {
                    *job = before;
                    return Err(e);
                }
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Get a specific job by ID
    pub fn get_job(&self, job_id: &str) -> Result<Option<ScheduledJob>> {
        let jobs = self
            .jobs
            .read()
            .map_err(|e| Error::Generic(format!("Failed to acquire read lock: {}", e)))?;

        Ok(jobs.get(job_id).cloned())
    }

    /// Moves a job past a run it missed by more than the catch-up window,
    /// without running it. A one-time task has no later run to move to, so it
    /// is paused with the reason rather than left on with nothing ahead.
    pub fn skip_missed_run(&self, job_id: &str) -> Result<bool> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;
        let Some(job) = jobs.get_mut(job_id) else {
            return Ok(false);
        };
        job.next_run = job.calculate_next_run();
        if job.next_run.is_none() {
            job.status = JobStatus::Paused;
        }
        job.last_problem = Some(RunProblem::skipped(MISSED_TOO_LONG_AGO.to_string()));
        job.updated_at = Utc::now();
        self.persist_best_effort(job);
        Ok(true)
    }

    /// Records how a run ended and moves the job to its next run. A run that
    /// was skipped or stopped is neither a run nor a failure. A task set to
    /// run once is finished by a run at or after its time, and left on by one
    /// asked for before it; a repeating one is turned off by its
    /// [`FAILURES_BEFORE_A_TASK_IS_STOPPED`]th failure in a row.
    pub fn mark_job_run(&self, job_id: &str, outcome: RunOutcome) -> Result<AfterRun> {
        self.mark_late_job_run(job_id, outcome, None)
    }

    /// [`Self::mark_job_run`] for a run that may have started late:
    /// `late_from` is when it had been due.
    pub fn mark_late_job_run(
        &self,
        job_id: &str,
        outcome: RunOutcome,
        late_from: Option<DateTime<Utc>>,
    ) -> Result<AfterRun> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        let Some(job) = jobs.get_mut(job_id) else {
            return Ok(AfterRun::NoSuchJob);
        };
        let now = Utc::now();
        let was_active = job.status == JobStatus::Active;
        let ran = matches!(outcome, RunOutcome::Succeeded(_) | RunOutcome::Failed(_));
        job.updated_at = now;
        if ran {
            job.last_run = Some(now);
            job.run_count += 1;
            job.last_run_was_due = late_from;
        }
        match outcome {
            RunOutcome::Succeeded(output) => {
                job.last_output = output;
                job.failure_count = 0;
                job.last_problem = None;
            }
            RunOutcome::Failed(reason) => {
                job.last_output = None;
                job.failure_count += 1;
                job.last_problem = Some(RunProblem::failed(reason));
            }
            RunOutcome::Skipped(reason) => {
                job.last_problem = Some(RunProblem::skipped(reason));
            }
            RunOutcome::Stopped => {
                job.last_problem = Some(RunProblem::skipped(RUN_STOPPED.to_string()));
            }
        }
        job.next_run = job.calculate_next_run();

        let had_its_time = job.runs_once() && job.next_run.is_none();
        let after = if !was_active {
            AfterRun::Continues
        } else if had_its_time && ran {
            job.status = JobStatus::Completed;
            AfterRun::Finished
        } else if had_its_time {
            job.status = JobStatus::Paused;
            AfterRun::Continues
        } else if job.failure_count >= FAILURES_BEFORE_A_TASK_IS_STOPPED {
            job.status = JobStatus::Failed;
            AfterRun::StoppedAfterFailures
        } else {
            AfterRun::Continues
        };

        // Best-effort: see `persist_best_effort` doc comment for why a
        // persist failure here does not roll back the in-memory update.
        self.persist_best_effort(job);

        Ok(after)
    }
}

impl Default for ProactiveScheduler {
    fn default() -> Self {
        Self::new()
    }
}

/// State wrapper for the ProactiveScheduler
pub struct SchedulerState {
    pub scheduler: Arc<ProactiveScheduler>,
    /// In-memory execution history for recently dispatched jobs.
    /// Wrapped in Arc so the background polling loop can share it.
    pub execution_history: Arc<RwLock<Vec<JobExecutionRecord>>>,
    runs_in_flight: Arc<AtomicUsize>,
    /// Jobs with a run claimed, so a long run is never started twice.
    running_jobs: RunningJobs,
    /// Bounds how many scheduled runs execute at the same time.
    run_slots: Arc<tokio::sync::Semaphore>,
    /// Every run in progress, so quit can end them together.
    runs: Arc<tokio::sync::Mutex<tokio::task::JoinSet<()>>>,
    /// Disk copy of the run history, so it survives a restart.
    run_store: Option<Arc<SchedulerStore>>,
    /// Hold the computer awake while scheduled tasks are active.
    keep_awake: Arc<std::sync::atomic::AtomicBool>,
}

impl SchedulerState {
    pub fn new() -> Self {
        Self {
            scheduler: Arc::new(ProactiveScheduler::new()),
            execution_history: Arc::new(RwLock::new(Vec::new())),
            runs_in_flight: Arc::new(AtomicUsize::new(0)),
            running_jobs: Arc::new(std::sync::Mutex::new(HashMap::new())),
            run_slots: Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_SCHEDULED_RUNS)),
            runs: Arc::new(tokio::sync::Mutex::new(tokio::task::JoinSet::new())),
            run_store: None,
            keep_awake: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Scheduler state for a session whose schedule database could not be
    /// opened. Every scheduler call reports `reason`, so the failure is shown
    /// where schedules are managed instead of being written somewhere a
    /// restart or the OS temp cleaner would discard.
    pub fn unavailable(reason: String) -> Self {
        Self {
            scheduler: Arc::new(ProactiveScheduler::unavailable(reason)),
            execution_history: Arc::new(RwLock::new(Vec::new())),
            runs_in_flight: Arc::new(AtomicUsize::new(0)),
            running_jobs: Arc::new(std::sync::Mutex::new(HashMap::new())),
            run_slots: Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_SCHEDULED_RUNS)),
            runs: Arc::new(tokio::sync::Mutex::new(tokio::task::JoinSet::new())),
            run_store: None,
            keep_awake: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Scheduled runs currently executing, background firings and Run Now.
    pub fn runs_in_flight(&self) -> usize {
        self.runs_in_flight.load(Ordering::SeqCst)
    }

    /// Ends every run in progress. Their agents are cancelled by the caller.
    pub async fn abort_runs(&self) {
        self.runs.lock().await.abort_all();
    }

    /// Stores a new job and tells every window about it, so a task made in
    /// chat appears in the list without a reload.
    pub fn add_and_announce(
        &self,
        app_handle: &tauri::AppHandle,
        job: ScheduledJob,
    ) -> Result<ScheduledJob> {
        self.scheduler.insert_job(job.clone())?;
        emit_scheduler_event(app_handle, "scheduler:job_added", job.clone());
        Ok(job)
    }

    /// Removes a job, stops its run if one is in progress and tells every
    /// window. Every way of deleting a task goes through here, so a deleted
    /// task never keeps an agent working or sends a notice afterwards.
    pub fn remove_and_announce(&self, app_handle: &tauri::AppHandle, job_id: &str) -> Result<bool> {
        let removed = self.scheduler.remove_job(job_id)?;
        if removed {
            self.stop_run(job_id);
            emit_scheduler_event(
                app_handle,
                "scheduler:job_removed",
                serde_json::json!({ "jobId": job_id }),
            );
        }
        Ok(removed)
    }

    /// Asks the run of `job_id` in progress to stop. `false` when it has none.
    pub fn stop_run(&self, job_id: &str) -> bool {
        self.runner().stop_run(job_id)
    }

    /// The jobs with a run in progress, waiting for a free slot included.
    pub fn running_job_ids(&self) -> Vec<String> {
        self.runner().running_job_ids()
    }

    fn runner(&self) -> JobRunner {
        JobRunner {
            scheduler: self.scheduler.clone(),
            execution_history: self.execution_history.clone(),
            runs_in_flight: self.runs_in_flight.clone(),
            running_jobs: self.running_jobs.clone(),
            run_slots: self.run_slots.clone(),
            runs: self.runs.clone(),
            run_store: self.run_store.clone(),
        }
    }

    /// Construct scheduler state backed by disk persistence at `db_path`,
    /// hydrating any previously-persisted jobs into memory before
    /// returning. Call this during app setup instead of `new()` so
    /// schedules survive restarts; call `register_default_memory_jobs()`
    /// afterward as usual, it is name-keyed and idempotent, so hydrated
    /// defaults (including any user edits to them, e.g. a pause) are left
    /// alone rather than recreated.
    pub fn new_with_store(db_path: impl AsRef<Path>) -> Result<Self> {
        let store = Arc::new(SchedulerStore::new(db_path));
        store.init()?;
        let jobs = store.load_all()?;
        let runs = store.load_runs().unwrap_or_else(|e| {
            tracing::warn!("[Scheduler] Run history could not be loaded: {}", e);
            Vec::new()
        });
        let keep_awake = store.keep_awake().unwrap_or(false);

        let scheduler = ProactiveScheduler::with_store(store.clone());
        scheduler.hydrate(jobs)?;

        Ok(Self {
            scheduler: Arc::new(scheduler),
            execution_history: Arc::new(RwLock::new(runs)),
            runs_in_flight: Arc::new(AtomicUsize::new(0)),
            running_jobs: Arc::new(std::sync::Mutex::new(HashMap::new())),
            run_slots: Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_SCHEDULED_RUNS)),
            runs: Arc::new(tokio::sync::Mutex::new(tokio::task::JoinSet::new())),
            run_store: Some(store),
            keep_awake: Arc::new(std::sync::atomic::AtomicBool::new(keep_awake)),
        })
    }

    /// Register default memory maintenance jobs (summarization + decay).
    ///
    /// Called once during app initialization. Skips registration if a job
    /// with the same name already exists (idempotent).
    pub fn register_default_memory_jobs(&self) {
        // Daily memory summarization at 3 AM
        // Cron: sec min hour day month weekday
        let summarization_name = "memory_auto_summarization";
        if !self.has_job_by_name(summarization_name) {
            match self.scheduler.add_job(
                summarization_name.to_string(),
                "0 0 3 * * *".to_string(),
                SchedulerActionType::MemorySummarization,
                serde_json::json!({ "max_conversations": 50 }),
            ) {
                Ok(job_id) => {
                    tracing::info!(
                        "[Scheduler] Registered default job '{}' (id={})",
                        summarization_name,
                        job_id
                    );
                }
                Err(e) => {
                    tracing::warn!(
                        "[Scheduler] Failed to register '{}': {}",
                        summarization_name,
                        e
                    );
                }
            }
        }

        // Weekly memory decay on Sundays at 4 AM.
        // Weekday field uses this crate's 1-7 (SUN-SAT) convention, not 0-6.
        let decay_name = "memory_weekly_decay";
        if !self.has_job_by_name(decay_name) {
            match self.scheduler.add_job(
                decay_name.to_string(),
                "0 0 4 * * 1".to_string(),
                SchedulerActionType::MemoryDecay,
                serde_json::json!({}),
            ) {
                Ok(job_id) => {
                    tracing::info!(
                        "[Scheduler] Registered default job '{}' (id={})",
                        decay_name,
                        job_id
                    );
                }
                Err(e) => {
                    tracing::warn!("[Scheduler] Failed to register '{}': {}", decay_name, e);
                }
            }
        }
    }

    /// Check if a job with the given name already exists.
    fn has_job_by_name(&self, name: &str) -> bool {
        match self.scheduler.jobs.read() {
            Ok(jobs) => jobs.values().any(|job| job.name == name),
            Err(_) => false,
        }
    }

    /// Spawn a background tokio task that polls for due jobs every 30 seconds
    /// and dispatches their actions via `dispatch_job_action`.
    ///
    /// This is the core scheduling loop, without it jobs are stored but never
    /// automatically triggered. Call this once from `lib.rs` during app setup;
    /// aborting the returned handle stops the loop on quit.
    pub fn start_background_loop(
        &self,
        app_handle: tauri::AppHandle,
    ) -> tauri::async_runtime::JoinHandle<()> {
        let scheduler = self.scheduler.clone();
        let runner = self.runner();
        let keep_awake = self.keep_awake.clone();
        tauri::async_runtime::spawn(async move {
            tracing::info!("[Scheduler] Background loop started, polling every 30 seconds");
            let mut awake_guard: Option<crate::sys::power::SleepPrevention> = None;
            loop {
                tokio::time::sleep(Duration::from_secs(30)).await;
                runner.reap_finished_runs().await;

                let has_active_jobs = scheduler
                    .jobs
                    .read()
                    .map(|jobs| jobs.values().any(|job| job.status == JobStatus::Active))
                    .unwrap_or(false);
                let should_hold_awake = keep_awake.load(Ordering::SeqCst) && has_active_jobs;
                if should_hold_awake && awake_guard.is_none() {
                    awake_guard = Some(crate::sys::power::SleepPrevention::enable());
                } else if !should_hold_awake {
                    awake_guard = None;
                }

                let due_runs: Vec<DueRun> = {
                    match scheduler.jobs.read() {
                        Ok(jobs) => {
                            let now = chrono::Utc::now();
                            jobs.values()
                                .filter(|job| {
                                    job.status == JobStatus::Active
                                        && job.next_run.is_some_and(|nr| nr <= now)
                                })
                                .map(|job| DueRun {
                                    job_id: job.id.clone(),
                                    action_type: job.action_type.clone(),
                                    action_data: job.action_data.clone(),
                                    job_name: job.name.clone(),
                                    run_mode: job.run_mode,
                                    late_from: job.next_run.filter(|due| is_missed_run(*due, now)),
                                    notify: notifies_on_run(&job.action_type),
                                })
                                .collect()
                        }
                        Err(e) => {
                            tracing::error!("[Scheduler] Failed to read jobs: {}", e);
                            continue;
                        }
                    }
                };

                for due in due_runs {
                    if runner.is_running(&due.job_id) {
                        continue;
                    }
                    if due.late_from.is_some()
                        && due_too_long_ago(&scheduler, &due.job_id, chrono::Utc::now())
                    {
                        tracing::info!(
                            "[Scheduler] Skipping job '{}' (id={}): its run was missed more than {} days ago",
                            due.job_name,
                            due.job_id,
                            CATCH_UP_WINDOW_DAYS
                        );
                        scheduler.skip_missed_run(&due.job_id).ok();
                        continue;
                    }
                    let Some(claim) = runner.claim(&due.job_id) else {
                        continue;
                    };
                    tracing::info!(
                        "[Scheduler] Firing due job '{}' (id={})",
                        due.job_name,
                        due.job_id
                    );
                    runner.start(claim, due, app_handle.clone()).await;
                }
            }
        })
    }
}

/// Runs that may execute at once; further due jobs wait for a free slot
/// without delaying the poll.
const MAX_CONCURRENT_SCHEDULED_RUNS: usize = 4;

struct DueRun {
    job_id: String,
    action_type: SchedulerActionType,
    action_data: serde_json::Value,
    job_name: String,
    run_mode: JobRunMode,
    /// When this run was due, for one started more than a poll late.
    late_from: Option<DateTime<Utc>>,
    notify: bool,
}

/// A request to stop one run. The run looks at it between its waits, and a
/// request made before the run reaches a wait is kept for it.
#[derive(Default)]
struct RunStop {
    asked: std::sync::atomic::AtomicBool,
    wake: tokio::sync::Notify,
}

impl RunStop {
    fn ask(&self) {
        self.asked.store(true, Ordering::SeqCst);
        self.wake.notify_one();
    }

    fn was_asked(&self) -> bool {
        self.asked.load(Ordering::SeqCst)
    }

    async fn asked(&self) {
        while !self.was_asked() {
            self.wake.notified().await;
        }
    }
}

/// The runs in progress, each with the way to stop it.
type RunningJobs = Arc<std::sync::Mutex<HashMap<String, Arc<RunStop>>>>;

/// Holds a job's place while its run is alive, including when the run is
/// aborted mid-await by quit.
struct RunClaim {
    job_id: String,
    stop: Arc<RunStop>,
    running_jobs: RunningJobs,
    runs_in_flight: Arc<AtomicUsize>,
}

impl Drop for RunClaim {
    fn drop(&mut self) {
        self.runs_in_flight.fetch_sub(1, Ordering::SeqCst);
        self.running_jobs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.job_id);
    }
}

#[derive(Clone)]
struct JobRunner {
    scheduler: Arc<ProactiveScheduler>,
    execution_history: Arc<RwLock<Vec<JobExecutionRecord>>>,
    runs_in_flight: Arc<AtomicUsize>,
    running_jobs: RunningJobs,
    run_slots: Arc<tokio::sync::Semaphore>,
    runs: Arc<tokio::sync::Mutex<tokio::task::JoinSet<()>>>,
    run_store: Option<Arc<SchedulerStore>>,
}

impl JobRunner {
    fn is_running(&self, job_id: &str) -> bool {
        self.running_jobs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .contains_key(job_id)
    }

    fn running_job_ids(&self) -> Vec<String> {
        self.running_jobs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .keys()
            .cloned()
            .collect()
    }

    /// Asks the run of `job_id` to stop. `false` when it has none.
    fn stop_run(&self, job_id: &str) -> bool {
        let stop = self
            .running_jobs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(job_id)
            .cloned();
        match stop {
            Some(stop) => {
                stop.ask();
                true
            }
            None => false,
        }
    }

    fn claim(&self, job_id: &str) -> Option<RunClaim> {
        let stop = Arc::new(RunStop::default());
        {
            let mut running = self
                .running_jobs
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if running.contains_key(job_id) {
                return None;
            }
            running.insert(job_id.to_string(), stop.clone());
        }
        self.runs_in_flight.fetch_add(1, Ordering::SeqCst);
        Some(RunClaim {
            job_id: job_id.to_string(),
            stop,
            running_jobs: self.running_jobs.clone(),
            runs_in_flight: self.runs_in_flight.clone(),
        })
    }

    async fn reap_finished_runs(&self) {
        let mut runs = self.runs.lock().await;
        while runs.try_join_next().is_some() {}
    }

    async fn start(&self, claim: RunClaim, run: DueRun, app_handle: tauri::AppHandle) {
        let runner = self.clone();
        self.runs
            .lock()
            .await
            .spawn(async move { runner.run(claim, run, app_handle).await });
    }

    async fn run(self, claim: RunClaim, run: DueRun, app_handle: tauri::AppHandle) {
        let stop = claim.stop.clone();
        let _claim = claim;

        let already_skipped_for = self
            .scheduler
            .get_job(&run.job_id)
            .ok()
            .flatten()
            .and_then(|job| job.last_problem)
            .filter(|problem| problem.kind == RunProblemKind::Skipped)
            .map(|problem| problem.reason);

        emit_scheduler_event(
            &app_handle,
            "scheduler:run_started",
            serde_json::json!({ "jobId": run.job_id }),
        );

        let started_at = chrono::Utc::now();
        let outcome = match mode_refusal(&run.action_type, run.run_mode) {
            Some(reason) => RunOutcome::Skipped(reason),
            None => self.run_unless_stopped(&run, &stop, &app_handle).await,
        };
        let completed_at = chrono::Utc::now();
        let duration_ms = (completed_at - started_at).num_milliseconds();
        let (status, output, problem) = match &outcome {
            RunOutcome::Succeeded(output) => (ExecutionStatus::Completed, output.clone(), None),
            RunOutcome::Failed(reason) => (ExecutionStatus::Failed, None, Some(reason.clone())),
            RunOutcome::Skipped(reason) => (ExecutionStatus::Cancelled, None, Some(reason.clone())),
            RunOutcome::Stopped => (
                ExecutionStatus::Cancelled,
                None,
                Some(RUN_STOPPED.to_string()),
            ),
        };
        let stopped = outcome == RunOutcome::Stopped;

        let after = self
            .scheduler
            .mark_late_job_run(&run.job_id, outcome, run.late_from)
            .unwrap_or(AfterRun::NoSuchJob);
        // The task was deleted while it ran: there is nothing left to record
        // against, and a notice would name a task that no longer exists.
        if after == AfterRun::NoSuchJob {
            return;
        }

        if let Some(ref reason) = problem {
            tracing::warn!(
                "[Scheduler] Job '{}' (id={}) {} after {}ms: {}",
                run.job_name,
                run.job_id,
                if status == ExecutionStatus::Cancelled {
                    "did not finish"
                } else {
                    "failed"
                },
                duration_ms,
                reason
            );
            if !stopped {
                emit_scheduler_event(
                    &app_handle,
                    "scheduler:error",
                    serde_json::json!({ "jobId": run.job_id, "error": reason }),
                );
            }
        }

        record_execution(
            &self.execution_history,
            self.run_store.as_deref(),
            JobExecutionRecord {
                // Use timestamp_millis for monotonic IDs, a list length
                // collides after history is drained at the cap.
                id: chrono::Utc::now().timestamp_millis(),
                job_id: run.job_id.clone(),
                started_at: started_at.to_rfc3339(),
                completed_at: Some(completed_at.to_rfc3339()),
                status,
                error: problem.clone(),
                duration_ms: Some(duration_ms),
                output: output.clone(),
            },
        );

        let name = task_display_name(&run.job_name);
        let notification = match (status, problem.as_deref()) {
            _ if stopped => None,
            (ExecutionStatus::Cancelled, Some(reason)) => (run.notify
                && already_skipped_for.as_deref() != Some(reason))
            .then(|| skipped_run_notification(&run.job_id, name, reason)),
            (_, Some(reason)) if after == AfterRun::StoppedAfterFailures => {
                Some(stopped_task_notification(&run.job_id, name, reason))
            }
            (_, error) => run.notify.then(|| {
                scheduled_run_notification(
                    &run.job_id,
                    name,
                    error,
                    run.late_from,
                    refused_tool_count(output.as_deref()),
                )
            }),
        };
        if let Some(notification) = notification {
            deliver_run_notification(&app_handle, &run.job_id, notification).await;
        }

        // The store has no other way to learn a run finished; polling was
        // never wired up on the frontend.
        if let Ok(Some(job)) = self.scheduler.get_job(&run.job_id) {
            emit_scheduler_event(&app_handle, "scheduler:job_executed", job);
        }
    }

    /// Waits for a free slot, runs the job and says how it ended. A stop
    /// asked for while it waits or works ends it as stopped; a run that had
    /// already succeeded keeps its result.
    async fn run_unless_stopped(
        &self,
        run: &DueRun,
        stop: &RunStop,
        app_handle: &tauri::AppHandle,
    ) -> RunOutcome {
        let _slot = tokio::select! {
            slot = self.run_slots.clone().acquire_owned() => match slot {
                Ok(slot) => slot,
                Err(_) => return RunOutcome::Stopped,
            },
            () = stop.asked() => return RunOutcome::Stopped,
        };

        match dispatch_job_action(
            &run.action_type,
            &run.action_data,
            &run.job_id,
            &run.job_name,
            run.run_mode,
            stop,
            app_handle,
        )
        .await
        {
            Ok(output) => RunOutcome::Succeeded(output),
            Err(_) if stop.was_asked() => RunOutcome::Stopped,
            Err(error) => RunOutcome::Failed(error),
        }
    }
}

/// Why a due run is not started at all. A Cloud task waits for Cloud mode and
/// a signed-in account; while it waits, its runs are skipped, not failed, so
/// working in Local mode does not use up the failures that turn a task off.
fn mode_refusal(action_type: &SchedulerActionType, run_mode: JobRunMode) -> Option<String> {
    if *action_type != SchedulerActionType::AgiTask {
        return None;
    }
    scheduled_trust_mode(
        run_mode,
        crate::sys::account::app_mode::is_cloud_app_mode(),
        crate::sys::account::capture_managed_auth_boundary().is_ok(),
    )
    .err()
}

/// The name the task list shows for a job, which for the built-in
/// maintenance jobs is not the name they are stored under.
fn task_display_name(job_name: &str) -> &str {
    match job_name {
        "memory_auto_summarization" => "Daily memory summary",
        "memory_weekly_decay" => "Weekly memory cleanup",
        other => other,
    }
}

/// A run missed while the app was closed or the computer slept runs once on
/// the next launch, if it is no older than this; older runs are skipped.
const CATCH_UP_WINDOW_DAYS: i64 = 7;

/// A due run is "missed" when it is more than one poll interval late, which
/// only happens when the app was closed or the computer was asleep.
fn is_missed_run(next_run: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    now - next_run > chrono::Duration::seconds(90)
}

fn due_too_long_ago(scheduler: &ProactiveScheduler, job_id: &str, now: DateTime<Utc>) -> bool {
    scheduler
        .get_job(job_id)
        .ok()
        .flatten()
        .and_then(|job| job.next_run)
        .is_some_and(|next_run| now - next_run > chrono::Duration::days(CATCH_UP_WINDOW_DAYS))
}

/// Built-in maintenance jobs run silently, and a reminder job is itself the
/// notification; every other task reports each run.
fn notifies_on_run(action_type: &SchedulerActionType) -> bool {
    !matches!(
        action_type,
        SchedulerActionType::MemorySummarization
            | SchedulerActionType::MemoryDecay
            | SchedulerActionType::Notification
    )
}

const OPEN_SCHEDULED_TASKS_LABEL: &str = "Open scheduled tasks";

/// Shows a scheduled reminder through the notification center, which applies
/// the user's notification settings and raises the native notification.
async fn deliver_reminder(
    app_handle: &tauri::AppHandle,
    job_id: &str,
    title: &str,
    message: &str,
) -> std::result::Result<(), String> {
    use crate::sys::commands::notification_center::{
        deliver_notification, CreateNotificationInput, NotificationCenterState,
        NotificationPriority, NotificationRoute, NotificationType,
    };
    use tauri::Manager;

    let state = app_handle
        .try_state::<NotificationCenterState>()
        .ok_or_else(|| "Notifications are not available".to_string())?;
    let input = CreateNotificationInput {
        title: title.to_string(),
        message: message.to_string(),
        notification_type: NotificationType::Reminder,
        priority: NotificationPriority::Normal,
        action_url: Some(NotificationRoute::Schedule(job_id).action_url()),
        action_label: Some(OPEN_SCHEDULED_TASKS_LABEL.to_string()),
        icon: None,
        metadata: Some(serde_json::json!({ "source": "scheduler", "scheduledJobId": job_id })),
        dismissible: true,
        expires_at: None,
    };
    if let Err(reason) = deliver_notification(app_handle, &state, input).await {
        tracing::info!("[Scheduler] Reminder '{}' held back: {}", title, reason);
    }
    Ok(())
}

/// How many tools a finished run was refused, read from the lines
/// `with_refusals` adds to what the run reports.
fn refused_tool_count(output: Option<&str>) -> usize {
    output
        .unwrap_or_default()
        .lines()
        .filter(|line| line.starts_with(UNATTENDED_DENIAL_PREFIX))
        .count()
}

fn scheduled_run_notification(
    job_id: &str,
    job_name: &str,
    error: Option<&str>,
    late_from: Option<DateTime<Utc>>,
    refused_tools: usize,
) -> crate::sys::commands::notification_center::CreateNotificationInput {
    use crate::sys::commands::notification_center::{NotificationPriority, NotificationType};

    let due = late_from.map(local_due_time);
    let (title, message, priority, notification_type) = match error {
        Some(error) => (
            format!("Scheduled task failed: {job_name}"),
            match &due {
                Some(due) => format!("It ran late: it was due {due}. {error}"),
                None => error.to_string(),
            },
            NotificationPriority::High,
            NotificationType::TaskFailed,
        ),
        None if refused_tools > 0 => (
            format!("Scheduled task ran with steps left out: {job_name}"),
            format!(
                "{refused_tools} step{} did not run because nobody was here to approve {}. Open the task to see which.",
                if refused_tools == 1 { "" } else { "s" },
                if refused_tools == 1 { "it" } else { "them" },
            ),
            NotificationPriority::High,
            NotificationType::TaskComplete,
        ),
        None if due.is_some() => (
            format!("Ran a missed scheduled task: {job_name}"),
            format!(
                "It was due {}, while the app was closed or the computer was asleep, and has run now.",
                due.unwrap_or_default()
            ),
            NotificationPriority::Normal,
            NotificationType::TaskComplete,
        ),
        None => (
            format!("Scheduled task ran: {job_name}"),
            "It finished without errors.".to_string(),
            NotificationPriority::Normal,
            NotificationType::TaskComplete,
        ),
    };
    run_notification(job_id, title, message, priority, notification_type)
}

/// A due time as the notice states it, on this computer's clock.
fn local_due_time(due: DateTime<Utc>) -> String {
    due.with_timezone(&chrono::Local)
        .format("%b %-d at %H:%M")
        .to_string()
}

fn run_notification(
    job_id: &str,
    title: String,
    message: String,
    priority: crate::sys::commands::notification_center::NotificationPriority,
    notification_type: crate::sys::commands::notification_center::NotificationType,
) -> crate::sys::commands::notification_center::CreateNotificationInput {
    use crate::sys::commands::notification_center::{CreateNotificationInput, NotificationRoute};

    CreateNotificationInput {
        title,
        message,
        notification_type,
        priority,
        action_url: Some(NotificationRoute::Schedule(job_id).action_url()),
        action_label: Some(OPEN_SCHEDULED_TASKS_LABEL.to_string()),
        icon: None,
        metadata: Some(serde_json::json!({ "scheduledJobId": job_id })),
        dismissible: true,
        expires_at: None,
    }
}

/// The notice that a task has been turned off, with the last error and the
/// way to turn it back on. It is sent for every kind of task, the built-in
/// ones included, because a task that stops silently is never looked at.
fn stopped_task_notification(
    job_id: &str,
    job_name: &str,
    reason: &str,
) -> crate::sys::commands::notification_center::CreateNotificationInput {
    use crate::sys::commands::notification_center::{NotificationPriority, NotificationType};

    run_notification(
        job_id,
        format!("Scheduled task stopped: {job_name}"),
        format!(
            "It failed {FAILURES_BEFORE_A_TASK_IS_STOPPED} times in a row and will not run again until you turn it back on in Scheduled tasks. Last error: {reason}"
        ),
        NotificationPriority::High,
        NotificationType::TaskFailed,
    )
}

fn skipped_run_notification(
    job_id: &str,
    job_name: &str,
    reason: &str,
) -> crate::sys::commands::notification_center::CreateNotificationInput {
    use crate::sys::commands::notification_center::{NotificationPriority, NotificationType};

    run_notification(
        job_id,
        format!("Scheduled task skipped: {job_name}"),
        reason.to_string(),
        NotificationPriority::Normal,
        NotificationType::Warning,
    )
}

async fn deliver_run_notification(
    app_handle: &tauri::AppHandle,
    job_id: &str,
    input: crate::sys::commands::notification_center::CreateNotificationInput,
) {
    use crate::sys::commands::notification_center::{
        deliver_notification, NotificationCenterState,
    };
    use tauri::Manager;

    let Some(state) = app_handle.try_state::<NotificationCenterState>() else {
        return;
    };
    if let Err(reason) = deliver_notification(app_handle, &state, input).await {
        tracing::info!(
            "[Scheduler] Notification for job {} not delivered: {}",
            job_id,
            reason
        );
    }
}

/// Appends a run to the in-memory history and its disk copy, keeping both
/// at [`super::scheduler_store::MAX_PERSISTED_RUNS`] entries.
fn record_execution(
    history: &RwLock<Vec<JobExecutionRecord>>,
    run_store: Option<&SchedulerStore>,
    record: JobExecutionRecord,
) {
    if let Some(store) = run_store {
        if let Err(e) = store.record_run(&record) {
            tracing::warn!(
                "[Scheduler] Failed to persist run of job {}: {}",
                record.job_id,
                e
            );
        }
    }
    if let Ok(mut hist) = history.write() {
        hist.push(record);
        let cap = super::scheduler_store::MAX_PERSISTED_RUNS;
        if hist.len() > cap {
            let drain_to = hist.len() - cap;
            hist.drain(0..drain_to);
        }
    }
}

impl Default for SchedulerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Broadcast a scheduler lifecycle change to every window.
///
/// `schedulerStore` treats these events as the only source of job mutations it
/// did not itself initiate, background firings, the agent's scheduler tools,
/// and a second window all reach the UI through here. A failed emit is logged
/// rather than propagated so a missing webview never fails the mutation that
/// already succeeded.
fn emit_scheduler_event<P: serde::Serialize + Clone>(
    app_handle: &tauri::AppHandle,
    event: &str,
    payload: P,
) {
    use tauri::Emitter;
    if let Err(e) = app_handle.emit(event, payload) {
        tracing::warn!("[Scheduler] Failed to emit {}: {}", event, e);
    }
}

const TASK_NEEDS_A_NAME: &str = "A scheduled task needs a name.";
const TASK_NEEDS_A_PROMPT: &str = "A scheduled task needs a prompt: what should it do?";

/// The job the task form creates: an AI task on the schedule the form shows.
/// Reminders are made in chat and maintenance jobs by the app; no other kind
/// of job can be created.
fn prompt_task(
    name: &str,
    prompt: &str,
    schedule: serde_json::Value,
    description: Option<String>,
) -> Result<ScheduledJob> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::Generic(TASK_NEEDS_A_NAME.to_string()));
    }
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(Error::Generic(TASK_NEEDS_A_PROMPT.to_string()));
    }
    let plan = TaskSchedule::from_value(schedule).map_err(Error::Generic)?;
    let mut job = ScheduledJob::planned(
        name.to_string(),
        plan,
        SchedulerActionType::AgiTask,
        serde_json::json!({ "prompt": prompt }),
    )?;
    job.description = stated(description);
    Ok(job)
}

fn stated(text: Option<String>) -> Option<String> {
    text.map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

/// Creates an AI task that runs `prompt` on `schedule`, the object the task
/// form edits (see `TaskSchedule`).
///
/// # Returns
/// The unique job ID
#[tauri::command]
pub async fn scheduler_add_job(
    name: String,
    prompt: String,
    schedule: serde_json::Value,
    description: Option<String>,
    state: State<'_, SchedulerState>,
    app_handle: tauri::AppHandle,
) -> Result<String> {
    let job = prompt_task(&name, &prompt, schedule, description)?;
    Ok(state.add_and_announce(&app_handle, job)?.id)
}

/// Remove a scheduled job by ID, stopping its run if one is in progress
///
/// # Returns
/// `true` if the job was found and removed, `false` otherwise
#[tauri::command]
pub async fn scheduler_remove_job(
    job_id: String,
    state: State<'_, SchedulerState>,
    app_handle: tauri::AppHandle,
) -> Result<bool> {
    state.remove_and_announce(&app_handle, &job_id)
}

/// Stops the run of a job that is in progress. The task stays as it is and
/// runs again at its next time.
///
/// # Returns
/// `true` when a run was in progress and has been asked to stop
#[tauri::command]
pub async fn scheduler_stop_run(id: String, state: State<'_, SchedulerState>) -> Result<bool> {
    Ok(state.stop_run(&id))
}

/// The jobs with a run in progress.
#[tauri::command]
pub async fn scheduler_running_jobs(state: State<'_, SchedulerState>) -> Result<Vec<String>> {
    Ok(state.running_job_ids())
}

/// List all scheduled jobs
///
/// # Returns
/// A vector of all scheduled jobs
#[tauri::command]
pub async fn scheduler_list_jobs(state: State<'_, SchedulerState>) -> Result<Vec<ScheduledJob>> {
    state.scheduler.list_jobs()
}

/// Re-read a job and broadcast it as `scheduler:job_updated`.
///
/// `changed` is the mutating call's own "did anything happen" answer, a no-op
/// pause on an already-paused job must not look like a state change to the UI.
fn emit_job_updated(
    app_handle: &tauri::AppHandle,
    state: &State<'_, SchedulerState>,
    job_id: &str,
    changed: bool,
) {
    if !changed {
        return;
    }
    if let Ok(Some(job)) = state.scheduler.get_job(job_id) {
        emit_scheduler_event(app_handle, "scheduler:job_updated", job);
    }
}

/// Toggle a scheduled job on or off
///
/// An active job is paused, and its run stopped if one is in progress. A
/// paused job, or one stopped after repeated failures, is turned back on.
///
/// # Arguments
/// * `id` - The unique identifier of the job to toggle
///
/// # Returns
/// `true` if the job was found and toggled, `false` otherwise
#[tauri::command]
pub async fn scheduler_toggle_job(
    id: String,
    state: State<'_, SchedulerState>,
    app_handle: tauri::AppHandle,
) -> Result<bool> {
    // Check current status and toggle accordingly
    let current_status = {
        let job = state.scheduler.get_job(&id)?;
        match job {
            Some(j) => j.status,
            None => return Err(Error::Generic(format!("Job not found: {}", id))),
        }
    };

    let toggled = match current_status {
        JobStatus::Active => {
            let paused = state.scheduler.pause_job(&id);
            if matches!(paused, Ok(true)) {
                state.stop_run(&id);
            }
            paused
        }
        JobStatus::Paused | JobStatus::Failed => state.scheduler.resume_job(&id),
        JobStatus::Completed => Err(Error::Generic(TASK_HAS_FINISHED.to_string())),
    }?;

    emit_job_updated(&app_handle, &state, &id, toggled);
    Ok(toggled)
}

const TASK_HAS_FINISHED: &str =
    "This task has finished. Edit it and give it a new time to run it again.";

/// Start a scheduled job now, without waiting for its schedule.
///
/// The run continues in the background, bounded like every other scheduled
/// run; its result arrives through `scheduler:job_executed`, or
/// `scheduler:error` when it fails.
///
/// # Returns
/// `true` once the run has started
#[tauri::command]
pub async fn scheduler_run_job_now(
    id: String,
    state: State<'_, SchedulerState>,
    app_handle: tauri::AppHandle,
) -> Result<bool> {
    let job = state
        .scheduler
        .get_job(&id)?
        .ok_or_else(|| Error::Generic(format!("Job not found: {}", id)))?;

    let runner = state.runner();
    let claim = runner
        .claim(&id)
        .ok_or_else(|| Error::Generic(format!("'{}' is already running.", job.name)))?;

    tracing::info!(
        "[Scheduler] Running job '{}' (id={}) on request",
        job.name,
        id
    );
    runner
        .start(
            claim,
            DueRun {
                job_id: id,
                action_type: job.action_type,
                action_data: job.action_data,
                job_name: job.name,
                run_mode: job.run_mode,
                late_from: None,
                notify: false,
            },
            app_handle,
        )
        .await;

    Ok(true)
}

/// Adds the tools an unattended run was refused to what the run reports, so
/// the reader sees which tool was not run and why.
fn with_refusals(report: Option<String>, refusals: &[String]) -> Option<String> {
    if refusals.is_empty() {
        return report;
    }
    let mut lines: Vec<&str> = report.as_deref().into_iter().collect();
    lines.extend(refusals.iter().map(String::as_str));
    Some(lines.join("\n"))
}

fn time_limit_message(time_limit: Option<Duration>) -> String {
    let minutes = time_limit.map(|limit| limit.as_secs() / 60).unwrap_or(0);
    format!("Stopped after reaching the {minutes}-minute task time limit set in Settings.")
}

/// Jobs that ran a shell command, a script, a webhook or a workflow could be
/// created only by calling the scheduler directly, never from the app, and
/// ran with nobody there to approve them.
const RETIRED_JOB_KIND: &str = "Scheduled commands, scripts, webhooks and workflows are no longer run. Delete this task and schedule an AI task that does the same.";

/// Runs a job's configured action and returns what it produced, if anything
/// worth showing: an agent's final result.
async fn dispatch_job_action(
    action_type: &SchedulerActionType,
    action_data: &serde_json::Value,
    job_id: &str,
    job_name: &str,
    run_mode: JobRunMode,
    stop: &RunStop,
    app_handle: &tauri::AppHandle,
) -> std::result::Result<Option<String>, String> {
    match action_type {
        SchedulerActionType::Workflow
        | SchedulerActionType::ShellCommand
        | SchedulerActionType::Webhook
        | SchedulerActionType::Script => Err(RETIRED_JOB_KIND.to_string()),

        SchedulerActionType::AgiTask => {
            let prompt = action_data
                .get("prompt")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if prompt.is_empty() {
                return Err("AGI task prompt is empty".to_string());
            }
            let trust_mode = scheduled_trust_mode(
                run_mode,
                crate::sys::account::app_mode::is_cloud_app_mode(),
                crate::sys::account::capture_managed_auth_boundary().is_ok(),
            )?;

            // Never log the prompt itself: log files are copied into support
            // bundles (see `crate::sys::support_bundle`), and the prompt is
            // conversation content.
            tracing::info!(
                prompt_chars = prompt.chars().count(),
                "[Scheduler] Running AI task '{}'",
                job_name
            );

            let limit = configured_task_time_limit(app_handle).await;
            let turn = UnattendedTurn {
                prompt,
                trust_mode,
                project_folder: None,
                time_limit: limit,
                conversation_id: None,
                progress: None,
            };
            let ran = run_unattended_turn(app_handle, turn, stop.asked()).await;
            let refusals = ran.refusals;
            match ran.end {
                UnattendedTurnEnd::Answered(answer) => {
                    Ok(with_refusals(bounded_answer(&answer), &refusals))
                }
                UnattendedTurnEnd::Failed(reason) => {
                    Err(with_refusals(Some(reason), &refusals).unwrap_or_default())
                }
                UnattendedTurnEnd::Stopped => Err(RUN_STOPPED.to_string()),
                UnattendedTurnEnd::TimedOut => Err(time_limit_message(limit)),
            }
        }

        SchedulerActionType::Notification => {
            let message = action_data
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Scheduled notification");

            let title = action_data
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(job_name);

            tracing::info!("[Scheduler] Sending notification: {} - {}", title, message);

            deliver_reminder(app_handle, job_id, title, message)
                .await
                .map(|()| None)
        }

        SchedulerActionType::MemorySummarization => {
            use tauri::Manager;

            let settings_state = app_handle
                .try_state::<crate::sys::commands::settings::SettingsState>()
                .ok_or_else(|| {
                    "SettingsState not available. Memory summarization skipped.".to_string()
                })?;
            let (memory_generation_enabled, include_tool_assisted) = {
                let settings = settings_state.settings.lock().await;
                settings
                    .chat_preferences
                    .as_ref()
                    .map(|preferences| {
                        (
                            preferences.memory_enabled && preferences.auto_save_memories,
                            preferences.allow_tool_assisted_memory_generation,
                        )
                    })
                    .unwrap_or((false, false))
            };
            if !memory_generation_enabled {
                tracing::info!(
                    "[Scheduler] Memory summarization skipped because memory generation is disabled"
                );
                return Ok(None);
            }

            let max_conversations = action_data
                .get("max_conversations")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(50);

            let summarizer_state = app_handle
                .try_state::<crate::sys::commands::memory::ConversationSummarizerState>()
                .ok_or_else(|| {
                    "ConversationSummarizerState not available. Summarization skipped.".to_string()
                })?;
            let memory_state = app_handle
                .try_state::<crate::sys::commands::memory::MemoryState>()
                .ok_or_else(|| "MemoryState not available. Summarization skipped.".to_string())?;
            let db = app_handle
                .try_state::<crate::sys::commands::chat::state::AppDatabase>()
                .ok_or_else(|| "AppDatabase not available. Summarization skipped.".to_string())?;

            let ollama_url = match app_handle.try_state::<crate::sys::commands::llm::LLMState>() {
                Some(llm_state) => {
                    crate::sys::commands::llm::configured_ollama_url(&llm_state.router).await
                }
                None => crate::core::llm::OLLAMA_DEFAULT_BASE_URL.to_string(),
            };
            let outcome = summarizer_state
                .summarizer
                .run(
                    &db,
                    &memory_state.manager,
                    include_tool_assisted,
                    max_conversations,
                    &ollama_url,
                )
                .await
                .map_err(|e| format!("Memory summarization failed: {}", e))?;
            tracing::info!("[Scheduler] Memory summarization: {:?}", outcome);
            Ok(None)
        }

        SchedulerActionType::MemoryDecay => {
            use tauri::Manager;

            tracing::info!("[Scheduler] Running weekly memory decay");

            let memory_state = app_handle
                .try_state::<crate::sys::commands::memory::MemoryState>()
                .ok_or_else(|| "MemoryState not available. Memory decay skipped.".to_string())?;

            match memory_state.manager.decay_memories() {
                Ok(result) => {
                    tracing::info!(
                        "[Scheduler] Weekly memory decay complete: {} memories decayed, {} at minimum, {} total importance removed",
                        result.memories_decayed,
                        result.at_minimum,
                        result.total_decay
                    );
                    Ok(None)
                }
                Err(e) => {
                    tracing::error!("[Scheduler] Weekly memory decay failed: {}", e);
                    Err(format!("Memory decay failed: {}", e))
                }
            }
        }
    }
}

/// Get execution history for scheduled jobs
///
/// Returns a list of past job execution records, optionally filtered by job ID.
///
/// # Arguments
/// * `job_id` - Optional job ID to filter history for a specific job
///
/// # Returns
/// A vector of JobExecutionRecord entries sorted by most recent first
#[tauri::command]
pub async fn scheduler_get_history(
    job_id: Option<String>,
    state: State<'_, SchedulerState>,
) -> Result<Vec<JobExecutionRecord>> {
    let history = state
        .execution_history
        .read()
        .map_err(|e| Error::Generic(format!("Failed to acquire history read lock: {}", e)))?;

    let filtered: Vec<JobExecutionRecord> = if let Some(ref target_id) = job_id {
        history
            .iter()
            .filter(|record| record.job_id == *target_id)
            .cloned()
            .collect()
    } else {
        history.clone()
    };

    // Return most recent first
    let mut result = filtered;
    result.reverse();

    Ok(result)
}

/// Whether scheduled tasks keep the computer awake while any is active.
#[tauri::command]
pub async fn scheduler_get_keep_awake(state: State<'_, SchedulerState>) -> Result<bool> {
    Ok(state.keep_awake.load(Ordering::SeqCst))
}

/// Turns keep-awake on or off. Tasks still run only while the app is open.
#[tauri::command]
pub async fn scheduler_set_keep_awake(
    enabled: bool,
    state: State<'_, SchedulerState>,
) -> Result<()> {
    if let Some(store) = &state.run_store {
        store.set_keep_awake(enabled)?;
    }
    state.keep_awake.store(enabled, Ordering::SeqCst);
    Ok(())
}

/// What the task form can change. A field left out is left as it is; a field
/// the form does not have is refused rather than dropped.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduledJobUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub schedule: Option<serde_json::Value>,
    pub prompt: Option<String>,
}

/// Applies an edit to a job, or says why it cannot be saved. The form sends
/// the schedule every time, so one that matches what is stored changes
/// nothing: a finished one-time task can be renamed without being given a
/// new time. A new schedule puts a finished task back on.
fn apply_update(
    job: &mut ScheduledJob,
    updates: ScheduledJobUpdate,
    now: DateTime<Utc>,
) -> Result<()> {
    if let Some(name) = updates.name {
        let name = name.trim();
        if name.is_empty() {
            return Err(Error::Generic(TASK_NEEDS_A_NAME.to_string()));
        }
        job.name = name.to_string();
    }
    if let Some(description) = updates.description {
        job.description = stated(Some(description));
    }
    if let Some(prompt) = updates.prompt {
        if job.action_type != SchedulerActionType::AgiTask {
            return Err(Error::Generic(
                "Only an AI task has a prompt to edit.".to_string(),
            ));
        }
        let prompt = prompt.trim();
        if prompt.is_empty() {
            return Err(Error::Generic(TASK_NEEDS_A_PROMPT.to_string()));
        }
        if !job.action_data.is_object() {
            job.action_data = serde_json::json!({});
        }
        job.action_data["prompt"] = serde_json::Value::String(prompt.to_string());
    }
    if let Some(schedule) = updates.schedule {
        let stated_plan = TaskSchedule::from_value(schedule).map_err(Error::Generic)?;
        if job.plan.as_ref() != Some(&stated_plan) {
            let plan = stated_plan.checked(now).map_err(Error::Generic)?;
            job.schedule = schedule_label(&plan);
            job.next_run = plan.next_after(now);
            job.plan = Some(plan);
            if job.status == JobStatus::Completed {
                job.status = JobStatus::Active;
                job.failure_count = 0;
                job.last_problem = None;
            }
        }
    }
    job.updated_at = now;
    Ok(())
}

/// Update a scheduled job with partial changes
///
/// # Arguments
/// * `id` - The unique identifier of the job to update
/// * `updates` - A partial object with fields to update
///
/// # Returns
/// `true` if the job was found and updated
#[tauri::command]
pub async fn scheduler_update_job(
    id: String,
    updates: ScheduledJobUpdate,
    state: State<'_, SchedulerState>,
    app_handle: tauri::AppHandle,
) -> Result<bool> {
    let updated = {
        let mut jobs = state
            .scheduler
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;
        let job = jobs
            .get_mut(&id)
            .ok_or_else(|| Error::Generic(format!("Job not found: {}", id)))?;

        let mut edited = job.clone();
        apply_update(&mut edited, updates, Utc::now())?;
        state.scheduler.persist(&edited)?;
        *job = edited.clone();
        edited
    };

    // The write lock is released before emitting: a listener that calls back
    // into a scheduler command would otherwise deadlock on the same RwLock.
    emit_scheduler_event(&app_handle, "scheduler:job_updated", updated);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn a_job_keeps_the_mode_the_app_was_in_when_it_was_made() {
        let _local_app = crate::sys::account::app_mode::AppModeTestGuard::local().await;
        assert_eq!(JobRunMode::of_app_mode(false), JobRunMode::Local);
        assert_eq!(JobRunMode::of_app_mode(true), JobRunMode::Cloud);

        let mut job = ScheduledJob::new(
            "Morning summary".to_string(),
            "0 0 9 * * *".to_string(),
            SchedulerActionType::AgiTask,
            json!({ "prompt": "Summarise my inbox", "runMode": "cloud" }),
        )
        .unwrap();
        assert_eq!(
            job.run_mode,
            JobRunMode::Local,
            "the mode comes from the app, never from the action data a model can write"
        );

        job.run_mode = JobRunMode::Cloud;
        let stored = serde_json::to_value(&job).unwrap();
        assert_eq!(stored["runMode"], "cloud");
        let reloaded: ScheduledJob = serde_json::from_value(stored).unwrap();
        assert_eq!(reloaded.run_mode, JobRunMode::Cloud);
    }

    #[test]
    fn a_job_stored_before_modes_were_recorded_runs_local() {
        let job = ScheduledJob::new(
            "Morning summary".to_string(),
            "0 0 9 * * *".to_string(),
            SchedulerActionType::AgiTask,
            json!({ "prompt": "Summarise my inbox" }),
        )
        .unwrap();
        let mut stored = serde_json::to_value(&job).unwrap();
        stored.as_object_mut().unwrap().remove("runMode");

        let reloaded: ScheduledJob = serde_json::from_value(stored).unwrap();

        assert_eq!(reloaded.run_mode, JobRunMode::Local);
    }

    #[test]
    fn a_scheduled_run_stays_inside_its_job_boundary() {
        use agiworkforce_model_registry::TrustMode;

        for (cloud_app_mode, signed_in) in [(false, false), (true, false), (true, true)] {
            assert_eq!(
                scheduled_trust_mode(JobRunMode::Local, cloud_app_mode, signed_in),
                Ok(TrustMode::Local),
                "a Local job never reaches AGI Cloud, whatever the app is doing now"
            );
        }
        assert_eq!(
            scheduled_trust_mode(JobRunMode::Cloud, true, true),
            Ok(TrustMode::ManagedCloud)
        );
        for signed_in in [false, true] {
            assert_eq!(
                scheduled_trust_mode(JobRunMode::Cloud, false, signed_in),
                Err(CLOUD_JOB_NEEDS_CLOUD_MODE.to_string()),
                "a Cloud job never falls back to a local model"
            );
        }
        assert_eq!(
            scheduled_trust_mode(JobRunMode::Cloud, true, false),
            Err(CLOUD_JOB_NEEDS_SIGN_IN.to_string())
        );
    }

    #[test]
    fn a_run_is_missed_only_when_it_is_more_than_a_poll_late() {
        let now = Utc::now();
        assert!(!is_missed_run(now - chrono::Duration::seconds(30), now));
        assert!(is_missed_run(now - chrono::Duration::hours(2), now));
    }

    #[test]
    fn a_run_missed_beyond_the_window_is_skipped_without_running() {
        let scheduler = ProactiveScheduler::new();
        let id = scheduler
            .add_job(
                "Weekly report".to_string(),
                "0 0 9 * * *".to_string(),
                SchedulerActionType::Notification,
                json!({ "message": "hi" }),
            )
            .unwrap();
        let long_ago = Utc::now() - chrono::Duration::days(CATCH_UP_WINDOW_DAYS + 1);
        scheduler
            .jobs
            .write()
            .unwrap()
            .get_mut(&id)
            .unwrap()
            .next_run = Some(long_ago);

        assert!(due_too_long_ago(&scheduler, &id, Utc::now()));
        assert!(scheduler.skip_missed_run(&id).unwrap());

        let job = scheduler.get_job(&id).unwrap().unwrap();
        assert_eq!(job.run_count, 0);
        assert!(job.next_run.unwrap() > Utc::now());
    }

    #[test]
    fn a_run_missed_within_the_window_is_caught_up() {
        let scheduler = ProactiveScheduler::new();
        let id = scheduler
            .add_job(
                "Daily digest".to_string(),
                "0 0 9 * * *".to_string(),
                SchedulerActionType::Notification,
                json!({ "message": "hi" }),
            )
            .unwrap();
        let yesterday = Utc::now() - chrono::Duration::days(1);
        scheduler
            .jobs
            .write()
            .unwrap()
            .get_mut(&id)
            .unwrap()
            .next_run = Some(yesterday);

        assert!(!due_too_long_ago(&scheduler, &id, Utc::now()));
    }

    #[test]
    fn maintenance_jobs_run_without_notifications() {
        assert!(!notifies_on_run(&SchedulerActionType::MemorySummarization));
        assert!(!notifies_on_run(&SchedulerActionType::MemoryDecay));
        assert!(!notifies_on_run(&SchedulerActionType::Notification));
        assert!(notifies_on_run(&SchedulerActionType::AgiTask));
    }

    #[test]
    fn run_notifications_say_whether_the_run_failed_or_caught_up() {
        let failed = scheduled_run_notification("j1", "Backup", Some("disk full"), None, 0);
        assert!(failed.title.contains("failed"));
        assert_eq!(failed.message, "disk full");

        let due = Utc::now() - chrono::Duration::hours(5);
        let stated = local_due_time(due);
        let caught_up = scheduled_run_notification("j1", "Backup", None, Some(due), 0);
        assert!(caught_up.title.contains("missed"));
        assert!(
            caught_up.message.contains(&format!("It was due {stated},")),
            "{}",
            caught_up.message
        );
        let failed_late =
            scheduled_run_notification("j1", "Backup", Some("disk full"), Some(due), 0);
        assert_eq!(
            failed_late.message,
            format!("It ran late: it was due {stated}. disk full")
        );

        let ran = scheduled_run_notification("j1", "Backup", None, None, 0);
        assert!(ran.title.contains("ran"));
        assert_eq!(ran.action_url.as_deref(), Some("schedule:j1"));
    }

    #[test]
    fn a_run_that_was_refused_a_tool_does_not_claim_it_finished_cleanly() {
        let report = "Summary written.\nNot run unattended: 'browser_navigate' needs your approval, and nobody was here to give it.\nNot run unattended: 'search_web' needs your approval, and nobody was here to give it.";
        assert_eq!(refused_tool_count(Some(report)), 2);
        assert_eq!(refused_tool_count(Some("Summary written.")), 0);
        assert_eq!(refused_tool_count(None), 0);

        let partly = scheduled_run_notification("j1", "Morning summary", None, None, 2);
        assert!(partly.title.contains("steps left out"), "{}", partly.title);
        assert!(
            partly.message.starts_with("2 steps did not run"),
            "{}",
            partly.message
        );
        assert_eq!(partly.action_url.as_deref(), Some("schedule:j1"));

        let one = scheduled_run_notification("j1", "Morning summary", None, Some(Utc::now()), 1);
        assert!(
            one.message.starts_with("1 step did not run"),
            "{}",
            one.message
        );
    }

    #[test]
    fn recorded_runs_reach_the_disk_and_survive_a_restart() {
        let (_dir, db_path) = temp_db_path();
        let state = SchedulerState::new_with_store(&db_path).unwrap();
        record_execution(
            &state.execution_history,
            state.run_store.as_deref(),
            JobExecutionRecord {
                id: 1,
                job_id: "job-1".to_string(),
                started_at: Utc::now().to_rfc3339(),
                completed_at: Some(Utc::now().to_rfc3339()),
                status: ExecutionStatus::Completed,
                error: None,
                duration_ms: Some(5),
                output: None,
            },
        );

        let restarted = SchedulerState::new_with_store(&db_path).unwrap();
        let history = restarted.execution_history.read().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].job_id, "job-1");
    }

    #[test]
    fn test_scheduled_job_creation() {
        let job = ScheduledJob::new(
            "Test Job".to_string(),
            "0 0 9 * * *".to_string(),
            SchedulerActionType::Notification,
            json!({"message": "Hello!"}),
        );
        assert!(job.is_ok());
        let job = job.unwrap();
        assert_eq!(job.name, "Test Job");
        assert_eq!(job.action_type, SchedulerActionType::Notification);
        assert_eq!(job.status, JobStatus::Active);
        assert!(job.next_run.is_some());
    }

    #[test]
    fn test_scheduled_job_invalid_cron() {
        let job = ScheduledJob::new(
            "Bad Job".to_string(),
            "invalid cron".to_string(),
            SchedulerActionType::Notification,
            json!({}),
        );
        assert!(job.is_err());
    }

    #[test]
    fn test_proactive_scheduler_add_remove() {
        let scheduler = ProactiveScheduler::new();

        let job_id = scheduler
            .add_job(
                "Test".to_string(),
                "0 0 * * * *".to_string(),
                SchedulerActionType::Notification,
                json!({}),
            )
            .unwrap();

        assert!(!job_id.is_empty());

        let jobs = scheduler.list_jobs().unwrap();
        assert_eq!(jobs.len(), 1);

        let removed = scheduler.remove_job(&job_id).unwrap();
        assert!(removed);

        let jobs = scheduler.list_jobs().unwrap();
        assert!(jobs.is_empty());
    }

    #[test]
    fn test_proactive_scheduler_pause_resume() {
        let scheduler = ProactiveScheduler::new();

        let job_id = scheduler
            .add_job(
                "Test".to_string(),
                "0 0 * * * *".to_string(),
                SchedulerActionType::AgiTask,
                json!({"prompt": "Do something"}),
            )
            .unwrap();

        // Initial status should be Active
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Active);

        // Pause the job
        let paused = scheduler.pause_job(&job_id).unwrap();
        assert!(paused);
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Paused);

        // Pausing again should return false
        let paused_again = scheduler.pause_job(&job_id).unwrap();
        assert!(!paused_again);

        // Resume the job
        let resumed = scheduler.resume_job(&job_id).unwrap();
        assert!(resumed);
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Active);
    }

    fn hourly_job(scheduler: &ProactiveScheduler) -> String {
        scheduler
            .add_job(
                "Test".to_string(),
                "0 0 * * * *".to_string(),
                SchedulerActionType::Notification,
                json!({ "message": "hello" }),
            )
            .unwrap()
    }

    fn in_an_hour() -> i64 {
        (Utc::now() + chrono::Duration::hours(1)).timestamp_millis()
    }

    fn task(schedule: serde_json::Value) -> Result<ScheduledJob> {
        prompt_task("Morning summary", "Summarise my inbox", schedule, None)
    }

    #[test]
    fn a_run_is_counted_and_a_success_clears_the_failures_before_it() {
        let scheduler = ProactiveScheduler::new();
        let job_id = hourly_job(&scheduler);

        assert_eq!(
            scheduler
                .mark_job_run(&job_id, RunOutcome::Failed("no network".to_string()))
                .unwrap(),
            AfterRun::Continues
        );
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!((job.run_count, job.failure_count), (1, 1));
        assert_eq!(
            job.last_problem,
            Some(RunProblem::failed("no network".to_string()))
        );

        scheduler
            .mark_job_run(&job_id, RunOutcome::Succeeded(Some("done".to_string())))
            .unwrap();
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!((job.run_count, job.failure_count), (2, 0));
        assert!(job.last_run.is_some());
        assert_eq!(job.last_output.as_deref(), Some("done"));
        assert_eq!(job.last_problem, None);
        assert_eq!(job.status, JobStatus::Active);

        assert_eq!(
            scheduler
                .mark_job_run("no-such-job", RunOutcome::Succeeded(None))
                .unwrap(),
            AfterRun::NoSuchJob
        );
    }

    #[test]
    fn the_third_failure_in_a_row_stops_a_task_and_turning_it_back_on_starts_the_count_again() {
        let scheduler = ProactiveScheduler::new();
        let job_id = hourly_job(&scheduler);
        let fail = || {
            scheduler
                .mark_job_run(&job_id, RunOutcome::Failed("no network".to_string()))
                .unwrap()
        };

        assert_eq!(fail(), AfterRun::Continues);
        assert_eq!(fail(), AfterRun::Continues);
        assert_eq!(fail(), AfterRun::StoppedAfterFailures);
        let stopped = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(stopped.status, JobStatus::Failed);
        assert_eq!(stopped.failure_count, FAILURES_BEFORE_A_TASK_IS_STOPPED);
        assert_eq!(
            fail(),
            AfterRun::Continues,
            "a run asked for by hand on a stopped task does not stop it a second time"
        );

        let notice = stopped_task_notification(&job_id, "Morning summary", "no network");
        assert!(notice.title.contains("stopped"), "{}", notice.title);
        assert!(notice.message.contains("3 times"), "{}", notice.message);
        assert!(notice.message.contains("no network"), "{}", notice.message);
        assert!(
            notice.message.contains("turn it back on"),
            "{}",
            notice.message
        );
        assert_eq!(
            notice.action_url.as_deref(),
            Some(format!("schedule:{job_id}").as_str())
        );

        assert!(scheduler.resume_job(&job_id).unwrap());
        let back_on = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(back_on.status, JobStatus::Active);
        assert_eq!(back_on.failure_count, 0);
        assert_eq!(back_on.last_problem, None);
        assert!(back_on.next_run.unwrap() > Utc::now());
        assert_eq!(fail(), AfterRun::Continues);
    }

    #[tokio::test]
    async fn a_cloud_task_due_in_local_mode_is_skipped_and_never_loses_a_strike() {
        let _local_app = crate::sys::account::app_mode::AppModeTestGuard::local().await;
        assert_eq!(
            mode_refusal(&SchedulerActionType::AgiTask, JobRunMode::Cloud).as_deref(),
            Some(CLOUD_JOB_NEEDS_CLOUD_MODE)
        );
        assert_eq!(
            mode_refusal(&SchedulerActionType::AgiTask, JobRunMode::Local),
            None
        );
        assert_eq!(
            mode_refusal(&SchedulerActionType::Notification, JobRunMode::Cloud),
            None,
            "a reminder reaches no model"
        );

        let scheduler = ProactiveScheduler::new();
        let job_id = hourly_job(&scheduler);
        for _ in 0..5 {
            assert_eq!(
                scheduler
                    .mark_job_run(
                        &job_id,
                        RunOutcome::Skipped(CLOUD_JOB_NEEDS_CLOUD_MODE.to_string())
                    )
                    .unwrap(),
                AfterRun::Continues
            );
        }
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Active);
        assert_eq!((job.run_count, job.failure_count), (0, 0));
        assert!(job.last_run.is_none());
        assert!(job.next_run.unwrap() > Utc::now());
        assert_eq!(
            job.last_problem,
            Some(RunProblem::skipped(CLOUD_JOB_NEEDS_CLOUD_MODE.to_string()))
        );

        let notice =
            skipped_run_notification(&job_id, "Morning summary", CLOUD_JOB_NEEDS_CLOUD_MODE);
        assert!(notice.title.contains("skipped"), "{}", notice.title);
        assert_eq!(notice.message, CLOUD_JOB_NEEDS_CLOUD_MODE);
    }

    #[test]
    fn the_task_form_creates_every_schedule_it_offers() {
        let zone = "America/New_York";
        for (schedule, stored_as) in [
            (
                json!({ "type": "recurring", "interval": "hourly", "timezone": zone }),
                "0 * * * *",
            ),
            (
                json!({ "type": "recurring", "interval": "daily", "timeOfDay": "07:30", "timezone": zone }),
                "30 7 * * *",
            ),
            (
                json!({ "type": "recurring", "interval": "weekly", "timeOfDay": "09:00", "weekday": 1, "timezone": zone }),
                "0 9 * * 1",
            ),
            (
                json!({ "type": "recurring", "interval": "monthly", "timeOfDay": "09:00", "dayOfMonth": 15, "timezone": zone }),
                "0 9 15 * *",
            ),
            (
                json!({ "type": "recurring", "interval": "custom", "cronExpression": "0 9 * * *", "timezone": zone }),
                "0 9 * * *",
            ),
        ] {
            let job = task(schedule.clone()).unwrap_or_else(|error| panic!("{schedule}: {error}"));
            assert_eq!(job.schedule, stored_as);
            assert_eq!(job.action_type, SchedulerActionType::AgiTask);
            assert_eq!(job.action_data, json!({ "prompt": "Summarise my inbox" }));
            assert_eq!(job.status, JobStatus::Active);
            let plan = job.plan.as_ref().expect("the schedule as it was stated");
            assert_eq!(plan.timezone.as_deref(), Some(zone));
            assert_eq!(job.next_run, plan.next_after(job.created_at));
            assert!(job.next_run.unwrap() > Utc::now());
        }
    }

    #[test]
    fn a_task_set_to_run_once_is_stored_as_once_runs_once_and_is_then_done() {
        let at = in_an_hour();
        let scheduler = ProactiveScheduler::new();
        let job_id = scheduler
            .insert_job(task(json!({ "type": "once", "runAt": at })).unwrap())
            .unwrap();

        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.schedule, ONCE_SCHEDULE_LABEL);
        assert_eq!(job.next_run.map(|run| run.timestamp_millis()), Some(at));
        assert!(job.runs_once());

        scheduler
            .jobs
            .write()
            .unwrap()
            .get_mut(&job_id)
            .unwrap()
            .plan = Some(TaskSchedule::once(
            Utc::now() - chrono::Duration::seconds(1),
        ));
        assert_eq!(
            scheduler
                .mark_job_run(&job_id, RunOutcome::Succeeded(None))
                .unwrap(),
            AfterRun::Finished
        );
        let done = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(done.status, JobStatus::Completed);
        assert_eq!(done.next_run, None);
        assert_eq!(done.run_count, 1);
        assert!(!scheduler.resume_job(&job_id).unwrap());
    }

    #[test]
    fn running_a_one_time_task_before_its_time_leaves_it_to_run_at_its_time() {
        let at = in_an_hour();
        let scheduler = ProactiveScheduler::new();
        let job_id = scheduler
            .insert_job(task(json!({ "type": "once", "runAt": at })).unwrap())
            .unwrap();

        assert_eq!(
            scheduler
                .mark_job_run(&job_id, RunOutcome::Succeeded(Some("early".to_string())))
                .unwrap(),
            AfterRun::Continues
        );
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Active);
        assert_eq!(job.run_count, 1);
        assert_eq!(job.next_run.map(|run| run.timestamp_millis()), Some(at));
    }

    #[test]
    fn a_stopped_run_is_not_a_run_or_a_failure_and_the_task_keeps_its_schedule() {
        let scheduler = ProactiveScheduler::new();
        let job_id = hourly_job(&scheduler);
        for _ in 0..5 {
            assert_eq!(
                scheduler
                    .mark_job_run(&job_id, RunOutcome::Stopped)
                    .unwrap(),
                AfterRun::Continues
            );
        }
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Active);
        assert_eq!((job.run_count, job.failure_count), (0, 0));
        assert!(job.next_run.unwrap() > Utc::now());
        assert_eq!(
            job.last_problem,
            Some(RunProblem::skipped(RUN_STOPPED.to_string()))
        );
    }

    #[test]
    fn a_late_run_is_recorded_with_when_it_had_been_due_until_the_next_run() {
        let scheduler = ProactiveScheduler::new();
        let job_id = hourly_job(&scheduler);
        let due = Utc::now() - chrono::Duration::hours(3);

        scheduler
            .mark_late_job_run(&job_id, RunOutcome::Succeeded(None), Some(due))
            .unwrap();
        assert_eq!(
            scheduler
                .get_job(&job_id)
                .unwrap()
                .unwrap()
                .last_run_was_due,
            Some(due)
        );

        scheduler
            .mark_job_run(&job_id, RunOutcome::Succeeded(None))
            .unwrap();
        assert_eq!(
            scheduler
                .get_job(&job_id)
                .unwrap()
                .unwrap()
                .last_run_was_due,
            None
        );
    }

    #[tokio::test]
    async fn a_run_can_be_asked_to_stop_before_or_while_it_waits() {
        let state = SchedulerState::new();
        let runner = state.runner();
        assert!(!state.stop_run("job-1"), "nothing is running");

        let claim = runner.claim("job-1").expect("an idle job can be claimed");
        assert_eq!(state.running_job_ids(), vec!["job-1".to_string()]);
        assert!(!claim.stop.was_asked());

        assert!(state.stop_run("job-1"));
        assert!(claim.stop.was_asked());
        tokio::time::timeout(Duration::from_secs(1), claim.stop.asked())
            .await
            .expect("a stop asked before the wait is still seen by it");

        drop(claim);
        assert!(state.running_job_ids().is_empty());
        assert!(!state.stop_run("job-1"));
    }

    #[test]
    fn deleting_a_task_leaves_nothing_for_its_run_to_report_against() {
        let scheduler = ProactiveScheduler::new();
        let job_id = hourly_job(&scheduler);
        assert!(scheduler.remove_job(&job_id).unwrap());
        assert_eq!(
            scheduler
                .mark_job_run(&job_id, RunOutcome::Stopped)
                .unwrap(),
            AfterRun::NoSuchJob
        );
    }

    #[test]
    fn a_one_time_task_that_could_not_start_waits_to_be_turned_back_on() {
        let scheduler = ProactiveScheduler::new();
        let job_id = scheduler
            .insert_job(task(json!({ "type": "once", "runAt": in_an_hour() })).unwrap())
            .unwrap();
        scheduler
            .jobs
            .write()
            .unwrap()
            .get_mut(&job_id)
            .unwrap()
            .plan = Some(TaskSchedule::once(
            Utc::now() - chrono::Duration::seconds(1),
        ));

        assert_eq!(
            scheduler
                .mark_job_run(
                    &job_id,
                    RunOutcome::Skipped(CLOUD_JOB_NEEDS_CLOUD_MODE.to_string())
                )
                .unwrap(),
            AfterRun::Continues
        );
        let waiting = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(waiting.status, JobStatus::Paused);
        assert_eq!(waiting.run_count, 0);

        let before = Utc::now();
        assert!(scheduler.resume_job(&job_id).unwrap());
        let back_on = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(back_on.status, JobStatus::Active);
        assert!(
            back_on.next_run.unwrap() >= before,
            "its time has passed, so it runs at the next poll"
        );
    }

    #[test]
    fn a_schedule_the_form_cannot_mean_is_refused_and_nothing_is_stored() {
        let past = (Utc::now() - chrono::Duration::hours(1)).timestamp_millis();
        for schedule in [
            json!({ "type": "once" }),
            json!({ "type": "once", "runAt": past }),
            json!({ "type": "recurring", "interval": "custom", "cronExpression": "whenever" }),
            json!({ "type": "recurring", "interval": "daily", "timezone": "Mars/Olympus" }),
            json!("0 0 9 * * *"),
            json!(null),
        ] {
            assert!(task(schedule.clone()).is_err(), "{schedule}");
        }

        let daily = json!({ "type": "recurring", "interval": "daily" });
        assert!(prompt_task("  ", "Summarise my inbox", daily.clone(), None)
            .unwrap_err()
            .to_string()
            .contains(TASK_NEEDS_A_NAME));
        assert!(prompt_task("Morning summary", " ", daily.clone(), None)
            .unwrap_err()
            .to_string()
            .contains(TASK_NEEDS_A_PROMPT));

        let described = prompt_task(
            " Morning summary ",
            " Summarise my inbox ",
            daily,
            Some(" Before stand-up ".to_string()),
        )
        .unwrap();
        assert_eq!(described.name, "Morning summary");
        assert_eq!(described.description.as_deref(), Some("Before stand-up"));
    }

    fn edit(fields: serde_json::Value) -> ScheduledJobUpdate {
        serde_json::from_value(fields).expect("an edit the form can send")
    }

    #[test]
    fn an_edit_saves_the_schedule_the_form_shows() {
        let zone = "America/New_York";
        let mut job = task(json!({
            "type": "recurring", "interval": "daily", "timeOfDay": "09:00", "timezone": zone
        }))
        .unwrap();
        let now = Utc::now();

        apply_update(
            &mut job,
            edit(json!({
                "name": "Weekly summary",
                "description": "Fridays",
                "prompt": "Summarise the week",
                "schedule": {
                    "type": "recurring", "interval": "weekly", "timeOfDay": "16:00", "weekday": 5,
                    "timezone": zone
                }
            })),
            now,
        )
        .unwrap();

        assert_eq!(job.name, "Weekly summary");
        assert_eq!(job.description.as_deref(), Some("Fridays"));
        assert_eq!(job.action_data["prompt"], "Summarise the week");
        assert_eq!(job.schedule, "0 16 * * 5");
        let plan = job.plan.clone().expect("the new schedule");
        assert_eq!(plan.weekday, Some(5));
        assert_eq!(job.next_run, plan.next_after(now));

        for (schedule, stored_as) in [
            (
                json!({ "type": "recurring", "interval": "hourly", "timezone": zone }),
                "0 * * * *",
            ),
            (
                json!({ "type": "recurring", "interval": "monthly", "dayOfMonth": 2, "timezone": zone }),
                "0 9 2 * *",
            ),
            (
                json!({ "type": "recurring", "interval": "custom", "cronExpression": "0 9 * * *", "timezone": zone }),
                "0 9 * * *",
            ),
            (
                json!({ "type": "once", "runAt": in_an_hour(), "timezone": zone }),
                ONCE_SCHEDULE_LABEL,
            ),
        ] {
            apply_update(&mut job, edit(json!({ "schedule": schedule })), now).unwrap();
            assert_eq!(job.schedule, stored_as);
        }
        assert!(job.runs_once());

        let refused = apply_update(
            &mut job,
            edit(
                json!({ "schedule": { "type": "recurring", "interval": "custom", "cronExpression": "" } }),
            ),
            now,
        );
        assert!(
            refused.is_err(),
            "an edit that cannot be stored is not reported as saved"
        );
        assert!(job.runs_once(), "and leaves the schedule as it was");

        for field in ["modelId", "status", "actionType"] {
            assert!(
                serde_json::from_value::<ScheduledJobUpdate>(json!({ field: "x" })).is_err(),
                "{field} is not something the form can change"
            );
        }
    }

    #[test]
    fn a_finished_task_is_renamed_as_it_is_and_put_back_on_by_a_new_time() {
        let mut job = task(json!({ "type": "once", "runAt": in_an_hour() })).unwrap();
        let had_its_time = TaskSchedule::once(Utc::now() - chrono::Duration::minutes(5));
        job.plan = Some(had_its_time.clone());
        job.status = JobStatus::Completed;
        job.next_run = None;
        let now = Utc::now();

        apply_update(
            &mut job,
            edit(json!({
                "name": "Renamed",
                "schedule": serde_json::to_value(&had_its_time).unwrap()
            })),
            now,
        )
        .expect("the schedule is unchanged, so its time being past is not an error");
        assert_eq!(job.name, "Renamed");
        assert_eq!(job.status, JobStatus::Completed);

        let again = in_an_hour();
        apply_update(
            &mut job,
            edit(json!({ "schedule": { "type": "once", "runAt": again } })),
            now,
        )
        .unwrap();
        assert_eq!(job.status, JobStatus::Active);
        assert_eq!(job.next_run.map(|run| run.timestamp_millis()), Some(again));
    }

    #[test]
    fn a_job_stored_before_schedules_were_typed_still_loads_and_runs_on_its_cron() {
        let job = ScheduledJob::new(
            "Nightly".to_string(),
            "0 0 3 * * *".to_string(),
            SchedulerActionType::MemorySummarization,
            json!({}),
        )
        .unwrap();
        let mut stored = serde_json::to_value(&job).unwrap();
        let fields = stored.as_object_mut().unwrap();
        fields.remove("plan");
        fields.remove("lastProblem");

        let reloaded: ScheduledJob = serde_json::from_value(stored).unwrap();
        assert_eq!(reloaded.plan, None);
        assert_eq!(reloaded.last_problem, None);
        assert!(reloaded.calculate_next_run().unwrap() > Utc::now());
    }

    #[test]
    fn a_stored_job_of_a_kind_the_app_can_no_longer_create_still_loads() {
        for kind in ["shellCommand", "script", "webhook", "workflow"] {
            let job = ScheduledJob::new(
                "Old".to_string(),
                "0 0 3 * * *".to_string(),
                SchedulerActionType::Notification,
                json!({ "command": "echo hi", "url": "https://example.com/hook" }),
            )
            .unwrap();
            let mut stored = serde_json::to_value(&job).unwrap();
            stored["actionType"] = json!(kind);
            let reloaded: ScheduledJob = serde_json::from_value(stored).unwrap();
            assert_ne!(reloaded.action_type, SchedulerActionType::Notification);
            assert!(mode_refusal(&reloaded.action_type, reloaded.run_mode).is_none());
        }
    }

    #[test]
    fn test_scheduler_state_creation() {
        let state = SchedulerState::new();
        assert!(Arc::strong_count(&state.scheduler) >= 1);
    }

    #[test]
    fn a_job_runs_once_at_a_time_and_frees_its_place_when_the_run_ends() {
        let state = SchedulerState::new();
        let runner = state.runner();

        let first = runner.claim("job-1").expect("an idle job can be claimed");
        assert!(runner.is_running("job-1"));
        assert!(runner.claim("job-1").is_none());
        let other = runner.claim("job-2").expect("another job runs alongside");
        assert_eq!(state.runs_in_flight(), 2);

        drop(first);
        assert!(!runner.is_running("job-1"));
        assert_eq!(state.runs_in_flight(), 1);
        assert!(runner.claim("job-1").is_some());

        drop(other);
        assert_eq!(state.runs_in_flight(), 0);
    }

    #[test]
    fn concurrent_runs_are_bounded() {
        let state = SchedulerState::new();
        assert_eq!(
            state.run_slots.available_permits(),
            MAX_CONCURRENT_SCHEDULED_RUNS
        );
    }

    #[test]
    fn a_run_reports_the_tools_it_was_refused_alongside_what_it_produced() {
        let refusal =
            "Not run unattended: 'email_send' needs your approval, and nobody was here to give it."
                .to_string();

        assert_eq!(
            with_refusals(Some("Drafted the summary".to_string()), &[]),
            Some("Drafted the summary".to_string())
        );
        assert_eq!(with_refusals(None, &[]), None);
        assert_eq!(
            with_refusals(None, std::slice::from_ref(&refusal)),
            Some(refusal.clone())
        );
        assert_eq!(
            with_refusals(Some("Drafted the summary".to_string()), &[refusal.clone()]),
            Some(format!("Drafted the summary\n{refusal}"))
        );
    }

    #[test]
    fn unavailable_scheduler_reports_why_instead_of_losing_schedules() {
        let reason = "Scheduled tasks are unavailable: disk full".to_string();
        let state = SchedulerState::unavailable(reason.clone());

        let listed = state.scheduler.list_jobs().unwrap_err();
        assert!(listed.to_string().contains(&reason));

        let added = state
            .scheduler
            .add_job(
                "Nightly".to_string(),
                "0 0 3 * * *".to_string(),
                SchedulerActionType::Notification,
                serde_json::json!({ "message": "hi" }),
            )
            .unwrap_err();
        assert!(added.to_string().contains(&reason));

        state.register_default_memory_jobs();
        assert!(state.scheduler.jobs.read().unwrap().is_empty());
        assert_eq!(state.runs_in_flight(), 0);
    }

    // ======================================================================
    // Persistence: restart-simulation and defaults-merge semantics
    // ======================================================================
    //
    // These tests simulate an app restart by constructing a *fresh*
    // ProactiveScheduler / SchedulerState against the same on-disk store,
    // rather than reusing the original in-memory instance, proving jobs
    // round-trip through disk, not just through the RwLock they started in.

    fn temp_db_path() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("scheduler_restart_test.db");
        (dir, path)
    }

    #[test]
    fn test_add_job_survives_restart_simulation() {
        let (_dir, db_path) = temp_db_path();

        let job_id = {
            let store = SchedulerStore::new(&db_path);
            store.init().unwrap();
            let scheduler = ProactiveScheduler::with_store(Arc::new(store));
            scheduler
                .add_job(
                    "Restart Test".to_string(),
                    "0 0 9 * * *".to_string(),
                    SchedulerActionType::Notification,
                    json!({ "message": "hi" }),
                )
                .unwrap()
        };
        // `scheduler` and its `store` are dropped here, nothing but the
        // db file on disk survives into the next block.

        let restarted = {
            let store = SchedulerStore::new(&db_path);
            store.init().unwrap();
            let jobs = store.load_all().unwrap();
            let scheduler = ProactiveScheduler::with_store(Arc::new(store));
            scheduler.hydrate(jobs).unwrap();
            scheduler
        };

        let job = restarted.get_job(&job_id).unwrap();
        assert!(
            job.is_some(),
            "job created before 'restart' must still exist after"
        );
        assert_eq!(job.unwrap().name, "Restart Test");
    }

    #[test]
    fn test_removed_job_stays_gone_after_restart_simulation() {
        let (_dir, db_path) = temp_db_path();

        let job_id = {
            let store = SchedulerStore::new(&db_path);
            store.init().unwrap();
            let scheduler = ProactiveScheduler::with_store(Arc::new(store));
            let id = scheduler
                .add_job(
                    "To Delete".to_string(),
                    "0 0 9 * * *".to_string(),
                    SchedulerActionType::Notification,
                    json!({}),
                )
                .unwrap();
            assert!(scheduler.remove_job(&id).unwrap());
            id
        };

        let restarted = {
            let store = SchedulerStore::new(&db_path);
            store.init().unwrap();
            let jobs = store.load_all().unwrap();
            let scheduler = ProactiveScheduler::with_store(Arc::new(store));
            scheduler.hydrate(jobs).unwrap();
            scheduler
        };

        assert!(restarted.get_job(&job_id).unwrap().is_none());
    }

    #[test]
    fn test_paused_status_survives_restart_simulation() {
        let (_dir, db_path) = temp_db_path();

        let job_id = {
            let store = SchedulerStore::new(&db_path);
            store.init().unwrap();
            let scheduler = ProactiveScheduler::with_store(Arc::new(store));
            let id = scheduler
                .add_job(
                    "Pause Me".to_string(),
                    "0 0 9 * * *".to_string(),
                    SchedulerActionType::Notification,
                    json!({}),
                )
                .unwrap();
            assert!(scheduler.pause_job(&id).unwrap());
            id
        };

        let restarted = {
            let store = SchedulerStore::new(&db_path);
            store.init().unwrap();
            let jobs = store.load_all().unwrap();
            let scheduler = ProactiveScheduler::with_store(Arc::new(store));
            scheduler.hydrate(jobs).unwrap();
            scheduler
        };

        let job = restarted.get_job(&job_id).unwrap().unwrap();
        assert_eq!(
            job.status,
            JobStatus::Paused,
            "a pause applied before 'restart' must not revert to Active after"
        );
    }

    #[test]
    fn test_add_job_persist_failure_does_not_mutate_memory() {
        // Point the store at a path whose parent directory does not exist,
        // so opening the connection fails, proving add_job leaves the
        // in-memory map untouched (and returns Err) rather than silently
        // diverging from disk.
        let unwritable_path = std::path::PathBuf::from("/nonexistent-dir-for-test/scheduler.db");
        let store = SchedulerStore::new(&unwritable_path);
        let scheduler = ProactiveScheduler::with_store(Arc::new(store));

        let result = scheduler.add_job(
            "Should Not Persist".to_string(),
            "0 0 9 * * *".to_string(),
            SchedulerActionType::Notification,
            json!({}),
        );

        assert!(result.is_err());
        assert!(scheduler.list_jobs().unwrap().is_empty());
    }

    #[test]
    fn test_default_memory_jobs_are_idempotent_and_edits_survive_across_relaunches() {
        let (_dir, db_path) = temp_db_path();

        // "Launch 1": fresh state, register defaults, then simulate a user
        // pausing one of them.
        let (first_ids, paused_id) = {
            let state = SchedulerState::new_with_store(&db_path).unwrap();
            state.register_default_memory_jobs();

            let jobs = state.scheduler.list_jobs().unwrap();
            assert_eq!(jobs.len(), 2, "expected the two default memory jobs");

            let summarization = jobs
                .iter()
                .find(|j| j.name == "memory_auto_summarization")
                .unwrap();
            state.scheduler.pause_job(&summarization.id).unwrap();

            let ids: std::collections::HashSet<String> =
                jobs.iter().map(|j| j.id.clone()).collect();
            (ids, summarization.id.clone())
        };

        // "Launch 2": brand new SchedulerState against the same db file.
        // hydration should find both defaults already present (by name),
        // so register_default_memory_jobs() must not create duplicates or
        // regenerate new ids, and the pause must still hold.
        let state2 = SchedulerState::new_with_store(&db_path).unwrap();
        state2.register_default_memory_jobs();

        let jobs2 = state2.scheduler.list_jobs().unwrap();
        assert_eq!(
            jobs2.len(),
            2,
            "defaults must not be duplicated across relaunches"
        );

        let second_ids: std::collections::HashSet<String> =
            jobs2.iter().map(|j| j.id.clone()).collect();
        assert_eq!(
            first_ids, second_ids,
            "default jobs must keep the same identity across relaunches"
        );

        let summarization2 = jobs2.iter().find(|j| j.id == paused_id).unwrap();
        assert_eq!(
            summarization2.status,
            JobStatus::Paused,
            "a user's pause of a default job must survive a relaunch, not reset to Active"
        );
    }
}
