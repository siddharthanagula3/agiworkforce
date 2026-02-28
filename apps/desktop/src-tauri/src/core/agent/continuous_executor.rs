//! Continuous Execution Mode for AGI Workforce
//!
//! This module implements 24/7 continuous execution capabilities for long-running tasks.
//! It provides:
//! - Persistent execution loop that runs until task completion
//! - Daily usage limit tracking with automatic reset at midnight
//! - Auto-recovery from failures with exponential backoff
//! - Progress checkpointing for crash recovery
//! - Background execution support with pause/resume functionality
//!
//! # Example
//! ```ignore
//! let executor = ContinuousExecutor::new(config, db, app_handle)?;
//! let task_id = executor.start_task("Complete the quarterly report".to_string()).await?;
//! ```

// Allow dead code - this module is still being developed and timezone is reserved for future use
#![allow(dead_code)]

use crate::core::agi::Priority;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Duration, Local, NaiveTime, TimeZone, Utc};
use parking_lot::RwLock;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Notify;
use tokio::time::{sleep, Instant};
use uuid::Uuid;

// ============================================================================
// Configuration Constants
// ============================================================================

/// Default checkpoint interval in steps
const DEFAULT_CHECKPOINT_INTERVAL: u32 = 5;

/// Maximum consecutive failures before abandoning task
const MAX_CONSECUTIVE_FAILURES: u32 = 10;

/// Base delay for exponential backoff (in seconds)
const BASE_RETRY_DELAY_SECS: u64 = 2;

/// Maximum retry delay (in seconds)
const MAX_RETRY_DELAY_SECS: u64 = 300;

/// Default daily token limit
const DEFAULT_DAILY_TOKEN_LIMIT: u64 = 10_000_000;

/// Default daily request limit
const DEFAULT_DAILY_REQUEST_LIMIT: u64 = 10_000;

// ============================================================================
// Types and Enums
// ============================================================================

/// Status of a continuous execution task
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContinuousTaskStatus {
    /// Task is queued and waiting to start
    Pending,
    /// Task is actively running
    Running,
    /// Task is paused by user or system
    Paused,
    /// Task completed successfully
    Completed,
    /// Task failed after max retries
    Failed,
    /// Task was cancelled by user
    Cancelled,
    /// Task is waiting due to daily limit reached
    LimitReached,
    /// Task is recovering from a failure
    Recovering,
}

impl ContinuousTaskStatus {
    /// Returns true if the task is in a terminal state
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    /// Returns true if the task can be resumed
    pub fn can_resume(&self) -> bool {
        matches!(self, Self::Paused | Self::LimitReached)
    }
}

/// Configuration for the continuous executor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinuousExecutorConfig {
    /// Number of steps between automatic checkpoints
    pub checkpoint_interval: u32,
    /// Maximum consecutive failures before abandoning task
    pub max_consecutive_failures: u32,
    /// Daily token limit (0 = unlimited)
    pub daily_token_limit: u64,
    /// Daily request limit (0 = unlimited)
    pub daily_request_limit: u64,
    /// Whether to auto-resume tasks after app restart
    pub auto_resume_on_restart: bool,
    /// Time zone for daily limit reset (IANA format, e.g., "America/New_York")
    pub timezone: String,
    /// Optional deadline for task completion
    pub deadline: Option<DateTime<Utc>>,
}

impl Default for ContinuousExecutorConfig {
    fn default() -> Self {
        Self {
            checkpoint_interval: DEFAULT_CHECKPOINT_INTERVAL,
            max_consecutive_failures: MAX_CONSECUTIVE_FAILURES,
            daily_token_limit: DEFAULT_DAILY_TOKEN_LIMIT,
            daily_request_limit: DEFAULT_DAILY_REQUEST_LIMIT,
            auto_resume_on_restart: true,
            timezone: "UTC".to_string(),
            deadline: None,
        }
    }
}

/// Represents a checkpoint that can be used to resume execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionCheckpoint {
    /// Unique checkpoint ID
    pub id: String,
    /// Associated task ID
    pub task_id: String,
    /// Step number at checkpoint
    pub step_number: u32,
    /// Total steps completed
    pub total_steps_completed: u32,
    /// Serialized execution context
    pub context_json: String,
    /// Serialized tool results
    pub tool_results_json: String,
    /// Timestamp of checkpoint creation
    pub created_at: DateTime<Utc>,
    /// Current goal state
    pub goal_json: String,
    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

/// Tracks daily usage limits
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsageStats {
    /// Date for which these stats apply (YYYY-MM-DD)
    pub date: String,
    /// Total tokens used today
    pub tokens_used: u64,
    /// Total requests made today
    pub requests_made: u64,
    /// Total cost incurred today
    pub cost_incurred: f64,
    /// Time when limits were last checked
    pub last_updated: DateTime<Utc>,
}

impl DailyUsageStats {
    /// Creates a new stats instance for the current day
    pub fn new_for_today() -> Self {
        Self {
            date: Utc::now().format("%Y-%m-%d").to_string(),
            tokens_used: 0,
            requests_made: 0,
            cost_incurred: 0.0,
            last_updated: Utc::now(),
        }
    }
}

/// Progress information emitted to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionProgress {
    /// Task ID
    pub task_id: String,
    /// Current status
    pub status: ContinuousTaskStatus,
    /// Current step number
    pub current_step: u32,
    /// Total steps (if known)
    pub total_steps: Option<u32>,
    /// Progress percentage (0-100)
    pub progress_percent: f64,
    /// Description of current activity
    pub current_activity: String,
    /// Time elapsed since start
    pub elapsed_secs: u64,
    /// Estimated time remaining (if calculable)
    pub eta_secs: Option<u64>,
    /// Number of retries so far
    pub retry_count: u32,
    /// Tokens used in this task
    pub tokens_used: u64,
    /// Daily usage stats
    pub daily_stats: DailyUsageStats,
    /// Last checkpoint ID
    pub last_checkpoint_id: Option<String>,
}

