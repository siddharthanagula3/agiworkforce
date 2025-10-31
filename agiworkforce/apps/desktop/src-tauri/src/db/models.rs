use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents a conversation/chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: i64,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Conversation {
    pub fn new(title: String) -> Self {
        let now = Utc::now();
        Self {
            id: 0, // Will be set by database
            title,
            created_at: now,
            updated_at: now,
        }
    }
}

/// Message role in a conversation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl MessageRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "user" => Some(MessageRole::User),
            "assistant" => Some(MessageRole::Assistant),
            "system" => Some(MessageRole::System),
            _ => None,
        }
    }
}

/// Represents a message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub conversation_id: i64,
    pub role: MessageRole,
    pub content: String,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl Message {
    pub fn new(conversation_id: i64, role: MessageRole, content: String) -> Self {
        Self {
            id: 0, // Will be set by database
            conversation_id,
            role,
            content,
            tokens: None,
            cost: None,
            provider: None,
            model: None,
            created_at: Utc::now(),
        }
    }

    pub fn with_metrics(mut self, tokens: i32, cost: f64) -> Self {
        self.tokens = Some(tokens);
        self.cost = Some(cost);
        self
    }

    pub fn with_source(mut self, provider: Option<String>, model: Option<String>) -> Self {
        self.provider = provider;
        self.model = model;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostTimeseriesPoint {
    pub date: String,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCostBreakdown {
    pub provider: String,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationCostBreakdown {
    pub conversation_id: i64,
    pub title: String,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub id: i64,
    pub cache_key: String,
    pub provider: String,
    pub model: String,
    pub prompt_hash: String,
    pub response: String,
    pub tokens: Option<i32>,
    pub cost: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

/// Application settings key-value store
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub encrypted: bool,
}

impl Setting {
    pub fn new(key: String, value: String, encrypted: bool) -> Self {
        Self {
            key,
            value,
            encrypted,
        }
    }
}

/// Task type for automation history
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    WindowsAutomation,
    BrowserAutomation,
    FileOperation,
    TerminalCommand,
    CodeEditing,
    DatabaseQuery,
    ApiCall,
    Other,
}

impl TaskType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskType::WindowsAutomation => "windows_automation",
            TaskType::BrowserAutomation => "browser_automation",
            TaskType::FileOperation => "file_operation",
            TaskType::TerminalCommand => "terminal_command",
            TaskType::CodeEditing => "code_editing",
            TaskType::DatabaseQuery => "database_query",
            TaskType::ApiCall => "api_call",
            TaskType::Other => "other",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "windows_automation" => Some(TaskType::WindowsAutomation),
            "browser_automation" => Some(TaskType::BrowserAutomation),
            "file_operation" => Some(TaskType::FileOperation),
            "terminal_command" => Some(TaskType::TerminalCommand),
            "code_editing" => Some(TaskType::CodeEditing),
            "database_query" => Some(TaskType::DatabaseQuery),
            "api_call" => Some(TaskType::ApiCall),
            "other" => Some(TaskType::Other),
            _ => None,
        }
    }
}

/// Automation task execution history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationHistory {
    pub id: i64,
    pub task_type: TaskType,
    pub success: bool,
    pub error: Option<String>,
    pub duration_ms: i64,
    pub cost: Option<f64>,
    pub created_at: DateTime<Utc>,
}

impl AutomationHistory {
    pub fn new(task_type: TaskType, success: bool, duration_ms: i64) -> Self {
        Self {
            id: 0, // Will be set by database
            task_type,
            success,
            error: None,
            duration_ms,
            cost: None,
            created_at: Utc::now(),
        }
    }

    pub fn with_error(mut self, error: String) -> Self {
        self.error = Some(error);
        self
    }

    pub fn with_cost(mut self, cost: f64) -> Self {
        self.cost = Some(cost);
        self
    }
}

/// Overlay event type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OverlayEventType {
    Click,
    Type,
    RegionHighlight,
    ScreenshotFlash,
}

impl OverlayEventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            OverlayEventType::Click => "click",
            OverlayEventType::Type => "type",
            OverlayEventType::RegionHighlight => "region_highlight",
            OverlayEventType::ScreenshotFlash => "screenshot_flash",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "click" => Some(OverlayEventType::Click),
            "type" => Some(OverlayEventType::Type),
            "region_highlight" => Some(OverlayEventType::RegionHighlight),
            "screenshot_flash" => Some(OverlayEventType::ScreenshotFlash),
            _ => None,
        }
    }
}

/// Overlay visualization event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayEvent {
    pub id: i64,
    pub event_type: OverlayEventType,
    pub x: i32,
    pub y: i32,
    pub data: Option<String>, // JSON data for additional event details
    pub timestamp: DateTime<Utc>,
}

impl OverlayEvent {
    pub fn new(event_type: OverlayEventType, x: i32, y: i32) -> Self {
        Self {
            id: 0, // Will be set by database
            event_type,
            x,
            y,
            data: None,
            timestamp: Utc::now(),
        }
    }

