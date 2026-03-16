mod api_tools;
mod browser_tools;
mod code_tools;
mod communication_tools;
mod db_tools;
mod document_tools;
mod edit_tools;
mod file_tools;
mod git_tools;
pub(crate) mod interactive_tools;
mod llm_tools;
mod mcp_tools;
mod media_tools;
mod memory_tools;
mod planning_tools;
mod scheduler_tools;
mod search_tools;
mod terminal_tools;
mod ui_automation_tools;

#[cfg(test)]
mod tests;

use crate::core::agi::tools::{Tool, ToolRegistry, ToolResult};
use crate::core::llm::job_autofill_runtime::build_job_autofill_eval_script;
use crate::core::llm::{ToolCall, ToolDefinition};
use crate::sys::commands::chat::{has_pending_messages, peek_pending_messages};
use crate::sys::commands::settings::SettingsState;
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::commands::undo::UndoState;
use crate::sys::security::ToolSafetyTier;
use crate::ui::events::tool_stream::{
    emit_tool_completed, emit_tool_error, emit_tool_output_chunk, emit_tool_progress,
    emit_tool_started, OutputChunkType,
};
use crate::ui::events::{
    create_file_delete_event, create_file_read_event, create_file_write_event, emit_file_operation,
    emit_terminal_command, TerminalCommand,
};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, Manager};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{timeout, Duration as TokioDuration};
use uuid::Uuid;

/// Default timeout for tool confirmation dialogs (in seconds)
const TOOL_CONFIRMATION_TIMEOUT_SECS: u64 = 120;

/// Per-tool timeout configuration in milliseconds
/// Different tool types have different timeout requirements:
/// - Fast tools (search, web): 10-30 seconds
/// - Medium tools (file ops, git): 30-60 seconds
/// - Slow tools (browser, media, code): 60-300 seconds
pub struct ToolTimeoutConfig {
    /// Default timeout for all tools (ms)
    pub default: u64,
    /// Fast tools: search, web fetch, API calls (ms)
    pub fast: u64,
    /// Medium tools: file operations, git, database (ms)
    pub medium: u64,
    /// Slow tools: browser automation, media generation, code execution (ms)
    pub slow: u64,
    /// Very slow tools: video generation, large downloads (ms)
    pub very_slow: u64,
}

impl Default for ToolTimeoutConfig {
    fn default() -> Self {
        Self {
            default: 60_000,    // 60 seconds
            fast: 15_000,       // 15 seconds - search, web, API
            medium: 60_000,     // 60 seconds - file ops, git, db
            slow: 180_000,      // 3 minutes - browser, media, code
            very_slow: 300_000, // 5 minutes - video, large uploads
        }
    }
}

impl ToolTimeoutConfig {
    /// Get timeout for a specific tool
    pub fn get_timeout(&self, tool_id: &str) -> u64 {
        match tool_id {
            // Fast tools (15s)
            "search_web" | "api_call" | "web_fetch" | "llm_reason" | "code_search"
            | "grep_search" | "glob_search" => self.fast,

            // Medium tools (60s)
            "file_read"
            | "file_write"
            | "file_delete"
            | "file_list"
            | "git_status"
            | "git_init"
            | "git_add"
            | "git_commit"
            | "git_clone"
            | "db_query"
            | "db_execute"
            | "db_transaction_begin"
            | "db_transaction_commit"
            | "db_transaction_rollback"
            | "multi_edit"
            | "apply_patch"
            | "edit_exact_replace" => self.medium,

            // Slow tools (180s)
            "terminal_execute"
            | "code_execute"
            | "browser_navigate"
            | "browser_click"
            | "browser_type"
            | "browser_screenshot"
            | "browser_extract"
            | "browser_autofill_job_application"
            | "image_generate"
            | "image_ocr"
            | "image_analyze"
            | "media_generate_image"
            | "git_push"
            | "github_create_repo"
            | "email_send"
            | "email_fetch"
            | "calendar_create_event"
            | "calendar_list_events"
            | "cloud_upload"
            | "cloud_download"
            | "productivity_create_task"
            | "document_read"
            | "document_search"
            | "document_create_word"
            | "document_create_excel"
            | "document_create_pdf" => self.slow,

            // Very slow tools (300s)
            "video_generate" | "media_generate_video" | "api_upload" | "api_download" => {
                self.very_slow
            }

            // Default
            _ => self.default,
        }
    }
}

const DANGEROUS_TOOLS: &[&str] = &[
    "file_write",
    "file_delete",
    "terminal_execute",
    "git_push",
    "github_create_repo",
    "api_call",
    "api_upload",
    "cloud_upload",
    "email_send",
    "db_execute",
    "db_transaction_begin",
    "code_execute",
    "multi_edit",
    "apply_patch",
    "edit_exact_replace",
];

fn is_dangerous_tool(tool_id: &str) -> bool {
    DANGEROUS_TOOLS.contains(&tool_id)
        || tool_id.starts_with("ui_")
        || tool_id.starts_with("automation_")
        || tool_id.starts_with("browser_")
}

pub struct ToolExecutor {
    registry: Arc<ToolRegistry>,
    app_handle: Option<tauri::AppHandle>,
    conversation_mode: Option<String>,
    /// Optional project folder path to use as default working directory
    project_folder: Option<String>,
    /// Per-tool timeout configuration
    timeout_config: ToolTimeoutConfig,
}

impl ToolExecutor {
    fn infer_retryable_error(message: &str) -> bool {
        let normalized = message.to_lowercase();
        let non_retryable_markers = [
            "missing required parameter",
            "tool not found",
            "invalid tool arguments",
            "invalid parameter",
            "validation failed",
            "access denied",
            "permission denied",
            "approval required",
            "confirmation denied",
            "security validation failed",
            "not in allowed directories",
            "path traversal",
            "unauthorized",
            "forbidden",
            "not configured",
            "missing api key",
        ];

        !non_retryable_markers
            .iter()
            .any(|marker| normalized.contains(marker))
    }

    pub(crate) fn value_is_present(value: &Value) -> bool {
        match value {
            Value::Null => false,
            Value::String(text) => !text.trim().is_empty(),
            Value::Array(items) => !items.is_empty(),
            Value::Object(entries) => !entries.is_empty(),
            _ => true,
        }
    }

    fn has_present_arg(args: &HashMap<String, Value>, key: &str) -> bool {
        args.get(key).map(Self::value_is_present).unwrap_or(false)
    }

    fn promote_alias_arg(args: &mut HashMap<String, Value>, canonical: &str, aliases: &[&str]) {
        if Self::has_present_arg(args, canonical) {
            return;
        }

        for alias in aliases {
            if let Some(candidate) = args.get(*alias).cloned() {
                if Self::value_is_present(&candidate) {
                    args.insert(canonical.to_string(), candidate);
                    return;
                }
            }
        }
    }

