use agiworkforce_protocol::agent_events::AGENT_EVENT_SCHEMA_VERSION;
use agiworkforce_protocol::developer_session::{
    method, AccountLoginResponse, AccountLoginWaitParams, AccountLoginWaitResponse,
    AccountStatusParams, AccountStatusResponse, AccountTokenResponse, AcknowledgedResponse,
    AppServerCapabilities, AppServerClientInfo, AppServerNotification, AppServerRequest,
    AppServerResponse, ApprovalResponseParams, CheckpointDiffResponse, CheckpointListResponse,
    CheckpointSectionsParams, CheckpointSectionsResponse, CheckpointTurnParams,
    ContextInstructionsParams, ContextInstructionsResponse, DeveloperSessionHandoff,
    GitPullRequestParams, GitPullRequestPlanParams, GitPullRequestPlanResponse,
    GitPullRequestResponse, HandoffAdmission, HookAddParams, HookListResponse, HookRemoveParams,
    InitializeParams, InitializeResponse, LocalModelListResponse, ManagedWorktreeCreateParams,
    ManagedWorktreeListResponse, ManagedWorktreeSummary, McpAddParams, McpApprovalGrantParams,
    McpApprovalReadParams, McpApprovalRequest, McpLoginParams, McpLoginResponse,
    McpServerInspectResponse, McpServerListResponse, McpServerParams, McpServerTestResponse,
    McpServerToolsResponse, MemoryAddParams, MemoryAddResponse, ModelListParams,
    PermissionRulesResponse, PermissionsAddParams, PermissionsListResponse,
    PermissionsRemoveParams, PlanDecideParams, PluginInstallParams, PluginListResponse,
    PluginRemoveParams, PluginSetEnabledParams, PluginUpdateResponse,
    ProtocolVersionUnsupportedData, ProviderParams, ProviderSetKeyParams, ProvidersListResponse,
    SettingsReadResponse, SettingsWriteParams, SkillConsentParams, SkillConsentResponse,
    SkillInstallParams, SkillListResponse, SkillRemoveParams, SkillSetEnabledParams,
    SlashCommandListResponse, SlashCommandRunParams, SlashCommandRunResponse,
    ThreadCheckpointsResponse, ThreadCompactParams, ThreadCompactResponse, ThreadDeleteParams,
    ThreadDeleteResponse, ThreadForkParams, ThreadHandoffAcceptParams, ThreadHandoffParams,
    ThreadIdParams, ThreadListParams, ThreadListResponse, ThreadReadResponse,
    ThreadReconnectResponse, ThreadRevertParams, ThreadRevertResponse, ThreadRewindParams,
    ThreadRewindResponse, ThreadSearchParams, ThreadSearchResponse, ThreadStartParams,
    ThreadStartResponse, ThreadSummary, ThreadWriterConflictData, TrustListResponse,
    TrustRevokeParams, TurnInterruptParams, TurnStartParams, TurnStartResponse, TurnSteerParams,
    TurnSummary, UserInputResponseParams, WorktreeApplyParams, WorktreeApplyResponse,
    WorktreeArchive, WorktreeCreateParams, WorktreeCreateResponse, WorktreeIdParams,
    WorktreeKeepParams, WorktreeKeepResponse, WorktreeListResponse, WorktreePinParams,
    WorktreeRemoveParams, WorktreeSetupRunParams, WorktreeSummary,
    LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION, MCP_APPROVAL_STALE_ERROR_CODE,
    MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION, PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
    SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS, THREAD_WRITER_CONFLICT_ERROR_CODE,
};
use anyhow::Result;
use async_trait::async_trait;
use futures_util::FutureExt;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fmt;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::broadcast;
use tokio::sync::{Semaphore, SemaphorePermit};
use tokio::task::JoinSet;

// v3 requires servers to enforce per-turn agent controls and workspace-scoped
// context. Older servers silently discarded these security-sensitive fields.
const SERVER_NAME: &str = "agiworkforce-app-server";
const SERVER_TITLE: &str = "AGI Workforce App Server";

