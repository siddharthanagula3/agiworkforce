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

/// Oldest wire version this server still answers. A client below it is
/// refused at `initialize` with [`ProtocolVersionUnsupportedData`].
pub const MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION: u32 =
    SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS
        [SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.len() - 1];

/// JSON-RPC error code for an `initialize` naming a version this server does
/// not answer.
pub const PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE: i32 = -32005;

pub mod method {
    pub const INITIALIZE: &str = "initialize";
    pub const INITIALIZED: &str = "initialized";
    pub const THREAD_START: &str = "thread/start";
    pub const THREAD_LIST: &str = "thread/list";
    pub const THREAD_READ: &str = "thread/read";
    pub const THREAD_RESUME: &str = "thread/resume";
    pub const THREAD_FORK: &str = "thread/fork";
    pub const THREAD_HANDOFF: &str = "thread/handoff";
    pub const THREAD_HANDOFF_ACCEPT: &str = "thread/handoff/accept";
    pub const THREAD_ARCHIVE: &str = "thread/archive";
    pub const THREAD_DELETE: &str = "thread/delete";
    pub const THREAD_RECONNECT: &str = "thread/reconnect";
    pub const THREAD_WRITER_RELEASE: &str = "thread/writer/release";
    pub const THREAD_WRITER_TAKEOVER: &str = "thread/writer/takeover";
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
    /// Schema version of every `turn/agent_event` envelope this connection
    /// will carry. Absent from servers that predate it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub agent_event_schema_version: Option<u32>,
    /// Oldest protocol version this server answers. Absent from servers that
    /// predate it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub minimum_protocol_version: Option<u32>,
}

/// `data` of the [`PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE`] refusal, so a
/// client can say which side must upgrade instead of echoing prose.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ProtocolVersionUnsupportedData {
    pub requested_protocol_version: u32,
    pub supported_protocol_versions: Vec<u32>,
    pub minimum_protocol_version: u32,
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
    /// `thread/delete` removes a thread and everything persisted with it.
    #[serde(default, skip_serializing_if = "is_false")]
    pub thread_delete: bool,
    /// `thread/reconnect` returns the live state of a running turn, so a
    /// client that lost its connection resumes rendering without a gap.
    #[serde(default, skip_serializing_if = "is_false")]
    pub reconnect: bool,
    /// Threads carry a writer lease, and `thread/writer/*` hand it over.
    #[serde(default, skip_serializing_if = "is_false")]
    pub writer_lease: bool,
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
    /// A state this build does not know. Never produced by this crate; every
    /// client maps a status it cannot name onto this instead of rejecting the
    /// whole payload, which is what would drop a usable thread list because
    /// one newer thread in it is in a state this build predates.
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperSessionSource {
    Cli,
    Vscode,
    Desktop,
    /// A surface this build does not know, on the same terms as
    /// [`ThreadStatus::Unknown`].
    Unknown,
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
    /// Checked-out branch as the host last persisted it. Listing never
    /// recomputes it, so a long list costs no git invocations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub git_branch: Option<String>,
    /// Top level of the thread's git worktree. Distinct from `cwd`, which may
    /// be a subdirectory of it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub worktree_root: Option<String>,
    /// `clientInfo.name` of the connection that created the thread, where
    /// `created_by` is only the coarse surface.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub client: Option<String>,
    /// Remote the thread's repository fetches from, with any credential
    /// stripped, as the host last persisted it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub repository: Option<String>,
    /// Process currently entitled to append turns to this thread. Absent when
    /// no writer has claimed it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub writer: Option<DeveloperSessionWriter>,
}

/// A time-bounded claim on the right to append turns to a thread.
///
/// Every process that runs turns on a thread holds one while it works and
/// renews it; a claim that is not renewed before `expires_at` is stale and the
/// next writer takes it over.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperSessionWriter {
    pub holder_id: String,
    /// Which program holds the claim, for a person deciding whether to take it.
    pub holder_label: String,
    pub acquired_at: String,
    pub expires_at: String,
    /// True when the answering host is the holder.
    pub held_by_this_host: bool,
    /// True when the claim has lapsed and the next writer will take it over.
    pub stale: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperSessionWriterChange {
    /// The host claimed a thread nobody held.
    Acquired,
    /// The previous claim had lapsed, so this host took it without asking.
    StaleTakeover,
    /// The user explicitly took the thread from a live writer.
    TakenOver,
    /// The holder gave the thread up.
    Released,
}

/// Params of `thread/writer_changed`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadWriterChangedNotification {
    pub thread_id: String,
    pub change: DeveloperSessionWriterChange,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub writer: Option<DeveloperSessionWriter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub previous: Option<DeveloperSessionWriter>,
}

/// `data` of the conflict a turn gets when another live process holds the
/// thread, so a client can offer a takeover naming who would lose it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadWriterConflictData {
    pub thread_id: String,
    pub writer: DeveloperSessionWriter,
}

