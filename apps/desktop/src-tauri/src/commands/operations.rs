/// User-initiated operation commands
///
/// This module provides Tauri commands for user actions like
/// approving/rejecting operations, managing background tasks, etc.

use tauri::{AppHandle, Manager};

/// Approve a pending operation
///
/// This command is called when a user clicks the "Approve" button
/// on an ApprovalRequestCard in the frontend.
#[tauri::command]
pub async fn approve_operation(
    app_handle: AppHandle,
    approval_id: String,
) -> Result<(), String> {
    tracing::info!("[Commands] Approving operation: {}", approval_id);

    // Emit event to frontend
    app_handle
        .emit_all(
            "agi:approval_granted",
            serde_json::json!({
                "approval": {
                    "id": approval_id,
                }
            }),
        )
        .map_err(|e| format!("Failed to emit approval event: {}", e))?;

    // TODO: Notify the AGI system or executor that approval was granted
    // This would typically unblock a waiting operation

    Ok(())
}

/// Reject a pending operation
///
/// This command is called when a user clicks the "Reject" button
/// on an ApprovalRequestCard in the frontend.
#[tauri::command]
pub async fn reject_operation(
    app_handle: AppHandle,
    approval_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    tracing::info!(
        "[Commands] Rejecting operation: {} (reason: {:?})",
        approval_id,
        reason
    );

    // Emit event to frontend
    app_handle
        .emit_all(
            "agi:approval_denied",
            serde_json::json!({
                "approval": {
                    "id": approval_id,
                    "rejectionReason": reason,
                }
            }),
        )
        .map_err(|e| format!("Failed to emit rejection event: {}", e))?;

    // TODO: Notify the AGI system that approval was denied
    // This would typically cancel the blocked operation

    Ok(())
}

/// Cancel a background task
#[tauri::command]
pub async fn cancel_background_task(
    app_handle: AppHandle,
    task_id: String,
) -> Result<(), String> {
    tracing::info!("[Commands] Cancelling background task: {}", task_id);

    // Get task manager state
    let task_manager = app_handle
        .state::<std::sync::Arc<crate::tasks::TaskManager>>()
        .inner()
        .clone();

    // Cancel the task
    task_manager
        .cancel(&task_id)
        .await
        .map_err(|e| format!("Failed to cancel task: {}", e))?;

    Ok(())
}

/// Pause a background task
#[tauri::command]
pub async fn pause_background_task(app_handle: AppHandle, task_id: String) -> Result<(), String> {
    tracing::info!("[Commands] Pausing background task: {}", task_id);

    let task_manager = app_handle
        .state::<std::sync::Arc<crate::tasks::TaskManager>>()
        .inner()
        .clone();

    task_manager
        .pause(&task_id)
        .await
        .map_err(|e| format!("Failed to pause task: {}", e))?;

    Ok(())
}

/// Resume a paused background task
#[tauri::command]
pub async fn resume_background_task(
    app_handle: AppHandle,
    task_id: String,
) -> Result<(), String> {
    tracing::info!("[Commands] Resuming background task: {}", task_id);

    let task_manager = app_handle
        .state::<std::sync::Arc<crate::tasks::TaskManager>>()
        .inner()
        .clone();

    task_manager
        .resume(&task_id)
        .await
        .map_err(|e| format!("Failed to resume task: {}", e))?;

    Ok(())
}

/// Cancel an agent
#[tauri::command]
pub async fn cancel_agent(app_handle: AppHandle, agent_id: String) -> Result<(), String> {
    tracing::info!("[Commands] Cancelling agent: {}", agent_id);

    // Get orchestrator state
    if let Some(orchestrator) = app_handle
        .try_state::<std::sync::Arc<tokio::sync::Mutex<crate::agi::orchestrator::Orchestrator>>>()
    {
        let orchestrator = orchestrator.inner().clone();
        let orch = orchestrator.lock().await;

        orch.cancel_agent(&agent_id)
            .await
            .map_err(|e| format!("Failed to cancel agent: {}", e))?;
    } else {
        return Err("Orchestrator not initialized".to_string());
    }

    Ok(())
}

/// Pause an agent
#[tauri::command]
pub async fn pause_agent(app_handle: AppHandle, agent_id: String) -> Result<(), String> {
    tracing::info!("[Commands] Pausing agent: {}", agent_id);

    // TODO: Implement agent pause functionality
    // This would require adding pause/resume methods to the orchestrator

    Err("Agent pause not yet implemented".to_string())
}

/// Get list of all background tasks
#[tauri::command]
pub async fn list_background_tasks(
    app_handle: AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    let task_manager = app_handle
        .state::<std::sync::Arc<crate::tasks::TaskManager>>()
        .inner()
        .clone();

    let tasks = task_manager
        .list_tasks(None)
        .await
        .map_err(|e| format!("Failed to list tasks: {}", e))?;

    // Convert tasks to JSON
    let tasks_json: Vec<serde_json::Value> = tasks
        .into_iter()
        .map(|task| serde_json::to_value(task).unwrap_or(serde_json::Value::Null))
        .collect();

    Ok(tasks_json)
}

/// Get list of all active agents
#[tauri::command]
pub async fn list_active_agents(
    app_handle: AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    if let Some(orchestrator) = app_handle
        .try_state::<std::sync::Arc<tokio::sync::Mutex<crate::agi::orchestrator::Orchestrator>>>()
    {
        let orchestrator = orchestrator.inner().clone();
        let orch = orchestrator.lock().await;

        let agents = orch
            .list_agents()
            .await
            .map_err(|e| format!("Failed to list agents: {}", e))?;

        let agents_json: Vec<serde_json::Value> = agents
            .into_iter()
            .map(|agent| serde_json::to_value(agent).unwrap_or(serde_json::Value::Null))
            .collect();

        Ok(agents_json)
    } else {
        Ok(Vec::new()) // Return empty list if orchestrator not initialized
    }
}