/// Stable host boundary implemented by the local developer runtime.
///
/// Implementations own persistence, execution, cancellation, approvals, MCP,
/// worktrees, and checkpoints. The app-server crate owns only typed request
/// admission and transport. Long-running work must be spawned by the host so
/// `start_turn` can return while the same connection remains able to receive
/// interrupts and approval responses.
#[async_trait]
pub trait DeveloperSessionHost: Send + Sync {
    /// Version of the executable that owns this host. The transport crate has
    /// its own package version, but clients need the shipped runtime version
    /// when deciding whether the installed CLI is compatible.
    fn server_version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }

    async fn workspace_identity(
        &self,
    ) -> Result<
        agiworkforce_protocol::developer_session::DeveloperWorkspaceIdentity,
        DeveloperSessionHostError,
    > {
        Err(unsupported(method::WORKSPACE_IDENTITY))
    }

    async fn start_thread(
        &self,
        params: ThreadStartParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError>;

    /// Models this host knows about, and whether it can reach them.
    ///
    /// `params.refresh` asks for a fresh answer rather than what the session
    /// already resolved: reachability costs a probe per local runtime and a
    /// credential lookup per route, so it is not recomputed per request.
    ///
    /// `trust` is the calling connection's. For one that did not prove
    /// ownership the host answers from what it has already resolved and
    /// probes no local runtime, looks up no credential and calls nothing
    /// out, on a first call as on a later one.
    async fn list_local_models(
        &self,
        params: ModelListParams,
        trust: DeveloperConnectionTrust,
    ) -> Result<LocalModelListResponse, DeveloperSessionHostError>;

    async fn resume_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    async fn read_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError>;

    async fn fork_thread(
        &self,
        params: ThreadForkParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError>;

    /// Summarize what the model reads of a thread, from `params.from_turn_id`
    /// on or the older part of all of it. The transcript keeps every message;
    /// the summarized turns can no longer be rewound to, so a user-facing
    /// caller confirms first.
    async fn compact_thread(
        &self,
        _params: ThreadCompactParams,
    ) -> Result<ThreadCompactResponse, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_COMPACT))
    }

    /// The record another surface needs to carry this thread on: what is
    /// stored plus what only a running host knows. It never moves the thread
    /// by itself, so a host that answers it keeps serving until the receiving
    /// surface admits the record.
    async fn hand_off_thread(
        &self,
        _params: ThreadHandoffParams,
    ) -> Result<DeveloperSessionHandoff, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_HANDOFF))
    }

    /// Offer a handoff record to this surface. A record addressed elsewhere,
    /// speaking a protocol version this server does not, or carrying no trust
    /// mode is refused, and the refusal says which.
    async fn accept_handoff(
        &self,
        _params: ThreadHandoffAcceptParams,
    ) -> Result<HandoffAdmission, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_HANDOFF_ACCEPT))
    }

    async fn archive_thread(&self, params: ThreadIdParams)
        -> Result<(), DeveloperSessionHostError>;

    async fn unarchive_thread(
        &self,
        _params: ThreadIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_UNARCHIVE))
    }

    async fn search_threads(
        &self,
        _params: ThreadSearchParams,
    ) -> Result<ThreadSearchResponse, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_SEARCH))
    }

    async fn list_checkpoints(
        &self,
        _params: ThreadIdParams,
    ) -> Result<ThreadCheckpointsResponse, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_CHECKPOINTS))
    }

    async fn rewind_thread(
        &self,
        _params: ThreadRewindParams,
    ) -> Result<ThreadRewindResponse, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_REWIND))
    }

    /// Remove a thread and everything persisted with it. Irreversible, so a
    /// user-facing caller confirms before sending it. The archives of the
    /// worktrees it owned stay unless `params.discard_worktree_archives`.
    async fn delete_thread(
        &self,
        _params: ThreadDeleteParams,
    ) -> Result<ThreadDeleteResponse, DeveloperSessionHostError> {
        Err(unsupported("thread/delete"))
    }

    /// Snapshot of a thread for a client that has just (re)connected: its
    /// summary and, while a turn runs, the output and approvals it missed.
    async fn reconnect_thread(
        &self,
        _params: ThreadIdParams,
    ) -> Result<ThreadReconnectResponse, DeveloperSessionHostError> {
        Err(unsupported("thread/reconnect"))
    }

    /// Give up this host's writer lease so another process may write at once.
    async fn release_thread_writer(
        &self,
        _params: ThreadIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported("thread/writer/release"))
    }

    /// Take the writer lease from whoever holds it, live or not.
    async fn take_over_thread_writer(
        &self,
        _params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Err(unsupported("thread/writer/takeover"))
    }

    async fn start_turn(
        &self,
        params: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError>;

    /// Start a turn on behalf of a client that declared what it can answer.
    /// A host that cannot put questions to a client ignores the declaration.
    async fn start_turn_for(
        &self,
        params: TurnStartParams,
        _client: TurnClient,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        self.start_turn(params).await
    }

    async fn steer_turn(
        &self,
        params: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError>;

    async fn interrupt_turn(
        &self,
        params: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError>;

    async fn respond_to_approval(
        &self,
        params: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError>;

    /// Answer or cancel a question the agent asked mid-turn.
    async fn respond_to_user_input(
        &self,
        _params: UserInputResponseParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported(method::USER_INPUT_RESPOND))
    }

    /// Report the signed-in account from the runtime's own credential store.
    ///
    /// Defaults exist for every v8 surface so an embedder that owns none of
    /// them answers "unavailable" rather than silently reporting a signed-out
    /// account or an empty catalog.
    async fn account_status(
        &self,
        _params: AccountStatusParams,
    ) -> Result<AccountStatusResponse, DeveloperSessionHostError> {
        Err(unsupported("account/status"))
    }

    async fn account_login(&self) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        Err(unsupported("account/login"))
    }

    async fn account_login_wait(
        &self,
        _params: AccountLoginWaitParams,
    ) -> Result<AccountLoginWaitResponse, DeveloperSessionHostError> {
        Err(unsupported("account/login/wait"))
    }

    async fn account_logout(&self) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported("account/logout"))
    }

    /// Mint a bearer token for the hosted API from the runtime's credential.
    ///
    /// The transport refuses this on a connection that did not prove it holds
    /// the loopback app-server token before the host is ever consulted.
    async fn account_token(&self) -> Result<AccountTokenResponse, DeveloperSessionHostError> {
        Err(unsupported("account/token"))
    }

    async fn context_instructions(
        &self,
        _params: ContextInstructionsParams,
    ) -> Result<ContextInstructionsResponse, DeveloperSessionHostError> {
        Err(unsupported("context/instructions"))
    }

    async fn list_skills(&self) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Err(unsupported("skills/list"))
    }

    async fn set_skill_enabled(
        &self,
        _params: SkillSetEnabledParams,
    ) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Err(unsupported("skills/setEnabled"))
    }

    async fn set_skill_consent(
        &self,
        _params: SkillConsentParams,
    ) -> Result<SkillConsentResponse, DeveloperSessionHostError> {
        Err(unsupported("skills/consent"))
    }

    async fn list_plugins(&self) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Err(unsupported("plugins/list"))
    }

    async fn set_plugin_enabled(
        &self,
        _params: PluginSetEnabledParams,
    ) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Err(unsupported("plugins/setEnabled"))
    }

    /// The servers this host knows of. `trust` is the calling connection's:
    /// for one that did not prove ownership the host reads no keychain to
    /// say whether a server is signed in, and gives a server's address
    /// without the user, password or query it carries.
    async fn list_mcp_servers(
        &self,
        _trust: DeveloperConnectionTrust,
    ) -> Result<McpServerListResponse, DeveloperSessionHostError> {
        Err(unsupported("mcp/list"))
    }

    async fn login_mcp_server(
        &self,
        _params: McpLoginParams,
    ) -> Result<McpLoginResponse, DeveloperSessionHostError> {
        Err(unsupported("mcp/login"))
    }

    async fn test_mcp_server(
        &self,
        _params: McpServerParams,
    ) -> Result<McpServerTestResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MCP_TEST))
    }

    async fn list_mcp_server_tools(
        &self,
        _params: McpServerParams,
    ) -> Result<McpServerToolsResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MCP_TOOLS))
    }

    async fn read_mcp_approval(
        &self,
        _params: McpApprovalReadParams,
    ) -> Result<McpApprovalRequest, DeveloperSessionHostError> {
        Err(unsupported("mcp/approval/read"))
    }

    async fn grant_mcp_approval(
        &self,
        _params: McpApprovalGrantParams,
    ) -> Result<McpServerListResponse, DeveloperSessionHostError> {
        Err(unsupported("mcp/approval/grant"))
    }

    async fn list_hooks(&self) -> Result<HookListResponse, DeveloperSessionHostError> {
        Err(unsupported("hooks/list"))
    }

    async fn install_skill(
        &self,
        _params: SkillInstallParams,
    ) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::SKILLS_INSTALL))
    }

    async fn remove_skill(
        &self,
        _params: SkillRemoveParams,
    ) -> Result<SkillListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::SKILLS_REMOVE))
    }

    async fn install_plugin(
        &self,
        _params: PluginInstallParams,
    ) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PLUGINS_INSTALL))
    }

    async fn remove_plugin(
        &self,
        _params: PluginRemoveParams,
    ) -> Result<PluginListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PLUGINS_REMOVE))
    }

    async fn update_plugin(
        &self,
        _params: PluginRemoveParams,
    ) -> Result<PluginUpdateResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PLUGINS_UPDATE))
    }

    async fn add_mcp_server(
        &self,
        _params: McpAddParams,
    ) -> Result<McpServerListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MCP_ADD))
    }

    async fn remove_mcp_server(
        &self,
        _params: McpServerParams,
    ) -> Result<McpServerListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MCP_REMOVE))
    }

    async fn add_hook(
        &self,
        _params: HookAddParams,
    ) -> Result<HookListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::HOOKS_ADD))
    }

    async fn remove_hook(
        &self,
        _params: HookRemoveParams,
    ) -> Result<HookListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::HOOKS_REMOVE))
    }

    async fn read_settings(&self) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
        Err(unsupported("settings/read"))
    }

    async fn write_settings(
        &self,
        _params: SettingsWriteParams,
    ) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
        Err(unsupported("settings/write"))
    }

    async fn list_commands(&self) -> Result<SlashCommandListResponse, DeveloperSessionHostError> {
        Err(unsupported("commands/list"))
    }

    async fn run_command(
        &self,
        _params: SlashCommandRunParams,
    ) -> Result<SlashCommandRunResponse, DeveloperSessionHostError> {
        Err(unsupported("commands/run"))
    }

    async fn add_memory(
        &self,
        _params: MemoryAddParams,
    ) -> Result<MemoryAddResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MEMORY_ADD))
    }

    async fn create_worktree(
        &self,
        _params: WorktreeCreateParams,
    ) -> Result<WorktreeSummary, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_CREATE))
    }

    async fn remove_worktree(
        &self,
        _params: WorktreeRemoveParams,
    ) -> Result<WorktreeListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_REMOVE))
    }

    async fn list_worktrees(&self) -> Result<WorktreeListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_LIST))
    }

    async fn list_permissions(&self) -> Result<PermissionsListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PERMISSIONS_LIST))
    }

    async fn inspect_mcp_server(
        &self,
        _params: McpServerParams,
    ) -> Result<McpServerInspectResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MCP_INSPECT))
    }

    async fn remove_permission(
        &self,
        _params: PermissionsRemoveParams,
    ) -> Result<PermissionsListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PERMISSIONS_REMOVE))
    }

    async fn list_permission_rules(
        &self,
    ) -> Result<PermissionRulesResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PERMISSIONS_RULES))
    }

    async fn add_permission(
        &self,
        _params: PermissionsAddParams,
    ) -> Result<PermissionRulesResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PERMISSIONS_ADD))
    }

    async fn decide_plan(
        &self,
        _params: PlanDecideParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported(method::PLAN_DECIDE))
    }

    async fn list_provider_keys(&self) -> Result<ProvidersListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PROVIDERS_LIST))
    }

    async fn set_provider_key(
        &self,
        _params: ProviderSetKeyParams,
    ) -> Result<ProvidersListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PROVIDERS_SET_KEY))
    }

    async fn remove_provider_key(
        &self,
        _params: ProviderParams,
    ) -> Result<ProvidersListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::PROVIDERS_REMOVE_KEY))
    }

    async fn list_trusted_folders(&self) -> Result<TrustListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::TRUST_LIST))
    }

    async fn revoke_trusted_folder(
        &self,
        _params: TrustRevokeParams,
    ) -> Result<TrustListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::TRUST_REVOKE))
    }

    async fn plan_pull_request(
        &self,
        _params: GitPullRequestPlanParams,
    ) -> Result<GitPullRequestPlanResponse, DeveloperSessionHostError> {
        Err(unsupported(method::GIT_PULL_REQUEST_PLAN))
    }

    async fn create_pull_request(
        &self,
        _params: GitPullRequestParams,
    ) -> Result<GitPullRequestResponse, DeveloperSessionHostError> {
        Err(unsupported(method::GIT_PULL_REQUEST))
    }

    /// Make a worktree of this host's repository for one new session. The
    /// session itself runs in a host started inside the returned checkout.
    async fn create_managed_worktree(
        &self,
        _params: ManagedWorktreeCreateParams,
    ) -> Result<WorktreeCreateResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MANAGED_WORKTREE_CREATE))
    }

    async fn list_managed_worktrees(
        &self,
    ) -> Result<ManagedWorktreeListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::MANAGED_WORKTREE_LIST))
    }

    /// Keep everything the worktree holds on a ref, then remove it. A caller
    /// confirms first: the checkout and the session's place in it are gone.
    async fn delete_worktree(
        &self,
        _params: WorktreeIdParams,
    ) -> Result<WorktreeArchive, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_DELETE))
    }

    async fn pin_worktree(
        &self,
        _params: WorktreePinParams,
    ) -> Result<ManagedWorktreeSummary, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_PIN))
    }

    /// Read, or with `params.keep` set, change how many of the newest
    /// worktrees cleanup keeps.
    async fn worktree_keep(
        &self,
        _params: WorktreeKeepParams,
    ) -> Result<WorktreeKeepResponse, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_KEEP))
    }

    async fn apply_worktree_to_local(
        &self,
        _params: WorktreeApplyParams,
    ) -> Result<WorktreeApplyResponse, DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_APPLY_TO_LOCAL))
    }

    /// Start the approved setup script and return; its output arrives as
    /// `worktree/managed/setup/log` and its end as `worktree/managed/setup/finished`.
    async fn run_worktree_setup(
        &self,
        _params: WorktreeSetupRunParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(unsupported(method::WORKTREE_SETUP_RUN))
    }

    async fn list_turn_checkpoints(
        &self,
        _params: ThreadIdParams,
    ) -> Result<CheckpointListResponse, DeveloperSessionHostError> {
        Err(unsupported(method::CHECKPOINT_LIST))
    }

    async fn checkpoint_diff(
        &self,
        _params: CheckpointTurnParams,
    ) -> Result<CheckpointDiffResponse, DeveloperSessionHostError> {
        Err(unsupported(method::CHECKPOINT_DIFF))
    }

    /// Undo chosen sections of a turn in the files. Irreversible for the
    /// agent's lines, so a caller previews and confirms first.
    async fn revert_checkpoint_sections(
        &self,
        _params: CheckpointSectionsParams,
    ) -> Result<CheckpointSectionsResponse, DeveloperSessionHostError> {
        Err(unsupported(method::CHECKPOINT_REVERT))
    }

    async fn stage_checkpoint_sections(
        &self,
        _params: CheckpointSectionsParams,
    ) -> Result<CheckpointSectionsResponse, DeveloperSessionHostError> {
        Err(unsupported(method::CHECKPOINT_STAGE))
    }

    /// Rewind the files and the conversation to just before a turn.
    async fn revert_thread(
        &self,
        _params: ThreadRevertParams,
    ) -> Result<ThreadRevertResponse, DeveloperSessionHostError> {
        Err(unsupported(method::THREAD_REVERT))
    }

    /// Stop accepting work, cancel every active host operation, and wait until
    /// owned resources are quiescent. A transport must not acknowledge
    /// `shutdown` before this resolves successfully.
    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError>;

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification>;
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ShutdownParams {}

