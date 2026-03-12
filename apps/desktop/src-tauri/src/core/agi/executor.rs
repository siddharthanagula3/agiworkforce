use super::*;
use crate::automation::AutomationService;
use crate::core::agent::ChangeTracker;
use crate::core::agi::executors::{ExecutorContext, ExecutorRegistry};
use crate::core::agi::outcome_tracker::OutcomeTracker;
use crate::core::agi::planner::PlanStep;
use crate::core::agi::process_reasoning::ProcessReasoning;
use crate::core::agi::reflection::ReflectionEngine;
use crate::core::llm::LLMRouter;
use crate::data::cache::ToolResultCache;
use crate::sys::security::ToolExecutionGuard;
use crate::ui::events::tool_stream::{emit_tool_completed, emit_tool_error, emit_tool_started};
use anyhow::{anyhow, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

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
/// - `EmailExecutor`: email_send, email_fetch
/// - `CalendarExecutor`: calendar_create_event, calendar_list_events
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
    automation: Arc<AutomationService>,
    router: Arc<tokio::sync::RwLock<LLMRouter>>,
    app_handle: Option<tauri::AppHandle>,
    tool_cache: Arc<ToolResultCache>,
    process_reasoning: Option<Arc<ProcessReasoning>>,
    outcome_tracker: Option<Arc<OutcomeTracker>>,
    reflection_engine: Option<Arc<ReflectionEngine>>,
    security_guard: Arc<ToolExecutionGuard>,
    change_tracker: Option<Arc<ChangeTracker>>,
    executor_registry: ExecutorRegistry,
}

