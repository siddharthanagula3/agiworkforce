use crate::features::tasks::types::{Priority, Task, TaskFilter, TaskStatus};
use crate::features::tasks::TaskManager;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::State;

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
    Ok(TimeoutStatusResponse {
        task_id: task.id,
        task_name: task.name,
        remaining_seconds: 0, // Would need actual timeout tracking
        max_timeout_minutes: 30,
        executed_steps: 0,
        total_estimated_steps: None,
    })
}

#[tauri::command]
pub async fn agi_extend_timeout(
    task_id: String,
    _additional_minutes: i32,
    state: State<'_, TaskManagerState>,
) -> Result<(), String> {
    // Timeout extension would need actual implementation
    // For now, just verify the task exists
    bg_get_task_status(task_id, state).await?;
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
