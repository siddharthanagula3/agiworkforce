//! Background Task Persistence and Management
//!
//! This module provides persistent storage for long-running background tasks,
//! enabling resumption across app restarts and progress tracking.
//!
//! # Features
//!
//! - Persistent task queue in SQLite
//! - Task state serialization and deserialization
//! - Automatic resumption on app startup
//! - Progress checkpoint storage
//! - Task history and completion tracking

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// Persistent background task information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentTask {
    /// Unique task ID
    pub id: String,
    /// Task description/goal
    pub description: String,
    /// Current task status
    pub status: String,
    /// Current step index
    pub current_step: i32,
    /// Total steps (estimated)
    pub total_steps: i32,
    /// Timeout in seconds
    pub timeout_secs: i64,
    /// Elapsed time in seconds
    pub elapsed_secs: i64,
    /// Task creation timestamp
    pub created_at: DateTime<Utc>,
    /// Task start timestamp
    pub started_at: Option<DateTime<Utc>>,
    /// Task completion timestamp
    pub completed_at: Option<DateTime<Utc>>,
    /// Serialized execution context
    pub context_json: String,
    /// Serialized progress data
    pub progress_json: String,
    /// Task priority (0-3)
    pub priority: i32,
    /// User notes/description
    pub notes: Option<String>,
}

impl PersistentTask {
    pub fn new(id: String, description: String, timeout_secs: u64) -> Self {
        Self {
            id,
            description,
            status: "queued".to_string(),
            current_step: 0,
            total_steps: 0,
            timeout_secs: timeout_secs as i64,
            elapsed_secs: 0,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            context_json: "{}".to_string(),
            progress_json: "{}".to_string(),
            priority: 1,
            notes: None,
        }
    }
}

/// Progress checkpoint for a task
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCheckpoint {
    /// Checkpoint ID
    pub id: String,
    /// Associated task ID
    pub task_id: String,
    /// Current step number
    pub step_number: i32,
    /// Serialized execution context
    pub context_json: String,
    /// Serialized tool results
    pub tool_results_json: String,
    /// Checkpoint creation timestamp
    pub created_at: DateTime<Utc>,
    /// Additional metadata
    pub metadata_json: String,
}

impl TaskCheckpoint {
    pub fn new(
        task_id: String,
        step_number: i32,
        context_json: String,
        tool_results_json: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task_id,
            step_number,
            context_json,
            tool_results_json,
            created_at: Utc::now(),
            metadata_json: "{}".to_string(),
        }
    }
}

/// Task storage manager
pub struct TaskStorage {
    db: Arc<Mutex<Connection>>,
}

impl TaskStorage {
    pub fn new(db: Arc<Mutex<Connection>>) -> Result<Self> {
        {
            let conn = db
                .lock()
                .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

            // Create tables if they don't exist
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS persistent_tasks (
                    id TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    status TEXT NOT NULL,
                    current_step INTEGER NOT NULL DEFAULT 0,
                    total_steps INTEGER NOT NULL DEFAULT 0,
                    timeout_secs INTEGER NOT NULL DEFAULT 86400,
                    elapsed_secs INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    context_json TEXT NOT NULL,
                    progress_json TEXT NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 1,
                    notes TEXT,
                    CHECK(priority >= 0 AND priority <= 3)
                );

                CREATE TABLE IF NOT EXISTS task_checkpoints (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    step_number INTEGER NOT NULL,
                    context_json TEXT NOT NULL,
                    tool_results_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES persistent_tasks(id)
                );

                CREATE INDEX IF NOT EXISTS idx_checkpoints_task_id ON task_checkpoints(task_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON persistent_tasks(status);
                "#,
            )?;
        }

        Ok(Self { db })
    }

