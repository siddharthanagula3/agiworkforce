//! Tauri commands for background task management

use crate::tasks::types::{Priority, Task, TaskFilter, TaskStatus};
use crate::tasks::TaskManager;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

/// Task manager state wrapper for Tauri
pub struct TaskManagerState(pub Arc<TaskManager>);

/// Request to submit a new task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitTaskRequest {
    pub name: String,
    pub description: Option<String>,
    pub priority: String, // "Low", "Normal", or "High"
    pub payload: Option<String>,
}

/// Task filter request for background tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBackgroundTasksRequest {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub limit: Option<usize>,
}

/// Submit a background task for execution
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

/// Cancel a background task
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

/// Pause a running background task
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

/// Resume a paused background task
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

/// Get background task status
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

/// List background tasks with optional filtering
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

/// Get task statistics
#[tauri::command]
pub async fn bg_get_task_stats(
    state: State<'_, TaskManagerState>,
) -> Result<crate::tasks::persistence::TaskStats, String> {
    state
        .0
        .persistence
        .get_stats()
        .map_err(|e| format!("Failed to get task stats: {}", e))
}
