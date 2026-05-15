//! A2A wire types: AgentCard, TaskRequest/Response, HandoffRequest, InFlightTask.

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::{RwLock, Semaphore};

use crate::config::CliConfig;
use crate::models::Message;

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

/// An agent's capability card -- advertised to peers for discovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCard {
    /// Unique identifier for this agent instance.
    pub agent_id: String,
    /// Human-readable name of the agent.
    pub name: String,
    /// Agent software version.
    pub version: String,
    /// List of capabilities this agent supports (e.g., "code", "research", "web_search").
    pub capabilities: Vec<String>,
    /// Models this agent can use (e.g., "claude-opus-4-6", "gpt-5.5").
    pub supported_models: Vec<String>,
    /// Network endpoint where this agent's A2A server is listening.
    pub endpoint: String,
    /// Whether requests to this agent require a bearer token.
    pub auth_required: bool,
    /// Arbitrary metadata (extensions, tags, etc.).
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Task Delegation Protocol
// ---------------------------------------------------------------------------

/// Request to delegate a task to another agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequest {
    /// Unique request identifier (UUID v4).
    pub request_id: String,
    /// ID of the agent sending this request.
    pub from_agent: String,
    /// Human-readable description of the task.
    pub task_description: String,
    /// Optional additional context (files, conversation history summary, etc.).
    pub context: Option<String>,
    /// Maximum time in seconds the requesting agent will wait.
    pub timeout_seconds: Option<u64>,
    /// Priority level for scheduling.
    pub priority: TaskPriority,
}

/// Response to a delegated task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResponse {
    /// Echoed request_id from the corresponding TaskRequest.
    pub request_id: String,
    /// Current status of the task.
    pub status: TaskResponseStatus,
    /// Result text on completion (None if not yet complete or failed).
    pub result: Option<String>,
    /// Error message on failure (None if not failed).
    pub error: Option<String>,
    /// Wall-clock duration of task execution in milliseconds.
    pub duration_ms: u64,
}

/// Status of a delegated task response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskResponseStatus {
    /// The task has been accepted and is queued or running.
    Accepted,
    /// The task completed successfully.
    Completed,
    /// The task failed.
    Failed,
    /// The target agent rejected the task (e.g., capability mismatch).
    Rejected,
}

impl std::fmt::Display for TaskResponseStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskResponseStatus::Accepted => write!(f, "accepted"),
            TaskResponseStatus::Completed => write!(f, "completed"),
            TaskResponseStatus::Failed => write!(f, "failed"),
            TaskResponseStatus::Rejected => write!(f, "rejected"),
        }
    }
}

/// Priority level for a delegated task.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    #[default]
    Normal,
    High,
    Critical,
}

impl std::fmt::Display for TaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::Low => write!(f, "low"),
            TaskPriority::Normal => write!(f, "normal"),
            TaskPriority::High => write!(f, "high"),
            TaskPriority::Critical => write!(f, "critical"),
        }
    }
}

/// A conversation handoff request -- transfers messages to another agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffRequest {
    /// Agent sending the handoff.
    pub from_agent: String,
    /// Serialized conversation messages.
    pub messages: Vec<Message>,
    /// Optional instructions for the receiving agent.
    pub instructions: Option<String>,
}

// ---------------------------------------------------------------------------
// In-flight Task Tracking
// ---------------------------------------------------------------------------

/// Tracks a task that has been accepted by the local A2A server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InFlightTask {
    pub request: TaskRequest,
    pub status: TaskResponseStatus,
    pub result: Option<String>,
    pub error: Option<String>,
    pub elapsed_ms: u64,
}

/// Shared state for the A2A server.
#[derive(Debug, Clone)]
pub struct A2aState {
    /// This agent's card.
    pub card: AgentCard,
    /// In-flight tasks indexed by request_id.
    pub tasks: Arc<RwLock<HashMap<String, InFlightTask>>>,
    /// Optional bearer token for authentication.
    pub auth_token: Option<String>,
    /// CLI config (for spawning agent sessions).
    pub config: CliConfig,
    /// Semaphore to limit concurrent A2A task execution.
    pub task_semaphore: Arc<Semaphore>,
}
