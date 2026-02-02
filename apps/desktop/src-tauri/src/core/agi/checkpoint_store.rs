/// Persistent storage layer for AGI task checkpoints
///
/// Handles all database operations related to checkpoint persistence:
/// - Creating and storing checkpoints
/// - Retrieving checkpoints by ID or task
/// - Listing and filtering checkpoints
/// - Cleanup and archival operations
use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use tracing::{debug, info};

use super::checkpoint::*;
use crate::core::agi::{CheckpointContextEntry, Goal, ResourceState, ToolExecutionResult};

/// Database connection wrapper for checkpoint operations
pub struct CheckpointStore {
    db_path: String,
}

impl CheckpointStore {
    /// Creates a new checkpoint store instance
    pub fn new(db_path: impl AsRef<Path>) -> Result<Self> {
        let db_path = db_path.as_ref().to_string_lossy().to_string();
        Ok(Self { db_path })
    }

    /// Initializes the checkpoint tables in the database
    pub async fn init(&self) -> Result<()> {
        let db_path = self.db_path.clone();
        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;

            // Enable WAL mode for better concurrency
            conn.execute_batch("PRAGMA journal_mode = WAL")?;

            // Create agi_task_checkpoints table
            conn.execute(
                "CREATE TABLE IF NOT EXISTS agi_task_checkpoints (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    goal_json TEXT NOT NULL,
                    current_step INTEGER NOT NULL,
                    completed_steps_json TEXT NOT NULL,
                    current_state_json TEXT NOT NULL,
                    tool_results_json TEXT NOT NULL,
                    context_memory_json TEXT NOT NULL,
                    available_resources_json TEXT NOT NULL,
                    checkpoint_reason TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    total_steps INTEGER NOT NULL,
                    progress_percent REAL NOT NULL,
                    elapsed_time_ms INTEGER NOT NULL,
                    estimated_remaining_ms INTEGER,
                    tool_calls_executed INTEGER NOT NULL DEFAULT 0,
                    failure_count INTEGER NOT NULL DEFAULT 0,
                    last_error_message TEXT,
                    is_latest BOOLEAN NOT NULL DEFAULT 1,
                    parent_checkpoint_id TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES agi_tasks(id),
                    FOREIGN KEY(parent_checkpoint_id) REFERENCES agi_task_checkpoints(id)
                )",
                [],
            )?;