/// JSON-RPC error code for a turn refused because another live process holds
/// the thread's writer lease.
pub const THREAD_WRITER_CONFLICT_ERROR_CODE: i32 = -32011;

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
    /// Every approval decided on this thread, oldest first.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub approvals: Vec<DeveloperSessionApproval>,
    /// Every file a tool on this thread wrote, oldest first. An entry whose
    /// `kind` is `created` is a file the thread generated.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub file_changes: Vec<DeveloperSessionFileChange>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperApprovalOutcome {
    AllowOnce,
    AllowSession,
    AlwaysAllow,
    Deny,
    Cancel,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperSessionApproval {
    pub request_id: String,
    pub kind: String,
    pub summary: String,
    pub outcome: DeveloperApprovalOutcome,
    pub requested_at: String,
    pub decided_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperFileChangeKind {
    Created,
    Modified,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperSessionFileChange {
    pub path: String,
    pub kind: DeveloperFileChangeKind,
    pub tool: String,
    pub tool_call_id: String,
    pub changed_at: String,
}

/// A pending approval as `approval/requested` announced it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PendingApprovalSnapshot {
    pub request_id: String,
    pub kind: String,
    pub summary: String,
    pub detail: String,
}

/// Everything a client needs to render a turn it joined mid-flight.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ActiveTurnSnapshot {
    pub turn_id: String,
    /// Output streamed so far.
    pub partial_response: String,
    /// `index` of the first `turn/output_delta` not already in
    /// `partial_response`; a client drops deltas below it.
    pub next_delta_index: u64,
    /// `sequence` of the first `turn/agent_event` this snapshot does not
    /// account for.
    pub next_event_sequence: u64,
    pub pending_approvals: Vec<PendingApprovalSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadReconnectResponse {
    pub thread: ThreadSummary,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub active_turn: Option<ActiveTurnSnapshot>,
}

/// Params of `turn/model`: the route a turn is running on, sent when the turn
/// starts and again whenever a fallback moves it to another model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnModelNotification {
    pub thread_id: String,
    pub turn_id: String,
    pub model: String,
    pub provider: String,
    pub trust_mode: DeveloperSessionTrustMode,
    /// The Auto profile that chose `model`, when one did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub auto_selection: Option<String>,
    /// Model the turn left, when this notification reports a fallback.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fallback_from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub fallback_reason: Option<String>,
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
    /// Whether a turn on this model could start. Not whether it is allowed.
    pub reachable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unreachable: Option<ModelUnreachable>,
    /// The boundary a turn on this model would cross.
    pub trust_mode: DeveloperSessionTrustMode,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ModelListParams {
    /// Recompute instead of answering from what this session already resolved.
    #[serde(default, skip_serializing_if = "is_false")]
    pub refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct LocalModelListResponse {
    pub models: Vec<LocalModelSummary>,
    /// Every route this host knows about with its verdict.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub host_models: Vec<HostModelSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadIdParams {
    pub thread_id: String,
}

/// Ask a thread for the record another surface needs to carry it on.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadHandoffParams {
    pub thread_id: String,
    /// Where the work is going. The record is addressed to it, and a surface
    /// that is not it refuses the handoff rather than taking someone else's.
    pub to_environment: HandoffEnvironment,
}

/// Offer a handoff to this surface. The answer is an admission or a refusal;
/// neither one inherits a decision the origin was still waiting on.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadHandoffAcceptParams {
    pub handoff: DeveloperSessionHandoff,
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
/// This is the one permission-mode vocabulary for every developer surface. The
/// CLI, VS Code, the desktop shell and the Chrome bridge each spell it their
/// own way in their own settings; [`DeveloperAgentMode::from_client_spelling`]
/// is where those spellings become one value, so a session opened on one
/// surface and resumed on another runs under the same posture.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperAgentMode {
    Ask,
    Auto,
    Plan,
    Bypass,
}

/// Every posture on the wire, weakest first. A surface that offers a choice
/// offers exactly these.
pub const DEVELOPER_AGENT_MODES: &[DeveloperAgentMode] = &[
    DeveloperAgentMode::Plan,
    DeveloperAgentMode::Ask,
    DeveloperAgentMode::Auto,
    DeveloperAgentMode::Bypass,
];

