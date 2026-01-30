//! Modular Tool Executor Architecture
//!
//! This module provides a trait-based system for executing AGI tools.
//! Each tool category has its own executor implementing the `ToolExecutor` trait.
//!
//! # Architecture
//!
//! ```text
//! AGIExecutor
//!     └── ExecutorRegistry
//!             ├── FileExecutor (file_read, file_write, file_delete)
//!             ├── UiExecutor (ui_screenshot, ui_click, ui_type)
//!             ├── BrowserExecutor (browser_navigate, browser_click, browser_extract)
//!             ├── DatabaseExecutor (db_query, db_execute, db_transaction_*)
//!             ├── GitExecutor (git_status, git_init, git_add, git_commit, git_push, git_clone)
//!             ├── EmailExecutor (email_send, email_fetch)
//!             ├── CalendarExecutor (calendar_create_event, calendar_list_events)
//!             ├── CloudExecutor (cloud_upload, cloud_download)
//!             ├── SearchExecutor (search_web)
//!             ├── TerminalExecutor (terminal_execute)
//!             ├── CodeExecutor (code_execute, code_analyze)
//!             ├── ApiExecutor (api_call, api_upload, api_download)
//!             ├── LlmExecutor (llm_reason)
//!             ├── ProductivityExecutor (productivity_*, document_*)
//!             ├── OcrExecutor (ocr_extract, ocr_analyze)
//!             ├── OutcomeExecutor (measure_false_positive_rate, measure_tests_passed, measure_outcome, track_outcome, get_success_rate, measure_all_outcomes)
//!             └── McpExecutor (mcp__*__* - dynamic MCP tools)
//! ```

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;

use crate::automation::AutomationService;
use crate::core::agent::ChangeTracker;
use crate::core::agi::ExecutionContext;
use crate::core::llm::LLMRouter;
use crate::core::mcp::McpClient;
use crate::data::cache::ToolResultCache;
use crate::sys::security::ToolExecutionGuard;

mod api_executor;
mod browser_executor;
mod calendar_executor;
mod cloud_executor;
mod code_executor;
mod database_executor;
mod email_executor;
mod file_executor;
pub mod git_executor;
mod llm_executor;
mod mcp_executor;
mod ocr_executor;
mod outcome_executor;
mod productivity_executor;
mod search_executor;
mod terminal_executor;
mod ui_executor;

#[cfg(test)]
mod tests;

pub use api_executor::ApiExecutor;
pub use browser_executor::BrowserExecutor;
pub use calendar_executor::CalendarExecutor;
pub use cloud_executor::CloudExecutor;
pub use code_executor::CodeExecutor;
pub use database_executor::DatabaseExecutor;
pub use email_executor::EmailExecutor;
pub use file_executor::FileExecutor;
pub use git_executor::{
    BranchDiffSummary, CommitSummary, ConflictHunk, ConflictParser, ConflictResolver,
    ConflictSuggestion, FileConflict, FileDiffStat, GeneratedPrContent, GitExecutor,
    HunkResolution, PrCreationConfig, PrCreationError, PrCreationResult, PrCreationWorkflow,
    ResolutionResult, ResolutionStrategy,
};
pub use llm_executor::LlmExecutor;
pub use mcp_executor::{McpExecutor, McpExecutorExt, McpExecutorStats, McpToolResult};
pub use ocr_executor::OcrExecutor;
pub use outcome_executor::{OutcomeExecutor, OutcomeMeasurement, OutcomeSummary};
pub use productivity_executor::ProductivityExecutor;
pub use search_executor::SearchExecutor;
pub use terminal_executor::TerminalExecutor;
pub use ui_executor::UiExecutor;