    fn normalize_tool_arguments(tool_name: &str, args: &mut HashMap<String, Value>) {
        let normalized = tool_name.to_lowercase();

        if normalized == "terminal_execute" {
            Self::promote_alias_arg(args, "command", &["cmd", "script", "instruction"]);
            Self::promote_alias_arg(
                args,
                "cwd",
                &["workdir", "working_directory", "directory", "path"],
            );
            Self::promote_alias_arg(args, "timeout_ms", &["timeout", "max_time_ms"]);
            Self::promote_alias_arg(args, "shell", &["shell_type"]);
        }

        if normalized.starts_with("file_") {
            Self::promote_alias_arg(
                args,
                "path",
                &[
                    "file_path",
                    "filepath",
                    "target_path",
                    "directory",
                    "dir",
                    "location",
                ],
            );
        }

        if normalized == "file_write" {
            Self::promote_alias_arg(args, "content", &["text", "data", "body"]);
        }

        if normalized == "search_web" {
            Self::promote_alias_arg(args, "query", &["q", "search_query", "prompt", "question"]);
            Self::promote_alias_arg(args, "num_results", &["limit", "max_results"]);
        }

        if normalized == "browser_navigate" {
            Self::promote_alias_arg(args, "url", &["uri", "href", "link"]);
        }

        if normalized.starts_with("browser_") {
            Self::promote_alias_arg(
                args,
                "selector",
                &["element", "css_selector", "target", "locator"],
            );
            Self::promote_alias_arg(args, "tab_id", &["tabId"]);
        }

        if normalized == "browser_type" {
            Self::promote_alias_arg(args, "text", &["value", "input", "content"]);
        }

        if normalized == "browser_wait_for_selector" {
            Self::promote_alias_arg(args, "timeout", &["timeout_ms", "max_wait_ms"]);
        }

        if normalized == "browser_select_option" {
            Self::promote_alias_arg(args, "value", &["option", "text", "selected"]);
        }

        if normalized == "browser_autofill_job_application" {
            Self::promote_alias_arg(
                args,
                "profile",
                &[
                    "candidate_profile",
                    "applicant_profile",
                    "job_profile",
                    "user_profile",
                ],
            );
            Self::promote_alias_arg(args, "options", &["autofill_options", "settings"]);
            Self::promote_alias_arg(args, "resume_path", &["resumePath", "resume_file_path"]);
            Self::promote_alias_arg(
                args,
                "cover_letter_path",
                &["coverLetterPath", "cover_letter_file_path"],
            );
        }

        if normalized == "code_search" {
            Self::promote_alias_arg(args, "query", &["pattern", "symbol", "name", "search"]);
            Self::promote_alias_arg(args, "type", &["symbol_type", "kind"]);
            Self::promote_alias_arg(args, "root", &["directory", "path", "cwd"]);
        }

        if normalized == "grep_search" {
            Self::promote_alias_arg(args, "pattern", &["query", "regex", "search", "text"]);
            Self::promote_alias_arg(args, "root", &["directory", "path", "cwd", "folder"]);
            Self::promote_alias_arg(args, "include_pattern", &["glob", "file_pattern", "filter"]);
        }

        if normalized == "glob_search" {
            Self::promote_alias_arg(args, "pattern", &["query", "glob", "search"]);
            Self::promote_alias_arg(args, "root", &["directory", "path", "cwd", "folder"]);
        }

        if normalized == "edit_exact_replace" {
            Self::promote_alias_arg(
                args,
                "path",
                &["file_path", "filepath", "target_path", "file"],
            );
            Self::promote_alias_arg(args, "old_text", &["old_string", "find", "search"]);
            Self::promote_alias_arg(args, "new_text", &["new_string", "replace", "replacement"]);
        }

        if normalized == "image_generate" || normalized == "media_generate_image" {
            Self::promote_alias_arg(args, "prompt", &["text", "query", "description"]);
        }

        if normalized == "video_generate" || normalized == "media_generate_video" {
            Self::promote_alias_arg(args, "prompt", &["text", "query", "description"]);
        }

        if normalized.starts_with("document_create_") {
            Self::promote_alias_arg(args, "output_path", &["path", "file_path", "destination"]);
        }

        if normalized == "api_download" {
            Self::promote_alias_arg(args, "save_path", &["output_path", "destination", "path"]);
        }

        if normalized == "api_upload" {
            Self::promote_alias_arg(args, "file_path", &["path", "local_path"]);
        }

        if normalized == "cloud_upload" {
            Self::promote_alias_arg(args, "local_path", &["file_path", "path", "source"]);
            Self::promote_alias_arg(
                args,
                "remote_path",
                &["destination", "target_path", "cloud_path"],
            );
        }

        if normalized == "cloud_download" {
            Self::promote_alias_arg(args, "remote_path", &["path", "source", "cloud_path"]);
            Self::promote_alias_arg(
                args,
                "local_path",
                &["destination", "file_path", "target_path"],
            );
        }
    }

    fn parse_object_value(value: &Value) -> Option<serde_json::Map<String, Value>> {
        match value {
            Value::Object(map) => Some(map.clone()),
            Value::String(raw) => serde_json::from_str::<Value>(raw)
                .ok()
                .and_then(|parsed| parsed.as_object().cloned()),
            _ => None,
        }
    }

    fn parse_object_argument(
        args: &HashMap<String, Value>,
        key: &str,
    ) -> Option<serde_json::Map<String, Value>> {
        args.get(key).and_then(Self::parse_object_value)
    }

    pub fn new(registry: Arc<ToolRegistry>) -> Self {
        Self {
            registry,
            app_handle: None,
            conversation_mode: None,
            project_folder: None,
            timeout_config: ToolTimeoutConfig::default(),
        }
    }

    pub fn with_app_handle(registry: Arc<ToolRegistry>, app_handle: tauri::AppHandle) -> Self {
        // Return executor without getting project folder synchronously
        // The project folder should be set via set_project_folder method after creation
        Self {
            registry,
            app_handle: Some(app_handle),
            conversation_mode: None,
            project_folder: None,
            timeout_config: ToolTimeoutConfig::default(),
        }
    }

    /// Set custom timeout configuration
    pub fn set_timeout_config(&mut self, config: ToolTimeoutConfig) {
        self.timeout_config = config;
    }

    /// Get the timeout for a specific tool
    pub fn get_tool_timeout(&self, tool_id: &str) -> u64 {
        self.timeout_config.get_timeout(tool_id)
    }

    pub fn set_conversation_mode(&mut self, mode: Option<String>) {
        self.conversation_mode = mode;
    }

    /// Set the project folder for this executor
    pub fn set_project_folder(&mut self, folder: Option<String>) {
        self.project_folder = folder;
    }

    /// Get the current project folder
    pub fn get_project_folder(&self) -> Option<&String> {
        self.project_folder.as_ref()
    }

    /// Refresh the project folder from state (useful if folder changed mid-session)
    pub async fn refresh_project_folder(&mut self) {
        if let Some(app_handle) = &self.app_handle {
            use tauri::Manager;
            if let Some(state) =
                app_handle.try_state::<crate::sys::commands::project_context::ProjectContextState>()
            {
                self.project_folder = state.get_folder().await;
            }
        }
    }

    pub fn get_tool_definitions(&self, tool_ids: Option<Vec<String>>) -> Vec<ToolDefinition> {
        let tools = if let Some(ids) = tool_ids {
            ids.iter()
                .filter_map(|id| self.registry.get_tool(id))
                .collect()
        } else {
            self.registry.list_tools()
        };

        tools
            .iter()
            .map(|tool| self.convert_tool_to_definition(tool))
            .collect()
    }

