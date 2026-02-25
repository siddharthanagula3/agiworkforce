/// Checkpoint Manager - Orchestrates checkpoint creation and resumption
///
/// Responsibilities:
/// - Determines when to save checkpoints (interval, timeout, pause, etc.)
/// - Manages checkpoint lifecycle (creation, cleanup, archival)
/// - Handles task state restoration from checkpoints
/// - Tracks execution metrics and progress
/// - Provides recovery and resume semantics
use anyhow::{anyhow, Result};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tracing::{info, warn};

use super::checkpoint::*;
use super::checkpoint_store::CheckpointStore;
use crate::core::agi::{ContextEntry, ExecutionContext};

/// Tracks execution metrics for a task
#[derive(Debug, Clone)]
pub struct ExecutionMetrics {
    /// Task start time
    pub start_time: Instant,
    /// Number of steps completed
    pub completed_steps_count: usize,
    /// Number of tool calls executed
    pub tool_calls_count: usize,
    /// Number of failures/retries
    pub failure_count: usize,
    /// Last error if any
    pub last_error: Option<String>,
    /// Total timeout allowed (None = no timeout)
    pub timeout_duration: Option<Duration>,
}

impl ExecutionMetrics {
    /// Creates new execution metrics
    pub fn new(timeout_duration: Option<Duration>) -> Self {
        Self {
            start_time: Instant::now(),
            completed_steps_count: 0,
            tool_calls_count: 0,
            failure_count: 0,
            last_error: None,
            timeout_duration,
        }
    }

    /// Gets elapsed time in milliseconds
    pub fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }

    /// Gets remaining time until timeout (None = no timeout or timed out)
    pub fn remaining_ms(&self) -> Option<u64> {
        self.timeout_duration.and_then(|timeout| {
            let remaining = timeout.saturating_sub(self.start_time.elapsed());
            if remaining.is_zero() {
                None
            } else {
                Some(remaining.as_millis() as u64)
            }
        })
    }

    /// Checks if we're approaching timeout (within threshold)
    pub fn approaching_timeout(&self, threshold_ms: u64) -> bool {
        match self.remaining_ms() {
            Some(remaining) => remaining <= threshold_ms,
            None => false,
        }
    }

    /// Checks if execution has timed out
    pub fn has_timed_out(&self) -> bool {
        self.remaining_ms().is_none() && self.timeout_duration.is_some()
    }
}

/// Manages checkpointing for AGI task execution
pub struct CheckpointManager {
    store: Arc<CheckpointStore>,
    config: CheckpointConfig,
}

impl CheckpointManager {
    /// Creates a new checkpoint manager
    pub fn new(store: Arc<CheckpointStore>, config: CheckpointConfig) -> Self {
        Self { store, config }
    }

    /// Creates a checkpoint with the current execution state
    pub async fn create_checkpoint(
        &self,
        task_id: &str,
        context: &ExecutionContext,
        current_step: usize,
        completed_steps: Vec<usize>,
        reason: CheckpointReason,
        total_steps: usize,
        metrics: &ExecutionMetrics,
        parent_checkpoint_id: Option<String>,
    ) -> Result<Checkpoint> {
        // Convert ContextEntry to CheckpointContextEntry
        let checkpoint_context = context
            .context_memory
            .iter()
            .map(|entry| CheckpointContextEntry {
                timestamp_ms: entry.timestamp as i64,
                entry_type: entry.event.clone(),
                description: entry.event.clone(),
                data: Some(entry.data.clone()),
            })
            .collect();

        let request = CreateCheckpointRequest {
            task_id: task_id.to_string(),
            goal: context.goal.clone(),
            current_step,
            completed_steps,
            current_state: context.current_state.clone(),
            tool_results: context.tool_results.clone(),
            context_memory: checkpoint_context,
            available_resources: context.available_resources.clone(),
            reason,
            total_steps,
            elapsed_time_ms: metrics.elapsed_ms(),
            tool_calls_executed: metrics.tool_calls_count,
            failure_count: metrics.failure_count,
            last_error: metrics.last_error.clone(),
            parent_checkpoint_id,
        };

        let checkpoint = self.store.save_checkpoint(request).await?;

        info!(
            "Created checkpoint {} for task {} (step {}/{})",
            checkpoint.id, task_id, current_step, total_steps
        );

        // Cleanup old checkpoints if configured
        if self.config.enable_checkpoint_cleanup {
            if let Err(e) = self
                .store
                .cleanup_old_checkpoints(task_id, self.config.max_checkpoints_per_task)
                .await
            {
                warn!("Failed to cleanup old checkpoints: {}", e);
            }
        }

        Ok(checkpoint)
    }