/// Shared context passed to all executors
pub struct ExecutorContext {
    pub app_handle: Option<tauri::AppHandle>,
    pub automation: Arc<AutomationService>,
    pub router: Arc<tokio::sync::RwLock<LLMRouter>>,
    pub tool_cache: Arc<ToolResultCache>,
    pub security_guard: Arc<ToolExecutionGuard>,
    pub change_tracker: Option<Arc<ChangeTracker>>,
    pub session_id: String,
    pub tool_id: String,
}

impl ExecutorContext {
    /// Get allowed directories for file operations
    pub fn get_allowed_directories(&self) -> Vec<std::path::PathBuf> {
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            if let Some(settings_state) =
                app.try_state::<crate::sys::commands::settings::SettingsState>()
            {
                if let Ok(settings) = settings_state.settings.try_lock() {
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
        // Note: We canonicalize paths to resolve symlinks (e.g., /var -> /private/var on macOS)
        let mut defaults = Vec::new();

        if let Some(home) = dirs::home_dir() {
            if let Ok(canonical) = std::fs::canonicalize(&home) {
                defaults.push(canonical);
            } else {
                defaults.push(home);
            }
        }

        if let Ok(cwd) = std::env::current_dir() {
            if let Ok(canonical) = std::fs::canonicalize(&cwd) {
                defaults.push(canonical);
            } else {
                defaults.push(cwd);
            }
        }

        // Canonicalize temp_dir to handle symlinks like /var -> /private/var on macOS
        let temp = std::env::temp_dir();
        if let Ok(canonical) = std::fs::canonicalize(&temp) {
            defaults.push(canonical);
        } else {
            defaults.push(temp);
        }

        defaults
    }

    /// Emit tool progress event
    ///
    /// # Arguments
    /// * `message` - Human-readable progress message
    /// * `progress` - Optional progress value between 0.0 and 1.0
    pub fn emit_progress(&self, message: &str, progress: Option<f32>) {
        if let Some(ref app_handle) = self.app_handle {
            crate::ui::events::tool_stream::emit_tool_progress(
                app_handle,
                &self.tool_id,
                progress.unwrap_or(0.0),
                Some(message),
            );
        }
    }

    /// Emit tool error event
    ///
    /// # Arguments
    /// * `error` - Error message
    /// * `start_time` - When the tool execution started (for duration calculation)
    /// * `recoverable` - Whether the error is recoverable/retryable
    pub fn emit_error(&self, error: &str, start_time: std::time::Instant, recoverable: bool) {
        if let Some(ref app_handle) = self.app_handle {
            crate::ui::events::tool_stream::emit_tool_error(
                app_handle,
                &self.tool_id,
                error,
                start_time.elapsed().as_millis() as u64,
                recoverable,
            );
        }
    }

    /// Emit tool completed event
    ///
    /// # Arguments
    /// * `result` - The result value to emit
    /// * `start_time` - When the tool execution started (for duration calculation)
    pub fn emit_completed(&self, result: &JsonValue, start_time: std::time::Instant) {
        if let Some(ref app_handle) = self.app_handle {
            crate::ui::events::tool_stream::emit_tool_completed(
                app_handle,
                &self.tool_id,
                result.clone(),
                start_time.elapsed().as_millis() as u64,
            );
        }
    }
}

/// Trait for executing tools in a specific category
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// Returns the list of tool names this executor handles
    fn tool_names(&self) -> Vec<&'static str>;

    /// Executes a tool with the given parameters
    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<JsonValue>;

    /// Returns a description of this executor
    fn description(&self) -> &'static str;
}

/// Registry of all tool executors
pub struct ExecutorRegistry {
    executors: HashMap<String, Arc<dyn ToolExecutor>>,
    /// MCP executor for dynamic MCP tools (mcp__server__tool format)
    mcp_executor: Option<Arc<McpExecutor>>,
}

impl ExecutorRegistry {
    /// Creates a new registry with all executors registered
    pub fn new(
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
    ) -> Self {
        let mut executors: HashMap<String, Arc<dyn ToolExecutor>> = HashMap::new();

        // Register all executors
        let file_exec: Arc<dyn ToolExecutor> = Arc::new(FileExecutor::new());
        for name in file_exec.tool_names() {
            executors.insert(name.to_string(), file_exec.clone());
        }

        let ui_exec: Arc<dyn ToolExecutor> = Arc::new(UiExecutor::new(automation.clone()));
        for name in ui_exec.tool_names() {
            executors.insert(name.to_string(), ui_exec.clone());
        }

        let browser_exec: Arc<dyn ToolExecutor> =
            Arc::new(BrowserExecutor::new(automation.clone()));
        for name in browser_exec.tool_names() {
            executors.insert(name.to_string(), browser_exec.clone());
        }

        let db_exec: Arc<dyn ToolExecutor> = Arc::new(DatabaseExecutor::new());
        for name in db_exec.tool_names() {
            executors.insert(name.to_string(), db_exec.clone());
        }

        let git_exec: Arc<dyn ToolExecutor> = Arc::new(GitExecutor::new());
        for name in git_exec.tool_names() {
            executors.insert(name.to_string(), git_exec.clone());
        }

        let email_exec: Arc<dyn ToolExecutor> = Arc::new(EmailExecutor::new());
        for name in email_exec.tool_names() {
            executors.insert(name.to_string(), email_exec.clone());
        }

        let calendar_exec: Arc<dyn ToolExecutor> = Arc::new(CalendarExecutor::new());
        for name in calendar_exec.tool_names() {
            executors.insert(name.to_string(), calendar_exec.clone());
        }

        let cloud_exec: Arc<dyn ToolExecutor> = Arc::new(CloudExecutor::new());
        for name in cloud_exec.tool_names() {
            executors.insert(name.to_string(), cloud_exec.clone());
        }

        let search_exec: Arc<dyn ToolExecutor> = Arc::new(SearchExecutor::new());
        for name in search_exec.tool_names() {
            executors.insert(name.to_string(), search_exec.clone());
        }

        let terminal_exec: Arc<dyn ToolExecutor> = Arc::new(TerminalExecutor::new());
        for name in terminal_exec.tool_names() {
            executors.insert(name.to_string(), terminal_exec.clone());
        }

        let code_exec: Arc<dyn ToolExecutor> = Arc::new(CodeExecutor::new());
        for name in code_exec.tool_names() {
            executors.insert(name.to_string(), code_exec.clone());
        }

        let api_exec: Arc<dyn ToolExecutor> = Arc::new(ApiExecutor::new());
        for name in api_exec.tool_names() {
            executors.insert(name.to_string(), api_exec.clone());
        }

        let llm_exec: Arc<dyn ToolExecutor> = Arc::new(LlmExecutor::new(router));
        for name in llm_exec.tool_names() {
            executors.insert(name.to_string(), llm_exec.clone());
        }

        let productivity_exec: Arc<dyn ToolExecutor> = Arc::new(ProductivityExecutor::new());
        for name in productivity_exec.tool_names() {
            executors.insert(name.to_string(), productivity_exec.clone());
        }

        let ocr_exec: Arc<dyn ToolExecutor> = Arc::new(OcrExecutor::new());
        for name in ocr_exec.tool_names() {
            executors.insert(name.to_string(), ocr_exec.clone());
        }

        let outcome_exec: Arc<dyn ToolExecutor> = Arc::new(OutcomeExecutor::new());
        for name in outcome_exec.tool_names() {
            executors.insert(name.to_string(), outcome_exec.clone());
        }

        Self {
            executors,
            mcp_executor: None,
        }
    }

