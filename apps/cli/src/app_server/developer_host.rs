use agiworkforce_app_server::{DeveloperSessionHost, DeveloperSessionHostError};
use agiworkforce_protocol::agent_events::{
    AgentEvent, AgentEventProgressStatus, AgentEventProgressUpdate, AgentEventToolCategory,
    AgentEventToolExecutionEnd, AgentEventToolExecutionStart,
};
use agiworkforce_protocol::developer_session::{
    agent_event_notification, task_state_notification, AppServerCapabilities, AppServerClientInfo,
    AppServerNotification, ApprovalResponseParams, DeveloperAgentMode, DeveloperMessage,
    DeveloperReasoningEffort, DeveloperRoutingTaskType, DeveloperSessionSource,
    DeveloperSessionTrustMode, LocalModelListResponse, LocalModelProvider, LocalModelSummary,
    ThreadForkParams, ThreadIdParams, ThreadListParams, ThreadListResponse, ThreadReadResponse,
    ThreadStartParams, ThreadStatus, ThreadSummary, TurnInterruptParams, TurnStartParams,
    TurnStatus, TurnSteerParams, TurnSummary,
};
use agiworkforce_protocol::protocol::{NetworkPolicyRuleAction, ReviewDecision};
use agiworkforce_protocol::task_state::AgentTaskState;
use agiworkforce_protocol::user_input::UserInput;
use async_trait::async_trait;
use base64::Engine as _;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{broadcast, oneshot, Mutex, RwLock, RwLockReadGuard};
use uuid::Uuid;

use crate::agent::{AgentSession, ToolApprovalSink, ToolEventSink};
use crate::config::CliConfig;
use crate::context;
use crate::models::{self, ContentBlock};
use crate::models::{OllamaMode, Provider};
use crate::platform::policy::{PolicyDecision, PolicyEngine};
use crate::runtime::session::{ManagedSession, ManagedSessionAutoRouting};
use crate::runtime::session_control::{
    ManagedSessionReference, ManagedSessionStore, ManagedSessionSummary,
    ResolvedManagedSessionReference,
};
use crate::tui::approval_broker::{ApprovalDecision, ApprovalRequest};

const DEFAULT_THREAD_LIMIT: usize = 50;
const MAX_THREAD_LIMIT: usize = 100;
const APPROVAL_TIMEOUT_SECONDS: u64 = 600;
// Backstop for a hung discovery pipeline only. Must exceed the per-server
// `McpTimeouts.initialize` (30s): a single stalled server is skipped by its
// own timeout and discovery still resolves to `mcp/ready`. Equal values race
// the two timers and make the emitted notification nondeterministic.
const MCP_LOAD_TIMEOUT_SECONDS: u64 = 60;
const MAX_CONTEXT_FILES_PER_TURN: usize = 64;
const MAX_USER_INPUT_ITEMS_PER_TURN: usize = 128;
const MAX_USER_INPUT_TEXT_CHARS: usize =
    agiworkforce_protocol::user_input::MAX_USER_INPUT_TEXT_CHARS;
const MAX_USER_INPUT_TEXT_BYTES: usize = MAX_USER_INPUT_TEXT_CHARS * 4;
const MAX_IMAGE_INPUTS_PER_TURN: usize = 8;
const MAX_IMAGE_INPUT_BYTES: usize = 10_000_000;
const MAX_TOTAL_IMAGE_INPUT_BYTES: usize = 20_000_000;
const MAX_IMAGE_DATA_URL_HEADER_BYTES: usize = 256;
const MAX_IMAGE_MIME_BYTES: usize = 127;
const MAX_IMAGE_INPUT_ENCODED_BYTES: usize = MAX_IMAGE_INPUT_BYTES.div_ceil(3) * 4;
const MAX_STEER_QUEUE_DEPTH: usize = 20;
// The VS Code JSONL client rejects any single line above 4 MiB. Reserve ample
// headroom for the JSON-RPC envelope and thread summary while measuring the
// exact serialized message objects included in `thread/read`.
const MAX_THREAD_READ_TRANSCRIPT_JSON_BYTES: usize = 3 * 1024 * 1024;
const PROCESS_TREE_SHUTDOWN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(6);
/// Tools that build a second `AgentSession` this host never sees.
///
/// `subagent::run_subagent` constructs the child session itself and leaves
/// `on_tool_approval` unset, so a child's approval prompt cannot reach the
/// client: it falls back to a terminal dialog on a stdin that is this
/// process's JSON-RPC transport. They are also the only tools that never reach
/// `execute_tool`, which is where `.agiworkforce/policy.toml` is evaluated.
const SUBAGENT_SPAWN_TOOLS: [&str; 2] = ["task", "agent"];
/// Ceiling on turns running at once across every thread this host owns.
///
/// A subagent concurrency cap is per `SubagentManager`, and a manager belongs
/// to one session, so the host-wide ceiling on subagent OS threads is this
/// value times that cap. Without it the multiplier is however many threads a
/// client chooses to drive at once.
const MAX_CONCURRENT_RUNNING_TURNS: usize = 8;

#[derive(Clone, Debug)]
struct PreparedInput {
    text: String,
    images: Vec<ContentBlock>,
}

struct TurnSetupSnapshot {
    model: String,
    provider: Provider,
    privacy_mode: crate::agent::PrivacyMode,
    permission_mode: crate::cli_options::PermissionMode,
    plan_mode: bool,
    plan_approved: bool,
    skip_permissions: bool,
    auto_approve_safe: bool,
    thinking_budget_tokens: Option<u32>,
    effort: Option<crate::design_system::Effort>,
    message_count: usize,
    attachment_count: usize,
    fallback_chain: Option<crate::routing::fallback::FallbackChain>,
    auto_routing: Option<ManagedSessionAutoRouting>,
}

impl TurnSetupSnapshot {
    fn capture(agent: &AgentSession) -> Self {
        Self {
            model: agent.model.clone(),
            provider: agent.provider.clone(),
            privacy_mode: agent.privacy_mode,
            permission_mode: agent.permission_mode,
            plan_mode: agent.plan_mode,
            plan_approved: agent.plan_approved,
            skip_permissions: agent.skip_permissions,
            auto_approve_safe: agent.auto_approve_safe,
            thinking_budget_tokens: agent.thinking_budget_tokens,
            effort: agent.effort,
            message_count: agent.messages.len(),
            attachment_count: agent.attached_context_files.len(),
            fallback_chain: agent.fallback_chain.clone(),
            auto_routing: agent.managed_auto_routing().cloned(),
        }
    }

    fn restore(self, agent: &mut AgentSession) {
        agent.model = self.model;
        agent.provider = self.provider;
        agent.set_privacy_mode(self.privacy_mode);
        agent.permission_mode = self.permission_mode;
        agent.plan_mode = self.plan_mode;
        agent.plan_approved = self.plan_approved;
        agent.skip_permissions = self.skip_permissions;
        agent.auto_approve_safe = self.auto_approve_safe;
        agent.thinking_budget_tokens = self.thinking_budget_tokens;
        agent.effort = self.effort;
        agent.messages.truncate(self.message_count);
        agent.attached_context_files.truncate(self.attachment_count);
        agent.fallback_chain = self.fallback_chain;
        agent.set_managed_auto_routing(self.auto_routing);
    }
}

struct ResolvedThreadModel {
    provider_model_id: String,
    auto_routing: Option<ManagedSessionAutoRouting>,
    fallback_model_ids: Vec<String>,
}

struct RunningTurn {
    turn_id: String,
    handle: tokio::task::JoinHandle<()>,
    partial: Arc<StdMutex<String>>,
    process_owner: crate::process_tree::ProcessTreeOwner,
}

async fn take_steered_input_or_close(
    running_turns: &Mutex<HashMap<String, RunningTurn>>,
    steering: &Mutex<HashMap<String, Vec<PreparedInput>>>,
    thread_id: &str,
    turn_id: &str,
) -> Option<PreparedInput> {
    // This lock order is shared with `steer_turn`: enqueue either commits
    // before this close point or observes that the running claim is gone.
    let mut running = running_turns.lock().await;
    let mut queues = steering.lock().await;
    if running
        .get(thread_id)
        .is_none_or(|running| running.turn_id != turn_id)
    {
        return None;
    }
    let next = queues
        .get_mut(thread_id)
        .and_then(|queue| (!queue.is_empty()).then(|| queue.remove(0)));
    if next.is_none() {
        running.remove(thread_id);
        queues.remove(thread_id);
    }
    next
}

async fn close_running_turn_claim(
    running_turns: &Mutex<HashMap<String, RunningTurn>>,
    steering: &Mutex<HashMap<String, Vec<PreparedInput>>>,
    thread_id: &str,
    turn_id: &str,
) {
    let mut running = running_turns.lock().await;
    let mut queues = steering.lock().await;
    if running
        .get(thread_id)
        .is_some_and(|running| running.turn_id == turn_id)
    {
        running.remove(thread_id);
        queues.remove(thread_id);
    }
}

struct PendingApproval {
    thread_id: String,
    turn_id: String,
    responder: oneshot::Sender<ApprovalDecision>,
}

/// Canonical local developer runtime shared by the CLI and VS Code.
///
/// The host owns persisted sessions, live agent instances, turn tasks,
/// cancellation, approval continuations, MCP attachment, and streamed events.
/// VS Code is a client of this host and never owns a second agent loop.
pub struct CliDeveloperSessionHost {
    config: Arc<CliConfig>,
    workspace_root: PathBuf,
    store: ManagedSessionStore,
    load_integrations: bool,
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<AgentSession>>>>>,
    running_turns: Arc<Mutex<HashMap<String, RunningTurn>>>,
    steering: Arc<Mutex<HashMap<String, Vec<PreparedInput>>>>,
    pending_approvals: Arc<Mutex<HashMap<String, PendingApproval>>>,
    notifications: broadcast::Sender<AppServerNotification>,
    shutdown_started: Arc<AtomicBool>,
    lifecycle: Arc<RwLock<()>>,
}

impl CliDeveloperSessionHost {
    pub fn new(
        config: CliConfig,
        workspace_root: PathBuf,
    ) -> Result<Self, DeveloperSessionHostError> {
        let store = ManagedSessionStore::user_config().map_err(internal_error)?;
        Self::new_with_store(config, workspace_root, store, true)
    }

    pub fn new_with_store(
        config: CliConfig,
        workspace_root: PathBuf,
        store: ManagedSessionStore,
        load_integrations: bool,
    ) -> Result<Self, DeveloperSessionHostError> {
        let workspace_root = canonical_directory(&workspace_root)?;
        // AgentSession's existing context loader validates against the process
        // cwd plus registered roots. App-server processes normally launch in
        // this directory; registering it also keeps embedded/test hosts honest.
        crate::path_security::register_additional_workspace_root_path(&workspace_root)
            .map_err(DeveloperSessionHostError::invalid_request)?;
        let (notifications, _) = broadcast::channel(1024);
        Ok(Self {
            config: Arc::new(config),
            workspace_root,
            store,
            load_integrations,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            running_turns: Arc::new(Mutex::new(HashMap::new())),
            steering: Arc::new(Mutex::new(HashMap::new())),
            pending_approvals: Arc::new(Mutex::new(HashMap::new())),
            notifications,
            shutdown_started: Arc::new(AtomicBool::new(false)),
            lifecycle: Arc::new(RwLock::new(())),
        })
    }