    /// Store a task
    pub fn save_task(&self, task: &PersistentTask) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO persistent_tasks
             (id, description, status, current_step, total_steps, timeout_secs, elapsed_secs,
              created_at, started_at, completed_at, context_json, progress_json, priority, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &task.id,
                &task.description,
                &task.status,
                task.current_step,
                task.total_steps,
                task.timeout_secs,
                task.elapsed_secs,
                task.created_at.to_rfc3339(),
                task.started_at.map(|t| t.to_rfc3339()),
                task.completed_at.map(|t| t.to_rfc3339()),
                &task.context_json,
                &task.progress_json,
                task.priority,
                &task.notes,
            ],
        )?;

        Ok(())
    }

    /// Retrieve a task by ID
    pub fn load_task(&self, task_id: &str) -> Result<Option<PersistentTask>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, description, status, current_step, total_steps, timeout_secs, elapsed_secs,
                    created_at, started_at, completed_at, context_json, progress_json, priority, notes
             FROM persistent_tasks WHERE id = ?"
        )?;

        let task = stmt
            .query_row(params![task_id], |row| {
                Ok(PersistentTask {
                    id: row.get(0)?,
                    description: row.get(1)?,
                    status: row.get(2)?,
                    current_step: row.get(3)?,
                    total_steps: row.get(4)?,
                    timeout_secs: row.get(5)?,
                    elapsed_secs: row.get(6)?,
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now),
                    started_at: row
                        .get::<_, Option<String>>(8)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                    completed_at: row
                        .get::<_, Option<String>>(9)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                    context_json: row.get(10)?,
                    progress_json: row.get(11)?,
                    priority: row.get(12)?,
                    notes: row.get(13)?,
                })
            })
            .optional()?;

        Ok(task)
    }

    /// List all tasks with a given status
    pub fn list_tasks_by_status(&self, status: &str) -> Result<Vec<PersistentTask>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, description, status, current_step, total_steps, timeout_secs, elapsed_secs,
                    created_at, started_at, completed_at, context_json, progress_json, priority, notes
             FROM persistent_tasks WHERE status = ? ORDER BY priority DESC, created_at DESC"
        )?;

        let tasks = stmt.query_map(params![status], |row| {
            Ok(PersistentTask {
                id: row.get(0)?,
                description: row.get(1)?,
                status: row.get(2)?,
                current_step: row.get(3)?,
                total_steps: row.get(4)?,
                timeout_secs: row.get(5)?,
                elapsed_secs: row.get(6)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now),
                started_at: row
                    .get::<_, Option<String>>(8)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc)),
                completed_at: row
                    .get::<_, Option<String>>(9)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc)),
                context_json: row.get(10)?,
                progress_json: row.get(11)?,
                priority: row.get(12)?,
                notes: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for task in tasks {
            result.push(task?);
        }
        Ok(result)
    }

    /// List all incomplete tasks (for auto-resume)
    pub fn list_resumable_tasks(&self) -> Result<Vec<PersistentTask>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, description, status, current_step, total_steps, timeout_secs, elapsed_secs,
                    created_at, started_at, completed_at, context_json, progress_json, priority, notes
             FROM persistent_tasks WHERE status IN ('paused', 'queued')
             ORDER BY priority DESC, created_at DESC"
        )?;

        let tasks = stmt.query_map([], |row| {
            Ok(PersistentTask {
                id: row.get(0)?,
                description: row.get(1)?,
                status: row.get(2)?,
                current_step: row.get(3)?,
                total_steps: row.get(4)?,
                timeout_secs: row.get(5)?,
                elapsed_secs: row.get(6)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now),
                started_at: row
                    .get::<_, Option<String>>(8)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc)),
                completed_at: row
                    .get::<_, Option<String>>(9)?
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc)),
                context_json: row.get(10)?,
                progress_json: row.get(11)?,
                priority: row.get(12)?,
                notes: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for task in tasks {
            result.push(task?);
        }
        Ok(result)
    }

    /// Delete a task
    pub fn delete_task(&self, task_id: &str) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        // Delete checkpoints first (foreign key constraint)
        conn.execute(
            "DELETE FROM task_checkpoints WHERE task_id = ?",
            params![task_id],
        )?;

        // Delete task
        conn.execute(
            "DELETE FROM persistent_tasks WHERE id = ?",
            params![task_id],
        )?;

        Ok(())
    }

    /// Save a checkpoint
    pub fn save_checkpoint(&self, checkpoint: &TaskCheckpoint) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        conn.execute(
            "INSERT INTO task_checkpoints
             (id, task_id, step_number, context_json, tool_results_json, created_at, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                &checkpoint.id,
                &checkpoint.task_id,
                checkpoint.step_number,
                &checkpoint.context_json,
                &checkpoint.tool_results_json,
                checkpoint.created_at.to_rfc3339(),
                &checkpoint.metadata_json,
            ],
        )?;

        Ok(())
    }

    /// Get the latest checkpoint for a task
    pub fn get_latest_checkpoint(&self, task_id: &str) -> Result<Option<TaskCheckpoint>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, task_id, step_number, context_json, tool_results_json, created_at, metadata_json
             FROM task_checkpoints WHERE task_id = ?
             ORDER BY step_number DESC LIMIT 1"
        )?;

        let checkpoint = stmt
            .query_row(params![task_id], |row| {
                Ok(TaskCheckpoint {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    step_number: row.get(2)?,
                    context_json: row.get(3)?,
                    tool_results_json: row.get(4)?,
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now),
                    metadata_json: row.get(6)?,
                })
            })
            .optional()?;

        Ok(checkpoint)
    }

    /// Clean up old completed tasks (older than days)
    pub fn cleanup_old_tasks(&self, days: i32) -> Result<usize> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let cutoff = Utc::now() - chrono::Duration::days(days as i64);

        let rows = conn.execute(
            "DELETE FROM persistent_tasks
             WHERE status IN ('completed', 'failed', 'cancelled')
             AND completed_at < ?",
            params![cutoff.to_rfc3339()],
        )?;

        Ok(rows)
    }
}

