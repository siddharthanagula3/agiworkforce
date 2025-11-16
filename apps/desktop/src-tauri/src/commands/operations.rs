/// User-initiated operation commands
///
/// This module provides Tauri commands for user actions like
/// approving/rejecting operations, managing background tasks, etc.
use crate::security::{ApprovalDecision, ApprovalWorkflow};
use crate::tasks::types::TaskFilter;
use tauri::{AppHandle, Emitter, Manager, State};

use super::AppDatabase;

/// Approve a pending operation
///
/// This command is called when a user clicks the "Approve" button
/// on an ApprovalRequestCard in the frontend.
#[tauri::command]
pub async fn approve_operation(
    app_handle: AppHandle,
    approval_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    tracing::info!("[Commands] Approving operation: {}", approval_id);

    // Get the approval workflow
    let workflow = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
        ApprovalWorkflow::new(std::sync::Arc::new(std::sync::Mutex::new(
            // Clone the connection to avoid lock issues
            rusqlite::Connection::open(
                conn.path()
                    .ok_or_else(|| "Database path not available".to_string())?,
            )
            .map_err(|e| format!("Failed to open database: {}", e))?,
        )))
    };

    // Approve the request in the workflow
    // Using "system" as reviewer_id since this is a user-initiated action from the frontend
    let decision = ApprovalDecision::Approved { reason: None };
    workflow
        .approve_request(&approval_id, "system", decision)
        .map_err(|e| format!("Failed to approve request: {}", e))?;

    tracing::info!("[Commands] Approval {} granted in workflow", approval_id);

    // Emit event to frontend
    app_handle
        .emit(
            "agi:approval_granted",
            serde_json::json!({
                "approval": {
                    "id": approval_id,
                }
            }),
        )
        .map_err(|e| format!("Failed to emit approval event: {}", e))?;

    // Emit event for any waiting AGI executor or autonomous agent
    app_handle
        .emit(
            "approval:granted",
            serde_json::json!({
                "id": approval_id,
            }),
        )
        .map_err(|e| format!("Failed to emit internal approval event: {}", e))?;

    tracing::info!(
        "[Commands] Approval {} events emitted successfully",
        approval_id
    );

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
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    tracing::info!(
        "[Commands] Rejecting operation: {} (reason: {:?})",
        approval_id,
        reason
    );

    let rejection_reason = reason.unwrap_or_else(|| "User rejected operation".to_string());

    // Get the approval workflow
    let workflow = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
        ApprovalWorkflow::new(std::sync::Arc::new(std::sync::Mutex::new(
            // Clone the connection to avoid lock issues
            rusqlite::Connection::open(
                conn.path()
                    .ok_or_else(|| "Database path not available".to_string())?,
            )
            .map_err(|e| format!("Failed to open database: {}", e))?,
        )))
    };

    // Reject the request in the workflow
    let decision = ApprovalDecision::Rejected {
        reason: rejection_reason.clone(),
    };
    workflow
        .approve_request(&approval_id, "system", decision)
        .map_err(|e| format!("Failed to reject request: {}", e))?;

    tracing::info!("[Commands] Approval {} rejected in workflow", approval_id);

    // Emit event to frontend
    app_handle
        .emit(
            "agi:approval_denied",
            serde_json::json!({
                "approval": {
                    "id": approval_id,
                    "rejectionReason": rejection_reason,
                }
            }),
        )
        .map_err(|e| format!("Failed to emit rejection event: {}", e))?;

    // Emit event for any waiting AGI executor or autonomous agent to cancel the operation
    app_handle
        .emit(
            "approval:denied",
            serde_json::json!({
                "id": approval_id,
                "reason": rejection_reason,
            }),
        )
        .map_err(|e| format!("Failed to emit internal denial event: {}", e))?;

    tracing::info!(
        "[Commands] Approval {} denial events emitted successfully",
        approval_id
    );

    Ok(())
}

/// Cancel a background task
#[tauri::command]
pub async fn cancel_background_task(app_handle: AppHandle, task_id: String) -> Result<(), String> {
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
pub async fn resume_background_task(app_handle: AppHandle, task_id: String) -> Result<(), String> {
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

// NOTE: The cancel_agent, pause_agent, and resume_agent commands have been moved to agi.rs
// to avoid duplicate command definitions

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
        .list(TaskFilter::default())
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
pub async fn list_active_agents(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    if let Some(orchestrator) = app_handle
        .try_state::<std::sync::Arc<tokio::sync::Mutex<crate::agi::orchestrator::AgentOrchestrator>>>()
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