    async fn admit_request(&self) -> Result<RwLockReadGuard<'_, ()>, DeveloperSessionHostError> {
        let guard = self.lifecycle.read().await;
        if self.shutdown_started.load(Ordering::Acquire) {
            return Err(DeveloperSessionHostError::unavailable(
                "The app-server is shutting down",
            ));
        }
        Ok(guard)
    }

    pub fn capabilities(&self) -> AppServerCapabilities {
        AppServerCapabilities {
            threads: true,
            turns: true,
            streaming: true,
            approvals: true,
            tools: true,
            mcp: self.load_integrations,
            checkpoints: false,
            worktrees: false,
            models: true,
        }
    }

    fn validate_requested_cwd(
        &self,
        requested: Option<&str>,
    ) -> Result<(), DeveloperSessionHostError> {
        let Some(requested) = requested else {
            return Ok(());
        };
        let requested = canonical_directory(Path::new(requested))?;
        if requested != self.workspace_root {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "This app-server is scoped to {}; spawn a separate app-server process for {}",
                self.workspace_root.display(),
                requested.display()
            )));
        }
        Ok(())
    }

    fn validate_context_files(
        &self,
        requested: &[String],
    ) -> Result<Vec<PathBuf>, DeveloperSessionHostError> {
        if requested.len() > MAX_CONTEXT_FILES_PER_TURN {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "A turn can attach at most {MAX_CONTEXT_FILES_PER_TURN} context files"
            )));
        }

        requested
            .iter()
            .map(|raw| {
                let path = Path::new(raw);
                let candidate = if path.is_absolute() {
                    path.to_path_buf()
                } else {
                    self.workspace_root.join(path)
                };
                let canonical = candidate.canonicalize().map_err(invalid_request)?;
                if !canonical.starts_with(&self.workspace_root) {
                    return Err(DeveloperSessionHostError::invalid_request(
                        "Context file is outside the app-server workspace",
                    ));
                }
                if !canonical.is_file() {
                    return Err(DeveloperSessionHostError::invalid_request(format!(
                        "Context path {} is not a file",
                        canonical.display()
                    )));
                }
                Ok(canonical)
            })
            .collect()
    }

    async fn build_agent(
        &self,
        managed_session: ManagedSession,
        path: PathBuf,
    ) -> Result<Arc<Mutex<AgentSession>>, DeveloperSessionHostError> {
        let model = managed_session.require_model().map_err(invalid_request)?;
        let authority = managed_session
            .require_routing_authority()
            .map_err(invalid_request)?;
        let system_context = context::gather_system_context();
        let mut agent = AgentSession::new_checked(
            model,
            &system_context,
            None,
            Some(authority.provider.as_str()),
        )
        .map_err(invalid_request)?;
        agent.apply_ui_config(&self.config);
        if !managed_session.messages.is_empty() {
            agent.messages = managed_session.messages.clone();
        }
        agent
            .adopt_managed_session(managed_session, path)
            .map_err(invalid_request)?;
        agent.quiet = true;

        Ok(Arc::new(Mutex::new(agent)))
    }

    /// Withhold the subagent-spawning tools whenever a child session would run
    /// outside this host's authority.
    ///
    /// The child never receives the per-turn approval sink, so it can only be
    /// let through when the session already answers its own approvals; every
    /// other mode would send the child's prompt to a stdin that carries the
    /// JSON-RPC transport. The operator's workspace policy is applied here for
    /// the same reason: these two tools bypass `execute_tool`, so a `deny` rule
    /// written for them has no other place to bite.
    fn apply_subagent_boundary_policy(&self, agent: &mut AgentSession) {
        let policy = PolicyEngine::load_workspace(&self.workspace_root).ok();
        let mut disallowed = agent
            .disallowed_tools
            .iter()
            .filter(|spec| !SUBAGENT_SPAWN_TOOLS.contains(&spec.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        for tool in SUBAGENT_SPAWN_TOOLS {
            let denied_by_policy = policy
                .as_ref()
                .is_some_and(|policy| policy.evaluate(tool, "") == PolicyDecision::Deny);
            if denied_by_policy || !agent.skip_permissions {
                disallowed.push(tool.to_string());
            }
        }
        let allowed = agent.allowed_tools.clone().unwrap_or_default();
        agent.apply_tool_filters(&allowed, &disallowed);
    }

    fn load_integrations_in_background(
        &self,
        thread_id: String,
        session: Arc<Mutex<AgentSession>>,
    ) {
        if !self.load_integrations {
            return;
        }

        self.emit("mcp/loading", serde_json::json!({ "threadId": thread_id }));
        let notifications = self.notifications.clone();
        let shutdown_started = self.shutdown_started.clone();
        let lifecycle = self.lifecycle.clone();
        tokio::spawn(async move {
            // Discovery may launch MCP subprocesses, so it participates in the
            // same admission barrier as requests. Shutdown either waits for
            // this whole pipeline or prevents it from starting.
            let _admission = lifecycle.read().await;
            if shutdown_started.load(Ordering::Acquire) {
                return;
            }
            let privacy_mode = session.lock().await.privacy_mode;
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(MCP_LOAD_TIMEOUT_SECONDS),
                crate::build_mcp_manager(
                    &crate::mcp::McpConfigLoadOptions::default(),
                    true,
                    true,
                    privacy_mode,
                ),
            )
            .await;

            let (method, message) = match result {
                Ok(Ok(Some(mut manager))) => {
                    if shutdown_started.load(Ordering::Acquire) {
                        manager.shutdown_all().await;
                        return;
                    }
                    session.lock().await.set_mcp_manager(manager);
                    ("mcp/ready", None)
                }
                Ok(Ok(None)) => ("mcp/ready", None),
                Ok(Err(error)) => {
                    eprintln!("MCP integration discovery failed: {error:#}");
                    (
                        "mcp/unavailable",
                        Some("MCP integrations could not be loaded for this session".to_string()),
                    )
                }
                Err(_) => (
                    "mcp/unavailable",
                    Some(format!(
                        "MCP integration discovery timed out after {MCP_LOAD_TIMEOUT_SECONDS} seconds"
                    )),
                ),
            };
            if shutdown_started.load(Ordering::Acquire) {
                return;
            }
            if let Ok(notification) = AppServerNotification::new(
                method,
                serde_json::json!({
                    "threadId": thread_id,
                    "message": message,
                }),
            ) {
                let _ = notifications.send(notification);
            }
        });
    }

    async fn load_agent(
        &self,
        thread_id: &str,
    ) -> Result<Arc<Mutex<AgentSession>>, DeveloperSessionHostError> {
        if let Some(session) = self.sessions.lock().await.get(thread_id).cloned() {
            return Ok(session);
        }

        let store = self.store.clone();
        let thread_id_owned = thread_id.to_string();
        let resolved = tokio::task::spawn_blocking(move || {
            let reference = ManagedSessionReference::SessionId(thread_id_owned);
            let resolved = store.resolve(reference.clone())?;
            let session = store.load(reference)?;
            anyhow::Ok((resolved, session))
        })
        .await
        .map_err(internal_error)?
        .map_err(not_found_error)?;

        if resolved.1.archived_at.is_some() {
            return Err(DeveloperSessionHostError::conflict(
                "Archived threads must be restored before they can be resumed",
            ));
        }
        self.validate_session_workspace(&resolved.1)?;
        let agent = self.build_agent(resolved.1, resolved.0.path).await?;

        let (session, inserted) = {
            let mut sessions = self.sessions.lock().await;
            match sessions.entry(thread_id.to_string()) {
                std::collections::hash_map::Entry::Occupied(entry) => (entry.get().clone(), false),
                std::collections::hash_map::Entry::Vacant(entry) => {
                    entry.insert(agent.clone());
                    (agent, true)
                }
            }
        };
        if inserted {
            self.load_integrations_in_background(thread_id.to_string(), session.clone());
        }
        Ok(session)
    }

    fn validate_session_workspace(
        &self,
        session: &ManagedSession,
    ) -> Result<(), DeveloperSessionHostError> {
        let workspace_root = session.workspace_root.as_deref().ok_or_else(|| {
            DeveloperSessionHostError::not_found(
                "Legacy unscoped sessions cannot be opened through a workspace app-server",
            )
        })?;
        if workspace_root != self.workspace_root {
            return Err(DeveloperSessionHostError::not_found(
                "Thread does not belong to this workspace",
            ));
        }
        Ok(())
    }

    async fn validate_thread_ownership(
        &self,
        thread_id: &str,
    ) -> Result<(), DeveloperSessionHostError> {
        let store = self.store.clone();
        let thread_id = thread_id.to_string();
        let session = tokio::task::spawn_blocking(move || {
            store.load(ManagedSessionReference::SessionId(thread_id))
        })
        .await
        .map_err(internal_error)?
        .map_err(not_found_error)?;
        self.validate_session_workspace(&session)
    }

    async fn status_for(&self, summary: &ManagedSessionSummary) -> ThreadStatus {
        if summary.archived_at.is_some() {
            return ThreadStatus::Archived;
        }
        if self
            .pending_approvals
            .lock()
            .await
            .values()
            .any(|approval| approval.thread_id == summary.session_id)
        {
            return ThreadStatus::AwaitingApproval;
        }
        if self
            .running_turns
            .lock()
            .await
            .contains_key(&summary.session_id)
        {
            return ThreadStatus::Running;
        }
        ThreadStatus::Idle
    }

    async fn thread_summary(&self, summary: ManagedSessionSummary) -> ThreadSummary {
        let compatible_authority = summary.routing_authority.as_ref().filter(|authority| {
            summary.model.as_deref().is_some_and(|model| {
                crate::agent::resolve_persisted_session_provider(
                    model,
                    authority,
                    &summary.session_id,
                )
                .is_ok()
            })
        });
        let projected_model = summary
            .auto_routing
            .as_ref()
            .filter(|state| {
                agiworkforce_model_registry::is_auto_routing_selection(&state.selection)
                    && compatible_authority.is_some_and(|authority| {
                        matches!(
                            (authority.privacy_mode, state.trust_mode),
                            (
                                crate::agent::PrivacyMode::Local,
                                agiworkforce_model_registry::TrustMode::Local
                                    | agiworkforce_model_registry::TrustMode::OnDevice
                            ) | (
                                crate::agent::PrivacyMode::Byok,
                                agiworkforce_model_registry::TrustMode::Byok
                            ) | (
                                crate::agent::PrivacyMode::Managed,
                                agiworkforce_model_registry::TrustMode::ManagedCloud
                            )
                        )
                    })
            })
            .map(|state| state.selection.clone())
            .or_else(|| summary.model.clone());
        let (trust_mode, provider) = match compatible_authority {
            Some(authority) => (
                match authority.privacy_mode {
                    crate::agent::PrivacyMode::Local => DeveloperSessionTrustMode::Local,
                    crate::agent::PrivacyMode::Byok => DeveloperSessionTrustMode::Byok,
                    crate::agent::PrivacyMode::Managed => DeveloperSessionTrustMode::Managed,
                },
                Some(
                    authority
                        .validated_provider()
                        .expect("compatible authority was validated")
                        .to_string(),
                ),
            ),
            None => (DeveloperSessionTrustMode::Unknown, None),
        };
        ThreadSummary {
            id: summary.session_id.clone(),
            title: summary
                .title
                .clone()
                .unwrap_or_else(|| "Untitled developer session".to_string()),
            model: projected_model,
            cwd: summary
                .workspace_root
                .as_ref()
                .map(|path| path.display().to_string()),
            provider,
            trust_mode,
            created_at: summary.created_at.to_rfc3339(),
            updated_at: summary.updated_at.to_rfc3339(),
            created_by: source_from_stored(summary.created_by.as_deref()),
            status: self.status_for(&summary).await,
        }
    }

    async fn resolved_summary(&self, resolved: ResolvedManagedSessionReference) -> ThreadSummary {
        self.thread_summary(resolved.summary).await
    }

    fn prepare_input(
        &self,
        input: Vec<UserInput>,
    ) -> Result<PreparedInput, DeveloperSessionHostError> {
        if input.len() > MAX_USER_INPUT_ITEMS_PER_TURN {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "A turn can contain at most {MAX_USER_INPUT_ITEMS_PER_TURN} input items"
            )));
        }
        let mut text_parts = Vec::new();
        let mut images = Vec::new();
        let mut text_chars = 0usize;
        let mut text_bytes = 0usize;
        let mut image_count = 0usize;
        let mut image_bytes = 0usize;

        for item in input {
            match item {
                UserInput::Text { text, .. } => {
                    push_bounded_text_part(&mut text_parts, text, &mut text_chars, &mut text_bytes)?
                }
                UserInput::Image { image_url } => {
                    ensure_image_slot(image_count)?;
                    let (image, decoded_bytes) = content_block_from_data_url(&image_url)?;
                    reserve_image_bytes(image_bytes, decoded_bytes)?;
                    image_count += 1;
                    image_bytes += decoded_bytes;
                    images.push(image);
                }
                UserInput::LocalImage { path } => {
                    ensure_image_slot(image_count)?;
                    let (image, decoded_bytes) = self.content_block_from_local_image(&path)?;
                    reserve_image_bytes(image_bytes, decoded_bytes)?;
                    image_count += 1;
                    image_bytes += decoded_bytes;
                    images.push(image);
                }
                UserInput::Skill { name, path } => push_bounded_text_part(
                    &mut text_parts,
                    format!(
                        "Use the explicitly selected skill `{name}` at `{}`.",
                        path.display()
                    ),
                    &mut text_chars,
                    &mut text_bytes,
                )?,
                UserInput::Mention { name, path } => {
                    push_bounded_text_part(
                        &mut text_parts,
                        format!("Use the selected context `{name}` ({path})."),
                        &mut text_chars,
                        &mut text_bytes,
                    )?;
                }
                #[allow(unreachable_patterns)]
                _ => {
                    return Err(DeveloperSessionHostError::invalid_request(
                        "This client sent an unsupported user input type",
                    ));
                }
            }
        }

        let text = text_parts.join("\n\n");
        if text.trim().is_empty() && images.is_empty() {
            return Err(DeveloperSessionHostError::invalid_request(
                "turn input must contain text, an image, a skill, or a mention",
            ));
        }
        Ok(PreparedInput { text, images })
    }

    fn content_block_from_local_image(
        &self,
        path: &Path,
    ) -> Result<(ContentBlock, usize), DeveloperSessionHostError> {
        let canonical = path.canonicalize().map_err(invalid_request)?;
        if !canonical.starts_with(&self.workspace_root) {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "Local image {} is outside the trusted workspace {}",
                canonical.display(),
                self.workspace_root.display()
            )));
        }
        let metadata = std::fs::metadata(&canonical).map_err(invalid_request)?;
        if metadata.len() > MAX_IMAGE_INPUT_BYTES as u64 {
            return Err(DeveloperSessionHostError::invalid_request(
                "Local image input exceeds the 10 MB limit",
            ));
        }
        let bytes = std::fs::read(&canonical).map_err(invalid_request)?;
        let encoded = agiworkforce_utils_image::load_for_prompt_bytes(
            &canonical,
            bytes,
            agiworkforce_utils_image::PromptImageMode::ResizeToFit,
        )
        .map_err(invalid_request)?;
        if encoded.bytes.len() > MAX_IMAGE_INPUT_BYTES {
            return Err(DeveloperSessionHostError::invalid_request(
                "Local image input exceeds the 10 MB limit after processing",
            ));
        }
        let decoded_bytes = encoded.bytes.len();
        Ok((
            ContentBlock::Image {
                mime: encoded.mime,
                data_b64: base64::engine::general_purpose::STANDARD.encode(encoded.bytes),
            },
            decoded_bytes,
        ))
    }

    fn emit(&self, method: &str, params: serde_json::Value) {
        if let Ok(notification) = AppServerNotification::new(method, params) {
            let _ = self.notifications.send(notification);
        }
    }

    async fn cancel_pending_approvals(&self, turn_id: &str) {
        let mut pending = self.pending_approvals.lock().await;
        let ids: Vec<_> = pending
            .iter()
            .filter_map(|(id, approval)| (approval.turn_id == turn_id).then_some(id.clone()))
            .collect();
        for id in ids {
            if let Some(approval) = pending.remove(&id) {
                let _ = approval.responder.send(ApprovalDecision::Cancel);
            }
        }
    }

    fn resolve_thread_model(
        &self,
        requested: &str,
    ) -> Result<ResolvedThreadModel, DeveloperSessionHostError> {
        if !agiworkforce_model_registry::is_auto_routing_selection(requested) {
            return Ok(ResolvedThreadModel {
                provider_model_id: requested.to_string(),
                auto_routing: None,
                fallback_model_ids: Vec::new(),
            });
        }

        self.resolve_auto_thread_model(requested, DeveloperRoutingTaskType::Coding, None)
    }

    fn resolve_auto_thread_model(
        &self,
        requested: &str,
        task_type: DeveloperRoutingTaskType,
        previous: Option<&ManagedSessionAutoRouting>,
    ) -> Result<ResolvedThreadModel, DeveloperSessionHostError> {
        let trust_mode = if let Some(previous) = previous {
            previous.trust_mode
        } else {
            self.configured_auto_trust_mode()?
        };
        let tier = if trust_mode == agiworkforce_model_registry::TrustMode::Byok {
            "byok"
        } else {
            "free"
        };
        let routing_task_type = registry_task_type(task_type);
        let selection = crate::model_catalog::resolve_auto_model_with_context(
            requested,
            routing_task_type,
            tier,
            trust_mode,
            previous.map(|state| state.model_key.as_str()),
            previous.map(|state| registry_task_type(state.task_type)),
        )
        .map_err(DeveloperSessionHostError::invalid_request)?;

        let fallback_model_ids = if trust_mode == agiworkforce_model_registry::TrustMode::Byok {
            std::iter::once(selection.provider_model_id.clone())
                .chain(selection.fallback_provider_model_ids.iter().cloned())
                .collect()
        } else {
            // Managed provider failover belongs behind the AGI gateway. Feeding
            // upstream IDs into the CLI's direct-provider fallback chain would
            // silently cross the Managed trust boundary.
            Vec::new()
        };

        Ok(ResolvedThreadModel {
            provider_model_id: selection.provider_model_id,
            auto_routing: Some(ManagedSessionAutoRouting {
                selection: requested.to_ascii_lowercase(),
                model_key: selection.model_key,
                task_type,
                trust_mode,
            }),
            fallback_model_ids,
        })
    }

    fn configured_auto_trust_mode(
        &self,
    ) -> Result<agiworkforce_model_registry::TrustMode, DeveloperSessionHostError> {
        let configured_provider = models::provider_from_name(&self.config.default.provider)
            .ok_or_else(|| {
                DeveloperSessionHostError::invalid_request(format!(
                    "Unknown configured provider '{}' for Auto routing",
                    self.config.default.provider
                ))
            })?;
        let trust_mode = match configured_provider {
            Provider::ManagedCloud => agiworkforce_model_registry::TrustMode::ManagedCloud,
            Provider::Ollama(OllamaMode::Local)
            | Provider::OpenAICompatible {
                api_key_env: None, ..
            }
            | Provider::Custom {
                api_key_env: None, ..
            } => {
                return Err(DeveloperSessionHostError::invalid_request(
                    "Auto routing cannot choose among installed local models yet; configure a concrete local model",
                ));
            }
            Provider::Ollama(OllamaMode::Cloud)
            | Provider::Anthropic
            | Provider::Google
            | Provider::OpenAICompatible {
                api_key_env: Some(_),
                ..
            }
            | Provider::Custom {
                api_key_env: Some(_),
                ..
            } => agiworkforce_model_registry::TrustMode::Byok,
        };
        Ok(trust_mode)
    }

    fn apply_auto_thread_model(
        agent: &mut AgentSession,
        resolved: ResolvedThreadModel,
    ) -> Result<(), DeveloperSessionHostError> {
        let state = resolved.auto_routing.ok_or_else(|| {
            DeveloperSessionHostError::invalid_request(
                "Auto routing did not return persisted routing state",
            )
        })?;

        match state.trust_mode {
            agiworkforce_model_registry::TrustMode::ManagedCloud => {
                if agent.privacy_mode != crate::agent::PrivacyMode::Managed
                    || !matches!(agent.provider, Provider::ManagedCloud)
                {
                    return Err(DeveloperSessionHostError::invalid_request(
                        "Managed Auto routing cannot replace a Local or BYOK developer session; start an explicit Managed session",
                    ));
                }
                agent.model = resolved.provider_model_id;
                // Provider failover for Managed sessions must occur behind the
                // gateway. Never install direct upstream IDs as a CLI chain.
                agent.fallback_chain = None;
            }
            agiworkforce_model_registry::TrustMode::Byok => {
                if agent.privacy_mode != crate::agent::PrivacyMode::Byok {
                    return Err(DeveloperSessionHostError::invalid_request(
                        "BYOK Auto routing cannot replace a Local or Managed developer session; start an explicit BYOK session",
                    ));
                }
                agent
                    .switch_model(&resolved.provider_model_id)
                    .map_err(invalid_request)?;
                agent.fallback_chain = (!resolved.fallback_model_ids.is_empty()).then(|| {
                    crate::routing::fallback::FallbackChain::parse(
                        &resolved.fallback_model_ids.join(","),
                    )
                });
            }
            agiworkforce_model_registry::TrustMode::Local
            | agiworkforce_model_registry::TrustMode::OnDevice => {
                return Err(DeveloperSessionHostError::invalid_request(
                    "Local Auto routing is unavailable until installed-model capability discovery is implemented",
                ));
            }
        }

        agent.set_managed_auto_routing(Some(state));
        agent.validate_privacy_boundary().map_err(invalid_request)
    }
}

fn registry_task_type(
    task_type: DeveloperRoutingTaskType,
) -> agiworkforce_model_registry::RoutingTaskType {
    match task_type {
        DeveloperRoutingTaskType::SimpleChat => {
            agiworkforce_model_registry::RoutingTaskType::SimpleChat
        }
        DeveloperRoutingTaskType::General => agiworkforce_model_registry::RoutingTaskType::General,
        DeveloperRoutingTaskType::Coding => agiworkforce_model_registry::RoutingTaskType::Coding,
        DeveloperRoutingTaskType::Reasoning => {
            agiworkforce_model_registry::RoutingTaskType::Reasoning
        }
        DeveloperRoutingTaskType::CreativeWriting => {
            agiworkforce_model_registry::RoutingTaskType::CreativeWriting
        }
        DeveloperRoutingTaskType::Multimodal => {
            agiworkforce_model_registry::RoutingTaskType::Multimodal
        }
        DeveloperRoutingTaskType::LongContext => {
            agiworkforce_model_registry::RoutingTaskType::LongContext
        }
        DeveloperRoutingTaskType::Research => {
            agiworkforce_model_registry::RoutingTaskType::Research
        }
        DeveloperRoutingTaskType::Agentic => agiworkforce_model_registry::RoutingTaskType::Agentic,
        DeveloperRoutingTaskType::ComputerUse => {
            agiworkforce_model_registry::RoutingTaskType::ComputerUse
        }
        DeveloperRoutingTaskType::ImageGeneration => {
            agiworkforce_model_registry::RoutingTaskType::ImageGeneration
        }
    }
}

