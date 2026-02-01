/// AGI Task Checkpoint System
///
/// Enables session persistence and resumption for long-running AGI tasks.
/// Checkpoints capture the complete execution state at regular intervals,
/// allowing tasks to be paused and resumed without losing progress.
///
/// # Architecture
///
/// - **Checkpoint**: Immutable snapshot of execution state at a specific step
/// - **CheckpointStore**: Persistent storage of checkpoints in SQLite
/// - **CheckpointManager**: Orchestrates checkpoint creation, retrieval, and cleanup
/// - **ResumableExecution**: Wraps execution to support resume semantics
///
/// # Checkpoint Format
///
/// Each checkpoint contains:
/// - Task metadata (id, goal_id, timestamp)
/// - Execution state (current_step, completed_steps)
/// - Tool results and context memory
/// - Resource usage and timing information
///
/// # Persistence Strategy
///
/// Checkpoints are saved:
/// - After every N completed steps (configurable, default 5)
/// - When user pauses execution
/// - When approaching timeout
/// - On explicit checkpoint request
///
/// # Recovery Guarantees
///
/// - Atomicity: Checkpoint writes are transactional
/// - Durability: Checkpoints persisted to SQLite with fsync
/// - Consistency: Restored state is validated before resumption
/// - Isolation: Concurrent checkpoints don't interfere

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::agi::{ExecutionContext, Goal, ToolExecutionResult, ResourceState};

/// Unique identifier for a checkpoint
pub type CheckpointId = String;

/// Unique identifier for a task
pub type TaskId = String;

/// Configuration for checkpoint creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointConfig {
    /// Save checkpoint after this many completed steps
    pub checkpoint_interval_steps: usize,
    /// Save checkpoint when approaching timeout (seconds remaining)
    pub timeout_checkpoint_threshold_secs: u64,
    /// Maximum number of checkpoints to keep per task
    pub max_checkpoints_per_task: usize,
    /// Enable automatic cleanup of old checkpoints
    pub enable_checkpoint_cleanup: bool,
    /// Size limit for context_memory in checkpoint (items)
    pub max_context_memory_items: usize,
    /// Size limit for tool_results in checkpoint (items)
    pub max_tool_results_items: usize,
}

impl Default for CheckpointConfig {
    fn default() -> Self {
        Self {
            checkpoint_interval_steps: 5,
            timeout_checkpoint_threshold_secs: 30,
            max_checkpoints_per_task: 50,
            enable_checkpoint_cleanup: true,
            max_context_memory_items: 500,
            max_tool_results_items: 200,
        }
    }
}

/// Complete snapshot of AGI task execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    /// Unique checkpoint identifier
    pub id: CheckpointId,
    /// Associated task identifier
    pub task_id: TaskId,
    /// Goal being executed
    pub goal: Goal,
    /// Current step number (0-indexed)
    pub current_step: usize,
    /// List of completed step indices
    pub completed_steps: Vec<usize>,
    /// Execution state (variables, flags, etc.)
    pub current_state: HashMap<String, serde_json::Value>,
    /// Cached tool execution results
    pub tool_results: Vec<ToolExecutionResult>,
    /// Context memory (recent operations, decisions)
    pub context_memory: Vec<CheckpointContextEntry>,
    /// Available resources at checkpoint time
    pub available_resources: ResourceState,
    /// Timestamp when checkpoint was created (ms since epoch)
    pub created_at_ms: i64,
    /// Reason for creating this checkpoint
    pub reason: CheckpointReason,
    /// Metadata about execution progress
    pub metadata: CheckpointMetadata,
    /// Whether this checkpoint is the latest for its task
    pub is_latest: bool,
    /// Parent checkpoint ID for branching/alternatives
    pub parent_checkpoint_id: Option<CheckpointId>,
}

/// Reason for creating a checkpoint
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CheckpointReason {
    /// Regular interval checkpoint (every N steps)
    Interval,
    /// User paused execution
    UserPaused,
    /// Approaching timeout deadline
    TimeoutApproaching,
    /// Explicit save request
    ExplicitSave,
    /// Error occurred, saving state for recovery
    ErrorRecovery,
    /// Task completed successfully
    TaskComplete,
}

impl std::fmt::Display for CheckpointReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Interval => write!(f, "interval"),
            Self::UserPaused => write!(f, "user_paused"),
            Self::TimeoutApproaching => write!(f, "timeout_approaching"),
            Self::ExplicitSave => write!(f, "explicit_save"),
            Self::ErrorRecovery => write!(f, "error_recovery"),
            Self::TaskComplete => write!(f, "task_complete"),
        }
    }
}

/// Metadata about execution progress and performance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointMetadata {
    /// Total steps in the plan
    pub total_steps: usize,
    /// Percentage of steps completed
    pub progress_percent: f32,
    /// Elapsed time since task start (milliseconds)
    pub elapsed_time_ms: u64,
    /// Estimated time to completion (milliseconds), None if unknown
    pub estimated_remaining_ms: Option<u64>,
    /// Number of tool calls executed so far
    pub tool_calls_executed: usize,
    /// Number of failures/retries so far
    pub failure_count: usize,
    /// Last error message if applicable
    pub last_error: Option<String>,
    /// Human-readable summary of progress
    pub progress_summary: String,
}

