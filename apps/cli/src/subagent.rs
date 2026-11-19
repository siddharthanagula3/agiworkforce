use std::collections::HashMap;
use std::sync::Arc;
use std::thread;

use anyhow::{bail, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::cost_ledger::CostBudget;
use crate::terminal_style as ts;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// The route a parent session runs on. A child runs on exactly this provider
/// and privacy mode: re-deriving a route from process defaults let a Local
/// session's child reach a cloud provider (AGENTS.md section 6).
#[derive(Debug, Clone)]
pub struct InheritedRoute {
    pub model: String,
    pub provider: crate::models::Provider,
    pub privacy_mode: crate::agent::PrivacyMode,
}

impl InheritedRoute {
    pub fn of(session: &crate::agent::AgentSession) -> Self {
        Self {
            model: session.model.clone(),
            provider: session.provider.clone(),
            privacy_mode: session.privacy_mode,
        }
    }

    /// The route background work for this session may take off the device:
    /// none for a Local session, or for one whose route disagrees with its
    /// privacy mode.
    pub fn off_device(session: &crate::agent::AgentSession) -> Option<Self> {
        (session.privacy_mode != crate::agent::PrivacyMode::Local
            && session.provider_privacy_mode() == session.privacy_mode)
            .then(|| Self::of(session))
    }

    /// Build a child session on this route, refusing one whose provider would
    /// leave the parent's trust boundary.
    pub(crate) fn child_session(
        &self,
        sys_context: &SystemContext,
    ) -> Result<crate::agent::AgentSession> {
        let mut session = crate::agent::AgentSession::new_with_provider(
            &self.model,
            sys_context,
            None,
            self.provider.clone(),
        );
        session.set_privacy_mode(self.privacy_mode);
        let route_mode = session.provider_privacy_mode();
        if route_mode != self.privacy_mode {
            bail!(
                "A subagent cannot start: this session is {}, but model `{}` routes through {} mode. A subagent never leaves its parent's trust boundary.",
                self.privacy_mode.trust_word(),
                self.model,
                route_mode.trust_word()
            );
        }
        Ok(session)
    }
}

/// Status of a running or completed subagent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SubagentStatus {
    /// Subagent is actively working.
    Running,
    /// Subagent completed successfully.
    Completed,
    /// Subagent failed with an error message.
    Failed(String),
    /// Subagent was cancelled by the user or parent agent.
    Cancelled,
}

impl std::fmt::Display for SubagentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubagentStatus::Running => write!(f, "running"),
            SubagentStatus::Completed => write!(f, "completed"),
            SubagentStatus::Failed(msg) => write!(f, "failed: {}", msg),
            SubagentStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Render the `/task list` management view over the spawned-subagent task
/// state `(id, description, status)`. Read-only.
const GENERAL_PURPOSE_ROLE: &str = "general-purpose";

pub fn format_task_list(tasks: &[(String, String, String, SubagentStatus)]) -> String {
    if tasks.is_empty() {
        return "No subagent tasks in this session yet.\n  \
                Tasks appear here after the model calls the `task` tool to spawn a subagent."
            .to_string();
    }
    let mut lines = vec![format!("Subagent tasks ({})", tasks.len())];
    for (id, role, description, status) in tasks {
        let desc = if description.trim().is_empty() {
            "(no description)"
        } else {
            description.trim()
        };
        lines.push(format!("  {:<20} {:<16} [{}] {}", id, role, status, desc));
    }
    lines.join("\n")
}

pub fn format_task_detail(
    id: &str,
    description: &str,
    status: &SubagentStatus,
    result: Option<&SubagentResult>,
) -> String {
    let description = if description.trim().is_empty() {
        "(no description)"
    } else {
        description.trim()
    };
    let mut lines = vec![format!("Task {id} [{status}] {description}")];
    match result {
        Some(result) => {
            let usage = &result.usage;
            if !usage.model.is_empty() {
                lines.push(format!(
                    "Model {} · {} in / {} out tokens · {}",
                    usage.model,
                    usage.input_tokens,
                    usage.output_tokens,
                    if usage.via_subscription {
                        "on your subscription".to_string()
                    } else {
                        format!(
                            "{} credits",
                            crate::cost_ledger::credit_amount(crate::cost_ledger::credits_for_usd(
                                usage.cost_usd
                            ))
                        )
                    }
                ));
            }
            lines.push(String::new());
            lines.push(result.output.trim().to_string());
            if let Some(line) = result.incomplete_line() {
                lines.push(String::new());
                lines.push(line);
            }
            if !result.files_modified.is_empty() {
                lines.push(String::new());
                lines.push(format!(
                    "Files modified: {}",
                    result.files_modified.join(", ")
                ));
            }
            if !result.transcript.is_empty() {
                lines.push(String::new());
                lines.push(format!(
                    "Its whole conversation ({} steps): /tasks transcript {id}",
                    result.transcript.len()
                ));
            }
        }
        None if matches!(status, SubagentStatus::Running) => {
            lines.push("Still running. Its output appears here when it finishes.".to_string());
        }
        None => lines.push("It left no output.".to_string()),
    }
    lines.join("\n")
}

/// What one subagent turn consumed, attributed to the session that spawned it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SubagentUsage {
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_creation_tokens: u32,
    pub cost_usd: f64,
    pub via_subscription: bool,
    #[serde(skip)]
    pub managed_request_ids: Vec<String>,
}

impl SubagentUsage {
    pub(crate) fn from_turn(model: &str, turn: &crate::agent::TurnResult) -> Self {
        Self {
            model: model.to_string(),
            input_tokens: turn.input_tokens,
            output_tokens: turn.output_tokens,
            cache_read_tokens: turn.cache_read_tokens,
            cache_creation_tokens: turn.cache_creation_tokens,
            cost_usd: turn.cost_usd,
            via_subscription: turn.via_subscription,
            managed_request_ids: turn.managed_request_ids.clone(),
        }
    }

    pub(crate) fn from_unfinished_session(
        model: &str,
        session: &crate::agent::AgentSession,
    ) -> Option<Self> {
        let usage = Self {
            model: model.to_string(),
            input_tokens: session.total_input_tokens,
            output_tokens: session.total_output_tokens,
            cache_read_tokens: session.total_cache_read_tokens,
            cache_creation_tokens: session.total_cache_creation_tokens,
            cost_usd: session.cost_ledger.total_usd,
            via_subscription: false,
            managed_request_ids: Vec::new(),
        };
        let spent = usage.input_tokens > 0
            || usage.output_tokens > 0
            || usage.cache_read_tokens > 0
            || usage.cache_creation_tokens > 0
            || usage.cost_usd > 0.0;
        spent.then_some(usage)
    }
}

struct ChildRunFailure {
    error: anyhow::Error,
    usage: Option<SubagentUsage>,
}

impl ChildRunFailure {
    fn before_any_request(error: anyhow::Error) -> Self {
        Self { error, usage: None }
    }
}

/// Result produced by a completed subagent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentResult {
    pub id: String,
    pub output: String,
    pub files_modified: Vec<String>,
    pub usage: SubagentUsage,
    #[serde(default)]
    pub transcript: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub incomplete: Option<String>,
}

impl SubagentResult {
    fn from_turn(
        id: String,
        model: &str,
        turn: crate::agent::TurnResult,
        transcript: Vec<String>,
    ) -> Self {
        Self {
            id,
            files_modified: extract_modified_files(&turn.response),
            usage: SubagentUsage::from_turn(model, &turn),
            incomplete: turn.incomplete.map(|cause| cause.notice()),
            output: turn.response,
            transcript,
        }
    }

    pub(crate) fn incomplete_line(&self) -> Option<String> {
        self.incomplete
            .as_ref()
            .map(|notice| format!("Incomplete answer: {notice}"))
    }

    pub(crate) fn tool_output(&self) -> String {
        let mut output = format!("Child task: {}\n\n{}", self.id, self.output);
        if let Some(line) = self.incomplete_line() {
            output.push_str("\n\n");
            output.push_str(&line);
        }
        if !self.files_modified.is_empty() {
            output.push_str("\n\nFiles modified:\n");
            for file in &self.files_modified {
                output.push_str(&format!("  - {file}\n"));
            }
        }
        output
    }
}