    /// Creates a new registry with MCP support.
    ///
    /// This constructor creates the registry with an MCP executor that can
    /// handle dynamic tools from connected MCP servers.
    ///
    /// # Arguments
    ///
    /// * `automation` - The automation service for UI/browser operations
    /// * `router` - The LLM router for reasoning operations
    /// * `mcp_client` - The MCP client for server communication
    pub fn with_mcp(
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        mcp_client: Arc<McpClient>,
    ) -> Self {
        let mut registry = Self::new(automation, router);
        let mcp_exec = Arc::new(McpExecutor::new(mcp_client));
        registry.mcp_executor = Some(mcp_exec);
        registry
    }

    /// Sets the MCP executor for dynamic tool support.
    ///
    /// # Arguments
    ///
    /// * `mcp_client` - The MCP client for server communication
    pub fn set_mcp_client(&mut self, mcp_client: Arc<McpClient>) {
        self.mcp_executor = Some(Arc::new(McpExecutor::new(mcp_client)));
    }

    /// Gets the MCP executor if available.
    pub fn get_mcp_executor(&self) -> Option<Arc<McpExecutor>> {
        self.mcp_executor.clone()
    }

    /// Gets an executor for a given tool name.
    ///
    /// For MCP tools (prefixed with `mcp__`), this routes to the MCP executor.
    /// For other tools, it looks up the registered executor by name.
    pub fn get_executor(&self, tool_name: &str) -> Option<Arc<dyn ToolExecutor>> {
        // Check if this is an MCP tool (mcp__server__tool format)
        if McpExecutor::is_mcp_tool(tool_name) {
            return self
                .mcp_executor
                .clone()
                .map(|e| e as Arc<dyn ToolExecutor>);
        }

        // Otherwise, look up in the static executor registry
        self.executors.get(tool_name).cloned()
    }

