use agiworkforce_app_server::{DeveloperSessionHost, DeveloperSessionHostError};
use agiworkforce_protocol::agent_events::{
    AgentEvent, AgentEventProgressStatus, AgentEventProgressUpdate, AgentEventToolCategory,
    AgentEventToolExecutionEnd, AgentEventToolExecutionStart,
};
use agiworkforce_protocol::developer_session::{
    agent_event_notification, task_state_notification, AppServerCapabilities, AppServerClientInfo,
    AppServerNotification, ApprovalResponseParams, DeveloperAgentMode, DeveloperMessage,
    DeveloperReasoningEffort, DeveloperRoutingTaskType, DeveloperSessionSource,
    LocalModelListResponse, LocalModelProvider, LocalModelSummary, ThreadForkParams,
    ThreadIdParams, ThreadListParams, ThreadListResponse, ThreadReadResponse, ThreadStartParams,
    ThreadStatus, ThreadSummary, TurnInterruptParams, TurnStartParams, TurnStatus, TurnSteerParams,
    TurnSummary,
};
use agiworkforce_protocol::protocol::{NetworkPolicyRuleAction, ReviewDecision};
use agiworkforce_protocol::task_state::AgentTaskState;
use agiworkforce_protocol::user_input::UserInput;
use async_trait::async_trait;
use base64::Engine as _;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{Mutex, broadcast, oneshot};
use uuid::Uuid;

use crate::agent::{AgentSession, ToolApprovalSink, ToolEventSink};
use crate::config::CliConfig;
use crate::context;
use crate::models::{self, ContentBlock};
use crate::models::{OllamaMode, Provider};
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
const MAX_IMAGE_INPUT_BYTES: usize = 10_000_000;