/// Autonomous task checkpoint for resume across app restarts.
///
/// Captures the full state of an autonomous task execution at a point in time:
/// task description, planned steps, current progress, conversation history,
/// tool results, retry/replan counts, and cumulative cost.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutonomousTaskCheckpoint {
    /// Checkpoint UUID
    pub id: String,
    /// Original task ID from the autonomous agent
    pub task_id: String,
    /// Task description / goal
    pub description: String,
    /// Serialized task steps (JSON array of TaskStep)
    pub steps_json: String,
    /// Index of the step that was last completed successfully
    pub completed_step_index: i32,
    /// Total number of steps in the plan
    pub total_steps: i32,
    /// Number of retries consumed so far
    pub retry_count: i32,
    /// Number of replans consumed so far
    pub replan_count: i32,
    /// Whether the task uses auto-approve
    pub auto_approve: bool,
    /// Cumulative LLM cost in USD at checkpoint time
    pub cumulative_cost: f64,
    /// Serialized conversation history (JSON array of messages)
    pub conversation_history_json: String,
    /// Serialized tool results from completed steps (JSON array)
    pub tool_results_json: String,
    /// Checkpoint creation timestamp
    pub created_at: DateTime<Utc>,
    /// Task status at checkpoint time (e.g. "paused", "executing")
    pub status: String,
}

impl AutonomousTaskCheckpoint {
    pub fn new(
        task_id: String,
        description: String,
        steps_json: String,
        completed_step_index: i32,
        total_steps: i32,
        retry_count: i32,
        replan_count: i32,
        auto_approve: bool,
        cumulative_cost: f64,
        conversation_history_json: String,
        tool_results_json: String,
        status: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task_id,
            description,
            steps_json,
            completed_step_index,
            total_steps,
            retry_count,
            replan_count,
            auto_approve,
            cumulative_cost,
            conversation_history_json,
            tool_results_json,
            created_at: Utc::now(),
            status,
        }
    }
}