const TRANSCRIPT_LINE_CHARS: usize = 400;

fn clipped(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= TRANSCRIPT_LINE_CHARS {
        return flat;
    }
    let mut kept: String = flat.chars().take(TRANSCRIPT_LINE_CHARS).collect();
    kept.push_str(" ...");
    kept
}

/// A subagent's own conversation, one line per message or tool step, as
/// Claude Code lets a user attach to each agent's transcript.
pub(crate) fn transcript_lines(messages: &[crate::models::Message]) -> Vec<String> {
    use crate::models::{ContentBlock, MessageContent};
    let mut lines = Vec::new();
    for message in messages.iter().filter(|message| message.role != "system") {
        let blocks = match &message.content {
            MessageContent::Text(text) => {
                if !text.trim().is_empty() {
                    lines.push(format!("{}: {}", message.role, clipped(text)));
                }
                continue;
            }
            MessageContent::Blocks(blocks) => blocks,
        };
        for block in blocks {
            match block {
                ContentBlock::Text { text } if !text.trim().is_empty() => {
                    lines.push(format!("{}: {}", message.role, clipped(text)))
                }
                ContentBlock::ToolUse { name, input, .. } => {
                    lines.push(format!("tool {name}: {}", clipped(&input.to_string())))
                }
                ContentBlock::ToolResult {
                    content, is_error, ..
                } => lines.push(format!(
                    "{}: {}",
                    if *is_error {
                        "tool error"
                    } else {
                        "tool result"
                    },
                    clipped(content)
                )),
                _ => {}
            }
        }
    }
    lines
}

/// Internal handle tracking a spawned subagent thread.
struct SubagentEntry {
    id: String,
    role: String,
    description: String,
    status: Arc<RwLock<SubagentStatus>>,
    result: Arc<RwLock<Option<SubagentResult>>>,
    /// What the child's provider requests cost, kept however the child ended.
    spent: Arc<RwLock<Option<SubagentUsage>>>,
    /// OS thread handle, each subagent gets its own tokio runtime on a
    /// dedicated thread, avoiding the `Send` constraint of `tokio::spawn`.
    handle: Option<thread::JoinHandle<()>>,
    /// Shared cancellation flag polled by the subagent.
    /// Set by cancel() and checked by the spawned thread.
    cancelled: Arc<std::sync::atomic::AtomicBool>,
    /// Still running when [`SUBAGENT_WAIT_LIMIT`] ran out. Its thread is left
    /// to notice the cancel flag on its own; no later wait holds a turn for it.
    abandoned: bool,
}

// SubagentEntry contains thread::JoinHandle which is not Debug by default.
impl std::fmt::Debug for SubagentEntry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SubagentEntry")
            .field("id", &self.id)
            .field("description", &self.description)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/// Default maximum number of concurrent subagents.
const DEFAULT_MAX_CONCURRENT: usize = 7;

pub const SUBAGENT_MAX_TURNS: usize = 15;

/// How long `wait_all` sleeps between checking whether subagent threads have
/// finished. Bounds how long an interrupt waits before the turn task yields.
const SUBAGENT_JOIN_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(25);

/// The longest one `wait_all` waits for the children still running. A child
/// stuck in a provider or tool call must not hold the parent's turn.
const SUBAGENT_WAIT_LIMIT: std::time::Duration = std::time::Duration::from_secs(600);

const ABANDONED_SETTLE_LIMIT: std::time::Duration = std::time::Duration::from_secs(3);

/// Stack for a thread that runs a whole agent turn on its own runtime. The
/// turn's future is polled on that thread, and the 2 MiB a spawned thread gets
/// by default overflowed in an unoptimized build once a child asked for an
/// approval. The main thread, which runs the same loop, has 8 MiB.
pub(crate) const AGENT_THREAD_STACK_BYTES: usize = 16 * 1024 * 1024;

/// Maximum subagent nesting depth. The root interactive session is depth 0; a
/// subagent it spawns runs at depth 1, and so on. Spawning is refused once a
/// session at this depth would create a deeper child, bounding the subagent
/// tree so nested `task` calls cannot fan out into unbounded cost.
const MAX_SUBAGENT_DEPTH: usize = 3;

/// Manages concurrent subagent tasks spawned via `task` or a named `agent`.
///
/// Each subagent runs on a dedicated OS thread with its own tokio runtime,
/// which avoids `Send` requirements that `tokio::spawn` imposes. This lets
/// subagents use the full `AgentSession::send` path (including dialoguer
/// and non-Send callbacks) without restriction.
#[derive(Debug)]
pub struct SubagentManager {
    entries: Arc<RwLock<HashMap<String, SubagentEntry>>>,
    max_concurrent: usize,
    /// Nesting depth of the session that owns this manager. Children spawned
    /// through it run at `depth + 1`.
    depth: usize,
    next_id: Arc<RwLock<u64>>,
    /// Cloned config for subagent sessions.
    config: CliConfig,
    /// Route every subagent inherits from the parent session.
    route: InheritedRoute,
    /// System context for subagent sessions.
    sys_context: SystemContext,
    /// Whether subagents skip tool confirmation prompts.
    skip_permissions: bool,
    /// Parent permission policy inherited by every subagent.
    permission_mode: crate::cli_options::PermissionMode,
    /// Parent tool filters are inherited by every subagent. Named agent
    /// definitions may narrow these further but never widen them.
    allowed_tools: Option<Vec<String>>,
    disallowed_tools: Vec<String>,
    /// The owning session's spend cap and spend so far. Each child is capped at
    /// its even share of what is left, so a fan-out cannot outspend the parent.
    cost_budget: Option<CostBudget>,
    approval: Option<crate::agent::ToolApprovalSink>,
    workspace_authority: Option<crate::path_security::WorkspaceFileAuthority>,
}

struct SubagentRunConfig {
    config: CliConfig,
    route: InheritedRoute,
    /// Depth the spawned child session runs at (owning manager's depth + 1).
    depth: usize,
    /// Per-child spend cap, distinct from the parent's own budget.
    max_budget_usd: Option<f64>,
    sys_context: SystemContext,
    skip_permissions: bool,
    permission_mode: crate::cli_options::PermissionMode,
    allowed_tools: Option<Vec<String>>,
    disallowed_tools: Vec<String>,
    named_agent: Option<crate::agents::AgentDefinition>,
    approval: Option<crate::agent::ToolApprovalSink>,
    workspace_authority: Option<crate::path_security::WorkspaceFileAuthority>,
    label: String,
}