impl DeveloperAgentMode {
    /// The value as it appears on the wire and in every persisted setting.
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::Ask => "ask",
            Self::Auto => "auto",
            Self::Plan => "plan",
            Self::Bypass => "bypass",
        }
    }

    /// Read a posture out of any surface's own spelling.
    ///
    /// Separators and case are ignored, so `acceptEdits`, `accept-edits` and
    /// `accept_edits` are one value. An unknown word returns `None` rather than
    /// a default, because a vocabulary this does not know must never widen a
    /// posture by accident.
    pub fn from_client_spelling(raw: &str) -> Option<Self> {
        match raw
            .trim()
            .to_ascii_lowercase()
            .replace(['-', '_', ' '], "")
            .as_str()
        {
            // `default` is the CLI's name for the posture that prompts, and
            // `dontask` is its headless refusal to prompt: neither may approve
            // anything on its own, so both are `Ask` on the wire.
            "ask" | "default" | "dontask" => Some(Self::Ask),
            "auto" | "acceptedits" => Some(Self::Auto),
            "plan" => Some(Self::Plan),
            "bypass" | "bypasspermissions" => Some(Self::Bypass),
            _ => None,
        }
    }

    /// Whether a turn in this posture may act without asking first.
    pub const fn approves_without_asking(self) -> bool {
        matches!(self, Self::Auto | Self::Bypass)
    }

    /// Whether this posture leaves the workspace untouched.
    pub const fn is_read_only(self) -> bool {
        matches!(self, Self::Plan)
    }
}

/// Outcome of the `initialize` version handshake, identical for every surface
/// pairing: CLI to app server, VS Code to app server, desktop shell to the CLI
/// it spawned, and the Chrome bridge to the local client.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeveloperSessionNegotiation {
    /// The client named a version this server answers.
    Agreed(u32),
    /// The client named none, so it predates negotiation and pins an exact
    /// equality check against [`LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION`].
    Legacy(u32),
    /// Refused at `initialize` with
    /// [`PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE`].
    Unsupported(ProtocolVersionUnsupportedData),
}

/// The single compatibility rule behind every developer-surface handshake.
///
/// A newer server keeps answering an older client for as long as its version
/// stays in [`SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS`]: the added
/// methods are additive and an older client never calls them, which is how a
/// new backend feature degrades gracefully instead of dropping the session.
pub fn negotiate_developer_session_protocol(requested: Option<u32>) -> DeveloperSessionNegotiation {
    match requested {
        None => DeveloperSessionNegotiation::Legacy(LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION),
        Some(version) if SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.contains(&version) => {
            DeveloperSessionNegotiation::Agreed(version)
        }
        Some(version) => DeveloperSessionNegotiation::Unsupported(ProtocolVersionUnsupportedData {
            requested_protocol_version: version,
            supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.to_vec(),
            minimum_protocol_version: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
        }),
    }
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
    /// Client-chosen idempotency key. A `turn/start` repeating the key of a
    /// turn the host already accepted on this thread answers that turn instead
    /// of starting a second one, so a retry after a dropped connection never
    /// runs the same tools twice.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub client_turn_id: Option<String>,
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

/// Why a turn ended without completing: the closed set a client may branch on,
/// which prose that changes with every provider cannot be.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum TurnFailureCode {
    /// The route has no credential at all, so there is nothing to refresh.
    ProviderAuthMissing,
    /// No AGI Workforce session, and no other route can run the model.
    AccountSignedOut,
    /// Signed in, but the account's plan does not include the model.
    PlanExcludesModel,
    /// A credential exists and the provider rejected it.
    ProviderAuthInvalid,
    ProviderRateLimited,
    /// The provider answered without a usable response.
    ProviderUnavailable,
    ContextWindowExceeded,
    /// The request never reached the provider.
    Network,
    /// A tool call was refused, at the approval prompt or by policy.
    ToolDenied,
    /// The user or the client stopped the turn.
    Interrupted,
    Timeout,
    /// The turn was rejected before any provider call.
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
    /// Send the user to the AGI Workforce sign-in.
    SignInAccount,
    /// Send the user to the account's upgrade route.
    UpgradePlan,
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
    /// The failure as one sentence; the notification's `error` field keeps the
    /// terminal rendering with its provider prefix.
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

    /// Fallback for the shared engine's errors, so a host with its own richer
    /// taxonomy cannot drift into a separate code set.
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
            TurnFailureCode::AccountSignedOut => TurnFailureAction::SignInAccount,
            TurnFailureCode::PlanExcludesModel => TurnFailureAction::UpgradePlan,
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

/// Params of both `turn/completed` and `turn/failed`, one shape so a client
/// parses the end of a turn once. `error` stays for clients that predate
/// `failure` and carries the same text.
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

/// Where a session's work was running, and where a handoff sends it.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HandoffEnvironment {
    Local,
    Cloud,
}

/// What produced a handoff. A chat or work thread seeds a new coding session;
/// a developer session continues under its own id.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HandoffOrigin {
    Chat,
    Work,
    DeveloperSession,
}

/// A resource that exists only on the machine that ran the session. None of
/// these cross a handoff; the receiving surface starts its own.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HandoffLocalResource {
    BackgroundShell,
    DevServer,
    McpServer,
    Sandbox,
    FileWatcher,
    Terminal,
}

