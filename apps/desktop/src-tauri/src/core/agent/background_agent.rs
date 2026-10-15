//! Background Agents System for AGI Workforce
//!
//! Agents that work on a goal while the user keeps chatting. They are started
//! by the model's background-agent tool and by automation triggers; the user is
//! notified on completion and can pause, resume or cancel one.
//!
//! # Features
//!
//! - Isolated execution context per background agent
//! - Progress tracking and status monitoring
//! - Desktop notifications on completion
//! - Pause, resume and cancel
//! - Persistence across app restarts
//! - Up to 8 parallel background agents
//!
//! # Usage
//!
//! ```ignore
//! // List all background agents
//! await invoke('background_agent_list');
//!
//! // Resume a paused agent
//! await invoke('background_agent_resume', { agentId: '...' });
//! ```

use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

use crate::core::agent::autonomous::{
    AutonomousAgent, RunControl, RunEnd, RunReport, StepProgress, StopReason,
};
use crate::core::agent::AgentConfig;
use crate::core::llm::LLMRouter;
use crate::sys::commands::notification_center::{
    deliver_notification, CreateNotificationInput, NotificationCenterState, NotificationPriority,
    NotificationRoute, NotificationType,
};
use agiworkforce_model_registry::TrustMode;

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
    /// A run an earlier build let the person take over. Nothing sets it now;
    /// it stays because the table's status check and stored runs name it.
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
    /// Whether the run is parked until the person approves its start.
    #[serde(default)]
    pub awaiting_approval: bool,
}

