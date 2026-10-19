//! Stable local developer-session protocol shared by AGI CLI and AGI for VS Code.
//!
//! The wire is bidirectional JSON: newline-delimited frames over stdio or one
//! JSON object per authenticated WebSocket text frame. Requests and responses
//! carry an `id`; notifications omit it. Method names follow the
//! thread/turn/item vocabulary used by modern coding-agent app servers while
//! all payloads and trust decisions remain AGI-owned.

use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::agent_events::{
    AGENT_EVENT_SCHEMA_VERSION, AgentEvent, AgentEventApprovalRiskLevel, AgentEventEnvelope,
};
use crate::protocol::{ExecPolicyAmendment, ReviewDecision};
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
    pub const THREAD_COMPACT: &str = "thread/compact";
    pub const THREAD_HANDOFF: &str = "thread/handoff";
    pub const THREAD_HANDOFF_ACCEPT: &str = "thread/handoff/accept";
    pub const THREAD_ARCHIVE: &str = "thread/archive";
    pub const THREAD_UNARCHIVE: &str = "thread/unarchive";
    pub const THREAD_SEARCH: &str = "thread/search";
    pub const THREAD_CHECKPOINTS: &str = "thread/checkpoints";
    pub const THREAD_REWIND: &str = "thread/rewind";
    pub const THREAD_PLAN: &str = "thread/plan";
    pub const THREAD_DELETE: &str = "thread/delete";
    pub const WORKSPACE_IDENTITY: &str = "workspace/identity";
    pub const THREAD_RECONNECT: &str = "thread/reconnect";
    pub const THREAD_WRITER_RELEASE: &str = "thread/writer/release";
    pub const THREAD_WRITER_TAKEOVER: &str = "thread/writer/takeover";
    pub const MODEL_LIST: &str = "model/list";
    pub const TURN_START: &str = "turn/start";
    pub const TURN_STEER: &str = "turn/steer";
    pub const TURN_INTERRUPT: &str = "turn/interrupt";
    pub const TURN_AGENT_EVENT: &str = "turn/agent_event";
    pub const APPROVAL_RESPOND: &str = "approval/respond";
    pub const USER_INPUT_REQUESTED: &str = "userInput/requested";
    pub const USER_INPUT_RESPOND: &str = "userInput/respond";
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
    pub const SKILLS_INSTALL: &str = "skills/install";
    pub const SKILLS_REMOVE: &str = "skills/remove";
    pub const PLUGINS_LIST: &str = "plugins/list";
    pub const PLUGINS_SET_ENABLED: &str = "plugins/setEnabled";
    pub const PLUGINS_INSTALL: &str = "plugins/install";
    pub const PLUGINS_REMOVE: &str = "plugins/remove";
    pub const PLUGINS_UPDATE: &str = "plugins/update";
    pub const MCP_LIST: &str = "mcp/list";
    pub const MCP_LOGIN: &str = "mcp/login";
    pub const MCP_TEST: &str = "mcp/test";
    pub const MCP_TOOLS: &str = "mcp/tools";
    pub const MCP_INSPECT: &str = "mcp/inspect";
    pub const MCP_AUTH_REQUIRED: &str = "mcp/authRequired";
    pub const MCP_ADD: &str = "mcp/add";
    pub const MCP_REMOVE: &str = "mcp/remove";
    pub const MCP_APPROVAL_READ: &str = "mcp/approval/read";
    pub const MCP_APPROVAL_GRANT: &str = "mcp/approval/grant";
    pub const HOOKS_LIST: &str = "hooks/list";
    pub const HOOKS_ADD: &str = "hooks/add";
    pub const HOOKS_REMOVE: &str = "hooks/remove";
    pub const SETTINGS_READ: &str = "settings/read";
    pub const SETTINGS_WRITE: &str = "settings/write";
    pub const COMMANDS_LIST: &str = "commands/list";
    pub const COMMANDS_RUN: &str = "commands/run";
    pub const MEMORY_ADD: &str = "memory/add";
    pub const WORKTREE_CREATE: &str = "worktree/create";
    pub const WORKTREE_LIST: &str = "worktree/list";
    pub const WORKTREE_REMOVE: &str = "worktree/remove";
    pub const PERMISSIONS_LIST: &str = "permissions/list";
    pub const PERMISSIONS_REMOVE: &str = "permissions/remove";
    pub const PERMISSIONS_RULES: &str = "permissions/rules";
    pub const PERMISSIONS_ADD: &str = "permissions/add";
    pub const TRUST_LIST: &str = "trust/list";
    pub const TRUST_REVOKE: &str = "trust/revoke";
    pub const PROVIDERS_LIST: &str = "providers/list";
    pub const PROVIDERS_SET_KEY: &str = "providers/setKey";
    pub const PROVIDERS_REMOVE_KEY: &str = "providers/removeKey";
    pub const PLAN_DECIDE: &str = "plan/decide";
    pub const GIT_PULL_REQUEST_PLAN: &str = "git/pullRequest/plan";
    pub const GIT_PULL_REQUEST: &str = "git/pullRequest";
    pub const MANAGED_WORKTREE_CREATE: &str = "worktree/managed/create";
    pub const MANAGED_WORKTREE_LIST: &str = "worktree/managed/list";
    pub const WORKTREE_DELETE: &str = "worktree/managed/delete";
    pub const WORKTREE_PIN: &str = "worktree/managed/pin";
    pub const WORKTREE_KEEP: &str = "worktree/managed/keep";
    pub const WORKTREE_APPLY_TO_LOCAL: &str = "worktree/managed/applyToLocal";
    pub const WORKTREE_SETUP_RUN: &str = "worktree/managed/setup/run";
    pub const WORKTREE_SETUP_LOG: &str = "worktree/managed/setup/log";
    pub const WORKTREE_SETUP_FINISHED: &str = "worktree/managed/setup/finished";
    pub const CHECKPOINT_LIST: &str = "checkpoint/list";
    pub const CHECKPOINT_DIFF: &str = "checkpoint/diff";
    pub const CHECKPOINT_REVERT: &str = "checkpoint/revert";
    pub const CHECKPOINT_STAGE: &str = "checkpoint/stage";
    pub const THREAD_REVERT: &str = "thread/revert";
    pub const THREAD_SIDE_QUESTION: &str = "thread/sideQuestion";
    pub const THREAD_SIDE_QUESTION_DELTA: &str = "thread/sideQuestion/delta";
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

