//! Tauri commands for proactive scheduling
//!
//! These commands expose the ProactiveScheduler to the frontend,
//! allowing users to schedule automated tasks with cron expressions.
//!
//! NOTE: This module defines its own `ScheduledJob`, `ProactiveScheduler`,
//! and related types that duplicate `core::scheduler::types::ScheduledJob` and
//! `core::scheduler::proactive::ProactiveScheduler`. The two type hierarchies
//! are structurally incompatible (this one uses flat cron strings + action_type
//! enum, while core uses `JobSchedule`/`JobAction` tagged enums with richer
//! features like interval scheduling, callbacks, and execution history).
//!
//! Migration plan:
//! 1. Migrate these Tauri commands to delegate to `core::scheduler::ProactiveScheduler`.
//! 2. Add adapter logic to convert the frontend's flat cron+action_type format
//!    into `core::scheduler::types::JobSchedule` / `JobAction`.
//! 3. Remove the duplicate types from this module.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::RwLock;

use chrono::{DateTime, Utc};
use cron::Schedule;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri::State;

use crate::core::scheduler::types::{ExecutionStatus, JobExecutionRecord};
use crate::sys::error::{Error, Result};

/// The type of action a scheduled job should perform
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SchedulerActionType {
    /// Execute a workflow by ID
    Workflow,
    /// Run an AGI task with a prompt
    AgiTask,
    /// Execute a shell command
    ShellCommand,
    /// Send a notification
    Notification,
    /// Trigger a webhook
    Webhook,
    /// Run a custom script
    Script,
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
}

impl ScheduledJob {
    /// Create a new scheduled job
    pub fn new(
        name: String,
        schedule: String,
        action_type: SchedulerActionType,
        action_data: serde_json::Value,
    ) -> Result<Self> {
        // Validate the cron expression
        let cron_schedule = Schedule::from_str(&schedule)
            .map_err(|e| Error::Generic(format!("Invalid cron expression: {}", e)))?;

        let now = Utc::now();
        let next_run = cron_schedule.upcoming(Utc).next();

        Ok(Self {
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
        })
    }

    /// Calculate the next run time based on the cron schedule
    pub fn calculate_next_run(&self) -> Option<DateTime<Utc>> {
        Schedule::from_str(&self.schedule)
            .ok()
            .and_then(|s| s.upcoming(Utc).next())
    }
}

/// The proactive scheduler that manages scheduled jobs
pub struct ProactiveScheduler {
    pub(crate) jobs: RwLock<HashMap<String, ScheduledJob>>,
}

