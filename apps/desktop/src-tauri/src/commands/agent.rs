use crate::agent::{
    approval::{ApprovalController, ApprovalResolution},
    AgentConfig, AutonomousAgent, Task,
};
use crate::automation::AutomationService;
use crate::commands::llm::LLMState;
use crate::router::LLMRouter;
use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{collections::HashMap, sync::Arc};
use tauri::{Emitter, State};
use tokio::sync::Mutex as TokioMutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentSubmitTaskRequest {
    pub description: String,
    pub auto_approve: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitTaskResponse {
    pub task_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TaskStatusResponse {
    pub task: Task,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListTasksResponse {
    pub tasks: Vec<Task>,
}

// Global agent instance - use parking_lot::Mutex for outer, Arc<TokioMutex> for inner
static AGENT: Mutex<Option<Arc<TokioMutex<AutonomousAgent>>>> = Mutex::new(None);

/// Initialize the autonomous agent
#[tauri::command]
pub async fn agent_init(
    config: AgentConfig,
    automation: State<'_, Arc<AutomationService>>,
    llm_state: State<'_, LLMState>,
) -> Result<(), String> {
    // Get router from LLM state
    let router = llm_state.router.lock().await;
    // Create a new router instance for agent (since we can't clone)
    // TODO: Refactor to share router properly
    let router_for_agent = Arc::new(LLMRouter::new());
    drop(router);

    let agent = AutonomousAgent::new(config, automation.inner().clone(), router_for_agent)
        .map_err(|e| format!("Failed to create agent: {}", e))?;

    let agent_arc = Arc::new(TokioMutex::new(agent));

    // Start agent loop in background
    let agent_clone = agent_arc.clone();
    tokio::spawn(async move {
        // Clone the agent to avoid holding the lock
        let agent = {
            let guard = agent_clone.lock().await;
            guard.clone_for_task()
        };
        if let Err(e) = agent.start().await {
            tracing::error!("[Agent] Agent loop error: {}", e);
        }
    });

    *AGENT.lock() = Some(agent_arc);
    Ok(())
}

/// Submit a task to the autonomous agent
#[tauri::command]
pub async fn agent_submit_task(
    request: AgentSubmitTaskRequest,
) -> Result<SubmitTaskResponse, String> {
    let agent_arc = {
        let agent_guard = AGENT.lock();
        agent_guard
            .as_ref()
            .ok_or_else(|| "Agent not initialized".to_string())?
            .clone()
    }; // Drop the guard immediately

    // Now we can safely await with tokio::Mutex
    let agent = agent_arc.lock().await;
    let task_id = agent
        .submit_task(request.description, request.auto_approve)
        .await
        .map_err(|e| format!("Failed to submit task: {}", e))?;

    Ok(SubmitTaskResponse { task_id })
}

/// Get task status
#[tauri::command]
pub async fn agent_get_task_status(task_id: String) -> Result<TaskStatusResponse, String> {
    let agent_arc = {
        let agent_guard = AGENT.lock();
        agent_guard
            .as_ref()
            .ok_or_else(|| "Agent not initialized".to_string())?
            .clone()
    }; // Drop the guard immediately

    let agent = agent_arc.lock().await;
    let task = agent
        .get_task_status(&task_id)
        .ok_or_else(|| format!("Task {} not found", task_id))?;

    Ok(TaskStatusResponse { task })
}

/// List all tasks
#[tauri::command]
pub async fn agent_list_tasks() -> Result<ListTasksResponse, String> {
    let agent_arc = {
        let agent_guard = AGENT.lock();
        agent_guard
            .as_ref()
            .ok_or_else(|| "Agent not initialized".to_string())?
            .clone()
    }; // Drop the guard immediately

    let agent = agent_arc.lock().await;
    let tasks = agent.list_tasks();

    Ok(ListTasksResponse { tasks })
}

/// Stop the autonomous agent
#[tauri::command]
pub async fn agent_stop() -> Result<(), String> {
    let agent_arc_opt = {
        let agent_guard = AGENT.lock();
        agent_guard.as_ref().cloned()
    }; // Drop the guard immediately

    if let Some(agent_arc) = agent_arc_opt {
        let agent = agent_arc.lock().await;
        agent.stop();
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_resolve_approval(
    app_handle: tauri::AppHandle,
    approval_state: State<'_, ApprovalController>,
    approval_id: String,
    decision: String,
    trust: Option<bool>,
    reason: Option<String>,
) -> Result<(), String> {
    let normalized = decision.to_lowercase();
    let resolution = match normalized.as_str() {
        "approve" | "approved" => ApprovalResolution::Approved {
            trust: trust.unwrap_or(false),
        },
        "reject" | "rejected" => ApprovalResolution::Rejected { reason },
        other => return Err(format!("Invalid approval decision: {}", other)),
    };

    approval_state
        .resolve(&approval_id, resolution.clone())
        .await
        .map_err(|e| format!("Failed to resolve approval: {}", e))?;

    match &resolution {
        ApprovalResolution::Approved { .. } => {
            let _ = app_handle.emit(
                "agi:approval_granted",
                json!({
                    "approval": {
                        "id": approval_id,
                    }
                }),
            );
            let _ = app_handle.emit(
                "approval:granted",
                json!({
                    "id": approval_id,
                }),
            );
            let _ = app_handle.emit(
                "agent:action_update",
                json!({
                    "action": {
                        "id": approval_id,
                        "status": "running",
                        "requiresApproval": false
                    }
                }),
            );
        }
        ApprovalResolution::Rejected { reason } => {
            let rejection_reason = reason.clone().unwrap_or_else(|| "Rejected by user".to_string());
            let _ = app_handle.emit(
                "agi:approval_denied",
                json!({
                    "approval": {
                        "id": approval_id,
                        "rejectionReason": rejection_reason
                    }
                }),
            );
            let _ = app_handle.emit(
                "approval:denied",
                json!({
                    "id": approval_id,
                    "reason": rejection_reason
                }),
            );
            let _ = app_handle.emit(
                "agent:action_update",
                json!({
                    "action": {
                        "id": approval_id,
                        "status": "failed",
                        "requiresApproval": false,
                        "error": reason.clone().unwrap_or_else(|| "Rejected".to_string())
                    }
                }),
            );
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn agent_set_workflow_hash(
    approval_state: State<'_, ApprovalController>,
    workflow_hash: Option<String>,
) -> Result<(), String> {
    approval_state.set_current_hash(workflow_hash).await;
    Ok(())
}

#[tauri::command]
pub async fn agent_list_trusted_workflows(
    approval_state: State<'_, ApprovalController>,
) -> Result<HashMap<String, Vec<String>>, String> {
    approval_state
        .list_trusted_workflows()
        .await
        .map_err(|e| format!("Failed to list trusted workflows: {}", e))
}