impl SubagentManager {
    /// Create a new subagent manager.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        config: CliConfig,
        route: InheritedRoute,
        sys_context: SystemContext,
        skip_permissions: bool,
        permission_mode: crate::cli_options::PermissionMode,
        allowed_tools: Option<Vec<String>>,
        disallowed_tools: Vec<String>,
        depth: usize,
    ) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: DEFAULT_MAX_CONCURRENT,
            depth,
            next_id: Arc::new(RwLock::new(1)),
            config,
            route,
            sys_context,
            skip_permissions,
            permission_mode,
            allowed_tools,
            disallowed_tools,
            cost_budget: None,
            approval: None,
            workspace_authority: None,
        }
    }

    pub(crate) fn set_workspace_authority(
        &mut self,
        authority: Option<crate::path_security::WorkspaceFileAuthority>,
    ) {
        self.workspace_authority = authority;
    }

    pub fn set_approval(&mut self, approval: Option<crate::agent::ToolApprovalSink>) {
        self.approval = approval;
    }

    /// Set the owning session's spend cap and spend so far. Without one a child
    /// is uncapped, which is what an uncapped session has always meant.
    pub fn set_cost_budget(&mut self, budget: Option<CostBudget>) {
        self.cost_budget = budget;
    }

    /// Refresh authority-bearing values that can change during a long-lived
    /// interactive session before the next spawn.
    pub fn sync_parent_authority(
        &mut self,
        route: InheritedRoute,
        skip_permissions: bool,
        permission_mode: crate::cli_options::PermissionMode,
        allowed_tools: Option<Vec<String>>,
        disallowed_tools: Vec<String>,
    ) {
        self.route = route;
        self.skip_permissions = skip_permissions;
        self.permission_mode = permission_mode;
        self.allowed_tools = allowed_tools;
        self.disallowed_tools = disallowed_tools;
    }

    /// Spawn a new subagent task. Returns the subagent ID.
    pub async fn spawn(&self, description: &str, prompt: &str) -> Result<String> {
        self.spawn_inner(description, prompt, None, None).await
    }

    /// Spawn an installed named agent through the same bounded foreground
    /// lifecycle as a generic task.
    pub async fn spawn_named(
        &self,
        definition: crate::agents::AgentDefinition,
        prompt: &str,
    ) -> Result<String> {
        let description = format!("agent {}", definition.name);
        self.spawn_inner(&description, prompt, Some(definition), None)
            .await
    }

    pub(crate) async fn spawn_owned(
        &self,
        id: &str,
        description: &str,
        prompt: &str,
        definition: Option<crate::agents::AgentDefinition>,
    ) -> Result<String> {
        self.spawn_inner(description, prompt, definition, Some(id))
            .await
    }

    async fn spawn_inner(
        &self,
        description: &str,
        prompt: &str,
        named_agent: Option<crate::agents::AgentDefinition>,
        owned_id: Option<&str>,
    ) -> Result<String> {
        // Enforce recursion-depth limit before doing any work. The child would
        // run at `self.depth + 1`; refuse once that would exceed the cap so a
        // nested subagent cannot spawn an unbounded subagent tree.
        if self.depth >= MAX_SUBAGENT_DEPTH {
            bail!(
                "Maximum subagent nesting depth reached ({}). A subagent at depth {} cannot spawn further subagents.",
                MAX_SUBAGENT_DEPTH,
                self.depth
            );
        }

        let child_budget_usd = match self.cost_budget {
            Some(budget) => match budget.child_cap_usd(self.max_concurrent) {
                Some(cap) => Some(cap),
                None => bail!(
                    "Session spend cap reached ({} used of {}). No further subagent can be spawned.",
                    crate::cost_ledger::format_usd_as_credits(budget.spent_usd),
                    crate::cost_ledger::format_usd_as_credits(budget.cap_usd)
                ),
            },
            None => None,
        };

        // Check concurrency limit
        let running_count = {
            let entries = self.entries.read().await;
            let mut count = 0usize;
            for entry in entries.values() {
                let status = entry.status.read().await;
                if matches!(*status, SubagentStatus::Running) {
                    count += 1;
                }
            }
            count
        };

        if running_count >= self.max_concurrent {
            bail!(
                "Maximum concurrent subagents reached ({}/{}). Wait for some to complete or cancel existing ones.",
                running_count,
                self.max_concurrent
            );
        }

        // Generate ID
        let id = if let Some(id) = owned_id {
            if self.entries.read().await.contains_key(id) {
                bail!("Child task identity is already running");
            }
            id.to_string()
        } else {
            let mut counter = self.next_id.write().await;
            let id = format!("subagent_{}", *counter);
            *counter += 1;
            id
        };

        let status = Arc::new(RwLock::new(SubagentStatus::Running));
        let result: Arc<RwLock<Option<SubagentResult>>> = Arc::new(RwLock::new(None));
        let spent: Arc<RwLock<Option<SubagentUsage>>> = Arc::new(RwLock::new(None));
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));

        // Clone values for the spawned thread
        let task_id = id.clone();
        let agent_name = named_agent
            .as_ref()
            .map(|definition| definition.name.clone());
        let agent_role = agent_name
            .clone()
            .unwrap_or_else(|| GENERAL_PURPOSE_ROLE.to_string());
        let task_prompt = prompt.to_string();
        let task_run_config = SubagentRunConfig {
            config: self.config.clone(),
            route: self.route.clone(),
            depth: self.depth + 1,
            max_budget_usd: child_budget_usd,
            sys_context: self.sys_context.clone(),
            skip_permissions: self.skip_permissions,
            permission_mode: self.permission_mode,
            allowed_tools: self.allowed_tools.clone(),
            disallowed_tools: self.disallowed_tools.clone(),
            named_agent,
            approval: self.approval.clone(),
            workspace_authority: self.workspace_authority.clone(),
            label: format!("{id}: {description}"),
        };
        let task_status = Arc::clone(&status);
        let task_result = Arc::clone(&result);
        let task_spent = Arc::clone(&spent);
        let task_cancelled = Arc::clone(&cancelled);
        let task_description = description.to_string();
        let task_depth = self.depth + 1;
        let prompt_chars = prompt.chars().count();
        let process_owner = crate::process_tree::current_owner();

        if !crate::tui::tui_active() {
            eprintln!(
                "  {} Spawning subagent {}, {}",
                ts::accent_header("[task]"),
                task_id.bold(),
                task_description.dimmed()
            );
        }

        // Spawn on a dedicated OS thread with its own tokio runtime.
        // This avoids the `Send` requirement of `tokio::spawn`.
        let handle = thread::Builder::new()
            .name(format!("subagent-{}", task_id))
            .stack_size(AGENT_THREAD_STACK_BYTES)
            .spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("Failed to create subagent tokio runtime");

                let task = async move {
                    let audit = |status: &SubagentStatus,
                                 result: Option<&SubagentResult>,
                                 usage: Option<&SubagentUsage>| {
                        crate::subagent_audit::record_subagent(
                            &crate::subagent_audit::SubagentAuditRecord {
                                subagent_id: &task_id,
                                agent: agent_name.as_deref(),
                                description: &task_description,
                                depth: task_depth,
                                prompt_chars,
                                status,
                                usage,
                                files_modified: result
                                    .map_or(0, |result| result.files_modified.len()),
                            },
                        );
                    };

                    // Check cancellation before starting
                    if task_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                        *task_status.write().await = SubagentStatus::Cancelled;
                        audit(&SubagentStatus::Cancelled, None, None);
                        return;
                    }

                    let outcome =
                        run_subagent(&task_run_config, &task_prompt, &task_cancelled).await;

                    // Check cancellation after completion
                    if task_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                        let unfinished = match &outcome {
                            Ok((model, turn, _)) => Some(SubagentUsage::from_turn(model, turn)),
                            Err(failure) => failure.usage.clone(),
                        };
                        *task_spent.write().await = unfinished.clone();
                        {
                            let mut status = task_status.write().await;
                            if matches!(*status, SubagentStatus::Running) {
                                *status = SubagentStatus::Cancelled;
                            }
                        }
                        audit(&SubagentStatus::Cancelled, None, unfinished.as_ref());
                        return;
                    }

                    match outcome {
                        Ok((model, turn, transcript)) => {
                            let subagent_result = SubagentResult::from_turn(
                                task_id.clone(),
                                &model,
                                turn,
                                transcript,
                            );

                            audit(
                                &SubagentStatus::Completed,
                                Some(&subagent_result),
                                Some(&subagent_result.usage),
                            );
                            *task_spent.write().await = Some(subagent_result.usage.clone());
                            *task_result.write().await = Some(subagent_result);
                            *task_status.write().await = SubagentStatus::Completed;

                            if !crate::tui::tui_active() {
                                eprintln!(
                                    "  {} Subagent {} completed",
                                    ts::success_header("[task]"),
                                    task_id.bold()
                                );
                            }
                        }
                        Err(failure) => {
                            let err_msg = format!("{:#}", failure.error);
                            let failed = SubagentStatus::Failed(err_msg.clone());
                            audit(&failed, None, failure.usage.as_ref());
                            *task_spent.write().await = failure.usage;
                            *task_status.write().await = failed;

                            if !crate::tui::tui_active() {
                                eprintln!(
                                    "  {} Subagent {} failed: {}",
                                    ts::danger_header("[task]"),
                                    task_id.bold(),
                                    err_msg.dimmed()
                                );
                            }
                        }
                    }
                };
                match process_owner {
                    Some(owner) => rt.block_on(crate::process_tree::scope(owner, task)),
                    None => rt.block_on(task),
                }
            })?;

        let entry = SubagentEntry {
            id: id.clone(),
            role: agent_role,
            description: description.to_string(),
            status,
            result,
            spent,
            handle: Some(handle),
            cancelled,
            abandoned: false,
        };

        self.entries.write().await.insert(id.clone(), entry);

        Ok(id)
    }

    /// Get the status of a subagent by ID.
    pub async fn get_status(&self, id: &str) -> Option<SubagentStatus> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            Some(entry.status.read().await.clone())
        } else {
            None
        }
    }

    /// Get the result of a completed subagent.
    pub async fn get_result(&self, id: &str) -> Option<SubagentResult> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            entry.result.read().await.clone()
        } else {
            None
        }
    }

    /// What a finished subagent's provider requests cost, whether it
    /// completed, failed or was cancelled. `None` when it made no billable
    /// request or has not ended.
    pub async fn get_spent(&self, id: &str) -> Option<SubagentUsage> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            entry.spent.read().await.clone()
        } else {
            None
        }
    }

    /// List all subagents with their current status.
    pub async fn list_with_roles(&self) -> Vec<(String, String, String, SubagentStatus)> {
        let entries = self.entries.read().await;
        let mut items = Vec::new();
        for entry in entries.values() {
            let status = entry.status.read().await.clone();
            items.push((
                entry.id.clone(),
                entry.role.clone(),
                entry.description.clone(),
                status,
            ));
        }
        items.sort_by(|a, b| a.0.cmp(&b.0));
        items
    }

    pub async fn list(&self) -> Vec<(String, String, SubagentStatus)> {
        let entries = self.entries.read().await;
        let mut items = Vec::new();
        for entry in entries.values() {
            let status = entry.status.read().await.clone();
            items.push((entry.id.clone(), entry.description.clone(), status));
        }
        items.sort_by(|a, b| a.0.cmp(&b.0));
        items
    }

    /// Cancel a running subagent.
    pub async fn cancel(&self, id: &str) -> Result<()> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            // Hold a single write lock for both the check and the update
            // to prevent a TOCTOU race where another thread changes the
            // status between our read and write.
            let mut status = entry.status.write().await;
            if matches!(*status, SubagentStatus::Running) {
                // Signal cancellation, the thread will check this flag.
                entry
                    .cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
                *status = SubagentStatus::Cancelled;
                Ok(())
            } else {
                let status_display = format!("{}", *status);
                bail!(
                    "Subagent '{}' is not running (status: {})",
                    id,
                    status_display
                )
            }
        } else {
            bail!("Subagent '{}' not found", id)
        }
    }

    /// Wait for all running subagents to complete. Returns a summary.
    ///
    /// Polls `is_finished` and yields between rounds rather than blocking on
    /// `join`, so this stays an await point. The app-server holds the session
    /// mutex across `AgentSession::send`, and `interrupt_turn`/`shutdown` need
    /// that mutex to reach `shutdown_all`, the call that sets the cancel flags
    /// these threads are waiting on. A blocking join here gives `abort` nothing
    /// to land on, so the turn task keeps the mutex, the teardown blocks on it,
    /// and neither side can advance.
    ///
    /// A handle is taken only once its thread has finished, so a cancelled
    /// `wait_all` leaves every unfinished handle in `entries` for a later
    /// `shutdown_all` to join instead of detaching the thread. The wait is
    /// bounded by [`SUBAGENT_WAIT_LIMIT`]: a child still running then is
    /// cancelled, reported as timed out and not waited for again.
    pub async fn wait_all(&self) -> Vec<(String, SubagentStatus)> {
        self.wait_all_within(SUBAGENT_WAIT_LIMIT).await
    }

    async fn wait_all_within(&self, limit: std::time::Duration) -> Vec<(String, SubagentStatus)> {
        let deadline = std::time::Instant::now() + limit;
        loop {
            let finished: Vec<(String, thread::JoinHandle<()>)> = {
                let mut entries = self.entries.write().await;
                entries
                    .values_mut()
                    .filter_map(|entry| {
                        if !entry
                            .handle
                            .as_ref()
                            .is_some_and(thread::JoinHandle::is_finished)
                        {
                            return None;
                        }
                        let id = entry.id.clone();
                        entry.handle.take().map(|handle| (id, handle))
                    })
                    .collect()
            };
            for (id, handle) in finished {
                if handle.join().is_err() {
                    if let Some(entry) = self.entries.read().await.get(&id) {
                        *entry.status.write().await =
                            SubagentStatus::Failed("Child runtime panicked".to_string());
                    }
                    eprintln!(
                        "  {} Subagent {} thread panicked",
                        ts::danger_header("[task]"),
                        id.bold()
                    );
                }
            }
            let outstanding = {
                let entries = self.entries.read().await;
                entries
                    .values()
                    .any(|entry| entry.handle.is_some() && !entry.abandoned)
            };
            if !outstanding {
                break;
            }
            if std::time::Instant::now() >= deadline {
                self.abandon_unfinished(limit).await;
                break;
            }
            tokio::time::sleep(SUBAGENT_JOIN_POLL_INTERVAL).await;
        }

        // Collect final statuses
        let entries = self.entries.read().await;
        let mut results = Vec::new();
        for entry in entries.values() {
            let status = entry.status.read().await.clone();
            results.push((entry.id.clone(), status));
        }
        results.sort_by(|a, b| a.0.cmp(&b.0));
        results
    }

    /// Cancel every child whose thread is still running past `limit` and
    /// report it to the parent as timed out. Its handle stays in `entries`;
    /// the thread exits once it sees the flag.
    async fn abandon_unfinished(&self, limit: std::time::Duration) {
        self.mark_abandoned(limit).await;
        let deadline = std::time::Instant::now() + ABANDONED_SETTLE_LIMIT;
        loop {
            let settling = {
                let entries = self.entries.read().await;
                entries.values().any(|entry| {
                    entry.abandoned
                        && entry
                            .handle
                            .as_ref()
                            .is_some_and(|handle| !handle.is_finished())
                })
            };
            if !settling || std::time::Instant::now() >= deadline {
                break;
            }
            tokio::time::sleep(SUBAGENT_JOIN_POLL_INTERVAL).await;
        }
    }

    async fn mark_abandoned(&self, limit: std::time::Duration) {
        let mut entries = self.entries.write().await;
        for entry in entries.values_mut() {
            if entry.handle.is_none() || entry.abandoned {
                continue;
            }
            entry.abandoned = true;
            entry
                .cancelled
                .store(true, std::sync::atomic::Ordering::Release);
            *entry.status.write().await = SubagentStatus::Failed(format!(
                "Timed out after {}s and was cancelled while still running",
                limit.as_secs()
            ));
            if !crate::tui::tui_active() {
                eprintln!(
                    "  {} Subagent {} timed out and was cancelled",
                    ts::danger_header("[task]"),
                    entry.id.bold()
                );
            }
        }
    }

    /// Cancel and join every subagent owned by this parent session.
    ///
    /// App-server shutdown uses this before acknowledging quiescence so an OS
    /// thread (and any tool process tree running inside it) cannot outlive the
    /// local developer runtime. A thread stuck past [`SUBAGENT_WAIT_LIMIT`] is
    /// cancelled and left behind rather than holding the shutdown.
    pub async fn shutdown_all(&self) {
        {
            let entries = self.entries.read().await;
            for entry in entries.values() {
                entry
                    .cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
                let mut status = entry.status.write().await;
                if matches!(*status, SubagentStatus::Running) {
                    *status = SubagentStatus::Cancelled;
                }
            }
        }
        let _ = self.wait_all().await;
    }
}