    fn convert_tool_to_definition(&self, tool: &Tool) -> ToolDefinition {
        let mut properties = json!({});
        let mut required = Vec::new();

        for param in &tool.parameters {
            let mut prop = json!({
                "type": self.get_json_schema_type(&param.parameter_type),
                "description": param.description,
            });

            // OpenAI-compatible function schemas require `items` for arrays.
            // Keep items permissive because tool registry currently models only
            // "array" (not array item subtypes).
            if matches!(
                param.parameter_type,
                crate::core::agi::tools::ParameterType::Array
            ) {
                prop["items"] = json!({});
            }

            // BUG 2 FIX: Include default values in schema so the LLM knows
            // about optional parameter defaults and can use them correctly
            if let Some(default) = &param.default {
                prop["default"] = default.clone();
            }

            properties[&param.name] = prop;

            if param.required {
                required.push(param.name.clone());
            }
        }

        let parameters = json!({
            "type": "object",
            "properties": properties,
            "required": required,
        });

        ToolDefinition {
            name: tool.id.clone(),
            description: tool.description.clone(),
            parameters,
        }
    }

    fn get_json_schema_type(&self, param_type: &crate::core::agi::tools::ParameterType) -> &str {
        match param_type {
            crate::core::agi::tools::ParameterType::String => "string",
            crate::core::agi::tools::ParameterType::Integer => "integer",
            crate::core::agi::tools::ParameterType::Float => "number",
            crate::core::agi::tools::ParameterType::Boolean => "boolean",
            crate::core::agi::tools::ParameterType::Object => "object",
            crate::core::agi::tools::ParameterType::Array => "array",
            crate::core::agi::tools::ParameterType::FilePath => "string",
            crate::core::agi::tools::ParameterType::URL => "string",
        }
    }

    /// Resolve a path against the project folder if the path is relative.
    /// If the path is absolute or no project folder is set, returns the path as-is.
    fn resolve_path(&self, path_str: &str) -> String {
        let path = Path::new(path_str);

        // If the path is already absolute, return it as-is
        if path.is_absolute() {
            return path_str.to_string();
        }

        // If we have a project folder, resolve the relative path against it
        if let Some(ref project_folder) = self.project_folder {
            let project_path = Path::new(project_folder);
            let resolved = project_path.join(path);
            return resolved.to_string_lossy().to_string();
        }

        // No project folder set -- fall back to home directory or cwd so
        // relative paths don't silently resolve against an arbitrary dir.
        // This is the most common cause of "file not found" errors.
        if let Some(home) = dirs::home_dir() {
            let resolved = home.join(path);
            tracing::warn!(
                "[ToolExecutor] No project folder set. Resolving '{}' against home dir: '{}'",
                path_str,
                resolved.display()
            );
            return resolved.to_string_lossy().to_string();
        }

        if let Ok(cwd) = std::env::current_dir() {
            let resolved = cwd.join(path);
            tracing::warn!(
                "[ToolExecutor] No project folder or home dir. Resolving '{}' against cwd: '{}'",
                path_str,
                resolved.display()
            );
            return resolved.to_string_lossy().to_string();
        }

        tracing::error!(
            "[ToolExecutor] Cannot resolve relative path '{}': no project folder, home, or cwd",
            path_str
        );
        path_str.to_string()
    }

    async fn validate_path(&self, path_str: &str) -> Result<()> {
        self.canonicalize_validated_path(path_str).await.map(|_| ())
    }

    async fn canonicalize_validated_path(&self, path_str: &str) -> Result<PathBuf> {
        if let Some(app_handle) = &self.app_handle {
            let settings_state = app_handle.state::<SettingsState>();
            let settings = settings_state.settings.lock().await;

            let allowed = if settings.allowed_directories.is_empty() {
                let mut defaults = Vec::new();

                if let Some(ref project_folder) = self.project_folder {
                    defaults.push(PathBuf::from(project_folder));
                }
                if let Some(home) = dirs::home_dir() {
                    defaults.push(home);
                }
                if let Ok(cwd) = std::env::current_dir() {
                    defaults.push(cwd);
                }
                defaults.push(std::env::temp_dir());

                defaults
            } else {
                settings
                    .allowed_directories
                    .iter()
                    .map(PathBuf::from)
                    .collect::<Vec<_>>()
            };

            if allowed.is_empty() {
                return Err(anyhow!("Access denied: No allowed directories configured."));
            }

            let allowed_canonical = allowed
                .into_iter()
                .map(|dir| std::fs::canonicalize(&dir).unwrap_or(dir))
                .collect::<Vec<_>>();

            // Canonicalize the input path to resolve symlinks and .. components.
            // This prevents path traversal via symlinks or relative components.
            let canonical_path = match std::fs::canonicalize(path_str) {
                Ok(canon) => canon,
                Err(_) => {
                    // Path doesn't exist yet (e.g., file_write to a new file).
                    // Canonicalize the parent directory and append the filename.
                    let path = std::path::Path::new(path_str);
                    if let Some(parent) = path.parent() {
                        match std::fs::canonicalize(parent) {
                            Ok(canon_parent) => {
                                if let Some(filename) = path.file_name() {
                                    canon_parent.join(filename)
                                } else {
                                    PathBuf::from(path_str)
                                }
                            }
                            Err(_) => PathBuf::from(path_str),
                        }
                    } else {
                        PathBuf::from(path_str)
                    }
                }
            };

            for allowed_dir in &allowed_canonical {
                if canonical_path.starts_with(allowed_dir) {
                    return Ok(canonical_path);
                }
            }

            return Err(anyhow!(
                "Access denied: Path '{}' is not in allowed directories.",
                path_str
            ));
        }
        Ok(PathBuf::from(path_str))
    }