/// Every local resource a handoff can report. A surface that runs any of them
/// lists it here so the receiver restarts it rather than assuming it arrived.
pub const HANDOFF_LOCAL_RESOURCES: &[HandoffLocalResource] = &[
    HandoffLocalResource::BackgroundShell,
    HandoffLocalResource::DevServer,
    HandoffLocalResource::McpServer,
    HandoffLocalResource::Sandbox,
    HandoffLocalResource::FileWatcher,
    HandoffLocalResource::Terminal,
];

impl HandoffLocalResource {
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::BackgroundShell => "background_shell",
            Self::DevServer => "dev_server",
            Self::McpServer => "mcp_server",
            Self::Sandbox => "sandbox",
            Self::FileWatcher => "file_watcher",
            Self::Terminal => "terminal",
        }
    }

    /// What the receiving surface has to do about it, named for the user.
    pub const fn restart_label(self) -> &'static str {
        match self {
            Self::BackgroundShell => "background shells do not travel; rerun what you still need",
            Self::DevServer => "the dev server is not running here; start it again",
            Self::McpServer => "MCP servers reconnect on this machine",
            Self::Sandbox => "the sandbox is rebuilt here from the workspace",
            Self::FileWatcher => "file watchers are re-established for this checkout",
            Self::Terminal => "open terminals stay on the machine that had them",
        }
    }
}

/// The checkout a session was working in, as the producing surface last saw it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffWorkspace {
    pub cwd: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub worktree_root: Option<String>,
    /// Fetch URL of the repository with any credential stripped, which is how
    /// the receiving surface recognises the same repository on another machine.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub repository: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub head_commit: Option<String>,
    /// True when the origin had uncommitted work, which the receiver cannot
    /// reproduce from `head_commit` alone.
    #[serde(default, skip_serializing_if = "is_false")]
    pub uncommitted_changes: bool,
}

/// The permission posture the session was running under.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffPosture {
    pub agent_mode: DeveloperAgentMode,
    pub trust_mode: DeveloperSessionTrustMode,
    pub permission_profile_id: String,
}

/// A decision the session made and is expected to keep after the move.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffDecision {
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub rationale: Option<String>,
    pub decided_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HandoffPlanStepState {
    Pending,
    InProgress,
    Done,
    Abandoned,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffPlanStep {
    pub description: String,
    pub state: HandoffPlanStepState,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HandoffValidationOutcome {
    Passed,
    Failed,
    /// Started on the origin and never finished, so its result is not known.
    Interrupted,
}

/// One check the session ran against the work, so the receiving surface knows
/// what has already been proved and what has not.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffValidation {
    pub command: String,
    pub outcome: HandoffValidationOutcome,
    pub ran_at: String,
    /// Commit the check ran against, which tells the receiver whether it still
    /// applies to the tree it has.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub commit: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum HandoffTurnState {
    Completed,
    /// The origin was mid-turn when the handoff was produced. A receiver
    /// reports it as interrupted; it never continues a turn it did not run.
    Interrupted,
}

/// How the last turn on the origin ended.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffLastTurn {
    pub turn_id: String,
    pub state: HandoffTurnState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    pub ended_at: String,
}

/// Everything one surface hands another when a session moves between them.
///
/// Nothing in it is a live handle: the record is the whole of what travels, so
/// a receiver rebuilds its own processes instead of inheriting any.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperSessionHandoff {
    /// Version the producing surface speaks. A receiver that cannot speak it
    /// refuses the handoff rather than reading fields by guesswork.
    pub protocol_version: u32,
    pub thread_id: String,
    pub origin: HandoffOrigin,
    pub issued_by: DeveloperSessionSource,
    pub issued_at: String,
    pub from_environment: HandoffEnvironment,
    pub to_environment: HandoffEnvironment,
    pub workspace: HandoffWorkspace,
    pub posture: HandoffPosture,
    /// What the session is trying to achieve, in the user's terms.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub objective: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub decisions: Vec<HandoffDecision>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plan: Vec<HandoffPlanStep>,
    /// Every file the session changed, so the receiver knows the work even
    /// when the tree it opens is at a different commit.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modified_files: Vec<DeveloperSessionFileChange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub validations: Vec<HandoffValidation>,
    /// Approvals the origin was still waiting on. They are re-asked here; a
    /// decision is never inherited across the move.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pending_approvals: Vec<PendingApprovalSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_turn: Option<HandoffLastTurn>,
    /// Local resources the origin was running. Each one is restarted here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub local_resources: Vec<HandoffLocalResource>,
}

