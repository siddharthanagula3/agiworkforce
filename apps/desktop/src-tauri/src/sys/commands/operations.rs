use crate::features::tasks::types::TaskFilter;
use crate::sys::security::{ApprovalDecision, ApprovalWorkflow};
use tauri::{AppHandle, Emitter, Manager, State};

use super::AppDatabase;

#[tauri::command]
pub async fn approve_operation(
    app_handle: AppHandle,
    approval_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    tracing::info!("[Commands] Approving operation: {}", approval_id);

    let workflow = ApprovalWorkflow::new(db.conn.clone());

    let decision = ApprovalDecision::Approved { reason: None };
    workflow
        .approve_request(&approval_id, "system", decision)
        .map_err(|e| format!("Failed to approve request: {}", e))?;

    tracing::info!("[Commands] Approval {} granted in workflow", approval_id);

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

    let workflow = ApprovalWorkflow::new(db.conn.clone());

    let decision = ApprovalDecision::Rejected {
        reason: rejection_reason.clone(),
    };
    workflow
        .approve_request(&approval_id, "system", decision)
        .map_err(|e| format!("Failed to reject request: {}", e))?;

    tracing::info!("[Commands] Approval {} rejected in workflow", approval_id);

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

#[tauri::command]
pub async fn cancel_background_task(app_handle: AppHandle, task_id: String) -> Result<(), String> {
    tracing::info!("[Commands] Cancelling background task: {}", task_id);

    let task_manager = app_handle
        .state::<std::sync::Arc<crate::features::tasks::TaskManager>>()
        .inner()
        .clone();

    task_manager
        .cancel(&task_id)
        .await
        .map_err(|e| format!("Failed to cancel task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn pause_background_task(app_handle: AppHandle, task_id: String) -> Result<(), String> {
    tracing::info!("[Commands] Pausing background task: {}", task_id);

    let task_manager = app_handle
        .state::<std::sync::Arc<crate::features::tasks::TaskManager>>()
        .inner()
        .clone();

    task_manager
        .pause(&task_id)
        .await
        .map_err(|e| format!("Failed to pause task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn resume_background_task(app_handle: AppHandle, task_id: String) -> Result<(), String> {
    tracing::info!("[Commands] Resuming background task: {}", task_id);

    let task_manager = app_handle
        .state::<std::sync::Arc<crate::features::tasks::TaskManager>>()
        .inner()
        .clone();

    task_manager
        .resume(&task_id)
        .await
        .map_err(|e| format!("Failed to resume task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn list_background_tasks(
    app_handle: AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    let task_manager = app_handle
        .state::<std::sync::Arc<crate::features::tasks::TaskManager>>()
        .inner()
        .clone();

    let tasks = task_manager
        .list(TaskFilter::default())
        .await
        .map_err(|e| format!("Failed to list tasks: {}", e))?;

    let tasks_json: Vec<serde_json::Value> = tasks
        .into_iter()
        .map(|task| serde_json::to_value(task).unwrap_or(serde_json::Value::Null))
        .collect();

    Ok(tasks_json)
}

#[tauri::command]
pub async fn list_active_agents(app_handle: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    if let Some(orchestrator) = app_handle
        .try_state::<std::sync::Arc<tokio::sync::Mutex<crate::core::agi::orchestrator::AgentOrchestrator>>>()
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
        Ok(Vec::new())
    }
}