impl TaskStorage {
    /// Ensure the autonomous_task_checkpoints table exists.
    pub fn ensure_autonomous_table(&self) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS autonomous_task_checkpoints (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                description TEXT NOT NULL,
                steps_json TEXT NOT NULL,
                completed_step_index INTEGER NOT NULL DEFAULT 0,
                total_steps INTEGER NOT NULL DEFAULT 0,
                retry_count INTEGER NOT NULL DEFAULT 0,
                replan_count INTEGER NOT NULL DEFAULT 0,
                auto_approve INTEGER NOT NULL DEFAULT 0,
                cumulative_cost REAL NOT NULL DEFAULT 0.0,
                conversation_history_json TEXT NOT NULL DEFAULT '[]',
                tool_results_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'paused'
            );
            CREATE INDEX IF NOT EXISTS idx_auto_checkpoints_task_id
                ON autonomous_task_checkpoints(task_id);
            "#,
        )?;

        Ok(())
    }

    /// Save an autonomous task checkpoint.
    pub fn save_autonomous_checkpoint(&self, checkpoint: &AutonomousTaskCheckpoint) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO autonomous_task_checkpoints
             (id, task_id, description, steps_json, completed_step_index, total_steps,
              retry_count, replan_count, auto_approve, cumulative_cost,
              conversation_history_json, tool_results_json, created_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &checkpoint.id,
                &checkpoint.task_id,
                &checkpoint.description,
                &checkpoint.steps_json,
                checkpoint.completed_step_index,
                checkpoint.total_steps,
                checkpoint.retry_count,
                checkpoint.replan_count,
                checkpoint.auto_approve as i32,
                checkpoint.cumulative_cost,
                &checkpoint.conversation_history_json,
                &checkpoint.tool_results_json,
                checkpoint.created_at.to_rfc3339(),
                &checkpoint.status,
            ],
        )?;

        Ok(())
    }

    /// Load the latest autonomous checkpoint for a given task ID.
    pub fn load_latest_autonomous_checkpoint(
        &self,
        task_id: &str,
    ) -> Result<Option<AutonomousTaskCheckpoint>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, task_id, description, steps_json, completed_step_index, total_steps,
                    retry_count, replan_count, auto_approve, cumulative_cost,
                    conversation_history_json, tool_results_json, created_at, status
             FROM autonomous_task_checkpoints
             WHERE task_id = ?
             ORDER BY created_at DESC
             LIMIT 1",
        )?;

        let checkpoint = stmt
            .query_row(params![task_id], |row| {
                Ok(AutonomousTaskCheckpoint {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    description: row.get(2)?,
                    steps_json: row.get(3)?,
                    completed_step_index: row.get(4)?,
                    total_steps: row.get(5)?,
                    retry_count: row.get(6)?,
                    replan_count: row.get(7)?,
                    auto_approve: row.get::<_, i32>(8)? != 0,
                    cumulative_cost: row.get(9)?,
                    conversation_history_json: row.get(10)?,
                    tool_results_json: row.get(11)?,
                    created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(12)?)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now),
                    status: row.get(13)?,
                })
            })
            .optional()?;

        Ok(checkpoint)
    }

    /// List all autonomous checkpoints for a given task, newest first.
    pub fn list_autonomous_checkpoints(
        &self,
        task_id: &str,
    ) -> Result<Vec<AutonomousTaskCheckpoint>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, task_id, description, steps_json, completed_step_index, total_steps,
                    retry_count, replan_count, auto_approve, cumulative_cost,
                    conversation_history_json, tool_results_json, created_at, status
             FROM autonomous_task_checkpoints
             WHERE task_id = ?
             ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map(params![task_id], |row| {
            Ok(AutonomousTaskCheckpoint {
                id: row.get(0)?,
                task_id: row.get(1)?,
                description: row.get(2)?,
                steps_json: row.get(3)?,
                completed_step_index: row.get(4)?,
                total_steps: row.get(5)?,
                retry_count: row.get(6)?,
                replan_count: row.get(7)?,
                auto_approve: row.get::<_, i32>(8)? != 0,
                cumulative_cost: row.get(9)?,
                conversation_history_json: row.get(10)?,
                tool_results_json: row.get(11)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(12)?)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now),
                status: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// List all autonomous checkpoints across all tasks (for the UI list view).
    pub fn list_all_autonomous_checkpoints(&self) -> Result<Vec<AutonomousTaskCheckpoint>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, task_id, description, steps_json, completed_step_index, total_steps,
                    retry_count, replan_count, auto_approve, cumulative_cost,
                    conversation_history_json, tool_results_json, created_at, status
             FROM autonomous_task_checkpoints
             ORDER BY created_at DESC
             LIMIT 100",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(AutonomousTaskCheckpoint {
                id: row.get(0)?,
                task_id: row.get(1)?,
                description: row.get(2)?,
                steps_json: row.get(3)?,
                completed_step_index: row.get(4)?,
                total_steps: row.get(5)?,
                retry_count: row.get(6)?,
                replan_count: row.get(7)?,
                auto_approve: row.get::<_, i32>(8)? != 0,
                cumulative_cost: row.get(9)?,
                conversation_history_json: row.get(10)?,
                tool_results_json: row.get(11)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(12)?)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now),
                status: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Delete an autonomous checkpoint by its ID.
    pub fn delete_autonomous_checkpoint(&self, checkpoint_id: &str) -> Result<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        conn.execute(
            "DELETE FROM autonomous_task_checkpoints WHERE id = ?",
            params![checkpoint_id],
        )?;

        Ok(())
    }

    /// Delete all autonomous checkpoints for a task.
    pub fn delete_autonomous_checkpoints_for_task(&self, task_id: &str) -> Result<usize> {
        let conn = self
            .db
            .lock()
            .map_err(|e| anyhow!("Failed to lock database: {}", e))?;

        let count = conn.execute(
            "DELETE FROM autonomous_task_checkpoints WHERE task_id = ?",
            params![task_id],
        )?;

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_persistent_task_new() {
        let task = PersistentTask::new("test-1".to_string(), "Test task".to_string(), 3600);
        assert_eq!(task.id, "test-1");
        assert_eq!(task.status, "queued");
        assert_eq!(task.timeout_secs, 3600);
    }

    #[test]
    fn test_task_checkpoint_new() {
        let checkpoint =
            TaskCheckpoint::new("task-1".to_string(), 1, "{}".to_string(), "{}".to_string());
        assert_eq!(checkpoint.task_id, "task-1");
        assert_eq!(checkpoint.step_number, 1);
    }

    #[test]
    fn test_autonomous_task_checkpoint_new() {
        let checkpoint = AutonomousTaskCheckpoint::new(
            "task-42".to_string(),
            "Test autonomous goal".to_string(),
            "[]".to_string(),
            3,
            10,
            1,
            0,
            true,
            0.25,
            "[]".to_string(),
            "[]".to_string(),
            "paused".to_string(),
        );
        assert_eq!(checkpoint.task_id, "task-42");
        assert_eq!(checkpoint.completed_step_index, 3);
        assert_eq!(checkpoint.total_steps, 10);
        assert!(checkpoint.auto_approve);
        assert!((checkpoint.cumulative_cost - 0.25).abs() < f64::EPSILON);
    }

    #[test]
    fn test_autonomous_checkpoint_storage_roundtrip() {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory db");
        let db = Arc::new(Mutex::new(conn));
        let storage = TaskStorage::new(db).expect("Failed to create TaskStorage");
        storage
            .ensure_autonomous_table()
            .expect("Failed to ensure autonomous table");

        let checkpoint = AutonomousTaskCheckpoint::new(
            "task-rt".to_string(),
            "Roundtrip test".to_string(),
            r#"[{"id":"s1"}]"#.to_string(),
            2,
            5,
            0,
            0,
            false,
            1.5,
            r#"[{"role":"user","content":"hello"}]"#.to_string(),
            r#"[{"step":"s1","result":"ok"}]"#.to_string(),
            "paused".to_string(),
        );

        storage
            .save_autonomous_checkpoint(&checkpoint)
            .expect("Failed to save autonomous checkpoint");

        let loaded = storage
            .load_latest_autonomous_checkpoint("task-rt")
            .expect("Failed to load checkpoint");
        assert!(loaded.is_some());
        let loaded = loaded.expect("checkpoint should exist");
        assert_eq!(loaded.task_id, "task-rt");
        assert_eq!(loaded.completed_step_index, 2);
        assert_eq!(loaded.total_steps, 5);

        let listed = storage
            .list_autonomous_checkpoints("task-rt")
            .expect("Failed to list checkpoints");
        assert_eq!(listed.len(), 1);

        storage
            .delete_autonomous_checkpoint(&checkpoint.id)
            .expect("Failed to delete checkpoint");

        let after_delete = storage
            .list_autonomous_checkpoints("task-rt")
            .expect("Failed to list after delete");
        assert!(after_delete.is_empty());
    }
}