            // Create indices for efficient queries
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agi_checkpoints_task_id
                 ON agi_task_checkpoints(task_id)",
                [],
            )?;

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agi_checkpoints_latest
                 ON agi_task_checkpoints(task_id, is_latest)
                 WHERE is_latest = 1",
                [],
            )?;

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agi_checkpoints_created
                 ON agi_task_checkpoints(created_at_ms DESC)",
                [],
            )?;

            // Create agi_checkpoint_restore_history table
            conn.execute(
                "CREATE TABLE IF NOT EXISTS agi_checkpoint_restore_history (
                    id TEXT PRIMARY KEY,
                    checkpoint_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    restored_at_ms INTEGER NOT NULL,
                    resumed_steps INTEGER NOT NULL DEFAULT 0,
                    success BOOLEAN NOT NULL,
                    error_message TEXT,
                    restored_at TEXT NOT NULL,
                    FOREIGN KEY(checkpoint_id) REFERENCES agi_task_checkpoints(id),
                    FOREIGN KEY(task_id) REFERENCES agi_tasks(id)
                )",
                [],
            )?;

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agi_restore_history_checkpoint
                 ON agi_checkpoint_restore_history(checkpoint_id)",
                [],
            )?;

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agi_restore_history_task
                 ON agi_checkpoint_restore_history(task_id)",
                [],
            )?;

            // Create agi_tasks table (if not exists)
            conn.execute(
                "CREATE TABLE IF NOT EXISTS agi_tasks (
                    id TEXT PRIMARY KEY,
                    goal_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    completed_at_ms INTEGER,
                    created_at TEXT NOT NULL
                )",
                [],
            )?;

            info!("AGI checkpoint store initialized");
            Ok::<_, rusqlite::Error>(())
        })
        .await??;

        Ok(())
    }

    /// Saves a new checkpoint to the database
    pub async fn save_checkpoint(&self, request: CreateCheckpointRequest) -> Result<Checkpoint> {
        let checkpoint_id = uuid::Uuid::new_v4().to_string();
        let created_at_ms = now_millis();
        let created_at = chrono::Utc::now().to_rfc3339();

        let progress_percent = if request.total_steps > 0 {
            (request.completed_steps.len() as f32 / request.total_steps as f32) * 100.0
        } else {
            0.0
        };

        let metadata = CheckpointMetadata {
            total_steps: request.total_steps,
            progress_percent,
            elapsed_time_ms: request.elapsed_time_ms,
            estimated_remaining_ms: None,
            tool_calls_executed: request.tool_calls_executed,
            failure_count: request.failure_count,
            last_error: request.last_error.clone(),
            progress_summary: format!(
                "Completed {} of {} steps ({:.1}%)",
                request.completed_steps.len(),
                request.total_steps,
                progress_percent
            ),
        };

        let checkpoint = Checkpoint {
            id: checkpoint_id.clone(),
            task_id: request.task_id.clone(),
            goal: request.goal.clone(),
            current_step: request.current_step,
            completed_steps: request.completed_steps.clone(),
            current_state: request.current_state.clone(),
            tool_results: request.tool_results.clone(),
            context_memory: request.context_memory.clone(),
            available_resources: request.available_resources.clone(),
            created_at_ms,
            reason: request.reason,
            metadata,
            is_latest: true,
            parent_checkpoint_id: request.parent_checkpoint_id.clone(),
        };

        let db_path = self.db_path.clone();
        let checkpoint_clone = checkpoint.clone();

        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;

            // Mark previous latest checkpoints as non-latest
            conn.execute(
                "UPDATE agi_task_checkpoints SET is_latest = 0
                 WHERE task_id = ?1 AND is_latest = 1",
                params![checkpoint_clone.task_id],
            )?;

            // Insert new checkpoint
            conn.execute(
                "INSERT INTO agi_task_checkpoints (
                    id, task_id, goal_json, current_step, completed_steps_json,
                    current_state_json, tool_results_json, context_memory_json,
                    available_resources_json, checkpoint_reason, created_at_ms,
                    total_steps, progress_percent, elapsed_time_ms,
                    estimated_remaining_ms, tool_calls_executed, failure_count,
                    last_error_message, is_latest, parent_checkpoint_id, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
                params![
                    &checkpoint_clone.id,
                    &checkpoint_clone.task_id,
                    serde_json::to_string(&checkpoint_clone.goal)?,
                    checkpoint_clone.current_step,
                    serde_json::to_string(&checkpoint_clone.completed_steps)?,
                    serde_json::to_string(&checkpoint_clone.current_state)?,
                    serde_json::to_string(&checkpoint_clone.tool_results)?,
                    serde_json::to_string(&checkpoint_clone.context_memory)?,
                    serde_json::to_string(&checkpoint_clone.available_resources)?,
                    checkpoint_clone.reason.to_string(),
                    checkpoint_clone.created_at_ms,
                    checkpoint_clone.metadata.total_steps,
                    checkpoint_clone.metadata.progress_percent,
                    checkpoint_clone.metadata.elapsed_time_ms,
                    checkpoint_clone.metadata.estimated_remaining_ms,
                    checkpoint_clone.metadata.tool_calls_executed,
                    checkpoint_clone.metadata.failure_count,
                    &checkpoint_clone.metadata.last_error,
                    1,
                    &checkpoint_clone.parent_checkpoint_id,
                    &created_at,
                ],
            )?;

            debug!("Saved checkpoint {} for task {}", checkpoint_clone.id, checkpoint_clone.task_id);
            Ok::<_, anyhow::Error>(())
        })
        .await??;

        Ok(checkpoint)
    }

    /// Retrieves a checkpoint by ID
    pub async fn get_checkpoint(&self, checkpoint_id: &str) -> Result<Option<Checkpoint>> {
        let checkpoint_id = checkpoint_id.to_string();
        let db_path = self.db_path.clone();

        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;

            let checkpoint = conn
                .query_row(
                    "SELECT id, task_id, goal_json, current_step, completed_steps_json,
                            current_state_json, tool_results_json, context_memory_json,
                            available_resources_json, checkpoint_reason, created_at_ms,
                            total_steps, progress_percent, elapsed_time_ms,
                            estimated_remaining_ms, tool_calls_executed, failure_count,
                            last_error_message, is_latest, parent_checkpoint_id
                     FROM agi_task_checkpoints WHERE id = ?1",
                    params![checkpoint_id],
                    Self::row_to_checkpoint,
                )
                .optional()?;

            Ok(checkpoint)
        })
        .await?
    }

    /// Retrieves the latest checkpoint for a task
    pub async fn get_latest_checkpoint(&self, task_id: &str) -> Result<Option<Checkpoint>> {
        let task_id = task_id.to_string();
        let db_path = self.db_path.clone();

        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;

            let checkpoint = conn
                .query_row(
                    "SELECT id, task_id, goal_json, current_step, completed_steps_json,
                            current_state_json, tool_results_json, context_memory_json,
                            available_resources_json, checkpoint_reason, created_at_ms,
                            total_steps, progress_percent, elapsed_time_ms,
                            estimated_remaining_ms, tool_calls_executed, failure_count,
                            last_error_message, is_latest, parent_checkpoint_id
                     FROM agi_task_checkpoints
                     WHERE task_id = ?1 AND is_latest = 1
                     LIMIT 1",
                    params![task_id],
                    Self::row_to_checkpoint,
                )
                .optional()?;

            Ok(checkpoint)
        })
        .await?
    }

    /// Lists all checkpoints for a task
    pub async fn list_checkpoints(
        &self,
        task_id: &str,
        limit: usize,
    ) -> Result<Vec<CheckpointSummary>> {
        let task_id = task_id.to_string();
        let db_path = self.db_path.clone();

        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;
            let mut stmt = conn.prepare(
                "SELECT id, task_id, current_step, total_steps, progress_percent,
                        created_at_ms, checkpoint_reason, is_latest, estimated_remaining_ms
                 FROM agi_task_checkpoints
                 WHERE task_id = ?1
                 ORDER BY created_at_ms DESC
                 LIMIT ?2",
            )?;

            let checkpoints = stmt
                .query_map(params![task_id, limit as i32], |row| {
                    Ok(CheckpointSummary {
                        id: row.get(0)?,
                        task_id: row.get(1)?,
                        current_step: row.get(2)?,
                        total_steps: row.get(3)?,
                        progress_percent: row.get(4)?,
                        created_at_ms: row.get(5)?,
                        reason: parse_checkpoint_reason(&row.get::<_, String>(6)?),
                        is_latest: row.get(7)?,
                        estimated_remaining_ms: row.get(8)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(checkpoints)
        })
        .await?
    }

    /// Deletes a checkpoint
    pub async fn delete_checkpoint(&self, checkpoint_id: &str) -> Result<()> {
        let checkpoint_id = checkpoint_id.to_string();
        let db_path = self.db_path.clone();

        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;
            conn.execute(
                "DELETE FROM agi_task_checkpoints WHERE id = ?1",
                params![checkpoint_id],
            )?;
            Ok::<_, rusqlite::Error>(())
        })
        .await??;

        Ok(())
    }

    /// Cleans up old checkpoints, keeping only the most recent ones
    pub async fn cleanup_old_checkpoints(&self, task_id: &str, keep_count: usize) -> Result<usize> {
        let task_id = task_id.to_string();
        let db_path = self.db_path.clone();
        let keep_count = keep_count as i32;

        let deleted = tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;

            // Get checkpoint IDs to delete
            let mut stmt = conn.prepare(
                "SELECT id FROM agi_task_checkpoints
                 WHERE task_id = ?1
                 ORDER BY created_at_ms DESC
                 LIMIT -1 OFFSET ?2",
            )?;

            let to_delete: Vec<String> = stmt
                .query_map(params![task_id, keep_count], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;

            let deleted_count = to_delete.len();

            // Delete the checkpoints
            for id in to_delete {
                conn.execute(
                    "DELETE FROM agi_task_checkpoints WHERE id = ?1",
                    params![id],
                )?;
            }

            if deleted_count > 0 {
                debug!(
                    "Cleaned up {} old checkpoints for task {}",
                    deleted_count, task_id
                );
            }

            Ok::<_, rusqlite::Error>(deleted_count)
        })
        .await??;

        Ok(deleted)
    }

    /// Records a checkpoint restore event
    pub async fn record_restore_event(
        &self,
        checkpoint_id: &str,
        task_id: &str,
        resumed_steps: usize,
        success: bool,
        error: Option<String>,
    ) -> Result<()> {
        let restore_id = uuid::Uuid::new_v4().to_string();
        let checkpoint_id = checkpoint_id.to_string();
        let task_id = task_id.to_string();
        let restored_at_ms = now_millis();
        let restored_at = chrono::Utc::now().to_rfc3339();
        let db_path = self.db_path.clone();

        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&db_path)?;

            conn.execute(
                "INSERT INTO agi_checkpoint_restore_history (
                    id, checkpoint_id, task_id, restored_at_ms,
                    resumed_steps, success, error_message, restored_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    restore_id,
                    checkpoint_id,
                    task_id,
                    restored_at_ms,
                    resumed_steps as i32,
                    success as i32,
                    error,
                    restored_at,
                ],
            )?;

            Ok::<_, rusqlite::Error>(())
        })
        .await??;

        Ok(())
    }

    /// Helper to convert database row to Checkpoint (static method to avoid borrowing issues in spawn_blocking)
    fn row_to_checkpoint(row: &rusqlite::Row) -> rusqlite::Result<Checkpoint> {
        let id: String = row.get(0)?;
        let task_id: String = row.get(1)?;
        let goal: Goal = serde_json::from_str(&row.get::<_, String>(2)?)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let current_step: usize = row.get::<_, i64>(3)? as usize;
        let completed_steps: Vec<usize> = serde_json::from_str(&row.get::<_, String>(4)?)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let current_state = serde_json::from_str(&row.get::<_, String>(5)?)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let tool_results: Vec<ToolExecutionResult> =
            serde_json::from_str(&row.get::<_, String>(6)?)
                .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let context_memory: Vec<CheckpointContextEntry> =
            serde_json::from_str(&row.get::<_, String>(7)?)
                .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let available_resources: ResourceState = serde_json::from_str(&row.get::<_, String>(8)?)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let reason_str: String = row.get(9)?;
        let reason = parse_checkpoint_reason(&reason_str);
        let created_at_ms: i64 = row.get(10)?;
        let total_steps: usize = row.get::<_, i64>(11)? as usize;
        let progress_percent: f32 = row.get(12)?;
        let elapsed_time_ms: u64 = row.get::<_, i64>(13)? as u64;
        let estimated_remaining_ms: Option<i64> = row.get(14)?;
        let tool_calls_executed: i32 = row.get(15)?;
        let failure_count: i32 = row.get(16)?;
        let last_error: Option<String> = row.get(17)?;
        let is_latest: bool = row.get(18)?;
        let parent_checkpoint_id: Option<String> = row.get(19)?;

        Ok(Checkpoint {
            id,
            task_id,
            goal,
            current_step,
            completed_steps,
            current_state,
            tool_results,
            context_memory,
            available_resources,
            created_at_ms,
            reason,
            metadata: CheckpointMetadata {
                total_steps,
                progress_percent,
                elapsed_time_ms,
                estimated_remaining_ms: estimated_remaining_ms.map(|v| v as u64),
                tool_calls_executed: tool_calls_executed as usize,
                failure_count: failure_count as usize,
                last_error,
                progress_summary: String::new(),
            },
            is_latest,
            parent_checkpoint_id,
        })
    }
}

/// Helper to parse checkpoint reason from string
fn parse_checkpoint_reason(s: &str) -> CheckpointReason {
    match s {
        "interval" => CheckpointReason::Interval,
        "user_paused" => CheckpointReason::UserPaused,
        "timeout_approaching" => CheckpointReason::TimeoutApproaching,
        "explicit_save" => CheckpointReason::ExplicitSave,
        "error_recovery" => CheckpointReason::ErrorRecovery,
        "task_complete" => CheckpointReason::TaskComplete,
        _ => CheckpointReason::Interval,
    }
}

use crate::core::agi::checkpoint::now_millis;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_checkpoint_store_init() {
        let db_path = tempfile::tempdir().unwrap().path().join("test.db");
        let store = CheckpointStore::new(&db_path).unwrap();
        assert!(store.init().await.is_ok());
    }
}