/// Why a receiving surface will not take a handoff.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase", tag = "reason")]
#[ts(rename_all = "camelCase", tag = "reason")]
pub enum HandoffRefusal {
    #[serde(rename_all = "camelCase")]
    #[ts(rename_all = "camelCase")]
    ProtocolVersionUnsupported {
        requested_protocol_version: u32,
        supported_protocol_versions: Vec<u32>,
    },
    #[serde(rename_all = "camelCase")]
    #[ts(rename_all = "camelCase")]
    WrongDestination {
        expected: HandoffEnvironment,
        received: HandoffEnvironment,
    },
    /// The posture on record predates persisted routing authority, so resuming
    /// it would run turns under a boundary nobody chose.
    TrustModeUnknown,
}

impl HandoffRefusal {
    pub fn label(&self) -> String {
        match self {
            Self::ProtocolVersionUnsupported {
                requested_protocol_version,
                ..
            } => format!("this build does not speak handoff version {requested_protocol_version}"),
            Self::WrongDestination { expected, received } => {
                format!("the handoff names {received:?} and this surface is {expected:?}")
            }
            Self::TrustModeUnknown => {
                "the session's trust boundary is unknown, so choose one before resuming".to_string()
            }
        }
    }
}

/// Whether a handoff continues an existing thread or seeds a new one.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase", tag = "kind")]
#[ts(rename_all = "camelCase", tag = "kind")]
pub enum HandoffStart {
    #[serde(rename_all = "camelCase")]
    #[ts(rename_all = "camelCase")]
    Resume { thread_id: String },
    /// A chat or work thread handed the objective over; the coding session is
    /// new and carries the objective and plan as its starting context.
    #[serde(rename_all = "camelCase")]
    #[ts(rename_all = "camelCase")]
    Seed { seeded_from_thread_id: String },
}

/// What a receiving surface does with an accepted handoff.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffAdmission {
    pub start: HandoffStart,
    /// Local resources to start here, because none of them travelled.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub restart: Vec<HandoffLocalResource>,
    /// The turn the origin never finished, reported rather than continued.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub interrupted_turn: Option<String>,
    /// Approvals to ask again on this surface.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reask: Vec<PendingApprovalSnapshot>,
}

impl DeveloperSessionHandoff {
    /// Take the handoff on a surface running in `here`, or say why not.
    pub fn accept(&self, here: HandoffEnvironment) -> Result<HandoffAdmission, HandoffRefusal> {
        if !SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.contains(&self.protocol_version) {
            return Err(HandoffRefusal::ProtocolVersionUnsupported {
                requested_protocol_version: self.protocol_version,
                supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.to_vec(),
            });
        }
        if self.to_environment != here {
            return Err(HandoffRefusal::WrongDestination {
                expected: here,
                received: self.to_environment,
            });
        }
        if self.posture.trust_mode == DeveloperSessionTrustMode::Unknown {
            return Err(HandoffRefusal::TrustModeUnknown);
        }
        let start = match self.origin {
            HandoffOrigin::DeveloperSession => HandoffStart::Resume {
                thread_id: self.thread_id.clone(),
            },
            HandoffOrigin::Chat | HandoffOrigin::Work => HandoffStart::Seed {
                seeded_from_thread_id: self.thread_id.clone(),
            },
        };
        Ok(HandoffAdmission {
            start,
            restart: self.local_resources.clone(),
            interrupted_turn: self.last_turn.as_ref().and_then(|turn| {
                (turn.state == HandoffTurnState::Interrupted).then(|| turn.turn_id.clone())
            }),
            reask: self.pending_approvals.clone(),
        })
    }
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
        assert_eq!(
            SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.last(),
            Some(&MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION)
        );
        const {
            assert!(
                MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION
                    <= LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION
            )
        };
        assert_eq!(
            SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.first(),
            Some(&DEVELOPER_SESSION_PROTOCOL_VERSION),
            "the list is newest first and clients pin an exact version, so dropping the current one refuses every up-to-date client at initialize"
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

    fn repo_file(relative: &str) -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join(relative);
        std::fs::read_to_string(&path).unwrap_or_else(|error| {
            panic!("{relative} is the surface this contract covers: {error}")
        })
    }

    /// Every spelling inside `text` between `open` and the next `close`.
    fn quoted_between(text: &str, open: &str, close: &str) -> Vec<String> {
        let start = text
            .find(open)
            .unwrap_or_else(|| panic!("{open} is present"));
        let rest = &text[start + open.len()..];
        let end = rest
            .find(close)
            .unwrap_or_else(|| panic!("{close} closes it"));
        rest[..end]
            .split('\'')
            .skip(1)
            .step_by(2)
            .map(str::to_string)
            .collect()
    }

