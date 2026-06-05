use crate::sys::security::rate_limit::{RateLimitConfig, RateLimiter};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::{debug, warn};

/// Safety tier for tool execution - determines what level of user interaction is required
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolSafetyTier {
    /// Tool is safe to execute without any user interaction
    Safe,
    /// Tool should notify user but doesn't require explicit approval
    RequiresNotification,
    /// Tool requires user confirmation before execution
    RequiresConfirmation,
    /// Tool requires explicit approval with detailed review
    RequiresExplicitApproval,
}

impl ToolSafetyTier {
    /// Returns true if this tier requires some form of user action before execution
    pub fn requires_user_action(&self) -> bool {
        matches!(
            self,
            ToolSafetyTier::RequiresConfirmation | ToolSafetyTier::RequiresExplicitApproval
        )
    }

    /// Returns a human-readable description of this safety tier
    pub fn description(&self) -> &'static str {
        match self {
            ToolSafetyTier::Safe => "Safe to execute automatically",
            ToolSafetyTier::RequiresNotification => "Will notify you when executing",
            ToolSafetyTier::RequiresConfirmation => "Requires your confirmation",
            ToolSafetyTier::RequiresExplicitApproval => {
                "Requires explicit approval with detailed review"
            }
        }
    }
}

/// Request for tool confirmation from the user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfirmationRequest {
    /// Unique identifier for this confirmation request
    pub request_id: String,
    /// Name of the tool being executed
    pub tool_name: String,
    /// Human-readable description of what the tool does
    pub tool_description: String,
    /// Parameters being passed to the tool
    pub parameters: Value,
    /// Risk level of the operation
    pub risk_level: RiskLevel,
    /// Safety tier that triggered this confirmation
    pub safety_tier: ToolSafetyTier,
    /// Reason why confirmation is required
    pub reason: String,
    /// Whether this action can be undone
    pub reversible: bool,
    /// Description of how to undo the action (if reversible)
    pub undo_description: Option<String>,
}

/// Response from user for a tool confirmation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfirmationResponse {
    /// ID of the confirmation request being responded to
    pub request_id: String,
    /// Whether the user approved the execution
    pub approved: bool,
    /// Whether to remember this choice for future executions of this tool
    pub remember_choice: bool,
    /// Optional reason provided by user (especially if denied)
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ToolPolicy {
    pub max_rate_per_minute: usize,
    pub requires_approval: bool,
    pub allowed_parameters: Vec<String>,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, thiserror::Error)]
pub enum SecurityError {
    #[error("Unauthorized tool: {0}")]
    UnauthorizedTool(String),

    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    #[error("Rate limit exceeded for tool: {0}")]
    RateLimitExceeded(String),

    #[error("Path traversal detected: {0}")]
    PathTraversal(String),

    #[error("Command injection detected: {0}")]
    CommandInjection(String),

    #[error("Approval required but not granted")]
    ApprovalRequired,

    #[error("Blocked domain: {0}")]
    BlockedDomain(String),

    #[error("Insecure protocol: {0}")]
    InsecureProtocol(String),

    #[error("Capability disabled: {0}")]
    CapabilityDisabled(String),
}

pub struct ToolExecutionGuard {
    allowed_tools: std::sync::RwLock<HashMap<String, ToolPolicy>>,
    rate_limiters: Arc<Mutex<HashMap<String, RateLimiter>>>,
    allowed_paths: std::sync::RwLock<Vec<PathBuf>>,
    blocked_domains: Vec<String>,
}

