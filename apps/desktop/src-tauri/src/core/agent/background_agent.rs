//! Background Agents System for AGI Workforce
//!
//! This module implements a background agent system inspired by Cursor's "&" prefix pattern.
//! Background agents allow users to push active conversations to the background,
//! continue working while agents complete tasks, and receive notifications on completion.
//!
//! # Features
//!
//! - Isolated execution context per background agent
//! - Progress tracking and status monitoring
//! - Desktop notifications on completion
//! - Resume/takeover capability
//! - Persistence across app restarts
//! - Up to 8 parallel background agents
//!
//! # Usage
//!
//! ```ignore
//! // Push current conversation to background (from frontend)
//! await invoke('background_agent_push', { conversationId: '...', goal: '...' });
//!
//! // List all background agents
//! await invoke('background_agent_list');
//!
//! // Resume/take over an agent
//! await invoke('background_agent_resume', { agentId: '...' });
//! ```

use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

use crate::automation::AutomationService;
use crate::core::agent::autonomous::AutonomousAgent;
use crate::core::agent::AgentConfig;
use crate::core::llm::LLMRouter;

/// Maximum number of concurrent background agents allowed.
pub const MAX_BACKGROUND_AGENTS: usize = 8;

/// Default timeout for background agent execution (24 hours).
pub const DEFAULT_AGENT_TIMEOUT_SECS: u64 = 86400;

/// Status of a background agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundAgentStatus {
    /// Agent is queued but not yet started.
    Queued,
    /// Agent is actively executing.
    Running,
    /// Agent is paused (can be resumed).
    Paused,
    /// Agent completed successfully.
    Completed,
    /// Agent failed with an error.
    Failed,
    /// Agent was cancelled by the user.
    Cancelled,
    /// Agent was taken over by the user (resumed to foreground).
    TakenOver,
}

impl std::fmt::Display for BackgroundAgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Queued => write!(f, "queued"),
            Self::Running => write!(f, "running"),
            Self::Paused => write!(f, "paused"),
            Self::Completed => write!(f, "completed"),
            Self::Failed => write!(f, "failed"),
            Self::Cancelled => write!(f, "cancelled"),
            Self::TakenOver => write!(f, "taken_over"),
        }
    }
}

impl From<&str> for BackgroundAgentStatus {
    fn from(s: &str) -> Self {
        match s {
            "queued" => Self::Queued,
            "running" => Self::Running,
            "paused" => Self::Paused,
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "cancelled" => Self::Cancelled,
            "taken_over" => Self::TakenOver,
            _ => Self::Failed,
        }
    }
}

/// Progress information for a background agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgress {
    /// Current step index (0-based).
    pub current_step: usize,
    /// Total number of steps (estimated).
    pub total_steps: usize,
    /// Description of the current step.
    pub current_step_description: String,
    /// Percentage complete (0-100).
    pub percentage: u8,
    /// Elapsed time in seconds.
    pub elapsed_secs: u64,
}

impl Default for AgentProgress {
    fn default() -> Self {
        Self {
            current_step: 0,
            total_steps: 1,
            current_step_description: "Starting...".to_string(),
            percentage: 0,
            elapsed_secs: 0,
        }
    }
}

/// Summary of what a background agent accomplished.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSummary {
    /// Brief description of the outcome.
    pub description: String,
    /// List of files created or modified.
    pub files_changed: Vec<String>,
    /// List of actions taken.
    pub actions_taken: Vec<String>,
    /// Any errors or warnings encountered.
    pub warnings: Vec<String>,
    /// Whether the goal was fully achieved.
    pub goal_achieved: bool,
}

/// Execution context for a background agent (isolated state).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundAgentContext {
    /// Working directory for the agent.
    pub working_directory: Option<String>,
    /// Environment variables specific to this agent.
    pub environment: HashMap<String, String>,
    /// Conversation history up to the point of push.
    pub conversation_snapshot: Vec<ConversationMessage>,
    /// Any MCP servers that were active.
    pub active_mcp_servers: Vec<String>,
    /// Custom instructions at the time of push.
    pub custom_instructions: Option<String>,
}

/// A message in the conversation snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    /// Role: "user", "assistant", or "system".
    pub role: String,
    /// Message content.
    pub content: String,
    /// Timestamp of the message.
    pub timestamp: DateTime<Utc>,
}

/// A background agent instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundAgent {
    /// Unique identifier for this agent.
    pub id: String,
    /// ID of the conversation this agent was pushed from.
    pub conversation_id: String,
    /// The goal/task description the agent is working on.
    pub goal: String,
    /// Current status of the agent.
    pub status: BackgroundAgentStatus,
    /// Progress information.
    pub progress: AgentProgress,
    /// Summary of accomplishments (populated on completion).
    pub summary: Option<AgentSummary>,
    /// Error message if failed.
    pub error: Option<String>,
    /// When the agent was created/pushed to background.
    pub created_at: DateTime<Utc>,
    /// When the agent started executing.
    pub started_at: Option<DateTime<Utc>>,
    /// When the agent completed/failed/cancelled.
    pub completed_at: Option<DateTime<Utc>>,
    /// Isolated execution context.
    pub context: BackgroundAgentContext,
    /// Priority (higher = more important). Used for queue ordering.
    pub priority: u8,
    /// Maximum execution time in seconds.
    pub timeout_secs: u64,
}