#[async_trait]
impl DeveloperSessionHost for CliDeveloperSessionHost {
    fn server_version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }

    async fn list_local_models(&self) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        let probes = crate::local_models::discover_all(&self.config).await;
        let models = crate::local_models::discovered_models(&probes)
            .into_iter()
            .filter_map(|model| {
                let provider = match model.provider.as_str() {
                    "ollama" => LocalModelProvider::Ollama,
                    "lmstudio" => LocalModelProvider::Lmstudio,
                    _ => return None,
                };
                Some(LocalModelSummary {
                    id: model.id,
                    provider,
                })
            })
            .collect();
        Ok(LocalModelListResponse { models })
    }

    async fn start_thread(
        &self,
        params: ThreadStartParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        self.validate_requested_cwd(params.cwd.as_deref())?;
        let requested_model = params
            .model
            .clone()
            .unwrap_or_else(|| self.config.default.model.clone());
        let requested_provider = params.provider.map(LocalModelProvider::as_str);
        let resolved_model = self.resolve_thread_model(&requested_model)?;
        let model = resolved_model.provider_model_id.clone();
        let title = clean_title(params.title);
        let source = source_from_client(&client);

        let system_context = context::gather_system_context();
        let provider_override = if resolved_model.auto_routing.as_ref().is_some_and(|state| {
            state.trust_mode == agiworkforce_model_registry::TrustMode::ManagedCloud
        }) {
            // Auto resolves to an upstream provider model ID, but Managed
            // sessions must retain the AGI gateway as their provider/trust
            // authority. Detecting from the concrete model here would silently
            // turn Managed Auto into a direct BYOK route.
            Some("managed_cloud")
        } else {
            models::selection_provider_override(
                &model,
                &self.config.default.model,
                &self.config.default.provider,
                requested_provider,
            )
        };
        let mut agent = AgentSession::new_checked(&model, &system_context, None, provider_override)
            .map_err(invalid_request)?;
        agent.apply_ui_config(&self.config);
        agent.quiet = true;

        let id = Uuid::new_v4().to_string();
        let mut managed =
            ManagedSession::with_messages(id.clone(), chrono::Utc::now(), agent.messages.clone());
        managed.title = title;
        managed.model = Some(model.clone());
        managed.routing_authority = Some(agent.current_routing_authority());
        managed.auto_routing = resolved_model.auto_routing;
        managed.fallback_model_ids = (!resolved_model.fallback_model_ids.is_empty())
            .then_some(resolved_model.fallback_model_ids);
        managed.workspace_root = Some(self.workspace_root.clone());
        managed.created_by = Some(source_to_stored(source).to_string());
        let store = self.store.clone();
        let managed_to_save = managed.clone();
        let path = tokio::task::spawn_blocking(move || store.save(&managed_to_save))
            .await
            .map_err(internal_error)?
            .map_err(internal_error)?;
        agent
            .adopt_managed_session(managed, path)
            .map_err(invalid_request)?;
        let session = Arc::new(Mutex::new(agent));
        self.sessions
            .lock()
            .await
            .insert(id.clone(), session.clone());
        self.load_integrations_in_background(id.clone(), session);

        let store = self.store.clone();
        let id_for_summary = id.clone();
        let resolved = tokio::task::spawn_blocking(move || {
            store.resolve(ManagedSessionReference::SessionId(id_for_summary))
        })
        .await
        .map_err(internal_error)?
        .map_err(internal_error)?;
        let summary = self.resolved_summary(resolved).await;
        self.emit("thread/started", serde_json::json!({ "thread": summary }));
        Ok(summary)
    }

    async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        self.validate_requested_cwd(params.cwd.as_deref())?;
        let store = self.store.clone();
        let mut summaries = tokio::task::spawn_blocking(move || store.list())
            .await
            .map_err(internal_error)?
            .map_err(internal_error)?;
        summaries.retain(|summary| {
            let workspace_matches =
                summary.workspace_root.as_deref() == Some(self.workspace_root.as_path());
            (params.include_archived || summary.archived_at.is_none()) && workspace_matches
        });

        let start = params
            .cursor
            .as_deref()
            .and_then(|cursor| {
                summaries
                    .iter()
                    .position(|summary| summary.session_id == cursor)
            })
            .map_or(0, |position| position + 1);
        if params.cursor.is_some() && start == 0 {
            return Err(DeveloperSessionHostError::invalid_request(
                "thread/list cursor is not present in the filtered result set",
            ));
        }
        let limit = params
            .limit
            .map(|limit| limit as usize)
            .unwrap_or(DEFAULT_THREAD_LIMIT)
            .clamp(1, MAX_THREAD_LIMIT);
        let page: Vec<_> = summaries.into_iter().skip(start).take(limit + 1).collect();
        let has_more = page.len() > limit;
        let selected = page.into_iter().take(limit).collect::<Vec<_>>();
        let next_cursor = has_more
            .then(|| selected.last().map(|summary| summary.session_id.clone()))
            .flatten();
        let mut threads = Vec::with_capacity(selected.len());
        for summary in selected {
            threads.push(self.thread_summary(summary).await);
        }
        Ok(ThreadListResponse {
            threads,
            next_cursor,
        })
    }

    async fn resume_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        self.load_agent(&params.thread_id).await?;
        let store = self.store.clone();
        let thread_id = params.thread_id;
        let resolved = tokio::task::spawn_blocking(move || {
            store.resolve(ManagedSessionReference::SessionId(thread_id))
        })
        .await
        .map_err(internal_error)?
        .map_err(not_found_error)?;
        Ok(self.resolved_summary(resolved).await)
    }

    async fn read_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        let store = self.store.clone();
        let thread_id = params.thread_id;
        let (resolved, session) = tokio::task::spawn_blocking(move || {
            let reference = ManagedSessionReference::SessionId(thread_id);
            let resolved = store.resolve(reference.clone())?;
            let session = store.load(reference)?;
            anyhow::Ok((resolved, session))
        })
        .await
        .map_err(internal_error)?
        .map_err(not_found_error)?;
        self.validate_session_workspace(&session)?;
        let eligible_count = session
            .messages
            .iter()
            .filter(|message| !message.role.eq_ignore_ascii_case("system"))
            .count();
        let mut messages_newest_first = Vec::new();
        let mut serialized_bytes = 2usize; // JSON array brackets.
        let mut transcript_truncated = false;
        for message in session
            .messages
            .iter()
            .rev()
            .filter(|message| !message.role.eq_ignore_ascii_case("system"))
        {
            let projected = DeveloperMessage {
                role: message.role.clone(),
                text: message.text_content(),
            };
            let projected_bytes = serde_json::to_vec(&projected)
                .map_err(internal_error)?
                .len();
            let separator_bytes = usize::from(!messages_newest_first.is_empty());
            if serialized_bytes
                .checked_add(separator_bytes)
                .and_then(|total| total.checked_add(projected_bytes))
                .is_none_or(|total| total > MAX_THREAD_READ_TRANSCRIPT_JSON_BYTES)
            {
                transcript_truncated = true;
                continue;
            }
            serialized_bytes += separator_bytes + projected_bytes;
            messages_newest_first.push(projected);
        }
        messages_newest_first.reverse();
        transcript_truncated |= messages_newest_first.len() != eligible_count;
        Ok(ThreadReadResponse {
            thread: self.resolved_summary(resolved).await,
            messages: messages_newest_first,
            transcript_truncated,
        })
    }

    async fn fork_thread(
        &self,
        params: ThreadForkParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        self.validate_thread_ownership(&params.thread_id).await?;
        if self
            .running_turns
            .lock()
            .await
            .contains_key(&params.thread_id)
        {
            return Err(DeveloperSessionHostError::conflict(
                "Cannot fork a thread while its turn is running",
            ));
        }
        let store = self.store.clone();
        let source_id = params.thread_id;
        let title = clean_title(params.title);
        let created_by = source_to_stored(source_from_client(&client)).to_string();
        let resolved = tokio::task::spawn_blocking(move || {
            let forked = store.fork(ManagedSessionReference::SessionId(source_id))?;
            let mut session = store.load(forked.reference.clone())?;
            if title.is_some() {
                session.title = title;
            }
            session.created_by = Some(created_by);
            store.save(&session)?;
            store.resolve(ManagedSessionReference::SessionId(session.session_id))
        })
        .await
        .map_err(internal_error)?
        .map_err(not_found_error)?;
        let summary = self.resolved_summary(resolved).await;
        self.emit("thread/forked", serde_json::json!({ "thread": summary }));
        Ok(summary)
    }

    async fn archive_thread(
        &self,
        params: ThreadIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        self.validate_thread_ownership(&params.thread_id).await?;
        if self
            .running_turns
            .lock()
            .await
            .contains_key(&params.thread_id)
        {
            return Err(DeveloperSessionHostError::conflict(
                "Interrupt the running turn before archiving its thread",
            ));
        }
        let store = self.store.clone();
        let thread_id = params.thread_id;
        let id_for_event = thread_id.clone();
        tokio::task::spawn_blocking(move || {
            store.archive(ManagedSessionReference::SessionId(thread_id))
        })
        .await
        .map_err(internal_error)?
        .map_err(not_found_error)?;
        let removed = self.sessions.lock().await.remove(&id_for_event);
        if let Some(session) = removed {
            let memory_consolidation_tasks = session.lock().await.take_memory_consolidation_tasks();
            abort_and_join_tasks(memory_consolidation_tasks).await;
            let session = session.lock().await;
            if let Err(error) = session.finalize_memory(self.config.as_ref()).await {
                crate::output::print_warn(&format!(
                    "Archived thread memory extraction failed: {error:#}"
                ));
            }
        }
        self.emit(
            "thread/archived",
            serde_json::json!({ "threadId": id_for_event.clone() }),
        );
        if let Ok(notification) = task_state_notification(
            id_for_event,
            AgentTaskState::Archived,
            None,
            Some("Thread archived.".to_string()),
        ) {
            let _ = self.notifications.send(notification);
        }
        Ok(())
    }

    async fn start_turn(
        &self,
        params: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        self.validate_requested_cwd(params.cwd.as_deref())?;
        let context_files =
            self.validate_context_files(params.context_files.as_deref().unwrap_or_default())?;
        let prepared = self.prepare_input(params.input)?;
        let session = self.load_agent(&params.thread_id).await?;
        // Claim exclusive start ownership before touching the shared agent.
        // Keeping this guard through session setup prevents a losing concurrent
        // request from changing the model, controls, messages, or attachments.
        let mut running_turns = self.running_turns.lock().await;
        if running_turns.contains_key(&params.thread_id) {
            return Err(DeveloperSessionHostError::conflict(
                "A turn is already running for this thread; use turn/steer or turn/interrupt",
            ));
        }
        if running_turns.len() >= MAX_CONCURRENT_RUNNING_TURNS {
            return Err(DeveloperSessionHostError::unavailable(format!(
                "This app-server already has {MAX_CONCURRENT_RUNNING_TURNS} turns running; interrupt one before starting another"
            )));
        }

        {
            let mut agent = session.lock().await;
            let snapshot = TurnSetupSnapshot::capture(&agent);
            let setup_result = (|| {
                let previous_auto = agent.managed_auto_routing().cloned();
                let requested_auto = params
                    .model
                    .as_deref()
                    .filter(|model| agiworkforce_model_registry::is_auto_routing_selection(model))
                    .map(str::to_owned)
                    .or_else(|| {
                        params
                            .routing_task_type
                            .and(previous_auto.as_ref().map(|state| state.selection.clone()))
                    });

                if let Some(selection) = requested_auto {
                    let task_type = params
                        .routing_task_type
                        .or_else(|| previous_auto.as_ref().map(|state| state.task_type))
                        .unwrap_or(DeveloperRoutingTaskType::Coding);
                    let resolved = self.resolve_auto_thread_model(
                        &selection,
                        task_type,
                        previous_auto.as_ref(),
                    )?;
                    Self::apply_auto_thread_model(&mut agent, resolved)?;
                } else if let Some(model) = params.model.as_deref() {
                    if model != agent.model {
                        if agent.privacy_mode == crate::agent::PrivacyMode::Managed {
                            agent.switch_managed_model(model).map_err(invalid_request)?;
                        } else {
                            agent.switch_model(model).map_err(invalid_request)?;
                        }
                    }
                    agent.fallback_chain = None;
                    agent.set_managed_auto_routing(None);
                }
                apply_agent_controls(&mut agent, params.agent_mode, params.reasoning_effort);
                if !context_files.is_empty() {
                    let report = agent.attach_context_files(
                        context_files
                            .iter()
                            .map(|path| path.to_string_lossy().into_owned()),
                    );
                    if let Some((_, error)) = report.failed.first() {
                        return Err(DeveloperSessionHostError::invalid_request(format!(
                            "Unable to attach selected context: {error}"
                        )));
                    }
                }
                agent.validate_privacy_boundary().map_err(invalid_request)?;
                Ok(())
            })();
            if let Err(error) = setup_result {
                snapshot.restore(&mut agent);
                return Err(error);
            }
            self.apply_subagent_boundary_policy(&mut agent);
        }

        let thread_id = params.thread_id;
        let turn_id = Uuid::new_v4().to_string();
        let partial = Arc::new(StdMutex::new(String::new()));
        let (start_sender, start_receiver) = oneshot::channel();
        let task_session = session.clone();
        let task_config = self.config.clone();
        let task_notifications = self.notifications.clone();
        let task_running = self.running_turns.clone();
        let task_steering = self.steering.clone();
        let task_pending = self.pending_approvals.clone();
        let task_partial = partial.clone();
        let task_thread_id = thread_id.clone();
        let task_turn_id = turn_id.clone();
        let task_event_sequence = Arc::new(StdMutex::new(0_u64));
        let process_owner = crate::process_tree::ProcessTreeOwner::new();
        let handle = tokio::spawn(crate::process_tree::scope(process_owner, async move {
            if start_receiver.await.is_err() {
                close_running_turn_claim(
                    task_running.as_ref(),
                    task_steering.as_ref(),
                    &task_thread_id,
                    &task_turn_id,
                )
                .await;
                return;
            }
            let mut next_input = Some(prepared);
            let mut final_status = TurnStatus::Completed;
            let mut final_error: Option<String> = None;
            let mut last_response = String::new();
            let mut cumulative_input_tokens = 0u32;
            let mut cumulative_output_tokens = 0u32;

            if let Ok(notification) = task_state_notification(
                task_turn_id.clone(),
                AgentTaskState::Running,
                Some(AgentTaskState::Queued),
                Some("Agent started working.".to_string()),
            ) {
                let _ = task_notifications.send(notification);
            }
            emit_agent_event(
                &task_thread_id,
                &task_turn_id,
                &task_event_sequence,
                &task_notifications,
                AgentEvent::ProgressUpdate(AgentEventProgressUpdate {
                    progress_id: "turn-work".to_string(),
                    summary: "Working on your request".to_string(),
                    detail: Some(
                        "Reviewing the available context and choosing the next safe action."
                            .to_string(),
                    ),
                    status: AgentEventProgressStatus::Running,
                }),
            );

            while let Some(input) = next_input {
                let mut agent = task_session.lock().await;
                agent.pending_image_blocks = input.images;
                agent.quiet = true;
                agent.on_tool_approval = Some(ToolApprovalSink(approval_callback(
                    task_thread_id.clone(),
                    task_turn_id.clone(),
                    task_pending.clone(),
                    task_notifications.clone(),
                )));
                agent.on_tool_event = Some(ToolEventSink(tool_event_callback(
                    task_thread_id.clone(),
                    task_turn_id.clone(),
                    task_event_sequence.clone(),
                    task_notifications.clone(),
                )));

                let delta_notifications = task_notifications.clone();
                let delta_thread = task_thread_id.clone();
                let delta_turn = task_turn_id.clone();
                let delta_partial = task_partial.clone();
                let turn_config = turn_config_pinned_to_session_route(&task_config, &agent);
                let result = agent
                    .send(
                        &turn_config,
                        &input.text,
                        Box::new(move |chunk| {
                            match delta_partial.lock() {
                                Ok(mut partial) => partial.push_str(chunk),
                                Err(poisoned) => poisoned.into_inner().push_str(chunk),
                            }
                            if let Ok(notification) = AppServerNotification::new(
                                "turn/output_delta",
                                serde_json::json!({
                                    "threadId": delta_thread,
                                    "turnId": delta_turn,
                                    "delta": chunk,
                                }),
                            ) {
                                let _ = delta_notifications.send(notification);
                            }
                        }),
                    )
                    .await;
                agent.on_tool_approval = None;
                agent.on_tool_event = None;

                match result {
                    Ok(turn) => {
                        last_response = turn.response;
                        cumulative_input_tokens =
                            cumulative_input_tokens.saturating_add(turn.input_tokens);
                        cumulative_output_tokens =
                            cumulative_output_tokens.saturating_add(turn.output_tokens);
                    }
                    Err(error) => {
                        final_status = TurnStatus::Failed;
                        final_error = Some(format!("{error:#}"));
                        drop(agent);
                        close_running_turn_claim(
                            task_running.as_ref(),
                            task_steering.as_ref(),
                            &task_thread_id,
                            &task_turn_id,
                        )
                        .await;
                        break;
                    }
                }
                drop(agent);

                next_input = take_steered_input_or_close(
                    task_running.as_ref(),
                    task_steering.as_ref(),
                    &task_thread_id,
                    &task_turn_id,
                )
                .await;
            }

            let pending_ids = {
                let pending = task_pending.lock().await;
                pending
                    .iter()
                    .filter_map(|(id, approval)| {
                        (approval.turn_id == task_turn_id).then_some(id.clone())
                    })
                    .collect::<Vec<_>>()
            };
            let mut pending = task_pending.lock().await;
            for id in pending_ids {
                if let Some(approval) = pending.remove(&id) {
                    let _ = approval.responder.send(ApprovalDecision::Cancel);
                }
            }
            drop(pending);

            let method = if final_status == TurnStatus::Completed {
                "turn/completed"
            } else {
                "turn/failed"
            };
            let (state, summary) = if final_status == TurnStatus::Completed {
                (
                    AgentTaskState::ReadyForReview,
                    "Agent work finished and is ready for review.",
                )
            } else {
                (AgentTaskState::Failed, "Agent work ended with an error.")
            };
            let (progress_summary, progress_detail, progress_status) =
                if final_status == TurnStatus::Completed {
                    (
                        "Work ready for review",
                        Some("The agent completed this turn.".to_string()),
                        AgentEventProgressStatus::Completed,
                    )
                } else {
                    (
                        "Work ended with an error",
                        Some("The agent could not complete this turn.".to_string()),
                        AgentEventProgressStatus::Failed,
                    )
                };
            emit_agent_event(
                &task_thread_id,
                &task_turn_id,
                &task_event_sequence,
                &task_notifications,
                AgentEvent::ProgressUpdate(AgentEventProgressUpdate {
                    progress_id: "turn-work".to_string(),
                    summary: progress_summary.to_string(),
                    detail: progress_detail,
                    status: progress_status,
                }),
            );
            if let Ok(notification) = task_state_notification(
                task_turn_id.clone(),
                state,
                Some(AgentTaskState::Running),
                Some(summary.to_string()),
            ) {
                let _ = task_notifications.send(notification);
            }
            if let Ok(notification) = AppServerNotification::new(
                method,
                serde_json::json!({
                    "threadId": task_thread_id,
                    "turnId": task_turn_id,
                    "status": final_status,
                    "response": last_response,
                    "inputTokens": cumulative_input_tokens,
                    "outputTokens": cumulative_output_tokens,
                    "error": final_error,
                }),
            ) {
                let _ = task_notifications.send(notification);
            }
        }));

        running_turns.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle,
                partial,
                process_owner,
            },
        );
        drop(running_turns);
        if let Ok(notification) = task_state_notification(
            turn_id.clone(),
            AgentTaskState::Queued,
            None,
            Some("Task accepted by the agent engine.".to_string()),
        ) {
            let _ = self.notifications.send(notification);
        }
        let _ = start_sender.send(());
        self.emit(
            "turn/started",
            serde_json::json!({ "threadId": thread_id, "turnId": turn_id }),
        );
        Ok(TurnSummary {
            id: turn_id,
            thread_id,
            status: TurnStatus::Running,
        })
    }

    async fn steer_turn(
        &self,
        params: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        let prepared = self.prepare_input(params.input)?;
        let running = self.running_turns.lock().await;
        let Some(turn) = running.get(&params.thread_id) else {
            return Err(DeveloperSessionHostError::conflict(
                "No running turn exists for this thread",
            ));
        };
        if params
            .expected_turn_id
            .as_deref()
            .is_some_and(|expected| expected != turn.turn_id)
        {
            return Err(DeveloperSessionHostError::conflict(
                "The active turn does not match expectedTurnId",
            ));
        }
        let turn_id = params
            .expected_turn_id
            .unwrap_or_else(|| turn.turn_id.clone());
        let mut steering = self.steering.lock().await;
        let queue = steering.entry(params.thread_id.clone()).or_default();
        if queue.len() >= MAX_STEER_QUEUE_DEPTH {
            return Err(DeveloperSessionHostError::conflict(format!(
                "The active turn already has {MAX_STEER_QUEUE_DEPTH} queued follow-ups; wait for one to be processed"
            )));
        }
        queue.push(prepared);
        drop(steering);
        drop(running);
        self.emit(
            "turn/steered",
            serde_json::json!({ "threadId": params.thread_id, "turnId": turn_id }),
        );
        Ok(TurnSummary {
            id: turn_id,
            thread_id: params.thread_id,
            status: TurnStatus::Running,
        })
    }

    async fn interrupt_turn(
        &self,
        params: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        let mut running_turns = self.running_turns.lock().await;
        let Some(active) = running_turns.get(&params.thread_id) else {
            return Err(DeveloperSessionHostError::not_found(
                "No running turn exists for this thread",
            ));
        };
        if active.turn_id != params.turn_id {
            return Err(DeveloperSessionHostError::conflict(
                "The active turn does not match turnId",
            ));
        }
        let running = running_turns
            .remove(&params.thread_id)
            .ok_or_else(|| DeveloperSessionHostError::not_found("Running turn disappeared"))?;
        drop(running_turns);
        let process_owner = running.process_owner;
        // Order matters: the turn task holds the session mutex across
        // `agent.send`, and the two steps below need it. `abort` releases it
        // only because `SubagentManager::wait_all` polls instead of blocking on
        // `join`, without that await point this lock and that join wedge each
        // other. Join last: awaiting the aborted task before the subagents are
        // cancelled waits for exactly the work the interrupt is meant to stop.
        running.handle.abort();
        let process_shutdown_error = crate::process_tree::terminate_owners_and_wait(
            &[process_owner],
            PROCESS_TREE_SHUTDOWN_TIMEOUT,
        )
        .await
        .err();
        let (subagent_manager, memory_consolidation_tasks) =
            if let Some(session) = self.sessions.lock().await.get(&params.thread_id).cloned() {
                let mut session = session.lock().await;
                (
                    session.take_subagent_manager(),
                    session.take_memory_consolidation_tasks(),
                )
            } else {
                (None, Vec::new())
            };
        abort_and_join_tasks(memory_consolidation_tasks).await;
        if let Some(manager) = subagent_manager {
            manager.shutdown_all().await;
        }
        let _ = running.handle.await;
        self.steering.lock().await.remove(&params.thread_id);
        self.cancel_pending_approvals(&params.turn_id).await;

        let mut persist_error = None;
        if let Some(session) = self.sessions.lock().await.get(&params.thread_id).cloned() {
            let partial = match running.partial.lock() {
                Ok(partial) => partial.clone(),
                Err(poisoned) => poisoned.into_inner().clone(),
            };
            let mut session = session.lock().await;
            session.finalize_cancelled_turn(&partial);
            persist_error = session.persist_managed_session().err();
        }
        if let Some(error) = process_shutdown_error {
            return Err(internal_error(error));
        }
        if let Some(error) = persist_error {
            return Err(internal_error(error));
        }
        if let Ok(notification) = task_state_notification(
            params.turn_id.clone(),
            AgentTaskState::Cancelled,
            Some(AgentTaskState::Running),
            Some("Agent work was cancelled.".to_string()),
        ) {
            let _ = self.notifications.send(notification);
        }
        self.emit(
            "turn/interrupted",
            serde_json::json!({
                "threadId": params.thread_id,
                "turnId": params.turn_id,
                "status": TurnStatus::Interrupted,
            }),
        );
        Ok(())
    }

    async fn respond_to_approval(
        &self,
        params: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError> {
        let _admission = self.admit_request().await?;
        let mut approvals = self.pending_approvals.lock().await;
        let Some(pending) = approvals.get(&params.request_id) else {
            return Err(DeveloperSessionHostError::not_found(
                "Approval request is no longer pending",
            ));
        };
        if pending.thread_id != params.thread_id || pending.turn_id != params.turn_id {
            return Err(DeveloperSessionHostError::invalid_request(
                "Approval response thread or turn does not match the pending request",
            ));
        }
        let pending = approvals.remove(&params.request_id).ok_or_else(|| {
            DeveloperSessionHostError::not_found("Approval request is no longer pending")
        })?;
        drop(approvals);
        pending
            .responder
            .send(review_to_approval_decision(params.decision))
            .map_err(|_| {
                DeveloperSessionHostError::conflict(
                    "Approval request ended before the response was delivered",
                )
            })
    }

    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
        // Flip admission before waiting for the exclusive lifecycle guard so a
        // queued WebSocket request cannot slip in behind shutdown.
        self.shutdown_started.store(true, Ordering::Release);
        let _exclusive = self.lifecycle.write().await;

        let running_turns = {
            let mut running = self.running_turns.lock().await;
            std::mem::take(&mut *running)
        };
        self.steering.lock().await.clear();

        let pending_approvals = {
            let mut pending = self.pending_approvals.lock().await;
            std::mem::take(&mut *pending)
        };
        for approval in pending_approvals.into_values() {
            let _ = approval.responder.send(ApprovalDecision::Cancel);
        }

        let process_owners = running_turns
            .values()
            .map(|running| running.process_owner)
            .collect::<Vec<_>>();
        for running in running_turns.values() {
            running.handle.abort();
        }
        // Same ordering as `interrupt_turn`, and the same dependency on
        // `wait_all` yielding: the session locks below are unreachable until
        // the aborted turns drop their guards, and one wedged session would
        // otherwise stall shutdown for every other session in this loop.
        let process_shutdown_error = crate::process_tree::terminate_owners_and_wait(
            &process_owners,
            PROCESS_TREE_SHUTDOWN_TIMEOUT,
        )
        .await
        .err();

        let sessions = self
            .sessions
            .lock()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let mut mcp_managers = Vec::new();
        let mut subagent_managers = Vec::new();
        let mut memory_consolidation_tasks = Vec::new();
        for session in &sessions {
            let mut session = session.lock().await;
            if let Some(manager) = session.take_mcp_manager() {
                mcp_managers.push(manager);
            }
            if let Some(manager) = session.take_subagent_manager() {
                subagent_managers.push(manager);
            }
            memory_consolidation_tasks.extend(session.take_memory_consolidation_tasks());
        }
        abort_and_join_tasks(memory_consolidation_tasks).await;
        for manager in subagent_managers {
            manager.shutdown_all().await;
        }

        let mut cancelled_turns = Vec::with_capacity(running_turns.len());
        for (thread_id, running) in running_turns {
            let _ = running.handle.await;
            cancelled_turns.push((thread_id, running.turn_id, running.partial));
        }

        let mut first_persist_error = None;
        for (thread_id, _turn_id, partial) in cancelled_turns {
            let Some(session) = self.sessions.lock().await.get(&thread_id).cloned() else {
                continue;
            };
            let partial = match partial.lock() {
                Ok(partial) => partial.clone(),
                Err(poisoned) => poisoned.into_inner().clone(),
            };
            let mut session = session.lock().await;
            session.finalize_cancelled_turn(&partial);
            if let Err(error) = session.persist_managed_session() {
                first_persist_error.get_or_insert(error);
            }
        }

        for mut manager in mcp_managers {
            manager.shutdown_all().await;
        }
        self.sessions.lock().await.clear();

        if let Some(error) = process_shutdown_error {
            return Err(internal_error(error));
        }
        if let Some(error) = first_persist_error {
            return Err(internal_error(error));
        }
        Ok(())
    }

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.notifications.subscribe()
    }
}

