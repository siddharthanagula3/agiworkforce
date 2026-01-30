//! Tauri commands for Background Agents system.
//!
//! This module provides the frontend-facing commands for managing background agents.
//! Background agents allow users to push conversations to the background using the "&" prefix,
//! similar to Cursor's background agent pattern.
//!
//! # Commands
//!
//! - `background_agent_push` - Push a conversation to the background
//! - `background_agent_list` - List all background agents
//! - `background_agent_get` - Get a specific agent's status
//! - `background_agent_pause` - Pause a running agent
//! - `background_agent_resume` - Resume a paused agent
//! - `background_agent_cancel` - Cancel an agent
//! - `background_agent_take_over` - Take over an agent (bring to foreground)
//! - `background_agent_cleanup` - Clean up old completed agents

use crate::core::agent::{
    BackgroundAgent, BackgroundAgentContext, BackgroundAgentManagerState, BackgroundAgentStatus,
    ConversationMessage, MAX_BACKGROUND_AGENTS,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

/// Input for pushing a conversation to the background.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushToBackgroundInput {
    /// ID of the conversation to push.
    pub conversation_id: String,
    /// The goal/task description.
    pub goal: String,
    /// Optional working directory.
    pub working_directory: Option<String>,
    /// Optional conversation history to preserve.
    pub conversation_history: Option<Vec<MessageInput>>,
    /// Optional list of active MCP servers.
    pub active_mcp_servers: Option<Vec<String>>,
    /// Optional custom instructions.
    pub custom_instructions: Option<String>,
    /// Priority (0-255, higher = more important).
    pub priority: Option<u8>,
    /// Timeout in seconds (default: 300).
    pub timeout_secs: Option<u64>,
}

/// Input message format.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInput {
    /// Role: "user", "assistant", or "system".
    pub role: String,
    /// Message content.
    pub content: String,
    /// Optional timestamp (ISO 8601 format).
    pub timestamp: Option<String>,
}

/// Response for push operation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse {
    /// The ID of the newly created background agent.
    pub agent_id: String,
    /// Position in the queue (if not immediately started).
    pub queue_position: Option<usize>,
    /// Whether the agent was started immediately.
    pub started: bool,
}

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

/// Response for take over operation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeOverResponse {
    /// The agent that was taken over.
    pub agent: BackgroundAgent,
    /// The agent's context (for restoring the conversation).
    pub context: BackgroundAgentContext,
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

/// Push a conversation to the background as a new agent.
///
/// This command creates a new background agent that will continue working
/// on the specified goal while the user can work on other tasks.
///
/// # Arguments
///
/// * `input` - The push input containing conversation ID, goal, and context.
///
/// # Returns
///
/// Returns the agent ID and queue position information.
///
/// # Errors
///
/// Returns an error if the maximum number of agents is reached or if the
/// input is invalid.
#[tauri::command]
pub async fn background_agent_push(
    state: State<'_, BackgroundAgentManagerState>,
    input: PushToBackgroundInput,
) -> Result<PushResponse, String> {
    let manager = state.0.read().await;

    // Build the context
    let conversation_history = input
        .conversation_history
        .map(|messages| {
            messages
                .into_iter()
                .map(|m| ConversationMessage {
                    role: m.role,
                    content: m.content,
                    timestamp: m
                        .timestamp
                        .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(chrono::Utc::now),
                })
                .collect()
        })
        .unwrap_or_default();

    let context = BackgroundAgentContext {
        working_directory: input.working_directory,
        environment: HashMap::new(),
        conversation_snapshot: conversation_history,
        active_mcp_servers: input.active_mcp_servers.unwrap_or_default(),
        custom_instructions: input.custom_instructions,
    };

    let priority = input.priority.unwrap_or(5);

    let agent_id = manager
        .push_to_background(input.conversation_id, input.goal, context, priority)
        .await
        .map_err(|e| e.to_string())?;

    // Get the agent to check if it started
    let agent = manager.get_agent(&agent_id).await;
    let started = agent
        .map(|a| a.status == BackgroundAgentStatus::Running)
        .unwrap_or(false);

    // Calculate queue position if not started
    let queue_position = if !started {
        let agents = manager.list_active_agents().await;
        agents
            .iter()
            .position(|a| a.id == agent_id)
            .map(|p| p.saturating_add(1))
    } else {
        None
    };

    Ok(PushResponse {
        agent_id,
        queue_position,
        started,
    })
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

/// Take over a background agent (bring it back to the foreground).
///
/// Returns the agent and its context so the frontend can restore the conversation.
#[tauri::command]
pub async fn background_agent_take_over(
    state: State<'_, BackgroundAgentManagerState>,
    agent_id: String,
) -> Result<TakeOverResponse, String> {
    let manager = state.0.read().await;
    let (agent, context) = manager
        .take_over_agent(&agent_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(TakeOverResponse { agent, context })
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

/// Clean up old completed agents (older than 24 hours).
///
/// Returns the number of agents cleaned up.
#[tauri::command]
pub async fn background_agent_cleanup(
    state: State<'_, BackgroundAgentManagerState>,
) -> Result<usize, String> {
    let manager = state.0.read().await;
    manager
        .cleanup_old_agents()
        .await
        .map_err(|e| e.to_string())
}

/// Check if a goal should be pushed to the background.
///
/// This function detects the "&" prefix pattern (e.g., "& write tests for...")
/// and returns whether the goal should run in the background.
#[tauri::command]
pub fn background_agent_should_push(goal: String) -> Result<(bool, String), String> {
    let trimmed = goal.trim();

    // Check for "&" prefix (with or without space after)
    if trimmed.starts_with('&') {
        let cleaned_goal = trimmed.trim_start_matches('&').trim_start().to_string();

        if cleaned_goal.is_empty() {
            return Err("Please provide a goal after the & prefix".to_string());
        }

        Ok((true, cleaned_goal))
    } else {
        Ok((false, goal))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_push_with_ampersand() {
        let (should_push, goal) =
            background_agent_should_push("& write tests for the auth module".to_string()).unwrap();
        assert!(should_push);
        assert_eq!(goal, "write tests for the auth module");
    }

    #[test]
    fn test_should_push_with_ampersand_no_space() {
        let (should_push, goal) = background_agent_should_push("&write tests".to_string()).unwrap();
        assert!(should_push);
        assert_eq!(goal, "write tests");
    }

    #[test]
    fn test_should_not_push_without_ampersand() {
        let (should_push, goal) = background_agent_should_push("write tests".to_string()).unwrap();
        assert!(!should_push);
        assert_eq!(goal, "write tests");
    }

    #[test]
    fn test_should_push_empty_goal_error() {
        let result = background_agent_should_push("& ".to_string());
        assert!(result.is_err());
    }
}