    pub async fn execute_tool_call(&self, tool_call: &ToolCall) -> Result<ToolResult> {
        // Generate correlation ID for request tracing (using action_id)
        let action_id = self.next_action_id(tool_call);

        tracing::info!(
            target: "tool",
            correlation_id = %action_id,
            tool_name = %tool_call.name,
            "Tool execution started"
        );

        // Check for pending user messages before executing tool
        // This allows the AI to be aware of new user input mid-task
        if has_pending_messages() {
            if let Some(app_handle) = &self.app_handle {
                let pending = peek_pending_messages();
                tracing::info!(
                    target: "tool",
                    correlation_id = %action_id,
                    pending_count = pending.len(),
                    tool_name = %tool_call.name,
                    "Pending user message(s) detected before tool execution"
                );
                // Emit event so AI can incorporate the new context
                let _ = app_handle.emit(
                    "chat:pending-context-available",
                    json!({
                        "pending_messages": pending,
                        "current_tool": tool_call.name,
                        "count": pending.len()
                    }),
                );
            }
        }

        let args_json = if tool_call.arguments.trim().is_empty() {
            "{}".to_string()
        } else {
            tool_call.arguments.clone()
        };

        let start_time = Instant::now();
        let mut args: HashMap<String, serde_json::Value> = match serde_json::from_str(&args_json) {
            Ok(parsed) => parsed,
            Err(e) => {
                let message = format!("Invalid tool arguments: {}", e);
                let raw_metadata = json!({ "raw_arguments": args_json });
                self.emit_tool_action(
                    &action_id,
                    &tool_call.name,
                    "failed",
                    &raw_metadata,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(
                    &action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                if let Some(app_handle) = &self.app_handle {
                    emit_tool_error(
                        app_handle,
                        &action_id,
                        &message,
                        start_time.elapsed().as_millis() as u64,
                        Self::infer_retryable_error(&message),
                    );
                }

                return Ok(ToolResult {
                    success: false,
                    data: json!({
                        "success": false,
                        "error": message,
                    }),
                    error: Some(message),
                    metadata: HashMap::from([("tool_name".to_string(), json!(tool_call.name))]),
                });
            }
        };

        Self::normalize_tool_arguments(&tool_call.name, &mut args);

        // file_list is frequently invoked from natural prompts like "this folder"
        // without an explicit path argument. Default to project folder/cwd so it
        // resolves quickly instead of entering retry loops.
        if tool_call.name == "file_list"
            || tool_call.name == "mcp__filesystem__list_directory"
            || tool_call.name == "mcp__filesystem__list_directory_with_sizes"
        {
            let has_valid_path = args
                .get("path")
                .and_then(|value| value.as_str())
                .is_some_and(|value| !value.trim().is_empty());
            if !has_valid_path {
                let fallback_path = self
                    .project_folder
                    .clone()
                    .or_else(|| {
                        std::env::current_dir()
                            .ok()
                            .map(|cwd| cwd.to_string_lossy().to_string())
                    })
                    .unwrap_or_else(|| ".".to_string());
                args.insert("path".to_string(), json!(fallback_path));
            }
        }

        let metadata_snapshot = serde_json::to_value(&args).unwrap_or(json!({}));

        self.emit_tool_action(
            &action_id,
            &tool_call.name,
            "running",
            &metadata_snapshot,
            None,
        );

        // Emit tool stream started event for real-time progress tracking
        if let Some(app_handle) = &self.app_handle {
            emit_tool_started(
                app_handle,
                &action_id,
                &tool_call.name,
                Some(metadata_snapshot.clone()),
            );
        }

        // Reliability fast-path: this read-only filesystem metadata call should always
        // return quickly, even when MCP server startup/connectivity is degraded.
        // Important: this runs BEFORE policy/confirmation checks to avoid waiting
        // on irrelevant approval paths for a local metadata lookup.
        if tool_call.name == "mcp__filesystem__list_allowed_directories" {
            let mut directories: Vec<String> = Vec::new();

            if let Some(project_folder) = &self.project_folder {
                directories.push(project_folder.clone());
            }

            if let Some(app_handle) = &self.app_handle {
                if let Some(settings_state) = app_handle.try_state::<SettingsState>() {
                    let settings = settings_state.settings.lock().await;
                    directories.extend(settings.allowed_directories.clone());
                }
            }

            // Keep deterministic ordering and avoid duplicates.
            directories.retain(|d| !d.trim().is_empty());
            directories.sort();
            directories.dedup();
            let directory_count = directories.len();

            let result = ToolResult {
                success: true,
                data: json!({
                    "directories": directories,
                    "count": directory_count,
                    "source": "local_fallback"
                }),
                error: None,
                metadata: HashMap::from([("tool_name".to_string(), json!(tool_call.name))]),
            };

            return self.finalize_tool_result(
                &action_id,
                &tool_call.name,
                metadata_snapshot,
                start_time,
                Ok(result),
            );
        }

        // Reliability fast-path: local bounded fallback for MCP text file reads.
        // This avoids indefinite waiting when the MCP filesystem server is slow/unavailable.
        if tool_call.name == "mcp__filesystem__read_text_file" {
            let raw_path = match args
                .get("path")
                .or_else(|| args.get("file_path"))
                .and_then(|v| v.as_str())
            {
                Some(path) if !path.trim().is_empty() => path.to_string(),
                _ => {
                    let err_msg =
                        "Missing required 'path' parameter for mcp__filesystem__read_text_file"
                            .to_string();
                    let result = ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("tool_name".to_string(), json!(tool_call.name))]),
                    };
                    return self.finalize_tool_result(
                        &action_id,
                        &tool_call.name,
                        metadata_snapshot,
                        start_time,
                        Ok(result),
                    );
                }
            };

            let path = self.resolve_path(&raw_path);
            let timeout_ms = args
                .get("timeout_ms")
                .and_then(|v| v.as_u64())
                .unwrap_or(mcp_tools::MCP_TOOL_TIMEOUT_MS)
                .min(300_000);

            if let Err(e) = self.validate_path(&path).await {
                let result = ToolResult {
                    success: false,
                    data: json!({ "path": path }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([
                        ("tool_name".to_string(), json!(tool_call.name)),
                        ("path".to_string(), json!(path)),
                    ]),
                };
                return self.finalize_tool_result(
                    &action_id,
                    &tool_call.name,
                    metadata_snapshot,
                    start_time,
                    Ok(result),
                );
            }

            tracing::info!(
                "[ToolExecutor] MCP local fallback read_text_file start path='{}' timeout_ms={}",
                path,
                timeout_ms
            );

            let read_result = timeout(
                TokioDuration::from_millis(timeout_ms),
                fs::read_to_string(&path),
            )
            .await;
            let result = match read_result {
                Ok(Ok(content)) => {
                    if let Some(app_handle) = &self.app_handle {
                        let file_op = create_file_read_event(&path, &content, true, None, None);
                        emit_file_operation(app_handle, file_op);
                    }

                    ToolResult {
                        success: true,
                        data: json!({
                            "path": path,
                            "content": content,
                            "source": "local_fallback"
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool_name".to_string(), json!(tool_call.name)),
                            ("path".to_string(), json!(path)),
                        ]),
                    }
                }
                Ok(Err(e)) => {
                    // PDF fallback: if file is binary (InvalidData) and has .pdf extension,
                    // try pdf_extract instead of returning a generic error.
                    // This mirrors the fallback in the `file_read` tool handler.
                    if e.kind() == std::io::ErrorKind::InvalidData {
                        let is_pdf = Path::new(&path)
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));

                        if is_pdf {
                            tracing::info!(
                                "[ToolExecutor] MCP read_text_file: binary file detected, attempting PDF extraction for '{}'",
                                path
                            );
                            let path_clone = path.clone();
                            let pdf_result = tokio::task::spawn_blocking(move || {
                                pdf_extract::extract_text(Path::new(&path_clone))
                            })
                            .await
                            .map_err(|join_err| join_err.to_string())
                            .and_then(|result| result.map_err(|extract_err| extract_err.to_string()));

                            match pdf_result {
                                Ok(extracted_text) => {
                                    let content = if extracted_text.len() > file_tools::FILE_READ_MAX_CHARS {
                                        format!(
                                            "{}\n\n... [truncated to first {} chars out of {}]",
                                            &extracted_text[..file_tools::FILE_READ_MAX_CHARS],
                                            file_tools::FILE_READ_MAX_CHARS,
                                            extracted_text.len()
                                        )
                                    } else {
                                        extracted_text
                                    };

                                    if let Some(app_handle) = &self.app_handle {
                                        let file_op = create_file_read_event(
                                            &path, &content, true, None, None,
                                        );
                                        emit_file_operation(app_handle, file_op);
                                    }

                                    ToolResult {
                                        success: true,
                                        data: json!({
                                            "path": path,
                                            "content": content,
                                            "source": "pdf_extract_fallback"
                                        }),
                                        error: None,
                                        metadata: HashMap::from([
                                            ("tool_name".to_string(), json!(tool_call.name)),
                                            ("path".to_string(), json!(path)),
                                            ("source".to_string(), json!("pdf_extract")),
                                        ]),
                                    }
                                }
                                Err(pdf_error) => {
                                    let error = format!(
                                        "Failed to read PDF '{}': {}. Try using document_read for structured extraction.",
                                        path, pdf_error
                                    );
                                    if let Some(app_handle) = &self.app_handle {
                                        let file_op = create_file_read_event(
                                            &path, "", false, Some(error.clone()), None,
                                        );
                                        emit_file_operation(app_handle, file_op);
                                    }

                                    ToolResult {
                                        success: false,
                                        data: json!({ "path": path, "error": error }),
                                        error: Some(error),
                                        metadata: HashMap::from([
                                            ("tool_name".to_string(), json!(tool_call.name)),
                                            ("path".to_string(), json!(path)),
                                        ]),
                                    }
                                }
                            }
                        } else {
                            // Binary file but not a PDF
                            let error = format!(
                                "Failed to read file '{}': file is binary or not UTF-8 text. Use file_read for binary-aware reading.",
                                path
                            );
                            if let Some(app_handle) = &self.app_handle {
                                let file_op = create_file_read_event(
                                    &path, "", false, Some(error.clone()), None,
                                );
                                emit_file_operation(app_handle, file_op);
                            }

                            ToolResult {
                                success: false,
                                data: json!({ "path": path }),
                                error: Some(error),
                                metadata: HashMap::from([
                                    ("tool_name".to_string(), json!(tool_call.name)),
                                    ("path".to_string(), json!(path)),
                                ]),
                            }
                        }
                    } else {
                        // Non-InvalidData error (permission denied, not found, etc.)
                        if let Some(app_handle) = &self.app_handle {
                            let file_op =
                                create_file_read_event(&path, "", false, Some(e.to_string()), None);
                            emit_file_operation(app_handle, file_op);
                        }

                        ToolResult {
                            success: false,
                            data: json!({ "path": path }),
                            error: Some(format!("Failed to read file: {}", e)),
                            metadata: HashMap::from([
                                ("tool_name".to_string(), json!(tool_call.name)),
                                ("path".to_string(), json!(path)),
                            ]),
                        }
                    }
                }
                Err(_) => ToolResult {
                    success: false,
                    data: json!({
                        "path": path,
                        "timeout_ms": timeout_ms
                    }),
                    error: Some(format!(
                        "mcp__filesystem__read_text_file timed out after {}ms. Try a smaller file or verify permissions.",
                        timeout_ms
                    )),
                    metadata: HashMap::from([
                        ("tool_name".to_string(), json!(tool_call.name)),
                        ("path".to_string(), json!(path)),
                    ]),
                },
            };

