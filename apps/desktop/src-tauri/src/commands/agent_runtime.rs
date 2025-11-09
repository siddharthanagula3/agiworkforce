/// Tauri commands for AgentRuntime

use crate::agent::runtime::{AgentRuntime, Task, TaskPriority};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

/// AgentRuntime state managed by Tauri
pub struct AgentRuntimeState(pub Arc<Mutex<AgentRuntime>>);

/// Queue a new task
#[tauri::command]
pub async fn runtime_queue_task(
    state: State<'_, AgentRuntimeState>,
    description: String,
    goal: String,
    priority: Option<String>,
    dependencies: Option<Vec<String>>,
) -> Result<String, String> {
    let priority = match priority.as_deref() {
        Some("low") => TaskPriority::Low,
        Some("high") => TaskPriority::High,
        Some("critical") => TaskPriority::Critical,
        _ => TaskPriority::Normal,
    };
    
    let mut task = Task::new(description, goal, priority);
    
    if let Some(deps) = dependencies {
        task.dependencies = deps;
    }
    
    let runtime = state.0.lock().await;
    runtime
        .queue_task(task)
        .map_err(|e| format!("Failed to queue task: {}", e))
}

/// Get next task from queue
#[tauri::command]
pub async fn runtime_get_next_task(
    state: State<'_, AgentRuntimeState>,
) -> Result<Option<Task>, String> {
    let runtime = state.0.lock().await;
    Ok(runtime.get_next_task())
}

/// Execute a task
#[tauri::command]
pub async fn runtime_execute_task(
    state: State<'_, AgentRuntimeState>,
    task: Task,
) -> Result<serde_json::Value, String> {
    // Clone the Arc to avoid holding the lock across await
    let runtime_arc = state.0.clone();
    
    // Spawn the execution in a separate task to avoid Send issues
    let handle = tokio::spawn(async move {
        let runtime = runtime_arc.lock().await;
        runtime.execute_task(task).await
    });
    
    handle.await
        .map_err(|e| format!("Task execution panicked: {}", e))?
        .map_err(|e| format!("Task execution failed: {}", e))
}

/// Cancel a task
#[tauri::command]
pub async fn runtime_cancel_task(
    state: State<'_, AgentRuntimeState>,
    task_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    let runtime = state.0.lock().await;
    runtime
        .cancel_task(&task_id, reason.unwrap_or_else(|| "User cancellation".to_string()))
        .map_err(|e| format!("Failed to cancel task: {}", e))
}

/// Get task status
#[tauri::command]
pub async fn runtime_get_task_status(
    state: State<'_, AgentRuntimeState>,
    task_id: String,
) -> Result<Option<Task>, String> {
    let runtime = state.0.lock().await;
    Ok(runtime.get_task_status(&task_id))
}

/// Get all tasks
#[tauri::command]
pub async fn runtime_get_all_tasks(
    state: State<'_, AgentRuntimeState>,
) -> Result<Vec<Task>, String> {
    let runtime = state.0.lock().await;
    Ok(runtime.get_all_tasks())
}

/// Set auto-approve mode
#[tauri::command]
pub async fn runtime_set_auto_approve(
    state: State<'_, AgentRuntimeState>,
    enabled: bool,
) -> Result<(), String> {
    let runtime = state.0.lock().await;
    runtime.set_auto_approve(enabled);
    Ok(())
}

/// Check if auto-approve is enabled
#[tauri::command]
pub async fn runtime_is_auto_approve_enabled(
    state: State<'_, AgentRuntimeState>,
) -> Result<bool, String> {
    let runtime = state.0.lock().await;
    Ok(runtime.is_auto_approve_enabled())
}

/// Revert all changes for a task
#[tauri::command]
pub async fn runtime_revert_task(
    state: State<'_, AgentRuntimeState>,
    task_id: String,
) -> Result<Vec<String>, String> {
    let runtime = state.0.lock().await;
    runtime
        .revert_task_changes(&task_id)
        .await
        .map_err(|e| format!("Failed to revert task: {}", e))
}

/// Get change history for a task
#[tauri::command]
pub async fn runtime_get_task_changes(
    state: State<'_, AgentRuntimeState>,
    task_id: String,
) -> Result<Vec<crate::agent::change_tracker::Change>, String> {
    let runtime = state.0.lock().await;
    Ok(runtime.get_task_change_history(&task_id))
}

/// Get all change history
#[tauri::command]
pub async fn runtime_get_all_changes(
    state: State<'_, AgentRuntimeState>,
) -> Result<Vec<crate::agent::change_tracker::Change>, String> {
    let runtime = state.0.lock().await;
    Ok(runtime.get_all_change_history())
}