    fn cli_permission_mode_vocabulary() -> Vec<String> {
        let source = repo_file("apps/cli/src/cli_options.rs");
        let start = source
            .find("pub enum PermissionMode {")
            .expect("the CLI still declares PermissionMode");
        let body = &source[start..];
        let end = body.find("\n}").expect("the enum closes");
        body[..end]
            .lines()
            .filter_map(|line| {
                let line = line.trim();
                if let Some(rest) = line.strip_prefix("#[value(name = \"") {
                    return rest.split('"').next().map(str::to_string);
                }
                let ident = line.trim_end_matches(',');
                if !ident.is_empty()
                    && ident.chars().all(|c| c.is_ascii_alphanumeric())
                    && ident.starts_with(char::is_uppercase)
                {
                    return Some(ident.to_string());
                }
                None
            })
            .collect()
    }

    #[test]
    fn one_permission_mode_vocabulary_covers_every_developer_surface() {
        let cli = cli_permission_mode_vocabulary();
        assert!(
            cli.len() >= 5,
            "expected the CLI's full PermissionMode vocabulary, read {cli:?}"
        );

        let vscode = quoted_between(
            &repo_file("apps/extension-vscode/src/features/permissions/agentModeConsent.ts"),
            "export type ExtensionAgentMode =",
            ";",
        );
        assert_eq!(vscode.len(), 4, "read the VS Code vocabulary: {vscode:?}");

        let shared = quoted_between(
            &repo_file("packages/contracts/local-runtime/src/developer-session.ts"),
            "export const DEVELOPER_AGENT_MODES =",
            "]",
        );
        assert_eq!(shared.len(), DEVELOPER_AGENT_MODES.len());

        for spelling in cli.iter().chain(vscode.iter()).chain(shared.iter()) {
            assert!(
                DeveloperAgentMode::from_client_spelling(spelling).is_some(),
                "{spelling} is a surface's own name for a posture and must land on the shared enum"
            );
        }

        // The shared contract is the wire enum itself, not a fifth vocabulary.
        let mut wire: Vec<&str> = DEVELOPER_AGENT_MODES
            .iter()
            .map(|m| m.wire_name())
            .collect();
        wire.sort_unstable();
        let mut mirrored: Vec<&str> = shared.iter().map(String::as_str).collect();
        mirrored.sort_unstable();
        assert_eq!(wire, mirrored);
        let mut editor: Vec<&str> = vscode.iter().map(String::as_str).collect();
        editor.sort_unstable();
        assert_eq!(wire, editor);
    }

    #[test]
    fn a_posture_means_the_same_thing_on_every_surface() {
        for mode in DEVELOPER_AGENT_MODES {
            assert_eq!(
                DeveloperAgentMode::from_client_spelling(mode.wire_name()),
                Some(*mode)
            );
        }
        assert_eq!(
            DeveloperAgentMode::from_client_spelling("acceptEdits"),
            Some(DeveloperAgentMode::Auto)
        );
        assert_eq!(
            DeveloperAgentMode::from_client_spelling("accept-edits"),
            DeveloperAgentMode::from_client_spelling("accept_edits")
        );
        assert_eq!(
            DeveloperAgentMode::from_client_spelling("bypassPermissions"),
            Some(DeveloperAgentMode::Bypass)
        );
        // Headless refuses to prompt; it never gains the right to approve.
        assert_eq!(
            DeveloperAgentMode::from_client_spelling("dontAsk"),
            Some(DeveloperAgentMode::Ask)
        );
        assert_eq!(DeveloperAgentMode::from_client_spelling("yolo"), None);
        assert_eq!(DeveloperAgentMode::from_client_spelling(""), None);

        assert!(DeveloperAgentMode::Plan.is_read_only());
        assert!(!DeveloperAgentMode::Ask.approves_without_asking());
        assert!(DeveloperAgentMode::Auto.approves_without_asking());
        assert!(DeveloperAgentMode::Bypass.approves_without_asking());
    }

    #[test]
    fn every_surface_pairing_negotiates_by_the_same_rule() {
        let pairings = [
            DeveloperSessionSource::Cli,
            DeveloperSessionSource::Vscode,
            DeveloperSessionSource::Desktop,
            // The Chrome bridge reaches the CLI through the local client and
            // has no source of its own yet, so it handshakes as Unknown.
            DeveloperSessionSource::Unknown,
        ];
        for surface in pairings {
            assert_eq!(
                negotiate_developer_session_protocol(Some(DEVELOPER_SESSION_PROTOCOL_VERSION)),
                DeveloperSessionNegotiation::Agreed(DEVELOPER_SESSION_PROTOCOL_VERSION),
                "{surface:?} speaking the current version"
            );
            assert_eq!(
                negotiate_developer_session_protocol(Some(
                    MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION
                )),
                DeveloperSessionNegotiation::Agreed(MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION),
                "{surface:?} one version behind still runs"
            );
            assert_eq!(
                negotiate_developer_session_protocol(None),
                DeveloperSessionNegotiation::Legacy(LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION),
                "{surface:?} predating negotiation"
            );
        }

        let too_old = negotiate_developer_session_protocol(Some(
            MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION - 1,
        ));
        assert_eq!(
            too_old,
            DeveloperSessionNegotiation::Unsupported(ProtocolVersionUnsupportedData {
                requested_protocol_version: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION - 1,
                supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.to_vec(),
                minimum_protocol_version: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
            })
        );
        assert!(matches!(
            negotiate_developer_session_protocol(Some(DEVELOPER_SESSION_PROTOCOL_VERSION + 1)),
            DeveloperSessionNegotiation::Unsupported(_)
        ));
    }

