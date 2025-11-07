use crate::agent::{AgentConfig, AutonomousAgent, Task};
use crate::automation::AutomationService;
use crate::commands::llm::LLMState;
use crate::router::LLMRouter;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

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

// Global agent instance
static AGENT: Mutex<Option<Arc<Mutex<AutonomousAgent>>>> = Mutex::new(None);

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

    let agent_arc = Arc::new(Mutex::new(agent));
    
    // Start agent loop in background
    let agent_clone = agent_arc.clone();
    tokio::spawn(async move {
        // Clone the agent to avoid holding the lock
        let agent = {
            let guard = agent_clone.lock().unwrap();
            guard.clone_for_task()
        };
        if let Err(e) = agent.start().await {
            tracing::error!("[Agent] Agent loop error: {}", e);
        }
    });

    *AGENT.lock().unwrap() = Some(agent_arc);
    Ok(())
}

/// Submit a task to the autonomous agent
#[tauri::command]
pub async fn agent_submit_task(
    request: SubmitTaskRequest,
) -> Result<SubmitTaskResponse, String> {
    let agent_guard = AGENT.lock().unwrap();
    let agent = agent_guard
        .as_ref()
        .ok_or_else(|| "Agent not initialized".to_string())?;
    
    let agent = agent.lock().unwrap();
    let task_id = agent
        .submit_task(request.description, request.auto_approve)
        .await
        .map_err(|e| format!("Failed to submit task: {}", e))?;

    Ok(SubmitTaskResponse { task_id })
}

/// Get task status
#[tauri::command]
pub async fn agent_get_task_status(task_id: String) -> Result<TaskStatusResponse, String> {
    let agent_guard = AGENT.lock().unwrap();
    let agent = agent_guard
        .as_ref()
        .ok_or_else(|| "Agent not initialized".to_string())?;
    
    let agent = agent.lock().unwrap();
    let task = agent
        .get_task_status(&task_id)
        .ok_or_else(|| format!("Task {} not found", task_id))?;

    Ok(TaskStatusResponse { task })
}

/// List all tasks
#[tauri::command]
pub async fn agent_list_tasks() -> Result<ListTasksResponse, String> {
    let agent_guard = AGENT.lock().unwrap();
    let agent = agent_guard
        .as_ref()
        .ok_or_else(|| "Agent not initialized".to_string())?;
    
    let agent = agent.lock().unwrap();
    let tasks = agent.list_tasks();

    Ok(ListTasksResponse { tasks })
}

/// Stop the autonomous agent
#[tauri::command]
pub async fn agent_stop() -> Result<(), String> {
    let agent_guard = AGENT.lock().unwrap();
    if let Some(agent) = agent_guard.as_ref() {
        let agent = agent.lock().unwrap();
        agent.stop();
    }
    Ok(())
}