#[derive(Clone)]
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
        })
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
        model: &str,
        managed_session: ManagedSession,
        path: PathBuf,
    ) -> Result<Arc<Mutex<AgentSession>>, DeveloperSessionHostError> {
        let system_context = context::gather_system_context();
        let provider_override = models::selection_provider_override(
            model,
            &self.config.default.model,
            &self.config.default.provider,
            None,
        );
        let mut agent = AgentSession::new_checked(model, &system_context, None, provider_override)
            .map_err(invalid_request)?;
        agent.apply_ui_config(&self.config);
        if !managed_session.messages.is_empty() {
            agent.messages = managed_session.messages.clone();
        }
        agent.adopt_managed_session(managed_session, path);
        agent.quiet = true;

        Ok(Arc::new(Mutex::new(agent)))
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
        tokio::spawn(async move {
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
                Ok(Ok(Some(manager))) => {
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
        let model = resolved
            .1
            .model
            .clone()
            .unwrap_or_else(|| self.config.default.model.clone());
        let agent = self
            .build_agent(&model, resolved.1, resolved.0.path)
            .await?;

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
        ThreadSummary {
            id: summary.session_id.clone(),
            title: summary
                .title
                .clone()
                .unwrap_or_else(|| "Untitled developer session".to_string()),
            model: summary.model.clone(),
            cwd: summary
                .workspace_root
                .as_ref()
                .map(|path| path.display().to_string()),
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
        let mut text_parts = Vec::new();
        let mut images = Vec::new();

        for item in input {
            match item {
                UserInput::Text { text, .. } => text_parts.push(text),
                UserInput::Image { image_url } => {
                    images.push(content_block_from_data_url(&image_url)?);
                }
                UserInput::LocalImage { path } => {
                    images.push(self.content_block_from_local_image(&path)?);
                }
                UserInput::Skill { name, path } => text_parts.push(format!(
                    "Use the explicitly selected skill `{name}` at `{}`.",
                    path.display()
                )),
                UserInput::Mention { name, path } => {
                    text_parts.push(format!("Use the selected context `{name}` ({path})."));
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
    ) -> Result<ContentBlock, DeveloperSessionHostError> {
        let canonical = path.canonicalize().map_err(invalid_request)?;
        if !canonical.starts_with(&self.workspace_root) {
            return Err(DeveloperSessionHostError::invalid_request(format!(
                "Local image {} is outside the trusted workspace {}",
                canonical.display(),
                self.workspace_root.display()
            )));
        }
        let bytes = std::fs::read(&canonical).map_err(invalid_request)?;
        let encoded = agiworkforce_utils_image::load_for_prompt_bytes(
            &canonical,
            bytes,
            agiworkforce_utils_image::PromptImageMode::ResizeToFit,
        )
        .map_err(invalid_request)?;
        Ok(ContentBlock::Image {
            mime: encoded.mime,
            data_b64: base64::engine::general_purpose::STANDARD.encode(encoded.bytes),
        })
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
    async fn list_local_models(&self) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
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
        let provider_override = models::selection_provider_override(
            &model,
            &self.config.default.model,
            &self.config.default.provider,
            requested_provider,
        );
        let mut agent = AgentSession::new_checked(&model, &system_context, None, provider_override)
            .map_err(invalid_request)?;
        agent.apply_ui_config(&self.config);
        agent.quiet = true;

        let id = Uuid::new_v4().to_string();
        let mut managed =
            ManagedSession::with_messages(id.clone(), chrono::Utc::now(), agent.messages.clone());
        managed.title = title;
        managed.model = Some(model.clone());
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
        agent.adopt_managed_session(managed, path);
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
        let messages = session
            .messages
            .iter()
            .filter(|message| !message.role.eq_ignore_ascii_case("system"))
            .map(|message| DeveloperMessage {
                role: message.role.clone(),
                text: message.text_content(),
            })
            .collect();
        Ok(ThreadReadResponse {
            thread: self.resolved_summary(resolved).await,
            messages,
        })
    }

    async fn fork_thread(
        &self,
        params: ThreadForkParams,
        client: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
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
                    agent.switch_model(model).map_err(invalid_request)?;
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
                Ok(())
            })();
            if let Err(error) = setup_result {
                snapshot.restore(&mut agent);
                return Err(error);
            }
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
        let handle = tokio::spawn(async move {
            if start_receiver.await.is_err() {
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
                let result = agent
                    .send(
                        &task_config,
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
                        break;
                    }
                }
                drop(agent);

                next_input = {
                    let mut steering = task_steering.lock().await;
                    steering
                        .get_mut(&task_thread_id)
                        .and_then(|queue| (!queue.is_empty()).then(|| queue.remove(0)))
                };
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
            task_steering.lock().await.remove(&task_thread_id);
            task_running.lock().await.remove(&task_thread_id);
        });

        running_turns.insert(
            thread_id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle,
                partial,
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
        drop(running);
        self.steering
            .lock()
            .await
            .entry(params.thread_id.clone())
            .or_default()
            .push(prepared);
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
        running.handle.abort();
        let _ = running.handle.await;
        self.steering.lock().await.remove(&params.thread_id);
        self.cancel_pending_approvals(&params.turn_id).await;

        if let Ok(notification) = task_state_notification(
            params.turn_id.clone(),
            AgentTaskState::Cancelled,
            Some(AgentTaskState::Running),
            Some("Agent work was cancelled.".to_string()),
        ) {
            let _ = self.notifications.send(notification);
        }

        if let Some(session) = self.sessions.lock().await.get(&params.thread_id).cloned() {
            let partial = match running.partial.lock() {
                Ok(partial) => partial.clone(),
                Err(poisoned) => poisoned.into_inner().clone(),
            };
            let mut session = session.lock().await;
            session.finalize_cancelled_turn(&partial);
            session.persist_managed_session().map_err(internal_error)?;
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

    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.notifications.subscribe()
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

fn content_block_from_data_url(image_url: &str) -> Result<ContentBlock, DeveloperSessionHostError> {
    let (header, data) = image_url.split_once(',').ok_or_else(|| {
        DeveloperSessionHostError::invalid_request("Image input must be a base64 data URL")
    })?;
    let mime = header
        .strip_prefix("data:")
        .and_then(|header| header.strip_suffix(";base64"))
        .filter(|mime| mime.starts_with("image/"))
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
    Ok(ContentBlock::Image {
        mime: mime.to_string(),
        data_b64: data.to_string(),
    })
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
        .map(|title| title.trim().chars().take(200).collect::<String>())
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
    use tempfile::tempdir;

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
        assert_ne!(low.gemini_thinking_budget(), medium.gemini_thinking_budget());

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
        let previous = ManagedSessionAutoRouting {
            selection: "auto-premium".to_string(),
            model_key: "gpt-5.6-luna".to_string(),
            task_type: DeveloperRoutingTaskType::General,
            trust_mode: agiworkforce_model_registry::TrustMode::ManagedCloud,
        };

        let resolved = host
            .resolve_auto_thread_model(
                "auto-premium",
                DeveloperRoutingTaskType::Coding,
                Some(&previous),
            )
            .expect("coding route");

        assert_eq!(resolved.provider_model_id, "gpt-5.4-mini");
        assert!(resolved.fallback_model_ids.is_empty());
        let state = resolved.auto_routing.expect("persisted Auto state");
        assert_eq!(state.model_key, "gpt-5.4-mini");
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
        let previous = ManagedSessionAutoRouting {
            selection: "auto-economy".to_string(),
            model_key: "gemini-3.5-flash-lite".to_string(),
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

        assert_eq!(resolved.provider_model_id, "gemini-3.5-flash-lite");
        assert_eq!(
            resolved.fallback_model_ids.first(),
            Some(&resolved.provider_model_id)
        );
        assert_eq!(resolved.fallback_model_ids.len(), 1);
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
        host.running_turns.lock().await.insert(
            thread.id.clone(),
            RunningTurn {
                turn_id: turn_id.clone(),
                handle,
                partial,
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

        let reloaded =
            CliDeveloperSessionHost::new_with_store(CliConfig::default(), workspace, store, false)
                .expect("reloaded host");
        let history = reloaded
            .read_thread(ThreadIdParams {
                thread_id: thread.id,
            })
            .await
            .expect("persisted interrupted history");
        assert!(
            history
                .messages
                .iter()
                .any(|message| message.text.contains("partial assistant response"))
        );
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
                vec![
                    valid_context_file
                        .path()
                        .canonicalize()
                        .expect("canonical valid context")
                ],
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
}