    /// Determines if a checkpoint should be created at this point
    pub fn should_create_checkpoint(
        &self,
        steps_since_last_checkpoint: usize,
        metrics: &ExecutionMetrics,
        reason: CheckpointReason,
    ) -> bool {
        match reason {
            // Always create on explicit requests or critical events
            CheckpointReason::UserPaused
            | CheckpointReason::ExplicitSave
            | CheckpointReason::ErrorRecovery
            | CheckpointReason::TaskComplete => true,

            // Create on interval
            CheckpointReason::Interval => {
                steps_since_last_checkpoint >= self.config.checkpoint_interval_steps
            }

            // Create if approaching timeout
            CheckpointReason::TimeoutApproaching => {
                metrics.approaching_timeout(self.config.timeout_checkpoint_threshold_secs * 1000)
            }
        }
    }

    /// Resumes execution from a checkpoint
    pub async fn resume_from_checkpoint(&self, checkpoint_id: &str) -> Result<ResumableExecution> {
        let checkpoint = self
            .store
            .get_checkpoint(checkpoint_id)
            .await?
            .ok_or_else(|| anyhow!("Checkpoint not found: {}", checkpoint_id))?;

        // Reconstruct the execution context, converting CheckpointContextEntry back to ContextEntry
        let context_memory = checkpoint
            .context_memory
            .iter()
            .map(|entry| ContextEntry {
                timestamp: entry.timestamp_ms as u64,
                event: entry.entry_type.clone(),
                data: entry.data.clone().unwrap_or(serde_json::json!({})),
            })
            .collect();

        let context = ExecutionContext {
            goal: checkpoint.goal.clone(),
            current_state: checkpoint.current_state.clone(),
            available_resources: checkpoint.available_resources.clone(),
            tool_results: checkpoint.tool_results.clone(),
            context_memory,
        };

        let skip_steps = checkpoint.completed_steps.clone();

        info!(
            "Resuming execution from checkpoint {} at step {}",
            checkpoint_id, checkpoint.current_step
        );

        Ok(ResumableExecution {
            checkpoint: checkpoint.clone(),
            context,
            skip_steps,
            resumed_from_checkpoint_id: checkpoint_id.to_string(),
        })
    }

    /// Gets the latest checkpoint for a task
    pub async fn get_latest_checkpoint(&self, task_id: &str) -> Result<Option<Checkpoint>> {
        self.store.get_latest_checkpoint(task_id).await
    }

    /// Lists checkpoints for a task
    pub async fn list_checkpoints(&self, task_id: &str) -> Result<CheckpointListResponse> {
        let checkpoints = self
            .store
            .list_checkpoints(task_id, self.config.max_checkpoints_per_task)
            .await?;

        Ok(CheckpointListResponse {
            task_id: task_id.to_string(),
            checkpoints,
        })
    }

    /// Deletes a checkpoint
    pub async fn delete_checkpoint(&self, checkpoint_id: &str) -> Result<()> {
        self.store.delete_checkpoint(checkpoint_id).await
    }

    /// Records a restore event
    pub async fn record_restore(
        &self,
        checkpoint_id: &str,
        task_id: &str,
        resumed_steps: usize,
        success: bool,
        error: Option<String>,
    ) -> Result<()> {
        self.store
            .record_restore_event(checkpoint_id, task_id, resumed_steps, success, error)
            .await
    }
}