#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct NoParams {}

fn unsupported(method: &str) -> DeveloperSessionHostError {
    DeveloperSessionHostError::unavailable(format!(
        "This app-server host does not implement {method}"
    ))
}

/// Whether a connection proved it may mint account credentials.
///
/// Stdio is the process owner's own pipe. A WebSocket connection qualifies
/// only once the upgrade carried the loopback app-server token, which the
/// transport checks before any frame is read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeveloperConnectionTrust {
    LoopbackOwner,
    Untrusted,
}

/// What calling a method does, which decides who may call it. A connection
/// that did not prove ownership ([`DeveloperConnectionTrust::Untrusted`]) may
/// call a method that only reads and nothing else: one rule in
/// [`DeveloperSessionProcessor::process`], not a check a new method has to
/// remember. A method missing from [`METHOD_EFFECTS`] is refused there too.
///
/// Such a connection still receives every notification the server sends,
/// the text of each approval request among them, and reads every thread of
/// the workspace, checkpoint diffs, the hooks and the account's email and
/// credits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodEffect {
    /// Reports state or negotiates the connection. Nothing a later call or a
    /// later session sees is different afterwards.
    ReadOnly,
    /// Changes nothing either, and reports what is for the owner alone: the
    /// arguments and URLs of a launch waiting to be approved, where a
    /// credential may sit.
    ReadsForOwner,
    /// Changes a thread, a turn, files, a worktree, an account or the server
    /// itself.
    ChangesState,
    /// Decides what may run without the owner being asked: an approval, a
    /// consent, a credential, a setting or a switch that widens what runs.
    GrantsTrust,
    /// Sent by the server. Never a request a client makes.
    Notification,
}