impl BackgroundAgent {
    /// Create a new background agent.
    pub fn new(
        conversation_id: String,
        goal: String,
        context: BackgroundAgentContext,
        priority: u8,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            conversation_id,
            goal,
            status: BackgroundAgentStatus::Queued,
            progress: AgentProgress::default(),
            summary: None,
            error: None,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            context,
            priority,
            timeout_secs: DEFAULT_AGENT_TIMEOUT_SECS,
        }
    }

    /// Check if the agent is in a terminal state.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            BackgroundAgentStatus::Completed
                | BackgroundAgentStatus::Failed
                | BackgroundAgentStatus::Cancelled
                | BackgroundAgentStatus::TakenOver
        )
    }

    /// Check if the agent can be resumed.
    pub fn can_resume(&self) -> bool {
        matches!(
            self.status,
            BackgroundAgentStatus::Paused | BackgroundAgentStatus::Queued
        )
    }

    /// Update progress.
    pub fn update_progress(
        &mut self,
        current_step: usize,
        total_steps: usize,
        description: String,
    ) {
        self.progress.current_step = current_step;
        self.progress.total_steps = total_steps;
        self.progress.current_step_description = description;
        self.progress.percentage = if total_steps > 0 {
            ((current_step as f64 / total_steps as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };
        if let Some(started_at) = self.started_at {
            self.progress.elapsed_secs = (Utc::now() - started_at).num_seconds().max(0) as u64;
        }
    }

    /// Mark the agent as started.
    pub fn start(&mut self) {
        self.status = BackgroundAgentStatus::Running;
        self.started_at = Some(Utc::now());
    }

    /// Mark the agent as completed with a summary.
    pub fn complete(&mut self, summary: AgentSummary) {
        self.status = BackgroundAgentStatus::Completed;
        self.completed_at = Some(Utc::now());
        self.summary = Some(summary);
        self.progress.percentage = 100;
    }

    /// Mark the agent as failed with an error.
    pub fn fail(&mut self, error: String) {
        self.status = BackgroundAgentStatus::Failed;
        self.completed_at = Some(Utc::now());
        self.error = Some(error);
    }

    /// Mark the agent as cancelled.
    pub fn cancel(&mut self) {
        self.status = BackgroundAgentStatus::Cancelled;
        self.completed_at = Some(Utc::now());
    }

    /// Mark the agent as paused.
    pub fn pause(&mut self) {
        if self.status == BackgroundAgentStatus::Running {
            self.status = BackgroundAgentStatus::Paused;
        }
    }

    /// Mark the agent as taken over (resumed to foreground).
    pub fn take_over(&mut self) {
        self.status = BackgroundAgentStatus::TakenOver;
        self.completed_at = Some(Utc::now());
    }
}

/// Command to control a running background agent.
#[derive(Debug, Clone)]
pub enum AgentCommand {
    /// Pause the agent.
    Pause,
    /// Resume the agent.
    Resume,
    /// Cancel the agent.
    Cancel,
    /// Take over the agent (resume to foreground).
    TakeOver,
}

/// Handle for controlling a running background agent.
pub struct AgentHandle {
    /// Channel to send commands to the agent.
    pub command_tx: mpsc::Sender<AgentCommand>,
    /// The agent ID.
    pub agent_id: String,
}

/// Manager for background agents.
///
/// Handles creation, tracking, persistence, and lifecycle management
/// of background agents. Supports up to `MAX_BACKGROUND_AGENTS` concurrent agents.
pub struct BackgroundAgentManager {
    /// All tracked agents (including completed ones for history).
    agents: Arc<RwLock<HashMap<String, BackgroundAgent>>>,
    /// Handles for controlling running agents.
    handles: Arc<Mutex<HashMap<String, AgentHandle>>>,
    /// Database connection for persistence.
    db_conn: Arc<std::sync::Mutex<Connection>>,
    /// Tauri app handle for notifications and events.
    app_handle: Option<AppHandle>,
    /// Queue of agents waiting to run.
    queue: Arc<RwLock<Vec<String>>>,
    /// LLM router for the autonomous agent (None if not yet available).
    router: Option<Arc<RwLock<LLMRouter>>>,
    /// Automation service for the autonomous agent (None if not yet available).
    automation: Option<Arc<AutomationService>>,
}

impl BackgroundAgentManager {
    /// Create a new background agent manager.
    pub fn new(
        db_conn: Arc<std::sync::Mutex<Connection>>,
        router: Option<Arc<RwLock<LLMRouter>>>,
        automation: Option<Arc<AutomationService>>,
    ) -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            handles: Arc::new(Mutex::new(HashMap::new())),
            db_conn,
            app_handle: None,
            queue: Arc::new(RwLock::new(Vec::new())),
            router,
            automation,
        }
    }

    /// Set the Tauri app handle for notifications.
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Initialize the manager, loading persisted agents from the database.
    pub async fn initialize(&self) -> anyhow::Result<()> {
        self.load_persisted_agents().await?;
        self.resume_queued_agents().await?;
        Ok(())
    }

    /// Push a conversation to the background as a new agent.
    ///
    /// Returns the agent ID or an error if the maximum number of agents is reached.
    pub async fn push_to_background(
        &self,
        conversation_id: String,
        goal: String,
        context: BackgroundAgentContext,
        priority: u8,
    ) -> anyhow::Result<String> {
        // Check if we're at capacity
        let running_count = self.count_active_agents().await;
        if running_count >= MAX_BACKGROUND_AGENTS {
            return Err(anyhow::anyhow!(
                "Maximum number of background agents ({}) reached. Please wait for one to complete or cancel an existing agent.",
                MAX_BACKGROUND_AGENTS
            ));
        }

        let agent = BackgroundAgent::new(conversation_id, goal.clone(), context, priority);
        let agent_id = agent.id.clone();

        // Store in memory
        {
            let mut agents = self.agents.write().await;
            agents.insert(agent_id.clone(), agent.clone());
        }

        // Add to queue
        {
            let mut queue = self.queue.write().await;
            queue.push(agent_id.clone());
            // Sort by priority (higher priority first)
            let agents = self.agents.read().await;
            queue.sort_by(|a, b| {
                let a_priority = agents.get(a).map(|agent| agent.priority).unwrap_or(0);
                let b_priority = agents.get(b).map(|agent| agent.priority).unwrap_or(0);
                b_priority.cmp(&a_priority)
            });
        }

        // Persist to database
        self.persist_agent(&agent)?;

        // Emit event to frontend
        self.emit_agent_event("background_agent:created", &agent_id, None)?;

        tracing::info!(
            "[BackgroundAgent] Pushed conversation {} to background as agent {}. Goal: {}",
            agent.conversation_id,
            agent_id,
            goal
        );

        // Start processing the queue
        self.process_queue().await?;

        Ok(agent_id)
    }

    /// Get the status of a background agent.
    pub async fn get_agent(&self, agent_id: &str) -> Option<BackgroundAgent> {
        let agents = self.agents.read().await;
        agents.get(agent_id).cloned()
    }

    /// List all background agents.
    pub async fn list_agents(&self) -> Vec<BackgroundAgent> {
        let agents = self.agents.read().await;
        let mut list: Vec<_> = agents.values().cloned().collect();
        // Sort by creation time, newest first
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    /// List only active (non-terminal) agents.
    pub async fn list_active_agents(&self) -> Vec<BackgroundAgent> {
        let agents = self.agents.read().await;
        agents
            .values()
            .filter(|a| !a.is_terminal())
            .cloned()
            .collect()
    }

    /// Count active (non-terminal) agents.
    pub async fn count_active_agents(&self) -> usize {
        let agents = self.agents.read().await;
        agents.values().filter(|a| !a.is_terminal()).count()
    }

    /// Pause a running background agent.
    pub async fn pause_agent(&self, agent_id: &str) -> anyhow::Result<()> {
        // Send pause command if agent is running
        {
            let handles = self.handles.lock().await;
            if let Some(handle) = handles.get(agent_id) {
                let _ = handle.command_tx.send(AgentCommand::Pause).await;
            }
        }

        // Update status
        {
            let mut agents = self.agents.write().await;
            if let Some(agent) = agents.get_mut(agent_id) {
                agent.pause();
                self.persist_agent(agent)?;
            }
        }

        self.emit_agent_event("background_agent:paused", agent_id, None)?;
        Ok(())
    }

    /// Resume a paused background agent.
    pub async fn resume_agent(&self, agent_id: &str) -> anyhow::Result<()> {
        // Check if agent exists and can be resumed
        {
            let agents = self.agents.read().await;
            let agent = agents
                .get(agent_id)
                .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

            if !agent.can_resume() {
                return Err(anyhow::anyhow!(
                    "Agent {} cannot be resumed (status: {})",
                    agent_id,
                    agent.status
                ));
            }
        }

        // Add back to queue for processing
        {
            let mut queue = self.queue.write().await;
            if !queue.contains(&agent_id.to_string()) {
                queue.push(agent_id.to_string());
            }
        }

        self.emit_agent_event("background_agent:resumed", agent_id, None)?;

        // Trigger queue processing
        self.process_queue().await?;

        Ok(())
    }

    /// Cancel a background agent.
    pub async fn cancel_agent(&self, agent_id: &str) -> anyhow::Result<()> {
        // Send cancel command if agent is running
        {
            let handles = self.handles.lock().await;
            if let Some(handle) = handles.get(agent_id) {
                let _ = handle.command_tx.send(AgentCommand::Cancel).await;
            }
        }

        // Update status
        {
            let mut agents = self.agents.write().await;
            if let Some(agent) = agents.get_mut(agent_id) {
                agent.cancel();
                self.persist_agent(agent)?;
            }
        }

        // Remove from queue
        {
            let mut queue = self.queue.write().await;
            queue.retain(|id| id != agent_id);
        }

        // Remove handle
        {
            let mut handles = self.handles.lock().await;
            handles.remove(agent_id);
        }

        self.emit_agent_event("background_agent:cancelled", agent_id, None)?;
        Ok(())
    }

    /// Take over a background agent (bring it back to the foreground).
    ///
    /// Returns the agent's context so the frontend can restore the conversation.
    pub async fn take_over_agent(
        &self,
        agent_id: &str,
    ) -> anyhow::Result<(BackgroundAgent, BackgroundAgentContext)> {
        // Send takeover command if agent is running
        {
            let handles = self.handles.lock().await;
            if let Some(handle) = handles.get(agent_id) {
                let _ = handle.command_tx.send(AgentCommand::TakeOver).await;
            }
        }

        // Get agent and update status
        let (agent, context) = {
            let mut agents = self.agents.write().await;
            let agent = agents
                .get_mut(agent_id)
                .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

            agent.take_over();
            let context = agent.context.clone();
            self.persist_agent(agent)?;
            (agent.clone(), context)
        };

        // Remove from queue
        {
            let mut queue = self.queue.write().await;
            queue.retain(|id| id != agent_id);
        }

        // Remove handle
        {
            let mut handles = self.handles.lock().await;
            handles.remove(agent_id);
        }

        self.emit_agent_event("background_agent:taken_over", agent_id, None)?;

        Ok((agent, context))
    }

    /// Update agent progress.
    pub async fn update_progress(
        &self,
        agent_id: &str,
        current_step: usize,
        total_steps: usize,
        description: String,
    ) -> anyhow::Result<()> {
        {
            let mut agents = self.agents.write().await;
            if let Some(agent) = agents.get_mut(agent_id) {
                agent.update_progress(current_step, total_steps, description);
                self.persist_agent(agent)?;
            }
        }

        self.emit_agent_event("background_agent:progress", agent_id, None)?;
        Ok(())
    }

    /// Mark an agent as completed with a summary.
    pub async fn complete_agent(
        &self,
        agent_id: &str,
        summary: AgentSummary,
    ) -> anyhow::Result<()> {
        let goal = {
            let mut agents = self.agents.write().await;
            let agent = agents
                .get_mut(agent_id)
                .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

            agent.complete(summary.clone());
            self.persist_agent(agent)?;
            agent.goal.clone()
        };

        // Remove handle
        {
            let mut handles = self.handles.lock().await;
            handles.remove(agent_id);
        }

        // Send notification
        self.send_completion_notification(agent_id, &goal, &summary)
            .await?;

        self.emit_agent_event("background_agent:completed", agent_id, None)?;

        // Process queue to start next agent
        self.process_queue().await?;

        Ok(())
    }

    /// Mark an agent as failed.
    pub async fn fail_agent(&self, agent_id: &str, error: String) -> anyhow::Result<()> {
        let goal = {
            let mut agents = self.agents.write().await;
            let agent = agents
                .get_mut(agent_id)
                .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

            agent.fail(error.clone());
            self.persist_agent(agent)?;
            agent.goal.clone()
        };

        // Remove handle
        {
            let mut handles = self.handles.lock().await;
            handles.remove(agent_id);
        }

        // Send notification
        self.send_failure_notification(agent_id, &goal, &error)
            .await?;

        self.emit_agent_event("background_agent:failed", agent_id, Some(&error))?;

        // Process queue to start next agent
        self.process_queue().await?;

        Ok(())
    }

    /// Clean up old completed agents (older than 24 hours).
    pub async fn cleanup_old_agents(&self) -> anyhow::Result<usize> {
        let cutoff = Utc::now() - chrono::Duration::hours(24);
        let mut removed_count = 0;

        let ids_to_remove: Vec<String> = {
            let agents = self.agents.read().await;
            agents
                .iter()
                .filter(|(_, a)| {
                    a.is_terminal() && a.completed_at.map(|t| t < cutoff).unwrap_or(false)
                })
                .map(|(id, _)| id.clone())
                .collect()
        };

        for id in ids_to_remove {
            {
                let mut agents = self.agents.write().await;
                agents.remove(&id);
            }
            self.delete_agent_from_db(&id)?;
            removed_count += 1;
        }

        if removed_count > 0 {
            tracing::info!("[BackgroundAgent] Cleaned up {} old agents", removed_count);
        }

        Ok(removed_count)
    }

    // === Private helper methods ===

    /// Process the queue, starting agents if capacity allows.
    async fn process_queue(&self) -> anyhow::Result<()> {
        let running_count = {
            let agents = self.agents.read().await;
            agents
                .values()
                .filter(|a| a.status == BackgroundAgentStatus::Running)
                .count()
        };

        if running_count >= MAX_BACKGROUND_AGENTS {
            return Ok(());
        }

        // Get next agent from queue
        let agent_id = {
            let mut queue = self.queue.write().await;
            if queue.is_empty() {
                return Ok(());
            }
            queue.remove(0)
        };

        // Start the agent
        self.start_agent_execution(&agent_id).await?;

        Ok(())
    }

    /// Start execution of an agent.
    async fn start_agent_execution(&self, agent_id: &str) -> anyhow::Result<()> {
        // Update agent status to running
        let agent = {
            let mut agents = self.agents.write().await;
            let agent = agents
                .get_mut(agent_id)
                .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

            agent.start();
            self.persist_agent(agent)?;
            agent.clone()
        };

        // Create command channel
        let (command_tx, command_rx) = mpsc::channel::<AgentCommand>(16);

        // Store handle
        {
            let mut handles = self.handles.lock().await;
            handles.insert(
                agent_id.to_string(),
                AgentHandle {
                    command_tx,
                    agent_id: agent_id.to_string(),
                },
            );
        }

        // Spawn execution task
        let agent_id_owned = agent_id.to_string();
        let agents = Arc::clone(&self.agents);
        let db_conn = Arc::clone(&self.db_conn);
        let app_handle = self.app_handle.clone();
        let timeout_secs = agent.timeout_secs;
        let router = self.router.clone();
        let automation = self.automation.clone();

        tokio::spawn(async move {
            execute_background_agent(
                agent_id_owned,
                agent,
                command_rx,
                agents,
                db_conn,
                app_handle,
                timeout_secs,
                router,
                automation,
            )
            .await
        });

        self.emit_agent_event("background_agent:started", agent_id, None)?;

        Ok(())
    }

    /// Load persisted agents from the database.
    async fn load_persisted_agents(&self) -> anyhow::Result<()> {
        let agents_data = {
            let conn = self
                .db_conn
                .lock()
                .map_err(|e| anyhow::anyhow!("Failed to acquire database lock: {}", e))?;

            let mut stmt = conn.prepare(
                "SELECT id, conversation_id, goal, status, progress_json, summary_json,
                        error, created_at, started_at, completed_at, context_json, priority, timeout_secs
                 FROM background_agents
                 WHERE status NOT IN ('completed', 'failed', 'cancelled', 'taken_over')
                    OR completed_at > datetime('now', '-24 hours')",
            )?;

            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, u8>(11)?,
                    row.get::<_, u64>(12)?,
                ))
            })?;

            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut agents = self.agents.write().await;
        let mut queue = self.queue.write().await;

        for (
            id,
            conversation_id,
            goal,
            status,
            progress_json,
            summary_json,
            error,
            created_at,
            started_at,
            completed_at,
            context_json,
            priority,
            timeout_secs,
        ) in agents_data
        {
            let progress: AgentProgress = serde_json::from_str(&progress_json).unwrap_or_default();
            let summary: Option<AgentSummary> =
                summary_json.and_then(|s| serde_json::from_str(&s).ok());
            let context: BackgroundAgentContext =
                serde_json::from_str(&context_json).unwrap_or_default();

            let agent = BackgroundAgent {
                id: id.clone(),
                conversation_id,
                goal,
                status: BackgroundAgentStatus::from(status.as_str()),
                progress,
                summary,
                error,
                created_at: DateTime::parse_from_rfc3339(&created_at)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                started_at: started_at.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|dt| dt.with_timezone(&Utc))
                        .ok()
                }),
                completed_at: completed_at.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|dt| dt.with_timezone(&Utc))
                        .ok()
                }),
                context,
                priority,
                timeout_secs,
            };

            // Add non-terminal agents back to queue
            if !agent.is_terminal() && agent.status != BackgroundAgentStatus::Running {
                queue.push(id.clone());
            }

            agents.insert(id, agent);
        }

        tracing::info!(
            "[BackgroundAgent] Loaded {} agents from database, {} in queue",
            agents.len(),
            queue.len()
        );

        Ok(())
    }

    /// Resume queued agents after initialization.
    async fn resume_queued_agents(&self) -> anyhow::Result<()> {
        // Reset any "running" agents to "queued" (they were interrupted by restart)
        {
            let mut agents = self.agents.write().await;
            for agent in agents.values_mut() {
                if agent.status == BackgroundAgentStatus::Running {
                    agent.status = BackgroundAgentStatus::Queued;
                    let _ = self.persist_agent(agent);
                }
            }
        }

        // Process the queue
        self.process_queue().await?;

        Ok(())
    }

    /// Persist an agent to the database.
    fn persist_agent(&self, agent: &BackgroundAgent) -> anyhow::Result<()> {
        let conn = self
            .db_conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to acquire database lock: {}", e))?;

        let progress_json = serde_json::to_string(&agent.progress)?;
        let summary_json = agent
            .summary
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let context_json = serde_json::to_string(&agent.context)?;

        conn.execute(
            "INSERT OR REPLACE INTO background_agents
             (id, conversation_id, goal, status, progress_json, summary_json, error,
              created_at, started_at, completed_at, context_json, priority, timeout_secs)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                agent.id,
                agent.conversation_id,
                agent.goal,
                agent.status.to_string(),
                progress_json,
                summary_json,
                agent.error,
                agent.created_at.to_rfc3339(),
                agent.started_at.map(|dt| dt.to_rfc3339()),
                agent.completed_at.map(|dt| dt.to_rfc3339()),
                context_json,
                agent.priority,
                agent.timeout_secs,
            ],
        )?;

        Ok(())
    }

    /// Delete an agent from the database.
    fn delete_agent_from_db(&self, agent_id: &str) -> anyhow::Result<()> {
        let conn = self
            .db_conn
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to acquire database lock: {}", e))?;

        conn.execute("DELETE FROM background_agents WHERE id = ?1", [agent_id])?;

        Ok(())
    }

    /// Emit an event to the frontend.
    fn emit_agent_event(
        &self,
        event: &str,
        agent_id: &str,
        message: Option<&str>,
    ) -> anyhow::Result<()> {
        if let Some(ref app) = self.app_handle {
            let payload = serde_json::json!({
                "agentId": agent_id,
                "message": message,
            });
            app.emit(event, payload)?;
        }
        Ok(())
    }

    /// Send a desktop notification when an agent completes.
    async fn send_completion_notification(
        &self,
        agent_id: &str,
        goal: &str,
        summary: &AgentSummary,
    ) -> anyhow::Result<()> {
        if let Some(ref app) = self.app_handle {
            use tauri_plugin_notification::NotificationExt;

            let title = if summary.goal_achieved {
                "Background Task Completed"
            } else {
                "Background Task Partially Completed"
            };

            let body = if summary.description.is_empty() {
                format!("Task: {}", truncate_string(goal, 100))
            } else {
                truncate_string(&summary.description, 150).to_string()
            };

            if let Err(e) = app.notification().builder().title(title).body(&body).show() {
                tracing::warn!(
                    "[BackgroundAgent] Failed to show completion notification for {}: {}",
                    agent_id,
                    e
                );
            }
        }
        Ok(())
    }

    /// Send a desktop notification when an agent fails.
    async fn send_failure_notification(
        &self,
        agent_id: &str,
        goal: &str,
        error: &str,
    ) -> anyhow::Result<()> {
        if let Some(ref app) = self.app_handle {
            use tauri_plugin_notification::NotificationExt;

            let title = "Background Task Failed";
            let body = format!(
                "Task: {}\nError: {}",
                truncate_string(goal, 60),
                truncate_string(error, 80)
            );

            if let Err(e) = app.notification().builder().title(title).body(&body).show() {
                tracing::warn!(
                    "[BackgroundAgent] Failed to show failure notification for {}: {}",
                    agent_id,
                    e
                );
            }
        }
        Ok(())
    }
}

