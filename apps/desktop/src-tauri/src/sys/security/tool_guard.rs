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
}

pub struct ToolExecutionGuard {
    allowed_tools: HashMap<String, ToolPolicy>,
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
            "file_write".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["path".to_string(), "content".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "file_list".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string()],
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
                requires_approval: false,
                allowed_parameters: vec!["x".to_string(), "y".to_string(), "button".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "ui_type".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["text".to_string(), "delay_ms".to_string()],
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
                    "args".to_string(),
                    "timeout_ms".to_string(),
                    "retry_count".to_string(),
                    "retry_delay_ms".to_string(),
                    "await_promise".to_string(),
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
            "terminal_execute".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "command".to_string(),
                    "cwd".to_string(),
                    "shell".to_string(),
                    "timeout_ms".to_string(),
                ],
                risk_level: RiskLevel::High,
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
                requires_approval: false,
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
                requires_approval: false,
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
                requires_approval: false,
                allowed_parameters: vec!["prompt".to_string(), "duration_seconds".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        // Email operations
        allowed_tools.insert(
            "email_fetch".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec!["account_id".to_string(), "limit".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "email_send".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec![
                    "to".to_string(),
                    "subject".to_string(),
                    "body".to_string(),
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
                allowed_parameters: vec!["account_id".to_string()],
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
                    "title".to_string(),
                    "start_time".to_string(),
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
                requires_approval: false,
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
            allowed_tools,
            rate_limiters: Arc::new(Mutex::new(HashMap::new())),
            allowed_paths: std::sync::RwLock::new(vec![
                PathBuf::from("/tmp"),
                std::env::temp_dir(),
            ]),
            blocked_domains: vec![
                "localhost".to_string(),
                "127.0.0.1".to_string(),
                "0.0.0.0".to_string(),
                "169.254.169.254".to_string(),
            ],
        }
    }

    /// Override the allowed paths for file operations.
    /// Use this to enforce per-user allowed directories from settings.
    /// This method uses interior mutability via RwLock.
    pub fn set_allowed_paths(&self, paths: Vec<PathBuf>) {
        if !paths.is_empty() {
            if let Ok(mut guard) = self.allowed_paths.write() {
                *guard = paths;
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

        let policy = self
            .allowed_tools
            .get(tool_name)
            .ok_or_else(|| SecurityError::UnauthorizedTool(tool_name.to_string()))?;

        self.check_rate_limit(tool_name, policy).await?;

        match tool_name {
            "file_read" | "file_write" | "file_delete" | "file_list" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'path' parameter".to_string(),
                    ));
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
            "browser_navigate" => {
                if let Some(url) = parameters.get("url").and_then(|u| u.as_str()) {
                    self.validate_url(url)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'url' parameter".to_string(),
                    ));
                }
            }
            "terminal_execute" => {
                if parameters.get("command").and_then(|c| c.as_str()).is_none() {
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
            _ => {
                if let Some(params_obj) = parameters.as_object() {
                    for key in params_obj.keys() {
                        if !policy.allowed_parameters.contains(key) {
                            warn!("Unexpected parameter '{}' for tool '{}'", key, tool_name);
                        }
                    }
                }
            }
        }

        debug!("Tool call validation passed for: {}", tool_name);
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
        let normalized_path = expanded_path.replace("%2e%2e", "..").replace("%2f", "/");
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

            if host.starts_with("192.168.")
                || host.starts_with("10.")
                || host.starts_with("172.16.")
            {
                warn!("Private IP address detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
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
            "eval(",
            "exec(",
            "system(",
            "shell_exec",
            "subprocess.",
        ];

        for pattern in dangerous_patterns {
            if code.contains(pattern) {
                warn!("Dangerous code pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        Ok(())
    }

    fn validate_sql(&self, query: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating SQL query");

        let query_lower = query.to_lowercase();

        let dangerous_operations = vec![
            "drop table",
            "drop database",
            "truncate table",
            "delete from",
            "update ",
            "insert into",
            "create table",
            "alter table",
            "grant ",
            "revoke ",
        ];

        for op in dangerous_operations {
            if query_lower.contains(op) {
                warn!("Potentially dangerous SQL operation: {}", op);
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
            // Hex encoding (common bypass)
            "0x",
            // Comment variations
            "/**/",
            "/* */",
            "#",
            // Boolean-based injection
            "' and '1'='1",
            "' and 1=1",
            "\" or \"1\"=\"1",
            "\" and \"1\"=\"1",
            // Time-based injection
            "waitfor delay",
            "sleep(",
            "benchmark(",
            "pg_sleep(",
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
            "/*",
            "*/",
        ];

        for pattern in &injection_patterns {
            if query_lower.contains(pattern) {
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
        let normalized = query_lower.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.contains(" or ")
            && (normalized.contains("1=1") || normalized.contains("'1'='1"))
        {
            warn!("Normalized SQL injection pattern detected");
            return Err(SecurityError::CommandInjection(
                "Whitespace-obfuscated injection".to_string(),
            ));
        }

        Ok(())
    }

    pub fn get_risk_level(&self, tool_name: &str) -> Option<RiskLevel> {
        self.allowed_tools.get(tool_name).map(|p| p.risk_level)
    }

    pub fn requires_approval(&self, tool_name: &str) -> bool {
        self.allowed_tools
            .get(tool_name)
            .map(|p| p.requires_approval)
            .unwrap_or(true)
    }

    /// Get the safety tier for a given tool based on its risk level and approval requirements
    pub fn get_safety_tier(&self, tool_name: &str) -> ToolSafetyTier {
        match self.allowed_tools.get(tool_name) {
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
}
