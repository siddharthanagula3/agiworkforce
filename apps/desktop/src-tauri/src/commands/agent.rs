use crate::agent::{AgentConfig, AutonomousAgent, Task};
use crate::automation::AutomationService;
use crate::commands::llm::LLMState;
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;
use parking_lot::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitTaskRequest {
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
    request: SubmitTaskRequest,
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