/// Every method in [`method`], classified once.
pub const METHOD_EFFECTS: &[(&str, MethodEffect)] = &[
    (method::INITIALIZE, MethodEffect::ReadOnly),
    (method::INITIALIZED, MethodEffect::ReadOnly),
    (method::THREAD_START, MethodEffect::ChangesState),
    (method::THREAD_LIST, MethodEffect::ReadOnly),
    (method::THREAD_READ, MethodEffect::ReadOnly),
    (method::THREAD_RESUME, MethodEffect::ChangesState),
    (method::THREAD_FORK, MethodEffect::ChangesState),
    (method::THREAD_COMPACT, MethodEffect::ChangesState),
    (method::THREAD_HANDOFF, MethodEffect::ChangesState),
    (method::THREAD_HANDOFF_ACCEPT, MethodEffect::ChangesState),
    (method::THREAD_ARCHIVE, MethodEffect::ChangesState),
    (method::THREAD_DELETE, MethodEffect::ChangesState),
    (method::WORKSPACE_IDENTITY, MethodEffect::ReadsForOwner),
    (method::THREAD_RECONNECT, MethodEffect::ReadOnly),
    (method::THREAD_WRITER_RELEASE, MethodEffect::ChangesState),
    (method::THREAD_WRITER_TAKEOVER, MethodEffect::ChangesState),
    (method::MODEL_LIST, MethodEffect::ReadOnly),
    (method::TURN_START, MethodEffect::ChangesState),
    (method::TURN_STEER, MethodEffect::ChangesState),
    (method::TURN_INTERRUPT, MethodEffect::ChangesState),
    (method::TURN_AGENT_EVENT, MethodEffect::Notification),
    (method::APPROVAL_RESPOND, MethodEffect::GrantsTrust),
    (method::USER_INPUT_REQUESTED, MethodEffect::Notification),
    (method::USER_INPUT_RESPOND, MethodEffect::ChangesState),
    (method::TASK_STATE_CHANGED, MethodEffect::Notification),
    (method::SHUTDOWN, MethodEffect::ChangesState),
    (method::ACCOUNT_STATUS, MethodEffect::ReadOnly),
    (method::ACCOUNT_LOGIN, MethodEffect::ChangesState),
    (method::ACCOUNT_LOGIN_WAIT, MethodEffect::ChangesState),
    (method::ACCOUNT_LOGOUT, MethodEffect::ChangesState),
    (method::ACCOUNT_TOKEN, MethodEffect::GrantsTrust),
    (method::CONTEXT_INSTRUCTIONS, MethodEffect::ReadOnly),
    (method::SKILLS_LIST, MethodEffect::ReadOnly),
    (method::SKILLS_SET_ENABLED, MethodEffect::GrantsTrust),
    (method::SKILLS_CONSENT, MethodEffect::GrantsTrust),
    (method::PLUGINS_LIST, MethodEffect::ReadOnly),
    (method::PLUGINS_SET_ENABLED, MethodEffect::GrantsTrust),
    (method::MCP_LIST, MethodEffect::ReadOnly),
    (method::MCP_LOGIN, MethodEffect::ChangesState),
    (method::MCP_APPROVAL_READ, MethodEffect::ReadsForOwner),
    (method::MCP_APPROVAL_GRANT, MethodEffect::GrantsTrust),
    (method::HOOKS_LIST, MethodEffect::ReadOnly),
    (method::SETTINGS_READ, MethodEffect::ReadOnly),
    (method::SETTINGS_WRITE, MethodEffect::GrantsTrust),
    (method::COMMANDS_LIST, MethodEffect::ReadOnly),
    (method::COMMANDS_RUN, MethodEffect::ChangesState),
    (method::MANAGED_WORKTREE_CREATE, MethodEffect::ChangesState),
    (method::MANAGED_WORKTREE_LIST, MethodEffect::ReadOnly),
    (method::WORKTREE_DELETE, MethodEffect::ChangesState),
    (method::WORKTREE_PIN, MethodEffect::ChangesState),
    (method::WORKTREE_KEEP, MethodEffect::ChangesState),
    (method::WORKTREE_APPLY_TO_LOCAL, MethodEffect::ChangesState),
    (method::WORKTREE_SETUP_RUN, MethodEffect::GrantsTrust),
    (method::WORKTREE_SETUP_LOG, MethodEffect::Notification),
    (method::WORKTREE_SETUP_FINISHED, MethodEffect::Notification),
    (method::CHECKPOINT_LIST, MethodEffect::ReadOnly),
    (method::CHECKPOINT_DIFF, MethodEffect::ReadOnly),
    (method::CHECKPOINT_REVERT, MethodEffect::ChangesState),
    (method::CHECKPOINT_STAGE, MethodEffect::ChangesState),
    (method::THREAD_REVERT, MethodEffect::ChangesState),
    (method::THREAD_CHECKPOINTS, MethodEffect::ReadOnly),
    (method::THREAD_SEARCH, MethodEffect::ReadOnly),
    (method::WORKTREE_LIST, MethodEffect::ReadOnly),
    (method::GIT_PULL_REQUEST_PLAN, MethodEffect::ReadOnly),
    (method::PERMISSIONS_LIST, MethodEffect::ReadsForOwner),
    (method::PERMISSIONS_RULES, MethodEffect::ReadsForOwner),
    (method::PROVIDERS_LIST, MethodEffect::ReadsForOwner),
    (method::TRUST_LIST, MethodEffect::ReadsForOwner),
    (method::GIT_PULL_REQUEST, MethodEffect::ChangesState),
    (method::MCP_INSPECT, MethodEffect::ChangesState),
    (method::MCP_TEST, MethodEffect::ChangesState),
    (method::MCP_TOOLS, MethodEffect::ChangesState),
    (method::MEMORY_ADD, MethodEffect::ChangesState),
    (method::THREAD_REWIND, MethodEffect::ChangesState),
    (method::THREAD_UNARCHIVE, MethodEffect::ChangesState),
    (method::WORKTREE_CREATE, MethodEffect::ChangesState),
    (method::WORKTREE_REMOVE, MethodEffect::ChangesState),
    (method::HOOKS_ADD, MethodEffect::GrantsTrust),
    (method::HOOKS_REMOVE, MethodEffect::GrantsTrust),
    (method::MCP_ADD, MethodEffect::GrantsTrust),
    (method::MCP_REMOVE, MethodEffect::GrantsTrust),
    (method::PERMISSIONS_ADD, MethodEffect::GrantsTrust),
    (method::PERMISSIONS_REMOVE, MethodEffect::GrantsTrust),
    (method::PLAN_DECIDE, MethodEffect::GrantsTrust),
    (method::PLUGINS_INSTALL, MethodEffect::GrantsTrust),
    (method::PLUGINS_REMOVE, MethodEffect::GrantsTrust),
    (method::PLUGINS_UPDATE, MethodEffect::GrantsTrust),
    (method::PROVIDERS_REMOVE_KEY, MethodEffect::GrantsTrust),
    (method::PROVIDERS_SET_KEY, MethodEffect::GrantsTrust),
    (method::SKILLS_INSTALL, MethodEffect::GrantsTrust),
    (method::SKILLS_REMOVE, MethodEffect::GrantsTrust),
    (method::TRUST_REVOKE, MethodEffect::GrantsTrust),
    (method::MCP_AUTH_REQUIRED, MethodEffect::Notification),
    (method::THREAD_PLAN, MethodEffect::Notification),
];

/// How `method` is classified, or `None` for one [`METHOD_EFFECTS`] does not
/// hold.
pub fn method_effect(method: &str) -> Option<MethodEffect> {
    METHOD_EFFECTS
        .iter()
        .find(|(name, _)| *name == method)
        .map(|(_, effect)| *effect)
}

/// Error categories that survive the local app-server boundary without
/// leaking internal error chains to editor clients.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeveloperSessionHostError {
    code: i32,
    message: String,
    data: Option<serde_json::Value>,
}

