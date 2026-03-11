use crate::features::tasks::types::{Priority, Task, TaskFilter, TaskStatus};
use crate::features::tasks::TaskManager;
use chrono::Utc;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{Emitter, State};

pub struct TaskManagerState(pub Arc<TaskManager>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitTaskRequest {
    pub name: String,
    pub description: Option<String>,
    pub priority: String,
    pub payload: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBackgroundTasksRequest {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub limit: Option<usize>,
}

#[tauri::command]
pub async fn bg_submit_task(
    request: SubmitTaskRequest,
    state: State<'_, TaskManagerState>,
) -> Result<String, String> {
    let priority = match request.priority.as_str() {
        "Low" => Priority::Low,
        "Normal" => Priority::Normal,
        "High" => Priority::High,
        _ => Priority::Normal,
    };

    state
        .0
        .submit(request.name, request.description, priority, request.payload)
        .await
        .map_err(|e| format!("Failed to submit task: {}", e))
}

#[tauri::command]
pub async fn bg_cancel_task(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    state
        .0
        .cancel(&task_id)
        .await
        .map_err(|e| format!("Failed to cancel task: {}", e))
}

#[tauri::command]
pub async fn bg_pause_task(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    state
        .0
        .pause(&task_id)
        .await
        .map_err(|e| format!("Failed to pause task: {}", e))
}

#[tauri::command]
pub async fn bg_resume_task(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    state
        .0
        .resume(&task_id)
        .await
        .map_err(|e| format!("Failed to resume task: {}", e))
}

#[tauri::command]
pub async fn bg_get_task_status(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<Task, String> {
    state
        .0
        .get_status(&task_id)
        .await
        .map_err(|e| format!("Failed to get task status: {}", e))
}

#[tauri::command]
pub async fn bg_list_tasks(
    request: ListBackgroundTasksRequest,
    state: State<'_, TaskManagerState>,
) -> Result<Vec<Task>, String> {
    let status = request.status.and_then(|s| match s.as_str() {
        "Queued" => Some(TaskStatus::Queued),
        "Running" => Some(TaskStatus::Running),
        "Paused" => Some(TaskStatus::Paused),
        "Completed" => Some(TaskStatus::Completed),
        "Failed" => Some(TaskStatus::Failed),
        "Cancelled" => Some(TaskStatus::Cancelled),
        _ => None,
    });

    let priority = request.priority.and_then(|p| match p.as_str() {
        "Low" => Some(Priority::Low),
        "Normal" => Some(Priority::Normal),
        "High" => Some(Priority::High),
        _ => None,
    });

    let filter = TaskFilter {
        status,
        priority,
        limit: request.limit,
    };

    state
        .0
        .list(filter)
        .await
        .map_err(|e| format!("Failed to list tasks: {}", e))
}

#[tauri::command]
pub async fn bg_get_task_stats(
    state: State<'_, TaskManagerState>,
) -> Result<crate::features::tasks::persistence::TaskStats, String> {
    state
        .0
        .stats()
        .map_err(|e| format!("Failed to get task stats: {}", e))
}

// AUDIT-BGTASK-079 fix: Aliases for frontend compatibility
#[tauri::command]
pub async fn background_task_list(
    request: ListBackgroundTasksRequest,
    state: State<'_, TaskManagerState>,
) -> Result<Vec<Task>, String> {
    bg_list_tasks(request, state).await
}

#[tauri::command]
pub async fn background_task_cancel(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    bg_cancel_task(task_id, state).await
}

#[tauri::command]
pub async fn background_task_status(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<Task, String> {
    bg_get_task_status(task_id, state).await
}

// AUDIT-TIMEOUT-080 fix: Aliases for timeout/control commands using background task system
#[tauri::command]
pub async fn agi_get_timeout_status(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<TimeoutStatusResponse, String> {
    let task = bg_get_task_status(task_id, state).await?;
    let config = TIMEOUT_CONFIG.lock().map_err(|e| e.to_string())?;
    let max_timeout_secs = config.max_duration_secs;

    // Compute elapsed time from task creation to derive remaining seconds
    let elapsed_secs = task
        .started_at
        .map(|started| {
            let now = Utc::now();
            (now - started).num_seconds().max(0)
        })
        .unwrap_or(0);
    let remaining = (max_timeout_secs - elapsed_secs).max(0);

    Ok(TimeoutStatusResponse {
        task_id: task.id,
        task_name: task.name,
        remaining_seconds: remaining,
        max_timeout_minutes: (max_timeout_secs / 60) as i32,
        executed_steps: 0,
        total_estimated_steps: None,
    })
}

#[tauri::command]
pub async fn agi_extend_timeout(
    task_id: String,
    additional_minutes: i32,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    if additional_minutes <= 0 {
        return Err("additional_minutes must be positive".to_string());
    }
    let additional_secs = additional_minutes as i64 * 60;

    // Read the global baseline before acquiring the task write-lock.
    let global_max = TIMEOUT_CONFIG
        .lock()
        .map_err(|e| format!("Failed to lock timeout config: {e}"))?
        .max_duration_secs;

    let new_max = state
        .0
        .extend_deadline(&task_id, additional_secs, global_max)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!(
        "[TaskManager] Extended timeout for task '{}' by {} minutes (new deadline: {}s from start)",
        task_id, additional_minutes, new_max
    );

    Ok(())
}

#[tauri::command]
pub async fn agi_pause_task(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    bg_pause_task(task_id, state).await
}

#[tauri::command]
pub async fn agi_resume_task(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    bg_resume_task(task_id, state).await
}

#[tauri::command]
pub async fn agi_abort_task(
    task_id: String,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    bg_cancel_task(task_id, state).await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeoutStatusResponse {
    pub task_id: String,
    pub task_name: String,
    pub remaining_seconds: i64,
    pub max_timeout_minutes: i32,
    pub executed_steps: i64,
    pub total_estimated_steps: Option<i64>,
}

// AUDIT-TIMEOUT-086 fix: Add timeout config commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeoutConfig {
    pub max_duration_secs: i64,
    pub enable_warnings: bool,
    pub enable_checkpoint_on_timeout: bool,
}

lazy_static! {
    static ref TIMEOUT_CONFIG: Mutex<TimeoutConfig> = Mutex::new(TimeoutConfig {
        max_duration_secs: 3600, // 1 hour default
        enable_warnings: true,
        enable_checkpoint_on_timeout: true,
    });
}

#[tauri::command]
pub async fn timeout_get_config() -> Result<TimeoutConfig, String> {
    let config = TIMEOUT_CONFIG.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub async fn timeout_set_config(config: TimeoutConfig) -> Result<(), String> {
    let mut current = TIMEOUT_CONFIG.lock().map_err(|e| e.to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub async fn timeout_get_recommended(task_type: String) -> Result<i64, String> {
    // Return recommended timeout based on task type
    let timeout = match task_type.as_str() {
        "code_generation" => 1800, // 30 minutes
        "code_refactor" => 900,    // 15 minutes
        "search" => 300,           // 5 minutes
        "file_operation" => 600,   // 10 minutes
        "browser" => 1200,         // 20 minutes
        _ => 600,                  // Default 10 minutes
    };
    Ok(timeout)
}

/// Spawn an async loop that emits `agi:timeout_warning` when a running task is
/// within 60 seconds of its configured deadline.
///
/// Call this once during app setup, passing a clone of the TaskManager Arc and
/// a clone of the AppHandle.
pub fn start_timeout_warning_loop(
    manager: Arc<TaskManager>,
    app_handle: tauri::AppHandle,
) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
        // Track which task IDs have already received a warning this session.
        let mut warned: HashSet<String> = HashSet::new();

        loop {
            interval.tick().await;

            let (max_duration_secs, enable_warnings) = {
                match TIMEOUT_CONFIG.lock() {
                    Ok(cfg) => (cfg.max_duration_secs, cfg.enable_warnings),
                    Err(_) => continue,
                }
            };

            if !enable_warnings {
                continue;
            }

            // Collect all currently running tasks.
            let filter = crate::features::tasks::types::TaskFilter {
                status: Some(TaskStatus::Running),
                priority: None,
                limit: None,
            };

            let tasks = match manager.list(filter).await {
                Ok(t) => t,
                Err(_) => continue,
            };

            for task in tasks {
                if warned.contains(&task.id) {
                    continue;
                }

                let elapsed_secs = task
                    .started_at
                    .map(|started| (Utc::now() - started).num_seconds().max(0))
                    .unwrap_or(0);

                let max_secs = task.deadline_override_secs.unwrap_or(max_duration_secs);
                let remaining = max_secs - elapsed_secs;

                // Emit warning when within the last 60 seconds of the deadline.
                if (0..=60).contains(&remaining) {
                    let _ = app_handle.emit(
                        "agi:timeout_warning",
                        serde_json::json!({
                            "taskId": task.id,
                            "taskName": task.name,
                            "remainingSeconds": remaining,
                            "maxTimeoutMinutes": max_duration_secs / 60,
                            "executedSteps": 0,
                            "totalEstimatedSteps": null,
                        }),
                    );
                    warned.insert(task.id.clone());
                    tracing::warn!(
                        task_id = %task.id,
                        remaining_seconds = remaining,
                        "Emitted agi:timeout_warning for task approaching deadline"
                    );
                }
            }
        }
    });
}
