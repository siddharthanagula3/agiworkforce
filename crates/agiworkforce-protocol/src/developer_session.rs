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

use crate::agent_events::{AGENT_EVENT_SCHEMA_VERSION, AgentEvent, AgentEventEnvelope};
use crate::protocol::ReviewDecision;
use crate::task_state::{AgentTaskState, AgentTaskStateChanged};
use crate::user_input::UserInput;

/// Current wire version for the shared CLI/VS Code developer-session protocol.
///
/// Version 8 adds the account, instruction, skill, plugin, MCP, hook, setting
/// and command surfaces that let an editor client ride the CLI instead of
/// keeping a second copy of each. Every v8 method is additive.
pub const DEVELOPER_SESSION_PROTOCOL_VERSION: u32 = 8;

/// Wire versions this server still answers, newest first.
///
/// A client that omits `protocolVersion` in `initialize` is a pre-negotiation
/// client, and those all pin an exact version equality check, so the handshake
/// answers [`LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION`] for them rather than a
/// number they would reject. The added methods stay dispatchable either way:
/// an older client never calls them.
pub const SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS: &[u32] = &[8, 7];

/// Version answered when a client does not state one.
pub const LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION: u32 = 7;

pub mod method {
    pub const INITIALIZE: &str = "initialize";
    pub const INITIALIZED: &str = "initialized";
    pub const THREAD_START: &str = "thread/start";
    pub const THREAD_LIST: &str = "thread/list";
    pub const THREAD_READ: &str = "thread/read";
    pub const THREAD_RESUME: &str = "thread/resume";
    pub const THREAD_FORK: &str = "thread/fork";
    pub const THREAD_ARCHIVE: &str = "thread/archive";
    pub const MODEL_LIST: &str = "model/list";
    pub const TURN_START: &str = "turn/start";
    pub const TURN_STEER: &str = "turn/steer";
    pub const TURN_INTERRUPT: &str = "turn/interrupt";
    pub const TURN_AGENT_EVENT: &str = "turn/agent_event";
    pub const APPROVAL_RESPOND: &str = "approval/respond";
    pub const TASK_STATE_CHANGED: &str = "task/state_changed";
    pub const SHUTDOWN: &str = "shutdown";
    pub const ACCOUNT_STATUS: &str = "account/status";
    pub const ACCOUNT_LOGIN: &str = "account/login";
    pub const ACCOUNT_LOGIN_WAIT: &str = "account/login/wait";
    pub const ACCOUNT_LOGOUT: &str = "account/logout";
    pub const ACCOUNT_TOKEN: &str = "account/token";
    pub const CONTEXT_INSTRUCTIONS: &str = "context/instructions";
    pub const SKILLS_LIST: &str = "skills/list";
    pub const SKILLS_SET_ENABLED: &str = "skills/setEnabled";
    pub const SKILLS_CONSENT: &str = "skills/consent";
    pub const PLUGINS_LIST: &str = "plugins/list";
    pub const PLUGINS_SET_ENABLED: &str = "plugins/setEnabled";
    pub const MCP_LIST: &str = "mcp/list";
    pub const MCP_LOGIN: &str = "mcp/login";
    pub const HOOKS_LIST: &str = "hooks/list";
    pub const SETTINGS_READ: &str = "settings/read";
    pub const SETTINGS_WRITE: &str = "settings/write";
    pub const COMMANDS_LIST: &str = "commands/list";
    pub const COMMANDS_RUN: &str = "commands/run";
}

/// Build a canonical, ordered agent-activity notification for developer-session
/// clients. `session_id` is the developer thread id; `turn_id` scopes the
/// monotonically increasing `sequence` counter supplied by the turn host.
pub fn agent_event_notification(
    session_id: impl Into<String>,
    turn_id: impl Into<String>,
    sequence: u64,
    event: AgentEvent,
) -> Result<AppServerNotification, serde_json::Error> {
    let emitted_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or_default();
    AppServerNotification::new(
        method::TURN_AGENT_EVENT,
        AgentEventEnvelope {
            schema_version: AGENT_EVENT_SCHEMA_VERSION,
            session_id: session_id.into(),
            turn_id: turn_id.into(),
            sequence,
            emitted_at_ms,
            event,
        },
    )
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
    /// Wire version this client speaks. Omitted by pre-negotiation clients,
    /// which are answered with [`LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub protocol_version: Option<u32>,
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
    pub models: bool,
    /// v8 surfaces. Each is false on a host that does not implement that
    /// family, so a client hides the control instead of calling a method that
    /// answers "unavailable".
    #[serde(default, skip_serializing_if = "is_false")]
    pub account: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub instructions: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub skills: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub plugins: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub hooks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub settings: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub commands: bool,
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
    Desktop,
}

