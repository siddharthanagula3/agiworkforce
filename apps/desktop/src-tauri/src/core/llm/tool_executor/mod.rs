mod api_tools;
mod artifact_tools;
mod background_agent_tools;
mod browser_tools;
mod code_tools;
mod communication_tools;
mod conversation_search_tools;
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
mod skill_tools;
mod terminal_tools;
mod tool_search_tools;
mod ui_automation_tools;
mod undo_tools;
mod worktree_tools;

#[cfg(test)]
mod tests;

use crate::core::agi::tools::{Tool, ToolRegistry, ToolResult};
use crate::core::llm::job_autofill_runtime::build_job_autofill_eval_script;
use crate::core::llm::{ToolCall, ToolDefinition};
use crate::sys::commands::chat::{has_pending_messages, peek_pending_messages};
use crate::sys::commands::settings::SettingsState;
use crate::sys::commands::tool_confirmation::{
    request_folder_access_confirmation, request_tool_confirmation, ToolConfirmationState,
    FOLDER_ACCESS_TOOL_NAME,
};
use crate::sys::commands::undo::UndoState;
use crate::sys::security::tool_guard::RiskLevel;
use crate::sys::security::{ToolConfirmationRequest, ToolSafetyTier};
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
use std::collections::{BTreeSet, HashMap};
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
            "search_web"
            | "api_call"
            | "web_fetch"
            | "llm_reason"
            | "code_search"
            | "grep_search"
            | "glob_search"
            | "conversation_search"
            | "recent_chats"
            | "background_agent_get"
            | "create_artifact" => self.fast,

            // Medium tools (60s)
            "file_read"
            | "file_read_binary"
            | "file_write"
            | "file_delete"
            | "file_list"
            | "git_status"
            | "git_diff"
            | "git_log"
            | "git_list_branches"
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
            | "edit_exact_replace"
            | "undo_get_summary"
            | "undo_get_changes"
            | "undo_last"
            | "undo_change"
            | "coding_checkpoint_create"
            | "coding_checkpoint_list"
            | "coding_checkpoint_rewind"
            | "background_agent_start"
            | "background_agent_cancel" => self.medium,

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
            | "document_edit_excel"
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
    "worktree_create",
    "worktree_remove",
    "undo_last",
    "undo_change",
    "coding_checkpoint_create",
    "coding_checkpoint_rewind",
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

/// How long a dangerous tool waits on the user before failing closed.
/// Mirrors `core/agent/autonomous.rs`'s task-level approval timeout.
const TOOL_APPROVAL_TIMEOUT_SECS: u64 = 300;

/// Map a dangerous tool call onto the approval payload the controller and the
/// frontend already understand.
fn build_tool_approval_payload(
    action_id: &str,
    tool_id: &str,
    tool_display_name: &str,
    arguments: &serde_json::Value,
) -> crate::core::agent::approval::ApprovalRequestPayload {
    use crate::core::agent::approval::{ApprovalRequestPayload, ApprovalScope, ApprovalScopeType};

    let scope_type = if tool_id.starts_with("browser_") {
        ApprovalScopeType::Browser
    } else if tool_id.starts_with("ui_") || tool_id.starts_with("automation_") {
        ApprovalScopeType::Ui
    } else if tool_id.contains("bash")
        || tool_id.contains("terminal")
        || tool_id.contains("command")
    {
        ApprovalScopeType::Terminal
    } else if tool_id.contains("file") || tool_id.contains("write") || tool_id.contains("delete") {
        ApprovalScopeType::Filesystem
    } else {
        ApprovalScopeType::Unknown
    };

    ApprovalRequestPayload {
        action_id: action_id.to_string(),
        tool_name: tool_id.to_string(),
        title: format!("Allow {}?", tool_display_name),
        description: format!("The agent wants to run {}.", tool_display_name),
        reason: "This tool can change your system or act on your behalf, and the conversation is in manual mode.".to_string(),
        risk_level: "high".to_string(),
        scope: ApprovalScope {
            scope_type,
            command: None,
            cwd: None,
            path: None,
            domain: None,
            description: Some(arguments.to_string()),
            risk: "high".to_string(),
        },
        workflow_hash: None,
        // Stable per tool so the trust store can remember "always allow this".
        action_signature: tool_id.to_string(),
    }
}

