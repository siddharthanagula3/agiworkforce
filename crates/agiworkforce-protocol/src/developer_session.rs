//! Stable local developer-session protocol shared by AGI CLI and AGI for VS Code.
//!
//! The wire is bidirectional JSON: newline-delimited frames over stdio or one
//! JSON object per authenticated WebSocket text frame. Requests and responses
//! carry an `id`; notifications omit it. Method names follow the
//! thread/turn/item vocabulary used by modern coding-agent app servers while
//! all payloads and trust decisions remain AGI-owned.

use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::protocol::ReviewDecision;
use crate::task_state::{AgentTaskState, AgentTaskStateChanged};
use crate::user_input::UserInput;

/// Current wire version for the shared CLI/VS Code developer-session protocol.
pub const DEVELOPER_SESSION_PROTOCOL_VERSION: u32 = 4;

pub mod method {
    pub const INITIALIZE: &str = "initialize";
    pub const INITIALIZED: &str = "initialized";
    pub const THREAD_START: &str = "thread/start";
    pub const THREAD_LIST: &str = "thread/list";
    pub const THREAD_READ: &str = "thread/read";
    pub const THREAD_RESUME: &str = "thread/resume";
    pub const THREAD_FORK: &str = "thread/fork";
    pub const THREAD_ARCHIVE: &str = "thread/archive";
    pub const TURN_START: &str = "turn/start";
    pub const TURN_STEER: &str = "turn/steer";
    pub const TURN_INTERRUPT: &str = "turn/interrupt";
    pub const APPROVAL_RESPOND: &str = "approval/respond";
    pub const TASK_STATE_CHANGED: &str = "task/state_changed";
    pub const SHUTDOWN: &str = "shutdown";
}

/// Build the canonical task-state notification shared by stdio and WebSocket
/// developer-session clients. The payload is the same typed contract used by
/// cloud chat activity, so UI surfaces never infer lifecycle from prose or
/// transport-specific turn methods.
pub fn task_state_notification(
    task_id: impl Into<String>,
    state: AgentTaskState,
    previous_state: Option<AgentTaskState>,
    summary: Option<String>,
) -> Result<AppServerNotification, serde_json::Error> {
    AppServerNotification::new(
        method::TASK_STATE_CHANGED,
        AgentTaskStateChanged {
            task_id: task_id.into(),
            state,
            previous_state,
            summary,
        },
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppServerRequest {
    pub id: Value,
    pub method: String,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub params: Value,
}

impl AppServerRequest {
    pub fn new(
        id: impl Serialize,
        method: impl Into<String>,
        params: impl Serialize,
    ) -> Result<Self, serde_json::Error> {
        Ok(Self {
            id: serde_json::to_value(id)?,
            method: method.into(),
            params: serde_json::to_value(params)?,
        })
    }

    pub fn parse_params<T: DeserializeOwned>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_value(self.params.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppServerResponse {
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error: Option<AppServerError>,
}

impl AppServerResponse {
    pub fn success(id: impl Serialize, result: impl Serialize) -> Result<Self, serde_json::Error> {
        Ok(Self {
            id: serde_json::to_value(id)?,
            result: Some(serde_json::to_value(result)?),
            error: None,
        })
    }

    pub fn failure(id: Value, code: i32, message: impl Into<String>) -> Self {
        Self {
            id,
            result: None,
            error: Some(AppServerError {
                code,
                message: message.into(),
                data: None,
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppServerNotification {
    pub method: String,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub params: Value,
}

impl AppServerNotification {
    pub fn new(
        method: impl Into<String>,
        params: impl Serialize,
    ) -> Result<Self, serde_json::Error> {
        Ok(Self {
            method: method.into(),
            params: serde_json::to_value(params)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppServerError {
    pub code: i32,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppServerClientInfo {
    pub name: String,
    pub title: String,
    pub version: String,
}

#[allow(clippy::trivially_copy_pass_by_ref)] // serde skip_serializing_if requires fn(&T) -> bool.
fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InitializeParams {
    pub client_info: AppServerClientInfo,
    #[serde(default, skip_serializing_if = "is_false")]
    pub experimental_api: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InitializeResponse {
    pub server_info: AppServerClientInfo,
    pub protocol_version: u32,
    pub capabilities: AppServerCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AppServerCapabilities {
    pub threads: bool,
    pub turns: bool,
    pub streaming: bool,
    pub approvals: bool,
    pub tools: bool,
    pub mcp: bool,
    pub checkpoints: bool,
    pub worktrees: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ThreadStatus {
    Idle,
    Running,
    AwaitingApproval,
    Archived,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperSessionSource {
    Cli,
    Vscode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: DeveloperSessionSource,
    pub status: ThreadStatus,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadStartParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadStartResponse {
    pub thread: ThreadSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperMessage {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadReadResponse {
    pub thread: ThreadSummary,
    pub messages: Vec<DeveloperMessage>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub limit: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub include_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadListResponse {
    pub threads: Vec<ThreadSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadIdParams {
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadForkParams {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub title: Option<String>,
}

/// Per-turn permission posture selected by an interactive developer surface.
///
/// These values intentionally mirror the CLI's existing `PermissionMode`
/// vocabulary without importing an application-layer type into the protocol.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperAgentMode {
    Ask,
    Auto,
    Plan,
    Bypass,
}

/// Reasoning control supported by the current CLI developer runtime.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperReasoningEffort {
    Low,
    Medium,
    High,
    Max,
}

/// Canonical Auto-routing task attached by a presentation client to a local
/// developer turn. The Rust host remains the routing-policy owner; clients
/// classify intent but never select a concrete provider route themselves.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperRoutingTaskType {
    SimpleChat,
    General,
    Coding,
    Reasoning,
    CreativeWriting,
    Multimodal,
    LongContext,
    Research,
    Agentic,
    #[serde(rename = "computer-use")]
    #[ts(rename = "computer-use")]
    ComputerUse,
    ImageGeneration,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnStartParams {
    pub thread_id: String,
    pub input: Vec<UserInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub routing_task_type: Option<DeveloperRoutingTaskType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub agent_mode: Option<DeveloperAgentMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reasoning_effort: Option<DeveloperReasoningEffort>,
    /// Local text files explicitly selected by the client for this session.
    /// The host must canonicalize and constrain every path to its workspace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub context_files: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnSteerParams {
    pub thread_id: String,
    pub input: Vec<UserInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub expected_turn_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TurnStatus {
    Running,
    Completed,
    Interrupted,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnSummary {
    pub id: String,
    pub thread_id: String,
    pub status: TurnStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnStartResponse {
    pub turn: TurnSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnInterruptParams {
    pub thread_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ApprovalResponseParams {
    pub thread_id: String,
    pub turn_id: String,
    pub request_id: String,
    pub decision: ReviewDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AcknowledgedResponse {
    pub acknowledged: bool,
}