/// Durable trust boundary for a developer session.
///
/// `Unknown` is reserved for legacy sessions that predate persisted routing
/// authority. Clients may list those sessions, but must not silently resume or
/// send a turn until the user explicitly chooses a new boundary.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperSessionTrustMode {
    Local,
    Byok,
    Managed,
    Unknown,
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
    /// Provider route persisted by the CLI host (for example `anthropic`,
    /// `ollama`, a custom provider name, or `managed_cloud`). This is metadata,
    /// never authority supplied by a presentation client.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub provider: Option<String>,
    pub trust_mode: DeveloperSessionTrustMode,
    pub created_at: String,
    pub updated_at: String,
    pub created_by: DeveloperSessionSource,
    pub status: ThreadStatus,
    /// Checked-out branch of the thread's workspace, as it was when the host
    /// last persisted it. A host records this at thread start and refreshes it
    /// when a turn ends; nothing recomputes it while listing, so a list of a
    /// hundred threads costs no git invocations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub git_branch: Option<String>,
    /// Top level of the thread's git worktree, persisted alongside the branch.
    /// Distinct from `cwd`: a thread started in a subdirectory shares its
    /// worktree root with every other thread in the same checkout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub worktree_root: Option<String>,
    /// `clientInfo.name` from the `initialize` of the connection that created
    /// the thread. `created_by` is the coarse surface; this is the exact
    /// client, so two clients that both map to one surface stay tellable
    /// apart.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub client: Option<String>,
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
    pub provider: Option<LocalModelProvider>,
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
    /// Whether `messages` is a bounded newest-message window rather than the
    /// thread's complete persisted transcript.
    pub transcript_truncated: bool,
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

/// One model discovered from a local-only runtime owned by the CLI.
///
/// The developer client receives only the provider and model identifier needed
/// for presentation and selection. Base URLs and probe diagnostics stay inside
/// the trusted CLI boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct LocalModelSummary {
    pub id: String,
    pub provider: LocalModelProvider,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum LocalModelProvider {
    Ollama,
    Lmstudio,
}

impl LocalModelProvider {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ollama => "ollama",
            Self::Lmstudio => "lmstudio",
        }
    }
}

/// Why a model on this host cannot be used right now.
///
/// The same vocabulary a failed turn would have produced, because it is
/// derived from the same code. A list that invented its own words could
/// promise a model that a turn then refuses, which is worse than saying
/// nothing: the user picks it, spends a turn, and is told something the host
/// already knew.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ModelUnreachable {
    pub code: TurnFailureCode,
    pub action: TurnFailureAction,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub provider: Option<String>,
}