/// Build the config a turn hands to the engine, with the process defaults
/// replaced by this session's own route.
///
/// A subagent re-derives its provider from `config.default.{model,provider}`
/// instead of from the session that spawned it, and `ToolExecOptions
/// .privacy_mode`, the only gate on the network tools, is derived from that
/// provider. Left at the process defaults, a Local session's child would route
/// somewhere else and unlock tools the parent is not allowed to use.
fn turn_config_pinned_to_session_route(base: &CliConfig, agent: &AgentSession) -> CliConfig {
    let mut config = base.clone();
    config.default.model = agent.model.clone();
    config.default.provider = agent.current_routing_authority().provider;
    config
}

async fn abort_and_join_tasks(tasks: Vec<tokio::task::JoinHandle<()>>) {
    for task in &tasks {
        task.abort();
    }
    for task in tasks {
        let _ = task.await;
    }
}

fn approval_callback(
    thread_id: String,
    turn_id: String,
    pending: Arc<Mutex<HashMap<String, PendingApproval>>>,
    notifications: broadcast::Sender<AppServerNotification>,
) -> crate::tools::ApprovalCallback {
    Arc::new(move |request: ApprovalRequest| {
        let thread_id = thread_id.clone();
        let turn_id = turn_id.clone();
        let pending = pending.clone();
        let notifications = notifications.clone();
        Box::pin(async move {
            let request_id = request.id.to_string();
            let (sender, receiver) = oneshot::channel();
            pending.lock().await.insert(
                request_id.clone(),
                PendingApproval {
                    thread_id: thread_id.clone(),
                    turn_id: turn_id.clone(),
                    responder: sender,
                },
            );
            if let Ok(notification) = task_state_notification(
                turn_id.clone(),
                AgentTaskState::AwaitingInput,
                Some(AgentTaskState::Running),
                Some("The agent needs approval before it can continue.".to_string()),
            ) {
                let _ = notifications.send(notification);
            }
            if let Ok(notification) = AppServerNotification::new(
                "approval/requested",
                serde_json::json!({
                    "threadId": thread_id,
                    "turnId": turn_id,
                    "requestId": request_id,
                    "kind": format!("{:?}", request.kind),
                    "summary": request.summary,
                    "detail": request.detail.join("\n"),
                }),
            ) {
                let _ = notifications.send(notification);
            }
            let decision = match tokio::time::timeout(
                std::time::Duration::from_secs(APPROVAL_TIMEOUT_SECONDS),
                receiver,
            )
            .await
            {
                Ok(Ok(decision)) => decision,
                Ok(Err(_)) => ApprovalDecision::Cancel,
                Err(_) => ApprovalDecision::Timeout,
            };
            pending.lock().await.remove(&request_id);
            if let Ok(notification) = task_state_notification(
                turn_id,
                AgentTaskState::Running,
                Some(AgentTaskState::AwaitingInput),
                Some("Agent resumed after the approval decision.".to_string()),
            ) {
                let _ = notifications.send(notification);
            }
            decision
        })
    })
}

fn emit_agent_event(
    thread_id: &str,
    turn_id: &str,
    sequence: &Arc<StdMutex<u64>>,
    notifications: &broadcast::Sender<AppServerNotification>,
    event: AgentEvent,
) {
    let mut next_sequence = sequence
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Ok(notification) = agent_event_notification(
        thread_id.to_string(),
        turn_id.to_string(),
        *next_sequence,
        event,
    ) {
        let _ = notifications.send(notification);
        *next_sequence = next_sequence.saturating_add(1);
    }
}

fn tool_event_callback(
    thread_id: String,
    turn_id: String,
    sequence: Arc<StdMutex<u64>>,
    notifications: broadcast::Sender<AppServerNotification>,
) -> Arc<dyn Fn(crate::tui::app_event::TuiAppEvent) + Send + Sync> {
    Arc::new(move |event| {
        let Some(event) = map_tool_event(event) else {
            return;
        };
        emit_agent_event(&thread_id, &turn_id, &sequence, &notifications, event);
    })
}

fn map_tool_event(event: crate::tui::app_event::TuiAppEvent) -> Option<AgentEvent> {
    use crate::tui::app_event::{ToolStatus, TuiAppEvent};

    match event {
        TuiAppEvent::ToolStarted {
            call_id,
            name,
            summary,
            input,
        } => Some(AgentEvent::ToolExecutionStart(
            AgentEventToolExecutionStart {
                tool_call_id: call_id,
                category: classify_tool_category(&name),
                name,
                summary,
                input,
            },
        )),
        TuiAppEvent::ToolCompleted {
            call_id,
            name,
            status,
            output,
            duration_ms,
        } => {
            let is_error = matches!(status, ToolStatus::Failed | ToolStatus::Cancelled);
            let output = serde_json::from_str(&output)
                .unwrap_or_else(|_| serde_json::json!({ "text": output }));
            Some(AgentEvent::ToolExecutionEnd(AgentEventToolExecutionEnd {
                tool_call_id: call_id,
                name,
                output,
                is_error,
                elapsed_ms: Some(duration_ms),
            }))
        }
        _ => None,
    }
}

fn classify_tool_category(name: &str) -> AgentEventToolCategory {
    let normalized = name.to_ascii_lowercase().replace(['-', ' '], "_");
    if normalized.contains("web_search") || normalized == "search_web" {
        AgentEventToolCategory::WebSearch
    } else if normalized.contains("web_fetch")
        || normalized.contains("fetch_url")
        || normalized == "fetch"
    {
        AgentEventToolCategory::WebFetch
    } else if normalized.contains("computer")
        || normalized.contains("browser")
        || normalized.contains("screenshot")
    {
        AgentEventToolCategory::ComputerUse
    } else if normalized.contains("code_execution")
        || normalized == "python"
        || normalized == "javascript"
    {
        AgentEventToolCategory::CodeExecution
    } else if normalized.contains("shell")
        || normalized.contains("command")
        || normalized == "bash"
        || normalized == "exec"
    {
        AgentEventToolCategory::Shell
    } else if normalized.contains("skill") {
        AgentEventToolCategory::Skill
    } else if normalized.contains("memory") {
        AgentEventToolCategory::Memory
    } else if normalized.contains("artifact") || normalized.contains("present_file") {
        AgentEventToolCategory::Artifact
    } else if normalized.contains("connector") {
        AgentEventToolCategory::Connector
    } else if normalized.contains("mcp") {
        AgentEventToolCategory::Mcp
    } else if [
        "read",
        "write",
        "edit",
        "patch",
        "file",
        "directory",
        "list_dir",
        "glob",
        "grep",
    ]
    .iter()
    .any(|fragment| normalized.contains(fragment))
    {
        AgentEventToolCategory::Filesystem
    } else {
        AgentEventToolCategory::Other
    }
}

fn push_bounded_text_part(
    parts: &mut Vec<String>,
    part: String,
    total_chars: &mut usize,
    total_bytes: &mut usize,
) -> Result<(), DeveloperSessionHostError> {
    let separator_units = usize::from(!parts.is_empty()) * 2;
    let next_chars = total_chars
        .checked_add(separator_units)
        .and_then(|total| total.checked_add(part.chars().count()))
        .ok_or_else(|| {
            DeveloperSessionHostError::invalid_request("Turn text input is too large")
        })?;
    let next_bytes = total_bytes
        .checked_add(separator_units)
        .and_then(|total| total.checked_add(part.len()))
        .ok_or_else(|| {
            DeveloperSessionHostError::invalid_request("Turn text input is too large")
        })?;
    if next_chars > MAX_USER_INPUT_TEXT_CHARS || next_bytes > MAX_USER_INPUT_TEXT_BYTES {
        return Err(DeveloperSessionHostError::invalid_request(format!(
            "Combined turn text exceeds the {MAX_USER_INPUT_TEXT_CHARS} character limit"
        )));
    }
    *total_chars = next_chars;
    *total_bytes = next_bytes;
    parts.push(part);
    Ok(())
}

fn ensure_image_slot(image_count: usize) -> Result<(), DeveloperSessionHostError> {
    if image_count >= MAX_IMAGE_INPUTS_PER_TURN {
        return Err(DeveloperSessionHostError::invalid_request(format!(
            "A turn can contain at most {MAX_IMAGE_INPUTS_PER_TURN} images"
        )));
    }
    Ok(())
}

fn reserve_image_bytes(
    current_bytes: usize,
    additional_bytes: usize,
) -> Result<(), DeveloperSessionHostError> {
    if current_bytes
        .checked_add(additional_bytes)
        .is_none_or(|total| total > MAX_TOTAL_IMAGE_INPUT_BYTES)
    {
        return Err(DeveloperSessionHostError::invalid_request(format!(
            "Combined image input exceeds the {MAX_TOTAL_IMAGE_INPUT_BYTES} byte limit"
        )));
    }
    Ok(())
}

