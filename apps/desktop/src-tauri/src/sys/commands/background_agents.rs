//! Tauri commands for Background Agents system.
//!
//! This module provides the frontend-facing commands for managing background agents.
//! Agents are started by the model's background-agent tool and by automation
//! triggers; the renderer lists, pauses, resumes, cancels and takes them over.
//!
//! # Commands
//!
//! - `background_agent_list` - List all background agents
//! - `background_agent_get` - Get a specific agent's status
//! - `background_agent_pause` - Pause a running agent
//! - `background_agent_resume` - Resume a paused agent
//! - `background_agent_cancel` - Cancel an agent

use crate::core::agent::{
    BackgroundAgent, BackgroundAgentManagerState, BackgroundAgentStatus, MAX_BACKGROUND_AGENTS,
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

/// Statistics about background agents.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundAgentStats {
    /// Total number of tracked agents.
    pub total_agents: usize,
    /// Number of running agents.
    pub running_count: usize,
    /// Number of queued agents.
    pub queued_count: usize,
    /// Number of paused agents.
    pub paused_count: usize,
    /// Number of completed agents.
    pub completed_count: usize,
    /// Number of failed agents.
    pub failed_count: usize,
    /// Maximum allowed agents.
    pub max_agents: usize,
    /// Whether we're at capacity.
    pub at_capacity: bool,
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

/// List only active (non-terminal) background agents.
#[tauri::command]
pub async fn background_agent_list_active(
    state: State<'_, BackgroundAgentManagerState>,
) -> Result<Vec<BackgroundAgent>, String> {
    let manager = state.0.read().await;
    Ok(manager.list_active_agents().await)
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

/// Get statistics about background agents.
#[tauri::command]
pub async fn background_agent_stats(
    state: State<'_, BackgroundAgentManagerState>,
) -> Result<BackgroundAgentStats, String> {
    let manager = state.0.read().await;
    let agents = manager.list_agents().await;

    let running_count = agents
        .iter()
        .filter(|a| a.status == BackgroundAgentStatus::Running)
        .count();
    let queued_count = agents
        .iter()
        .filter(|a| a.status == BackgroundAgentStatus::Queued)
        .count();
    let paused_count = agents
        .iter()
        .filter(|a| a.status == BackgroundAgentStatus::Paused)
        .count();
    let completed_count = agents
        .iter()
        .filter(|a| a.status == BackgroundAgentStatus::Completed)
        .count();
    let failed_count = agents
        .iter()
        .filter(|a| a.status == BackgroundAgentStatus::Failed)
        .count();

    let active_count = running_count + queued_count + paused_count;

    Ok(BackgroundAgentStats {
        total_agents: agents.len(),
        running_count,
        queued_count,
        paused_count,
        completed_count,
        failed_count,
        max_agents: MAX_BACKGROUND_AGENTS,
        at_capacity: active_count >= MAX_BACKGROUND_AGENTS,
    })
}