pub struct ToolExecutor {
    registry: Arc<ToolRegistry>,
    app_handle: Option<tauri::AppHandle>,
    conversation_mode: Option<String>,
    /// Optional project folder path to use as default working directory
    project_folder: Option<String>,
    /// Per-tool timeout configuration
    timeout_config: ToolTimeoutConfig,
    /// Backend conversation ID for the live chat turn this executor is
    /// running under (when known). Used by tools that need to associate
    /// created resources with the conversation — e.g. `create_artifact`
    /// (core/llm/tool_executor/artifact_tools.rs) passes this through to
    /// `CreateArtifactRequest.conversation_id` and the `chat:artifact` event.
    conversation_id: Option<i64>,
    /// Frontend message ID for the assistant turn in progress (when known).
    /// Forwarded on the `chat:artifact` event so `TauriRuntime.ts` can
    /// correlate the artifact with the streaming message, mirroring how
    /// `tool:event`/`chat:tool-result` already carry `message_id`.
    frontend_message_id: Option<String>,
    /// Whether app-owned resources created by tools may be written to durable
    /// storage. Normal conversations default to true; temporary/incognito
    /// turns explicitly set this false before any tool executes.
    persist_internal_resources: bool,
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
            for alias in aliases {
                args.remove(*alias);
            }
            return;
        }

        for alias in aliases {
            if let Some(candidate) = args.get(*alias).cloned() {
                if Self::value_is_present(&candidate) {
                    args.insert(canonical.to_string(), candidate);
                    for consumed_alias in aliases {
                        args.remove(*consumed_alias);
                    }
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
            Self::promote_alias_arg(args, "timeout_ms", &["timeout", "max_wait_ms"]);
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
            Self::promote_alias_arg(args, "limit", &["head_limit", "max_results"]);
            Self::promote_alias_arg(args, "offset", &["skip"]);
        }

        if normalized == "glob_search" {
            Self::promote_alias_arg(args, "pattern", &["query", "glob", "search"]);
            Self::promote_alias_arg(args, "root", &["directory", "path", "cwd", "folder"]);
            Self::promote_alias_arg(args, "limit", &["head_limit", "max_results"]);
            Self::promote_alias_arg(args, "offset", &["skip"]);
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
            conversation_id: None,
            frontend_message_id: None,
            persist_internal_resources: true,
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
            conversation_id: None,
            frontend_message_id: None,
            persist_internal_resources: true,
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

    /// Set the backend conversation ID for the live chat turn this executor
    /// is running under. See the `conversation_id` field doc for context.
    pub fn set_conversation_id(&mut self, conversation_id: Option<i64>) {
        self.conversation_id = conversation_id;
    }

    /// Set the frontend message ID for the assistant turn in progress. See
    /// the `frontend_message_id` field doc for context.
    pub fn set_frontend_message_id(&mut self, frontend_message_id: Option<String>) {
        self.frontend_message_id = frontend_message_id;
    }

    /// Set the per-turn persistence policy for resources owned by AGI (for
    /// example artifacts). This is intentionally separate from execution mode:
    /// Local/BYOK may persist, while an incognito turn in either mode may not.
    pub fn set_persist_internal_resources(&mut self, persist: bool) {
        self.persist_internal_resources = persist;
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
            strict: None,
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

    fn tool_may_touch_local_paths(tool_name: &str) -> bool {
        let name = tool_name.to_ascii_lowercase();
        name.starts_with("file_")
            || name.starts_with("mcp__filesystem__")
            || name.starts_with("git_")
            || name.starts_with("worktree_")
            || name.starts_with("document_")
            || name.starts_with("coding_checkpoint_")
            || name.starts_with("undo_")
            || matches!(
                name.as_str(),
                "terminal_execute"
                    | "code_execute"
                    | "code_analyze"
                    | "code_search"
                    | "grep_search"
                    | "glob_search"
                    | "test_run"
                    | "background_agent_start"
                    | "multi_edit"
                    | "apply_patch"
                    | "edit_exact_replace"
                    | "api_upload"
                    | "api_download"
                    | "cloud_upload"
                    | "cloud_download"
                    | "image_ocr"
                    | "image_analyze"
                    | "browser_autofill_job_application"
            )
    }

    fn collect_path_strings(value: &Value, output: &mut Vec<String>) {
        match value {
            Value::String(path) if !path.trim().is_empty() => {
                output.push(path.trim().to_string());
            }
            Value::Array(values) => {
                for value in values {
                    Self::collect_path_strings(value, output);
                }
            }
            _ => {}
        }
    }

    fn local_paths_from_args(tool_name: &str, args: &HashMap<String, Value>) -> Vec<String> {
        if !Self::tool_may_touch_local_paths(tool_name) {
            return Vec::new();
        }

        const PATH_KEYS: &[&str] = &[
            "path",
            "paths",
            "file_path",
            "filepath",
            "target_path",
            "directory",
            "dir",
            "location",
            "cwd",
            "workdir",
            "working_directory",
            "root",
            "root_path",
            "repo_path",
            "destination",
            "save_path",
            "output_path",
            "local_path",
            "resume_path",
            "cover_letter_path",
            "image_path",
            "files",
        ];

        fn visit(value: &Value, tool_name: &str, output: &mut Vec<String>) {
            match value {
                Value::Object(object) => {
                    for (key, value) in object {
                        let key = key.to_ascii_lowercase();
                        let is_filesystem_source =
                            key == "source" && tool_name.starts_with("mcp__filesystem__");
                        if PATH_KEYS.contains(&key.as_str()) || is_filesystem_source {
                            ToolExecutor::collect_path_strings(value, output);
                        } else {
                            visit(value, tool_name, output);
                        }
                    }
                }
                Value::Array(values) => {
                    for value in values {
                        visit(value, tool_name, output);
                    }
                }
                _ => {}
            }
        }

        let mut paths = Vec::new();
        let object = Value::Object(
            args.iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect(),
        );
        visit(&object, &tool_name.to_ascii_lowercase(), &mut paths);
        paths.sort();
        paths.dedup();
        paths
    }

    fn folder_capabilities_for_tool(tool_name: &str) -> Vec<&'static str> {
        let name = tool_name.to_ascii_lowercase();
        if matches!(
            name.as_str(),
            "terminal_execute" | "code_execute" | "test_run" | "background_agent_start"
        ) {
            return vec!["execute"];
        }

        let modifies = [
            "write", "delete", "create", "update", "remove", "move", "rename", "edit", "patch",
            "format", "commit", "clone", "init", "download", "rewind", "undo",
        ]
        .iter()
        .any(|operation| name.contains(operation));
        if modifies {
            vec!["modify"]
        } else {
            vec!["read"]
        }
    }

    async fn resolve_folder_consent_target(path: String) -> Result<(PathBuf, PathBuf)> {
        tokio::task::spawn_blocking(move || {
            let requested = PathBuf::from(&path);
            if !requested.is_absolute() {
                return Err(anyhow!(
                    "Access denied: Folder consent path '{}' did not resolve to an absolute path.",
                    path
                ));
            }
            if requested
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
            {
                return Err(anyhow!(
                    "Access denied: Path '{}' contains directory traversal ('..').",
                    path
                ));
            }

            let mut existing_ancestor = requested.as_path();
            while !existing_ancestor.exists() {
                existing_ancestor = existing_ancestor.parent().ok_or_else(|| {
                    anyhow!(
                        "Access denied: Could not resolve an existing parent for '{}'.",
                        path
                    )
                })?;
            }
            let canonical_ancestor = std::fs::canonicalize(existing_ancestor)
                .map_err(|error| anyhow!("Could not resolve '{}': {}", path, error))?;
            let suffix = requested
                .strip_prefix(existing_ancestor)
                .unwrap_or_else(|_| Path::new(""));
            let canonical_target = canonical_ancestor.join(suffix);

            if crate::sys::security::blocked_paths::is_blocked(&canonical_target) {
                return Err(anyhow!(
                    "Access denied: Path '{}' is a protected system path.",
                    path
                ));
            }

            let grant_root = if requested.is_dir() {
                canonical_target.clone()
            } else if requested.exists() {
                canonical_target
                    .parent()
                    .map(Path::to_path_buf)
                    .ok_or_else(|| anyhow!("Access denied: '{}' has no grantable parent.", path))?
            } else {
                canonical_ancestor
            };

            if grant_root.parent().is_none()
                || crate::sys::security::blocked_paths::is_blocked(&grant_root)
            {
                return Err(anyhow!(
                    "Access denied: '{}' would require granting a protected or root directory.",
                    path
                ));
            }

            Ok((canonical_target, grant_root))
        })
        .await
        .map_err(|error| anyhow!("Folder access resolution task failed: {}", error))?
    }

    async fn ensure_folder_access(
        &self,
        tool_name: &str,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<()> {
        let raw_paths = Self::local_paths_from_args(tool_name, args);
        if raw_paths.is_empty() {
            return Ok(());
        }

        // Unit-level executor tests intentionally run without a Tauri runtime;
        // their existing path validator remains fail-closed outside configured
        // temp/project roots. Production executors always carry an AppHandle.
        let Some(app_handle) = self.app_handle.as_ref() else {
            return Ok(());
        };
        let confirmation_state = app_handle
            .try_state::<ToolConfirmationState>()
            .ok_or_else(|| anyhow!("Access denied: Folder confirmation system is unavailable."))?;

        let mut requested_paths = BTreeSet::new();
        let mut requested_directories = BTreeSet::new();

        for raw_path in raw_paths {
            let resolved = self.resolve_path(&raw_path);
            match self.canonicalize_validated_path(&resolved).await {
                Ok(_) => continue,
                Err(error) => {
                    let message = error.to_string();
                    if message.contains("protected system path")
                        || message.contains("directory traversal")
                    {
                        return Err(error);
                    }
                }
            }

            let (target, directory) = Self::resolve_folder_consent_target(resolved.clone()).await?;
            requested_paths.insert(target.to_string_lossy().to_string());
            requested_directories.insert(directory.to_string_lossy().to_string());
        }

        if requested_paths.is_empty() {
            return Ok(());
        }

        let capabilities = Self::folder_capabilities_for_tool(tool_name);
        let request = ToolConfirmationRequest {
            request_id: format!("folder-access:{}:{}", action_id, Uuid::new_v4()),
            tool_name: FOLDER_ACCESS_TOOL_NAME.to_string(),
            tool_description: format!(
                "Allow {} to access new folders",
                tool_name.replace('_', " ")
            ),
            parameters: json!({
                "requesting_tool": tool_name,
                "paths": requested_paths,
                "directories": requested_directories,
                "capabilities": capabilities,
            }),
            risk_level: RiskLevel::High,
            safety_tier: ToolSafetyTier::RequiresExplicitApproval,
            reason:
                "The agent requested local paths that are outside your current Allowed Directories."
                    .to_string(),
            reversible: true,
            undo_description: Some(
                "Persistent folders can be removed in Settings → Allowed Directories.".to_string(),
            ),
        };

        let approved = request_folder_access_confirmation(
            app_handle,
            &confirmation_state,
            request,
            TOOL_CONFIRMATION_TIMEOUT_SECS,
        )
        .await
        .map_err(|error| anyhow!(error))?;
        if !approved {
            return Err(anyhow!(
                "You declined access to the requested local folders."
            ));
        }

        // Re-check the real enforcement boundary after approval. This catches
        // persistence/state failures and guarantees the tool never runs merely
        // because the renderer displayed an Allow decision.
        for requested in requested_paths {
            self.canonicalize_validated_path(&requested).await?;
        }

        Ok(())
    }

    async fn validate_path(&self, path_str: &str) -> Result<()> {
        self.canonicalize_validated_path(path_str).await.map(|_| ())
    }

    async fn canonicalize_validated_path(&self, path_str: &str) -> Result<PathBuf> {
        if let Some(app_handle) = &self.app_handle {
            let settings_state = app_handle.state::<SettingsState>();

            // Extract only what's needed and drop the shared settings guard
            // immediately. `SettingsState.settings` is a `tokio::sync::Mutex`
            // shared by ~20 other commands app-wide; a `MutexGuard` is a
            // `Drop` type so it otherwise lives to the end of this block
            // (NLL doesn't shorten it), and the blocking filesystem work
            // below must not run while holding an app-wide async mutex.
            let configured_dirs: Vec<String> = {
                let settings = settings_state.settings.lock().await;
                settings.allowed_directories.clone()
            };

            let mut allowed = if configured_dirs.is_empty() {
                let mut defaults = Vec::new();

                if let Some(ref project_folder) = self.project_folder {
                    defaults.push(PathBuf::from(project_folder));
                }
                if let Ok(cwd) = std::env::current_dir() {
                    defaults.push(cwd);
                }
                defaults.push(std::env::temp_dir());

                defaults
            } else {
                configured_dirs
                    .iter()
                    .map(PathBuf::from)
                    .collect::<Vec<_>>()
            };
            if let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() {
                allowed.extend(confirmation_state.get_session_allowed_paths());
            }
            allowed.sort();
            allowed.dedup();

            if allowed.is_empty() {
                return Err(anyhow!("Access denied: No allowed directories configured."));
            }

            // `std::fs::canonicalize` is a blocking syscall (symlink/metadata
            // resolution) that can stall arbitrarily long on slow/networked/
            // FUSE mounts or long symlink chains. Run all of it on the
            // blocking pool instead of the async runtime's worker threads
            // (mirrors the existing `spawn_blocking` usage elsewhere in this
            // file, e.g. the PDF-extraction path).
            let path_str_owned = path_str.to_string();
            let (allowed_canonical, canonical_path) = tokio::task::spawn_blocking(move || {
                let allowed_canonical = allowed
                    .into_iter()
                    .map(|dir| std::fs::canonicalize(&dir).unwrap_or(dir))
                    .collect::<Vec<_>>();

                // Canonicalize the input path to resolve symlinks and .. components.
                // This prevents path traversal via symlinks or relative components.
                let canonical_path = match std::fs::canonicalize(&path_str_owned) {
                    Ok(canon) => canon,
                    Err(_) => {
                        // Path doesn't exist yet (e.g., file_write to a new file).
                        // Canonicalize the parent directory and append the filename.
                        let path = std::path::Path::new(&path_str_owned);
                        if let Some(parent) = path.parent() {
                            match std::fs::canonicalize(parent) {
                                Ok(canon_parent) => {
                                    if let Some(filename) = path.file_name() {
                                        canon_parent.join(filename)
                                    } else {
                                        PathBuf::from(&path_str_owned)
                                    }
                                }
                                Err(_) => PathBuf::from(&path_str_owned),
                            }
                        } else {
                            PathBuf::from(&path_str_owned)
                        }
                    }
                };

                (allowed_canonical, canonical_path)
            })
            .await
            .map_err(|e| anyhow!("Path validation task failed: {}", e))?;

            // Fail closed if the resolved path still contains a `..` component. The
            // fallback arms above can return an UN-canonicalized path (e.g. when an
            // intermediate directory does not exist yet for a new-file write), and
            // `starts_with` is component-prefix based — so `<allowed>/x/../../../etc/..`
            // would otherwise pass the allowed-dir check and the OS would resolve the
            // `..` at write time, escaping the sandbox. Mirrors the `..` rejection on
            // the direct command path (sys/commands/file_ops.rs).
            if canonical_path
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir))
            {
                return Err(anyhow!(
                    "Access denied: Path '{}' contains directory traversal ('..').",
                    path_str
                ));
            }

            // Hard denylist: even inside an allowed directory, the agent's file
            // tools must never touch sensitive credential/secret paths (~/.ssh,
            // ~/.aws/credentials, ~/.gnupg, browser cookies, shell history, …).
            // The direct command path (sys/commands/file_ops.rs) already enforces
            // this; the LLM-tool path previously did not. The denylist is scoped to
            // secrets, so ordinary workspace files (incl. project .env) are unaffected.
            if crate::sys::security::blocked_paths::is_blocked(&canonical_path) {
                return Err(anyhow!(
                    "Access denied: Path '{}' is a protected system path.",
                    path_str
                ));
            }

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

        #[cfg(test)]
        {
            let mut allowed = Vec::new();
            if let Some(ref project_folder) = self.project_folder {
                allowed.push(PathBuf::from(project_folder));
            }
            allowed.push(std::env::temp_dir());

            let path = Path::new(path_str);
            let canonical_path = match std::fs::canonicalize(path) {
                Ok(canonical) => canonical,
                Err(_) => {
                    if let Some(parent) = path.parent() {
                        match std::fs::canonicalize(parent) {
                            Ok(canonical_parent) => path
                                .file_name()
                                .map(|file_name| canonical_parent.join(file_name))
                                .unwrap_or(canonical_parent),
                            Err(_) => PathBuf::from(path_str),
                        }
                    } else {
                        PathBuf::from(path_str)
                    }
                }
            };

            for allowed_dir in allowed {
                let canonical_allowed = std::fs::canonicalize(&allowed_dir).unwrap_or(allowed_dir);
                if canonical_path.starts_with(&canonical_allowed) {
                    return Ok(canonical_path);
                }
            }
        }

        // Fail-closed: reject all file access when no app_handle (and thus
        // no settings/allowed-directories) is available. The old code
        // returned Ok(path) here, silently bypassing the directory check.
        Err(anyhow!(
            "Access denied: Cannot validate path '{}' without application context.",
            path_str
        ))
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

        if let Err(error) = self
            .ensure_folder_access(&tool_call.name, &args, &action_id)
            .await
        {
            let message = error.to_string();
            let metadata_snapshot = serde_json::to_value(&args).unwrap_or(json!({}));
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
                    false,
                );
            }
            return Ok(ToolResult {
                success: false,
                data: json!({
                    "folder_access_denied": true,
                    "success": false,
                }),
                error: Some(message),
                metadata: HashMap::from([
                    ("folder_access_denied".to_string(), json!(true)),
                    ("tool_name".to_string(), json!(tool_call.name)),
                ]),
            });
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
                                "Failed to read file '{}': file is binary or not UTF-8 text. Use file_read_binary to read binary files as base64.",
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

        // MCP connector permission gate (audit C-rank 1: "per-tool connector
        // permissions have no runtime effect"). Runs in EVERY conversation
        // mode, not just "manual" — the block this replaced only gated MCP
        // tools when `conversation_mode == "manual"`, so "auto" mode (the
        // default) executed every MCP tool with zero permission or
        // confirmation check at all, and even the stored per-tool
        // permission (Settings → Connectors) was consulted nowhere in this
        // loop. Mirrors the gate in `sys::commands::mcp::mcp_call_tool` (the
        // direct-invoke Tauri command), which this agent loop never calls.
        if tool_call.name.starts_with("mcp__") {
            if let Some(app_handle) = &self.app_handle {
                if let Some(blocked) = self
                    .enforce_mcp_connector_permission(
                        app_handle,
                        tool_call,
                        &metadata_snapshot,
                        &action_id,
                        start_time,
                    )
                    .await
                {
                    return Ok(blocked);
                }
            }
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

        let mut approved_by_user = false;
        if is_dangerous_tool(&tool_call.name) && self.conversation_mode.as_deref() == Some("manual")
        {
            tracing::warn!(
                "[Security] Dangerous tool '{}' requested in manual mode. Requesting approval.",
                tool_call.name
            );

            // Ask the user and WAIT for the answer.
            //
            // This used to be a fire-and-forget `emit("approval:request", …)`
            // followed immediately by a failed `ToolResult` a few lines below,
            // which made the whole prompt theatre: the tool call had already
            // been refused before the user saw anything, and answering it hit
            // `agent_resolve_approval` -> "Approval {id} not pending", because
            // nothing had ever registered with the controller.
            //
            // `ApprovalController::request_approval` is the mechanism that
            // actually works (see `core/agent/autonomous.rs`): it emits, parks
            // on a oneshot channel, consults the trust store, and returns the
            // user's decision. It is managed Tauri state, so it can be pulled
            // off the app handle this executor already holds — no constructor
            // change needed.
            if let Some(app_handle) = &self.app_handle {
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

                if app_handle
                    .try_state::<crate::core::agent::approval::ApprovalController>()
                    .is_some()
                {
                    let payload = build_tool_approval_payload(
                        &action_id,
                        &tool_call.name,
                        &tool.name,
                        &metadata_snapshot,
                    );
                    let controller =
                        app_handle.state::<crate::core::agent::approval::ApprovalController>();

                    let resolution = match tokio::time::timeout(
                        std::time::Duration::from_secs(TOOL_APPROVAL_TIMEOUT_SECS),
                        controller.request_approval(app_handle, payload),
                    )
                    .await
                    {
                        Ok(Ok(res)) => res,
                        Ok(Err(e)) => {
                            tracing::warn!(
                                "[Security] Approval request failed for {}: {}",
                                tool.name,
                                e
                            );
                            crate::core::agent::approval::ApprovalResolution::Rejected {
                                reason: Some(format!("Approval request failed: {}", e)),
                            }
                        }
                        Err(_) => {
                            tracing::warn!(
                                "[Security] Approval timed out after {}s for {}",
                                TOOL_APPROVAL_TIMEOUT_SECS,
                                tool.name
                            );
                            crate::core::agent::approval::ApprovalResolution::Rejected {
                                reason: Some(format!(
                                    "Approval timed out after {}s",
                                    TOOL_APPROVAL_TIMEOUT_SECS
                                )),
                            }
                        }
                    };

                    // Approved: fall through to normal execution below instead
                    // of returning the blocked result.
                    if let crate::core::agent::approval::ApprovalResolution::Approved { .. } =
                        resolution
                    {
                        tracing::info!(
                            "[Security] User approved dangerous tool '{}'; executing.",
                            tool_call.name
                        );
                        approved_by_user = true;
                    }
                } else {
                    // No controller managed (headless/test builds): keep the
                    // historical fail-closed behavior rather than silently
                    // running a dangerous tool.
                    tracing::warn!(
                        "[Security] ApprovalController unavailable; refusing '{}' in manual mode.",
                        tool_call.name
                    );
                }
            }

            if approved_by_user {
                // Approved — skip the blocked-result return and let the normal
                // execution path below run the tool.
            } else {
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
            "file_read_binary" => self.execute_file_read_binary_tool(&args).await,
            "file_read_range" => self.execute_file_read_range_tool(&args).await,
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
            "document_edit_excel" => self.execute_document_edit_excel_tool(&args, &tool.id).await,
            "document_create_pdf" => self.execute_document_create_pdf_tool(&args, &tool.id).await,
            "create_artifact" => self.execute_create_artifact_tool(&args, &tool.id).await,
            "image_analyze" => self.execute_image_analyze_tool(&args).await,
            "git_status" => self.execute_git_status_tool(&args).await,
            "git_diff" => self.execute_git_diff_tool(&args).await,
            "git_log" => self.execute_git_log_tool(&args).await,
            "git_list_branches" => self.execute_git_list_branches_tool(&args).await,
            "git_commit" => self.execute_git_commit_tool(&args).await,
            "git_clone" => self.execute_git_clone_tool(&args).await,
            "git_add" => self.execute_git_add_tool(&args).await,
            "worktree_create" => self.execute_worktree_create_tool(&args).await,
            "worktree_list" => self.execute_worktree_list_tool(&args).await,
            "worktree_remove" => self.execute_worktree_remove_tool(&args).await,
            "undo_get_summary" => self.execute_undo_get_summary_tool(&args).await,
            "undo_get_changes" => self.execute_undo_get_changes_tool(&args).await,
            "undo_last" => self.execute_undo_last_tool(&args).await,
            "undo_change" => self.execute_undo_change_tool(&args).await,
            "coding_checkpoint_create" => self.execute_coding_checkpoint_create_tool(&args).await,
            "coding_checkpoint_list" => self.execute_coding_checkpoint_list_tool(&args).await,
            "coding_checkpoint_rewind" => self.execute_coding_checkpoint_rewind_tool(&args).await,
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
            "conversation_search" => self.execute_conversation_search_tool(&args, &tool.id).await,
            "recent_chats" => self.execute_recent_chats_tool(&args, &tool.id).await,
            "background_agent_start" => {
                self.execute_background_agent_start_tool(&args, action_id)
                    .await
            }
            "background_agent_get" => self.execute_background_agent_get_tool(&args).await,
            "background_agent_cancel" => self.execute_background_agent_cancel_tool(&args).await,
            "browser_click" => self.execute_browser_tool("browser_click", args).await,
            "browser_extract" => self.execute_browser_tool("browser_extract", args).await,
            "api_download" => self.execute_api_download_tool(&args).await,
            "api_upload" => self.execute_api_upload_tool(&args).await,
            "git_init" => self.execute_git_init_tool(&args).await,
            "github_create_repo" => self.execute_github_create_repo_tool(&args).await,
            "physical_scrape" => self.execute_physical_scrape_tool(&args).await,
            "todo_write" => self.execute_todo_write_tool(&args).await,
            "question" => self.execute_question_tool(&args).await,
            "tool_search" => self.execute_tool_search_tool(&args).await,
            "skill" => self.execute_skill_tool(&args).await,
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

    /// Resolve and enforce the per-tool connector permission for an MCP tool
    /// call before it reaches `execute_mcp_tool`. Returns `Some(ToolResult)`
    /// when the call must be short-circuited (blocked outright, the
    /// confirmation system is unavailable, or the user declined the
    /// dialog); returns `None` when the call is cleared to proceed (either
    /// "always allow" or the user approved).
    ///
    /// Resolves `(server_name, tool_name)` via the MCP tool registry — not a
    /// hand-rolled decode — and maps `server_name` (e.g. "connector-github")
    /// back to the connector catalog id (e.g. "github") that
    /// `connectorPermissionStore.ts` writes permissions under, mirroring the
    /// same fix applied to `sys::commands::mcp::mcp_call_tool`.
    async fn enforce_mcp_connector_permission(
        &self,
        app_handle: &tauri::AppHandle,
        tool_call: &ToolCall,
        metadata_snapshot: &Value,
        action_id: &str,
        start_time: Instant,
    ) -> Option<ToolResult> {
        use crate::sys::commands::connector_permissions::{
            encryption_from_state, resolve_permission, PermissionLevel,
        };
        use crate::sys::commands::master_password::MasterPasswordState;
        use crate::sys::commands::mcp::McpState;
        use crate::sys::commands::mcp_oauth::connector_id_for_server_name;
        use crate::sys::security::tool_guard::{RiskLevel, ToolConfirmationRequest};

        let mcp_state = match app_handle.try_state::<McpState>() {
            Some(s) => s,
            None => {
                // Fail closed, mirroring `check_safety_tier_and_confirm`'s
                // handling of a missing `ToolConfirmationState`: an MCP call
                // must never bypass the permission gate just because the
                // subsystem it needs to check against isn't wired up.
                let message = format!(
                    "Cannot execute '{}': MCP subsystem unavailable.",
                    tool_call.name
                );
                self.emit_tool_action(
                    action_id,
                    &tool_call.name,
                    "blocked",
                    metadata_snapshot,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(
                    action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                emit_tool_error(
                    app_handle,
                    action_id,
                    &message,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                return Some(ToolResult {
                    success: false,
                    data: json!({ "error": message }),
                    error: Some(message),
                    metadata: HashMap::from([("tool_name".to_string(), json!(tool_call.name))]),
                });
            }
        };

        let (server_name, tool_name) = match mcp_state.registry.resolve_tool_id(&tool_call.name) {
            Ok(pair) => pair,
            // Unresolvable tool id — let `execute_mcp_tool` produce its own
            // "tool not found"-shaped error instead of duplicating it here.
            Err(_) => return None,
        };

        let connector_id = connector_id_for_server_name(&server_name)
            .map(|s| s.to_string())
            .unwrap_or_else(|| server_name.clone());

        let mp_state = match app_handle.try_state::<MasterPasswordState>() {
            Some(s) => s,
            None => {
                let message = format!(
                    "Cannot execute '{}': connector permission store unavailable.",
                    tool_name
                );
                self.emit_tool_action(
                    action_id,
                    &tool_call.name,
                    "blocked",
                    metadata_snapshot,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(
                    action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                emit_tool_error(
                    app_handle,
                    action_id,
                    &message,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                return Some(ToolResult {
                    success: false,
                    data: json!({ "error": message }),
                    error: Some(message),
                    metadata: HashMap::from([("tool_name".to_string(), json!(tool_call.name))]),
                });
            }
        };
        let enc = encryption_from_state(&mp_state);

        let is_destructive = tool_name.contains("delete")
            || tool_name.contains("write")
            || tool_name.contains("create")
            || tool_name.contains("update")
            || tool_name.contains("remove");

        let perm = resolve_permission(&enc, &connector_id, &tool_name, is_destructive);

        match perm {
            PermissionLevel::Blocked => {
                let message = format!(
                    "Tool '{}' is blocked by your connector permission settings. Change the permission in Settings → Connectors to allow it.",
                    tool_name
                );
                tracing::warn!(
                    "[ToolExecutor] MCP tool '{}' blocked by connector permission policy (connector='{}')",
                    tool_call.name,
                    connector_id
                );
                self.emit_tool_action(
                    action_id,
                    &tool_call.name,
                    "blocked",
                    metadata_snapshot,
                    Some(message.clone()),
                );
                self.emit_tool_metrics(
                    action_id,
                    &tool_call.name,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                emit_tool_error(
                    app_handle,
                    action_id,
                    &message,
                    start_time.elapsed().as_millis() as u64,
                    false,
                );
                Some(ToolResult {
                    success: false,
                    data: json!({ "error": message, "connector_permission_blocked": true }),
                    error: Some(message),
                    metadata: HashMap::from([
                        ("tool_name".to_string(), json!(tool_call.name)),
                        ("connector_permission_blocked".to_string(), json!(true)),
                    ]),
                })
            }
            PermissionLevel::AlwaysAllow => {
                tracing::debug!(
                    "[ToolExecutor] MCP tool '{}' auto-approved by connector permission policy (connector='{}')",
                    tool_call.name,
                    connector_id
                );
                None
            }
            PermissionLevel::NeedsApproval => {
                let confirmation_state = match app_handle.try_state::<ToolConfirmationState>() {
                    Some(s) => s,
                    None => {
                        let message = format!(
                            "Cannot execute '{}': safety confirmation system unavailable.",
                            tool_name
                        );
                        self.emit_tool_action(
                            action_id,
                            &tool_call.name,
                            "blocked",
                            metadata_snapshot,
                            Some(message.clone()),
                        );
                        self.emit_tool_metrics(
                            action_id,
                            &tool_call.name,
                            start_time.elapsed().as_millis() as u64,
                            false,
                        );
                        emit_tool_error(
                            app_handle,
                            action_id,
                            &message,
                            start_time.elapsed().as_millis() as u64,
                            false,
                        );
                        return Some(ToolResult {
                            success: false,
                            data: json!({ "error": message }),
                            error: Some(message),
                            metadata: HashMap::from([(
                                "tool_name".to_string(),
                                json!(tool_call.name),
                            )]),
                        });
                    }
                };

                let confirmation = ToolConfirmationRequest {
                    request_id: action_id.to_string(),
                    tool_name: tool_call.name.clone(),
                    tool_description: format!(
                        "Execute MCP tool '{}' on server '{}'",
                        tool_name, server_name
                    ),
                    parameters: metadata_snapshot.clone(),
                    risk_level: RiskLevel::High,
                    safety_tier: ToolSafetyTier::RequiresExplicitApproval,
                    reason: "MCP tools can access system resources and external APIs.".to_string(),
                    reversible: false,
                    undo_description: None,
                };

                let approved = match request_tool_confirmation(
                    app_handle,
                    &confirmation_state,
                    confirmation,
                    TOOL_CONFIRMATION_TIMEOUT_SECS,
                )
                .await
                {
                    Ok(approved) => approved,
                    Err(e) => {
                        let message = format!(
                            "Couldn't get your confirmation for '{}': {}. Please try again.",
                            tool_name, e
                        );
                        self.emit_tool_action(
                            action_id,
                            &tool_call.name,
                            "blocked",
                            metadata_snapshot,
                            Some(message.clone()),
                        );
                        self.emit_tool_metrics(
                            action_id,
                            &tool_call.name,
                            start_time.elapsed().as_millis() as u64,
                            false,
                        );
                        emit_tool_error(
                            app_handle,
                            action_id,
                            &message,
                            start_time.elapsed().as_millis() as u64,
                            true,
                        );
                        return Some(ToolResult {
                            success: false,
                            data: json!({ "error": message, "confirmation_denied": true }),
                            error: Some(message),
                            metadata: HashMap::from([
                                ("requires_confirmation".to_string(), json!(true)),
                                ("tool_name".to_string(), json!(tool_call.name)),
                            ]),
                        });
                    }
                };

                if approved {
                    None
                } else {
                    let message = format!("You declined to run '{}'.", tool_name);
                    self.emit_tool_action(
                        action_id,
                        &tool_call.name,
                        "blocked",
                        metadata_snapshot,
                        Some(message.clone()),
                    );
                    self.emit_tool_metrics(
                        action_id,
                        &tool_call.name,
                        start_time.elapsed().as_millis() as u64,
                        false,
                    );
                    emit_tool_error(
                        app_handle,
                        action_id,
                        &message,
                        start_time.elapsed().as_millis() as u64,
                        true,
                    );
                    Some(ToolResult {
                        success: false,
                        data: json!({ "error": message, "confirmation_denied": true }),
                        error: Some(message),
                        metadata: HashMap::from([
                            ("requires_confirmation".to_string(), json!(true)),
                            ("tool_name".to_string(), json!(tool_call.name)),
                        ]),
                    })
                }
            }
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
        let confirmation_state = match app_handle.try_state::<ToolConfirmationState>() {
            Some(state) => state,
            None => {
                tracing::error!(
                    "[ToolExecutor] ToolConfirmationState not available — fail-closed for '{}'",
                    tool_name
                );
                return Err(anyhow!(
                    "Cannot execute '{}': safety confirmation system unavailable.",
                    tool_name
                ));
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
                                format!(
                                    "\"{}...\"",
                                    &s[..crate::core::agi::floor_char_boundary(s, 27)]
                                )
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