/// Execute a background agent using the real `AutonomousAgent` LLM+tool loop.
///
/// This function runs in a separate task and handles the actual execution
/// of the agent's goal, responding to commands (pause, cancel, etc.).
/// It prevents OS sleep for the duration of the run via `SleepPrevention`.
async fn execute_background_agent(
    agent_id: String,
    agent: BackgroundAgent,
    mut command_rx: mpsc::Receiver<AgentCommand>,
    agents: Arc<RwLock<HashMap<String, BackgroundAgent>>>,
    db_conn: Arc<std::sync::Mutex<Connection>>,
    app_handle: Option<AppHandle>,
    timeout_secs: u64,
    router: Option<Arc<RwLock<LLMRouter>>>,
    automation: Option<Arc<AutomationService>>,
) {
    tracing::info!(
        "[BackgroundAgent] Starting real execution for agent {}: {}",
        agent_id,
        agent.goal
    );

    // Prevent OS sleep while this agent runs
    let _sleep_guard = crate::sys::power::SleepPrevention::enable();

    // Build AutonomousAgent if router + automation are available
    let autonomous = match (router, automation) {
        (Some(r), Some(a)) => {
            let config = AgentConfig {
                auto_approve: true,
                ..Default::default()
            };
            match AutonomousAgent::new(config, a, r) {
                Ok(mut ag) => {
                    if let Some(ref handle) = app_handle {
                        ag.set_app_handle(handle.clone());
                    }
                    ag
                }
                Err(e) => {
                    tracing::error!(
                        "[BackgroundAgent] Failed to create AutonomousAgent: {}",
                        e
                    );
                    let mut agents_lock = agents.write().await;
                    if let Some(a) = agents_lock.get_mut(&agent_id) {
                        a.fail(format!("Failed to initialize agent: {e}"));
                        let _ = persist_agent_to_db(&db_conn, a);
                    }
                    return;
                }
            }
        }
        _ => {
            tracing::warn!(
                "[BackgroundAgent] No router/automation available for agent {}; \
                 cannot execute real tasks.",
                agent_id
            );
            let mut agents_lock = agents.write().await;
            if let Some(a) = agents_lock.get_mut(&agent_id) {
                a.fail("No LLM router or automation service available".to_string());
                let _ = persist_agent_to_db(&db_conn, a);
            }
            return;
        }
    };

    // Mark Running
    {
        let mut agents_lock = agents.write().await;
        if let Some(a) = agents_lock.get_mut(&agent_id) {
            a.started_at = Some(Utc::now());
            a.status = BackgroundAgentStatus::Running;
            let _ = persist_agent_to_db(&db_conn, a);
        }
    }

    // Notify frontend: agent started
    if let Some(ref app) = app_handle {
        let _ = app.emit(
            "background_agent:started",
            serde_json::json!({ "agentId": agent_id }),
        );
    }

    // Run with timeout and command cancellation
    let timeout_duration = Duration::from_secs(if timeout_secs == 0 {
        86400 // fallback: 24h if zero
    } else {
        timeout_secs
    });

    let goal = agent.goal.clone();
    let result: Result<String, anyhow::Error> = tokio::select! {
        r = autonomous.run_goal(goal.clone()) => r,
        _ = async {
            loop {
                match command_rx.recv().await {
                    Some(AgentCommand::Cancel) | Some(AgentCommand::TakeOver) | None => break,
                    Some(AgentCommand::Pause) => break,
                    Some(AgentCommand::Resume) => continue,
                }
            }
        } => Err(anyhow::anyhow!("Cancelled by command")),
        _ = tokio::time::sleep(timeout_duration) => {
            Err(anyhow::anyhow!("Agent timed out after {} seconds", timeout_secs))
        },
    };

    // Write markdown summary file
    let summary_path = write_agent_summary(&agent_id, &goal, &result);

    // Update final status and emit completion event
    {
        let mut agents_lock = agents.write().await;
        if let Some(a) = agents_lock.get_mut(&agent_id) {
            match &result {
                Ok(_) => {
                    a.status = BackgroundAgentStatus::Completed;
                    a.completed_at = Some(Utc::now());
                    a.summary = Some(AgentSummary {
                        description: format!("Successfully completed: {}", goal),
                        files_changed: summary_path
                            .as_deref()
                            .map(|p| vec![p.to_string()])
                            .unwrap_or_default(),
                        actions_taken: vec![format!("Completed goal: {}", goal)],
                        warnings: Vec::new(),
                        goal_achieved: true,
                    });
                }
                Err(e) => {
                    a.fail(e.to_string());
                }
            }
            let _ = persist_agent_to_db(&db_conn, a);
        }
    }

    // Emit completion or failure event to frontend
    if let Some(ref app) = app_handle {
        if result.is_ok() {
            let _ = app.emit(
                "background_agent:completed",
                serde_json::json!({
                    "agentId": agent_id,
                    "goal": goal,
                    "summaryPath": summary_path,
                }),
            );
        } else {
            let _ = app.emit(
                "background_agent:failed",
                serde_json::json!({
                    "agentId": agent_id,
                    "goal": goal,
                    "error": result.as_ref().err().map(|e| e.to_string()).unwrap_or_default(),
                }),
            );
        }
    }

    tracing::info!(
        "[BackgroundAgent] Agent {} finished: {}",
        agent_id,
        if result.is_ok() { "success" } else { "failed" }
    );
    // _sleep_guard drops here -> OS sleep re-enabled
}