/// One model this host knows about, and whether it can actually reach it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HostModelSummary {
    pub id: String,
    /// Route name as the host knows it, not a display name.
    pub provider: String,
    /// Whether a turn on this model could start. Not whether it is allowed:
    /// a session in Local privacy mode still refuses a network route however
    /// reachable it is, and that decision stays with the client.
    pub reachable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unreachable: Option<ModelUnreachable>,
    /// The boundary a turn on this model would cross, so a client can apply
    /// its own privacy rule without a second lookup.
    pub trust_mode: DeveloperSessionTrustMode,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ModelListParams {
    /// Recompute instead of answering from what this session already resolved.
    ///
    /// Reachability costs a local probe per local runtime and a credential
    /// lookup per route, so it is resolved once and reused. A client asks for
    /// a fresh answer after the user signs in or starts a local server.
    #[serde(default, skip_serializing_if = "is_false")]
    pub refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct LocalModelListResponse {
    pub models: Vec<LocalModelSummary>,
    /// Every route this host knows about with its verdict. Absent from a host
    /// that predates it, where a client has nothing to go on but `models` and
    /// its own history, which is what this replaces.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub host_models: Vec<HostModelSummary>,
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

/// Why a turn ended without completing.
///
/// The closed set a client may branch on. A free-text `error` string tells a
/// user what happened; it cannot tell a client whether to offer a sign-in
/// button, a retry, or nothing at all, because that decision cannot be made by
/// matching on prose that changes with every provider.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TurnFailureCode {
    /// The route has no credential at all. Distinct from an invalid one: the
    /// user has never signed in, so there is nothing to refresh.
    ProviderAuthMissing,
    /// A credential exists and the provider rejected it.
    ProviderAuthInvalid,
    ProviderRateLimited,
    /// The provider answered, but not with a usable response: 5xx, capacity,
    /// or a stream that died after the handshake.
    ProviderUnavailable,
    ContextWindowExceeded,
    /// The request never reached the provider.
    Network,
    /// A tool call was refused: by the user at the approval prompt, or by
    /// policy.
    ToolDenied,
    /// The user or the client stopped the turn.
    Interrupted,
    Timeout,
    /// The turn was rejected before any provider call: bad params, an
    /// unroutable model, a broken config, an unsupported operation.
    InvalidRequest,
    Unknown,
}

/// What a client should offer the user next.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TurnFailureAction {
    /// Send the user to a sign-in for `provider`.
    SignInProvider,
    /// Send the user to settings: the route, the model, or the config is wrong.
    OpenSettings,
    /// Running the same turn again may work.
    Retry,
    /// Nothing for the client to offer.
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnFailure {
    pub code: TurnFailureCode,
    /// The same human-readable text as the notification's `error` field.
    pub message: String,
    /// The route that failed, when the failure belongs to one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub provider: Option<String>,
    pub retryable: bool,
    pub action: TurnFailureAction,
}

impl TurnFailure {
    pub fn new(code: TurnFailureCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            provider: None,
            retryable: code.is_retryable(),
            action: code.default_action(),
        }
    }

    pub fn with_provider(mut self, provider: impl Into<String>) -> Self {
        self.provider = Some(provider.into());
        self
    }

    /// Classify an engine error.
    ///
    /// The CLI carries its own richer taxonomy and classifies from that first;
    /// this is the fallback for the shared engine's errors, so the two hosts
    /// cannot drift into separate code sets.
    pub fn from_agiworkforce_err(error: &crate::error::AgiworkforceErr) -> Self {
        use crate::error::AgiworkforceErr as E;
        let code = match error {
            E::ContextWindowExceeded => TurnFailureCode::ContextWindowExceeded,
            E::Interrupted | E::TurnAborted => TurnFailureCode::Interrupted,
            E::Timeout => TurnFailureCode::Timeout,
            E::ConnectionFailed(_) => TurnFailureCode::Network,
            E::UsageLimitReached(_) | E::QuotaExceeded => TurnFailureCode::ProviderRateLimited,
            E::RefreshTokenFailed(_) => TurnFailureCode::ProviderAuthInvalid,
            E::UsageNotIncluded => TurnFailureCode::ProviderAuthMissing,
            E::Stream(..)
            | E::ServerOverloaded
            | E::InternalServerError
            | E::ResponseStreamFailed(_)
            | E::RetryLimit(_)
            | E::UnexpectedStatus(_) => TurnFailureCode::ProviderUnavailable,
            E::InvalidRequest(_)
            | E::InvalidImageRequest()
            | E::UnsupportedOperation(_)
            | E::ThreadNotFound(_)
            | E::AgentLimitReached { .. }
            | E::EnvVar(_) => TurnFailureCode::InvalidRequest,
            E::Sandbox(_) | E::CyberPolicy { .. } | E::LandlockSandboxExecutableNotProvided => {
                TurnFailureCode::ToolDenied
            }
            _ => TurnFailureCode::Unknown,
        };
        Self::new(code, error.to_string())
    }
}

impl TurnFailureCode {
    pub fn is_retryable(self) -> bool {
        matches!(
            self,
            TurnFailureCode::ProviderRateLimited
                | TurnFailureCode::ProviderUnavailable
                | TurnFailureCode::Network
                | TurnFailureCode::Timeout
        )
    }

    pub fn default_action(self) -> TurnFailureAction {
        match self {
            TurnFailureCode::ProviderAuthMissing | TurnFailureCode::ProviderAuthInvalid => {
                TurnFailureAction::SignInProvider
            }
            TurnFailureCode::ContextWindowExceeded | TurnFailureCode::InvalidRequest => {
                TurnFailureAction::OpenSettings
            }
            TurnFailureCode::ProviderRateLimited
            | TurnFailureCode::ProviderUnavailable
            | TurnFailureCode::Network
            | TurnFailureCode::Timeout => TurnFailureAction::Retry,
            TurnFailureCode::ToolDenied
            | TurnFailureCode::Interrupted
            | TurnFailureCode::Unknown => TurnFailureAction::None,
        }
    }
}