impl DeveloperSessionHostError {
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(-32602, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(-32004, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(-32009, message)
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(-32010, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(-32603, message)
    }

    /// Another live process holds the thread's writer lease.
    pub fn writer_conflict(message: impl Into<String>, data: ThreadWriterConflictData) -> Self {
        Self {
            data: serde_json::to_value(data).ok(),
            ..Self::new(THREAD_WRITER_CONFLICT_ERROR_CODE, message)
        }
    }

    /// The launch an approval named is no longer the one that would start,
    /// so nothing was approved. `current` is that launch as it is now.
    pub fn mcp_approval_stale(message: impl Into<String>, current: McpApprovalRequest) -> Self {
        Self {
            data: serde_json::to_value(current).ok(),
            ..Self::new(MCP_APPROVAL_STALE_ERROR_CODE, message)
        }
    }

    /// The project's own skills are no longer the ones a consent named, so
    /// nothing was allowed. `current` is the list as it is now.
    pub fn skills_consent_stale(message: impl Into<String>, current: SkillListResponse) -> Self {
        Self {
            data: serde_json::to_value(current).ok(),
            ..Self::new(MCP_APPROVAL_STALE_ERROR_CODE, message)
        }
    }

    pub fn data(&self) -> Option<&serde_json::Value> {
        self.data.as_ref()
    }

    pub fn code(&self) -> i32 {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }
}

impl fmt::Display for DeveloperSessionHostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for DeveloperSessionHostError {}

/// Methods whose host work runs git over a whole checkout, or waits on a
/// model to summarize, and can take minutes. A transport runs each on its own task, so approvals, interrupts
/// and notifications on the same connection are not held behind it. Every
/// response still carries its request's id; one may arrive after responses to
/// requests sent later.
pub fn runs_detached(method: &str) -> bool {
    matches!(
        method,
        method::WORKTREE_CREATE
            | method::MANAGED_WORKTREE_CREATE
            | method::WORKTREE_DELETE
            | method::WORKTREE_APPLY_TO_LOCAL
            | method::CHECKPOINT_LIST
            | method::CHECKPOINT_DIFF
            | method::CHECKPOINT_REVERT
            | method::CHECKPOINT_STAGE
            | method::THREAD_REVERT
            | method::THREAD_COMPACT
    )
}

/// The most detached requests one connection has running at a time, and all
/// connections together. Each is host git over a whole checkout or a model
/// call, so without a bound a client that sends them in a loop starts as many
/// as it likes. A connection that did not prove ownership gets a small share
/// of both, which the owner's connections cannot be crowded out of.
const DETACHED_PER_CONNECTION: usize = 8;
const DETACHED_PER_READ_ONLY_CONNECTION: usize = 2;
const DETACHED_IN_TOTAL: usize = 16;
const DETACHED_READ_ONLY_IN_TOTAL: usize = 4;

/// The detached requests in flight across every connection of the process.
pub(crate) struct DetachedJobs {
    all: Semaphore,
    read_only: Semaphore,
}

/// A place among the detached requests in flight, given back when the
/// request has been answered.
pub(crate) struct DetachedSlot {
    _all: SemaphorePermit<'static>,
    _read_only: Option<SemaphorePermit<'static>>,
}

static DETACHED_JOBS: DetachedJobs = DetachedJobs::new();

impl DetachedJobs {
    const fn new() -> Self {
        Self {
            all: Semaphore::const_new(DETACHED_IN_TOTAL),
            read_only: Semaphore::const_new(DETACHED_READ_ONLY_IN_TOTAL),
        }
    }

    /// A slot for one more request of a connection that has `running` of
    /// them already, or why there is none. Nothing waits: a request that
    /// finds no slot is refused at once, so a queue cannot grow either.
    fn admit(
        &'static self,
        trust: DeveloperConnectionTrust,
        running: usize,
    ) -> Result<DetachedSlot, &'static str> {
        const CONNECTION_BUSY: &str = "This connection already has as many long-running requests in flight as it may; wait for one to finish";
        const SERVER_BUSY: &str = "The app-server already has as many long-running requests in flight as it may; wait for one to finish";
        let owner = trust == DeveloperConnectionTrust::LoopbackOwner;
        let per_connection = if owner {
            DETACHED_PER_CONNECTION
        } else {
            DETACHED_PER_READ_ONLY_CONNECTION
        };
        if running >= per_connection {
            return Err(CONNECTION_BUSY);
        }
        let read_only = if owner {
            None
        } else {
            Some(self.read_only.try_acquire().map_err(|_| SERVER_BUSY)?)
        };
        let all = self.all.try_acquire().map_err(|_| SERVER_BUSY)?;
        Ok(DetachedSlot {
            _all: all,
            _read_only: read_only,
        })
    }
}

/// Run one `runs_detached` request on its own task of `detached`, or answer
/// that there is no room for it ([`DetachedJobs::admit`]), which the caller
/// sends straight back.
///
/// The request id stays with the task, so in an unwinding build a host that
/// panics still answers its client with an internal error instead of leaving
/// the request open. The release profile sets `panic = "abort"`, where a panic
/// ends the whole process and this catch never runs.
pub(crate) fn spawn_detached(
    detached: &mut JoinSet<AppServerResponse>,
    mut processor: DeveloperSessionProcessor,
    request: AppServerRequest,
) -> Option<AppServerResponse> {
    let slot = match DETACHED_JOBS.admit(processor.trust, detached.len()) {
        Ok(slot) => slot,
        Err(busy) => {
            let busy = DeveloperSessionHostError::unavailable(busy);
            return Some(AppServerResponse::failure(
                request.id,
                busy.code(),
                busy.message(),
            ));
        }
    };
    let id = request.id.clone();
    let method = request.method.clone();
    detached.spawn(async move {
        let _slot = slot;
        AssertUnwindSafe(processor.process(request))
            .catch_unwind()
            .await
            .unwrap_or_else(|_| {
                AppServerResponse::failure(id, -32603, format!("{method} failed unexpectedly"))
            })
    });
    None
}

/// Connection-local request processor for the shared CLI/VS Code runtime.
///
/// A processor is intentionally not shared between connections: handshake
/// state and the client identity belong to one stdio or WebSocket client. A
/// clone carries that state for one detached request of the same connection.
#[derive(Clone)]
pub struct DeveloperSessionProcessor {
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
    initialized: bool,
    client: Option<AppServerClientInfo>,
    trust: DeveloperConnectionTrust,
    negotiated_version: u32,
    turn_client: TurnClient,
}

/// What the client that starts a turn has said it can do for that turn.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TurnClient {
    /// The client answers `userInput/requested`; see `InitializeParams::user_input`.
    pub answers_user_input: bool,
}

impl DeveloperSessionProcessor {
    pub fn new(host: Arc<dyn DeveloperSessionHost>, capabilities: AppServerCapabilities) -> Self {
        Self::new_with_trust(host, capabilities, DeveloperConnectionTrust::LoopbackOwner)
    }