impl Default for AgentProgress {
    fn default() -> Self {
        Self {
            current_step: 0,
            total_steps: 1,
            current_step_description: "Starting...".to_string(),
            percentage: 0,
            elapsed_secs: 0,
            awaiting_approval: false,
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
    /// The boundary the app was in when the run was created. The run's
    /// model calls stay inside it however the app is switched afterwards.
    pub boundary: Option<TrustMode>,
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

    /// Whether this run is parked for approval and has not been started.
    pub fn is_parked(&self) -> bool {
        self.status == BackgroundAgentStatus::Paused && self.progress.awaiting_approval
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
}

fn mark_interrupted(agent: &mut BackgroundAgent) {
    agent.status = BackgroundAgentStatus::Paused;
    agent.progress.current_step_description =
        "Interrupted when the app closed. Resume to run it again.".to_string();
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
    /// Stop the run because the app is closing.
    Interrupt,
}

/// Handle for controlling a running background agent.
pub struct AgentHandle {
    /// Channel to send commands to the agent.
    pub command_tx: mpsc::Sender<AgentCommand>,
    /// The agent ID.
    pub agent_id: String,
    /// The task driving the run; it ends when the run has ended.
    pub done: tokio::task::JoinHandle<()>,
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
    // std::sync::Mutex wraps a rusqlite Connection (not Send-safe with tokio::sync::Mutex).
    // DB reads in load_persisted_agents use spawn_blocking. Short writes (persist_agent)
    // are sync to allow calling under async RwLock guards.
    db_conn: Arc<std::sync::Mutex<Connection>>,
    /// Tauri app handle for notifications and events.
    app_handle: Option<AppHandle>,
    /// Queue of agents waiting to run.
    queue: Arc<RwLock<Vec<String>>>,
    /// LLM router for the autonomous agent (None if not yet available).
    router: Option<Arc<RwLock<LLMRouter>>>,
}

impl BackgroundAgentManager {
    /// Create a new background agent manager.
    pub fn new(
        db_conn: Arc<std::sync::Mutex<Connection>>,
        router: Option<Arc<RwLock<LLMRouter>>>,
    ) -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            handles: Arc::new(Mutex::new(HashMap::new())),
            db_conn,
            app_handle: None,
            queue: Arc::new(RwLock::new(Vec::new())),
            router,
        }
    }

    /// Set the Tauri app handle for notifications.
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Initialize the manager, loading persisted agents from the database.
    pub async fn initialize(&self) -> anyhow::Result<()> {
        self.prune_finished_runs().await;
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
        let running_count = self.occupied_places().await;
        if running_count >= MAX_BACKGROUND_AGENTS {
            return Err(anyhow::anyhow!(
                "Maximum number of background agents ({}) reached. Please wait for one to complete or cancel an existing agent.",
                MAX_BACKGROUND_AGENTS
            ));
        }

        let context = in_run_boundary(context, crate::sys::account::app_mode::is_cloud_app_mode())
            .map_err(|refusal| anyhow::anyhow!(refusal))?;
        let agent = BackgroundAgent::new(conversation_id, goal.clone(), context, priority);
        let agent_id = agent.id.clone();

        // Store in memory
        {
            let mut agents = self.agents.write().await;
            agents.insert(agent_id.clone(), agent.clone());
        }

        // Snapshot agent priorities while holding only the agents read-lock.
        // This avoids a deadlock: we must never hold queue(W) while acquiring
        // agents(R), because other code paths acquire agents first then queue
        // (lock-order inversion -> deadlock under async contention).
        let priority_snapshot: HashMap<String, u8> = {
            let agents = self.agents.read().await;
            agents
                .iter()
                .map(|(id, agent)| (id.clone(), agent.priority))
                .collect()
        };
        // agents read-lock is dropped here

        // Now acquire queue write-lock (no other lock held).
        {
            let mut queue = self.queue.write().await;
            queue.push(agent_id.clone());
            // Sort by priority (higher priority first) using the snapshot
            queue.sort_by(|a, b| {
                let a_priority = priority_snapshot.get(a).copied().unwrap_or(0);
                let b_priority = priority_snapshot.get(b).copied().unwrap_or(0);
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

    /// Park a run, paused, until the user resumes it, and tell the user it
    /// is waiting.
    ///
    /// A caller that needs the user's consent before a run starts parks the
    /// run here instead of queueing it. A parked run takes none of the
    /// running places. Its trigger counts it as its live run, so the trigger
    /// starts nothing else until this one is resumed or cancelled.
    pub async fn push_awaiting_approval(
        &self,
        conversation_id: String,
        goal: String,
        context: BackgroundAgentContext,
        priority: u8,
    ) -> anyhow::Result<String> {
        let context = in_run_boundary(context, crate::sys::account::app_mode::is_cloud_app_mode())
            .map_err(|refusal| anyhow::anyhow!(refusal))?;
        let mut agent = BackgroundAgent::new(conversation_id, goal, context, priority);
        agent.status = BackgroundAgentStatus::Paused;
        agent.progress.awaiting_approval = true;
        agent.progress.current_step_description = "Waiting for your approval to start".to_string();
        let agent_id = agent.id.clone();

        self.agents
            .write()
            .await
            .insert(agent_id.clone(), agent.clone());
        self.persist_agent(&agent)?;
        self.emit_agent_event("background_agent:created", &agent_id, None)?;
        self.emit_agent_event("background_agent:paused", &agent_id, None)?;
        if let Some(ref app) = self.app_handle {
            deliver_agent_notice(
                app,
                &agent_id,
                awaiting_approval_notice(&agent_id, &agent.goal),
            )
            .await;
        }
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

    /// Runs that take one of the `MAX_BACKGROUND_AGENTS` places: every run
    /// that has not ended, except those parked for approval.
    async fn occupied_places(&self) -> usize {
        let agents = self.agents.read().await;
        agents
            .values()
            .filter(|agent| !agent.is_terminal() && !agent.is_parked())
            .count()
    }

    /// Pause a running background agent. The run stays alive, holds at its
    /// next step, and goes on from there when resumed.
    pub async fn pause_agent(&self, agent_id: &str) -> anyhow::Result<()> {
        {
            let handles = self.handles.lock().await;
            if let Some(handle) = handles.get(agent_id) {
                let _ = handle.command_tx.send(AgentCommand::Pause).await;
            }
        }

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

    /// Resume a paused background agent. A run paused while it was running
    /// goes on from the step it stopped at; a run that was parked for
    /// approval, or restored after the app closed, starts from its first step.
    pub async fn resume_agent(&self, agent_id: &str) -> anyhow::Result<()> {
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

        let live_run = {
            let handles = self.handles.lock().await;
            match handles.get(agent_id) {
                Some(handle) => handle.command_tx.send(AgentCommand::Resume).await.is_ok(),
                None => false,
            }
        };

        if live_run {
            let mut agents = self.agents.write().await;
            if let Some(agent) = agents.get_mut(agent_id) {
                agent.status = BackgroundAgentStatus::Running;
                self.persist_agent(agent)?;
            }
        } else {
            {
                let mut agents = self.agents.write().await;
                if let Some(agent) = agents.get_mut(agent_id) {
                    agent.progress.awaiting_approval = false;
                    agent.progress.current_step_description = "Starting...".to_string();
                }
            }
            let mut queue = self.queue.write().await;
            if !queue.contains(&agent_id.to_string()) {
                queue.push(agent_id.to_string());
            }
        }

        self.emit_agent_event("background_agent:resumed", agent_id, None)?;

        if !live_run {
            self.process_queue().await?;
        }

        Ok(())
    }

    /// Tells a live run to stop and waits, for a bounded time, until the task
    /// driving it has ended, so the state reported next is true. A task that
    /// outlasts the wait is dropped, which ends everything it was doing.
    async fn stop_run(&self, agent_id: &str, command: AgentCommand) -> bool {
        let handle = self.handles.lock().await.remove(agent_id);
        let Some(mut handle) = handle else {
            return false;
        };
        let _ = handle.command_tx.send(command).await;
        if tokio::time::timeout(RUN_STOP_GRACE * 2, &mut handle.done)
            .await
            .is_err()
        {
            tracing::warn!(
                "[BackgroundAgent] Agent {} did not stop in time and was dropped",
                agent_id
            );
            handle.done.abort();
            let _ = handle.done.await;
        }
        true
    }

    /// Stops every live run because the app is closing and leaves each one
    /// that was running marked as interrupted, to be resumed next launch.
    pub async fn interrupt_all_runs(&self) {
        let live: Vec<String> = self.handles.lock().await.keys().cloned().collect();
        for agent_id in live {
            self.stop_run(&agent_id, AgentCommand::Interrupt).await;
            let mut agents = self.agents.write().await;
            if let Some(agent) = agents.get_mut(&agent_id) {
                if agent.status == BackgroundAgentStatus::Running {
                    mark_interrupted(agent);
                }
                if let Err(error) = self.persist_agent(agent) {
                    tracing::warn!(
                        "[BackgroundAgent] Failed to save interrupted agent {}: {}",
                        agent_id,
                        error
                    );
                }
            }
        }
    }

    /// Cancel a background agent. A live run has ended before this returns.
    pub async fn cancel_agent(&self, agent_id: &str) -> anyhow::Result<()> {
        self.stop_run(agent_id, AgentCommand::Cancel).await;

        {
            let mut agents = self.agents.write().await;
            if let Some(agent) = agents.get_mut(agent_id) {
                if !agent.is_terminal() {
                    agent.cancel();
                    self.persist_agent(agent)?;
                }
            }
        }

        {
            let mut queue = self.queue.write().await;
            queue.retain(|id| id != agent_id);
        }

        self.emit_agent_event("background_agent:cancelled", agent_id, None)?;
        Ok(())
    }

    /// Drops finished runs past their keep: from the table, where a run's
    /// goal can hold a large event body, and from memory.
    async fn prune_finished_runs(&self) {
        prune_finished(&self.agents, &self.db_conn).await;
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

        let (command_tx, command_rx) = mpsc::channel::<AgentCommand>(16);

        let agent_id_owned = agent_id.to_string();
        let agents = Arc::clone(&self.agents);
        let db_conn = Arc::clone(&self.db_conn);
        let app_handle = self.app_handle.clone();
        let timeout_secs = agent.timeout_secs;
        let router = self.router.clone();
        let handles_clone = Arc::clone(&self.handles);

        // The run removes its own handle when it ends, so the handle goes in
        // while the lock is held: a run that ends at once waits for it.
        {
            let mut handles = self.handles.lock().await;
            let done = tokio::spawn(async move {
                execute_background_agent(
                    agent_id_owned,
                    agent,
                    command_rx,
                    agents,
                    db_conn,
                    app_handle,
                    timeout_secs,
                    router,
                    handles_clone,
                )
                .await
            });
            handles.insert(
                agent_id.to_string(),
                AgentHandle {
                    command_tx,
                    agent_id: agent_id.to_string(),
                    done,
                },
            );
        }

        self.emit_agent_event("background_agent:started", agent_id, None)?;

        Ok(())
    }

    /// Load persisted agents from the database.
    async fn load_persisted_agents(&self) -> anyhow::Result<()> {
        let agents_data = {
            let db_conn = self.db_conn.clone();
            tokio::task::spawn_blocking(move || {
                let conn = db_conn
                    .lock()
                    .map_err(|e| anyhow::anyhow!("Failed to acquire database lock: {}", e))?;

                let mut stmt = conn.prepare(
                    "SELECT id, conversation_id, goal, status, progress_json, summary_json,
                            error, created_at, started_at, completed_at, context_json, priority, timeout_secs
                     FROM background_agents
                     WHERE status NOT IN ('completed', 'failed', 'cancelled', 'taken_over')
                        OR completed_at > ?1",
                )?;
                let shown_since = (Utc::now() - chrono::Duration::hours(24)).to_rfc3339();

                let rows = stmt.query_map([shown_since], |row| {
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
                        row.get::<_, i64>(12)? as u64,
                    ))
                })?;

                rows.collect::<Result<Vec<_>, _>>()
                    .map_err(|e| anyhow::anyhow!("Failed to load agents: {}", e))
            })
            .await??
        };

        // Collect IDs that need to be queued while populating the agents map.
        // Hold agents(W) and queue(W) in separate scopes to prevent holding
        // both locks simultaneously (consistent lock ordering: never nest).
        let mut queued_ids: Vec<String> = Vec::new();
        let agents_count;

        {
            let mut agents = self.agents.write().await;

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
                let progress: AgentProgress =
                    serde_json::from_str(&progress_json).unwrap_or_default();
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

                if agent.status == BackgroundAgentStatus::Queued {
                    queued_ids.push(id.clone());
                }

                agents.insert(id, agent);
            }

            agents_count = agents.len();
        }
        // agents write-lock dropped here

        {
            let mut queue = self.queue.write().await;
            for id in &queued_ids {
                queue.push(id.clone());
            }
        }
        // queue write-lock dropped here

        tracing::info!(
            "[BackgroundAgent] Loaded {} agents from database, {} in queue",
            agents_count,
            queued_ids.len()
        );

        Ok(())
    }

    /// Settles the runs left over from the last launch, then starts what is
    /// queued.
    ///
    /// A run that was going when the app closed has no task behind it now
    /// and lost its place. One a person started is paused, to run again from
    /// its first step if they resume it. One a trigger started is ended: the
    /// trigger counts a run that has not ended as still going and would never
    /// fire again, and its next firing starts a fresh run anyway.
    async fn resume_queued_agents(&self) -> anyhow::Result<()> {
        let mut interrupted = Vec::new();
        {
            let mut agents = self.agents.write().await;
            for agent in agents.values_mut() {
                let Some(notice) = settle_restored_run(agent) else {
                    continue;
                };
                let _ = self.persist_agent(agent);
                interrupted.push((agent.id.clone(), notice));
            }
        }
        for (agent_id, notice) in interrupted {
            let _ = self.emit_agent_event("background_agent:interrupted", &agent_id, None);
            if let Some(ref app) = self.app_handle {
                tokio::spawn(deliver_agent_notice_when_ready(
                    app.clone(),
                    agent_id,
                    notice,
                ));
            }
        }

        self.process_queue().await?;

        Ok(())
    }

    /// Persist an agent to the database.
    ///
    /// Uses `spawn_blocking` to move the `std::sync::Mutex` lock off the async
    /// executor thread. The `std::sync::Mutex` is required because `rusqlite::Connection`
    /// is `!Send` and cannot be held across `.await` points.
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
                agent.timeout_secs as i64,
            ],
        )?;

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
}

const OPEN_BACKGROUND_AGENT_LABEL: &str = "Open background agent";

/// Long enough to carry a refusal or a missing-permission sentence whole.
const FAILURE_REASON_CHARS: usize = 240;

fn completion_notice(
    agent_id: &str,
    goal: &str,
    summary: &AgentSummary,
) -> CreateNotificationInput {
    let title = if summary.goal_achieved {
        "Background Task Completed"
    } else {
        "Background Task Partially Completed"
    };
    let message = if summary.description.is_empty() {
        format!("Task: {}", truncate_string(goal, 100))
    } else {
        truncate_string(&summary.description, 150).to_string()
    };
    agent_notice(
        agent_id,
        title,
        message,
        NotificationType::TaskComplete,
        NotificationPriority::Normal,
    )
}

fn failure_notice(agent_id: &str, goal: &str, error: &str) -> CreateNotificationInput {
    agent_notice(
        agent_id,
        "Background Task Failed",
        format!(
            "Task: {}\nError: {}",
            truncate_string(goal, 60),
            truncate_string(error, FAILURE_REASON_CHARS)
        ),
        NotificationType::TaskFailed,
        NotificationPriority::High,
    )
}

/// Whether the panel that answers this is already on screen is not known
/// here, so a parked run always raises it.
fn awaiting_approval_notice(agent_id: &str, goal: &str) -> CreateNotificationInput {
    agent_notice(
        agent_id,
        "Background Task Waiting for You",
        format!(
            "Task: {}\nIt will not start until you resume it. While it waits its trigger starts nothing else: later firings are counted on the trigger and do not run. Open it to start or cancel it.",
            truncate_string(goal, 60)
        ),
        NotificationType::AgentActivity,
        NotificationPriority::High,
    )
}

pub(crate) const TRIGGER_RUN_PREFIX: &str = "trigger:";

const INTERRUPTED_TRIGGER_RUN: &str =
    "Interrupted when the app closed before it finished. Its trigger starts a new run the next time it fires.";

/// What becomes of a run found unfinished at launch, with the notice to
/// raise for it, or `None` for a run that needs nothing: one that is queued,
/// finished, parked for approval, or paused by a person who can resume it.
fn settle_restored_run(agent: &mut BackgroundAgent) -> Option<CreateNotificationInput> {
    if agent.is_terminal() || agent.status == BackgroundAgentStatus::Queued || agent.is_parked() {
        return None;
    }
    if agent.conversation_id.starts_with(TRIGGER_RUN_PREFIX) {
        agent.fail(INTERRUPTED_TRIGGER_RUN.to_string());
        return Some(interrupted_trigger_notice(&agent.id, &agent.goal));
    }
    if agent.status == BackgroundAgentStatus::Running {
        mark_interrupted(agent);
        return Some(interrupted_notice(&agent.id, &agent.goal));
    }
    None
}

fn interrupted_trigger_notice(agent_id: &str, goal: &str) -> CreateNotificationInput {
    agent_notice(
        agent_id,
        "Background Task Interrupted",
        format!(
            "Task: {}\nThe app closed while it was running. Its trigger starts a new run the next time it fires.",
            truncate_string(goal, 60)
        ),
        NotificationType::AgentActivity,
        NotificationPriority::Normal,
    )
}

fn interrupted_notice(agent_id: &str, goal: &str) -> CreateNotificationInput {
    agent_notice(
        agent_id,
        "Background Task Interrupted",
        format!(
            "Task: {}\nThe app closed while it was running. Open it and resume to run it again from its first step.",
            truncate_string(goal, 60)
        ),
        NotificationType::AgentActivity,
        NotificationPriority::Normal,
    )
}

fn agent_notice(
    agent_id: &str,
    title: &str,
    message: String,
    notification_type: NotificationType,
    priority: NotificationPriority,
) -> CreateNotificationInput {
    CreateNotificationInput {
        title: title.to_string(),
        message,
        notification_type,
        priority,
        action_url: Some(NotificationRoute::BackgroundAgent(agent_id).action_url()),
        action_label: Some(OPEN_BACKGROUND_AGENT_LABEL.to_string()),
        icon: None,
        metadata: Some(serde_json::json!({ "backgroundAgentId": agent_id })),
        dismissible: true,
        expires_at: None,
    }
}

/// Raises a background agent's finished or failed notice through the
/// notification center, so the user's settings apply, the notice is kept in the
/// list, and a click selects the agent. This is the only place a background
/// agent notifies from; the renderer raises none of its own.
async fn deliver_agent_notice(app: &AppHandle, agent_id: &str, input: CreateNotificationInput) {
    let Some(state) = app.try_state::<NotificationCenterState>() else {
        return;
    };
    if let Err(reason) = deliver_notification(app, &state, input).await {
        tracing::info!(
            "[BackgroundAgent] Notification for agent {} not delivered: {}",
            agent_id,
            reason
        );
    }
}

const NOTICE_CENTER_WAIT: Duration = Duration::from_millis(250);
const NOTICE_CENTER_ATTEMPTS: usize = 40;

/// Startup restores agents before the notification center is managed, so a
/// notice raised from there waits for it instead of being dropped.
async fn deliver_agent_notice_when_ready(
    app: AppHandle,
    agent_id: String,
    input: CreateNotificationInput,
) {
    for _ in 0..NOTICE_CENTER_ATTEMPTS {
        if app.try_state::<NotificationCenterState>().is_some() {
            break;
        }
        tokio::time::sleep(NOTICE_CENTER_WAIT).await;
    }
    deliver_agent_notice(&app, &agent_id, input).await;
}

/// How long a run is given to wind down after it is told to stop before the
/// task driving it is dropped outright.
const RUN_STOP_GRACE: Duration = Duration::from_secs(10);

/// A run's time limit, counted only while the run is not paused.
struct RunClock {
    remaining: Duration,
    running_since: Option<tokio::time::Instant>,
}

impl RunClock {
    fn new(limit: Duration) -> Self {
        Self {
            remaining: limit,
            running_since: Some(tokio::time::Instant::now()),
        }
    }

    fn pause(&mut self) {
        if let Some(since) = self.running_since.take() {
            self.remaining = self.remaining.saturating_sub(since.elapsed());
        }
    }

    fn resume(&mut self) {
        if self.running_since.is_none() {
            self.running_since = Some(tokio::time::Instant::now());
        }
    }

    /// Resolves when the limit is used up, and never while paused.
    async fn expired(&self) {
        match self.running_since {
            Some(since) => tokio::time::sleep_until(since + self.remaining).await,
            None => std::future::pending().await,
        }
    }
}

async fn reached(deadline: Option<tokio::time::Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

/// Runs one background agent to its end and reports that end once.
///
/// The run is one future driven from here, not a task of its own, so a stop
/// leaves nothing running behind it. Commands reach the run through
/// `control`: a pause holds it at the next step and a resume lets it go on
/// from there, and cancel, app quit and the time limit stop it.
/// It prevents OS sleep while the run is not paused.
async fn execute_background_agent(
    agent_id: String,
    agent: BackgroundAgent,
    mut command_rx: mpsc::Receiver<AgentCommand>,
    agents: Arc<RwLock<HashMap<String, BackgroundAgent>>>,
    db_conn: Arc<std::sync::Mutex<Connection>>,
    app_handle: Option<AppHandle>,
    timeout_secs: u64,
    router: Option<Arc<RwLock<LLMRouter>>>,
    handles: Arc<Mutex<HashMap<String, AgentHandle>>>,
) {
    tracing::info!(
        "[BackgroundAgent] Starting real execution for agent {}: {}",
        agent_id,
        agent.goal
    );

    let goal = agent.goal.clone();
    let planned_goal = goal_with_instructions(&goal, agent.context.custom_instructions.as_deref());
    let prepared = prepare_run(&agent, router, app_handle.as_ref()).await;
    let outcome = match prepared {
        Err(reason) => {
            tracing::warn!(
                "[BackgroundAgent] Agent {} could not start: {}",
                agent_id,
                reason
            );
            RunOutcome::CouldNotStart(reason)
        }
        Ok((autonomous, managed)) => {
            let control = RunControl::new();
            let mut clock = RunClock::new(Duration::from_secs(if timeout_secs == 0 {
                DEFAULT_AGENT_TIMEOUT_SECS
            } else {
                timeout_secs
            }));
            let mut sleep_guard = Some(crate::sys::power::SleepPrevention::enable());
            let mut commands_open = true;
            let mut stop_deadline = None;
            let mut progress = control.progress();
            let mut progress_open = true;

            let run = crate::sys::account::scope_managed_auth_boundary(
                managed,
                autonomous.run_goal(planned_goal, &control),
            );
            tokio::pin!(run);
            loop {
                tokio::select! {
                    end = &mut run => break outcome_of(end),
                    command = command_rx.recv(), if commands_open => match command {
                        Some(AgentCommand::Pause) => {
                            control.pause();
                            clock.pause();
                            sleep_guard = None;
                        }
                        Some(AgentCommand::Resume) => {
                            control.resume();
                            clock.resume();
                            if sleep_guard.is_none() {
                                sleep_guard = Some(crate::sys::power::SleepPrevention::enable());
                            }
                        }
                        Some(AgentCommand::Interrupt) => control.stop(StopReason::AppClosing),
                        Some(AgentCommand::Cancel) => control.stop(StopReason::Cancelled),
                        None => {
                            commands_open = false;
                            control.stop(StopReason::Cancelled);
                        }
                    },
                    changed = progress.changed(), if progress_open => {
                        progress_open = changed.is_ok();
                        let latest = progress.borrow_and_update().clone();
                        if let Some(step) = latest {
                            record_progress(&agents, &db_conn, app_handle.as_ref(), &agent_id, step)
                                .await;
                        }
                    }
                    _ = clock.expired(), if control.stop_reason().is_none() => {
                        control.stop(StopReason::TimeLimit);
                    }
                    _ = reached(stop_deadline) => {
                        break stopped_outcome(
                            control.stop_reason().unwrap_or(StopReason::Cancelled),
                        );
                    }
                }
                if stop_deadline.is_none() && control.stop_reason().is_some() {
                    stop_deadline = Some(tokio::time::Instant::now() + RUN_STOP_GRACE);
                }
            }
        }
    };

    // Every run ends here, whether it finished, failed, was stopped or never
    // started: one record update, one event and at most one notice. A run
    // the manager cancelled or interrupted is recorded and
    // announced by the manager, once this function has returned.
    let failure = failure_reason(&outcome, timeout_secs);
    {
        let mut agents_lock = agents.write().await;
        if let Some(a) = agents_lock.get_mut(&agent_id) {
            let recorded = match &outcome {
                RunOutcome::Completed(report) => {
                    a.status = BackgroundAgentStatus::Completed;
                    a.completed_at = Some(Utc::now());
                    a.summary = Some(summary_of(&goal, report));
                    true
                }
                RunOutcome::Failed(_) | RunOutcome::TimedOut | RunOutcome::CouldNotStart(_) => {
                    a.fail(failure.clone().unwrap_or_default());
                    true
                }
                RunOutcome::Cancelled | RunOutcome::Interrupted => false,
            };
            if recorded {
                save_in_order(&db_conn, a).await;
            }
        }
    }
    prune_finished(&agents, &db_conn).await;

    if let Some(ref app) = app_handle {
        let emit_result = match &outcome {
            RunOutcome::Completed(report) => app.emit(
                "background_agent:completed",
                serde_json::json!({
                    "agentId": agent_id,
                    "goal": goal,
                    "summary": report.summary,
                }),
            ),
            RunOutcome::Failed(_) | RunOutcome::TimedOut | RunOutcome::CouldNotStart(_) => app
                .emit(
                    "background_agent:failed",
                    serde_json::json!({
                        "agentId": agent_id,
                        "goal": goal,
                        "error": failure,
                        "message": failure,
                    }),
                ),
            RunOutcome::Cancelled | RunOutcome::Interrupted => Ok(()),
        };
        if let Err(e) = emit_result {
            tracing::warn!("Failed to emit background_agent event: {}", e);
        }

        if let Some(notice) = ending_notice(&agent_id, &goal, &outcome, timeout_secs) {
            deliver_agent_notice(app, &agent_id, notice).await;
        }
    }

    // Clean up the handle entry so dead handles do not accumulate.
    {
        let mut handles_lock = handles.lock().await;
        handles_lock.remove(&agent_id);
    }

    tracing::info!(
        "[BackgroundAgent] Agent {} finished: {}",
        agent_id,
        match &outcome {
            RunOutcome::Completed(_) => "completed",
            RunOutcome::Failed(_) => "failed",
            RunOutcome::Cancelled => "cancelled",
            RunOutcome::TimedOut => "timed_out",
            RunOutcome::Interrupted => "interrupted",
            RunOutcome::CouldNotStart(_) => "could_not_start",
        }
    );
}

/// Saves a run's record while the record's lock is held and waits for the
/// write. Every writer of a run takes that lock, so its writes reach the
/// table in the order they were made and a late progress write cannot land
/// on top of the run's ending.
async fn save_in_order(db_conn: &Arc<std::sync::Mutex<Connection>>, agent: &BackgroundAgent) {
    let db = db_conn.clone();
    let snapshot = agent.clone();
    let saved = tokio::task::spawn_blocking(move || persist_agent_to_db(&db, &snapshot)).await;
    match saved {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            tracing::warn!(
                "[BackgroundAgent] Failed to save agent {}: {}",
                agent.id,
                error
            )
        }
        Err(error) => {
            tracing::warn!(
                "[BackgroundAgent] Saving agent {} did not finish: {}",
                agent.id,
                error
            )
        }
    }
}

/// Puts the step a run has reached into its record and tells the panel.
async fn record_progress(
    agents: &Arc<RwLock<HashMap<String, BackgroundAgent>>>,
    db_conn: &Arc<std::sync::Mutex<Connection>>,
    app_handle: Option<&AppHandle>,
    agent_id: &str,
    step: StepProgress,
) {
    {
        let mut agents_lock = agents.write().await;
        let Some(agent) = agents_lock.get_mut(agent_id) else {
            return;
        };
        agent.update_progress(step.step, step.total, step.description);
        save_in_order(db_conn, agent).await;
    }
    if let Some(app) = app_handle {
        if let Err(e) = app.emit(
            "background_agent:progress",
            serde_json::json!({ "agentId": agent_id }),
        ) {
            tracing::warn!("Failed to emit background_agent:progress: {}", e);
        }
    }
}

/// How long a finished run is kept, and how many are kept at most.
const FINISHED_RUN_KEEP_DAYS: i64 = 30;
const FINISHED_RUNS_KEPT: usize = 100;

/// The finished runs past their keep: older than the age limit, or beyond the
/// newest `FINISHED_RUNS_KEPT`. Deleted from the table and returned by id.
fn delete_finished_past_keep(
    conn: &Connection,
    now: DateTime<Utc>,
) -> rusqlite::Result<Vec<String>> {
    const FINISHED: &str = "status IN ('completed', 'failed', 'cancelled', 'taken_over')";
    let cutoff = (now - chrono::Duration::days(FINISHED_RUN_KEEP_DAYS)).to_rfc3339();
    let mut statement = conn.prepare(&format!(
        "SELECT id FROM background_agents
         WHERE {FINISHED}
           AND (completed_at IS NULL OR completed_at < ?1
                OR id NOT IN (
                    SELECT id FROM background_agents
                    WHERE {FINISHED}
                    ORDER BY completed_at DESC
                    LIMIT ?2))"
    ))?;
    let past_keep = statement
        .query_map(
            rusqlite::params![cutoff, FINISHED_RUNS_KEPT as i64],
            |row| row.get::<_, String>(0),
        )?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    for id in &past_keep {
        conn.execute("DELETE FROM background_agents WHERE id = ?1", [id])?;
    }
    Ok(past_keep)
}

async fn prune_finished(
    agents: &Arc<RwLock<HashMap<String, BackgroundAgent>>>,
    db_conn: &Arc<std::sync::Mutex<Connection>>,
) {
    let db = db_conn.clone();
    let pruned = tokio::task::spawn_blocking(move || {
        let conn = db
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to acquire database lock: {}", e))?;
        delete_finished_past_keep(&conn, Utc::now()).map_err(anyhow::Error::from)
    })
    .await;
    match pruned {
        Ok(Ok(ids)) if !ids.is_empty() => {
            let mut agents_lock = agents.write().await;
            for id in &ids {
                agents_lock.remove(id);
            }
            tracing::info!("[BackgroundAgent] Dropped {} finished runs", ids.len());
        }
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            tracing::warn!("[BackgroundAgent] Pruning finished runs failed: {}", error)
        }
        Err(error) => tracing::warn!(
            "[BackgroundAgent] Pruning finished runs did not finish: {}",
            error
        ),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum RunOutcome {
    Completed(RunReport),
    Failed(String),
    Cancelled,
    TimedOut,
    Interrupted,
    CouldNotStart(String),
}

fn outcome_of(end: RunEnd) -> RunOutcome {
    match end {
        RunEnd::Completed(report) => RunOutcome::Completed(report),
        RunEnd::Failed(reason) => RunOutcome::Failed(reason),
        RunEnd::Stopped(reason) => stopped_outcome(reason),
    }
}

fn stopped_outcome(reason: StopReason) -> RunOutcome {
    match reason {
        StopReason::Cancelled => RunOutcome::Cancelled,
        StopReason::TimeLimit => RunOutcome::TimedOut,
        StopReason::AppClosing => RunOutcome::Interrupted,
    }
}

/// The record's summary of a finished run: what the run itself reported.
/// It is kept in the agent record and nowhere else; a run writes no file of
/// its own, because a file dropped in a watched folder would start the next
/// run.
fn summary_of(goal: &str, report: &RunReport) -> AgentSummary {
    AgentSummary {
        description: if report.summary.trim().is_empty() {
            format!("Finished with nothing to report: {goal}")
        } else {
            report.summary.clone()
        },
        files_changed: Vec::new(),
        actions_taken: report.steps.clone(),
        warnings: report.notes.clone(),
        goal_achieved: true,
    }
}

const MODELS_NOT_READY: &str =
    "Models are not available yet, so the task could not start. Try it again in a moment.";

/// The boundary of a run started outside any chat: the one the app is in at
/// that moment. The app has no BYOK mode of its own; BYOK is entered only by
/// a conversation the person forked with consent.
fn run_boundary(cloud_app_mode: bool) -> TrustMode {
    if cloud_app_mode {
        TrustMode::ManagedCloud
    } else {
        TrustMode::Local
    }
}

const BYOK_RUN_REFUSED: &str =
    "Background runs work in Local or AGI Cloud mode. This one was started from a chat that uses your own provider key, so it was not started. It is not run on a local model or on AGI Cloud instead.";

/// Records the boundary a run keeps: the one its caller read from the chat
/// it was started in, or the app's when it was started outside one. A run
/// cannot name the provider a BYOK chat chose, so a BYOK run is refused here
/// rather than sent anywhere else.
fn in_run_boundary(
    mut context: BackgroundAgentContext,
    cloud_app_mode: bool,
) -> Result<BackgroundAgentContext, String> {
    let boundary = context
        .boundary
        .unwrap_or_else(|| run_boundary(cloud_app_mode));
    if boundary == TrustMode::Byok {
        return Err(BYOK_RUN_REFUSED.to_string());
    }
    context.boundary = Some(boundary);
    Ok(context)
}

/// The boundary a run's model calls stay inside: the one it was created in,
/// however the app has been switched since. A run with none recorded stays
/// on this computer, and one recorded as BYOK does not start.
fn boundary_of(context: &BackgroundAgentContext) -> Result<TrustMode, String> {
    match context.boundary {
        Some(TrustMode::ManagedCloud) => Ok(TrustMode::ManagedCloud),
        Some(TrustMode::Byok) => Err(BYOK_RUN_REFUSED.to_string()),
        Some(TrustMode::Local) | Some(TrustMode::OnDevice) | None => Ok(TrustMode::Local),
    }
}

const CLOUD_RUN_NEEDS_CLOUD_MODE: &str =
    "This run was started in Cloud mode and the app is now in Local mode. Switch to Cloud to run it. It is not run on a local model instead.";

const CLOUD_RUN_NEEDS_SIGN_IN: &str =
    "This run was started in Cloud mode, so it uses AGI Cloud. Sign in to run it. It is not run on a local model instead.";

/// The signed-in account a Cloud run's model calls are tied to, or why the
/// run cannot start. A Local run has none.
fn managed_boundary_for(
    trust_mode: TrustMode,
    cloud_app_mode: bool,
) -> Result<Option<crate::sys::account::ManagedAuthBoundary>, String> {
    if trust_mode != TrustMode::ManagedCloud {
        return Ok(None);
    }
    if !cloud_app_mode {
        return Err(CLOUD_RUN_NEEDS_CLOUD_MODE.to_string());
    }
    crate::sys::account::capture_managed_auth_boundary()
        .map(Some)
        .map_err(|_| CLOUD_RUN_NEEDS_SIGN_IN.to_string())
}

/// The goal as the planner reads it: the goal, then the instructions the
/// run was started with, when it was given any.
fn goal_with_instructions(goal: &str, instructions: Option<&str>) -> String {
    match instructions.map(str::trim).filter(|text| !text.is_empty()) {
        Some(instructions) => format!("{goal}\n\nInstructions for this run:\n{instructions}"),
        None => goal.to_string(),
    }
}

/// The folder the run was started in, checked against the folders the person
/// has granted, or why the run cannot start there. Each file step is still
/// held to the granted folders on its own.
async fn working_folder_for(
    app_handle: Option<&AppHandle>,
    context: &BackgroundAgentContext,
) -> Result<Option<std::path::PathBuf>, String> {
    let Some(folder) = context
        .working_directory
        .as_deref()
        .map(str::trim)
        .filter(|folder| !folder.is_empty())
    else {
        return Ok(None);
    };
    let refused = || {
        format!(
            "The run was started in '{folder}', which is not inside a folder you have granted, so it did not start. Open that folder as the project or allow it in Settings, then start the run again."
        )
    };
    let granted = crate::core::agi::executors::granted_folders_for(app_handle, &[])
        .await
        .map_err(|_| refused())?;
    let canonical = std::fs::canonicalize(folder).map_err(|_| refused())?;
    if granted.contains(&canonical) {
        Ok(Some(canonical))
    } else {
        Err(refused())
    }
}

/// Builds the agent for one run, or says why the run cannot start. No step
/// an agent can take uses the desktop-control service, so a run does not wait
/// on the Accessibility permission.
fn build_autonomous_agent(
    router: Option<Arc<RwLock<LLMRouter>>>,
    app_handle: Option<&AppHandle>,
    trust_mode: TrustMode,
    working_folder: Option<std::path::PathBuf>,
) -> Result<AutonomousAgent, String> {
    let router = router.ok_or_else(|| MODELS_NOT_READY.to_string())?;
    let config = AgentConfig {
        // P1: Explicit cost caps for background agents (run unattended)
        max_cost_per_task: 5.0,
        max_session_cost: 50.0,
        ..Default::default()
    };
    let mut agent = AutonomousAgent::new(config, router, trust_mode)
        .map_err(|error| format!("The task could not be set up: {error}"))?;
    if let Some(app) = app_handle {
        agent.set_app_handle(app.clone());
    }
    if let Some(folder) = working_folder {
        agent.set_working_folder(folder);
    }
    Ok(agent)
}

/// Everything a run needs before its first step, or why it cannot start.
async fn prepare_run(
    agent: &BackgroundAgent,
    router: Option<Arc<RwLock<LLMRouter>>>,
    app_handle: Option<&AppHandle>,
) -> Result<
    (
        AutonomousAgent,
        Option<crate::sys::account::ManagedAuthBoundary>,
    ),
    String,
> {
    let trust_mode = boundary_of(&agent.context)?;
    let managed = managed_boundary_for(
        trust_mode,
        crate::sys::account::app_mode::is_cloud_app_mode(),
    )?;
    let folder = working_folder_for(app_handle, &agent.context).await?;
    let autonomous = build_autonomous_agent(router, app_handle, trust_mode, folder)?;
    Ok((autonomous, managed))
}

/// Why a run failed, in the words the person reads, or `None` when it did not.
fn failure_reason(outcome: &RunOutcome, timeout_secs: u64) -> Option<String> {
    match outcome {
        RunOutcome::Failed(reason) | RunOutcome::CouldNotStart(reason) => Some(reason.clone()),
        RunOutcome::TimedOut => Some(format!(
            "It ran for {timeout_secs} seconds without finishing and was stopped."
        )),
        RunOutcome::Completed(_) | RunOutcome::Cancelled | RunOutcome::Interrupted => None,
    }
}

/// The one notice a run's ending raises. Cancelling is done by the person
/// from the panel or a chat approval, and a run cut off by the app closing
/// is reported when the app comes back, so neither raises one here.
fn ending_notice(
    agent_id: &str,
    goal: &str,
    outcome: &RunOutcome,
    timeout_secs: u64,
) -> Option<CreateNotificationInput> {
    match outcome {
        RunOutcome::Completed(report) => {
            Some(completion_notice(agent_id, goal, &summary_of(goal, report)))
        }
        RunOutcome::Cancelled | RunOutcome::Interrupted => None,
        RunOutcome::Failed(_) | RunOutcome::TimedOut | RunOutcome::CouldNotStart(_) => {
            failure_reason(outcome, timeout_secs)
                .map(|reason| failure_notice(agent_id, goal, &reason))
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
            agent.timeout_secs as i64,
        ],
    )?;

    Ok(())
}

/// Truncate a string to a maximum length, adding ellipsis if truncated.
fn truncate_string(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        let mut end = max_len.saturating_sub(3);
        // Walk back to a valid UTF-8 character boundary to avoid panicking on multi-byte chars
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        &s[..end]
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

        BackgroundAgentManager::new(Arc::new(std::sync::Mutex::new(conn)), None)
    }

    #[test]
    fn agent_notices_go_through_the_notification_center() {
        let source = include_str!("background_agent.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        assert!(
            !production.contains("tauri_plugin_notification"),
            "a background agent must not raise an OS notification of its own"
        );
        assert!(production.contains("deliver_notification"));
    }

    #[test]
    fn a_finished_agent_notice_selects_that_agent_and_can_be_gated() {
        let summary = AgentSummary {
            description: "Wrote the weekly report".to_string(),
            files_changed: Vec::new(),
            actions_taken: Vec::new(),
            warnings: Vec::new(),
            goal_achieved: true,
        };
        let notice = completion_notice("agent-7", "Write the weekly report", &summary);

        assert_eq!(notice.title, "Background Task Completed");
        assert_eq!(notice.message, "Wrote the weekly report");
        assert_eq!(notice.notification_type, NotificationType::TaskComplete);
        assert_eq!(
            notice.action_url.as_deref(),
            Some("background-agent:agent-7")
        );

        let partial = AgentSummary {
            description: String::new(),
            goal_achieved: false,
            ..summary
        };
        let notice = completion_notice("agent-7", "Write the weekly report", &partial);
        assert_eq!(notice.title, "Background Task Partially Completed");
        assert_eq!(notice.message, "Task: Write the weekly report");
    }

    #[test]
    fn a_failed_agent_notice_is_a_high_priority_failure_for_that_agent() {
        let notice = failure_notice("agent-9", "Sync the inbox", "The provider refused");

        assert_eq!(notice.title, "Background Task Failed");
        assert_eq!(
            notice.message,
            "Task: Sync the inbox\nError: The provider refused"
        );
        assert_eq!(notice.notification_type, NotificationType::TaskFailed);
        assert_eq!(notice.priority, NotificationPriority::High);
        assert_eq!(
            notice.action_url.as_deref(),
            Some("background-agent:agent-9")
        );
    }

    const NAVIGATION_REFUSED: &str = "Task failed: Not run unattended: 'browser_navigate' needs your approval, and nobody was here to give it. Run it from chat, or save an 'Always allow' for this tool in Settings.";

    fn failed(reason: &str) -> RunOutcome {
        RunOutcome::Failed(reason.to_string())
    }

    #[test]
    fn every_failed_ending_raises_one_notice_that_says_why_and_opens_the_run() {
        for (outcome, reason) in [
            (
                failed("Task failed: Step step_2 failed: the page did not load"),
                "the page did not load",
            ),
            (
                failed("The agent stopped at its step limit (100 rounds)."),
                "step limit",
            ),
            (
                failed("The agent stopped at its spending limit: it had spent $50.10 of $50.00."),
                "spending limit",
            ),
            (failed(NAVIGATION_REFUSED), "save an 'Always allow'"),
            (RunOutcome::TimedOut, "600 seconds without finishing"),
            (
                RunOutcome::CouldNotStart(
                    "The task could not be set up: the planner is unavailable".to_string(),
                ),
                "could not be set up",
            ),
            (
                RunOutcome::CouldNotStart(MODELS_NOT_READY.to_string()),
                "Models are not available yet",
            ),
        ] {
            let notice = ending_notice("agent-3", "Sync the inbox", &outcome, 600)
                .expect("a run that failed or never started raises a notice");

            assert_eq!(notice.title, "Background Task Failed");
            assert_eq!(notice.notification_type, NotificationType::TaskFailed);
            assert_eq!(notice.priority, NotificationPriority::High);
            assert_eq!(
                notice.action_url.as_deref(),
                Some("background-agent:agent-3")
            );
            assert!(notice.message.contains(reason), "{}", notice.message);
            let whole_reason = failure_reason(&outcome, 600).expect("a failed run has a reason");
            assert!(
                notice.message.ends_with(&whole_reason),
                "the reason is not cut short: {}",
                notice.message
            );
        }
    }

    #[test]
    fn a_finished_run_reports_what_it_found_not_its_goal() {
        let report = RunReport {
            summary: "Three unread messages from Dana about the March invoice.".to_string(),
            steps: vec!["Read the inbox: 3 unread".to_string()],
            notes: vec!["The plan change the model asked for was not adopted: x".to_string()],
        };
        let outcome = RunOutcome::Completed(report.clone());

        let notice = ending_notice("agent-3", "Sync the inbox", &outcome, 600)
            .expect("a finished run raises a notice");

        assert_eq!(notice.title, "Background Task Completed");
        assert_eq!(notice.message, report.summary);
        assert_eq!(notice.notification_type, NotificationType::TaskComplete);
        assert_eq!(
            notice.action_url.as_deref(),
            Some("background-agent:agent-3")
        );
        assert_eq!(failure_reason(&outcome, 600), None);

        let record = summary_of("Sync the inbox", &report);
        assert_eq!(record.description, report.summary);
        assert_eq!(record.actions_taken, report.steps);
        assert_eq!(record.warnings, report.notes);
        assert!(record.files_changed.is_empty());
    }

    #[test]
    fn a_run_with_nothing_to_report_says_so() {
        let record = summary_of("Sync the inbox", &RunReport::default());

        assert_eq!(
            record.description,
            "Finished with nothing to report: Sync the inbox"
        );
    }

    #[test]
    fn a_run_writes_no_file_of_its_own() {
        let source = include_str!("background_agent.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);

        assert!(!production.contains("fs::write"));
        assert!(!production.contains("\"Desktop\""));
    }

    #[test]
    fn a_run_the_manager_stopped_raises_no_notice_from_the_run() {
        for outcome in [RunOutcome::Cancelled, RunOutcome::Interrupted] {
            assert!(ending_notice("agent-3", "Sync the inbox", &outcome, 600).is_none());
            assert_eq!(failure_reason(&outcome, 600), None);
        }
    }

    #[test]
    fn each_way_a_run_stops_has_one_outcome() {
        assert_eq!(
            outcome_of(RunEnd::Stopped(StopReason::Cancelled)),
            RunOutcome::Cancelled
        );
        assert_eq!(
            outcome_of(RunEnd::Stopped(StopReason::TimeLimit)),
            RunOutcome::TimedOut
        );
        assert_eq!(
            outcome_of(RunEnd::Stopped(StopReason::AppClosing)),
            RunOutcome::Interrupted
        );
        assert_eq!(
            outcome_of(RunEnd::Failed("Step s2 failed".to_string())),
            RunOutcome::Failed("Step s2 failed".to_string())
        );
    }

    #[tokio::test]
    async fn the_time_limit_does_not_run_while_the_run_is_paused() {
        let mut clock = RunClock::new(Duration::from_millis(200));

        tokio::time::sleep(Duration::from_millis(50)).await;
        clock.pause();
        assert!(
            tokio::time::timeout(Duration::from_millis(400), clock.expired())
                .await
                .is_err(),
            "a paused run timed out"
        );

        clock.resume();
        tokio::time::timeout(Duration::from_millis(400), clock.expired())
            .await
            .expect("the limit runs out once the run goes on");
    }

    #[test]
    fn a_run_parked_for_approval_says_what_waits_on_it_and_opens_the_run() {
        let notice = awaiting_approval_notice("agent-4", "Sync the inbox");

        assert_eq!(notice.title, "Background Task Waiting for You");
        assert!(notice.message.contains("Sync the inbox"));
        assert!(notice
            .message
            .contains("will not start until you resume it"));
        assert!(notice
            .message
            .contains("later firings are counted on the trigger and do not run"));
        assert_eq!(notice.priority, NotificationPriority::High);
        assert_eq!(
            notice.action_url.as_deref(),
            Some("background-agent:agent-4")
        );
    }

    async fn park(manager: &BackgroundAgentManager, trigger: &str, goal: &str) -> String {
        manager
            .push_awaiting_approval(
                trigger.to_string(),
                goal.to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .expect("a run is parked without an app handle too")
    }

    #[tokio::test]
    async fn a_parked_run_is_marked_as_waiting_and_records_its_boundary() {
        let manager = create_test_manager();

        let parked_id = park(&manager, "trigger:t1", "Sync the inbox at 01:00").await;

        let parked = manager.get_agent(&parked_id).await.expect("parked run");
        assert_eq!(parked.status, BackgroundAgentStatus::Paused);
        assert!(parked.progress.awaiting_approval);
        assert!(parked.is_parked());
        assert_eq!(
            parked.progress.current_step_description,
            "Waiting for your approval to start"
        );
        assert!(parked.context.boundary.is_some());

        let source = include_str!("background_agent.rs");
        let parking = source
            .split("pub async fn push_awaiting_approval")
            .nth(1)
            .and_then(|rest| rest.split("pub async fn get_agent").next())
            .expect("the parking function");
        assert_eq!(parking.matches("awaiting_approval_notice(").count(), 1);
    }

    #[tokio::test]
    async fn parked_runs_take_none_of_the_running_places() {
        let manager = create_test_manager();
        for trigger in 0..MAX_BACKGROUND_AGENTS + 2 {
            park(&manager, &format!("trigger:t{trigger}"), "Sync the inbox").await;
        }

        assert_eq!(manager.occupied_places().await, 0);
        manager
            .push_to_background(
                "conv_1".to_string(),
                "Write the report".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .expect("a run can still be started with every trigger parked");
    }

    /// A stand-in for a live run: it records each command and ends a moment
    /// after it is told to stop.
    async fn live_run(
        manager: &BackgroundAgentManager,
        status: BackgroundAgentStatus,
    ) -> (
        String,
        Arc<std::sync::Mutex<Vec<AgentCommand>>>,
        Arc<std::sync::atomic::AtomicBool>,
    ) {
        let mut agent = BackgroundAgent::new(
            "conv_live".to_string(),
            "Write the report".to_string(),
            BackgroundAgentContext::default(),
            0,
        );
        agent.status = status;
        let agent_id = agent.id.clone();
        manager.agents.write().await.insert(agent_id.clone(), agent);

        let (command_tx, mut command_rx) = mpsc::channel::<AgentCommand>(16);
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let ended = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let (seen_by_run, ended_by_run) = (Arc::clone(&seen), Arc::clone(&ended));
        let done = tokio::spawn(async move {
            while let Some(command) = command_rx.recv().await {
                let stops = !matches!(command, AgentCommand::Pause | AgentCommand::Resume);
                seen_by_run.lock().unwrap().push(command);
                if stops {
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
            ended_by_run.store(true, std::sync::atomic::Ordering::SeqCst);
        });
        manager.handles.lock().await.insert(
            agent_id.clone(),
            AgentHandle {
                command_tx,
                agent_id: agent_id.clone(),
                done,
            },
        );
        (agent_id, seen, ended)
    }

    #[tokio::test]
    async fn cancel_reports_cancelled_only_after_the_run_has_ended() {
        let manager = create_test_manager();
        let (agent_id, seen, ended) = live_run(&manager, BackgroundAgentStatus::Running).await;

        manager.cancel_agent(&agent_id).await.expect("cancel");

        assert!(
            ended.load(std::sync::atomic::Ordering::SeqCst),
            "cancel returned while the run was still going"
        );
        assert!(matches!(
            seen.lock().unwrap().as_slice(),
            [AgentCommand::Cancel]
        ));
        let cancelled = manager.get_agent(&agent_id).await.expect("agent");
        assert_eq!(cancelled.status, BackgroundAgentStatus::Cancelled);
        assert!(manager.handles.lock().await.is_empty());
    }

    #[tokio::test]
    async fn resuming_a_paused_live_run_continues_it_and_starts_no_second_run() {
        let manager = create_test_manager();
        let (agent_id, seen, ended) = live_run(&manager, BackgroundAgentStatus::Running).await;

        manager.pause_agent(&agent_id).await.expect("pause");
        assert_eq!(
            manager.get_agent(&agent_id).await.expect("agent").status,
            BackgroundAgentStatus::Paused
        );
        manager.resume_agent(&agent_id).await.expect("resume");
        tokio::time::sleep(Duration::from_millis(50)).await;

        assert!(matches!(
            seen.lock().unwrap().as_slice(),
            [AgentCommand::Pause, AgentCommand::Resume]
        ));
        assert_eq!(
            manager.get_agent(&agent_id).await.expect("agent").status,
            BackgroundAgentStatus::Running
        );
        assert!(
            manager.queue.read().await.is_empty(),
            "the run was queued to start again"
        );
        assert_eq!(manager.handles.lock().await.len(), 1);
        assert!(!ended.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test]
    async fn closing_the_app_stops_live_runs_and_leaves_them_to_resume() {
        let manager = create_test_manager();
        let (agent_id, seen, ended) = live_run(&manager, BackgroundAgentStatus::Running).await;

        manager.interrupt_all_runs().await;

        assert!(ended.load(std::sync::atomic::Ordering::SeqCst));
        assert!(matches!(
            seen.lock().unwrap().as_slice(),
            [AgentCommand::Interrupt]
        ));
        let interrupted = manager.get_agent(&agent_id).await.expect("agent");
        assert_eq!(interrupted.status, BackgroundAgentStatus::Paused);
        assert!(interrupted
            .progress
            .current_step_description
            .contains("Interrupted when the app closed"));
    }

    #[test]
    fn a_run_cut_off_by_the_app_closing_is_reported_and_opens_the_run() {
        let notice = interrupted_notice("agent-5", "Sync the inbox");

        assert_eq!(notice.title, "Background Task Interrupted");
        assert!(notice.message.contains("Sync the inbox"));
        assert!(notice
            .message
            .contains("The app closed while it was running"));
        assert_eq!(
            notice.action_url.as_deref(),
            Some("background-agent:agent-5")
        );
    }

    #[test]
    fn a_run_that_cannot_start_says_which_part_is_missing() {
        assert_eq!(
            build_autonomous_agent(None, None, TrustMode::Local, None).err(),
            Some(MODELS_NOT_READY.to_string())
        );
    }

    #[test]
    fn a_run_keeps_the_boundary_it_was_created_in() {
        assert_eq!(run_boundary(false), TrustMode::Local);
        assert_eq!(run_boundary(true), TrustMode::ManagedCloud);

        let created = |boundary: Option<TrustMode>, cloud_app_mode: bool| {
            let context = BackgroundAgentContext {
                boundary,
                ..Default::default()
            };
            in_run_boundary(context, cloud_app_mode).map(|context| context.boundary)
        };
        assert_eq!(created(None, false), Ok(Some(TrustMode::Local)));
        assert_eq!(created(None, true), Ok(Some(TrustMode::ManagedCloud)));
        assert_eq!(
            created(Some(TrustMode::Local), true),
            Ok(Some(TrustMode::Local)),
            "a Local chat's run stays Local while the app is in Cloud mode"
        );
        assert_eq!(
            created(Some(TrustMode::ManagedCloud), false),
            Ok(Some(TrustMode::ManagedCloud))
        );

        let mut context = BackgroundAgentContext::default();
        assert_eq!(boundary_of(&context), Ok(TrustMode::Local));
        context.boundary = Some(TrustMode::ManagedCloud);
        assert_eq!(boundary_of(&context), Ok(TrustMode::ManagedCloud));

        assert!(matches!(
            managed_boundary_for(TrustMode::Local, true),
            Ok(None)
        ));
        assert_eq!(
            managed_boundary_for(TrustMode::ManagedCloud, false).err(),
            Some(CLOUD_RUN_NEEDS_CLOUD_MODE.to_string())
        );

        let source = include_str!("background_agent.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        assert!(production.contains("scope_managed_auth_boundary("));
    }

    #[tokio::test]
    async fn a_run_from_a_byok_chat_is_refused_and_goes_nowhere_else() {
        let byok = || BackgroundAgentContext {
            boundary: Some(TrustMode::Byok),
            ..Default::default()
        };
        for cloud_app_mode in [false, true] {
            assert_eq!(
                in_run_boundary(byok(), cloud_app_mode).map(|context| context.boundary),
                Err(BYOK_RUN_REFUSED.to_string())
            );
        }
        assert_eq!(boundary_of(&byok()), Err(BYOK_RUN_REFUSED.to_string()));

        let manager = create_test_manager();
        let started = manager
            .push_to_background("conv_1".to_string(), "Sync".to_string(), byok(), 0)
            .await
            .expect_err("a BYOK run is not started");
        assert_eq!(started.to_string(), BYOK_RUN_REFUSED);
        let parked = manager
            .push_awaiting_approval("trigger:t1".to_string(), "Sync".to_string(), byok(), 0)
            .await
            .expect_err("a BYOK run is not parked");
        assert_eq!(parked.to_string(), BYOK_RUN_REFUSED);
        assert!(manager.list_agents().await.is_empty());
    }

    #[test]
    fn the_instructions_a_run_was_started_with_reach_the_planner() {
        assert_eq!(
            goal_with_instructions("Sync the inbox", None),
            "Sync the inbox"
        );
        assert_eq!(
            goal_with_instructions("Sync the inbox", Some("   ")),
            "Sync the inbox"
        );
        assert_eq!(
            goal_with_instructions("Sync the inbox", Some(" Skip newsletters. ")),
            "Sync the inbox\n\nInstructions for this run:\nSkip newsletters."
        );
    }

    #[tokio::test]
    async fn a_run_started_in_a_folder_that_is_not_granted_does_not_start() {
        assert_eq!(
            working_folder_for(None, &BackgroundAgentContext::default()).await,
            Ok(None)
        );

        let outside = tempdir().unwrap();
        let context = BackgroundAgentContext {
            working_directory: Some(outside.path().to_string_lossy().into_owned()),
            ..Default::default()
        };
        let refusal = working_folder_for(None, &context)
            .await
            .expect_err("no folder is granted without the app");
        assert!(
            refusal.contains("not inside a folder you have granted"),
            "{refusal}"
        );
    }

    fn restored(conversation: &str, status: BackgroundAgentStatus) -> BackgroundAgent {
        let mut agent = BackgroundAgent::new(
            conversation.to_string(),
            "Sync the inbox".to_string(),
            BackgroundAgentContext::default(),
            0,
        );
        agent.status = status;
        agent
    }

    #[test]
    fn a_trigger_run_cut_off_by_a_restart_is_ended_so_its_trigger_fires_again() {
        for status in [
            BackgroundAgentStatus::Running,
            BackgroundAgentStatus::Paused,
        ] {
            let mut agent = restored("trigger:t1", status);

            let notice = settle_restored_run(&mut agent).expect("the person is told");

            assert_eq!(agent.status, BackgroundAgentStatus::Failed);
            assert!(agent.is_terminal());
            assert!(agent.completed_at.is_some());
            assert_eq!(agent.error.as_deref(), Some(INTERRUPTED_TRIGGER_RUN));
            assert!(notice.message.contains("Its trigger starts a new run"));
        }
    }

    #[test]
    fn a_trigger_run_waiting_for_approval_stays_parked_across_a_restart() {
        let mut agent = restored("trigger:t1", BackgroundAgentStatus::Paused);
        agent.progress.awaiting_approval = true;

        assert!(settle_restored_run(&mut agent).is_none());
        assert!(agent.is_parked());
    }

    #[test]
    fn a_run_a_person_started_is_paused_by_a_restart_and_can_be_resumed() {
        let mut running = restored("conv_1", BackgroundAgentStatus::Running);
        assert!(settle_restored_run(&mut running).is_some());
        assert_eq!(running.status, BackgroundAgentStatus::Paused);
        assert!(running.can_resume());

        let mut paused = restored("conv_1", BackgroundAgentStatus::Paused);
        assert!(settle_restored_run(&mut paused).is_none());
        assert_eq!(paused.status, BackgroundAgentStatus::Paused);

        let mut queued = restored("trigger:t1", BackgroundAgentStatus::Queued);
        assert!(settle_restored_run(&mut queued).is_none());
        assert_eq!(queued.status, BackgroundAgentStatus::Queued);
    }

    #[test]
    fn a_trigger_run_is_known_by_the_prefix_its_trigger_gives_it() {
        let triggers = include_str!("triggers.rs");

        assert!(triggers.contains(&format!(
            "format!(\"{TRIGGER_RUN_PREFIX}{{}}\", trigger_id)"
        )));
    }

    fn stored_run(conn: &Connection, id: &str, status: &str, completed_at: Option<DateTime<Utc>>) {
        conn.execute(
            "INSERT INTO background_agents
             (id, conversation_id, goal, status, progress_json, created_at, completed_at, context_json)
             VALUES (?1, 'conv', 'goal', ?2, '{}', ?3, ?4, '{}')",
            rusqlite::params![
                id,
                status,
                Utc::now().to_rfc3339(),
                completed_at.map(|at| at.to_rfc3339())
            ],
        )
        .unwrap();
    }

    fn stored_ids(conn: &Connection) -> Vec<String> {
        let mut statement = conn.prepare("SELECT id FROM background_agents").unwrap();
        let mut ids = statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<String>>>()
            .unwrap();
        ids.sort();
        ids
    }

    #[test]
    fn finished_runs_past_their_age_are_deleted_and_unfinished_ones_never_are() {
        let manager = create_test_manager();
        let conn = manager.db_conn.lock().unwrap();
        let now = Utc::now();
        let too_old = now - chrono::Duration::days(FINISHED_RUN_KEEP_DAYS + 1);
        stored_run(&conn, "ended-long-ago", "completed", Some(too_old));
        stored_run(&conn, "ended-with-no-date", "cancelled", None);
        stored_run(
            &conn,
            "ended-yesterday",
            "failed",
            Some(now - chrono::Duration::days(1)),
        );
        stored_run(&conn, "paused-long-ago", "paused", None);

        let mut deleted = delete_finished_past_keep(&conn, now).unwrap();
        deleted.sort();

        assert_eq!(deleted, vec!["ended-long-ago", "ended-with-no-date"]);
        assert_eq!(
            stored_ids(&conn),
            vec!["ended-yesterday", "paused-long-ago"]
        );
    }

    #[test]
    fn only_the_newest_finished_runs_are_kept() {
        let manager = create_test_manager();
        let conn = manager.db_conn.lock().unwrap();
        let now = Utc::now();
        for age in 0..FINISHED_RUNS_KEPT + 3 {
            stored_run(
                &conn,
                &format!("run-{age:03}"),
                "completed",
                Some(now - chrono::Duration::minutes(age as i64 + 1)),
            );
        }
        stored_run(&conn, "still-running", "running", None);

        let mut deleted = delete_finished_past_keep(&conn, now).unwrap();
        deleted.sort();

        assert_eq!(deleted, vec!["run-100", "run-101", "run-102"]);
        assert_eq!(stored_ids(&conn).len(), FINISHED_RUNS_KEPT + 1);
    }

    #[tokio::test]
    async fn a_run_dropped_from_the_table_is_dropped_from_memory_too() {
        let manager = create_test_manager();
        let mut agent = restored("conv_1", BackgroundAgentStatus::Cancelled);
        agent.completed_at = Some(Utc::now() - chrono::Duration::days(FINISHED_RUN_KEEP_DAYS + 1));
        let agent_id = agent.id.clone();
        manager.persist_agent(&agent).unwrap();
        manager.agents.write().await.insert(agent_id.clone(), agent);

        manager.prune_finished_runs().await;

        assert!(manager.get_agent(&agent_id).await.is_none());
        assert!(stored_ids(&manager.db_conn.lock().unwrap()).is_empty());
    }

    #[test]
    fn a_run_saves_each_change_before_it_makes_the_next() {
        let source = include_str!("background_agent.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        let run = production
            .split("async fn execute_background_agent")
            .nth(1)
            .expect("the run function");

        assert!(!run.contains("drop(tokio::task::spawn_blocking"));
        assert_eq!(run.matches("save_in_order(").count(), 3);
    }

    #[test]
    fn a_run_does_not_wait_on_the_desktop_control_service() {
        let source = include_str!("background_agent.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);

        assert!(!production.contains("AutomationService"));
        assert!(!production.contains("shared_service"));
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

    #[tokio::test]
    async fn an_agent_awaiting_approval_does_not_start() {
        let manager = create_test_manager();

        let agent_id = manager
            .push_awaiting_approval(
                "trigger:t1".to_string(),
                "Summarise the inbox".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .unwrap();

        let agent = manager.get_agent(&agent_id).await.unwrap();
        assert_eq!(agent.status, BackgroundAgentStatus::Paused);
        assert!(agent.started_at.is_none());
        assert!(manager.queue.read().await.is_empty());
    }

    #[test]
    fn an_interrupted_run_is_paused_for_the_user() {
        let mut agent = BackgroundAgent::new(
            "conv_1".to_string(),
            "Refactor".to_string(),
            BackgroundAgentContext::default(),
            0,
        );
        agent.start();

        mark_interrupted(&mut agent);

        assert_eq!(agent.status, BackgroundAgentStatus::Paused);
        assert!(agent.can_resume());
        assert!(agent
            .progress
            .current_step_description
            .contains("Interrupted"));
    }

    #[tokio::test]
    async fn a_paused_agent_is_not_queued_after_a_restart() {
        let manager = create_test_manager();
        let agent_id = manager
            .push_awaiting_approval(
                "conv_paused".to_string(),
                "Wait for me".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .unwrap();

        let reloaded = BackgroundAgentManager::new(manager.db_conn.clone(), None);
        reloaded.load_persisted_agents().await.unwrap();

        assert_eq!(
            reloaded.get_agent(&agent_id).await.unwrap().status,
            BackgroundAgentStatus::Paused
        );
        assert!(reloaded.queue.read().await.is_empty());
    }

    #[test]
    fn test_truncate_string_short_unchanged() {
        let s = "hello";
        assert_eq!(truncate_string(s, 10), "hello");
    }

    #[test]
    fn test_truncate_string_exact_length_unchanged() {
        let s = "12345";
        assert_eq!(truncate_string(s, 5), "12345");
    }

    #[test]
    fn test_truncate_string_long_is_truncated() {
        let s = "abcdefghij"; // 10 chars
                              // max_len=7 -> &s[..7-3] = &s[..4] = "abcd"
        let result = truncate_string(s, 7);
        assert_eq!(result, "abcd");
        assert!(result.len() < s.len());
    }

    #[test]
    fn test_truncate_string_empty_input() {
        assert_eq!(truncate_string("", 10), "");
    }

    #[test]
    fn test_truncate_string_max_len_zero() {
        // max_len=0: s.len() (any > 0) > 0, so &s[..0.saturating_sub(3)] = &s[..0] = ""
        assert_eq!(truncate_string("hello", 0), "");
    }

    #[test]
    fn test_truncate_string_max_len_one() {
        // max_len=1 < s.len(5): &s[..1.saturating_sub(3)] = &s[..0] = ""
        assert_eq!(truncate_string("hello", 1), "");
    }

    #[test]
    fn test_truncate_string_max_len_two() {
        // max_len=2 < s.len(5): &s[..2.saturating_sub(3)] = &s[..0] = ""
        assert_eq!(truncate_string("hello", 2), "");
    }

    #[test]
    fn test_truncate_string_max_len_three() {
        // max_len=3 < s.len(5): &s[..3.saturating_sub(3)] = &s[..0] = ""
        assert_eq!(truncate_string("hello", 3), "");
    }

    #[test]
    fn test_truncate_string_max_len_four() {
        // max_len=4 < s.len(5): &s[..4.saturating_sub(3)] = &s[..1] = "h"
        assert_eq!(truncate_string("hello", 4), "h");
    }

    // ------------------------------------------------------------------
    // Manager: cancel_agent
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_cancel_agent() {
        let manager = create_test_manager();
        let context = BackgroundAgentContext::default();

        let agent_id = manager
            .push_to_background(
                "conv_cancel".to_string(),
                "Cancel me".to_string(),
                context,
                0,
            )
            .await
            .unwrap();

        // Cancel the agent
        manager.cancel_agent(&agent_id).await.unwrap();

        let agent = manager.get_agent(&agent_id).await.unwrap();
        assert_eq!(agent.status, BackgroundAgentStatus::Cancelled);
        assert!(agent.is_terminal());
    }

    // ------------------------------------------------------------------
    // Manager: count_active_agents
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_count_active_agents() {
        let manager = create_test_manager();

        // Initially zero
        assert_eq!(manager.count_active_agents().await, 0);

        // Push two agents
        for i in 0..2 {
            let context = BackgroundAgentContext::default();
            manager
                .push_to_background(format!("conv_{}", i), format!("Task {}", i), context, 0)
                .await
                .unwrap();
        }

        // All are non-terminal (Queued or Running), so active count is 2
        let count = manager.count_active_agents().await;
        assert_eq!(count, 2);
    }

    // ------------------------------------------------------------------
    // Manager: list_active_agents
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_list_active_agents_excludes_cancelled() {
        let manager = create_test_manager();

        let id1 = manager
            .push_to_background(
                "c1".to_string(),
                "Task 1".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .unwrap();

        let _id2 = manager
            .push_to_background(
                "c2".to_string(),
                "Task 2".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .unwrap();

        // Cancel the first agent
        manager.cancel_agent(&id1).await.unwrap();

        let active = manager.list_active_agents().await;
        // Only one should remain active
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].conversation_id, "c2");
    }

    // ------------------------------------------------------------------
    // Manager: get_agent returns None for unknown ID
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_get_agent_unknown_returns_none() {
        let manager = create_test_manager();
        let result = manager.get_agent("nonexistent-id").await;
        assert!(result.is_none());
    }

    // ------------------------------------------------------------------
    // Manager: push_to_background persists to DB
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_push_persists_to_database() {
        let manager = create_test_manager();
        let context = BackgroundAgentContext::default();

        let agent_id = manager
            .push_to_background(
                "conv_persist".to_string(),
                "Persist me".to_string(),
                context,
                3,
            )
            .await
            .unwrap();

        // Verify the agent was persisted by reading directly from the DB
        let conn = manager.db_conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT goal, priority FROM background_agents WHERE id = ?1")
            .unwrap();
        let (goal, priority): (String, u8) = stmt
            .query_row([&agent_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();

        assert_eq!(goal, "Persist me");
        assert_eq!(priority, 3);
    }

    // ------------------------------------------------------------------
    // Manager: cancel removes from queue
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_cancel_removes_from_queue() {
        let manager = create_test_manager();

        let id1 = manager
            .push_to_background(
                "c1".to_string(),
                "Task 1".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .unwrap();

        let _id2 = manager
            .push_to_background(
                "c2".to_string(),
                "Task 2".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await
            .unwrap();

        // Cancel the first
        manager.cancel_agent(&id1).await.unwrap();

        // Queue should no longer contain id1
        let queue = manager.queue.read().await;
        assert!(!queue.contains(&id1));
    }

    // ------------------------------------------------------------------
    // Manager: max agents error message is descriptive
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_manager_max_agents_error_message_contains_limit() {
        let manager = create_test_manager();

        for i in 0..MAX_BACKGROUND_AGENTS {
            let context = BackgroundAgentContext::default();
            manager
                .push_to_background(format!("conv_{}", i), format!("Task {}", i), context, 0)
                .await
                .unwrap();
        }

        let result = manager
            .push_to_background(
                "conv_extra".to_string(),
                "Extra".to_string(),
                BackgroundAgentContext::default(),
                0,
            )
            .await;

        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("8"),
            "Error message should mention the limit: {}",
            err_msg
        );
    }

    // ------------------------------------------------------------------
    // persist_agent_to_db standalone function
    // ------------------------------------------------------------------

    #[test]
    fn test_persist_agent_to_db_and_read_back() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test_persist.db");
        let conn = Connection::open(&db_path).unwrap();

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

        let db_conn = Arc::new(std::sync::Mutex::new(conn));

        let mut agent = BackgroundAgent::new(
            "conv-db-test".to_string(),
            "DB roundtrip".to_string(),
            BackgroundAgentContext::default(),
            4,
        );
        agent.start();
        agent.update_progress(2, 5, "Step 2".to_string());

        // Persist
        persist_agent_to_db(&db_conn, &agent).unwrap();

        // Read back
        let conn = db_conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT status, goal, priority FROM background_agents WHERE id = ?1")
            .unwrap();
        let (status, goal, priority): (String, String, u8) = stmt
            .query_row([&agent.id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .unwrap();

        assert_eq!(status, "running");
        assert_eq!(goal, "DB roundtrip");
        assert_eq!(priority, 4);
    }

    #[test]
    fn test_persist_agent_to_db_overwrites_on_update() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test_overwrite.db");
        let conn = Connection::open(&db_path).unwrap();

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

        let db_conn = Arc::new(std::sync::Mutex::new(conn));

        let mut agent = BackgroundAgent::new(
            "conv-overwrite".to_string(),
            "Overwrite test".to_string(),
            BackgroundAgentContext::default(),
            1,
        );
        agent.start();

        // First persist
        persist_agent_to_db(&db_conn, &agent).unwrap();

        // Fail the agent
        agent.fail("Something went wrong".to_string());
        persist_agent_to_db(&db_conn, &agent).unwrap();

        // Read back -- should reflect the updated status
        let conn = db_conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT status, error FROM background_agents WHERE id = ?1")
            .unwrap();
        let (status, error): (String, Option<String>) = stmt
            .query_row([&agent.id], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap();

        assert_eq!(status, "failed");
        assert_eq!(error.as_deref(), Some("Something went wrong"));
    }

    // ------------------------------------------------------------------
    // BackgroundAgentManagerState wrapper
    // ------------------------------------------------------------------

    #[test]
    fn test_manager_state_wraps_manager() {
        let manager = create_test_manager();
        let state = BackgroundAgentManagerState::new(manager);
        // Verify the Arc<RwLock<>> wrapper is accessible
        let _inner = &state.0;
    }
}