/// Params of the `turn/completed` and `turn/failed` notifications.
///
/// One shape for both so a client parses the end of a turn once. `failure` is
/// null on a completed turn and populated on a failed one; `error` carries the
/// same text as `failure.message` and stays for clients that predate the typed
/// object.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnEndedNotification {
    pub thread_id: String,
    pub turn_id: String,
    pub status: TurnStatus,
    pub response: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub error: Option<String>,
    pub failure: Option<TurnFailure>,
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

// ---------------------------------------------------------------------------
// v8: account, instructions, skills, plugins, MCP, hooks, settings, commands
// ---------------------------------------------------------------------------

/// Where an account answer came from. The CLI credential store is the only
/// source today; a client must never present its own token as this identity.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum AccountSource {
    Cli,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AccountStatusParams {
    /// Bypass the cache and re-read the account from the hosted API. Without
    /// it the host answers from its on-disk cache and touches the network only
    /// once that cache has expired.
    #[serde(default, skip_serializing_if = "is_false")]
    pub refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AccountStatusResponse {
    pub signed_in: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub email: Option<String>,
    /// Canonical billing tier exactly as the account holds it, never a
    /// routing-collapsed group.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tier: Option<String>,
    /// Plan allowance left in the current monthly window, in credits. Absent
    /// when the server states no allowance for this plan.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub balance_credits: Option<f64>,
    /// Separately purchased credit balance. Absent when the lookup failed,
    /// which is not the same as a zero balance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub purchased_credits: Option<f64>,
    /// True when the answer came from cache without a network read.
    pub cached: bool,
    pub source: AccountSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AccountLoginResponse {
    /// Opaque handle for this in-flight login, passed back to
    /// [`method::ACCOUNT_LOGIN_WAIT`].
    pub login_id: String,
    pub verification_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub user_code: Option<String>,
    /// RFC 3339 instant after which the device code stops being accepted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AccountLoginWaitParams {
    pub login_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum AccountLoginOutcome {
    Completed,
    Expired,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AccountLoginWaitResponse {
    pub outcome: AccountLoginOutcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message: Option<String>,
    pub account: AccountStatusResponse,
}

/// Bearer credential minted from the CLI's own stored credential.
///
/// The host refuses this method on any connection that did not prove it holds
/// the loopback app-server token, so a page that reaches the WebSocket port
/// cannot exfiltrate the user's account credential.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AccountTokenResponse {
    pub token: String,
    /// RFC 3339 expiry. Absent when the stored credential states none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ContextInstructionsParams {
    /// Directory the turn would run in. Defaults to the workspace this
    /// app-server is scoped to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
pub enum InstructionFileKind {
    #[serde(rename = "AGENTS.md")]
    #[ts(rename = "AGENTS.md")]
    Agents,
    #[serde(rename = "CLAUDE.md")]
    #[ts(rename = "CLAUDE.md")]
    Claude,
    #[serde(rename = "instructions.md")]
    #[ts(rename = "instructions.md")]
    AgiInstructions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InstructionFile {
    pub path: String,
    pub kind: InstructionFileKind,
    pub bytes: u32,
    /// Directory the file was discovered in, the ancestor whose instructions
    /// this file contributes.
    pub root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ContextInstructionsResponse {
    /// Exactly the files the host loads for a turn in `cwd`, in load order.
    pub files: Vec<InstructionFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_root: Option<String>,
    /// True when the instruction budget stopped the walk before every
    /// discovered file was included, so the preview and the turn agree.
    pub truncated: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum SkillCatalogScope {
    Project,
    User,
    Plugin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
    pub scope: SkillCatalogScope,
    pub path: String,
    /// False when the user turned this skill off; a disabled skill is never
    /// offered to the model on either surface.
    pub enabled: bool,
    /// Project skills load only after explicit per-workspace consent. User and
    /// plugin skills carry no consent gate and report `true`.
    pub consented: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillListResponse {
    pub skills: Vec<SkillSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillSetEnabledParams {
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillConsentParams {
    /// Granting consent lets this workspace's `.agiworkforce/skills` load on
    /// every run of either surface; revoking deletes that record.
    pub granted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillConsentResponse {
    pub consented: bool,
    pub path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum PluginScope {
    User,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PluginSummary {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub version: Option<String>,
    pub enabled: bool,
    /// Directory family the plugin was loaded from.
    pub source: PluginScope,
    pub path: String,
    /// Manifest dialect the plugin declared, when it declared one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PluginListResponse {
    pub plugins: Vec<PluginSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PluginSetEnabledParams {
    pub id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum McpServerScope {
    Project,
    User,
    Plugin,
}

/// Credential posture of a discovered MCP server, decided without opening a
/// connection. It never claims a server is reachable.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum McpServerConfiguredStatus {
    /// Runs locally, or carries its own credential header.
    Configured,
    /// A remote server with a stored OAuth token.
    Authorized,
    /// A remote server with neither a stored token nor a credential header.
    NeedsAuth,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpServerSummary {
    pub name: String,
    /// `stdio`, `sse` or `http`.
    pub transport: String,
    pub scope: McpServerScope,
    pub status: McpServerConfiguredStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpServerListResponse {
    pub servers: Vec<McpServerSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpLoginParams {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpLoginResponse {
    pub name: String,
    pub status: McpServerConfiguredStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HookConfigScope {
    User,
    Plugin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HookSummary {
    pub event: String,
    pub command: String,
    pub scope: HookConfigScope,
    /// Plugin hooks from a project-local plugin directory never run; they are
    /// listed so the reason a hook is inert is visible.
    pub trusted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HookListResponse {
    pub hooks: Vec<HookSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SettingsReadResponse {
    /// Model id the CLI starts a session with when a turn names none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub default_effort: Option<DeveloperReasoningEffort>,
    /// Permission posture applied when a surface names none. `bypass` is never
    /// stored here: a persisted setting must not disable every approval.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub permission_mode: Option<DeveloperAgentMode>,
    /// Contents of the user-scope instruction file, the one every workspace
    /// under the home directory inherits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub user_instructions: Option<String>,
    /// Contents of this workspace's instruction file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_instructions: Option<String>,
    pub user_instructions_path: String,
    pub project_instructions_path: String,
    pub config_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SettingsWriteParams {
    /// Every field is optional: an omitted field is left untouched. An empty
    /// instruction string deletes that instruction file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub default_effort: Option<DeveloperReasoningEffort>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub permission_mode: Option<DeveloperAgentMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub user_instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_instructions: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum CommandSourceKind {
    Builtin,
    Skill,
    Prompt,
    Plugin,
    Mcp,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SlashCommandSummary {
    /// Name without the leading slash.
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub args_hint: Option<String>,
    pub source: CommandSourceKind,
    pub aliases: Vec<String>,
    /// True when [`method::COMMANDS_RUN`] can execute this command outside a
    /// terminal. A client must not offer the others as buttons.
    pub runnable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SlashCommandListResponse {
    pub commands: Vec<SlashCommandSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SlashCommandRunParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub args: Option<String>,
}

/// Shape of a command result so a client renders it instead of parsing prose.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum SlashCommandResultKind {
    Text,
    Skills,
    Plugins,
    Mcp,
    Hooks,
    Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SlashCommandRunResponse {
    pub kind: SlashCommandResultKind,
    /// Human-readable rendering, always present so a client can fall back to
    /// showing text for a payload shape it does not know.
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub payload: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_events::{
        AGENT_EVENT_SCHEMA_VERSION, AgentEvent, AgentEventToolCategory,
        AgentEventToolExecutionStart,
    };

    #[test]
    fn developer_session_v8_wraps_canonical_agent_events() {
        assert_eq!(DEVELOPER_SESSION_PROTOCOL_VERSION, 8);
        assert!(
            SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS
                .contains(&LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION)
        );

        let notification = agent_event_notification(
            "thread-1",
            "turn-1",
            7,
            AgentEvent::ToolExecutionStart(AgentEventToolExecutionStart {
                tool_call_id: "tool-1".to_string(),
                name: "web_search".to_string(),
                category: AgentEventToolCategory::WebSearch,
                summary: "Searching official sources".to_string(),
                input: serde_json::json!({ "query": "AGI Workforce" }),
            }),
        )
        .expect("canonical agent event notification");

        assert_eq!(notification.method, method::TURN_AGENT_EVENT);
        assert_eq!(
            notification.params["schemaVersion"],
            AGENT_EVENT_SCHEMA_VERSION
        );
        assert_eq!(notification.params["sessionId"], "thread-1");
        assert_eq!(notification.params["turnId"], "turn-1");
        assert_eq!(notification.params["sequence"], 7);
        assert_eq!(notification.params["event"]["type"], "tool-execution-start");
        assert!(
            notification.params["emittedAtMs"]
                .as_i64()
                .is_some_and(|value| value > 0)
        );
    }
}