/// A continuous execution task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContinuousTask {
    /// Unique task ID
    pub id: String,
    /// Task description/goal
    pub description: String,
    /// Current status
    pub status: ContinuousTaskStatus,
    /// Priority level
    pub priority: Priority,
    /// Configuration for this task
    pub config: ContinuousExecutorConfig,
    /// When the task was created
    pub created_at: DateTime<Utc>,
    /// When the task was started
    pub started_at: Option<DateTime<Utc>>,
    /// When the task was completed/failed/cancelled
    pub finished_at: Option<DateTime<Utc>>,
    /// Current step number
    pub current_step: u32,
    /// Consecutive failure count
    pub consecutive_failures: u32,
    /// Total tokens used
    pub tokens_used: u64,
    /// Total requests made
    pub requests_made: u64,
    /// Total cost
    pub total_cost: f64,
    /// Last error message (if any)
    pub last_error: Option<String>,
    /// ID of the last checkpoint
    pub last_checkpoint_id: Option<String>,
    /// Result data (if completed)
    pub result: Option<serde_json::Value>,
}

impl ContinuousTask {
    /// Creates a new continuous task
    pub fn new(description: String, config: ContinuousExecutorConfig) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            description,
            status: ContinuousTaskStatus::Pending,
            priority: Priority::Medium,
            config,
            created_at: Utc::now(),
            started_at: None,
            finished_at: None,
            current_step: 0,
            consecutive_failures: 0,
            tokens_used: 0,
            requests_made: 0,
            total_cost: 0.0,
            last_error: None,
            last_checkpoint_id: None,
            result: None,
        }
    }

    /// Creates a new continuous task with priority
    pub fn with_priority(mut self, priority: Priority) -> Self {
        self.priority = priority;
        self
    }
}

// ============================================================================
// Daily Limit Tracker
// ============================================================================

/// Tracks and enforces daily usage limits
pub struct DailyLimitTracker {
    /// Current day's usage stats
    stats: Arc<RwLock<DailyUsageStats>>,
    /// Token limit
    token_limit: AtomicU64,
    /// Request limit
    request_limit: AtomicU64,
    /// Timezone for reset calculation
    timezone: String,
    /// Notifier for limit reset
    reset_notifier: Arc<Notify>,
    /// Flag indicating if limits are currently exceeded
    limits_exceeded: AtomicBool,
}

impl DailyLimitTracker {
    /// Creates a new daily limit tracker
    pub fn new(config: &ContinuousExecutorConfig) -> Self {
        Self {
            stats: Arc::new(RwLock::new(DailyUsageStats::new_for_today())),
            token_limit: AtomicU64::new(config.daily_token_limit),
            request_limit: AtomicU64::new(config.daily_request_limit),
            timezone: config.timezone.clone(),
            reset_notifier: Arc::new(Notify::new()),
            limits_exceeded: AtomicBool::new(false),
        }
    }

    /// Loads stats from the database
    pub fn load_from_db(&self, conn: &Connection) -> Result<()> {
        let today = Utc::now().format("%Y-%m-%d").to_string();

        let result: rusqlite::Result<(u64, u64, f64)> = conn.query_row(
            "SELECT tokens_used, requests_made, cost_incurred
             FROM continuous_execution_daily_stats
             WHERE date = ?1",
            params![today],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );

        if let Ok((tokens, requests, cost)) = result {
            let mut stats = self.stats.write();
            stats.date = today;
            stats.tokens_used = tokens;
            stats.requests_made = requests;
            stats.cost_incurred = cost;
            stats.last_updated = Utc::now();

            // Check if limits are exceeded
            self.check_limits_internal(&stats);
        }

        Ok(())
    }

    /// Records token usage
    pub fn record_usage(&self, tokens: u64, cost: f64) {
        let mut stats = self.stats.write();

        // Check if we need to reset for a new day
        let today = Utc::now().format("%Y-%m-%d").to_string();
        if stats.date != today {
            *stats = DailyUsageStats::new_for_today();
            self.limits_exceeded.store(false, Ordering::SeqCst);
            self.reset_notifier.notify_waiters();
        }

        stats.tokens_used += tokens;
        stats.requests_made += 1;
        stats.cost_incurred += cost;
        stats.last_updated = Utc::now();

        self.check_limits_internal(&stats);
    }

    /// Checks if limits are exceeded
    fn check_limits_internal(&self, stats: &DailyUsageStats) {
        let token_limit = self.token_limit.load(Ordering::SeqCst);
        let request_limit = self.request_limit.load(Ordering::SeqCst);

        let exceeded = (token_limit > 0 && stats.tokens_used >= token_limit)
            || (request_limit > 0 && stats.requests_made >= request_limit);

        self.limits_exceeded.store(exceeded, Ordering::SeqCst);
    }

    /// Returns true if daily limits are exceeded.
    ///
    /// # Concurrency note (M3 — TOCTOU fix)
    /// The previous implementation used a read lock to check the date and then
    /// promoted to a write lock if a reset was needed. This left a window where
    /// two threads could both observe `stats.date != today` on the read lock and
    /// both attempt the reset, causing a double-reset. We now acquire the write
    /// lock unconditionally so the check and the reset are performed atomically.
    pub fn is_limit_exceeded(&self) -> bool {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let mut stats = self.stats.write();
        if stats.date != today {
            *stats = DailyUsageStats::new_for_today();
            self.limits_exceeded.store(false, Ordering::SeqCst);
            self.reset_notifier.notify_waiters();
            return false;
        }
        drop(stats);
        self.limits_exceeded.load(Ordering::SeqCst)
    }

    /// Waits until limits are reset (at midnight)
    pub async fn wait_for_reset(&self) {
        if !self.is_limit_exceeded() {
            return;
        }

        // Calculate time until midnight in the configured timezone
        let duration_until_reset = self.duration_until_midnight();
        tracing::info!(
            "[ContinuousExecutor] Daily limit reached, waiting {:?} until reset",
            duration_until_reset
        );

        tokio::select! {
            _ = sleep(duration_until_reset) => {
                // Time-based reset
                let mut stats = self.stats.write();
                *stats = DailyUsageStats::new_for_today();
                self.limits_exceeded.store(false, Ordering::SeqCst);
            }
            _ = self.reset_notifier.notified() => {
                // Manual reset or day change detected
            }
        }
    }

    /// Calculates duration until midnight in the configured timezone.
    ///
    /// Uses the IANA timezone string from `self.timezone` (parsed via `chrono_tz`)
    /// to determine when midnight occurs. Falls back to the system local timezone
    /// if the configured timezone string cannot be parsed.
    fn duration_until_midnight(&self) -> std::time::Duration {
        // Try to parse the configured IANA timezone (e.g., "America/New_York")
        if let Ok(tz) = self.timezone.parse::<chrono_tz::Tz>() {
            let now = Utc::now().with_timezone(&tz);
            let tomorrow = (now + Duration::days(1)).date_naive();
            let midnight_naive =
                tomorrow.and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap_or_default());

            match tz.from_local_datetime(&midnight_naive).single() {
                Some(m) => {
                    let duration = m.signed_duration_since(now);
                    if duration.num_seconds() > 0 {
                        return std::time::Duration::from_secs(duration.num_seconds() as u64);
                    }
                    return std::time::Duration::from_secs(60); // Fallback to 1 minute
                }
                None => {
                    // Ambiguous or missing local time (DST transition); fall back to 1 hour
                    return std::time::Duration::from_secs(3600);
                }
            }
        }

