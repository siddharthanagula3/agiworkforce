use crate::core::agi::tools::{Tool, ToolRegistry, ToolResult};
use crate::core::llm::job_autofill_runtime::build_job_autofill_eval_script;
use crate::core::llm::{ToolCall, ToolDefinition};
use crate::sys::commands::chat::{has_pending_messages, peek_pending_messages};
use crate::sys::commands::settings::SettingsState;
use crate::sys::commands::tool_confirmation::{request_tool_confirmation, ToolConfirmationState};
use crate::sys::commands::undo::UndoState;
#[allow(unused_imports)]
use crate::sys::security::tool_guard::SecurityError;
#[allow(unused_imports)]
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
use std::path::Path;
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
#[allow(dead_code)]
const TOOL_CONFIRMATION_TIMEOUT_SECS: u64 = 120;
const MCP_TOOL_TIMEOUT_MS: u64 = 120_000; // 120s: MCP tool calls may involve remote APIs, I/O, and browser/runtime startup
const FILE_LIST_TIMEOUT_MS: u64 = 30_000; // Increased from 10s: large dirs and network filesystems
const FILE_LIST_MAX_LIMIT: usize = 2_000;
const FILE_LIST_DEFAULT_LIMIT: usize = 500;
const FILE_LIST_MAX_OFFSET: usize = 100_000;
const FILE_READ_MAX_CHARS: usize = 200_000;
const FILE_LIST_DEFAULT_EXCLUDES: &[&str] =
    &[".git", "node_modules", "dist", "build", ".next", "target"];

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
            "search_web" | "api_call" | "web_fetch" | "llm_reason" => self.fast,

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
            | "db_transaction_rollback" => self.medium,

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

    fn build_job_autofill_profile(
        args: &HashMap<String, Value>,
    ) -> Result<serde_json::Map<String, Value>> {
        let mut profile = Self::parse_object_argument(args, "profile").unwrap_or_default();

        let canonical_fields = [
            "firstName",
            "lastName",
            "fullName",
            "email",
            "phone",
            "locationCity",
            "locationState",
            "locationCountry",
            "linkedinUrl",
            "githubUrl",
            "portfolioUrl",
            "websiteUrl",
            "currentCompany",
            "currentTitle",
            "yearsOfExperience",
            "workAuthorization",
            "requiresSponsorship",
            "salaryExpectation",
            "resumeText",
            "coverLetterText",
            "customAnswers",
            "files",
        ];

        for key in canonical_fields {
            if profile.contains_key(key) {
                continue;
            }
            if let Some(value) = args.get(key) {
                if Self::value_is_present(value) {
                    profile.insert(key.to_string(), value.clone());
                }
            }
        }

        let aliases = [
            ("first_name", "firstName"),
            ("last_name", "lastName"),
            ("full_name", "fullName"),
            ("location_city", "locationCity"),
            ("location_state", "locationState"),
            ("location_country", "locationCountry"),
            ("linkedin_url", "linkedinUrl"),
            ("github_url", "githubUrl"),
            ("portfolio_url", "portfolioUrl"),
            ("website_url", "websiteUrl"),
            ("current_company", "currentCompany"),
            ("current_title", "currentTitle"),
            ("years_of_experience", "yearsOfExperience"),
            ("work_authorization", "workAuthorization"),
            ("requires_sponsorship", "requiresSponsorship"),
            ("salary_expectation", "salaryExpectation"),
            ("resume_text", "resumeText"),
            ("cover_letter_text", "coverLetterText"),
            ("custom_answers", "customAnswers"),
        ];

        for (alias_key, canonical_key) in aliases {
            if profile.contains_key(canonical_key) {
                continue;
            }
            if let Some(value) = args.get(alias_key) {
                if Self::value_is_present(value) {
                    profile.insert(canonical_key.to_string(), value.clone());
                }
            }
        }

        if profile.is_empty() {
            return Err(anyhow!(
                "Missing profile parameter. Provide a 'profile' object with fields like firstName/email/phone."
            ));
        }

        Ok(profile)
    }

    fn build_job_autofill_options(args: &HashMap<String, Value>) -> serde_json::Map<String, Value> {
        let mut options = Self::parse_object_argument(args, "options").unwrap_or_default();

        let canonical_fields = [
            "platform",
            "autoSubmit",
            "allowSubmitWithMissingRequired",
            "includeOptionalFields",
            "delayMs",
            "maxSubmitSteps",
        ];

        for key in canonical_fields {
            if options.contains_key(key) {
                continue;
            }
            if let Some(value) = args.get(key) {
                if Self::value_is_present(value) {
                    options.insert(key.to_string(), value.clone());
                }
            }
        }

        let aliases = [
            ("auto_submit", "autoSubmit"),
            (
                "allow_submit_with_missing_required",
                "allowSubmitWithMissingRequired",
            ),
            ("include_optional_fields", "includeOptionalFields"),
            ("delay_ms", "delayMs"),
            ("max_submit_steps", "maxSubmitSteps"),
        ];

        for (alias_key, canonical_key) in aliases {
            if options.contains_key(canonical_key) {
                continue;
            }
            if let Some(value) = args.get(alias_key) {
                if Self::value_is_present(value) {
                    options.insert(canonical_key.to_string(), value.clone());
                }
            }
        }

        options
    }

    async fn attach_job_profile_file_from_path(
        &self,
        profile: &mut serde_json::Map<String, Value>,
        args: &HashMap<String, Value>,
        path_key: &str,
        data_key: &str,
        file_name_key: &str,
        default_file_name: &str,
    ) -> Result<()> {
        let Some(path) = args
            .get(path_key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Ok(());
        };

        self.validate_path(path).await?;
        let (data_url, file_name) =
            crate::core::llm::job_autofill_runtime::encode_file_as_data_url(
                path,
                default_file_name,
            )
            .await
            .map_err(|e| anyhow!("Failed to encode {} '{}': {}", path_key, path, e))?;

        let files_value = profile
            .entry("files".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if !files_value.is_object() {
            *files_value = Value::Object(serde_json::Map::new());
        }

        if let Some(files) = files_value.as_object_mut() {
            files
                .entry(data_key.to_string())
                .or_insert_with(|| Value::String(data_url));
            files
                .entry(file_name_key.to_string())
                .or_insert_with(|| Value::String(file_name));
        }

        Ok(())
    }

    async fn execute_browser_tool(
        &self,
        tool_id: &str,
        args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        use crate::automation::browser::dom_operations::{
            ClickOptions, DomOperations, TypeOptions,
        };
        use crate::automation::browser::NavigationOptions;
        use crate::sys::commands::BrowserStateWrapper;
        use tauri::Manager;

        let app = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("App handle not available for browser automation"))?;
        let browser_state = app.state::<BrowserStateWrapper>();

        // Helper to get client by tab_id from args, or fall back to active client
        let get_client = || async {
            let tab_id = args
                .get("tab_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            browser_state
                .get_client_for_tab(tab_id)
                .await
                .map_err(anyhow::Error::msg)
        };

        match tool_id {
            "browser_get_url" => {
                let (client, tab_id) = get_client().await?;
                let url = client.get_url().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "url": url, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_title" => {
                let (client, tab_id) = get_client().await?;
                let title = client.get_title().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "title": title, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_go_back" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .go_back(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_go_forward" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .go_forward(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_reload" => {
                let (client, tab_id) = get_client().await?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;
                tab_manager
                    .lock()
                    .await
                    .reload(&tab_id)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id, "url": client.get_url().await.unwrap_or_default() }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_navigation" => {
                let (client, tab_id) = get_client().await?;
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30000);
                let script = format!(
                    r#"
                    new Promise((resolve, reject) => {{
                        const navTimeout = {};
                        let lastUrl = window.location.href;
                        let resolved = false;

                        const check = () => {{
                            if (window.location.href !== lastUrl) {{
                                resolved = true;
                                resolve({{ newUrl: window.location.href }});
                                return;
                            }}

                            if (!resolved) {{
                                setTimeout(check, 100);
                            }}
                        }};

                        setTimeout(() => {{
                            if (!resolved) {{
                                reject(new Error('Navigation timeout'));
                            }}
                        }}, navTimeout);

                        check();
                    }})
                    "#,
                    timeout_ms
                );
                let result = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "result": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_execute_async_js" => {
                let (client, tab_id) = get_client().await?;
                let script = args
                    .get("script")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing script parameter"))?;
                // For async JS, wrap it in a Promise and await it
                let await_promise = args
                    .get("await_promise")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                let wrapped_script = if await_promise {
                    format!(
                        "new Promise((resolve) => {{ {}; resolve(undefined); }})",
                        script
                    )
                } else {
                    script.to_string()
                };
                let result = client
                    .evaluate(&wrapped_script)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "result": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_element_state" => {
                let (client, tab_id) = get_client().await?;
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let script = format!(
                    r#"
                    (function() {{
                        const el = document.querySelector('{}');
                        if (!el) return {{ error: 'Element not found' }};
                        const rect = el.getBoundingClientRect();
                        return {{
                            visible: rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none',
                            enabled: !el.disabled,
                            checked: el.checked,
                            selected: el.selected,
                            focused: document.activeElement === el,
                            tagName: el.tagName.toLowerCase(),
                            id: el.id,
                            classes: el.className
                        }};
                    }})()
                    "#,
                    selector
                );
                let result = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "state": result, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_interactive" => {
                let (client, tab_id) = get_client().await?;
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30000);
                let script = format!(
                    r#"
                    new Promise((resolve, reject) => {{
                        const timeout = {};
                        const interval = 100;
                        let elapsed = 0;

                        const check = () => {{
                            const el = document.querySelector('{}');
                            if (!el) {{
                                elapsed += interval;
                                if (elapsed >= timeout) {{
                                    reject(new Error('Element not found'));
                                    return;
                                }}
                                setTimeout(check, interval);
                                return;
                            }}

                            const rect = el.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                            const isEnabled = !el.disabled;

                            if (isVisible && isEnabled) {{
                                resolve(true);
                                return;
                            }}

                            elapsed += interval;
                            if (elapsed >= timeout) {{
                                reject(new Error('Timeout waiting for element to be interactive'));
                                return;
                            }}


                            setTimeout(check, interval);
                        }};

                        check();
                    }})
                    "#,
                    timeout_ms, selector
                );
                client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_click" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::click(&client, selector, ClickOptions::default())
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_extract" => {
                let (client, tab_id) = get_client().await?;
                let text = if let Some(selector) = args.get("selector").and_then(|v| v.as_str()) {
                    DomOperations::get_text(&client, selector)
                        .await
                        .map_err(anyhow::Error::msg)?
                } else {
                    DomOperations::get_text(&client, "body")
                        .await
                        .map_err(anyhow::Error::msg)?
                };
                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": text, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_type" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let text = args
                    .get("text")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing text parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::type_text(&client, selector, text, TypeOptions::default())
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_wait_for_selector" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let timeout_ms = args
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(120_000);
                let (client, tab_id) = get_client().await?;
                DomOperations::wait_for_selector(&client, selector, timeout_ms)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_text" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                let text = DomOperations::get_text(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "text": text, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_content" => {
                let (client, tab_id) = get_client().await?;
                let content = client.get_content().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": content, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_dom_snapshot" => {
                let (client, tab_id) = get_client().await?;
                let content = client.get_content().await.map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "html": content, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_get_attribute" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let attribute = args
                    .get("attribute")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing attribute parameter"))?;
                let (client, tab_id) = get_client().await?;
                let value = DomOperations::get_attribute(&client, selector, attribute)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "value": value,
                        "selector": selector,
                        "attribute": attribute,
                        "tab_id": tab_id
                    }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_screenshot" => {
                let (client, tab_id) = get_client().await?;
                let bytes = client
                    .capture_screenshot(false)
                    .await
                    .map_err(anyhow::Error::msg)?;
                use base64::{engine::general_purpose::STANDARD, Engine};
                Ok(ToolResult {
                    success: true,
                    data: json!({ "image_base64": STANDARD.encode(bytes), "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_hover" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::hover(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_focus" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::focus(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_scroll_into_view" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::scroll_into_view(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_query_all" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                let elements = DomOperations::query_all(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                let texts: Vec<String> = elements.into_iter().map(|e| e.text).collect();
                Ok(ToolResult {
                    success: true,
                    data: json!({ "results": texts, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_select_option" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let value = args
                    .get("value")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing value parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::select_option(&client, selector, value)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "value": value, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_check" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::check(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_uncheck" => {
                let selector = args
                    .get("selector")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing selector parameter"))?;
                let (client, tab_id) = get_client().await?;
                DomOperations::uncheck(&client, selector)
                    .await
                    .map_err(anyhow::Error::msg)?;
                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "selector": selector, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            "browser_autofill_job_application" => {
                let (client, tab_id) = get_client().await?;
                let mut profile = Self::build_job_autofill_profile(&args)?;
                self.attach_job_profile_file_from_path(
                    &mut profile,
                    &args,
                    "resume_path",
                    "resumeDataUrl",
                    "resumeFileName",
                    "resume.pdf",
                )
                .await?;
                self.attach_job_profile_file_from_path(
                    &mut profile,
                    &args,
                    "cover_letter_path",
                    "coverLetterDataUrl",
                    "coverLetterFileName",
                    "cover-letter.pdf",
                )
                .await?;

                let options = Self::build_job_autofill_options(&args);
                let timeout_ms = args
                    .get("timeout_ms")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(120_000)
                    .clamp(5_000, 300_000);

                let script = build_job_autofill_eval_script(
                    &Value::Object(profile),
                    &Value::Object(options),
                    timeout_ms,
                )?;

                let response = client.evaluate(&script).await.map_err(anyhow::Error::msg)?;
                let success = response
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let response_error = response
                    .get("error")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string());

                Ok(ToolResult {
                    success,
                    data: json!({
                        "tab_id": tab_id,
                        "platform": response.get("platform").cloned().unwrap_or(Value::Null),
                        "filled_count": response.get("filledCount").cloned().unwrap_or(json!(0)),
                        "skipped_count": response.get("skippedCount").cloned().unwrap_or(json!(0)),
                        "missing_required_fields": response
                            .get("missingRequiredFields")
                            .cloned()
                            .unwrap_or_else(|| json!([])),
                        "submitted": response.get("submitted").cloned().unwrap_or(json!(false)),
                        "steps_advanced": response.get("stepsAdvanced").cloned().unwrap_or(json!(0)),
                        "details": response.get("details").cloned().unwrap_or_else(|| json!({})),
                        "result": response
                    }),
                    error: if success {
                        None
                    } else {
                        Some(response_error.unwrap_or_else(|| {
                            "Job autofill failed in browser context".to_string()
                        }))
                    },
                    metadata: HashMap::from([("tab_id".to_string(), json!(tab_id))]),
                })
            }
            "browser_navigate" => {
                let url = args
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing url parameter"))?;
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(anyhow::Error::msg)?;

                // NOTE: We must NOT hold the outer tab_manager lock while calling
                // TabManager methods that acquire internal locks. This would cause a deadlock
                // because tokio::sync::Mutex is not reentrant.
                // Instead, we drop the guard and re-acquire for each operation.

                // First, list existing tabs
                let tabs = {
                    let guard = tab_manager.lock().await;
                    guard.list_tabs().await.map_err(anyhow::Error::msg)?
                };

                let tab_id = if tabs.is_empty() {
                    // Open a new tab - release outer lock first
                    let guard = tab_manager.lock().await;
                    guard.open_tab(url).await.map_err(anyhow::Error::msg)?
                } else {
                    tabs[0].id.clone()
                };

                // Navigate - release outer lock first
                {
                    let guard = tab_manager.lock().await;
                    guard
                        .navigate(&tab_id, url, NavigationOptions::default())
                        .await
                        .map_err(anyhow::Error::msg)?;
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            _ => Err(anyhow!("Unknown browser tool: {}", tool_id)),
        }
    }

    fn parse_string_array_param(args: &HashMap<String, Value>, key: &str) -> Option<Vec<String>> {
        args.get(key).and_then(|v| {
            v.as_array().map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
        })
    }

    fn should_exclude_file_list_entry(entry_name: &str, excludes: &[String]) -> bool {
        excludes.iter().any(|pat| entry_name == pat)
    }

    fn extract_mcp_text_blocks(result_value: &Value) -> Vec<String> {
        result_value
            .get("content")
            .and_then(Value::as_array)
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|block| {
                        let block_type = block
                            .get("type")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        if !block_type.eq_ignore_ascii_case("text") {
                            return None;
                        }
                        block
                            .get("text")
                            .and_then(Value::as_str)
                            .map(|text| text.to_string())
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    }

    fn normalize_mcp_filesystem_list_directory(
        args: &HashMap<String, Value>,
        result_value: &Value,
    ) -> Option<Value> {
        let path_hint = args.get("path").and_then(Value::as_str).map(str::trim);
        let text_blocks = Self::extract_mcp_text_blocks(result_value);
        if text_blocks.is_empty() {
            return None;
        }

        let mut entries: Vec<Value> = Vec::new();
        for text in text_blocks {
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let (entry_type, rest) = if let Some(rest) = trimmed.strip_prefix("[DIR]") {
                    ("directory", rest.trim())
                } else if let Some(rest) = trimmed.strip_prefix("[FILE]") {
                    ("file", rest.trim())
                } else if let Some(rest) = trimmed.strip_prefix("[SYMLINK]") {
                    ("symlink", rest.trim())
                } else {
                    continue;
                };

                if rest.is_empty() {
                    continue;
                }

                let mut name = rest.to_string();
                if entry_type == "file" {
                    if let Some(size_start) = name.rfind(" (") {
                        if name.ends_with(')') {
                            name.truncate(size_start);
                            name = name.trim().to_string();
                        }
                    }
                }
                if name.is_empty() {
                    continue;
                }

                let full_path = path_hint
                    .map(|base| Path::new(base).join(&name).to_string_lossy().to_string())
                    .unwrap_or_else(|| name.clone());

                entries.push(json!({
                    "name": name,
                    "type": entry_type,
                    "path": full_path,
                    "size": 0
                }));
            }
        }

        if entries.is_empty() {
            return None;
        }

        entries.sort_by(|left, right| {
            let left_name = left
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            let right_name = right
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            left_name.cmp(&right_name)
        });

        let returned = entries.len();
        Some(json!({
            "entries": entries,
            "count": returned,
            "returned": returned,
            "offset": 0,
            "limit": returned,
            "has_more": false,
            "next_offset": Value::Null,
            "path": path_hint,
            "excluded": [],
            "max_depth": 1,
            "source": "mcp_filesystem_list_directory"
        }))
    }

    fn normalize_mcp_filesystem_list_allowed_directories(result_value: &Value) -> Option<Value> {
        let text_blocks = Self::extract_mcp_text_blocks(result_value);
        if text_blocks.is_empty() {
            return None;
        }

        let mut directories: Vec<String> = Vec::new();
        for text in &text_blocks {
            if let Ok(parsed_json) = serde_json::from_str::<Value>(text) {
                if let Some(list) = parsed_json.get("directories").and_then(Value::as_array) {
                    directories.extend(
                        list.iter()
                            .filter_map(Value::as_str)
                            .map(|value| value.trim().to_string())
                            .filter(|value| !value.is_empty()),
                    );
                } else if let Some(list) = parsed_json.as_array() {
                    directories.extend(
                        list.iter()
                            .filter_map(Value::as_str)
                            .map(|value| value.trim().to_string())
                            .filter(|value| !value.is_empty()),
                    );
                }
            }

            for raw_line in text.lines() {
                let mut line = raw_line.trim();
                if line.is_empty() {
                    continue;
                }

                if let Some(rest) = line.strip_prefix("[DIR]") {
                    line = rest.trim();
                }
                if let Some(rest) = line.strip_prefix("- ") {
                    line = rest.trim();
                }
                if let Some(rest) = line.strip_prefix("* ") {
                    line = rest.trim();
                }
                if let Some((prefix, rest)) = line.split_once(':') {
                    if prefix.to_lowercase().contains("allowed director") {
                        line = rest.trim();
                    }
                }

                if line.is_empty() {
                    continue;
                }
                let looks_like_path = line.starts_with('/')
                    || line.starts_with("~/")
                    || line.starts_with("./")
                    || line.starts_with("../")
                    || line.contains(":\\");
                if looks_like_path {
                    directories.push(line.to_string());
                }
            }
        }

        directories.sort();
        directories.dedup();
        if directories.is_empty() {
            return None;
        }

        Some(json!({
            "directories": directories,
            "count": directories.len(),
            "source": "mcp_filesystem_list_allowed_directories"
        }))
    }

    fn normalize_mcp_filesystem_read_text_file(
        args: &HashMap<String, Value>,
        result_value: &Value,
    ) -> Option<Value> {
        let text_blocks = Self::extract_mcp_text_blocks(result_value);
        if text_blocks.is_empty() {
            return None;
        }

        let content = text_blocks.join("\n");
        let path = args
            .get("path")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());

        Some(json!({
            "path": path,
            "content": content,
            "source": "mcp_filesystem_read_text_file"
        }))
    }

    fn normalize_mcp_tool_result(
        tool_name: &str,
        args: &HashMap<String, Value>,
        result_value: Value,
    ) -> Value {
        let normalized_tool_name = tool_name.to_lowercase();
        if !normalized_tool_name.starts_with("mcp__filesystem__") {
            return result_value;
        }

        if normalized_tool_name.ends_with("list_directory")
            || normalized_tool_name.ends_with("list_directory_with_sizes")
        {
            if let Some(normalized) =
                Self::normalize_mcp_filesystem_list_directory(args, &result_value)
            {
                return normalized;
            }
        }

        if normalized_tool_name.ends_with("list_allowed_directories") {
            if let Some(normalized) =
                Self::normalize_mcp_filesystem_list_allowed_directories(&result_value)
            {
                return normalized;
            }
        }

        if normalized_tool_name.ends_with("read_text_file") {
            if let Some(normalized) =
                Self::normalize_mcp_filesystem_read_text_file(args, &result_value)
            {
                return normalized;
            }
        }

        result_value
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
        if let Some(app_handle) = &self.app_handle {
            let settings_state = app_handle.state::<SettingsState>();
            let settings = settings_state.settings.lock().await;

            let mut allowed = if settings.allowed_directories.is_empty() {
                let mut defaults = Vec::new();

                if let Some(ref project_folder) = self.project_folder {
                    defaults.push(project_folder.clone());
                }
                if let Some(home) = dirs::home_dir() {
                    defaults.push(home.to_string_lossy().to_string());
                }
                if let Ok(cwd) = std::env::current_dir() {
                    defaults.push(cwd.to_string_lossy().to_string());
                }
                defaults.push(std::env::temp_dir().to_string_lossy().to_string());

                defaults
            } else {
                settings.allowed_directories.clone()
            };

            if allowed.is_empty() {
                return Err(anyhow!("Access denied: No allowed directories configured."));
            }

            // Canonicalize allowed directories when possible
            for dir in &mut allowed {
                if let Ok(canon) = std::fs::canonicalize(dir.as_str()) {
                    *dir = canon.to_string_lossy().to_string();
                }
            }

            // Canonicalize the input path to resolve symlinks and .. components.
            // This prevents path traversal via symlinks or relative components.
            let path_canonical = match std::fs::canonicalize(path_str) {
                Ok(canon) => canon.to_string_lossy().to_string(),
                Err(_) => {
                    // Path doesn't exist yet (e.g., file_write to a new file).
                    // Canonicalize the parent directory and append the filename.
                    let path = std::path::Path::new(path_str);
                    if let Some(parent) = path.parent() {
                        match std::fs::canonicalize(parent) {
                            Ok(canon_parent) => {
                                if let Some(filename) = path.file_name() {
                                    canon_parent.join(filename).to_string_lossy().to_string()
                                } else {
                                    path_str.replace('\\', "/")
                                }
                            }
                            Err(_) => path_str.replace('\\', "/"),
                        }
                    } else {
                        path_str.replace('\\', "/")
                    }
                }
            };

            let path_normalized = path_canonical.replace('\\', "/");

            for allowed_dir in &allowed {
                let allowed_normalized = allowed_dir.replace('\\', "/");
                if path_normalized.starts_with(&allowed_normalized) {
                    return Ok(());
                }
            }

            return Err(anyhow!(
                "Access denied: Path '{}' is not in allowed directories.",
                path_str
            ));
        }
        Ok(())
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
                .unwrap_or(MCP_TOOL_TIMEOUT_MS)
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
                                    let content = if extracted_text.len() > FILE_READ_MAX_CHARS {
                                        format!(
                                            "{}\n\n... [truncated to first {} chars out of {}]",
                                            &extracted_text[..FILE_READ_MAX_CHARS],
                                            FILE_READ_MAX_CHARS,
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

        // Enforce tool policy validation (allowed tools, parameters, and path rules)
        if let Some(app_handle) = &self.app_handle {
            if let Some(confirmation_state) = app_handle.try_state::<ToolConfirmationState>() {
                if let Err(e) = confirmation_state
                    .tool_guard()
                    .validate_tool_call(&tool_call.name, &metadata_snapshot)
                    .await
                {
                    // MCP tools are dynamic and may not be pre-declared in ToolGuard.
                    // Don't block execution solely because the tool name isn't in the static map.
                    let is_unknown_mcp_tool =
                        is_mcp_tool && matches!(&e, SecurityError::UnauthorizedTool(_));
                    if is_unknown_mcp_tool {
                        tracing::warn!(
                            "[ToolExecutor] MCP tool '{}' is not declared in ToolGuard; allowing dynamic execution",
                            tool_call.name
                        );
                    } else {
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

    async fn execute_terminal_tool(
        &self,
        args: HashMap<String, serde_json::Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        use crate::features::terminal::{get_default_shell, ShellType};
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};

        let command = args
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing command parameter"))?
            .to_string();
        // Use provided cwd, or fall back to project folder if set
        let cwd = args
            .get("cwd")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone());
        // AUDIT-TERMINAL-054 fix: Use system default shell instead of hardcoded bash/powershell
        let default_shell = match get_default_shell() {
            ShellType::PowerShell => "powershell",
            ShellType::Cmd => "cmd",
            ShellType::Zsh => "zsh",
            ShellType::Bash => "bash",
            ShellType::Fish => "fish",
            ShellType::Sh => "sh",
            ShellType::Wsl => "wsl",
            ShellType::GitBash => "gitbash",
        };
        let shell = args
            .get("shell")
            .and_then(|v| v.as_str())
            .unwrap_or(default_shell)
            .to_lowercase();
        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(60_000);

        // Validate command using centralized validator (one-shot mode)
        let validation = ValidationConfig::oneshot().with_correlation_id(tool_id);
        if let Err(e) = validate_command(&command, &validation) {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::new(),
            });
        }

        // Emit progress: starting command
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(
                app_handle,
                tool_id,
                0.1,
                Some(&format!("Running: {}", &command[..command.len().min(50)])),
            );
        }

        if let Some(dir) = &cwd {
            if let Err(e) = self.validate_path(dir).await {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::new(),
                });
            }
        }

        // AUDIT-TERMINAL-065/068 fix: Proper shell routing that honors requested shell
        // and doesn't select powershell.exe on non-Windows for unknown shells
        let (program, mut shell_args): (String, Vec<String>) = match shell.as_str() {
            "cmd" => (
                "cmd.exe".to_string(),
                vec!["/C".to_string(), command.clone()],
            ),
            "bash" => ("bash".to_string(), vec!["-lc".to_string(), command.clone()]),
            "zsh" => ("zsh".to_string(), vec!["-lc".to_string(), command.clone()]),
            "fish" => ("fish".to_string(), vec!["-c".to_string(), command.clone()]),
            "sh" => ("sh".to_string(), vec!["-c".to_string(), command.clone()]),
            "wsl" => (
                "wsl.exe".to_string(),
                vec!["bash".to_string(), "-lc".to_string(), command.clone()],
            ),
            "gitbash" => {
                if cfg!(target_os = "windows") {
                    ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                } else {
                    // Git Bash is Windows-specific; fall back to bash on non-Windows
                    ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                }
            }
            "powershell" | "pwsh" => {
                if cfg!(target_os = "windows") {
                    (
                        "powershell.exe".to_string(),
                        vec![
                            "-NoLogo".to_string(),
                            "-NoProfile".to_string(),
                            "-Command".to_string(),
                            command.clone(),
                        ],
                    )
                } else {
                    (
                        "pwsh".to_string(),
                        vec![
                            "-NoLogo".to_string(),
                            "-NoProfile".to_string(),
                            "-Command".to_string(),
                            command.clone(),
                        ],
                    )
                }
            }
            _ => {
                // AUDIT-TERMINAL-068 fix: Don't silently fall back to powershell.exe
                // Use system default shell for unknown shells instead
                let default_shell_type = get_default_shell();
                match default_shell_type {
                    ShellType::PowerShell => {
                        if cfg!(target_os = "windows") {
                            (
                                "powershell.exe".to_string(),
                                vec![
                                    "-NoLogo".to_string(),
                                    "-NoProfile".to_string(),
                                    "-Command".to_string(),
                                    command.clone(),
                                ],
                            )
                        } else {
                            (
                                "pwsh".to_string(),
                                vec![
                                    "-NoLogo".to_string(),
                                    "-NoProfile".to_string(),
                                    "-Command".to_string(),
                                    command.clone(),
                                ],
                            )
                        }
                    }
                    ShellType::Bash => {
                        ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                    }
                    ShellType::Zsh => ("zsh".to_string(), vec!["-lc".to_string(), command.clone()]),
                    ShellType::Fish => {
                        ("fish".to_string(), vec!["-c".to_string(), command.clone()])
                    }
                    ShellType::Sh => ("sh".to_string(), vec!["-c".to_string(), command.clone()]),
                    ShellType::Cmd => (
                        "cmd.exe".to_string(),
                        vec!["/C".to_string(), command.clone()],
                    ),
                    ShellType::Wsl => (
                        "wsl.exe".to_string(),
                        vec!["bash".to_string(), "-lc".to_string(), command.clone()],
                    ),
                    ShellType::GitBash => {
                        ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                    }
                }
            }
        };

        let mut cmd = Command::new(&program);
        for arg in shell_args.drain(..) {
            cmd.arg(arg);
        }
        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.kill_on_drop(true);

        // Emit progress: process spawned
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(app_handle, tool_id, 0.3, Some("Process started"));
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn shell: {}", e))?;
        let stdout_handle = child.stdout.take();
        let stderr_handle = child.stderr.take();

        let stdout_app_handle = self.app_handle.clone();
        let stdout_tool_id = tool_id.to_string();
        let stdout_task = tokio::spawn(async move {
            let mut collected = Vec::new();
            if let Some(mut stdout) = stdout_handle {
                let mut chunk = vec![0u8; 1024];
                loop {
                    let read = stdout.read(&mut chunk).await?;
                    if read == 0 {
                        break;
                    }
                    collected.extend_from_slice(&chunk[..read]);
                    if let Some(app_handle) = &stdout_app_handle {
                        let text = String::from_utf8_lossy(&chunk[..read]).to_string();
                        if !text.is_empty() {
                            emit_tool_output_chunk(
                                app_handle,
                                &stdout_tool_id,
                                &text,
                                OutputChunkType::Stdout,
                                false,
                            );
                        }
                    }
                }
            }
            Ok::<Vec<u8>, std::io::Error>(collected)
        });

        let stderr_app_handle = self.app_handle.clone();
        let stderr_tool_id = tool_id.to_string();
        let stderr_task = tokio::spawn(async move {
            let mut collected = Vec::new();
            if let Some(mut stderr) = stderr_handle {
                let mut chunk = vec![0u8; 1024];
                loop {
                    let read = stderr.read(&mut chunk).await?;
                    if read == 0 {
                        break;
                    }
                    collected.extend_from_slice(&chunk[..read]);
                    if let Some(app_handle) = &stderr_app_handle {
                        let text = String::from_utf8_lossy(&chunk[..read]).to_string();
                        if !text.is_empty() {
                            emit_tool_output_chunk(
                                app_handle,
                                &stderr_tool_id,
                                &text,
                                OutputChunkType::Stderr,
                                false,
                            );
                        }
                    }
                }
            }
            Ok::<Vec<u8>, std::io::Error>(collected)
        });

        let start = Instant::now();
        let status = match timeout(TokioDuration::from_millis(timeout_ms), child.wait()).await {
            Ok(result) => result.map_err(|e| anyhow!("Failed to wait for command: {}", e))?,
            Err(_) => {
                let timeout_error = format!("Command timed out after {} ms", timeout_ms);

                if let Err(e) = child.kill().await {
                    tracing::warn!("Failed to kill timed-out process: {}", e);
                }

                match timeout(TokioDuration::from_millis(1000), child.wait()).await {
                    Ok(Ok(_status)) => {
                        tracing::debug!("Process terminated gracefully after timeout");
                    }
                    Ok(Err(e)) => {
                        tracing::warn!("Error waiting for process termination: {}", e);
                    }
                    Err(_) => {
                        tracing::warn!(
                            "Process did not terminate gracefully, will be force-killed"
                        );
                    }
                }

                stdout_task.abort();
                stderr_task.abort();

                if let Some(app_handle) = &self.app_handle {
                    let terminal_event = TerminalCommand {
                        id: Uuid::new_v4().to_string(),
                        command: command.clone(),
                        cwd: cwd.clone().unwrap_or_else(|| ".".to_string()),
                        exit_code: None,
                        stdout: None,
                        stderr: Some(timeout_error.clone()),
                        duration: Some(timeout_ms),
                        session_id: None,
                        agent_id: None,
                    };
                    emit_terminal_command(app_handle, terminal_event);
                }
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": timeout_error.clone(), "success": false }),
                    error: Some(timeout_error),
                    metadata: HashMap::new(),
                });
            }
        };

        let stdout = stdout_task
            .await
            .map_err(|e| anyhow!("Failed to join stdout reader: {}", e))?
            .map_err(|e| anyhow!("Failed to read stdout: {}", e))?;
        let stderr = stderr_task
            .await
            .map_err(|e| anyhow!("Failed to join stderr reader: {}", e))?
            .map_err(|e| anyhow!("Failed to read stderr: {}", e))?;
        let output = std::process::Output {
            status,
            stdout,
            stderr,
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code();
        let success = output.status.success();

        // Emit progress: command completed, processing output
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(app_handle, tool_id, 0.8, Some("Processing output..."));
        }

        if let Some(app_handle) = &self.app_handle {
            let terminal_event = TerminalCommand {
                id: Uuid::new_v4().to_string(),
                command: command.clone(),
                cwd: cwd.clone().unwrap_or_else(|| ".".to_string()),
                exit_code,
                stdout: if stdout.is_empty() {
                    None
                } else {
                    Some(stdout.clone())
                },
                stderr: if stderr.is_empty() {
                    None
                } else {
                    Some(stderr.clone())
                },
                duration: Some(duration_ms),
                session_id: None,
                agent_id: None,
            };
            emit_terminal_command(app_handle, terminal_event);

            // Final progress update
            emit_tool_progress(app_handle, tool_id, 1.0, Some("Complete"));
        }

        let mut metadata = HashMap::new();
        metadata.insert("shell".to_string(), json!(shell));
        metadata.insert("program".to_string(), json!(program));
        if let Some(dir) = &cwd {
            metadata.insert("cwd".to_string(), json!(dir));
        }

        let error_message = if success {
            None
        } else {
            let trimmed = stderr.trim();
            if trimmed.is_empty() {
                Some(match exit_code {
                    Some(code) => format!("Command exited with code {}", code),
                    None => "Command exited with error".to_string(),
                })
            } else {
                Some(trimmed.to_string())
            }
        };

        // Record terminal command execution for undo tracking (non-reversible but tracked)
        if success {
            if let Some(app_handle) = &self.app_handle {
                if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                    let task_id = Uuid::new_v4().to_string();
                    let working_dir = cwd.clone().unwrap_or_else(|| ".".to_string());
                    let _ = undo_state
                        .change_tracker
                        .record_tool_executed(
                            "terminal_execute".to_string(),
                            json!({ "command": command, "cwd": working_dir, "shell": shell }),
                            json!({
                                "stdout": &stdout,
                                "stderr": &stderr,
                                "exitCode": exit_code,
                                "durationMs": duration_ms,
                            }),
                            task_id,
                            None, // Terminal commands are not automatically reversible
                            None,
                            None,
                        )
                        .await;
                }
            }
        }

        Ok(ToolResult {
            success,
            data: json!({
                "command": command,
                "stdout": stdout,
                "stderr": stderr,
                "exitCode": exit_code,
                "durationMs": duration_ms,
            }),
            error: error_message,
            metadata,
        })
    }

    /// Expand tilde (~) to home directory in path strings.
    /// This is needed because the MCP filesystem server doesn't expand tilde.
    fn expand_tilde_in_args(args: &mut HashMap<String, Value>) {
        let path_fields = ["path", "file_path", "directory", "dir", "root"];
        if let Some(home) = dirs::home_dir() {
            let home_str = home.to_string_lossy().to_string();
            for field in &path_fields {
                if let Some(value) = args.get_mut(*field) {
                    if let Some(path_str) = value.as_str().map(str::trim) {
                        if path_str.starts_with('~') {
                            let expanded = path_str.trim_start_matches('~').trim_start_matches('/');
                            let new_path = if expanded.is_empty() {
                                home_str.clone()
                            } else {
                                format!("{}/{}", home_str, expanded)
                            };
                            *value = json!(new_path);
                        }
                    }
                }
            }
        }
    }

    async fn execute_mcp_tool(
        &self,
        tool_call: &ToolCall,
        mut args: HashMap<String, serde_json::Value>,
    ) -> Result<ToolResult> {
        use crate::sys::commands::McpState;

        // Expand tilde (~) in path arguments before calling MCP server
        // The MCP filesystem server doesn't expand tilde, so we need to do it here
        Self::expand_tilde_in_args(&mut args);

        let mcp_state = self
            .app_handle
            .as_ref()
            .and_then(|h| h.try_state::<McpState>())
            .ok_or_else(|| anyhow!("MCP state not available"))?;
        let normalization_args = args.clone();

        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(MCP_TOOL_TIMEOUT_MS)
            .min(300_000);
        let started = Instant::now();

        tracing::info!(
            "[ToolExecutor] MCP tool start name='{}' timeout_ms={}",
            tool_call.name,
            timeout_ms
        );

        // Debug: log the arguments
        tracing::debug!("[ToolExecutor] MCP tool arguments: {:?}", args);

        // Execute with timeout
        let result = timeout(
            TokioDuration::from_millis(timeout_ms),
            mcp_state.registry.execute_tool(&tool_call.name, args),
        )
        .await;

        match result {
            Ok(Ok(result_value)) => {
                let normalized_result = Self::normalize_mcp_tool_result(
                    &tool_call.name,
                    &normalization_args,
                    result_value,
                );
                tracing::info!(
                    "[ToolExecutor] MCP tool completed name='{}' elapsed_ms={}",
                    tool_call.name,
                    started.elapsed().as_millis()
                );
                Ok(ToolResult {
                    success: true,
                    data: normalized_result,
                    error: None,
                    metadata: HashMap::new(),
                })
            }
            Ok(Err(e)) => {
                tracing::error!(
                    "[ToolExecutor] MCP tool failed name='{}' elapsed_ms={} error={}",
                    tool_call.name,
                    started.elapsed().as_millis(),
                    e
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("MCP tool execution failed: {}", e), "success": false }),
                    error: Some(format!("MCP tool execution failed: {}", e)),
                    metadata: HashMap::new(),
                })
            }
            Err(_) => {
                tracing::error!(
                    "[ToolExecutor] MCP tool timeout name='{}' elapsed_ms={} timeout_ms={}",
                    tool_call.name,
                    started.elapsed().as_millis(),
                    timeout_ms
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({
                        "tool_name": tool_call.name,
                        "timeout_ms": timeout_ms
                    }),
                    error: Some(format!(
                        "MCP tool '{}' timed out after {}ms. Check MCP server health/access and retry.",
                        tool_call.name, timeout_ms
                    )),
                    metadata: HashMap::new(),
                })
            }
        }
    }

    // -----------------------------------------------------------------------
    // Extracted tool implementations (one method per tool for readability)
    // -----------------------------------------------------------------------

    async fn execute_file_read_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let raw_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        // Resolve relative paths against project folder
        let path = self.resolve_path(&raw_path);
        let session_id = args
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&path))]),
            });
        }

        match fs::read_to_string(&path).await {
            Ok(content) => {
                let content = if content.len() > FILE_READ_MAX_CHARS {
                    format!(
                        "{}\n\n... [truncated to first {} chars out of {}]",
                        &content[..FILE_READ_MAX_CHARS],
                        FILE_READ_MAX_CHARS,
                        content.len()
                    )
                } else {
                    content
                };

                if let Some(app_handle) = &self.app_handle {
                    let file_op = create_file_read_event(
                        &path,
                        &content,
                        true,
                        None,
                        session_id.clone(),
                    );
                    emit_file_operation(app_handle, file_op);
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "content": content, "path": &path }),
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                })
            }
            Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
                let is_pdf = Path::new(&path)
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));

                if is_pdf {
                    let path_clone = path.clone();
                    let pdf_extract_result = tokio::task::spawn_blocking(move || {
                        pdf_extract::extract_text(Path::new(&path_clone))
                    })
                    .await
                    .map_err(|join_err| join_err.to_string())
                    .and_then(|result| {
                        result.map_err(|extract_err| extract_err.to_string())
                    });

                    match pdf_extract_result {
                        Ok(extracted_text) => {
                            let content = if extracted_text.len() > FILE_READ_MAX_CHARS {
                                format!(
                                    "{}\n\n... [truncated to first {} chars out of {}]",
                                    &extracted_text[..FILE_READ_MAX_CHARS],
                                    FILE_READ_MAX_CHARS,
                                    extracted_text.len()
                                )
                            } else {
                                extracted_text
                            };

                            if let Some(app_handle) = &self.app_handle {
                                let file_op = create_file_read_event(
                                    &path,
                                    &content,
                                    true,
                                    None,
                                    session_id.clone(),
                                );
                                emit_file_operation(app_handle, file_op);
                            }

                            Ok(ToolResult {
                                success: true,
                                data: json!({ "content": content, "path": &path }),
                                error: None,
                                metadata: HashMap::from([
                                    ("path".to_string(), json!(&path)),
                                    ("source".to_string(), json!("pdf_extract")),
                                ]),
                            })
                        }
                        Err(pdf_error) => {
                            let error = format!(
                                "Failed to read PDF '{}': {}. Try document_extract_text for structured extraction.",
                                path, pdf_error
                            );
                            if let Some(app_handle) = &self.app_handle {
                                let file_op = create_file_read_event(
                                    &path,
                                    "",
                                    false,
                                    Some(error.clone()),
                                    session_id.clone(),
                                );
                                emit_file_operation(app_handle, file_op);
                            }

                            Ok(ToolResult {
                                success: false,
                                data: json!({ "error": error.clone(), "success": false }),
                                error: Some(error),
                                metadata: HashMap::from([(
                                    "path".to_string(),
                                    json!(&path),
                                )]),
                            })
                        }
                    }
                } else {
                    let error = format!(
                        "Failed to read file '{}': file is binary or not UTF-8 text. Use file_read_binary for binary files.",
                        path
                    );
                    if let Some(app_handle) = &self.app_handle {
                        let file_op = create_file_read_event(
                            &path,
                            "",
                            false,
                            Some(error.clone()),
                            session_id.clone(),
                        );
                        emit_file_operation(app_handle, file_op);
                    }

                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": error.clone(), "success": false }),
                        error: Some(error),
                        metadata: HashMap::from([("path".to_string(), json!(&path))]),
                    })
                }
            }
            Err(e) => {
                if let Some(app_handle) = &self.app_handle {
                    let file_op = create_file_read_event(
                        &path,
                        "",
                        false,
                        Some(e.to_string()),
                        session_id.clone(),
                    );
                    emit_file_operation(app_handle, file_op);
                }

                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to read file: {}", e), "success": false }),
                    error: Some(format!("Failed to read file: {}", e)),
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                })
            }
        }
    }

    async fn execute_file_write_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let raw_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        // Resolve relative paths against project folder
        let path = self.resolve_path(&raw_path);
        let content = args
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing content parameter"))?
            .to_string();
        let session_id = args
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&path))]),
            });
        }

        let old_content = fs::read_to_string(&path).await.ok();
        if let Some(parent) = Path::new(&path).parent() {
            let _ = fs::create_dir_all(parent).await;
        }

        let write_result = fs::write(&path, content.as_bytes()).await;

        if let Some(app_handle) = &self.app_handle {
            let file_op = create_file_write_event(
                &path,
                old_content.as_deref(),
                &content,
                write_result.is_ok(),
                write_result.as_ref().err().map(|e| e.to_string()),
                session_id.clone(),
            );
            emit_file_operation(app_handle, file_op);
        }

        match write_result {
            Ok(_) => {
                // Record tool execution for undo
                if let Some(app_handle) = &self.app_handle {
                    if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                        let task_id = session_id
                            .clone()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        let path_buf = std::path::PathBuf::from(&path);
                        let _ = undo_state
                            .change_tracker
                            .record_tool_executed_with_path(
                                "file_write".to_string(),
                                path_buf,
                                old_content.clone(), // Store original content for undo
                                Some(content.clone()), // New content
                                task_id,
                                true, // File writes are reversible
                                Some("Restore previous file contents".to_string()),
                            )
                            .await;
                    }
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "path": &path }),
                    error: None,
                    metadata: HashMap::from([
                        ("path".to_string(), json!(&path)),
                        ("content_length".to_string(), json!(content.len())),
                    ]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to write file: {}", e), "success": false }),
                error: Some(format!("Failed to write file: {}", e)),
                metadata: HashMap::from([("path".to_string(), json!(&path))]),
            }),
        }
    }

    async fn execute_file_delete_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let raw_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        // Resolve relative paths against project folder
        let path = self.resolve_path(&raw_path);
        let session_id = args
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&path))]),
            });
        }

        // Read file content before deletion for undo capability
        let file_content_before = fs::read_to_string(&path).await.ok();

        let size_bytes = fs::metadata(&path)
            .await
            .ok()
            .map(|meta| meta.len() as usize);
        let delete_result = fs::remove_file(&path).await;

        if let Some(app_handle) = &self.app_handle {
            let file_op = create_file_delete_event(
                &path,
                size_bytes,
                delete_result.is_ok(),
                delete_result.as_ref().err().map(|e| e.to_string()),
                session_id.clone(),
            );
            emit_file_operation(app_handle, file_op);
        }

        match delete_result {
            Ok(_) => {
                // Record tool execution for undo
                if let Some(app_handle) = &self.app_handle {
                    if let Some(undo_state) = app_handle.try_state::<UndoState>() {
                        let task_id = session_id
                            .clone()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        let path_buf = std::path::PathBuf::from(&path);
                        let _ = undo_state
                            .change_tracker
                            .record_tool_executed_with_path(
                                "file_delete".to_string(),
                                path_buf,
                                file_content_before, // Store content for restoration
                                None,                // File was deleted, no after content
                                task_id,
                                true, // File deletes are reversible
                                Some("Restore deleted file".to_string()),
                            )
                            .await;
                    }
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "path": &path }),
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to delete file: {}", e), "success": false }),
                error: Some(format!("Failed to delete file: {}", e)),
                metadata: HashMap::from([("path".to_string(), json!(&path))]),
            }),
        }
    }

    async fn execute_ui_screenshot_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        use crate::automation::screen::capture_primary_screen;
        match capture_primary_screen() {
            Ok(captured) => {
                let temp_file = match tempfile::Builder::new()
                    .prefix("screenshot_")
                    .suffix(".png")
                    .tempfile()
                {
                    Ok(file) => file,
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            data: json!({ "error": format!("Failed to create temp file: {}", e), "success": false }),
                            error: Some(format!("Failed to create temp file: {}", e)),
                            metadata: HashMap::new(),
                        });
                    }
                };

                let temp_path = temp_file.path();
                match captured.pixels.save(temp_path) {
                    Ok(_) => {
                        let (file, path) = temp_file
                            .keep()
                            .map_err(|e| anyhow!("Failed to persist temp file: {}", e))?;
                        drop(file);

                        Ok(ToolResult {
                            success: true,
                            data: json!({
                                "screenshot_path": path.to_string_lossy().to_string(),
                                "cleanup_note": "File will be cleaned up by OS temp directory cleanup"
                            }),
                            error: None,
                            metadata: HashMap::from([
                                ("temp_file".to_string(), json!(true)),
                                (
                                    "path".to_string(),
                                    json!(path.to_string_lossy().to_string()),
                                ),
                            ]),
                        })
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to save screenshot: {}", e), "success": false }),
                        error: Some(format!("Failed to save screenshot: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({ "error": format!("Failed to capture screenshot: {}", e), "success": false }),
                error: Some(format!("Failed to capture screenshot: {}", e)),
                metadata: HashMap::new(),
            }),
        }
    }

    async fn execute_ui_click_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::automation::{
                input::MouseButton, types::ElementQuery, AutomationService,
            };
            use tauri::Manager;

            let automation_opt = app.state::<std::sync::Arc<Option<AutomationService>>>();
            let automation = match automation_opt.as_ref() {
                Some(_) => match AutomationService::new() {
                    Ok(service) => std::sync::Arc::new(service),
                    Err(e) => {
                        return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Automation service not available: {}. Please grant accessibility permissions.", e), "success": false }),
                                error: Some(format!("Automation service not available: {}. Please grant accessibility permissions.", e)),
                                metadata: HashMap::new(),
                            });
                    }
                },
                None => {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": "Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string(), "success": false }),
                        error: Some("Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string()),
                        metadata: HashMap::new(),
                    });
                }
            };
            let target = args
                .get("target")
                .ok_or_else(|| anyhow!("Missing target parameter"))?;

            if let Some(coords) = target.get("coordinates") {
                let x = coords.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = coords.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let mut mouse_guard = automation.mouse.lock().await;
                let mouse_result = match mouse_guard.as_mut() {
                    Some(mouse) => mouse.click(x, y, MouseButton::Left),
                    None => Err(anyhow!(
                        "Mouse automation requires Input Monitoring permission. \
                         Grant it in System Settings \u{2192} Privacy & Security \u{2192} Input Monitoring."
                    )),
                };
                match mouse_result {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "action": "clicked", "x": x, "y": y }),
                        error: None,
                        metadata: HashMap::new(),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to click: {}", e), "success": false }),
                        error: Some(format!("Failed to click: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else if let Some(element_id) =
                target.get("element_id").and_then(|v| v.as_str())
            {
                match automation.native.invoke(element_id) {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "action": "invoked", "element_id": element_id }),
                        error: None,
                        metadata: HashMap::new(),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to invoke element: {}", e), "success": false }),
                        error: Some(format!("Failed to invoke element: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else if let Some(text) = target.get("text").and_then(|v| v.as_str()) {
                let query = ElementQuery {
                    window: None,
                    window_class: None,
                    name: Some(text.to_string()),
                    class_name: None,
                    automation_id: None,
                    control_type: None,
                    max_results: Some(1),
                };
                match automation.native.find_elements(None, &query) {
                    Ok(elements) => {
                        if let Some(element) = elements.first() {
                            match automation.native.invoke(&element.id) {
                                Ok(_) => Ok(ToolResult {
                                    success: true,
                                    data: json!({ "success": true, "action": "invoked", "element_id": element.id, "found_by": "text", "text": text }),
                                    error: None,
                                    metadata: HashMap::new(),
                                }),
                                Err(e) => Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": format!("Failed to invoke element: {}", e), "success": false }),
                                    error: Some(format!("Failed to invoke element: {}", e)),
                                    metadata: HashMap::new(),
                                }),
                            }
                        } else {
                            Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Element with text '{}' not found", text), "success": false }),
                                error: Some(format!(
                                    "Element with text '{}' not found",
                                    text
                                )),
                                metadata: HashMap::new(),
                            })
                        }
                    }
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to find element: {}", e), "success": false }),
                        error: Some(format!("Failed to find element: {}", e)),
                        metadata: HashMap::new(),
                    }),
                }
            } else {
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": "Invalid target format for ui_click - need coordinates, element_id, or text".to_string(), "success": false }),
                    error: Some("Invalid target format for ui_click - need coordinates, element_id, or text".to_string()),
                    metadata: HashMap::new(),
                })
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for UI automation".to_string(), "success": false }),
                error: Some("App handle not available for UI automation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_ui_type_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::automation::{
                input::KeyboardSimulator, types::ElementQuery, AutomationService,
            };
            use tauri::Manager;

            let automation_opt = app.state::<std::sync::Arc<Option<AutomationService>>>();
            let automation = match automation_opt.as_ref() {
                Some(_) => match AutomationService::new() {
                    Ok(service) => std::sync::Arc::new(service),
                    Err(e) => {
                        return Ok(ToolResult {
                                success: false,
                                data: json!({ "error": format!("Automation service not available: {}. Please grant accessibility permissions.", e), "success": false }),
                                error: Some(format!("Automation service not available: {}. Please grant accessibility permissions.", e)),
                                metadata: HashMap::new(),
                            });
                    }
                },
                None => {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": "Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string(), "success": false }),
                        error: Some("Automation service not available. Please grant accessibility permissions in System Settings > Privacy & Security > Accessibility.".to_string()),
                        metadata: HashMap::new(),
                    });
                }
            };
            let target = args
                .get("target")
                .ok_or_else(|| anyhow!("Missing target parameter"))?;
            let text = args
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing text parameter"))?;

            if let Some(element_id) = target.get("element_id").and_then(|v| v.as_str()) {
                if let Err(e) = automation.native.set_focus(element_id) {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to focus element: {}", e), "success": false }),
                        error: Some(format!("Failed to focus element: {}", e)),
                        metadata: HashMap::new(),
                    });
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            } else if let Some(target_text) = target.get("text").and_then(|v| v.as_str()) {
                let query = ElementQuery {
                    window: None,
                    window_class: None,
                    name: Some(target_text.to_string()),
                    class_name: None,
                    automation_id: None,
                    control_type: None,
                    max_results: Some(1),
                };
                match automation.native.find_elements(None, &query) {
                    Ok(elements) => {
                        if let Some(element) = elements.first() {
                            if let Err(e) = automation.native.set_focus(&element.id) {
                                return Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": format!("Failed to focus element: {}", e), "success": false }),
                                    error: Some(format!("Failed to focus element: {}", e)),
                                    metadata: HashMap::new(),
                                });
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                        }
                    }
                    Err(e) => {
                        return Ok(ToolResult {
                            success: false,
                            data: json!({ "error": format!("Failed to find element: {}", e), "success": false }),
                            error: Some(format!("Failed to find element: {}", e)),
                            metadata: HashMap::new(),
                        });
                    }
                }
            }

            let mut keyboard = KeyboardSimulator::new()
                .map_err(|e| anyhow!("Failed to create keyboard simulator: {}", e))?;
            let send_result = keyboard.send_text(text).await;
            match send_result {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "action": "typed", "text": text }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to type text: {}", e), "success": false }),
                    error: Some(format!("Failed to type text: {}", e)),
                    metadata: HashMap::new(),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for UI automation".to_string(), "success": false }),
                error: Some("App handle not available for UI automation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_search_web_tool(
        &self,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        use crate::core::agi::executors::search_executor::{
            SearchExecutor, SearchType as ExecSearchType,
        };
        let tool_id = action_id;

        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?
            .to_string();

        // Emit progress: starting search
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(
                app_handle,
                tool_id,
                0.1,
                Some(&format!("Searching: {}", &query[..query.len().min(40)])),
            );
        }

        let num_results = args
            .get("num_results")
            .and_then(|v| v.as_u64())
            .unwrap_or(10)
            .min(20) as usize;

        let search_type = args
            .get("search_type")
            .and_then(|v| v.as_str())
            .map(|s| match s.to_lowercase().as_str() {
                "news" => ExecSearchType::News,
                "images" => ExecSearchType::General,
                "code" | "programming" => ExecSearchType::Code,
                "academic" | "scholarly" => ExecSearchType::Academic,
                _ => ExecSearchType::General,
            })
            .unwrap_or(ExecSearchType::General);

        // Emit progress: search in progress
        if let Some(app_handle) = &self.app_handle {
            emit_tool_progress(app_handle, tool_id, 0.5, Some("Fetching results..."));
        }

        let start = Instant::now();
        let executor = SearchExecutor::new();
        match executor.run_search(&query, search_type, num_results).await {
            Ok(raw) => {
                let duration_ms = start.elapsed().as_millis() as u64;
                let provider = raw
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                let results = raw
                    .get("results")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                let access_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let mut normalized = Vec::new();
                for (idx, item) in results.iter().enumerate() {
                    let title = item
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let url = item
                        .get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let snippet = item
                        .get("snippet")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    if url.is_empty() && title.is_empty() {
                        continue;
                    }

                    let domain = url::Url::parse(&url)
                        .ok()
                        .and_then(|u| u.host_str().map(|h| h.to_string()));

                    let position = idx + 1;
                    normalized.push(json!({
                        "title": title,
                        "url": url,
                        "snippet": snippet,
                        "domain": domain,
                        "position": position,
                        "citation_id": format!("cite-{}", position),
                        "access_timestamp": access_timestamp,
                    }));
                }

                let count = raw
                    .get("results_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(normalized.len() as u64);

                if let Some(app_handle) = &self.app_handle {
                    emit_tool_progress(
                        app_handle,
                        tool_id,
                        1.0,
                        Some(&format!("Found {} results", count)),
                    );
                }

                Ok(ToolResult {
                    success: true,
                    data: json!({
                        "query": raw.get("query").and_then(|v| v.as_str()).unwrap_or(&query),
                        "results": normalized,
                        "count": count,
                        "provider": provider,
                        "duration_ms": duration_ms
                    }),
                    error: None,
                    metadata: HashMap::from([
                        ("query".to_string(), json!(query)),
                        ("provider".to_string(), json!(provider)),
                        ("result_count".to_string(), json!(count)),
                    ]),
                })
            }
            Err(e) => Ok(ToolResult {
                success: false,
                data: json!({
                    "query": query,
                    "results": [],
                    "count": 0,
                    "error": e.to_string()
                }),
                error: Some(format!("Web search failed: {}", e)),
                metadata: HashMap::from([("query".to_string(), json!(query))]),
            }),
        }
    }

    async fn execute_browser_navigate_tool(
        &self,
        args: &HashMap<String, Value>,
        action_id: &str,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let tool_id = action_id;

        if let Some(ref app) = self.app_handle {
            use crate::automation::browser::NavigationOptions;
            use crate::sys::commands::BrowserStateWrapper;
            use tauri::Manager;

            // Emit progress: starting navigation
            emit_tool_progress(
                app,
                tool_id,
                0.1,
                Some(&format!("Navigating to {}", &url[..url.len().min(50)])),
            );

            let browser_state = app.state::<BrowserStateWrapper>();
            let tab_manager = match browser_state.get_tab_manager() {
                Ok(tm) => tm.lock().await,
                Err(e) => {
                    let err_msg = format!("Failed to get tab manager: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            emit_tool_progress(app, tool_id, 0.3, Some("Browser ready"));

            match tab_manager.list_tabs().await {
                Ok(tabs) => {
                    let tab_id = if tabs.is_empty() {
                        emit_tool_progress(app, tool_id, 0.4, Some("Opening new tab"));
                        match tab_manager.open_tab(url).await {
                            Ok(tid) => tid,
                            Err(e) => {
                                let err_msg = format!("Failed to open tab: {}", e);
                                return Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": err_msg.clone(), "success": false }),
                                    error: Some(err_msg),
                                    metadata: HashMap::new(),
                                });
                            }
                        }
                    } else {
                        tabs[0].id.clone()
                    };

                    emit_tool_progress(app, tool_id, 0.6, Some("Loading page..."));

                    match tab_manager
                        .navigate(&tab_id, url, NavigationOptions::default())
                        .await
                    {
                        Ok(_) => {
                            emit_tool_progress(app, tool_id, 1.0, Some("Page loaded"));
                            Ok(ToolResult {
                                success: true,
                                data: json!({ "success": true, "url": url, "tab_id": tab_id }),
                                error: None,
                                metadata: HashMap::new(),
                            })
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to navigate: {}", e);
                            Ok(ToolResult {
                                success: false,
                                data: json!({ "error": err_msg.clone(), "success": false }),
                                error: Some(err_msg),
                                metadata: HashMap::new(),
                            })
                        }
                    }
                }
                Err(e) => {
                    let err_msg = format!("Failed to list tabs: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for browser navigation".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_code_execute_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let language = args
            .get("language")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing language parameter"))?;
        let code = args
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing code parameter"))?;

        if let Some(ref app) = self.app_handle {
            use crate::features::terminal::{SessionManager, ShellType};
            use tauri::Manager;

            let session_manager = app.state::<SessionManager>();

            let shell_type = match language.to_lowercase().as_str() {
                "powershell" | "ps1" => ShellType::PowerShell,
                "bash" | "sh" | "shell" => ShellType::Wsl,
                "cmd" | "batch" => ShellType::Cmd,
                _ => ShellType::PowerShell,
            };

            let session_id = match session_manager.create_session(shell_type, None).await {
                Ok(sid) => sid,
                Err(e) => {
                    let err_msg = format!("Failed to create session: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match session_manager
                .send_input(&session_id, &format!("{}\n", code))
                .await
            {
                Ok(_) => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    Ok(ToolResult {
                        success: true,
                        data: json!({ "success": true, "session_id": session_id, "code": code }),
                        error: None,
                        metadata: HashMap::from([(
                            "session_id".to_string(),
                            json!(session_id),
                        )]),
                    })
                }
                Err(e) => {
                    let err_msg = format!("Failed to execute code: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for code execution".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_git_push_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let remote = args
            .get("remote")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let branch = args
            .get("branch")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(app) = &self.app_handle {
            if let Err(e) = self.validate_path(&path).await {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.to_string(), "success": false }),
                    error: Some(e.to_string()),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                });
            }

            use crate::sys::commands::git::git_push;

            match git_push(
                app.clone(),
                path.clone(),
                remote.clone(),
                branch.clone(),
                false,
            )
            .await
            {
                Ok(msg) => Ok(ToolResult {
                    success: true,
                    data: json!({ "success": true, "message": msg }),
                    error: None,
                    metadata: HashMap::from([
                        ("path".to_string(), json!(path)),
                        ("remote".to_string(), json!(remote)),
                        ("branch".to_string(), json!(branch)),
                    ]),
                }),
                Err(e) => {
                    let err_msg = format!("Git push failed: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("path".to_string(), json!(path))]),
                    })
                }
            }
        } else {
            let err_msg = "App handle not available for git_push".to_string();
            Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_db_query_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        // Validate it's a SELECT query only (read-only)
        let query_upper = query.trim().to_uppercase();
        if !query_upper.starts_with("SELECT") && !query_upper.starts_with("WITH") {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "db_query only supports SELECT statements. Use db_execute for modifications.", "success": false }),
                error: Some("db_query only supports SELECT statements. Use db_execute for modifications.".to_string()),
                metadata: HashMap::new(),
            });
        }

        // Block dangerous operations even in SELECT (like subqueries with mutations)
        let blocked_keywords = [
            "DROP", "TRUNCATE", "DELETE", "ALTER", "CREATE", "INSERT", "UPDATE", "GRANT",
            "REVOKE",
        ];
        for keyword in &blocked_keywords {
            if query_upper.contains(keyword) {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("SQL operation '{}' is not allowed in db_query.", keyword), "success": false }),
                    error: Some(format!(
                        "SQL operation '{}' is not allowed in db_query.",
                        keyword
                    )),
                    metadata: HashMap::new(),
                });
            }
        }

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            // Execute query and collect results - using a closure to manage lifetimes
            let query_result: Result<(Vec<String>, Vec<serde_json::Value>), String> =
                (|| {
                    let mut stmt = conn
                        .prepare(query)
                        .map_err(|e| format!("Query preparation error: {}", e))?;
                    let column_names: Vec<String> =
                        stmt.column_names().iter().map(|s| s.to_string()).collect();

                    let mut rows_iter = stmt
                        .query([])
                        .map_err(|e| format!("Query execution error: {}", e))?;
                    let mut rows: Vec<serde_json::Value> = Vec::new();

                    while let Some(row) = rows_iter
                        .next()
                        .map_err(|e| format!("Row fetch error: {}", e))?
                    {
                        let mut obj = serde_json::Map::new();
                        for (idx, col_name) in column_names.iter().enumerate() {
                            let value: rusqlite::types::Value = row
                                .get(idx)
                                .map_err(|e| format!("Column read error: {}", e))?;
                            obj.insert(
                                col_name.clone(),
                                match value {
                                    rusqlite::types::Value::Null => json!(null),
                                    rusqlite::types::Value::Integer(n) => json!(n),
                                    rusqlite::types::Value::Real(f) => json!(f),
                                    rusqlite::types::Value::Text(s) => json!(s),
                                    rusqlite::types::Value::Blob(b) => {
                                        json!(format!("<blob {} bytes>", b.len()))
                                    }
                                },
                            );
                        }
                        rows.push(serde_json::Value::Object(obj));
                    }

                    Ok((column_names, rows))
                })();

            match query_result {
                Ok((column_names, rows)) => {
                    let row_count = rows.len();
                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "columns": column_names,
                            "rows": rows,
                            "row_count": row_count
                        }),
                        error: None,
                        metadata: HashMap::from([("query".to_string(), json!(query))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": e.clone(), "success": false }),
                    error: Some(e),
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_db_execute_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing query parameter"))?;

        // Validate it's a modification query (INSERT, UPDATE, DELETE)
        let query_upper = query.trim().to_uppercase();
        let is_modification = query_upper.starts_with("INSERT")
            || query_upper.starts_with("UPDATE")
            || query_upper.starts_with("DELETE");

        if !is_modification {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": "db_execute only supports INSERT, UPDATE, or DELETE statements. Use db_query for SELECT.", "success": false }),
                error: Some("db_execute only supports INSERT, UPDATE, or DELETE statements. Use db_query for SELECT.".to_string()),
                metadata: HashMap::new(),
            });
        }

        // Block dangerous DDL operations
        let blocked_keywords = ["DROP", "TRUNCATE", "ALTER", "CREATE", "GRANT", "REVOKE"];
        for keyword in &blocked_keywords {
            if query_upper.contains(keyword) {
                return Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("SQL operation '{}' is not allowed. Only INSERT, UPDATE, DELETE are permitted.", keyword), "success": false }),
                    error: Some(format!("SQL operation '{}' is not allowed. Only INSERT, UPDATE, DELETE are permitted.", keyword)),
                    metadata: HashMap::new(),
                });
            }
        }

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute(query, []) {
                Ok(rows_affected) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "rows_affected": rows_affected,
                        "query": query
                    }),
                    error: None,
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Query execution error: {}", e), "success": false }),
                    error: Some(format!("Query execution error: {}", e)),
                    metadata: HashMap::from([("query".to_string(), json!(query))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_db_transaction_begin_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("BEGIN TRANSACTION", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction started",
                        "status": "active"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to begin transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_db_transaction_commit_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("COMMIT", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction committed",
                        "status": "committed"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to commit transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_db_transaction_rollback_tool(
        &self,
        _args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::chat::AppDatabase;
            use tauri::Manager;

            let db = app.state::<AppDatabase>();
            let conn = match db.conn.lock() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Database lock error: {}", e);
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    });
                }
            };

            match conn.execute("ROLLBACK", []) {
                Ok(_) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message": "Transaction rolled back",
                        "status": "rolled_back"
                    }),
                    error: None,
                    metadata: HashMap::new(),
                }),
                Err(e) => {
                    let err_msg = format!("Failed to rollback transaction: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::new(),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "Database not available", "success": false }),
                error: Some("Database not available".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_api_call_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let method = args.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
        let body = args.get("body");
        let headers = args.get("headers");

        if let Some(ref app) = self.app_handle {
            use crate::sys::api::client::{ApiRequest, HttpMethod};
            use crate::sys::commands::ApiState;
            use tauri::Manager;

            let api_state = app.state::<ApiState>();

            let http_method = match method.to_uppercase().as_str() {
                "GET" => HttpMethod::Get,
                "POST" => HttpMethod::Post,
                "PUT" => HttpMethod::Put,
                "PATCH" => HttpMethod::Patch,
                "DELETE" => HttpMethod::Delete,
                _ => HttpMethod::Get,
            };

            let request = ApiRequest {
                url: url.to_string(),
                method: http_method,
                headers: headers
                    .and_then(|h| serde_json::from_value(h.clone()).ok())
                    .unwrap_or_default(),
                body: body.and_then(|b| b.as_str().map(|s| s.to_string())),
                query_params: HashMap::new(),
                auth: crate::sys::api::client::AuthType::None,
                timeout_ms: Some(30000),
            };

            match api_state.execute_request(request).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "status": response.status,
                        "headers": response.headers,
                        "body": response.body,
                    }),
                    error: None,
                    metadata: HashMap::from([("url".to_string(), json!(url))]),
                }),
                Err(e) => {
                    let err_msg = format!("API call failed: {}", e);
                    Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("url".to_string(), json!(url))]),
                    })
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for API calls", "success": false }),
                error: Some("App handle not available for API calls".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_image_ocr_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let image_path = args
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing image_path parameter"))?;

        #[cfg(feature = "ocr")]
        {
            use crate::automation::screen::perform_ocr;
            match perform_ocr(image_path).await {
                Ok(text) => Ok(ToolResult {
                    success: true,
                    data: json!({ "text": text, "image_path": image_path }),
                    error: None,
                    metadata: HashMap::from([(
                        "image_path".to_string(),
                        json!(image_path),
                    )]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("OCR failed: {}", e), "success": false }),
                    error: Some(format!("OCR failed: {}", e)),
                    metadata: HashMap::from([(
                        "image_path".to_string(),
                        json!(image_path),
                    )]),
                }),
            }
        }
        #[cfg(not(feature = "ocr"))]
        {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "OCR feature not enabled in build", "success": false }),
                error: Some("OCR feature not enabled in build".to_string()),
                metadata: HashMap::from([("image_path".to_string(), json!(image_path))]),
            })
        }
    }

    async fn execute_code_analyze_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let code = args
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing code parameter"))?;
        let language = args
            .get("language")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        let line_count = code.lines().count();
        let char_count = code.len();
        let non_whitespace = code.chars().filter(|c| !c.is_whitespace()).count();

        Ok(ToolResult {
            success: true,
            data: json!({
                "language": language,
                "line_count": line_count,
                "char_count": char_count,
                "non_whitespace_chars": non_whitespace,
                "analysis": "Basic static analysis complete"
            }),
            error: None,
            metadata: HashMap::from([("language".to_string(), json!(language))]),
        })
    }

    async fn execute_image_generate_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing prompt parameter"))?
            .to_string();
        let provider = args
            .get("provider")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let size = args
            .get("size")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(ref app) = self.app_handle {
            let request = crate::sys::commands::media::MediaImageRequest {
                prompt: prompt.clone(),
                negative_prompt: None,
                provider,
                model: None,
                size: size.clone(),
                quality: None,
                style: None,
                n: Some(1),
            };

            match crate::sys::commands::media::media_generate_image(app.clone(), request)
                .await
            {
                Ok(response) => {
                    let result_data = json!({
                        "success": true,
                        "prompt": prompt.clone(),
                        "images": response.images,
                        "provider": response.provider,
                        "model": response.model,
                        "size": size,
                        "cost": response.cost_estimate,
                        "latency_ms": response.latency_ms
                    });
                    Ok(ToolResult {
                        success: true,
                        data: result_data,
                        error: None,
                        metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Image generation failed: {}", e), "success": false }),
                    error: Some(format!("Image generation failed: {}", e)),
                    metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for image generation", "success": false }),
                error: Some("App handle not available for image generation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_video_generate_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing prompt parameter"))?
            .to_string();
        let duration_secs = args
            .get("duration_seconds")
            .or_else(|| args.get("duration_secs"))
            .or_else(|| args.get("duration"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let resolution = args
            .get("resolution")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(ref app) = self.app_handle {
            let provider = args
                .get("provider")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let input_image_url = args
                .get("input_image_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let request = crate::sys::commands::media::MediaVideoRequest {
                prompt: prompt.clone(),
                negative_prompt: None,
                duration_secs,
                resolution: resolution.clone(),
                style: None,
                model: None,
                provider: provider.clone(),
                input_image_url,
            };

            match crate::sys::commands::media::media_generate_video(app.clone(), request)
                .await
            {
                Ok(response) => {
                    let provider_label =
                        provider.clone().unwrap_or_else(|| "runway".to_string());
                    let result_data = json!({
                        "success": true,
                        "prompt": prompt.clone(),
                        "video_url": response.video_url,
                        "thumbnail_url": response.thumbnail_url,
                        "id": response.id,
                        "status": response.status,
                        "provider": provider_label,
                        "duration_secs": response.duration_secs.or(duration_secs),
                        "resolution": resolution,
                        "cost": response.cost_estimate,
                        "latency_ms": response.latency_ms
                    });
                    Ok(ToolResult {
                        success: true,
                        data: result_data,
                        error: None,
                        metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Video generation failed: {}", e), "success": false }),
                    error: Some(format!("Video generation failed: {}", e)),
                    metadata: HashMap::from([("prompt".to_string(), json!(prompt))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for video generation", "success": false }),
                error: Some("App handle not available for video generation".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_llm_reason_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let prompt = args
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing prompt parameter"))?;
        let model = args.get("model").and_then(|v| v.as_str());
        let _max_tokens = args
            .get("max_tokens")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let depth = args.get("depth").and_then(|v| v.as_u64()).unwrap_or(0);

        const MAX_DEPTH: u64 = 3;
        if depth >= MAX_DEPTH {
            let err_msg = format!("Maximum recursion depth ({}) exceeded", MAX_DEPTH);
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": err_msg.clone(), "success": false }),
                error: Some(err_msg),
                metadata: HashMap::from([("depth".to_string(), json!(depth))]),
            });
        }

        if let Some(ref app) = self.app_handle {
            use crate::core::llm::RouterPreferences;
            use crate::sys::commands::LLMState;
            use tauri::Manager;

            let llm_state = app.state::<LLMState>();

            let model_str = model.unwrap_or("gpt-5-nano");
            let preferences = Some(RouterPreferences {
                provider: None,
                model: Some(model_str.to_string()),
                strategy: crate::core::llm::RoutingStrategy::Auto,
                context: None,
                prefer_cloud_credits: false,
            });

            let router = llm_state.router.read().await;
            match router.send_message(prompt, preferences).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "reasoning": response,
                        "model": model_str,
                        "depth": depth,
                    }),
                    error: None,
                    metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("LLM reasoning failed: {}", e), "success": false }),
                    error: Some(format!("LLM reasoning failed: {}", e)),
                    metadata: HashMap::from([("depth".to_string(), json!(depth))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for LLM reasoning", "success": false }),
                error: Some("App handle not available for LLM reasoning".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_email_send_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::email::{email_send, SendEmailRequest};
            #[allow(unused_imports)]
            use tauri::Manager;

            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?;

            let to: Vec<crate::features::communications::EmailAddress> = args
                .get("to")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            let subject = args
                .get("subject")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let body_text = args
                .get("body_text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let body_html = args
                .get("body_html")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let request = SendEmailRequest {
                account_id,
                to,
                cc: vec![],
                bcc: vec![],
                reply_to: None,
                subject,
                body_text,
                body_html,
                attachments: vec![],
            };

            match email_send(app.clone(), request).await {
                Ok(message_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "message_id": message_id,
                        "status": "sent"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to send email: {}", e), "success": false }),
                    error: Some(format!("Failed to send email: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for email operations", "success": false }),
                error: Some("App handle not available for email operations".to_string()),
                metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
            })
        }
    }

    async fn execute_email_fetch_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::email::email_fetch_inbox;

            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?;

            let folder = args
                .get("folder")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);

            match email_fetch_inbox(app.clone(), account_id, folder, limit, None).await {
                Ok(emails) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "emails": emails,
                        "count": emails.len()
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to fetch emails: {}", e), "success": false }),
                    error: Some(format!("Failed to fetch emails: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for email operations", "success": false }),
                error: Some("App handle not available for email operations".to_string()),
                metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
            })
        }
    }

    async fn execute_calendar_create_event_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::calendar::CreateEventRequest;
            use crate::sys::commands::calendar::{calendar_create_event, CalendarState};
            use tauri::Manager;

            let state = app.state::<CalendarState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let request: CreateEventRequest =
                serde_json::from_value(args.get("event").cloned().unwrap_or(json!({})))
                    .map_err(|e| anyhow!("Invalid event data: {}", e))?;

            match calendar_create_event(account_id, request, state, app.clone()).await {
                Ok(event) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "event": event,
                        "status": "created"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create calendar event: {}", e), "success": false }),
                    error: Some(format!("Failed to create calendar event: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for calendar operations", "success": false }),
                error: Some("App handle not available for calendar operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_calendar_list_events_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::calendar::ListEventsRequest;
            use crate::sys::commands::calendar::{calendar_list_events, CalendarState};
            use tauri::Manager;

            let state = app.state::<CalendarState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let request: ListEventsRequest =
                serde_json::from_value(args.get("request").cloned().unwrap_or(json!({})))
                    .map_err(|e| anyhow!("Invalid request format: {}", e))?;

            match calendar_list_events(account_id, request, state, app.clone()).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "events": response.events,
                        "next_page_token": response.next_page_token
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to list calendar events: {}", e), "success": false }),
                    error: Some(format!("Failed to list calendar events: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for calendar operations", "success": false }),
                error: Some("App handle not available for calendar operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_cloud_upload_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::cloud::{
                cloud_upload, CloudState, CloudUploadRequest,
            };
            use tauri::Manager;

            let state = app.state::<CloudState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let local_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?
                .to_string();

            let remote_path = args
                .get("remote_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing remote_path parameter"))?
                .to_string();

            let request = CloudUploadRequest {
                account_id: account_id.clone(),
                local_path: local_path.clone(),
                remote_path: remote_path.clone(),
            };

            match cloud_upload(request, state, app.clone()).await {
                Ok(file_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_id": file_id,
                        "local_path": local_path,
                        "remote_path": remote_path,
                        "status": "uploaded"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to upload to cloud storage: {}", e), "success": false }),
                    error: Some(format!("Failed to upload to cloud storage: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for cloud storage", "success": false }),
                error: Some("App handle not available for cloud storage".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_cloud_download_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::cloud::{
                cloud_download, CloudDownloadRequest, CloudState,
            };
            use tauri::Manager;

            let state = app.state::<CloudState>();
            let account_id = args
                .get("account_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing account_id parameter"))?
                .to_string();

            let remote_path = args
                .get("remote_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing remote_path parameter"))?
                .to_string();

            let local_path = args
                .get("local_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing local_path parameter"))?
                .to_string();

            let request = CloudDownloadRequest {
                account_id: account_id.clone(),
                remote_path: remote_path.clone(),
                local_path: local_path.clone(),
            };

            match cloud_download(request, state, app.clone()).await {
                Ok(()) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "remote_path": remote_path,
                        "local_path": local_path,
                        "status": "downloaded"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to download from cloud storage: {}", e), "success": false }),
                    error: Some(format!("Failed to download from cloud storage: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for cloud storage", "success": false }),
                error: Some("App handle not available for cloud storage".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_productivity_create_task_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::features::productivity::{Provider, Task};
            use crate::sys::commands::productivity::{
                productivity_create_task, ProductivityState,
            };
            use tauri::Manager;

            let state = app.state::<ProductivityState>();

            let provider_str = args
                .get("provider")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing provider parameter"))?;

            let provider = match provider_str.to_lowercase().as_str() {
                "notion" => Provider::Notion,
                "trello" => Provider::Trello,
                "asana" => Provider::Asana,
                other => {
                    let err_msg = format!(
                        "Unknown provider: {}. Use 'notion', 'trello', or 'asana'",
                        other
                    );
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    });
                }
            };

            let task: Task =
                serde_json::from_value(args.get("task").cloned().unwrap_or(json!({})))
                    .map_err(|e| anyhow!("Invalid task data: {}", e))?;

            match productivity_create_task(state, provider, task).await {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "task_id": response.task_id,
                        "success": response.success,
                        "status": "created"
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create task: {}", e), "success": false }),
                    error: Some(format!("Failed to create task: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for productivity tools", "success": false }),
                error: Some("App handle not available for productivity tools".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_document_read_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::document::{document_read, DocumentState};
            use tauri::Manager;

            let state = app.state::<DocumentState>();
            let file_path = args
                .get("file_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing file_path parameter"))?
                .to_string();

            match document_read(file_path.clone(), state).await {
                Ok(content) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "content": content,
                        "file_path": file_path
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to read document: {}", e), "success": false }),
                    error: Some(format!("Failed to read document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_document_search_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::document::{document_search, DocumentState};
            use tauri::Manager;

            let state = app.state::<DocumentState>();
            let file_path = args
                .get("file_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing file_path parameter"))?
                .to_string();

            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing query parameter"))?
                .to_string();

            match document_search(file_path.clone(), query.clone(), state).await {
                Ok(results) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "results": results,
                        "file_path": file_path,
                        "query": query,
                        "count": results.len()
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to search document: {}", e), "success": false }),
                    error: Some(format!("Failed to search document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_document_create_word_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref _app) = self.app_handle {
            use crate::sys::commands::document::document_create_word_simple;

            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing output_path parameter"))?
                .to_string();

            let title = args
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = args
                .get("author")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let paragraphs: Vec<String> = args
                .get("paragraphs")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            match document_create_word_simple(
                output_path.clone(),
                title,
                author,
                paragraphs,
            )
            .await
            {
                Ok(path) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_path": path,
                        "filePath": path,
                        "format": "docx",
                        "status": "created",
                        "success": true
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create Word document: {}", e), "success": false }),
                    error: Some(format!("Failed to create Word document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_document_create_excel_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref _app) = self.app_handle {
            use crate::sys::commands::document::document_create_excel_simple;

            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing output_path parameter"))?
                .to_string();

            let sheet_name = args
                .get("sheet_name")
                .and_then(|v| v.as_str())
                .unwrap_or("Sheet1")
                .to_string();

            let headers: Vec<String> = args
                .get("headers")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            let rows: Vec<Vec<String>> = args
                .get("rows")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            match document_create_excel_simple(
                output_path.clone(),
                sheet_name,
                headers,
                rows,
            )
            .await
            {
                Ok(path) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_path": path,
                        "filePath": path,
                        "format": "xlsx",
                        "status": "created",
                        "success": true
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create Excel document: {}", e), "success": false }),
                    error: Some(format!("Failed to create Excel document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_document_create_pdf_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref _app) = self.app_handle {
            use crate::sys::commands::document::document_create_pdf_simple;

            let output_path = args
                .get("output_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing output_path parameter"))?
                .to_string();

            let title = args
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = args
                .get("author")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let paragraphs: Vec<String> = args
                .get("paragraphs")
                .map(|v| serde_json::from_value(v.clone()).unwrap_or_default())
                .unwrap_or_default();

            match document_create_pdf_simple(output_path.clone(), title, author, paragraphs)
                .await
            {
                Ok(path) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "file_path": path,
                        "filePath": path,
                        "format": "pdf",
                        "status": "created",
                        "success": true
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to create PDF document: {}", e), "success": false }),
                    error: Some(format!("Failed to create PDF document: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for document operations", "success": false }),
                error: Some("App handle not available for document operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_image_analyze_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let image_path = args
            .get("image_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing image_path parameter"))?
            .to_string();
        let question = args
            .get("question")
            .and_then(|v| v.as_str())
            .unwrap_or("Describe this image in detail")
            .to_string();
        let _detail = args
            .get("detail")
            .and_then(|v| v.as_str())
            .unwrap_or("auto")
            .to_string();

        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::vision::vision_answer_question;
            use crate::sys::commands::{AppDatabase, LLMState};
            use tauri::Manager;

            let llm_state = app.state::<LLMState>();
            let db_state = app.state::<AppDatabase>();

            match vision_answer_question(
                image_path.clone(),
                question.clone(),
                None,
                None,
                llm_state,
                db_state,
            )
            .await
            {
                Ok(response) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "analysis": response.content,
                        "image_path": image_path,
                        "question": question,
                        "model": response.model,
                        "tokens": response.tokens,
                        "processing_time_ms": response.processing_time_ms,
                    }),
                    error: None,
                    metadata: HashMap::from([
                        ("image_path".to_string(), json!(image_path)),
                        ("question".to_string(), json!(question)),
                    ]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Image analysis failed: {}", e), "success": false }),
                    error: Some(format!("Image analysis failed: {}", e)),
                    metadata: HashMap::from([(
                        "image_path".to_string(),
                        json!(image_path),
                    )]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for image analysis", "success": false }),
                error: Some("App handle not available for image analysis".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_git_status_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_status;

        match git_status(path.clone()).await {
            Ok(status) => Ok(ToolResult {
                success: true,
                data: json!({
                    "branch": status.branch,
                    "staged": status.staged,
                    "unstaged": status.unstaged,
                    "untracked": status.untracked,
                    "conflicts": status.conflicts,
                    "ahead": status.ahead,
                    "behind": status.behind,
                }),
                error: None,
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            }),
            Err(e) => {
                let err_msg = format!("Git status failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    async fn execute_git_commit_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let message = args
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing message parameter"))?
            .to_string();

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_commit;

        match git_commit(path.clone(), message.clone()).await {
            Ok(commit_id) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "commit_id": commit_id,
                    "message": message,
                }),
                error: None,
                metadata: HashMap::from([
                    ("path".to_string(), json!(path)),
                    ("message".to_string(), json!(message)),
                ]),
            }),
            Err(e) => {
                let err_msg = format!("Git commit failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    async fn execute_git_clone_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?
            .to_string();
        let destination = args
            .get("destination")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing destination parameter"))?
            .to_string();

        if let Err(e) = self.validate_path(&destination).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("destination".to_string(), json!(destination))]),
            });
        }

        use crate::sys::commands::git::git_clone;

        match git_clone(url.clone(), destination.clone()).await {
            Ok(msg) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "message": msg,
                    "url": url,
                    "destination": destination,
                }),
                error: None,
                metadata: HashMap::from([
                    ("url".to_string(), json!(url)),
                    ("destination".to_string(), json!(destination)),
                ]),
            }),
            Err(e) => {
                let err_msg = format!("Git clone failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("url".to_string(), json!(url))]),
                })
            }
        }
    }

    async fn execute_git_add_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?
            .to_string();
        let files: Vec<String> = args
            .get("files")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_else(|| vec![".".to_string()]);

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        use crate::sys::commands::git::git_add;

        match git_add(path.clone(), files.clone()).await {
            Ok(msg) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "message": msg,
                    "files": files,
                }),
                error: None,
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            }),
            Err(e) => {
                let err_msg = format!("Git add failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("path".to_string(), json!(path))]),
                })
            }
        }
    }

    async fn execute_schedule_reminder_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::scheduler::{parse_schedule, ParsedSchedule};
            use crate::sys::commands::scheduler::{SchedulerActionType, SchedulerState};
            use chrono::{Datelike, Local, Timelike};
            use tauri::Manager;

            let message = args
                .get("message")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing message parameter"))?
                .to_string();

            let time_expr = args
                .get("time")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing time parameter"))?
                .to_string();

            // Parse the natural language time expression
            let parsed = parse_schedule(&time_expr).map_err(|e| {
                anyhow!(
                    "Could not understand the time '{}'. Try something like 'in 2 hours', 'at 3pm', or 'tomorrow at 9am'. Error: {}",
                    time_expr,
                    e
                )
            })?;

            // Convert to cron expression or one-time schedule
            let (schedule_expr, is_recurring) = match &parsed {
                ParsedSchedule::Once(dt) => {
                    // For one-time reminders, create a specific cron that matches this exact time
                    let local = dt.with_timezone(&Local);
                    let cron = format!(
                        "{} {} {} {} *",
                        local.minute(),
                        local.hour(),
                        local.day(),
                        local.month()
                    );
                    (cron, false)
                }
                ParsedSchedule::Cron(expr) => (expr.clone(), true),
                ParsedSchedule::Interval(duration) => {
                    // Convert interval to approximate cron (limited precision)
                    let minutes = duration.num_minutes();
                    if minutes < 60 {
                        (format!("*/{} * * * *", minutes.max(1)), true)
                    } else {
                        let hours = duration.num_hours();
                        (format!("0 */{} * * *", hours.max(1)), true)
                    }
                }
            };

            let state = app.state::<SchedulerState>();
            let action_data = json!({
                "message": message,
                "title": "Reminder"
            });

            match state.scheduler.add_job(
                format!("Reminder: {}", message),
                schedule_expr,
                SchedulerActionType::Notification,
                action_data,
            ) {
                Ok(job_id) => {
                    // Format user-friendly response
                    let friendly_time = match &parsed {
                        ParsedSchedule::Once(dt) => {
                            let local = dt.with_timezone(&Local);
                            local.format("%I:%M %p on %B %d").to_string()
                        }
                        ParsedSchedule::Cron(_) | ParsedSchedule::Interval(_) => {
                            time_expr.clone()
                        }
                    };

                    let response_msg = if is_recurring {
                        format!(
                            "I've scheduled a recurring reminder for '{}' ({})",
                            message, time_expr
                        )
                    } else {
                        format!(
                            "I've set a reminder for {} to '{}'",
                            friendly_time, message
                        )
                    };

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "job_id": job_id,
                            "message": message,
                            "scheduled_time": friendly_time,
                            "is_recurring": is_recurring,
                            "confirmation": response_msg
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool".to_string(), json!(tool_id)),
                            ("job_id".to_string(), json!(job_id)),
                        ]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to schedule reminder: {}", e), "success": false }),
                    error: Some(format!("Failed to schedule reminder: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_schedule_recurring_task_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::scheduler::{parse_schedule, ParsedSchedule};
            use crate::sys::commands::scheduler::{SchedulerActionType, SchedulerState};
            use tauri::Manager;

            let task_name = args
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing name parameter"))?
                .to_string();

            let schedule_expr = args
                .get("schedule")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing schedule parameter"))?
                .to_string();

            let action_type_str = args
                .get("action_type")
                .and_then(|v| v.as_str())
                .unwrap_or("agi_task");

            let action_data = args
                .get("action_data")
                .cloned()
                .unwrap_or_else(|| json!({}));

            // Parse the natural language schedule expression
            let parsed = parse_schedule(&schedule_expr).map_err(|e| {
                anyhow!(
                    "Could not understand the schedule '{}'. Try 'every day at 9am', 'every monday', or 'every morning'. Error: {}",
                    schedule_expr,
                    e
                )
            })?;

            // Convert to cron expression
            let cron_expr = match &parsed {
                ParsedSchedule::Cron(expr) => expr.clone(),
                ParsedSchedule::Interval(duration) => {
                    let minutes = duration.num_minutes();
                    if minutes < 60 {
                        format!("*/{} * * * *", minutes.max(1))
                    } else {
                        let hours = duration.num_hours();
                        format!("0 */{} * * *", hours.max(1))
                    }
                }
                ParsedSchedule::Once(_) => {
                    let err_msg = "Recurring tasks require a repeating schedule like 'every day at 9am' or 'every monday'. For one-time tasks, use schedule_reminder instead.".to_string();
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": err_msg.clone(), "success": false }),
                        error: Some(err_msg),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    });
                }
            };

            // Parse action type
            let action_type = match action_type_str.to_lowercase().as_str() {
                "workflow" => SchedulerActionType::Workflow,
                "agi_task" | "agitask" | "agi-task" => SchedulerActionType::AgiTask,
                "shell_command" | "shellcommand" | "shell-command" | "shell" => {
                    SchedulerActionType::ShellCommand
                }
                "notification" | "notify" => SchedulerActionType::Notification,
                "webhook" => SchedulerActionType::Webhook,
                "script" => SchedulerActionType::Script,
                _ => SchedulerActionType::AgiTask,
            };

            let state = app.state::<SchedulerState>();

            match state.scheduler.add_job(
                task_name.clone(),
                cron_expr.clone(),
                action_type.clone(),
                action_data,
            ) {
                Ok(job_id) => {
                    // Format user-friendly response
                    let friendly_schedule = match &parsed {
                        ParsedSchedule::Cron(_) => schedule_expr.clone(),
                        ParsedSchedule::Interval(d) => {
                            let hours = d.num_hours();
                            let minutes = d.num_minutes() % 60;
                            if hours > 0 && minutes > 0 {
                                format!("every {} hours and {} minutes", hours, minutes)
                            } else if hours > 0 {
                                format!("every {} hour(s)", hours)
                            } else {
                                format!("every {} minute(s)", d.num_minutes())
                            }
                        }
                        ParsedSchedule::Once(_) => schedule_expr.clone(),
                    };

                    let response_msg = format!(
                        "I've scheduled '{}' to run {}",
                        task_name, friendly_schedule
                    );

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "job_id": job_id,
                            "name": task_name,
                            "schedule": friendly_schedule,
                            "cron_expression": cron_expr,
                            "action_type": action_type.to_string(),
                            "confirmation": response_msg
                        }),
                        error: None,
                        metadata: HashMap::from([
                            ("tool".to_string(), json!(tool_id)),
                            ("job_id".to_string(), json!(job_id)),
                        ]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to schedule task: {}", e), "success": false }),
                    error: Some(format!("Failed to schedule task: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_cancel_scheduled_task_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::scheduler::SchedulerState;
            use tauri::Manager;

            let job_id = args
                .get("job_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing job_id parameter"))?
                .to_string();

            let state = app.state::<SchedulerState>();

            // First get the job details for a friendly message
            let job_name = state
                .scheduler
                .get_job(&job_id)
                .ok()
                .flatten()
                .map(|j| j.name.clone());

            match state.scheduler.remove_job(&job_id) {
                Ok(removed) => {
                    if removed {
                        let response_msg = match job_name {
                            Some(name) => {
                                format!("I've cancelled the scheduled task '{}'", name)
                            }
                            None => format!(
                                "I've cancelled the scheduled task with ID {}",
                                job_id
                            ),
                        };

                        Ok(ToolResult {
                            success: true,
                            data: json!({
                                "job_id": job_id,
                                "cancelled": true,
                                "confirmation": response_msg
                            }),
                            error: None,
                            metadata: HashMap::from([
                                ("tool".to_string(), json!(tool_id)),
                                ("job_id".to_string(), json!(job_id)),
                            ]),
                        })
                    } else {
                        let err_msg = format!("No scheduled task found with ID '{}'. Use list_scheduled_tasks to see available tasks.", job_id);
                        Ok(ToolResult {
                            success: false,
                            data: json!({ "error": err_msg.clone(), "success": false }),
                            error: Some(err_msg),
                            metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                        })
                    }
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to cancel task: {}", e), "success": false }),
                    error: Some(format!("Failed to cancel task: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_list_scheduled_tasks_tool(
        &self,
        _args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::sys::commands::scheduler::SchedulerState;
            use chrono::Local;
            use tauri::Manager;

            let state = app.state::<SchedulerState>();

            match state.scheduler.list_jobs() {
                Ok(jobs) => {
                    let task_list: Vec<serde_json::Value> = jobs
                        .iter()
                        .map(|job| {
                            let next_run_str = job.next_run.map(|dt| {
                                dt.with_timezone(&Local)
                                    .format("%I:%M %p on %B %d")
                                    .to_string()
                            });

                            let last_run_str = job.last_run.map(|dt| {
                                dt.with_timezone(&Local)
                                    .format("%I:%M %p on %B %d")
                                    .to_string()
                            });

                            json!({
                                "id": job.id,
                                "name": job.name,
                                "schedule": job.schedule,
                                "action_type": job.action_type.to_string(),
                                "status": format!("{:?}", job.status).to_lowercase(),
                                "next_run": next_run_str,
                                "last_run": last_run_str,
                                "run_count": job.run_count,
                                "description": job.description
                            })
                        })
                        .collect();

                    let count = task_list.len();
                    let response_msg = if count == 0 {
                        "You have no scheduled tasks.".to_string()
                    } else if count == 1 {
                        "You have 1 scheduled task.".to_string()
                    } else {
                        format!("You have {} scheduled tasks.", count)
                    };

                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "tasks": task_list,
                            "count": count,
                            "summary": response_msg
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to list tasks: {}", e), "success": false }),
                    error: Some(format!("Failed to list tasks: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for scheduling", "success": false }),
                error: Some("App handle not available for scheduling".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_file_list_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let requested_path = args
            .get("path")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .or_else(|| self.project_folder.clone())
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|cwd| cwd.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| ".".to_string());
        let path = self.resolve_path(&requested_path);
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(FILE_LIST_DEFAULT_LIMIT)
            .min(FILE_LIST_MAX_LIMIT);
        let offset = args
            .get("offset")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(0)
            .min(FILE_LIST_MAX_OFFSET);
        let timeout_ms = args
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(FILE_LIST_TIMEOUT_MS)
            .min(300_000);
        let mut excludes =
            Self::parse_string_array_param(args, "exclude").unwrap_or_else(|| {
                FILE_LIST_DEFAULT_EXCLUDES
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            });
        excludes.sort();
        excludes.dedup();

        if let Err(e) = self.validate_path(&path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([
                    ("path".to_string(), json!(&path)),
                    ("requested_path".to_string(), json!(&requested_path)),
                ]),
            });
        }

        tracing::info!(
            "[ToolExecutor] file_list start path='{}' offset={} limit={} timeout_ms={} excludes={:?}",
            path,
            offset,
            limit,
            timeout_ms,
            excludes
        );

        let started = Instant::now();
        let list_result = timeout(TokioDuration::from_millis(timeout_ms), async {
            let mut entries = fs::read_dir(&path).await?;
            let mut matched = 0usize;
            let mut items = Vec::new();

            while let Some(entry) = entries.next_entry().await? {
                let name = entry.file_name().to_string_lossy().to_string();
                if Self::should_exclude_file_list_entry(&name, &excludes) {
                    continue;
                }

                matched += 1;
                if matched <= offset {
                    continue;
                }
                if items.len() > limit {
                    break;
                }

                let file_type = entry.file_type().await.ok();
                let type_str = match file_type {
                    Some(ft) if ft.is_dir() => "directory",
                    Some(ft) if ft.is_symlink() => "symlink",
                    _ => "file",
                };
                let metadata = entry.metadata().await.ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);

                items.push(json!({
                    "name": name,
                    "type": type_str,
                    "path": entry.path().to_string_lossy(),
                    "size": size
                }));
            }

            items.sort_by(|a, b| {
                let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                name_a.cmp(name_b)
            });

            let has_more = items.len() > limit;
            if has_more {
                items.truncate(limit);
            }
            let returned = items.len();
            let next_offset = if has_more {
                Some(offset + returned)
            } else {
                None
            };

            Ok::<Value, anyhow::Error>(json!({
                "entries": items,
                "count": offset + returned,
                "returned": returned,
                "offset": offset,
                "limit": limit,
                "has_more": has_more,
                "next_offset": next_offset,
                "path": &path,
                "excluded": excludes,
                "max_depth": 1
            }))
        })
        .await;

        match list_result {
            Ok(Ok(data)) => {
                tracing::info!(
                    "[ToolExecutor] file_list completed path='{}' elapsed_ms={} returned={} has_more={}",
                    path,
                    started.elapsed().as_millis(),
                    data.get("returned").and_then(|v| v.as_u64()).unwrap_or(0),
                    data.get("has_more").and_then(|v| v.as_bool()).unwrap_or(false)
                );
                Ok(ToolResult {
                    success: true,
                    data,
                    error: None,
                    metadata: HashMap::from([("path".to_string(), json!(&path))]),
                })
            }
            Ok(Err(e)) => {
                tracing::error!(
                    "[ToolExecutor] file_list failed path='{}' elapsed_ms={} error={}",
                    path,
                    started.elapsed().as_millis(),
                    e
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to list directory: {}", e), "success": false }),
                    error: Some(format!("Failed to list directory: {}", e)),
                    metadata: HashMap::from([
                        ("path".to_string(), json!(&path)),
                        ("requested_path".to_string(), json!(&requested_path)),
                    ]),
                })
            }
            Err(_) => {
                let msg = format!(
                    "file_list timed out after {}ms. Try a narrower path, increase 'offset', or lower 'limit'.",
                    timeout_ms
                );
                tracing::error!(
                    "[ToolExecutor] file_list timeout path='{}' elapsed_ms={} timeout_ms={}",
                    path,
                    started.elapsed().as_millis(),
                    timeout_ms
                );
                Ok(ToolResult {
                    success: false,
                    data: json!({
                        "path": &path,
                        "requested_path": &requested_path,
                        "offset": offset,
                        "limit": limit,
                        "timeout_ms": timeout_ms
                    }),
                    error: Some(msg),
                    metadata: HashMap::from([
                        ("path".to_string(), json!(&path)),
                        ("requested_path".to_string(), json!(&requested_path)),
                    ]),
                })
            }
        }
    }

    async fn execute_memory_remember_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::agi::memory_manager::MemoryCategory;
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            // Support both "key"/"value" format and "category"/"topic"/"content" format
            let (category, topic, content) = if let (Some(key), Some(value)) = (
                args.get("key").and_then(|v| v.as_str()),
                args.get("value").and_then(|v| v.as_str()),
            ) {
                // Simple key/value format - use Fact category
                (MemoryCategory::Fact, key.to_string(), value.to_string())
            } else {
                // Full format with category/topic/content
                let category_str = args
                    .get("category")
                    .and_then(|v| v.as_str())
                    .unwrap_or("fact");
                let category = match category_str.to_lowercase().as_str() {
                    "preference" | "preferences" => MemoryCategory::Preference,
                    "decision" | "decisions" => MemoryCategory::Decision,
                    "context" => MemoryCategory::Context,
                    _ => MemoryCategory::Fact,
                };
                let topic = args
                    .get("topic")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing topic or key parameter"))?
                    .to_string();
                let content = args
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing content or value parameter"))?
                    .to_string();
                (category, topic, content)
            };

            let importance = args
                .get("importance")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(5);
            let source = args.get("source").and_then(|v| v.as_str());

            match memory_state.manager.remember(
                category,
                &topic,
                &content,
                Some(importance),
                source,
            ) {
                Ok(memory_id) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "memory_id": memory_id,
                        "topic": topic,
                        "content": content,
                        "message": format!("Remembered: {} = {}", topic, content)
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to store memory: {}", e), "success": false }),
                    error: Some(format!("Failed to store memory: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_memory_recall_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::agi::memory_manager::MemoryCategory;
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            // Support both "key" format and "category"/"topic" format
            let (category, topic) =
                if let Some(key) = args.get("key").and_then(|v| v.as_str()) {
                    (MemoryCategory::Fact, key.to_string())
                } else {
                    let category_str = args
                        .get("category")
                        .and_then(|v| v.as_str())
                        .unwrap_or("fact");
                    let category = match category_str.to_lowercase().as_str() {
                        "preference" | "preferences" => MemoryCategory::Preference,
                        "decision" | "decisions" => MemoryCategory::Decision,
                        "context" => MemoryCategory::Context,
                        _ => MemoryCategory::Fact,
                    };
                    let topic = args
                        .get("topic")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Missing topic or key parameter"))?
                        .to_string();
                    (category, topic)
                };

            match memory_state.manager.recall(category, &topic) {
                Ok(Some(entry)) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "found": true,
                        "memory_id": entry.id,
                        "topic": entry.topic,
                        "content": entry.content,
                        "importance": entry.importance,
                        "category": format!("{:?}", entry.category).to_lowercase(),
                        "created_at": entry.created_at,
                        "updated_at": entry.updated_at
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Ok(None) => Ok(ToolResult {
                    success: true,
                    data: json!({
                        "found": false,
                        "topic": topic,
                        "message": format!("No memory found for '{}'", topic)
                    }),
                    error: None,
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to recall memory: {}", e), "success": false }),
                    error: Some(format!("Failed to recall memory: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_memory_search_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing query parameter"))?
                .to_string();
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(20);

            match memory_state.manager.search(&query, limit) {
                Ok(entries) => {
                    let results: Vec<serde_json::Value> = entries
                        .iter()
                        .map(|e| {
                            json!({
                                "memory_id": e.id,
                                "topic": e.topic,
                                "content": e.content,
                                "importance": e.importance,
                                "category": format!("{:?}", e.category).to_lowercase(),
                            })
                        })
                        .collect();
                    let count = results.len();
                    Ok(ToolResult {
                        success: true,
                        data: json!({
                            "results": results,
                            "count": count,
                            "query": query
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    })
                }
                Err(e) => Ok(ToolResult {
                    success: false,
                    data: json!({ "error": format!("Failed to search memories: {}", e), "success": false }),
                    error: Some(format!("Failed to search memories: {}", e)),
                    metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                }),
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_memory_forget_tool(
        &self,
        args: &HashMap<String, Value>,
        tool_id: &str,
    ) -> Result<ToolResult> {
        if let Some(ref app) = self.app_handle {
            use crate::core::agi::memory_manager::MemoryCategory;
            use tauri::Manager;

            let memory_state = app.state::<crate::sys::commands::memory::MemoryState>();

            // Support either memory_id or category+topic
            if let Some(memory_id) = args.get("memory_id").and_then(|v| v.as_i64()) {
                match memory_state.manager.forget(memory_id) {
                    Ok(true) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": true,
                            "memory_id": memory_id,
                            "message": "Memory deleted successfully"
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Ok(false) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": false,
                            "memory_id": memory_id,
                            "message": "No memory found with that ID"
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to delete memory: {}", e), "success": false }),
                        error: Some(format!("Failed to delete memory: {}", e)),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                }
            } else {
                // Delete by category + topic
                let category_str = args
                    .get("category")
                    .and_then(|v| v.as_str())
                    .unwrap_or("fact");
                let category = match category_str.to_lowercase().as_str() {
                    "preference" | "preferences" => MemoryCategory::Preference,
                    "decision" | "decisions" => MemoryCategory::Decision,
                    "context" => MemoryCategory::Context,
                    _ => MemoryCategory::Fact,
                };
                let topic = args
                    .get("topic")
                    .or_else(|| args.get("key"))
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("Missing topic, key, or memory_id parameter"))?;

                match memory_state.manager.forget_topic(category, topic) {
                    Ok(true) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": true,
                            "topic": topic,
                            "message": format!("Memory '{}' deleted successfully", topic)
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Ok(false) => Ok(ToolResult {
                        success: true,
                        data: json!({
                            "deleted": false,
                            "topic": topic,
                            "message": format!("No memory found for '{}'", topic)
                        }),
                        error: None,
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Failed to delete memory: {}", e), "success": false }),
                        error: Some(format!("Failed to delete memory: {}", e)),
                        metadata: HashMap::from([("tool".to_string(), json!(tool_id))]),
                    }),
                }
            }
        } else {
            Ok(ToolResult {
                success: false,
                data: json!({ "error": "App handle not available for memory operations", "success": false }),
                error: Some("App handle not available for memory operations".to_string()),
                metadata: HashMap::new(),
            })
        }
    }

    async fn execute_api_download_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?
            .to_string();
        let save_path = args
            .get("save_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing save_path parameter"))?
            .to_string();

        // Validate destination path
        if let Err(e) = self.validate_path(&save_path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(&save_path))]),
            });
        }

        // Perform the download
        let client = reqwest::Client::new();
        match client.get(&url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    return Ok(ToolResult {
                        success: false,
                        data: json!({ "error": format!("Download failed with status: {}", response.status()), "success": false }),
                        error: Some(format!(
                            "Download failed with status: {}",
                            response.status()
                        )),
                        metadata: HashMap::from([("url".to_string(), json!(&url))]),
                    });
                }

                match response.bytes().await {
                    Ok(bytes) => {
                        // Ensure parent directory exists
                        if let Some(parent) = Path::new(&save_path).parent() {
                            let _ = fs::create_dir_all(parent).await;
                        }

                        match fs::write(&save_path, &bytes).await {
                            Ok(_) => {
                                let size = bytes.len();

                                // Record for undo if available
                                if let Some(app_handle) = &self.app_handle {
                                    if let Some(undo_state) =
                                        app_handle.try_state::<UndoState>()
                                    {
                                        let task_id = Uuid::new_v4().to_string();
                                        let path_buf = std::path::PathBuf::from(&save_path);
                                        let _ = undo_state
                                            .change_tracker
                                            .record_tool_executed_with_path(
                                                "api_download".to_string(),
                                                path_buf,
                                                None, // New file, no previous content
                                                None, // Downloaded file content not tracked
                                                task_id,
                                                true, // Downloads are reversible (delete the file)
                                                Some("Delete downloaded file".to_string()),
                                            )
                                            .await;
                                    }
                                }

                                Ok(ToolResult {
                                    success: true,
                                    data: json!({
                                        "success": true,
                                        "url": url,
                                        "save_path": save_path,
                                        "bytes_downloaded": size
                                    }),
                                    error: None,
                                    metadata: HashMap::from([
                                        ("url".to_string(), json!(&url)),
                                        ("save_path".to_string(), json!(&save_path)),
                                    ]),
                                })
                            }
                            Err(e) => {
                                let err_msg = format!("Failed to save file: {}", e);
                                Ok(ToolResult {
                                    success: false,
                                    data: json!({ "error": err_msg.clone(), "success": false }),
                                    error: Some(err_msg),
                                    metadata: HashMap::from([
                                        ("url".to_string(), json!(&url)),
                                        ("save_path".to_string(), json!(&save_path)),
                                    ]),
                                })
                            }
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to read response: {}", e);
                        Ok(ToolResult {
                            success: false,
                            data: json!({ "error": err_msg.clone(), "success": false }),
                            error: Some(err_msg),
                            metadata: HashMap::from([("url".to_string(), json!(&url))]),
                        })
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Download request failed: {}", e);
                Ok(ToolResult {
                    success: false,
                    data: json!({ "error": err_msg.clone(), "success": false }),
                    error: Some(err_msg),
                    metadata: HashMap::from([("url".to_string(), json!(&url))]),
                })
            }
        }
    }

    async fn execute_api_upload_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let file_path = args
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing file_path parameter"))?;

        // Validate the file path
        if let Err(e) = self.validate_path(file_path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("file_path".to_string(), json!(file_path))]),
            });
        }

        // Read file
        let file_content = fs::read(file_path)
            .await
            .map_err(|e| anyhow!("Failed to read file: {}", e))?;

        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload");

        // Create multipart form
        let part =
            reqwest::multipart::Part::bytes(file_content).file_name(file_name.to_string());
        let form = reqwest::multipart::Form::new().part("file", part);

        let client = reqwest::Client::new();
        let response = client
            .post(url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| anyhow!("Upload failed: {}", e))?;

        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();

        Ok(ToolResult {
            success: (200..300).contains(&status),
            data: json!({
                "status": status,
                "response": body,
                "file": file_path
            }),
            error: if status >= 400 {
                Some(format!("HTTP {}", status))
            } else {
                None
            },
            metadata: HashMap::from([
                ("url".to_string(), json!(url)),
                ("file_path".to_string(), json!(file_path)),
            ]),
        })
    }

    async fn execute_git_init_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing path parameter"))?;

        // Validate the path
        if let Err(e) = self.validate_path(path).await {
            return Ok(ToolResult {
                success: false,
                data: json!({ "error": e.to_string(), "success": false }),
                error: Some(e.to_string()),
                metadata: HashMap::from([("path".to_string(), json!(path))]),
            });
        }

        let output = tokio::process::Command::new("git")
            .args(["init"])
            .current_dir(path)
            .output()
            .await
            .map_err(|e| anyhow!("Failed to run git init: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(ToolResult {
            success: output.status.success(),
            data: json!({
                "message": stdout.trim(),
                "path": path
            }),
            error: if !output.status.success() {
                Some(stderr)
            } else {
                None
            },
            metadata: HashMap::from([("path".to_string(), json!(path))]),
        })
    }

    async fn execute_github_create_repo_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let name = args
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing name parameter"))?;
        let description = args
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let private = args
            .get("private")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Use gh CLI which handles auth
        let mut cmd_args = vec!["repo", "create", name, "--confirm"];
        if private {
            cmd_args.push("--private");
        } else {
            cmd_args.push("--public");
        }
        if !description.is_empty() {
            cmd_args.push("--description");
            cmd_args.push(description);
        }

        let output = tokio::process::Command::new("gh")
            .args(&cmd_args)
            .output()
            .await
            .map_err(|e| anyhow!("Failed to create repo: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(ToolResult {
            success: output.status.success(),
            data: json!({
                "name": name,
                "url": stdout.trim(),
                "private": private
            }),
            error: if !output.status.success() {
                Some(stderr)
            } else {
                None
            },
            metadata: HashMap::from([
                ("name".to_string(), json!(name)),
                ("private".to_string(), json!(private)),
            ]),
        })
    }

    async fn execute_physical_scrape_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing url parameter"))?;
        let selector = args.get("selector").and_then(|v| v.as_str());

        // Use a real browser user agent to avoid bot detection
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| anyhow!("Failed to create client: {}", e))?;

        let response = client
            .get(url)
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Accept-Language", "en-US,en;q=0.5")
            .send()
            .await
            .map_err(|e| anyhow!("Scrape request failed: {}", e))?;

        let status = response.status().as_u16();
        let html = response.text().await.unwrap_or_default();

        // If selector provided, note it for the response
        // Full CSS selector parsing would require the scraper crate
        let extracted = if let Some(sel) = selector {
            format!(
                "Selector '{}' requested. Full HTML returned for client-side extraction.",
                sel
            )
        } else {
            "Full HTML content returned.".to_string()
        };

        // Truncate HTML if too large to prevent memory issues
        let content = if html.len() > 50000 {
            html[..50000].to_string()
        } else {
            html.clone()
        };

        Ok(ToolResult {
            success: (200..300).contains(&status),
            data: json!({
                "url": url,
                "status": status,
                "content": content,
                "extracted": extracted,
                "content_length": html.len(),
                "truncated": html.len() > 50000
            }),
            error: if status >= 400 {
                Some(format!("HTTP {}", status))
            } else {
                None
            },
            metadata: HashMap::from([
                ("url".to_string(), json!(url)),
                ("selector".to_string(), json!(selector)),
            ]),
        })
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
            "image_generate" | "media_generate_image" => self.execute_image_generate_tool(&args).await,
            "video_generate" | "media_generate_video" => self.execute_video_generate_tool(&args).await,
            "llm_reason" => self.execute_llm_reason_tool(&args).await,
            "email_send" => self.execute_email_send_tool(&args, &tool.id).await,
            "email_fetch" => self.execute_email_fetch_tool(&args, &tool.id).await,
            "calendar_create_event" => self.execute_calendar_create_event_tool(&args, &tool.id).await,
            "calendar_list_events" => self.execute_calendar_list_events_tool(&args, &tool.id).await,
            "cloud_upload" => self.execute_cloud_upload_tool(&args, &tool.id).await,
            "cloud_download" => self.execute_cloud_download_tool(&args, &tool.id).await,
            "productivity_create_task" => self.execute_productivity_create_task_tool(&args, &tool.id).await,
            "document_read" => self.execute_document_read_tool(&args, &tool.id).await,
            "document_search" => self.execute_document_search_tool(&args, &tool.id).await,
            "document_create_word" => self.execute_document_create_word_tool(&args, &tool.id).await,
            "document_create_excel" => self.execute_document_create_excel_tool(&args, &tool.id).await,
            "document_create_pdf" => self.execute_document_create_pdf_tool(&args, &tool.id).await,
            "image_analyze" => self.execute_image_analyze_tool(&args).await,
            "git_status" => self.execute_git_status_tool(&args).await,
            "git_commit" => self.execute_git_commit_tool(&args).await,
            "git_clone" => self.execute_git_clone_tool(&args).await,
            "git_add" => self.execute_git_add_tool(&args).await,
            "schedule_reminder" => self.execute_schedule_reminder_tool(&args, &tool.id).await,
            "schedule_recurring_task" => self.execute_schedule_recurring_task_tool(&args, &tool.id).await,
            "cancel_scheduled_task" => self.execute_cancel_scheduled_task_tool(&args, &tool.id).await,
            "list_scheduled_tasks" => self.execute_list_scheduled_tasks_tool(&args, &tool.id).await,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::agi::tools::{ParameterType, ToolCapability, ToolParameter};
    use crate::core::agi::ResourceUsage;
    use std::sync::Arc;

    fn create_registry_with_file_list() -> Arc<ToolRegistry> {
        let registry = Arc::new(ToolRegistry::new().expect("registry"));
        registry
            .register_tool(crate::core::agi::tools::Tool {
                id: "file_list".to_string(),
                name: "List Files".to_string(),
                description: "List files in a directory".to_string(),
                capabilities: vec![ToolCapability::FileRead],
                parameters: vec![
                    ToolParameter {
                        name: "path".to_string(),
                        parameter_type: ParameterType::FilePath,
                        required: true,
                        description: "Path".to_string(),
                        default: None,
                    },
                    ToolParameter {
                        name: "limit".to_string(),
                        parameter_type: ParameterType::Integer,
                        required: false,
                        description: "Limit".to_string(),
                        default: None,
                    },
                    ToolParameter {
                        name: "offset".to_string(),
                        parameter_type: ParameterType::Integer,
                        required: false,
                        description: "Offset".to_string(),
                        default: None,
                    },
                ],
                estimated_resources: ResourceUsage {
                    cpu_percent: 0.0,
                    memory_mb: 0,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            })
            .expect("register file_list");
        registry
    }

    fn create_registry_with_browser_tool(
        tool_id: &str,
        params: Vec<ToolParameter>,
    ) -> Arc<ToolRegistry> {
        let registry = Arc::new(ToolRegistry::new().expect("registry"));
        registry
            .register_tool(crate::core::agi::tools::Tool {
                id: tool_id.to_string(),
                name: tool_id.to_string(),
                description: format!("{} tool", tool_id),
                capabilities: vec![ToolCapability::UIAutomation],
                parameters: params,
                estimated_resources: ResourceUsage {
                    cpu_percent: 0.0,
                    memory_mb: 0,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            })
            .expect("register browser tool");
        registry
    }

    #[test]
    fn test_build_job_autofill_profile_maps_aliases() {
        let mut args: HashMap<String, Value> = HashMap::new();
        args.insert("first_name".to_string(), json!("Siddhartha"));
        args.insert("last_name".to_string(), json!("Tester"));
        args.insert("email".to_string(), json!("sid@example.com"));
        args.insert(
            "linkedin_url".to_string(),
            json!("https://linkedin.com/in/sid"),
        );

        let profile = ToolExecutor::build_job_autofill_profile(&args).expect("profile");

        assert_eq!(
            profile.get("firstName").and_then(Value::as_str),
            Some("Siddhartha")
        );
        assert_eq!(
            profile.get("lastName").and_then(Value::as_str),
            Some("Tester")
        );
        assert_eq!(
            profile.get("email").and_then(Value::as_str),
            Some("sid@example.com")
        );
        assert_eq!(
            profile.get("linkedinUrl").and_then(Value::as_str),
            Some("https://linkedin.com/in/sid")
        );
    }

    #[test]
    fn test_build_job_autofill_profile_requires_data() {
        let args: HashMap<String, Value> = HashMap::new();
        let result = ToolExecutor::build_job_autofill_profile(&args);
        assert!(result.is_err());
        assert!(result
            .err()
            .expect("missing profile should fail")
            .to_string()
            .contains("Missing profile parameter"));
    }

    #[test]
    fn test_build_job_autofill_options_maps_aliases() {
        let mut args: HashMap<String, Value> = HashMap::new();
        args.insert("auto_submit".to_string(), json!(true));
        args.insert(
            "allow_submit_with_missing_required".to_string(),
            json!(false),
        );
        args.insert("delay_ms".to_string(), json!(250));
        args.insert("max_submit_steps".to_string(), json!(4));

        let options = ToolExecutor::build_job_autofill_options(&args);

        assert_eq!(
            options.get("autoSubmit").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            options
                .get("allowSubmitWithMissingRequired")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(options.get("delayMs").and_then(Value::as_u64), Some(250));
        assert_eq!(
            options.get("maxSubmitSteps").and_then(Value::as_u64),
            Some(4)
        );
    }

    #[test]
    fn test_tool_call_parsing() {
        let tool_call = ToolCall {
            id: "test_123".to_string(),
            name: "file_read".to_string(),
            arguments: serde_json::json!({
                "path": "/tmp/test.txt"
            })
            .to_string(),
        };

        assert_eq!(tool_call.id, "test_123");
        assert_eq!(tool_call.name, "file_read");

        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments).unwrap();
        assert!(args.get("path").and_then(|v| v.as_str()).is_some());
    }

    #[tokio::test]
    async fn test_unknown_tool_returns_failed_result() {
        let registry = Arc::new(ToolRegistry::new().expect("registry"));
        let executor = ToolExecutor::new(registry);
        let tool_call = ToolCall {
            id: "test_unknown_tool".to_string(),
            name: "nonexistent_tool".to_string(),
            arguments: "{}".to_string(),
        };

        let result = executor
            .execute_tool_call(&tool_call)
            .await
            .expect("unknown tool should surface as tool failure");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Tool not found: nonexistent_tool"));
    }

    #[tokio::test]
    async fn test_missing_required_parameter_returns_failed_result() {
        let registry = create_registry_with_browser_tool(
            "custom_required_tool",
            vec![ToolParameter {
                name: "input".to_string(),
                parameter_type: ParameterType::String,
                required: true,
                description: "Required input".to_string(),
                default: None,
            }],
        );
        let executor = ToolExecutor::new(registry);
        let tool_call = ToolCall {
            id: "test_missing_required_parameter".to_string(),
            name: "custom_required_tool".to_string(),
            arguments: "{}".to_string(),
        };

        let result = executor
            .execute_tool_call(&tool_call)
            .await
            .expect("missing parameters should surface as tool failure");

        assert!(!result.success);
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Missing required parameter: input"));
    }

    #[tokio::test]
    async fn test_tool_execution_file_read() {
        use std::fs::File;
        use std::io::Write;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        {
            let mut file = File::create(&file_path).unwrap();
            writeln!(file, "Hello, World!").unwrap();
        }

        let tool_call = ToolCall {
            id: "test_file_read".to_string(),
            name: "file_read".to_string(),
            arguments: serde_json::json!({
                "path": file_path.to_str().unwrap()
            })
            .to_string(),
        };

        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments).unwrap();
        let path_str = args.get("path").and_then(|v| v.as_str()).unwrap();
        let content = std::fs::read_to_string(path_str).unwrap();
        assert!(content.contains("Hello, World!"));
    }

    #[tokio::test]
    async fn test_tool_execution_file_write() {
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_write.txt");
        let path_str = file_path.to_str().unwrap();

        let tool_call = ToolCall {
            id: "test_file_write".to_string(),
            name: "file_write".to_string(),
            arguments: serde_json::json!({
                "path": path_str,
                "content": "Written by test"
            })
            .to_string(),
        };

        let registry = std::sync::Arc::new(ToolRegistry::new().unwrap());

        registry
            .register_tool(crate::core::agi::tools::Tool {
                id: "file_write".to_string(),
                name: "Write File".to_string(),
                description: "Write content to a file".to_string(),
                capabilities: vec![crate::core::agi::tools::ToolCapability::FileWrite],
                parameters: vec![
                    crate::core::agi::tools::ToolParameter {
                        name: "path".to_string(),
                        parameter_type: crate::core::agi::tools::ParameterType::FilePath,
                        required: true,
                        description: "Path".to_string(),
                        default: None,
                    },
                    crate::core::agi::tools::ToolParameter {
                        name: "content".to_string(),
                        parameter_type: crate::core::agi::tools::ParameterType::String,
                        required: true,
                        description: "Content".to_string(),
                        default: None,
                    },
                ],
                estimated_resources: crate::core::agi::ResourceUsage {
                    cpu_percent: 0.0,
                    memory_mb: 0,
                    network_mb: 0.0,
                },
                dependencies: vec![],
            })
            .unwrap();

        let executor = ToolExecutor::new(registry);
        let result = executor.execute_tool_call(&tool_call).await.unwrap();

        assert!(result.success);
        let content = std::fs::read_to_string(path_str).unwrap();
        assert_eq!(content, "Written by test");
    }

    #[tokio::test]
    async fn test_tool_execution_search_web_args() {
        let tool_call = ToolCall {
            id: "test_search".to_string(),
            name: "search_web".to_string(),
            arguments: serde_json::json!({
                "query": "rust tauri"
            })
            .to_string(),
        };

        let args: HashMap<String, serde_json::Value> =
            serde_json::from_str(&tool_call.arguments).unwrap();
        assert_eq!(
            args.get("query").and_then(|v| v.as_str()).unwrap(),
            "rust tauri"
        );
    }

    #[tokio::test]
    async fn test_file_list_returns_entries_with_limits() {
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "a").unwrap();
        fs::write(dir.path().join("b.txt"), "b").unwrap();
        fs::create_dir(dir.path().join("nested")).unwrap();

        let tool_call = ToolCall {
            id: "test_file_list_basic".to_string(),
            name: "file_list".to_string(),
            arguments: serde_json::json!({
                "path": dir.path().to_string_lossy(),
                "limit": 2
            })
            .to_string(),
        };

        let executor = ToolExecutor::new(create_registry_with_file_list());
        let result = executor.execute_tool_call(&tool_call).await.unwrap();

        assert!(result.success, "file_list should succeed");
        assert_eq!(result.data["returned"].as_u64(), Some(2));
        assert_eq!(result.data["has_more"].as_bool(), Some(true));
        assert_eq!(result.data["next_offset"].as_u64(), Some(2));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_file_list_permission_denied_returns_error() {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let blocked = dir.path().join("blocked");
        fs::create_dir(&blocked).unwrap();
        fs::set_permissions(&blocked, fs::Permissions::from_mode(0o000)).unwrap();

        let tool_call = ToolCall {
            id: "test_file_list_denied".to_string(),
            name: "file_list".to_string(),
            arguments: serde_json::json!({
                "path": blocked.to_string_lossy(),
                "timeout_ms": 2000
            })
            .to_string(),
        };

        let executor = ToolExecutor::new(create_registry_with_file_list());
        let result = executor.execute_tool_call(&tool_call).await.unwrap();

        fs::set_permissions(&blocked, fs::Permissions::from_mode(0o755)).unwrap();

        assert!(
            !result.success,
            "file_list should fail on permission denied"
        );
        assert!(result
            .error
            .unwrap_or_default()
            .contains("Failed to list directory"));
    }

    #[tokio::test]
    async fn test_file_list_large_directory_paginates() {
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        for idx in 0..600usize {
            fs::write(dir.path().join(format!("file_{idx}.txt")), "x").unwrap();
        }

        let tool_call = ToolCall {
            id: "test_file_list_pagination".to_string(),
            name: "file_list".to_string(),
            arguments: serde_json::json!({
                "path": dir.path().to_string_lossy(),
                "limit": 100,
                "offset": 200
            })
            .to_string(),
        };

        let executor = ToolExecutor::new(create_registry_with_file_list());
        let result = executor.execute_tool_call(&tool_call).await.unwrap();

        assert!(result.success);
        assert_eq!(result.data["returned"].as_u64(), Some(100));
        assert_eq!(result.data["offset"].as_u64(), Some(200));
        assert_eq!(result.data["has_more"].as_bool(), Some(true));
        assert_eq!(result.data["next_offset"].as_u64(), Some(300));
    }

    #[tokio::test]
    async fn test_file_list_defaults_to_project_folder_when_path_missing() {
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        fs::write(dir.path().join("fallback.txt"), "ok").unwrap();

        let tool_call = ToolCall {
            id: "test_file_list_missing_path".to_string(),
            name: "file_list".to_string(),
            arguments: serde_json::json!({
                "limit": 20
            })
            .to_string(),
        };

        let mut executor = ToolExecutor::new(create_registry_with_file_list());
        executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

        let result = executor.execute_tool_call(&tool_call).await.unwrap();
        assert!(
            result.success,
            "file_list should use project folder fallback, got error={:?} data={}",
            result.error, result.data
        );
        let entries = result.data["entries"]
            .as_array()
            .expect("entries should be present");
        assert!(
            entries
                .iter()
                .any(|entry| entry["name"].as_str() == Some("fallback.txt")),
            "fallback directory listing should include file from project folder"
        );
    }

    #[tokio::test]
    async fn test_mcp_list_allowed_directories_uses_local_fallback() {
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let project_path = dir.path().to_string_lossy().to_string();

        let mut executor = ToolExecutor::new(create_registry_with_file_list());
        executor.set_project_folder(Some(project_path.clone()));

        let tool_call = ToolCall {
            id: "test_mcp_list_allowed_dirs".to_string(),
            name: "mcp__filesystem__list_allowed_directories".to_string(),
            arguments: serde_json::json!({}).to_string(),
        };

        let result = executor.execute_tool_call(&tool_call).await.unwrap();
        assert!(result.success);
        assert_eq!(result.data["source"].as_str(), Some("local_fallback"));
        let directories = result.data["directories"]
            .as_array()
            .expect("directories should be an array");
        assert!(
            directories
                .iter()
                .any(|entry| entry.as_str() == Some(project_path.as_str())),
            "fallback directories should include project folder"
        );
    }

    #[tokio::test]
    async fn test_mcp_read_text_file_uses_local_fallback() {
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let file_path = dir.path().join("notes.txt");
        fs::write(&file_path, "hello from fallback").unwrap();

        let mut executor = ToolExecutor::new(create_registry_with_file_list());
        executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

        let tool_call = ToolCall {
            id: "test_mcp_read_text_file".to_string(),
            name: "mcp__filesystem__read_text_file".to_string(),
            arguments: serde_json::json!({
                "path": file_path.to_string_lossy()
            })
            .to_string(),
        };

        let result = executor.execute_tool_call(&tool_call).await.unwrap();
        assert!(result.success);
        assert_eq!(result.data["source"].as_str(), Some("local_fallback"));
        assert_eq!(result.data["content"].as_str(), Some("hello from fallback"));
    }

    #[test]
    fn test_mcp_list_directory_payload_is_normalized() {
        let mut args = HashMap::new();
        args.insert("path".to_string(), json!("/workspace/project"));
        let raw_result = json!({
            "content": [
                {
                    "type": "text",
                    "text": "[DIR] src\n[FILE] Cargo.toml (382 bytes)"
                }
            ]
        });

        let normalized = ToolExecutor::normalize_mcp_tool_result(
            "mcp__filesystem__list_directory",
            &args,
            raw_result,
        );

        assert_eq!(
            normalized["source"].as_str(),
            Some("mcp_filesystem_list_directory")
        );
        assert_eq!(normalized["returned"].as_u64(), Some(2));
        let entries = normalized["entries"]
            .as_array()
            .expect("entries should be present");
        assert!(entries
            .iter()
            .any(|entry| entry["name"].as_str() == Some("src")
                && entry["type"].as_str() == Some("directory")));
        assert!(entries
            .iter()
            .any(|entry| entry["name"].as_str() == Some("Cargo.toml")
                && entry["type"].as_str() == Some("file")));
    }

    #[test]
    fn test_mcp_list_allowed_directories_payload_is_normalized() {
        let args = HashMap::new();
        let raw_result = json!({
            "content": [
                {
                    "type": "text",
                    "text": "Allowed directories:\n- /Users/sid/Documents\n- /tmp"
                }
            ]
        });

        let normalized = ToolExecutor::normalize_mcp_tool_result(
            "mcp__filesystem__list_allowed_directories",
            &args,
            raw_result,
        );

        assert_eq!(
            normalized["source"].as_str(),
            Some("mcp_filesystem_list_allowed_directories")
        );
        let directories = normalized["directories"]
            .as_array()
            .expect("directories should be present");
        assert!(directories
            .iter()
            .any(|value| value.as_str() == Some("/Users/sid/Documents")));
        assert!(directories
            .iter()
            .any(|value| value.as_str() == Some("/tmp")));
    }

    #[test]
    fn test_mcp_read_text_file_payload_is_normalized() {
        let mut args = HashMap::new();
        args.insert("path".to_string(), json!("/workspace/project/notes.txt"));
        let raw_result = json!({
            "content": [
                { "type": "text", "text": "line one" },
                { "type": "text", "text": "line two" }
            ]
        });

        let normalized = ToolExecutor::normalize_mcp_tool_result(
            "mcp__filesystem__read_text_file",
            &args,
            raw_result,
        );

        assert_eq!(
            normalized["source"].as_str(),
            Some("mcp_filesystem_read_text_file")
        );
        assert_eq!(
            normalized["path"].as_str(),
            Some("/workspace/project/notes.txt")
        );
        assert_eq!(normalized["content"].as_str(), Some("line one\nline two"));
    }

    #[tokio::test]
    async fn test_browser_tool_is_routed_not_unknown() {
        let tool_call = ToolCall {
            id: "test_browser_get_url".to_string(),
            name: "browser_get_url".to_string(),
            arguments: serde_json::json!({}).to_string(),
        };
        let executor =
            ToolExecutor::new(create_registry_with_browser_tool("browser_get_url", vec![]));
        let err = executor
            .execute_tool_call(&tool_call)
            .await
            .expect_err("browser tool should fail cleanly without app handle");
        let message = err.to_string();
        assert!(
            message.contains("App handle not available for browser automation"),
            "unexpected error: {message}"
        );
    }

    #[tokio::test]
    async fn test_browser_autofill_tool_is_routed_not_unknown() {
        let tool_call = ToolCall {
            id: "test_browser_autofill_job_application".to_string(),
            name: "browser_autofill_job_application".to_string(),
            arguments: serde_json::json!({
                "profile": {
                    "firstName": "Siddhartha",
                    "lastName": "Tester",
                    "email": "sid@example.com"
                },
                "options": {
                    "autoSubmit": false
                }
            })
            .to_string(),
        };

        let executor = ToolExecutor::new(create_registry_with_browser_tool(
            "browser_autofill_job_application",
            vec![ToolParameter {
                name: "profile".to_string(),
                parameter_type: ParameterType::Object,
                required: true,
                description: "Profile object".to_string(),
                default: None,
            }],
        ));
        let err = executor
            .execute_tool_call(&tool_call)
            .await
            .expect_err("autofill browser tool should fail cleanly without app handle");
        let message = err.to_string();
        assert!(
            message.contains("App handle not available for browser automation"),
            "unexpected error: {message}"
        );
    }

    #[tokio::test]
    async fn test_registry_tools_are_routable_in_executor() {
        let registry = Arc::new(ToolRegistry::new().expect("registry"));
        registry
            .register_all_tools()
            .expect("register all default tools");
        let executor = ToolExecutor::new(registry.clone());

        let mut tool_ids: Vec<String> = registry
            .list_tools()
            .iter()
            .map(|tool| tool.id.clone())
            .collect();
        tool_ids.sort();

        for tool_id in tool_ids {
            let tool_call = ToolCall {
                id: format!("coverage_{tool_id}"),
                name: tool_id.clone(),
                arguments: "{}".to_string(),
            };

            if let Err(err) = executor.execute_tool_call(&tool_call).await {
                let message = err.to_string();
                assert!(
                    !message.contains("Unknown tool"),
                    "tool '{tool_id}' is registered but not routable in execute_tool_impl: {message}",
                );
            }
        }
    }

    #[test]
    fn test_tilde_expansion() {
        let mut args: HashMap<String, Value> = HashMap::new();
        args.insert("path".to_string(), json!("~/Documents/test.txt"));

        ToolExecutor::expand_tilde_in_args(&mut args);

        let expanded = args
            .get("path")
            .and_then(|v| v.as_str())
            .expect("path should be present");
        assert!(
            expanded.starts_with('/'),
            "expanded path should be absolute, got: {expanded}"
        );
        assert!(
            !expanded.contains('~'),
            "expanded path should not contain tilde, got: {expanded}"
        );
        assert!(
            expanded.ends_with("/Documents/test.txt"),
            "expanded path should preserve relative portion, got: {expanded}"
        );
    }
}