    /// Every part of the working state a handoff is required to carry, by the
    /// wire name a receiving surface reads.
    const HANDOFF_REQUIRED_CONTENT: &[&str] = &[
        "protocolVersion",
        "threadId",
        "workspace",
        "posture",
        "objective",
        "decisions",
        "plan",
        "modifiedFiles",
        "validations",
        "pendingApprovals",
        "lastTurn",
    ];

    fn populated_handoff() -> DeveloperSessionHandoff {
        DeveloperSessionHandoff {
            protocol_version: DEVELOPER_SESSION_PROTOCOL_VERSION,
            thread_id: "thread-1".to_string(),
            origin: HandoffOrigin::DeveloperSession,
            issued_by: DeveloperSessionSource::Cli,
            issued_at: "2026-09-20T10:00:00Z".to_string(),
            from_environment: HandoffEnvironment::Local,
            to_environment: HandoffEnvironment::Cloud,
            workspace: HandoffWorkspace {
                cwd: "/work/repo/app".to_string(),
                worktree_root: Some("/work/repo".to_string()),
                repository: Some("https://example.invalid/team/repo.git".to_string()),
                branch: Some("feature".to_string()),
                head_commit: Some("abc123".to_string()),
                uncommitted_changes: true,
            },
            posture: HandoffPosture {
                agent_mode: DeveloperAgentMode::Ask,
                trust_mode: DeveloperSessionTrustMode::Byok,
                permission_profile_id: "standard".to_string(),
            },
            objective: Some("make the importer resume after a failed batch".to_string()),
            decisions: vec![HandoffDecision {
                summary: "keep the existing queue table".to_string(),
                rationale: Some("a new table would need a backfill".to_string()),
                decided_at: "2026-09-20T09:30:00Z".to_string(),
            }],
            plan: vec![
                HandoffPlanStep {
                    description: "record the last completed batch".to_string(),
                    state: HandoffPlanStepState::Done,
                },
                HandoffPlanStep {
                    description: "resume from it on restart".to_string(),
                    state: HandoffPlanStepState::InProgress,
                },
            ],
            modified_files: vec![DeveloperSessionFileChange {
                path: "src/importer.rs".to_string(),
                kind: DeveloperFileChangeKind::Modified,
                tool: "edit_file".to_string(),
                tool_call_id: "call-1".to_string(),
                changed_at: "2026-09-20T09:45:00Z".to_string(),
            }],
            validations: vec![HandoffValidation {
                command: "cargo test -p importer".to_string(),
                outcome: HandoffValidationOutcome::Failed,
                ran_at: "2026-09-20T09:50:00Z".to_string(),
                commit: Some("abc123".to_string()),
            }],
            pending_approvals: vec![PendingApprovalSnapshot {
                request_id: "req-1".to_string(),
                kind: "exec".to_string(),
                summary: "run the migration".to_string(),
                detail: "psql -f migrate.sql".to_string(),
            }],
            last_turn: Some(HandoffLastTurn {
                turn_id: "turn-9".to_string(),
                state: HandoffTurnState::Interrupted,
                model: Some("a-model".to_string()),
                ended_at: "2026-09-20T09:59:00Z".to_string(),
            }),
            local_resources: HANDOFF_LOCAL_RESOURCES.to_vec(),
        }
    }

    #[test]
    fn a_handoff_carries_every_part_of_the_working_state_across_the_wire() {
        let handoff = populated_handoff();
        let wire = serde_json::to_value(&handoff).expect("serialize");
        let object = wire.as_object().expect("an object");
        for field in HANDOFF_REQUIRED_CONTENT {
            assert!(
                object.contains_key(*field),
                "a handoff must carry {field}: {object:?}"
            );
        }

        let back: DeveloperSessionHandoff = serde_json::from_value(wire).expect("round trip");
        assert_eq!(back, handoff);
        assert_eq!(
            back.objective.as_deref(),
            Some("make the importer resume after a failed batch")
        );
        assert_eq!(back.decisions, handoff.decisions);
        assert_eq!(back.plan, handoff.plan);
        assert_eq!(back.modified_files, handoff.modified_files);
        assert_eq!(back.validations, handoff.validations);
        assert_eq!(
            back.validations[0].outcome,
            HandoffValidationOutcome::Failed,
            "a check that failed on the origin is not reported as proved here"
        );
    }