        // Fallback: configured timezone could not be parsed, use system local time
        tracing::warn!(
            "[DailyLimitTracker] Could not parse timezone '{}', falling back to system local time",
            self.timezone
        );
        let now = Local::now();
        let midnight = (now + Duration::days(1))
            .date_naive()
            .and_time(NaiveTime::from_hms_opt(0, 0, 0).unwrap_or_default());

        let midnight_local = Local.from_local_datetime(&midnight);

        match midnight_local.single() {
            Some(m) => {
                let duration = m.signed_duration_since(now);
                if duration.num_seconds() > 0 {
                    std::time::Duration::from_secs(duration.num_seconds() as u64)
                } else {
                    std::time::Duration::from_secs(60) // Fallback to 1 minute
                }
            }
            None => std::time::Duration::from_secs(3600), // Fallback to 1 hour
        }
    }

    /// Gets the current stats
    pub fn get_stats(&self) -> DailyUsageStats {
        self.stats.read().clone()
    }

    /// Updates the daily limits
    pub fn update_limits(&self, token_limit: u64, request_limit: u64) {
        self.token_limit.store(token_limit, Ordering::SeqCst);
        self.request_limit.store(request_limit, Ordering::SeqCst);

        // Recheck limits with new values
        let stats = self.stats.read();
        self.check_limits_internal(&stats);
    }

    /// Persists current stats to the database
    pub fn persist_to_db(&self, conn: &Connection) -> Result<()> {
        let stats = self.stats.read();

        conn.execute(
            "INSERT OR REPLACE INTO continuous_execution_daily_stats
             (date, tokens_used, requests_made, cost_incurred, last_updated)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                stats.date,
                stats.tokens_used,
                stats.requests_made,
                stats.cost_incurred,
                stats.last_updated.to_rfc3339(),
            ],
        )?;

        Ok(())
    }
}

// ============================================================================
// Execution State Persistence
// ============================================================================

/// Manages persistence of execution state to SQLite
pub struct ExecutionStatePersistence {
    /// Database connection
    db_path: String,
}

impl ExecutionStatePersistence {
    /// Creates a new persistence manager
    pub fn new(db_path: String) -> Result<Self> {
        let instance = Self { db_path };
        instance.ensure_tables()?;
        Ok(instance)
    }

    /// Ensures required tables exist
    fn ensure_tables(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Disable foreign key constraints during table creation
        conn.execute_batch("PRAGMA foreign_keys = OFF")?;

        conn.execute_batch(
            r#"
            -- Continuous execution tasks
            CREATE TABLE IF NOT EXISTS continuous_execution_tasks (
                id TEXT PRIMARY KEY,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                config_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                current_step INTEGER NOT NULL DEFAULT 0,
                consecutive_failures INTEGER NOT NULL DEFAULT 0,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                requests_made INTEGER NOT NULL DEFAULT 0,
                total_cost REAL NOT NULL DEFAULT 0,
                last_error TEXT,
                last_checkpoint_id TEXT,
                result_json TEXT
            );

            -- Execution checkpoints
            CREATE TABLE IF NOT EXISTS continuous_execution_checkpoints (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                step_number INTEGER NOT NULL,
                total_steps_completed INTEGER NOT NULL,
                context_json TEXT NOT NULL,
                tool_results_json TEXT NOT NULL,
                goal_json TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES continuous_execution_tasks(id) ON DELETE CASCADE
            );

            -- Daily usage stats
            CREATE TABLE IF NOT EXISTS continuous_execution_daily_stats (
                date TEXT PRIMARY KEY,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                requests_made INTEGER NOT NULL DEFAULT 0,
                cost_incurred REAL NOT NULL DEFAULT 0,
                last_updated TEXT NOT NULL
            );

            -- Index for faster checkpoint lookups
            CREATE INDEX IF NOT EXISTS idx_checkpoints_task_id
                ON continuous_execution_checkpoints(task_id);

            -- Index for task status queries
            CREATE INDEX IF NOT EXISTS idx_tasks_status
                ON continuous_execution_tasks(status);
            "#,
        )?;

        Ok(())
    }

    /// Saves a task to the database
    pub fn save_task(&self, task: &ContinuousTask) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        let config_json = serde_json::to_string(&task.config)?;
        let result_json = task
            .result
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        conn.execute(
            r#"
            INSERT OR REPLACE INTO continuous_execution_tasks
            (id, description, status, priority, config_json, created_at, started_at, finished_at,
             current_step, consecutive_failures, tokens_used, requests_made, total_cost,
             last_error, last_checkpoint_id, result_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            "#,
            params![
                task.id,
                task.description,
                serde_json::to_string(&task.status)?,
                serde_json::to_string(&task.priority)?,
                config_json,
                task.created_at.to_rfc3339(),
                task.started_at.map(|dt| dt.to_rfc3339()),
                task.finished_at.map(|dt| dt.to_rfc3339()),
                task.current_step,
                task.consecutive_failures,
                task.tokens_used,
                task.requests_made,
                task.total_cost,
                task.last_error,
                task.last_checkpoint_id,
                result_json,
            ],
        )?;

        Ok(())
    }