/// Single entry in checkpoint context memory
///
/// Extends the base ContextEntry with checkpoint-specific metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointContextEntry {
    /// Timestamp of the entry (ms since epoch)
    pub timestamp_ms: i64,
    /// Type of context entry (decision, observation, tool_call, etc.)
    pub entry_type: String,
    /// Entry description or content
    pub description: String,
    /// Additional structured data
    pub data: Option<serde_json::Value>,
}

impl CheckpointContextEntry {
    /// Creates a new context entry
    pub fn new(entry_type: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            timestamp_ms: now_millis(),
            entry_type: entry_type.into(),
            description: description.into(),
            data: None,
        }
    }

    /// Creates a context entry with additional data
    pub fn with_data(
        entry_type: impl Into<String>,
        description: impl Into<String>,
        data: serde_json::Value,
    ) -> Self {
        Self {
            timestamp_ms: now_millis(),
            entry_type: entry_type.into(),
            description: description.into(),
            data: Some(data),
        }
    }
}

/// Request to create a checkpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCheckpointRequest {
    pub task_id: TaskId,
    pub goal: Goal,
    pub current_step: usize,
    pub completed_steps: Vec<usize>,
    pub current_state: HashMap<String, serde_json::Value>,
    pub tool_results: Vec<ToolExecutionResult>,
    pub context_memory: Vec<CheckpointContextEntry>,
    pub available_resources: ResourceState,
    pub reason: CheckpointReason,
    pub total_steps: usize,
    pub elapsed_time_ms: u64,
    pub tool_calls_executed: usize,
    pub failure_count: usize,
    pub last_error: Option<String>,
    pub parent_checkpoint_id: Option<CheckpointId>,
}

impl CreateCheckpointRequest {
    /// Creates a checkpoint request from current execution context
    ///
    /// Note: Converts ContextEntry to CheckpointContextEntry
    pub fn from_execution_context(
        task_id: TaskId,
        context: &ExecutionContext,
        current_step: usize,
        completed_steps: Vec<usize>,
        reason: CheckpointReason,
        total_steps: usize,
        elapsed_time_ms: u64,
        tool_calls_executed: usize,
        failure_count: usize,
        last_error: Option<String>,
    ) -> Self {
        // Convert context entries to checkpoint context entries
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

        Self {
            task_id,
            goal: context.goal.clone(),
            current_step,
            completed_steps,
            current_state: context.current_state.clone(),
            tool_results: context.tool_results.clone(),
            context_memory: checkpoint_context,
            available_resources: context.available_resources.clone(),
            reason,
            total_steps,
            elapsed_time_ms,
            tool_calls_executed,
            failure_count,
            last_error,
            parent_checkpoint_id: None,
        }
    }
}

/// Response with checkpoint list
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointListResponse {
    pub task_id: TaskId,
    pub checkpoints: Vec<CheckpointSummary>,
}

/// Summary of a checkpoint (lightweight version)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointSummary {
    pub id: CheckpointId,
    pub task_id: TaskId,
    pub created_at_ms: i64,
    pub reason: CheckpointReason,
    pub current_step: usize,
    pub total_steps: usize,
    pub progress_percent: f32,
    pub is_latest: bool,
    pub estimated_remaining_ms: Option<u64>,
}

/// Represents a resumed execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResumableExecution {
    /// The checkpoint from which to resume
    pub checkpoint: Checkpoint,
    /// The execution context with restored state
    pub context: ExecutionContext,
    /// Which steps to skip (already completed)
    pub skip_steps: Vec<usize>,
    /// Last checkpoint ID for tracking lineage
    pub resumed_from_checkpoint_id: CheckpointId,
}

/// Helper to get current time in milliseconds
pub(crate) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checkpoint_context_entry_creation() {
        let entry = CheckpointContextEntry::new("decision", "User requested pause");
        assert_eq!(entry.entry_type, "decision");
        assert_eq!(entry.description, "User requested pause");
        assert!(entry.data.is_none());
        assert!(entry.timestamp_ms > 0);
    }

    #[test]
    fn test_checkpoint_context_entry_with_data() {
        let data = serde_json::json!({"tool": "file_write", "path": "/tmp/test"});
        let entry = CheckpointContextEntry::with_data("tool_call", "Write file", data.clone());
        assert_eq!(entry.entry_type, "tool_call");
        assert_eq!(entry.data, Some(data));
    }

    #[test]
    fn test_checkpoint_reason_display() {
        assert_eq!(CheckpointReason::Interval.to_string(), "interval");
        assert_eq!(CheckpointReason::UserPaused.to_string(), "user_paused");
        assert_eq!(CheckpointReason::TimeoutApproaching.to_string(), "timeout_approaching");
    }

    #[test]
    fn test_checkpoint_config_defaults() {
        let config = CheckpointConfig::default();
        assert_eq!(config.checkpoint_interval_steps, 5);
        assert_eq!(config.max_checkpoints_per_task, 50);
        assert!(config.enable_checkpoint_cleanup);
    }
}