    #[test]
    fn a_handoff_travels_in_both_directions_and_only_to_the_surface_it_names() {
        let outbound = populated_handoff();
        assert_eq!(outbound.from_environment, HandoffEnvironment::Local);

        let refused = outbound
            .accept(HandoffEnvironment::Local)
            .expect_err("a handoff bound for the cloud is not taken locally");
        assert_eq!(
            refused,
            HandoffRefusal::WrongDestination {
                expected: HandoffEnvironment::Local,
                received: HandoffEnvironment::Cloud,
            }
        );
        let admitted = outbound
            .accept(HandoffEnvironment::Cloud)
            .expect("the cloud takes it");
        assert_eq!(
            admitted.start,
            HandoffStart::Resume {
                thread_id: "thread-1".to_string()
            }
        );

        let inbound = DeveloperSessionHandoff {
            from_environment: HandoffEnvironment::Cloud,
            to_environment: HandoffEnvironment::Local,
            issued_by: DeveloperSessionSource::Unknown,
            ..populated_handoff()
        };
        let back_home = inbound
            .accept(HandoffEnvironment::Local)
            .expect("the local surface takes it");
        assert_eq!(
            back_home.start,
            HandoffStart::Resume {
                thread_id: "thread-1".to_string()
            }
        );
    }

    #[test]
    fn a_chat_or_work_handoff_seeds_a_new_coding_session_rather_than_resuming_one() {
        for origin in [HandoffOrigin::Chat, HandoffOrigin::Work] {
            let handoff = DeveloperSessionHandoff {
                origin,
                to_environment: HandoffEnvironment::Local,
                ..populated_handoff()
            };
            let admitted = handoff.accept(HandoffEnvironment::Local).expect("accepted");
            assert_eq!(
                admitted.start,
                HandoffStart::Seed {
                    seeded_from_thread_id: "thread-1".to_string()
                },
                "{origin:?} starts a coding session"
            );
            assert!(handoff.objective.is_some(), "{origin:?} carries what to do");
        }

        let session = DeveloperSessionHandoff {
            origin: HandoffOrigin::DeveloperSession,
            to_environment: HandoffEnvironment::Local,
            ..populated_handoff()
        };
        assert_eq!(
            session
                .accept(HandoffEnvironment::Local)
                .expect("accepted")
                .start,
            HandoffStart::Resume {
                thread_id: "thread-1".to_string()
            }
        );
    }

    #[test]
    fn no_local_resource_survives_a_handoff_and_an_unfinished_turn_is_not_continued() {
        let handoff = DeveloperSessionHandoff {
            to_environment: HandoffEnvironment::Local,
            ..populated_handoff()
        };
        let admitted = handoff.accept(HandoffEnvironment::Local).expect("accepted");

        for resource in HANDOFF_LOCAL_RESOURCES {
            assert!(
                admitted.restart.contains(resource),
                "{resource:?} must be restarted on the receiving surface"
            );
            assert!(!resource.restart_label().is_empty());
        }

        assert_eq!(admitted.interrupted_turn.as_deref(), Some("turn-9"));
        assert_eq!(
            admitted.reask, handoff.pending_approvals,
            "an approval decided on the origin is asked again here"
        );

        let wire = serde_json::to_string(&handoff).expect("serialize");
        for handle in ["pid", "fileDescriptor", "socket", "processId"] {
            assert!(
                !wire.contains(handle),
                "a handoff carries no live {handle}: {wire}"
            );
        }
    }

    #[test]
    fn a_handoff_is_refused_when_the_receiver_cannot_speak_it_or_the_posture_is_unknown() {
        let future = DeveloperSessionHandoff {
            protocol_version: DEVELOPER_SESSION_PROTOCOL_VERSION + 1,
            to_environment: HandoffEnvironment::Local,
            ..populated_handoff()
        };
        assert_eq!(
            future.accept(HandoffEnvironment::Local),
            Err(HandoffRefusal::ProtocolVersionUnsupported {
                requested_protocol_version: DEVELOPER_SESSION_PROTOCOL_VERSION + 1,
                supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.to_vec(),
            })
        );

        let legacy = DeveloperSessionHandoff {
            protocol_version: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
            to_environment: HandoffEnvironment::Local,
            ..populated_handoff()
        };
        assert!(legacy.accept(HandoffEnvironment::Local).is_ok());

        let unknown_posture = DeveloperSessionHandoff {
            to_environment: HandoffEnvironment::Local,
            posture: HandoffPosture {
                trust_mode: DeveloperSessionTrustMode::Unknown,
                ..populated_handoff().posture
            },
            ..populated_handoff()
        };
        assert_eq!(
            unknown_posture.accept(HandoffEnvironment::Local),
            Err(HandoffRefusal::TrustModeUnknown)
        );
        assert!(!HandoffRefusal::TrustModeUnknown.label().is_empty());
    }
}
