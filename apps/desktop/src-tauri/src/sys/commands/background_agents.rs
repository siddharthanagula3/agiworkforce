//! Tauri commands for Background Agents system.
//!
//! This module provides the frontend-facing commands for managing background agents.
//! Agents are started by the model's background-agent tool, by automation
//! triggers and by a task dispatched from the mobile companion; the renderer
//! lists, pauses, resumes and cancels them.
//!
//! # Commands
//!
//! - `background_agent_start` - Start a run for a dispatched task
//! - `background_agent_list` - List all background agents
//! - `background_agent_get` - Get a specific agent's status
//! - `background_agent_pause` - Pause a running agent
//! - `background_agent_resume` - Resume a paused agent
//! - `background_agent_cancel` - Cancel an agent

use crate::core::agent::{
    BackgroundAgent, BackgroundAgentContext, BackgroundAgentManagerState, MAX_BACKGROUND_AGENTS,
};
use serde::Serialize;
use tauri::State;

/// Response for listing agents.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAgentsResponse {
    /// List of all agents.
    pub agents: Vec<BackgroundAgent>,
    /// Number of active (non-terminal) agents.
    pub active_count: usize,
    /// Maximum allowed agents.
    pub max_agents: usize,
}

/// Where a run started by a dispatched task says it came from.
const DISPATCHED_TASK_ORIGIN: &str = "dispatch";

/// Start a background run for a task dispatched from the mobile companion and
/// return its id. It runs unattended, inside the app's current boundary, and
/// in `working_directory` only when that folder is granted.
#[tauri::command]
pub async fn background_agent_start(
    state: State<'_, BackgroundAgentManagerState>,
    goal: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    let goal = goal.trim().to_string();
    if goal.is_empty() {
        return Err("The task has no goal to work on.".to_string());
    }
    let context = BackgroundAgentContext {
        working_directory,
        ..Default::default()
    };
    let manager = state.0.read().await;
    manager
        .push_to_background(DISPATCHED_TASK_ORIGIN.to_string(), goal, context, 0)
        .await
        .map_err(|e| e.to_string())
}

/// List all background agents.
///
/// Returns all tracked agents including completed ones (for the last 24 hours).
#[tauri::command]
pub async fn background_agent_list(
    state: State<'_, BackgroundAgentManagerState>,
) -> Result<ListAgentsResponse, String> {
    let manager = state.0.read().await;

    let agents = manager.list_agents().await;
    let active_count = manager.count_active_agents().await;

    Ok(ListAgentsResponse {
        agents,
        active_count,
        max_agents: MAX_BACKGROUND_AGENTS,
    })
}

/// Get a specific background agent by ID.
#[tauri::command]
pub async fn background_agent_get(
    state: State<'_, BackgroundAgentManagerState>,
    agent_id: String,
) -> Result<Option<BackgroundAgent>, String> {
    let manager = state.0.read().await;
    Ok(manager.get_agent(&agent_id).await)
}

/// Pause a running background agent.
///
/// The agent can be resumed later with `background_agent_resume`.
#[tauri::command]
pub async fn background_agent_pause(
    state: State<'_, BackgroundAgentManagerState>,
    agent_id: String,
) -> Result<(), String> {
    let manager = state.0.read().await;
    manager
        .pause_agent(&agent_id)
        .await
        .map_err(|e| e.to_string())
}

/// Resume a paused background agent.
#[tauri::command]
pub async fn background_agent_resume(
    state: State<'_, BackgroundAgentManagerState>,
    agent_id: String,
) -> Result<(), String> {
    let manager = state.0.read().await;
    manager
        .resume_agent(&agent_id)
        .await
        .map_err(|e| e.to_string())
}

/// Cancel a background agent.
///
/// The agent will be stopped and marked as cancelled.
#[tauri::command]
pub async fn background_agent_cancel(
    state: State<'_, BackgroundAgentManagerState>,
    agent_id: String,
) -> Result<(), String> {
    let manager = state.0.read().await;
    manager
        .cancel_agent(&agent_id)
        .await
        .map_err(|e| e.to_string())
}