/// Handles checkpoint-aware execution loop
pub struct CheckpointedExecution {
    manager: Arc<CheckpointManager>,
    task_id: String,
    metrics: Mutex<ExecutionMetrics>,
    steps_since_checkpoint: Mutex<usize>,
}

impl CheckpointedExecution {
    /// Creates a new checkpointed execution session
    pub fn new(
        manager: Arc<CheckpointManager>,
        task_id: String,
        timeout_duration: Option<Duration>,
    ) -> Self {
        Self {
            manager,
            task_id,
            metrics: Mutex::new(ExecutionMetrics::new(timeout_duration)),
            steps_since_checkpoint: Mutex::new(0),
        }
    }

    /// Records a completed step
    pub async fn record_step_completed(&self, error: Option<String>) {
        let mut metrics = self.metrics.lock().await;
        metrics.completed_steps_count += 1;
        if error.is_some() {
            metrics.failure_count += 1;
            metrics.last_error = error;
        }

        let mut steps_since = self.steps_since_checkpoint.lock().await;
        *steps_since += 1;
    }

    /// Records a tool call
    pub async fn record_tool_call(&self) {
        let mut metrics = self.metrics.lock().await;
        metrics.tool_calls_count += 1;
    }

    /// Checks if a checkpoint should be created and creates it
    pub async fn maybe_checkpoint(
        &self,
        context: &ExecutionContext,
        current_step: usize,
        completed_steps: Vec<usize>,
        total_steps: usize,
        reason: CheckpointReason,
    ) -> Result<Option<Checkpoint>> {
        // Acquire both locks in a single block and release before the async call
        // to prevent deadlock from inconsistent lock ordering across tasks.
        let (should_create, metrics_snapshot) = {
            let steps_since = *self.steps_since_checkpoint.lock().await;
            let metrics = self.metrics.lock().await;
            let should = self
                .manager
                .should_create_checkpoint(steps_since, &metrics, reason);
            (should, metrics.clone())
        };

        if !should_create {
            return Ok(None);
        }

        let checkpoint = self
            .manager
            .create_checkpoint(
                &self.task_id,
                context,
                current_step,
                completed_steps,
                reason,
                total_steps,
                &metrics_snapshot,
                None,
            )
            .await?;

        *self.steps_since_checkpoint.lock().await = 0;

        Ok(Some(checkpoint))
    }

    /// Gets current execution metrics
    pub async fn metrics(&self) -> ExecutionMetrics {
        self.metrics.lock().await.clone()
    }

    /// Gets the task ID
    pub fn task_id(&self) -> &str {
        &self.task_id
    }

    /// Checks if execution has timed out
    pub async fn has_timed_out(&self) -> bool {
        self.metrics.lock().await.has_timed_out()
    }

    /// Gets remaining time until timeout
    pub async fn remaining_time(&self) -> Option<Duration> {
        self.metrics
            .lock()
            .await
            .remaining_ms()
            .map(Duration::from_millis)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_metrics_elapsed() {
        let metrics = ExecutionMetrics::new(None);
        // elapsed_ms() returns u64 which is always >= 0, just verify it returns a value
        let _ = metrics.elapsed_ms();
    }

    #[test]
    fn test_execution_metrics_timeout() {
        let metrics = ExecutionMetrics::new(Some(Duration::from_millis(100)));
        assert!(!metrics.has_timed_out());
        assert!(metrics.remaining_ms().is_some());
    }

    #[test]
    fn test_execution_metrics_approaching_timeout() {
        let metrics = ExecutionMetrics::new(Some(Duration::from_millis(50)));
        std::thread::sleep(Duration::from_millis(40));
        assert!(metrics.approaching_timeout(100));
    }

    #[test]
    fn test_checkpoint_reason_display() {
        assert_eq!(CheckpointReason::Interval.to_string(), "interval");
        assert_eq!(CheckpointReason::UserPaused.to_string(), "user_paused");
    }
}