    /// Build a processor for a connection whose authentication is known.
    ///
    /// Mutations and owner-only reads require process stdio or a WebSocket
    /// upgrade carrying the token in a header. Query-token connections remain
    /// restricted to methods classified as read-only.
    pub fn new_with_trust(
        host: Arc<dyn DeveloperSessionHost>,
        capabilities: AppServerCapabilities,
        trust: DeveloperConnectionTrust,
    ) -> Self {
        Self {
            host,
            capabilities,
            initialized: false,
            client: None,
            trust,
            negotiated_version: LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
            turn_client: TurnClient::default(),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.host.subscribe()
    }

    /// Wire version agreed during `initialize`. Before the handshake this is
    /// the legacy version, which is what a client that states none receives.
    pub fn negotiated_protocol_version(&self) -> u32 {
        self.negotiated_version
    }

    pub async fn process(&mut self, request: AppServerRequest) -> AppServerResponse {
        if request.method == method::INITIALIZE {
            return self.initialize(request);
        }

        if !self.initialized {
            return AppServerResponse::failure(
                request.id,
                -32002,
                "Client must initialize before invoking app-server methods",
            );
        }

        if self.trust != DeveloperConnectionTrust::LoopbackOwner
            && method_effect(&request.method) != Some(MethodEffect::ReadOnly)
        {
            return AppServerResponse::failure(
                request.id,
                -32006,
                format!(
                    "{} is refused on this connection, which may only read: call it over process stdio or a WebSocket whose upgrade carried the app-server token in a header",
                    request.method
                ),
            );
        }

        if !self.capabilities.managed_worktrees
            && matches!(
                request.method.as_str(),
                method::MANAGED_WORKTREE_CREATE
                    | method::MANAGED_WORKTREE_LIST
                    | method::WORKTREE_DELETE
                    | method::WORKTREE_PIN
                    | method::WORKTREE_KEEP
                    | method::WORKTREE_APPLY_TO_LOCAL
                    | method::WORKTREE_SETUP_RUN
            )
        {
            let error = unsupported(&request.method);
            return AppServerResponse::failure(request.id, error.code(), error.message());
        }

        let id = request.id.clone();
        let result = match request.method.as_str() {
            method::THREAD_START => {
                let params = match parse_params::<ThreadStartParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                let client = match self.client.clone() {
                    Some(client) => client,
                    None => {
                        return AppServerResponse::failure(
                            request.id,
                            -32603,
                            "Initialized app-server connection is missing client identity",
                        );
                    }
                };
                self.host
                    .start_thread(params, client)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::THREAD_LIST => {
                let params = match parse_params::<ThreadListParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .list_threads(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MODEL_LIST => {
                let mut params = match parse_optional_params::<ModelListParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                // A refresh probes every local runtime and looks up a
                // credential per route: only the owner's connection may ask
                // for one, and the host is told who is asking besides.
                params.refresh &= self.trust == DeveloperConnectionTrust::LoopbackOwner;
                self.host
                    .list_local_models(params, self.trust)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_RESUME => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .resume_thread(params)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::THREAD_READ => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .read_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_FORK => {
                let params = match parse_params::<ThreadForkParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                let client = match self.client.clone() {
                    Some(client) => client,
                    None => {
                        return AppServerResponse::failure(
                            request.id,
                            -32603,
                            "Initialized app-server connection is missing client identity",
                        );
                    }
                };
                self.host
                    .fork_thread(params, client)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::THREAD_COMPACT => {
                let params = match parse_params::<ThreadCompactParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .compact_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_HANDOFF => {
                let params = match parse_params::<ThreadHandoffParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .hand_off_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_HANDOFF_ACCEPT => {
                let params = match parse_params::<ThreadHandoffAcceptParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .accept_handoff(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_ARCHIVE => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .archive_thread(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::THREAD_UNARCHIVE => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .unarchive_thread(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::THREAD_SEARCH => {
                let params = match parse_params::<ThreadSearchParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .search_threads(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_CHECKPOINTS => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .list_checkpoints(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_REWIND => {
                let params = match parse_params::<ThreadRewindParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .rewind_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_DELETE => {
                let params = match parse_params::<ThreadDeleteParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .delete_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKSPACE_IDENTITY => self
                .host
                .workspace_identity()
                .await
                .map(serde_json::to_value),
            method::THREAD_RECONNECT => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .reconnect_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_WRITER_RELEASE => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .release_thread_writer(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::THREAD_WRITER_TAKEOVER => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .take_over_thread_writer(params)
                    .await
                    .map(|thread| serde_json::to_value(ThreadStartResponse { thread }))
            }
            method::TURN_START => {
                let params = match parse_params::<TurnStartParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .start_turn_for(params, self.turn_client)
                    .await
                    .map(|turn| serde_json::to_value(TurnStartResponse { turn }))
            }
            method::TURN_STEER => {
                let params = match parse_params::<TurnSteerParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .steer_turn(params)
                    .await
                    .map(|turn| serde_json::to_value(TurnStartResponse { turn }))
            }
            method::TURN_INTERRUPT => {
                let params = match parse_params::<TurnInterruptParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .interrupt_turn(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::APPROVAL_RESPOND => {
                let params = match parse_params::<ApprovalResponseParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .respond_to_approval(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::USER_INPUT_RESPOND => {
                let params = match parse_params::<UserInputResponseParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .respond_to_user_input(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::ACCOUNT_STATUS => {
                let mut params = match parse_optional_params::<AccountStatusParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                // A refresh drops the cached account and calls the hosted API
                // with the owner's credential, and the host cannot see who
                // asked: only the owner's connection may ask for one.
                params.refresh &= self.trust == DeveloperConnectionTrust::LoopbackOwner;
                self.host
                    .account_status(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::ACCOUNT_LOGIN => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.account_login().await.map(serde_json::to_value)
            }
            method::ACCOUNT_LOGIN_WAIT => {
                let params = match parse_params::<AccountLoginWaitParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .account_login_wait(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::ACCOUNT_LOGOUT => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .account_logout()
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::ACCOUNT_TOKEN => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.account_token().await.map(serde_json::to_value)
            }
            method::CONTEXT_INSTRUCTIONS => {
                let params = match parse_optional_params::<ContextInstructionsParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .context_instructions(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SKILLS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_skills().await.map(serde_json::to_value)
            }
            method::SKILLS_SET_ENABLED => {
                let params = match parse_params::<SkillSetEnabledParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_skill_enabled(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SKILLS_CONSENT => {
                let params = match parse_params::<SkillConsentParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_skill_consent(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PLUGINS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_plugins().await.map(serde_json::to_value)
            }
            method::PLUGINS_SET_ENABLED => {
                let params = match parse_params::<PluginSetEnabledParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_plugin_enabled(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .list_mcp_servers(self.trust)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_LOGIN => {
                let params = match parse_params::<McpLoginParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .login_mcp_server(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_TEST => {
                let params = match parse_params::<McpServerParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .test_mcp_server(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_TOOLS => {
                let params = match parse_params::<McpServerParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .list_mcp_server_tools(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SKILLS_INSTALL => {
                let params = match parse_params::<SkillInstallParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .install_skill(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SKILLS_REMOVE => {
                let params = match parse_params::<SkillRemoveParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_skill(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PLUGINS_INSTALL => {
                let params = match parse_params::<PluginInstallParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .install_plugin(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PLUGINS_REMOVE => {
                let params = match parse_params::<PluginRemoveParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_plugin(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PLUGINS_UPDATE => {
                let params = match parse_params::<PluginRemoveParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .update_plugin(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_ADD => {
                let params = match parse_params::<McpAddParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .add_mcp_server(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_REMOVE => {
                let params = match parse_params::<McpServerParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_mcp_server(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::HOOKS_ADD => {
                let params = match parse_params::<HookAddParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host.add_hook(params).await.map(serde_json::to_value)
            }
            method::HOOKS_REMOVE => {
                let params = match parse_params::<HookRemoveParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_hook(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_APPROVAL_READ => {
                let params = match parse_params::<McpApprovalReadParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .read_mcp_approval(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MCP_APPROVAL_GRANT => {
                let params = match parse_params::<McpApprovalGrantParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .grant_mcp_approval(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::HOOKS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_hooks().await.map(serde_json::to_value)
            }
            method::SETTINGS_READ => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.read_settings().await.map(serde_json::to_value)
            }
            method::SETTINGS_WRITE => {
                let params = match parse_params::<SettingsWriteParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .write_settings(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::COMMANDS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_commands().await.map(serde_json::to_value)
            }
            method::COMMANDS_RUN => {
                let params = match parse_params::<SlashCommandRunParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .run_command(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_CREATE => {
                let params = match parse_params::<WorktreeCreateParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .create_worktree(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_REMOVE => {
                let params = match parse_params::<WorktreeRemoveParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_worktree(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_worktrees().await.map(serde_json::to_value)
            }
            method::MCP_INSPECT => {
                let params = match parse_params::<McpServerParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .inspect_mcp_server(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PERMISSIONS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host.list_permissions().await.map(serde_json::to_value)
            }
            method::PERMISSIONS_REMOVE => {
                let params = match parse_params::<PermissionsRemoveParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_permission(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PERMISSIONS_RULES => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .list_permission_rules()
                    .await
                    .map(serde_json::to_value)
            }
            method::PERMISSIONS_ADD => {
                let params = match parse_params::<PermissionsAddParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .add_permission(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::GIT_PULL_REQUEST_PLAN => {
                let params = match parse_optional_params::<GitPullRequestPlanParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .plan_pull_request(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::GIT_PULL_REQUEST => {
                let params = match parse_params::<GitPullRequestParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .create_pull_request(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PLAN_DECIDE => {
                let params = match parse_params::<PlanDecideParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .decide_plan(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::PROVIDERS_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .list_provider_keys()
                    .await
                    .map(serde_json::to_value)
            }
            method::PROVIDERS_SET_KEY => {
                let params = match parse_params::<ProviderSetKeyParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .set_provider_key(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::PROVIDERS_REMOVE_KEY => {
                let params = match parse_params::<ProviderParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .remove_provider_key(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::TRUST_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .list_trusted_folders()
                    .await
                    .map(serde_json::to_value)
            }
            method::TRUST_REVOKE => {
                let params = match parse_params::<TrustRevokeParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .revoke_trusted_folder(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MEMORY_ADD => {
                let params = match parse_params::<MemoryAddParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host.add_memory(params).await.map(serde_json::to_value)
            }
            method::MANAGED_WORKTREE_CREATE => {
                let params = match parse_params::<ManagedWorktreeCreateParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .create_managed_worktree(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::MANAGED_WORKTREE_LIST => {
                if let Err(response) = parse_optional_params::<NoParams>(&request) {
                    return *response;
                }
                self.host
                    .list_managed_worktrees()
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_DELETE => {
                let params = match parse_params::<WorktreeIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .delete_worktree(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_PIN => {
                let params = match parse_params::<WorktreePinParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .pin_worktree(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_KEEP => {
                let params = match parse_optional_params::<WorktreeKeepParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .worktree_keep(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_APPLY_TO_LOCAL => {
                let params = match parse_params::<WorktreeApplyParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .apply_worktree_to_local(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::WORKTREE_SETUP_RUN => {
                let params = match parse_params::<WorktreeSetupRunParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .run_worktree_setup(params)
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            method::CHECKPOINT_LIST => {
                let params = match parse_params::<ThreadIdParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .list_turn_checkpoints(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::CHECKPOINT_DIFF => {
                let params = match parse_params::<CheckpointTurnParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .checkpoint_diff(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::CHECKPOINT_REVERT => {
                let params = match parse_params::<CheckpointSectionsParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .revert_checkpoint_sections(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::CHECKPOINT_STAGE => {
                let params = match parse_params::<CheckpointSectionsParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .stage_checkpoint_sections(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::THREAD_REVERT => {
                let params = match parse_params::<ThreadRevertParams>(&request) {
                    Ok(params) => params,
                    Err(response) => return *response,
                };
                self.host
                    .revert_thread(params)
                    .await
                    .map(serde_json::to_value)
            }
            method::SHUTDOWN => {
                if let Err(response) = parse_params::<ShutdownParams>(&request) {
                    return *response;
                }
                self.host
                    .shutdown()
                    .await
                    .map(|()| serde_json::to_value(AcknowledgedResponse { acknowledged: true }))
            }
            _ => {
                return AppServerResponse::failure(
                    request.id,
                    -32601,
                    format!("Method not found: {}", request.method),
                );
            }
        };

        response_from_host_result(id, result)
    }

    fn initialize(&mut self, request: AppServerRequest) -> AppServerResponse {
        if self.initialized {
            return AppServerResponse::failure(
                request.id,
                -32003,
                "Client has already initialized this connection",
            );
        }

        let params = match parse_params::<InitializeParams>(&request) {
            Ok(params) => params,
            Err(response) => return *response,
        };

        let negotiated = match params.protocol_version {
            None => LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
            Some(requested)
                if SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS.contains(&requested) =>
            {
                requested
            }
            Some(requested) => {
                let supported = SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(", ");
                let upgrade = if requested < MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION {
                    "upgrade the client"
                } else {
                    "upgrade the AGI CLI"
                };
                let mut refusal = AppServerResponse::failure(
                    request.id,
                    PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
                    format!(
                        "Client requested developer-session protocol {requested}; this server speaks {supported}; {upgrade}"
                    ),
                );
                if let Some(error) = refusal.error.as_mut() {
                    error.data = serde_json::to_value(ProtocolVersionUnsupportedData {
                        requested_protocol_version: requested,
                        supported_protocol_versions: SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS
                            .to_vec(),
                        minimum_protocol_version: MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
                    })
                    .ok();
                }
                return refusal;
            }
        };

        self.initialized = true;
        self.negotiated_version = negotiated;
        self.turn_client = TurnClient {
            answers_user_input: params.user_input,
        };
        self.client = Some(params.client_info);
        response_from_serializable(
            request.id,
            InitializeResponse {
                server_info: AppServerClientInfo {
                    name: SERVER_NAME.to_string(),
                    title: SERVER_TITLE.to_string(),
                    version: self.host.server_version().to_string(),
                },
                protocol_version: negotiated,
                capabilities: self.capabilities.clone(),
                agent_event_schema_version: Some(AGENT_EVENT_SCHEMA_VERSION),
                minimum_protocol_version: Some(MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION),
            },
        )
    }
}

/// Serve the typed developer-session protocol over newline-delimited JSON.
///
/// Request handling and host notifications share one writer, so every output
/// remains an atomic JSON line. The host must return from `start_turn` before
/// doing long-running work; streamed deltas then arrive through `subscribe`.
pub async fn serve_developer_session_io<R, W>(
    reader: R,
    mut writer: W,
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut processor = DeveloperSessionProcessor::new(host, capabilities);
    let mut notifications = processor.subscribe();
    let mut lines = BufReader::new(reader).lines();
    let mut initialized = false;
    let mut host_shutdown = false;
    let mut detached: JoinSet<AppServerResponse> = JoinSet::new();

    let transport_result: Result<()> = async {
        loop {
            tokio::select! {
                Some(finished) = detached.join_next(), if !detached.is_empty() => {
                    if let Ok(response) = finished {
                        write_json_line(&mut writer, &response).await?;
                    }
                }
                line = lines.next_line() => {
                    let Some(line) = line? else {
                        return Ok(());
                    };
                    if line.trim().is_empty() {
                        continue;
                    }

                    let request = match serde_json::from_str::<AppServerRequest>(&line) {
                        Ok(request) => request,
                        Err(error) => {
                            write_json_line(
                                &mut writer,
                                &AppServerResponse::failure(
                                    serde_json::Value::Null,
                                    -32700,
                                    format!("Parse error: {error}"),
                                ),
                            )
                            .await?;
                            continue;
                        }
                    };
                    if initialized && runs_detached(&request.method) {
                        if let Some(refused) =
                            spawn_detached(&mut detached, processor.clone(), request)
                        {
                            write_json_line(&mut writer, &refused).await?;
                        }
                        continue;
                    }
                    let is_initialize = request.method == method::INITIALIZE;
                    let is_shutdown = request.method == method::SHUTDOWN;
                    let response = processor.process(request).await;
                    if is_initialize && response.error.is_none() {
                        initialized = true;
                    }
                    if is_shutdown && response.error.is_none() {
                        host_shutdown = true;
                        // The host waited for every admitted request before
                        // acknowledging, so their answers go out first.
                        while let Some(finished) = detached.join_next().await {
                            if let Ok(earlier) = finished {
                                write_json_line(&mut writer, &earlier).await?;
                            }
                        }
                    }
                    write_json_line(&mut writer, &response).await?;
                    if host_shutdown {
                        return Ok(());
                    }
                }
                notification = notifications.recv(), if initialized => {
                    match notification {
                        Ok(notification) => write_json_line(&mut writer, &notification).await?,
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            let warning = AppServerNotification::new(
                                "server/warning",
                                serde_json::json!({
                                    "code": "notification_lag",
                                    "skipped": skipped,
                                }),
                            )?;
                            write_json_line(&mut writer, &warning).await?;
                        }
                        Err(broadcast::error::RecvError::Closed) => return Ok(()),
                    }
                }
            }
        }
    }
    .await;

    // A request still running belongs to the host now: its git is left to
    // finish rather than cut off, and shutdown below waits for it.
    detached.detach_all();
    if !host_shutdown {
        processor
            .host
            .shutdown()
            .await
            .map_err(anyhow::Error::new)?;
    }
    match transport_result {
        Err(error) if is_broken_pipe(&error) => Ok(()),
        Err(error) => Err(error),
        Ok(()) => match writer.shutdown().await {
            Err(error) if error.kind() == std::io::ErrorKind::BrokenPipe => Ok(()),
            other => other.map_err(anyhow::Error::new),
        },
    }
}

/// A client that closes its end of the pipe has gone away, the same as one
/// that sends EOF: the host still has to be quiesced, and it is not an error.
fn is_broken_pipe(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<std::io::Error>()
            .is_some_and(|io| io.kind() == std::io::ErrorKind::BrokenPipe)
    })
}

/// Run the typed developer-session app-server on process stdio.
pub async fn run_developer_session_stdio(
    host: Arc<dyn DeveloperSessionHost>,
    capabilities: AppServerCapabilities,
) -> Result<()> {
    serve_developer_session_io(tokio::io::stdin(), tokio::io::stdout(), host, capabilities).await
}

async fn write_json_line(
    writer: &mut (impl AsyncWrite + Unpin),
    value: &impl Serialize,
) -> Result<()> {
    let bytes = serde_json::to_vec(value)?;
    writer.write_all(&bytes).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}

/// Parse params for a method whose params object is entirely optional, so a
/// client may omit the field rather than sending `{}`.
fn parse_optional_params<T: DeserializeOwned + Default>(
    request: &AppServerRequest,
) -> Result<T, Box<AppServerResponse>> {
    if request.params.is_null() {
        return Ok(T::default());
    }
    parse_params(request)
}

fn parse_params<T: DeserializeOwned>(
    request: &AppServerRequest,
) -> Result<T, Box<AppServerResponse>> {
    request.parse_params().map_err(|error| {
        Box::new(AppServerResponse::failure(
            request.id.clone(),
            -32602,
            format!("Invalid parameters for {}: {error}", request.method),
        ))
    })
}

fn response_from_serializable(id: serde_json::Value, result: impl Serialize) -> AppServerResponse {
    match AppServerResponse::success(id.clone(), result) {
        Ok(response) => response,
        Err(error) => AppServerResponse::failure(
            id,
            -32603,
            format!("Failed to serialize app-server response: {error}"),
        ),
    }
}

fn response_from_host_result(
    id: serde_json::Value,
    result: Result<Result<serde_json::Value, serde_json::Error>, DeveloperSessionHostError>,
) -> AppServerResponse {
    match result {
        Ok(Ok(value)) => response_from_serializable(id, value),
        Ok(Err(error)) => AppServerResponse::failure(
            id,
            -32603,
            format!("Failed to serialize app-server response: {error}"),
        ),
        Err(error) => {
            let mut response = AppServerResponse::failure(id, error.code(), error.message());
            if let Some(failure) = response.error.as_mut() {
                failure.data = error.data;
            }
            response
        }
    }
}

#[cfg(test)]
mod detached_tests {
    use super::*;

    fn jobs() -> &'static DetachedJobs {
        Box::leak(Box::new(DetachedJobs::new()))
    }

    #[test]
    fn a_connection_is_held_to_its_own_share_of_detached_requests() {
        let jobs = jobs();
        for (trust, share) in [
            (
                DeveloperConnectionTrust::LoopbackOwner,
                DETACHED_PER_CONNECTION,
            ),
            (
                DeveloperConnectionTrust::Untrusted,
                DETACHED_PER_READ_ONLY_CONNECTION,
            ),
        ] {
            assert!(jobs.admit(trust, share - 1).is_ok(), "{trust:?}");
            let refused = jobs.admit(trust, share).err().expect("no room");
            assert!(refused.contains("This connection"), "{refused}");
        }
        const { assert!(DETACHED_PER_READ_ONLY_CONNECTION < DETACHED_PER_CONNECTION) };
    }

    #[test]
    fn read_only_connections_share_a_few_slots_and_cannot_take_the_owners() {
        let jobs = jobs();
        let read_only: Vec<DetachedSlot> = (0..DETACHED_READ_ONLY_IN_TOTAL)
            .map(|_| {
                jobs.admit(DeveloperConnectionTrust::Untrusted, 0)
                    .unwrap_or_else(|busy| panic!("{busy}"))
            })
            .collect();
        let refused = jobs
            .admit(DeveloperConnectionTrust::Untrusted, 0)
            .err()
            .expect("the read-only share is used up");
        assert!(refused.contains("The app-server"), "{refused}");

        let owners: Vec<DetachedSlot> = (0..DETACHED_IN_TOTAL - DETACHED_READ_ONLY_IN_TOTAL)
            .map(|_| {
                jobs.admit(DeveloperConnectionTrust::LoopbackOwner, 0)
                    .unwrap_or_else(|busy| panic!("the owner was crowded out: {busy}"))
            })
            .collect();
        assert!(
            jobs.admit(DeveloperConnectionTrust::LoopbackOwner, 0)
                .is_err(),
            "every slot of the process is taken"
        );

        drop(read_only);
        assert!(
            jobs.admit(DeveloperConnectionTrust::Untrusted, 0).is_ok(),
            "a finished request gives its slot back"
        );
        drop(owners);
        const { assert!(DETACHED_READ_ONLY_IN_TOTAL < DETACHED_IN_TOTAL) };
    }
}