/// Write a markdown summary file to the user's Desktop.
/// Returns the file path if successful.
fn write_agent_summary(
    agent_id: &str,
    goal: &str,
    result: &Result<String, anyhow::Error>,
) -> Option<String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()?;
    let date = Utc::now().format("%Y-%m-%d").to_string();
    let short_id = &agent_id[..agent_id.len().min(8)];
    let filename = format!("agi-run-{}-{}.md", date, short_id);
    let path = std::path::PathBuf::from(&home)
        .join("Desktop")
        .join(&filename);

    let status_str = match result {
        Ok(_) => "Completed".to_string(),
        Err(e) => format!("Failed: {}", e),
    };

    let content = format!(
        "# AGI Workforce Run Report\n\n\
         **Goal:** {}\n\n\
         **Finished:** {}\n\n\
         **Status:** {}\n",
        goal,
        Utc::now().to_rfc3339(),
        status_str,
    );

    match std::fs::write(&path, content) {
        Ok(()) => {
            tracing::info!(
                "[BackgroundAgent] Summary written to {}",
                path.display()
            );
            Some(path.to_string_lossy().to_string())
        }
        Err(e) => {
            tracing::warn!("[BackgroundAgent] Failed to write summary: {}", e);
            None
        }
    }
}

/// Helper function to persist an agent to the database.
fn persist_agent_to_db(
    db_conn: &Arc<std::sync::Mutex<Connection>>,
    agent: &BackgroundAgent,
) -> anyhow::Result<()> {
    let conn = db_conn
        .lock()
        .map_err(|e| anyhow::anyhow!("Failed to acquire database lock: {}", e))?;

    let progress_json = serde_json::to_string(&agent.progress)?;
    let summary_json = agent
        .summary
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let context_json = serde_json::to_string(&agent.context)?;

    conn.execute(
        "INSERT OR REPLACE INTO background_agents
         (id, conversation_id, goal, status, progress_json, summary_json, error,
          created_at, started_at, completed_at, context_json, priority, timeout_secs)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            agent.id,
            agent.conversation_id,
            agent.goal,
            agent.status.to_string(),
            progress_json,
            summary_json,
            agent.error,
            agent.created_at.to_rfc3339(),
            agent.started_at.map(|dt| dt.to_rfc3339()),
            agent.completed_at.map(|dt| dt.to_rfc3339()),
            context_json,
            agent.priority,
            agent.timeout_secs,
        ],
    )?;

    Ok(())
}