// ---------------------------------------------------------------------------
// Subagent execution
// ---------------------------------------------------------------------------

/// Run a subagent session: create an AgentSession, send the prompt, return
/// the final response text.
async fn run_subagent(
    run_config: &SubagentRunConfig,
    prompt: &str,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<(String, crate::agent::TurnResult, Vec<String>), ChildRunFailure> {
    let mut session = run_config
        .route
        .child_session(&run_config.sys_context)
        .map_err(ChildRunFailure::before_any_request)?;
    if let Some(authority) = run_config.workspace_authority.clone() {
        session.install_workspace_file_authority(authority);
    }
    session.skip_permissions = run_config.skip_permissions;
    session.permission_mode = run_config.permission_mode;
    if !run_config.skip_permissions {
        session.pinned_permission_mode = Some(
            run_config
                .permission_mode
                .within(session.pinned_permission_mode),
        );
    }
    session.subagent_depth = run_config.depth;
    session.max_budget_usd = run_config.max_budget_usd;
    session.allowed_tools = run_config.allowed_tools.clone();
    session
        .disallowed_tools
        .clone_from(&run_config.disallowed_tools);
    // Subagents get a reasonable max turns to avoid runaway loops
    session.max_turns = Some(SUBAGENT_MAX_TURNS);
    session.on_tool_approval = run_config
        .approval
        .clone()
        .map(|sink| crate::teams::named_approval(sink, &run_config.label));
    if let Some(definition) = run_config.named_agent.as_ref() {
        definition.apply_to_subagent_session(&mut session);
    }

    let model = session.model.clone();
    let result = {
        let send_fut = session.send(
            &run_config.config,
            prompt,
            Box::new(|_chunk| {
                // Subagent output is collected silently -- not streamed to terminal.
                // The parent agent receives the full result.
            }),
        );
        tokio::pin!(send_fut);

        // Race the turn against cancellation. If `cancel()` (or the parent's
        // timeout) sets the flag, the cancel branch wins and `send_fut` is dropped
        // on return, which aborts the in-flight provider request, so a cancelled
        // subagent actually stops generating instead of running its turn (and any
        // in-flight tool side effects) to completion.
        tokio::select! {
            biased;
            () = wait_until_cancelled(cancelled) => {
                Err(anyhow::anyhow!("subagent cancelled"))
            }
            r = &mut send_fut => r,
        }
    };

    match result {
        Ok(turn) => {
            let turn = with_nested_spend(turn, &session);
            Ok((model, turn, transcript_lines(&session.messages)))
        }
        Err(error) => Err(ChildRunFailure {
            error,
            usage: SubagentUsage::from_unfinished_session(&model, &session),
        }),
    }
}

fn with_nested_spend(
    mut turn: crate::agent::TurnResult,
    session: &crate::agent::AgentSession,
) -> crate::agent::TurnResult {
    let ledger = session.cost_ledger.total_usd;
    if ledger.is_finite() && ledger > turn.cost_usd {
        turn.cost_usd = ledger;
    }
    turn
}

/// Resolve once the cancellation flag is set, polling cooperatively (every
/// 100ms) so the racing `send` future keeps getting driven until then.
async fn wait_until_cancelled(flag: &std::sync::atomic::AtomicBool) {
    while !flag.load(std::sync::atomic::Ordering::Acquire) {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract file paths modified by a subagent. Tries structured JSON first
/// (a `__modified_files` key in the last line), then falls back to regex
/// pattern matching against tool output messages.
fn extract_modified_files(output: &str) -> Vec<String> {
    // Try structured JSON first, subagents can emit a trailing metadata line
    for line in output.lines().rev().take(5) {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.contains("__modified_files") {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if let Some(arr) = meta.get("__modified_files").and_then(|v| v.as_array()) {
                    let paths: Vec<String> = arr
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    if !paths.is_empty() {
                        return paths;
                    }
                }
            }
        }
    }

    // Fallback: regex heuristics on tool output patterns
    let mut files = Vec::new();

    for line in output.lines() {
        if let Some(idx) = line.find("Successfully wrote") {
            if let Some(to_idx) = line[idx..].find(" to ") {
                let path = line[idx + to_idx + 4..].trim();
                if path.starts_with('/') || path.starts_with('.') {
                    files.push(path.to_string());
                }
            }
        }
        if let Some(idx) = line.find("Successfully edited") {
            let rest = line[idx + 19..].trim();
            if let Some(path) = rest.split_whitespace().next() {
                if path.starts_with('/') || path.starts_with('.') {
                    files.push(path.to_string());
                }
            }
        }
    }

    files.sort();
    files.dedup();
    files
}

pub(crate) const WORKFLOW_USAGE: &str =
    "Usage: /workflow <goal>. Plans the goal into stages and runs each step as a subagent.";

pub(crate) fn workflow_blocker(session: &crate::agent::AgentSession) -> Option<&'static str> {
    if session.subagent_depth >= MAX_SUBAGENT_DEPTH {
        return Some(
            "A workflow cannot start here: this session is at the subagent nesting limit.",
        );
    }
    if matches!(
        session.governed_permission_mode(),
        crate::cli_options::PermissionMode::Plan
    ) && !session.plan_approved
    {
        return Some(
            "Plan mode is on. Approve the plan with /plan accept or turn it off with /plan off, then run /workflow again.",
        );
    }
    if !session.can_own_child_tasks() {
        return Some(
            "A workflow needs a saved session to track its steps. Start without --no-session-persistence to use /workflow.",
        );
    }
    if !session
        .effective_tool_definitions()
        .iter()
        .any(|tool| tool.name == "task")
    {
        return Some(
            "The task tool is turned off for this session, so a workflow cannot start subagents.",
        );
    }
    None
}

pub(crate) fn workflow_prompt(goal: &str) -> String {
    format!(
        "Run this goal as a workflow of subagent steps:\n\n{goal}\n\n\
         1. Plan. Split the goal into the fewest steps that one subagent can finish on its own. \
         Put steps that do not depend on each other in the same stage, at most \
         {DEFAULT_MAX_CONCURRENT} steps per stage. Show the stages as a numbered list before \
         starting.\n\
         2. Run. Go through the stages in order. Start every step of a stage as its own `task` \
         call in one reply so they run in parallel. Give each task a short description and a \
         self-contained prompt that carries what earlier stages found.\n\
         3. Check. Read each stage's results before the next stage. Retry a failed step once \
         with a corrected prompt; if it fails again, stop and say what blocked it.\n\
         4. Report. Summarize what each step did, the files it changed, and anything left \
         undone.\n\n\
         Delegate the steps; do not do their work yourself."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_subagent_transcript_shows_its_messages_and_tool_steps() {
        use crate::models::{ContentBlock, Message};
        let messages = vec![
            Message::text("system", "internal"),
            Message::text("user", "Find the flaky test"),
            Message::blocks(
                "assistant",
                vec![
                    ContentBlock::Text {
                        text: "Looking at the CI log.".to_string(),
                    },
                    ContentBlock::ToolUse {
                        id: "t1".to_string(),
                        name: "read_file".to_string(),
                        input: serde_json::json!({ "path": "ci.log" }),
                    },
                ],
            ),
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "t1".to_string(),
                    content: "timeout in parser_test".to_string(),
                    is_error: false,
                }],
            ),
            Message::text("assistant", "parser_test times out."),
        ];
        assert_eq!(
            transcript_lines(&messages),
            vec![
                "user: Find the flaky test",
                "assistant: Looking at the CI log.",
                "tool read_file: {\"path\":\"ci.log\"}",
                "tool result: timeout in parser_test",
                "assistant: parser_test times out.",
            ]
        );
    }

    #[test]
    fn test_subagent_status_display() {
        assert_eq!(SubagentStatus::Running.to_string(), "running");
        assert_eq!(SubagentStatus::Completed.to_string(), "completed");
        assert_eq!(
            SubagentStatus::Failed("oops".to_string()).to_string(),
            "failed: oops"
        );
        assert_eq!(SubagentStatus::Cancelled.to_string(), "cancelled");
    }

    #[test]
    fn format_task_list_renders_state_and_empty() {
        assert!(format_task_list(&[]).contains("No subagent tasks"));

        let tasks = vec![
            (
                "task-1".to_string(),
                "reviewer".to_string(),
                "refactor module".to_string(),
                SubagentStatus::Running,
            ),
            (
                "task-2".to_string(),
                GENERAL_PURPOSE_ROLE.to_string(),
                String::new(),
                SubagentStatus::Failed("boom".to_string()),
            ),
        ];
        let out = format_task_list(&tasks);
        assert!(out.contains("Subagent tasks (2)"), "{out}");
        assert!(out.contains("task-1"), "{out}");
        assert!(out.contains("reviewer"), "{out}");
        assert!(out.contains("[running] refactor module"), "{out}");
        assert!(out.contains("[failed: boom]"), "{out}");
        assert!(out.contains("(no description)"), "{out}");
    }

    #[test]
    fn test_extract_modified_files_write() {
        let output = "Some output\nSuccessfully wrote 10 lines (200 bytes) to /tmp/foo.rs\nDone";
        let files = extract_modified_files(output);
        assert_eq!(files, vec!["/tmp/foo.rs"]);
    }

    #[test]
    fn test_extract_modified_files_edit() {
        let output = "Successfully edited /tmp/bar.rs (replaced 1 occurrence)";
        let files = extract_modified_files(output);
        assert_eq!(files, vec!["/tmp/bar.rs"]);
    }

    #[test]
    fn test_extract_modified_files_none() {
        let output = "Read file contents successfully.";
        let files = extract_modified_files(output);
        assert!(files.is_empty());
    }

    #[test]
    fn test_extract_modified_files_dedup() {
        let output = "Successfully wrote 5 lines (100 bytes) to /tmp/foo.rs\n\
                       Successfully wrote 3 lines (50 bytes) to /tmp/foo.rs";
        let files = extract_modified_files(output);
        assert_eq!(files, vec!["/tmp/foo.rs"]);
    }

    #[test]
    fn test_default_max_concurrent() {
        assert_eq!(DEFAULT_MAX_CONCURRENT, 7);
    }

    #[test]
    fn inherited_workspace_authority_never_rebinds_to_a_replacement_directory() {
        let parent = tempfile::tempdir().expect("parent");
        let parent_root = parent.path().canonicalize().expect("canonical parent");
        let granted = parent_root.join("granted");
        let moved = parent_root.join("moved");
        std::fs::create_dir(&granted).expect("granted root");
        std::fs::write(granted.join("marker"), b"owned").expect("owned marker");
        let authority =
            crate::path_security::WorkspaceFileAuthority::new(&granted).expect("authority");
        let mut manager = SubagentManager::new(
            CliConfig::default(),
            local_route("fixture-local-model:latest"),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            0,
        );
        manager.set_workspace_authority(Some(authority));
        let inherited = manager
            .workspace_authority
            .as_ref()
            .expect("inherited handles");
        let (directory, relative) = inherited
            .resolve(&granted.join("marker"))
            .expect("resolve granted file");
        let before = directory
            .read_file(&relative, 100)
            .expect("read before replacement")
            .expect("owned file");
        assert_eq!(before.bytes, b"owned");
        match std::fs::rename(&granted, &moved) {
            Ok(()) => {
                std::fs::create_dir(&granted).expect("replacement root");
                std::fs::write(granted.join("marker"), b"replacement").expect("replacement marker");
            }
            Err(error) => {
                // Windows refuses to move a directory the inherited authority holds open.
                const ERROR_SHARING_VIOLATION: i32 = 32;
                assert!(
                    cfg!(windows) && error.raw_os_error() == Some(ERROR_SHARING_VIOLATION),
                    "move original root: {error}"
                );
            }
        }
        let inherited = manager
            .workspace_authority
            .as_ref()
            .expect("inherited handles");
        if let Ok((directory, relative)) = inherited.resolve(&granted.join("marker")) {
            if let Ok(Some(file)) = directory.read_file(&relative, 100) {
                assert_eq!(
                    file.bytes, b"owned",
                    "inherited authority followed a replacement path"
                );
            }
        }
    }

    #[test]
    fn manager_refreshes_parent_authority_before_spawn() {
        let mut manager = SubagentManager::new(
            CliConfig::default(),
            local_route("fixture-local-model:latest"),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            0,
        );

        manager.sync_parent_authority(
            local_route("fixture-subagent-model"),
            true,
            crate::cli_options::PermissionMode::AcceptEdits,
            Some(vec!["read_file".to_string()]),
            vec!["web_fetch".to_string()],
        );

        assert_eq!(manager.route.model, "fixture-subagent-model");
        assert!(manager.skip_permissions);
        assert_eq!(
            manager.permission_mode,
            crate::cli_options::PermissionMode::AcceptEdits
        );
        assert_eq!(manager.allowed_tools, Some(vec!["read_file".to_string()]));
        assert_eq!(manager.disallowed_tools, vec!["web_fetch".to_string()]);
    }

    fn local_route(model: &str) -> InheritedRoute {
        InheritedRoute {
            model: model.to_string(),
            provider: crate::models::Provider::Ollama(crate::models::OllamaMode::Local),
            privacy_mode: crate::agent::PrivacyMode::Local,
        }
    }

    #[test]
    fn a_local_session_s_subagent_stays_on_the_local_route_whatever_the_process_default() {
        let context = crate::context::gather_system_context();
        let parent = crate::agent::AgentSession::new_checked(
            "fixture-local-model:latest",
            &context,
            None,
            Some("ollama"),
        )
        .expect("Local parent");
        assert_eq!(parent.privacy_mode, crate::agent::PrivacyMode::Local);

        let mut config = CliConfig::default();
        config.default.model = parent.model.clone();
        config.default.provider = "ollama-cloud".to_string();
        let manager = SubagentManager::new(
            config,
            InheritedRoute::of(&parent),
            context.clone(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            0,
        );

        let child = manager
            .route
            .child_session(&manager.sys_context)
            .expect("child on the parent's route");
        assert_eq!(child.provider, parent.provider);
        assert_eq!(child.privacy_mode, crate::agent::PrivacyMode::Local);
        assert!(child.validate_privacy_boundary().is_ok());
    }

    #[test]
    fn a_subagent_refuses_to_start_when_the_route_leaves_the_parent_s_privacy_mode() {
        let route = InheritedRoute {
            model: "fixture-hosted-model".to_string(),
            provider: crate::models::Provider::Ollama(crate::models::OllamaMode::Cloud),
            privacy_mode: crate::agent::PrivacyMode::Local,
        };

        let error = route
            .child_session(&crate::context::gather_system_context())
            .expect_err("a Local parent's child must not run on a cloud route");
        let message = format!("{error:#}");
        assert!(
            message.contains("never leaves its parent's trust boundary"),
            "{message}"
        );
        assert!(message.contains("Local"), "{message}");
    }

    #[test]
    fn a_byok_session_s_subagent_keeps_the_parent_s_provider_and_privacy_mode() {
        let route = InheritedRoute {
            model: "fixture-hosted-model".to_string(),
            provider: crate::models::Provider::Ollama(crate::models::OllamaMode::Cloud),
            privacy_mode: crate::agent::PrivacyMode::Byok,
        };

        let child = route
            .child_session(&crate::context::gather_system_context())
            .expect("child on the parent's BYOK route");
        assert_eq!(
            child.provider,
            crate::models::Provider::Ollama(crate::models::OllamaMode::Cloud)
        );
        assert_eq!(child.privacy_mode, crate::agent::PrivacyMode::Byok);
    }

    fn root_manager() -> SubagentManager {
        SubagentManager::new(
            CliConfig::default(),
            local_route("fixture-local-model:latest"),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            0,
        )
    }

    #[tokio::test]
    async fn spawn_refused_once_the_session_spend_cap_is_reached() {
        let mut manager = root_manager();
        manager.set_cost_budget(Some(CostBudget::new(2.0, 2.0)));

        let err = manager
            .spawn("expensive", "do work")
            .await
            .expect_err("spawn with no budget left must be refused");
        assert!(
            err.to_string().contains("spend cap reached"),
            "unexpected error: {err}"
        );
        assert!(manager.list().await.is_empty());
    }

    #[test]
    fn a_child_is_capped_at_its_even_share_of_what_the_parent_has_left() {
        let mut manager = root_manager();
        manager.set_cost_budget(Some(CostBudget::new(7.0, 0.0)));
        let budget = manager.cost_budget.expect("budget was just set");
        let child = budget
            .child_cap_usd(manager.max_concurrent)
            .expect("a parent with headroom must yield a child cap");

        assert!((child - 1.0).abs() < 1e-12);
        assert!(child * manager.max_concurrent as f64 <= budget.remaining_usd() + 1e-12);
    }

    async fn seed_entry(manager: &SubagentManager, id: &str, status: SubagentStatus) {
        manager.entries.write().await.insert(
            id.to_string(),
            SubagentEntry {
                id: id.to_string(),
                role: GENERAL_PURPOSE_ROLE.to_string(),
                description: "seeded".to_string(),
                status: Arc::new(RwLock::new(status)),
                result: Arc::new(RwLock::new(None)),
                spent: Arc::new(RwLock::new(None)),
                handle: None,
                cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                abandoned: false,
            },
        );
    }

    #[test]
    fn a_child_that_failed_after_billable_requests_reports_what_it_spent() {
        let mut session = workflow_session(false);
        assert_eq!(
            SubagentUsage::from_unfinished_session("child-model", &session),
            None,
            "a child that made no request spent nothing"
        );

        session.total_input_tokens = 1_200;
        session.total_output_tokens = 80;
        session.total_cache_read_tokens = 600;
        session.cost_ledger.total_usd = 0.4;

        let usage = SubagentUsage::from_unfinished_session("child-model", &session)
            .expect("completed requests before the failure are known spend");
        assert_eq!(usage.model, "child-model");
        assert_eq!(usage.input_tokens, 1_200);
        assert_eq!(usage.output_tokens, 80);
        assert_eq!(usage.cache_read_tokens, 600);
        assert!((usage.cost_usd - 0.4).abs() < 1e-12);
    }

    #[tokio::test]
    async fn the_parent_can_read_what_a_failed_child_spent() {
        let manager = root_manager();
        seed_entry(
            &manager,
            "failed-child",
            SubagentStatus::Failed("refused".to_string()),
        )
        .await;
        let spent = SubagentUsage {
            model: "child-model".to_string(),
            input_tokens: 900,
            output_tokens: 40,
            cost_usd: 0.25,
            ..SubagentUsage::default()
        };
        *manager.entries.read().await["failed-child"]
            .spent
            .write()
            .await = Some(spent.clone());

        assert!(manager.get_result("failed-child").await.is_none());
        assert_eq!(manager.get_spent("failed-child").await, Some(spent));
        assert_eq!(manager.get_spent("never-spawned").await, None);
    }

    #[tokio::test]
    async fn a_panicked_child_settles_failed_without_changing_its_sibling() {
        let manager = root_manager();
        seed_entry(&manager, "panicked", SubagentStatus::Running).await;
        seed_entry(&manager, "sibling", SubagentStatus::Completed).await;
        manager
            .entries
            .write()
            .await
            .get_mut("panicked")
            .unwrap()
            .handle = Some(std::thread::spawn(|| panic!("owned child failure")));
        let statuses = manager.wait_all().await;
        assert!(statuses
            .iter()
            .any(|(id, status)| id == "panicked" && matches!(status, SubagentStatus::Failed(_))));
        assert!(matches!(
            manager.get_status("sibling").await,
            Some(SubagentStatus::Completed)
        ));
    }

    #[tokio::test]
    async fn a_spawn_past_the_concurrency_cap_is_refused() {
        let manager = root_manager();
        for index in 0..manager.max_concurrent {
            seed_entry(
                &manager,
                &format!("subagent_running_{index}"),
                SubagentStatus::Running,
            )
            .await;
        }

        let err = manager
            .spawn("one too many", "do work")
            .await
            .expect_err("a spawn past the cap must be refused");
        assert!(
            err.to_string()
                .contains("Maximum concurrent subagents reached"),
            "unexpected error: {err}"
        );
        assert_eq!(
            manager.list().await.len(),
            manager.max_concurrent,
            "the refused spawn left an entry behind"
        );
    }

    #[tokio::test]
    async fn spawn_refused_at_max_depth() {
        let manager = SubagentManager::new(
            CliConfig::default(),
            local_route("fixture-local-model:latest"),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            MAX_SUBAGENT_DEPTH,
        );

        let err = manager
            .spawn("nested", "do work")
            .await
            .expect_err("spawn at max depth must be refused");
        assert!(
            err.to_string().contains("nesting depth"),
            "unexpected error: {err}"
        );
        assert!(
            manager.list().await.is_empty(),
            "no subagent may be spawned once the depth cap is reached"
        );
    }

    #[tokio::test]
    async fn manager_shutdown_cancels_and_joins_background_threads() {
        let manager = SubagentManager::new(
            CliConfig::default(),
            local_route("fixture-local-model:latest"),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            0,
        );
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let worker_cancelled = cancelled.clone();
        let handle = thread::spawn(move || {
            while !worker_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                thread::sleep(std::time::Duration::from_millis(5));
            }
        });
        manager.entries.write().await.insert(
            "subagent-test".to_string(),
            SubagentEntry {
                id: "subagent-test".to_string(),
                role: GENERAL_PURPOSE_ROLE.to_string(),
                description: "shutdown sentinel".to_string(),
                status: Arc::new(RwLock::new(SubagentStatus::Running)),
                result: Arc::new(RwLock::new(None)),
                spent: Arc::new(RwLock::new(None)),
                handle: Some(handle),
                cancelled: cancelled.clone(),
                abandoned: false,
            },
        );

        manager.shutdown_all().await;

        assert!(cancelled.load(std::sync::atomic::Ordering::Acquire));
        let entries = manager.entries.read().await;
        let entry = entries.get("subagent-test").expect("tracked subagent");
        assert!(entry.handle.is_none());
        assert!(matches!(
            *entry.status.read().await,
            SubagentStatus::Cancelled
        ));
    }

    #[tokio::test]
    async fn wait_all_yields_so_an_aborted_turn_releases_its_session() {
        let manager = Arc::new(SubagentManager::new(
            CliConfig::default(),
            local_route("fixture-local-model:latest"),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
            0,
        ));
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let worker_cancelled = cancelled.clone();
        let handle = thread::spawn(move || {
            while !worker_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                thread::sleep(std::time::Duration::from_millis(5));
            }
        });
        manager.entries.write().await.insert(
            "subagent-test".to_string(),
            SubagentEntry {
                id: "subagent-test".to_string(),
                role: GENERAL_PURPOSE_ROLE.to_string(),
                description: "abort sentinel".to_string(),
                status: Arc::new(RwLock::new(SubagentStatus::Running)),
                result: Arc::new(RwLock::new(None)),
                spent: Arc::new(RwLock::new(None)),
                handle: Some(handle),
                cancelled: cancelled.clone(),
                abandoned: false,
            },
        );

        // Stands in for the app-server turn task, which holds the session
        // mutex across `send` and therefore across this wait.
        let waiter = Arc::clone(&manager);
        let turn = tokio::spawn(async move {
            waiter.wait_all().await;
        });
        tokio::time::sleep(SUBAGENT_JOIN_POLL_INTERVAL * 3).await;
        turn.abort();
        assert!(
            turn.await.is_err(),
            "wait_all must offer an await point for abort to land on, or the \
             turn task keeps the session mutex that teardown needs"
        );

        // The abort left the still-running thread tracked rather than detached.
        assert!(!cancelled.load(std::sync::atomic::Ordering::Acquire));
        assert!(manager
            .entries
            .read()
            .await
            .get("subagent-test")
            .expect("tracked subagent")
            .handle
            .is_some());

        manager.shutdown_all().await;
        assert!(cancelled.load(std::sync::atomic::Ordering::Acquire));
        assert!(manager
            .entries
            .read()
            .await
            .get("subagent-test")
            .expect("tracked subagent")
            .handle
            .is_none());
    }

    #[tokio::test]
    async fn a_child_still_running_at_the_limit_is_cancelled_and_reported_as_timed_out() {
        let manager = root_manager();
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let release = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stuck = release.clone();
        let handle = thread::spawn(move || {
            while !stuck.load(std::sync::atomic::Ordering::Acquire) {
                thread::sleep(std::time::Duration::from_millis(5));
            }
        });
        manager.entries.write().await.insert(
            "subagent-stuck".to_string(),
            SubagentEntry {
                id: "subagent-stuck".to_string(),
                role: GENERAL_PURPOSE_ROLE.to_string(),
                description: "never finishes".to_string(),
                status: Arc::new(RwLock::new(SubagentStatus::Running)),
                result: Arc::new(RwLock::new(None)),
                spent: Arc::new(RwLock::new(None)),
                handle: Some(handle),
                cancelled: cancelled.clone(),
                abandoned: false,
            },
        );

        let outcomes = manager
            .wait_all_within(std::time::Duration::from_millis(50))
            .await;
        assert!(cancelled.load(std::sync::atomic::Ordering::Acquire));
        match outcomes.as_slice() {
            [(id, SubagentStatus::Failed(message))] => {
                assert_eq!(id, "subagent-stuck");
                assert!(message.contains("Timed out"), "{message}");
            }
            other => panic!("the stuck child must be reported as timed out: {other:?}"),
        }

        let started = std::time::Instant::now();
        manager
            .wait_all_within(std::time::Duration::from_secs(30))
            .await;
        assert!(
            started.elapsed() < std::time::Duration::from_secs(5),
            "a later wait must not hold a turn for a child already given up on"
        );

        release.store(true, std::sync::atomic::Ordering::Release);
    }

    #[test]
    fn a_finished_child_charges_the_parent_for_its_own_children_too() {
        let mut session = workflow_session(false);
        let turn = |cost_usd| crate::agent::TurnResult {
            response: "done".to_string(),
            input_tokens: 10,
            output_tokens: 20,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            cost_usd,
            via_subscription: false,
            incomplete: None,
            managed_request_ids: vec!["child-1".to_string()],
            sources: Vec::new(),
        };
        session.cost_ledger.total_usd = 0.5;
        let settled = with_nested_spend(turn(0.2), &session);
        assert!((settled.cost_usd - 0.5).abs() < 1e-12);
        let usage = SubagentUsage::from_turn("child-model", &settled);
        assert!((usage.cost_usd - 0.5).abs() < 1e-12);
        assert_eq!(usage.managed_request_ids, vec!["child-1".to_string()]);

        session.cost_ledger.total_usd = 0.1;
        let own = with_nested_spend(turn(0.2), &session);
        assert!((own.cost_usd - 0.2).abs() < 1e-12);
    }

    #[tokio::test]
    async fn a_child_cancelled_at_the_limit_still_reports_what_it_spent() {
        let manager = root_manager();
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let spent: Arc<RwLock<Option<SubagentUsage>>> = Arc::new(RwLock::new(None));
        let worker_cancelled = cancelled.clone();
        let worker_spent = spent.clone();
        let usage = SubagentUsage {
            model: "child-model".to_string(),
            output_tokens: 500,
            cost_usd: 1.25,
            ..SubagentUsage::default()
        };
        let reported = usage.clone();
        let handle = thread::spawn(move || {
            while !worker_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                thread::sleep(std::time::Duration::from_millis(5));
            }
            thread::sleep(std::time::Duration::from_millis(300));
            *worker_spent.blocking_write() = Some(reported);
        });
        manager.entries.write().await.insert(
            "subagent-slow".to_string(),
            SubagentEntry {
                id: "subagent-slow".to_string(),
                role: GENERAL_PURPOSE_ROLE.to_string(),
                description: "settles late".to_string(),
                status: Arc::new(RwLock::new(SubagentStatus::Running)),
                result: Arc::new(RwLock::new(None)),
                spent,
                handle: Some(handle),
                cancelled: cancelled.clone(),
                abandoned: false,
            },
        );

        let outcomes = manager
            .wait_all_within(std::time::Duration::from_millis(50))
            .await;

        assert!(cancelled.load(std::sync::atomic::Ordering::Acquire));
        assert!(matches!(
            outcomes.as_slice(),
            [(_, SubagentStatus::Failed(message))] if message.contains("Timed out")
        ));
        assert_eq!(manager.get_spent("subagent-slow").await, Some(usage));
    }

    fn workflow_session(persisted: bool) -> crate::agent::AgentSession {
        let mut session = crate::agent::AgentSession::new(
            crate::model_catalog::default_model(),
            &crate::context::gather_system_context(),
            None,
        );
        if persisted {
            session.set_session_persistence(true);
            session.managed_session = Some(crate::runtime::session::ManagedSession::new(
                "workflow-parent",
                chrono::Utc::now(),
            ));
            session.managed_session_path = Some("workflow-parent.jsonl".into());
        }
        session
    }

    #[test]
    fn workflow_prompt_carries_the_goal_and_runs_stages_through_task() {
        let prompt = workflow_prompt("migrate the config loader to the new schema");
        assert!(prompt.contains("migrate the config loader to the new schema"));
        assert!(prompt.contains("`task`"));
        assert!(prompt.contains(&format!("at most {DEFAULT_MAX_CONCURRENT} steps per stage")));
    }

    #[test]
    fn workflow_runs_from_a_persisted_root_session() {
        assert_eq!(workflow_blocker(&workflow_session(true)), None);
    }

    #[test]
    fn workflow_needs_a_saved_session_to_own_its_steps() {
        let reason = workflow_blocker(&workflow_session(false)).expect("blocked");
        assert!(reason.contains("saved session"), "{reason}");
    }

    #[test]
    fn workflow_waits_for_an_approved_plan_in_plan_mode() {
        let mut session = workflow_session(true);
        session.permission_mode = crate::cli_options::PermissionMode::Plan;
        session.plan_mode = true;
        session.plan_approved = false;
        let reason = workflow_blocker(&session).expect("blocked");
        assert!(reason.contains("Plan mode"), "{reason}");

        session.plan_approved = true;
        session.plan_mode = false;
        assert_eq!(workflow_blocker(&session), None);
    }

    #[test]
    fn workflow_is_refused_at_the_subagent_nesting_limit() {
        let mut session = workflow_session(true);
        session.subagent_depth = MAX_SUBAGENT_DEPTH;
        let reason = workflow_blocker(&session).expect("blocked");
        assert!(reason.contains("nesting limit"), "{reason}");
    }

    #[test]
    fn workflow_is_refused_when_the_task_tool_is_disallowed() {
        let mut session = workflow_session(true);
        session.disallowed_tools.push("task".to_string());
        let reason = workflow_blocker(&session).expect("blocked");
        assert!(reason.contains("task tool"), "{reason}");
    }

    #[test]
    fn a_child_answer_cut_at_the_output_limit_reaches_the_parent_with_its_notice() {
        let notice = crate::errors::IncompleteTurnCause::OutputLimitReached.notice();
        let turn = |incomplete| crate::agent::TurnResult {
            response: "partial investigation".to_string(),
            input_tokens: 10,
            output_tokens: 20,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            cost_usd: 0.0,
            via_subscription: false,
            incomplete,
            managed_request_ids: Vec::new(),
            sources: Vec::new(),
        };
        let result = SubagentResult::from_turn(
            "child-1".to_string(),
            "fixture-model",
            turn(Some(crate::errors::IncompleteTurnCause::OutputLimitReached)),
            Vec::new(),
        );
        assert_eq!(result.output, "partial investigation");
        assert_eq!(result.usage.output_tokens, 20);
        let parent = result.tool_output();
        assert!(parent.contains("partial investigation"), "{parent}");
        assert!(parent.contains(&notice), "{parent}");
        let detail = format_task_detail(
            "child-1",
            "investigate",
            &SubagentStatus::Completed,
            Some(&result),
        );
        assert!(detail.contains(&notice), "{detail}");

        let complete = SubagentResult::from_turn(
            "child-2".to_string(),
            "fixture-model",
            turn(None),
            Vec::new(),
        );
        assert!(!complete.tool_output().contains("Incomplete answer"));
        let stored: SubagentResult = serde_json::from_str(
            r#"{"id":"old","output":"done","files_modified":[],"usage":{"model":"","input_tokens":0,"output_tokens":0,"cache_read_tokens":0,"cache_creation_tokens":0,"cost_usd":0.0,"via_subscription":false}}"#,
        )
        .expect("a result saved before the notice existed");
        assert_eq!(stored.incomplete, None);
    }
}