impl ProactiveScheduler {
    /// Create a new proactive scheduler
    pub fn new() -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
        }
    }

    /// Add a new scheduled job
    pub fn add_job(
        &self,
        name: String,
        schedule: String,
        action_type: SchedulerActionType,
        action_data: serde_json::Value,
    ) -> Result<String> {
        let job = ScheduledJob::new(name, schedule, action_type, action_data)?;
        let job_id = job.id.clone();

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

        Ok(jobs.remove(job_id).is_some())
    }

    /// List all scheduled jobs
    pub fn list_jobs(&self) -> Result<Vec<ScheduledJob>> {
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
                job.status = JobStatus::Paused;
                job.updated_at = Utc::now();
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Resume a paused scheduled job
    pub fn resume_job(&self, job_id: &str) -> Result<bool> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        if let Some(job) = jobs.get_mut(job_id) {
            if job.status == JobStatus::Paused {
                job.status = JobStatus::Active;
                job.next_run = job.calculate_next_run();
                job.updated_at = Utc::now();
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

    /// Get the next N scheduled runs across all active jobs
    pub fn get_next_runs(&self, limit: usize) -> Result<Vec<(String, DateTime<Utc>)>> {
        let jobs = self
            .jobs
            .read()
            .map_err(|e| Error::Generic(format!("Failed to acquire read lock: {}", e)))?;

        let mut runs: Vec<(String, DateTime<Utc>)> = jobs
            .values()
            .filter(|job| job.status == JobStatus::Active)
            .filter_map(|job| job.next_run.map(|next| (job.id.clone(), next)))
            .collect();

        runs.sort_by(|a, b| a.1.cmp(&b.1));
        runs.truncate(limit);

        Ok(runs)
    }

    /// Mark a job as having run (updates last_run, next_run, and run_count)
    pub fn mark_job_run(&self, job_id: &str, success: bool) -> Result<bool> {
        let mut jobs = self
            .jobs
            .write()
            .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

        if let Some(job) = jobs.get_mut(job_id) {
            let now = Utc::now();
            job.last_run = Some(now);
            job.updated_at = now;
            job.run_count += 1;

            if success {
                job.failure_count = 0;
            } else {
                job.failure_count += 1;
                if job.failure_count >= 3 {
                    job.status = JobStatus::Failed;
                }
            }

            // Calculate next run time
            job.next_run = job.calculate_next_run();
            return Ok(true);
        }
        Ok(false)
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
}

impl SchedulerState {
    pub fn new() -> Self {
        Self {
            scheduler: Arc::new(ProactiveScheduler::new()),
            execution_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Spawn a background tokio task that polls for due jobs every 30 seconds
    /// and dispatches their actions via `dispatch_job_action`.
    ///
    /// This is the core scheduling loop — without it jobs are stored but never
    /// automatically triggered. Call this once from `lib.rs` during app setup.
    pub fn start_background_loop(
        scheduler: Arc<ProactiveScheduler>,
        execution_history: Arc<RwLock<Vec<JobExecutionRecord>>>,
        app_handle: tauri::AppHandle,
    ) {
        tauri::async_runtime::spawn(async move {
            tracing::info!("[Scheduler] Background loop started — polling every 30 seconds");
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;

                // Collect jobs that are Active and whose next_run is in the past
                let due_jobs: Vec<(String, SchedulerActionType, serde_json::Value, String)> = {
                    match scheduler.jobs.read() {
                        Ok(jobs) => {
                            let now = chrono::Utc::now();
                            jobs.values()
                                .filter(|job| {
                                    job.status == JobStatus::Active
                                        && job.next_run.is_some_and(|nr| nr <= now)
                                })
                                .map(|job| {
                                    (
                                        job.id.clone(),
                                        job.action_type.clone(),
                                        job.action_data.clone(),
                                        job.name.clone(),
                                    )
                                })
                                .collect()
                        }
                        Err(e) => {
                            tracing::error!("[Scheduler] Failed to read jobs: {}", e);
                            continue;
                        }
                    }
                };

                for (job_id, action_type, action_data, job_name) in due_jobs {
                    tracing::info!(
                        "[Scheduler] Firing due job '{}' (id={})",
                        job_name,
                        job_id
                    );

                    let started_at = chrono::Utc::now();
                    let result =
                        dispatch_job_action(&action_type, &action_data, &job_name, &app_handle)
                            .await;
                    let completed_at = chrono::Utc::now();
                    let success = result.is_ok();
                    let duration_ms = (completed_at - started_at).num_milliseconds();

                    if let Err(ref e) = result {
                        tracing::error!(
                            "[Scheduler] Job '{}' (id={}) failed: {}",
                            job_name,
                            job_id,
                            e
                        );
                    }

                    // Record to history
                    if let Ok(mut hist) = execution_history.write() {
                        let record_id = hist.len() as i64 + 1;
                        hist.push(JobExecutionRecord {
                            id: record_id,
                            job_id: job_id.clone(),
                            started_at: started_at.to_rfc3339(),
                            completed_at: Some(completed_at.to_rfc3339()),
                            status: if success {
                                ExecutionStatus::Completed
                            } else {
                                ExecutionStatus::Failed
                            },
                            error: result.err(),
                            duration_ms: Some(duration_ms),
                        });
                        // Cap history at 500 entries
                        if hist.len() > 500 {
                            let drain_to = hist.len() - 500;
                            hist.drain(0..drain_to);
                        }
                    }

                    // Update job state (last_run, next_run, counters)
                    scheduler.mark_job_run(&job_id, success).ok();
                }
            }
        });
    }
}

impl Default for SchedulerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Add a new scheduled job
///
/// # Arguments
/// * `name` - Human-readable name for the job
/// * `schedule` - Cron expression (e.g., "0 0 9 * * *" for 9 AM daily), or a JSON schedule object
/// * `action_type` - Type of action: "workflow", "agi_task", "shell_command", "notification", "webhook", "script"
/// * `action_data` - JSON object with action-specific parameters
/// * `prompt` - Optional prompt text (alternative to action_data for agi_task type)
///
/// # Returns
/// The unique job ID
#[tauri::command]
pub async fn scheduler_add_job(
    name: String,
    schedule: serde_json::Value,
    action_type: Option<String>,
    action_data: Option<serde_json::Value>,
    prompt: Option<String>,
    state: State<'_, SchedulerState>,
) -> Result<String> {
    // Extract cron expression from schedule (can be a plain string or a JSON object)
    let cron_expr = match &schedule {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Object(obj) => {
            if let Some(cron) = obj.get("cronExpression").and_then(|v| v.as_str()) {
                cron.to_string()
            } else if let Some(interval) = obj.get("interval").and_then(|v| v.as_str()) {
                // Convert common interval names to cron expressions
                match interval {
                    "hourly" => "0 0 * * * *".to_string(),
                    "daily" => "0 0 9 * * *".to_string(),
                    "weekly" => "0 0 9 * * 1".to_string(),
                    "monthly" => "0 0 9 1 * *".to_string(),
                    _ => "0 0 9 * * *".to_string(), // default to daily
                }
            } else {
                "0 0 9 * * *".to_string() // default to daily at 9 AM
            }
        }
        _ => "0 0 9 * * *".to_string(),
    };

    // Determine the action type (default to AgiTask when not explicitly specified)
    let resolved_action_type = if let Some(ref at) = action_type {
        parse_action_type(at)?
    } else {
        SchedulerActionType::AgiTask
    };

    // Build action data from explicit action_data or from prompt
    let resolved_action_data = action_data.unwrap_or_else(|| {
        if let Some(ref p) = prompt {
            serde_json::json!({"prompt": p})
        } else {
            serde_json::json!({})
        }
    });

    state
        .scheduler
        .add_job(name, cron_expr, resolved_action_type, resolved_action_data)
}

/// Remove a scheduled job by ID
///
/// Accepts either `job_id` or `id` parameter for compatibility with both stores.
///
/// # Returns
/// `true` if the job was found and removed, `false` otherwise
#[tauri::command]
pub async fn scheduler_remove_job(
    job_id: Option<String>,
    id: Option<String>,
    state: State<'_, SchedulerState>,
) -> Result<bool> {
    let resolved_id = job_id
        .or(id)
        .ok_or_else(|| Error::Generic("Either job_id or id must be provided".to_string()))?;
    state.scheduler.remove_job(&resolved_id)
}

/// List all scheduled jobs
///
/// # Returns
/// A vector of all scheduled jobs
#[tauri::command]
pub async fn scheduler_list_jobs(state: State<'_, SchedulerState>) -> Result<Vec<ScheduledJob>> {
    state.scheduler.list_jobs()
}

/// Pause a scheduled job
///
/// Accepts either `job_id` or `id` parameter for compatibility with both stores.
///
/// # Returns
/// `true` if the job was found and paused, `false` if not found or already paused
#[tauri::command]
pub async fn scheduler_pause_job(
    job_id: Option<String>,
    id: Option<String>,
    state: State<'_, SchedulerState>,
) -> Result<bool> {
    let resolved_id = job_id
        .or(id)
        .ok_or_else(|| Error::Generic("Either job_id or id must be provided".to_string()))?;
    state.scheduler.pause_job(&resolved_id)
}

/// Resume a paused scheduled job
///
/// Accepts either `job_id` or `id` parameter for compatibility with both stores.
///
/// # Returns
/// `true` if the job was found and resumed, `false` if not found or not paused
#[tauri::command]
pub async fn scheduler_resume_job(
    job_id: Option<String>,
    id: Option<String>,
    state: State<'_, SchedulerState>,
) -> Result<bool> {
    let resolved_id = job_id
        .or(id)
        .ok_or_else(|| Error::Generic("Either job_id or id must be provided".to_string()))?;
    state.scheduler.resume_job(&resolved_id)
}

/// Get a specific scheduled job by ID
///
/// Accepts either `job_id` or `id` parameter for compatibility with both stores.
///
/// # Returns
/// The job if found, `None` otherwise
#[tauri::command]
pub async fn scheduler_get_job(
    job_id: Option<String>,
    id: Option<String>,
    state: State<'_, SchedulerState>,
) -> Result<Option<ScheduledJob>> {
    let resolved_id = job_id
        .or(id)
        .ok_or_else(|| Error::Generic("Either job_id or id must be provided".to_string()))?;
    state.scheduler.get_job(&resolved_id)
}

/// Serializable next run entry for frontend consumption
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextRunEntry {
    pub job_id: String,
    pub next_run: DateTime<Utc>,
}

/// Get the next scheduled runs across all active jobs
///
/// # Arguments
/// * `limit` - Maximum number of upcoming runs to return
///
/// # Returns
/// A vector of (job_id, next_run_timestamp) tuples, sorted by next run time
#[tauri::command]
pub async fn scheduler_get_next_runs(
    limit: Option<usize>,
    state: State<'_, SchedulerState>,
) -> Result<Vec<NextRunEntry>> {
    let limit = limit.unwrap_or(10);
    let runs = state.scheduler.get_next_runs(limit)?;
    Ok(runs
        .into_iter()
        .map(|(job_id, next_run)| NextRunEntry { job_id, next_run })
        .collect())
}

/// Toggle a scheduled job between active and paused states
///
/// If the job is active, it will be paused. If paused, it will be resumed.
///
/// # Arguments
/// * `id` - The unique identifier of the job to toggle
///
/// # Returns
/// `true` if the job was found and toggled, `false` otherwise
#[tauri::command]
pub async fn scheduler_toggle_job(id: String, state: State<'_, SchedulerState>) -> Result<bool> {
    // Check current status and toggle accordingly
    let current_status = {
        let job = state.scheduler.get_job(&id)?;
        match job {
            Some(j) => j.status,
            None => return Err(Error::Generic(format!("Job not found: {}", id))),
        }
    };

    match current_status {
        JobStatus::Active => state.scheduler.pause_job(&id),
        JobStatus::Paused => state.scheduler.resume_job(&id),
        other => Err(Error::Generic(format!(
            "Cannot toggle job in {:?} state. Only active or paused jobs can be toggled.",
            other
        ))),
    }
}

/// Immediately trigger a scheduled job to run
///
/// Retrieves the job's action configuration, dispatches the appropriate action
/// (shell command, AGI task, workflow, notification, webhook, or script), then
/// marks the job as having run with success/failure status.
///
/// # Arguments
/// * `id` - The unique identifier of the job to run
/// * `app_handle` - Tauri app handle for emitting events
///
/// # Returns
/// `true` if the job was found and executed
#[tauri::command]
pub async fn scheduler_run_job_now(
    id: String,
    state: State<'_, SchedulerState>,
    app_handle: tauri::AppHandle,
) -> Result<bool> {
    // Retrieve job info (action_type + action_data) before execution
    let job = {
        let found = state.scheduler.get_job(&id)?;
        match found {
            Some(j) => j,
            None => return Err(Error::Generic(format!("Job not found: {}", id))),
        }
    };

    // Record the start time before dispatching so history timestamps are accurate
    let started_at = chrono::Utc::now();

    let execution_result = dispatch_job_action(
        &job.action_type,
        &job.action_data,
        &job.name,
        &app_handle,
    )
    .await;

    let completed_at = chrono::Utc::now();
    let duration_ms = (completed_at - started_at).num_milliseconds();
    let success = execution_result.is_ok();

    if let Err(ref e) = execution_result {
        tracing::error!(
            "[Scheduler] Job '{}' (id={}) action dispatch failed after {}ms: {}",
            job.name,
            id,
            duration_ms,
            e
        );
    } else {
        tracing::info!(
            "[Scheduler] Job '{}' (id={}) action dispatched successfully in {}ms",
            job.name,
            id,
            duration_ms
        );
    }

    // Record execution history with accurate timestamps and duration
    {
        let mut history = state.execution_history.write().map_err(|e| {
            Error::Generic(format!("Failed to acquire history write lock: {}", e))
        })?;

        let record = JobExecutionRecord {
            id: history.len() as i64 + 1,
            job_id: id.clone(),
            started_at: started_at.to_rfc3339(),
            completed_at: Some(completed_at.to_rfc3339()),
            status: if success {
                ExecutionStatus::Completed
            } else {
                ExecutionStatus::Failed
            },
            error: execution_result.err().map(|e| e.to_string()),
            duration_ms: Some(duration_ms),
        };

        history.push(record);
    }

    // Mark the job run in the scheduler (updates last_run, next_run, counters)
    state.scheduler.mark_job_run(&id, success)
}

/// SECURITY: Validates a shell command/script against dangerous patterns.
/// Returns Err with a descriptive message if the command is blocked.
fn validate_shell_command(command: &str) -> std::result::Result<(), String> {
    let cmd_lower = command.to_lowercase();

    // Dangerous destructive commands
    let dangerous_patterns: &[(&str, &str)] = &[
        ("rm -rf /", "recursive deletion of root filesystem"),
        ("rm -rf /*", "recursive deletion of root filesystem"),
        ("rm -rf ~", "recursive deletion of home directory"),
        ("mkfs", "filesystem formatting"),
        ("dd if=", "raw disk write"),
        (":(){:|:&};:", "fork bomb"),
        (">()", "fork bomb variant"),
        ("chmod -r 777 /", "global permission change on root"),
        ("chown -r", "recursive ownership change"),
        ("shutdown", "system shutdown"),
        ("reboot", "system reboot"),
        ("halt", "system halt"),
        ("init 0", "system shutdown via init"),
        ("init 6", "system reboot via init"),
        ("poweroff", "system power off"),
        ("kill -9 -1", "kill all user processes"),
        ("killall", "mass process termination"),
        ("pkill -9", "aggressive process termination"),
        ("curl | sh", "pipe remote script to shell"),
        ("curl | bash", "pipe remote script to shell"),
        ("wget | sh", "pipe remote script to shell"),
        ("wget | bash", "pipe remote script to shell"),
    ];

    for (pattern, description) in dangerous_patterns {
        if cmd_lower.contains(pattern) {
            tracing::warn!(
                "[SECURITY][Scheduler] Blocked dangerous command pattern '{}': {}",
                pattern,
                description
            );
            return Err(format!(
                "Command blocked: contains dangerous pattern '{}' ({}). \
                 If this is intentional, execute the command manually instead of via scheduler.",
                pattern, description
            ));
        }
    }

    // Block commands that attempt to modify critical system paths
    let protected_paths = ["/etc/", "/boot/", "/sys/", "/proc/", "/dev/"];
    let write_prefixes = ["rm ", "mv ", "cp ", "> ", "tee "];
    for path in &protected_paths {
        for write_op in &write_prefixes {
            // Check for patterns like "rm /etc/..." or "> /etc/..."
            let pattern = format!("{}{}", write_op, path);
            if cmd_lower.contains(&pattern) {
                tracing::warn!(
                    "[SECURITY][Scheduler] Blocked write to protected path '{}' via '{}'",
                    path,
                    write_op.trim()
                );
                return Err(format!(
                    "Command blocked: attempted write to protected system path '{}'. \
                     Scheduler commands cannot modify critical system directories.",
                    path
                ));
            }
        }
    }

    // Block command chaining that could bypass checks via encoded/obfuscated patterns
    if cmd_lower.contains("\\x") || cmd_lower.contains("$'\\") || cmd_lower.contains("$(printf") {
        tracing::warn!(
            "[SECURITY][Scheduler] Blocked command with encoded/obfuscated characters"
        );
        return Err(
            "Command blocked: contains encoded or obfuscated characters. \
             Use plain text commands only."
                .to_string(),
        );
    }

    Ok(())
}

/// Dispatch the actual job action based on type and data.
///
/// This executes the job's configured action:
/// - ShellCommand: runs via `tokio::process::Command`
/// - AgiTask: emits a `scheduler:agi-task` event for the chat/agent loop to pick up
/// - Workflow: emits a `scheduler:workflow-execute` event for the workflow engine
/// - Notification: emits a desktop notification via `scheduler:notification` event
/// - Webhook: sends an HTTP POST request
/// - Script: runs a script file via the system shell
async fn dispatch_job_action(
    action_type: &SchedulerActionType,
    action_data: &serde_json::Value,
    job_name: &str,
    app_handle: &tauri::AppHandle,
) -> std::result::Result<(), String> {
    use tauri::Emitter;

    match action_type {
        SchedulerActionType::ShellCommand => {
            let command = action_data
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if command.is_empty() {
                return Err("Shell command is empty".to_string());
            }

            // SECURITY: Validate command against dangerous patterns
            validate_shell_command(command)?;

            tracing::info!("[Scheduler] Executing shell command for job '{}': {}", job_name, command);

            let output = tokio::process::Command::new(if cfg!(target_os = "windows") {
                "cmd"
            } else {
                "sh"
            })
            .args(if cfg!(target_os = "windows") {
                vec!["/C", command]
            } else {
                vec!["-c", command]
            })
            .output()
            .await
            .map_err(|e| format!("Failed to execute command: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!(
                    "Command exited with status {}: {}",
                    output.status, stderr
                ));
            }

            Ok(())
        }

        SchedulerActionType::AgiTask => {
            let prompt = action_data
                .get("prompt")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if prompt.is_empty() {
                return Err("AGI task prompt is empty".to_string());
            }

            tracing::info!("[Scheduler] Dispatching AGI task: {}", prompt);

            // Get the orchestrator from the global static
            let orchestrator_arc = {
                let guard = crate::sys::commands::agi::ORCHESTRATOR.lock();
                guard
                    .as_ref()
                    .ok_or_else(|| {
                        "AGI Orchestrator not initialized. Please initialize it first."
                            .to_string()
                    })?
                    .clone()
            };

            let goal = crate::core::agi::Goal {
                id: format!("scheduled_{}", uuid::Uuid::new_v4()),
                description: prompt.to_string(),
                priority: crate::core::agi::Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            };

            let orchestrator = orchestrator_arc.lock().await;
            let agent_id = orchestrator
                .spawn_agent(goal)
                .await
                .map_err(|e| format!("Failed to spawn scheduled agent: {}", e))?;

            tracing::info!(
                "[Scheduler] Spawned agent {} for job '{}'",
                agent_id,
                job_name
            );

            // Release lock before polling
            drop(orchestrator);

            // Poll for completion (max 120 seconds at 200ms intervals = 600 iterations)
            for _ in 0..600 {
                let orch = orchestrator_arc.lock().await;
                if let Some(status) = orch.get_agent_status(&agent_id).await {
                    match status.status {
                        crate::core::agi::orchestrator::AgentState::Completed => {
                            tracing::info!(
                                "[Scheduler] Agent {} completed for job '{}'",
                                agent_id,
                                job_name
                            );
                            return Ok(());
                        }
                        crate::core::agi::orchestrator::AgentState::Failed => {
                            return Err(format!(
                                "Scheduled agent {} failed: {:?}",
                                agent_id, status.error
                            ));
                        }
                        _ => {}
                    }
                }
                drop(orch);
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }

            Err(format!(
                "Scheduled AGI task timed out after 120s (agent: {})",
                agent_id
            ))
        }

        SchedulerActionType::Workflow => {
            let workflow_id = action_data
                .get("workflow_id")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if workflow_id.is_empty() {
                return Err("Workflow ID is empty".to_string());
            }

            tracing::info!(
                "[Scheduler] Dispatching workflow execution: {}",
                workflow_id
            );

            app_handle
                .emit(
                    "scheduler:workflow-execute",
                    serde_json::json!({
                        "workflow_id": workflow_id,
                        "job_name": job_name,
                        "source": "scheduler"
                    }),
                )
                .map_err(|e| format!("Failed to emit workflow event: {}", e))?;

            Ok(())
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

            app_handle
                .emit(
                    "scheduler:notification",
                    serde_json::json!({
                        "title": title,
                        "message": message,
                        "job_name": job_name,
                        "source": "scheduler"
                    }),
                )
                .map_err(|e| format!("Failed to emit notification event: {}", e))?;

            Ok(())
        }

        SchedulerActionType::Webhook => {
            let url = action_data
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if url.is_empty() {
                return Err("Webhook URL is empty".to_string());
            }

            let payload = action_data
                .get("payload")
                .cloned()
                .unwrap_or(serde_json::json!({ "job_name": job_name }));

            tracing::info!("[Scheduler] Sending webhook to: {}", url);

            let client = reqwest::Client::new();
            let response = client
                .post(url)
                .json(&payload)
                .timeout(std::time::Duration::from_secs(30))
                .send()
                .await
                .map_err(|e| format!("Webhook request failed: {}", e))?;

            if !response.status().is_success() {
                return Err(format!(
                    "Webhook returned non-success status: {}",
                    response.status()
                ));
            }

            Ok(())
        }

        SchedulerActionType::Script => {
            let script = action_data
                .get("script")
                .or_else(|| action_data.get("command"))
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            if script.is_empty() {
                return Err("Script content is empty".to_string());
            }

            // SECURITY: Validate script against dangerous patterns
            validate_shell_command(script)?;

            tracing::info!("[Scheduler] Executing script for job '{}': <{} chars>", job_name, script.len());

            let output = tokio::process::Command::new(if cfg!(target_os = "windows") {
                "cmd"
            } else {
                "sh"
            })
            .args(if cfg!(target_os = "windows") {
                vec!["/C", script]
            } else {
                vec!["-c", script]
            })
            .output()
            .await
            .map_err(|e| format!("Failed to execute script: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!(
                    "Script exited with status {}: {}",
                    output.status, stderr
                ));
            }

            Ok(())
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

/// Partial update payload for a scheduled job
///
/// All fields are optional — only provided fields will be applied.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJobUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub schedule: Option<serde_json::Value>,
    pub status: Option<String>,
    pub prompt: Option<String>,
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
) -> Result<bool> {
    let mut jobs = state
        .scheduler
        .jobs
        .write()
        .map_err(|e| Error::Generic(format!("Failed to acquire write lock: {}", e)))?;

    if let Some(job) = jobs.get_mut(&id) {
        if let Some(name) = updates.name {
            job.name = name;
        }
        if let Some(description) = updates.description {
            job.description = Some(description);
        }
        if let Some(status_str) = updates.status {
            match status_str.to_lowercase().as_str() {
                "active" => job.status = JobStatus::Active,
                "paused" => job.status = JobStatus::Paused,
                "completed" => job.status = JobStatus::Completed,
                "failed" => job.status = JobStatus::Failed,
                _ => {
                    return Err(Error::Generic(format!(
                        "Invalid status: {}. Valid options: active, paused, completed, failed",
                        status_str
                    )))
                }
            }
        }
        if let Some(schedule_val) = updates.schedule {
            // The frontend may send a schedule object with cron_expression or interval.
            // Extract the cron expression if present, otherwise keep the existing one.
            if let Some(cron) = schedule_val.get("cronExpression").and_then(|v| v.as_str()) {
                // Validate the cron expression before applying
                let _parsed = Schedule::from_str(cron)
                    .map_err(|e| Error::Generic(format!("Invalid cron expression: {}", e)))?;
                job.schedule = cron.to_string();
                job.next_run = job.calculate_next_run();
            }
        }
        if let Some(prompt) = updates.prompt {
            // Store the prompt in action_data
            job.action_data["prompt"] = serde_json::Value::String(prompt);
        }
        job.updated_at = Utc::now();
        Ok(true)
    } else {
        Err(Error::Generic(format!("Job not found: {}", id)))
    }
}

/// Parse action type string to SchedulerActionType enum.
///
/// Accepts camelCase (canonical), snake_case (legacy), and kebab-case variants
/// to remain backwards-compatible with existing frontend stores.
fn parse_action_type(action_type: &str) -> Result<SchedulerActionType> {
    match action_type.to_lowercase().as_str() {
        "workflow" => Ok(SchedulerActionType::Workflow),
        "agitask" | "agi_task" | "agi-task" => Ok(SchedulerActionType::AgiTask),
        "shellcommand" | "shell_command" | "shell-command" | "shell" => {
            Ok(SchedulerActionType::ShellCommand)
        }
        "notification" | "notify" => Ok(SchedulerActionType::Notification),
        "webhook" => Ok(SchedulerActionType::Webhook),
        "script" => Ok(SchedulerActionType::Script),
        _ => Err(Error::Generic(format!(
            "Invalid action type: {}. Valid options: workflow, agiTask, shellCommand, notification, webhook, script",
            action_type
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_action_type() {
        assert!(matches!(
            parse_action_type("workflow"),
            Ok(SchedulerActionType::Workflow)
        ));
        assert!(matches!(
            parse_action_type("AGI_TASK"),
            Ok(SchedulerActionType::AgiTask)
        ));
        assert!(matches!(
            parse_action_type("shell-command"),
            Ok(SchedulerActionType::ShellCommand)
        ));
        assert!(matches!(
            parse_action_type("notification"),
            Ok(SchedulerActionType::Notification)
        ));
        assert!(matches!(
            parse_action_type("webhook"),
            Ok(SchedulerActionType::Webhook)
        ));
        assert!(matches!(
            parse_action_type("script"),
            Ok(SchedulerActionType::Script)
        ));
        assert!(parse_action_type("invalid").is_err());
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

    #[test]
    fn test_proactive_scheduler_get_next_runs() {
        let scheduler = ProactiveScheduler::new();

        // Add multiple jobs
        scheduler
            .add_job(
                "Job 1".to_string(),
                "0 0 * * * *".to_string(), // Every hour
                SchedulerActionType::Notification,
                json!({}),
            )
            .unwrap();

        scheduler
            .add_job(
                "Job 2".to_string(),
                "0 30 * * * *".to_string(), // Every hour at :30
                SchedulerActionType::Workflow,
                json!({"workflow_id": "wf-123"}),
            )
            .unwrap();

        let next_runs = scheduler.get_next_runs(10).unwrap();
        assert_eq!(next_runs.len(), 2);

        // Should be sorted by time
        if next_runs.len() == 2 {
            assert!(next_runs[0].1 <= next_runs[1].1);
        }
    }

    #[test]
    fn test_proactive_scheduler_mark_run() {
        let scheduler = ProactiveScheduler::new();

        let job_id = scheduler
            .add_job(
                "Test".to_string(),
                "0 0 * * * *".to_string(),
                SchedulerActionType::ShellCommand,
                json!({"command": "echo hello"}),
            )
            .unwrap();

        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.run_count, 0);
        assert!(job.last_run.is_none());

        // Mark as run successfully
        scheduler.mark_job_run(&job_id, true).unwrap();
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.run_count, 1);
        assert!(job.last_run.is_some());
        assert_eq!(job.failure_count, 0);

        // Mark as failed
        scheduler.mark_job_run(&job_id, false).unwrap();
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.run_count, 2);
        assert_eq!(job.failure_count, 1);

        // Three consecutive failures should mark job as Failed
        scheduler.mark_job_run(&job_id, false).unwrap();
        scheduler.mark_job_run(&job_id, false).unwrap();
        let job = scheduler.get_job(&job_id).unwrap().unwrap();
        assert_eq!(job.status, JobStatus::Failed);
    }

    #[test]
    fn test_scheduler_state_creation() {
        let state = SchedulerState::new();
        assert!(Arc::strong_count(&state.scheduler) >= 1);
    }
}