fn content_block_from_data_url(
    image_url: &str,
) -> Result<(ContentBlock, usize), DeveloperSessionHostError> {
    if image_url.len() > MAX_IMAGE_DATA_URL_HEADER_BYTES + 1 + MAX_IMAGE_INPUT_ENCODED_BYTES {
        return Err(DeveloperSessionHostError::invalid_request(
            "Encoded image input exceeds the 10 MB limit",
        ));
    }
    let (header, data) = image_url.split_once(',').ok_or_else(|| {
        DeveloperSessionHostError::invalid_request("Image input must be a base64 data URL")
    })?;
    if header.len() > MAX_IMAGE_DATA_URL_HEADER_BYTES {
        return Err(DeveloperSessionHostError::invalid_request(
            "Image data URL header is too large",
        ));
    }
    if data.len() > MAX_IMAGE_INPUT_ENCODED_BYTES {
        return Err(DeveloperSessionHostError::invalid_request(
            "Encoded image input exceeds the 10 MB limit",
        ));
    }
    let mime = header
        .strip_prefix("data:")
        .and_then(|header| header.strip_suffix(";base64"))
        .filter(|mime| {
            mime.starts_with("image/")
                && mime.len() <= MAX_IMAGE_MIME_BYTES
                && mime.len() > "image/".len()
                && !mime.chars().any(|character| {
                    character.is_ascii_control() || character.is_ascii_whitespace()
                })
        })
        .ok_or_else(|| {
            DeveloperSessionHostError::invalid_request(
                "Image input must use data:image/<type>;base64,...",
            )
        })?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(invalid_request)?;
    if decoded.len() > MAX_IMAGE_INPUT_BYTES {
        return Err(DeveloperSessionHostError::invalid_request(
            "Image input exceeds the 10 MB limit",
        ));
    }
    let decoded_bytes = decoded.len();
    Ok((
        ContentBlock::Image {
            mime: mime.to_string(),
            data_b64: data.to_string(),
        },
        decoded_bytes,
    ))
}

fn apply_agent_controls(
    agent: &mut AgentSession,
    mode: Option<DeveloperAgentMode>,
    effort: Option<DeveloperReasoningEffort>,
) {
    if let Some(mode) = mode {
        agent.plan_mode = matches!(mode, DeveloperAgentMode::Plan);
        agent.plan_approved = false;
        agent.permission_mode = match mode {
            DeveloperAgentMode::Ask => crate::cli_options::PermissionMode::Default,
            DeveloperAgentMode::Auto => crate::cli_options::PermissionMode::AcceptEdits,
            DeveloperAgentMode::Plan => crate::cli_options::PermissionMode::Plan,
            DeveloperAgentMode::Bypass => crate::cli_options::PermissionMode::BypassPermissions,
        };
        agent.skip_permissions = matches!(mode, DeveloperAgentMode::Bypass);
        agent.auto_approve_safe =
            matches!(mode, DeveloperAgentMode::Auto | DeveloperAgentMode::Bypass);
    }

    if let Some(effort) = effort {
        let effort = match effort {
            DeveloperReasoningEffort::Low => crate::design_system::Effort::Low,
            DeveloperReasoningEffort::Medium => crate::design_system::Effort::Medium,
            DeveloperReasoningEffort::High => crate::design_system::Effort::High,
            DeveloperReasoningEffort::Max => crate::design_system::Effort::Max,
        };
        agent.thinking_budget_tokens = effort.thinking_budget_for_anthropic();
        agent.effort = Some(effort);
    }
}

fn source_from_client(client: &AppServerClientInfo) -> DeveloperSessionSource {
    if client.name.to_ascii_lowercase().contains("vscode") {
        DeveloperSessionSource::Vscode
    } else {
        DeveloperSessionSource::Cli
    }
}

fn source_from_stored(source: Option<&str>) -> DeveloperSessionSource {
    if source.is_some_and(|source| source.eq_ignore_ascii_case("vscode")) {
        DeveloperSessionSource::Vscode
    } else {
        DeveloperSessionSource::Cli
    }
}

fn source_to_stored(source: DeveloperSessionSource) -> &'static str {
    match source {
        DeveloperSessionSource::Cli => "cli",
        DeveloperSessionSource::Vscode => "vscode",
    }
}

fn clean_title(title: Option<String>) -> Option<String> {
    title
        .map(|title| {
            title
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(200)
                .collect::<String>()
        })
        .filter(|title| !title.is_empty())
}