#[allow(clippy::trivially_copy_pass_by_ref)] // serde skip_serializing_if requires fn(&T) -> bool.
fn is_zero(value: &u32) -> bool {
    *value == 0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct InitializeParams {
    pub client_info: AppServerClientInfo,
    #[serde(default, skip_serializing_if = "is_false")]
    pub experimental_api: bool,
    /// The client renders `userInput/requested` and answers it with
    /// `userInput/respond`. A host puts the agent's questions only to a client
    /// that says so; for any other client `ask_user` is refused at once.
    #[serde(default, skip_serializing_if = "is_false")]
    pub user_input: bool,
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
    #[serde(default, skip_serializing_if = "is_false")]
    pub thread_unarchive: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub thread_search: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub fork_at_message: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub prompt_commands: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub max_turns: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub memory: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub plan: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub approval_notes: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub approval_edits: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub mcp_tools: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub installs: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub saved_permissions: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub mcp_inspect: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub plugin_updates: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub permission_rules: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub trust: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub turn_tool_filters: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub provider_keys: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub questions: bool,
    /// `plan/decide` approves or rejects the plan a plan-mode turn proposed.
    #[serde(default, skip_serializing_if = "is_false")]
    pub plan_decisions: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub pull_requests: bool,
    /// `thread/fork` honours `throughTurnId`. A host without it ignores the
    /// field and copies the whole conversation, so a client offers a branch
    /// from a turn only when this is true.
    #[serde(default, skip_serializing_if = "is_false")]
    pub fork_through_turn: bool,
    /// `thread/compact` summarizes the conversation the model reads, from a
    /// turn on or the older part of all of it.
    #[serde(default, skip_serializing_if = "is_false")]
    pub thread_compact: bool,
    /// A `turn/start` that names no `agentMode` runs in the thread's last
    /// saved mode, which is never bypass: bypass ends with the turn that
    /// named it. A host without this keeps whatever the last turn ran in, so
    /// a client names a mode on every turn it sends there.
    #[serde(default, skip_serializing_if = "is_false")]
    pub bypass_per_turn: bool,
    /// `thread/revert` honours `restore`. A host without it ignores the field
    /// and rewinds both, so a client offers code-only and conversation-only
    /// only when this is true.
    #[serde(default, skip_serializing_if = "is_false")]
    pub revert_restore: bool,
    /// `mcp/approval/read` and `mcp/approval/grant` let a client ask its user
    /// about a project server that `mcp/list` reports as `needs_approval`.
    /// Without them such a server can be approved only in a terminal.
    #[serde(default, skip_serializing_if = "is_false")]
    pub mcp_approval: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub managed_worktrees: bool,
    /// `thread/sideQuestion` answers from a thread's conversation without
    /// adding to it.
    #[serde(default, skip_serializing_if = "is_false")]
    pub side_question: bool,
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
    /// Where the thread runs. Absent for a thread on this machine; `cloud`
    /// for a cloud Code session listed beside the local ones.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub location: Option<ThreadLocation>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ThreadLocation {
    Local,
    Cloud,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub index: Option<u32>,
    /// The turn this message belongs to, where the host checkpointed that turn
    /// and the conversation can still rewind to it. Absent otherwise, and in
    /// every transcript stored before turns were recorded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub child_tasks: Option<Vec<DeveloperChildTask>>,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plan: Vec<DeveloperPlanStep>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub todos: Vec<DeveloperTodo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperWorkspaceIdentity {
    pub cwd: String,
    pub root_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperChildTask {
    pub id: String,
    pub parent_session_id: String,
    pub title: String,
    pub state: DeveloperChildTaskState,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperChildTaskState {
    Queued,
    Running,
    Paused,
    AwaitingInput,
    Completed,
    Cancelled,
    Failed,
}

impl From<&crate::code_domain::CodeTask> for DeveloperChildTask {
    fn from(task: &crate::code_domain::CodeTask) -> Self {
        use crate::code_domain::CodeTaskState;
        Self {
            id: task.id.as_str().to_string(),
            parent_session_id: task.session_id.as_str().to_string(),
            title: task.title.chars().take(200).collect(),
            state: match task.state {
                CodeTaskState::Queued => DeveloperChildTaskState::Queued,
                CodeTaskState::Running => DeveloperChildTaskState::Running,
                CodeTaskState::Paused => DeveloperChildTaskState::Paused,
                CodeTaskState::AwaitingInput => DeveloperChildTaskState::AwaitingInput,
                CodeTaskState::Completed => DeveloperChildTaskState::Completed,
                CodeTaskState::Cancelled => DeveloperChildTaskState::Cancelled,
                CodeTaskState::Failed { .. } => DeveloperChildTaskState::Failed,
            },
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperStepStatus {
    Pending,
    InProgress,
    Done,
    Blocked,
    Skipped,
    Superseded,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperPlanStep {
    pub description: String,
    pub status: DeveloperStepStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct DeveloperTodo {
    pub content: String,
    pub status: DeveloperStepStatus,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpAuthRequiredNotification {
    pub thread_id: String,
    pub turn_id: String,
    pub tool_call_id: String,
    pub server: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub connect_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadPlanNotification {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub plan: Option<Vec<DeveloperPlanStep>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub todos: Option<Vec<DeveloperTodo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadCheckpoint {
    pub checkpoint_index: u32,
    pub created_at: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message_index: Option<u32>,
    pub tracked_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadCheckpointsResponse {
    pub checkpoints: Vec<ThreadCheckpoint>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum ThreadRewindRestore {
    Both,
    Conversation,
    Code,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadRewindParams {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub checkpoint_index: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message_index: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub restore: Option<ThreadRewindRestore>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct RewindSkippedFile {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadRewindResponse {
    pub thread: ThreadSummary,
    pub prompt: String,
    pub conversation_restored: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub restored_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub removed_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skipped_files: Vec<RewindSkippedFile>,
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
    Deleted,
}

/// What kind of file a change touched. A surface renders a test, a manifest
/// and a generated file differently because a reader weighs them differently.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum FileChangeSubject {
    Source,
    Test,
    Manifest,
    Lockfile,
    Generated,
    Documentation,
    Configuration,
}

impl FileChangeSubject {
    pub const ALL: &'static [FileChangeSubject] = &[
        Self::Source,
        Self::Test,
        Self::Manifest,
        Self::Lockfile,
        Self::Generated,
        Self::Documentation,
        Self::Configuration,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Source => "source",
            Self::Test => "test",
            Self::Manifest => "dependency manifest",
            Self::Lockfile => "lockfile",
            Self::Generated => "generated file",
            Self::Documentation => "documentation",
            Self::Configuration => "configuration",
        }
    }
}

/// Something about a change a reader would want told before it lands. None of
/// these refuse the change; they stop it from happening unremarked.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum FileChangeNotice {
    DebugInstrumentation,
    TestChanged,
    DependencyAdded,
    GeneratedFileEdited,
    LockfileEditedByHand,
}

impl FileChangeNotice {
    pub const ALL: &'static [FileChangeNotice] = &[
        Self::DebugInstrumentation,
        Self::TestChanged,
        Self::DependencyAdded,
        Self::GeneratedFileEdited,
        Self::LockfileEditedByHand,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::DebugInstrumentation => "left a debugging aid behind",
            Self::TestChanged => "changed an existing test",
            Self::DependencyAdded => "added a dependency",
            Self::GeneratedFileEdited => "edited a file a generator owns",
            Self::LockfileEditedByHand => "wrote a lockfile by hand",
        }
    }
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
    /// Why the file changed, in one line a surface can show beside the path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub subject: Option<FileChangeSubject>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notices: Vec<FileChangeNotice>,
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
    /// How hard the host wants the user to think before allowing this. The
    /// host classifies the call it is about to make; a client that renders an
    /// approval without this is asking the user to classify it themselves.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub risk_level: Option<AgentEventApprovalRiskLevel>,
    /// Whether allowing this leaves the user able to put things back. Absent
    /// when the host did not decide, which a client must read as "not stated",
    /// never as "yes".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reversible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub proposed_content: Option<String>,
    #[serde(default)]
    pub always_allow_saved: bool,
    /// The command rule the host offers for an "always allow" answer. That
    /// answer must send exactly this prefix; absent, the command can only be
    /// approved once or for the session.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub proposed_execpolicy_amendment: Option<ExecPolicyAmendment>,
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
    /// Questions the agent asked that are still waiting for an answer.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pending_user_inputs: Vec<PendingUserInputSnapshot>,
}

/// A question as `userInput/requested` announced it, for a client that joins
/// the turn after it was asked.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PendingUserInputSnapshot {
    pub request_id: String,
    pub question: String,
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
    /// Also list the account's open cloud Code sessions, after the local
    /// threads on the first page.
    #[serde(default, skip_serializing_if = "is_false")]
    pub include_cloud: bool,
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

/// A question about a thread that is answered and then forgotten: neither the
/// question nor the answer joins the conversation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSideQuestionParams {
    pub thread_id: String,
    pub question: String,
    /// Echoed on each `thread/sideQuestion/delta`, so a client with more than
    /// one question open can tell their streams apart.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSideQuestionResponse {
    pub answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSideQuestionDelta {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub request_id: Option<String>,
    pub delta: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSearchParams {
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub limit: Option<u32>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub include_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSearchMatch {
    pub message_index: u32,
    pub role: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSearchHit {
    pub thread: ThreadSummary,
    pub title_matched: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub matches: Vec<ThreadSearchMatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadSearchResponse {
    pub hits: Vec<ThreadSearchHit>,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub local_servers: Vec<LocalServerStatus>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum LocalServerHealth {
    Running,
    NotRunning,
    Unhealthy,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct LocalServerStatus {
    pub provider: LocalModelProvider,
    pub health: LocalServerHealth,
    pub model_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub message: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub through_message_index: Option<u32>,
    /// Carry the conversation only through the end of this turn. Absent, the
    /// fork carries all of it. Files in the workspace are never changed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub through_turn_id: Option<String>,
}

/// Summarize what the model reads of a thread. With `fromTurnId`, the turns
/// before it stay word for word and can still be rewound to, and that turn
/// onward becomes one summary; without it, the older part of the whole
/// conversation does. `thread/read` still returns every message; only the
/// model's context changes. The summarized turns can no longer be rewound
/// to, so a user-facing caller confirms first.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadCompactParams {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub from_turn_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadCompactResponse {
    pub thread_id: String,
    /// False when nothing was old enough to summarize; the thread is then
    /// unchanged.
    pub compacted: bool,
    pub messages_summarized: u32,
    pub tokens_before: u32,
    pub tokens_after: u32,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub max_turns: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub routing_profile: Option<DeveloperRoutingProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cloud_project_id: Option<String>,
    /// Tools this thread may use from this turn on. `Some(empty)` clears the
    /// allow list; the host's own boundary rules still apply on top.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub allowed_tools: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub disallowed_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum DeveloperRoutingProfile {
    Auto,
    Speed,
    Quality,
    Cost,
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
    /// The account reached a usage limit its own plan sets. The model and the
    /// credential are both fine; the reader has spent what this billing window
    /// gives them.
    UsageLimitReached,
    /// A credential exists and the provider rejected it.
    ProviderAuthInvalid,
    /// The provider is refusing new requests for a moment. A caller that waits
    /// and sends the same turn again can expect it to run.
    ProviderRateLimited,
    /// The allowance every reader on the free plan shares is spent. This is
    /// not a limit on the reader's own account and not a momentary rate limit:
    /// it reopens on the provider's schedule, not on a retry.
    FreeAllowanceExhausted,
    /// The provider answered without a usable response.
    ProviderUnavailable,
    /// The provider had begun answering and the connection ended before the
    /// answer did. Nobody asked for it to stop, which is what separates this
    /// from [`TurnFailureCode::Interrupted`].
    StreamInterrupted,
    ContextWindowExceeded,
    /// The answer reached the model's maximum output length and stopped there.
    /// The turn ran; it is the length of the reply that was cut, so sending
    /// the identical turn again produces the identical truncation.
    OutputLimitReached,
    /// The provider's safety layer stopped the response. Named separately from
    /// every other refusal because the remedy is to rephrase the request, not
    /// to change a model, a key or a plan.
    RefusedBySafety,
    /// The request never reached the provider.
    Network,
    /// A tool call was refused, at the approval prompt or by policy.
    ToolDenied,
    /// The user or the client cancelled the turn. A turn nobody cancelled that
    /// stopped part way through is [`TurnFailureCode::StreamInterrupted`].
    Interrupted,
    Timeout,
    /// The turn was rejected before any provider call.
    InvalidRequest,
    Unknown,
}

/// Every failure code on the wire, so a surface that renders failures can be
/// held to the whole set rather than to the members someone remembered.
pub const TURN_FAILURE_CODES: &[TurnFailureCode] = &[
    TurnFailureCode::ProviderAuthMissing,
    TurnFailureCode::AccountSignedOut,
    TurnFailureCode::PlanExcludesModel,
    TurnFailureCode::UsageLimitReached,
    TurnFailureCode::ProviderAuthInvalid,
    TurnFailureCode::ProviderRateLimited,
    TurnFailureCode::FreeAllowanceExhausted,
    TurnFailureCode::ProviderUnavailable,
    TurnFailureCode::StreamInterrupted,
    TurnFailureCode::ContextWindowExceeded,
    TurnFailureCode::OutputLimitReached,
    TurnFailureCode::RefusedBySafety,
    TurnFailureCode::Network,
    TurnFailureCode::ToolDenied,
    TurnFailureCode::Interrupted,
    TurnFailureCode::Timeout,
    TurnFailureCode::InvalidRequest,
    TurnFailureCode::Unknown,
];

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
    /// How long to wait before sending the turn again, in seconds, and only
    /// ever the figure a provider itself supplied. A surface states a wait
    /// when this is present and states none when it is not: a reader who waits
    /// out a number nobody sent, and fails again, stops believing the next one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub retry_after_seconds: Option<u32>,
    /// The id the host recorded this failure under, so a reader has one string
    /// to quote that finds the turn. Absent when the host recorded none, never
    /// a placeholder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub alternative_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub resets_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub recovery_href: Option<String>,
}

/// A day is the longest wait worth stating. Past it the figure is a provider's
/// clock skew or a header read wrong, and a sentence built on it is worse than
/// no sentence at all.
pub const MAX_STATED_RETRY_AFTER_SECONDS: u32 = 86_400;

impl TurnFailure {
    pub fn new(code: TurnFailureCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            provider: None,
            retryable: code.is_retryable(),
            action: code.default_action(),
            retry_after_seconds: None,
            request_id: None,
            alternative_model: None,
            resets_at: None,
            recovery_href: None,
        }
    }

    pub fn with_limit_recovery(
        mut self,
        alternative_model: Option<String>,
        resets_at: Option<String>,
        recovery_href: Option<String>,
    ) -> Self {
        self.alternative_model = alternative_model.filter(|model| !model.trim().is_empty());
        self.resets_at = resets_at.filter(|at| !at.trim().is_empty());
        self.recovery_href = recovery_href.filter(|href| !href.trim().is_empty());
        self
    }

    pub fn with_provider(mut self, provider: impl Into<String>) -> Self {
        self.provider = Some(provider.into());
        self
    }

    /// Carry a wait a provider stated. A figure outside the statable range is
    /// dropped here rather than in each surface, so no client can decide on
    /// its own to show a reader a wait of eleven days.
    pub fn with_retry_after_seconds(mut self, seconds: impl Into<Option<u64>>) -> Self {
        self.retry_after_seconds = seconds
            .into()
            .filter(|value| (1..=u64::from(MAX_STATED_RETRY_AFTER_SECONDS)).contains(value))
            .map(|value| value as u32);
        self
    }

    pub fn with_request_id(mut self, request_id: impl Into<Option<String>>) -> Self {
        self.request_id = request_id.into().filter(|value| !value.trim().is_empty());
        self
    }

    /// Fallback for the shared engine's errors, so a host with its own richer
    /// taxonomy cannot drift into a separate code set.
    pub fn from_agiworkforce_err(error: &crate::error::AgiworkforceErr) -> Self {
        Self::from_agiworkforce_err_at(error, Utc::now())
    }

    /// The clock is a parameter so the wait a reset instant becomes is decided
    /// by one rule that a test can hold still, rather than by whatever moment
    /// the conversion happened to run in.
    pub fn from_agiworkforce_err_at(
        error: &crate::error::AgiworkforceErr,
        now: DateTime<Utc>,
    ) -> Self {
        use crate::error::AgiworkforceErr as E;
        let code = match error {
            E::ContextWindowExceeded => TurnFailureCode::ContextWindowExceeded,
            E::Interrupted | E::TurnAborted => TurnFailureCode::Interrupted,
            E::Timeout => TurnFailureCode::Timeout,
            E::ConnectionFailed(_) => TurnFailureCode::Network,
            // The account has spent what its own plan gives it. Reported as a
            // provider rate limit, this sent readers to wait out a moment that
            // was never going to pass and to blame a provider that was fine.
            E::UsageLimitReached(_) | E::QuotaExceeded => TurnFailureCode::UsageLimitReached,
            E::RefreshTokenFailed(_) => TurnFailureCode::ProviderAuthInvalid,
            E::UsageNotIncluded => TurnFailureCode::ProviderAuthMissing,
            // The provider was answering and the connection ended first, which
            // a reader treats differently from a provider that never answered.
            E::Stream(..) | E::ResponseStreamFailed(_) => TurnFailureCode::StreamInterrupted,
            E::ServerOverloaded
            | E::InternalServerError
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
        let failure = Self::new(code, error.to_string())
            .with_request_id(error.request_id().map(str::to_owned));
        match error {
            E::UsageLimitReached(limit) => {
                failure.with_retry_after_seconds(limit.seconds_until_reset(now))
            }
            E::Stream(_, delay) => {
                failure.with_retry_after_seconds(delay.map(|delay| delay.as_secs()))
            }
            _ => failure,
        }
    }
}

impl TurnFailureCode {
    pub fn is_retryable(self) -> bool {
        matches!(
            self,
            TurnFailureCode::ProviderRateLimited
                | TurnFailureCode::ProviderUnavailable
                | TurnFailureCode::StreamInterrupted
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
            | TurnFailureCode::StreamInterrupted
            | TurnFailureCode::Network
            | TurnFailureCode::Timeout => TurnFailureAction::Retry,
            // Sending the identical turn again reproduces every one of these:
            // a spent allowance reopens on a clock, a truncated answer
            // truncates again, a refusal refuses again, and a usage limit is
            // the account's own. Offering Retry would be offering the same
            // failure, so the surface offers another model or nothing.
            TurnFailureCode::FreeAllowanceExhausted
            | TurnFailureCode::UsageLimitReached
            | TurnFailureCode::OutputLimitReached
            | TurnFailureCode::RefusedBySafety
            | TurnFailureCode::ToolDenied
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
    #[serde(default)]
    pub managed_request_ids: Vec<String>,
    /// Follow-ups steered into the turn that it ended before delivering, the
    /// newest last. A client that sent them puts them back where the user can
    /// send them again.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub unsent_steers: u32,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub edited_content: Option<String>,
}

/// A question the agent asked mid-turn, as `userInput/requested` announces it.
/// The turn waits on `userInput/respond` until the question is answered,
/// cancelled, interrupted or timed out.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct UserInputRequestedParams {
    pub thread_id: String,
    pub turn_id: String,
    pub request_id: String,
    pub question: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct UserInputResponseParams {
    pub thread_id: String,
    pub turn_id: String,
    pub request_id: String,
    /// `None` cancels the question; the agent is told no answer was given.
    #[serde(default)]
    pub answer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AcknowledgedResponse {
    pub acknowledged: bool,
}

/// Params of `thread/delete`. The archives of worktrees the thread owned may
/// hold the only copy of uncommitted work, so they are kept unless the user
/// confirmed losing them and the client says so here. A discard also works on
/// a thread that is already deleted, which is how a client drops the archives
/// an earlier delete reported as kept. Only a trusted connection may discard:
/// process stdio, or a WebSocket whose upgrade carried the app-server token;
/// any other connection is refused with -32006.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadDeleteParams {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub discard_worktree_archives: bool,
}

/// What deleting a thread did beyond removing it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadDeleteResponse {
    pub acknowledged: bool,
    /// Archive refs of the thread's worktrees that were kept. Each holds
    /// everything a removed worktree had, committed or not.
    #[serde(default)]
    pub kept_worktree_archives: Vec<String>,
    /// Archive refs removed because the client asked for it.
    #[serde(default)]
    pub removed_worktree_archives: Vec<String>,
    /// Worktrees the thread owned, now free for another session to claim.
    #[serde(default)]
    pub released_worktrees: Vec<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub web_search_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub web_search_logins: Vec<String>,
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
    #[serde(default)]
    pub required_tools: Vec<String>,
    #[serde(default)]
    pub required_env_vars: Vec<String>,
    #[serde(default)]
    pub missing_tools: Vec<String>,
    #[serde(default)]
    pub missing_env_vars: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillListResponse {
    pub skills: Vec<SkillSummary>,
    /// What identifies the skills this workspace supplies itself, as they
    /// are now: the ones in its skills folder and the ones its own plugins
    /// declare. Absent when it supplies none. A client that asks its user to
    /// allow them sends this back with the yes, so the yes is to what was
    /// listed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_skills_digest: Option<String>,
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
    /// Granting consent lets the skills this workspace supplies load on
    /// every run of either surface, until one of them changes; revoking
    /// deletes that record.
    pub granted: bool,
    /// With `granted`, the `projectSkillsDigest` that `skills/list` returned
    /// for the skills the user was shown. A grant whose digest is no longer
    /// the current one records nothing and is refused with
    /// [`MCP_APPROVAL_STALE_ERROR_CODE`], its `data` the list as it is now.
    /// Not read when revoking.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub digest: Option<String>,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notices: Vec<String>,
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
    Blocked,
    /// A server the project's own files name whose launch the user has not
    /// approved for this project, so the host does not start it. Approval is
    /// given in a terminal, where the exact command is shown.
    NeedsApproval,
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
    pub policy_refusal: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpServerParams {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpServerTestResponse {
    pub name: String,
    pub connected: bool,
    pub elapsed_ms: u64,
    pub tool_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpToolSummary {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpPromptArgumentSummary {
    pub name: String,
    pub description: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpPromptSummary {
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub arguments: Vec<McpPromptArgumentSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpResourceSummary {
    pub uri: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpServerInspectResponse {
    pub name: String,
    pub connected: bool,
    pub live: bool,
    pub responding: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub protocol_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub server_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub server_version: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub capabilities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub logs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpServerToolsResponse {
    pub name: String,
    pub tools: Vec<McpToolSummary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub prompts: Vec<McpPromptSummary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub resources: Vec<McpResourceSummary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
}

/// Params of `mcp/approval/read`: the project server, as `mcp/list` names
/// it, whose launch the user is to be asked about.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpApprovalReadParams {
    pub name: String,
    pub scope: McpServerScope,
}

/// How a launch that awaits approval is contained.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum McpApprovalSandbox {
    /// Inside the OS sandbox.
    Sandboxed,
    /// Inside it although its entry asks to leave: nothing an approval could
    /// check pins the code it runs.
    KeptSandboxed,
    /// Only inside it, and the tool that makes one is not installed here, so
    /// it does not start yet.
    Unavailable,
    /// Outside it, because its entry asks.
    OptedOut,
    /// Outside it, because the sandbox is off for this run.
    TurnedOff,
    /// Outside it, because this system has none.
    NoSandbox,
}

/// What a launch that awaits approval can reach over the network.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum McpApprovalNetwork {
    /// The internet, and not services on this computer.
    Internet,
    /// The internet and services on this computer.
    InternetAndLocal,
    /// Everything the user can: nothing confines it.
    Unconfined,
}

/// One environment variable a server's entry sets. `value` is there only
/// where it can be shown: whole, or for an endpoint as where it points.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpApprovalEnv {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub value: Option<String>,
    /// Set when the entry sets this variable and it is not passed to the
    /// server: it would load code no approval of the launch covers. The
    /// approval does not pin it.
    #[serde(default, skip_serializing_if = "is_false")]
    pub not_passed: bool,
}

/// What an approval covers, field by field: everything `fingerprint` pins
/// that can be shown. A local server has `program`, `sandbox` and `network`;
/// a remote one has `url`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpApprovalLaunch {
    /// The folder the approval is recorded for.
    pub project: String,
    /// The program that runs: the absolute path a bare command resolves to
    /// on the host `PATH`, or the command as its entry writes it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub program: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<McpApprovalEnv>,
    /// The folder the server starts in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub working_folder: Option<String>,
    /// The files whose content the approval pins, as the launch names them
    /// from the project. A change to one asks again; no other file the
    /// server loads is checked.
    #[serde(default)]
    pub files: Vec<String>,
    /// Whether this launch is asked about at every start. Something it runs
    /// could not be checked, so no approval of it is kept past the run it
    /// was given in. A client reads this, never the wording of `files`,
    /// which a file's name could imitate.
    #[serde(default, skip_serializing_if = "is_false")]
    pub asked_at_every_start: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sandbox: Option<McpApprovalSandbox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub network: Option<McpApprovalNetwork>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub url: Option<String>,
    /// The names of the headers a remote server's entry sends. Their values
    /// hold credentials and are never shown.
    #[serde(default)]
    pub header_names: Vec<String>,
    /// Where a remote server's entry sends the user to sign in, when it
    /// names that itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub authorize_url: Option<String>,
    /// Where a remote server's entry sends the sign-in code for a token,
    /// when it names that itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub token_url: Option<String>,
    /// The access a remote server's entry asks the sign-in for.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub oauth_scope: Option<String>,
    /// The client a remote server's entry signs in as, when it names one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub oauth_client_id: Option<String>,
    /// Where a remote server's entry has the sign-in send the user back,
    /// when it names that itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub oauth_redirect_uri: Option<String>,
    /// Whether a remote server's entry holds a client secret for the
    /// sign-in. The approval pins it; its value is never sent.
    #[serde(default, skip_serializing_if = "is_false")]
    pub oauth_client_secret_set: bool,
}

/// What a client asks its user before a project server may start. The
/// client shows `question` as it is, with `launch` beside it, in a window the
/// page it hosts cannot draw or answer, and sends `fingerprint` back with a
/// yes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpApprovalRequest {
    pub name: String,
    pub scope: McpServerScope,
    /// The command or URL, where and with what rights it starts, and what an
    /// approval leaves unchecked, ending in the question itself.
    pub question: String,
    /// The hash of the launch `question` describes.
    pub fingerprint: String,
    /// The same launch in parts. A host older than this field sends none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub launch: Option<McpApprovalLaunch>,
}

/// JSON-RPC error code for a yes that no longer names what is there, so
/// nothing was approved: an `mcp/approval/grant` whose launch is no longer
/// the one `fingerprint` names, with `data` the [`McpApprovalRequest`] for
/// the launch as it is now, or a `skills/consent` whose skills are no longer
/// the ones `digest` names, with `data` the [`SkillListResponse`] as it is
/// now. Either is shown again before it is asked about again.
pub const MCP_APPROVAL_STALE_ERROR_CODE: i32 = -32012;

/// Params of `mcp/approval/grant`: the user said yes to the launch
/// `mcp/approval/read` described as `fingerprint`. A launch that changed
/// since is refused, so nothing is approved that was not shown.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpApprovalGrantParams {
    pub name: String,
    pub scope: McpServerScope,
    pub fingerprint: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub position: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HookAddParams {
    pub event: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HookRemoveParams {
    pub event: String,
    pub position: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillInstallParams {
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SkillRemoveParams {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PluginInstallParams {
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub integrity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PluginRemoveParams {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PluginUpdateResponse {
    pub id: String,
    pub updated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub previous_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub changed_files: Vec<String>,
    pub plugins: Vec<PluginSummary>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum McpRemoteTransport {
    Http,
    Sse,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct McpAddParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub transport: Option<McpRemoteTransport>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub env: std::collections::BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub headers: std::collections::BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub overwrite: bool,
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
    #[serde(default, skip_serializing_if = "is_false")]
    pub prompt: bool,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum MemoryScope {
    User,
    Project,
    Local,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct MemoryAddParams {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scope: Option<MemoryScope>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeCreateParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeSummary {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub has_work: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeListResponse {
    pub worktrees: Vec<WorktreeSummary>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum SavedPermissionKind {
    Command,
    File,
    ExecPolicy,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum SavedPermissionDecision {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct SavedPermission {
    pub id: String,
    pub kind: SavedPermissionKind,
    pub label: String,
    pub decision: SavedPermissionDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PermissionsListResponse {
    pub permissions: Vec<SavedPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PermissionsRemoveParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct GitPullRequestPlanParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct GitPullRequestCommit {
    pub commit: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct GitPullRequestPlanResponse {
    pub remote: String,
    pub branch: String,
    pub head: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub base: Option<String>,
    pub commits: Vec<GitPullRequestCommit>,
    pub needs_push: bool,
    pub notices: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub blocked: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct GitPullRequestParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cwd: Option<String>,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub body: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub base: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub draft: bool,
    pub confirmed_remote: String,
    pub confirmed_branch: String,
    pub confirmed_head: String,
    pub confirmed_commits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct GitPullRequestResponse {
    pub url: String,
    pub created: bool,
    pub pushed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum PlanDecision {
    Approve,
    Reject,
}

/// Approve the thread's current plan, or reject it with the feedback the
/// next turn carries to the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PlanDecideParams {
    pub thread_id: String,
    pub decision: PlanDecision,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub feedback: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ProviderKeySummary {
    pub provider: String,
    pub label: String,
    pub env_var: String,
    pub configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ProvidersListResponse {
    pub providers: Vec<ProviderKeySummary>,
    pub storage: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ProviderSetKeyParams {
    pub provider: String,
    pub api_key: String,
}

impl std::fmt::Debug for ProviderSetKeyParams {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderSetKeyParams")
            .field("provider", &self.provider)
            .field("api_key", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ProviderParams {
    pub provider: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum PermissionRuleKind {
    Command,
    Domain,
    File,
    ExecPolicy,
    Mcp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum PermissionRuleDecision {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PermissionRule {
    pub id: String,
    pub kind: PermissionRuleKind,
    pub target: String,
    pub label: String,
    pub decision: PermissionRuleDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PermissionRulesResponse {
    pub rules: Vec<PermissionRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PermissionsAddParams {
    pub kind: PermissionRuleKind,
    pub target: String,
    pub decision: PermissionRuleDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TrustedFolder {
    pub path: String,
    pub trusted_at: Option<String>,
    pub trusted_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TrustListResponse {
    pub folders: Vec<TrustedFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TrustRevokeParams {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeRemoveParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct MemoryAddResponse {
    pub scope: MemoryScope,
    pub path: String,
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

/// What the origin established about the repository: how it is built, what
/// runs it, and the setup a receiving surface would otherwise rediscover.
/// Every field is a reading, never a guess: absent means nothing was found.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct HandoffArchitecture {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub package_manager: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub monorepo: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ci_providers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub containers: Vec<String>,
    /// Instruction files a turn in this workspace loads, in load order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub instruction_files: Vec<String>,
    /// Setup and check commands read from the repository's own scripts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub commands: Vec<String>,
}

impl HandoffArchitecture {
    /// Whether anything was actually discovered. An empty record is not sent:
    /// a receiver must be able to tell "nothing found" from "not looked for".
    pub fn is_empty(&self) -> bool {
        self.project_type.is_none()
            && self.language.is_none()
            && self.package_manager.is_none()
            && self.monorepo.is_none()
            && self.ci_providers.is_empty()
            && self.containers.is_empty()
            && self.instruction_files.is_empty()
            && self.commands.is_empty()
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
    /// What the session established about the repository it is working in.
    /// Rediscovering it costs the receiving surface the same reads the origin
    /// already paid for, so it travels with the work.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub architecture: Option<HandoffArchitecture>,
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
    /// Opaque fingerprint of the account the origin was signed into, never an
    /// address. A receiver signed into a different account refuses the record
    /// rather than opening one person's session under another's credential.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub issued_for_account: Option<String>,
}

/// How long a handoff stays admissible. The record is the whole of what
/// travels, so one that sat in a log, a paste buffer or a file is a bearer of
/// somebody's session state and is refused on age alone.
pub const HANDOFF_MAX_AGE_SECONDS: i64 = 15 * 60;

/// What the receiving surface knows about itself when it is offered a record.
#[derive(Debug, Clone, Copy)]
pub struct HandoffAdmissionContext<'a> {
    pub environment: HandoffEnvironment,
    pub now: DateTime<Utc>,
    /// Fingerprint of the account this surface is signed into, when it knows.
    pub account: Option<&'a str>,
    /// Receipts of records already taken here, so one cannot be taken twice.
    pub taken_receipts: &'a [String],
}

impl<'a> HandoffAdmissionContext<'a> {
    /// A surface that knows only where it is. Age is still checked, because a
    /// clock is always available and a stale record is stale everywhere.
    pub fn here(environment: HandoffEnvironment) -> Self {
        Self {
            environment,
            now: Utc::now(),
            account: None,
            taken_receipts: &[],
        }
    }

    pub fn for_account(mut self, account: Option<&'a str>) -> Self {
        self.account = account;
        self
    }

    pub fn already_taken(mut self, taken_receipts: &'a [String]) -> Self {
        self.taken_receipts = taken_receipts;
        self
    }
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
    /// The record is older than [`HANDOFF_MAX_AGE_SECONDS`], is dated in the
    /// future, or carries an `issuedAt` no clock can read.
    #[serde(rename_all = "camelCase")]
    #[ts(rename_all = "camelCase")]
    Expired {
        issued_at: String,
        max_age_seconds: u32,
    },
    /// A record with this receipt was already taken here. Taking it again
    /// would open the same session twice from one authorisation.
    #[serde(rename_all = "camelCase")]
    #[ts(rename_all = "camelCase")]
    Replayed { receipt: String },
    /// This surface is signed into a different account than the origin was.
    WrongAccount,
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
            Self::Expired {
                issued_at,
                max_age_seconds,
            } => format!(
                "this handoff was issued at {issued_at} and a record stays good for {max_age_seconds} seconds; ask the origin for a new one"
            ),
            Self::Replayed { receipt } => {
                format!("this handoff ({receipt}) was already taken on this surface")
            }
            Self::WrongAccount => {
                "this handoff belongs to a different account than the one signed in here"
                    .to_string()
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
    /// The stamp a producer puts on a record it is issuing now, in the one
    /// format [`Self::accept_with`] reads it back in.
    pub fn issued_now() -> String {
        Utc::now().to_rfc3339()
    }

    /// What a receiver records once it has taken this handoff, so the same
    /// record cannot be taken twice. Derived from the record, never chosen by
    /// it, so a forged one cannot pick a receipt that is already spent.
    pub fn receipt(&self) -> String {
        format!("{}@{}", self.thread_id, self.issued_at)
    }

    /// Take the handoff on a surface running in `here`, or say why not.
    /// Age is checked against the current clock; a caller that knows which
    /// account it is signed into, or which records it has already taken, uses
    /// [`Self::accept_with`] so those are checked too.
    pub fn accept(&self, here: HandoffEnvironment) -> Result<HandoffAdmission, HandoffRefusal> {
        self.accept_with(&HandoffAdmissionContext::here(here))
    }

    /// Take the handoff on a surface that knows where it is, what time it is,
    /// which account it holds and which records it has already taken.
    pub fn accept_with(
        &self,
        context: &HandoffAdmissionContext<'_>,
    ) -> Result<HandoffAdmission, HandoffRefusal> {
        if !SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.contains(&self.protocol_version) {
            return Err(HandoffRefusal::ProtocolVersionUnsupported {
                requested_protocol_version: self.protocol_version,
                supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.to_vec(),
            });
        }
        if self.to_environment != context.environment {
            return Err(HandoffRefusal::WrongDestination {
                expected: context.environment,
                received: self.to_environment,
            });
        }
        if self.posture.trust_mode == DeveloperSessionTrustMode::Unknown {
            return Err(HandoffRefusal::TrustModeUnknown);
        }
        let expired = || HandoffRefusal::Expired {
            issued_at: self.issued_at.clone(),
            max_age_seconds: HANDOFF_MAX_AGE_SECONDS as u32,
        };
        let issued_at = DateTime::parse_from_rfc3339(&self.issued_at)
            .map(|issued| issued.with_timezone(&Utc))
            .map_err(|_| expired())?;
        let age = context.now.signed_duration_since(issued_at).num_seconds();
        if !(0..=HANDOFF_MAX_AGE_SECONDS).contains(&age) {
            return Err(expired());
        }
        if let Some(account) = context.account
            && self.issued_for_account.as_deref() != Some(account)
        {
            return Err(HandoffRefusal::WrongAccount);
        }
        let receipt = self.receipt();
        if context.taken_receipts.contains(&receipt) {
            return Err(HandoffRefusal::Replayed { receipt });
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

/// Where a new worktree starts.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case", tag = "kind")]
#[ts(rename_all = "snake_case", tag = "kind")]
pub enum WorktreeStartPoint {
    /// A commit-ish such as `HEAD` or `origin/main`, checked out detached.
    Ref { name: String },
    /// HEAD plus every uncommitted change in the repository, tracked or not.
    WorkingTree,
}

/// Params of `worktree/managed/create`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ManagedWorktreeCreateParams {
    pub start: WorktreeStartPoint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label: Option<String>,
}

/// The repository's worktree setup script. It is arbitrary code, so it runs
/// only once the user has approved this exact content, named by its hash.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeSetupScript {
    pub path: String,
    pub sha256: String,
    /// The user approved this content before, so it may run without asking.
    pub approved: bool,
}

/// A worktree the host made for one coding session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ManagedWorktreeSummary {
    pub id: String,
    /// The checkout a session in this worktree runs in.
    pub path: String,
    pub repository_root: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label: Option<String>,
    pub start: WorktreeStartPoint,
    pub base_commit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub head: Option<String>,
    pub created_at: String,
    /// The one session this worktree belongs to, once it has claimed it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub thread_id: Option<String>,
    /// That session as the store recorded it, so a client can list it without
    /// starting a host in the worktree.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub thread: Option<ThreadSummary>,
    /// Cleanup never removes a pinned worktree.
    pub pinned: bool,
    /// A host is serving it, so cleanup and delete leave it alone.
    pub active: bool,
    /// The checkout directory is gone and only the record remains.
    pub missing: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub setup_exit_code: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub setup_ran_at: Option<String>,
}

/// A worktree removed after its contents were kept on a ref.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeArchive {
    pub worktree_id: String,
    /// Holds everything the worktree had, committed or not, when removed.
    pub snapshot_ref: String,
    pub snapshot_commit: String,
}

/// A `.worktreeinclude` match that was not copied, and why.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeRefusedFile {
    pub path: String,
    pub reason: String,
}

/// An older worktree cleanup could not archive, left exactly as it was.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeCleanupFailure {
    /// Empty when the worktrees could not be listed at all.
    pub worktree_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeCreateResponse {
    pub worktree: ManagedWorktreeSummary,
    /// Files `.worktreeinclude` named that were copied in.
    pub copied_files: Vec<String>,
    pub refused_files: Vec<WorktreeRefusedFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub setup_script: Option<WorktreeSetupScript>,
    /// Older worktrees archived to stay within the keep count.
    pub archived: Vec<WorktreeArchive>,
    /// Older worktrees cleanup could not archive. The new worktree was made.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cleanup_failures: Vec<WorktreeCleanupFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ManagedWorktreeListResponse {
    /// Newest first.
    pub worktrees: Vec<ManagedWorktreeSummary>,
    /// How many of the newest worktrees cleanup keeps.
    pub keep: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub setup_script: Option<WorktreeSetupScript>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeIdParams {
    pub worktree_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreePinParams {
    pub worktree_id: String,
    pub pinned: bool,
}

/// Params of `worktree/managed/keep`: the new keep count, or none to read it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeKeepParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub keep: Option<u32>,
}

/// How many of the newest worktrees cleanup keeps, after any change.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeKeepResponse {
    pub keep: u32,
    /// The largest count the host accepts.
    pub max_keep: u32,
}

/// Params of `worktree/managed/applyToLocal`. With `preview`, nothing is written.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyParams {
    pub worktree_id: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub preview: bool,
}

/// What apply-to-local did to each file the session changed. Applied files
/// matched where the worktree started; skipped files already matched the
/// worktree; conflicted files were changed locally and were left untouched.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeApplyResponse {
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
    pub conflicted: Vec<String>,
    pub preview: bool,
}

/// Params of `worktree/managed/setup/run`: the hash of the content the user approved.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeSetupRunParams {
    pub worktree_id: String,
    pub sha256: String,
}

/// Params of `worktree/managed/setup/finished`. `worktree/managed/setup/run` only starts the
/// script, because a connection answers one request at a time and an install
/// can run for minutes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeSetupFinishedNotification {
    pub worktree_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub thread_id: Option<String>,
    /// Absent when the script was killed by a signal or could not start.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub exit_code: Option<i32>,
    pub succeeded: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum WorktreeSetupStream {
    Stdout,
    Stderr,
}

/// Params of `worktree/managed/setup/log`, streamed while a setup script runs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorktreeSetupLogNotification {
    pub worktree_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub thread_id: Option<String>,
    pub stream: WorktreeSetupStream,
    pub text: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum CheckpointFileStatus {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointFile {
    pub path: String,
    pub status: CheckpointFileStatus,
    pub binary: bool,
}

/// One turn's checkpoint: the whole workspace before it began and after it
/// ended, including changes a shell command or a subagent made.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct TurnCheckpointSummary {
    pub turn_id: String,
    /// One-based position of the turn in the thread.
    pub index: u32,
    pub started_at: String,
    /// Absent while the turn runs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub finished_at: Option<String>,
    pub files: Vec<CheckpointFile>,
    /// Untracked files too large to snapshot, which neither this turn's review
    /// nor a rewind covers.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skipped_files: Vec<String>,
    /// The conversation can rewind with the files. False once the transcript
    /// was compacted past this turn, when only a fresh session could.
    pub rewindable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointListResponse {
    pub thread_id: String,
    /// False when the workspace is not a git repository.
    pub available: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unavailable_reason: Option<String>,
    /// Oldest first.
    pub turns: Vec<TurnCheckpointSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointTurnParams {
    pub thread_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointHunk {
    pub index: u32,
    /// The `@@` line.
    pub header: String,
    /// The hunk as unified-diff text, `@@` line included.
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointFileDiff {
    pub path: String,
    pub status: CheckpointFileStatus,
    pub binary: bool,
    /// Empty for a binary file, which is taken or left whole.
    pub hunks: Vec<CheckpointHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointDiffResponse {
    pub thread_id: String,
    pub turn_id: String,
    pub index: u32,
    pub files: Vec<CheckpointFileDiff>,
}

/// One file of a turn, narrowed to some of its hunks or, with none named,
/// the whole file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointSection {
    pub path: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hunks: Vec<u32>,
}

/// Params of `checkpoint/revert` and `checkpoint/stage`. With `preview`,
/// nothing changes and the answer says what would.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointSectionsParams {
    pub thread_id: String,
    pub turn_id: String,
    pub sections: Vec<CheckpointSection>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub preview: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointSectionConflict {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CheckpointSectionsResponse {
    pub applied: Vec<String>,
    /// Sections the files have moved on from, left exactly as they are.
    pub conflicted: Vec<CheckpointSectionConflict>,
    pub preview: bool,
}

/// What a `thread/revert` puts back as it was before the turn.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ThreadRevertRestore {
    #[default]
    Both,
    Code,
    Conversation,
}

impl ThreadRevertRestore {
    pub fn restores_code(self) -> bool {
        matches!(self, Self::Both | Self::Code)
    }

    pub fn restores_conversation(self) -> bool {
        matches!(self, Self::Both | Self::Conversation)
    }

    #[allow(clippy::trivially_copy_pass_by_ref)] // serde skip_serializing_if requires fn(&T) -> bool.
    fn is_both(&self) -> bool {
        *self == Self::Both
    }
}

/// Params of `thread/revert`: rewind the files, the conversation or both to
/// just before `turn_id` began. With `preview`, nothing changes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadRevertParams {
    pub thread_id: String,
    pub turn_id: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub preview: bool,
    #[serde(default, skip_serializing_if = "ThreadRevertRestore::is_both")]
    pub restore: ThreadRevertRestore,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ThreadRevertResponse {
    pub thread_id: String,
    pub turn_id: String,
    pub preview: bool,
    /// Every file whose current content the rewind replaces or deletes,
    /// whoever last changed it.
    pub files: Vec<String>,
    /// Untracked files too large to snapshot, which the rewind leaves as they
    /// are.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skipped_files: Vec<String>,
    /// Messages dropped from the conversation, this turn's and every later one's.
    pub messages_removed: u32,
    /// Where the workspace as it stood before the rewind was kept.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub recovery_ref: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_events::{
        AGENT_EVENT_SCHEMA_VERSION, AgentEvent, AgentEventToolCategory,
        AgentEventToolExecutionStart,
    };

    #[test]
    fn basic_worktree_wire_shapes_remain_unchanged() {
        let request = serde_json::json!({ "name": "review-topic" });
        let params: WorktreeCreateParams = serde_json::from_value(request.clone()).unwrap();
        assert_eq!(params.name.as_deref(), Some("review-topic"));
        assert_eq!(serde_json::to_value(params).unwrap(), request);

        let response = serde_json::json!({
            "worktrees": [{
                "name": "review-topic",
                "path": "/workspace/review-topic",
                "branch": "review-topic",
                "hasWork": true
            }]
        });
        let result: WorktreeListResponse = serde_json::from_value(response.clone()).unwrap();
        assert_eq!(result.worktrees.len(), 1);
        assert!(result.worktrees[0].has_work);
        assert_eq!(serde_json::to_value(result).unwrap(), response);
    }

    #[test]
    fn managed_worktree_creation_requires_its_explicit_start_and_capability() {
        let request = serde_json::json!({
            "start": { "kind": "working_tree" },
            "label": "review-topic"
        });
        let params: ManagedWorktreeCreateParams = serde_json::from_value(request.clone()).unwrap();
        assert_eq!(params.start, WorktreeStartPoint::WorkingTree);
        assert_eq!(serde_json::to_value(params).unwrap(), request);
        assert!(
            serde_json::from_value::<ManagedWorktreeCreateParams>(
                serde_json::json!({ "name": "review-topic" })
            )
            .is_err()
        );
        assert_ne!(method::WORKTREE_CREATE, method::MANAGED_WORKTREE_CREATE);
        assert_ne!(method::WORKTREE_LIST, method::MANAGED_WORKTREE_LIST);
        let capabilities: AppServerCapabilities = serde_json::from_value(serde_json::json!({
            "threads": true,
            "turns": true,
            "streaming": false,
            "approvals": false,
            "tools": false,
            "mcp": false,
            "checkpoints": false,
            "worktrees": true,
            "models": false
        }))
        .unwrap();
        assert!(capabilities.worktrees);
        assert!(!capabilities.managed_worktrees);
        assert!(
            serde_json::to_value(capabilities)
                .unwrap()
                .get("managedWorktrees")
                .is_none()
        );
    }

    #[test]
    fn thread_deletion_keeps_legacy_request_and_acknowledgement_shapes() {
        let request: ThreadDeleteParams =
            serde_json::from_value(serde_json::json!({ "threadId": "thread-fixture" })).unwrap();
        assert!(!request.discard_worktree_archives);
        let response: ThreadDeleteResponse =
            serde_json::from_value(serde_json::json!({ "acknowledged": true })).unwrap();
        assert!(response.acknowledged);
        assert!(response.kept_worktree_archives.is_empty());
        assert!(response.removed_worktree_archives.is_empty());
        let old_client: AcknowledgedResponse =
            serde_json::from_value(serde_json::to_value(response).unwrap()).unwrap();
        assert!(old_client.acknowledged);
    }

    #[test]
    fn an_mcp_approval_request_reads_with_or_without_its_launch_in_parts() {
        let older: McpApprovalRequest = serde_json::from_value(serde_json::json!({
            "name": "docs",
            "scope": "project",
            "question": "Allow it?",
            "fingerprint": "abc",
        }))
        .expect("a host older than `launch` still parses");
        assert_eq!(older.launch, None);
        assert!(
            serde_json::to_value(&older)
                .expect("serialize")
                .get("launch")
                .is_none(),
            "an absent launch was written as null"
        );

        let request = McpApprovalRequest {
            launch: Some(McpApprovalLaunch {
                project: "/work/app".to_string(),
                program: Some("/usr/bin/node".to_string()),
                args: vec!["server.js".to_string()],
                env: vec![
                    McpApprovalEnv {
                        name: "API_TOKEN".to_string(),
                        ..McpApprovalEnv::default()
                    },
                    McpApprovalEnv {
                        name: "LOG_LEVEL".to_string(),
                        value: Some("debug".to_string()),
                        not_passed: false,
                    },
                ],
                working_folder: Some("/work/app".to_string()),
                files: vec!["server.js".to_string()],
                sandbox: Some(McpApprovalSandbox::KeptSandboxed),
                network: Some(McpApprovalNetwork::InternetAndLocal),
                ..McpApprovalLaunch::default()
            }),
            ..older
        };
        let wire = serde_json::to_value(&request).expect("serialize");
        assert_eq!(
            wire["launch"],
            serde_json::json!({
                "project": "/work/app",
                "program": "/usr/bin/node",
                "args": ["server.js"],
                "env": [{ "name": "API_TOKEN" }, { "name": "LOG_LEVEL", "value": "debug" }],
                "workingFolder": "/work/app",
                "files": ["server.js"],
                "sandbox": "kept_sandboxed",
                "network": "internet_and_local",
                "headerNames": [],
            })
        );
        assert_eq!(
            serde_json::from_value::<McpApprovalRequest>(wire).expect("round trip"),
            request
        );
    }

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
        "architecture",
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
            issued_at: DeveloperSessionHandoff::issued_now(),
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
            architecture: Some(HandoffArchitecture {
                project_type: Some("Rust workspace".to_string()),
                language: Some("Rust".to_string()),
                package_manager: Some("cargo".to_string()),
                monorepo: None,
                ci_providers: vec!["GitHub Actions".to_string()],
                containers: Vec::new(),
                instruction_files: vec!["/work/repo/AGENTS.md".to_string()],
                commands: vec!["cargo test".to_string()],
            }),
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
                reason: Some("source edited".to_string()),
                subject: Some(FileChangeSubject::Source),
                notices: vec![FileChangeNotice::DebugInstrumentation],
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
                risk_level: Some(AgentEventApprovalRiskLevel::High),
                reversible: Some(false),
                proposed_content: None,
                always_allow_saved: false,
                proposed_execpolicy_amendment: None,
            }],
            last_turn: Some(HandoffLastTurn {
                turn_id: "turn-9".to_string(),
                state: HandoffTurnState::Interrupted,
                model: Some("a-model".to_string()),
                ended_at: "2026-09-20T09:59:00Z".to_string(),
            }),
            local_resources: HANDOFF_LOCAL_RESOURCES.to_vec(),
            issued_for_account: None,
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

    fn addressed_here() -> DeveloperSessionHandoff {
        DeveloperSessionHandoff {
            to_environment: HandoffEnvironment::Local,
            ..populated_handoff()
        }
    }

    /// A handoff is the whole of what travels, so it is a bearer of somebody's
    /// session state. Age, reuse and the account it belongs to are refusals in
    /// their own right, not prose a receiving surface has to invent.
    #[test]
    fn a_record_that_sat_somewhere_is_refused_on_its_age_alone() {
        let handoff = addressed_here();
        let issued_at = DateTime::parse_from_rfc3339(&handoff.issued_at)
            .expect("the fixture is dated")
            .with_timezone(&Utc);
        let at = |offset_seconds: i64| HandoffAdmissionContext {
            environment: HandoffEnvironment::Local,
            now: issued_at + chrono::Duration::seconds(offset_seconds),
            account: None,
            taken_receipts: &[],
        };

        assert!(handoff.accept_with(&at(0)).is_ok());
        assert!(handoff.accept_with(&at(HANDOFF_MAX_AGE_SECONDS)).is_ok());

        let expired = HandoffRefusal::Expired {
            issued_at: handoff.issued_at.clone(),
            max_age_seconds: HANDOFF_MAX_AGE_SECONDS as u32,
        };
        assert_eq!(
            handoff
                .accept_with(&at(HANDOFF_MAX_AGE_SECONDS + 1))
                .expect_err("a stale record is refused"),
            expired
        );
        assert_eq!(
            handoff
                .accept_with(&at(-1))
                .expect_err("a record dated in the future is refused"),
            expired
        );

        let unreadable = DeveloperSessionHandoff {
            issued_at: "sometime yesterday".to_string(),
            ..addressed_here()
        };
        assert!(matches!(
            unreadable
                .accept_with(&at(0))
                .expect_err("an unreadable date is not a fresh record"),
            HandoffRefusal::Expired { .. }
        ));
        assert!(expired.label().contains("ask the origin for a new one"));
    }

    #[test]
    fn a_record_already_taken_here_is_not_taken_twice() {
        let handoff = addressed_here();
        let receipt = handoff.receipt();
        assert_eq!(receipt, format!("thread-1@{}", handoff.issued_at));

        let taken = vec![receipt.clone()];
        let refusal = handoff
            .accept_with(
                &HandoffAdmissionContext::here(HandoffEnvironment::Local).already_taken(&taken),
            )
            .expect_err("a spent record is refused");
        assert_eq!(refusal, HandoffRefusal::Replayed { receipt });
        assert!(
            handoff
                .accept_with(&HandoffAdmissionContext::here(HandoffEnvironment::Local))
                .is_ok()
        );
    }

    #[test]
    fn a_surface_signed_into_another_account_does_not_open_this_session() {
        let mine = DeveloperSessionHandoff {
            issued_for_account: Some("fingerprint-a".to_string()),
            ..addressed_here()
        };
        let here = |account| {
            HandoffAdmissionContext::here(HandoffEnvironment::Local).for_account(Some(account))
        };

        assert!(mine.accept_with(&here("fingerprint-a")).is_ok());
        assert_eq!(
            mine.accept_with(&here("fingerprint-b"))
                .expect_err("another account does not take it"),
            HandoffRefusal::WrongAccount
        );

        let anonymous = addressed_here();
        assert_eq!(
            anonymous
                .accept_with(&here("fingerprint-a"))
                .expect_err("a record that names no account is not admitted by one that does"),
            HandoffRefusal::WrongAccount,
        );
        assert!(
            anonymous
                .accept_with(&HandoffAdmissionContext::here(HandoffEnvironment::Local))
                .is_ok(),
            "a surface that knows no account still takes a record that names none"
        );
    }

    #[test]
    fn every_refusal_says_something_a_person_can_act_on() {
        let refusals = [
            HandoffRefusal::ProtocolVersionUnsupported {
                requested_protocol_version: 1,
                supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.to_vec(),
            },
            HandoffRefusal::WrongDestination {
                expected: HandoffEnvironment::Local,
                received: HandoffEnvironment::Cloud,
            },
            HandoffRefusal::TrustModeUnknown,
            HandoffRefusal::Expired {
                issued_at: "2026-09-20T10:00:00Z".to_string(),
                max_age_seconds: HANDOFF_MAX_AGE_SECONDS as u32,
            },
            HandoffRefusal::Replayed {
                receipt: "thread-1@2026-09-20T10:00:00Z".to_string(),
            },
            HandoffRefusal::WrongAccount,
        ];
        let mut reasons = Vec::new();
        for refusal in &refusals {
            assert!(refusal.label().len() > 25, "{refusal:?} says nothing");
            let wire = serde_json::to_value(refusal).expect("serialize");
            let reason = wire
                .get("reason")
                .and_then(|reason| reason.as_str())
                .unwrap_or_else(|| panic!("{refusal:?} has no reason on the wire"))
                .to_string();
            reasons.push(reason);
        }
        for reason in ["expired", "replayed", "wrongAccount"] {
            assert!(
                reasons.contains(&reason.to_string()),
                "{reason} is not a refusal a client can switch on: {reasons:?}"
            );
        }
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

    #[test]
    fn a_user_input_answer_round_trips_and_a_missing_one_cancels() {
        let answered: UserInputResponseParams = serde_json::from_value(serde_json::json!({
            "threadId": "thread-1",
            "turnId": "turn-1",
            "requestId": "q-1",
            "answer": "main",
        }))
        .expect("answer");
        assert_eq!(answered.answer.as_deref(), Some("main"));
        assert_eq!(
            serde_json::to_value(&answered).expect("serialize")["answer"],
            "main"
        );

        for cancelled in [
            serde_json::json!({ "threadId": "t", "turnId": "u", "requestId": "q", "answer": null }),
            serde_json::json!({ "threadId": "t", "turnId": "u", "requestId": "q" }),
        ] {
            let params: UserInputResponseParams =
                serde_json::from_value(cancelled).expect("cancel");
            assert_eq!(params.answer, None);
        }

        let requested = UserInputRequestedParams {
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            request_id: "q-1".to_string(),
            question: "Which branch?".to_string(),
        };
        assert_eq!(
            serde_json::to_value(&requested).expect("serialize"),
            serde_json::json!({
                "threadId": "thread-1",
                "turnId": "turn-1",
                "requestId": "q-1",
                "question": "Which branch?",
            })
        );
        assert_eq!(method::USER_INPUT_REQUESTED, "userInput/requested");
        assert_eq!(method::USER_INPUT_RESPOND, "userInput/respond");
    }
}