impl ToolExecutionGuard {
    pub fn new() -> Self {
        let mut allowed_tools = HashMap::new();

        allowed_tools.insert(
            "file_read".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "file_read_binary".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "file_write".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "path".to_string(),
                    "content".to_string(),
                    "expected_sha256".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "file_list".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![
                    "path".to_string(),
                    "limit".to_string(),
                    "offset".to_string(),
                    "exclude".to_string(),
                    "timeout_ms".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "file_delete".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["path".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "ui_screenshot".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["region".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "ui_click".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec![
                    "target".to_string(),
                    "x".to_string(),
                    "y".to_string(),
                    "button".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "ui_type".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec![
                    "target".to_string(),
                    "text".to_string(),
                    "delay_ms".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_navigate".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["url".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_click".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "x".to_string(),
                    "y".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_extract".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "attribute".to_string(),
                    "extract_type".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_type".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "text".to_string(),
                    "clear_first".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_wait_for_selector".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "timeout_ms".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_get_text".to_string(),
            ToolPolicy {
                max_rate_per_minute: 120,
                requires_approval: false,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_get_attribute".to_string(),
            ToolPolicy {
                max_rate_per_minute: 120,
                requires_approval: false,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "attribute".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_screenshot".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["full_page".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_hover".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_focus".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_scroll_into_view".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_query_all".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_execute_async_js".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "script".to_string(),
                    "timeout_ms".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_get_element_state".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_wait_for_interactive".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "timeout_ms".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_select_option".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec![
                    "selector".to_string(),
                    "value".to_string(),
                    "tab_id".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_check".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_uncheck".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: true,
                allowed_parameters: vec!["selector".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "browser_get_url".to_string(),
            ToolPolicy {
                max_rate_per_minute: 120,
                requires_approval: false,
                allowed_parameters: vec!["tab_id".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_get_title".to_string(),
            ToolPolicy {
                max_rate_per_minute: 120,
                requires_approval: false,
                allowed_parameters: vec!["tab_id".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_go_back".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_go_forward".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_reload".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_wait_for_navigation".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["timeout_ms".to_string(), "tab_id".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "browser_get_dom_snapshot".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["tab_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "search_web".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec![
                    "query".to_string(),
                    "num_results".to_string(),
                    "search_type".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "physical_scrape".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["url".to_string(), "selector".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "terminal_execute".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "command".to_string(),
                    "cwd".to_string(),
                    "timeout_ms".to_string(),
                    "max_output_bytes".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "background_agent_start".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "goal".to_string(),
                    "working_directory".to_string(),
                    "custom_instructions".to_string(),
                    "priority".to_string(),
                    "conversation_id".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "background_agent_get".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec![
                    "agent_id".to_string(),
                    "block".to_string(),
                    "timeout_ms".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "background_agent_cancel".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["agent_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "document_read".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["file_path".to_string(), "path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "document_extract_text".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["file_path".to_string(), "path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "document_get_metadata".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["file_path".to_string(), "path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "document_detect_type".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["file_path".to_string(), "path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "document_search".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec![
                    "file_path".to_string(),
                    "path".to_string(),
                    "query".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "document_create_pdf".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "output_path".to_string(),
                    "title".to_string(),
                    "author".to_string(),
                    "paragraphs".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "document_create_word".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "output_path".to_string(),
                    "title".to_string(),
                    "author".to_string(),
                    "paragraphs".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "document_create_excel".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "output_path".to_string(),
                    "sheet_name".to_string(),
                    "headers".to_string(),
                    "rows".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "code_execute".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["language".to_string(), "code".to_string()],
                risk_level: RiskLevel::Critical,
            },
        );

        allowed_tools.insert(
            "db_query".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["query".to_string(), "params".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "api_call".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: true,
                allowed_parameters: vec![
                    "url".to_string(),
                    "method".to_string(),
                    "headers".to_string(),
                    "body".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "image_ocr".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec!["image_path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        // LLM reasoning — pure internal reasoning, no side effects
        allowed_tools.insert(
            "llm_reason".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["prompt".to_string(), "context".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        // Code analysis — read-only, no execution
        allowed_tools.insert(
            "code_analyze".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["code".to_string(), "language".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        // Grep search — read-only content search
        allowed_tools.insert(
            "grep_search".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec![
                    "pattern".to_string(),
                    "root".to_string(),
                    "include_pattern".to_string(),
                    "case_insensitive".to_string(),
                    "output_mode".to_string(),
                    "context_lines".to_string(),
                    "limit".to_string(),
                    "offset".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        // Glob search — read-only file pattern matching
        allowed_tools.insert(
            "glob_search".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec![
                    "pattern".to_string(),
                    "root".to_string(),
                    "limit".to_string(),
                    "offset".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "multi_edit".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["edits".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "apply_patch".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "path".to_string(),
                    "patch".to_string(),
                    "expected_sha256".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        // Exact string replacement edit — modifies files
        allowed_tools.insert(
            "edit_exact_replace".to_string(),
            ToolPolicy {
                max_rate_per_minute: 15,
                requires_approval: true,
                allowed_parameters: vec![
                    "path".to_string(),
                    "old_text".to_string(),
                    "new_text".to_string(),
                    "replace_all".to_string(),
                    "expected_sha256".to_string(),
                    "session_id".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        // Image analysis via AI vision
        allowed_tools.insert(
            "image_analyze".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec![
                    "image_path".to_string(),
                    "question".to_string(),
                    "detail".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        // AI image generation
        allowed_tools.insert(
            "image_generate".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "prompt".to_string(),
                    "provider".to_string(),
                    "size".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        // AI video generation
        allowed_tools.insert(
            "video_generate".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "prompt".to_string(),
                    "duration_seconds".to_string(),
                    "duration_secs".to_string(),
                    "duration".to_string(),
                    "resolution".to_string(),
                    "provider".to_string(),
                    "input_image_url".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        // Email operations
        allowed_tools.insert(
            "email_fetch".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec![
                    "account_id".to_string(),
                    "folder".to_string(),
                    "limit".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "email_send".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "account_id".to_string(),
                    "to".to_string(),
                    "cc".to_string(),
                    "bcc".to_string(),
                    "reply_to".to_string(),
                    "subject".to_string(),
                    "body".to_string(),
                    "body_text".to_string(),
                    "body_html".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        // Calendar operations
        allowed_tools.insert(
            "calendar_list_events".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec![
                    "account_id".to_string(),
                    "calendar_id".to_string(),
                    "start_time".to_string(),
                    "end_time".to_string(),
                    "max_results".to_string(),
                    "show_deleted".to_string(),
                    "request".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "calendar_create_event".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "account_id".to_string(),
                    "calendar_id".to_string(),
                    "title".to_string(),
                    "description".to_string(),
                    "location".to_string(),
                    "start_time".to_string(),
                    "end_time".to_string(),
                    "timezone".to_string(),
                    "attendees".to_string(),
                    "reminders".to_string(),
                    "recurrence".to_string(),
                    "event".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        // Cloud storage operations
        allowed_tools.insert(
            "cloud_download".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec![
                    "account_id".to_string(),
                    "remote_path".to_string(),
                    "local_path".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "cloud_upload".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "account_id".to_string(),
                    "local_path".to_string(),
                    "remote_path".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "productivity_create_task".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "provider".to_string(),
                    "task".to_string(),
                    "id".to_string(),
                    "title".to_string(),
                    "description".to_string(),
                    "status".to_string(),
                    "due_date".to_string(),
                    "assignee".to_string(),
                    "assignee_name".to_string(),
                    "priority".to_string(),
                    "tags".to_string(),
                    "url".to_string(),
                    "project_id".to_string(),
                    "project_name".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        // Database operations (beyond existing db_query)
        allowed_tools.insert(
            "db_execute".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec![
                    "connection_id".to_string(),
                    "sql".to_string(),
                    "params".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "db_transaction_begin".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["connection_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "db_transaction_commit".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["connection_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "db_transaction_rollback".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec!["connection_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        // Memory tools for persistent cross-session storage
        allowed_tools.insert(
            "memory_remember".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![
                    "category".to_string(),
                    "topic".to_string(),
                    "content".to_string(),
                    "importance".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "memory_recall".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["category".to_string(), "topic".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "memory_search".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["query".to_string(), "limit".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "memory_forget".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec!["category".to_string(), "topic".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        // Scheduler tools
        allowed_tools.insert(
            "schedule_reminder".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec!["message".to_string(), "time".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "schedule_recurring_task".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "name".to_string(),
                    "schedule".to_string(),
                    "task_description".to_string(),
                    "action_type".to_string(),
                    "action_data".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "cancel_scheduled_task".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["job_id".to_string(), "task_id".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "list_scheduled_tasks".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![],
                risk_level: RiskLevel::Low,
            },
        );

        // API file transfer operations
        allowed_tools.insert(
            "api_upload".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "url".to_string(),
                    "file_path".to_string(),
                    "field_name".to_string(),
                    "fields".to_string(),
                    "auth".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "api_download".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec![
                    "url".to_string(),
                    "save_path".to_string(),
                    "auth".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        // Git operations
        allowed_tools.insert(
            "git_status".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "git_diff".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![
                    "path".to_string(),
                    "file_path".to_string(),
                    "staged".to_string(),
                    "max_bytes".to_string(),
                ],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "git_log".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string(), "limit".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "git_list_branches".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "worktree_create".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["repo_path".to_string(), "slug".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "worktree_list".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["repo_path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "worktree_remove".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "repo_path".to_string(),
                    "slug".to_string(),
                    "force".to_string(),
                    "delete_branch".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "undo_get_summary".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["task_id".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "undo_get_changes".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["task_id".to_string(), "limit".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "undo_last".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["task_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "undo_change".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["change_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "coding_checkpoint_create".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["name".to_string(), "paths".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "coding_checkpoint_list".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "coding_checkpoint_rewind".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["checkpoint_id".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "git_add".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["path".to_string(), "files".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "git_commit".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["path".to_string(), "message".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "git_push".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "path".to_string(),
                    "remote".to_string(),
                    "branch".to_string(),
                ],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "git_clone".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "url".to_string(),
                    "destination".to_string(),
                    "branch".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        Self {
            allowed_tools: std::sync::RwLock::new(allowed_tools),
            rate_limiters: Arc::new(Mutex::new(HashMap::new())),
            allowed_paths: std::sync::RwLock::new({
                #[allow(unused_mut)]
                let mut paths = vec![std::env::temp_dir()];
                // On Unix, /tmp may differ from std::env::temp_dir() (e.g. /var/folders on
                // macOS), so include it explicitly. Skip on Windows where /tmp does not exist.
                #[cfg(not(target_os = "windows"))]
                paths.push(PathBuf::from("/tmp"));
                paths
            }),
            blocked_domains: vec![
                "localhost".to_string(),
                "127.0.0.1".to_string(),
                "0.0.0.0".to_string(),
                "169.254.169.254".to_string(),
            ],
        }
    }

    /// Dynamically register an MCP tool so it passes ToolGuard validation.
    /// MCP tools are assigned a default policy with Medium risk and rate-limited
    /// to 20 calls/min. File/URL/command parameters are still validated by
    /// `validate_mcp_tool_params` during `validate_tool_call`.
    ///
    /// FIX R-25: Dynamically registered MCP tools default to `requires_approval: true`.
    /// MCP tools come from external servers whose behavior is not audited by us.
    /// Requiring user approval by default ensures no MCP tool can perform side-effects
    /// without explicit user consent, following the principle of least privilege.
    pub fn register_mcp_tool(&self, tool_name: &str) {
        if let Ok(mut guard) = self.allowed_tools.write() {
            if !guard.contains_key(tool_name) {
                debug!("Registering dynamic MCP tool in ToolGuard: {}", tool_name);
                guard.insert(
                    tool_name.to_string(),
                    ToolPolicy {
                        max_rate_per_minute: 20,
                        requires_approval: true,
                        allowed_parameters: vec![], // MCP tools have dynamic params
                        risk_level: RiskLevel::Medium,
                    },
                );
            }
        }
    }

    /// Validate security-sensitive parameters on MCP tool calls.
    /// Inspects all parameter values for paths, URLs, and command strings
    /// regardless of the specific MCP tool, since MCP tools are dynamic.
    fn validate_mcp_tool_params(
        &self,
        parameters: &Value,
    ) -> std::result::Result<(), SecurityError> {
        let obj = match parameters.as_object() {
            Some(o) => o,
            None => return Ok(()),
        };

        for (key, value) in obj {
            let key_lower = key.to_lowercase();
            let val_str = match value.as_str() {
                Some(s) => s,
                None => continue,
            };

            if key_lower.contains("path")
                || key_lower.contains("file")
                || key_lower.contains("dir")
                || key_lower.contains("directory")
                || key_lower.contains("folder")
                || key_lower == "destination"
                || key_lower == "target"
                || key_lower == "source"
                || key_lower == "location"
                || key_lower == "output"
                || key_lower == "input"
                || key_lower == "cwd"
                || key_lower == "root"
                || key_lower == "base"
            {
                self.validate_file_path(val_str)?;
            }

            // URL parameters — validate for blocked domains, SSRF, etc.
            if key_lower.contains("url") || key_lower.contains("uri") || key_lower.contains("href")
            {
                self.validate_url(val_str)?;
            }

            if key_lower == "command" || key_lower == "cmd" || key_lower == "shell" {
                use crate::sys::security::command_validator::{validate_command, ValidationConfig};
                let cfg = ValidationConfig::oneshot();
                if let Err(e) = validate_command(val_str, &cfg) {
                    return Err(SecurityError::CommandInjection(format!(
                        "MCP tool parameter '{}' failed command validation: {}",
                        key, e
                    )));
                }
            }

            if key_lower == "code" || key_lower == "script" {
                self.validate_code(val_str)?;
            }

            if key_lower == "query" || key_lower == "sql" {
                self.validate_sql(val_str)?;
            }
        }

        Ok(())
    }

    /// Override the allowed paths for file operations.
    /// Use this to enforce per-user allowed directories from settings.
    /// Paths are canonicalized to prevent symlink bypass attacks.
    /// This method uses interior mutability via RwLock.
    pub fn set_allowed_paths(&self, paths: Vec<PathBuf>) {
        if !paths.is_empty() {
            // Canonicalize each path to resolve symlinks and relative segments,
            // preventing traversal via symlinks that point outside allowed directories.
            let canonical_paths: Vec<PathBuf> = paths
                .into_iter()
                .map(|p| std::fs::canonicalize(&p).unwrap_or(p))
                .collect();
            if let Ok(mut guard) = self.allowed_paths.write() {
                *guard = canonical_paths;
            }
        }
    }

    /// Get the current allowed paths (for debugging/inspection)
    pub fn get_allowed_paths(&self) -> Vec<PathBuf> {
        self.allowed_paths
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub async fn validate_tool_call(
        &self,
        tool_name: &str,
        parameters: &Value,
    ) -> std::result::Result<(), SecurityError> {
        debug!(
            "Validating tool call: {} with params: {:?}",
            tool_name, parameters
        );

        let policy = {
            let guard = self.allowed_tools.read().map_err(|_| {
                SecurityError::UnauthorizedTool("ToolGuard lock poisoned".to_string())
            })?;
            guard
                .get(tool_name)
                .cloned()
                .ok_or_else(|| SecurityError::UnauthorizedTool(tool_name.to_string()))?
        };

        self.check_rate_limit(tool_name, &policy).await?;

        // MCP tools get generic parameter validation (path, URL, command, SQL checks)
        if tool_name.starts_with("mcp__") {
            self.validate_mcp_tool_params(parameters)?;
            debug!("MCP tool call validation passed for: {}", tool_name);
            return Ok(());
        }

        if let Some(params_obj) = parameters.as_object() {
            for key in params_obj.keys() {
                if !policy.allowed_parameters.contains(key) {
                    warn!("Unexpected parameter '{}' for tool '{}'", key, tool_name);
                    return Err(SecurityError::InvalidParameter(format!(
                        "Parameter '{}' is not allowed for tool '{}'",
                        key, tool_name
                    )));
                }
            }
        }

        match tool_name {
            "file_read" | "file_read_binary" | "file_write" | "file_delete" | "file_list" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'path' parameter".to_string(),
                    ));
                }
                if tool_name == "file_write" {
                    self.validate_optional_sha256(parameters, "expected_sha256")?;
                }
            }
            "document_read"
            | "document_extract_text"
            | "document_get_metadata"
            | "document_detect_type"
            | "document_search" => {
                if let Some(path) = parameters
                    .get("file_path")
                    .or_else(|| parameters.get("path"))
                    .and_then(|p| p.as_str())
                {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'file_path' parameter".to_string(),
                    ));
                }
            }
            "document_create_pdf" | "document_create_word" | "document_create_excel" => {
                if let Some(path) = parameters.get("output_path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'output_path' parameter".to_string(),
                    ));
                }
            }
            "browser_navigate" | "api_call" | "api_download" | "api_upload" | "git_clone"
            | "physical_scrape" => {
                if let Some(url) = parameters.get("url").and_then(|u| u.as_str()) {
                    self.validate_url(url)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'url' parameter".to_string(),
                    ));
                }
            }
            "git_diff" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                }
                if let Some(file_path) = parameters.get("file_path").and_then(|p| p.as_str()) {
                    self.validate_git_relative_path_arg(file_path)?;
                }
                if let Some(max_bytes) = parameters.get("max_bytes") {
                    let Some(raw) = max_bytes.as_u64() else {
                        return Err(SecurityError::InvalidParameter(
                            "max_bytes must be a positive integer".to_string(),
                        ));
                    };
                    if raw == 0 {
                        return Err(SecurityError::InvalidParameter(
                            "max_bytes must be greater than zero".to_string(),
                        ));
                    }
                }
            }
            "git_log" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                }
                if let Some(limit) = parameters.get("limit") {
                    let Some(raw) = limit.as_u64() else {
                        return Err(SecurityError::InvalidParameter(
                            "limit must be a positive integer".to_string(),
                        ));
                    };
                    if raw == 0 {
                        return Err(SecurityError::InvalidParameter(
                            "limit must be greater than zero".to_string(),
                        ));
                    }
                }
            }
            "git_list_branches" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                }
            }
            "multi_edit" => {
                let Some(edits) = parameters.get("edits").and_then(|value| value.as_array()) else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'edits' array parameter".to_string(),
                    ));
                };
                for (index, edit) in edits.iter().enumerate() {
                    let Some(edit_obj) = edit.as_object() else {
                        return Err(SecurityError::InvalidParameter(format!(
                            "Edit #{} must be an object",
                            index
                        )));
                    };
                    for key in edit_obj.keys() {
                        if !matches!(
                            key.as_str(),
                            "path"
                                | "old_text"
                                | "new_text"
                                | "replace_all"
                                | "expected_replacements"
                                | "expected_sha256"
                        ) {
                            return Err(SecurityError::InvalidParameter(format!(
                                "Parameter '{}' is not allowed for multi_edit edit #{}",
                                key, index
                            )));
                        }
                    }
                    if let Some(path) = edit.get("path").and_then(|p| p.as_str()) {
                        self.validate_file_path(path)?;
                    } else {
                        return Err(SecurityError::InvalidParameter(format!(
                            "Edit #{} missing or invalid 'path'",
                            index
                        )));
                    }
                    let Some(expected_sha256) =
                        edit.get("expected_sha256").and_then(|value| value.as_str())
                    else {
                        return Err(SecurityError::InvalidParameter(format!(
                            "Edit #{} missing or invalid 'expected_sha256'",
                            index
                        )));
                    };
                    Self::validate_sha256_hex(expected_sha256)?;
                }
            }
            "apply_patch" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'path' parameter".to_string(),
                    ));
                }
                self.validate_optional_sha256(parameters, "expected_sha256")?;
            }
            "edit_exact_replace" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'path' parameter".to_string(),
                    ));
                }
                let Some(expected_sha256) = parameters
                    .get("expected_sha256")
                    .and_then(|value| value.as_str())
                else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'expected_sha256' parameter".to_string(),
                    ));
                };
                Self::validate_sha256_hex(expected_sha256)?;
            }
            "worktree_create" | "worktree_remove" => {
                if let Some(repo_path) = parameters.get("repo_path").and_then(|p| p.as_str()) {
                    self.validate_file_path(repo_path)?;
                }

                if let Some(slug) = parameters.get("slug").and_then(|s| s.as_str()) {
                    self.validate_worktree_slug(slug)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'slug' parameter".to_string(),
                    ));
                }
            }
            "worktree_list" => {
                if let Some(repo_path) = parameters.get("repo_path").and_then(|p| p.as_str()) {
                    self.validate_file_path(repo_path)?;
                }
            }
            "undo_get_summary" => {
                if let Some(task_id) = parameters.get("task_id").and_then(|value| value.as_str()) {
                    if task_id.trim().is_empty() {
                        return Err(SecurityError::InvalidParameter(
                            "task_id must not be empty".to_string(),
                        ));
                    }
                }
            }
            "undo_get_changes" => {
                if let Some(task_id) = parameters.get("task_id").and_then(|value| value.as_str()) {
                    if task_id.trim().is_empty() {
                        return Err(SecurityError::InvalidParameter(
                            "task_id must not be empty".to_string(),
                        ));
                    }
                }
                if let Some(limit) = parameters.get("limit") {
                    let Some(limit) = limit.as_u64() else {
                        return Err(SecurityError::InvalidParameter(
                            "limit must be a positive integer".to_string(),
                        ));
                    };
                    if limit == 0 || limit > 50 {
                        return Err(SecurityError::InvalidParameter(
                            "limit must be between 1 and 50".to_string(),
                        ));
                    }
                }
            }
            "undo_last" => {
                if let Some(task_id) = parameters.get("task_id").and_then(|value| value.as_str()) {
                    if task_id.trim().is_empty() {
                        return Err(SecurityError::InvalidParameter(
                            "task_id must not be empty".to_string(),
                        ));
                    }
                }
            }
            "undo_change" => {
                let Some(change_id) = parameters.get("change_id").and_then(|value| value.as_str())
                else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'change_id' parameter".to_string(),
                    ));
                };
                if change_id.trim().is_empty() {
                    return Err(SecurityError::InvalidParameter(
                        "change_id must not be empty".to_string(),
                    ));
                }
            }
            "coding_checkpoint_create" => {
                let Some(name) = parameters.get("name").and_then(|value| value.as_str()) else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'name' parameter".to_string(),
                    ));
                };
                if name.trim().is_empty() {
                    return Err(SecurityError::InvalidParameter(
                        "checkpoint name must not be empty".to_string(),
                    ));
                }

                let Some(paths) = parameters.get("paths").and_then(|value| value.as_array()) else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'paths' array parameter".to_string(),
                    ));
                };
                if paths.is_empty() || paths.len() > 20 {
                    return Err(SecurityError::InvalidParameter(
                        "paths must contain between 1 and 20 file paths".to_string(),
                    ));
                }
                for path in paths {
                    let Some(path) = path.as_str() else {
                        return Err(SecurityError::InvalidParameter(
                            "paths must contain only strings".to_string(),
                        ));
                    };
                    self.validate_file_path(path)?;
                }
            }
            "coding_checkpoint_rewind" => {
                let Some(checkpoint_id) = parameters
                    .get("checkpoint_id")
                    .and_then(|value| value.as_str())
                else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'checkpoint_id' parameter".to_string(),
                    ));
                };
                if checkpoint_id.trim().is_empty() {
                    return Err(SecurityError::InvalidParameter(
                        "checkpoint_id must not be empty".to_string(),
                    ));
                }
            }
            "terminal_execute" => {
                if let Some(command) = parameters.get("command").and_then(|c| c.as_str()) {
                    self.validate_terminal_command(command)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'command' parameter".to_string(),
                    ));
                }
            }
            "code_execute" => {
                if let Some(code) = parameters.get("code").and_then(|c| c.as_str()) {
                    self.validate_code(code)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'code' parameter".to_string(),
                    ));
                }
            }
            "db_query" => {
                if let Some(query) = parameters.get("query").and_then(|q| q.as_str()) {
                    self.validate_sql(query)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'query' parameter".to_string(),
                    ));
                }
            }
            "db_execute" => {
                if let Some(sql) = parameters.get("sql").and_then(|q| q.as_str()) {
                    self.validate_sql(sql)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'sql' parameter".to_string(),
                    ));
                }
            }
            _ => {}
        }

        debug!("Tool call validation passed for: {}", tool_name);
        Ok(())
    }

    fn validate_optional_sha256(
        &self,
        parameters: &Value,
        key: &str,
    ) -> std::result::Result<(), SecurityError> {
        if let Some(value) = parameters.get(key) {
            let Some(raw) = value.as_str() else {
                return Err(SecurityError::InvalidParameter(format!(
                    "{} must be a lowercase SHA-256 hex string",
                    key
                )));
            };
            Self::validate_sha256_hex(raw)?;
        }
        Ok(())
    }

    fn validate_sha256_hex(value: &str) -> std::result::Result<(), SecurityError> {
        if value.len() != 64 || !value.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Err(SecurityError::InvalidParameter(
                "expected_sha256 must be a 64-character SHA-256 hex string".to_string(),
            ));
        }
        if value.chars().any(|ch| ch.is_ascii_uppercase()) {
            return Err(SecurityError::InvalidParameter(
                "expected_sha256 must use lowercase hex".to_string(),
            ));
        }
        Ok(())
    }

    fn validate_git_relative_path_arg(
        &self,
        file_path: &str,
    ) -> std::result::Result<(), SecurityError> {
        let trimmed = file_path.trim();
        if trimmed.is_empty() {
            return Err(SecurityError::InvalidParameter(
                "git file_path must not be empty".to_string(),
            ));
        }
        if trimmed.contains('\0') {
            return Err(SecurityError::PathTraversal(
                "git file_path contains null bytes".to_string(),
            ));
        }
        if trimmed.starts_with('/') || trimmed.starts_with('\\') {
            return Err(SecurityError::PathTraversal(trimmed.to_string()));
        }
        if cfg!(windows)
            && (trimmed.contains(":\\") || trimmed.contains(":/") || trimmed.starts_with("//"))
        {
            return Err(SecurityError::PathTraversal(trimmed.to_string()));
        }
        for segment in trimmed.split(['/', '\\']) {
            if segment.is_empty() || segment == "." || segment == ".." {
                return Err(SecurityError::PathTraversal(trimmed.to_string()));
            }
        }
        Ok(())
    }

    fn validate_worktree_slug(&self, slug: &str) -> std::result::Result<(), SecurityError> {
        let trimmed = slug.trim();
        if trimmed.is_empty() {
            return Err(SecurityError::InvalidParameter(
                "worktree slug must not be empty".to_string(),
            ));
        }
        if trimmed.len() > 64 {
            return Err(SecurityError::InvalidParameter(
                "worktree slug must be 64 characters or fewer".to_string(),
            ));
        }

        for segment in trimmed.split('/') {
            if segment.is_empty() || segment == "." || segment == ".." {
                return Err(SecurityError::PathTraversal(slug.to_string()));
            }
            if !segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
            {
                return Err(SecurityError::InvalidParameter(
                    "worktree slug segments may contain only letters, digits, dots, underscores, and dashes"
                        .to_string(),
                ));
            }
        }

        Ok(())
    }

    async fn check_rate_limit(
        &self,
        tool_name: &str,
        policy: &ToolPolicy,
    ) -> std::result::Result<(), SecurityError> {
        let mut limiters = self.rate_limiters.lock().await;

        let limiter = limiters.entry(tool_name.to_string()).or_insert_with(|| {
            RateLimiter::new(RateLimitConfig {
                max_requests: policy.max_rate_per_minute,
                window: Duration::from_secs(60),
            })
        });

        if let Err(_err) = limiter.check_rate_limit(tool_name) {
            warn!("Rate limit exceeded for tool: {}", tool_name);
            return Err(SecurityError::RateLimitExceeded(tool_name.to_string()));
        }

        Ok(())
    }

    fn validate_file_path(&self, path: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating file path: {}", path);

        // Expand tilde ~ to home directory
        let expanded_path = if path.starts_with("~/") {
            if let Some(home_dir) = dirs::home_dir() {
                let expanded = home_dir.join(path.trim_start_matches('~').trim_start_matches('/'));
                expanded.to_string_lossy().to_string()
            } else {
                path.to_string()
            }
        } else {
            path.to_string()
        };

        // SECSYS-004 fix: Check for path traversal patterns (including URL-encoded)
        // FIX R-24: Case-insensitive normalization with iterative decoding to handle
        // double-encoding (e.g. %252e%252e -> %2e%2e -> ..)
        let mut normalized_path = expanded_path.to_lowercase();
        loop {
            let decoded = normalized_path
                .replace("%2e", ".")
                .replace("%2f", "/")
                .replace("%5c", "\\");
            if decoded == normalized_path {
                break;
            }
            normalized_path = decoded;
        }
        if normalized_path.contains("..") {
            warn!("Path traversal detected: {}", expanded_path);
            return Err(SecurityError::PathTraversal(expanded_path.to_string()));
        }

        // SECSYS-004 fix: Block null bytes (path truncation attack)
        if expanded_path.contains('\0') {
            warn!("Null byte in path detected: {}", expanded_path);
            return Err(SecurityError::PathTraversal(
                "Null byte in path not allowed".to_string(),
            ));
        }

        let path_buf = PathBuf::from(&expanded_path);

        // SECSYS-004 fix: Block network paths (UNC paths on Windows, NFS/SMB mounts)
        #[cfg(target_os = "windows")]
        {
            if expanded_path.starts_with("\\\\") || expanded_path.starts_with("//") {
                warn!("Network path detected: {}", expanded_path);
                return Err(SecurityError::InvalidParameter(
                    "Network paths (UNC) are not allowed".to_string(),
                ));
            }
        }

        // SECSYS-004 fix: Block common network mount points
        let blocked_mount_prefixes = vec![
            "/mnt/",      // Linux mount points
            "/media/",    // Linux removable media
            "/net/",      // NFS automount
            "/Volumes/",  // macOS external volumes (use with caution)
            "/run/user/", // Linux user runtime mounts
        ];

        for prefix in &blocked_mount_prefixes {
            if expanded_path.starts_with(prefix) {
                // Allow /Volumes/ on macOS if it's under a known safe path
                #[cfg(target_os = "macos")]
                if prefix == &"/Volumes/" {
                    // Allow if it's a well-known volume name (not arbitrary network share)
                    let path_lower = expanded_path.to_lowercase();
                    if path_lower.starts_with("/volumes/macintosh hd")
                        || path_lower.starts_with("/volumes/data")
                    {
                        continue;
                    }
                }
                warn!("Mount point path detected: {}", expanded_path);
                return Err(SecurityError::InvalidParameter(format!(
                    "Paths under '{}' are not allowed for security reasons",
                    prefix
                )));
            }
        }

        // SECSYS-004 fix: Block device files
        #[cfg(not(target_os = "windows"))]
        {
            if expanded_path.starts_with("/dev/") {
                warn!("Device path detected: {}", expanded_path);
                return Err(SecurityError::InvalidParameter(
                    "Device paths are not allowed".to_string(),
                ));
            }
            if expanded_path.starts_with("/proc/") || expanded_path.starts_with("/sys/") {
                warn!("System pseudo-filesystem path detected: {}", expanded_path);
                return Err(SecurityError::InvalidParameter(
                    "System paths (/proc, /sys) are not allowed".to_string(),
                ));
            }
        }

        // AUDIT-003-005 fix: Canonicalize relative paths against CWD before validation
        // instead of immediately returning Ok(()) which bypasses security checks
        if path_buf.is_relative() {
            // Get current working directory and resolve the relative path
            if let Ok(cwd) = std::env::current_dir() {
                let absolute_path = cwd.join(&path_buf);
                // Recursively validate the absolute path
                // But first check for path traversal in the resolved path
                if let Ok(canonical) = absolute_path.canonicalize() {
                    let canonical_str = canonical.to_string_lossy();
                    // Check if canonicalized path contains traversal or escapes allowed dirs
                    if canonical_str.contains("..") {
                        warn!(
                            "Path traversal detected in resolved relative path: {}",
                            expanded_path
                        );
                        return Err(SecurityError::PathTraversal(expanded_path.to_string()));
                    }
                    // Continue with absolute path validation below using the canonicalized path
                    // For now, allow relative paths that resolve within the CWD
                    if canonical.starts_with(&cwd) {
                        return Ok(());
                    }
                    // If it resolves outside CWD, convert to absolute and continue validation
                    // by falling through to the absolute path checks below
                }
            }
            // If we can't determine CWD or canonicalize, fall through to absolute path checks
            // which will handle it based on the path content
        }

        let is_allowed = self
            .allowed_paths
            .read()
            .map(|guard| guard.iter().any(|allowed| path_buf.starts_with(allowed)))
            .unwrap_or(false);

        if !is_allowed {
            if let Some(home_dir) = dirs::home_dir() {
                if path_buf.starts_with(&home_dir) {
                    return Ok(());
                }
            }

            // SECSYS-004 fix: Expanded list of allowed prefixes with more specific patterns
            let allowed_prefixes = vec![
                "/home/",        // Linux home directories
                "/Users/",       // macOS home directories
                "C:\\Users\\",   // Windows home directories
                "D:\\Users\\",   // Windows secondary drive users
                "/workspace/",   // CI/CD workspace
                "/project/",     // Project directories
                "/var/folders/", // macOS temp folders (sandboxed)
            ];

            for prefix in allowed_prefixes {
                if expanded_path.starts_with(prefix) {
                    return Ok(());
                }
            }

            // SECSYS-004 fix: On Windows, check for drive letters but block system drives
            #[cfg(target_os = "windows")]
            {
                if let Some(first_char) = expanded_path.chars().next() {
                    if first_char.is_ascii_alphabetic() && expanded_path.chars().nth(1) == Some(':')
                    {
                        let drive = first_char.to_ascii_uppercase();
                        // Block Windows system drive except Users folder (already handled above)
                        if drive == 'C' && !expanded_path.starts_with("C:\\Users\\") {
                            // Allow specific safe Windows paths
                            let safe_windows_paths = vec!["C:\\Temp\\", "C:\\temp\\"];
                            if !safe_windows_paths
                                .iter()
                                .any(|p| expanded_path.starts_with(p))
                            {
                                warn!("System drive path outside Users: {}", expanded_path);
                                return Err(SecurityError::InvalidParameter(format!(
                                    "Path '{}' on system drive is not allowed",
                                    expanded_path
                                )));
                            }
                        }
                    }
                }
            }

            warn!("Path not in allowed directories: {}", expanded_path);
            return Err(SecurityError::InvalidParameter(format!(
                "Path '{}' is not in allowed directories",
                expanded_path
            )));
        }

        // SECSYS-004 fix: Canonicalize and re-validate to catch symlink attacks
        if path_buf.exists() {
            match path_buf.canonicalize() {
                Ok(canonical) => {
                    let canonical_str = canonical.to_string_lossy();

                    // Check canonical path doesn't contain traversal
                    if canonical_str.contains("..") {
                        warn!("Symlink path traversal detected: {}", expanded_path);
                        return Err(SecurityError::PathTraversal(expanded_path.to_string()));
                    }

                    // SECSYS-004 fix: Re-validate the canonical path against blocked prefixes
                    for prefix in &blocked_mount_prefixes {
                        if canonical_str.starts_with(prefix) {
                            warn!(
                                "Symlink resolves to blocked mount point: {} -> {}",
                                expanded_path, canonical_str
                            );
                            return Err(SecurityError::PathTraversal(format!(
                                "Path resolves to blocked location: {}",
                                prefix
                            )));
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to canonicalize path: {}", e);
                }
            }
        } else {
            // FIX R-22: For non-existent paths (writes), validate the parent directory
            // to prevent symlink attacks where an attacker creates a symlink after the
            // existence check but before the actual write operation (TOCTOU).
            if let Some(parent) = path_buf.parent() {
                if parent.exists() {
                    let canonical_parent = parent
                        .canonicalize()
                        .map_err(|_| SecurityError::PathTraversal(path.to_string()))?;
                    let canonical_parent_str = canonical_parent.to_string_lossy();

                    // Check canonical parent doesn't contain traversal
                    if canonical_parent_str.contains("..") {
                        warn!(
                            "Symlink path traversal detected in parent: {}",
                            expanded_path
                        );
                        return Err(SecurityError::PathTraversal(expanded_path.to_string()));
                    }

                    // Re-validate the canonical parent against blocked prefixes
                    for prefix in &blocked_mount_prefixes {
                        if canonical_parent_str.starts_with(prefix) {
                            warn!(
                                "Parent directory resolves to blocked mount point: {} -> {}",
                                expanded_path, canonical_parent_str
                            );
                            return Err(SecurityError::PathTraversal(format!(
                                "Path resolves to blocked location: {}",
                                prefix
                            )));
                        }
                    }

                    // Re-validate the canonical parent against blocked system paths
                    #[cfg(not(target_os = "windows"))]
                    {
                        if canonical_parent_str.starts_with("/dev/")
                            || canonical_parent_str.starts_with("/proc/")
                            || canonical_parent_str.starts_with("/sys/")
                        {
                            warn!(
                                "Parent resolves to blocked system path: {} -> {}",
                                expanded_path, canonical_parent_str
                            );
                            return Err(SecurityError::PathTraversal(format!(
                                "Path resolves to blocked system location: {}",
                                canonical_parent_str
                            )));
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn validate_url(&self, url: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating URL: {}", url);

        let parsed = url::Url::parse(url)
            .map_err(|_| SecurityError::InvalidParameter(format!("Invalid URL format: {}", url)))?;

        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            warn!("Insecure protocol detected: {}", scheme);
            return Err(SecurityError::InsecureProtocol(scheme.to_string()));
        }

        if let Some(host) = parsed.host_str() {
            for blocked in &self.blocked_domains {
                if host == blocked || host.starts_with(&format!("{}.", blocked)) {
                    warn!("Blocked domain detected: {}", host);
                    return Err(SecurityError::BlockedDomain(host.to_string()));
                }
            }

            // Block private/reserved IPv4 ranges (RFC 1918 + link-local + loopback)
            if host.starts_with("192.168.")
                || host.starts_with("10.")
                || host.starts_with("172.16.")
                || host.starts_with("172.17.")
                || host.starts_with("172.18.")
                || host.starts_with("172.19.")
                || host.starts_with("172.20.")
                || host.starts_with("172.21.")
                || host.starts_with("172.22.")
                || host.starts_with("172.23.")
                || host.starts_with("172.24.")
                || host.starts_with("172.25.")
                || host.starts_with("172.26.")
                || host.starts_with("172.27.")
                || host.starts_with("172.28.")
                || host.starts_with("172.29.")
                || host.starts_with("172.30.")
                || host.starts_with("172.31.")
            {
                warn!("Private IP address detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // Block 127.0.0.0/8 loopback range
            if host.starts_with("127.") {
                warn!("Loopback IP address detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // Block 169.254.0.0/16 link-local / cloud metadata (IMDS)
            if host.starts_with("169.254.") {
                warn!("Link-local/cloud metadata IP detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // Block IPv6 loopback (::1) and IPv6 link-local (fe80::)
            if host == "::1"
                || host == "[::1]"
                || host.starts_with("fe80:")
                || host.starts_with("[fe80:")
            {
                warn!("IPv6 loopback/link-local address detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // Block IPv6 ULA addresses (fc00::/7 — fc and fd prefixes)
            if host.starts_with("fc")
                || host.starts_with("fd")
                || host.starts_with("[fc")
                || host.starts_with("[fd")
            {
                warn!("Private IPv6 address (ULA) detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // Block 0.0.0.0
            if host == "0.0.0.0" {
                warn!("Null-route IP address detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // FIX R-23: Block IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1)
            // These bypass naive string-based IPv4 checks while resolving to the same address.
            if host.starts_with("::ffff:")
                || host.starts_with("[::ffff:")
                || host.contains("::ffff:")
            {
                warn!(
                    "IPv6-mapped IPv4 address detected (potential SSRF bypass): {}",
                    host
                );
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // FIX R-23: Block decimal IP notation (e.g. 2130706433 = 127.0.0.1)
            // and octal/hex IP notation (e.g. 0x7f000001 = 127.0.0.1).
            // Some URL parsers resolve these to the actual IP, bypassing string checks.
            if host.chars().all(|c| c.is_ascii_digit()) && !host.is_empty() {
                warn!(
                    "Decimal IP notation detected (potential SSRF bypass): {}",
                    host
                );
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }
            if host.starts_with("0x") || host.starts_with("0X") {
                warn!(
                    "Hexadecimal IP notation detected (potential SSRF bypass): {}",
                    host
                );
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }

            // SECURITY NOTE: DNS rebinding attacks (where a domain resolves to a private IP
            // after the initial check) cannot be fully prevented at the URL validation level.
            // Mitigations include: pinning DNS results, validating the resolved IP at connect
            // time, and using network-level controls (firewall rules blocking private ranges
            // for outbound connections from the application).
        }

        Ok(())
    }

    fn validate_terminal_command(&self, command: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating terminal command");

        let dangerous_patterns = [
            "rm -rf /",
            "rm -rf ~",
            "rm -rf /*",
            "mkfs.",
            "dd if=/dev/zero",
            "dd if=/dev/random",
            "> /dev/sda",
            ":(){ :|:& };:",
            "chmod -R 777 /",
            "chown -R",
            "curl | sh",
            "curl | bash",
            "wget -O - | sh",
            "wget -O - | bash",
        ];

        let cmd_lower = command.to_lowercase();
        for pattern in dangerous_patterns {
            if cmd_lower.contains(pattern) {
                warn!("Dangerous terminal command pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        Ok(())
    }

    fn validate_code(&self, code: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating code execution");

        let dangerous_patterns = vec![
            "rm -rf",
            "del /f /s /q",
            "format ",
            "mkfs",
            "dd if=",
            "shutdown",
            "reboot",
            ":(){ :|:& };:",
            "__import__('os')",
            concat!("eval", "("),
            concat!("exec", "("),
            "system(",
            "shell_exec",
            "subprocess.",
        ];

        let code_lower = code.to_lowercase();
        for pattern in dangerous_patterns {
            if code_lower.contains(pattern) {
                warn!("Dangerous code pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        Ok(())
    }

    fn validate_sql(&self, query: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating SQL query");

        let query_lower = query.to_lowercase();
        let query_trimmed = query_lower.trim();
        let normalized_sql = query_lower
            .replace("/**/", " ")
            .replace("/* */", " ")
            .replace("/*", " ")
            .replace("*/", " ")
            .replace('#', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        // Allow SELECT-based queries through without blocking
        let is_select = query_trimmed.starts_with("select")
            || query_trimmed.starts_with("with")
            || query_trimmed.starts_with("explain")
            || query_trimmed.starts_with("pragma");

        // Destructive operations that must be blocked without explicit approval
        let destructive_operations = vec![
            (
                "drop table",
                "DROP TABLE is not allowed without explicit approval",
            ),
            (
                "drop database",
                "DROP DATABASE is not allowed without explicit approval",
            ),
            (
                "truncate table",
                "TRUNCATE TABLE is not allowed without explicit approval",
            ),
            ("grant ", "GRANT is not allowed without explicit approval"),
            ("revoke ", "REVOKE is not allowed without explicit approval"),
        ];

        for (op, msg) in &destructive_operations {
            if query_lower.contains(op) {
                warn!("Blocked dangerous SQL operation: {}", op);
                return Err(SecurityError::InvalidParameter(msg.to_string()));
            }
        }

        // DELETE without WHERE clause is dangerous
        if query_lower.contains("delete from") && !query_lower.contains("where") {
            warn!("Blocked DELETE without WHERE clause");
            return Err(SecurityError::InvalidParameter(
                "DELETE without WHERE clause is not allowed".to_string(),
            ));
        }

        // Non-SELECT write operations require approval via tool policy, but
        // warn here for audit trail
        let write_operations = vec!["update ", "insert into", "create table", "alter table"];

        if !is_select {
            for op in &write_operations {
                if query_lower.contains(op) {
                    warn!(
                        "Write SQL operation detected (requires tool-level approval): {}",
                        op
                    );
                }
            }
        }

        // SECSYS-005 fix: Expanded SQL injection patterns to catch more bypass attempts
        let injection_patterns = vec![
            // Classic injection patterns
            "'; --",
            "' or '1'='1",
            "' or 1=1",
            "admin'--",
            "' union select",
            // Boolean-based injection
            "' and '1'='1",
            "' and 1=1",
            "\" or \"1\"=\"1",
            "\" and \"1\"=\"1",
            // Time-based injection
            "waitfor delay",
            " or sleep(",
            " and sleep(",
            " or benchmark(",
            " and benchmark(",
            " or pg_sleep(",
            " and pg_sleep(",
            "; sleep(",
            "; benchmark(",
            "; pg_sleep(",
            // Stacked queries
            "'; drop",
            "\"; drop",
            "; drop",
            "; delete",
            "; insert",
            "; update",
            // Unicode escaping (common bypass)
            "\\u0027",
            "\\x27",
            "%27",
            "&#39;",
            "&#x27;",
            // SQL Server specific
            "xp_cmdshell",
            "sp_executesql",
            // Comment-based SQL injection
            "'--",
            "\"--",
            ";--",
            "'#",
            "\"#",
            "; #",
        ];

        for pattern in &injection_patterns {
            if normalized_sql.contains(pattern) || query_lower.contains(pattern) {
                warn!("SQL injection pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        // SECSYS-005 fix: Additional check for encoded/obfuscated patterns
        // Check for URL-encoded quotes
        if query.contains("%27") || query.contains("%22") {
            warn!("URL-encoded SQL injection pattern detected");
            return Err(SecurityError::CommandInjection(
                "URL-encoded injection".to_string(),
            ));
        }

        // Check for excessive whitespace (potential obfuscation)
        if normalized_sql.contains(" or ")
            && (normalized_sql.contains("1=1") || normalized_sql.contains("'1'='1"))
        {
            warn!("Normalized SQL injection pattern detected");
            return Err(SecurityError::CommandInjection(
                "Whitespace-obfuscated injection".to_string(),
            ));
        }

        Ok(())
    }

    pub fn get_risk_level(&self, tool_name: &str) -> Option<RiskLevel> {
        self.allowed_tools
            .read()
            .ok()
            .and_then(|guard| guard.get(tool_name).map(|p| p.risk_level))
    }

    pub fn requires_approval(&self, tool_name: &str) -> bool {
        self.allowed_tools
            .read()
            .ok()
            .and_then(|guard| guard.get(tool_name).map(|p| p.requires_approval))
            .unwrap_or(true)
    }

    /// Get the safety tier for a given tool based on its risk level and approval requirements
    pub fn get_safety_tier(&self, tool_name: &str) -> ToolSafetyTier {
        let policy = self
            .allowed_tools
            .read()
            .ok()
            .and_then(|guard| guard.get(tool_name).cloned());
        match policy {
            Some(policy) => match policy.risk_level {
                RiskLevel::Low => ToolSafetyTier::Safe,
                RiskLevel::Medium => {
                    if policy.requires_approval {
                        ToolSafetyTier::RequiresConfirmation
                    } else {
                        ToolSafetyTier::RequiresNotification
                    }
                }
                RiskLevel::High => ToolSafetyTier::RequiresConfirmation,
                RiskLevel::Critical => ToolSafetyTier::RequiresExplicitApproval,
            },
            // Unknown tools default to requiring confirmation for safety
            None => ToolSafetyTier::RequiresConfirmation,
        }
    }

    /// Create a confirmation request for a tool that requires user approval.
    ///
    /// # Arguments
    ///
    /// * `tool_name` - Name of the tool to be executed
    /// * `parameters` - Parameters being passed to the tool
    /// * `description` - Optional human-readable description of what the tool does
    ///
    /// # Returns
    ///
    /// A `ToolConfirmationRequest` that can be sent to the frontend for user approval.
    pub fn create_confirmation_request(
        &self,
        tool_name: &str,
        parameters: &Value,
        description: Option<&str>,
    ) -> ToolConfirmationRequest {
        let safety_tier = self.get_safety_tier(tool_name);
        let risk_level = self.get_risk_level(tool_name).unwrap_or(RiskLevel::Medium);

        let reason = match safety_tier {
            ToolSafetyTier::Safe => "This tool is safe and doesn't require confirmation.".to_string(),
            ToolSafetyTier::RequiresNotification => "This tool will notify you when executing.".to_string(),
            ToolSafetyTier::RequiresConfirmation => format!(
                "The '{}' tool requires your confirmation before executing.",
                tool_name
            ),
            ToolSafetyTier::RequiresExplicitApproval => format!(
                "The '{}' tool is a high-risk operation that requires explicit approval with detailed review.",
                tool_name
            ),
        };

        // Determine reversibility based on tool type
        let (reversible, undo_description) = match tool_name {
            "file_write" | "file_create" => {
                (true, Some("Restore the previous file contents".to_string()))
            }
            "file_delete" => (
                true,
                Some("Restore the deleted file from backup".to_string()),
            ),
            "undo_last" | "undo_change" => (
                false,
                Some("This restores a previous AGI-tracked change".to_string()),
            ),
            "coding_checkpoint_create" => (
                true,
                Some("Delete the created checkpoint if it is no longer needed".to_string()),
            ),
            "coding_checkpoint_rewind" => (
                false,
                Some("Create a fresh checkpoint before rewind if you may need to restore the current state".to_string()),
            ),
            "code_execute" => (false, None),
            "db_query" => {
                // Check if it's a read-only query
                let query_lower = parameters
                    .get("query")
                    .and_then(|q| q.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                if query_lower.starts_with("select") {
                    (false, None) // SELECT queries are not reversible but also don't modify data
                } else {
                    (
                        false,
                        Some("Database changes may need manual rollback".to_string()),
                    )
                }
            }
            _ => (false, None),
        };

        ToolConfirmationRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            tool_name: tool_name.to_string(),
            tool_description: description
                .unwrap_or("No description available")
                .to_string(),
            parameters: parameters.clone(),
            risk_level,
            safety_tier,
            reason,
            reversible,
            undo_description,
        }
    }
}

impl Default for ToolExecutionGuard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_allowed_tool() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("file_read", &json!({"path": "/home/user/test.txt"}))
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_file_write_expected_sha256_must_be_lowercase_hex() {
        let guard = ToolExecutionGuard::new();
        let uppercase_hash = "A".repeat(64);
        let result = guard
            .validate_tool_call(
                "file_write",
                &json!({
                    "path": "/home/user/test.txt",
                    "content": "updated",
                    "expected_sha256": uppercase_hash,
                }),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::InvalidParameter(_))));
    }

    #[tokio::test]
    async fn test_multi_edit_contract_validates_nested_expected_sha256() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "multi_edit",
                &json!({
                    "edits": [{
                        "path": "/home/user/test.txt",
                        "old_text": "before",
                        "new_text": "after"
                    }]
                }),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::InvalidParameter(_))));

        let hash = "a".repeat(64);
        let result = guard
            .validate_tool_call(
                "multi_edit",
                &json!({
                    "edits": [{
                        "path": "/home/user/test.txt",
                        "old_text": "before",
                        "new_text": "after",
                        "expected_sha256": hash
                    }]
                }),
            )
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_unauthorized_tool() {
        let guard = ToolExecutionGuard::new();
        let result = guard.validate_tool_call("unknown_tool", &json!({})).await;
        assert!(matches!(result, Err(SecurityError::UnauthorizedTool(_))));
    }

    #[tokio::test]
    async fn test_path_traversal() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("file_read", &json!({"path": "../../../etc/passwd"}))
            .await;
        assert!(matches!(result, Err(SecurityError::PathTraversal(_))));
    }

    #[tokio::test]
    async fn test_document_read_allowed() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "document_read",
                &json!({"file_path": "/home/user/test.pdf"}),
            )
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_document_read_path_traversal() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "document_read",
                &json!({"file_path": "../../../etc/passwd"}),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::PathTraversal(_))));
    }

    #[tokio::test]
    async fn test_blocked_domain() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("browser_navigate", &json!({"url": "http://localhost:3000"}))
            .await;
        assert!(matches!(result, Err(SecurityError::BlockedDomain(_))));
    }

    #[tokio::test]
    async fn test_command_injection() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "code_execute",
                &json!({"language": "bash", "code": "rm -rf /"}),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::CommandInjection(_))));
    }

    #[tokio::test]
    async fn test_sql_injection() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "db_query",
                &json!({"query": "SELECT * FROM users WHERE id = '1' OR '1'='1'"}),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::CommandInjection(_))));
    }

    #[tokio::test]
    async fn test_sql_query_allows_hex_literals_and_comments() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "db_query",
                &json!({"query": "SELECT /* inline comment */ 0x10 AS mask"}),
            )
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_sql_time_based_injection_remains_blocked() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "db_query",
                &json!({"query": "SELECT * FROM users WHERE id = '1' OR SLEEP(5)"}),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::CommandInjection(_))));
    }

    #[test]
    fn test_risk_levels() {
        let guard = ToolExecutionGuard::new();

        assert_eq!(guard.get_risk_level("file_read"), Some(RiskLevel::Low));
        assert_eq!(guard.get_risk_level("file_write"), Some(RiskLevel::Medium));
        assert_eq!(
            guard.get_risk_level("browser_navigate"),
            Some(RiskLevel::High)
        );
        assert_eq!(
            guard.get_risk_level("code_execute"),
            Some(RiskLevel::Critical)
        );
    }

    #[test]
    fn test_approval_requirements() {
        let guard = ToolExecutionGuard::new();

        assert!(!guard.requires_approval("file_read"));
        assert!(guard.requires_approval("file_write"));
        assert!(guard.requires_approval("code_execute"));
    }

    // H21 — get_safety_tier tests
    #[test]
    fn test_get_safety_tier_low_risk_is_safe() {
        let guard = ToolExecutionGuard::new();
        // file_read is Low risk, requires_approval=false -> Safe
        assert_eq!(guard.get_safety_tier("file_read"), ToolSafetyTier::Safe);
        assert_eq!(guard.get_safety_tier("file_list"), ToolSafetyTier::Safe);
        assert_eq!(guard.get_safety_tier("ui_screenshot"), ToolSafetyTier::Safe);
    }

    #[test]
    fn test_get_safety_tier_medium_risk_with_approval_requires_confirmation() {
        let guard = ToolExecutionGuard::new();
        // file_write is Medium risk, requires_approval=true -> RequiresConfirmation
        assert_eq!(
            guard.get_safety_tier("file_write"),
            ToolSafetyTier::RequiresConfirmation
        );
        // ui_click is Medium risk, requires_approval=true -> RequiresConfirmation
        assert_eq!(
            guard.get_safety_tier("ui_click"),
            ToolSafetyTier::RequiresConfirmation
        );
    }

    #[test]
    fn test_get_safety_tier_medium_risk_without_approval_requires_notification() {
        let guard = ToolExecutionGuard::new();
        // search_web is Medium risk, requires_approval=false -> RequiresNotification
        assert_eq!(
            guard.get_safety_tier("search_web"),
            ToolSafetyTier::RequiresNotification
        );
        // browser_extract is Medium risk, requires_approval=false -> RequiresNotification
        assert_eq!(
            guard.get_safety_tier("browser_extract"),
            ToolSafetyTier::RequiresNotification
        );
    }

    #[test]
    fn test_get_safety_tier_high_risk_requires_confirmation() {
        let guard = ToolExecutionGuard::new();
        // file_delete is High risk -> RequiresConfirmation
        assert_eq!(
            guard.get_safety_tier("file_delete"),
            ToolSafetyTier::RequiresConfirmation
        );
        // browser_navigate is High risk -> RequiresConfirmation
        assert_eq!(
            guard.get_safety_tier("browser_navigate"),
            ToolSafetyTier::RequiresConfirmation
        );
        // terminal_execute is High risk -> RequiresConfirmation
        assert_eq!(
            guard.get_safety_tier("terminal_execute"),
            ToolSafetyTier::RequiresConfirmation
        );
    }

    #[test]
    fn test_get_safety_tier_critical_risk_requires_explicit_approval() {
        let guard = ToolExecutionGuard::new();
        // code_execute is Critical risk -> RequiresExplicitApproval
        assert_eq!(
            guard.get_safety_tier("code_execute"),
            ToolSafetyTier::RequiresExplicitApproval
        );
    }

    #[test]
    fn test_get_safety_tier_unknown_tool_defaults_to_confirmation() {
        let guard = ToolExecutionGuard::new();
        assert_eq!(
            guard.get_safety_tier("nonexistent_tool"),
            ToolSafetyTier::RequiresConfirmation
        );
    }

    // H21 — create_confirmation_request tests
    #[test]
    fn test_create_confirmation_request_file_delete_is_reversible() {
        let guard = ToolExecutionGuard::new();
        let params = json!({"path": "/tmp/test.txt"});
        let request =
            guard.create_confirmation_request("file_delete", &params, Some("Delete a file"));

        assert_eq!(request.tool_name, "file_delete");
        assert!(
            request.reversible,
            "file_delete should be marked as reversible"
        );
        assert!(
            request.undo_description.is_some(),
            "file_delete should have an undo_description"
        );
        assert!(
            request
                .undo_description
                .as_ref()
                .unwrap()
                .contains("Restore"),
            "undo_description should mention restoring"
        );
        assert_eq!(request.risk_level, RiskLevel::High);
        assert_eq!(request.safety_tier, ToolSafetyTier::RequiresConfirmation);
    }

    #[test]
    fn test_create_confirmation_request_file_write_is_reversible() {
        let guard = ToolExecutionGuard::new();
        let params = json!({"path": "/tmp/file.txt", "content": "hello"});
        let request = guard.create_confirmation_request("file_write", &params, None);

        assert!(request.reversible);
        assert!(request.undo_description.is_some());
        assert_eq!(request.risk_level, RiskLevel::Medium);
        assert_eq!(
            request.tool_description, "No description available",
            "Omitted description should use default"
        );
    }

    #[test]
    fn test_create_confirmation_request_code_execute_not_reversible() {
        let guard = ToolExecutionGuard::new();
        let params = json!({"language": "python", "code": "print('hi')"});
        let request = guard.create_confirmation_request("code_execute", &params, Some("Run code"));

        assert!(!request.reversible);
        assert!(request.undo_description.is_none());
        assert_eq!(request.risk_level, RiskLevel::Critical);
        assert_eq!(
            request.safety_tier,
            ToolSafetyTier::RequiresExplicitApproval
        );
    }

    #[test]
    fn test_create_confirmation_request_has_unique_request_id() {
        let guard = ToolExecutionGuard::new();
        let params = json!({});
        let r1 = guard.create_confirmation_request("file_read", &params, None);
        let r2 = guard.create_confirmation_request("file_read", &params, None);

        assert_ne!(
            r1.request_id, r2.request_id,
            "Each confirmation request must have a unique ID"
        );
    }

    #[test]
    fn test_create_confirmation_request_db_query_select_not_reversible() {
        let guard = ToolExecutionGuard::new();
        let params = json!({"query": "SELECT * FROM users"});
        let request = guard.create_confirmation_request("db_query", &params, None);

        // SELECT queries are not reversible and have no undo description
        assert!(!request.reversible);
        assert!(request.undo_description.is_none());
    }

    #[test]
    fn test_create_confirmation_request_db_query_mutation_has_undo_hint() {
        let guard = ToolExecutionGuard::new();
        let params = json!({"query": "DELETE FROM users WHERE id = 1"});
        let request = guard.create_confirmation_request("db_query", &params, None);

        assert!(!request.reversible);
        assert!(
            request.undo_description.is_some(),
            "mutation queries should have a rollback hint"
        );
        assert!(request
            .undo_description
            .as_ref()
            .unwrap()
            .contains("manual rollback"));
    }

    // L5 — Concurrent rate-limit enforcement test
    #[tokio::test]
    async fn test_concurrent_rate_limit_enforcement() {
        use std::sync::Arc;
        use tokio::sync::Barrier;

        let guard = Arc::new(ToolExecutionGuard::new());
        // file_delete has max_rate_per_minute = 5
        let num_tasks = 10;
        let barrier = Arc::new(Barrier::new(num_tasks));

        let mut handles = Vec::new();
        for _ in 0..num_tasks {
            let guard = Arc::clone(&guard);
            let barrier = Arc::clone(&barrier);
            handles.push(tokio::spawn(async move {
                barrier.wait().await;
                guard
                    .validate_tool_call("file_delete", &json!({"path": "/tmp/test.txt"}))
                    .await
            }));
        }

        let mut successes = 0;
        let mut rate_limited = 0;
        for handle in handles {
            match handle.await.unwrap() {
                Ok(()) => successes += 1,
                Err(SecurityError::RateLimitExceeded(_)) => rate_limited += 1,
                Err(e) => panic!("Unexpected error: {:?}", e),
            }
        }

        // file_delete allows 5 per minute, so at most 5 should succeed
        assert!(
            successes <= 5,
            "At most 5 concurrent calls should succeed (rate limit is 5/min), got {successes}"
        );
        assert!(
            rate_limited >= 5,
            "At least 5 calls should be rate-limited, got {rate_limited}"
        );
        assert_eq!(
            successes + rate_limited,
            num_tasks,
            "All tasks must complete"
        );
    }

    #[tokio::test]
    async fn test_browser_execute_async_js_rejects_obsolete_parameters() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "browser_execute_async_js",
                &serde_json::json!({
                    "script": "return 1",
                    "retry_count": 3
                }),
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not allowed"));
    }

    #[tokio::test]
    async fn test_strict_guard_matches_current_tool_contracts() {
        let guard = ToolExecutionGuard::new();

        guard
            .validate_tool_call(
                "ui_click",
                &serde_json::json!({
                    "target": { "coordinates": { "x": 10, "y": 20 } },
                    "button": "left"
                }),
            )
            .await
            .expect("ui_click target object should be allowed");

        guard
            .validate_tool_call(
                "grep_search",
                &serde_json::json!({
                    "pattern": "ToolExecutionGuard",
                    "root": "apps/desktop/src-tauri",
                    "include_pattern": "*.rs",
                    "case_insensitive": false,
                    "output_mode": "content",
                    "context_lines": 1,
                    "limit": 25,
                    "offset": 0
                }),
            )
            .await
            .expect("grep_search canonical parameters should be allowed");

        guard
            .validate_tool_call(
                "file_list",
                &serde_json::json!({
                    "path": "/tmp",
                    "limit": 100,
                    "offset": 0,
                    "exclude": [".git", "node_modules"],
                    "timeout_ms": 30000
                }),
            )
            .await
            .expect("file_list pagination parameters should be allowed");
    }

    #[tokio::test]
    async fn test_terminal_execute_rejects_shell_override_parameter() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "terminal_execute",
                &serde_json::json!({
                    "command": "pwd",
                    "shell": "bash"
                }),
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not allowed"));
    }

    #[tokio::test]
    async fn test_specialized_tool_contracts_match_current_registry_params() {
        let guard = ToolExecutionGuard::new();

        guard
            .validate_tool_call(
                "email_send",
                &serde_json::json!({
                    "account_id": 1,
                    "to": ["user@example.com"],
                    "subject": "Demo",
                    "body": "Hello"
                }),
            )
            .await
            .expect("email_send advertised params should be allowed");

        guard
            .validate_tool_call(
                "calendar_create_event",
                &serde_json::json!({
                    "account_id": "calendar-account",
                    "calendar_id": "primary",
                    "title": "Demo",
                    "start_time": "2026-06-04T15:00:00Z",
                    "end_time": "2026-06-04T16:00:00Z"
                }),
            )
            .await
            .expect("calendar_create_event advertised params should be allowed");

        guard
            .validate_tool_call(
                "productivity_create_task",
                &serde_json::json!({
                    "provider": "notion",
                    "title": "Ship beta",
                    "description": "Finish tool parity pass",
                    "status": "in_progress",
                    "priority": 3,
                    "tags": ["beta"]
                }),
            )
            .await
            .expect("productivity_create_task advertised params should be allowed");

        guard
            .validate_tool_call(
                "schedule_recurring_task",
                &serde_json::json!({
                    "name": "Weekly report",
                    "schedule": "every Friday at 5pm",
                    "task_description": "Create a weekly summary"
                }),
            )
            .await
            .expect("schedule_recurring_task advertised params should be allowed");

        guard
            .validate_tool_call(
                "cancel_scheduled_task",
                &serde_json::json!({"task_id": "job-1"}),
            )
            .await
            .expect("cancel_scheduled_task task_id alias should be allowed");
    }

    #[tokio::test]
    async fn test_worktree_tool_contracts_require_approval_and_validate_slug() {
        let guard = ToolExecutionGuard::new();
        let repo_dir = tempfile::tempdir().expect("tempdir");
        let repo_path = repo_dir.path().to_string_lossy();

        guard
            .validate_tool_call(
                "worktree_create",
                &serde_json::json!({
                    "repo_path": repo_path,
                    "slug": "demo/feature"
                }),
            )
            .await
            .expect("worktree_create advertised params should be allowed");

        guard
            .validate_tool_call(
                "worktree_list",
                &serde_json::json!({
                    "repo_path": repo_path
                }),
            )
            .await
            .expect("worktree_list advertised params should be allowed");

        guard
            .validate_tool_call(
                "worktree_remove",
                &serde_json::json!({
                    "repo_path": repo_path,
                    "slug": "demo/feature",
                    "force": false,
                    "delete_branch": false
                }),
            )
            .await
            .expect("worktree_remove advertised params should be allowed");

        let invalid = guard
            .validate_tool_call(
                "worktree_create",
                &serde_json::json!({"slug": "../outside"}),
            )
            .await;
        assert!(matches!(invalid, Err(SecurityError::PathTraversal(_))));

        assert!(guard
            .get_safety_tier("worktree_create")
            .requires_user_action());
        assert_eq!(guard.get_safety_tier("worktree_list"), ToolSafetyTier::Safe);
        assert!(guard
            .get_safety_tier("worktree_remove")
            .requires_user_action());
    }

    #[tokio::test]
    async fn test_undo_and_checkpoint_tool_contracts_are_guarded() {
        let guard = ToolExecutionGuard::new();

        guard
            .validate_tool_call(
                "undo_get_changes",
                &serde_json::json!({
                    "task_id": "task-1",
                    "limit": 10
                }),
            )
            .await
            .expect("undo_get_changes advertised params should be allowed");
        assert_eq!(
            guard.get_safety_tier("undo_get_changes"),
            ToolSafetyTier::Safe
        );

        let invalid_limit = guard
            .validate_tool_call("undo_get_changes", &serde_json::json!({"limit": 0}))
            .await;
        assert!(matches!(
            invalid_limit,
            Err(SecurityError::InvalidParameter(_))
        ));

        guard
            .validate_tool_call("undo_change", &serde_json::json!({"change_id": "change-1"}))
            .await
            .expect("undo_change advertised params should be allowed");
        assert!(guard.get_safety_tier("undo_change").requires_user_action());

        guard
            .validate_tool_call(
                "coding_checkpoint_create",
                &serde_json::json!({
                    "name": "before edit",
                    "paths": ["/home/user/project/src/main.rs"]
                }),
            )
            .await
            .expect("coding_checkpoint_create advertised params should be allowed");
        assert!(guard
            .get_safety_tier("coding_checkpoint_create")
            .requires_user_action());

        guard
            .validate_tool_call("coding_checkpoint_list", &serde_json::json!({}))
            .await
            .expect("coding_checkpoint_list should not require params");
        assert_eq!(
            guard.get_safety_tier("coding_checkpoint_list"),
            ToolSafetyTier::Safe
        );

        guard
            .validate_tool_call(
                "coding_checkpoint_rewind",
                &serde_json::json!({"checkpoint_id": "checkpoint-1"}),
            )
            .await
            .expect("coding_checkpoint_rewind advertised params should be allowed");
        assert!(guard
            .get_safety_tier("coding_checkpoint_rewind")
            .requires_user_action());
    }

    #[tokio::test]
    async fn test_git_diff_contract_is_read_only_and_validates_paths() {
        let guard = ToolExecutionGuard::new();
        let repo_dir = tempfile::tempdir().expect("tempdir");
        let repo_path = repo_dir.path().to_string_lossy();

        guard
            .validate_tool_call(
                "git_diff",
                &serde_json::json!({
                    "path": repo_path,
                    "file_path": "src/main.rs",
                    "staged": false,
                    "max_bytes": 4096
                }),
            )
            .await
            .expect("git_diff advertised params should be allowed");

        let traversal = guard
            .validate_tool_call(
                "git_diff",
                &serde_json::json!({
                    "file_path": "../secret.txt"
                }),
            )
            .await;
        assert!(matches!(traversal, Err(SecurityError::PathTraversal(_))));

        let invalid_limit = guard
            .validate_tool_call("git_diff", &serde_json::json!({"max_bytes": 0}))
            .await;
        assert!(matches!(
            invalid_limit,
            Err(SecurityError::InvalidParameter(_))
        ));

        assert_eq!(guard.get_safety_tier("git_diff"), ToolSafetyTier::Safe);
    }

    #[tokio::test]
    async fn test_git_log_contract_is_read_only_and_validates_limit() {
        let guard = ToolExecutionGuard::new();
        let repo_dir = tempfile::tempdir().expect("tempdir");
        let repo_path = repo_dir.path().to_string_lossy();

        guard
            .validate_tool_call(
                "git_log",
                &serde_json::json!({
                    "path": repo_path,
                    "limit": 20
                }),
            )
            .await
            .expect("git_log advertised params should be allowed");

        let invalid_limit = guard
            .validate_tool_call("git_log", &serde_json::json!({"limit": 0}))
            .await;
        assert!(matches!(
            invalid_limit,
            Err(SecurityError::InvalidParameter(_))
        ));

        assert_eq!(guard.get_safety_tier("git_log"), ToolSafetyTier::Safe);
    }

    #[tokio::test]
    async fn test_git_list_branches_contract_is_read_only() {
        let guard = ToolExecutionGuard::new();
        let repo_dir = tempfile::tempdir().expect("tempdir");
        let repo_path = repo_dir.path().to_string_lossy();

        guard
            .validate_tool_call(
                "git_list_branches",
                &serde_json::json!({
                    "path": repo_path
                }),
            )
            .await
            .expect("git_list_branches advertised params should be allowed");

        assert_eq!(
            guard.get_safety_tier("git_list_branches"),
            ToolSafetyTier::Safe
        );
    }

    #[test]
    fn test_metered_media_generation_requires_confirmation() {
        let guard = ToolExecutionGuard::new();

        assert!(guard
            .get_safety_tier("image_generate")
            .requires_user_action());
        assert!(guard
            .get_safety_tier("video_generate")
            .requires_user_action());
    }
}
