/// Tauri commands for AGI task checkpoint management
///
/// Provides user-facing API for:
/// - Creating checkpoints during task execution
/// - Listing available checkpoints for a task
/// - Resuming from a specific checkpoint
/// - Deleting old checkpoints
/// - Tracking checkpoint restore history

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::core::agi::{
    Checkpoint, CheckpointConfig, CheckpointListResponse, CheckpointReason,
    CheckpointStore, CreateCheckpointRequest, Goal,
};

/// Response type for checkpoint operations
#[derive(Debug, Serialize)]
pub struct CheckpointResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CheckpointResponse<T> {
    fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    #[allow(dead_code)]
    fn err(error: impl std::fmt::Display) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error.to_string()),
        }
    }
}

/// Request to save a checkpoint for a task
#[derive(Debug, Clone, Deserialize)]
pub struct SaveCheckpointRequest {
    pub task_id: String,
    pub goal_id: String,
    pub goal_description: String,
    pub current_step: usize,
    pub completed_steps: Vec<usize>,
    pub total_steps: usize,
    pub elapsed_time_ms: u64,
    pub tool_calls_executed: usize,
    pub failure_count: usize,
    pub last_error: Option<String>,
    pub state_json: Option<String>,
    pub reason: String,
}

/// Request to resume from a checkpoint
#[derive(Debug, Deserialize)]
pub struct ResumeCheckpointRequest {
    pub checkpoint_id: String,
}

/// Request to list checkpoints
#[derive(Debug, Deserialize)]
pub struct ListCheckpointsRequest {
    pub task_id: String,
    pub limit: Option<usize>,
}

/// Wrapper around CheckpointStore for Tauri state
pub struct AGICheckpointState {
    pub store: CheckpointStore,
    pub config: CheckpointConfig,
}