    /// Returns all registered static tool names.
    ///
    /// Note: This does not include dynamic MCP tools. Use `all_tool_names()`
    /// to get both static and dynamic tool names.
    pub fn tool_names(&self) -> Vec<&str> {
        self.executors.keys().map(|s| s.as_str()).collect()
    }

    /// Returns all tool names including dynamic MCP tools.
    ///
    /// This combines static tool names with dynamically discovered MCP tools.
    pub fn all_tool_names(&self) -> Vec<String> {
        let mut names: Vec<String> = self.executors.keys().map(|s| s.to_string()).collect();

        // Add MCP tools if executor is available
        if let Some(ref mcp_exec) = self.mcp_executor {
            names.extend(mcp_exec.get_available_tools());
        }

        names
    }

    /// Returns the number of registered executors.
    pub fn executor_count(&self) -> usize {
        // Count unique executors (not tool names)
        let mut unique: std::collections::HashSet<_> =
            self.executors.values().map(|e| e.description()).collect();

        // Add MCP executor if present
        if self.mcp_executor.is_some() {
            unique.insert("MCP Executor");
        }

        unique.len()
    }

    /// Checks if the registry has MCP support enabled.
    pub fn has_mcp_support(&self) -> bool {
        self.mcp_executor.is_some()
    }

    /// Refreshes the MCP tool cache.
    ///
    /// Call this when MCP servers connect or disconnect to update
    /// the available tools list.
    pub fn refresh_mcp_tools(&self) {
        if let Some(ref mcp_exec) = self.mcp_executor {
            mcp_exec.refresh_tool_cache();
        }
    }

    /// Gets statistics from the MCP executor.
    pub fn get_mcp_stats(&self) -> Option<McpExecutorStats> {
        self.mcp_executor.as_ref().map(|e| e.get_stats())
    }
}

impl McpExecutorExt for ExecutorRegistry {
    fn register_mcp_executor(&mut self, executor: Arc<McpExecutor>) {
        self.mcp_executor = Some(executor);
    }

    fn is_mcp_routed(&self, tool_name: &str) -> bool {
        McpExecutor::is_mcp_tool(tool_name) && self.mcp_executor.is_some()
    }
}

// Note: Executor tests are located in the tests/ subdirectory:
// - tests/file_executor_tests.rs
// - tests/git_executor_tests.rs
// - tests/database_executor_tests.rs