fn canonical_directory(path: &Path) -> Result<PathBuf, DeveloperSessionHostError> {
    let canonical = path.canonicalize().map_err(invalid_request)?;
    if !canonical.is_dir() {
        return Err(DeveloperSessionHostError::invalid_request(format!(
            "Workspace path {} is not a directory",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn review_to_approval_decision(decision: ReviewDecision) -> ApprovalDecision {
    match decision {
        ReviewDecision::Approved => ApprovalDecision::AllowOnce,
        ReviewDecision::ApprovedExecpolicyAmendment { .. } => ApprovalDecision::AlwaysAllow,
        ReviewDecision::ApprovedForSession => ApprovalDecision::AllowSession,
        ReviewDecision::NetworkPolicyAmendment {
            network_policy_amendment,
        } => match network_policy_amendment.action {
            NetworkPolicyRuleAction::Allow => ApprovalDecision::AlwaysAllow,
            NetworkPolicyRuleAction::Deny => ApprovalDecision::Deny,
        },
        ReviewDecision::Denied => ApprovalDecision::Deny,
        ReviewDecision::TimedOut => ApprovalDecision::Timeout,
        ReviewDecision::Abort => ApprovalDecision::Cancel,
    }
}

fn invalid_request(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(error.to_string())
}

fn not_found_error(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::not_found(error.to_string())
}

fn internal_error(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::internal(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::session::{ManagedSessionRoutingAuthority, PrivacyMode};
    use tempfile::tempdir;

    fn text_input(text: &str) -> UserInput {
        UserInput::Text {
            text: text.to_string(),
            text_elements: Vec::new(),
        }
    }

    fn test_agent() -> AgentSession {
        let context = context::SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: Vec::new(),
            monorepo_type: None,
            package_manager: None,
            containerization: Vec::new(),
            editor_configs: Vec::new(),
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        AgentSession::new("test-model", &context, None)
    }

    #[test]
    fn developer_modes_map_to_existing_cli_permission_controls() {
        let mut agent = test_agent();

        apply_agent_controls(&mut agent, Some(DeveloperAgentMode::Plan), None);
        assert_eq!(
            agent.permission_mode,
            crate::cli_options::PermissionMode::Plan
        );
        assert!(agent.plan_mode);
        assert!(!agent.skip_permissions);

        apply_agent_controls(&mut agent, Some(DeveloperAgentMode::Auto), None);
        assert_eq!(
            agent.permission_mode,
            crate::cli_options::PermissionMode::AcceptEdits
        );
        assert!(!agent.plan_mode);
        assert!(agent.auto_approve_safe);
        assert!(!agent.skip_permissions);

        apply_agent_controls(&mut agent, Some(DeveloperAgentMode::Bypass), None);
        assert_eq!(
            agent.permission_mode,
            crate::cli_options::PermissionMode::BypassPermissions
        );
        assert!(agent.skip_permissions);
    }

    #[tokio::test]
    async fn steer_enqueued_before_close_is_drained_by_the_running_turn() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let thread_id = "thread-steer-before-close".to_string();
        let turn_id = "turn-steer-before-close".to_string();
        host.running_turns.lock().await.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle: tokio::spawn(async {}),
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner: crate::process_tree::ProcessTreeOwner::new(),
            },
        );

        host.steer_turn(TurnSteerParams {
            thread_id: thread_id.clone(),
            input: vec![text_input("follow-up")],
            expected_turn_id: Some(turn_id.clone()),
        })
        .await
        .expect("steer accepted before close");

        let next = take_steered_input_or_close(
            host.running_turns.as_ref(),
            host.steering.as_ref(),
            &thread_id,
            &turn_id,
        )
        .await
        .expect("accepted steer must be drained");
        assert_eq!(next.text, "follow-up");
        assert!(host.running_turns.lock().await.contains_key(&thread_id));

        assert!(take_steered_input_or_close(
            host.running_turns.as_ref(),
            host.steering.as_ref(),
            &thread_id,
            &turn_id,
        )
        .await
        .is_none());
        assert!(!host.running_turns.lock().await.contains_key(&thread_id));
    }

    #[tokio::test]
    async fn steer_after_atomic_close_is_rejected_instead_of_dropped() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let thread_id = "thread-close-before-steer".to_string();
        let turn_id = "turn-close-before-steer".to_string();
        host.running_turns.lock().await.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle: tokio::spawn(async {}),
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner: crate::process_tree::ProcessTreeOwner::new(),
            },
        );

        assert!(take_steered_input_or_close(
            host.running_turns.as_ref(),
            host.steering.as_ref(),
            &thread_id,
            &turn_id,
        )
        .await
        .is_none());
        let error = host
            .steer_turn(TurnSteerParams {
                thread_id: thread_id.clone(),
                input: vec![text_input("too late")],
                expected_turn_id: Some(turn_id),
            })
            .await
            .expect_err("late steer must conflict");
        assert!(error.to_string().contains("No running turn"));
        assert!(!host.steering.lock().await.contains_key(&thread_id));
    }

    #[tokio::test]
    async fn steer_queue_is_bounded_without_reordering_accepted_follow_ups() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let thread_id = "thread-bounded-steer-queue".to_string();
        let turn_id = "turn-bounded-steer-queue".to_string();
        host.running_turns.lock().await.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle: tokio::spawn(async {}),
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner: crate::process_tree::ProcessTreeOwner::new(),
            },
        );

        for index in 0..MAX_STEER_QUEUE_DEPTH {
            host.steer_turn(TurnSteerParams {
                thread_id: thread_id.clone(),
                input: vec![text_input(&format!("follow-up-{index}"))],
                expected_turn_id: Some(turn_id.clone()),
            })
            .await
            .expect("follow-up within queue budget");
        }
        let error = host
            .steer_turn(TurnSteerParams {
                thread_id: thread_id.clone(),
                input: vec![text_input("overflow")],
                expected_turn_id: Some(turn_id),
            })
            .await
            .expect_err("queue overflow must be rejected");
        assert_eq!(error.code(), -32009);

        let steering = host.steering.lock().await;
        let queued = steering.get(&thread_id).expect("accepted queue");
        assert_eq!(queued.len(), MAX_STEER_QUEUE_DEPTH);
        for (index, prepared) in queued.iter().enumerate() {
            assert_eq!(prepared.text, format!("follow-up-{index}"));
        }
    }

    #[test]
    fn prepare_input_enforces_item_text_and_image_budgets() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store.path().to_path_buf()),
            false,
        )
        .expect("host");

        let too_many_items = vec![text_input("x"); MAX_USER_INPUT_ITEMS_PER_TURN + 1];
        assert!(host
            .prepare_input(too_many_items)
            .expect_err("item count must be bounded")
            .to_string()
            .contains("input items"));

        let too_much_text = vec![
            text_input(&"x".repeat(MAX_USER_INPUT_TEXT_CHARS)),
            text_input("y"),
        ];
        assert!(host
            .prepare_input(too_much_text)
            .expect_err("aggregate text must be bounded")
            .to_string()
            .contains("Combined turn text"));

        let too_many_images = (0..=MAX_IMAGE_INPUTS_PER_TURN)
            .map(|_| UserInput::Image {
                image_url: "data:image/png;base64,AA==".to_string(),
            })
            .collect();
        assert!(host
            .prepare_input(too_many_images)
            .expect_err("image count must be bounded")
            .to_string()
            .contains("images"));

        assert!(reserve_image_bytes(MAX_TOTAL_IMAGE_INPUT_BYTES - 1, 1).is_ok());
        assert!(reserve_image_bytes(MAX_TOTAL_IMAGE_INPUT_BYTES - 1, 2).is_err());
    }

    #[test]
    fn image_inputs_are_size_checked_before_decode_or_file_read() {
        let long_header = format!(
            "data:image/{};base64,AA==",
            "x".repeat(MAX_IMAGE_DATA_URL_HEADER_BYTES)
        );
        assert!(content_block_from_data_url(&long_header)
            .expect_err("oversized header must be rejected")
            .to_string()
            .contains("header"));

        let oversized_encoded = format!(
            "data:image/png;base64,{}",
            "A".repeat(MAX_IMAGE_INPUT_ENCODED_BYTES + 1)
        );
        assert!(content_block_from_data_url(&oversized_encoded)
            .expect_err("oversized base64 must be rejected before decode")
            .to_string()
            .contains("Encoded image"));

        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let image_path = workspace.path().join("oversized.png");
        let file = std::fs::File::create(&image_path).expect("create sparse image");
        file.set_len((MAX_IMAGE_INPUT_BYTES + 1) as u64)
            .expect("extend sparse image");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store.path().to_path_buf()),
            false,
        )
        .expect("host");
        assert!(host
            .content_block_from_local_image(&image_path)
            .expect_err("oversized local image must be rejected before read")
            .to_string()
            .contains("10 MB"));
    }

    #[tokio::test]
    async fn legacy_unknown_authority_is_readable_but_resume_and_turn_fail_closed() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let workspace_root = workspace
            .path()
            .canonicalize()
            .expect("canonical workspace");
        let mut legacy = ManagedSession::with_messages(
            "legacy-unknown",
            chrono::Utc::now(),
            vec![crate::models::Message::text("user", "inspectable history")],
        );
        legacy.version = 4;
        legacy.model = Some(crate::model_catalog::default_model().to_string());
        legacy.workspace_root = Some(workspace_root.clone());
        legacy.created_by = Some("vscode".to_string());
        store.save(&legacy).expect("save legacy session");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace_root,
            store,
            false,
        )
        .expect("host");

        let read = host
            .read_thread(ThreadIdParams {
                thread_id: legacy.session_id.clone(),
            })
            .await
            .expect("legacy history remains readable");
        assert_eq!(read.thread.trust_mode, DeveloperSessionTrustMode::Unknown);
        assert_eq!(read.thread.provider, None);
        assert_eq!(read.messages.len(), 1);
        assert!(!read.transcript_truncated);

        let resume_error = host
            .resume_thread(ThreadIdParams {
                thread_id: legacy.session_id.clone(),
            })
            .await
            .expect_err("unknown authority must not resume");
        assert!(resume_error
            .to_string()
            .contains("unknown routing authority"));

        let turn_error = host
            .start_turn(TurnStartParams {
                thread_id: legacy.session_id,
                input: vec![text_input("must not route")],
                model: None,
                routing_task_type: None,
                cwd: None,
                agent_mode: None,
                reasoning_effort: None,
                context_files: None,
            })
            .await
            .expect_err("unknown authority must not start a turn");
        assert!(turn_error.to_string().contains("unknown routing authority"));
    }

    #[tokio::test]
    async fn thread_read_projects_newest_messages_under_the_jsonl_line_budget() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let workspace_root = workspace
            .path()
            .canonicalize()
            .expect("canonical workspace");
        let bounded_text = |index: usize| {
            let marker = format!("message-{index}:");
            format!(
                "{marker}{}",
                "x".repeat(
                    crate::runtime::session::MANAGED_SESSION_MESSAGE_TEXT_MAX_UTF16 - marker.len()
                )
            )
        };
        let mut session = ManagedSession::with_messages(
            "bounded-thread-read",
            chrono::Utc::now(),
            (0..4)
                .map(|index| {
                    crate::models::Message::text(
                        if index % 2 == 0 { "user" } else { "assistant" },
                        bounded_text(index),
                    )
                })
                .collect(),
        );
        session.model = Some("fixture-local-model:latest".to_string());
        session.workspace_root = Some(workspace_root.clone());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Local,
            provider: "ollama".to_string(),
        });
        store.save(&session).expect("save bounded session");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace_root,
            store,
            false,
        )
        .expect("host");

        let read = host
            .read_thread(ThreadIdParams {
                thread_id: session.session_id,
            })
            .await
            .expect("read bounded projection");
        assert!(read.transcript_truncated);
        assert_eq!(read.messages.len(), 3);
        assert!(read.messages[0].text.starts_with("message-1:"));
        assert!(read.messages[1].text.starts_with("message-2:"));
        assert!(read.messages[2].text.starts_with("message-3:"));
        assert!(serde_json::to_vec(&read).expect("serialize response").len() < 4 * 1024 * 1024);
    }

    #[tokio::test]
    async fn malicious_provider_authority_lists_and_reads_as_unknown_but_cannot_resume() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let workspace_root = workspace
            .path()
            .canonicalize()
            .expect("canonical workspace");
        let mut session = ManagedSession::with_messages(
            "malicious-provider",
            chrono::Utc::now(),
            vec![crate::models::Message::text("user", "inspectable history")],
        );
        session.model = Some(crate::model_catalog::default_model().to_string());
        session.workspace_root = Some(workspace_root.clone());
        session.created_by = Some("vscode".to_string());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Byok,
            provider: "anthropic".to_string(),
        });
        let path = store.save(&session).expect("save valid session");

        // Simulate a user-edited JSONL header containing a C1 control. Serde
        // accepts the escaped string, but it must not cross the protocol or be
        // trusted for execution.
        let persisted = std::fs::read_to_string(&path).expect("read session");
        let (header, records) = persisted.split_once('\n').expect("JSONL header");
        let mut header: serde_json::Value = serde_json::from_str(header).expect("parse header");
        header["routing_authority"]["provider"] =
            serde_json::Value::String("hostile\u{0085}provider".to_string());
        std::fs::write(
            &path,
            format!(
                "{}\n{}",
                serde_json::to_string(&header).expect("serialize tampered header"),
                records
            ),
        )
        .expect("tamper provider authority");

        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace_root,
            store,
            false,
        )
        .expect("host");
        let listed = host
            .list_threads(ThreadListParams::default())
            .await
            .expect("malformed entry must not break list");
        assert_eq!(listed.threads.len(), 1);
        assert_eq!(
            listed.threads[0].trust_mode,
            DeveloperSessionTrustMode::Unknown
        );
        assert_eq!(listed.threads[0].provider, None);

        let read = host
            .read_thread(ThreadIdParams {
                thread_id: session.session_id.clone(),
            })
            .await
            .expect("malformed entry remains inspectable");
        assert_eq!(read.thread.trust_mode, DeveloperSessionTrustMode::Unknown);
        assert_eq!(read.thread.provider, None);
        assert_eq!(read.messages.len(), 1);

        let resume_error = host
            .resume_thread(ThreadIdParams {
                thread_id: session.session_id,
            })
            .await
            .expect_err("malformed authority must not resume");
        assert!(resume_error
            .to_string()
            .contains("invalid routing authority"));
    }

    #[tokio::test]
    async fn incompatible_provider_trust_tuple_lists_as_unknown_and_cannot_resume() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let workspace_root = workspace
            .path()
            .canonicalize()
            .expect("canonical workspace");
        let mut session = ManagedSession::new("incompatible-provider", chrono::Utc::now());
        session.model = Some(crate::model_catalog::default_model().to_string());
        session.workspace_root = Some(workspace_root.clone());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Managed,
            provider: "anthropic".to_string(),
        });
        store.save(&session).expect("save incompatible session");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace_root,
            store,
            false,
        )
        .expect("host");

        let listed = host
            .list_threads(ThreadListParams::default())
            .await
            .expect("incompatible entry must not break list");
        assert_eq!(listed.threads.len(), 1);
        assert_eq!(
            listed.threads[0].trust_mode,
            DeveloperSessionTrustMode::Unknown
        );
        assert_eq!(listed.threads[0].provider, None);

        let resume_error = host
            .resume_thread(ThreadIdParams {
                thread_id: session.session_id,
            })
            .await
            .expect_err("incompatible authority must not resume");
        assert!(resume_error
            .to_string()
            .contains("incompatible managed trust"));
    }

    #[tokio::test]
    async fn local_authority_with_cloud_provider_lists_and_reads_unknown_and_cannot_resume() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let workspace_root = workspace
            .path()
            .canonicalize()
            .expect("canonical workspace");
        let cloud_model = crate::model_catalog::models_for("anthropic")
            .into_iter()
            .next()
            .expect("Anthropic catalog model")
            .id
            .clone();
        let mut session = ManagedSession::with_messages(
            "local-authority-cloud-provider",
            chrono::Utc::now(),
            vec![crate::models::Message::text("user", "inspectable history")],
        );
        session.model = Some(cloud_model);
        session.workspace_root = Some(workspace_root.clone());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Local,
            provider: "anthropic".to_string(),
        });
        store.save(&session).expect("save stale Local authority");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace_root,
            store,
            false,
        )
        .expect("host");

        let listed = host
            .list_threads(ThreadListParams::default())
            .await
            .expect("stale entry remains listable");
        assert_eq!(listed.threads.len(), 1);
        assert_eq!(
            listed.threads[0].trust_mode,
            DeveloperSessionTrustMode::Unknown
        );
        assert_eq!(listed.threads[0].provider, None);

        let read = host
            .read_thread(ThreadIdParams {
                thread_id: session.session_id.clone(),
            })
            .await
            .expect("stale history remains inspectable");
        assert_eq!(read.thread.trust_mode, DeveloperSessionTrustMode::Unknown);
        assert_eq!(read.thread.provider, None);
        assert_eq!(read.messages.len(), 1);

        let resume_error = host
            .resume_thread(ThreadIdParams {
                thread_id: session.session_id,
            })
            .await
            .expect_err("Local authority must not resume a cloud provider");
        assert!(
            resume_error
                .to_string()
                .contains("incompatible local trust"),
            "{resume_error}"
        );
    }

    #[test]
    fn developer_effort_uses_the_existing_session_thinking_budget() {
        let mut agent = test_agent();

        apply_agent_controls(&mut agent, None, Some(DeveloperReasoningEffort::High));
        assert_eq!(agent.thinking_budget_tokens, Some(32_768));

        apply_agent_controls(&mut agent, None, Some(DeveloperReasoningEffort::Medium));
        assert_eq!(agent.thinking_budget_tokens, None);
    }

    /// Regression: the Effort picker used to be stored ONLY as its Anthropic
    /// projection, which collapses Low and Medium to the same `None`. Every
    /// non-Anthropic provider therefore ran at its own default no matter what
    /// the user selected. The level itself must survive so the request boundary
    /// can derive the OpenAI and Gemini forms too.
    #[test]
    fn developer_effort_survives_for_non_anthropic_providers() {
        let mut agent = test_agent();

        // Low and Medium are indistinguishable in the Anthropic projection...
        apply_agent_controls(&mut agent, None, Some(DeveloperReasoningEffort::Low));
        assert_eq!(agent.thinking_budget_tokens, None);
        let low = agent.effort.expect("effort retained");

        apply_agent_controls(&mut agent, None, Some(DeveloperReasoningEffort::Medium));
        assert_eq!(agent.thinking_budget_tokens, None);
        let medium = agent.effort.expect("effort retained");

        // ...but must stay distinct for the providers that read a string.
        assert_eq!(low.openai_effort_str(), "low");
        assert_eq!(medium.openai_effort_str(), "medium");
        assert_ne!(
            low.gemini_thinking_budget(),
            medium.gemini_thinking_budget()
        );

        apply_agent_controls(&mut agent, None, Some(DeveloperReasoningEffort::Max));
        let max = agent.effort.expect("effort retained");
        assert_eq!(max.openai_effort_str(), "high");
    }

    #[test]
    fn tool_events_map_to_canonical_execution_activity() {
        use crate::tui::app_event::{ToolStatus, TuiAppEvent};
        use agiworkforce_protocol::agent_events::AgentEvent;

        let started = map_tool_event(TuiAppEvent::ToolStarted {
            call_id: "tool-1".to_string(),
            name: "web_search".to_string(),
            summary: "Searching official sources".to_string(),
            input: serde_json::json!({ "query": "AGI Workforce" }),
        })
        .expect("mapped start event");
        let AgentEvent::ToolExecutionStart(started) = started else {
            panic!("expected canonical tool-execution-start");
        };
        assert_eq!(started.category, AgentEventToolCategory::WebSearch);
        assert_eq!(started.input["query"], "AGI Workforce");

        let completed = map_tool_event(TuiAppEvent::ToolCompleted {
            call_id: "tool-1".to_string(),
            name: "web_search".to_string(),
            status: ToolStatus::Failed,
            output: "provider timed out".to_string(),
            duration_ms: 125,
        })
        .expect("mapped end event");
        let AgentEvent::ToolExecutionEnd(completed) = completed else {
            panic!("expected canonical tool-execution-end");
        };
        assert!(completed.is_error);
        assert_eq!(completed.elapsed_ms, Some(125));
        assert_eq!(completed.output["text"], "provider timed out");
    }

    #[tokio::test]
    async fn tool_event_callback_preserves_turn_order_in_canonical_envelopes() {
        use crate::tui::app_event::{ToolStatus, TuiAppEvent};

        let (notifications, mut receiver) = broadcast::channel(4);
        let callback = tool_event_callback(
            "thread-1".to_string(),
            "turn-1".to_string(),
            Arc::new(StdMutex::new(0)),
            notifications,
        );

        callback(TuiAppEvent::ToolStarted {
            call_id: "tool-1".to_string(),
            name: "read_file".to_string(),
            summary: "Reading AGENTS.md".to_string(),
            input: serde_json::json!({ "path": "AGENTS.md" }),
        });
        callback(TuiAppEvent::ToolCompleted {
            call_id: "tool-1".to_string(),
            name: "read_file".to_string(),
            status: ToolStatus::Succeeded,
            output: "instructions".to_string(),
            duration_ms: 8,
        });

        let started = receiver.recv().await.expect("start notification");
        let completed = receiver.recv().await.expect("end notification");
        assert_eq!(started.method, "turn/agent_event");
        assert_eq!(started.params["sessionId"], "thread-1");
        assert_eq!(started.params["turnId"], "turn-1");
        assert_eq!(started.params["sequence"], 0);
        assert_eq!(started.params["event"]["type"], "tool-execution-start");
        assert_eq!(completed.params["sequence"], 1);
        assert_eq!(completed.params["event"]["type"], "tool-execution-end");
    }

    #[tokio::test]
    async fn progress_and_tool_events_share_one_ordered_turn_sequence() {
        use crate::tui::app_event::TuiAppEvent;
        use agiworkforce_protocol::agent_events::{
            AgentEvent, AgentEventProgressStatus, AgentEventProgressUpdate,
        };

        let (notifications, mut receiver) = broadcast::channel(4);
        let sequence = Arc::new(StdMutex::new(0));
        emit_agent_event(
            "thread-1",
            "turn-1",
            &sequence,
            &notifications,
            AgentEvent::ProgressUpdate(AgentEventProgressUpdate {
                progress_id: "turn-work".to_string(),
                summary: "Working on your request".to_string(),
                detail: None,
                status: AgentEventProgressStatus::Running,
            }),
        );
        tool_event_callback(
            "thread-1".to_string(),
            "turn-1".to_string(),
            sequence,
            notifications,
        )(TuiAppEvent::ToolStarted {
            call_id: "tool-1".to_string(),
            name: "read_file".to_string(),
            summary: "Reading AGENTS.md".to_string(),
            input: serde_json::json!({ "path": "AGENTS.md" }),
        });

        let progress = receiver.recv().await.expect("progress notification");
        let tool = receiver.recv().await.expect("tool notification");
        assert_eq!(progress.params["sequence"], 0);
        assert_eq!(progress.params["event"]["type"], "progress-update");
        assert_eq!(tool.params["sequence"], 1);
        assert_eq!(tool.params["event"]["type"], "tool-execution-start");
    }

    #[test]
    fn developer_auto_routing_re_evaluates_the_task_without_crossing_managed_trust() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let mut config = CliConfig::default();
        config.default.provider = "agiworkforce".to_string();
        config.default.model = "auto-premium".to_string();
        let host = CliDeveloperSessionHost::new_with_store(
            config,
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store_dir.path().to_path_buf()),
            false,
        )
        .expect("managed host");
        let previous = host
            .resolve_auto_thread_model("auto-premium", DeveloperRoutingTaskType::General, None)
            .expect("general route")
            .auto_routing
            .expect("persisted general Auto state");

        let resolved = host
            .resolve_auto_thread_model(
                "auto-premium",
                DeveloperRoutingTaskType::Coding,
                Some(&previous),
            )
            .expect("coding route");

        assert!(!resolved.provider_model_id.is_empty());
        assert!(resolved.fallback_model_ids.is_empty());
        let state = resolved.auto_routing.expect("persisted Auto state");
        assert!(!state.model_key.is_empty());
        assert_ne!(state.task_type, previous.task_type);
        assert_eq!(state.task_type, DeveloperRoutingTaskType::Coding);
        assert_eq!(
            state.trust_mode,
            agiworkforce_model_registry::TrustMode::ManagedCloud
        );
    }

    #[test]
    fn developer_auto_routing_preserves_cache_route_without_ineligible_byok_fallbacks() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let mut config = CliConfig::default();
        config.default.provider = "anthropic".to_string();
        config.default.model = "auto-economy".to_string();
        let host = CliDeveloperSessionHost::new_with_store(
            config,
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store_dir.path().to_path_buf()),
            false,
        )
        .expect("BYOK host");
        let previous_route = crate::model_catalog::resolve_auto_model(
            "auto-economy",
            agiworkforce_model_registry::RoutingTaskType::SimpleChat,
            "byok",
            agiworkforce_model_registry::TrustMode::Byok,
        )
        .expect("catalog economy route");
        let previous = ManagedSessionAutoRouting {
            selection: "auto-economy".to_string(),
            model_key: previous_route.model_key,
            task_type: DeveloperRoutingTaskType::SimpleChat,
            trust_mode: agiworkforce_model_registry::TrustMode::Byok,
        };

        let resolved = host
            .resolve_auto_thread_model(
                "auto-economy",
                DeveloperRoutingTaskType::Coding,
                Some(&previous),
            )
            .expect("coding route");

        assert_eq!(resolved.provider_model_id, previous_route.provider_model_id);
        assert_eq!(
            resolved.fallback_model_ids.first(),
            Some(&resolved.provider_model_id)
        );
        // The registry now hands back a cross-provider ladder behind the cached
        // model. The host must chain it verbatim, once each, and every entry has
        // to be a BYOK-reachable catalog model.
        let expected = crate::model_catalog::resolve_auto_model_with_context(
            "auto-economy",
            agiworkforce_model_registry::RoutingTaskType::Coding,
            "byok",
            agiworkforce_model_registry::TrustMode::Byok,
            Some(&previous.model_key),
            Some(agiworkforce_model_registry::RoutingTaskType::SimpleChat),
        )
        .expect("catalog coding route");
        assert_eq!(
            resolved.fallback_model_ids[1..],
            expected.fallback_provider_model_ids[..]
        );
        let mut seen = std::collections::HashSet::new();
        for model_id in &resolved.fallback_model_ids {
            assert!(seen.insert(model_id), "duplicate fallback {model_id}");
            assert!(
                crate::model_catalog::find(model_id).is_some(),
                "fallback {model_id} is not a catalog model"
            );
        }
    }

    #[tokio::test]
    async fn auto_selection_survives_restart_resume_and_the_next_typed_turn() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let mut config = CliConfig::default();
        config.default.provider = "agiworkforce".to_string();
        config.default.model = "auto-premium".to_string();
        let host = CliDeveloperSessionHost::new_with_store(
            config,
            workspace.path().to_path_buf(),
            store.clone(),
            false,
        )
        .expect("managed Auto host");
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: Some("auto-premium".to_string()),
                    provider: None,
                    cwd: Some(workspace.path().display().to_string()),
                    title: Some("Durable Auto route".to_string()),
                },
                AppServerClientInfo {
                    name: "agi_vscode_test".to_string(),
                    title: "VS Code test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("start Auto thread");
        assert_eq!(thread.model.as_deref(), Some("auto-premium"));
        let persisted_before = store
            .load(ManagedSessionReference::SessionId(thread.id.clone()))
            .expect("persisted Auto session");
        let original_auto = persisted_before
            .auto_routing
            .expect("persisted Auto routing state");
        let concrete_model = persisted_before.model.expect("concrete provider model");
        assert_ne!(concrete_model, original_auto.selection);
        drop(host);

        let mut changed_config = CliConfig::default();
        changed_config.default.provider = "ollama".to_string();
        changed_config.default.model = "fixture-local-model:latest".to_string();
        let restarted = CliDeveloperSessionHost::new_with_store(
            changed_config,
            workspace.path().to_path_buf(),
            store.clone(),
            false,
        )
        .expect("restarted host");
        let resumed = restarted
            .resume_thread(ThreadIdParams {
                thread_id: thread.id.clone(),
            })
            .await
            .expect("resume Auto thread");
        assert_eq!(resumed.model.as_deref(), Some("auto-premium"));
        assert_eq!(resumed.trust_mode, DeveloperSessionTrustMode::Managed);

        restarted
            .start_turn(TurnStartParams {
                thread_id: thread.id.clone(),
                input: vec![text_input("solve 2 + 2 and explain the derivation")],
                model: resumed.model,
                routing_task_type: Some(DeveloperRoutingTaskType::Reasoning),
                cwd: Some(workspace.path().display().to_string()),
                agent_mode: None,
                reasoning_effort: None,
                context_files: None,
            })
            .await
            .expect("next Auto turn");
        if let Some(running) = restarted.running_turns.lock().await.remove(&thread.id) {
            running.handle.abort();
            let _ = running.handle.await;
        }

        let session = restarted
            .sessions
            .lock()
            .await
            .get(&thread.id)
            .cloned()
            .expect("resumed live session");
        let mut agent = session.lock().await;
        let continued = agent
            .managed_auto_routing()
            .expect("Auto routing must not be cleared by the next turn")
            .clone();
        assert_eq!(continued.selection, "auto-premium");
        assert_eq!(continued.task_type, DeveloperRoutingTaskType::Reasoning);
        assert_eq!(continued.trust_mode, original_auto.trust_mode);
        agent
            .persist_managed_session()
            .expect("persist continued Auto routing state");
        drop(agent);

        let persisted_after = store
            .load(ManagedSessionReference::SessionId(thread.id))
            .expect("reload continued Auto session");
        let persisted_auto = persisted_after
            .auto_routing
            .expect("durable Auto routing after next turn");
        assert_eq!(persisted_auto.selection, "auto-premium");
        assert_eq!(
            persisted_auto.task_type,
            DeveloperRoutingTaskType::Reasoning
        );
        assert_eq!(persisted_auto.trust_mode, original_auto.trust_mode);
    }

    #[tokio::test]
    async fn invalid_persisted_auto_state_falls_back_to_the_concrete_model_projection() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let store = ManagedSessionStore::new(store_dir.path().to_path_buf());
        let mut config = CliConfig::default();
        config.default.provider = "agiworkforce".to_string();
        config.default.model = "auto-premium".to_string();
        let host = CliDeveloperSessionHost::new_with_store(
            config,
            workspace.path().to_path_buf(),
            store.clone(),
            false,
        )
        .expect("managed Auto host");
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: Some("auto-premium".to_string()),
                    provider: None,
                    cwd: Some(workspace.path().display().to_string()),
                    title: None,
                },
                AppServerClientInfo {
                    name: "agi_vscode_test".to_string(),
                    title: "VS Code test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("start Auto thread");
        let mut persisted = store
            .load(ManagedSessionReference::SessionId(thread.id.clone()))
            .expect("load Auto session");
        let concrete_model = persisted.model.clone().expect("concrete model");
        persisted
            .auto_routing
            .as_mut()
            .expect("Auto state")
            .selection = "tampered-auto-profile".to_string();
        store.save(&persisted).expect("save tampered Auto metadata");
        drop(host);

        let restarted = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            store,
            false,
        )
        .expect("restarted host");
        let resumed = restarted
            .resume_thread(ThreadIdParams {
                thread_id: thread.id,
            })
            .await
            .expect("concrete route remains resumable");
        assert_eq!(resumed.model.as_deref(), Some(concrete_model.as_str()));
        assert_eq!(resumed.trust_mode, DeveloperSessionTrustMode::Managed);
    }

    #[tokio::test]
    async fn managed_app_server_model_change_never_rebinds_existing_history_to_byok() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let mut config = CliConfig::default();
        config.default.provider = "agiworkforce".to_string();
        config.default.model = "auto-premium".to_string();
        let host = CliDeveloperSessionHost::new_with_store(
            config,
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store_dir.path().to_path_buf()),
            false,
        )
        .expect("managed host");
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: Some("auto-premium".to_string()),
                    provider: None,
                    cwd: Some(workspace.path().display().to_string()),
                    title: None,
                },
                AppServerClientInfo {
                    name: "agi_vscode_test".to_string(),
                    title: "VS Code test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("Managed thread");
        let session = host
            .sessions
            .lock()
            .await
            .get(&thread.id)
            .cloned()
            .expect("live session");
        session
            .lock()
            .await
            .messages
            .push(crate::models::Message::text(
                "user",
                "managed-only transcript",
            ));
        let direct_model = crate::model_catalog::models_for("anthropic")
            .into_iter()
            .next()
            .expect("Anthropic catalog model")
            .id
            .clone();

        let result = host
            .start_turn(TurnStartParams {
                thread_id: thread.id.clone(),
                input: vec![text_input("keep this behind the Managed gateway")],
                model: Some(direct_model),
                routing_task_type: None,
                cwd: Some(workspace.path().display().to_string()),
                agent_mode: None,
                reasoning_effort: None,
                context_files: None,
            })
            .await;
        if result.is_ok() {
            if let Some(running) = host.running_turns.lock().await.remove(&thread.id) {
                running.handle.abort();
                let _ = running.handle.await;
            }
        }

        let agent = session.lock().await;
        assert_eq!(agent.provider, Provider::ManagedCloud);
        assert_eq!(agent.privacy_mode, crate::agent::PrivacyMode::Managed);
        assert!(agent.validate_privacy_boundary().is_ok());
        assert!(agent
            .messages
            .iter()
            .any(|message| message.text_content().contains("managed-only transcript")));
    }

    #[tokio::test]
    async fn approval_notifications_match_the_typed_client_and_resume_the_waiter() {
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let (notifications, mut receiver) = broadcast::channel(4);
        let callback = approval_callback(
            "thread-1".to_string(),
            "turn-1".to_string(),
            pending.clone(),
            notifications,
        );
        let request = ApprovalRequest::new(
            crate::tui::approval_broker::ApprovalRequestKind::Exec {
                command: "cargo test".to_string(),
            },
            "Run tests",
            vec!["cargo test".to_string(), "workspace: project".to_string()],
        );
        let request_id = request.id.to_string();
        let waiter = tokio::spawn(async move { callback(request).await });

        let state = receiver.recv().await.expect("awaiting-input notification");
        assert_eq!(state.method, "task/state_changed");
        assert_eq!(state.params["taskId"], "turn-1");
        assert_eq!(state.params["state"], "awaiting_input");

        let notification = receiver.recv().await.expect("approval notification");
        assert_eq!(notification.method, "approval/requested");
        assert_eq!(notification.params["requestId"], request_id);
        assert_eq!(
            notification.params["detail"], "cargo test\nworkspace: project",
            "the typed JSONL client requires one display string"
        );

        let approval = pending
            .lock()
            .await
            .remove(&request_id)
            .expect("pending approval");
        approval
            .responder
            .send(ApprovalDecision::AllowOnce)
            .expect("resume approval waiter");
        assert_eq!(
            waiter.await.expect("waiter task"),
            ApprovalDecision::AllowOnce
        );
    }

    #[tokio::test]
    async fn interrupt_aborts_the_owner_and_persists_its_partial_response() {
        let session_store = tempdir().expect("session store");
        let workspace = std::env::current_dir().expect("workspace");
        let store = ManagedSessionStore::new(session_store.path().to_path_buf());
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.clone(),
            store.clone(),
            false,
        )
        .expect("host");
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: None,
                    provider: None,
                    cwd: Some(workspace.display().to_string()),
                    title: Some("Interrupted turn".to_string()),
                },
                AppServerClientInfo {
                    name: "agi_vscode_test".to_string(),
                    title: "VS Code test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("thread");
        assert_ne!(thread.trust_mode, DeveloperSessionTrustMode::Unknown);
        assert!(thread.provider.is_some());
        let persisted_trust = thread.trust_mode;
        let persisted_provider = thread.provider.clone();
        let persisted_model = thread.model.clone();
        let turn_id = "turn-interrupt-test".to_string();
        let partial = Arc::new(StdMutex::new("partial assistant response".to_string()));
        host.sessions
            .lock()
            .await
            .get(&thread.id)
            .cloned()
            .expect("live session")
            .lock()
            .await
            .messages
            .push(crate::models::Message::text("user", "interrupt me"));
        let handle = tokio::spawn(std::future::pending::<()>());
        let process_owner = crate::process_tree::ProcessTreeOwner::new();
        host.running_turns.lock().await.insert(
            thread.id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle,
                partial,
                process_owner,
            },
        );
        let mut notifications = host.subscribe();

        host.interrupt_turn(TurnInterruptParams {
            thread_id: thread.id.clone(),
            turn_id: turn_id.clone(),
        })
        .await
        .expect("interrupt turn");
        assert!(host.running_turns.lock().await.get(&thread.id).is_none());
        let cancelled = notifications
            .recv()
            .await
            .expect("cancelled state notification");
        assert_eq!(cancelled.method, "task/state_changed");
        assert_eq!(cancelled.params["taskId"], turn_id);
        assert_eq!(cancelled.params["state"], "cancelled");

        let interrupted = notifications.recv().await.expect("interrupt notification");
        assert_eq!(interrupted.method, "turn/interrupted");
        assert_eq!(interrupted.params["turnId"], turn_id);

        let mut restart_config = CliConfig::default();
        restart_config.default.model = "fixture-local-model:latest".to_string();
        restart_config.default.provider = "ollama".to_string();
        let reloaded =
            CliDeveloperSessionHost::new_with_store(restart_config, workspace, store, false)
                .expect("reloaded host");
        let resumed = reloaded
            .resume_thread(ThreadIdParams {
                thread_id: thread.id.clone(),
            })
            .await
            .expect("resume persisted route after config changed");
        assert_eq!(resumed.trust_mode, persisted_trust);
        assert_eq!(resumed.provider, persisted_provider);
        assert_eq!(resumed.model, persisted_model);
        let history = reloaded
            .read_thread(ThreadIdParams {
                thread_id: thread.id,
            })
            .await
            .expect("persisted interrupted history");
        assert!(history
            .messages
            .iter()
            .any(|message| message.text.contains("partial assistant response")));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn interrupt_kills_and_reaps_an_in_flight_command_tree() {
        use nix::errno::Errno;
        use nix::sys::signal::kill;
        use nix::unistd::Pid;

        let workspace = tempdir().expect("workspace");
        let session_store = tempdir().expect("session store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(session_store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let sentinel = workspace.path().join("interrupt-sentinel");
        let pid_file = workspace.path().join("interrupt-pids");
        let script = format!(
            "(sleep 0.7; printf leaked > {}) & worker=$!; printf '%s\\n%s\\n' \"$$\" \"$worker\" > {}; wait \"$worker\"",
            crate::sandbox::shell_quote(&sentinel.to_string_lossy()),
            crate::sandbox::shell_quote(&pid_file.to_string_lossy()),
        );
        let mut command = tokio::process::Command::new("sh");
        command.arg("-c").arg(script);
        let process_owner = crate::process_tree::ProcessTreeOwner::new();
        let handle = tokio::spawn(crate::process_tree::scope(process_owner, async move {
            let _ = crate::process_tree::output(command, None, None).await;
        }));

        let start_deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        let process_ids = loop {
            if let Ok(contents) = tokio::fs::read_to_string(&pid_file).await {
                let process_ids = contents
                    .lines()
                    .filter_map(|line| line.parse::<i32>().ok())
                    .collect::<Vec<_>>();
                if process_ids.len() == 2 {
                    break process_ids;
                }
            }
            assert!(
                tokio::time::Instant::now() < start_deadline,
                "command did not publish its process IDs"
            );
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        };

        let thread_id = "thread-command-interrupt".to_string();
        let turn_id = "turn-command-interrupt".to_string();
        host.running_turns.lock().await.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle,
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner,
            },
        );
        host.interrupt_turn(TurnInterruptParams { thread_id, turn_id })
            .await
            .expect("interrupt command turn");

        let process_exists = |process_id| match kill(Pid::from_raw(process_id), None) {
            Ok(()) | Err(Errno::EPERM) => true,
            Err(Errno::ESRCH) => false,
            Err(_) => true,
        };
        let exit_deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        while process_ids.iter().copied().any(process_exists) {
            assert!(
                tokio::time::Instant::now() < exit_deadline,
                "interrupted process tree remained alive: {process_ids:?}"
            );
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        assert!(
            !sentinel.exists(),
            "interrupted command continued and wrote its delayed sentinel"
        );
        assert!(
            process_ids.iter().copied().all(|pid| !process_exists(pid)),
            "interrupted process tree still exists: {process_ids:?}"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn shutdown_waits_for_a_running_turns_grandchild_tree_before_acknowledging() {
        use nix::errno::Errno;
        use nix::sys::signal::kill;
        use nix::unistd::Pid;

        let workspace = tempdir().expect("workspace");
        let session_store = tempdir().expect("session store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(session_store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let sentinel = workspace.path().join("shutdown-grandchild-sentinel");
        let pid_file = workspace.path().join("shutdown-grandchild-pids");
        let inner_script = format!(
            "sleep 0.05; sleep 0.7 & grandchild=$!; printf '%s\\n' \"$grandchild\" >> {}; wait \"$grandchild\"; printf leaked > {}",
            crate::sandbox::shell_quote(&pid_file.to_string_lossy()),
            crate::sandbox::shell_quote(&sentinel.to_string_lossy()),
        );
        let script = format!(
            "sh -c {} & worker=$!; printf '%s\\n%s\\n' \"$$\" \"$worker\" > {}; wait \"$worker\"",
            crate::sandbox::shell_quote(&inner_script),
            crate::sandbox::shell_quote(&pid_file.to_string_lossy()),
        );
        let mut command = tokio::process::Command::new("sh");
        command.arg("-c").arg(script);
        let process_owner = crate::process_tree::ProcessTreeOwner::new();
        let handle = tokio::spawn(crate::process_tree::scope(process_owner, async move {
            let _ = crate::process_tree::output(command, None, None).await;
        }));

        let start_deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        let process_ids = loop {
            if let Ok(contents) = tokio::fs::read_to_string(&pid_file).await {
                let process_ids = contents
                    .lines()
                    .filter_map(|line| line.parse::<i32>().ok())
                    .collect::<Vec<_>>();
                if process_ids.len() == 3 {
                    break process_ids;
                }
            }
            assert!(
                tokio::time::Instant::now() < start_deadline,
                "grandchild command did not publish its process IDs"
            );
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        };

        host.running_turns.lock().await.insert(
            "thread-command-shutdown".to_string(),
            RunningTurn {
                turn_id: "turn-command-shutdown".to_string(),
                handle,
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner,
            },
        );

        host.shutdown().await.expect("host shutdown");
        assert!(host.running_turns.lock().await.is_empty());
        let process_exists = |process_id| match kill(Pid::from_raw(process_id), None) {
            Ok(()) | Err(Errno::EPERM) => true,
            Err(Errno::ESRCH) => false,
            Err(_) => true,
        };
        assert!(
            process_ids.iter().copied().all(|pid| !process_exists(pid)),
            "shutdown acknowledged while its process tree still existed: {process_ids:?}"
        );
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        assert!(
            !sentinel.exists(),
            "a grandchild continued after host shutdown and wrote its sentinel"
        );
        let error = host
            .list_threads(ThreadListParams::default())
            .await
            .expect_err("shutdown host must reject new requests");
        assert_eq!(error.code(), -32010);
    }

    #[tokio::test]
    async fn shutdown_aborts_and_joins_detached_memory_consolidation_before_acknowledging() {
        struct TaskDropMarker(Arc<AtomicBool>);

        impl Drop for TaskDropMarker {
            fn drop(&mut self) {
                self.0.store(true, Ordering::Release);
            }
        }

        let workspace = tempdir().expect("workspace");
        let session_store = tempdir().expect("session store");
        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(session_store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let dropped = Arc::new(AtomicBool::new(false));
        let task_dropped = dropped.clone();
        let (started_sender, started_receiver) = oneshot::channel();
        let task = tokio::spawn(async move {
            let _drop_marker = TaskDropMarker(task_dropped);
            let _ = started_sender.send(());
            std::future::pending::<()>().await;
        });
        let mut agent = test_agent();
        agent.track_memory_consolidation(task);
        host.sessions.lock().await.insert(
            "thread-memory-consolidation".to_string(),
            Arc::new(Mutex::new(agent)),
        );
        started_receiver.await.expect("background task started");

        tokio::time::timeout(std::time::Duration::from_secs(1), host.shutdown())
            .await
            .expect("shutdown must not hang on background consolidation")
            .expect("host shutdown");

        assert!(
            dropped.load(Ordering::Acquire),
            "shutdown returned before the memory consolidation future was dropped"
        );
        assert!(host.sessions.lock().await.is_empty());
    }

    #[tokio::test]
    async fn concurrent_turn_starts_only_let_the_owner_mutate_session_controls_and_context() {
        let session_store = tempdir().expect("session store");
        let workspace = std::env::current_dir().expect("workspace");
        let auto_context_file = tempfile::NamedTempFile::new_in(&workspace).expect("auto context");
        let plan_context_file = tempfile::NamedTempFile::new_in(&workspace).expect("plan context");
        std::fs::write(auto_context_file.path(), "auto context").expect("write auto context");
        std::fs::write(plan_context_file.path(), "plan context").expect("write plan context");
        let auto_context = auto_context_file.path().to_path_buf();
        let plan_context = plan_context_file.path().to_path_buf();

        let host = Arc::new(
            CliDeveloperSessionHost::new_with_store(
                CliConfig::default(),
                workspace.clone(),
                ManagedSessionStore::new(session_store.path().to_path_buf()),
                false,
            )
            .expect("host"),
        );
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: None,
                    provider: None,
                    cwd: Some(workspace.display().to_string()),
                    title: Some("Concurrent turn ownership".to_string()),
                },
                AppServerClientInfo {
                    name: "agi_cli_test".to_string(),
                    title: "AGI CLI test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("thread");
        let session = host
            .sessions
            .lock()
            .await
            .get(&thread.id)
            .cloned()
            .expect("live session");

        let session_guard = session.lock().await;
        let auto_start = tokio::spawn({
            let host = host.clone();
            let thread_id = thread.id.clone();
            let auto_context = auto_context.clone();
            async move {
                let params: TurnStartParams = serde_json::from_value(serde_json::json!({
                    "threadId": thread_id,
                    "input": [{"type": "text", "text": "run automatically"}],
                    "agentMode": "auto",
                    "contextFiles": [auto_context],
                }))
                .expect("auto turn params");
                host.start_turn(params).await
            }
        });
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while Arc::strong_count(&session) < 3 {
                tokio::task::yield_now().await;
            }
            tokio::task::yield_now().await;
        })
        .await
        .expect("first start reached the locked session");

        let plan_start = tokio::spawn({
            let host = host.clone();
            let thread_id = thread.id.clone();
            let plan_context = plan_context.clone();
            async move {
                let params: TurnStartParams = serde_json::from_value(serde_json::json!({
                    "threadId": thread_id,
                    "input": [{"type": "text", "text": "make a plan"}],
                    "agentMode": "plan",
                    "contextFiles": [plan_context],
                }))
                .expect("plan turn params");
                host.start_turn(params).await
            }
        });
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while Arc::strong_count(&session) < 4 {
                tokio::task::yield_now().await;
            }
            tokio::task::yield_now().await;
        })
        .await
        .expect("second start reached the locked session");

        drop(session_guard);
        let auto_result = auto_start.await.expect("auto start task");
        let plan_result = plan_start.await.expect("plan start task");
        assert_eq!(
            usize::from(auto_result.is_ok()) + usize::from(plan_result.is_ok()),
            1,
            "exactly one concurrent turn/start request must own the thread: auto={auto_result:?}, plan={plan_result:?}"
        );
        let losing_error = if auto_result.is_err() {
            auto_result.as_ref().expect_err("auto conflict")
        } else {
            plan_result.as_ref().expect_err("plan conflict")
        };
        assert_eq!(losing_error.code(), -32009);

        if let Some(running) = host.running_turns.lock().await.remove(&thread.id) {
            running.handle.abort();
        }
        let agent = session.lock().await;
        let (expected_mode, expected_plan_mode, expected_auto_approve, expected_context) =
            if auto_result.is_ok() {
                (
                    crate::cli_options::PermissionMode::AcceptEdits,
                    false,
                    true,
                    auto_context.canonicalize().expect("canonical auto context"),
                )
            } else {
                (
                    crate::cli_options::PermissionMode::Plan,
                    true,
                    false,
                    plan_context.canonicalize().expect("canonical plan context"),
                )
            };
        assert_eq!(agent.permission_mode, expected_mode);
        assert_eq!(agent.plan_mode, expected_plan_mode);
        assert_eq!(agent.auto_approve_safe, expected_auto_approve);
        assert_eq!(agent.attached_context_files, vec![expected_context]);
    }

    #[tokio::test]
    async fn failed_turn_setup_rolls_back_session_and_allows_a_later_valid_turn() {
        let session_store = tempdir().expect("session store");
        let workspace = std::env::current_dir().expect("workspace");
        let durable_context_file =
            tempfile::NamedTempFile::new_in(&workspace).expect("durable context");
        let valid_context_file =
            tempfile::NamedTempFile::new_in(&workspace).expect("valid context");
        let invalid_utf8_file =
            tempfile::NamedTempFile::new_in(&workspace).expect("invalid utf-8 context");
        std::fs::write(durable_context_file.path(), "durable context")
            .expect("write durable context");
        std::fs::write(valid_context_file.path(), "valid context").expect("write valid context");
        std::fs::write(invalid_utf8_file.path(), [0xff, 0xfe])
            .expect("write invalid utf-8 context");

        let host = CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.clone(),
            ManagedSessionStore::new(session_store.path().to_path_buf()),
            false,
        )
        .expect("host");
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: None,
                    provider: None,
                    cwd: Some(workspace.display().to_string()),
                    title: Some("Transactional turn setup".to_string()),
                },
                AppServerClientInfo {
                    name: "agi_cli_test".to_string(),
                    title: "AGI CLI test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("thread");
        let session = host
            .sessions
            .lock()
            .await
            .get(&thread.id)
            .cloned()
            .expect("live session");

        let requested_model = {
            let agent = session.lock().await;
            crate::model_catalog::catalog()
                .all()
                .iter()
                .find(|model| {
                    crate::models::try_detect_provider(&model.id)
                        .is_some_and(|provider| provider != agent.provider)
                })
                .expect("catalog contains a model from another provider")
                .id
                .clone()
        };
        let (
            original_model,
            original_provider,
            original_privacy_mode,
            original_messages,
            original_attachments,
        ) = {
            let mut agent = session.lock().await;
            agent.permission_mode = crate::cli_options::PermissionMode::Plan;
            agent.plan_mode = true;
            agent.plan_approved = true;
            agent.skip_permissions = false;
            agent.auto_approve_safe = false;
            agent.thinking_budget_tokens = None;
            agent.effort = None;
            agent.set_privacy_mode(crate::agent::PrivacyMode::Byok);
            agent.messages.push(crate::models::Message::text(
                "system",
                "durable context sentinel",
            ));
            agent.attached_context_files.push(
                durable_context_file
                    .path()
                    .canonicalize()
                    .expect("canonical durable context"),
            );
            (
                agent.model.clone(),
                agent.provider.clone(),
                agent.privacy_mode,
                serde_json::to_value(&agent.messages).expect("serialize original messages"),
                agent.attached_context_files.clone(),
            )
        };

        let failed_params: TurnStartParams = serde_json::from_value(serde_json::json!({
            "threadId": thread.id,
            "input": [{"type": "text", "text": "must not launch"}],
            "model": requested_model,
            "agentMode": "bypass",
            "reasoningEffort": "high",
            "contextFiles": [valid_context_file.path(), invalid_utf8_file.path()],
        }))
        .expect("failed turn params");
        let error = host
            .start_turn(failed_params)
            .await
            .expect_err("invalid attachment must fail setup");
        assert_eq!(error.code(), -32602);
        assert!(host.running_turns.lock().await.get(&thread.id).is_none());

        {
            let agent = session.lock().await;
            assert_eq!(agent.model, original_model);
            assert_eq!(agent.provider, original_provider);
            assert_eq!(agent.privacy_mode, original_privacy_mode);
            assert_eq!(
                agent.permission_mode,
                crate::cli_options::PermissionMode::Plan
            );
            assert!(agent.plan_mode);
            assert!(agent.plan_approved);
            assert!(!agent.skip_permissions);
            assert!(!agent.auto_approve_safe);
            assert_eq!(agent.thinking_budget_tokens, None);
            assert_eq!(
                serde_json::to_value(&agent.messages).expect("serialize rolled-back messages"),
                original_messages
            );
            assert_eq!(agent.attached_context_files, original_attachments);
        }
        let recovery_params: TurnStartParams = serde_json::from_value(serde_json::json!({
            "threadId": thread.id,
            "input": [{"type": "text", "text": "valid recovery"}],
            "contextFiles": [valid_context_file.path()],
        }))
        .expect("recovery turn params");
        host.start_turn(recovery_params)
            .await
            .expect("a valid turn can start after rollback");
        let running = host
            .running_turns
            .lock()
            .await
            .remove(&thread.id)
            .expect("recovery turn owns the thread");
        running.handle.abort();

        let agent = session.lock().await;
        assert_eq!(agent.model, original_model);
        assert_eq!(
            agent.permission_mode,
            crate::cli_options::PermissionMode::Plan
        );
        assert!(agent.plan_mode);
        assert_eq!(
            agent.attached_context_files,
            [
                original_attachments,
                vec![valid_context_file
                    .path()
                    .canonicalize()
                    .expect("canonical valid context")],
            ]
            .concat()
        );
    }

    #[tokio::test]
    async fn turn_setup_snapshot_restores_the_session_privacy_policy() {
        let mut agent = test_agent();
        agent.set_privacy_mode(crate::agent::PrivacyMode::Byok);
        let snapshot = TurnSetupSnapshot::capture(&agent);

        // A pre-launch provider change can update the session boundary before
        // a later setup step fails.
        agent.set_privacy_mode(crate::agent::PrivacyMode::Local);
        snapshot.restore(&mut agent);
        assert_eq!(agent.privacy_mode, crate::agent::PrivacyMode::Byok);

        let advisor_result = crate::tools::execute_tool_with_opts(
            &crate::agent::ToolCall {
                name: "advisor".to_string(),
                args: std::collections::HashMap::new(),
            },
            &crate::tools::ToolExecOptions {
                require_confirmation: false,
                auto_approve_safe: false,
                quiet: true,
                approval_callback: None,
                privacy_mode: agent.privacy_mode,
                workspace_root: agent
                    .managed_session
                    .as_ref()
                    .and_then(|session| session.workspace_root.clone()),
            },
        )
        .await
        .expect("advisor privacy guard result");
        assert!(
            !advisor_result
                .output
                .contains("unavailable in Local privacy mode")
                && advisor_result.output.contains("Missing required argument"),
            "rollback to BYOK must restore the invocation policy, got: {}",
            advisor_result.output
        );
    }

    #[tokio::test]
    async fn a_byok_session_cannot_clear_a_concurrent_local_sessions_tool_egress_guard() {
        let mut local_agent = test_agent();
        local_agent.set_privacy_mode(crate::agent::PrivacyMode::Local);

        // A second workspace session is allowed to use BYOK, but changing its
        // mode must not weaken the first session's Local tool policy.
        let mut byok_agent = test_agent();
        byok_agent.set_privacy_mode(crate::agent::PrivacyMode::Byok);

        assert_eq!(local_agent.privacy_mode, crate::agent::PrivacyMode::Local);
        assert_eq!(byok_agent.privacy_mode, crate::agent::PrivacyMode::Byok);

        let advisor_result = crate::tools::execute_tool_with_opts(
            &crate::agent::ToolCall {
                name: "advisor".to_string(),
                args: std::collections::HashMap::from([(
                    "question".to_string(),
                    "Do not send this Local context anywhere".to_string(),
                )]),
            },
            &crate::tools::ToolExecOptions {
                require_confirmation: false,
                auto_approve_safe: false,
                quiet: true,
                approval_callback: None,
                privacy_mode: local_agent.privacy_mode,
                workspace_root: local_agent
                    .managed_session
                    .as_ref()
                    .and_then(|session| session.workspace_root.clone()),
            },
        )
        .await
        .expect("advisor privacy policy result");

        assert!(
            advisor_result
                .output
                .contains("unavailable in Local privacy mode"),
            "a concurrent BYOK session cleared the Local session's egress guard: {}",
            advisor_result.output
        );
    }

    fn tool_names(agent: &AgentSession) -> Vec<String> {
        agent
            .effective_tool_definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect()
    }

    fn boundary_host(workspace: &Path, store: &Path) -> CliDeveloperSessionHost {
        CliDeveloperSessionHost::new_with_store(
            CliConfig::default(),
            workspace.to_path_buf(),
            ManagedSessionStore::new(store.to_path_buf()),
            false,
        )
        .expect("host")
    }

    #[tokio::test]
    async fn subagent_tools_are_withheld_while_a_child_cannot_reach_the_approval_client() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = boundary_host(workspace.path(), store.path());
        let mut agent = test_agent();

        for mode in [
            DeveloperAgentMode::Ask,
            DeveloperAgentMode::Auto,
            DeveloperAgentMode::Plan,
        ] {
            apply_agent_controls(&mut agent, Some(mode), None);
            host.apply_subagent_boundary_policy(&mut agent);
            let names = tool_names(&agent);
            for tool in SUBAGENT_SPAWN_TOOLS {
                assert!(
                    !names.iter().any(|name| name == tool),
                    "{mode:?} advertises `{tool}`, whose child session has no route back to the approval client"
                );
            }
        }

        // Bypass answers its own approvals, so the child never needs the sink
        // the crossing cannot carry, and `task` comes back. (`agent` stays out
        // of every schema list on its own: the catalog defers it.)
        apply_agent_controls(&mut agent, Some(DeveloperAgentMode::Bypass), None);
        host.apply_subagent_boundary_policy(&mut agent);
        let names = tool_names(&agent);
        assert!(
            names.iter().any(|name| name == "task"),
            "Bypass must still expose `task` on the app-server"
        );
        assert!(
            names.iter().any(|name| name == "read_file"),
            "the boundary policy must not disturb the rest of the tool schema"
        );
    }

    #[tokio::test]
    async fn a_workspace_policy_deny_withholds_the_subagent_tools_in_every_mode() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        std::fs::create_dir_all(workspace.path().join(".agiworkforce")).expect("policy dir");
        std::fs::write(
            workspace.path().join(".agiworkforce").join("policy.toml"),
            "[[rules]]\ntool = \"task\"\ndecision = \"deny\"\n",
        )
        .expect("policy file");
        let host = boundary_host(workspace.path(), store.path());
        let mut agent = test_agent();

        apply_agent_controls(&mut agent, Some(DeveloperAgentMode::Bypass), None);
        host.apply_subagent_boundary_policy(&mut agent);
        let names = tool_names(&agent);

        assert!(
            !names.iter().any(|name| name == "task"),
            "a workspace `deny` rule for `task` was ignored at the app-server boundary"
        );
        assert!(
            names.iter().any(|name| name == "run_command"),
            "the deny rule for `task` must not withhold unrelated tools"
        );
    }

    #[test]
    fn a_turn_pins_its_subagents_to_the_session_route_instead_of_the_process_default() {
        let context = context::SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: Vec::new(),
            monorepo_type: None,
            package_manager: None,
            containerization: Vec::new(),
            editor_configs: Vec::new(),
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        let agent =
            AgentSession::new_checked("fixture-local-model:latest", &context, None, Some("ollama"))
                .expect("Local session");
        assert_eq!(agent.privacy_mode, crate::agent::PrivacyMode::Local);

        let mut base = CliConfig::default();
        base.default.provider = crate::model_catalog::default_provider().to_string();
        base.default.model = crate::model_catalog::default_model().to_string();

        // This is the derivation `subagent::run_subagent` performs for its own
        // session. Against the process defaults it resolves to nothing, so the
        // child re-derives a route the parent never authorized.
        assert!(crate::models::selection_provider_override(
            &agent.model,
            &base.default.model,
            &base.default.provider,
            None,
        )
        .is_none());

        let pinned = turn_config_pinned_to_session_route(&base, &agent);
        let child_provider = crate::models::selection_provider_override(
            &agent.model,
            &pinned.default.model,
            &pinned.default.provider,
            None,
        );
        assert_eq!(child_provider, Some("ollama"));

        let child = AgentSession::new_checked(&agent.model, &context, None, child_provider)
            .expect("child session");
        assert_eq!(child.privacy_mode, agent.privacy_mode);
    }

    #[tokio::test]
    async fn the_host_refuses_a_turn_once_its_running_turn_ceiling_is_reached() {
        let workspace = tempdir().expect("workspace");
        let store_dir = tempdir().expect("store");
        let mut config = CliConfig::default();
        config.default.provider = "agiworkforce".to_string();
        config.default.model = "auto-premium".to_string();
        let host = CliDeveloperSessionHost::new_with_store(
            config,
            workspace.path().to_path_buf(),
            ManagedSessionStore::new(store_dir.path().to_path_buf()),
            false,
        )
        .expect("host");
        let thread = host
            .start_thread(
                ThreadStartParams {
                    model: Some("auto-premium".to_string()),
                    provider: None,
                    cwd: Some(workspace.path().display().to_string()),
                    title: None,
                },
                AppServerClientInfo {
                    name: "agi_vscode_test".to_string(),
                    title: "VS Code test".to_string(),
                    version: "0.0.0".to_string(),
                },
            )
            .await
            .expect("start thread");

        {
            let mut running = host.running_turns.lock().await;
            for index in 0..MAX_CONCURRENT_RUNNING_TURNS {
                running.insert(
                    format!("saturating-thread-{index}"),
                    RunningTurn {
                        turn_id: format!("saturating-turn-{index}"),
                        handle: tokio::spawn(std::future::pending::<()>()),
                        partial: Arc::new(StdMutex::new(String::new())),
                        process_owner: crate::process_tree::ProcessTreeOwner::new(),
                    },
                );
            }
        }

        let error = host
            .start_turn(TurnStartParams {
                thread_id: thread.id,
                input: vec![text_input("one more concurrent subagent fan-out")],
                model: None,
                routing_task_type: None,
                cwd: Some(workspace.path().display().to_string()),
                agent_mode: None,
                reasoning_effort: None,
                context_files: None,
            })
            .await
            .expect_err("a saturated host must refuse another turn");
        assert_eq!(error.code(), -32010);

        let mut running = host.running_turns.lock().await;
        for (_, turn) in running.drain() {
            turn.handle.abort();
        }
    }

    /// A turn task shaped like one that spawned a subagent: its work runs on a
    /// separate thread under the turn's process owner, and the task itself
    /// parks on a synchronous join with no await point for `abort` to land on.
    /// It leaves that join only once the process tree is gone.
    #[cfg(unix)]
    async fn parked_subagent_turn(
        process_owner: crate::process_tree::ProcessTreeOwner,
        pid_file: PathBuf,
    ) -> tokio::task::JoinHandle<()> {
        let script = format!(
            "printf '%s\\n' \"$$\" > {}; sleep 30",
            crate::sandbox::shell_quote(&pid_file.to_string_lossy())
        );
        let finished = Arc::new(AtomicBool::new(false));
        let child_finished = finished.clone();
        tokio::spawn(crate::process_tree::scope(process_owner, async move {
            let mut command = tokio::process::Command::new("sh");
            command.arg("-c").arg(script);
            let _ = crate::process_tree::output(command, None, None).await;
            child_finished.store(true, Ordering::Release);
        }));

        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
        while !pid_file.exists() {
            assert!(
                tokio::time::Instant::now() < deadline,
                "the parked turn never started its child process"
            );
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        tokio::spawn(crate::process_tree::scope(process_owner, async move {
            let waiter = std::thread::spawn(move || {
                let deadline =
                    std::time::Instant::now() + std::time::Duration::from_secs(PARKED_JOIN_CAP);
                while !finished.load(Ordering::Acquire) && std::time::Instant::now() < deadline {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
            });
            let _ = waiter.join();
        }))
    }

    /// Backstop so a regression fails the assertion instead of wedging the
    /// test binary on a worker thread that never unparks.
    #[cfg(unix)]
    const PARKED_JOIN_CAP: u64 = 20;

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn interrupt_cancels_a_turn_parked_in_a_blocking_subagent_join() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = boundary_host(workspace.path(), store.path());
        let pid_file = workspace.path().join("interrupt-parked-turn-pid");
        let process_owner = crate::process_tree::ProcessTreeOwner::new();
        let handle = parked_subagent_turn(process_owner, pid_file).await;

        let thread_id = "thread-parked-interrupt".to_string();
        let turn_id = "turn-parked-interrupt".to_string();
        host.running_turns.lock().await.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle,
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner,
            },
        );

        tokio::time::timeout(
            std::time::Duration::from_secs(10),
            host.interrupt_turn(TurnInterruptParams {
                thread_id: thread_id.clone(),
                turn_id,
            }),
        )
        .await
        .expect("interrupt waited for the work it was supposed to cancel")
        .expect("interrupt the parked turn");

        assert!(host.running_turns.lock().await.is_empty());
    }

    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn shutdown_cancels_a_turn_parked_in_a_blocking_subagent_join() {
        let workspace = tempdir().expect("workspace");
        let store = tempdir().expect("store");
        let host = boundary_host(workspace.path(), store.path());
        let pid_file = workspace.path().join("shutdown-parked-turn-pid");
        let process_owner = crate::process_tree::ProcessTreeOwner::new();
        let handle = parked_subagent_turn(process_owner, pid_file).await;

        host.running_turns.lock().await.insert(
            "thread-parked-shutdown".to_string(),
            RunningTurn {
                turn_id: "turn-parked-shutdown".to_string(),
                handle,
                partial: Arc::new(StdMutex::new(String::new())),
                process_owner,
            },
        );

        tokio::time::timeout(std::time::Duration::from_secs(10), host.shutdown())
            .await
            .expect("shutdown waited for the work it was supposed to cancel")
            .expect("shutdown the host");

        assert!(host.running_turns.lock().await.is_empty());
    }
}