    pub fn with_data(mut self, data: String) -> Self {
        self.data = Some(data);
        self
    }
}

/// Permission type for system automation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PermissionType {
    FileRead,
    FileWrite,
    FileDelete,
    FileExecute,
    CommandExecute,
    AppLaunch,
    AppTerminate,
    ClipboardRead,
    ClipboardWrite,
    ProcessList,
    ProcessTerminate,
}

impl PermissionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PermissionType::FileRead => "FILE_READ",
            PermissionType::FileWrite => "FILE_WRITE",
            PermissionType::FileDelete => "FILE_DELETE",
            PermissionType::FileExecute => "FILE_EXECUTE",
            PermissionType::CommandExecute => "COMMAND_EXECUTE",
            PermissionType::AppLaunch => "APP_LAUNCH",
            PermissionType::AppTerminate => "APP_TERMINATE",
            PermissionType::ClipboardRead => "CLIPBOARD_READ",
            PermissionType::ClipboardWrite => "CLIPBOARD_WRITE",
            PermissionType::ProcessList => "PROCESS_LIST",
            PermissionType::ProcessTerminate => "PROCESS_TERMINATE",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "FILE_READ" => Some(PermissionType::FileRead),
            "FILE_WRITE" => Some(PermissionType::FileWrite),
            "FILE_DELETE" => Some(PermissionType::FileDelete),
            "FILE_EXECUTE" => Some(PermissionType::FileExecute),
            "COMMAND_EXECUTE" => Some(PermissionType::CommandExecute),
            "APP_LAUNCH" => Some(PermissionType::AppLaunch),
            "APP_TERMINATE" => Some(PermissionType::AppTerminate),
            "CLIPBOARD_READ" => Some(PermissionType::ClipboardRead),
            "CLIPBOARD_WRITE" => Some(PermissionType::ClipboardWrite),
            "PROCESS_LIST" => Some(PermissionType::ProcessList),
            "PROCESS_TERMINATE" => Some(PermissionType::ProcessTerminate),
            _ => None,
        }
    }
}

/// Permission state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionState {
    Allowed,
    Prompt,
    PromptOnce,
    Denied,
}

impl PermissionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            PermissionState::Allowed => "allowed",
            PermissionState::Prompt => "prompt",
            PermissionState::PromptOnce => "prompt_once",
            PermissionState::Denied => "denied",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "allowed" => Some(PermissionState::Allowed),
            "prompt" => Some(PermissionState::Prompt),
            "prompt_once" => Some(PermissionState::PromptOnce),
            "denied" => Some(PermissionState::Denied),
            _ => None,
        }
    }
}

/// Permission record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permission {
    pub id: i64,
    pub permission_type: PermissionType,
    pub state: PermissionState,
    pub pattern: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Permission {
    pub fn new(permission_type: PermissionType, state: PermissionState) -> Self {
        let now = Utc::now();
        Self {
            id: 0,
            permission_type,
            state,
            pattern: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn with_pattern(mut self, pattern: String) -> Self {
        self.pattern = Some(pattern);
        self
    }
}

/// Audit log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: i64,
    pub operation_type: String,
    pub operation_details: String,
    pub permission_type: String,
    pub approved: bool,
    pub success: bool,
    pub error_message: Option<String>,
    pub duration_ms: i64,
    pub created_at: DateTime<Utc>,
}

impl AuditLogEntry {
    pub fn new(
        operation_type: String,
        operation_details: String,
        permission_type: String,
        approved: bool,
        success: bool,
        duration_ms: i64,
    ) -> Self {
        Self {
            id: 0,
            operation_type,
            operation_details,
            permission_type,
            approved,
            success,
            error_message: None,
            duration_ms,
            created_at: Utc::now(),
        }
    }

    pub fn with_error(mut self, error: String) -> Self {
        self.error_message = Some(error);
        self
    }
}

/// Command history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandHistoryEntry {
    pub id: i64,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub working_dir: String,
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub duration_ms: i64,
    pub created_at: DateTime<Utc>,
}

impl CommandHistoryEntry {
    pub fn new(command: String, working_dir: String, duration_ms: i64) -> Self {
        Self {
            id: 0,
            command,
            args: None,
            working_dir,
            exit_code: None,
            stdout: None,
            stderr: None,
            duration_ms,
            created_at: Utc::now(),
        }
    }

    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = Some(args);
        self
    }

    pub fn with_output(mut self, exit_code: i32, stdout: String, stderr: String) -> Self {
        self.exit_code = Some(exit_code);
        self.stdout = Some(stdout);
        self.stderr = Some(stderr);
        self
    }
}

/// Clipboard history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardHistoryEntry {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    pub created_at: DateTime<Utc>,
}

impl ClipboardHistoryEntry {
    pub fn new(content: String) -> Self {
        Self {
            id: 0,
            content,
            content_type: "text".to_string(),
            created_at: Utc::now(),
        }
    }

    pub fn with_type(mut self, content_type: String) -> Self {
        self.content_type = content_type;
        self
    }
}