impl AGIExecutor {
    /// Creates a new AGIExecutor with default settings.
    ///
    /// # Arguments
    ///
    /// * `tool_registry` - Registry of available AGI tools
    /// * `resource_manager` - Manager for resource limits
    /// * `automation` - Automation service for UI/browser operations
    /// * `router` - LLM router for reasoning operations
    /// * `app_handle` - Optional Tauri app handle for UI events
    /// * `change_tracker` - Optional tracker for undo capability
    pub fn new(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        reflection_engine: Option<Arc<ReflectionEngine>>,
        change_tracker: Option<Arc<ChangeTracker>>,
    ) -> Result<Self> {
        let executor_registry = ExecutorRegistry::new(automation.clone(), router.clone());

        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            automation,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::new()),
            process_reasoning: None,
            outcome_tracker: None,
            reflection_engine,
            security_guard: Arc::new(ToolExecutionGuard::new()),
            change_tracker,
            executor_registry,
        })
    }

    /// Creates an AGIExecutor with process reasoning capabilities.
    ///
    /// This constructor enables outcome tracking and process type identification,
    /// allowing the executor to learn from execution patterns.
    pub fn with_process_reasoning(
        tool_registry: Arc<ToolRegistry>,
        resource_manager: Arc<ResourceManager>,
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        process_reasoning: Arc<ProcessReasoning>,
        outcome_tracker: Arc<OutcomeTracker>,
        reflection_engine: Option<Arc<ReflectionEngine>>,
        change_tracker: Option<Arc<ChangeTracker>>,
    ) -> Result<Self> {
        let executor_registry = ExecutorRegistry::new(automation.clone(), router.clone());

        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            automation,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::new()),
            process_reasoning: Some(process_reasoning),
            outcome_tracker: Some(outcome_tracker),
            reflection_engine,
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
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        app_handle: Option<tauri::AppHandle>,
        cache_size_bytes: usize,
        change_tracker: Option<Arc<ChangeTracker>>,
    ) -> Result<Self> {
        let executor_registry = ExecutorRegistry::new(automation.clone(), router.clone());

        Ok(Self {
            tool_registry,
            _resource_manager: resource_manager,
            automation,
            router,
            app_handle,
            tool_cache: Arc::new(ToolResultCache::with_capacity(cache_size_bytes)),
            process_reasoning: None,
            outcome_tracker: None,
            reflection_engine: None,
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

    /// Get the list of allowed directories for file operations.
    ///
    /// This is used to prevent path traversal attacks by ensuring all file
    /// operations are restricted to explicitly allowed directories.
    ///
    /// Returns an empty Vec if no restrictions are configured (backwards compatibility),
    /// which will trigger a security warning but allow access.
    ///
    // Used by: fallback tools not yet migrated to ExecutorRegistry
    #[allow(dead_code)]
    fn get_allowed_directories(&self) -> Vec<std::path::PathBuf> {
        // Try to get allowed directories from settings via app_handle
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            // Try to get from settings state if available
            if let Some(settings_state) =
                app.try_state::<crate::sys::commands::settings::SettingsState>()
            {
                if let Ok(settings) = settings_state.settings.try_lock() {
                    // Return allowed directories from settings if configured and non-empty
                    if !settings.allowed_directories.is_empty() {
                        return settings
                            .allowed_directories
                            .iter()
                            .filter_map(|p| std::fs::canonicalize(p).ok())
                            .collect();
                    }
                }
            }
        }

        // Fallback: Return common safe directories as defaults
        // This provides reasonable security while maintaining backwards compatibility
        let mut defaults = Vec::new();

        // User's home directory
        if let Some(home) = dirs::home_dir() {
            defaults.push(home);
        }

        // Current working directory
        if let Ok(cwd) = std::env::current_dir() {
            defaults.push(cwd);
        }

        // Temp directory (for sandbox operations)
        defaults.push(std::env::temp_dir());

        defaults
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
        let tool_id = format!("{}_{}", tool_name, &session_id[..8]);
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

        // Emit pre-tool-use hook
        crate::ui::hooks::emit_event(crate::ui::hooks::HookEvent::pre_tool_use(
            session_id.clone(),
            tool_name.to_string(),
            tool_name.to_string(),
            parameters.clone(),
        ))
        .await;

        // Security validation
        let params_json = serde_json::to_value(parameters)?;
        if let Err(e) = self
            .security_guard
            .validate_tool_call(tool_name, &params_json)
            .await
        {
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
                automation: self.automation.clone(),
                router: self.router.clone(),
                tool_cache: self.tool_cache.clone(),
                security_guard: self.security_guard.clone(),
                change_tracker: self.change_tracker.clone(),
                session_id: session_id.clone(),
                tool_id: tool_id.clone(),
            };

            executor
                .execute(tool_name, parameters, &exec_context, context)
                .await
        } else {
            // Fallback for tools not yet migrated to the registry
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

            // Common file operation aliases — redirect to the registered FileExecutor
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

            // Common shell/terminal aliases — redirect to the registered TerminalExecutor
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

            // Common code analysis aliases — redirect to the registered CodeExecutor
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

            // Common web/API aliases — redirect to the registered ApiExecutor
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

        for plan in plans {
            let tool_registry = self.tool_registry.clone();
            let automation = self.automation.clone();
            let router = self.router.clone();
            let tool_cache = self.tool_cache.clone();

            let sandbox = sandbox_manager.create_sandbox(false).await?;
            let sandbox_id = sandbox.id.clone();
            let plan_id = plan.goal_id.clone();
            let goal_clone = goal.clone();

            let app_handle = self.app_handle.clone();

            let handle = tokio::spawn(async move {
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

                let process_reasoning = match ProcessReasoning::new(router.clone()) {
                    Ok(pr) => pr,
                    Err(e) => {
                        tracing::error!("[Executor] Failed to create ProcessReasoning: {}", e);
                        return crate::core::agi::ExecutionResult {
                            plan_id,
                            sandbox_id,
                            success: false,
                            steps_completed: 0,
                            steps_failed: 1,
                            output: serde_json::json!({}),
                            error: Some(format!("Failed to create ProcessReasoning: {}", e)),
                            execution_time_ms: start_time.elapsed().as_millis() as u64,
                            cost: None,
                        };
                    }
                };

                let outcome_tracker =
                    match OutcomeTracker::new("outcome_tracker_parallel.db".to_string()) {
                        Ok(ot) => ot,
                        Err(e) => {
                            tracing::error!("[Executor] Failed to create OutcomeTracker: {}", e);
                            return crate::core::agi::ExecutionResult {
                                plan_id,
                                sandbox_id,
                                success: false,
                                steps_completed: 0,
                                steps_failed: 1,
                                output: serde_json::json!({}),
                                error: Some(format!("Failed to create OutcomeTracker: {}", e)),
                                execution_time_ms: start_time.elapsed().as_millis() as u64,
                                cost: None,
                            };
                        }
                    };

                let mut executor = match AGIExecutor::with_process_reasoning(
                    tool_registry,
                    Arc::new(resource_manager),
                    automation,
                    router.clone(),
                    app_handle,
                    Arc::new(process_reasoning),
                    Arc::new(outcome_tracker),
                    None, // No reflection engine for parallel sub-tasks for now
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
            });

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

    /// Executes a goal with outcome tracking.
    ///
    /// This method identifies the process type, defines expected outcomes,
    /// executes the plan, and tracks whether outcomes were achieved.
    pub async fn execute_goal_with_outcomes(
        &self,
        goal: &Goal,
        plan: &planner::Plan,
        context: &ExecutionContext,
    ) -> Result<ExecutionResultWithOutcomes> {
        use tokio::time::Instant;

        let start_time = Instant::now();

        // Identify process type if process reasoning is available
        let process_type = if let Some(ref pr) = self.process_reasoning {
            match pr.identify_process_type(goal).await {
                Ok(pt) => {
                    tracing::info!(
                        "[Executor] Identified process type: {:?} for goal {}",
                        pt,
                        goal.id
                    );
                    Some(pt)
                }
                Err(e) => {
                    tracing::warn!("[Executor] Failed to identify process type: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // Define expected outcomes based on process type
        let expected_outcomes =
            if let (Some(pt), Some(ref pr)) = (process_type, &self.process_reasoning) {
                pr.define_outcomes(pt, goal)
            } else {
                vec![]
            };

        // Execute the plan
        let mut steps_completed = 0;
        let mut steps_failed = 0;
        let mut output = serde_json::json!({});
        let mut error_msg = None;

        for step in &plan.steps {
            match self.execute_step(step, context).await {
                Ok(result) => {
                    steps_completed += 1;
                    output = result;

                    // REFLECTION POINT: Success
                    if let Some(ref _reflection) = self.reflection_engine {
                        // We could also reflect on success to optimize future runs,
                        // but prioritizing failure for now.
                        tracing::debug!("[Executor] Step {} succeeded", step.id);
                    }
                }
                Err(e) => {
                    steps_failed += 1;
                    error_msg = Some(e.to_string());
                    tracing::error!("[Executor] Step execution failed: {}", e);

                    // REFLECTION POINT: Failure
                    if let Some(ref reflection) = self.reflection_engine {
                        tracing::info!(
                            "[Executor] Triggering reflection for failed step: {}",
                            step.id
                        );

                        // Create a synthetic plan for reflection context since we don't have the full object here
                        let plan = planner::Plan {
                            goal_id: goal.id.clone(),
                            steps: vec![], // Placeholder
                            estimated_duration: std::time::Duration::from_secs(0),
                            estimated_resources: crate::core::agi::ResourceUsage {
                                cpu_percent: 0.0,
                                memory_mb: 0,
                                network_mb: 0.0,
                            },
                        };

                        match reflection.reflect(goal, context, &plan).await {
                            Ok(insight) => {
                                tracing::info!("[Executor] Reflection Insight: {:?}", insight);

                                // Log actionable corrections from the reflection
                                for correction in &insight.corrections {
                                    tracing::info!(
                                        "[Executor] Correction for step '{}': {:?} — {}",
                                        correction.for_step_id,
                                        correction.correction_type,
                                        correction.description,
                                    );
                                }

                                // Log derived sub-goals for future planning
                                for sub_goal in &insight.sub_goals {
                                    tracing::info!(
                                        "[Executor] Sub-goal derived: {} (priority: {})",
                                        sub_goal.description,
                                        sub_goal.priority,
                                    );
                                }

                                // Store the reflection for future use
                                if let Err(store_err) = reflection.store_reflection(&insight).await
                                {
                                    tracing::warn!(
                                        "[Executor] Failed to store reflection: {}",
                                        store_err
                                    );
                                }
                            }
                            Err(re) => {
                                tracing::warn!("[Executor] Reflection failed: {}", re);
                            }
                        }
                    }

                    break;
                }
            }
        }

        let execution_time_ms = start_time.elapsed().as_millis() as u64;
        let success = steps_failed == 0 && steps_completed > 0;

        // Track outcomes
        let mut tracked_outcomes = vec![];
        if let Some(ref tracker) = self.outcome_tracker {
            for mut outcome in expected_outcomes {
                let actual_value = self.measure_outcome(&outcome, context).await?;
                outcome.actual_value = Some(actual_value);

                outcome.achieved = match outcome.metric_name.as_str() {
                    // For time-based metrics, lower is better
                    "processing_time" | "response_time" | "deployment_time" => {
                        actual_value <= outcome.target_value
                    }

                    // For quality metrics, higher is better
                    "data_accuracy" | "response_quality" | "test_coverage" | "completion_rate" => {
                        actual_value >= outcome.target_value
                    }

                    // For count metrics, higher is better
                    "invoices_processed" | "tickets_resolved" | "records_processed" => {
                        actual_value >= outcome.target_value
                    }

                    // For error rate metrics, lower is better
                    "false_positive_rate" | "rollback_needed" => {
                        actual_value <= outcome.target_value
                    }

                    // Default: higher is better
                    _ => actual_value >= outcome.target_value,
                };

                if let Err(e) = tracker.track_outcome(goal.id.clone(), outcome.clone()) {
                    tracing::warn!("[Executor] Failed to track outcome: {}", e);
                } else {
                    tracked_outcomes.push(outcome);
                }
            }
        }

        // Calculate outcome score
        let outcome_score = if let Some(ref pr) = self.process_reasoning {
            process_type.map(|pt| pr.evaluate_outcome(pt, &tracked_outcomes, context))
        } else {
            None
        };

        Ok(ExecutionResultWithOutcomes {
            success,
            output,
            execution_time_ms,
            steps_completed,
            steps_failed,
            error: error_msg,
            process_type,
            tracked_outcomes,
            outcome_score,
        })
    }

    /// Measures the actual value of an outcome metric.
    async fn measure_outcome(
        &self,
        outcome: &crate::core::agi::process_reasoning::Outcome,
        context: &ExecutionContext,
    ) -> Result<f64> {
        match outcome.metric_name.as_str() {
            // Time-based metrics: sum of execution times
            "processing_time" | "response_time" | "deployment_time" => {
                let total_time_ms: u64 = context
                    .tool_results
                    .iter()
                    .map(|r| r.execution_time_ms)
                    .sum();
                Ok(total_time_ms as f64 / 1000.0)
            }

            // Accuracy metrics: success rate
            "data_accuracy" | "categorization_accuracy" | "response_quality" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }

            // Count metrics: number of successful operations
            "invoices_processed" | "tickets_resolved" | "records_processed"
            | "emails_categorized" | "leads_scored" | "posts_scheduled" => {
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64)
            }

            // Coverage metrics: success rate
            "test_coverage" | "documentation_completeness" | "completion_rate" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }

            // Error rate metrics: failure rate
            "false_positive_rate" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let failed = context.tool_results.iter().filter(|r| !r.success).count();
                Ok(failed as f64 / total as f64)
            }

            // Binary metrics: all succeeded or not
            "deployment_success" | "rollback_needed" => {
                let all_succeeded = context.tool_results.iter().all(|r| r.success);
                Ok(if all_succeeded { 1.0 } else { 0.0 })
            }

            // Test pass rate
            "tests_passed" => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let passed = context.tool_results.iter().filter(|r| r.success).count();
                Ok(passed as f64 / total as f64)
            }

            // Default: success rate
            _ => {
                let total = context.tool_results.len();
                if total == 0 {
                    return Ok(0.0);
                }
                let successful = context.tool_results.iter().filter(|r| r.success).count();
                Ok(successful as f64 / total as f64)
            }
        }
    }
}

/// Result of executing a goal with outcome tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResultWithOutcomes {
    /// Whether the execution succeeded overall.
    pub success: bool,
    /// The output from the final step.
    pub output: serde_json::Value,
    /// Total execution time in milliseconds.
    pub execution_time_ms: u64,
    /// Number of steps completed successfully.
    pub steps_completed: usize,
    /// Number of steps that failed.
    pub steps_failed: usize,
    /// Error message if execution failed.
    pub error: Option<String>,
    /// Identified process type (if process reasoning was enabled).
    pub process_type: Option<crate::core::agi::ProcessType>,
    /// Outcomes that were tracked during execution.
    pub tracked_outcomes: Vec<crate::core::agi::process_reasoning::Outcome>,
    /// Overall outcome score (if process reasoning was enabled).
    pub outcome_score: Option<crate::core::agi::process_reasoning::OutcomeScore>,
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