            return self.finalize_tool_result(
                &action_id,
                &tool_call.name,
                metadata_snapshot,
                start_time,
                Ok(result),
            );
        }

        let is_mcp_tool = tool_call.name.starts_with("mcp__");

        // Enforce capability toggles from Settings > Features & Privacy.
        // If a user disables a capability (e.g. "fileOperations"), all tools
        // mapped to that capability are blocked before any further checks.
        if let Some(app_handle) = &self.app_handle {
            if let Some(cap_state) =
                app_handle.try_state::<crate::sys::commands::capabilities::CapabilityState>()
            {
                if let Some(capability) =
                    crate::sys::commands::capabilities::tool_to_capability(&tool_call.name)
                {
                    if !cap_state.is_enabled(capability).await {
                        let msg = format!(
                            "Capability '{}' is disabled in Settings. Enable it in Features & Privacy to use this tool.",
                            capability
                        );
                        tracing::warn!(
                            "[ToolExecutor] Blocked tool '{}': capability '{}' is disabled",
                            tool_call.name,
                            capability
                        );
                        self.emit_tool_action(
                            &action_id,
                            &tool_call.name,
                            "blocked",
                            &metadata_snapshot,
                            Some(msg.clone()),
                        );

                        if let Some(ah) = &self.app_handle {
                            emit_tool_error(
                                ah,
                                &action_id,
                                &msg,
                                start_time.elapsed().as_millis() as u64,
                                false,
                            );
                        }

                        return Ok(ToolResult {
                            success: false,
                            data: json!({ "capability_disabled": true, "capability": capability }),
                            error: Some(msg),
                            metadata: HashMap::from([
                                ("capability_disabled".to_string(), json!(true)),
                                ("capability".to_string(), json!(capability)),
                                ("tool_name".to_string(), json!(tool_call.name)),
                            ]),
                        });
                    }
                }
            }
        }

        // Enforce tool policy validation (allowed tools, parameters, and path rules)
        // For MCP tools, dynamically register them in ToolGuard before validation
        // so they go through rate limiting and parameter security checks.
        if let Some(app_handle) = &self.app_handle {
            if let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() {
                if is_mcp_tool {
                    confirmation_state
                        .tool_guard()
                        .register_mcp_tool(&tool_call.name);
                }
                if let Err(e) = confirmation_state
                    .tool_guard()
                    .validate_tool_call(&tool_call.name, &metadata_snapshot)
                    .await
                {
                    self.emit_tool_action(
                        &action_id,
                        &tool_call.name,
                        "blocked",
                        &metadata_snapshot,
                        Some(e.to_string()),
                    );
                    self.emit_tool_metrics(
                        &action_id,
                        &tool_call.name,
                        start_time.elapsed().as_millis() as u64,
                        false,
                    );

                    if let Some(app_handle) = &self.app_handle {
                        emit_tool_error(
                            app_handle,
                            &action_id,
                            &e.to_string(),
                            start_time.elapsed().as_millis() as u64,
                            false,
                        );
                    }

                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "policy_blocked": true }),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([
                            ("requires_confirmation".to_string(), json!(true)),
                            ("tool_name".to_string(), json!(tool_call.name)),
                        ]),
                    });
                }
            }
        }

        // Safety tier check: determine if user confirmation is required
        // MCP tools are handled by dedicated manual-mode approval below; skip the generic
        // safety gate here to avoid duplicate/hidden confirmation waits.
        if !is_mcp_tool {
            if let Some(app_handle) = &self.app_handle {
                if let Err(e) = self
                    .check_safety_tier_and_confirm(
                        app_handle,
                        &tool_call.name,
                        &metadata_snapshot,
                        &action_id,
                        start_time,
                    )
                    .await
                {
                    // User denied or timeout - return approval required result
                    self.emit_tool_action(
                        &action_id,
                        &tool_call.name,
                        "blocked",
                        &metadata_snapshot,
                        Some(e.to_string()),
                    );
                    self.emit_tool_metrics(
                        &action_id,
                        &tool_call.name,
                        start_time.elapsed().as_millis() as u64,
                        false,
                    );

                    // Emit tool error for stream tracking
                    emit_tool_error(
                        app_handle,
                        &action_id,
                        &e.to_string(),
                        start_time.elapsed().as_millis() as u64,
                        true,
                    );

                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "confirmation_denied": true }),
                        error: Some(e.to_string()),
                        metadata: HashMap::from([
                            ("requires_confirmation".to_string(), json!(true)),
                            ("tool_name".to_string(), json!(tool_call.name)),
                        ]),
                    });
                }
            }
        }

        // Manual mode requires approval for dangerous/MCP tools
        // Auto mode (default) executes autonomously
        let in_manual_mode = self.conversation_mode.as_deref() == Some("manual");
        // Check for MCP tool ID format: mcp__server__tool__
        if tool_call.name.starts_with("mcp__") && in_manual_mode {
            tracing::warn!(
                "[Security] MCP tool '{}' requested in manual mode. Emitting approval request.",
                tool_call.name
            );

            if let Some(app_handle) = &self.app_handle {
                if let Err(e) = app_handle.emit(
                    "approval:request",
                    json!({
                        "id": uuid::Uuid::new_v4().to_string(),
                        "type": "tool_execution",
                        "toolName": tool_call.name,
                        "description": format!("Agent wants to execute MCP tool: {}", tool_call.name),
                        "riskLevel": "high",
                        "details": {
                            "tool": tool_call.name,
                            "arguments": metadata_snapshot.clone(),
                            "source": "mcp"
                        },
                        "status": "pending",
                    }),
                ) {
                    tracing::error!("Failed to emit approval:request event for MCP tool: {}", e);
                }
            }

            let message = format!(
                "User approval required to execute MCP tool: {}",
                tool_call.name
            );
            self.emit_tool_action(
                &action_id,
                &tool_call.name,
                "blocked",
                &metadata_snapshot,
                Some(message.clone()),
            );
            self.emit_tool_metrics(
                &action_id,
                &tool_call.name,
                start_time.elapsed().as_millis() as u64,
                false,
            );
            if let Some(app_handle) = &self.app_handle {
                emit_tool_error(
                    app_handle,
                    &action_id,
                    &message,
                    start_time.elapsed().as_millis() as u64,
                    true,
                );
            }

            return Ok(ToolResult {
                success: false,
                data: json!({ "approval_required": true }),
                error: Some(message),
                metadata: HashMap::from([
                    ("requires_approval".to_string(), json!(true)),
                    ("tool_name".to_string(), json!(tool_call.name)),
                    ("tool_source".to_string(), json!("mcp")),
                ]),
            });
        }

        // Route MCP tools (format: mcp__server__tool__) to MCP executor
        if tool_call.name.starts_with("mcp__") {
            let result = self.execute_mcp_tool(tool_call, args).await;
            return self.finalize_tool_result(
                &action_id,
                &tool_call.name,
                metadata_snapshot,
                start_time,
                result,
            );
        }

        let tool = match self.registry.get_tool(&tool_call.name) {
            Some(tool) => tool,
            None => {
                let message = format!("Tool not found: {}", tool_call.name);
                self.emit_tool_action(
                    &action_id,
                    &tool_call.name,
                    "failed",
                    &metadata_snapshot,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(
                    &action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                if let Some(app_handle) = &self.app_handle {
                    emit_tool_error(
                        app_handle,
                        &action_id,
                        &message,
                        start_time.elapsed().as_millis() as u64,
                        false,
                    );
                }

                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": message, "success": false }),
                    error: Some(format!("Tool not found: {}", tool_call.name)),
                    metadata: HashMap::new(),
                });
            }
        };

        for param in &tool.parameters {
            if param.required && !args.contains_key(&param.name) {
                let error_message = format!("Missing required parameter: {}", param.name);
                self.emit_tool_action(
                    &action_id,
                    &tool_call.name,
                    "failed",
                    &metadata_snapshot,
                    Some(error_message.clone()),
                );
                self.emit_tool_metrics(
                    &action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                if let Some(app_handle) = &self.app_handle {
                    emit_tool_error(
                        app_handle,
                        &action_id,
                        &error_message,
                        start_time.elapsed().as_millis() as u64,
                        false,
                    );
                }
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": error_message, "success": false }),
                    error: Some(error_message),
                    metadata: HashMap::new(),
                });
            }
        }

        if is_dangerous_tool(&tool_call.name) && self.conversation_mode.as_deref() == Some("manual")
        {
            tracing::warn!(
                "[Security] Dangerous tool '{}' requested in manual mode. Emitting approval request.",
                tool_call.name
            );

            if let Some(app_handle) = &self.app_handle {
                if let Err(e) = app_handle.emit(
                    "approval:request",
                    json!({
                        "id": uuid::Uuid::new_v4().to_string(),
                        "type": "tool_execution",
                        "toolName": tool_call.name,
                        "description": format!("Agent wants to execute: {}", tool.name),
                        "riskLevel": "high",
                        "details": {
                            "tool": tool.name,
                            "arguments": metadata_snapshot.clone(),
                        },
                        "status": "pending",
                    }),
                ) {
                    tracing::error!("Failed to emit approval:request event: {}", e);
                }

                if let Err(e) = app_handle.emit(
                    "agent:status:update",
                    json!({
                        "id": "main_agent",
                        "name": "AGI Workforce Agent",
                        "status": "paused",
                        "currentStep": format!("Waiting for approval to execute: {}", tool.name),
                        "progress": 50
                    }),
                ) {
                    tracing::error!("Failed to emit agent:status:update event: {}", e);
                }
            }

            let message = format!(
                "User approval required to execute dangerous tool: {}",
                tool.name
            );
            self.emit_tool_action(
                &action_id,
                &tool_call.name,
                "blocked",
                &metadata_snapshot,
                Some(message.clone()),
            );
            self.emit_tool_metrics(
                &action_id,
                &tool_call.name,
                start_time.elapsed().as_millis() as u64,
                false,
            );
            if let Some(app_handle) = &self.app_handle {
                emit_tool_error(
                    app_handle,
                    &action_id,
                    &message,
                    start_time.elapsed().as_millis() as u64,
                    true,
                );
            }

            return Ok(ToolResult {
                success: false,
                data: json!({ "approval_required": true }),
                error: Some(message),
                metadata: HashMap::from([
                    ("requires_approval".to_string(), json!(true)),
                    ("tool_name".to_string(), json!(tool_call.name)),
                ]),
            });
        }

        if let Some(app_handle) = &self.app_handle {
            if let Err(e) = app_handle.emit(
                "agent:status:update",
                json!({
                    "id": "main_agent",
                    "name": "AGI Workforce Agent",
                    "status": "running",
                    "currentStep": format!("Executing: {}", tool.name),
                    "progress": 60
                }),
            ) {
                tracing::error!("Failed to emit agent:status:update event: {}", e);
            }
        }

        // Get per-tool timeout
        let timeout_ms = self.timeout_config.get_timeout(&tool_call.name);
        let timeout_duration = TokioDuration::from_millis(timeout_ms);

        // Execute with per-tool timeout
        let result = match timeout(
            timeout_duration,
            self.execute_tool_impl(&tool, args, &action_id),
        )
        .await
        {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                tracing::warn!("Tool '{}' timed out after {}ms", tool_call.name, timeout_ms);
                Err(anyhow!(
                    "Tool '{}' timed out after {} seconds",
                    tool_call.name,
                    timeout_ms / 1000
                ))
            }
        };

        self.finalize_tool_result(
            &action_id,
            &tool_call.name,
            metadata_snapshot,
            start_time,
            result,
        )
    }

    /// Dispatch tool execution to the appropriate handler method.
    async fn execute_tool_impl(
        &self,
        tool: &Tool,
        args: HashMap<String, serde_json::Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        match tool.id.as_str() {
            "file_read" => self.execute_file_read_tool(&args).await,
            "file_write" => self.execute_file_write_tool(&args).await,
            "file_delete" => self.execute_file_delete_tool(&args).await,
            "ui_screenshot" => self.execute_ui_screenshot_tool(&args).await,
            "ui_click" => self.execute_ui_click_tool(&args).await,
            "ui_type" => self.execute_ui_type_tool(&args).await,
            "search_web" => self.execute_search_web_tool(&args, action_id).await,
            "browser_navigate" => self.execute_browser_navigate_tool(&args, action_id).await,
            "code_execute" => self.execute_code_execute_tool(&args).await,
            "terminal_execute" => self.execute_terminal_tool(args, action_id).await,
            "git_push" => self.execute_git_push_tool(&args).await,
            "db_query" => self.execute_db_query_tool(&args).await,
            "db_execute" => self.execute_db_execute_tool(&args).await,
            "db_transaction_begin" => self.execute_db_transaction_begin_tool(&args).await,
            "db_transaction_commit" => self.execute_db_transaction_commit_tool(&args).await,
            "db_transaction_rollback" => self.execute_db_transaction_rollback_tool(&args).await,
            "api_call" => self.execute_api_call_tool(&args).await,
            "image_ocr" => self.execute_image_ocr_tool(&args).await,
            "code_analyze" => self.execute_code_analyze_tool(&args).await,
            "code_search" => self.execute_code_search_tool(&args).await,
            "image_generate" | "media_generate_image" => {
                self.execute_image_generate_tool(&args).await
            }
            "video_generate" | "media_generate_video" => {
                self.execute_video_generate_tool(&args).await
            }
            "llm_reason" => self.execute_llm_reason_tool(&args).await,
            "email_send" => self.execute_email_send_tool(&args, &tool.id).await,
            "email_fetch" => self.execute_email_fetch_tool(&args, &tool.id).await,
            "calendar_create_event" => {
                self.execute_calendar_create_event_tool(&args, &tool.id)
                    .await
            }
            "calendar_list_events" => {
                self.execute_calendar_list_events_tool(&args, &tool.id)
                    .await
            }
            "cloud_upload" => self.execute_cloud_upload_tool(&args, &tool.id).await,
            "cloud_download" => self.execute_cloud_download_tool(&args, &tool.id).await,
            "productivity_create_task" => {
                self.execute_productivity_create_task_tool(&args, &tool.id)
                    .await
            }
            "document_read" => self.execute_document_read_tool(&args, &tool.id).await,
            "document_search" => self.execute_document_search_tool(&args, &tool.id).await,
            "document_create_word" => {
                self.execute_document_create_word_tool(&args, &tool.id)
                    .await
            }
            "document_create_excel" => {
                self.execute_document_create_excel_tool(&args, &tool.id)
                    .await
            }
            "document_create_pdf" => self.execute_document_create_pdf_tool(&args, &tool.id).await,
            "image_analyze" => self.execute_image_analyze_tool(&args).await,
            "git_status" => self.execute_git_status_tool(&args).await,
            "git_commit" => self.execute_git_commit_tool(&args).await,
            "git_clone" => self.execute_git_clone_tool(&args).await,
            "git_add" => self.execute_git_add_tool(&args).await,
            "schedule_reminder" => self.execute_schedule_reminder_tool(&args, &tool.id).await,
            "schedule_recurring_task" => {
                self.execute_schedule_recurring_task_tool(&args, &tool.id)
                    .await
            }
            "cancel_scheduled_task" => {
                self.execute_cancel_scheduled_task_tool(&args, &tool.id)
                    .await
            }
            "list_scheduled_tasks" => {
                self.execute_list_scheduled_tasks_tool(&args, &tool.id)
                    .await
            }
            "file_list" => self.execute_file_list_tool(&args).await,
            "memory_remember" => self.execute_memory_remember_tool(&args, &tool.id).await,
            "memory_recall" => self.execute_memory_recall_tool(&args, &tool.id).await,
            "memory_search" => self.execute_memory_search_tool(&args, &tool.id).await,
            "memory_forget" => self.execute_memory_forget_tool(&args, &tool.id).await,
            "browser_click" => self.execute_browser_tool("browser_click", args).await,
            "browser_extract" => self.execute_browser_tool("browser_extract", args).await,
            "api_download" => self.execute_api_download_tool(&args).await,
            "api_upload" => self.execute_api_upload_tool(&args).await,
            "git_init" => self.execute_git_init_tool(&args).await,
            "github_create_repo" => self.execute_github_create_repo_tool(&args).await,
            "physical_scrape" => self.execute_physical_scrape_tool(&args).await,
            "todo_write" => self.execute_todo_write_tool(&args).await,
            "question" => self.execute_question_tool(&args).await,
            "test_run" => self.execute_test_run_tool(args, action_id).await,
            "multi_edit" => self.execute_multi_edit_tool(&args).await,
            "apply_patch" => self.execute_apply_patch_tool(&args).await,
            "grep_search" => self.execute_grep_search_tool(&args).await,
            "glob_search" => self.execute_glob_search_tool(&args).await,
            "edit_exact_replace" => self.execute_edit_exact_replace_tool(&args).await,
            id if id.starts_with("browser_") => self.execute_browser_tool(id, args).await,
            _ => Err(anyhow!("Unknown tool: {}", tool.id)),
        }
    }

    fn next_action_id(&self, tool_call: &ToolCall) -> String {
        if tool_call.id.trim().is_empty() {
            format!("tool-{}", Uuid::new_v4())
        } else {
            tool_call.id.clone()
        }
    }

    fn emit_tool_action(
        &self,
        action_id: &str,
        tool_name: &str,
        status: &str,
        metadata: &Value,
        error: Option<String>,
    ) {
        if let Some(app_handle) = &self.app_handle {
            let payload = json!({
                "action": {
                    "id": action_id,
                    "actionId": action_id,
                    "workflowHash": serde_json::Value::Null,
                    "type": "tool",
                    "title": format!("Execute {}", tool_name),
                    "description": format!("Tool {}", tool_name),
                    "status": status,
                    "requiresApproval": false,
                    "scope": {
                        "type": "tool",
                        "description": format!("Tool {}", tool_name),
                    },
                    "metadata": metadata,
                    "error": error,
                }
            });

            if let Err(e) = app_handle.emit("agent:action_update", payload) {
                tracing::error!(
                    "Failed to emit agent:action_update event for action {}: {}",
                    action_id,
                    e
                );
            }
        }
    }

    fn emit_tool_metrics(&self, action_id: &str, tool_name: &str, duration_ms: u64, success: bool) {
        if let Some(app_handle) = &self.app_handle {
            let completion_reason = if success { "completed" } else { "tool_failed" };
            let payload = json!({
                "metrics": {
                    "workflowHash": serde_json::Value::Null,
                    "actionId": action_id,
                    "tool": tool_name,
                    "durationMs": duration_ms,
                    "completionReason": completion_reason,
                }
            });

            if let Err(e) = app_handle.emit("agent:metrics", payload) {
                tracing::error!(
                    "Failed to emit agent:metrics event for action {}: {}",
                    action_id,
                    e
                );
            }
        }
    }

    fn finalize_tool_result(
        &self,
        action_id: &str,
        tool_name: &str,
        metadata: Value,
        start_time: Instant,
        result: Result<ToolResult>,
    ) -> Result<ToolResult> {
        let duration_ms = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(tool_result) => {
                let status = if tool_result.success {
                    "success"
                } else {
                    "failed"
                };

                if tool_result.success {
                    tracing::info!(
                        target: "tool",
                        correlation_id = %action_id,
                        tool_name = %tool_name,
                        duration_ms = duration_ms,
                        "Tool execution completed successfully"
                    );
                } else {
                    tracing::warn!(
                        target: "tool",
                        correlation_id = %action_id,
                        tool_name = %tool_name,
                        error = %tool_result.error.as_deref().unwrap_or("Unknown error"),
                        duration_ms = duration_ms,
                        "Tool execution completed with failure"
                    );
                }

                self.emit_tool_action(
                    action_id,
                    tool_name,
                    status,
                    &metadata,
                    tool_result.error.clone(),
                );
                self.emit_tool_metrics(action_id, tool_name, duration_ms, tool_result.success);

                // Emit tool stream completed/error event for real-time progress tracking
                if let Some(app_handle) = &self.app_handle {
                    if tool_result.success {
                        emit_tool_completed(
                            app_handle,
                            action_id,
                            tool_result.data.clone(),
                            duration_ms,
                        );
                    } else {
                        emit_tool_error(
                            app_handle,
                            action_id,
                            tool_result.error.as_deref().unwrap_or("Unknown error"),
                            duration_ms,
                            tool_result
                                .error
                                .as_deref()
                                .map(Self::infer_retryable_error)
                                .unwrap_or(true),
                        );
                    }
                }

                Ok(tool_result)
            }
            Err(err) => {
                let message = err.to_string();
                tracing::error!(
                    target: "tool",
                    correlation_id = %action_id,
                    tool_name = %tool_name,
                    error = %message,
                    duration_ms = duration_ms,
                    "Tool execution failed with error"
                );

                self.emit_tool_action(
                    action_id,
                    tool_name,
                    "failed",
                    &metadata,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(action_id, tool_name, duration_ms, false);

                // Emit tool stream error event
                if let Some(app_handle) = &self.app_handle {
                    emit_tool_error(
                        app_handle,
                        action_id,
                        &message,
                        duration_ms,
                        Self::infer_retryable_error(&message),
                    );
                }

                Err(err)
            }
        }
    }

    pub fn format_tool_result(&self, _tool_call: &ToolCall, result: &ToolResult) -> String {
        if result.success {
            serde_json::to_string_pretty(&result.data).unwrap_or_else(|_| "{}".to_string())
        } else {
            format!(
                "Error: {}",
                result
                    .error
                    .as_ref()
                    .unwrap_or(&"Unknown error".to_string())
            )
        }
    }

    /// Check the safety tier for a tool and request user confirmation if required.
    /// Returns Ok(()) if the tool can proceed, Err with a message if denied or timed out.
    async fn check_safety_tier_and_confirm(
        &self,
        app_handle: &tauri::AppHandle,
        tool_name: &str,
        parameters: &Value,
        action_id: &str,
        _start_time: Instant,
    ) -> Result<()> {
        // Get the ToolConfirmationState from app handle
        let confirmation_state = match app_handle.try_state::<ToolConfirmationState>() {
            Some(state) => state,
            None => {
                tracing::warn!(
                    "[ToolExecutor] ToolConfirmationState not available, skipping safety check"
                );
                return Ok(());
            }
        };

        // ── Stored approval-policy check ────────────────────────────────────
        // Before computing the safety tier (which may involve a blocking dialog),
        // check whether the user has previously saved an approval policy for this
        // tool via `set_tool_approval_policy` / the ToolApproval settings model.
        // Remembered choices are stored in `ToolConfirmationState::remembered_choices`
        // and map tool_name -> approved (true = always approve, false = always deny).
        if let Some(approved) = confirmation_state.get_remembered_choice(tool_name) {
            if approved {
                tracing::debug!(
                    "[ToolExecutor] Stored approval policy: auto-approving '{}' (always_approve=true)",
                    tool_name
                );
                return Ok(());
            } else {
                tracing::debug!(
                    "[ToolExecutor] Stored approval policy: auto-denying '{}' (always_approve=false)",
                    tool_name
                );
                return Err(anyhow!(
                    "Tool '{}' is blocked by a stored denial policy. Use /settings to change tool approval.",
                    tool_name
                ));
            }
        }

        // Get the tool guard to determine safety tier
        let tool_guard = confirmation_state.tool_guard();
        let safety_tier = tool_guard.get_safety_tier(tool_name);

        // Log the safety tier check
        tracing::debug!(
            "[ToolExecutor] Safety tier for '{}': {:?}",
            tool_name,
            safety_tier
        );

        // Safe and RequiresNotification tiers don't need user confirmation
        if !safety_tier.requires_user_action() {
            // For RequiresNotification tier, emit a notification event
            if matches!(safety_tier, ToolSafetyTier::RequiresNotification) {
                let _ = app_handle.emit(
                    "tool:notification",
                    json!({
                        "tool_name": tool_name,
                        "action_id": action_id,
                        "message": format!("Executing: {}", tool_name),
                        "parameters_preview": self.summarize_parameters(parameters),
                    }),
                );
            }
            return Ok(());
        }

        // Create the confirmation request
        let tool_description = self
            .registry
            .get_tool(tool_name)
            .map(|t| t.description.clone())
            .unwrap_or_else(|| format!("Execute {}", tool_name));

        let confirmation_request =
            tool_guard.create_confirmation_request(tool_name, parameters, Some(&tool_description));

        tracing::info!(
            "[ToolExecutor] Requesting user confirmation for '{}' (tier: {:?})",
            tool_name,
            safety_tier
        );

        // Emit status update to show we're waiting for confirmation
        let _ = app_handle.emit(
            "agent:status:update",
            json!({
                "id": "main_agent",
                "name": "AGI Workforce Agent",
                "status": "awaiting_confirmation",
                "currentStep": format!("Waiting for your approval to: {}", tool_name),
                "progress": 50
            }),
        );

        // Request confirmation from user
        match request_tool_confirmation(
            app_handle,
            &confirmation_state,
            confirmation_request,
            TOOL_CONFIRMATION_TIMEOUT_SECS,
        )
        .await
        {
            Ok(approved) => {
                if approved {
                    tracing::info!(
                        "[ToolExecutor] User approved tool '{}', proceeding with execution",
                        tool_name
                    );
                    Ok(())
                } else {
                    tracing::info!(
                        "[ToolExecutor] User denied tool '{}', aborting execution",
                        tool_name
                    );
                    Err(anyhow!(
                        "You declined to run '{}'. Let me know if you'd like me to try a different approach.",
                        tool_name
                    ))
                }
            }
            Err(e) => {
                tracing::warn!(
                    "[ToolExecutor] Confirmation failed for '{}': {}",
                    tool_name,
                    e
                );
                Err(anyhow!(
                    "Couldn't get your confirmation for '{}': {}. Please try again.",
                    tool_name,
                    e
                ))
            }
        }
    }

    /// Create a brief summary of tool parameters for display
    fn summarize_parameters(&self, parameters: &Value) -> String {
        if let Some(obj) = parameters.as_object() {
            obj.iter()
                .take(3) // Limit to first 3 parameters
                .map(|(k, v)| {
                    let value_preview = match v {
                        Value::String(s) => {
                            if s.len() > 30 {
                                format!("\"{}...\"", &s[..27])
                            } else {
                                format!("\"{}\"", s)
                            }
                        }
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        Value::Array(arr) => format!("[{} items]", arr.len()),
                        Value::Object(obj) => format!("{{...{} keys}}", obj.len()),
                        Value::Null => "null".to_string(),
                    };
                    format!("{}: {}", k, value_preview)
                })
                .collect::<Vec<_>>()
                .join(", ")
        } else {
            "No parameters".to_string()
        }
    }
}