/// Truncate a string to a maximum length, adding ellipsis if truncated.
fn truncate_string(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        &s[..max_len.saturating_sub(3)]
    }
}

/// Tauri state wrapper for the background agent manager.
pub struct BackgroundAgentManagerState(pub Arc<tokio::sync::RwLock<BackgroundAgentManager>>);

impl BackgroundAgentManagerState {
    /// Create a new state wrapper.
    pub fn new(manager: BackgroundAgentManager) -> Self {
        Self(Arc::new(tokio::sync::RwLock::new(manager)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_manager() -> BackgroundAgentManager {
        // Keep temp_dir alive for the duration of the test
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let conn = Connection::open(&db_path).unwrap();

        // Leak the temp_dir to keep it alive for the test
        // This is safe in tests as the test runner will clean up eventually
        std::mem::forget(temp_dir);

        // Create the table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS background_agents (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                goal TEXT NOT NULL,
                status TEXT NOT NULL,
                progress_json TEXT NOT NULL,
                summary_json TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                context_json TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                timeout_secs INTEGER NOT NULL DEFAULT 300
            )",
            [],
        )
        .unwrap();

        BackgroundAgentManager::new(Arc::new(std::sync::Mutex::new(conn)), None, None)
    }

    #[test]
    fn test_background_agent_creation() {
        let context = BackgroundAgentContext::default();
        let agent = BackgroundAgent::new(
            "conv_123".to_string(),
            "Write a test".to_string(),
            context,
            5,
        );

        assert_eq!(agent.conversation_id, "conv_123");
        assert_eq!(agent.goal, "Write a test");
        assert_eq!(agent.priority, 5);
        assert_eq!(agent.status, BackgroundAgentStatus::Queued);
        assert!(!agent.is_terminal());
        assert!(agent.can_resume());
    }

    #[test]
    fn test_agent_status_transitions() {
        let context = BackgroundAgentContext::default();
        let mut agent =
            BackgroundAgent::new("conv_123".to_string(), "Test".to_string(), context, 0);

        // Start
        agent.start();
        assert_eq!(agent.status, BackgroundAgentStatus::Running);
        assert!(agent.started_at.is_some());

        // Pause
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Paused);

        // Complete
        let summary = AgentSummary::default();
        agent.complete(summary);
        assert_eq!(agent.status, BackgroundAgentStatus::Completed);
        assert!(agent.is_terminal());
    }