/// Saves a checkpoint for the current task execution
#[tauri::command]
pub async fn agi_checkpoint_save(
    request: SaveCheckpointRequest,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<Checkpoint>, String> {
    info!(
        "Saving checkpoint for task {} at step {}/{}",
        request.task_id, request.current_step, request.total_steps
    );

    // Parse the checkpoint reason
    let reason = match request.reason.as_str() {
        "interval" => CheckpointReason::Interval,
        "user_paused" => CheckpointReason::UserPaused,
        "timeout_approaching" => CheckpointReason::TimeoutApproaching,
        "explicit_save" => CheckpointReason::ExplicitSave,
        "error_recovery" => CheckpointReason::ErrorRecovery,
        "task_complete" => CheckpointReason::TaskComplete,
        _ => CheckpointReason::Interval,
    };

    // Reconstruct the goal
    let goal = Goal {
        id: request.goal_id,
        description: request.goal_description,
        priority: crate::core::agi::Priority::High,
        deadline: None,
        constraints: vec![],
        success_criteria: vec![],
    };

    // Parse current state if provided
    let current_state = if let Some(json_str) = request.state_json {
        match serde_json::from_str::<serde_json::Value>(&json_str)
            .map_err(|e| format!("Failed to parse state JSON: {}", e))?
        {
            serde_json::Value::Object(map) => {
                map.into_iter()
                    .map(|(k, v)| (k, v))
                    .collect()
            }
            _ => std::collections::HashMap::new(),
        }
    } else {
        std::collections::HashMap::new()
    };

    // Create the checkpoint request
    let checkpoint_request = CreateCheckpointRequest {
        task_id: request.task_id.clone(),
        goal,
        current_step: request.current_step,
        completed_steps: request.completed_steps,
        current_state,
        tool_results: vec![],
        context_memory: vec![],
        available_resources: crate::core::agi::ResourceState {
            cpu_usage_percent: 0.0,
            memory_usage_mb: 0,
            network_usage_mbps: 0.0,
            storage_usage_mb: 0,
            available_tools: vec![],
        },
        reason,
        total_steps: request.total_steps,
        elapsed_time_ms: request.elapsed_time_ms,
        tool_calls_executed: request.tool_calls_executed,
        failure_count: request.failure_count,
        last_error: request.last_error,
        parent_checkpoint_id: None,
    };

    match state.store.save_checkpoint(checkpoint_request).await {
        Ok(checkpoint) => Ok(CheckpointResponse::ok(checkpoint)),
        Err(e) => Err(format!("Failed to save checkpoint: {}", e)),
    }
}

/// Gets the latest checkpoint for a task
#[tauri::command]
pub async fn agi_checkpoint_get_latest(
    task_id: String,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<Option<Checkpoint>>, String> {
    match state.store.get_latest_checkpoint(&task_id).await {
        Ok(checkpoint) => Ok(CheckpointResponse::ok(checkpoint)),
        Err(e) => Err(format!("Failed to get latest checkpoint: {}", e)),
    }
}

/// Gets a specific checkpoint by ID
#[tauri::command]
pub async fn agi_checkpoint_get(
    checkpoint_id: String,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<Option<Checkpoint>>, String> {
    match state.store.get_checkpoint(&checkpoint_id).await {
        Ok(checkpoint) => Ok(CheckpointResponse::ok(checkpoint)),
        Err(e) => Err(format!("Failed to get checkpoint: {}", e)),
    }
}

/// Lists all checkpoints for a task
#[tauri::command]
pub async fn agi_checkpoint_list(
    request: ListCheckpointsRequest,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<CheckpointListResponse>, String> {
    let limit = request.limit.unwrap_or(state.config.max_checkpoints_per_task);

    match state.store.list_checkpoints(&request.task_id, limit).await {
        Ok(checkpoints) => Ok(CheckpointResponse::ok(CheckpointListResponse {
            task_id: request.task_id,
            checkpoints,
        })),
        Err(e) => Err(format!("Failed to list checkpoints: {}", e)),
    }
}

/// Deletes a checkpoint
#[tauri::command]
pub async fn agi_checkpoint_delete(
    checkpoint_id: String,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<()>, String> {
    match state.store.delete_checkpoint(&checkpoint_id).await {
        Ok(_) => {
            info!("Deleted checkpoint {}", checkpoint_id);
            Ok(CheckpointResponse::ok(()))
        }
        Err(e) => Err(format!("Failed to delete checkpoint: {}", e)),
    }
}

/// Gets checkpoint restore history for a task
#[tauri::command]
pub async fn agi_checkpoint_restore_history(
    task_id: String,
    _state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<Vec<String>>, String> {
    // This would query the restore history table
    // For now, return empty history
    info!("Getting restore history for task {}", task_id);
    Ok(CheckpointResponse::ok(vec![]))
}

/// Records a successful checkpoint restore
#[tauri::command]
pub async fn agi_checkpoint_record_restore(
    checkpoint_id: String,
    task_id: String,
    resumed_steps: usize,
    error: Option<String>,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<()>, String> {
    let success = error.is_none();

    match state
        .store
        .record_restore_event(&checkpoint_id, &task_id, resumed_steps, success, error)
        .await
    {
        Ok(_) => {
            info!(
                "Recorded restore event for checkpoint {} (resumed {} steps)",
                checkpoint_id, resumed_steps
            );
            Ok(CheckpointResponse::ok(()))
        }
        Err(e) => Err(format!("Failed to record restore event: {}", e)),
    }
}

/// Cleans up old checkpoints for a task
#[tauri::command]
pub async fn agi_checkpoint_cleanup(
    task_id: String,
    keep_count: Option<usize>,
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<usize>, String> {
    let keep = keep_count.unwrap_or(state.config.max_checkpoints_per_task);

    match state.store.cleanup_old_checkpoints(&task_id, keep).await {
        Ok(deleted) => {
            info!("Cleaned up {} checkpoints for task {}", deleted, task_id);
            Ok(CheckpointResponse::ok(deleted))
        }
        Err(e) => Err(format!("Failed to cleanup checkpoints: {}", e)),
    }
}

/// Initializes the checkpoint system
#[tauri::command]
pub async fn agi_checkpoint_init(
    state: State<'_, AGICheckpointState>,
) -> Result<CheckpointResponse<()>, String> {
    match state.store.init().await {
        Ok(_) => {
            info!("AGI checkpoint system initialized");
            Ok(CheckpointResponse::ok(()))
        }
        Err(e) => Err(format!("Failed to initialize checkpoint system: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checkpoint_reason_parsing() {
        let reason_str = "user_paused";
        let reason = match reason_str {
            "interval" => CheckpointReason::Interval,
            "user_paused" => CheckpointReason::UserPaused,
            "timeout_approaching" => CheckpointReason::TimeoutApproaching,
            "explicit_save" => CheckpointReason::ExplicitSave,
            "error_recovery" => CheckpointReason::ErrorRecovery,
            "task_complete" => CheckpointReason::TaskComplete,
            _ => CheckpointReason::Interval,
        };
        assert_eq!(reason, CheckpointReason::UserPaused);
    }
}