    /// Loads a task from the database
    pub fn load_task(&self, task_id: &str) -> Result<Option<ContinuousTask>> {
        let conn = Connection::open(&self.db_path)?;

        let result: rusqlite::Result<ContinuousTask> = conn.query_row(
            r#"
            SELECT id, description, status, priority, config_json, created_at, started_at,
                   finished_at, current_step, consecutive_failures, tokens_used, requests_made,
                   total_cost, last_error, last_checkpoint_id, result_json
            FROM continuous_execution_tasks
            WHERE id = ?1
            "#,
            params![task_id],
            |row| {
                let status_str: String = row.get(2)?;
                let priority_str: String = row.get(3)?;
                let config_json: String = row.get(4)?;
                let created_at_str: String = row.get(5)?;
                let started_at_str: Option<String> = row.get(6)?;
                let finished_at_str: Option<String> = row.get(7)?;
                let result_json: Option<String> = row.get(15)?;

                Ok(ContinuousTask {
                    id: row.get(0)?,
                    description: row.get(1)?,
                    status: serde_json::from_str(&status_str)
                        .unwrap_or(ContinuousTaskStatus::Pending),
                    priority: serde_json::from_str(&priority_str).unwrap_or(Priority::Medium),
                    config: serde_json::from_str(&config_json).unwrap_or_default(),
                    created_at: DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    started_at: started_at_str.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok()
                    }),
                    finished_at: finished_at_str.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok()
                    }),
                    current_step: row.get(8)?,
                    consecutive_failures: row.get(9)?,
                    tokens_used: row.get(10)?,
                    requests_made: row.get(11)?,
                    total_cost: row.get(12)?,
                    last_error: row.get(13)?,
                    last_checkpoint_id: row.get(14)?,
                    result: result_json.and_then(|s| serde_json::from_str(&s).ok()),
                })
            },
        );

        match result {
            Ok(task) => Ok(Some(task)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Lists all non-terminal tasks (for resume on restart)
    pub fn list_resumable_tasks(&self) -> Result<Vec<ContinuousTask>> {
        let conn = Connection::open(&self.db_path)?;

        // M2: derive terminal-status strings programmatically from the enum so
        // that the SQL filter stays in sync if variant names ever change.
        let completed_status = serde_json::to_string(&ContinuousTaskStatus::Completed)
            .unwrap_or_else(|_| "\"completed\"".to_string());
        let failed_status = serde_json::to_string(&ContinuousTaskStatus::Failed)
            .unwrap_or_else(|_| "\"failed\"".to_string());
        let cancelled_status = serde_json::to_string(&ContinuousTaskStatus::Cancelled)
            .unwrap_or_else(|_| "\"cancelled\"".to_string());

        let sql = format!(
            r#"
            SELECT id, description, status, priority, config_json, created_at, started_at,
                   finished_at, current_step, consecutive_failures, tokens_used, requests_made,
                   total_cost, last_error, last_checkpoint_id, result_json
            FROM continuous_execution_tasks
            WHERE status NOT IN ('{}', '{}', '{}')
            ORDER BY created_at ASC
            "#,
            completed_status, failed_status, cancelled_status
        );

        let mut stmt = conn.prepare(&sql)?;

        let tasks = stmt
            .query_map([], |row| {
                let status_str: String = row.get(2)?;
                let priority_str: String = row.get(3)?;
                let config_json: String = row.get(4)?;
                let created_at_str: String = row.get(5)?;
                let started_at_str: Option<String> = row.get(6)?;
                let finished_at_str: Option<String> = row.get(7)?;
                let result_json: Option<String> = row.get(15)?;

                Ok(ContinuousTask {
                    id: row.get(0)?,
                    description: row.get(1)?,
                    status: serde_json::from_str(&status_str)
                        .unwrap_or(ContinuousTaskStatus::Pending),
                    priority: serde_json::from_str(&priority_str).unwrap_or(Priority::Medium),
                    config: serde_json::from_str(&config_json).unwrap_or_default(),
                    created_at: DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    started_at: started_at_str.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok()
                    }),
                    finished_at: finished_at_str.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok()
                    }),
                    current_step: row.get(8)?,
                    consecutive_failures: row.get(9)?,
                    tokens_used: row.get(10)?,
                    requests_made: row.get(11)?,
                    total_cost: row.get(12)?,
                    last_error: row.get(13)?,
                    last_checkpoint_id: row.get(14)?,
                    result: result_json.and_then(|s| serde_json::from_str(&s).ok()),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(tasks)
    }

    /// Saves a checkpoint
    pub fn save_checkpoint(&self, checkpoint: &ExecutionCheckpoint) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        // Disable foreign key constraints to allow checkpoints without existing tasks
        conn.execute_batch("PRAGMA foreign_keys = OFF")?;

        let metadata_json = serde_json::to_string(&checkpoint.metadata)?;

        conn.execute(
            r#"
            INSERT OR REPLACE INTO continuous_execution_checkpoints
            (id, task_id, step_number, total_steps_completed, context_json, tool_results_json,
             goal_json, metadata_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                checkpoint.id,
                checkpoint.task_id,
                checkpoint.step_number,
                checkpoint.total_steps_completed,
                checkpoint.context_json,
                checkpoint.tool_results_json,
                checkpoint.goal_json,
                metadata_json,
                checkpoint.created_at.to_rfc3339(),
            ],
        )?;

        // Update the task's last checkpoint ID
        conn.execute(
            "UPDATE continuous_execution_tasks SET last_checkpoint_id = ?1 WHERE id = ?2",
            params![checkpoint.id, checkpoint.task_id],
        )?;

        Ok(())
    }

    /// Loads the latest checkpoint for a task
    pub fn load_latest_checkpoint(&self, task_id: &str) -> Result<Option<ExecutionCheckpoint>> {
        let conn = Connection::open(&self.db_path)?;

        let result: rusqlite::Result<ExecutionCheckpoint> = conn.query_row(
            r#"
            SELECT id, task_id, step_number, total_steps_completed, context_json,
                   tool_results_json, goal_json, metadata_json, created_at
            FROM continuous_execution_checkpoints
            WHERE task_id = ?1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
            params![task_id],
            |row| {
                let metadata_json: Option<String> = row.get(7)?;
                let created_at_str: String = row.get(8)?;

                Ok(ExecutionCheckpoint {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    step_number: row.get(2)?,
                    total_steps_completed: row.get(3)?,
                    context_json: row.get(4)?,
                    tool_results_json: row.get(5)?,
                    goal_json: row.get(6)?,
                    metadata: metadata_json
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default(),
                    created_at: DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                })
            },
        );

        match result {
            Ok(checkpoint) => Ok(Some(checkpoint)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Deletes old checkpoints, keeping only the N most recent
    pub fn prune_checkpoints(&self, task_id: &str, keep_count: usize) -> Result<usize> {
        let conn = Connection::open(&self.db_path)?;

        let deleted = conn.execute(
            r#"
            DELETE FROM continuous_execution_checkpoints
            WHERE task_id = ?1 AND id NOT IN (
                SELECT id FROM continuous_execution_checkpoints
                WHERE task_id = ?1
                ORDER BY created_at DESC
                LIMIT ?2
            )
            "#,
            params![task_id, keep_count],
        )?;

        Ok(deleted)
    }

    /// Deletes a task and all its checkpoints
    pub fn delete_task(&self, task_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "DELETE FROM continuous_execution_checkpoints WHERE task_id = ?1",
            params![task_id],
        )?;

        conn.execute(
            "DELETE FROM continuous_execution_tasks WHERE id = ?1",
            params![task_id],
        )?;

        Ok(())
    }
}

// ============================================================================
// Continuous Executor
// ============================================================================

/// The main continuous executor that manages long-running tasks
pub struct ContinuousExecutor {
    /// Default configuration
    config: ContinuousExecutorConfig,
    /// Database path
    db_path: String,
    /// State persistence
    persistence: Arc<ExecutionStatePersistence>,
    /// Daily limit tracker
    limit_tracker: Arc<DailyLimitTracker>,
    /// Active tasks
    active_tasks: Arc<RwLock<HashMap<String, ContinuousTask>>>,
    /// Stop signals for each task
    stop_signals: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
    /// Pause signals for each task
    pause_signals: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
    /// Tauri app handle for emitting events
    app_handle: Option<tauri::AppHandle>,
    /// Global stop signal
    global_stop: Arc<AtomicBool>,
}

impl ContinuousExecutor {
    /// Creates a new continuous executor
    pub fn new(
        config: ContinuousExecutorConfig,
        db_path: String,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self> {
        let persistence = Arc::new(ExecutionStatePersistence::new(db_path.clone())?);
        let limit_tracker = Arc::new(DailyLimitTracker::new(&config));

        // Load daily stats from database
        if let Ok(conn) = Connection::open(&db_path) {
            let _ = limit_tracker.load_from_db(&conn);
        }

        Ok(Self {
            config,
            db_path,
            persistence,
            limit_tracker,
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            stop_signals: Arc::new(RwLock::new(HashMap::new())),
            pause_signals: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
            global_stop: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Starts a new continuous execution task
    pub async fn start_task(&self, description: String) -> Result<String> {
        self.start_task_with_config(description, self.config.clone())
            .await
    }

    /// Starts a new task with custom configuration
    pub async fn start_task_with_config(
        &self,
        description: String,
        config: ContinuousExecutorConfig,
    ) -> Result<String> {
        let task = ContinuousTask::new(description, config);
        let task_id = task.id.clone();

        // Save to persistence
        self.persistence.save_task(&task)?;

        // Add to active tasks
        self.active_tasks
            .write()
            .insert(task_id.clone(), task.clone());

        // Create control signals
        self.stop_signals
            .write()
            .insert(task_id.clone(), Arc::new(AtomicBool::new(false)));
        self.pause_signals
            .write()
            .insert(task_id.clone(), Arc::new(AtomicBool::new(false)));

        // Emit task created event
        self.emit_event(
            "continuous:task_created",
            serde_json::json!({
                "task_id": task_id,
                "description": task.description,
                "status": task.status,
            }),
        );

        tracing::info!(
            "[ContinuousExecutor] Task {} created: {}",
            task_id,
            task.description
        );

        // Start the execution loop
        let executor = self.clone_for_task();
        let task_id_clone = task_id.clone();
        tokio::spawn(async move {
            if let Err(e) = executor.run_task_loop(task_id_clone.clone()).await {
                tracing::error!("[ContinuousExecutor] Task {} failed: {}", task_id_clone, e);
            }
        });

        Ok(task_id)
    }

    /// Resumes a paused or limit-reached task
    pub async fn resume_task(&self, task_id: &str) -> Result<()> {
        let task = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .or_else(|| self.persistence.load_task(task_id).ok().flatten())
            .ok_or_else(|| anyhow!("Task {} not found", task_id))?;

        if !task.status.can_resume() {
            return Err(anyhow!(
                "Task {} cannot be resumed (status: {:?})",
                task_id,
                task.status
            ));
        }

        // Clear pause signal
        if let Some(signal) = self.pause_signals.read().get(task_id) {
            signal.store(false, Ordering::SeqCst);
        }

        // Update status
        self.update_task_status(task_id, ContinuousTaskStatus::Running)?;

        tracing::info!("[ContinuousExecutor] Task {} resumed", task_id);

        // If task was in LimitReached, the loop will continue once limits reset
        // If task was Paused, the loop will continue immediately

        Ok(())
    }

    /// Pauses a running task
    pub fn pause_task(&self, task_id: &str) -> Result<()> {
        if let Some(signal) = self.pause_signals.read().get(task_id) {
            signal.store(true, Ordering::SeqCst);
            self.update_task_status(task_id, ContinuousTaskStatus::Paused)?;
            tracing::info!("[ContinuousExecutor] Task {} paused", task_id);
            Ok(())
        } else {
            Err(anyhow!("Task {} not found or not running", task_id))
        }
    }

    /// Cancels a task
    pub fn cancel_task(&self, task_id: &str) -> Result<()> {
        if let Some(signal) = self.stop_signals.read().get(task_id) {
            signal.store(true, Ordering::SeqCst);
            self.update_task_status(task_id, ContinuousTaskStatus::Cancelled)?;
            tracing::info!("[ContinuousExecutor] Task {} cancelled", task_id);
            Ok(())
        } else {
            Err(anyhow!("Task {} not found", task_id))
        }
    }

    /// Gets the current status of a task
    pub fn get_task(&self, task_id: &str) -> Result<Option<ContinuousTask>> {
        if let Some(task) = self.active_tasks.read().get(task_id) {
            return Ok(Some(task.clone()));
        }
        self.persistence.load_task(task_id)
    }

    /// Lists all active tasks
    pub fn list_active_tasks(&self) -> Vec<ContinuousTask> {
        self.active_tasks.read().values().cloned().collect()
    }

    /// Resumes all resumable tasks (called on app restart)
    pub async fn resume_all_tasks(&self) -> Result<Vec<String>> {
        let tasks = self.persistence.list_resumable_tasks()?;
        let mut resumed = Vec::new();

        for task in tasks {
            if task.config.auto_resume_on_restart && !task.status.is_terminal() {
                let task_id = task.id.clone();

                // Add to active tasks
                self.active_tasks.write().insert(task_id.clone(), task);

                // Create control signals
                self.stop_signals
                    .write()
                    .insert(task_id.clone(), Arc::new(AtomicBool::new(false)));
                self.pause_signals
                    .write()
                    .insert(task_id.clone(), Arc::new(AtomicBool::new(false)));

                // Start the execution loop
                let executor = self.clone_for_task();
                let task_id_clone = task_id.clone();
                tokio::spawn(async move {
                    if let Err(e) = executor.run_task_loop(task_id_clone.clone()).await {
                        tracing::error!(
                            "[ContinuousExecutor] Resumed task {} failed: {}",
                            task_id_clone,
                            e
                        );
                    }
                });

                resumed.push(task_id);
            }
        }

        tracing::info!(
            "[ContinuousExecutor] Resumed {} tasks on restart",
            resumed.len()
        );

        Ok(resumed)
    }

    /// Gets daily usage statistics
    pub fn get_daily_stats(&self) -> DailyUsageStats {
        self.limit_tracker.get_stats()
    }

    /// Updates daily limits
    pub fn update_limits(&self, token_limit: u64, request_limit: u64) {
        self.limit_tracker.update_limits(token_limit, request_limit);
    }

    /// Stops the executor globally
    pub fn stop_all(&self) {
        self.global_stop.store(true, Ordering::SeqCst);

        for signal in self.stop_signals.read().values() {
            signal.store(true, Ordering::SeqCst);
        }

        tracing::info!("[ContinuousExecutor] Global stop signal sent");
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    /// Clones the executor for spawning a task
    fn clone_for_task(&self) -> Self {
        Self {
            config: self.config.clone(),
            db_path: self.db_path.clone(),
            persistence: self.persistence.clone(),
            limit_tracker: self.limit_tracker.clone(),
            active_tasks: self.active_tasks.clone(),
            stop_signals: self.stop_signals.clone(),
            pause_signals: self.pause_signals.clone(),
            app_handle: self.app_handle.clone(),
            global_stop: self.global_stop.clone(),
        }
    }

    /// Main execution loop for a task
    async fn run_task_loop(&self, task_id: String) -> Result<()> {
        let start_time = Instant::now();
        let mut steps_since_checkpoint = 0u32;

        // Get the stop and pause signals
        let stop_signal = self
            .stop_signals
            .read()
            .get(&task_id)
            .cloned()
            .ok_or_else(|| anyhow!("Stop signal not found for task {}", task_id))?;

        let pause_signal = self
            .pause_signals
            .read()
            .get(&task_id)
            .cloned()
            .ok_or_else(|| anyhow!("Pause signal not found for task {}", task_id))?;

        // Update status to running
        self.update_task_status(&task_id, ContinuousTaskStatus::Running)?;
        self.update_task_field(&task_id, |t| t.started_at = Some(Utc::now()))?;

        // Try to restore from checkpoint if available
        let checkpoint = self.persistence.load_latest_checkpoint(&task_id)?;
        if let Some(ref cp) = checkpoint {
            tracing::info!(
                "[ContinuousExecutor] Resuming task {} from checkpoint at step {}",
                task_id,
                cp.step_number
            );
            self.update_task_field(&task_id, |t| {
                t.current_step = cp.step_number;
            })?;
        }

        // Main execution loop
        loop {
            // Check global stop
            if self.global_stop.load(Ordering::SeqCst) {
                tracing::info!(
                    "[ContinuousExecutor] Global stop detected for task {}",
                    task_id
                );
                self.update_task_status(&task_id, ContinuousTaskStatus::Paused)?;
                break;
            }

            // Check task stop signal
            if stop_signal.load(Ordering::SeqCst) {
                tracing::info!(
                    "[ContinuousExecutor] Stop signal detected for task {}",
                    task_id
                );
                self.update_task_status(&task_id, ContinuousTaskStatus::Cancelled)?;
                self.finalize_task(&task_id)?;
                break;
            }

            // Check pause signal
            if pause_signal.load(Ordering::SeqCst) {
                tracing::info!("[ContinuousExecutor] Task {} paused", task_id);
                self.update_task_status(&task_id, ContinuousTaskStatus::Paused)?;
                self.emit_progress(&task_id, start_time)?;

                // Wait until unpaused
                while pause_signal.load(Ordering::SeqCst)
                    && !stop_signal.load(Ordering::SeqCst)
                    && !self.global_stop.load(Ordering::SeqCst)
                {
                    sleep(std::time::Duration::from_millis(100)).await;
                }

                if stop_signal.load(Ordering::SeqCst) || self.global_stop.load(Ordering::SeqCst) {
                    continue;
                }

                tracing::info!("[ContinuousExecutor] Task {} resumed", task_id);
                self.update_task_status(&task_id, ContinuousTaskStatus::Running)?;
            }

            // Check daily limits
            if self.limit_tracker.is_limit_exceeded() {
                tracing::info!(
                    "[ContinuousExecutor] Daily limit reached for task {}, waiting for reset",
                    task_id
                );
                self.update_task_status(&task_id, ContinuousTaskStatus::LimitReached)?;
                self.emit_progress(&task_id, start_time)?;

                // Save checkpoint before waiting
                self.create_checkpoint(&task_id)?;

                // Wait for limit reset
                self.limit_tracker.wait_for_reset().await;

                if stop_signal.load(Ordering::SeqCst) || self.global_stop.load(Ordering::SeqCst) {
                    continue;
                }

                tracing::info!(
                    "[ContinuousExecutor] Daily limit reset, resuming task {}",
                    task_id
                );
                self.update_task_status(&task_id, ContinuousTaskStatus::Running)?;
            }

            // Check deadline
            if let Some(task) = self.active_tasks.read().get(&task_id) {
                if let Some(deadline) = task.config.deadline {
                    if Utc::now() > deadline {
                        tracing::warn!("[ContinuousExecutor] Task {} exceeded deadline", task_id);
                        self.update_task_status(&task_id, ContinuousTaskStatus::Failed)?;
                        self.update_task_field(&task_id, |t| {
                            t.last_error = Some("Task exceeded deadline".to_string());
                        })?;
                        self.finalize_task(&task_id)?;
                        break;
                    }
                }
            }

            // Execute the next step
            let step_result = self.execute_step(&task_id).await;

            match step_result {
                Ok(completed) => {
                    if completed {
                        // Task completed successfully
                        tracing::info!(
                            "[ContinuousExecutor] Task {} completed successfully",
                            task_id
                        );
                        self.update_task_status(&task_id, ContinuousTaskStatus::Completed)?;
                        self.finalize_task(&task_id)?;
                        break;
                    }

                    // Reset consecutive failures on success
                    self.update_task_field(&task_id, |t| {
                        t.current_step += 1;
                        t.consecutive_failures = 0;
                    })?;

                    steps_since_checkpoint += 1;

                    // Check if we should create a checkpoint
                    let checkpoint_interval = self
                        .active_tasks
                        .read()
                        .get(&task_id)
                        .map(|t| t.config.checkpoint_interval)
                        .unwrap_or(DEFAULT_CHECKPOINT_INTERVAL);

                    if steps_since_checkpoint >= checkpoint_interval {
                        self.create_checkpoint(&task_id)?;
                        steps_since_checkpoint = 0;
                    }

                    // Emit progress
                    self.emit_progress(&task_id, start_time)?;
                }
                Err(e) => {
                    // Handle failure with retry logic
                    tracing::warn!("[ContinuousExecutor] Task {} step failed: {}", task_id, e);

                    let (consecutive_failures, max_failures) = {
                        let tasks = self.active_tasks.read();
                        let task = tasks.get(&task_id);
                        (
                            task.map(|t| t.consecutive_failures + 1).unwrap_or(1),
                            task.map(|t| t.config.max_consecutive_failures)
                                .unwrap_or(MAX_CONSECUTIVE_FAILURES),
                        )
                    };

                    self.update_task_field(&task_id, |t| {
                        t.consecutive_failures = consecutive_failures;
                        t.last_error = Some(e.to_string());
                    })?;

                    if consecutive_failures >= max_failures {
                        tracing::error!(
                            "[ContinuousExecutor] Task {} failed after {} consecutive failures",
                            task_id,
                            consecutive_failures
                        );
                        self.update_task_status(&task_id, ContinuousTaskStatus::Failed)?;
                        self.finalize_task(&task_id)?;
                        break;
                    }

                    // Calculate exponential backoff delay with saturating arithmetic
                    // to prevent overflow when consecutive_failures is large
                    let delay_secs = std::cmp::min(
                        BASE_RETRY_DELAY_SECS.saturating_mul(
                            2u64.saturating_pow(consecutive_failures.saturating_sub(1).min(62)),
                        ),
                        MAX_RETRY_DELAY_SECS,
                    );

                    tracing::info!(
                        "[ContinuousExecutor] Task {} retrying in {}s (attempt {}/{})",
                        task_id,
                        delay_secs,
                        consecutive_failures,
                        max_failures
                    );

                    self.update_task_status(&task_id, ContinuousTaskStatus::Recovering)?;
                    self.emit_progress(&task_id, start_time)?;

                    // Create checkpoint before retry
                    self.create_checkpoint(&task_id)?;

                    sleep(std::time::Duration::from_secs(delay_secs)).await;

                    self.update_task_status(&task_id, ContinuousTaskStatus::Running)?;
                }
            }

            // Small delay between steps to avoid overwhelming the system
            sleep(std::time::Duration::from_millis(50)).await;
        }

        // Cleanup
        self.stop_signals.write().remove(&task_id);
        self.pause_signals.write().remove(&task_id);

        Ok(())
    }

    /// Executes a single step of the task
    /// Returns Ok(true) if task is complete, Ok(false) if more steps needed
    async fn execute_step(&self, task_id: &str) -> Result<bool> {
        // This is a placeholder - in the real implementation, this would:
        // 1. Get the current goal and context from the task
        // 2. Call the AGI planner to create/update the plan
        // 3. Execute the next step via the AGI executor
        // 4. Track token usage and update the limit tracker

        let task = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("Task {} not found", task_id))?;

        // Simulate step execution (replace with actual AGI integration)
        // In production, this would call into the AGICore

        // Record mock usage
        let tokens_used = 100u64;
        let cost = 0.001f64;
        self.limit_tracker.record_usage(tokens_used, cost);

        // Update task stats
        self.update_task_field(task_id, |t| {
            t.tokens_used += tokens_used;
            t.requests_made += 1;
            t.total_cost += cost;
        })?;

        // For now, simulate completion after 100 steps
        // In production, this would check actual completion criteria
        if task.current_step >= 100 {
            return Ok(true);
        }

        Ok(false)
    }

    /// Creates a checkpoint for the task
    fn create_checkpoint(&self, task_id: &str) -> Result<()> {
        let task = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("Task {} not found", task_id))?;

        let checkpoint = ExecutionCheckpoint {
            id: Uuid::new_v4().to_string(),
            task_id: task_id.to_string(),
            step_number: task.current_step,
            total_steps_completed: task.current_step,
            context_json: "{}".to_string(), // Would serialize actual context
            tool_results_json: "[]".to_string(), // Would serialize actual results
            goal_json: serde_json::to_string(&task.description)?,
            metadata: HashMap::from([
                ("tokens_used".to_string(), task.tokens_used.to_string()),
                ("requests_made".to_string(), task.requests_made.to_string()),
            ]),
            created_at: Utc::now(),
        };

        self.persistence.save_checkpoint(&checkpoint)?;

        // Update task with checkpoint ID
        self.update_task_field(task_id, |t| {
            t.last_checkpoint_id = Some(checkpoint.id.clone());
        })?;

        // Prune old checkpoints (keep last 5)
        self.persistence.prune_checkpoints(task_id, 5)?;

        tracing::debug!(
            "[ContinuousExecutor] Created checkpoint for task {} at step {}",
            task_id,
            task.current_step
        );

        self.emit_event(
            "continuous:checkpoint_created",
            serde_json::json!({
                "task_id": task_id,
                "checkpoint_id": checkpoint.id,
                "step_number": checkpoint.step_number,
            }),
        );

        Ok(())
    }

    /// Updates the status of a task
    fn update_task_status(&self, task_id: &str, status: ContinuousTaskStatus) -> Result<()> {
        self.update_task_field(task_id, |t| {
            t.status = status;
        })?;

        self.emit_event(
            "continuous:task_status_changed",
            serde_json::json!({
                "task_id": task_id,
                "status": status,
            }),
        );

        Ok(())
    }

    /// Updates a field on the task
    fn update_task_field<F>(&self, task_id: &str, update_fn: F) -> Result<()>
    where
        F: FnOnce(&mut ContinuousTask),
    {
        let mut tasks = self.active_tasks.write();
        if let Some(task) = tasks.get_mut(task_id) {
            update_fn(task);
            // Persist to database
            self.persistence.save_task(task)?;
        }
        Ok(())
    }

    /// Finalizes a task (cleanup after completion/failure/cancellation)
    fn finalize_task(&self, task_id: &str) -> Result<()> {
        self.update_task_field(task_id, |t| {
            t.finished_at = Some(Utc::now());
        })?;

        // Persist final daily stats
        if let Ok(conn) = Connection::open(&self.db_path) {
            let _ = self.limit_tracker.persist_to_db(&conn);
        }

        // Remove from active tasks after a delay (so UI can show final state)
        let tasks = self.active_tasks.clone();
        let task_id_owned = task_id.to_string();
        tokio::spawn(async move {
            sleep(std::time::Duration::from_secs(60)).await;
            tasks.write().remove(&task_id_owned);
        });

        Ok(())
    }

    /// Emits progress update to the frontend
    fn emit_progress(&self, task_id: &str, start_time: Instant) -> Result<()> {
        let task = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("Task {} not found", task_id))?;

        let progress = ExecutionProgress {
            task_id: task_id.to_string(),
            status: task.status,
            current_step: task.current_step,
            total_steps: None,     // Unknown until completion
            progress_percent: 0.0, // Would be calculated from actual progress
            current_activity: format!("Executing step {}", task.current_step),
            elapsed_secs: start_time.elapsed().as_secs(),
            eta_secs: None, // Would be estimated from progress rate
            retry_count: task.consecutive_failures,
            tokens_used: task.tokens_used,
            daily_stats: self.limit_tracker.get_stats(),
            last_checkpoint_id: task.last_checkpoint_id,
        };

        self.emit_event("continuous:progress", serde_json::to_value(&progress)?);

        Ok(())
    }

    /// Emits an event to the frontend
    fn emit_event(&self, event: &str, payload: serde_json::Value) {
        if let Some(ref app) = self.app_handle {
            if let Err(e) = app.emit(event, payload) {
                tracing::warn!("[ContinuousExecutor] Failed to emit event {}: {}", event, e);
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_config() -> ContinuousExecutorConfig {
        ContinuousExecutorConfig {
            checkpoint_interval: 2,
            max_consecutive_failures: 3,
            daily_token_limit: 1000,
            daily_request_limit: 100,
            auto_resume_on_restart: true,
            timezone: "UTC".to_string(),
            deadline: None,
        }
    }

    #[test]
    fn test_task_creation() {
        let config = create_test_config();
        let task = ContinuousTask::new("Test task".to_string(), config);

        assert_eq!(task.status, ContinuousTaskStatus::Pending);
        assert_eq!(task.current_step, 0);
        assert_eq!(task.consecutive_failures, 0);
        assert!(!task.id.is_empty());
    }

    #[test]
    fn test_task_status_terminal() {
        assert!(ContinuousTaskStatus::Completed.is_terminal());
        assert!(ContinuousTaskStatus::Failed.is_terminal());
        assert!(ContinuousTaskStatus::Cancelled.is_terminal());
        assert!(!ContinuousTaskStatus::Running.is_terminal());
        assert!(!ContinuousTaskStatus::Paused.is_terminal());
    }

    #[test]
    fn test_task_status_can_resume() {
        assert!(ContinuousTaskStatus::Paused.can_resume());
        assert!(ContinuousTaskStatus::LimitReached.can_resume());
        assert!(!ContinuousTaskStatus::Running.can_resume());
        assert!(!ContinuousTaskStatus::Completed.can_resume());
    }

    #[test]
    fn test_daily_limit_tracker() {
        let config = create_test_config();
        let tracker = DailyLimitTracker::new(&config);

        assert!(!tracker.is_limit_exceeded());

        // Record usage up to limit
        for _ in 0..10 {
            tracker.record_usage(100, 0.01);
        }

        // Should be at limit now (1000 tokens)
        assert!(tracker.is_limit_exceeded());

        let stats = tracker.get_stats();
        assert_eq!(stats.tokens_used, 1000);
        assert_eq!(stats.requests_made, 10);
    }

    #[test]
    fn test_persistence() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

        let persistence = ExecutionStatePersistence::new(db_path).unwrap();

        // Create and save a task
        let config = create_test_config();
        let mut task = ContinuousTask::new("Test task".to_string(), config);
        task.current_step = 5;
        task.tokens_used = 500;

        persistence.save_task(&task).unwrap();

        // Load it back
        let loaded = persistence.load_task(&task.id).unwrap().unwrap();
        assert_eq!(loaded.id, task.id);
        assert_eq!(loaded.current_step, 5);
        assert_eq!(loaded.tokens_used, 500);
    }

    #[test]
    fn test_checkpoint_persistence() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

        let persistence = ExecutionStatePersistence::new(db_path).unwrap();

        let task_id = Uuid::new_v4().to_string();

        // Create a checkpoint
        let checkpoint = ExecutionCheckpoint {
            id: Uuid::new_v4().to_string(),
            task_id: task_id.clone(),
            step_number: 10,
            total_steps_completed: 10,
            context_json: "{}".to_string(),
            tool_results_json: "[]".to_string(),
            goal_json: "\"test goal\"".to_string(),
            metadata: HashMap::new(),
            created_at: Utc::now(),
        };

        persistence.save_checkpoint(&checkpoint).unwrap();

        // Load it back
        let loaded = persistence
            .load_latest_checkpoint(&task_id)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.id, checkpoint.id);
        assert_eq!(loaded.step_number, 10);
    }

    #[test]
    fn test_resumable_tasks() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_str().unwrap().to_string();

        let persistence = ExecutionStatePersistence::new(db_path).unwrap();

        let config = create_test_config();

        // Create tasks with different statuses
        let mut pending = ContinuousTask::new("Pending task".to_string(), config.clone());
        pending.status = ContinuousTaskStatus::Pending;

        let mut running = ContinuousTask::new("Running task".to_string(), config.clone());
        running.status = ContinuousTaskStatus::Running;

        let mut completed = ContinuousTask::new("Completed task".to_string(), config.clone());
        completed.status = ContinuousTaskStatus::Completed;

        persistence.save_task(&pending).unwrap();
        persistence.save_task(&running).unwrap();
        persistence.save_task(&completed).unwrap();

        // Only pending and running should be resumable
        let resumable = persistence.list_resumable_tasks().unwrap();
        assert_eq!(resumable.len(), 2);
        assert!(resumable.iter().any(|t| t.id == pending.id));
        assert!(resumable.iter().any(|t| t.id == running.id));
        assert!(!resumable.iter().any(|t| t.id == completed.id));
    }
}