    #[test]
    fn test_progress_update() {
        let context = BackgroundAgentContext::default();
        let mut agent =
            BackgroundAgent::new("conv_123".to_string(), "Test".to_string(), context, 0);

        agent.start();
        agent.update_progress(3, 10, "Step 3 of 10".to_string());

        assert_eq!(agent.progress.current_step, 3);
        assert_eq!(agent.progress.total_steps, 10);
        assert_eq!(agent.progress.percentage, 30);
    }

    #[tokio::test]
    async fn test_manager_push_and_get() {
        let manager = create_test_manager();
        let context = BackgroundAgentContext::default();

        let agent_id = manager
            .push_to_background(
                "conv_123".to_string(),
                "Write tests".to_string(),
                context,
                5,
            )
            .await
            .unwrap();

        let agent = manager.get_agent(&agent_id).await.unwrap();
        assert_eq!(agent.goal, "Write tests");
        assert_eq!(agent.priority, 5);
    }

    #[tokio::test]
    async fn test_manager_list_agents() {
        let manager = create_test_manager();

        for i in 0..3 {
            let context = BackgroundAgentContext::default();
            manager
                .push_to_background(
                    format!("conv_{}", i),
                    format!("Task {}", i),
                    context,
                    i as u8,
                )
                .await
                .unwrap();
        }

        let agents = manager.list_agents().await;
        assert_eq!(agents.len(), 3);
    }

    #[tokio::test]
    async fn test_manager_max_agents() {
        let manager = create_test_manager();

        // Push MAX_BACKGROUND_AGENTS agents
        for i in 0..MAX_BACKGROUND_AGENTS {
            let context = BackgroundAgentContext::default();
            manager
                .push_to_background(format!("conv_{}", i), format!("Task {}", i), context, 0)
                .await
                .unwrap();
        }

        // Try to push one more - should fail
        let context = BackgroundAgentContext::default();
        let result = manager
            .push_to_background(
                "conv_extra".to_string(),
                "Extra task".to_string(),
                context,
                0,
            )
            .await;

        assert!(result.is_err());
    }
}
